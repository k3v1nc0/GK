import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const now = function () {
  return new Date().toISOString();
};

const allowedAssetTypes = new Set(["model", "texture", "image", "audio", "data"]);
const extensionsByType = {
  model: new Set([".glb"]),
  texture: new Set([".png", ".jpg", ".jpeg", ".webp"]),
  image: new Set([".png", ".jpg", ".jpeg", ".webp"]),
  audio: new Set([".mp3", ".ogg", ".wav"]),
  data: new Set([".json"])
};

export class AssetService {
  constructor(db, rootDir) {
    this.db = db;
    this.rootDir = rootDir;
    this.assetsDir = path.join(rootDir, "assets");
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

  importUpload(input) {
    const file = input?.file;
    if (!file?.data?.length) {
      const error = new Error("Upload mist een bestand.");
      error.status = 400;
      throw error;
    }
    const originalFileName = path.basename(file.filename || "asset");
    const ext = path.extname(originalFileName).toLowerCase();
    const assetType = String(input.assetType || inferType(ext) || "").trim();
    const name = String(input.name || path.basename(originalFileName, ext)).trim();
    const category = String(input.category || "uncategorized").trim();
    validateUpload({ assetType, ext, file });
    if (!name || name.length > 96) {
      const error = new Error("Asset name is verplicht en maximaal 96 tekens.");
      error.status = 400;
      throw error;
    }
    if (!category || category.length > 64) {
      const error = new Error("Asset category is verplicht en maximaal 64 tekens.");
      error.status = 400;
      throw error;
    }
    const id = "asset_" + crypto.randomUUID();
    const uploadDir = path.join(this.assetsDir, "uploads");
    fs.mkdirSync(uploadDir, { recursive: true });
    const storedName = id + ext;
    fs.writeFileSync(path.join(uploadDir, storedName), file.data);
    const sourcePath = "/assets/uploads/" + storedName;
    // Real thumbnails only: an image is its own thumbnail. No fake thumbnails are generated.
    const thumbnailPath = (assetType === "image" || assetType === "texture") ? sourcePath : null;
    const metadata = {
      importedAt: now(),
      sha256: crypto.createHash("sha256").update(file.data).digest("hex"),
      contentType: file.contentType || "",
      format: ext.slice(1)
    };
    if (assetType === "model") {
      Object.assign(metadata, metadataFromGlb(file.data));
    }
    this.db.prepare("INSERT INTO asset_library (id, name, category, asset_type, source_path, thumbnail_path, original_filename, mime_type, size_bytes, sha256, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, name, category, assetType, sourcePath, thumbnailPath, originalFileName, file.contentType || "", file.data.length, metadata.sha256, JSON.stringify(metadata), now(), now());
    return this.get(id);
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
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
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
