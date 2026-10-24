import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createDatabaseBackup, verifyBackup } from "../src/server/backup-service.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function optionsFromArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (!name.startsWith("--")) continue;
    result[name.slice(2)] = args[index + 1];
    index += 1;
  }
  return result;
}

async function main() {
  const options = optionsFromArgs(process.argv.slice(2));
  if (!options.database || !options.assets || !options.target) {
    throw new Error("Gebruik: backup-db.js --database <pad> --assets <pad> --target <nieuwe-map> [--source-sha <sha>]");
  }
  const databasePath = path.resolve(options.database);
  const sourceDb = new DatabaseSync(databasePath, { readOnly: false });
  try {
    const result = await createDatabaseBackup({
      sourceDb,
      sourceDatabasePath: databasePath,
      assetsPath: path.resolve(options.assets),
      targetDir: path.resolve(options.target),
      rootDir,
      sourceSha: options["source-sha"] || "unknown"
    });
    const verified = verifyBackup(result.targetDir);
    console.log(JSON.stringify({ ok: true, targetDir: result.targetDir, integrity: verified.integrity, manifest: result.manifest }, null, 2));
  } finally {
    sourceDb.close();
  }
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
