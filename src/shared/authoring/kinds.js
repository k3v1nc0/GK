// F3-E1-T01: canonieke kinds. Alleen data: geen code, geen expressies, geen stille defaults bij read.
// Elk veld heeft een audience: "client" komt in het clientpakket, "server" alleen in het serverpakket.

const ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;
const ASSET_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const TAG_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,63}$/;

export const KIND_SCHEMA_VERSION = 1;

export const CANONICAL_KINDS = {
  project_settings: {
    label: "Projectinstellingen",
    singleton: true,
    domain: "project",
    fields: {
      gameName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam van de game" },
      motd: { type: "text", required: false, maxLength: 200, audience: "client", label: "Welkomsttekst" }
    }
  },
  item_definition: {
    label: "Item",
    singleton: false,
    domain: "items",
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
      vendorValue: { type: "integer", required: false, min: 0, max: 100000000000, audience: "server", label: "Verkoopwaarde" }
    }
  },
  pickup: {
    label: "Pickup",
    singleton: false,
    domain: "pickups",
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
  }
};

export function kindSpec(kind) {
  return Object.prototype.hasOwnProperty.call(CANONICAL_KINDS, kind) ? CANONICAL_KINDS[kind] : null;
}

// Ref naar een ander document: altijd de doc-key van dat document (bijv. item_definition:item.ore).
export function docKeyFor(kind, body) {
  const spec = kindSpec(kind);
  if (!spec) return null;
  if (spec.singleton) return kind;
  const idField = kind === "item_definition" ? "itemId" : "pickupId";
  return kind + ":" + String(body?.[idField] || "");
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
    if (field.type === "number" || field.type === "integer") {
      if (typeof value !== "number" || !Number.isFinite(value)) { issues.push(issue(key, "FIELD_TYPE", field.label + " moet een getal zijn.")); continue; }
      if (field.type === "integer" && !Number.isInteger(value)) issues.push(issue(key, "FIELD_INTEGER", field.label + " moet een heel getal zijn."));
      if (value < field.min || value > field.max) issues.push(issue(key, "FIELD_RANGE", field.label + " moet tussen " + field.min + " en " + field.max + " liggen."));
    }
  }
  return { ok: issues.length === 0, issues, refs };
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
