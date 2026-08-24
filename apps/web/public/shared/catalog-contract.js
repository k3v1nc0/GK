import { canonicalJsonStringify, normalizeCanonicalId, normalizeTagQuery } from "./node-contract.js";

export const CATALOG_SCHEMA_VERSION = "gk-catalog-v1";

export const CATALOG_SECTION_KEYS = Object.freeze([
  "items",
  "itemModifiers",
  "resources",
  "currencies",
  "equipmentSlots",
  "stats",
  "statBlocks",
  "statCurves",
  "abilities",
  "abilityRanks",
  "statusEffects",
  "damageTypes",
  "combatProfiles",
  "enemies",
  "npcs",
  "variants",
  "aiProfiles",
  "pathBehaviors",
  "animationSets",
  "lootTables",
  "recipes",
  "vendorCatalogs",
  "factions",
  "reputationTracks",
  "musicTracks",
  "musicPlaylists",
  "audioEvents",
  "vfx",
  "difficultyProfiles",
  "respawnPolicies"
]);

export const EMPTY_CATALOG = Object.freeze(CATALOG_SECTION_KEYS.reduce(function (catalog, key) {
  catalog[key] = Object.freeze({});
  return catalog;
}, {}));

export function createEmptyCatalog() {
  return CATALOG_SECTION_KEYS.reduce(function (catalog, key) {
    catalog[key] = {};
    return catalog;
  }, {});
}

export function definitionContentHash(definition) {
  const cryptoApi = globalThis.crypto;
  const text = canonicalJsonStringify(definition || {});
  if (cryptoApi?.subtle) return null;
  return "json:" + text.length + ":" + text.slice(0, 80);
}

export function catalogLookup(catalog, sectionKey, id) {
  const key = normalizeCanonicalId(id, "");
  if (!key) return null;
  return catalog?.[sectionKey]?.[key] || null;
}

export function tagQueryMatches(tags, query) {
  const tagSet = new Set(Array.isArray(tags) ? tags : []);
  const normalized = normalizeTagQuery(query);
  return normalized.all.every(function (tag) { return tagSet.has(tag); })
    && (!normalized.any.length || normalized.any.some(function (tag) { return tagSet.has(tag); }))
    && normalized.none.every(function (tag) { return !tagSet.has(tag); });
}
