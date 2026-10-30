// F3-E3-T01/T07: een object heeft nooit twee writers.
// - Per object: een item of pickup dat Canoniek beheert (zelf gemaakt met dezelfde ID, of overgenomen via
//   legacyRef) is in Nodes alleen-lezen. De projectnaam idem, zodra Canoniek projectinstellingen heeft.
// - Per domein: na finalize van een domein maak je nieuwe objecten van dat soort alleen nog in Canoniek.
// Alles daarbuiten blijft gewoon bewerkbaar in Nodes.
import { authoringError, stableStringify } from "./stable-json.js";

function normalizeId(value) {
  return String(value || "").trim();
}

const OPEN_HINT = " Pas het aan in de Werkbank (/editor/).";
const AREA_GUARD_TYPES = new Set(["bounded_area_scatter", "surface_layer", "blocker_area", "walkable_surface"]);

export class CutoverGuard {
  constructor(db) {
    this.db = db;
  }

  domainIsCanonical(domain) {
    return Boolean(this.db.prepare("SELECT 1 FROM authoring_cutover WHERE domain = ? AND writer = 'canonical' LIMIT 1").get(domain));
  }

  // Ook gearchiveerde documenten tellen: een overgenomen object komt nooit stil terug bij Nodes.
  ownsItem(itemId) {
    const id = normalizeId(itemId);
    if (!id) return false;
    return Boolean(this.db.prepare("SELECT 1 FROM authoring_documents WHERE doc_key = ? OR legacy_ref = ? LIMIT 1").get("item_definition:" + id, "items:" + id));
  }

  ownsPickupSpawn(spawnEntryId) {
    const id = normalizeId(spawnEntryId);
    if (!id) return false;
    const suffix = ":" + id;
    return this.db.prepare("SELECT legacy_ref FROM authoring_documents WHERE kind = 'pickup' AND legacy_ref IS NOT NULL").all()
      .some((row) => String(row.legacy_ref).endsWith(suffix));
  }

  ownsProjectName() {
    return Boolean(this.db.prepare("SELECT 1 FROM authoring_documents WHERE doc_key = 'project_settings' LIMIT 1").get());
  }

  // currentValues === null betekent aanmaken, nextValues === null betekent verwijderen.
  assertNodeWrite(type, currentValues, nextValues) {
    const creating = currentValues === null;
    const changed = creating || nextValues === null || stableStringify(currentValues) !== stableStringify(nextValues);
    if (!changed) return;

    if (type === "item_definition") {
      if (creating && this.domainIsCanonical("items")) throw authoringError(409, "CANONICAL_DOMAIN", "Items worden nu in de Werkbank gemaakt." + OPEN_HINT);
      const owned = [currentValues?.itemId, nextValues?.itemId].map(normalizeId).filter(Boolean).find((id) => this.ownsItem(id));
      if (owned) throw authoringError(409, "CANONICAL_OWNED", "Item " + owned + " wordt beheerd in de Werkbank." + OPEN_HINT, { itemId: owned });
      return;
    }

    if (type === "pickup_spawn") {
      const nextKind = nextValues ? (nextValues.pickupKind || "item") : null;
      if (nextKind === "item" && this.domainIsCanonical("pickups") && (creating || (currentValues?.pickupKind || "item") !== "item")) {
        throw authoringError(409, "CANONICAL_DOMAIN", "Item-pickups worden nu in de Werkbank geplaatst." + OPEN_HINT);
      }
      const owned = [currentValues?.spawnEntryId, nextValues?.spawnEntryId].map(normalizeId).filter(Boolean).find((id) => this.ownsPickupSpawn(id));
      if (owned) throw authoringError(409, "CANONICAL_OWNED", "Pickup " + owned + " wordt beheerd in de Werkbank." + OPEN_HINT, { spawnEntryId: owned });
      return;
    }

    // Ombouw stap 2: na het verhuizen van de vlakken teken je ze alleen nog met de Area tool.
    if (AREA_GUARD_TYPES.has(type) && nextValues !== null && this.domainIsCanonical("areas")) {
      throw authoringError(409, "CANONICAL_DOMAIN", "Vlakken en paden teken je nu met de Area tool in de Werkbank." + OPEN_HINT);
    }

    if (type === "game_project_settings" && this.ownsProjectName()) {
      if (nextValues === null) throw authoringError(409, "CANONICAL_OWNED", "De projectnaam wordt beheerd in de Werkbank; deze node kan niet weg.");
      if (!creating && normalizeId(currentValues?.gameName) !== normalizeId(nextValues?.gameName)) {
        throw authoringError(409, "CANONICAL_OWNED", "De naam van de game wordt beheerd in de Werkbank. Andere velden kun je hier wel wijzigen." + OPEN_HINT);
      }
    }
  }
}
