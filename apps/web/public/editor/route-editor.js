// Werkbank Fase 10 (Kevin 16-11): de route van één NPC (lopen) of één vliegend model (vogels, draak), net als de 🛣️ Weg.
// Kies de NPC of het model in de 3D-view (met "Loopt een route" of "Vliegt: een route"). Dan:
// F = punten tekenen (klik, klik, klik; Esc of Enter = klaar), klik een punt = kiezen, slepen of G = schuiven,
// G en dan Z = hoogte (muis op en neer), X/Y = as vast, Del = punt weg, Esc = punt loslaten.
// Per punt (in het paneel): aan de grond of een hoogte, hoe lang hij daar wacht en welke animatie hij dan speelt.
export const ROUTE_MAX_POINTS = 64;

const letter = (event) => (String(event.code || "").startsWith("Key") ? event.code.slice(3).toLowerCase() : String(event.key || "").toLowerCase());
const round2 = (value) => Math.round(Number(value) * 100) / 100;
const round1 = (value) => Math.round(Number(value) * 10) / 10;
const hasHeight = (point) => Number.isFinite(Number(point?.h));

// Een routepunt zoals het in de kaart staat: { x, z } en alleen wat afwijkt (h = hoogte boven de grond, waitS, clip).
export function cleanRoutePoint(point) {
  const out = { x: round2(point.x), z: round2(point.z) };
  if (hasHeight(point)) out.h = Math.max(0, Math.min(300, round1(point.h)));
  if (Number(point.waitS) > 0) out.waitS = Math.min(600, round1(point.waitS));
  if (point.clip) out.clip = String(point.clip).slice(0, 120);
  return out;
}

// deps: runtime(), target() -> { doc, kind, key (veldnaam), loop, label } of null, save(doc, body, label), setStatus(text, kind),
// groundAt(clientX, clientY), lastPointer(), suppressClick(), canvasTarget(event), highlight(index).
export function createRouteEditor(deps) {
  let points = [];
  let docKey = null;
  let revision = null;
  let selected = -1;
  let session = null;
  let drawing = false;
  let press = null;
  let saving = false;
  let dirty = false;
  let pendingLabel = "";

  const runtime = () => deps.runtime();
  const target = () => deps.target() || null;
  const active = () => Boolean(target());
  const pick = (x, y) => { const index = runtime()?.pickRouteEditor?.(x, y, 14); return Number.isInteger(index) ? index : -1; };
  const mouseGround = () => { const p = deps.lastPointer(); return p ? deps.groundAt(p.clientX, p.clientY) : null; };

  function sync() {
    const t = target();
    if (!t) { points = []; docKey = null; revision = null; selected = -1; session = null; drawing = false; render(); return; }
    if (!saving && !dirty && !session && (t.doc.docKey !== docKey || t.doc.revision !== revision)) {
      if (t.doc.docKey !== docKey) { selected = -1; drawing = false; }
      points = (Array.isArray(t.doc.body?.[t.key]) ? t.doc.body[t.key] : []).map((p) => Object.assign({}, p));
      docKey = t.doc.docKey;
      revision = t.doc.revision;
      if (selected >= points.length) selected = -1;
    }
    render();
  }

  let last = null;
  function render() {
    const t = target();
    const shown = session?.preview || points;
    const now = { rt: runtime(), shown, selected, loop: t?.loop === true, on: Boolean(t) };
    if (last && Object.keys(now).every((key) => now[key] === last[key])) return;
    last = now;
    now.rt?.setRouteEditorOverlay?.(t && shown.length ? { points: shown, selected, loop: now.loop, active: true } : null);
    deps.highlight?.(selected);
  }

  function hint(prefix) {
    const t = target();
    if (!t) return;
    const text = "🛣️ " + (prefix ? prefix + " · " : "Route · ") + points.length + (points.length === 1 ? " punt" : " punten")
      + (selected >= 0 ? " · punt " + (selected + 1) + " gekozen (G = schuiven, G en Z = hoogte, Del = weg)" : "")
      + (points.length ? "" : " · druk F en klik op de grond om de route te tekenen")
      + (drawing ? " · klik = punt erbij, Esc of Enter = klaar" : points.length ? " · F = punten erbij" : "");
    deps.setStatus(text, "");
  }

  async function flush() {
    if (saving) return;
    saving = true;
    let failed = false;
    try {
      while (dirty) {
        dirty = false;
        const t = target();
        if (!t) break;
        const body = Object.assign({}, t.doc.body);
        if (points.length) body[t.key] = points.map(cleanRoutePoint); else delete body[t.key];
        try { await deps.save(t.doc, body, (t.label || "Route") + " · " + pendingLabel); } catch { failed = true; break; }
        revision = target()?.doc?.revision ?? revision;
      }
    } finally {
      saving = false;
    }
    if (failed) { dirty = false; revision = null; sync(); }
  }

  function commit(next, label, select = selected) {
    points = next;
    selected = select;
    dirty = true;
    pendingLabel = label;
    render();
    hint(label);
    void flush();
  }

  // Van buiten (een rij in het paneel aangeklikt): dat punt kiezen.
  function selectPoint(index) {
    if (!active() || !Number.isInteger(index) || !points[index]) return;
    selected = index;
    render();
    hint();
    const p = points[index];
    runtime()?.frameWorldPoints?.([{ x: p.x, z: p.z }]);
  }

  // ---------- schuiven en hoogte ----------
  function startSession(pointerId = null, start = null) {
    if (selected < 0 || !points[selected]) return false;
    const ground = start || mouseGround();
    if (!ground) { deps.setStatus("Geen grond onder de muis.", "error"); return false; }
    const pointer = deps.lastPointer();
    session = { pointerId, start: ground, startPoints: points, axis: null, startY: pointer?.clientY ?? 0, preview: points, moved: false };
    deps.setStatus("Punt " + (selected + 1) + " schuiven: beweeg de muis. Klik of Enter = klaar, Esc = terug, X/Y = as vast, Z = hoogte.", "");
    render();
    return true;
  }

  // Hoeveel schermpixels één meter omhoog is bij dit punt (voor G en dan Z).
  function pixelsPerMeter(point) {
    const rt = runtime();
    const ground = Number(rt?.terrainHeightAt?.(point.x, point.z)) || 0;
    const base = ground + (hasHeight(point) ? Number(point.h) : 0);
    const a = rt?.worldToScreen?.({ x: point.x, y: base, z: point.z });
    const b = rt?.worldToScreen?.({ x: point.x, y: base + 1, z: point.z });
    const ppm = a && b ? Math.abs(a.y - b.y) : 0;
    return ppm > 0.5 ? ppm : 20;
  }

  function updateSession(clientX, clientY) {
    if (!session) return;
    const from = session.startPoints[selected];
    const next = session.startPoints.slice();
    if (session.axis === "z") {
      const ppm = session.ppm || (session.ppm = pixelsPerMeter(from));
      const h = Math.max(0, Math.min(300, (hasHeight(from) ? Number(from.h) : 0) + (session.startY - clientY) / ppm));
      next[selected] = Object.assign({}, from, { h: round1(h) });
    } else {
      const ground = deps.groundAt(clientX, clientY);
      if (!ground) return;
      const dx = session.axis === "y" ? 0 : ground.x - session.start.x;
      const dz = session.axis === "x" ? 0 : ground.z - session.start.z;
      next[selected] = Object.assign({}, from, { x: from.x + dx, z: from.z + dz });
    }
    session.preview = next;
    session.moved = true;
    render();
  }

  function confirmSession() {
    if (!session) return;
    const done = session;
    session = null;
    if (!done.moved) { render(); hint(); return; }
    commit(done.preview, done.axis === "z" ? "punt " + (selected + 1) + " hoogte " + done.preview[selected].h + " m" : "punt " + (selected + 1) + " geschoven");
  }

  function cancelSession() {
    if (!session) return;
    session = null;
    render();
    hint();
  }

  // ---------- F: punten tekenen ----------
  function placePoint(clientX, clientY) {
    const ground = deps.groundAt(clientX, clientY);
    if (!ground) { deps.setStatus("Geen grond onder de muis. Klik op de grond, of Esc = klaar.", "error"); return; }
    if (points.length >= ROUTE_MAX_POINTS) { drawing = false; deps.setStatus("Een route heeft hooguit " + ROUTE_MAX_POINTS + " punten.", "error"); return; }
    // Het nieuwe punt komt na het gekozen punt (of aan het eind) en neemt zijn hoogte over; het eerste punt staat aan de grond.
    const after = selected >= 0 ? selected : points.length - 1;
    const previous = points[after] || null;
    const point = { x: ground.x, z: ground.z };
    if (previous && hasHeight(previous)) point.h = Number(previous.h);
    const next = points.slice();
    next.splice(after + 1, 0, point);
    commit(next, "punt " + (after + 2) + " erbij", after + 1);
  }

  function remove() {
    if (selected < 0) return false;
    const next = points.filter((_, i) => i !== selected);
    const label = "punt " + (selected + 1) + " weggehaald";
    commit(next, label, next.length ? Math.min(selected, next.length - 1) : -1);
    return true;
  }

  // ---------- toetsen en muis ----------
  function handleKeyDown(event) {
    if (!active()) return false;
    const meta = event.ctrlKey || event.metaKey;
    const key = letter(event);
    const consume = () => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); return true; };
    if (session) {
      if (event.key === "Escape") { cancelSession(); return consume(); }
      if (event.key === "Enter") { confirmSession(); return consume(); }
      if (!meta && (key === "x" || key === "y" || key === "z")) {
        // Elke as-wissel gaat verder vanaf waar het punt nu staat.
        session.axis = session.axis === key ? null : key;
        session.ppm = 0;
        session.startPoints = session.preview;
        session.start = mouseGround() || session.start;
        const p = deps.lastPointer();
        session.startY = p?.clientY ?? session.startY;
        return consume();
      }
      return consume();
    }
    if (drawing) {
      if (event.key === "Escape" || event.key === "Enter") { drawing = false; hint("klaar met tekenen"); return consume(); }
      if (key === "f") return consume();
    }
    if (meta || event.altKey) return false;
    if (key === "f") { drawing = true; hint("tekenen"); return consume(); }
    if (selected < 0) return false;
    if (event.key === "Escape") { selected = -1; render(); hint(); return consume(); }
    if (event.key === "Delete" || event.key === "Backspace") { remove(); return consume(); }
    if (key === "g") { startSession(); return consume(); }
    return false;
  }

  function handlePointerDown(event) {
    if (!active() || !deps.canvasTarget(event) || event.button !== 0) return false;
    const stop = () => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); deps.suppressClick(); return true; };
    if (session) {
      if (session.pointerId === null) confirmSession();
      return stop();
    }
    const hit = pick(event.clientX, event.clientY);
    if (hit >= 0) {
      selected = hit;
      press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      render();
      hint();
      return stop();
    }
    if (drawing) { placePoint(event.clientX, event.clientY); return stop(); }
    return false;
  }

  function handlePointerMove(event) {
    if (session) {
      if (session.pointerId === null || session.pointerId === event.pointerId) updateSession(event.clientX, event.clientY);
      return session.pointerId !== null;
    }
    if (press && press.pointerId === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4) {
      const start = deps.groundAt(press.x, press.y);
      press = null;
      if (startSession(event.pointerId, start)) updateSession(event.clientX, event.clientY);
      return true;
    }
    return false;
  }

  function handlePointerUp(event) {
    if (session && session.pointerId !== null && session.pointerId === event.pointerId) {
      confirmSession();
      deps.suppressClick();
      return true;
    }
    if (press && press.pointerId === event.pointerId) { press = null; return true; }
    return false;
  }

  return { sync, render, hint, selectPoint, handleKeyDown, handlePointerDown, handlePointerMove, handlePointerUp, isEditing: () => Boolean(session || drawing) };
}
