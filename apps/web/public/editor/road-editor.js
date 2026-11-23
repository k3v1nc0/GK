// 🛣️ Weg (8-11): het wegennet bewerken in de 3D-view. Eigen gereedschap, los van de andere vlakken.
// Eén Weg in het spel: punten en lijnen; aan een punt kunnen zoveel lijnen als je wilt (T-splitsing, kruising).
// Toetsen zoals in Blender: F = punt/lijn erbij of vastmaken, G/R/T = schuiven/draaien/schalen, Del = weg,
// Ctrl+C/V = kopiëren/plakken, Ctrl+D = dupliceren, Ctrl+A = alles, Ctrl+J = andere Wegen erbij.
// Wijzigingen staan meteen in beeld; opslaan (met Ctrl+Z) loopt op de achtergrond, één tegelijk.
// Kevin 23-11 (2): hetzelfde gereedschap bewerkt ook een 🧱 Muur (deps.channel "wall", eigen toNet/toBody): de soort per
// lijn (muur, deur, raam, open) is het derde getal van een lijn en gaat mee bij alles (setLinkKind zet hem).
import { areaRoadLinks } from "../shared/area-soorten.js?v=20261123-muur14";
import { roadAddPoint, roadClip, roadConnect, roadDelete, roadDissolve, roadDuplicate, roadChainOrder, roadHasLink, roadInsertChain, roadMerge, roadParts, roadPaste, roadSplitLink } from "../shared/road-network.js?v=20261123-muur14";

const toRoadNet = (body) => ({ points: (body?.pointsMm || []).map((p) => ({ x: p[0] / 1000, z: p[1] / 1000 })), links: areaRoadLinks(body) });
const toRoadBody = (body, net) => {
  const next = Object.assign({}, body, { pointsMm: net.points.map((p) => [Math.round(p.x * 1000), Math.round(p.z * 1000)]), links: net.links.map((link) => link.slice()) });
  delete next.settings;
  return next;
};
const letter = (event) => (String(event.code || "").startsWith("Key") ? event.code.slice(3).toLowerCase() : String(event.key || "").toLowerCase());
const centerOf = (points) => ({ x: points.reduce((s, p) => s + p.x, 0) / points.length, z: points.reduce((s, p) => s + p.z, 0) / points.length });

// deps: runtime(), roadDocs() (actieve Weg-documenten, gekozen eerst), isActive(), select(docKey), save(doc, body, label),
// setStatus(text, kind), groundAt(clientX, clientY), lastPointer(), suppressClick(), canvasTarget(event), entityAtPointer(), archive(docKey).
export function createRoadEditor(deps) {
  const channel = deps.channel || "road";
  const name = deps.label || "Weg";
  const icon = deps.icon || "🛣️";
  const toNet = deps.toNet || toRoadNet;
  const toBody = deps.toBody || toRoadBody;
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
  const pick = (x, y, options) => runtime()?.pickRoadEditor?.(x, y, 14, Object.assign({ channel }, options || {})) || null;
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
    now.rt?.setRoadEditorOverlay?.(shown ? { points: shown.points, links: shown.links, selectedPoints: selPoints, selectedLinks: selLinks, active: now.on } : null, channel);
  }

  function summary(prefix) {
    if (!net) return;
    const parts = roadParts(net);
    const others = deps.roadDocs().length - 1;
    const text = (prefix ? icon + " " + prefix + " · " : icon + " " + name + " · ") + net.points.length + " punten, " + net.links.length + (net.links.length === 1 ? " lijn" : " lijnen")
      + (selPoints.length ? " · " + selPoints.length + " punt(en) gekozen" : "") + (selLinks.length ? " · " + selLinks.length + " lijn(en) gekozen" : "")
      + (parts > 1 ? " · ⚠️ " + parts + " losse delen: kies een punt van elk deel en druk F" : "")
      + (channel === "wall" && selLinks.length ? " · Muur, Deur, Raam of Open: kaart, onder ⚙️ meer · Ctrl+C op een deur/raam, dan Ctrl+V op een muur = dezelfde erin · G G = punt langs de lijn · Ctrl+X = punt weg, lijn blijft" : "")
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
        try { await deps.save(doc, toBody(doc.body, net), name + " · " + pendingLabel); } catch { failed = true; break; }
        netRevision = roadDoc()?.revision ?? netRevision;
      }
    } finally {
      saving = false;
    }
    if (failed) { dirty = false; netRevision = null; sync(); }
  }

  function commit(next, label, select = null) {
    if (next.points.length < 2) { deps.setStatus("Een " + name + " heeft minstens 2 punten. De hele " + name + " weghalen kan in de Bibliotheek.", "error"); return false; }
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
    // Alleen de twee punten van een lijn; het derde getal is de soort (deur, raam ...), geen punt.
    for (const k of selLinks) for (const i of (net.links[k] || []).slice(0, 2)) set.add(i);
    return [...set];
  }

  function startSession(kind, pointerId = null, start = null, base = null) {
    const indices = sessionIndices();
    if (!indices.length) { deps.setStatus("Kies eerst een of meer punten (klik, Shift+klik voor meer).", "error"); return false; }
    if (kind !== "move" && indices.length < 2) { deps.setStatus("Draaien en schalen gaat met 2 of meer punten.", "error"); return false; }
    const ground = start || mouseGround();
    if (!ground) { deps.setStatus("Geen grond onder de muis.", "error"); return false; }
    const center = centerOf(indices.map((i) => net.points[i]));
    session = { kind, pointerId, indices, startNet: net, baseNet: base || net, start: ground, center, axis: null, slide: null, preview: net,
      startAngle: Math.atan2(ground.z - center.z, ground.x - center.x), startDistance: Math.max(0.01, Math.hypot(ground.x - center.x, ground.z - center.z)) };
    deps.setStatus({ move: "Schuiven", rotate: "Draaien", scale: "Schalen" }[kind] + ": beweeg de muis. Klik of Enter = klaar, Esc = terug" + (kind === "move" ? ", X/Y = as vast, nog een keer G = langs de lijn" : "") + ".", "");
    render();
    return true;
  }

  // Kevin 23-11 (8): GG zoals in Blender: de gekozen punten schuiven alleen langs hun lijn, zodat de muur recht blijft.
  // Richting: de gekozen lijn, anders de lijn tussen de twee buren van het punt (of de enige lijn eraan).
  // Grens: niet voorbij (en niet op) een buurpunt dat op die lijn ligt.
  function slideAxis(indices) {
    const { points, links } = session.startNet;
    const chosen = new Set(indices);
    const dirOf = (a, b) => { const p = points[a], q = points[b]; const l = Math.hypot(q.x - p.x, q.z - p.z); return l > 0.001 ? { ux: (q.x - p.x) / l, uz: (q.z - p.z) / l } : null; };
    let dir = null;
    const own = selLinks.map((k) => links[k]).find((link) => link && chosen.has(link[0]) && chosen.has(link[1]))
      || links.find((link) => chosen.has(link[0]) && chosen.has(link[1]));
    if (own) dir = dirOf(own[0], own[1]);
    if (!dir) {
      const near = links.filter((link) => chosen.has(link[0]) !== chosen.has(link[1])).map((link) => (chosen.has(link[0]) ? link[1] : link[0]));
      dir = near.length === 2 ? dirOf(near[0], near[1]) : near.length ? dirOf(indices[0], near[0]) : null;
    }
    if (!dir) return null;
    let min = -Infinity, max = Infinity;
    for (const link of links) {
      if (chosen.has(link[0]) === chosen.has(link[1])) continue;
      const i = chosen.has(link[0]) ? link[0] : link[1];
      const j = i === link[0] ? link[1] : link[0];
      const d = (points[j].x - points[i].x) * dir.ux + (points[j].z - points[i].z) * dir.uz;
      if (d > 0.05) max = Math.min(max, d - 0.05);
      else if (d < -0.05) min = Math.max(min, d + 0.05);
    }
    return { ux: dir.ux, uz: dir.uz, min, max };
  }

  function updateSession(clientX, clientY) {
    if (!session) return;
    const ground = deps.groundAt(clientX, clientY);
    if (!ground) return;
    const { startNet, indices, center, start } = session;
    const points = startNet.points.slice();
    if (session.kind === "move" && session.slide) {
      // GG: langs de lijn, niet voorbij de buurpunten.
      const { ux, uz, min, max } = session.slide;
      const shift = Math.max(min, Math.min(max, (ground.x - start.x) * ux + (ground.z - start.z) * uz));
      for (const i of indices) points[i] = { x: startNet.points[i].x + ux * shift, z: startNet.points[i].z + uz * shift };
    } else if (session.kind === "move") {
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
    let label = done.slide ? "langs de lijn geschoven" : { move: "geschoven", rotate: "gedraaid", scale: "geschaald" }[done.kind];
    // Eén punt op een ander punt laten vallen = één punt (knooppunt); op een lijn = punt in die lijn (T-splitsing).
    if (done.kind === "move" && !done.slide && done.indices.length === 1 && Number.isFinite(clientX)) {
      const moved = done.indices[0];
      const hit = pick(clientX, clientY, { exclude: [moved] });
      if (hit?.kind === "point") {
        const merged = roadMerge(next, moved, hit.index);
        next = merged.net;
        select = { points: [merged.index], links: [] };
        label = "vastgeklikt aan een punt";
      } else if (hit?.kind === "link" && !next.links[hit.index].slice(0, 2).includes(moved)) {
        const link = next.links[hit.index];
        const [a, b] = link;
        const keep = (p, q) => (link.length > 2 ? [p, q, link[2]] : [p, q]);
        next = { points: next.points, links: next.links.filter((_, k) => k !== hit.index).concat([keep(a, moved), keep(moved, b)]) };
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
      // Kevin 23-11 (4): klik je op een (andere) lijn, dan komt het punt daar; de twee helften blijven gekozen, zodat
      // je meteen weer F kunt drukken voor het volgende punt (niet eerst de muur opnieuw aanklikken).
      const under = pick(clientX, clientY);
      const k = under?.kind === "link" ? under.index : pending.linkIndex;
      const link = net.links[k];
      if (!link) { hint(); return false; }
      const [a, b] = link;
      const p = net.points[a], q = net.points[b];
      const dx = q.x - p.x, dz = q.z - p.z, length2 = dx * dx + dz * dz || 1;
      let t = Math.max(0.05, Math.min(0.95, ((ground.x - p.x) * dx + (ground.z - p.z) * dz) / length2));
      // Kevin 23-11 (8): wijs je in de buurt van het midden (25 cm), dan komt het punt precies in het midden.
      if (Math.abs(t - 0.5) * Math.sqrt(length2) <= 0.25) t = 0.5;
      const at = { x: p.x + dx * t, z: p.z + dz * t };
      const split = roadSplitLink(net, k, at);
      const count = split.net.links.length;
      return commit(split.net, "punt in de lijn gezet (F = nog een punt)", { points: [], links: [count - 2, count - 1] });
    }
    const from = Number.isInteger(pending.from) && net.points[pending.from] ? pending.from : null;
    const hit = pick(clientX, clientY, { exclude: from === null ? [] : [from] });
    if (hit?.kind === "point") {
      if (from === null) { selPoints = [hit.index]; selLinks = []; render(); hint(); return true; }
      if (roadHasLink(net, from, hit.index)) { selPoints = [hit.index]; render(); deps.setStatus("Die zitten al aan elkaar vast.", ""); return true; }
      return commit(roadConnect(net, [from, hit.index]).net, "lijn naar een bestaand punt", { points: [hit.index], links: [] });
    }
    if (hit?.kind === "link" && from !== null && !net.links[hit.index].slice(0, 2).includes(from)) {
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

  // Kevin 23-11 (8): Ctrl+X = punt weg, de lijn blijft (zoals Dissolve in Blender): de twee lijnen aan het punt worden één.
  function dissolve() {
    if (!selPoints.length) { deps.setStatus("Kies eerst een punt (klik). Ctrl+X haalt het punt weg en houdt de lijn.", "error"); return; }
    const result = roadDissolve(net, selPoints);
    if (!result.dissolved) { deps.setStatus("Dit punt zit niet tussen precies twee lijnen; weghalen kan met Delete.", "error"); return; }
    commit(result.net, result.dissolved + " punt(en) weg, de lijn blijft", { points: [], links: [] });
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

  // Kevin 23-11 (4): een gekopieerd stuk muur in een rechte rij (bijv. één deur- of raam-lijn) zet Ctrl+V ín de muurlijn
  // onder de muis (of de gekozen lijn), even breed en met dezelfde soorten. Zo krijgen alle ramen dezelfde breedte.
  const OPENING_NAMES = { 1: "deur", 2: "raam", 3: "opening", 4: "deco 1", 5: "deco 2", 6: "deco 3" };
  const meters = (value) => value.toFixed(2).replace(".", ",") + " m";
  function chainOf(clip) {
    const order = channel === "wall" && clip ? roadChainOrder(clip) : null;
    if (!order) return null;
    const a = clip.points[order[0]], b = clip.points[order[order.length - 1]];
    const kinds = clip.links.map((link) => OPENING_NAMES[link[2]]).filter(Boolean);
    const name = clip.links.length === 1 && kinds.length === 1 ? kinds[0] : "stuk muur";
    return { order, name, width: Math.hypot(b.x - a.x, b.z - a.z) };
  }
  // De lijn om in te plakken: onder de muis, anders de dichtstbijzijnde binnen 1,5 m van de muis, anders de gekozen lijn.
  function wallTarget() {
    const p = deps.lastPointer();
    const hit = p ? pick(p.clientX, p.clientY) : null;
    const ground = mouseGround();
    if (hit?.kind === "link") return { index: hit.index, at: ground };
    if (ground) {
      let best = null;
      net.links.forEach((link, k) => {
        const a = net.points[link[0]], b = net.points[link[1]];
        if (!a || !b) return;
        const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((ground.x - a.x) * dx + (ground.z - a.z) * dz) / length2));
        const distance = Math.hypot(a.x + dx * t - ground.x, a.z + dz * t - ground.z);
        if (distance <= 1.5 && (!best || distance < best.distance)) best = { index: k, distance };
      });
      if (best) return { index: best.index, at: ground };
    }
    if (selLinks.length === 1 && net.links[selLinks[0]]) return { index: selLinks[0], at: ground };
    return null;
  }

  function paste() {
    if (!clipboard) { deps.setStatus("Nog niets gekopieerd (Ctrl+C).", ""); return; }
    const chain = chainOf(clipboard);
    const target = chain ? wallTarget() : null;
    if (chain && target) {
      const result = roadInsertChain(net, target.index, target.at, clipboard, chain.order);
      if (!result) { deps.setStatus("Deze lijn is te kort voor een " + chain.name + " van " + meters(chain.width) + ".", "error"); return; }
      commit(result.net, chain.name + " van " + meters(chain.width) + " in de muur gezet (Ctrl+V = nog een)", { points: [], links: result.links });
      return;
    }
    const ground = mouseGround();
    if (!ground) { deps.setStatus("Geen grond onder de muis.", "error"); return; }
    const pasted = roadPaste(net, clipboard, ground);
    commit(pasted.net, clipboard.points.length + " punt(en) geplakt", { points: pasted.indices, links: [] });
  }

  async function joinOthers() {
    const [main, ...others] = deps.roadDocs();
    if (channel !== "road") return;
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
      if (!meta && key === "g" && session.kind === "move") {
        session.slide = session.slide ? null : slideAxis(session.indices);
        session.axis = null;
        if (session.slide) deps.setStatus("Langs de lijn schuiven (GG): beweeg de muis. Klik of Enter = klaar, G = weer vrij, Esc = terug.", "");
        else deps.setStatus("Schuiven: beweeg de muis. Klik of Enter = klaar, Esc = terug, X/Y = as vast, G = langs de lijn.", "");
        const p = deps.lastPointer();
        if (p) updateSession(p.clientX, p.clientY);
        return consume();
      }
      if (!meta && (key === "x" || key === "y") && session.kind === "move") {
        session.slide = null;
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
        // Muur met gekozen lijnen: alleen die lijnen kopiëren (een los gekozen punt erbij maakt er geen "los stuk" van).
        const linkPoints = channel === "wall" && selLinks.length ? [...new Set(selLinks.flatMap((k) => (net.links[k] || []).slice(0, 2)))] : null;
        clipboard = roadClip(net, linkPoints || sessionIndices());
        const chain = chainOf(clipboard);
        if (chain) deps.setStatus(icon + " " + chain.name[0].toUpperCase() + chain.name.slice(1) + " van " + meters(chain.width) + " gekopieerd. Wijs een muurlijn aan (of klik hem) en druk Ctrl+V: het komt in die lijn.", "");
        else deps.setStatus(clipboard ? icon + " " + clipboard.points.length + " punt(en) gekopieerd. Ctrl+V plakt bij de muis." : "Kies eerst wat je wilt kopiëren.", clipboard ? "" : "error");
        return consume();
      }
      if (key === "v") { paste(); return consume(); }
      if (key === "x") { dissolve(); return consume(); }
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

  // 🧱 Muur: de gekozen lijnen worden Muur, Deur, Raam of Open (knoppen op de kaart, onder ⚙️ meer). Ctrl+Z werkt.
  function setLinkKind(kind, label) {
    if (!net || !deps.linkWithKind) return false;
    if (!selLinks.length) { deps.setStatus("Kies eerst een of meer lijnen van de muur in de 3D-view (klik op een lijn, Shift+klik voor meer).", "error"); return false; }
    const links = net.links.map((link, k) => (selLinks.includes(k) ? deps.linkWithKind(link, kind) : link));
    return commit({ points: net.points, links }, selLinks.length + (selLinks.length === 1 ? " lijn " : " lijnen ") + (label || kind), { points: [], links: selLinks });
  }

  return { sync, render, hint, handleKeyDown, handlePointerDown, handlePointerMove, handlePointerUp, setLinkKind, isEditing: () => Boolean(session || placement) };
}
