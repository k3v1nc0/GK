import {
  createAssetPollingWatcherContract,
  scanAssetSourceDirectory,
  type AssetLibrarySnapshot,
  type AssetPollingWatcherContract
} from "@gk/asset-library";
import { readOptionalEnv, type EnvReader } from "@gk/shared-utils";

declare const process: {
  readonly env: EnvReader;
};

export interface AssetWorkerConfig {
  readonly sourceDir: string;
  readonly pollingIntervalMs: number;
  readonly assignsRuntimeRoles: false;
  readonly startsPermanentDaemonFromGit: false;
}

export function loadAssetWorkerConfig(env: EnvReader = process.env): AssetWorkerConfig {
  return {
    sourceDir: readOptionalEnv(env, "GK_ASSET_SOURCE_DIR") ?? "/var/www/gk/assets",
    pollingIntervalMs: Number(readOptionalEnv(env, "GK_ASSET_SCAN_POLL_INTERVAL_MS") ?? 30_000),
    assignsRuntimeRoles: false,
    startsPermanentDaemonFromGit: false
  };
}

export function createAssetWorkerScanPlan(
  config: AssetWorkerConfig = loadAssetWorkerConfig()
): AssetPollingWatcherContract {
  return createAssetPollingWatcherContract(config.sourceDir, config.pollingIntervalMs);
}

export async function scanConfiguredAssets(
  config: AssetWorkerConfig = loadAssetWorkerConfig()
): Promise<AssetLibrarySnapshot> {
  return scanAssetSourceDirectory({
    sourceDir: config.sourceDir
  });
}

export function describeAssetWorker(config: AssetWorkerConfig = loadAssetWorkerConfig()): string {
  return `asset-worker scans ${config.sourceDir} without assigning runtime roles or starting a permanent daemon from Git`;
}
