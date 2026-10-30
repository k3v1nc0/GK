// Ombouw stap 2: vlakken en lijnen (begroeiing, pad, blokkade, loopvlak) uit documenten naar de build.
// De build bewaart per vlak de waarden zoals de oude node ze had; de wereld tekent ze met dezelfde read-models.
import { AREA_SOORTEN, areaNodeValues, areaSoort } from "../../shared/authoring/kinds/area.js";

// "areas:<nodeType>:<runtimeId>" -> { nodeType, runtimeId }
export function parseAreaLegacyRef(legacyRef) {
  const match = /^areas:([a-z_]+):(.+)$/.exec(String(legacyRef || ""));
  return match ? { nodeType: match[1], runtimeId: match[2] } : null;
}

const isShape = (doc) => doc.kind === "area" && areaSoort(doc.body) !== "deelgebied";

// Geeft null als er geen vlakken zijn (dan blijft een oudere build bytegelijk).
export function compileAreaShapes(known, options = {}) {
  const docs = known.filter(isShape);
  if (!docs.length) return null;
  const errors = [];
  const assetTypes = options.assetTypes || null;
  const shapes = [];
  const removed = [];
  for (const doc of docs) {
    const legacy = parseAreaLegacyRef(doc.legacyRef);
    if (doc.archived) {
      if (legacy) removed.push(legacy);
      continue;
    }
    const soort = areaSoort(doc.body);
    const def = AREA_SOORTEN[soort];
    const runtimeId = legacy ? legacy.runtimeId : "area." + doc.body.areaId;
    const values = areaNodeValues(doc.body, runtimeId);
    if (assetTypes) {
      const check = (assetId, wanted, what) => {
        if (!assetId) return;
        if (!assetTypes.has(assetId)) errors.push({ code: "ASSET_UNKNOWN", docKey: doc.docKey, message: doc.body.displayName + " gebruikt onbekend " + what + " " + assetId });
        else if (!wanted.includes(assetTypes.get(assetId))) errors.push({ code: "ASSET_TYPE", docKey: doc.docKey, message: doc.body.displayName + ": " + assetId + " is geen " + wanted.join("/") });
      };
      for (const key of ["textureAssetId", "secondaryTextureAssetId", "edgeFadeNoiseAssetId"]) check(values[key], ["texture", "image"], "plaatje");
      for (const assetId of Array.isArray(values.sourceAssetIds) ? values.sourceAssetIds : []) check(assetId, ["model"], "model");
    }
    shapes.push({ areaId: doc.body.areaId, soort, nodeType: def.nodeType, runtimeId, legacy: legacy || null, values });
  }
  return { server: { areaShapes: shapes, removedLegacyAreas: removed }, errors };
}
