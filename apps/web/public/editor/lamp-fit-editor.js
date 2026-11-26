// Kevin 26-11: ✋ Vlam verplaatsen. Op een model met 💡 Licht zet je de vlam (gloed + lichtplek) in de 3D-view goed,
// net als het wapen bij 🧍 Passen, maar zonder botten: de vlam hoort bij het model en draait mee.
// G = schuiven, daarna X/Y/Z = langs de rode/groene/blauwe pijl (zoals G bij een model: blauw = omhoog),
// klik of Enter = vast (opslaan in Vlam X, Hoogte vlam en Vlam Z), Esc = terug; nog een keer Esc = klaar.
const letter = (event) => (String(event.code || "").startsWith("Key") ? event.code.slice(3).toLowerCase() : String(event.key || "").toLowerCase());
const AXIS_TEXT = { x: "rode pijl (opzij)", y: "groene pijl (voor/achter)", z: "blauwe pijl (omhoog)" };

// deps: runtime(), bench (docBench), runtimeIdFor(docKey), setStatus(text, kind), save(doc, body, label), lastPointer(),
// canvasTarget(event), suppressClick(), rerender().
export function createLampFitEditor(deps) {
  let fit = null; // { docKey, offset }
  let session = null; // { axis, x, y, start, preview }
  let saving = false;

  const runtime = () => deps.runtime();
  const bench = deps.bench;
  const doc = () => (fit ? bench.doc(fit.docKey) : null);

  function publish() {
    bench.lampFit = fit ? { docKey: fit.docKey, moving: Boolean(session) } : null;
  }

  function hint(prefix = "") {
    if (!fit) return;
    const text = "✋ Vlam verplaatsen · " + (prefix ? prefix + " · " : "")
      + (session ? "schuiven" + (session.axis ? " langs de " + AXIS_TEXT[session.axis] : "") + " · klik of Enter = vast, Esc = terug"
        : "G = schuiven, daarna X/Y/Z = langs een pijl · Esc = klaar");
    deps.setStatus(text, "");
  }

  // Waar de vlam nu staat volgens de kaart (Vlam X, Hoogte vlam, Vlam Z).
  function offsetOf(body) {
    const n = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
    return { x: n(body?.lightX, 0), y: n(body?.lightHeight, 1.5), z: n(body?.lightZ, 0) };
  }

  function start(docKey) {
    session = null;
    const current = bench.doc(docKey);
    if (!current || current.body?.light !== true) {
      fit = null;
      deps.setStatus("✋ Zet eerst Geeft licht aan.", "error");
    } else {
      fit = { docKey, offset: offsetOf(current.body) };
      // De pijlen bij de vlam; staat het model er nog niet, dan komen ze zodra het in de 3D-view staat.
      runtime()?.lampFitStart?.(deps.runtimeIdFor(docKey));
      hint();
    }
    publish();
    deps.rerender();
  }

  function stop(redraw = true) {
    if (!fit) return;
    session = null;
    fit = null;
    runtime()?.lampFitStop?.();
    publish();
    if (redraw) deps.rerender();
    deps.setStatus("✋ Klaar met de vlam.", "");
  }

  // Na elke wijziging (opslaan, andere kaart gekozen, wereld opnieuw geladen): de pijlen terugzetten of stoppen.
  function sync() {
    if (!fit) return;
    const current = doc();
    if (bench.selectedDocKey !== fit.docKey || !current || current.body?.light !== true) { stop(false); return; }
    if (session || saving) return;
    fit.offset = offsetOf(current.body);
  }

  function beginSession() {
    const pointer = deps.lastPointer() || { clientX: 0, clientY: 0 };
    session = { axis: null, x: pointer.clientX, y: pointer.clientY, start: Object.assign({}, fit.offset), preview: null };
    publish();
    hint();
  }

  function preview(clientX, clientY) {
    if (!session) return;
    const rt = runtime();
    const next = rt?.lampFitDrag?.({ axis: session.axis, dx: clientX - session.x, dy: clientY - session.y, start: session.start });
    if (!next) return;
    session.preview = next;
    rt.lampFitPreview?.(next);
  }

  function cancelSession() {
    if (!session) return;
    session = null;
    runtime()?.lampFitPreview?.(fit.offset);
    publish();
  }

  async function confirmSession() {
    if (!session) return;
    const done = session;
    session = null;
    publish();
    const current = doc();
    if (!done.preview || !current) { hint(); return; }
    const body = Object.assign({}, current.body, { lightX: done.preview.x, lightHeight: done.preview.y, lightZ: done.preview.z });
    fit.offset = done.preview;
    saving = true;
    try {
      await deps.save(current, body, "Model · ✋ vlam" + (done.axis ? " (" + done.axis.toUpperCase() + ")" : ""));
      hint("opgeslagen");
    } catch {
      hint("opslaan lukte niet");
    } finally {
      saving = false;
    }
    sync();
    deps.rerender();
  }

  function handleKeyDown(event) {
    if (!fit) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    const key = letter(event);
    const consume = () => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); return true; };
    if (event.key === "Escape") {
      if (session) { cancelSession(); hint("terug"); } else stop();
      return consume();
    }
    if (event.key === "Enter" && session) { void confirmSession(); return consume(); }
    if (key === "g") { cancelSession(); beginSession(); return consume(); }
    // R en T doen hier niets (de vlam draait en groeit niet); niet het model laten draaien.
    if (key === "r" || key === "t") { hint("alleen G (schuiven)"); return consume(); }
    if ((key === "x" || key === "y" || key === "z") && session) {
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
    start, stop: () => stop(true), sync, handleKeyDown, handlePointerMove, handlePointerDown,
    isSaving: () => saving,
    active: () => Boolean(fit)
  };
}
