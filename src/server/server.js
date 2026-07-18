import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { loadEnvFile } from "./env.js";
import { openDatabase } from "./db.js";
import { AuthService } from "./auth-service.js";
import { AssetService } from "./asset-service.js";
import { GraphRepository } from "./graph-repository.js";
import { GraphMigrationService } from "./graph-migration-service.js";
import { MmoService } from "./mmo-service.js";
import { PublishService } from "./publish-service.js";
import { SymbolIndexService } from "./symbol-index-service.js";
import { TokenResolver } from "./token-resolver.js";
import { GameProjectCompiler } from "./game-project-compiler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
loadEnvFile(rootDir);

const port = Number(process.env.PORT || 3001);
const publicRoot = path.join(rootDir, "apps/web/public");
const assetsRoot = path.join(rootDir, "assets");
const vendorRoot = path.join(rootDir, "node_modules/three");

const db = openDatabase(rootDir);
const authService = new AuthService(db);
authService.ensureAdmin();
authService.cleanupExpiredSessions();
const assetService = new AssetService(db, rootDir);
assetService.resumePendingThumbnailJobs();
const symbolIndexService = new SymbolIndexService();
const tokenResolver = new TokenResolver({ symbolIndexService });
const repository = new GraphRepository(db, { symbolIndexService });
repository.seedIfEmpty();
const gameProjectCompiler = new GameProjectCompiler({ symbolIndexService, tokenResolver, assetService });
const publishService = new PublishService(repository, { assetService, symbolIndexService, tokenResolver, gameProjectCompiler });
const graphMigrationService = new GraphMigrationService(repository, { symbolIndexService });
const mmoService = new MmoService(db, authService, repository);
const wss = new WebSocketServer({ noServer: true });
mmoService.bindWebSocketServer(wss);
const host = process.env.HOST || "127.0.0.1";
const RESTORE_GRAPH_ROUTE = "/api/editor/graph/restore";

function timingMs(startedAt) {
  return (performance.now() - startedAt).toFixed(1);
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function logTiming(label, startedAt, details) {
  console.info("[timing] " + label + " " + timingMs(startedAt) + "ms" + (details ? " " + details : ""));
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp",
  ".glb": "model/gltf-binary",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav"
};

function sendJson(res, status, data, headers) {
  res.writeHead(status, Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, headers || {}));
  res.end(JSON.stringify(data));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(text);
}

function sendRedirect(res, location, headers) {
  res.writeHead(302, Object.assign({ Location: location }, headers || {}));
  res.end();
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      const error = new Error("Request body is te groot.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {
    const error = new Error("Ongeldige JSON body.");
    error.status = 400;
    throw error;
  }
}

async function readRequestBuffer(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("Request body is te groot.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function splitBuffer(buffer, separator) {
  const parts = [];
  let start = 0;
  let index = buffer.indexOf(separator, start);
  while (index !== -1) {
    parts.push(buffer.slice(start, index));
    start = index + separator.length;
    index = buffer.indexOf(separator, start);
  }
  parts.push(buffer.slice(start));
  return parts;
}

async function readMultipart(req) {
  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    const error = new Error("Multipart boundary ontbreekt.");
    error.status = 400;
    throw error;
  }
  const boundary = "--" + (boundaryMatch[1] || boundaryMatch[2]);
  const body = await readRequestBuffer(req, 90 * 1024 * 1024);
  const fields = {};
  const files = {};
  for (let part of splitBuffer(body, Buffer.from(boundary)).slice(1)) {
    if (part.length === 0) continue;
    if (part.slice(0, 2).toString() === "--") continue;
    if (part.slice(0, 2).toString() === "\r\n") part = part.slice(2);
    if (part.slice(-2).toString() === "\r\n") part = part.slice(0, -2);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;
    const headerText = part.slice(0, headerEnd).toString("utf8");
    const content = part.slice(headerEnd + 4);
    const nameMatch = headerText.match(/name="([^"]+)"/i);
    if (!nameMatch) continue;
    const filenameMatch = headerText.match(/filename="([^"]*)"/i);
    const contentTypeMatch = headerText.match(/content-type:\s*([^\r\n]+)/i);
    const name = nameMatch[1];
    if (filenameMatch && filenameMatch[1]) {
      files[name] = { filename: filenameMatch[1], contentType: contentTypeMatch ? contentTypeMatch[1].trim() : "", data: content };
    } else {
      fields[name] = content.toString("utf8");
    }
  }
  return { fields, files };
}

function safePath(baseDir, urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const normalized = path.normalize(decoded).replace(/^[/\\]+/, "");
  const filePath = path.join(baseDir, normalized);
  const relative = path.relative(baseDir, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return filePath;
}

function serveFile(res, filePath, cache) {
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return sendText(res, 404, "Niet gevonden");
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream", "Cache-Control": cache || "public, max-age=300" });
  fs.createReadStream(filePath).pipe(res);
}

function serveStatic(req, res, url) {
  let pathname = url.pathname;
  if (pathname === "/") return sendRedirect(res, "/editor/");
  if (pathname === "/editor") return sendRedirect(res, "/editor/");
  if (pathname === "/game") {
    return authService.currentUser(req)
      ? sendRedirect(res, "/game/")
      : sendRedirect(res, "/login/?next=" + encodeURIComponent("/game/"));
  }
  if (pathname === "/login") return sendRedirect(res, "/login/");
  if (pathname.startsWith("/editor/") && !authService.currentUser(req)) return sendRedirect(res, "/login/?next=" + encodeURIComponent("/editor/"));
  if (pathname.startsWith("/game/") && !authService.currentUser(req)) return sendRedirect(res, "/login/?next=" + encodeURIComponent("/game/"));
  if (pathname.startsWith("/assets/")) return serveFile(res, safePath(assetsRoot, pathname.slice("/assets/".length)), "public, max-age=300");
  if (pathname.startsWith("/vendor/three/")) {
    if (!fs.existsSync(vendorRoot)) return sendText(res, 503, "Three.js dependency ontbreekt. Run npm install.");
    return serveFile(res, safePath(vendorRoot, pathname.slice("/vendor/three/".length)), "public, max-age=3600");
  }
  if (pathname === "/favicon.ico") return serveFile(res, path.join(rootDir, "favicon.ico"), "public, max-age=86400");
  if (pathname.endsWith("/")) pathname += "index.html";
  const ext = path.extname(pathname);
  const cache = ext === ".html" || ext === ".js" || ext === ".css" ? "no-store" : "public, max-age=300";
  return serveFile(res, safePath(publicRoot, pathname.slice(1)), cache);
}

async function handleApi(req, res, url) {
  const importResponseStartedAt = req.method === "POST" && url.pathname === "/api/assets/import" ? performance.now() : null;
  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, service: "gk-real-node-editor", hasPublishedWorld: Boolean(repository.getPublishedWorld()) });
    }
    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      const body = await readJson(req);
      const result = authService.register(body.identifier || body.username || body.email, body.password, body.deviceLabel || req.headers["user-agent"] || null);
      return sendJson(res, 201, { ok: true, registered: true, user: result.user, session: { deviceLabel: result.session?.deviceLabel || null, expiresAt: result.session?.expiresAt || null } }, {
        "Set-Cookie": authService.sessionCookie(result.sessionToken)
      });
    }
    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJson(req);
      const result = authService.login(body.identifier || body.username || body.email, body.password, body.deviceLabel || req.headers["user-agent"] || null);
      if (!result) return sendJson(res, 401, { ok: false, message: "Login mislukt." });
      return sendJson(res, 200, { ok: true, user: result.user, session: { deviceLabel: result.session?.deviceLabel || null, expiresAt: result.session?.expiresAt || null } }, {
        "Set-Cookie": authService.sessionCookie(result.sessionToken)
      });
    }
    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      const current = authService.currentSession(req);
      if (current) {
        mmoService.closeSessionConnections(current.session.id, 4001, "logout");
        authService.logout(current.session.id);
      }
      return sendJson(res, 200, { ok: true }, { "Set-Cookie": authService.clearCookie() });
    }
    if (req.method === "GET" && url.pathname === "/api/auth/me") {
      const snapshot = mmoService.getAuthMeSnapshot(req);
      return sendJson(res, 200, snapshot);
    }
    if (req.method === "GET" && url.pathname === "/api/game/player") {
      const snapshot = mmoService.getPlayerSnapshot(req);
      return sendJson(res, 200, snapshot);
    }
    if ((req.method === "POST" || req.method === "PATCH") && url.pathname === "/api/game/player/position") {
      const current = authService.currentSession(req);
      if (!current) return sendJson(res, 401, { ok: false, message: "Niet ingelogd." });
      const body = await readJson(req);
      const connection = { user: current.user, session: current.session, player: null, worldId: null };
      const useInputState = body && (
        body.input ||
        body.inputSeq !== undefined ||
        body.clientInputSeq !== undefined ||
        body.moveX !== undefined ||
        body.moveZ !== undefined ||
        body.pointerTarget !== undefined ||
        body.stop !== undefined
      );
      const updated = useInputState
        ? mmoService.applyInputState(connection, body, "http")
        : mmoService.applyPositionIntent(connection, body, "http");
      const worldContext = mmoService.getPublishedWorldContext();
      const stateRecord = updated && updated.state ? updated.state : updated;
      const positionPayload = stateRecord ? mmoService.publicPositionForPlayer(stateRecord, current.session, worldContext.worldId) : null;
      if (updated.ignored === true) {
        return sendJson(res, 200, {
          ok: true,
          ignored: true,
          reason: updated.ignoreReason || "stale_client_input_seq",
          user: authService.publicUser(current.user),
          session: { id: current.session.id, deviceLabel: current.session.device_label || null, expiresAt: current.session.expires_at },
          player: mmoService.getPlayerSummary(req).player,
          position: positionPayload,
          clientSessionId: positionPayload?.clientSessionId || body.clientSessionId || body.client_session_id || null,
          clientInputSeq: positionPayload?.clientInputSeq || body.inputSeq || body.clientInputSeq || body.client_input_seq || 0,
          clientIntentId: positionPayload?.clientIntentId || body.clientIntentId || body.client_intent_id || null,
          clientSentAt: positionPayload?.clientSentAt || body.clientSentAt || body.client_sent_at || null,
          serverReceivedAt: positionPayload?.serverReceivedAt || null,
          controllerEpoch: positionPayload?.controllerEpoch || 0,
          activeControllerSessionId: positionPayload?.activeControllerSessionId || null,
          lastProcessedInputSeq: positionPayload?.lastProcessedInputSeq || 0,
          transport: positionPayload?.transport || "http"
        });
      }
      return sendJson(res, 200, {
        ok: true,
        user: authService.publicUser(current.user),
        session: { id: current.session.id, deviceLabel: current.session.device_label || null, expiresAt: current.session.expires_at },
        player: mmoService.getPlayerSummary(req).player,
        position: positionPayload,
        clientSessionId: positionPayload?.clientSessionId || body.clientSessionId || body.client_session_id || null,
        clientInputSeq: positionPayload?.clientInputSeq || body.inputSeq || body.clientInputSeq || body.client_input_seq || 0,
        clientIntentId: positionPayload?.clientIntentId || body.clientIntentId || body.client_intent_id || null,
        clientSentAt: positionPayload?.clientSentAt || body.clientSentAt || body.client_sent_at || null,
        serverReceivedAt: positionPayload?.serverReceivedAt || null,
        controllerEpoch: positionPayload?.controllerEpoch || 0,
        activeControllerSessionId: positionPayload?.activeControllerSessionId || null,
        lastProcessedInputSeq: positionPayload?.lastProcessedInputSeq || 0,
        transport: positionPayload?.transport || "http",
        ignored: false
      });
    }
    if (req.method === "GET" && url.pathname === "/api/node-types") {
      authService.requireEditor(req);
      return sendJson(res, 200, { nodeTypes: repository.getGraph().nodeTypes });
    }
    if (req.method === "GET" && url.pathname === "/api/assets") {
      authService.requireEditor(req);
      return sendJson(res, 200, { assets: assetService.list() });
    }
    if (req.method === "POST" && url.pathname === "/api/assets/import") {
      authService.requireEditor(req);
      const multipart = await readMultipart(req);
      const result = await assetService.importUpload({
        name: multipart.fields.name,
        category: multipart.fields.category,
        assetType: multipart.fields.assetType,
        file: multipart.files.file
      });
      return sendJson(res, 201, { ok: true, asset: result.asset, assets: assetService.list(), timings: result.timings });
    }
    const assetUsageMatch = url.pathname.match(/^\/api\/assets\/([^/]+)\/usage$/);
    if (req.method === "GET" && assetUsageMatch) {
      authService.requireEditor(req);
      return sendJson(res, 200, { ok: true, assetId: assetUsageMatch[1], usage: assetService.usageForAsset(assetUsageMatch[1], repository) });
    }
    const assetReplaceMatch = url.pathname.match(/^\/api\/assets\/([^/]+)\/replace$/);
    if (req.method === "POST" && assetReplaceMatch) {
      authService.requireEditor(req);
      const body = await readJson(req);
      return sendJson(res, 200, Object.assign({ ok: true }, assetService.replaceAssetReferences(assetReplaceMatch[1], body.replacementAssetId, repository)));
    }
    const assetThumbnailRetryMatch = url.pathname.match(/^\/api\/assets\/([^/]+)\/thumbnail\/retry$/);
    if (req.method === "POST" && assetThumbnailRetryMatch) {
      authService.requireEditor(req);
      const asset = assetService.retryThumbnail(assetThumbnailRetryMatch[1]);
      return sendJson(res, 200, { ok: true, asset: asset, assets: assetService.list() });
    }
    const assetIdMatch = url.pathname.match(/^\/api\/assets\/([^/]+)$/);
    if (req.method === "PATCH" && assetIdMatch) {
      authService.requireEditor(req);
      const body = await readJson(req);
      const asset = assetService.updateAsset(assetIdMatch[1], body);
      return sendJson(res, 200, { ok: true, asset, assets: assetService.list() });
    }
    if (req.method === "DELETE" && assetIdMatch) {
      authService.requireEditor(req);
      const assets = assetService.deleteAsset(assetIdMatch[1], repository);
      return sendJson(res, 200, { ok: true, assets });
    }
    if (req.method === "GET" && url.pathname === "/api/editor/graph") {
      authService.requireEditor(req);
      return sendJson(res, 200, repository.getGraph());
    }
    if (req.method === "POST" && url.pathname === "/api/editor/nodes") {
      authService.requireEditor(req);
      const body = await readJson(req);
      return sendJson(res, 201, repository.createNode(body.type, body.position || {}, body.values || {}, body.parentId || null));
    }
    const nodeValuesMatch = url.pathname.match(/^\/api\/editor\/nodes\/([^/]+)\/values$/);
    if (req.method === "PATCH" && nodeValuesMatch) {
      authService.requireEditor(req);
      const body = await readJson(req);
      return sendJson(res, 200, repository.updateNodeValues(nodeValuesMatch[1], body.values || {}));
    }
    const nodePositionMatch = url.pathname.match(/^\/api\/editor\/nodes\/([^/]+)\/position$/);
    if (req.method === "PATCH" && nodePositionMatch) {
      authService.requireEditor(req);
      const body = await readJson(req);
      return sendJson(res, 200, repository.updateNodePosition(nodePositionMatch[1], body.position || {}));
    }
    const nodeDuplicateMatch = url.pathname.match(/^\/api\/editor\/nodes\/([^/]+)\/duplicate$/);
    if (req.method === "POST" && nodeDuplicateMatch) {
      authService.requireEditor(req);
      return sendJson(res, 201, repository.duplicateNode(nodeDuplicateMatch[1]));
    }
    const nodeDeleteMatch = url.pathname.match(/^\/api\/editor\/nodes\/([^/]+)$/);
    if (req.method === "DELETE" && nodeDeleteMatch) {
      authService.requireEditor(req);
      return sendJson(res, 200, repository.deleteNode(nodeDeleteMatch[1]));
    }
    if (req.method === "POST" && url.pathname === "/api/editor/edges") {
      authService.requireEditor(req);
      const body = await readJson(req);
      return sendJson(res, 201, repository.createEdge(body.edge || {}));
    }
    const edgeDeleteMatch = url.pathname.match(/^\/api\/editor\/edges\/([^/]+)$/);
    if (req.method === "DELETE" && edgeDeleteMatch) {
      authService.requireEditor(req);
      return sendJson(res, 200, repository.deleteEdge(edgeDeleteMatch[1]));
    }
    if (req.method === "POST" && url.pathname === "/api/editor/place-model-asset") {
      authService.requireEditor(req);
      const body = await readJson(req);
      const asset = assetService.get(body.assetId);
      if (!asset) return sendJson(res, 404, { ok: false, message: "Asset bestaat niet." });
      return sendJson(res, 201, repository.createModelEntityFromAsset(asset, body.position || {}, body.parentId || null));
    }
    if (req.method === "POST" && url.pathname === "/api/editor/minimap-bakes") {
      authService.requireEditor(req);
      const multipart = await readMultipart(req);
      let bounds = null;
      try { bounds = multipart.fields.bounds ? JSON.parse(multipart.fields.bounds) : null; } catch { bounds = null; }
      const result = assetService.saveMinimapBake({
        nodeId: multipart.fields.nodeId,
        minimapId: multipart.fields.minimapId,
        worldHash: multipart.fields.worldHash,
        resolution: multipart.fields.resolution,
        width: multipart.fields.width,
        height: multipart.fields.height,
        bounds: bounds,
        file: multipart.files.file
      }, repository);
      return sendJson(res, 201, {
        ok: true,
        bakedImageUrl: result.bakedImageUrl,
        bakedImageWidth: result.bakedImageWidth,
        bakedImageHeight: result.bakedImageHeight,
        bakedAt: result.bakedAt,
        bakedWorldHash: result.bakedWorldHash,
        bakedBounds: result.bakedBounds,
        graph: result.graph
      });
    }
    if (req.method === "POST" && url.pathname === RESTORE_GRAPH_ROUTE) {
      authService.requireEditor(req);
      const body = await readJson(req);
      return sendJson(res, 200, { ok: true, graph: repository.restoreGraph(body.graph || body) });
    }
    if (req.method === "GET" && url.pathname === "/api/editor/validate") {
      authService.requireEditor(req);
      return sendJson(res, 200, publishService.validate());
    }
    if (req.method === "GET" && url.pathname === "/api/editor/symbols") {
      authService.requireEditor(req);
      const graph = repository.getGraph();
      const result = symbolIndexService.search(graph, {
        q: url.searchParams.get("q") || "",
        kind: url.searchParams.get("kind") || "",
        parentId: url.searchParams.get("parentId") || "",
        limit: url.searchParams.get("limit") || 50,
        includeProperties: url.searchParams.get("includeProperties") === "true"
      });
      return sendJson(res, 200, result);
    }
    if (req.method === "POST" && url.pathname === "/api/editor/references/validate") {
      authService.requireEditor(req);
      const body = await readJson(req);
      const graph = repository.getGraph();
      return sendJson(res, 200, symbolIndexService.validateReferences(graph, body.references || []));
    }
    if (req.method === "POST" && url.pathname === "/api/editor/tokens/preview") {
      authService.requireEditor(req);
      const body = await readJson(req);
      const graph = repository.getGraph();
      return sendJson(res, 200, tokenResolver.preview(graph, body.text || "", {
        staticContextOnly: body.staticContextOnly !== false,
        sampleRuntimeContext: body.sampleRuntimeContext || null
      }));
    }
    if (req.method === "GET" && url.pathname === "/api/editor/manifest-preview") {
      authService.requireEditor(req);
      const result = publishService.previewManifest();
      return sendJson(res, 200, {
        ok: true,
        manifest: result.manifest,
        validation: result.validation,
        buildId: result.buildId,
        contentHash: result.contentHash,
        dependencySummary: result.dependencySummary
      });
    }
    if (req.method === "GET" && url.pathname === "/api/editor/migrations/node-system-foundation-v1/preview") {
      authService.requireEditor(req);
      return sendJson(res, 200, graphMigrationService.preview());
    }
    if (req.method === "POST" && url.pathname === "/api/editor/migrations/node-system-foundation-v1/apply") {
      const user = authService.requireEditor(req);
      const body = await readJson(req);
      return sendJson(res, 200, graphMigrationService.apply(body, user.id));
    }
    if (req.method === "POST" && url.pathname === "/api/editor/save-draft") {
      authService.requireEditor(req);
      return sendJson(res, 200, { ok: true, world: publishService.saveDraft() });
    }
    if (req.method === "GET" && url.pathname === "/api/editor/draft-world") {
      authService.requireEditor(req);
      return sendJson(res, 200, repository.getDraftWorld() || publishService.saveDraft());
    }
    if (req.method === "POST" && url.pathname === "/api/editor/publish") {
      const user = authService.requireEditor(req);
      const result = publishService.publish(user.id);
      return sendJson(res, 200, { ok: true, world: result.world, validation: result.validation });
    }
    if (req.method === "GET" && url.pathname === "/api/editor/publish-history") {
      authService.requireEditor(req);
      return sendJson(res, 200, { history: repository.publishHistory() });
    }
    if (req.method === "GET" && url.pathname === "/api/game/world") {
      const published = repository.getPublishedWorld();
      if (!published) return sendJson(res, 404, { ok: false, message: "Nog geen gepubliceerde wereld." });
      return sendJson(res, 200, published);
    }
    if (req.method === "GET" && url.pathname === "/api/game/version") {
      const published = repository.getPublishedWorld();
      if (!published) return sendJson(res, 404, { ok: false });
      return sendJson(res, 200, { ok: true, publishedAt: published.publishedAt });
    }
    return sendJson(res, 404, { ok: false, message: "API route niet gevonden." });
  } catch (error) {
    const payload = { ok: false, message: error.message };
    if (error.usage) payload.usage = error.usage;
    if (error.details) payload.details = error.details;
    return sendJson(res, error.status || 500, payload);
  } finally {
    if (importResponseStartedAt !== null) {
      logTiming("server response /api/assets/import", importResponseStartedAt);
    }
  }
}

const server = http.createServer(async function (req, res) {
  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
  return serveStatic(req, res, url);
});

server.on("upgrade", function (req, socket, head) {
  const upgradeUrl = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  if (upgradeUrl.pathname !== "/api/game/live") {
    socket.destroy();
    return;
  }
  try {
    mmoService.handleUpgrade(req, socket, head);
  } catch {
    socket.destroy();
  }
});

server.listen(port, host, function () {
  const actualPort = server.address() && typeof server.address() === "object" ? server.address().port : port;
  console.log("GK Real Node Editor draait op http://localhost:" + actualPort);
  console.log("Login:  http://localhost:" + actualPort + "/login/");
  console.log("Editor: http://localhost:" + actualPort + "/editor/");
  console.log("Game:   http://localhost:" + actualPort + "/game/");
});
