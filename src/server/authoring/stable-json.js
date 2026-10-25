import crypto from "node:crypto";

// JSON met gesorteerde keys: gelijke inhoud geeft altijd dezelfde bytes en dus dezelfde hash.
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return "{" + keys.map((key) => JSON.stringify(key) + ":" + stableStringify(value[key])).join(",") + "}";
}

export function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function authoringError(status, code, message, details) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}
