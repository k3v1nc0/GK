// Werkbank Fase 1 (bouwrecept §0b): hulpjes om de UI-beschrijving per veld kort te schrijven.
// Alleen data: elk veld krijgt ui (icoon, bediening, plek, stap, eenheid), default en help (Ⓘ).
//
// ui.control: text | id | slider | toggle | select | asset | ref | refList | tags | loot | points | areaSettings | color
// refList: een lijst regels { ref, ...getallen } (bijv. startitems: item of valuta + aantal). Velden: refKinds, columns.
// ui.soorten: alleen tonen bij deze Area-soorten (Ombouw stap 2).
// ui.place:   werkbank (paneel links) | instellingen (kaart) | viewport (slepen/tekenen in 3D) | relaties
// ui.unit + ui.scale: wat Kevin ziet (bijv. 1500 mm met scale 1000 = "1.5 m").
// ui.range: het bereik van de slider als het echte min/max te groot is om te schuiven (het getalvak mag wel tot min/max).
// ui.more: true = staat onder de ⚙️-knop "meer" (per rol maximaal ±6 velden in beeld, plan §10.4).
// ui.optionsFrom: keuzes komen uit de werkruimte (zones, respawnPolicies, equipmentSlots, clips:<veld>).

export const help = (waarvoor, goed, probleem) => Object.freeze({ waarvoor, goed, probleem });

export const ui = (icon, control, place, extra = {}) => Object.freeze(Object.assign({ icon, control, place }, extra));

export const FIELD_CONTROLS = Object.freeze(["text", "id", "slider", "toggle", "select", "asset", "assetList", "ref", "refList", "tags", "loot", "points", "areaSettings", "color"]);
export const FIELD_PLACES = Object.freeze(["werkbank", "instellingen", "viewport", "relaties"]);
export const KIND_PLACES = Object.freeze(["werkbank", "instellingen"]);

// Welke bediening bij welk veldtype hoort (de schema-test controleert dit).
export const CONTROL_FOR_TYPE = Object.freeze({
  text: ["text", "select"],
  id: ["id", "select"],
  select: ["select"],
  boolean: ["toggle"],
  integer: ["slider"],
  number: ["slider"],
  asset: ["asset"],
  assetList: ["assetList"],
  ref: ["ref"],
  refList: ["refList"],
  tagList: ["tags"],
  lootEntries: ["loot"],
  pointList: ["points"],
  areaSettings: ["areaSettings"],
  color: ["color"]
});

// Veelgebruikte hulpteksten.
export const HELP_ID = (wat) => help(
  "De vaste naam van " + wat + " voor de computer. Andere kaarten verwijzen hiernaar.",
  "Kort en zonder spaties, bijv. item.brood. Wordt vanzelf gemaakt uit de naam.",
  "Kan niet meer veranderen na opslaan → maak een nieuwe kaart en archiveer de oude."
);
export const HELP_NAME = (wat) => help(
  "De naam die je in de game en in de Werkbank ziet bij " + wat + ".",
  "Kort en duidelijk, bijv. \"Brood\" of \"Wolf\".",
  "Naam te lang in de tas → maak hem korter (max. 20 tekens leest prettig)."
);
export const HELP_MODEL = help(
  "Het 3D-model dat je in de wereld ziet.",
  "Sleep een model uit de Bibliotheek op dit vak. Lichte modellen (🟢) houden de laptop soepel.",
  "Niets te zien in de game → controleer of het model is geüpload en publiceer opnieuw."
);
export const HELP_SCALE = help(
  "Hoe groot het model getekend wordt.",
  "100 % = zoals het model is gemaakt. 50-200 % is meestal goed.",
  "Model te groot of te klein → schuif naar links (kleiner) of rechts (groter)."
);
export const HELP_RESPAWN = help(
  "Hoe lang het duurt voordat het weer terugkomt nadat het weg is.",
  "30-120 s voor gewone dingen, 5-15 min voor zeldzame dingen.",
  "Spelers staan te wachten → korter. Te veel in de wereld → langer."
);
