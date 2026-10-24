import path from "node:path";
import { fileURLToPath } from "node:url";
import { restoreDatabaseBackup } from "../src/server/restore-service.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function option(name) {
  const index = process.argv.indexOf("--" + name);
  return index >= 0 ? process.argv[index + 1] : "";
}

try {
  const backupDir = option("backup");
  const targetDir = option("target");
  if (!backupDir || !targetDir) throw new Error("Gebruik: restore-db.js --backup <backupmap> --target <lege-map>");
  const result = restoreDatabaseBackup({ backupDir, targetDir, rootDir });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
}
