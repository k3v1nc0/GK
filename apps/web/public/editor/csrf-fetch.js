// Eén sessietoken voor de viewport en de documentwerkbank.
let token = "";
let refreshPending = null;

export function rememberCsrfToken(data) {
  if (data?.csrfToken) token = data.csrfToken;
}

export function currentCsrfToken() {
  return token;
}

async function refreshToken(send) {
  if (!refreshPending) {
    refreshPending = (async () => {
      const response = await send("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
      const data = await response.clone().json().catch(() => ({}));
      if (response.ok && data.csrfToken) rememberCsrfToken(data);
      else token = "";
      return response;
    })().finally(() => { refreshPending = null; });
  }
  return refreshPending;
}

export async function csrfFetch(path, options = {}, send = fetch) {
  const mutation = ["POST", "PUT", "PATCH", "DELETE"].includes(String(options.method || "GET").toUpperCase());
  if (!mutation) return send(path, options);
  if (!token) {
    const auth = await refreshToken(send);
    if (!auth.ok) return auth;
  }
  const request = () => {
    const headers = new Headers(options.headers || {});
    headers.set("X-GK-CSRF", token);
    return send(path, { ...options, credentials: "same-origin", headers: Object.fromEntries(headers) });
  };
  const sentToken = token;
  const response = await request();
  if (response.status !== 403) return response;
  const error = await response.clone().json().catch(() => ({}));
  if (error.code !== "CSRF_FORBIDDEN") return response;
  // De server heeft deze mutatie vóór uitvoering geweigerd: eenmaal opnieuw is veilig.
  if (token === sentToken) {
    const auth = await refreshToken(send);
    if (!auth.ok) return auth;
  }
  return request();
}
