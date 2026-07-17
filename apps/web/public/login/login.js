const form = document.querySelector("#accountForm");
const statusText = document.querySelector("#statusText");
const sessionCard = document.querySelector("#sessionCard");
const currentUserText = document.querySelector("#currentUserText");
const currentSessionText = document.querySelector("#currentSessionText");
const continueLink = document.querySelector("#continueLink");
const logoutButton = document.querySelector("#logoutButton");
const nextTarget = resolveNextTarget();

function resolveNextTarget() {
  const search = new URLSearchParams(window.location.search);
  const next = String(search.get("next") || "/game/").trim();
  return next.startsWith("/") ? next : "/game/";
}

function setStatus(message, state = "error") {
  statusText.textContent = message || "";
  statusText.dataset.state = state;
}

function deviceLabel() {
  const label = String(window.navigator.userAgent || "").trim();
  return label ? label.slice(0, 120) : null;
}

function renderSession(data) {
  if (!data || !data.user) {
    sessionCard.classList.add("hidden");
    return;
  }
  const session = data.session || {};
  const player = data.player || null;
  const position = data.position || null;
  currentUserText.textContent = data.user.username || data.user.email || data.user.id;
  const sessionParts = [
    data.user.role || "player",
    session.deviceLabel || "unknown device",
    player ? player.displayName : "no player profile yet",
    position ? "pos " + [position.x, position.y, position.z].map((value) => Number(value).toFixed(2)).join(", ") : "no position"
  ];
  currentSessionText.textContent = sessionParts.join(" | ");
  continueLink.href = nextTarget;
  sessionCard.classList.remove("hidden");
}

async function requestAuthMe() {
  try {
    const response = await fetch("/api/auth/me", { headers: { Accept: "application/json" } });
    if (response.status === 401) {
      sessionCard.classList.add("hidden");
      return;
    }
    if (!response.ok) {
      setStatus("Sessie kon niet worden geladen.");
      return;
    }
    renderSession(await response.json());
  } catch {
    setStatus("Netwerkfout tijdens het lezen van de sessie.");
  }
}

async function submitAccount(event) {
  event.preventDefault();
  const submitter = event.submitter || document.activeElement;
  const action = submitter?.dataset?.action === "register" ? "register" : "login";
  const data = new FormData(form);
  const identifier = String(data.get("identifier") || "").trim();
  const password = String(data.get("password") || "");
  if (!identifier || !password) {
    setStatus("Vul gebruikersnaam/e-mail en wachtwoord in.");
    return;
  }
  setStatus(action === "register" ? "Registreren..." : "Inloggen...", "success");
  const response = await fetch(action === "register" ? "/api/auth/register" : "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password, deviceLabel: deviceLabel() })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    setStatus(result.message || (action === "register" ? "Registratie mislukt." : "Login mislukt."));
    return;
  }
  setStatus(action === "register" ? "Registratie gelukt." : "Login gelukt.", "success");
  if (action === "register") {
    window.location.href = "/game/";
    return;
  }
  const target = nextTarget || "/game/";
  window.location.href = target;
}

async function logout() {
  logoutButton.disabled = true;
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Logout blijft client-side bruikbaar, ook als de network call faalt.
  } finally {
    logoutButton.disabled = false;
    sessionCard.classList.add("hidden");
    setStatus("Uitgelogd.", "success");
    await requestAuthMe();
  }
}

form.addEventListener("submit", submitAccount);
logoutButton.addEventListener("click", logout);
requestAuthMe();
