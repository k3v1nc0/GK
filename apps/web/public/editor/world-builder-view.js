// Fase 04 (F4-E2-T03): World Builder in de canonieke werkbank. Kevin tekent Regions en Areas op een licht
// 2D-bovenaanzicht (goed voor de oude laptop). Geen nodecanvas: elke vorm is een canoniek document (region/area)
// en gaat via hetzelfde command-pad (CAS, refs, ruimteregels) als items en pickups.
// Opslag in hele millimeters; Kevin ziet en typt meters. Raster: 1 m.
import { api, command, el, friendlyError, slug } from "./canonical-api.js";
import { createWorldMusic } from "../game/world-audio.js";
import { CELL_SIZE_MM, areaBoundsMm, areaContains, metersToMm, mmToMeters, rectContains, rectInside } from "../shared/spatial.js";

const WIDTH = 880;
const HEIGHT = 560;
const VIEW_KEY = "gk.canonical.worldView";
const TOOLS = {
  select: "Kiezen / schuiven",
  region: "Region (rechthoek)",
  box: "Area: rechthoek",
  cylinder: "Area: cirkel",
  polygon: "Area: polygoon",
  colliderBox: "Obstakel: rechthoek",
  colliderCylinder: "Obstakel: cirkel",
  preview: "Preview (draft)"
};

const m = (mm) => Math.round(mmToMeters(mm) * 1000) / 1000;
const snapMm = (meters) => metersToMm(Math.round(meters));

function hueFor(id) {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 360;
}

function loadView() {
  try { return JSON.parse(window.localStorage.getItem(VIEW_KEY) || "null"); } catch { return null; }
}

function saveView(view) {
  try { window.localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch {}
}

function numberInput(value, attrs = {}) {
  const node = el("input", Object.assign({ type: "number", step: 1 }, attrs));
  node.value = value;
  return node;
}

export async function mountWorldBuilderView(host, ctx, signal) {
  let audioAssets = [];
  try {
    const response = await fetch("/api/assets", { credentials: "same-origin", signal });
    if (response.ok) audioAssets = ((await response.json()).assets || []).filter((asset) => asset.assetType === "audio");
  } catch {}
  if (signal.aborted) return;

  const zones = ctx.workspace.zones || [];
  const saved = loadView() || {};
  const view = {
    cx: Number.isFinite(saved.cx) ? saved.cx : 0,
    cz: Number.isFinite(saved.cz) ? saved.cz : 0,
    scale: Number.isFinite(saved.scale) && saved.scale > 0 ? saved.scale : 2,
    selected: typeof saved.selected === "string" ? saved.selected : null,
    tool: TOOLS[saved.tool] ? saved.tool : "select",
    showCells: saved.showCells === true
  };
  let drag = null; // { mode, start, current, button }
  let polygon = []; // punten in meters [x, z]
  // Draft-preview: een testpunt dat Kevin over de kaart sleept; de server zegt welke Region/Area het is.
  const preview = { point: null, previous: null, result: null, inFlight: false, queued: null, errors: [], music: null };
  const previewBox = el("div", { class: "cwForm", "data-cw": "preview-result", hidden: true });

  const regions = () => ctx.docs("region").filter((doc) => !doc.archived);
  const areas = () => ctx.docs("area").filter((doc) => !doc.archived);
  const colliders = () => ctx.docs("collider").filter((doc) => !doc.archived);
  const selectedDoc = () => regions().concat(areas(), colliders()).find((doc) => doc.docKey === view.selected) || null;
  const persist = () => saveView({ cx: view.cx, cz: view.cz, scale: view.scale, selected: view.selected, tool: view.tool, showCells: view.showCells });

  const toolButtons = Object.entries(TOOLS).map(([tool, label]) => {
    const button = el("button", { type: "button", class: "ghost", "data-cw": "tool-" + tool, text: label });
    button.addEventListener("click", () => {
      view.tool = tool; polygon = [];
      if (tool !== "preview" && preview.music) { preview.music.destroy(); preview.music = null; }
      persist(); draw();
    }, { signal });
    return button;
  });
  const nameInput = el("input", { type: "text", maxlength: 80, placeholder: "bijv. Bos van Ruis", "data-cw": "shape-name" });
  const cellsToggle = el("input", { type: "checkbox", "data-cw": "show-cells" });
  cellsToggle.checked = view.showCells;
  const fitButton = el("button", { type: "button", class: "ghost", text: "Alles tonen" });
  const finishPolygon = el("button", { type: "button", "data-cw": "finish-polygon", text: "Polygoon klaar" });
  const importZones = el("button", { type: "button", class: "ghost", "data-cw": "import-zones", text: "Zones uit Nodes als Regions overnemen" });
  const zoneReport = el("div", { class: "cwForm" });
  const canvas = el("canvas", { width: WIDTH, height: HEIGHT, "data-cw": "world-map" });
  canvas.style.cssText = "width:100%;max-width:" + WIDTH + "px;border:1px solid var(--line);border-radius:6px;touch-action:none;cursor:crosshair;display:block";
  const hint = el("p", { class: "cwHint" });
  const detail = el("div", { class: "cwForm", hidden: true });
  const listBox = el("div", { class: "cwForm" });

  host.append(
    el("h2", { text: "Wereld: Regions en Areas" }),
    el("p", { class: "cwHint", text: "Een Region is een rechthoekig gebied met een naam (Regions mogen elkaar raken, niet overlappen). Een Area is een plek binnen één Region: rechthoek, cirkel of polygoon. Grijze kaders zijn de zones uit Nodes, ter oriëntatie." }),
    el("div", { class: "cwRow" }, toolButtons),
    el("div", { class: "cwRow" }, [
      el("label", {}, [el("span", { text: "Naam voor nieuwe vorm (leeg = automatisch)" }), nameInput]),
      el("label", { class: "cwCheck" }, [cellsToggle, el("span", { text: "Cells (64 m) tonen" })]),
      fitButton, finishPolygon
    ]),
    hint,
    previewBox,
    canvas,
    el("div", { class: "cwSplit" }, [detail, listBox]),
    el("div", { class: "cwRow" }, [importZones]),
    zoneReport
  );

  // ---- coordinaten ----
  const toCanvas = (x, z) => [(x - view.cx) * view.scale + WIDTH / 2, (z - view.cz) * view.scale + HEIGHT / 2];
  const toWorld = (px, py) => [(px - WIDTH / 2) / view.scale + view.cx, (py - HEIGHT / 2) / view.scale + view.cz];
  const pointer = (event) => { const rect = canvas.getBoundingClientRect(); return [(event.clientX - rect.left) * WIDTH / rect.width, (event.clientY - rect.top) * HEIGHT / rect.height]; };

  function fitAll() {
    const rects = zones.map((zone) => zone.bounds).filter((b) => b && b.maxX > b.minX && b.maxZ > b.minZ)
      .concat(regions().map((doc) => ({ minX: m(doc.body.minXMm), maxX: m(doc.body.maxXMm), minZ: m(doc.body.minZMm), maxZ: m(doc.body.maxZMm) })));
    if (!rects.length) { view.cx = 0; view.cz = 0; view.scale = 2; return; }
    const minX = Math.min(...rects.map((r) => r.minX)); const maxX = Math.max(...rects.map((r) => r.maxX));
    const minZ = Math.min(...rects.map((r) => r.minZ)); const maxZ = Math.max(...rects.map((r) => r.maxZ));
    view.cx = (minX + maxX) / 2; view.cz = (minZ + maxZ) / 2;
    view.scale = Math.max(0.02, Math.min(40, 0.9 * Math.min(WIDTH / Math.max(1, maxX - minX), HEIGHT / Math.max(1, maxZ - minZ))));
  }
  if (!Number.isFinite(saved.scale)) fitAll();

  // ---- tekenen ----
  function pathShape(g, body) {
    g.beginPath();
    if (body.shape === "cylinder") {
      const [x, y] = toCanvas(m(body.centerXMm), m(body.centerZMm));
      g.arc(x, y, m(body.radiusMm) * view.scale, 0, Math.PI * 2);
    } else if (body.shape === "polygon") {
      body.pointsMm.forEach((point, index) => { const [x, y] = toCanvas(m(point[0]), m(point[1])); if (index) g.lineTo(x, y); else g.moveTo(x, y); });
      g.closePath();
    } else {
      const [x0, y0] = toCanvas(m(body.minXMm), m(body.minZMm));
      const [x1, y1] = toCanvas(m(body.maxXMm), m(body.maxZMm));
      g.rect(x0, y0, x1 - x0, y1 - y0);
    }
  }

  function drawCells(g) {
    const cell = mmToMeters(CELL_SIZE_MM);
    if (cell * view.scale < 12) return;
    const [wx0, wz0] = toWorld(0, 0); const [wx1, wz1] = toWorld(WIDTH, HEIGHT);
    g.strokeStyle = "rgba(148,163,184,.18)"; g.lineWidth = 1; g.font = "10px system-ui"; g.fillStyle = "rgba(148,163,184,.55)";
    for (let cx = Math.floor(wx0 / cell); cx <= Math.floor(wx1 / cell); cx += 1) {
      const [x] = toCanvas(cx * cell, 0); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, HEIGHT); g.stroke();
    }
    for (let cz = Math.floor(wz0 / cell); cz <= Math.floor(wz1 / cell); cz += 1) {
      const [, y] = toCanvas(0, cz * cell); g.beginPath(); g.moveTo(0, y); g.lineTo(WIDTH, y); g.stroke();
    }
    if (cell * view.scale >= 60) {
      for (let cx = Math.floor(wx0 / cell); cx <= Math.floor(wx1 / cell); cx += 1) {
        for (let cz = Math.floor(wz0 / cell); cz <= Math.floor(wz1 / cell); cz += 1) {
          const [x, y] = toCanvas(cx * cell, cz * cell); g.fillText(cx + "_" + cz, x + 3, y + 11);
        }
      }
    }
  }

  function draw() {
    const g = canvas.getContext("2d");
    g.fillStyle = "#0b1324"; g.fillRect(0, 0, WIDTH, HEIGHT);
    if (view.showCells) drawCells(g);
    // oorsprong
    const [ox, oy] = toCanvas(0, 0);
    g.strokeStyle = "rgba(148,163,184,.35)"; g.beginPath(); g.moveTo(ox - 6, oy); g.lineTo(ox + 6, oy); g.moveTo(ox, oy - 6); g.lineTo(ox, oy + 6); g.stroke();
    // zones uit Nodes (alleen oriëntatie)
    g.setLineDash([6, 4]); g.lineWidth = 1; g.font = "11px system-ui";
    for (const zone of zones) {
      const b = zone.bounds;
      if (!b || !(b.maxX > b.minX)) continue;
      const [x0, y0] = toCanvas(b.minX, b.minZ); const [x1, y1] = toCanvas(b.maxX, b.maxZ);
      g.strokeStyle = "#475569"; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      g.fillStyle = "#64748b"; g.fillText("zone: " + zone.label, x0 + 4, y1 - 4);
    }
    g.setLineDash([]);
    for (const doc of regions()) {
      const hue = hueFor(doc.body.regionId);
      pathShape(g, Object.assign({ shape: "box" }, doc.body));
      g.fillStyle = "hsla(" + hue + ",70%,50%,.16)"; g.fill();
      g.lineWidth = view.selected === doc.docKey ? 3 : 1.5; g.strokeStyle = view.selected === doc.docKey ? "#facc15" : "hsl(" + hue + ",70%,60%)"; g.stroke();
      const [x0, y0] = toCanvas(m(doc.body.minXMm), m(doc.body.minZMm));
      g.fillStyle = "#e2e8f0"; g.font = "600 12px system-ui"; g.fillText(doc.body.displayName, x0 + 5, y0 + 15);
    }
    for (const doc of areas()) {
      const hue = hueFor(doc.body.areaId);
      pathShape(g, doc.body);
      g.fillStyle = "hsla(" + hue + ",80%,60%,.14)"; g.fill();
      g.setLineDash([4, 3]); g.lineWidth = view.selected === doc.docKey ? 3 : 1.5; g.strokeStyle = view.selected === doc.docKey ? "#facc15" : "hsl(" + hue + ",80%,70%)"; g.stroke(); g.setLineDash([]);
      const b = areaBoundsMm(doc.body);
      const [cx, cy] = toCanvas(m((b.minXMm + b.maxXMm) / 2), m((b.minZMm + b.maxZMm) / 2));
      g.fillStyle = "#f8fafc"; g.font = "11px system-ui"; g.textAlign = "center"; g.fillText(doc.body.displayName, cx, cy + 4); g.textAlign = "start";
    }
    for (const doc of colliders()) {
      pathShape(g, doc.body);
      g.fillStyle = "rgba(239,68,68,.35)"; g.fill();
      g.lineWidth = view.selected === doc.docKey ? 3 : 1.5; g.strokeStyle = view.selected === doc.docKey ? "#facc15" : "#ef4444"; g.stroke();
    }
    drawPreview(g);
    drawPreviewPoint(g);
    renderPreviewBox();
    renderHint();
    renderDetail();
    renderList();
    renderZoneReport();
    for (const button of toolButtons) button.setAttribute("aria-pressed", String(button.dataset.cw === "tool-" + view.tool));
    finishPolygon.hidden = view.tool !== "polygon";
  }

  function drawPreview(g) {
    g.strokeStyle = "#facc15"; g.lineWidth = 2; g.setLineDash([5, 4]);
    if (drag && (drag.mode === "region" || drag.mode === "box" || drag.mode === "colliderBox")) {
      const [x0, y0] = toCanvas(Math.round(drag.start[0]), Math.round(drag.start[1]));
      const [x1, y1] = toCanvas(Math.round(drag.current[0]), Math.round(drag.current[1]));
      g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    }
    if (drag && (drag.mode === "cylinder" || drag.mode === "colliderCylinder")) {
      const [x, y] = toCanvas(Math.round(drag.start[0]), Math.round(drag.start[1]));
      g.beginPath(); g.arc(x, y, Math.round(Math.hypot(drag.current[0] - drag.start[0], drag.current[1] - drag.start[1])) * view.scale, 0, Math.PI * 2); g.stroke();
    }
    if (polygon.length) {
      g.beginPath();
      polygon.forEach((point, index) => { const [x, y] = toCanvas(point[0], point[1]); if (index) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
      for (const point of polygon) { const [x, y] = toCanvas(point[0], point[1]); g.fillStyle = "#facc15"; g.fillRect(x - 3, y - 3, 6, 6); }
    }
    g.setLineDash([]);
  }

  function drawPreviewPoint(g) {
    if (view.tool !== "preview" || !preview.point) return;
    const [x, y] = toCanvas(preview.point.x, preview.point.z);
    g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fillStyle = "#22c55e"; g.fill(); g.strokeStyle = "#0b1324"; g.lineWidth = 2; g.stroke();
  }

  function renderPreviewBox() {
    previewBox.hidden = view.tool !== "preview";
    if (previewBox.hidden) return;
    const r = preview.result;
    const where = !r ? "Klik of sleep op de kaart om een testspeler neer te zetten." :
      (r.regionName ? "Region: " + r.regionName + (r.areaName ? " · Area: " + r.areaName : " · geen Area") : "Buiten alle Regions") +
      " · Cell " + (r.cellKey || "-") + " · (" + r.x.toFixed(1) + ", " + r.z.toFixed(1) + ") m";
    const music = r ? (r.musicUrl ? "Muziek: " + r.musicAssetId + (preview.music ? " (" + preview.music.state() + ")" : "") : (r.musicAssetId ? "Muziek " + r.musicAssetId + " heeft geen URL (asset weg?)" : "Geen muziek")) : "";
    previewBox.replaceChildren(
      el("strong", { text: "Draft-preview (niet gepubliceerd, slaat niets op)" }),
      el("p", { "data-cw": "preview-where", text: where }),
      el("p", { class: "cwHint", text: music }),
      preview.errors.length ? el("p", { class: "cwHint", text: "Let op, publiceren zou nu blokkeren: " + preview.errors[0].message }) : null
    );
  }

  async function sendPreview(point) {
    if (preview.inFlight) { preview.queued = point; return; }
    preview.inFlight = true;
    try {
      const data = await api("/api/authoring/preview/membership", { method: "POST", body: { points: [point], previous: preview.previous } });
      if (signal.aborted) return;
      preview.result = data.results[0];
      preview.errors = data.errors || [];
      preview.previous = { regionId: preview.result.regionId, areaId: preview.result.areaId };
      if (preview.result.musicUrl || preview.music) {
        if (!preview.music) preview.music = createWorldMusic({ onStateChange: renderPreviewBox });
        preview.music.setTrack(preview.result.musicUrl || null);
      }
    } catch (error) {
      ctx.setStatus(friendlyError(error), "error");
    } finally {
      preview.inFlight = false;
    }
    renderPreviewBox();
    if (preview.queued && !signal.aborted) { const next = preview.queued; preview.queued = null; sendPreview(next); }
  }

  function movePreview(world) {
    preview.point = { x: Math.round(world[0] * 10) / 10, z: Math.round(world[1] * 10) / 10 };
    sendPreview(preview.point);
  }

  function renderHint() {
    const text = {
      select: "Klik op een vorm om hem te kiezen. Sleep op een lege plek om de kaart te schuiven. Scroll = zoomen.",
      region: "Sleep een rechthoek voor een nieuwe Region. Regions mogen elkaar raken maar niet overlappen.",
      box: "Sleep een rechthoek binnen een Region voor een nieuwe Area.",
      cylinder: "Klik het midden en sleep de straal, binnen een Region.",
      polygon: "Klik punten (minstens 3). Klik op het eerste punt, dubbelklik of druk op Polygoon klaar om af te sluiten. Esc = stoppen.",
      colliderBox: "Sleep een rechthoek binnen een Region: daar kan niemand doorheen lopen (bijv. een huis of rots zonder botsing).",
      colliderCylinder: "Klik het midden en sleep de straal: een rond obstakel (boom, paal).",
      preview: "Sleep de groene testspeler over een grens. De server rekent met je opgeslagen (nog niet gepubliceerde) vormen. Muziek start na je eerste klik."
    }[view.tool];
    hint.textContent = text + " Rechtermuisknop slepen = schuiven.";
  }

  function regionOptions(selectedKey) {
    const select = el("select", { "data-cw": "area-region" }, regions().map((doc) => el("option", { value: doc.docKey, text: doc.body.displayName })));
    select.value = selectedKey;
    return select;
  }

  function musicSelect(value) {
    const select = el("select", { "data-cw": "music" }, [el("option", { value: "", text: "(geen muziek)" })]
      .concat(audioAssets.map((asset) => el("option", { value: asset.id, text: asset.name || asset.id }))));
    select.value = value || "";
    return select;
  }

  function renderDetail() {
    const doc = selectedDoc();
    detail.hidden = !doc;
    if (!doc) { detail.replaceChildren(); return; }
    const body = doc.body;
    const name = el("input", { type: "text", maxlength: 80, "data-cw": "detail-name" }); name.value = body.displayName;
    const music = musicSelect(body.musicAssetId);
    const save = el("button", { type: "button", "data-cw": "save-shape", text: "Opslaan" });
    const remove = el("button", { type: "button", class: "ghost", text: "Verwijderen" });
    const fields = [];
    let collect;
    if (doc.kind === "region") {
      const inputs = ["minXMm", "maxXMm", "minZMm", "maxZMm"].map((key) => numberInput(m(body[key]), { "data-cw": key }));
      fields.push(el("div", { class: "cwRow" }, inputs.map((input, index) => el("label", {}, [el("span", { text: ["Min X", "Max X", "Min Z", "Max Z"][index] + " (m)" }), input]))));
      collect = () => ({
        regionId: body.regionId, displayName: name.value.trim(), legacyZoneRef: body.legacyZoneRef,
        minXMm: metersToMm(Number(inputs[0].value)), maxXMm: metersToMm(Number(inputs[1].value)),
        minZMm: metersToMm(Number(inputs[2].value)), maxZMm: metersToMm(Number(inputs[3].value)),
        musicAssetId: music.value || undefined
      });
    } else {
      const region = regionOptions(body.regionRef);
      const isArea = doc.kind === "area";
      const priority = numberInput(body.priority ?? 0, { min: 0, max: 100 });
      fields.push(el("label", {}, [el("span", { text: "Region (wisselen verplaatst niets: de vorm blijft op dezelfde plek)" }), region]));
      let shapeCollect;
      if (body.shape === "box") {
        const inputs = ["minXMm", "maxXMm", "minZMm", "maxZMm"].map((key) => numberInput(m(body[key]), { "data-cw": key }));
        fields.push(el("div", { class: "cwRow" }, inputs.map((input, index) => el("label", {}, [el("span", { text: ["Min X", "Max X", "Min Z", "Max Z"][index] + " (m)" }), input]))));
        shapeCollect = () => ({ minXMm: metersToMm(Number(inputs[0].value)), maxXMm: metersToMm(Number(inputs[1].value)), minZMm: metersToMm(Number(inputs[2].value)), maxZMm: metersToMm(Number(inputs[3].value)) });
      } else if (body.shape === "cylinder") {
        const inputs = ["centerXMm", "centerZMm", "radiusMm"].map((key) => numberInput(m(body[key]), { "data-cw": key }));
        fields.push(el("div", { class: "cwRow" }, inputs.map((input, index) => el("label", {}, [el("span", { text: ["Midden X", "Midden Z", "Straal"][index] + " (m)" }), input]))));
        shapeCollect = () => ({ centerXMm: metersToMm(Number(inputs[0].value)), centerZMm: metersToMm(Number(inputs[1].value)), radiusMm: metersToMm(Number(inputs[2].value)) });
      } else {
        fields.push(el("p", { class: "cwHint", text: "Polygoon met " + body.pointsMm.length + " punten. Teken opnieuw om de vorm te wijzigen." }));
        shapeCollect = () => ({ pointsMm: body.pointsMm });
      }
      if (isArea) fields.push(el("label", {}, [el("span", { text: "Prioriteit bij overlap (hoger wint)" }), priority]));
      // Fase 05: in een veilig gebied vecht niemand (vijanden laten je los, aanvallen wordt geweigerd).
      const safe = el("input", { type: "checkbox", "data-cw": "area-safe" });
      safe.checked = body.safe === true;
      if (isArea) fields.push(el("label", { class: "cwCheck" }, [safe, el("span", { text: "Veilig gebied (geen gevechten)" })]));
      collect = () => Object.assign(isArea ? {
        areaId: body.areaId, displayName: name.value.trim(), regionRef: region.value, shape: body.shape,
        priority: Math.max(0, Math.min(100, Math.floor(Number(priority.value) || 0))) || undefined,
        musicAssetId: music.value || undefined,
        safe: safe.checked || undefined
      } : { colliderId: body.colliderId, displayName: name.value.trim(), regionRef: region.value, shape: body.shape }, shapeCollect());
    }
    save.addEventListener("click", () => saveDoc(doc, collect()), { signal });
    remove.addEventListener("click", () => archiveDoc(doc), { signal });
    detail.replaceChildren(
      el("h3", { text: (doc.kind === "region" ? "Region: " : (doc.kind === "collider" ? "Obstakel" : "Area") + " (" + { box: "rechthoek", cylinder: "cirkel", polygon: "polygoon" }[body.shape] + "): ") + body.displayName }),
      el("p", { class: "cwHint", text: "ID " + (body.regionId || body.areaId || body.colliderId) + " · revisie " + doc.revision }),
      el("label", {}, [el("span", { text: "Naam" }), name]),
      ...fields,
      doc.kind === "collider" ? null : el("label", {}, [el("span", { text: "Muziek (" + (audioAssets.length ? "audio-assets" : "nog geen audio-assets geüpload") + ")" }), music]),
      el("div", { class: "cwRow" }, [save, remove])
    );
  }

  function renderList() {
    const rows = regions().map((region) => {
      const children = areas().concat(colliders()).filter((child) => child.body.regionRef === region.docKey);
      return el("li", {}, [
        el("a", { href: "#", "data-key": region.docKey, text: region.body.displayName }),
        children.length ? el("ul", {}, children.map((child) => el("li", {}, [el("a", { href: "#", "data-key": child.docKey, text: child.body.displayName + " (" + (child.kind === "collider" ? "obstakel, " : "") + child.body.shape + ")" })]))) : null
      ]);
    });
    listBox.replaceChildren(el("h3", { text: "Regions (" + regions().length + "), Areas (" + areas().length + ") en obstakels (" + colliders().length + ")" }), rows.length ? el("ul", {}, rows) : el("p", { class: "cwHint", text: "Nog niets getekend." }));
    for (const link of listBox.querySelectorAll("a[data-key]")) {
      link.addEventListener("click", (event) => { event.preventDefault(); view.selected = link.dataset.key; focusSelected(); persist(); draw(); }, { signal });
    }
  }

  // F4-E3-T03 (begin): elke oude zone is óf gekoppeld aan een Region, óf staat hier als "nog niet gekoppeld".
  function renderZoneReport() {
    const byZone = new Map(ctx.docs("region").filter((doc) => !doc.archived && doc.body.legacyZoneRef).map((doc) => [doc.body.legacyZoneRef, doc]));
    const rows = zones.map((zone) => {
      const region = byZone.get(zone.zoneId);
      const usable = zone.bounds && zone.bounds.maxX > zone.bounds.minX && zone.bounds.maxZ > zone.bounds.minZ;
      const status = region ? "gekoppeld aan Region " + region.body.displayName : (usable ? "nog niet gekoppeld" : "geen grenzen in Nodes: handmatig tekenen");
      return el("li", { "data-zone": zone.zoneId, "data-mapped": region ? "1" : "0", text: zone.label + " (" + zone.zoneId + "): " + status });
    });
    const open = zones.filter((zone) => !byZone.has(zone.zoneId)).length;
    zoneReport.replaceChildren(
      el("h3", { text: "Oude zones (" + zones.length + "): " + (open ? open + " nog niet gekoppeld" : "allemaal gekoppeld") }),
      rows.length ? el("ul", {}, rows) : el("p", { class: "cwHint", text: "Geen zones in Nodes." })
    );
  }

  async function importZonesAsRegions() {
    const mapped = new Set(ctx.docs("region").filter((doc) => !doc.archived && doc.body.legacyZoneRef).map((doc) => doc.body.legacyZoneRef));
    const todo = zones.filter((zone) => !mapped.has(zone.zoneId) && zone.bounds && zone.bounds.maxX > zone.bounds.minX && zone.bounds.maxZ > zone.bounds.minZ);
    if (!todo.length) { ctx.setStatus("Er zijn geen ongekoppelde zones met grenzen.", "info"); return; }
    importZones.disabled = true;
    const done = [];
    const failed = [];
    for (const zone of todo) {
      const taken = new Set(ctx.docs("region").map((doc) => doc.body.regionId));
      let regionId = "region." + (slug(zone.zoneId) || "zone");
      for (let n = 2; taken.has(regionId); n += 1) regionId = "region." + (slug(zone.zoneId) || "zone") + "_" + n;
      const body = {
        regionId, displayName: String(zone.label || zone.zoneId).slice(0, 80), legacyZoneRef: zone.zoneId,
        minXMm: metersToMm(zone.bounds.minX), maxXMm: metersToMm(zone.bounds.maxX), minZMm: metersToMm(zone.bounds.minZ), maxZMm: metersToMm(zone.bounds.maxZ)
      };
      try {
        await command({ command: "create", kind: "region", body });
        done.push(zone.label);
      } catch (error) {
        failed.push(zone.label + ": " + friendlyError(error));
      }
      await ctx.refresh();
      if (signal.aborted) return;
    }
    importZones.disabled = false;
    ctx.setStatus("Overgenomen: " + (done.join(", ") || "geen") + (failed.length ? ". Niet gelukt: " + failed.join("; ") : "."), failed.length ? "error" : "ok");
    draw();
  }

  function focusSelected() {
    const doc = selectedDoc();
    if (!doc) return;
    const b = doc.kind === "region" ? doc.body : areaBoundsMm(doc.body);
    view.cx = m((b.minXMm + b.maxXMm) / 2); view.cz = m((b.minZMm + b.maxZMm) / 2);
  }

  // ---- opslaan ----
  async function reload() { await ctx.refresh(); if (!signal.aborted) draw(); }

  function newId(prefix, kind, idField) {
    const base = slug(nameInput.value.trim() || prefix) || prefix;
    const taken = new Set(ctx.docs(kind).map((doc) => doc.body[idField]));
    let id = prefix + "." + base;
    let n = 2;
    while (taken.has(id)) { id = prefix + "." + base + "_" + n; n += 1; }
    return id;
  }

  function autoName(label, kind) {
    const typed = nameInput.value.trim();
    if (typed) return typed;
    return label + " " + (ctx.docs(kind).length + 1);
  }

  function clean(body) {
    for (const key of Object.keys(body)) if (body[key] === undefined || body[key] === null || body[key] === "") delete body[key];
    return body;
  }

  async function create(kind, body) {
    try {
      const result = await command({ command: "create", kind, body: clean(body) });
      view.selected = result.docKey;
      nameInput.value = "";
      persist();
      ctx.setStatus({ region: "Region", area: "Area", collider: "Obstakel" }[kind] + " gemaakt. Publiceer om het in de game te zien.", "ok");
    } catch (error) {
      ctx.setStatus(friendlyError(error), "error");
    }
    await reload();
  }

  async function saveDoc(doc, body) {
    try {
      await command({ command: "update", docKey: doc.docKey, body: clean(body) }, doc.revision);
      ctx.setStatus("Opgeslagen. Publiceer om het in de game te zien.", "ok");
    } catch (error) {
      ctx.setStatus(friendlyError(error), "error");
    }
    await reload();
  }

  async function archiveDoc(doc) {
    try {
      await command({ command: "archive", docKey: doc.docKey }, doc.revision);
      view.selected = null; persist();
      ctx.setStatus("Verwijderd (gearchiveerd).", "ok");
    } catch (error) {
      ctx.setStatus(error.code === "REF_IN_USE" ? "Verwijder eerst de Areas in deze Region." : friendlyError(error), "error");
    }
    await reload();
  }

  // De Region van een nieuwe Area: de Region waar de hele vorm in past.
  function regionForArea(body) {
    const bounds = areaBoundsMm(body);
    return regions().find((doc) => rectInside(bounds, doc.body)) || null;
  }

  function createArea(shapeBody, kind = "area") {
    const region = regionForArea(shapeBody);
    const label = kind === "collider" ? "Obstakel" : "Area";
    if (!region) { ctx.setStatus("Teken het " + label.toLowerCase() + " helemaal binnen één Region.", "error"); draw(); return; }
    const idField = kind === "collider" ? "colliderId" : "areaId";
    create(kind, Object.assign({ [idField]: newId(kind, kind, idField), displayName: autoName(label, kind), regionRef: region.docKey }, shapeBody));
  }

  function closePolygon() {
    if (polygon.length < 3) { ctx.setStatus("Een polygoon heeft minstens 3 punten.", "error"); return; }
    const pointsMm = polygon.map((point) => [snapMm(point[0]), snapMm(point[1])]);
    polygon = [];
    createArea({ shape: "polygon", pointsMm });
  }

  // ---- invoer ----
  function hitTest(x, z) {
    const xMm = metersToMm(x); const zMm = metersToMm(z);
    const hitCollider = colliders().find((doc) => areaContains(doc.body, xMm, zMm));
    if (hitCollider) return hitCollider;
    const hitAreas = areas().filter((doc) => areaContains(doc.body, xMm, zMm))
      .sort((a, b) => { const ba = areaBoundsMm(a.body); const bb = areaBoundsMm(b.body); return (ba.maxXMm - ba.minXMm) * (ba.maxZMm - ba.minZMm) - (bb.maxXMm - bb.minXMm) * (bb.maxZMm - bb.minZMm); });
    if (hitAreas.length) return hitAreas[0];
    return regions().find((doc) => rectContains(doc.body, xMm, zMm)) || null;
  }

  canvas.addEventListener("contextmenu", (event) => event.preventDefault(), { signal });
  canvas.addEventListener("pointerdown", (event) => {
    const [px, py] = pointer(event);
    const world = toWorld(px, py);
    canvas.setPointerCapture(event.pointerId);
    if (event.button === 1 || event.button === 2) { drag = { mode: "pan", last: [px, py] }; return; }
    if (view.tool === "select") {
      const doc = hitTest(world[0], world[1]);
      if (doc) { view.selected = doc.docKey; persist(); draw(); return; }
      drag = { mode: "pan", last: [px, py] };
      return;
    }
    if (view.tool === "preview") {
      if (preview.music) preview.music.unlock();
      drag = { mode: "preview" };
      movePreview(world);
      draw();
      return;
    }
    if (view.tool === "polygon") {
      if (polygon.length >= 3) {
        const [fx, fy] = toCanvas(polygon[0][0], polygon[0][1]);
        if (Math.hypot(fx - px, fy - py) <= 8) { closePolygon(); return; }
      }
      const point = [Math.round(world[0]), Math.round(world[1])];
      const last = polygon[polygon.length - 1];
      if (!last || last[0] !== point[0] || last[1] !== point[1]) polygon.push(point);
      draw();
      return;
    }
    drag = { mode: view.tool, start: world, current: world };
  }, { signal });

  canvas.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const [px, py] = pointer(event);
    if (drag.mode === "pan") {
      view.cx -= (px - drag.last[0]) / view.scale; view.cz -= (py - drag.last[1]) / view.scale;
      drag.last = [px, py];
    } else if (drag.mode === "preview") {
      movePreview(toWorld(px, py));
    } else {
      drag.current = toWorld(px, py);
    }
    draw();
  }, { signal });

  canvas.addEventListener("pointerup", () => {
    if (!drag) return;
    const current = drag;
    drag = null;
    if (current.mode === "pan") { persist(); return; }
    if (current.mode === "preview") return;
    const [sx, sz] = current.start; const [ex, ez] = current.current;
    const asCollider = current.mode === "colliderBox" || current.mode === "colliderCylinder";
    if (current.mode === "cylinder" || current.mode === "colliderCylinder") {
      const radius = Math.round(Math.hypot(ex - sx, ez - sz) * 2) / 2; // obstakels mogen 0,5 m-stappen
      if (radius < 1) { draw(); return; }
      createArea({ shape: "cylinder", centerXMm: snapMm(sx), centerZMm: snapMm(sz), radiusMm: metersToMm(asCollider ? radius : Math.round(radius)) }, asCollider ? "collider" : "area");
      return;
    }
    const rect = { minXMm: snapMm(Math.min(sx, ex)), maxXMm: snapMm(Math.max(sx, ex)), minZMm: snapMm(Math.min(sz, ez)), maxZMm: snapMm(Math.max(sz, ez)) };
    if (rect.maxXMm - rect.minXMm < 1000 || rect.maxZMm - rect.minZMm < 1000) { draw(); return; }
    if (current.mode === "region") create("region", Object.assign({ regionId: newId("region", "region", "regionId"), displayName: autoName("Region", "region") }, rect));
    else createArea(Object.assign({ shape: "box" }, rect), asCollider ? "collider" : "area");
  }, { signal });

  canvas.addEventListener("dblclick", (event) => { if (view.tool === "polygon" && polygon.length) { event.preventDefault(); closePolygon(); } }, { signal });

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const [px, py] = pointer(event);
    const before = toWorld(px, py);
    view.scale = Math.max(0.02, Math.min(40, view.scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2)));
    const after = toWorld(px, py);
    view.cx += before[0] - after[0]; view.cz += before[1] - after[1];
    persist(); draw();
  }, { signal, passive: false });

  window.addEventListener("keydown", (event) => { if (event.key === "Escape" && polygon.length) { polygon = []; draw(); } }, { signal });
  finishPolygon.addEventListener("click", closePolygon, { signal });
  importZones.addEventListener("click", importZonesAsRegions, { signal });
  fitButton.addEventListener("click", () => { fitAll(); persist(); draw(); }, { signal });
  cellsToggle.addEventListener("change", () => { view.showCells = cellsToggle.checked; persist(); draw(); }, { signal });

  signal.addEventListener("abort", () => { if (preview.music) preview.music.destroy(); preview.music = null; });
  draw();
}
