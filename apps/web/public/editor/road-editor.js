// 🛣️ Weg (8-11): het wegennet bewerken in de 3D-view. Eigen gereedschap, los van de andere vlakken.
// Eén Weg in het spel: punten en lijnen; aan een punt kunnen zoveel lijnen als je wilt (T-splitsing, kruising).
// Toetsen zoals in Blender: F = punt/lijn erbij of vastmaken, G/R/T = schuiven/draaien/schalen, Del = weg,
// Ctrl+C/V = kopiëren/plakken, Ctrl+D = dupliceren, Ctrl+A = alles, Ctrl+J = andere Wegen erbij.
// Wijzigingen staan meteen in beeld; opslaan (met Ctrl+Z) loopt op de achtergrond, één tegelijk.
import { areaRoadLinks } from "../shared/area-soorten.js?v=20261108-roads7";
import { roadAddPoint, roadClip, roadConnect, roadDelete, roadDuplicate, roadHasLink, roadMerge, roadParts, roadPaste, roadSplitLink } from "../shared/road-network.js?v=20261108-roads5";

const toNet = (body) => ({ points: (body?.pointsMm || []).map((p) => ({ x: p[0] / 1000, z: p[1] / 1000 })), links: areaRoadLinks(body) });
const toBody = (body, net) => {
  const next = Object.assign({}, body, { pointsMm: net.points.map((p) => [Math.round(p.x * 1000), Math.round(p.z * 1000)]), links: net.links.map((link) => link.slice()) });
  delete next.settings;
  return next;
};
const letter = (event) => (String(event.code || "").startsWith("Key") ? event.code.slice(3).toLowerCase() : String(event.key || "").toLowerCase());
const centerOf = (points) => ({ x: points.reduce((s, p) => s + p.x, 0) / points.length, z: points.reduce((s, p) => s + p.z, 0) / points.length });

// deps: runtime(), roadDocs() (actieve Weg-documenten, gekozen eerst), isActive(), select(docKey), save(doc, body, label),
// setStatus(text, kind), groundAt(clientX, clientY), lastPointer(), suppressClick(), canvasTarget(event), entityAtPointer(), archive(docKey).
export function createRoadEditor(deps) {
  let net = null;
  let netKey = null;
  let netRevision = null;
  let selPoints = [];
  let selLinks = [];
  let session = null;
  let placement = null;
  let press = null;
  let emptyPress = null;
  let clipboard = null;
  let saving = false;
  let dirty = false;
  let pendingLabel = "";

  const roadDoc = () => deps.roadDocs()[0] || null;
  const active = () => Boolean(net && deps.isActive());
  const runtime = () => deps.runtime();
  const pick = (x, y, options) => runtime()?.pickRoadEditor?.(x, y, 14, options) || null;
  const mouseGround = () => { const p = deps.lastPointer(); return p ? deps.groundAt(p.clientX, p.clientY) : null; };

  function sync() {
    const doc = roadDoc();
    if (!doc) { net = null; netKey = null; selPoints = []; selLinks = []; session = null; placement = null; render(); return; }
    if (!saving && !dirty && !session && !placement && (doc.docKey !== netKey || doc.revision !== netRevision)) {
      net = toNet(doc.body);
      netKey = doc.docKey;
      netRevision = doc.revision;
      selPoints = selPoints.filter((i) => i < net.points.length);
      selLinks = selLinks.filter((k) => k < net.links.length);
    }
    render();
  }

  // Alleen opnieuw tekenen als er echt iets veranderd is (render wordt vaak aangeroepen).
  let last = null;
  function render() {
    const shown = session?.preview || net;
    const now = { rt: runtime(), shown, selPoints, selLinks, on: active() };
    if (last && Object.keys(now).every((key) => now[key] === last[key])) return;
    last = now;
    now.rt?.setRoadEditorOverlay?.(shown ? { points: shown.points, links: shown.links, selectedPoints: selPoints, selectedLinks: selLinks, active: now.on } : null);
  }

  function summary(prefix) {
    if (!net) return;
    const parts = roadParts(net);
    const others = deps.roadDocs().length - 1;
    const text = (prefix ? "🛣️ " + prefix + " · " : "🛣️ Weg · ") + net.points.length + " punten, " + net.links.length + (net.links.length === 1 ? " lijn" : " lijnen")
      + (selPoints.length ? " · " + selPoints.length + " punt(en) gekozen" : "") + (selLinks.length ? " · " + selLinks.length + " lijn(en) gekozen" : "")
      + (parts > 1 ? " · ⚠️ " + parts + " losse delen: kies een punt van elk deel en druk F" : "")
      + (others > 0 ? " · Er " + (others === 1 ? "is nog 1 andere Weg" : "zijn nog " + others + " andere Wegen") + ": Ctrl+J voegt ze hierbij" : "");
    deps.setStatus(text, "");
  }

  function hint() {
    summary(null);
  }

  async function flush() {
    if (saving) return;
    saving = true;
    let failed = false;
    try {
      while (dirty) {
        dirty = false;
        const doc = roadDoc();
        if (!doc) break;
        try { await deps.save(doc, toBody(doc.body, net), "Weg · " + pendingLabel); } catch { failed = true; break; }
        netRevision = roadDoc()?.revision ?? netRevision;
      }
    } finally {
      saving = false;
    }
    if (failed) { dirty = false; netRevision = null; sync(); }
  }

  function commit(next, label, select = null) {
    if (next.points.length < 2) { deps.setStatus("Een Weg heeft minstens 2 punten. De hele Weg weghalen kan in de Bibliotheek.", "error"); return false; }
    net = next;
    if (select) { selPoints = select.points || []; selLinks = select.links || []; }
    dirty = true;
    pendingLabel = label;
    render();
    summary(label);
    void flush();
    return true;
  }

  // ---------- schuiven, draaien, schalen ----------
  function sessionIndices() {
    const set = new Set(selPoints);
    for (const k of selLinks) for (const i of net.links[k] || []) set.add(i);
    return [...set];
  }

  function startSession(kind, pointerId = null, start = null, base = null) {
    const indices = sessionIndices();
    if (!indices.length) { deps.setStatus("Kies eerst een of meer punten (klik, Shift+klik voor meer).", "error"); return false; }
    if (kind !== "move" && indices.length < 2) { deps.setStatus("Draaien en schalen gaat met 2 of meer punten.", "error"); return false; }
    const ground = start || mouseGround();
    if (!ground) { deps.setStatus("Geen grond onder de muis.", "error"); return false; }
    const center = centerOf(indices.map((i) => net.points[i]));
    session = { kind, pointerId, indices, startNet: net, baseNet: base || net, start: ground, center, axis: null, preview: net,
      startAngle: Math.atan2(ground.z - center.z, ground.x - center.x), startDistance: Math.max(0.01, Math.hypot(ground.x - center.x, ground.z - center.z)) };
    deps.setStatus({ move: "Schuiven", rotate: "Draaien", scale: "Schalen" }[kind] + ": beweeg de muis. Klik of Enter = klaar, Esc = terug" + (kind === "move" ? ", X/Y = as vast" : "") + ".", "");
    render();
    return true;
  }

  function updateSession(clientX, clientY) {
    if (!session) return;
    const ground = deps.groundAt(clientX, clientY);
    if (!ground) return;
    const { startNet, indices, center, start } = session;
    const points = startNet.points.slice();
    if (session.kind === "move") {
      const dx = session.axis === "y" ? 0 : ground.x - start.x;
      const dz = session.axis === "x" ? 0 : ground.z - start.z;
      for (const i of indices) points[i] = { x: startNet.points[i].x + dx, z: startNet.points[i].z + dz };
    } else if (session.kind === "rotate") {
      const angle = Math.atan2(ground.z - center.z, ground.x - center.x) - session.startAngle;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      for (const i of indices) {
        const x = startNet.points[i].x - center.x, z = startNet.points[i].z - center.z;
        points[i] = { x: center.x + x * cos - z * sin, z: center.z + x * sin + z * cos };
      }
    } else {
      const factor = Math.hypot(ground.x - center.x, ground.z - center.z) / session.startDistance;
      for (const i of indices) points[i] = { x: center.x + (startNet.points[i].x - center.x) * factor, z: center.z + (startNet.points[i].z - center.z) * factor };
    }
    session.preview = { points, links: startNet.links };
    session.moved = true;
    render();
  }

  function confirmSession(clientX, clientY) {
    if (!session) return;
    const done = session;
    session = null;
    let next = done.preview;
    let select = { points: selPoints, links: selLinks };
    let label = { move: "geschoven", rotate: "gedraaid", scale: "geschaald" }[done.kind];
    // Eén punt op een ander punt laten vallen = één punt (knooppunt); op een lijn = punt in die lijn (T-splitsing).
    if (done.kind === "move" && done.indices.length === 1 && Number.isFinite(clientX)) {
      const moved = done.indices[0];
      const hit = pick(clientX, clientY, { exclude: [moved] });
      if (hit?.kind === "point") {
        const merged = roadMerge(next, moved, hit.index);
        next = merged.net;
        select = { points: [merged.index], links: [] };
        label = "vastgeklikt aan een punt";
      } else if (hit?.kind === "link" && !next.links[hit.index].includes(moved)) {
        const [a, b] = next.links[hit.index];
        next = { points: next.points, links: next.links.filter((_, k) => k !== hit.index).concat([[a, moved], [moved, b]]) };
        select = { points: [moved], links: [] };
        label = "vastgeklikt op een lijn";
      }
    }
    if (!done.moved && done.baseNet === done.startNet) { render(); hint(); return; }
    commit(next, label, select);
  }

  function cancelSession() {
    if (!session) return;
    net = session.baseNet;
    if (session.baseNet !== session.startNet) { selPoints = []; selLinks = []; }
    session = null;
    render();
    hint();
  }

  // ---------- F: punt erbij, lijn erbij, vastmaken ----------
  function armAddOrConnect() {
    if (selPoints.length >= 2) {
      const result = roadConnect(net, selPoints);
      if (!result.added) { deps.setStatus("Deze punten zitten al aan elkaar vast.", ""); return; }
      commit(result.net, result.added === 1 ? "punten vastgemaakt" : result.added + " lijnen gemaakt", { points: selPoints, links: [] });
      return;
    }
    press = null;
    emptyPress = null;
    if (!selPoints.length && selLinks.length) {
      placement = { kind: "split", linkIndex: selLinks[0] };
      deps.setStatus("Punt toevoegen klaar. Klik waar het punt op de gekozen lijn moet komen; Esc annuleert.", "");
      return;
    }
    placement = { kind: "add", from: selPoints.length === 1 ? selPoints[0] : null };
    deps.setStatus(placement.from === null
      ? "Los punt toevoegen klaar. Klik om het punt neer te zetten; Esc annuleert."
      : "Punt + lijn toevoegen klaar. Klik om het nieuwe punt neer te zetten; Esc annuleert.", "");
  }

  function placeAddition(clientX, clientY) {
    if (!placement) return false;
    const ground = deps.groundAt(clientX, clientY);
    if (!ground) { deps.setStatus("Geen grond onder de muis. Klik op de grond of druk Esc.", "error"); return false; }
    const pending = placement;
    placement = null;
    if (pending.kind === "split") {
      const k = pending.linkIndex;
      const link = net.links[k];
      if (!link) { hint(); return false; }
      const [a, b] = link;
      const p = net.points[a], q = net.points[b];
      const dx = q.x - p.x, dz = q.z - p.z, length2 = dx * dx + dz * dz || 1;
      const t = Math.max(0.05, Math.min(0.95, ((ground.x - p.x) * dx + (ground.z - p.z) * dz) / length2));
      const at = { x: p.x + dx * t, z: p.z + dz * t };
      const split = roadSplitLink(net, k, at);
      return commit(split.net, "punt in de lijn gezet", { points: [split.index], links: [] });
    }
    const from = Number.isInteger(pending.from) && net.points[pending.from] ? pending.from : null;
    const hit = pick(clientX, clientY, { exclude: from === null ? [] : [from] });
    if (hit?.kind === "point") {
      if (from === null) { selPoints = [hit.index]; selLinks = []; render(); hint(); return true; }
      if (roadHasLink(net, from, hit.index)) { selPoints = [hit.index]; render(); deps.setStatus("Die zitten al aan elkaar vast.", ""); return true; }
      return commit(roadConnect(net, [from, hit.index]).net, "lijn naar een bestaand punt", { points: [hit.index], links: [] });
    }
    if (hit?.kind === "link" && from !== null && !net.links[hit.index].includes(from)) {
      // Lijn naar een bestaande lijn: daar komt een punt in (T-splitsing).
      const split = roadSplitLink(net, hit.index, ground);
      return commit(roadConnect(split.net, [from, split.index]).net, "T-splitsing gemaakt", { points: [split.index], links: [] });
    }
    const added = roadAddPoint(net, ground, from);
    return commit(added.net, from === null ? "los punt gezet" : "punt + lijn erbij", { points: [added.index], links: [] });
  }

  function remove() {
    if (!selPoints.length && !selLinks.length) { deps.setStatus("Kies eerst punten of een lijn om weg te halen.", ""); return; }
    const result = roadDelete(net, selPoints, selLinks);
    commit({ points: result.points, links: result.links }, (selPoints.length ? selPoints.length + " punt(en)" : selLinks.length + " lijn(en)") + " weggehaald", { points: [], links: [] });
  }

  function duplicate() {
    const indices = sessionIndices();
    if (!indices.length) { deps.setStatus("Kies eerst wat je wilt dupliceren.", "error"); return; }
    const base = net;
    const copy = roadDuplicate(net, indices, { x: 0, z: 0 });
    net = copy.net;
    selPoints = copy.indices;
    selLinks = [];
    if (!startSession("move", null, null, base)) { net = base; render(); }
  }

  function paste() {
    if (!clipboard) { deps.setStatus("Nog niets gekopieerd (Ctrl+C).", ""); return; }
    const ground = mouseGround();
    if (!ground) { deps.setStatus("Geen grond onder de muis.", "error"); return; }
    const pasted = roadPaste(net, clipboard, ground);
    commit(pasted.net, clipboard.points.length + " punt(en) geplakt", { points: pasted.indices, links: [] });
  }

  async function joinOthers() {
    const [main, ...others] = deps.roadDocs();
    if (!main || !others.length) { deps.setStatus("Er is maar één Weg.", ""); return; }
    let joined = net;
    for (const doc of others) {
      const extra = toNet(doc.body);
      joined = roadPaste(joined, { points: extra.points, links: extra.links }, { x: 0, z: 0 }).net;
    }
    if (!commit(joined, others.length + " andere Weg(en) hierbij gevoegd")) return;
    for (const doc of others) await deps.archive(doc.docKey);
  }

  function focusSelection() {
    const chosen = sessionIndices();
    const indices = chosen.length ? chosen : net.points.map((_, i) => i);
    const points = indices.map((i) => net.points[i]).filter(Boolean).map((p) => ({ x: p.x, z: p.z }));
    return points.length > 0 && runtime()?.frameWorldPoints?.(points) === true;
  }

  // ---------- toetsen en muis ----------
  function handleKeyDown(event) {
    if (!active()) return false;
    const meta = event.ctrlKey || event.metaKey;
    const key = letter(event);
    const consume = () => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); return true; };
    if (session) {
      if (event.key === "Escape") { cancelSession(); return consume(); }
      if (event.key === "Enter") { const p = deps.lastPointer(); confirmSession(p?.clientX, p?.clientY); return consume(); }
      if (!meta && (key === "x" || key === "y") && session.kind === "move") {
        session.axis = session.axis === key ? null : key;
        const p = deps.lastPointer();
        if (p) updateSession(p.clientX, p.clientY);
        return consume();
      }
      return consume();
    }
    if (!event.altKey && !meta && (event.code === "NumpadDecimal" || event.key === ".")) {
      focusSelection();
      return consume();
    }
    if (placement) {
      if (event.key === "Escape") { placement = null; hint(); return consume(); }
      if (event.key === "Enter") {
        const p = deps.lastPointer();
        if (p) placeAddition(p.clientX, p.clientY);
        else deps.setStatus("Beweeg de muis naar de grond en klik om het punt neer te zetten.", "error");
        return consume();
      }
      if (key === "f") return consume();
      return false;
    }
    if (event.key === "Escape") {
      if (!selPoints.length && !selLinks.length) return false;
      selPoints = []; selLinks = []; render(); hint();
      return consume();
    }
    if (event.key === "Delete" || event.key === "Backspace") { remove(); return consume(); }
    if (meta && !event.altKey) {
      if (key === "a") { selPoints = net.points.map((_, i) => i); selLinks = []; render(); hint(); return consume(); }
      if (key === "c") {
        clipboard = roadClip(net, sessionIndices());
        deps.setStatus(clipboard ? "🛣️ " + clipboard.points.length + " punt(en) gekopieerd. Ctrl+V plakt bij de muis." : "Kies eerst wat je wilt kopiëren.", clipboard ? "" : "error");
        return consume();
      }
      if (key === "v") { paste(); return consume(); }
      if (key === "d") { duplicate(); return consume(); }
      if (key === "j") { void joinOthers(); return consume(); }
      return false;
    }
    if (event.altKey) return false;
    if (key === "d" && event.shiftKey) { duplicate(); return consume(); }
    if (key === "f") { armAddOrConnect(); return consume(); }
    if (key === "g") { startSession("move"); return consume(); }
    if (key === "r") { startSession("rotate"); return consume(); }
    if (key === "t") { startSession("scale"); return consume(); }
    return false;
  }

  function handlePointerDown(event) {
    if (!net || !deps.canvasTarget(event) || event.button !== 0) return false;
    const stop = () => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); deps.suppressClick(); return true; };
    if (session) {
      if (session.pointerId === null) { confirmSession(event.clientX, event.clientY); return stop(); }
      return stop();
    }
    if (placement) { placeAddition(event.clientX, event.clientY); return stop(); }
    const hit = pick(event.clientX, event.clientY);
    if (!active()) {
      if (!hit) return false;
      deps.select(roadDoc().docKey);
      selPoints = hit.kind === "point" ? [hit.index] : [];
      selLinks = hit.kind === "link" ? [hit.index] : [];
      render(); hint();
      return stop();
    }
    if (!hit) { emptyPress = { x: event.clientX, y: event.clientY, entity: deps.entityAtPointer() }; return false; }
    const toggle = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : list.concat([value]));
    if (hit.kind === "point") {
      if (event.shiftKey) selPoints = toggle(selPoints, hit.index);
      else if (!selPoints.includes(hit.index)) { selPoints = [hit.index]; selLinks = []; }
      press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    } else {
      if (event.shiftKey) selLinks = toggle(selLinks, hit.index);
      else { selLinks = [hit.index]; selPoints = []; }
    }
    render(); hint();
    return stop();
  }

  function handlePointerMove(event) {
    if (session) {
      if (session.pointerId === null || session.pointerId === event.pointerId) updateSession(event.clientX, event.clientY);
      return session.pointerId !== null;
    }
    if (press && press.pointerId === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4) {
      const start = deps.groundAt(press.x, press.y);
      press = null;
      if (startSession("move", event.pointerId, start)) updateSession(event.clientX, event.clientY);
      return true;
    }
    return false;
  }

  function handlePointerUp(event) {
    if (session && session.pointerId !== null && session.pointerId === event.pointerId) {
      confirmSession(event.clientX, event.clientY);
      deps.suppressClick();
      return true;
    }
    if (press && press.pointerId === event.pointerId) { press = null; return true; }
    if (emptyPress && active()) {
      const quiet = Math.hypot(event.clientX - emptyPress.x, event.clientY - emptyPress.y) <= 4;
      const onEntity = emptyPress.entity;
      emptyPress = null;
      // Klik op lege grond: alleen de punten loslaten; de Weg blijft gekozen (zo kun je meteen F drukken).
      if (quiet && !onEntity) {
        selPoints = []; selLinks = [];
        deps.suppressClick();
        render(); hint();
      }
    }
    return false;
  }

  return { sync, render, hint, handleKeyDown, handlePointerDown, handlePointerMove, handlePointerUp, isEditing: () => Boolean(session || placement) };
}
