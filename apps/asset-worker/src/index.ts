import { readOptionalEnv, type EnvReader } from "@gk/shared-utils";

declare const process: {
  readonly env: EnvReader;
};

export interface AssetWorkerConfig {
  readonly sourceDir: string;
  readonly assignsRuntimeRoles: false;
}

export function loadAssetWorkerConfig(env: EnvReader = process.env): AssetWorkerConfig {
  return {
    sourceDir: readOptionalEnv(env, "GK_ASSET_SOURCE_DIR") ?? "/var/www/gk/assets",
    assignsRuntimeRoles: false
  };
}

export function describeAssetWorker(config: AssetWorkerConfig = loadAssetWorkerConfig()): string {
  return `asset-worker scans ${config.sourceDir} without assigning runtime roles`;
}

