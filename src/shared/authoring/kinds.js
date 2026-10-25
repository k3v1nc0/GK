// F3-E1-T01: canonieke kinds. Alleen data: geen code, geen expressies, geen stille defaults bij read.
// Elk veld heeft een audience: "client" komt in het clientpakket, "server" alleen in het serverpakket.
// Fase 04: region en area (ruimte in integer mm, zie apps/web/public/shared/spatial.js).
// Fase 05: actors, aanvallen, loot en grondstoffen (kinds/actor.js, kinds/combat.js, kinds/loot.js).
import { AREA_SHAPES, MAX_WORLD_MM, polygonProblem } from "../../../apps/web/public/shared/spatial.js";
import { ACTOR_KINDS } from "./kinds/actor.js";
import { COMBAT_KINDS } from "./kinds/combat.js";
import { LOOT_ENTRY_KEYS, LOOT_KINDS } from "./kinds/loot.js";

const ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;
const ASSET_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const TAG_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,63}$/;

export const KIND_SCHEMA_VERSION = 1;

const MM = { min: -MAX_WORLD_MM, max: MAX_WORLD_MM };
const mmField = (label, required) => ({ type: "integer", required, min: MM.min, max: MM.max, audience: "client", label });

export const CANONICAL_KINDS = {
  project_settings: {
    label: "Projectinstellingen",
    singleton: true,
    domain: "project",
    fields: {
      gameName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam van de game" },
      motd: { type: "text", required: false, maxLength: 200, audience: "client", label: "Welkomsttekst" },
      // Fase 05: de aanval die een speler gebruikt tegen canonieke vijanden (geen hardcoded ability.basic_attack).
      playerAbilityRef: { type: "ref", refKind: "ability", required: false, audience: "client", label: "Aanval van de speler" }
    }
  },
  item_definition: {
    label: "Item",
    singleton: false,
    domain: "items",
    idField: "itemId",
    fields: {
      itemId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Item-ID" },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam" },
      category: { type: "select", required: true, options: ["material", "consumable", "equipment", "quest", "misc", "custom"], audience: "client", label: "Categorie" },
      rarity: { type: "select", required: true, options: ["common", "uncommon", "rare", "epic", "legendary", "quest", "custom"], audience: "client", label: "Zeldzaamheid" },
      stackable: { type: "boolean", required: true, audience: "client", label: "Stapelbaar" },
      stackLimit: { type: "integer", required: true, min: 1, max: 1000000, audience: "client", label: "Max. stapel" },
      bindPolicy: { type: "select", required: false, options: ["unbound", "bind_on_pickup", "bind_on_equip", "character_bound", "account_bound", "quest_bound"], audience: "client", label: "Binding" },
      tradable: { type: "boolean", required: false, audience: "client", label: "Verhandelbaar" },
      questItem: { type: "boolean", required: false, audience: "client", label: "Questitem" },
      iconAssetId: { type: "asset", assetType: "image", required: false, maxLength: 160, audience: "client", label: "Icoon" },
      worldModelAssetId: { type: "asset", assetType: "model", required: false, maxLength: 160, audience: "client", label: "Model in de wereld" },
      tags: { type: "tagList", required: false, maxItems: 32, audience: "client", label: "Tags" },
      vendorValue: { type: "integer", required: false, min: 0, max: 100000000000, audience: "server", label: "Verkoopwaarde" },
      // Fase 05 (F5-E2-T04): uitrusting. Het slot komt uit de bestaande slotlijst (Nodes); bonussen tellen mee in gevechten.
      equipSlot: { type: "id", required: false, maxLength: 120, audience: "client", label: "Uitrustingsslot" },
      attackPowerBonus: { type: "integer", required: false, min: 0, max: 1000000, audience: "client", label: "Extra aanvalskracht" },
      armorBonus: { type: "integer", required: false, min: 0, max: 1000000, audience: "client", label: "Extra pantser" }
    }
  },
  pickup: {
    label: "Pickup",
    singleton: false,
    domain: "pickups",
    idField: "pickupId",
    fields: {
      pickupId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Pickup-ID" },
      itemRef: { type: "ref", refKind: "item_definition", required: true, audience: "client", label: "Item" },
      zoneRef: { type: "id", required: true, maxLength: 120, audience: "client", label: "Zone" },
      x: { type: "number", required: true, min: -100000, max: 100000, audience: "client", label: "X" },
      y: { type: "number", required: true, min: -1000, max: 10000, audience: "client", label: "Y" },
      z: { type: "number", required: true, min: -100000, max: 100000, audience: "client", label: "Z" },
      amount: { type: "integer", required: true, min: 1, max: 9999, audience: "server", label: "Aantal" },
      respawnPolicyRef: { type: "id", required: false, maxLength: 120, audience: "server", label: "Respawnbeleid" }
    }
  },
  // F4-E1-T02: een Region is een exclusieve rechthoek in world-mm. Regions overlappen nooit (half-open grenzen).
  region: {
    label: "Region",
    singleton: false,
    domain: "world",
    idField: "regionId",
    fields: {
      regionId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Region-ID" },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam" },
      minXMm: mmField("Min X (mm)", true),
      maxXMm: mmField("Max X (mm)", true),
      minZMm: mmField("Min Z (mm)", true),
      maxZMm: mmField("Max Z (mm)", true),
      musicAssetId: { type: "asset", assetType: "audio", required: false, maxLength: 160, audience: "client", label: "Muziek" },
      // F4-E3-T03: expliciete koppeling met een oude zone uit Nodes (alleen voor het parityrapport).
      legacyZoneRef: { type: "text", required: false, maxLength: 120, audience: "server", label: "Oude zone" }
    }
  },
  // F4-E1-T02: een Area is een betekenisvorm binnen precies één Region: box, cylinder of polygon. Areas mogen overlappen.
  area: {
    label: "Area",
    singleton: false,
    domain: "world",
    idField: "areaId",
    fields: {
      areaId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Area-ID" },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam" },
      regionRef: { type: "ref", refKind: "region", required: true, audience: "client", label: "Region" },
      shape: { type: "select", required: true, options: AREA_SHAPES.slice(), audience: "client", label: "Vorm" },
      minXMm: mmField("Min X (mm)", false),
      maxXMm: mmField("Max X (mm)", false),
      minZMm: mmField("Min Z (mm)", false),
      maxZMm: mmField("Max Z (mm)", false),
      centerXMm: mmField("Midden X (mm)", false),
      centerZMm: mmField("Midden Z (mm)", false),
      radiusMm: { type: "integer", required: false, min: 1000, max: MAX_WORLD_MM, audience: "client", label: "Straal (mm)" },
      pointsMm: { type: "pointList", required: false, minItems: 3, maxItems: 64, min: MM.min, max: MM.max, audience: "client", label: "Punten (mm)" },
      // Alleen de server kiest de Area bij overlap; de client hoeft de prioriteit niet te kennen.
      priority: { type: "integer", required: false, min: 0, max: 100, audience: "server", label: "Prioriteit" },
      musicAssetId: { type: "asset", assetType: "audio", required: false, maxLength: 160, audience: "client", label: "Muziek" },
      // Fase 05: veilig gebied. Hier weigert de server elke aanval (van en op spelers) en jagen vijanden niet.
      safe: { type: "boolean", required: false, audience: "client", label: "Veilig gebied (geen gevechten)" }
    }
  },
  // F4-E1-T03: statische collider (obstakel) binnen een Region. Server-movement én client-prediction lezen exact
  // deze vorm (via world.collision.blockers), en de latere navtile-bake leest dezelfde mm-geometrie uit de build.
  collider: {
    label: "Obstakel",
    singleton: false,
    domain: "world",
    idField: "colliderId",
    fields: {
      colliderId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Obstakel-ID" },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam" },
      regionRef: { type: "ref", refKind: "region", required: true, audience: "client", label: "Region" },
      shape: { type: "select", required: true, options: AREA_SHAPES.slice(), audience: "client", label: "Vorm" },
      minXMm: mmField("Min X (mm)", false),
      maxXMm: mmField("Max X (mm)", false),
      minZMm: mmField("Min Z (mm)", false),
      maxZMm: mmField("Max Z (mm)", false),
      centerXMm: mmField("Midden X (mm)", false),
      centerZMm: mmField("Midden Z (mm)", false),
      radiusMm: { type: "integer", required: false, min: 100, max: MAX_WORLD_MM, audience: "client", label: "Straal (mm)" },
      pointsMm: { type: "pointList", required: false, minItems: 3, maxItems: 64, min: MM.min, max: MM.max, audience: "client", label: "Punten (mm)" }
    }
  },
  ...COMBAT_KINDS,
  ...LOOT_KINDS,
  ...ACTOR_KINDS
};

// Velden per Area-vorm. Een veld van een andere vorm is een fout (geen half-ingevulde vormen).
export const AREA_SHAPE_FIELDS = Object.freeze({
  box: ["minXMm", "maxXMm", "minZMm", "maxZMm"],
  cylinder: ["centerXMm", "centerZMm", "radiusMm"],
  polygon: ["pointsMm"]
});

export function kindSpec(kind) {
  return Object.prototype.hasOwnProperty.call(CANONICAL_KINDS, kind) ? CANONICAL_KINDS[kind] : null;
}

// Ref naar een ander document: altijd de doc-key van dat document (bijv. item_definition:item.ore).
export function docKeyFor(kind, body) {
  const spec = kindSpec(kind);
  if (!spec) return null;
  if (spec.singleton) return kind;
  return kind + ":" + String(body?.[spec.idField] || "");
}

function issue(field, code, message) {
  return { field, code, message };
}

// Valideert body tegen het schema. Geeft { ok, issues, refs } terug; vult niets aan.
export function validateDocument(kind, body) {
  const spec = kindSpec(kind);
  if (!spec) return { ok: false, issues: [issue("kind", "KIND_UNKNOWN", "Onbekend soort document: " + kind)], refs: [] };
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, issues: [issue("body", "BODY_INVALID", "Document moet een object zijn.")], refs: [] };
  }
  const issues = [];
  const refs = [];
  for (const key of Object.keys(body)) {
    if (!spec.fields[key]) issues.push(issue(key, "FIELD_UNKNOWN", "Onbekend veld: " + key));
  }
  for (const [key, field] of Object.entries(spec.fields)) {
    const value = body[key];
    const missing = value === undefined || value === null || value === "";
    if (missing) {
      if (field.required) issues.push(issue(key, "FIELD_REQUIRED", field.label + " is verplicht."));
      continue;
    }
    if (field.type === "text" || field.type === "id" || field.type === "select" || field.type === "ref") {
      if (typeof value !== "string") { issues.push(issue(key, "FIELD_TYPE", field.label + " moet tekst zijn.")); continue; }
      if (field.maxLength && value.length > field.maxLength) issues.push(issue(key, "FIELD_TOO_LONG", field.label + " is te lang."));
      if (field.type === "id" && !ID_PATTERN.test(value)) issues.push(issue(key, "FIELD_ID_INVALID", field.label + " mag alleen a-z, 0-9, _ en . bevatten."));
      if (field.type === "select" && !field.options.includes(value)) issues.push(issue(key, "FIELD_OPTION", field.label + " heeft een ongeldige keuze."));
      if (field.type === "ref") {
        if (!value.startsWith(field.refKind + ":")) issues.push(issue(key, "REF_KIND", field.label + " moet naar een " + field.refKind + " wijzen."));
        else refs.push(value);
      }
      continue;
    }
    if (field.type === "boolean") {
      if (typeof value !== "boolean") issues.push(issue(key, "FIELD_TYPE", field.label + " moet waar of onwaar zijn."));
      continue;
    }
    if (field.type === "asset") {
      if (typeof value !== "string" || value.length > field.maxLength || !ASSET_PATTERN.test(value)) issues.push(issue(key, "FIELD_ASSET", field.label + " is geen geldig asset."));
      continue;
    }
    if (field.type === "tagList") {
      if (!Array.isArray(value)) { issues.push(issue(key, "FIELD_TYPE", field.label + " moet een lijst zijn.")); continue; }
      if (value.length > field.maxItems) issues.push(issue(key, "FIELD_TOO_LONG", field.label + ": maximaal " + field.maxItems + "."));
      if (value.some((tag) => typeof tag !== "string" || !TAG_PATTERN.test(tag))) issues.push(issue(key, "FIELD_TAG", field.label + ": alleen kleine letters, cijfers, _ . : -"));
      if (new Set(value).size !== value.length) issues.push(issue(key, "FIELD_DUPLICATE", field.label + " bevat dubbele waarden."));
      continue;
    }
    if (field.type === "lootEntries") {
      lootEntryIssues(key, field, value, issues, refs);
      continue;
    }
    if (field.type === "pointList") {
      if (!Array.isArray(value)) { issues.push(issue(key, "FIELD_TYPE", field.label + " moet een lijst zijn.")); continue; }
      if (value.length < field.minItems || value.length > field.maxItems) issues.push(issue(key, "FIELD_RANGE", field.label + ": " + field.minItems + " tot " + field.maxItems + " punten."));
      const bad = value.some((point) => !Array.isArray(point) || point.length !== 2 || point.some((n) => !Number.isInteger(n) || n < field.min || n > field.max));
      if (bad) issues.push(issue(key, "FIELD_POINT", field.label + ": elk punt is [x, z] in hele mm."));
      continue;
    }
    if (field.type === "number" || field.type === "integer") {
      if (typeof value !== "number" || !Number.isFinite(value)) { issues.push(issue(key, "FIELD_TYPE", field.label + " moet een getal zijn.")); continue; }
      if (field.type === "integer" && !Number.isInteger(value)) issues.push(issue(key, "FIELD_INTEGER", field.label + " moet een heel getal zijn."));
      if (value < field.min || value > field.max) issues.push(issue(key, "FIELD_RANGE", field.label + " moet tussen " + field.min + " en " + field.max + " liggen."));
    }
  }
  if (!issues.length) shapeIssues(kind, body, issues);
  return { ok: issues.length === 0, issues, refs: Array.from(new Set(refs)) };
}

// Fase 05: een loottabelregel wijst naar een item óf een andere loottabel, met kans (basispunten) en aantallen.
function lootEntryIssues(key, field, value, issues, refs) {
  if (!Array.isArray(value)) { issues.push(issue(key, "FIELD_TYPE", field.label + " moet een lijst zijn.")); return; }
  if (value.length < field.minItems || value.length > field.maxItems) issues.push(issue(key, "FIELD_RANGE", field.label + ": " + field.minItems + " tot " + field.maxItems + " regels."));
  value.forEach((entry, index) => {
    const where = "Regel " + (index + 1);
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) { issues.push(issue(key, "LOOT_ENTRY", where + " is ongeldig.")); return; }
    const unknown = Object.keys(entry).filter((name) => !LOOT_ENTRY_KEYS.includes(name));
    if (unknown.length) issues.push(issue(key, "FIELD_UNKNOWN", where + ": onbekend veld " + unknown.join(", ")));
    const hasItem = typeof entry.itemRef === "string" && entry.itemRef !== "";
    const hasTable = typeof entry.tableRef === "string" && entry.tableRef !== "";
    if (hasItem === hasTable) issues.push(issue(key, "LOOT_ENTRY_TARGET", where + ": kies een item óf een loottabel."));
    if (hasItem) {
      if (!entry.itemRef.startsWith("item_definition:")) issues.push(issue(key, "REF_KIND", where + ": item moet naar een item_definition wijzen."));
      else refs.push(entry.itemRef);
    }
    if (hasTable) {
      if (!entry.tableRef.startsWith("loot_table:")) issues.push(issue(key, "REF_KIND", where + ": tabel moet naar een loot_table wijzen."));
      else refs.push(entry.tableRef);
    }
    const intIn = (name, min, max) => Number.isInteger(entry[name]) && entry[name] >= min && entry[name] <= max;
    if (!intIn("chanceBp", 1, 10000)) issues.push(issue(key, "LOOT_CHANCE", where + ": kans moet 1 tot 10000 basispunten zijn (10000 = altijd)."));
    if (!intIn("minQty", 1, 9999) || !intIn("maxQty", 1, 9999)) issues.push(issue(key, "LOOT_QTY", where + ": aantal moet 1 tot 9999 zijn."));
    else if (entry.minQty > entry.maxQty) issues.push(issue(key, "LOOT_QTY", where + ": minimum is groter dan maximum."));
  });
}

// Vormregels die over meerdere velden gaan (alleen als de losse velden al kloppen).
function shapeIssues(kind, body, issues) {
  if (kind === "actor_archetype") {
    if (body.leashRangeMm < body.aggroRangeMm) issues.push(issue("leashRangeMm", "LEASH_TOO_SMALL", "Max. afstand van huis moet minstens zo groot zijn als de afstand waarop de vijand je ziet."));
    return;
  }
  if (kind === "loot_table") {
    const own = "loot_table:" + body.lootTableId;
    if (body.entries.some((entry) => entry.tableRef === own)) issues.push(issue("entries", "LOOT_CYCLE", "Een loottabel kan niet naar zichzelf wijzen."));
    return;
  }
  if (kind === "item_definition") {
    if (body.equipSlot && body.stackable !== false) issues.push(issue("stackable", "EQUIP_STACKABLE", "Uitrusting kan niet stapelbaar zijn: zet Stapelbaar uit."));
    return;
  }
  if (kind === "region") {
    if (body.minXMm >= body.maxXMm || body.minZMm >= body.maxZMm) issues.push(issue("maxXMm", "REGION_EMPTY", "Een Region moet breedte en diepte hebben (min < max)."));
    return;
  }
  if (kind !== "area" && kind !== "collider") return;
  const own = AREA_SHAPE_FIELDS[body.shape];
  for (const [shape, fields] of Object.entries(AREA_SHAPE_FIELDS)) {
    for (const field of fields) {
      const present = body[field] !== undefined && body[field] !== null && body[field] !== "";
      if (shape === body.shape && !present) issues.push(issue(field, "FIELD_REQUIRED", "Vorm " + body.shape + " vraagt " + field + "."));
      if (shape !== body.shape && !own.includes(field) && present) issues.push(issue(field, "SHAPE_FIELD", field + " hoort niet bij vorm " + body.shape + "."));
    }
  }
  if (issues.length) return;
  if (body.shape === "box" && (body.minXMm >= body.maxXMm || body.minZMm >= body.maxZMm)) issues.push(issue("maxXMm", "AREA_EMPTY", "Een rechthoek moet breedte en diepte hebben (min < max)."));
  if (body.shape === "polygon") {
    const problem = polygonProblem(body.pointsMm);
    if (problem) issues.push(issue("pointsMm", problem, "De polygoon is ongeldig (" + problem + ")."));
  }
}

// Splitst een gevalideerde body per audience.
export function splitByAudience(kind, body) {
  const spec = kindSpec(kind);
  const client = {};
  const server = {};
  for (const [key, field] of Object.entries(spec.fields)) {
    if (body[key] === undefined || body[key] === null || body[key] === "") continue;
    server[key] = body[key];
    if (field.audience === "client") client[key] = body[key];
  }
  return { client, server };
}
