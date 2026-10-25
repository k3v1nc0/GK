import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { cleanValuesForType } from "./field-validation.js";
import { NODE_TYPES, defaultValuesForType } from "../shared/node-types.js";

const now = function () {
  return new Date().toISOString();
};

function timingMs(startedAt) {
  return (performance.now() - startedAt).toFixed(1);
}

function timingNumber(startedAt) {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

function logTiming(label, startedAt, details) {
  console.info("[timing] " + label + " " + timingMs(startedAt) + "ms" + (details ? " " + details : ""));
}

const allowedAssetTypes = new Set(["model", "texture", "image", "audio", "data"]);
// Hard stop for one GLB thumbnail run. Normal runs take 8-20 s; a stalled
// network check (cdn.shopify.com model-viewer) used to block the single
// thumbnail queue for 7-30 minutes. The helper has its own 90 s watchdog.
const GLB_THUMBNAIL_HARD_LIMIT_MS = 120000;
// A killed, stalled or network-failed run goes back into the queue after a
// short pause (other thumbnails can run meanwhile), up to this many attempts.
const GLB_THUMBNAIL_MAX_ATTEMPTS = 3;
const GLB_THUMBNAIL_RETRY_DELAY_MS = 15000;
// Kevin always wants a thumbnail: a round that ends in "failed" gets exactly
// one more automatic round (also after a server restart). A manual retry resets
// this, so a truly broken model never loops forever.
const GLB_THUMBNAIL_EXTRA_ROUND_DELAY_MS = 60000;
const GLB_THUMBNAIL_RETRYABLE_EXIT_CODES = new Set([-1, 124, 137, 143]);
const GLB_THUMBNAIL_NETWORK_ERROR = /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ECONNREFUSED|socket hang up|cannot be used to render|net::ERR_/i;
const extensionsByType = {
  model: new Set([".glb"]),
  texture: new Set([".png", ".jpg", ".jpeg", ".webp"]),
  image: new Set([".png", ".jpg", ".jpeg", ".webp"]),
  audio: new Set([".mp3", ".ogg", ".wav"]),
  data: new Set([".json"])
};

function normalizeAssetName(name) {
  const text = String(name === null || name === undefined ? "" : name).trim();
  if (!text) {
    const error = new Error("Assetnaam is verplicht.");
    error.status = 400;
    throw error;
  }
  if (text.length > 96) {
    const error = new Error("Assetnaam is maximaal 96 tekens.");
    error.status = 400;
    throw error;
  }
  return text;
}

function assetSlugForName(name) {
  return String(name === null || name === undefined ? "" : name)
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function assetPathForStem(assetsDir, baseDirName, stem, ext) {
  return {
    path: "/" + ["assets", baseDirName, stem + ext].join("/"),
    filePath: path.join(assetsDir, baseDirName, stem + ext)
  };
}

function updateWorldAssetPaths(worldJson, assetId, sourcePath, thumbnailPath) {
  const world = parseJson(worldJson, null);
  if (!world || typeof world !== "object" || !Array.isArray(world.assets)) return null;
  let changed = false;
  world.assets = world.assets.map(function (asset) {
    if (!asset || asset.id !== assetId) return asset;
    changed = true;
    const next = Object.assign({}, asset, { sourcePath: sourcePath });
    if (thumbnailPath === null) next.thumbnailPath = null;
    else if (thumbnailPath !== undefined) next.thumbnailPath = thumbnailPath;
    return next;
  });
  return changed ? world : null;
}

function normalizeAssetMetadata(row) {
  const metadata = parseJson(row.metadata_json, {});
  const next = Object.assign({}, metadata);
  if (typeof next.thumbnailStartedAt === "undefined") next.thumbnailStartedAt = null;
  if (typeof next.thumbnailFinishedAt === "undefined") next.thumbnailFinishedAt = null;
  if (typeof next.thumbnailDurationMs === "undefined") next.thumbnailDurationMs = null;
  if (typeof next.thumbnailError === "undefined") next.thumbnailError = null;
  const status = String(next.thumbnailStatus || "").trim();
  if (row.thumbnail_path) {
    next.thumbnailStatus = "ready";
    next.thumbnailError = null;
  } else if (status === "pending" || status === "processing" || status === "failed" || status === "skipped") {
    next.thumbnailStatus = status;
  } else if (row.asset_type === "model") {
    next.thumbnailStatus = "skipped";
  } else if (row.asset_type === "image" || row.asset_type === "texture") {
    next.thumbnailStatus = row.thumbnail_path ? "ready" : "skipped";
  } else {
    next.thumbnailStatus = "skipped";
  }
  return next;
}

function resolveStorageStem({ preferredStem, fallbackStem, directory, ext, currentFilePath }) {
  const candidates = [preferredStem, fallbackStem].filter(function (value) {
    return typeof value === "string" && value.trim();
  }).map(function (value) {
    return String(value).trim();
  });
  for (const stem of candidates) {
    const candidateFilePath = path.join(directory, stem + ext);
    if (candidateFilePath === currentFilePath || !fs.existsSync(candidateFilePath)) {
      return stem;
    }
  }
  const baseStem = candidates[0] || candidates[1] || "asset";
  let suffix = 2;
  while (fs.existsSync(path.join(directory, baseStem + "-" + suffix + ext))) {
    suffix += 1;
  }
  return baseStem + "-" + suffix;
}

function renameFileIfNeeded(fromPath, toPath) {
  if (!fromPath || !toPath || fromPath === toPath) return false;
  fs.mkdirSync(path.dirname(toPath), { recursive: true });
  fs.renameSync(fromPath, toPath);
  return true;
}

export class AssetService {
  constructor(db, rootDir, options = {}) {
    this.db = db;
    this.rootDir = rootDir;
    this.assetsDir = path.resolve(options.assetsDir || path.join(rootDir, "assets"));
    this.uploadsDir = path.join(this.assetsDir, "uploads");
    this.thumbnailsDir = path.join(this.assetsDir, "thumbnails");
    this.glbThumbnailScript = path.join(rootDir, "scripts", "generate-glb-thumbnail.sh");
    this.skipModelThumbnails = options.skipModelThumbnails === true;
    this.thumbnailQueue = [];
    this.thumbnailQueuedAssetIds = new Set();
    this.thumbnailWorkerRunning = false;
    this.thumbnailQueueKickScheduled = false;
  }

  list() {
    return this.db.prepare("SELECT * FROM asset_library ORDER BY created_at DESC").all().map(toAsset);
  }

  get(id) {
    const row = this.db.prepare("SELECT * FROM asset_library WHERE id = ?").get(id);
    return row ? toAsset(row) : null;
  }

  getMany(ids) {
    return ids.map((id) => this.get(id)).filter(Boolean);
  }

  resumePendingThumbnailJobs() {
    const rows = this.db.prepare("SELECT id, source_path, asset_type, metadata_json FROM asset_library WHERE asset_type = 'model'").all();
    for (const row of rows) {
      const metadata = normalizeAssetMetadata(row);
      const extraRound = metadata.thumbnailStatus === "failed" && metadata.thumbnailExtraRoundDone !== true;
      if (metadata.thumbnailStatus !== "pending" && metadata.thumbnailStatus !== "processing" && !extraRound) continue;
      const sourceFilePath = safeUploadFilePath(this.assetsDir, row.source_path);
      if (!sourceFilePath || !fs.existsSync(sourceFilePath)) continue;
      if (extraRound) this.startThumbnailExtraRound(row.id);
      else this.enqueueThumbnailJob({ assetId: row.id });
    }
  }

  // One extra automatic round for a thumbnail that ended in "failed".
  startThumbnailExtraRound(assetId) {
    const row = this.db.prepare("SELECT metadata_json FROM asset_library WHERE id = ?").get(assetId);
    const metadata = row ? parseJson(row.metadata_json, {}) : null;
    if (!metadata || metadata.thumbnailStatus !== "failed" || metadata.thumbnailExtraRoundDone === true) return;
    this.updateAssetThumbnailState(assetId, null, {
      thumbnailStatus: "pending",
      thumbnailError: "Extra automatische ronde na mislukte thumbnail.",
      thumbnailExtraRoundDone: true
    });
    this.enqueueThumbnailJob({ assetId: assetId, attempt: 1 });
  }

  enqueueThumbnailJob(job) {
    const assetId = String(job?.assetId || "").trim();
    if (!assetId || this.thumbnailQueuedAssetIds.has(assetId)) return;
    this.thumbnailQueuedAssetIds.add(assetId);
    this.thumbnailQueue.push({ assetId: assetId, attempt: Math.max(1, Math.floor(Number(job?.attempt) || 1)) });
    this.scheduleThumbnailQueueKick();
  }

  scheduleThumbnailQueueKick() {
    if (this.thumbnailWorkerRunning || this.thumbnailQueueKickScheduled || !this.thumbnailQueue.length) return;
    this.thumbnailQueueKickScheduled = true;
    setImmediate(() => {
      this.thumbnailQueueKickScheduled = false;
      this.runThumbnailQueue().catch((error) => {
        console.error("Thumbnail queue failed", error);
      });
    });
  }

  async runThumbnailQueue() {
    if (this.thumbnailWorkerRunning) return;
    this.thumbnailWorkerRunning = true;
    try {
      while (this.thumbnailQueue.length) {
        const job = this.thumbnailQueue.shift();
        try {
          await this.runThumbnailJob(job);
        } catch (error) {
          console.error("Thumbnail job failed", error);
        }
      }
    } finally {
      this.thumbnailWorkerRunning = false;
      if (this.thumbnailQueue.length) this.scheduleThumbnailQueueKick();
    }
  }

  updateAssetThumbnailState(assetId, thumbnailPath, metadataPatch) {
    const row = this.db.prepare("SELECT metadata_json FROM asset_library WHERE id = ?").get(assetId);
    if (!row) return false;
    const metadata = Object.assign({}, parseJson(row.metadata_json, {}), metadataPatch || {});
    this.db.prepare("UPDATE asset_library SET thumbnail_path = ?, metadata_json = ?, updated_at = ? WHERE id = ?")
      .run(thumbnailPath, JSON.stringify(metadata), now(), assetId);
    return true;
  }

  retryThumbnail(id) {
    const row = this.db.prepare("SELECT * FROM asset_library WHERE id = ?").get(id);
    if (!row) {
      const error = new Error("Asset bestaat niet.");
      error.status = 404;
      throw error;
    }
    const asset = toAsset(row);
    if (asset.assetType !== "model") {
      const error = new Error("Alleen model-assets kunnen een thumbnail hebben.");
      error.status = 400;
      throw error;
    }
    const sourceFilePath = safeUploadFilePath(this.assetsDir, row.source_path);
    if (!sourceFilePath || !fs.existsSync(sourceFilePath)) {
      const error = new Error("Assetbronbestand ontbreekt.");
      error.status = 500;
      throw error;
    }
    this.updateAssetThumbnailState(id, null, {
      thumbnailStatus: "pending",
      thumbnailError: null,
      thumbnailStartedAt: null,
      thumbnailFinishedAt: null,
      thumbnailDurationMs: null,
      thumbnailExtraRoundDone: false
    });
    this.enqueueThumbnailJob({ assetId: id });
    return this.get(id);
  }

  async runThumbnailJob(job) {
    const assetId = String(job?.assetId || "").trim();
    if (!assetId) return;
    try {
      const row = this.db.prepare("SELECT * FROM asset_library WHERE id = ?").get(assetId);
      if (!row) return;
      const asset = toAsset(row);
      if (asset.assetType !== "model") return;
      const sourceFilePath = safeUploadFilePath(this.assetsDir, row.source_path);
      const startedAt = performance.now();
      const startedAtIso = now();
      if (!sourceFilePath || !fs.existsSync(sourceFilePath)) {
        this.updateAssetThumbnailState(assetId, null, {
          thumbnailStatus: "failed",
          thumbnailError: "Source file ontbreekt.",
          thumbnailStartedAt: startedAtIso,
          thumbnailFinishedAt: now(),
          thumbnailDurationMs: timingNumber(startedAt)
        });
        return;
      }

      let workingDir = null;
      try {
        workingDir = fs.mkdtempSync(path.join(os.tmpdir(), "gk-thumbnail-"));
        const workingSourceFilePath = path.join(workingDir, path.basename(sourceFilePath));
        const initialStem = path.basename(row.source_path || assetId, path.extname(row.source_path || ""));
        const initialThumbnailAssetPath = assetPathForStem(this.assetsDir, "thumbnails", initialStem, ".png");
        const initialThumbnailFilePath = initialThumbnailAssetPath.filePath;
        const strict = isTruthyEnv(process.env.GLB_THUMBNAIL_STRICT);
        fs.copyFileSync(sourceFilePath, workingSourceFilePath);
        this.updateAssetThumbnailState(assetId, null, {
          thumbnailStatus: "processing",
          thumbnailError: null,
          thumbnailStartedAt: startedAtIso,
          thumbnailFinishedAt: null,
          thumbnailDurationMs: null
        });
        const result = await generateGlbThumbnail({
          rootDir: this.rootDir,
          assetsDir: this.assetsDir,
          scriptPath: this.glbThumbnailScript,
          thumbnailStem: initialStem,
          sourceFilePath: workingSourceFilePath,
          strict: strict
        });
        const latestRow = this.db.prepare("SELECT * FROM asset_library WHERE id = ?").get(assetId);
        if (!latestRow) {
          if (result.thumbnailPath) {
            try { fs.rmSync(initialThumbnailFilePath, { force: true }); } catch {}
          }
          return;
        }
        const latestSourceStem = path.basename(latestRow.source_path || assetId, path.extname(latestRow.source_path || ""));
        const nextThumbnailAssetPath = assetPathForStem(this.assetsDir, "thumbnails", latestSourceStem, ".png");
        const durationMs = timingNumber(startedAt);
        const finishedAtIso = now();
        if (result.status === "ready" && result.thumbnailPath) {
          if (nextThumbnailAssetPath.filePath !== initialThumbnailFilePath) {
            try {
              fs.mkdirSync(path.dirname(nextThumbnailAssetPath.filePath), { recursive: true });
              fs.rmSync(nextThumbnailAssetPath.filePath, { force: true });
              fs.renameSync(initialThumbnailFilePath, nextThumbnailAssetPath.filePath);
            } catch (error) {
              this.updateAssetThumbnailState(assetId, null, {
                thumbnailStatus: "failed",
                thumbnailError: shortThumbnailErrorMessage(error.message || "Thumbnail rename mislukt."),
                thumbnailStartedAt: startedAtIso,
                thumbnailFinishedAt: finishedAtIso,
                thumbnailDurationMs: durationMs
              });
              return;
            }
          }
          this.updateAssetThumbnailState(assetId, nextThumbnailAssetPath.path, {
            thumbnailStatus: "ready",
            thumbnailError: null,
            thumbnailStartedAt: startedAtIso,
            thumbnailFinishedAt: finishedAtIso,
            thumbnailDurationMs: durationMs
          });
          return;
        }
        if (result.status === "skipped") {
          this.updateAssetThumbnailState(assetId, null, {
            thumbnailStatus: "skipped",
            thumbnailError: null,
            thumbnailStartedAt: startedAtIso,
            thumbnailFinishedAt: finishedAtIso,
            thumbnailDurationMs: durationMs
          });
          return;
        }
        const attempt = Math.max(1, Math.floor(Number(job?.attempt) || 1));
        if (attempt < GLB_THUMBNAIL_MAX_ATTEMPTS) {
          // Stays "pending", so a server restart also picks it up again.
          this.updateAssetThumbnailState(assetId, null, {
            thumbnailStatus: "pending",
            thumbnailError: "Poging " + attempt + " mislukte; nieuwe poging over " + Math.round(GLB_THUMBNAIL_RETRY_DELAY_MS / 1000) + " s.",
            thumbnailStartedAt: startedAtIso,
            thumbnailFinishedAt: finishedAtIso,
            thumbnailDurationMs: durationMs
          });
          console.warn("[thumbnail] asset=" + assetId + " attempt " + attempt + " failed (" + (result.error || "stall") + "); retrying in " + GLB_THUMBNAIL_RETRY_DELAY_MS + " ms.");
          setTimeout(() => {
            const current = this.db.prepare("SELECT metadata_json FROM asset_library WHERE id = ?").get(assetId);
            if (!current || parseJson(current.metadata_json, {}).thumbnailStatus !== "pending") return;
            this.enqueueThumbnailJob({ assetId: assetId, attempt: attempt + 1 });
          }, GLB_THUMBNAIL_RETRY_DELAY_MS).unref?.();
          return;
        }
        this.updateAssetThumbnailState(assetId, null, {
          thumbnailStatus: "failed",
          thumbnailError: shortThumbnailErrorMessage(result.error || "GLB thumbnail generatie mislukt."),
          thumbnailStartedAt: startedAtIso,
          thumbnailFinishedAt: finishedAtIso,
          thumbnailDurationMs: durationMs
        });
        if (parseJson(latestRow.metadata_json, {}).thumbnailExtraRoundDone !== true) {
          console.warn("[thumbnail] asset=" + assetId + " failed after " + attempt + " attempts; extra round in " + GLB_THUMBNAIL_EXTRA_ROUND_DELAY_MS + " ms.");
          setTimeout(() => { this.startThumbnailExtraRound(assetId); }, GLB_THUMBNAIL_EXTRA_ROUND_DELAY_MS).unref?.();
        }
      } catch (error) {
        this.updateAssetThumbnailState(assetId, null, {
          thumbnailStatus: "failed",
          thumbnailError: shortThumbnailErrorMessage(error && error.message ? error.message : "GLB thumbnail generatie mislukt."),
          thumbnailStartedAt: startedAtIso,
          thumbnailFinishedAt: now(),
          thumbnailDurationMs: timingNumber(startedAt)
        });
        setTimeout(() => { this.startThumbnailExtraRound(assetId); }, GLB_THUMBNAIL_EXTRA_ROUND_DELAY_MS).unref?.();
      } finally {
        if (workingDir) {
          try { fs.rmSync(workingDir, { recursive: true, force: true }); } catch {}
        }
      }
    } finally {
      this.thumbnailQueuedAssetIds.delete(assetId);
    }
  }

  assetNameExists(name, exceptId = null) {
    const normalized = normalizeAssetName(name);
    const row = exceptId
      ? this.db.prepare("SELECT id FROM asset_library WHERE lower(name) = lower(?) AND id != ? LIMIT 1").get(normalized, exceptId)
      : this.db.prepare("SELECT id FROM asset_library WHERE lower(name) = lower(?) LIMIT 1").get(normalized);
    return Boolean(row);
  }

  updateAsset(id, patch = {}) {
    const row = this.db.prepare("SELECT * FROM asset_library WHERE id = ?").get(id);
    if (!row) {
      const error = new Error("Asset bestaat niet.");
      error.status = 404;
      throw error;
    }
    const name = normalizeAssetName(patch.name);
    const category = requiredText(patch.category, "Asset category", 64);
    if (this.assetNameExists(name, id)) {
      const error = new Error("Assetnaam bestaat al.");
      error.status = 409;
      throw error;
    }
    const currentSourceFilePath = safeUploadFilePath(this.assetsDir, row.source_path);
    const currentThumbnailFilePath = safeUploadFilePath(this.assetsDir, row.thumbnail_path);
    if (!currentSourceFilePath || !fs.existsSync(currentSourceFilePath)) {
      const error = new Error("Assetbronbestand ontbreekt.");
      error.status = 500;
      throw error;
    }
    const sourceExt = path.extname(row.source_path || row.original_filename || "").toLowerCase();
    const preferredSourceStem = assetSlugForName(name) || "asset";
    const sourceStem = resolveStorageStem({
      preferredStem: preferredSourceStem,
      fallbackStem: null,
      directory: this.uploadsDir,
      ext: sourceExt,
      currentFilePath: currentSourceFilePath
    }) || preferredSourceStem;
    const nextSourceAssetPath = assetPathForStem(this.assetsDir, "uploads", sourceStem, sourceExt);
    const nextSourceFilePath = nextSourceAssetPath.filePath;
    const nextSourcePath = nextSourceAssetPath.path;
    const thumbnailIsSource = row.thumbnail_path && row.thumbnail_path === row.source_path;
    const thumbnailExists = Boolean(currentThumbnailFilePath && fs.existsSync(currentThumbnailFilePath));
    const nextThumbnailAssetPath = assetPathForStem(this.assetsDir, "thumbnails", sourceStem, ".png");
    const nextThumbnailFilePath = thumbnailIsSource
      ? nextSourceFilePath
      : (thumbnailExists ? nextThumbnailAssetPath.filePath : null);
    const nextThumbnailPath = thumbnailIsSource
      ? nextSourcePath
      : (thumbnailExists ? nextThumbnailAssetPath.path : null);
    const renamedFiles = [];
    try {
      if (currentSourceFilePath && nextSourceFilePath !== currentSourceFilePath) {
        renameFileIfNeeded(currentSourceFilePath, nextSourceFilePath);
        renamedFiles.push([nextSourceFilePath, currentSourceFilePath]);
      }
      if (thumbnailExists && nextThumbnailFilePath && nextThumbnailFilePath !== currentThumbnailFilePath && !thumbnailIsSource) {
        renameFileIfNeeded(currentThumbnailFilePath, nextThumbnailFilePath);
        renamedFiles.push([nextThumbnailFilePath, currentThumbnailFilePath]);
      }
      this.db.exec("BEGIN");
      try {
        this.db.prepare("UPDATE asset_library SET name = ?, category = ?, source_path = ?, thumbnail_path = ?, updated_at = ? WHERE id = ?")
          .run(name, category, nextSourcePath, nextThumbnailPath, now(), id);
        this.updateStoredAssetPaths(id, nextSourcePath, nextThumbnailPath);
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    } catch (error) {
      for (let index = renamedFiles.length - 1; index >= 0; index -= 1) {
        const [fromPath, toPath] = renamedFiles[index];
        try {
          renameFileIfNeeded(fromPath, toPath);
        } catch {}
      }
      throw error;
    }
    return this.get(id);
  }

  async importUpload(input) {
    const startedAt = performance.now();
    console.info("[timing] server importUpload start");
    try {
      const file = input?.file;
      if (!file?.data?.length) {
        const error = new Error("Upload mist een bestand.");
        error.status = 400;
        throw error;
      }
      const originalFileName = path.basename(file.filename || "asset");
      const ext = path.extname(originalFileName).toLowerCase();
      const assetType = String(input.assetType || inferType(ext) || "").trim();
      const name = normalizeAssetName(input.name || path.basename(originalFileName, ext));
      const category = String(input.category || "uncategorized").trim();
      validateUpload({ assetType, ext, file });
      if (!category || category.length > 64) {
        const error = new Error("Asset category is verplicht en maximaal 64 tekens.");
        error.status = 400;
        throw error;
      }
      if (this.assetNameExists(name)) {
        const error = new Error("Assetnaam bestaat al.");
        error.status = 409;
        throw error;
      }
      const id = "asset_" + crypto.randomUUID();
      fs.mkdirSync(this.uploadsDir, { recursive: true });
      const preferredSourceStem = assetSlugForName(name) || "asset";
      const sourceStem = resolveStorageStem({
        preferredStem: preferredSourceStem,
        fallbackStem: null,
        directory: this.uploadsDir,
        ext: ext,
        currentFilePath: null
      }) || preferredSourceStem;
      const sourceAssetPath = assetPathForStem(this.assetsDir, "uploads", sourceStem, ext);
      const sourceFilePath = sourceAssetPath.filePath;
      fs.writeFileSync(sourceFilePath, file.data);
      const sourcePath = sourceAssetPath.path;
      const metadata = {
        importedAt: now(),
        sha256: crypto.createHash("sha256").update(file.data).digest("hex"),
        contentType: file.contentType || "",
        format: ext.slice(1),
        thumbnailStartedAt: null,
        thumbnailFinishedAt: null,
        thumbnailDurationMs: null,
        thumbnailError: null
      };
      let resolvedThumbnailPath = null;
      try {
        if (assetType === "model" && !this.skipModelThumbnails) {
          Object.assign(metadata, metadataFromGlb(file.data), {
            thumbnailStatus: "pending"
          });
        } else if (assetType === "model") {
          Object.assign(metadata, metadataFromGlb(file.data), {
            thumbnailStatus: "skipped"
          });
        } else if (assetType === "image" || assetType === "texture") {
          resolvedThumbnailPath = sourcePath;
          metadata.thumbnailStatus = "ready";
        } else {
          metadata.thumbnailStatus = "skipped";
        }
        this.db.prepare("INSERT INTO asset_library (id, name, category, asset_type, source_path, thumbnail_path, original_filename, mime_type, size_bytes, sha256, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .run(id, name, category, assetType, sourcePath, resolvedThumbnailPath, originalFileName, file.contentType || "", file.data.length, metadata.sha256, JSON.stringify(metadata), now(), now());
        if (assetType === "model" && !this.skipModelThumbnails) {
          this.enqueueThumbnailJob({ assetId: id });
        }
      } catch (error) {
        removeAssetFiles(this.assetsDir, {
          source_path: sourcePath,
          thumbnail_path: resolvedThumbnailPath
        });
        throw error;
      }
      const totalServerMs = timingNumber(startedAt);
      return {
        asset: this.get(id),
        timings: {
          importUploadMs: totalServerMs,
          thumbnailMs: null,
          totalServerMs: totalServerMs
        }
      };
    } finally {
      logTiming("server importUpload end", startedAt);
    }
  }

  saveMinimapBake(input, graphRepository) {
    const nodeId = String(input?.nodeId || "").trim();
    if (!nodeId) {
      const error = new Error("Minimap bake mist nodeId.");
      error.status = 400;
      throw error;
    }
    const graph = graphRepository.getGraph();
    const node = graph.nodes.find(function (candidate) { return candidate.id === nodeId; });
    if (!node) {
      const error = new Error("Node bestaat niet: " + nodeId);
      error.status = 404;
      throw error;
    }
    if (node.type !== "minimap_bake") {
      const error = new Error("Node " + nodeId + " is geen Minimap Bake node.");
      error.status = 400;
      throw error;
    }
    const file = input?.file;
    if (!file?.data?.length) {
      const error = new Error("Minimap bake upload mist een bestand.");
      error.status = 400;
      throw error;
    }
    if (file.data.length > 48 * 1024 * 1024) {
      const error = new Error("Minimap bake upload is groter dan 48MB.");
      error.status = 400;
      throw error;
    }
    const ext = isPng(file.data) ? ".png" : (isWebp(file.data) ? ".webp" : null);
    if (!ext) {
      const error = new Error("Minimap bake bestandsinhoud moet PNG of WEBP zijn.");
      error.status = 400;
      throw error;
    }
    const minimapId = String(input.minimapId || node.values?.minimapId || "main_minimap").trim();
    const safeMinimapId = assetSlugForName(minimapId) || "minimap";
    const safeNodeShort = String(nodeId).replace(/[^a-z0-9]/gi, "").slice(-8) || "node";
    const timestamp = Date.now();
    const minimapBakesDir = path.join(this.assetsDir, "minimap-bakes");
    fs.mkdirSync(minimapBakesDir, { recursive: true });
    const stem = resolveStorageStem({
      preferredStem: safeMinimapId + "-" + safeNodeShort + "-" + timestamp,
      fallbackStem: "minimap-" + crypto.randomUUID().slice(0, 8),
      directory: minimapBakesDir,
      ext: ext,
      currentFilePath: null
    });
    const bakeAssetPath = assetPathForStem(this.assetsDir, "minimap-bakes", stem, ext);
    fs.writeFileSync(bakeAssetPath.filePath, file.data);
    const width = Math.max(1, Math.min(8192, Math.round(Number(input.width) || Number(input.resolution) || 0)));
    const height = Math.max(1, Math.min(8192, Math.round(Number(input.height) || Number(input.resolution) || width)));
    const bakedAt = now();
    const bakedImageUrl = bakeAssetPath.path + "?v=" + timestamp;
    const bakedBounds = input.bounds && typeof input.bounds === "object" ? input.bounds : null;
    const patch = {
      bakedImageUrl: bakedImageUrl,
      bakedImageWidth: width,
      bakedImageHeight: height,
      bakedAt: bakedAt,
      bakedWorldHash: String(input.worldHash || ""),
      bakedBounds: bakedBounds
    };
    const updatedGraph = graphRepository.updateNodeValues(nodeId, patch);
    return {
      bakedImageUrl: bakedImageUrl,
      bakedImageWidth: width,
      bakedImageHeight: height,
      bakedAt: bakedAt,
      bakedWorldHash: patch.bakedWorldHash,
      bakedBounds: bakedBounds,
      graph: updatedGraph
    };
  }

  usageForAsset(id, graphRepository) {
    const asset = this.get(id);
    if (!asset) {
      const error = new Error("Asset bestaat niet.");
      error.status = 404;
      throw error;
    }
    const graph = graphRepository && typeof graphRepository.getGraph === "function" ? graphRepository.getGraph() : null;
    if (!graph) return [];
    return collectAssetUsage(graph, id);
  }

  deleteAsset(id, graphRepository) {
    const row = this.db.prepare("SELECT * FROM asset_library WHERE id = ?").get(id);
    if (!row) {
      const error = new Error("Asset bestaat niet.");
      error.status = 404;
      throw error;
    }
    const usage = this.usageForAsset(id, graphRepository);
    if (usage.length > 0) {
      const error = new Error("Asset wordt nog gebruikt.");
      error.status = 409;
      error.usage = usage;
      throw error;
    }
    const result = this.db.prepare("DELETE FROM asset_library WHERE id = ?").run(id);
    if (result.changes === 0) {
      const error = new Error("Asset bestaat niet.");
      error.status = 404;
      throw error;
    }
    removeAssetFiles(this.assetsDir, row);
    return this.list();
  }

  replaceAssetReferences(oldAssetId, newAssetId, graphRepository) {
    const sourceAssetId = String(oldAssetId || "").trim();
    const replacementAssetId = String(newAssetId || "").trim();
    if (!sourceAssetId) {
      const error = new Error("Bron asset is verplicht.");
      error.status = 400;
      throw error;
    }
    if (!replacementAssetId) {
      const error = new Error("Vervangende asset is verplicht.");
      error.status = 400;
      throw error;
    }
    const oldAsset = this.get(sourceAssetId);
    if (!oldAsset) {
      const error = new Error("Asset bestaat niet.");
      error.status = 404;
      throw error;
    }
    const replacementAsset = this.get(replacementAssetId);
    if (!replacementAsset) {
      const error = new Error("Vervangende asset bestaat niet.");
      error.status = 404;
      throw error;
    }
    if (sourceAssetId === replacementAssetId) {
      const error = new Error("Vervangen door dezelfde asset is niet toegestaan.");
      error.status = 400;
      throw error;
    }
    const graph = graphRepository && typeof graphRepository.getGraph === "function" ? graphRepository.getGraph() : null;
    if (!graph) {
      const error = new Error("Graph repository ontbreekt.");
      error.status = 500;
      throw error;
    }
    const usage = collectAssetUsage(graph, sourceAssetId);
    if (!usage.length) {
      return { replaced: [], graph: graph, assets: this.list() };
    }
    const nodeTypes = graph.nodeTypes || NODE_TYPES;
    const incompatible = usage.filter(function (entry) {
      const field = nodeTypes?.[entry.nodeType]?.fields?.[entry.fieldKey];
      return !field || field.type !== "asset" || !Array.isArray(field.assetTypes) || !field.assetTypes.includes(replacementAsset.assetType);
    });
    if (incompatible.length) {
      const error = new Error("Vervangende asset is niet compatibel met alle verwijzingen.");
      error.status = 400;
      error.details = { incompatible: incompatible };
      throw error;
    }
    const nodeMap = new Map((graph.nodes || []).map(function (node) { return [node.id, node]; }));
    const updates = new Map();
    for (const entry of usage) {
      const node = nodeMap.get(entry.nodeId);
      if (!node) continue;
      const patch = updates.get(node.id) || {};
      patch[entry.fieldKey] = replacementAsset.id;
      updates.set(node.id, patch);
    }
    if (!updates.size) {
      return { replaced: [], graph: graph, assets: this.list() };
    }
    const updateNode = this.db.prepare("UPDATE editor_nodes SET values_json = ?, updated_at = ? WHERE id = ?");
    this.db.exec("BEGIN");
    try {
      for (const [nodeId, patch] of updates.entries()) {
        const node = nodeMap.get(nodeId);
        if (!node) continue;
        const currentValues = node.values && typeof node.values === "object" ? node.values : defaultValuesForType(node.type);
        const cleanValues = cleanValuesForType(node.type, patch, currentValues, NODE_TYPES);
        updateNode.run(JSON.stringify(cleanValues), now(), nodeId);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    if (graphRepository && typeof graphRepository.clearDraftWorld === "function") {
      graphRepository.clearDraftWorld();
    }
    return { replaced: usage, graph: graphRepository.getGraph(), assets: this.list() };
  }

  updateStoredAssetPaths(assetId, sourcePath, thumbnailPath) {
    const draftRow = this.db.prepare("SELECT world_json FROM draft_world_state WHERE id = 1").get();
    if (draftRow) {
      const draftWorld = updateWorldAssetPaths(draftRow.world_json, assetId, sourcePath, thumbnailPath);
      if (draftWorld) {
        this.db.prepare("UPDATE draft_world_state SET world_json = ?, updated_at = ? WHERE id = 1")
          .run(JSON.stringify(draftWorld), now());
      }
    }
    const publishedRow = this.db.prepare("SELECT world_json FROM published_world_state WHERE id = 1").get();
    if (publishedRow) {
      const publishedWorld = updateWorldAssetPaths(publishedRow.world_json, assetId, sourcePath, thumbnailPath);
      if (publishedWorld) {
        this.db.prepare("UPDATE published_world_state SET world_json = ? WHERE id = 1")
          .run(JSON.stringify(publishedWorld));
      }
    }
  }

  manifestForIds(ids) {
    const seen = new Set();
    const manifest = [];
    for (const id of ids) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const asset = this.get(id);
      if (asset) manifest.push(asset);
    }
    return manifest;
  }
}

function toAsset(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    assetType: row.asset_type,
    sourcePath: row.source_path,
    thumbnailPath: row.thumbnail_path || null,
    originalFileName: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    metadata: normalizeAssetMetadata(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function requiredText(value, label, maxLength) {
  const text = String(value === null || value === undefined ? "" : value).trim();
  if (!text) {
    const error = new Error(label + " is verplicht.");
    error.status = 400;
    throw error;
  }
  if (text.length > maxLength) {
    const error = new Error(label + " is maximaal " + maxLength + " tekens.");
    error.status = 400;
    throw error;
  }
  return text;
}

function collectAssetUsage(graph, assetId) {
  const usage = [];
  const nodeTypes = graph?.nodeTypes || NODE_TYPES;
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  for (const node of nodes) {
    const definition = nodeTypes?.[node.type];
    if (!definition?.fields) continue;
    for (const [fieldKey, field] of Object.entries(definition.fields)) {
      if (field.type !== "asset") continue;
      if (node.values?.[fieldKey] !== assetId) continue;
      usage.push({
        nodeId: node.id,
        nodeTitle: node.title,
        nodeType: node.type,
        nodeLabel: definition.label,
        fieldKey: fieldKey,
        fieldLabel: field.label
      });
    }
  }
  return usage;
}

function removeAssetFiles(assetsDir, row) {
  const candidates = new Set([row?.source_path, row?.thumbnail_path]);
  for (const assetPath of candidates) {
    const filePath = safeUploadFilePath(assetsDir, assetPath);
    if (!filePath) continue;
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
}

function safeUploadFilePath(assetsDir, assetPath) {
  if (typeof assetPath !== "string" || !assetPath.startsWith("/assets/")) return null;
  const filePath = path.resolve(assetsDir, assetPath.slice("/assets/".length));
  const relative = path.relative(assetsDir, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return filePath;
}

async function generateGlbThumbnail({ rootDir, assetsDir, scriptPath, thumbnailStem, sourceFilePath, strict }) {
  const startedAt = performance.now();
  const thumbnailsDir = path.join(assetsDir, "thumbnails");
  const resolvedStem = String(thumbnailStem || "").trim();
  const thumbnailPath = "/assets/thumbnails/" + resolvedStem + ".png";
  const finalFilePath = path.join(thumbnailsDir, resolvedStem + ".png");
  const temporaryFilePath = path.join(thumbnailsDir, resolvedStem + ".tmp.png");
  fs.mkdirSync(thumbnailsDir, { recursive: true });
  fs.rmSync(temporaryFilePath, { force: true });
  fs.rmSync(finalFilePath, { force: true });
  const env = Object.assign({}, process.env, {
    GLB_THUMBNAIL_STRICT: strict ? "1" : "0"
  });
  console.info("[timing] thumbnail generation start stem=" + resolvedStem);
  try {
    const result = await runProcess("sh", [scriptPath, sourceFilePath, temporaryFilePath], { cwd: rootDir, env: env, timeoutMs: GLB_THUMBNAIL_HARD_LIMIT_MS });
    const stalled = result.timedOut || /THUMBNAIL_WATCHDOG/.test(result.stderr || "");
    // Killed (signal/OOM), stalled or a network hiccup: worth another try later.
    const retryable = stalled || GLB_THUMBNAIL_RETRYABLE_EXIT_CODES.has(result.code) || GLB_THUMBNAIL_NETWORK_ERROR.test(result.stderr || "");
    if (stalled) {
      return {
        status: "failed",
        thumbnailPath: null,
        error: "Thumbnail bleef hangen (netwerk of browser reageerde niet) en is gestopt."
      };
    }
    if (result.code === 0 && fs.existsSync(temporaryFilePath)) {
      fs.renameSync(temporaryFilePath, finalFilePath);
      return {
        status: "ready",
        thumbnailPath: thumbnailPath,
        error: null
      };
    }
    if (result.code === 0) {
      return {
        status: "skipped",
        thumbnailPath: null,
        error: null
      };
    }
    return {
      status: "failed",
      thumbnailPath: null,
      error: shortThumbnailErrorMessage((result.stderr || "").trim() || (retryable ? "Thumbnailproces werd gestopt." : "GLB thumbnail generatie mislukt."))
    };
  } catch (error) {
    return {
      status: "failed",
      thumbnailPath: null,
      error: shortThumbnailErrorMessage(error && error.message ? error.message : "GLB thumbnail generatie mislukt.")
    };
  } finally {
    fs.rmSync(temporaryFilePath, { force: true });
    logTiming("thumbnail generation end", startedAt, "stem=" + resolvedStem);
  }
}

function shortThumbnailErrorMessage(message) {
  const text = String(message === null || message === undefined ? "" : message).trim().replace(/\s+/g, " ");
  if (!text) return "Thumbnail generatie mislukt.";
  return text.length > 180 ? text.slice(0, 177) + "..." : text;
}

function runProcess(command, args, options) {
  return new Promise(function (resolve, reject) {
    const timeoutMs = Math.max(0, Number(options?.timeoutMs) || 0);
    // With a time limit the child gets its own process group, so a timeout can
    // stop the whole tree (sh, xvfb-run, Xvfb, node, Chrome) at once.
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: options?.env,
      stdio: ["ignore", "ignore", "pipe"],
      detached: timeoutMs > 0
    });
    let stderr = "";
    let timedOut = false;
    let closed = false;
    const stopTree = function (signal) {
      try {
        process.kill(-child.pid, signal);
      } catch {
        try { child.kill(signal); } catch {}
      }
    };
    const timer = timeoutMs > 0 ? setTimeout(function () {
      timedOut = true;
      stopTree("SIGTERM");
      setTimeout(function () { if (!closed) stopTree("SIGKILL"); }, 3000).unref();
    }, timeoutMs) : null;
    child.stderr.on("data", function (data) {
      stderr += data.toString("utf8");
    });
    child.on("error", function (error) {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on("close", function (code) {
      closed = true;
      if (timer) clearTimeout(timer);
      resolve({ code: code === null ? -1 : code, stderr: stderr, timedOut: timedOut });
    });
  });
}

function isTruthyEnv(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes" || text === "on";
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function metadataFromGlb(data) {
  if (!data || data.length < 20) {
    const error = new Error("GLB bestand is te klein.");
    error.status = 400;
    throw error;
  }
  if (data.slice(0, 4).toString("utf8") !== "glTF" || data.readUInt32LE(4) !== 2) {
    const error = new Error("GLB header is ongeldig.");
    error.status = 400;
    throw error;
  }
  const declaredLength = data.readUInt32LE(8);
  if (declaredLength > data.length) {
    const error = new Error("GLB lengte klopt niet.");
    error.status = 400;
    throw error;
  }
  const json = parseGlbJsonChunk(data);
  const animations = Array.isArray(json.animations) ? json.animations.map(function (animation, index) {
    return { name: animationName(animation?.name, index), index: index };
  }) : [];
  return {
    animationCount: animations.length,
    animations: animations,
    defaultAnimation: defaultAnimationFromAnimations(animations)
  };
}

function parseGlbJsonChunk(data) {
  let offset = 12;
  while (offset + 8 <= data.length) {
    const chunkLength = data.readUInt32LE(offset);
    const chunkType = data.slice(offset + 4, offset + 8).toString("utf8");
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > data.length) break;
    if (chunkType === "JSON") {
      const text = data.slice(chunkStart, chunkEnd).toString("utf8").trim();
      if (!text) break;
      try {
        return JSON.parse(text);
      } catch {
        const error = new Error("GLB JSON chunk is ongeldig.");
        error.status = 400;
        throw error;
      }
    }
    offset = chunkEnd;
  }
  const error = new Error("GLB JSON chunk ontbreekt.");
  error.status = 400;
  throw error;
}

function animationName(name, index) {
  const trimmed = String(name || "").trim();
  return trimmed || "Animation " + (index + 1);
}

function defaultAnimationFromAnimations(animations) {
  if (!animations.length) return null;
  const idle = animations.find(function (animation) {
    return String(animation.name || "").toLowerCase().includes("idle");
  });
  return (idle || animations[0]).name || null;
}

function inferType(ext) {
  if (extensionsByType.model.has(ext)) return "model";
  if (extensionsByType.texture.has(ext)) return "texture";
  if (extensionsByType.audio.has(ext)) return "audio";
  if (extensionsByType.data.has(ext)) return "data";
  return "";
}

function validateUpload({ assetType, ext, file }) {
  const errors = [];
  if (!allowedAssetTypes.has(assetType)) errors.push("Asset type is ongeldig.");
  if (!extensionsByType[assetType]?.has(ext)) errors.push("Bestandstype " + ext + " past niet bij asset type " + assetType + ".");
  if (file.data.length > 80 * 1024 * 1024) errors.push("Upload is groter dan 80MB.");
  if (!hasValidSignature(assetType, ext, file.data)) errors.push("Bestandsinhoud matcht het verwachte formaat niet.");
  if (errors.length) {
    const error = new Error(errors.join(" "));
    error.status = 400;
    throw error;
  }
}

function hasValidSignature(assetType, ext, data) {
  if (assetType === "model") return data.length >= 12 && data.slice(0, 4).toString("utf8") === "glTF" && data.readUInt32LE(4) === 2;
  if (assetType === "texture" || assetType === "image") return isPng(data) || isJpeg(data) || isWebp(data);
  if (assetType === "data") {
    try { JSON.parse(data.toString("utf8")); return true; } catch { return false; }
  }
  if (assetType === "audio") return data.length > 8;
  return false;
}

function isPng(data) {
  return data.length > 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47;
}

function isJpeg(data) {
  return data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
}

function isWebp(data) {
  return data.length > 12 && data.slice(0, 4).toString("utf8") === "RIFF" && data.slice(8, 12).toString("utf8") === "WEBP";
}
