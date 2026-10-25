// Fase 03: kleine API-client en DOM-hulpjes voor de canonieke werkbank.
let csrfToken = "";

export function newRequestId() {
  const random = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/[^A-Za-z0-9-]/g, "");
  return "req-" + random;
}

export async function api(path, { method = "GET", body, revision } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrfToken) headers["X-GK-CSRF"] = csrfToken;
  if (revision !== undefined && revision !== null) headers["If-Match"] = '"' + revision + '"';
  const response = await fetch(path, { method, headers, credentials: "same-origin", body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 401) {
    window.location.href = "/login/?next=" + encodeURIComponent("/editor/canoniek.html");
    throw new Error("Niet ingelogd.");
  }
  const data = await response.json().catch(() => ({}));
  if (data.csrfToken) csrfToken = data.csrfToken;
  if (!response.ok) {
    const error = new Error(data.message || "Verzoek mislukt.");
    error.status = response.status;
    error.code = data.code || null;
    error.details = data.details || null;
    throw error;
  }
  return data;
}

export function command(input, revision) {
  return api("/api/authoring/command", { method: "POST", body: Object.assign({ requestId: newRequestId() }, input), revision });
}

export function friendlyError(error) {
  if (error.code === "STALE_REVISION") return "Dit is intussen ergens anders gewijzigd. Klik op Verversen; je wijziging is niet opgeslagen.";
  if (error.code === "REF_MISSING") return "Dit verwijst naar iets dat niet meer bestaat. Kies opnieuw.";
  if (error.code === "REF_IN_USE") return "Kan niet archiveren: nog in gebruik door " + (error.details?.backlinks || []).join(", ") + ".";
  return error.message;
}

export function slug(text) {
  return String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[^a-z]+/, "").slice(0, 60) || "nieuw";
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}
