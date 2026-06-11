import type { IncomingMessage } from "node:http";

import { getSingleHeader } from "./http-utils.js";
import { CSRF_COOKIE, readCookie } from "./session-cookies.js";

export type StateChangingRequestIssue = "origin_not_allowed" | "csrf_required";

export interface StateChangingRequestPolicy {
  readonly allowed: boolean;
  readonly issue?: StateChangingRequestIssue;
}

export function validateStateChangingRequest(
  request: IncomingMessage,
  options: { readonly requireCsrf: boolean }
): StateChangingRequestPolicy {
  if (!isOriginAllowed(request)) {
    return {
      allowed: false,
      issue: "origin_not_allowed"
    };
  }

  if (options.requireCsrf && process.env.GK_REQUIRE_CSRF !== "0" && !hasCsrfProof(request)) {
    return {
      allowed: false,
      issue: "csrf_required"
    };
  }

  return { allowed: true };
}

export function isOriginAllowed(request: IncomingMessage): boolean {
  const origin = getSingleHeader(request, "origin");

  if (!origin) {
    return process.env.GK_ALLOW_MISSING_ORIGIN_FOR_SMOKE === "1";
  }

  const allowed = new Set(
    (process.env.GK_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const sameOrigin = getSameOriginFromRequest(request);

  if (sameOrigin) {
    allowed.add(sameOrigin);
  }

  return allowed.has(origin);
}

export function hasCsrfProof(request: IncomingMessage): boolean {
  const headerToken = getSingleHeader(request, "x-gk-csrf-token");

  if (!headerToken) {
    return false;
  }

  return readCookie(request, CSRF_COOKIE) === headerToken;
}

function getSameOriginFromRequest(request: IncomingMessage): string | null {
  const host = getSingleHeader(request, "host");

  if (!host) {
    return null;
  }

  const proto = getSingleHeader(request, "x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
