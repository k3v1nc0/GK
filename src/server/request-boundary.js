const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export const WS_MAX_PAYLOAD_BYTES = 64 * 1024;

export function isMutationRequest(req) {
  return MUTATION_METHODS.has(String(req?.method || "").toUpperCase());
}

export function allowedOrigins(env = process.env) {
  const configured = String(env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (configured.length) return new Set(configured);
  const result = new Set(["http://localhost:3001", "http://127.0.0.1:3001"]);
  if (env.GK_TEST_ISOLATED === "1" && Number(env.PORT) > 0) {
    result.add("http://localhost:" + Number(env.PORT));
    result.add("http://127.0.0.1:" + Number(env.PORT));
  }
  return result;
}

export function assertAllowedOrigin(req, env = process.env) {
  const origin = String(req?.headers?.origin || "").trim();
  if (origin && allowedOrigins(env).has(origin)) return true;
  const error = new Error("Origin is niet toegestaan.");
  error.status = 403;
  error.code = "ORIGIN_FORBIDDEN";
  throw error;
}

export function isDeniedPublicPath(pathname) {
  const value = String(pathname || "");
  let decoded;
  try {
    decoded = decodeURIComponent(value).replace(/\\/g, "/");
  } catch {
    return true;
  }
  const segments = decoded.split("/").filter(Boolean).map((segment) => segment.toLowerCase());
  return segments.some((segment) => segment === ".git" || segment === ".env" || segment.startsWith(".env."))
    || segments[0] === "storage";
}
