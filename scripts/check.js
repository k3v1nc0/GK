import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const targets = ["src", "apps/web/public", "scripts"];

function collect(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
}

const files = [];
for (const target of targets) {
  const full = path.join(rootDir, target);
  if (fs.existsSync(full)) collect(full, files);
}

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status === 0) {
    console.log("ok   " + path.relative(rootDir, file));
  } else {
    failed += 1;
    console.error("FAIL " + path.relative(rootDir, file));
    const message = String((result.stderr || result.stdout || "").trim() || result.error?.message || ("exit code " + (result.status ?? "unknown")));
    if (message) console.error(message);
  }
}

console.log("\n" + (files.length - failed) + "/" + files.length + " bestanden syntactisch ok.");
process.exit(failed ? 1 : 0);
