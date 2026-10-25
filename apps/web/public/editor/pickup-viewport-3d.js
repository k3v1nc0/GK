// F3-E3-T06: 3D-weergave voor pickupplaatsing. Gebruikt dezelfde world-runtime als de editor en de game
// (createGkWorldRuntime), met de gepubliceerde wereld. Wordt alleen geladen als je op "3D-weergave tonen" klikt.
import { createGkWorldRuntime } from "../shared/world-runtime.js?v=20261016-scatter-pattern2";

const CLICK_TOLERANCE_PX = 5;

export async function mountPickupViewport3d(slot, { signal, zone, onGroundClick }) {
  const response = await fetch("/api/game/world", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("Gepubliceerde wereld niet beschikbaar.");
  const world = await response.json();

  const canvas = document.createElement("canvas");
  canvas.className = "cw3d";
  slot.replaceChildren(canvas);
  // De knop staat direct boven dit hoge canvas. Breng het canvas zelf in beeld,
  // zodat de eerste grondklik niet buiten het zichtbare browservenster valt.
  canvas.scrollIntoView({ block: "nearest", inline: "nearest" });
  const runtime = createGkWorldRuntime(canvas, {
    mode: "editor",
    onSelectEntity: function () {},
    onSelectEntities: function () {}
  });
  runtime.setWorld(world);

  const focusZone = (target) => {
    const bounds = target?.bounds;
    if (bounds && Number.isFinite(bounds.minX) && Number.isFinite(bounds.maxX)) {
      runtime.focusGroundPoint((bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2);
    }
  };
  focusZone(zone);

  // Een klik zonder slepen is plaatsen/verplaatsen; slepen laat de camera draaien zoals in de editor.
  let down = null;
  let lastHandledAt = 0;
  const local = new AbortController();
  const stop = () => local.abort();
  signal.addEventListener("abort", stop, { once: true });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    down = { x: event.clientX, y: event.clientY, moved: false };
  }, { signal: local.signal });
  canvas.addEventListener("pointermove", (event) => {
    if (!down) return;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_TOLERANCE_PX) down.moved = true;
  }, { signal: local.signal });
  const placeFromEvent = (event) => {
    if (!down) return;
    const moved = down.moved || Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_TOLERANCE_PX;
    down = null;
    if (moved) return;
    const point = runtime.screenToGround(event.clientX, event.clientY);
    if (!point) return;
    lastHandledAt = Date.now();
    onGroundClick({ x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100, z: Math.round(point.z * 100) / 100 });
  };
  canvas.addEventListener("pointerup", placeFromEvent, { signal: local.signal });
  // De editor-runtime heeft eigen pointer-capture/selectiehandlers. Als zo'n handler de
  // bubbled pointerup afvangt, blijft de door de browser bevestigde click het betrouwbare
  // signaal voor een echte klik (de runtime gebruikt om dezelfde reden ook click).
  canvas.addEventListener("click", (event) => {
    if (Date.now() - lastHandledAt < 100) return;
    placeFromEvent(event);
  }, { signal: local.signal });
  canvas.addEventListener("pointercancel", () => { down = null; }, { signal: local.signal });

  return {
    focusZone,
    showPickups(pickups, selectedDocKey, itemName) {
      runtime.setRuntimeTargets(pickups.map((doc) => ({
        instanceId: "canonical-preview:" + doc.docKey,
        entityKind: "pickup",
        targetKind: "pickup",
        pickupKind: "item",
        displayName: (doc.docKey === selectedDocKey ? "> " : "") + itemName(doc.body.itemRef) + " x" + doc.body.amount,
        x: doc.body.x,
        y: doc.body.y,
        z: doc.body.z,
        radius: 1.2,
        available: true,
        status: "available"
      })));
    },
    destroy() {
      stop();
      try { runtime.clearRuntimeTargets(); } catch {}
      try { runtime.destroy(); } catch {}
      slot.replaceChildren();
    }
  };
}
