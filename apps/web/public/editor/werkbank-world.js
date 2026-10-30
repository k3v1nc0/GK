// Ombouw stap 1 (plan §13): de Werkbank werkt in de echte 3D-wereld, zonder eigen 2D-laag.
// - Een pickup staat in de editor met de mesh van zijn item (de server legt de documenten over de editorwereld,
//   zie AuthoringRoutes.editorDraftWorld). Klikken en G lopen via de gewone 3D-selectie in editor.js.
// - Hier alleen: een Bibliotheek-kaart op de wereld laten vallen = nieuw document op die plek,
//   en vorm wisselen voor vlakken (wordt de Area tool in stap 2).
import { areaBoundsMm } from "../shared/spatial.js";

export const DOC_MIME = "application/x-gk-doc";
export const EDITOR_DOC_PREFIX = "doc:";

const round2 = (value) => Math.round(Number(value) * 100) / 100;
const clone = (value) => JSON.parse(JSON.stringify(value));

// "doc:pickup:pickup.brood_1" -> "pickup:pickup.brood_1"
export function docKeyFromRuntimeId(runtimeId) {
  const text = String(runtimeId || "");
  return text.startsWith(EDITOR_DOC_PREFIX) ? text.slice(EDITOR_DOC_PREFIX.length) : null;
}

export function runtimeIdForDocKey(docKey) {
  return docKey ? EDITOR_DOC_PREFIX + docKey : null;
}

// Vorm wisselen in het paneel (⬛/⚪/🔷): de nieuwe vorm komt op dezelfde plek als de oude.
export function convertShape(body, shape) {
  let b = null;
  try { b = areaBoundsMm(body); } catch {}
  if (!b || ![b.minXMm, b.maxXMm, b.minZMm, b.maxZMm].every(Number.isFinite) || b.maxXMm <= b.minXMm || b.maxZMm <= b.minZMm) {
    b = { minXMm: 0, maxXMm: 4000, minZMm: 0, maxZMm: 4000 };
  }
  const next = clone(body);
  for (const key of ["minXMm", "maxXMm", "minZMm", "maxZMm", "centerXMm", "centerZMm", "radiusMm", "pointsMm"]) delete next[key];
  next.shape = shape;
  if (shape === "box") Object.assign(next, b);
  if (shape === "cylinder") {
    next.centerXMm = Math.round((b.minXMm + b.maxXMm) / 2);
    next.centerZMm = Math.round((b.minZMm + b.maxZMm) / 2);
    next.radiusMm = Math.max(1000, Math.round(Math.min(b.maxXMm - b.minXMm, b.maxZMm - b.minZMm) / 2));
  }
  if (shape === "polygon") next.pointsMm = [[b.minXMm, b.minZMm], [b.maxXMm, b.minZMm], [b.maxXMm, b.maxZMm], [b.minXMm, b.maxZMm]];
  return next;
}

// Region (rechthoek in mm) waar een punt in ligt; leeg = gewoon in de wereld.
export function regionRefAt(bench, xMm, zMm) {
  const hit = bench.docs("region").find((doc) => [doc.body.minXMm, doc.body.maxXMm, doc.body.minZMm, doc.body.maxZMm].every(Number.isFinite)
    && xMm >= doc.body.minXMm && xMm <= doc.body.maxXMm && zMm >= doc.body.minZMm && zMm <= doc.body.maxZMm);
  return hit ? hit.docKey : null;
}

// Bibliotheek-kaart op de 3D-wereld laten vallen:
// item = altijd een nieuwe pickup; vijand/grondstof = altijd een nieuwe plek; NPC = verplaatsen.
// placed_model staat niet meer in de Bibliotheek, maar een oude/open tab die zo'n kaart nog
// sleept krijgt voor de veiligheid een kopie. De bronplaatsing wordt nooit verplaatst.
export function createDocDrop({ bench, getRuntime, getActiveZoneId, onSelect, setStatus }) {
  function zoneAt(x, z) {
    const zones = bench.workspace?.zones || [];
    const hit = zones.find((zone) => zone.bounds && x >= zone.bounds.minX && x <= zone.bounds.maxX && z >= zone.bounds.minZ && z <= zone.bounds.maxZ);
    return hit ? hit.zoneId : (getActiveZoneId() || zones[0]?.zoneId || "");
  }

  function numberedId(kind, base) {
    const idField = bench.spec(kind).idField;
    const taken = new Set(bench.docs(kind, true).map((doc) => doc.body[idField]));
    for (let n = 1; ; n += 1) if (!taken.has(base + "_" + n)) return base + "_" + n;
  }

  function accepts(event) {
    return Array.from(event.dataTransfer?.types || []).includes(DOC_MIME);
  }

  function handleDragOver(event) {
    if (!accepts(event)) return false;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    return true;
  }

  async function save(kind, doc, body, label) {
    try {
      const result = await bench.saveDoc(kind, doc, body, label);
      onSelect(result.docKey);
    } catch {
      // saveDoc meldt de fout in de statusregel.
    }
  }

  async function handleDrop(event) {
    const docKey = event.dataTransfer?.getData(DOC_MIME);
    if (!docKey) return false;
    event.preventDefault();
    const source = bench.doc(docKey);
    const kinds = ["item_definition", "actor_archetype", "resource_definition", "npc", "placed_model"];
    if (!source || source.archived || !kinds.includes(source.kind)) {
      setStatus("Sleep een item, vijand, grondstof of NPC op de wereld; sleep losse modellen vanuit Assets.", "");
      return true;
    }
    const runtime = getRuntime();
    const ground = runtime && typeof runtime.screenToGround === "function" ? runtime.screenToGround(event.clientX, event.clientY) : null;
    if (!ground || !Number.isFinite(ground.x) || !Number.isFinite(ground.z)) { setStatus("Geen grond onder de muis.", "error"); return true; }
    const x = round2(ground.x);
    const y = round2(Number(ground.y) || 0);
    const z = round2(ground.z);
    const idPart = String(source.body[bench.spec(source.kind).idField] || "x").split(".").pop();
    if (source.kind === "item_definition") {
      const zoneRef = zoneAt(ground.x, ground.z);
      if (!zoneRef) { setStatus("Hier ligt geen wereld.", "error"); return true; }
      await save("pickup", null, { pickupId: numberedId("pickup", "pickup." + idPart), itemRef: docKey, zoneRef, x, y, z, amount: 1 }, "Pickup neergezet");
    } else if (source.kind === "actor_archetype" || source.kind === "resource_definition") {
      const xMm = Math.round(ground.x * 1000);
      const zMm = Math.round(ground.z * 1000);
      const regionRef = regionRefAt(bench, xMm, zMm);
      const body = source.kind === "actor_archetype"
        ? { spawnId: numberedId("actor_spawn", "spawn." + idPart), archetypeRef: docKey, xMm, zMm }
        : { resourceSpawnId: numberedId("resource_spawn", "node." + idPart), resourceRef: docKey, xMm, zMm };
      if (regionRef) body.regionRef = regionRef;
      await save(source.kind === "actor_archetype" ? "actor_spawn" : "resource_spawn", null, body,
        source.kind === "actor_archetype" ? "Vijand neergezet" : "Grondstof neergezet");
    } else if (source.kind === "placed_model") {
      const copyBody = Object.assign({}, source.body, {
        placedModelId: numberedId("placed_model", String(source.body.placedModelId || "model.kopie")),
        x, y, z
      });
      await save("placed_model", null, copyBody, "Model opnieuw geplaatst");
    } else {
      await save("npc", source, Object.assign({}, source.body, { x, y, z }), "NPC verplaatst");
    }
    return true;
  }

  return { handleDragOver, handleDrop };
}
