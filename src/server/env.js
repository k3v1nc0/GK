import fs from "node:fs";
import path from "node:path";

export function loadEnvFile(rootDir, env = process.env) {
  // Isolated test runs get their config from the test runner only; never from the operator's .env.
  if (env.GK_TEST_ISOLATED === "1") return false;
  const filePath = path.join(rootDir, ".env");
  if (!fs.existsSync(filePath)) return false;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key && env[key] === undefined) env[key] = value;
  }
  return true;
}
