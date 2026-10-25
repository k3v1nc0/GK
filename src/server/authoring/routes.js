// F3-E1-T03 + F3-E2-T03: authoring- en release-API. CSRF en Origin worden al in server.js gecontroleerd voor
// elke mutatie; actor en project komen altijd uit de sessie, nooit uit de requestbody.
import { CANONICAL_KINDS } from "../../shared/authoring/kinds.js";
import { CommandService } from "./command-service.js";
import { BuildService } from "./build-service.js";
import { DocumentRepository } from "./document-repository.js";
import { CutoverGuard } from "./cutover-guard.js";
import { CUTOVER_DOMAINS, cutoverRows, finalizeDomain, legacyInventory, planDomain } from "./legacy-import.js";
import { equipmentSlotSummaries, knownEquipmentSlotIds, knownRespawnPolicyIds, knownZoneIds, respawnPolicySummaries, zoneSummaries } from "./runtime-overlay.js";
import { previewMembership } from "../preview/preview-service.js";

function ifMatchRevision(req) {
  const raw = String(req.headers["if-match"] || "").replace(/^W\//, "").replace(/"/g, "").trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : NaN;
}

function forbidden(message) {
  const error = new Error(message);
  error.status = 403;
  error.code = "FORBIDDEN";
  return error;
}

export class AuthoringRoutes {
  // currentGraphWorld(): wereld gebouwd uit de huidige graph (draft); assetService: voor assetcontrole bij publish.
  constructor({ db, authService, repository, mmoService, buildsRoot, sendJson, readJson, currentGraphWorld = null, assetService = null }) {
    this.db = db;
    this.currentGraphWorld = currentGraphWorld;
    this.assetService = assetService;
    this.authService = authService;
    this.repository = repository;
    this.mmoService = mmoService;
    this.sendJson = sendJson;
    this.readJson = readJson;
    this.documents = new DocumentRepository(db);
    this.commands = new CommandService(db, { documents: this.documents });
    this.builds = new BuildService(db, { buildsRoot, documents: this.documents, onRelease: () => this.refreshActive() });
    this.active = null;
    this.refreshActive();
    // Nodes mag een object dat Canoniek beheert niet meer wijzigen (nooit twee writers).
    if (repository && typeof repository.setWriteGuard === "function") repository.setWriteGuard(new CutoverGuard(db));
    if (mmoService && typeof mmoService.setCanonicalBuildProvider === "function") {
      mmoService.setCanonicalBuildProvider(() => this.active);
    }
  }

  // Houdt de actieve serverbuild in het geheugen, zodat de worldtick geen DB-read per tick doet.
  refreshActive() {
    try {
      this.active = this.builds.activeServerBuild();
    } catch (error) {
      console.error("[authoring] actieve build niet leesbaar, game draait zonder canonieke laag:", error.message);
      this.active = null;
    }
    return this.active;
  }

  publishedWorld() {
    try { return this.repository.getPublishedWorld(); } catch { return null; }
  }

  graphRevision() {
    try { return Number(this.repository.getGraphRevision()); } catch { return null; }
  }

  graphWorld() {
    if (typeof this.currentGraphWorld !== "function") return this.publishedWorld();
    return this.currentGraphWorld();
  }

  // Wereld waartegen we valideren: de gepubliceerde, anders de graph.
  validationWorld() {
    return this.publishedWorld() || this.graphWorld();
  }

  assetTypes() {
    if (!this.assetService || typeof this.assetService.list !== "function") return null;
    try {
      return new Map(this.assetService.list().map((asset) => [String(asset.id), String(asset.assetType || asset.type || "")]));
    } catch {
      return null;
    }
  }

  // Fase 04: URL per audio-asset, zodat de game muziek kan afspelen zonder de assetlijst te kennen.
  assetPaths() {
    if (!this.assetService || typeof this.assetService.list !== "function") return null;
    try {
      return new Map(this.assetService.list().filter((asset) => asset.assetType === "audio" && asset.sourcePath).map((asset) => [String(asset.id), String(asset.sourcePath)]));
    } catch {
      return null;
    }
  }

  // Fase 05: type, URL en animatienamen per asset (voor modellen/geluid van vijanden en grondstoffen).
  assetInfo() {
    if (!this.assetService || typeof this.assetService.list !== "function") return null;
    try {
      return new Map(this.assetService.list().map((asset) => [String(asset.id), {
        assetType: String(asset.assetType || asset.type || ""),
        sourcePath: asset.sourcePath ? String(asset.sourcePath) : null,
        animations: Array.isArray(asset.metadata?.animations) ? asset.metadata.animations.map((clip) => String(clip?.name || "")).filter(Boolean) : null
      }]));
    } catch {
      return null;
    }
  }

  // Voor de editor: kiezen van modellen/geluid met animatienamen (alleen metadata, geen bestanden).
  assetSummaries() {
    const info = this.assetInfo();
    if (!info) return [];
    return Array.from(info.entries()).filter(([, asset]) => asset.assetType === "model" || asset.assetType === "audio")
      .map(([id, asset]) => ({ id, assetType: asset.assetType, animations: asset.animations || [] }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  publishOptions(world) {
    return {
      knownZoneIds: world ? knownZoneIds(world) : null,
      knownRespawnPolicyIds: world ? knownRespawnPolicyIds(world) : null,
      knownEquipmentSlotIds: world ? knownEquipmentSlotIds(world) : null,
      assetTypes: this.assetTypes(),
      assetPaths: this.assetPaths(),
      assetInfo: this.assetInfo(),
      legacyPublishedAt: world?.publishedAt || null
    };
  }

  requireAdmin(req) {
    const user = this.authService.requireEditor(req);
    if (user.role !== "admin") throw forbidden("Alleen een admin mag dit.");
    return user;
  }

  matches(pathname) {
    return pathname.startsWith("/api/authoring/");
  }

  async handle(req, res, url) {
    try {
      return await this.route(req, res, url);
    } catch (error) {
      const status = Number(error.status) || 500;
      if (status >= 500 && error.code !== "FAULT_INJECTED") console.error("[authoring]", error);
      return this.sendJson(res, status, {
        ok: false,
        code: error.code || (status === 413 ? "PAYLOAD_TOO_LARGE" : "ERROR"),
        message: status >= 500 && error.code !== "FAULT_INJECTED" ? "Verzoek mislukt." : error.message,
        details: error.details || null
      });
    }
  }

  async route(req, res, url) {
    const path = url.pathname;
    const method = req.method;

    // Voor spelers (game): alleen clientpakketten. server.json is nergens via HTTP bereikbaar.
    const clientMatch = path.match(/^\/api\/authoring\/builds\/(b_[0-9a-f]{24})\/client\.json$/);
    if (method === "GET" && (path === "/api/authoring/active" || path === "/api/authoring/active/client.json" || clientMatch)) {
      if (!this.authService.currentUser(req)) return this.sendJson(res, 401, { ok: false, code: "LOGIN_REQUIRED", message: "Login vereist." });
      if (clientMatch) return this.sendJson(res, 200, { ok: true, buildId: clientMatch[1], client: this.builds.readClient(clientMatch[1]) });
      const buildId = this.active?.buildId || null;
      if (path === "/api/authoring/active") return this.sendJson(res, 200, { ok: true, buildId });
      return this.sendJson(res, 200, { ok: true, buildId, client: buildId ? this.builds.readClient(buildId) : null });
    }

    const user = this.authService.requireEditor(req);

    if (method === "GET" && path === "/api/authoring/workspace") {
      const kind = url.searchParams.get("kind") || null;
      const world = this.validationWorld();
      return this.sendJson(res, 200, {
        ok: true,
        csrfToken: this.authService.csrfTokenForRequest(req),
        user: { username: user.username, role: user.role },
        kinds: CANONICAL_KINDS,
        documents: this.documents.list({
          kind,
          includeArchived: url.searchParams.get("archived") === "1",
          limit: url.searchParams.get("limit") || 500,
          offset: url.searchParams.get("offset")
        }),
        zones: zoneSummaries(world),
        respawnPolicies: respawnPolicySummaries(world),
        equipmentSlots: equipmentSlotSummaries(world),
        assets: this.assetSummaries(),
        cutover: cutoverRows(this.db),
        release: this.builds.release(),
        builds: this.builds.listBuilds(10),
        audit: this.builds.audit(10)
      });
    }

    if (method === "POST" && path === "/api/authoring/command") {
      const body = await this.readJson(req);
      const expectedRevision = ifMatchRevision(req);
      const result = this.commands.execute({
        requestId: body.requestId,
        command: body.command,
        kind: body.kind,
        docKey: body.docKey,
        body: body.body,
        expectedRevision
      }, user.id);
      return this.sendJson(res, result.replayed ? 200 : (body.command === "create" ? 201 : 200), Object.assign({ operationId: body.requestId }, result), { ETag: '"' + result.revision + '"' });
    }

    if (method === "POST" && path === "/api/authoring/publish") {
      const body = await this.readJson(req);
      const allowFault = process.env.GK_TEST_ISOLATED === "1" || process.env.GK_ALLOW_FAULT_INJECTION === "1";
      const result = this.builds.publish(user.id, Object.assign(this.publishOptions(this.validationWorld()), {
        expectedReleaseRevision: ifMatchRevision(req),
        fault: allowFault && body.fault === "after_files" ? "after_files" : undefined
      }));
      return this.sendJson(res, 200, result);
    }

    // Fase 04: draft-preview. Alleen lezen; schrijft geen build, pointer of spelerstate.
    if (method === "POST" && path === "/api/authoring/preview/membership") {
      const body = await this.readJson(req);
      const result = previewMembership(this.documents.allDocuments(), body.points, Object.assign(this.publishOptions(this.validationWorld()), { previous: body.previous || null }));
      return this.sendJson(res, 200, result);
    }

    if (method === "POST" && path === "/api/authoring/rollback") {
      const admin = this.requireAdmin(req);
      const body = await this.readJson(req);
      const result = this.builds.rollback(String(body.buildId || ""), ifMatchRevision(req), body.reason, admin.id);
      return this.sendJson(res, 200, result);
    }

    // Verhuizen per domein: eerst het rapport (dry-run), dan finalize met de graphrevisie als If-Match.
    if (method === "GET" && path === "/api/authoring/cutover") {
      const graphRevision = this.graphRevision();
      const world = this.graphWorld();
      const domain = url.searchParams.get("domain");
      const domains = domain ? [domain] : CUTOVER_DOMAINS;
      const rows = cutoverRows(this.db);
      const existing = this.documents.allDocuments();
      return this.sendJson(res, 200, {
        ok: true,
        graphRevision,
        inventory: legacyInventory(world),
        plans: domains.map((name) => planDomain(world, name, existing, rows))
      }, { ETag: '"' + graphRevision + '"' });
    }

    if (method === "POST" && path === "/api/authoring/cutover/finalize") {
      const admin = this.requireAdmin(req);
      const body = await this.readJson(req);
      const expectedGraphRevision = ifMatchRevision(req);
      const before = this.graphRevision();
      const world = this.graphWorld();
      const result = finalizeDomain(this.db, {
        world,
        domain: String(body.domain || ""),
        expectedGraphRevision,
        worldGraphRevision: before === this.graphRevision() ? before : null,
        acceptDiffs: body.acceptDiffs === true,
        existingDocs: this.documents.allDocuments(),
        actor: admin.id
      });
      return this.sendJson(res, 200, result);
    }

    return this.sendJson(res, 404, { ok: false, code: "NOT_FOUND", message: "Onbekende authoring-route." });
  }
}
