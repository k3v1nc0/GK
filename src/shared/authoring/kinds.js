// F3-E1-T01: canonieke kinds. Alleen data: geen code, geen expressies, geen stille defaults bij read.
// Elk veld heeft een audience: "client" komt in het clientpakket, "server" alleen in het serverpakket.
// Fase 04: region en area (ruimte in integer mm, zie apps/web/public/shared/spatial.js).
// Fase 05: actors, aanvallen, loot en grondstoffen (kinds/actor.js, kinds/combat.js, kinds/loot.js).
// Werkbank Fase 1 (bouwrecept §0b): elke soort heeft een icoon en plek (werkbank of instellingen); elk veld heeft
// ui (icoon, bediening, plek, stap, eenheid), default en help (Ⓘ: waarvoor / goede waarden / probleem → oplossing).
// De Werkbank en Instellingen tekenen zichzelf hieruit. De default wordt alleen gebruikt bij "nieuw", nooit bij lezen.
import { AREA_SHAPES, MAX_WORLD_MM, polygonProblem } from "../../../apps/web/public/shared/spatial.js";
import { ACTOR_KINDS } from "./kinds/actor.js";
import { COMBAT_KINDS } from "./kinds/combat.js";
import { LOOT_ENTRY_KEYS, LOOT_KINDS } from "./kinds/loot.js";
import { HELP_ID, HELP_NAME, help, ui } from "./kinds/ui.js";
import { WORLD_KINDS } from "./kinds/world.js";
import { GAME_KINDS } from "./kinds/game.js";
import { AREA_SETTING_SPECS, AREA_SOORT_ORDER, AREA_SOORTEN, areaSettingsIssues, areaSoort } from "./kinds/area.js";

const ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;
const ASSET_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const TAG_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,63}$/;

export const KIND_SCHEMA_VERSION = 1;

const MM = { min: -MAX_WORLD_MM, max: MAX_WORLD_MM };
const SHAPE_HELP = help(
  "De vorm op de grond: sleep de hoeken en randen in de 3D-view.",
  "Rechthoek voor de meeste plekken, cirkel voor een open plek, punten voor een grillige rand.",
  "Vorm klopt niet → sleep de hoekpunten in de 3D-view tot hij past."
);
const mmField = (label, required, icon = "📐") => ({ type: "integer", required, min: MM.min, max: MM.max, audience: "client", label,
  ui: ui(icon, "slider", "viewport", { step: 100, unit: "m", scale: 1000 }), default: null, help: SHAPE_HELP });
const MUSIC_HELP = help(
  "De muziek die speelt zolang je hier bent.",
  "Sleep een muziekstuk uit de Bibliotheek op dit vak. Rustige muziek voor dorpen.",
  "Muziek te hard → maak het bestand zachter. Geen muziek → controleer of het bestand mp3/ogg is."
);
const shapeSelect = (label) => ({ type: "select", required: true, options: AREA_SHAPES.slice(),
  optionIcons: { box: "⬛", cylinder: "⚪", polygon: "🔷" }, optionLabels: { box: "Rechthoek", cylinder: "Cirkel", polygon: "Punten" },
  audience: "client", label, ui: ui("🔷", "select", "werkbank"), default: "box", help: SHAPE_HELP });
const regionRef = { type: "ref", refKind: "region", required: true, audience: "client", label: "Gebied",
  ui: ui("🗺️", "ref", "viewport", { more: true }), default: null,
  help: help("In welk gebied dit ligt.", "Wordt vanzelf gekozen als je het in de 3D-view tekent.", "Melding 'buiten gebied' → teken het binnen een gebied.") };

export const CANONICAL_KINDS = {
  project_settings: {
    label: "Project",
    icon: "🎮",
    place: "instellingen",
    singleton: true,
    domain: "project",
    fields: {
      gameName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam van de game",
        ui: ui("🎮", "text", "instellingen"), default: "",
        help: help("De naam van je game, bovenaan in de game en bij inloggen.", "Kort en herkenbaar, bijv. \"GK\".", "Oude naam in de game → klik SAVE TO GAME.") },
      motd: { type: "text", required: false, maxLength: 200, audience: "client", label: "Welkomsttekst",
        ui: ui("👋", "text", "instellingen"), default: null,
        help: help("Het berichtje dat spelers zien als ze binnenkomen.", "Eén korte zin, bijv. \"Welkom! Praat met de smid.\"", "Niemand leest het → maak het korter.") },
      // Fase 05: de aanval die een speler gebruikt tegen canonieke vijanden (geen hardcoded ability.basic_attack).
      // Klassen (29-10): de aanval van de speler staat nu per klasse (Instellingen > Klassen), niet meer hier.
      // Klassen (29-10): de levelregels gelden voor alle klassen samen (stonden eerst op de kaart Speler).
      xpPerLevel: { type: "integer", required: false, min: 10, max: 1000000, audience: "client", label: "XP per level",
        ui: ui("⭐", "slider", "instellingen", { step: 10, range: [10, 5000] }), default: 100,
        help: help("Hoeveel XP je nodig hebt voor elk volgend level (alle klassen).", "100 aan het begin.", "Spelers stijgen te snel → hoger.") },
      maxLevel: { type: "integer", required: false, min: 1, max: 500, audience: "client", label: "Hoogste level",
        ui: ui("🏆", "slider", "instellingen", { step: 1, range: [1, 100] }), default: 50,
        help: help("Het hoogste level dat een character kan halen.", "20 tot 60.", "Spelers zitten vast op het hoogste level → hoger.") }
    }
  },
  item_definition: {
    label: "Item",
    plural: "Items",
    icon: "🎒",
    place: "werkbank",
    singleton: false,
    domain: "items",
    idField: "itemId",
    fields: {
      itemId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Item-ID",
        ui: ui("🔖", "id", "werkbank", { more: true }), default: null, help: HELP_ID("dit item") },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam",
        ui: ui("🏷️", "text", "werkbank"), default: "", help: HELP_NAME("dit item") },
      category: { type: "select", required: true, options: ["material", "consumable", "equipment", "quest", "misc", "custom"],
        optionIcons: { material: "🪵", consumable: "🍞", equipment: "🗡️", quest: "📜", misc: "📦", custom: "✨" },
        optionLabels: { material: "Materiaal", consumable: "Eten/drinken", equipment: "Uitrusting", quest: "Quest", misc: "Overig", custom: "Eigen" },
        audience: "client", label: "Soort", ui: ui("🗂️", "select", "werkbank"), default: "material",
        help: help("Wat voor ding dit is; bepaalt het filtertabje in de tas.", "Eten = Eten/drinken, zwaard = Uitrusting, erts = Materiaal.", "Item staat in het verkeerde tas-tabje → kies een andere soort.") },
      rarity: { type: "select", required: true, options: ["common", "uncommon", "rare", "epic", "legendary", "quest", "custom"],
        optionIcons: { common: "⚪", uncommon: "🟢", rare: "🔵", epic: "🟣", legendary: "🟠", quest: "🟡", custom: "✨" },
        optionLabels: { common: "Gewoon", uncommon: "Ongewoon", rare: "Zeldzaam", epic: "Episch", legendary: "Legendarisch", quest: "Quest", custom: "Eigen" },
        audience: "client", label: "Zeldzaamheid", ui: ui("💎", "select", "werkbank"), default: "common",
        help: help("Hoe bijzonder het item is; geeft de rand in de tas een kleur.", "Meeste items Gewoon; maar een paar Zeldzaam of hoger.", "Alles lijkt bijzonder → zet meer items op Gewoon.") },
      stackable: { type: "boolean", required: true, audience: "client", label: "Stapelbaar",
        ui: ui("📚", "toggle", "werkbank"), default: true,
        help: help("Kunnen meer van dit item in één vakje?", "Aan voor erts, eten en pijlen. Uit voor wapens en kleding.", "Uitrusting gaat niet op stapel → zet Stapelbaar uit.") },
      stackLimit: { type: "integer", required: true, min: 1, max: 1000000, audience: "client", label: "Max. op stapel",
        ui: ui("🔢", "slider", "werkbank", { step: 1, range: [1, 999], more: true }), default: 99,
        help: help("Hoeveel er maximaal in één vakje passen.", "20-99 voor grondstoffen, 1 voor uitrusting.", "Tas raakt snel vol → hoger.") },
      bindPolicy: { type: "select", required: false, options: ["unbound", "bind_on_pickup", "bind_on_equip", "character_bound", "account_bound", "quest_bound"],
        optionIcons: { unbound: "🔓", bind_on_pickup: "✋", bind_on_equip: "🧥", character_bound: "🧍", account_bound: "👤", quest_bound: "📜" },
        optionLabels: { unbound: "Vrij", bind_on_pickup: "Vast bij oppakken", bind_on_equip: "Vast bij aantrekken", character_bound: "Vast aan character", account_bound: "Vast aan account", quest_bound: "Vast aan quest" },
        audience: "client", label: "Binding", ui: ui("🔗", "select", "werkbank", { more: true }), default: null,
        help: help("Mag een speler dit item aan een ander geven?", "Vrij voor de meeste dingen; Vast bij oppakken voor beloningen.", "Spelers verhandelen beloningen → kies Vast bij oppakken.") },
      tradable: { type: "boolean", required: false, audience: "client", label: "Verhandelbaar",
        ui: ui("🤝", "toggle", "werkbank", { more: true }), default: true,
        help: help("Mag het item verhandeld of verkocht worden?", "Aan voor gewone items, uit voor questitems.", "Questitem belandt op de markt → zet dit uit.") },
      questItem: { type: "boolean", required: false, audience: "client", label: "Questitem",
        ui: ui("📜", "toggle", "werkbank", { more: true }), default: false,
        help: help("Is dit een item dat alleen voor een quest is?", "Aan voor brieven, sleutels en bewijsstukken.", "Questitem kan weggegooid worden → zet dit aan.") },
      iconAssetId: { type: "asset", assetType: "image", required: false, maxLength: 160, audience: "client", label: "Eigen icoon",
        ui: ui("🖼️", "asset", "werkbank", { more: true }), default: null,
        help: help("Een eigen plaatje voor in de tas. Leeg = het plaatje van het 3D-model.", "Meestal leeg laten; vierkant plaatje van 64-128 px als je toch wilt.", "Icoon ziet er wazig uit → gebruik een groter plaatje.") },
      worldModelAssetId: { type: "asset", assetType: "model", required: false, maxLength: 160, audience: "client", label: "Model",
        ui: ui("🧊", "asset", "werkbank"), default: null,
        help: help("Het 3D-model als het item op de grond ligt (en het plaatje in de tas).", "Sleep een model uit de Bibliotheek op dit vak.", "Item onzichtbaar op de grond → sleep hier een model op.") },
      tags: { type: "tagList", required: false, maxItems: 32, audience: "client", label: "Labels",
        ui: ui("🏷️", "tags", "werkbank", { more: true }), default: null,
        help: help("Extra labels waar regels naar kunnen kijken (bijv. 'vis', 'ijzer').", "Kleine letters, kort. Een paar per item is genoeg.", "Label werkt niet → controleer de spelling (alleen a-z, 0-9, _ . : -).") },
      vendorValue: { type: "integer", required: false, min: 0, max: 100000000000, audience: "server", label: "Verkoopwaarde",
        ui: ui("🪙", "slider", "werkbank", { step: 1, range: [0, 1000] }), default: 0,
        help: help("Hoeveel een winkel je ervoor betaalt.", "1-10 voor gewone spullen, meer voor zeldzame.", "Spelers worden te snel rijk → lager.") },
      // Fase 05 (F5-E2-T04): uitrusting. Het slot komt uit de bestaande slotlijst (Nodes); bonussen tellen mee in gevechten.
      equipSlot: { type: "id", required: false, maxLength: 120, audience: "client", label: "Uitrustingsplek",
        ui: ui("⛑️", "select", "werkbank", { optionsFrom: "equipmentSlots" }), default: null,
        help: help("Waar je het aantrekt (hoofd, hand...). Leeg = geen uitrusting.", "Alleen invullen voor wapens en kleding. Met een plek krijgt het in de tas de knop Uitrusten (en stapelt het niet).", "Geen knop Uitrusten in de tas → kies hier een plek.") },
      attackPowerBonus: { type: "integer", required: false, min: 0, max: 1000000, audience: "client", label: "Extra kracht",
        ui: ui("💪", "slider", "werkbank", { step: 1, range: [0, 100], more: true }), default: 0,
        help: help("Hoeveel harder je slaat als je dit draagt.", "1-5 voor de eerste wapens.", "Wapen maakt geen verschil → hoger.") },
      armorBonus: { type: "integer", required: false, min: 0, max: 1000000, audience: "client", label: "Extra pantser",
        ui: ui("🛡️", "slider", "werkbank", { step: 1, range: [0, 100], more: true }), default: 0,
        help: help("Hoeveel minder schade je krijgt als je dit draagt.", "1-5 voor de eerste kleding.", "Spelers onkwetsbaar → lager.") }
    }
  },
  pickup: {
    label: "Pickup",
    icon: "✨",
    place: "werkbank",
    singleton: false,
    domain: "pickups",
    idField: "pickupId",
    fields: {
      pickupId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Pickup-ID",
        ui: ui("🔖", "id", "werkbank", { more: true }), default: null, help: HELP_ID("deze pickup") },
      itemRef: { type: "ref", refKind: "item_definition", required: true, audience: "client", label: "Item",
        ui: ui("🎒", "ref", "werkbank"), default: null,
        help: help("Welk item hier op de grond ligt.", "Sleep een item uit de Bibliotheek op dit vak.", "Verkeerd item → sleep een ander item erop.") },
      zoneRef: { type: "id", required: true, maxLength: 120, audience: "client", label: "Zone",
        ui: ui("🗺️", "select", "viewport", { optionsFrom: "zones", more: true }), default: null,
        help: help("In welke zone de pickup ligt (verdwijnt in Fase 2: dan is er één wereld).", "Wordt vanzelf gekozen als je hem in de 3D-view zet.", "Pickup niet te zien → controleer of je in de goede zone kijkt.") },
      x: { type: "number", required: true, min: -100000, max: 100000, audience: "client", label: "X",
        ui: ui("↔️", "slider", "viewport", { step: 0.1, unit: "m" }), default: 0,
        help: help("Waar de pickup ligt (links-rechts).", "Sleep het icoon in de 3D-view.", "Ligt in een muur → sleep hem naar een open plek.") },
      y: { type: "number", required: true, min: -1000, max: 10000, audience: "client", label: "Hoogte",
        ui: ui("↕️", "slider", "viewport", { step: 0.1, unit: "m", more: true }), default: 0,
        help: help("Hoe hoog de pickup ligt.", "0 = op de grond.", "Zweeft of zit in de grond → zet op 0.") },
      z: { type: "number", required: true, min: -100000, max: 100000, audience: "client", label: "Z",
        ui: ui("↕️", "slider", "viewport", { step: 0.1, unit: "m" }), default: 0,
        help: help("Waar de pickup ligt (voor-achter).", "Sleep het icoon in de 3D-view.", "Ligt in een muur → sleep hem naar een open plek.") },
      amount: { type: "integer", required: true, min: 1, max: 9999, audience: "server", label: "Aantal",
        ui: ui("🔢", "slider", "werkbank", { step: 1, range: [1, 50] }), default: 1,
        help: help("Hoeveel je krijgt als je hem oppakt.", "1 tot 5 stuks.", "Spelers hebben te snel genoeg → lager.") },
      respawnPolicyRef: { type: "id", required: false, maxLength: 120, audience: "server", label: "Terugkomen",
        ui: ui("⏳", "select", "werkbank", { optionsFrom: "respawnPolicies" }), default: null,
        help: help("Of en wanneer de pickup terugkomt nadat iemand hem pakt.", "Kies een beleid uit de lijst; leeg = komt niet terug.", "Pickup komt nooit terug → kies hier een beleid.") }
    }
  },
  // F4-E1-T02: een Region is een exclusieve rechthoek in world-mm. Regions overlappen nooit (half-open grenzen).
  region: {
    label: "Gebied",
    icon: "🗺️",
    place: "werkbank",
    singleton: false,
    domain: "world",
    idField: "regionId",
    fields: {
      regionId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Gebied-ID",
        ui: ui("🔖", "id", "werkbank", { more: true }), default: null, help: HELP_ID("dit gebied") },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam",
        ui: ui("🏷️", "text", "werkbank"), default: "", help: HELP_NAME("dit gebied") },
      minXMm: mmField("Links", true, "⬅️"),
      maxXMm: mmField("Rechts", true, "➡️"),
      minZMm: mmField("Voor", true, "⬆️"),
      maxZMm: mmField("Achter", true, "⬇️"),
      musicAssetId: { type: "asset", assetType: "audio", required: false, maxLength: 160, audience: "client", label: "Muziek",
        ui: ui("🎵", "asset", "werkbank"), default: null, help: MUSIC_HELP },
      // F4-E3-T03: expliciete koppeling met een oude zone uit Nodes (alleen voor het parityrapport).
      legacyZoneRef: { type: "text", required: false, maxLength: 120, audience: "server", label: "Oude zone",
        ui: ui("🕰️", "text", "werkbank", { more: true }), default: null,
        help: help("Welke oude zone uit Nodes hier hoorde (alleen voor het verhuisrapport).", "Laat staan zoals het is.", "Verhuisrapport mist een zone → vul de oude zonenaam in.") }
    }
  },
  // F4-E1-T02: een Area is een betekenisvorm binnen precies één Region: box, cylinder of polygon. Areas mogen overlappen.
  area: {
    label: "Vlak",
    icon: "🔷",
    place: "werkbank",
    singleton: false,
    domain: "world",
    idField: "areaId",
    fields: {
      areaId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Vlak-ID",
        ui: ui("🔖", "id", "werkbank", { more: true }), default: null, help: HELP_ID("dit deelgebied") },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam",
        ui: ui("🏷️", "text", "werkbank"), default: "", help: HELP_NAME("dit deelgebied") },
      // Ombouw stap 2: één Area tool voor alle vlakken en lijnen. Leeg = deelgebied (zo maakte Fase 04 ze).
      soort: { type: "select", required: false, options: AREA_SOORT_ORDER.slice(), audience: "client", label: "Soort",
        optionIcons: Object.fromEntries(AREA_SOORT_ORDER.map((key) => [key, AREA_SOORTEN[key].icon])),
        optionLabels: Object.fromEntries(AREA_SOORT_ORDER.map((key) => [key, AREA_SOORTEN[key].label])),
        ui: ui("🧩", "select", "werkbank"), default: null,
        help: help("Wat dit vlak is: begroeiing, pad, blokkade, loopvlak of deelgebied.", "Kies het icoon; de punten blijven staan als je wisselt.", "Verkeerde soort → klik een ander icoon; zet daarna de instellingen opnieuw.") },
      settings: { type: "areaSettings", required: false, audience: "client", label: "Instellingen", soorten: AREA_SETTING_SPECS,
        ui: ui("🎛️", "areaSettings", "werkbank"), default: null,
        help: help("De instellingen die bij deze soort horen (textuur, modellen, breedte).", "Begin met de velden in beeld; de rest staat onder ⚙️ meer.", "Ziet er raar uit → zet een veld terug op de standaard.") },
      regionRef: Object.assign({}, regionRef, { required: false, ui: ui("🗺️", "ref", "viewport", { more: true, soorten: ["deelgebied"] }) }),
      shape: Object.assign(shapeSelect("Vorm"), { required: false, ui: ui("🔷", "select", "werkbank", { soorten: ["deelgebied"] }) }),
      minXMm: mmField("Links", false, "⬅️"),
      maxXMm: mmField("Rechts", false, "➡️"),
      minZMm: mmField("Voor", false, "⬆️"),
      maxZMm: mmField("Achter", false, "⬇️"),
      centerXMm: mmField("Midden X", false, "🎯"),
      centerZMm: mmField("Midden Z", false, "🎯"),
      radiusMm: { type: "integer", required: false, min: 1000, max: MAX_WORLD_MM, audience: "client", label: "Straal",
        ui: ui("⭕", "slider", "viewport", { step: 100, unit: "m", scale: 1000, range: [1000, 100000] }), default: null, help: SHAPE_HELP },
      pointsMm: { type: "pointList", required: false, minItems: 2, maxItems: 512, allowHeight: true, min: MM.min, max: MM.max, audience: "client", label: "Punten",
        ui: ui("🔷", "points", "viewport"), default: null, help: SHAPE_HELP },
      // Alleen de server kiest de Area bij overlap; de client hoeft de prioriteit niet te kennen.
      priority: { type: "integer", required: false, min: 0, max: 100, audience: "server", label: "Voorrang",
        ui: ui("🥇", "slider", "werkbank", { step: 1, more: true, soorten: ["deelgebied"] }), default: 0,
        help: help("Welk deelgebied wint als twee elkaar overlappen.", "0 voor gewone plekken; hoger voor een klein plekje binnen een groter gebied.", "Verkeerde muziek op een overlap → geef het kleine gebied meer voorrang.") },
      musicAssetId: { type: "asset", assetType: "audio", required: false, maxLength: 160, audience: "client", label: "Muziek",
        ui: ui("🎵", "asset", "werkbank", { soorten: ["deelgebied"] }), default: null, help: MUSIC_HELP },
      // Fase 05: veilig gebied. Hier weigert de server elke aanval (van en op spelers) en jagen vijanden niet.
      safe: { type: "boolean", required: false, audience: "client", label: "Veilig (geen gevechten)",
        ui: ui("🕊️", "toggle", "werkbank", { soorten: ["deelgebied"] }), default: false,
        help: help("Hier kan niemand aanvallen of aangevallen worden.", "Aan voor dorpen en het startpunt.", "Vijanden jagen in het dorp → zet Veilig aan.") }
    }
  },
  // F4-E1-T03: statische collider (obstakel) binnen een Region. Server-movement én client-prediction lezen exact
  // deze vorm (via world.collision.blockers), en de latere navtile-bake leest dezelfde mm-geometrie uit de build.
  collider: {
    label: "Obstakel",
    icon: "🧱",
    place: "werkbank",
    singleton: false,
    domain: "world",
    idField: "colliderId",
    fields: {
      colliderId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Obstakel-ID",
        ui: ui("🔖", "id", "werkbank", { more: true }), default: null, help: HELP_ID("dit obstakel") },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam",
        ui: ui("🏷️", "text", "werkbank"), default: "", help: HELP_NAME("dit obstakel") },
      regionRef,
      shape: shapeSelect("Vorm"),
      minXMm: mmField("Links", false, "⬅️"),
      maxXMm: mmField("Rechts", false, "➡️"),
      minZMm: mmField("Voor", false, "⬆️"),
      maxZMm: mmField("Achter", false, "⬇️"),
      centerXMm: mmField("Midden X", false, "🎯"),
      centerZMm: mmField("Midden Z", false, "🎯"),
      radiusMm: { type: "integer", required: false, min: 100, max: MAX_WORLD_MM, audience: "client", label: "Straal",
        ui: ui("⭕", "slider", "viewport", { step: 100, unit: "m", scale: 1000, range: [100, 50000] }), default: null, help: SHAPE_HELP },
      pointsMm: { type: "pointList", required: false, minItems: 3, maxItems: 64, min: MM.min, max: MM.max, audience: "client", label: "Punten",
        ui: ui("🔷", "points", "viewport"), default: null, help: SHAPE_HELP }
    }
  },
  ...COMBAT_KINDS,
  ...LOOT_KINDS,
  ...ACTOR_KINDS,
  ...WORLD_KINDS,
  ...GAME_KINDS
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
    if (field.type === "color") {
      if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) issues.push(issue(key, "FIELD_COLOR", field.label + " moet een kleur zijn (#rrggbb)."));
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
    if (field.type === "assetList") {
      if (!Array.isArray(value)) { issues.push(issue(key, "FIELD_TYPE", field.label + " moet een lijst zijn.")); continue; }
      if (value.length > (field.maxItems || 40)) issues.push(issue(key, "FIELD_LIST_SIZE", field.label + ": hooguit " + (field.maxItems || 40) + " stuks."));
      if (value.some((entry) => typeof entry !== "string" || entry.length > field.maxLength || !ASSET_PATTERN.test(entry))) issues.push(issue(key, "FIELD_ASSET", field.label + " bevat een ongeldig asset."));
      else if (new Set(value).size !== value.length) issues.push(issue(key, "FIELD_DUPLICATE", field.label + " bevat hetzelfde model twee keer."));
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
    if (field.type === "refList") {
      refListIssues(key, field, value, issues, refs);
      continue;
    }
    if (field.type === "pointList") {
      if (!Array.isArray(value)) { issues.push(issue(key, "FIELD_TYPE", field.label + " moet een lijst zijn.")); continue; }
      if (value.length < field.minItems || value.length > field.maxItems) issues.push(issue(key, "FIELD_RANGE", field.label + ": " + field.minItems + " tot " + field.maxItems + " punten."));
      const lengthOk = (point) => point.length === 2 || (field.allowHeight && point.length === 3);
      const bad = value.some((point) => !Array.isArray(point) || !lengthOk(point) || point.some((n) => !Number.isInteger(n) || n < field.min || n > field.max));
      if (bad) issues.push(issue(key, "FIELD_POINT", field.label + ": elk punt is [x, z] in hele mm" + (field.allowHeight ? " (een loopvlak mag [x, z, hoogte])." : ".")));
      continue;
    }
    if (field.type === "areaSettings") {
      if (typeof value !== "object" || Array.isArray(value)) issues.push(issue(key, "FIELD_TYPE", field.label + " moet een object zijn."));
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

// Terugbouw zonder nodes: een lijst regels { ref, ...getallen } (startitems, winkel, beloning, ingrediënten).
function refListIssues(key, field, value, issues, refs) {
  if (!Array.isArray(value)) { issues.push(issue(key, "FIELD_TYPE", field.label + " moet een lijst zijn.")); return; }
  if (value.length < (field.minItems || 0) || value.length > field.maxItems) issues.push(issue(key, "FIELD_RANGE", field.label + ": " + (field.minItems || 0) + " tot " + field.maxItems + " regels."));
  const allowed = ["ref"].concat(field.columns.map((column) => column.key));
  const seen = new Set();
  value.forEach((row, index) => {
    const where = field.label + " regel " + (index + 1);
    if (!row || typeof row !== "object" || Array.isArray(row)) { issues.push(issue(key, "LIST_ROW", where + " is ongeldig.")); return; }
    const unknown = Object.keys(row).filter((name) => !allowed.includes(name));
    if (unknown.length) issues.push(issue(key, "FIELD_UNKNOWN", where + ": onbekend veld " + unknown.join(", ")));
    if (typeof row.ref !== "string" || !field.refKinds.some((kind) => row.ref.startsWith(kind + ":"))) {
      issues.push(issue(key, "REF_KIND", where + ": kies een " + field.refKinds.join(" of ") + "."));
    } else {
      if (seen.has(row.ref)) issues.push(issue(key, "FIELD_DUPLICATE", where + ": staat er al in."));
      seen.add(row.ref);
      refs.push(row.ref);
    }
    for (const column of field.columns) {
      const number = row[column.key];
      if (!Number.isInteger(number) || number < column.min || number > column.max) issues.push(issue(key, "FIELD_RANGE", where + ": " + column.label + " moet " + column.min + " tot " + column.max + " zijn."));
    }
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
  // Quest en NPC: doel/winkel-regels controleert de build (zo kun je velden in elke volgorde invullen).
  if (kind === "quest") {
    if (body.previousQuestRef && body.previousQuestRef === "quest:" + body.questId) issues.push(issue("previousQuestRef", "QUEST_SELF", "Een quest kan niet na zichzelf komen."));
    return;
  }
  if (kind === "item_definition") {
    // Uitrusting stapelt nooit: de build maakt er vanzelf een los stuk van (runtime-overlay), dus geen blokkade hier.
    return;
  }
  if (kind === "region") {
    if (body.minXMm >= body.maxXMm || body.minZMm >= body.maxZMm) issues.push(issue("maxXMm", "REGION_EMPTY", "Een Region moet breedte en diepte hebben (min < max)."));
    return;
  }
  if (kind === "area" && areaSoort(body) !== "deelgebied") { areaShapeIssues(body, issues); return; }
  if (kind === "area") {
    if (body.settings) issues.push(issue("settings", "SOORT_FIELD", "Een deelgebied heeft geen instellingen."));
    if (!body.regionRef) issues.push(issue("regionRef", "FIELD_REQUIRED", "Een deelgebied hoort bij een gebied."));
    if (!body.shape) issues.push(issue("shape", "FIELD_REQUIRED", "Vorm is verplicht."));
    if (Array.isArray(body.pointsMm) && body.pointsMm.some((point) => point.length !== 2)) issues.push(issue("pointsMm", "FIELD_POINT", "Alleen een loopvlak heeft een hoogte per punt."));
    if (Array.isArray(body.pointsMm) && body.pointsMm.length < 3) issues.push(issue("pointsMm", "FIELD_RANGE", "Een deelgebied heeft minstens 3 punten."));
    if (issues.length) return;
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

// Ombouw stap 2: begroeiing, pad, blokkade en loopvlak zijn altijd punten (getekend met de Area tool).
const DEELGEBIED_ONLY = ["regionRef", "priority", "musicAssetId", "safe", "minXMm", "maxXMm", "minZMm", "maxZMm", "centerXMm", "centerZMm", "radiusMm"];
function areaShapeIssues(body, issues) {
  const soort = areaSoort(body);
  const def = AREA_SOORTEN[soort];
  for (const field of DEELGEBIED_ONLY) {
    // De standaard (voorrang 0, veilig uit) telt als leeg: zo kan "nieuw met standaarden" elke soort maken.
    if (body[field] === CANONICAL_KINDS.area.fields[field]?.default) continue;
    if (body[field] !== undefined && body[field] !== null && body[field] !== "") issues.push(issue(field, "SOORT_FIELD", field + " hoort alleen bij een deelgebied."));
  }
  if (body.shape && body.shape !== "polygon") issues.push(issue("shape", "SOORT_SHAPE", def.label + " is altijd getekend met punten."));
  const points = Array.isArray(body.pointsMm) ? body.pointsMm : [];
  if (points.length < def.minPoints) issues.push(issue("pointsMm", "FIELD_REQUIRED", def.label + " heeft minstens " + def.minPoints + " punten nodig."));
  if (!def.height && points.some((point) => point.length !== 2)) issues.push(issue("pointsMm", "FIELD_POINT", "Alleen een loopvlak heeft een hoogte per punt."));
  for (const message of areaSettingsIssues(soort, body.settings)) issues.push(issue("settings", "SETTING_INVALID", message));
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
