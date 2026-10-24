export class LoginAttemptLimiter {
  constructor(options = {}) {
    this.limit = Math.max(1, Number(options.limit) || 5);
    this.windowMs = Math.max(1000, Number(options.windowMs) || 60000);
    this.clock = options.clock || (() => Date.now());
    this.attempts = new Map();
  }

  consume(ipAddress, accountIdentifier) {
    const keys = ["ip:" + String(ipAddress || "unknown"), "account:" + String(accountIdentifier || "").trim().toLowerCase()];
    const current = Number(this.clock());
    for (const key of keys) {
      const active = (this.attempts.get(key) || []).filter((stamp) => current - stamp < this.windowMs);
      this.attempts.set(key, active);
      if (active.length >= this.limit) {
        const error = new Error("Te veel loginpogingen. Probeer later opnieuw.");
        error.status = 429;
        error.code = "LOGIN_RATE_LIMITED";
        throw error;
      }
    }
    for (const key of keys) this.attempts.get(key).push(current);
    return true;
  }
}

export function assertSecureCookieConfiguration(env = process.env) {
  if (String(env.NODE_ENV || "").toLowerCase() === "production" && String(env.COOKIE_SECURE || "").toLowerCase() !== "true") {
    const error = new Error("Productiestart geweigerd: COOKIE_SECURE=true is verplicht.");
    error.code = "SECURE_COOKIE_REQUIRED";
    throw error;
  }
  return true;
}
