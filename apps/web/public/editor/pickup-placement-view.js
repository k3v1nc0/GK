// F3-E3-T06: pickups plaatsen, verplaatsen, aanpassen en verwijderen zonder Nodes en zonder ID's te typen.
// Standaard een licht 2D-bovenaanzicht van de zone (goed voor de oude laptop). Optioneel een 3D-weergave
// met de echte wereld (pickup-viewport-3d.js), die pas geladen wordt als je erom vraagt.
import { command, el, friendlyError, slug } from "./canonical-api.js";

const SIZE = 480;

function numberInput(value, attrs = {}) {
  const node = el("input", Object.assign({ type: "number", step: 0.1 }, attrs));
  node.value = value;
  return node;
}

export function mountPickupPlacementView(host, ctx, signal) {
  const zones = ctx.workspace.zones || [];
  const items = ctx.docs("item_definition").filter((doc) => !doc.archived);
  const policies = ctx.workspace.respawnPolicies || [];
  if (!zones.length) { host.append(el("p", { class: "cwHint", text: "Geen zones gevonden. Publiceer eerst de wereld in de Nodes-editor." })); return; }
  if (!items.length) { host.append(el("p", { class: "cwHint", text: "Maak eerst een item onder Items." })); return; }

  let zoneId = zones[0].zoneId;
  try { const saved = window.localStorage.getItem("gk.canonical.zone"); if (zones.some((zone) => zone.zoneId === saved)) zoneId = saved; } catch {}
  let selected = null;
  let drag = null;
  let viewport3d = null;

  const zoneSelect = el("select", { "data-cw": "zone" }, zones.map((zone) => el("option", { value: zone.zoneId, text: zone.label })));
  zoneSelect.value = zoneId;
  const itemSelect = el("select", { "data-cw": "item" }, items.map((doc) => el("option", { value: doc.docKey, text: doc.body.displayName })));
  const amount = numberInput(1, { min: 1, max: 9999, step: 1 });
  const height = numberInput(0);
  const policySelect = el("select", {}, [el("option", { value: "", text: "(standaard)" })].concat(policies.map((policy) => el("option", { value: policy.id, text: policy.label }))));
  const canvas = el("canvas", { width: SIZE, height: SIZE, class: "cwMap" });
  const detail = el("div", { class: "cwForm", hidden: true });
  const toggle3d = el("button", { type: "button", class: "ghost", "data-cw": "toggle3d", text: "3D-weergave tonen" });
  const slot3d = el("div", { class: "cw3dSlot" });

  host.append(
    el("h2", { text: "Pickups" }),
    el("div", { class: "cwRow" }, [
      el("label", {}, [el("span", { text: "Zone" }), zoneSelect]),
      el("label", {}, [el("span", { text: "Item voor nieuwe pickup" }), itemSelect]),
      el("label", {}, [el("span", { text: "Aantal" }), amount]),
      el("label", {}, [el("span", { text: "Hoogte (Y)" }), height]),
      el("label", {}, [el("span", { text: "Respawn" }), policySelect])
    ]),
    el("p", { class: "cwHint", text: "Klik op een lege plek om een pickup te plaatsen. Klik op een bolletje om het te kiezen, sleep om te verplaatsen." }),
    el("div", { class: "cwSplit" }, [canvas, detail]),
    el("div", { class: "cwRow" }, [toggle3d]),
    slot3d
  );

  const zone = () => zones.find((entry) => entry.zoneId === zoneId);
  const bounds = () => {
    const b = zone()?.bounds;
    if (b && b.maxX > b.minX && b.maxZ > b.minZ) return b;
    return { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  };
  const pickups = () => ctx.docs("pickup").filter((doc) => !doc.archived && doc.body.zoneRef === zoneId);
  const span = () => { const b = bounds(); return Math.max(b.maxX - b.minX, b.maxZ - b.minZ); };
  const toCanvas = (x, z) => { const b = bounds(); return [(x - b.minX) / span() * SIZE, (z - b.minZ) / span() * SIZE]; };
  const toWorld = (px, py) => { const b = bounds(); return [Math.round((b.minX + px / SIZE * span()) * 100) / 100, Math.round((b.minZ + py / SIZE * span()) * 100) / 100]; };
  const itemName = (ref) => ctx.docs("item_definition").find((doc) => doc.docKey === ref)?.body.displayName || ref;
  const selectedDoc = () => pickups().find((entry) => entry.docKey === selected) || null;

  function renderDetail() {
    const doc = selectedDoc();
    detail.hidden = !doc;
    if (!doc) { detail.replaceChildren(); return; }
    const item = el("select", {}, items.map((entry) => el("option", { value: entry.docKey, text: entry.body.displayName })));
    item.value = doc.body.itemRef;
    const count = numberInput(doc.body.amount, { min: 1, max: 9999, step: 1 });
    const x = numberInput(doc.body.x, { "data-cw": "x" }); const y = numberInput(doc.body.y, { "data-cw": "y" }); const z = numberInput(doc.body.z, { "data-cw": "z" });
    const policy = el("select", {}, [el("option", { value: "", text: "(standaard)" })].concat(policies.map((entry) => el("option", { value: entry.id, text: entry.label }))));
    policy.value = doc.body.respawnPolicyRef || "";
    const save = el("button", { type: "button", "data-cw": "save-pickup", text: "Opslaan" });
    const remove = el("button", { type: "button", class: "ghost", text: "Verwijderen" });
    save.addEventListener("click", () => saveSelected(doc, {
      itemRef: item.value, amount: Math.max(1, Math.floor(Number(count.value) || 1)),
      x: Number(x.value) || 0, y: Number(y.value) || 0, z: Number(z.value) || 0, respawnPolicyRef: policy.value || null
    }), { signal });
    remove.addEventListener("click", () => removeSelected(doc), { signal });
    detail.replaceChildren(
      el("h3", { text: itemName(doc.body.itemRef) + (doc.legacyRef ? " (uit Nodes)" : "") }),
      el("p", { class: "cwHint", text: "Revisie " + doc.revision }),
      el("label", {}, [el("span", { text: "Item" }), item]),
      el("label", {}, [el("span", { text: "Aantal" }), count]),
      el("div", { class: "cwRow" }, [el("label", {}, [el("span", { text: "X" }), x]), el("label", {}, [el("span", { text: "Y" }), y]), el("label", {}, [el("span", { text: "Z" }), z])]),
      el("label", {}, [el("span", { text: "Respawn" }), policy]),
      el("div", { class: "cwRow" }, [save, remove])
    );
  }

  function draw() {
    const g = canvas.getContext("2d");
    g.fillStyle = "#1e293b"; g.fillRect(0, 0, SIZE, SIZE);
    g.strokeStyle = "#334155";
    for (let i = 1; i < 10; i += 1) { g.beginPath(); g.moveTo(i * SIZE / 10, 0); g.lineTo(i * SIZE / 10, SIZE); g.moveTo(0, i * SIZE / 10); g.lineTo(SIZE, i * SIZE / 10); g.stroke(); }
    for (const doc of pickups()) {
      const pos = drag && drag.doc.docKey === doc.docKey ? toCanvas(drag.x, drag.z) : toCanvas(doc.body.x, doc.body.z);
      g.beginPath(); g.arc(pos[0], pos[1], 7, 0, Math.PI * 2);
      g.fillStyle = selected === doc.docKey ? "#facc15" : (doc.legacyRef ? "#38bdf8" : "#22c55e"); g.fill();
      g.fillStyle = "#e2e8f0"; g.font = "11px system-ui"; g.fillText(itemName(doc.body.itemRef), pos[0] + 9, pos[1] + 4);
    }
    renderDetail();
    if (viewport3d) viewport3d.showPickups(pickups(), selected, itemName);
  }

  async function reload() { await ctx.refresh(); if (!signal.aborted) draw(); }

  async function createAt(x, y, z) {
    const itemDoc = items.find((entry) => entry.docKey === itemSelect.value);
    const existing = new Set(ctx.docs("pickup").map((entry) => entry.body.pickupId));
    let n = 1;
    while (existing.has("pickup." + slug(itemDoc.body.displayName) + "_" + n)) n += 1;
    const body = { pickupId: "pickup." + slug(itemDoc.body.displayName) + "_" + n, itemRef: itemDoc.docKey, zoneRef: zoneId, x, y, z, amount: Math.max(1, Math.floor(Number(amount.value) || 1)) };
    if (policySelect.value) body.respawnPolicyRef = policySelect.value;
    try {
      const result = await command({ command: "create", kind: "pickup", body });
      selected = result.docKey;
      ctx.setStatus("Pickup geplaatst. Publiceer om het in de game te zien.", "ok");
      await reload();
    } catch (error) {
      ctx.setStatus(friendlyError(error), "error");
    }
  }

  async function saveSelected(doc, patch) {
    const body = Object.assign({}, doc.body, patch);
    if (!body.respawnPolicyRef) delete body.respawnPolicyRef;
    try {
      await command({ command: "update", docKey: doc.docKey, body }, doc.revision);
      ctx.setStatus("Pickup opgeslagen.", "ok");
    } catch (error) {
      ctx.setStatus(friendlyError(error), "error");
    }
    await reload();
  }

  async function removeSelected(doc) {
    try {
      await command({ command: "archive", docKey: doc.docKey }, doc.revision);
      selected = null;
      ctx.setStatus("Pickup verwijderd (gearchiveerd).", "ok");
      await reload();
    } catch (error) {
      ctx.setStatus(friendlyError(error), "error");
    }
  }

  const hit = (px, py) => pickups().find((doc) => { const pos = toCanvas(doc.body.x, doc.body.z); return Math.hypot(pos[0] - px, pos[1] - py) <= 9; });
  const point = (event) => { const rect = canvas.getBoundingClientRect(); return [(event.clientX - rect.left) * SIZE / rect.width, (event.clientY - rect.top) * SIZE / rect.height]; };

  canvas.addEventListener("pointerdown", (event) => {
    const [px, py] = point(event);
    const doc = hit(px, py);
    if (doc) {
      selected = doc.docKey;
      drag = { doc, x: doc.body.x, z: doc.body.z, moved: false };
      canvas.setPointerCapture(event.pointerId);
      draw();
      return;
    }
    const [x, z] = toWorld(px, py);
    createAt(x, Number(height.value) || 0, z);
  }, { signal });

  canvas.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const [x, z] = toWorld(...point(event));
    drag.x = x; drag.z = z; drag.moved = true;
    draw();
  }, { signal });

  canvas.addEventListener("pointerup", () => {
    if (!drag) return;
    const current = drag;
    drag = null;
    if (!current.moved) { draw(); return; }
    saveSelected(current.doc, { x: current.x, z: current.z });
  }, { signal });

  zoneSelect.addEventListener("change", () => {
    zoneId = zoneSelect.value; selected = null;
    try { window.localStorage.setItem("gk.canonical.zone", zoneId); } catch {}
    if (viewport3d) viewport3d.focusZone(zone());
    draw();
  }, { signal });

  toggle3d.addEventListener("click", async () => {
    if (viewport3d) { viewport3d.destroy(); viewport3d = null; slot3d.replaceChildren(); toggle3d.textContent = "3D-weergave tonen"; return; }
    toggle3d.disabled = true;
    ctx.setStatus("3D-wereld laden...", "info");
    try {
      const module = await import("./pickup-viewport-3d.js");
      if (signal.aborted) return;
      viewport3d = await module.mountPickupViewport3d(slot3d, {
        signal,
        zone: zone(),
        onGroundClick: (pointOnGround) => {
          const doc = selectedDoc();
          if (doc) saveSelected(doc, { x: pointOnGround.x, y: pointOnGround.y, z: pointOnGround.z });
          else createAt(pointOnGround.x, pointOnGround.y, pointOnGround.z);
        }
      });
      toggle3d.textContent = "3D-weergave sluiten";
      ctx.setStatus("3D: klik op de grond om te plaatsen. Is er een pickup gekozen, dan verplaats je die. Slepen = camera draaien.", "info");
      draw();
    } catch (error) {
      ctx.setStatus("3D-weergave kon niet laden: " + friendlyError(error), "error");
    } finally {
      toggle3d.disabled = false;
    }
  }, { signal });

  signal.addEventListener("abort", () => { if (viewport3d) viewport3d.destroy(); viewport3d = null; });
  draw();
}
