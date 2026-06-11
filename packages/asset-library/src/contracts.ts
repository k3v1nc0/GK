export type AssetType = "glb" | "ui_image" | "audio";
export type AssetStatus = "active" | "missing" | "invalid";
export type AssetRoleMappingStatus = "unassigned" | "candidate" | "assigned";
export type AssetRoleMappingSource = "scanner-candidate" | "editor-data";

export interface AssetContentHash {
  readonly algorithm: "sha256";
  readonly value: string;
}

export interface AssetRoleMapping {
  readonly status: AssetRoleMappingStatus;
  readonly assignedRole: string | null;
  readonly candidateCapabilities: readonly string[];
  readonly source: AssetRoleMappingSource;
}

export interface AssetRecord {
  readonly assetId: string;
  readonly assetType: AssetType;
  readonly originalFilename: string;
  readonly normalizedKey: string;
  readonly relativePath: string;
  readonly extension: string;
  readonly sizeBytes: number;
  readonly modifiedAt: string;
  readonly contentHash: AssetContentHash | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly status: AssetStatus;
  readonly roleMapping: AssetRoleMapping;
}

export interface AssetLibraryCounts {
  readonly total: number;
  readonly glb: number;
  readonly uiImage: number;
  readonly audio: number;
  readonly active: number;
  readonly missing: number;
  readonly invalid: number;
  readonly unassigned: number;
  readonly candidate: number;
  readonly assigned: number;
}

export interface AssetLibraryValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly severity: "warning" | "error";
}

export interface AssetLibrarySnapshot {
  readonly sourceDir: string;
  readonly scannedAt: string;
  readonly records: readonly AssetRecord[];
  readonly counts: AssetLibraryCounts;
  readonly validationIssues: readonly AssetLibraryValidationIssue[];
  readonly publishesRuntimeOutput: false;
  readonly assetsCopiedToGit: false;
  readonly assignsDefinitiveRuntimeRoles: false;
}

export interface AssetScannerOptions {
  readonly sourceDir: string;
  readonly previousRecords?: readonly AssetRecord[] | undefined;
  readonly now?: Date | undefined;
  readonly hashContent?: boolean | undefined;
}

export interface AssetPollingWatcherContract {
  readonly sourceDir: string;
  readonly mode: "polling-or-watch";
  readonly defaultPollingIntervalMs: number;
  readonly startsPermanentDaemonFromGit: false;
  readonly deletesServerFiles: false;
  readonly publishesRuntimeOutput: false;
}

export const GLB_EXTENSIONS = [".glb"] as const;
export const UI_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"] as const;
export const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".oga", ".flac", ".m4a", ".aac", ".opus"] as const;

export const GLB_CANDIDATE_CAPABILITIES = [
  "asset.glb",
  "renderable_candidate",
  "spawnable_candidate",
  "entity_visual_candidate",
  "npc_visual_candidate",
  "prop_visual_candidate",
  "environment_visual_candidate"
] as const;

const DEFAULT_COUNTS: AssetLibraryCounts = {
  total: 0,
  glb: 0,
  uiImage: 0,
  audio: 0,
  active: 0,
  missing: 0,
  invalid: 0,
  unassigned: 0,
  candidate: 0,
  assigned: 0
};

export function getAssetTypeForExtension(extension: string): AssetType | null {
  const normalized = extension.toLowerCase();

  if ((GLB_EXTENSIONS as readonly string[]).includes(normalized)) {
    return "glb";
  }

  if ((UI_IMAGE_EXTENSIONS as readonly string[]).includes(normalized)) {
    return "ui_image";
  }

  if ((AUDIO_EXTENSIONS as readonly string[]).includes(normalized)) {
    return "audio";
  }

  return null;
}

export function createRoleMappingForAssetType(assetType: AssetType): AssetRoleMapping {
  if (assetType === "glb") {
    return {
      status: "candidate",
      assignedRole: null,
      candidateCapabilities: GLB_CANDIDATE_CAPABILITIES,
      source: "scanner-candidate"
    };
  }

  return {
    status: "unassigned",
    assignedRole: null,
    candidateCapabilities: [],
    source: "scanner-candidate"
  };
}

export function countAssetRecords(records: readonly AssetRecord[]): AssetLibraryCounts {
  return records.reduce<AssetLibraryCounts>(
    (counts, record) => ({
      total: counts.total + 1,
      glb: counts.glb + (record.assetType === "glb" ? 1 : 0),
      uiImage: counts.uiImage + (record.assetType === "ui_image" ? 1 : 0),
      audio: counts.audio + (record.assetType === "audio" ? 1 : 0),
      active: counts.active + (record.status === "active" ? 1 : 0),
      missing: counts.missing + (record.status === "missing" ? 1 : 0),
      invalid: counts.invalid + (record.status === "invalid" ? 1 : 0),
      unassigned: counts.unassigned + (record.roleMapping.status === "unassigned" ? 1 : 0),
      candidate: counts.candidate + (record.roleMapping.status === "candidate" ? 1 : 0),
      assigned: counts.assigned + (record.roleMapping.status === "assigned" ? 1 : 0)
    }),
    DEFAULT_COUNTS
  );
}

export function createEmptyAssetLibrarySnapshot(sourceDir: string, now: Date = new Date()): AssetLibrarySnapshot {
  return {
    sourceDir,
    scannedAt: now.toISOString(),
    records: [],
    counts: DEFAULT_COUNTS,
    validationIssues: [],
    publishesRuntimeOutput: false,
    assetsCopiedToGit: false,
    assignsDefinitiveRuntimeRoles: false
  };
}

export function createAssetPollingWatcherContract(
  sourceDir: string,
  defaultPollingIntervalMs = 30_000
): AssetPollingWatcherContract {
  return {
    sourceDir,
    mode: "polling-or-watch",
    defaultPollingIntervalMs,
    startsPermanentDaemonFromGit: false,
    deletesServerFiles: false,
    publishesRuntimeOutput: false
  };
}
