// Uitrusting U1a (25-11): 🧍 Passen. Op een item (blok 👕 Aan het lichaam) kies je een uiterlijk en druk je Passen:
// dat uiterlijk staat dan in de 3D-view met het item aan zijn punt (rechterhand, linkerhand, rug of heup).
// G = schuiven, R = draaien, T = groter/kleiner (alleen het item), X/Y/Z = langs de rode/groene/blauwe pijl,
// klik of Enter = vast (opslaan), Esc = terug; nog een keer Esc = klaar met passen.
// Wat je verschuift: 🗡️ het item (velden van het item) of ✋ het punt van dit uiterlijk (Klasse > Bevestigpunten,
// geldt voor alle items op dat uiterlijk).
import {
  attachPointDef, attachPointForItem, bodyModelForItem, cleanPointEntry, itemBodyOffset, itemOffsetFields, lookPointEntry, pointOffset
} from "../shared/equipment-attach.js?v=20261125-u1a";

const letter = (event) => (String(event.code || "").startsWith("Key") ? event.code.slice(3).toLowerCase() : String(event.key || "").toLowerCase());
const MODE_TEXT = { move: "schuiven", rotate: "draaien", scale: "groter/kleiner" };
const AXIS_TEXT = { x: "rode pijl", y: "groene pijl", z: "blauwe pijl" };

// deps: runtime(), bench (docBench), getAssets(), setStatus(text, kind), save(doc, body, label), lastPointer(),
// canvasTarget(event), suppressClick(), rerender() (het paneel opnieuw tekenen).
export function createBodyFitEditor(deps) {
  let fit = null; // { itemKey, lookAssetId, target, bones, bone, boneMissing, ready, failed }
  let session = null; // { mode, axis, x, y, start, preview }
  let shownRevision = null;
  let saving = false;

  const runtime = () => deps.runtime();
  const bench = deps.bench;
  const itemDoc = () => (fit ? bench.doc(fit.itemKey) : null);
  const itemPoint = (body) => attachPointForItem(body) || "right_hand";

  // Alle uiterlijken uit alle klassen (kaart Klasse > Uiterlijk), met de klasse erbij.
  function looks() {
    const out = [];
    for (const doc of bench.docs("player_class")) {
      for (const assetId of Array.isArray(doc.body?.models) ? doc.body.models : []) {
        if (out.some((entry) => entry.assetId === assetId)) continue;
        const asset = deps.getAssets().find((entry) => entry.id === assetId) || null;
        out.push({ assetId, classDoc: doc, name: (doc.body.displayName || "Klasse") + " · " + (asset?.name || assetId) });
      }
    }
    return out;
  }

  function classDocsFor(assetId) {
    return bench.docs("player_class").filter((doc) => Array.isArray(doc.body?.models) && doc.body.models.includes(assetId));
  }

  function lookEntry(assetId, pointKey) {
    const doc = classDocsFor(assetId)[0];
    return lookPointEntry(doc?.body?.attachPoints, assetId, pointKey);
  }

  function idleClipFor(assetId) {
    const doc = classDocsFor(assetId)[0];
    return doc?.body?.animationProfiles?.[assetId]?.idle || "";
  }

  function publish() {
    bench.bodyFit = fit ? Object.assign({}, fit, { sessionMode: session?.mode || null }) : null;
  }

  function hint(prefix = "") {
    if (!fit) return;
    const doc = itemDoc();
    const def = attachPointDef(itemPoint(doc?.body));
    const what = fit.target === "point" ? "✋ punt " + (def?.name || "") + " van dit uiterlijk (alle items)" : "🗡️ het item";
    const text = "🧍 Passen · " + (prefix ? prefix + " · " : "") + what
      + (session ? " · " + MODE_TEXT[session.mode] + (session.axis ? " langs de " + AXIS_TEXT[session.axis] : "") + " · klik of Enter = vast, Esc = terug"
        : " · G = schuiven, R = draaien" + (fit.target === "item" ? ", T = groter/kleiner" : "") + ", daarna X/Y/Z = langs een pijl · Esc = klaar");
    deps.setStatus(text, "");
  }

  function currentOffsets() {
    const doc = itemDoc();
    const pointKey = itemPoint(doc?.body);
    const entry = lookEntry(fit.lookAssetId, pointKey);
    return { pointKey, entry, point: pointOffset(entry), item: itemBodyOffset(doc?.body) };
  }

  function show() {
    const rt = runtime();
    const doc = itemDoc();
    if (!rt || !doc || typeof rt.setBodyFitPreview !== "function") return false;
    const now = currentOffsets();
    const itemAssetId = bodyModelForItem(doc.body);
    const ids = [fit.lookAssetId, itemAssetId].filter(Boolean);
    rt.registerRuntimeAssets?.(deps.getAssets().filter((asset) => ids.includes(asset.id)));
    const target = rt.editorOrbitTarget?.() || { x: 0, y: 0, z: 0 };
    const ground = typeof rt.terrainHeightAt === "function" ? Number(rt.terrainHeightAt(target.x, target.z)) : NaN;
    const position = { x: target.x, y: Number.isFinite(ground) ? ground : target.y, z: target.z };
    fit.ready = false;
    fit.failed = false;
    fit.shownItemModel = itemAssetId;
    const started = rt.setBodyFitPreview({
      lookAssetId: fit.lookAssetId, itemAssetId, idleClip: idleClipFor(fit.lookAssetId),
      pointKey: now.pointKey, boneName: now.entry.bone || "", point: now.point, item: now.item, position,
      onReady: (info) => {
        if (!fit) return;
        fit.ready = Boolean(info?.ready);
        fit.failed = Boolean(info?.failed);
        fit.bones = info?.bones || [];
        fit.bone = info?.bone || "";
        fit.boneMissing = Boolean(info?.boneMissing);
        publish();
        deps.rerender();
        if (fit.failed) deps.setStatus("🧍 Dit uiterlijk kon niet laden.", "error");
        else hint(fit.boneMissing ? "geen handbot gevonden: kies een bot in het paneel" : "");
      }
    });
    if (!started) { deps.setStatus("🧍 Dit uiterlijk heeft geen model om te laden.", "error"); return false; }
    shownRevision = revisionKey();
    // Camera naar het uiterlijk (voeten en hoofd in beeld).
    rt.frameWorldPoints?.([{ x: position.x, y: position.y, z: position.z }, { x: position.x, y: position.y + 2, z: position.z }]);
    return true;
  }

  function revisionKey() {
    const doc = itemDoc();
    return (doc?.revision ?? "") + "|" + classDocsFor(fit?.lookAssetId).map((entry) => entry.revision).join(",");
  }

  function start(itemKey, lookAssetId) {
    const choices = looks();
    const look = choices.find((entry) => entry.assetId === lookAssetId) || choices[0];
    if (!look) { deps.setStatus("🧍 Er is nog geen uiterlijk: zet eerst een model bij een Klasse > Uiterlijk.", "error"); return; }
    session = null;
    fit = { itemKey, lookAssetId: look.assetId, target: fit?.itemKey === itemKey ? fit.target : "item", bones: [], bone: "", boneMissing: false, ready: false, failed: false };
    publish();
    if (!show()) { fit = null; publish(); }
    deps.rerender();
    hint("laden…");
  }

  // redraw = false: een ander paneel is al getekend (ander item of andere kaart gekozen); dat niet overschrijven.
  function stop(redraw = true) {
    if (!fit && !session) return;
    session = null;
    fit = null;
    shownRevision = null;
    runtime()?.clearBodyFitPreview?.();
    publish();
    if (redraw) deps.rerender();
    deps.setStatus("🧍 Klaar met passen.", "");
  }

  function setTarget(target) {
    if (!fit) return;
    cancelSession();
    fit.target = target === "point" ? "point" : "item";
    publish();
    deps.rerender();
    hint();
  }

  // Een ander bot voor het punt van dit uiterlijk (leeg = vanzelf).
  async function setBone(boneName) {
    if (!fit) return;
    const now = currentOffsets();
    await savePoint(now.pointKey, cleanPointEntry(now.point, boneName || ""), "bot " + (boneName || "vanzelf"));
    runtime()?.updateBodyFitPreview?.({ boneName: boneName || "" });
    const info = runtime()?.bodyFitInfo?.();
    if (info) { fit.bone = info.bone; fit.boneMissing = info.boneMissing; }
    publish();
    deps.rerender();
  }

  async function savePoint(pointKey, entry, label) {
    const docs = classDocsFor(fit.lookAssetId);
    saving = true;
    try {
      for (const doc of docs) {
        const body = JSON.parse(JSON.stringify(doc.body || {}));
        const all = body.attachPoints && typeof body.attachPoints === "object" ? body.attachPoints : {};
        const points = Object.assign({}, all[fit.lookAssetId] || {});
        if (Object.keys(entry).length) points[pointKey] = entry; else delete points[pointKey];
        if (Object.keys(points).length) all[fit.lookAssetId] = points; else delete all[fit.lookAssetId];
        if (Object.keys(all).length) body.attachPoints = all; else delete body.attachPoints;
        await deps.save(doc, body, "Klasse · ✋ " + (attachPointDef(pointKey)?.name || pointKey) + " · " + label);
      }
    } finally {
      saving = false;
      shownRevision = revisionKey();
    }
  }

  async function saveItem(offset, label) {
    const doc = itemDoc();
    if (!doc) return;
    const body = Object.assign({}, doc.body, itemOffsetFields(offset));
    saving = true;
    try { await deps.save(doc, body, "Item · 👕 " + label); } finally { saving = false; shownRevision = revisionKey(); }
  }

  // Na elke wijziging (opslaan, ander item gekozen, wereld opnieuw geladen): het voorbeeld bijwerken of stoppen.
  function sync() {
    if (!fit) return;
    if (bench.selectedDocKey !== fit.itemKey || !itemDoc()) { stop(false); return; }
    if (session || saving) return;
    const rt = runtime();
    if (!rt?.bodyFitInfo?.()) { show(); return; }
    if (revisionKey() === shownRevision) return;
    const now = currentOffsets();
    const doc = itemDoc();
    // Een ander model in de hand: opnieuw laden; anders alleen verschuiven.
    if (bodyModelForItem(doc.body) !== fit.shownItemModel) { show(); return; }
    rt.updateBodyFitPreview?.({ pointKey: now.pointKey, boneName: now.entry.bone || "", point: now.point, item: now.item });
    shownRevision = revisionKey();
  }

  function beginSession(mode) {
    if (!fit?.ready) { hint("nog aan het laden"); return; }
    if (mode === "scale" && fit.target === "point") { hint("T werkt alleen voor het item"); return; }
    const pointer = deps.lastPointer() || { clientX: 0, clientY: 0 };
    const now = currentOffsets();
    session = { mode, axis: null, x: pointer.clientX, y: pointer.clientY, start: fit.target === "point" ? now.point : now.item, preview: null };
    publish();
    hint();
  }

  function preview(clientX, clientY) {
    if (!session) return;
    const rt = runtime();
    const next = rt?.bodyFitDrag?.({ target: fit.target, mode: session.mode, axis: session.axis, dx: clientX - session.x, dy: clientY - session.y, start: session.start });
    if (!next) return;
    session.preview = next;
    const now = currentOffsets();
    rt.updateBodyFitPreview?.(fit.target === "point" ? { point: next, item: now.item } : { point: now.point, item: next });
  }

  function cancelSession() {
    if (!session) return;
    const now = currentOffsets();
    session = null;
    runtime()?.updateBodyFitPreview?.({ point: now.point, item: now.item });
    publish();
  }

  async function confirmSession() {
    if (!session) return;
    const done = session;
    session = null;
    publish();
    if (!done.preview) { hint(); return; }
    const label = MODE_TEXT[done.mode] + (done.axis ? " (" + done.axis.toUpperCase() + ")" : "");
    try {
      if (fit.target === "point") {
        const now = currentOffsets();
        await savePoint(now.pointKey, cleanPointEntry(done.preview, now.entry.bone || ""), label);
      } else {
        await saveItem(done.preview, label);
      }
      hint("opgeslagen");
    } catch {
      sync();
    }
    deps.rerender();
  }

  function handleKeyDown(event) {
    if (!fit) return false;
    const meta = event.ctrlKey || event.metaKey;
    if (meta || event.altKey) return false;
    const key = letter(event);
    const consume = () => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); return true; };
    if (event.key === "Escape") {
      if (session) { cancelSession(); hint("terug"); } else stop();
      return consume();
    }
    if (event.key === "Enter" && session) { void confirmSession(); return consume(); }
    if (key === "g") { cancelSession(); beginSession("move"); return consume(); }
    if (key === "r") { cancelSession(); beginSession("rotate"); return consume(); }
    if (key === "t") { cancelSession(); beginSession("scale"); return consume(); }
    if ((key === "x" || key === "y" || key === "z") && session && session.mode !== "scale") {
      session.axis = session.axis === key ? null : key;
      const pointer = deps.lastPointer();
      if (pointer) preview(pointer.clientX, pointer.clientY);
      hint();
      return consume();
    }
    return false;
  }

  function handlePointerMove(event) {
    if (!session) return false;
    preview(event.clientX, event.clientY);
    return false;
  }

  function handlePointerDown(event) {
    if (!session || !deps.canvasTarget(event)) return false;
    event.preventDefault();
    event.stopPropagation();
    deps.suppressClick();
    if (event.button === 2) { cancelSession(); hint("terug"); return true; }
    void confirmSession();
    return true;
  }

  return {
    looks, start, stop: () => stop(true), setTarget, setBone, sync, handleKeyDown, handlePointerMove, handlePointerDown,
    isSaving: () => saving,
    active: () => Boolean(fit)
  };
}
