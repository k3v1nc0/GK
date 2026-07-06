import { createGkWorldRuntime } from "../shared/world-runtime.js?v=20260702-resident-streaming";
import { normalizeWorldSettingsPreset, worldSettingsPresetValues } from "../shared/node-types.js?v=20260702-resident-streaming";

const canvas = document.querySelector("#gameCanvas");
const hud = document.querySelector("#hud");
const overlay = document.querySelector("#gameOverlay");
const overlayText = document.querySelector("#overlayText");

let runtime = null;
let lastPublishedAt = null;
let runtimeAntialias = null;

function requestedPerformanceProfile() {
  try {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("gamePerformanceProfile") || params.get("perfProfile") || "";
    return normalizeWorldSettingsPreset(requested, "");
  } catch {
    // Ignore malformed query strings and fall back to the published world profile.
  }
  return "";
}

function showOverlay(text) {
  overlayText.textContent = text;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

async function loadWorld() {
  const response = await fetch("/api/game/world", { headers: { "Accept": "application/json" } });
  if (response.status === 404) {
    showOverlay("Er is nog geen wereld gepubliceerd. Bouw je wereld in de editor en klik op SAVE TO GAME.");
    return false;
  }
  if (!response.ok) {
    showOverlay("Kon de wereld niet laden.");
    return false;
  }
  const world = await response.json();
  lastPublishedAt = world.publishedAt || null;
  const profileOverride = requestedPerformanceProfile();
  if (profileOverride) {
    const overrideValues = worldSettingsPresetValues("game", profileOverride);
    world.world = world.world || {};
    world.world.performance = world.world.performance || {};
    world.world.performance.game = Object.assign({}, world.world.performance.game || {}, overrideValues || {}, { preset: profileOverride });
  }
  const desiredAntialias = world?.world?.performance?.game?.antialias !== false;
  if (runtime && runtimeAntialias !== desiredAntialias) {
    runtime.destroy();
    runtime = null;
    window.__GK_GAME_RUNTIME = null;
  }
  if (!runtime) {
    runtime = createGkWorldRuntime(canvas, {
      mode: "game",
      antialias: desiredAntialias,
      hud: hud,
      onLoadErrors: function (errors) {
        if (errors.length) showHudError(errors[0]);
      }
    });
    window.__GK_GAME_RUNTIME = runtime;
    runtimeAntialias = desiredAntialias;
  }
  runtime.setWorld(world);
  hideOverlay();
  return true;
}

let hudErrorTimer = null;
function showHudError(message) {
  let node = hud.querySelector(".hud-prompt");
  if (!node) return;
  node.textContent = "Asset kon niet laden: " + message;
  node.style.display = "block";
  if (hudErrorTimer) clearTimeout(hudErrorTimer);
  hudErrorTimer = setTimeout(function () { node.style.display = "none"; }, 2500);
}

async function pollVersion() {
  try {
    const response = await fetch("/api/game/version", { headers: { "Accept": "application/json" } });
    if (response.status === 404) {
      if (lastPublishedAt !== null) { lastPublishedAt = null; showOverlay("De gepubliceerde wereld is verwijderd."); }
      return;
    }
    if (!response.ok) return;
    const data = await response.json();
    if (data.publishedAt && data.publishedAt !== lastPublishedAt) {
      await loadWorld();
    }
  } catch {
    // Negeer tijdelijke netwerkfouten tijdens polling.
  }
}

async function start() {
  showOverlay("Laden...");
  const ok = await loadWorld();
  if (!ok) {
    // Keep polling so the game appears automatically once published.
  }
  setInterval(pollVersion, 2500);
}

start();
