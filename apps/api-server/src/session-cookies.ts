import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";

import { getSingleHeader } from "./http-utils.js";

export const EDITOR_SESSION_COOKIE = "gk_editor_session";
export const GAME_SESSION_COOKIE = "gk_game_session";
export const CSRF_COOKIE = "gk_csrf";

export interface CookieOptions {
  readonly httpOnly?: boolean;
  readonly maxAgeSeconds?: number;
  readonly path?: string;
  readonly sameSite?: "Strict" | "Lax" | "None";
  readonly secure?: boolean;
}

export function createOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function hashRequestValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function readCookie(request: IncomingMessage, name: string): string | null {
  const cookieHeader = getSingleHeader(request, "cookie");

  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");

    if (rawName === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return null;
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  const path = options.path ?? "/";

  parts.push(`Path=${path}`);

  if (options.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${options.maxAgeSeconds}`);
  }

  parts.push(`SameSite=${options.sameSite ?? "Strict"}`);

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function createEditorSessionCookies(
  request: IncomingMessage,
  sessionToken: string,
  csrfToken: string,
  maxAgeSeconds: number
): readonly string[] {
  const secure = shouldUseSecureCookies(request);

  return [
    serializeCookie(EDITOR_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      maxAgeSeconds,
      sameSite: "Strict",
      secure
    }),
    serializeCookie(CSRF_COOKIE, csrfToken, {
      httpOnly: false,
      maxAgeSeconds,
      sameSite: "Strict",
      secure
    })
  ];
}

export function createEditorLogoutCookies(request: IncomingMessage): readonly string[] {
  const secure = shouldUseSecureCookies(request);

  return [
    serializeCookie(EDITOR_SESSION_COOKIE, "", {
      httpOnly: true,
      maxAgeSeconds: 0,
      sameSite: "Strict",
      secure
    }),
    serializeCookie(CSRF_COOKIE, "", {
      httpOnly: false,
      maxAgeSeconds: 0,
      sameSite: "Strict",
      secure
    })
  ];
}

export function shouldUseSecureCookies(request: IncomingMessage): boolean {
  const configured = process.env.GK_COOKIE_SECURE;

  if (configured === "1") {
    return true;
  }

  if (configured === "0") {
    return false;
  }

  return getSingleHeader(request, "x-forwarded-proto") === "https";
}
