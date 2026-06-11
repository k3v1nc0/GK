import { createReadStream } from "node:fs";
import { open, opendir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, extname, join, relative, sep } from "node:path";

import {
  countAssetRecords,
  createEmptyAssetLibrarySnapshot,
  createRoleMappingForAssetType,
  getAssetTypeForExtension,
  type AssetLibrarySnapshot,
  type AssetLibraryValidationIssue,
  type AssetRecord,
  type AssetScannerOptions,
  type AssetType
} from "./contracts.js";

export async function scanAssetSourceDirectory(options: AssetScannerOptions): Promise<AssetLibrarySnapshot> {
  const scannedAt = (options.now ?? new Date()).toISOString();
  const issues: AssetLibraryValidationIssue[] = [];
  const scannedRecords: AssetRecord[] = [];

  try {
    const rootStats = await stat(options.sourceDir);
    if (!rootStats.isDirectory()) {
      return invalidSourceSnapshot(options.sourceDir, scannedAt, "asset source is not a directory");
    }
  } catch {
    return invalidSourceSnapshot(options.sourceDir, scannedAt, "asset source directory is not readable");
  }

  for await (const filePath of walkFiles(options.sourceDir)) {
    const extension = extname(filePath).toLowerCase();
    const assetType = getAssetTypeForExtension(extension);
    const relativePath = normalizeRelativePath(relative(options.sourceDir, filePath));

    if (!assetType) {
      issues.push({
        path: relativePath,
        message: "unsupported asset extension skipped",
        severity: "warning"
      });
      continue;
    }

    scannedRecords.push(await createAssetRecord(filePath, relativePath, extension, assetType, scannedAt, options.hashContent !== false, issues));
  }

  const records = reconcileAssetRecords(scannedRecords, options.previousRecords ?? [], scannedAt);

  return {
    sourceDir: options.sourceDir,
    scannedAt,
    records,
    counts: countAssetRecords(records),
    validationIssues: issues,
    publishesRuntimeOutput: false,
    assetsCopiedToGit: false,
    assignsDefinitiveRuntimeRoles: false
  };
}

export function reconcileAssetRecords(
  scannedRecords: readonly AssetRecord[],
  previousRecords: readonly AssetRecord[],
  missingTimestamp: string
): readonly AssetRecord[] {
  const scannedById = new Map(scannedRecords.map((record) => [record.assetId, record]));
  const reconciled = scannedRecords.map((record) => {
    const previous = previousRecords.find((candidate) => candidate.assetId === record.assetId);

    if (previous?.roleMapping.status === "assigned") {
      return {
        ...record,
        roleMapping: previous.roleMapping
      };
    }

    return record;
  });

  for (const previous of previousRecords) {
    if (!scannedById.has(previous.assetId)) {
      reconciled.push({
        ...previous,
        modifiedAt: previous.modifiedAt || missingTimestamp,
        status: "missing"
      });
    }
  }

  return reconciled.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function* walkFiles(rootDir: string): AsyncGenerator<string> {
  const directory = await opendir(rootDir);

  for await (const entry of directory) {
    const childPath = join(rootDir, entry.name);

    if (entry.isDirectory()) {
      yield* walkFiles(childPath);
      continue;
    }

    if (entry.isFile()) {
      yield childPath;
    }
  }
}

async function createAssetRecord(
  filePath: string,
  relativePath: string,
  extension: string,
  assetType: AssetType,
  scannedAt: string,
  hashContent: boolean,
  issues: AssetLibraryValidationIssue[]
): Promise<AssetRecord> {
  const fileStats = await stat(filePath);
  const metadata = await readMetadata(filePath, relativePath, assetType, issues);

  return {
    assetId: normalizeAssetId(relativePath),
    assetType,
    originalFilename: basename(filePath),
    normalizedKey: normalizeAssetKey(relativePath),
    relativePath,
    extension,
    sizeBytes: fileStats.size,
    modifiedAt: fileStats.mtime.toISOString(),
    contentHash: hashContent ? { algorithm: "sha256", value: await hashFile(filePath) } : null,
    metadata,
    status: metadata.valid === false ? "invalid" : "active",
    roleMapping: createRoleMappingForAssetType(assetType)
  };
}

async function readMetadata(
  filePath: string,
  relativePath: string,
  assetType: AssetType,
  issues: AssetLibraryValidationIssue[]
): Promise<Readonly<Record<string, unknown>>> {
  if (assetType === "glb") {
    const header = await readFileHeader(filePath, 12);
    const magic = header.subarray(0, 4).toString("utf8");
    const version = header.byteLength >= 8 ? header.readUInt32LE(4) : null;
    const declaredLength = header.byteLength >= 12 ? header.readUInt32LE(8) : null;
    const valid = magic === "glTF" && version === 2 && typeof declaredLength === "number";

    if (!valid) {
      issues.push({
        path: relativePath,
        message: "GLB header is invalid or unsupported",
        severity: "error"
      });
    }

    return {
      format: "glb",
      valid,
      glbVersion: version,
      declaredLength,
      candidateCapabilitiesOnly: true
    };
  }

  if (assetType === "ui_image") {
    return {
      format: "ui_image",
      metadataExtraction: "deferred",
      candidateCapabilitiesOnly: true
    };
  }

  return {
    format: "audio",
    metadataExtraction: "deferred",
    candidateCapabilitiesOnly: true
  };
}

async function readFileHeader(filePath: string, length: number): Promise<Buffer> {
  const handle = await open(filePath, "r");

  try {
    const buffer = Buffer.alloc(length);
    const result = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

function invalidSourceSnapshot(sourceDir: string, scannedAt: string, message: string): AssetLibrarySnapshot {
  const snapshot = createEmptyAssetLibrarySnapshot(sourceDir, new Date(scannedAt));

  return {
    ...snapshot,
    validationIssues: [{ path: ".", message, severity: "error" }]
  };
}

function normalizeRelativePath(path: string): string {
  return path.split(sep).join("/");
}

function normalizeAssetId(relativePath: string): string {
  return normalizeAssetKey(relativePath);
}

function normalizeAssetKey(relativePath: string): string {
  return relativePath
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return hash.digest("hex");
}
