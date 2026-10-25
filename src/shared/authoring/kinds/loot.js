// Fase 05 (F5-E2-T03): loottabellen en grondstoffen als getypeerde data.
// Een loottabelregel wijst naar een item óf naar een andere loottabel (geen cycli: de compiler blokkeert die).
import { MAX_WORLD_MM } from "../../../../apps/web/public/shared/spatial.js";

const mmField = (label) => ({ type: "integer", required: true, min: -MAX_WORLD_MM, max: MAX_WORLD_MM, audience: "server", label });

export const LOOT_ENTRY_KEYS = Object.freeze(["itemRef", "tableRef", "chanceBp", "minQty", "maxQty"]);

export const LOOT_KINDS = {
  loot_table: {
    label: "Loottabel",
    singleton: false,
    domain: "actors",
    idField: "lootTableId",
    fields: {
      lootTableId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Loottabel-ID" },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam" },
      entries: { type: "lootEntries", required: true, minItems: 1, maxItems: 32, audience: "server", label: "Regels" }
    }
  },
  resource_definition: {
    label: "Grondstof",
    singleton: false,
    domain: "actors",
    idField: "resourceId",
    fields: {
      resourceId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Grondstof-ID" },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam" },
      modelAssetId: { type: "asset", assetType: "model", required: false, maxLength: 160, audience: "client", label: "Model" },
      modelScaleBp: { type: "integer", required: false, min: 100, max: 100000, audience: "client", label: "Modelschaal (10000 = 1x)" },
      lootTableRef: { type: "ref", refKind: "loot_table", required: true, audience: "server", label: "Loottabel" },
      gatherRangeMm: { type: "integer", required: true, min: 500, max: 20000, audience: "client", label: "Verzamelbereik (mm)" },
      radiusMm: { type: "integer", required: true, min: 200, max: 10000, audience: "client", label: "Straal (mm)" },
      respawnMs: { type: "integer", required: true, min: 1000, max: 86400000, audience: "server", label: "Terug na (ms)" }
    }
  },
  resource_spawn: {
    label: "Grondstof (plek)",
    singleton: false,
    domain: "actors",
    idField: "resourceSpawnId",
    fields: {
      resourceSpawnId: { type: "id", required: true, maxLength: 120, audience: "server", label: "Plek-ID" },
      resourceRef: { type: "ref", refKind: "resource_definition", required: true, audience: "server", label: "Grondstof" },
      regionRef: { type: "ref", refKind: "region", required: true, audience: "server", label: "Region" },
      xMm: mmField("X (mm)"),
      zMm: mmField("Z (mm)")
    }
  }
};
