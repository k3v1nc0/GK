// Fase 05 (F5-E2-T03): loottabellen en grondstoffen als getypeerde data.
// Een loottabelregel wijst naar een item óf naar een andere loottabel (geen cycli: de compiler blokkeert die).
// Werkbank Fase 1: per veld icoon, bediening, plek, standaard en Ⓘ-hulp (zie ./ui.js).
import { MAX_WORLD_MM } from "../../../../apps/web/public/shared/spatial.js";
import { HELP_ID, HELP_MODEL, HELP_NAME, HELP_RESPAWN, HELP_SCALE, help, ui } from "./ui.js";

const POS_HELP = help(
  "Waar dit in de wereld staat.",
  "Sleep het icoon in de 3D-view; het getal volgt vanzelf.",
  "Staat het in een muur of buiten de wereld → sleep het naar een open plek."
);
const mmField = (label, icon) => ({ type: "integer", required: true, min: -MAX_WORLD_MM, max: MAX_WORLD_MM, audience: "server", label,
  ui: ui(icon, "slider", "viewport", { step: 100, unit: "m", scale: 1000 }), default: 0, help: POS_HELP });

export const LOOT_ENTRY_KEYS = Object.freeze(["itemRef", "tableRef", "chanceBp", "minQty", "maxQty"]);

export const LOOT_KINDS = {
  loot_table: {
    label: "Loottabel",
    plural: "Loot",
    icon: "🎁",
    place: "werkbank",
    singleton: false,
    domain: "actors",
    idField: "lootTableId",
    fields: {
      lootTableId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Loottabel-ID",
        ui: ui("🔖", "id", "werkbank", { more: true }), default: null, help: HELP_ID("deze loottabel") },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam",
        ui: ui("🏷️", "text", "werkbank"), default: "", help: HELP_NAME("deze loottabel") },
      entries: { type: "lootEntries", required: true, minItems: 1, maxItems: 32, audience: "server", label: "Wat valt eruit",
        ui: ui("🎲", "loot", "werkbank"), default: [],
        help: help("De dingen die eruit kunnen vallen: een item of een andere loottabel, met kans en aantal.", "Sleep een item uit de Bibliotheek op het vak. Kans 100 % = altijd; 5-20 % voor zeldzame dingen.", "Er valt nooit iets → zet de kans hoger. Te veel loot → lager of minder stuks.") }
    }
  },
  resource_definition: {
    label: "Grondstof",
    plural: "Grondstoffen",
    icon: "🪨",
    place: "werkbank",
    singleton: false,
    domain: "actors",
    idField: "resourceId",
    fields: {
      resourceId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Grondstof-ID",
        ui: ui("🔖", "id", "werkbank", { more: true }), default: null, help: HELP_ID("deze grondstof") },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam",
        ui: ui("🏷️", "text", "werkbank"), default: "", help: HELP_NAME("deze grondstof") },
      modelAssetId: { type: "asset", assetType: "model", required: false, maxLength: 160, audience: "client", label: "Model",
        ui: ui("🧊", "asset", "werkbank"), default: null, help: HELP_MODEL },
      modelScaleBp: { type: "integer", required: false, min: 100, max: 100000, audience: "client", label: "Modelschaal",
        ui: ui("📏", "slider", "werkbank", { step: 100, unit: "%", scale: 100, range: [1000, 40000], more: true }), default: 10000, help: HELP_SCALE },
      lootTableRef: { type: "ref", refKind: "loot_table", required: true, audience: "server", label: "Opbrengst",
        ui: ui("🎁", "ref", "werkbank"), default: null,
        help: help("Wat je krijgt als je deze grondstof oogst.", "Sleep een loottabel uit de Bibliotheek op dit vak.", "Je krijgt niets bij oogsten → controleer de kans in de loottabel.") },
      gatherRangeMm: { type: "integer", required: true, min: 500, max: 20000, audience: "client", label: "Oogstafstand",
        ui: ui("🤏", "slider", "werkbank", { step: 100, unit: "m", scale: 1000 }), default: 2000,
        help: help("Hoe dichtbij je moet staan om te oogsten.", "1,5-3 m.", "Je kunt er niet bij → hoger. Oogsten door muren heen → lager.") },
      radiusMm: { type: "integer", required: true, min: 200, max: 10000, audience: "client", label: "Botsstraal",
        ui: ui("⭕", "slider", "werkbank", { step: 100, unit: "m", scale: 1000, more: true }), default: 800,
        help: help("Hoe groot de grondstof is om tegenaan te lopen en aan te klikken.", "Ongeveer de breedte van het model: 0,5-1,5 m.", "Moeilijk aan te klikken → groter. Spelers blijven haken → kleiner.") },
      respawnMs: { type: "integer", required: true, min: 1000, max: 86400000, audience: "server", label: "Terug na",
        ui: ui("⏳", "slider", "werkbank", { step: 1000, unit: "s", scale: 1000, range: [1000, 900000] }), default: 60000, help: HELP_RESPAWN }
    }
  },
  resource_spawn: {
    label: "Grondstof (plek)",
    icon: "📍",
    place: "werkbank",
    singleton: false,
    domain: "actors",
    idField: "resourceSpawnId",
    fields: {
      resourceSpawnId: { type: "id", required: true, maxLength: 120, audience: "server", label: "Plek-ID",
        ui: ui("🔖", "id", "werkbank", { more: true }), default: null, help: HELP_ID("deze plek") },
      resourceRef: { type: "ref", refKind: "resource_definition", required: true, audience: "server", label: "Grondstof",
        ui: ui("🪨", "ref", "werkbank"), default: null,
        help: help("Welke grondstof hier groeit.", "Sleep een grondstof uit de Bibliotheek op dit vak.", "Verkeerde grondstof → sleep een andere erop.") },
      regionRef: { type: "ref", refKind: "region", required: false, audience: "server", label: "Gebied",
        ui: ui("🗺️", "ref", "viewport", { more: true }), default: null,
        help: help("In welk gebied deze plek ligt (leeg = gewoon in de wereld).", "Wordt vanzelf gekozen als je de plek in een gebied zet; leeg mag ook.", "Melding 'buiten gebied' → sleep de plek binnen het gebied of maak dit vak leeg.") },
      xMm: mmField("X", "↔️"),
      zMm: mmField("Z", "↕️")
    }
  }
};
