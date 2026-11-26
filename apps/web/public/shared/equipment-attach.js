// Uitrusting U1a (25-11): bevestigpunten op het lichaam (rechterhand, linkerhand, rug, heup).
// Puur: geen three-import. De editor (🧍 Passen), straks de game (U1b) en de tests delen dit bestand;
// wie objecten maakt geeft zijn eigen THREE mee.
//
// Opbouw aan het bot:  bot → schaal-gelijk (zelfde schaal als het hele character) → punt (verschuiving per
// uiterlijk, Klasse > Bevestigpunten) → houder (verschuiving, draai en grootte van het item) → het model.
// Zo zijn alle verschuivingen in meters, ook als het skelet zelf in centimeters is (Mixamo-armature 0,01).

export const ATTACH_POINTS = Object.freeze([
  Object.freeze({ key: "right_hand", name: "Rechterhand", icon: "✋", bones: Object.freeze(["RightHand"]) }),
  Object.freeze({ key: "left_hand", name: "Linkerhand", icon: "🤚", bones: Object.freeze(["LeftHand"]) }),
  Object.freeze({ key: "back", name: "Rug", icon: "🎒", bones: Object.freeze(["Spine2", "Spine1", "Spine"]) }),
  Object.freeze({ key: "hip", name: "Heup", icon: "🩳", bones: Object.freeze(["Hips"]) })
]);
export const ATTACH_POINT_KEYS = Object.freeze(ATTACH_POINTS.map((point) => point.key));

const SLOT_POINT = Object.freeze({ main_hand: "right_hand", off_hand: "left_hand" });
const DEG = Math.PI / 180;
const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

export function attachPointDef(key) {
  return ATTACH_POINTS.find((point) => point.key === key) || null;
}

// Welk punt een item gebruikt: het eigen veld "Waar op het lichaam", anders vanzelf uit de uitrustingsplek.
export function attachPointForItem(item) {
  const own = String(item?.bodyPoint || "auto");
  if (own !== "auto" && ATTACH_POINT_KEYS.includes(own)) return own;
  const slot = String(item?.equipSlot || item?.equipmentSlotRef || "").replace(/^equipment_slot\./, "");
  return SLOT_POINT[slot] || null;
}

// Het model aan het lichaam: eigen model, anders het model op de grond.
export function bodyModelForItem(item) {
  return String(item?.bodyModelAssetId || item?.worldModelAssetId || "").trim() || null;
}

export function boneNames(root) {
  const names = [];
  root?.traverse?.((object) => { if (object.isBone && object.name) names.push(object.name); });
  return names;
}

// Past een botnaam bij een gezochte naam? "mixamorigRightHand" en "mixamorig:RightHand" passen bij RightHand,
// "RightHandIndex1" niet.
export function boneNameMatches(name, wanted) {
  const a = String(name || "").toLowerCase();
  const b = String(wanted || "").toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (!a.endsWith(b)) return false;
  const before = a.slice(0, a.length - b.length);
  return /(^|[^a-z0-9])$/.test(before) || /mixamorig[:_]?$/.test(before);
}

// Het bot voor een punt: het gekozen bot als dat bestaat, anders vanzelf op naam.
export function findAttachBone(root, pointKey, boneName = "") {
  const bones = [];
  root?.traverse?.((object) => { if (object.isBone) bones.push(object); });
  if (!bones.length) return null;
  if (boneName) {
    const own = bones.find((bone) => bone.name === boneName);
    if (own) return own;
  }
  for (const wanted of attachPointDef(pointKey)?.bones || []) {
    const hit = bones.find((bone) => boneNameMatches(bone.name, wanted));
    if (hit) return hit;
  }
  return null;
}

// Verschuiving van het item (velden van 👕 Aan het lichaam).
export function itemBodyOffset(item) {
  return {
    x: num(item?.bodyX), y: num(item?.bodyY), z: num(item?.bodyZ),
    rx: num(item?.bodyRotX), ry: num(item?.bodyRotY), rz: num(item?.bodyRotZ),
    s: Math.max(0.01, num(item?.bodyScaleBp, 10000) / 10000)
  };
}

// Verschuiving van het punt van een uiterlijk (Klasse > Bevestigpunten).
export function lookPointEntry(attachPoints, assetId, pointKey) {
  const entry = attachPoints && typeof attachPoints === "object" ? attachPoints[assetId]?.[pointKey] : null;
  return entry && typeof entry === "object" ? entry : {};
}

export function pointOffset(entry) {
  return { x: num(entry?.x), y: num(entry?.y), z: num(entry?.z), rx: num(entry?.rx), ry: num(entry?.ry), rz: num(entry?.rz), s: 1 };
}

const round = (value, step) => Math.round(value / step) * step;
const angle = (value) => { const a = round(((num(value) % 360) + 360) % 360, 0.1); return a >= 360 ? 0 : Number(a.toFixed(1)); };

// Netjes voor opslaan: mm en tienden van graden; nullen weglaten.
export function cleanPointEntry(offset, bone = "") {
  const out = {};
  if (bone) out.bone = String(bone).slice(0, 120);
  for (const key of ["x", "y", "z"]) { const v = Number(round(Math.max(-2, Math.min(2, num(offset?.[key]))), 0.001).toFixed(3)); if (v) out[key] = v; }
  for (const key of ["rx", "ry", "rz"]) { const v = angle(offset?.[key]); if (v) out[key] = v; }
  return out;
}

export function itemOffsetFields(offset) {
  return {
    bodyX: Number(round(Math.max(-2, Math.min(2, num(offset?.x))), 0.001).toFixed(3)),
    bodyY: Number(round(Math.max(-2, Math.min(2, num(offset?.y))), 0.001).toFixed(3)),
    bodyZ: Number(round(Math.max(-2, Math.min(2, num(offset?.z))), 0.001).toFixed(3)),
    bodyRotX: angle(offset?.rx), bodyRotY: angle(offset?.ry), bodyRotZ: angle(offset?.rz),
    bodyScaleBp: Math.max(100, Math.min(100000, Math.round(num(offset?.s, 1) * 10000)))
  };
}

function applyOffset(object, offset) {
  object.position.set(num(offset?.x), num(offset?.y), num(offset?.z));
  object.rotation.set(num(offset?.rx) * DEG, num(offset?.ry) * DEG, num(offset?.rz) * DEG, "XYZ");
  const s = num(offset?.s, 1);
  object.scale.set(s, s, s);
}

// Hangt een model aan een bot. Geeft { level, point, holder } terug; setAttachOffsets past het daarna aan.
export function attachToBone(THREE, characterRoot, bone, model, point = null, item = null) {
  characterRoot.updateMatrixWorld(true);
  const rootScale = new THREE.Vector3();
  const boneScale = new THREE.Vector3();
  characterRoot.getWorldScale(rootScale);
  bone.getWorldScale(boneScale);
  const level = new THREE.Group();
  level.name = "gkAttachLevel";
  level.scale.set(rootScale.x / (boneScale.x || 1), rootScale.y / (boneScale.y || 1), rootScale.z / (boneScale.z || 1));
  const pointGroup = new THREE.Group();
  pointGroup.name = "gkAttachPoint";
  const holder = new THREE.Group();
  holder.name = "gkAttachItem";
  bone.add(level);
  level.add(pointGroup);
  pointGroup.add(holder);
  if (model) holder.add(model);
  const attach = { level, point: pointGroup, holder };
  setAttachOffsets(attach, point, item);
  return attach;
}

export function setAttachOffsets(attach, point, item) {
  if (!attach) return;
  applyOffset(attach.point, Object.assign({}, point || {}, { s: 1 }));
  applyOffset(attach.holder, item || { s: 1 });
  attach.level.updateMatrixWorld(true);
}

export function detachFromBone(attach) {
  attach?.level?.parent?.remove(attach.level);
}

// Uitrusting U1b (25-11): wat een speler draagt (item-ID's van de server) → wat er aan het lichaam hangt.
// items = catalogs.items (de build), lookPoints = attachPoints van dit uiterlijk (Klasse > ✋). Alleen items met een
// punt (wapenhand, andere hand of een eigen punt) en een model. Puur en gesorteerd, zodat een gelijke lijst gelijk blijft.
export function gearFromItems(itemIds, items, lookPoints = null) {
  const out = [];
  for (const itemId of Array.isArray(itemIds) ? itemIds : []) {
    const item = items && typeof items === "object" ? items[itemId] : null;
    if (!item) continue;
    const pointKey = attachPointForItem(item);
    const assetId = bodyModelForItem(item);
    if (!pointKey || !assetId) continue;
    const entry = lookPoints && typeof lookPoints === "object" && lookPoints[pointKey] && typeof lookPoints[pointKey] === "object" ? lookPoints[pointKey] : {};
    const row = { itemId: String(itemId), assetId, pointKey, boneName: typeof entry.bone === "string" ? entry.bone : "", point: pointOffset(entry), item: itemBodyOffset(item) };
    // L3 (26-11): geeft het item licht (fakkel), dan brandt de vlam in de hand.
    if (item.light && typeof item.light === "object") row.light = Object.assign({}, item.light);
    out.push(row);
  }
  return out.sort((a, b) => (a.pointKey + a.itemId).localeCompare(b.pointKey + b.itemId));
}
