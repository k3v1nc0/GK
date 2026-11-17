// Werkbank Fase 1 (bouwrecept §0b): hulpjes om de UI-beschrijving per veld kort te schrijven.
// Alleen data: elk veld krijgt ui (icoon, bediening, plek, stap, eenheid), default en help (Ⓘ).
//
// ui.control: text | id | slider | toggle | select | asset | ref | refList | tags | loot | points | areaSettings | color | terrain
// terrain / terrainPaint: hoogte en verf van de grond (vakken), alleen te tekenen in de editor-tab Terrein.
// refList: een lijst regels { ref, ...getallen } (bijv. startitems: item of valuta + aantal). Velden: refKinds, columns.
// ui.soorten: alleen tonen bij deze Area-soorten (Ombouw stap 2).
// ui.place:   werkbank (paneel links) | instellingen (kaart) | terrein (tab Terrein) | viewport (slepen/tekenen in 3D) | relaties
//             | questbuilder (alleen in de Quest Builder: start, wie geeft hem, doelen; het paneel toont een samenvatting)
// ui.unit + ui.scale: wat Kevin ziet (bijv. 1500 mm met scale 1000 = "1.5 m").
// ui.range: het bereik van de slider als het echte min/max te groot is om te schuiven (het getalvak mag wel tot min/max).
// ui.more: true = staat onder de ⚙️-knop "meer" (per rol maximaal ±6 velden in beeld, plan §10.4).
// ui.hideWhen: verberg dit veld zodra dat andere veld gevuld is (bijv. de snelle questvelden zodra de quest eigen stappen heeft).
// curve: een grafiek met versleepbare punten [level, waarde] (Fase 6: de XP-curve in Instellingen > Project).
// questSteps: de stappen van een quest (Quest Builder); het paneel toont een samenvatting + knop naar de Quest Builder.
// questStart: hoe een quest start + voorwaarden (EN/OF); in te stellen in de Quest Builder (tab 🚪 Start).
// questSpawns: wat de quest laat verschijnen (vijanden met naam, voor wie, wanneer weg); in de Quest Builder (tab 👾 Verschijnen).
// ui.when.key mag een pad zijn (bijv. "start.mode"); ui.when.fallback = de waarde als dat leeg is.
// ui.optionsFrom: keuzes komen uit de werkruimte (zones, respawnPolicies, equipmentSlots, clips:<veld>).
// ui.when.also: nog een voorwaarde ({ key, is }) die ook moet kloppen.
// route: punten { x, z, h?, waitS?, clip? } in meter (NPC-route, vliegroute); tekenen in de 3D-view, per punt in het paneel.

export const help = (waarvoor, goed, probleem) => Object.freeze({ waarvoor, goed, probleem });

export const ui = (icon, control, place, extra = {}) => Object.freeze(Object.assign({ icon, control, place }, extra));

export const FIELD_CONTROLS = Object.freeze(["text", "id", "slider", "toggle", "select", "asset", "assetList", "ref", "refList", "tags", "loot", "points", "areaSettings", "color", "terrain", "terrainPaint", "questSteps", "questStart", "questSpawns", "curve", "route"]);
export const FIELD_PLACES = Object.freeze(["werkbank", "instellingen", "terrein", "viewport", "relaties", "questbuilder"]);
export const KIND_PLACES = Object.freeze(["werkbank", "instellingen", "terrein"]);

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
  pointList: ["points", "curve"],
  linkList: ["points"],
  areaSettings: ["areaSettings"],
  color: ["color"],
  terrainChunks: ["terrain"],
  terrainPaint: ["terrainPaint"],
  questSteps: ["questSteps"],
  questStart: ["questStart"],
  questSpawns: ["questSpawns"],
  route: ["route"]
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

// Werkbank Fase 10 (Kevin 16-11): een getekende route (NPC, vijand, vliegend model) en wat er aan het eind gebeurt.
export const routeField = (label, audience, group, when, wat) => ({ type: "route", required: false, maxItems: 64, audience, label,
  ui: ui("🛣️", "route", "werkbank", { group, when }), default: null,
  help: help("De route van " + wat + ": punten die hij een voor een afgaat. Per punt: aan de grond of op een hoogte, hoe lang hij daar wacht, welke animatie hij dan speelt, wat hij zegt en welk geluid er klinkt.",
    "Kies " + wat + " in de 3D-view, druk F en klik op de grond: klik, klik, klik (Esc = klaar). Klik een punt en druk G om te schuiven, G en dan Z voor de hoogte. Wachten 5-20 s met bijv. een zwaai- of werk-animatie.",
    "Hij loopt door een muur → zet er een punt bij om de muur heen. Hij zweeft → zet ⛰️ aan de grond aan.") });
export const routeEndField = (audience, group, when) => ({ type: "select", required: false, options: ["loop", "back"], optionIcons: { loop: "🔁", back: "↩️" },
  optionLabels: { loop: "Terug naar punt 1", back: "Omkeren" }, audience, label: "Aan het eind",
  ui: ui("🔁", "select", "werkbank", { group, when }), default: "loop",
  help: help("Wat er gebeurt bij het laatste punt: in een rondje terug naar punt 1, of omkeren en dezelfde weg terug.",
    "Rondje voor een wachter rond het dorp of vogels rond een berg; omkeren voor een boer tussen huis en akker.",
    "Hij steekt dwars door het dorp terug naar punt 1 → kies Omkeren of zet er punten bij.") });
