import path from "node:path";

export function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveAssetsPath(rootDir) {
  const configured = process.env.ASSETS_PATH || "./assets";
  return path.resolve(rootDir, configured);
}

export function assertIsolatedStorage({ rootDir, databasePath, assetsPath }) {
  if (process.env.GK_TEST_ISOLATED !== "1") {
    const error = new Error("Testopslag geweigerd: zet GK_TEST_ISOLATED=1 en gebruik een tijdelijke testroot.");
    error.code = "TEST_ISOLATION_REQUIRED";
    throw error;
  }
  const testRoot = String(process.env.GK_TEST_ROOT || "").trim();
  if (!testRoot || !path.isAbsolute(testRoot)) {
    const error = new Error("Testopslag geweigerd: GK_TEST_ROOT moet een absoluut tijdelijk pad zijn.");
    error.code = "TEST_ROOT_REQUIRED";
    throw error;
  }
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTestRoot = path.resolve(testRoot);
  const resolvedDatabase = path.resolve(databasePath);
  const resolvedAssets = path.resolve(assetsPath);
  const normalStorage = path.join(resolvedRoot, "storage");
  const normalAssets = path.join(resolvedRoot, "assets");
  const publicRoot = path.join(resolvedRoot, "apps", "web", "public");

  if (!isPathInside(resolvedTestRoot, resolvedDatabase) || !isPathInside(resolvedTestRoot, resolvedAssets)) {
    const error = new Error("Testopslag geweigerd: DB en assets moeten binnen GK_TEST_ROOT staan.");
    error.code = "TEST_PATH_OUTSIDE_ROOT";
    throw error;
  }
  if (isPathInside(normalStorage, resolvedDatabase) || isPathInside(normalAssets, resolvedAssets)) {
    const error = new Error("Testopslag geweigerd: normale storage/assets zijn niet toegestaan.");
    error.code = "NORMAL_STORAGE_FORBIDDEN";
    throw error;
  }
  if (isPathInside(publicRoot, resolvedDatabase) || isPathInside(publicRoot, resolvedAssets)) {
    const error = new Error("Testopslag geweigerd: de publieke webroot is niet toegestaan.");
    error.code = "PUBLIC_STORAGE_FORBIDDEN";
    throw error;
  }
  return { testRoot: resolvedTestRoot, databasePath: resolvedDatabase, assetsPath: resolvedAssets };
}

export function assertIsolatedNetwork({ host, port }) {
  if (process.env.GK_TEST_ISOLATED !== "1") return;
  if (host !== "127.0.0.1" && host !== "localhost") {
    const error = new Error("Testnetwerk geweigerd: alleen loopback is toegestaan.");
    error.code = "PUBLIC_TEST_HOST_FORBIDDEN";
    throw error;
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error("Testnetwerk geweigerd: een geldige gereserveerde poort is verplicht.");
    error.code = "TEST_PORT_REQUIRED";
    throw error;
  }
}
