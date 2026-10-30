// Ombouw stap 2 (gedeeld door server en editor): één Area tool. Elk vlak of elke lijn is één document "area" met een veld soort.
// Per soort leest de game hem met hetzelfde tekenwerk als de oude node (zelfde read-model), zodat een
// verhuisd pad, bos of blokkade er precies hetzelfde uitziet. De instellingen per soort staan in "settings";
// hun regels (type, min, max, keuzes) komen uit de oude nodedefinitie, de naam/icoon/hulp staat hier.
import { NODE_TYPES } from "./node-types.js";

// Zelfde vorm als help() in src/shared/authoring/kinds/ui.js (dit bestand draait ook in de browser).
const help = (waarvoor, goed, probleem) => Object.freeze({ waarvoor, goed, probleem });

export const AREA_SOORT_ORDER = Object.freeze(["begroeiing", "pad", "blokkade", "loopvlak", "deelgebied"]);

// geometry: velden van de oude node die de Area tool uit de punten afleidt (staan niet in settings).
// main: de velden die in beeld staan (rest onder ⚙️ meer).
export const AREA_SOORTEN = Object.freeze({
  begroeiing: {
    label: "Begroeiing", icon: "🌳", nodeType: "bounded_area_scatter", closed: true, minPoints: 3,
    geometry: ["scatterId", "label", "areaCenterX", "areaCenterZ", "areaWidth", "areaDepth", "areaRotationY", "sourceNodeIds", "points"],
    main: ["sourceAssetIds", "count", "scaleMin", "scaleMax", "itemsBlockPlayer", "groundCoverEnabled"]
  },
  pad: {
    label: "Pad / oppervlak", icon: "🛤️", nodeType: "surface_layer", closed: false, minPoints: 2,
    geometry: ["surfaceId", "label", "points"],
    main: ["textureAssetId", "width", "surfaceKind", "animated", "blocksPlayer"]
  },
  blokkade: {
    label: "Blokkade", icon: "🧱", nodeType: "blocker_area", closed: true, minPoints: 3,
    geometry: ["blockerId", "label", "shapeType", "x", "z", "width", "depth", "radius", "points"],
    main: ["reason"]
  },
  loopvlak: {
    label: "Loopvlak", icon: "🌉", nodeType: "walkable_surface", closed: true, minPoints: 3, height: true,
    geometry: ["surfaceId", "label", "x", "y", "z", "width", "depth", "rotationY", "points"],
    main: ["priority"]
  },
  // Een deelgebied (F4) gebruikt zijn eigen velden (gebied, muziek, veilig, voorrang); geen settings.
  deelgebied: { label: "Deelgebied", icon: "🔷", nodeType: "area_definition", closed: true, minPoints: 3, geometry: [], main: [] }
});

// Naam, icoon en Ⓘ-hulp per instelling: [icoon, naam, waarvoor, goede waarden, probleem → oplossing].
const T = {
  sourceAssetIds: ["🌳", "Wat groeit hier", "De modellen die in dit vlak worden verspreid (bomen, stenen, gras).", "Sleep 1 tot 4 modellen uit de Bibliotheek op dit vak.", "Niets te zien → sleep minstens één model hierop."],
  count: ["🔢", "Hoeveel", "Hoeveel objecten er in het vlak komen.", "10 tot 200. Meer kost snelheid op een oude laptop.", "Spel hapert → zet minder objecten."],
  scaleMin: ["📏", "Kleinste maat", "De kleinste maat van een object (1 = normaal).", "0.8 tot 1.", "Alles even groot → zet kleinste en grootste maat verschillend."],
  scaleMax: ["📏", "Grootste maat", "De grootste maat van een object (1 = normaal).", "1 tot 1.5.", "Te grote bomen → zet dit lager."],
  itemsBlockPlayer: ["🪨", "Objecten blokkeren", "Spelers lopen niet door de objecten heen.", "Aan voor bomen en rotsen, uit voor gras.", "Speler loopt door bomen → zet dit aan."],
  groundCoverEnabled: ["🟩", "Grondkleur tonen", "Kleurt de grond binnen het vlak.", "Aan voor een bos met donkere grond.", "Lelijke rand → zet de randvervaging hoger."],
  enabled: ["✅", "Aan", "Of dit vlak in de wereld staat.", "Aan. Zet uit om tijdelijk te verbergen.", "Vlak weg → zet dit aan."],
  randomObjectSelection: ["🎲", "Willekeurig model", "Kiest per plek een willekeurig model uit de lijst.", "Aan bij meerdere modellen.", "Steeds hetzelfde model → zet dit aan."],
  boundaryBlocksPlayer: ["🚧", "Rand blokkeert", "Het hele vlak is een muur, ook tussen de objecten.", "Aan voor een dicht bos waar niemand in mag.", "Speler kan er niet in → zet dit uit."],
  collisionRadius: ["⭕", "Botsmaat per object", "Hoe dik elk object is voor botsen (meter).", "0.3 tot 1.", "Speler blijft haken → kleiner."],
  groundColor: ["🎨", "Grondkleur", "De kleur van de grond in het vlak.", "Donkergroen voor bos, bruin voor aarde.", "Kleur te fel → kies een donkerdere kleur."],
  groundEdgeFade: ["🌫️", "Randvervaging", "Hoe zacht de rand van de grondkleur overloopt (meter).", "1 tot 3.", "Harde rand → hoger."],
  patternType: ["🔣", "Patroon", "In wat voor patroon de objecten staan.", "Recht voor een boomgaard, anders willekeurig.", "Te netjes → kies een ander patroon of meer willekeur."],
  patternRandomness: ["🎲", "Willekeur", "Hoeveel het patroon door elkaar ligt (0-100).", "60 tot 100 voor natuur.", "Te netjes → hoger."],
  minSpacing: ["↔️", "Minimale afstand", "Hoe ver objecten minstens uit elkaar staan (meter).", "1 tot 4 voor bomen.", "Objecten overlappen → hoger."],
  edgeSpacing: ["⬜", "Afstand tot rand", "Hoe ver objecten van de rand blijven (meter).", "0 tot 2.", "Objecten steken uit → hoger."],
  spacingStrength: ["🧲", "Afstand-sterkte", "Hoe streng de minimale afstand geldt (0-100).", "50 tot 100.", "Klonten → hoger."],
  edgeJitter: ["〰️", "Rand-schommel", "Hoeveel objecten langs de rand verschuiven (0-100).", "10 tot 40.", "Rand te strak → hoger."],
  distributionMode: ["🗺️", "Verdeling", "Hoe de objecten over het vlak verdeeld worden.", "Willekeurig voor natuur.", "Gaten in het vlak → kies gelijkmatig."],
  edgeDensity: ["🧱", "Rand-dichtheid", "Meer objecten langs de rand (0-100).", "0 voor een gewoon bos, hoger voor een haag.", "Midden leeg → lager."],
  seed: ["🌱", "Zaadje", "Een woord dat de verdeling bepaalt; ander woord = andere verdeling.", "Laat staan, of typ iets anders voor een nieuwe verdeling.", "Verdeling niet mooi → typ een ander woord."],
  sizeInwardInfluence: ["🎯", "Groter naar binnen", "Objecten in het midden worden groter (0-100).", "0 tot 50.", "Midden te groot → lager."],
  sizeCurve: ["📈", "Groei-verloop", "Hoe snel objecten naar het midden groter worden.", "Lineair.", "Te plotseling → kies een zachtere curve."],
  rotationYMin: ["🔄", "Draaiing van", "Kleinste draaiing van een object (graden).", "0.", "Alles dezelfde kant op → zet van/tot verschillend."],
  rotationYMax: ["🔄", "Draaiing tot", "Grootste draaiing van een object (graden).", "360 voor natuur.", "Alles dezelfde kant op → zet dit op 360."],
  sourceScaleMultipliers: ["📐", "Maat per model", "Extra maat per model (technisch).", "Laat staan.", "Eén model te groot → pas het aan in het oude paneel of maak het model kleiner."],
  textureAssetId: ["🖼️", "Textuur", "Het plaatje van het pad (zand, steen, water).", "Sleep een textuur uit de Bibliotheek op dit vak.", "Pad is egaal bruin → sleep een textuur hierop."],
  width: ["↔️", "Breedte", "Hoe breed het pad is (meter).", "2 tot 6 voor een pad, 8 tot 20 voor een rivier.", "Pad te smal → hoger."],
  surfaceKind: ["🛤️", "Soort", "Wat voor oppervlak dit is.", "Pad, weg, water of modder.", "Water beweegt niet → zet 'Beweegt' aan."],
  animated: ["🌊", "Beweegt", "De textuur stroomt, zoals water.", "Aan voor water en lava.", "Water staat stil → zet dit aan en geef een snelheid."],
  blocksPlayer: ["🚧", "Blokkeert spelers", "Spelers kunnen hier niet over lopen.", "Aan voor diep water of lava.", "Speler loopt over water → zet dit aan."],
  fallbackColor: ["🎨", "Kleur zonder textuur", "De kleur als er (nog) geen textuur is.", "Een kleur die bij de textuur past.", "Vreemde kleur → kies een textuur."],
  yOffset: ["⬆️", "Hoogte boven grond", "Hoe ver het pad boven de grond ligt (meter).", "0.01 tot 0.05.", "Pad flikkert → iets hoger."],
  textureScaleX: ["↔️", "Textuurmaat breed", "Hoe vaak de textuur in de breedte herhaalt.", "1.", "Textuur uitgerekt → aanpassen."],
  textureScaleY: ["↕️", "Textuurmaat lang", "Hoe vaak de textuur in de lengte herhaalt.", "1.", "Textuur uitgerekt → aanpassen."],
  textureScale: ["📐", "Textuurmaat (oud)", "Oude textuurmaat (alleen voor oude paden).", "Laat staan.", "Geen effect → gebruik breed/lang."],
  secondaryTextureAssetId: ["🖼️", "Tweede textuur", "Een tweede plaatje erover, voor meer variatie.", "Een vlekkerige textuur.", "Te druk → zet de sterkte lager."],
  secondaryTextureScaleX: ["↔️", "Tweede maat breed", "Herhaling van de tweede textuur in de breedte.", "1.", "Uitgerekt → aanpassen."],
  secondaryTextureScaleY: ["↕️", "Tweede maat lang", "Herhaling van de tweede textuur in de lengte.", "1.", "Uitgerekt → aanpassen."],
  secondaryTextureScale: ["📐", "Tweede maat (oud)", "Oude maat van de tweede textuur.", "Laat staan.", "Geen effect → gebruik breed/lang."],
  secondaryTextureStrength: ["🎚️", "Tweede sterkte", "Hoe sterk de tweede textuur meedoet (0-1).", "0.2 tot 0.4.", "Te druk → lager."],
  edgeFadeWidth: ["🌫️", "Randvervaging", "Hoe zacht de rand van het pad is (meter).", "0.5 tot 1.5.", "Harde rand → hoger."],
  edgeFadeNoiseAssetId: ["🌀", "Rand-ruis", "Een plaatje dat de rand grillig maakt.", "Een ruis-textuur.", "Rand te recht → sleep een ruis-textuur hierop."],
  edgeFadeNoiseScaleX: ["↔️", "Rand-ruis breed", "Herhaling van de rand-ruis in de breedte.", "1.", "Ruis te grof → hoger."],
  edgeFadeNoiseScaleY: ["↕️", "Rand-ruis lang", "Herhaling van de rand-ruis in de lengte.", "1.", "Ruis te grof → hoger."],
  edgeFadeNoiseScale: ["📐", "Rand-ruis (oud)", "Oude maat van de rand-ruis.", "Laat staan.", "Geen effect → gebruik breed/lang."],
  edgeFadeNoiseStrength: ["🎚️", "Rand-ruis sterkte", "Hoe sterk de rand grillig is (0-1).", "0.2 tot 0.5.", "Rand rafelig → lager."],
  opacity: ["👻", "Zichtbaarheid", "Hoe doorzichtig het pad is (0-1).", "1 voor een pad, 0.7 voor water.", "Pad onzichtbaar → hoger."],
  flowSpeed: ["💨", "Stroomsnelheid", "Hoe snel de textuur stroomt.", "0.2 tot 1 voor een rivier.", "Te snel → lager."],
  flowDirection: ["🧭", "Stroomrichting", "De richting van de stroming (graden).", "Dezelfde kant als de rivier.", "Stroomt verkeerd om → plus of min 180."],
  flowTextureLayer: ["🧩", "Wat stroomt", "Welke textuur stroomt.", "De eerste (main).", "Niets stroomt → kies beide."],
  reason: ["❓", "Waarom", "Wat voor blokkade dit is (berg, gat, muur).", "Kies wat het beste past; het werkt hetzelfde.", "Verkeerd label op de kaart → kies een andere reden."],
  priority: ["🥇", "Voorrang", "Welk loopvlak wint als twee elkaar overlappen.", "10. Hoger voor een brug over een ander loopvlak.", "Speler zakt door de brug → hoger."]
};

const OPTION_LABELS = {
  path: "Pad", road: "Weg", water: "Water", river: "Rivier", mud: "Modder", lava: "Lava", snow: "Sneeuw", custom: "Anders",
  mountain: "Berg", gap: "Gat", wall: "Muur", cliff: "Klif", forbidden: "Verboden", main: "Eerste", secondary: "Tweede", both: "Beide"
};
const OPTION_ICONS = { mountain: "⛰️", gap: "🕳️", wall: "🧱", cliff: "🪨", forbidden: "⛔" };

// Schuifbereik voor velden waar de node-grenzen veel te ruim zijn (het vak mag nog steeds tot min/max).
const SLIDER_RANGES = {
  scaleMin: [0.05, 5], scaleMax: [0.05, 5], collisionRadius: [0.05, 5], minSpacing: [0, 20], edgeSpacing: [0, 20],
  width: [0.5, 50], yOffset: [-2, 5], flowSpeed: [0, 5],
  textureScale: [0.1, 20], textureScaleX: [0.1, 20], textureScaleY: [0.1, 20],
  secondaryTextureScale: [0.1, 20], secondaryTextureScaleX: [0.1, 20], secondaryTextureScaleY: [0.1, 20],
  edgeFadeNoiseScale: [0.1, 20], edgeFadeNoiseScaleX: [0.1, 20], edgeFadeNoiseScaleY: [0.1, 20]
};

function settingSpec(soort, key, nodeField) {
  const text = T[key] || ["•", nodeField.label || key, "Instelling " + (nodeField.label || key) + " van dit vlak.", "Laat de standaard staan als je twijfelt.", "Ziet er raar uit → zet de standaard terug."];
  const spec = { type: nodeField.type, label: text[1], icon: text[0], default: nodeField.default ?? null,
    more: !AREA_SOORTEN[soort].main.includes(key), help: help(text[2], text[3], text[4]) };
  if (nodeField.type === "number") {
    spec.min = Number.isFinite(nodeField.min) ? nodeField.min : -100000;
    spec.max = Number.isFinite(nodeField.max) ? nodeField.max : 100000;
    spec.step = nodeField.step || 1;
    // Een slider van 0 tot 100000 is niet te schuiven: het vak mag wel tot min/max.
    if (spec.max - spec.min > 1000) spec.range = [Math.max(spec.min, Math.min(0, spec.max)), Math.min(spec.max, Math.max(spec.min, 500))];
    if (SLIDER_RANGES[key]) {
      spec.range = [Math.max(spec.min, SLIDER_RANGES[key][0]), Math.min(spec.max, SLIDER_RANGES[key][1])];
      spec.step = Math.min(spec.step, (spec.range[1] - spec.range[0]) <= 5 ? 0.05 : 0.1);
    }
  }
  if (nodeField.type === "select") {
    spec.options = (nodeField.options || []).map((option) => {
      const value = typeof option === "object" ? option.value : option;
      const label = OPTION_LABELS[value] || (typeof option === "object" ? option.label : value);
      return { value, label, icon: OPTION_ICONS[value] || "" };
    });
  }
  if (nodeField.type === "asset") spec.assetTypes = (nodeField.assetTypes || ["texture", "image"]).slice();
  if (key === "sourceAssetIds") { spec.type = "assetList"; spec.assetTypes = ["model"]; spec.maxItems = 16; }
  if (nodeField.type === "text") spec.maxLength = nodeField.maxLength || 120;
  return spec;
}

function buildSettingSpecs() {
  const out = {};
  for (const [soort, def] of Object.entries(AREA_SOORTEN)) {
    const fields = {};
    const nodeFields = def.nodeType && def.geometry.length ? NODE_TYPES[def.nodeType]?.fields || {} : {};
    // Eerst de velden in beeld (in de volgorde van main), dan de rest.
    const keys = def.main.concat(Object.keys(nodeFields).filter((key) => !def.main.includes(key)));
    for (const key of keys) {
      const nodeField = nodeFields[key];
      if (!nodeField || def.geometry.includes(key)) continue;
      fields[key] = settingSpec(soort, key, nodeField);
    }
    out[soort] = { label: def.label, icon: def.icon, closed: def.closed, minPoints: def.minPoints, height: Boolean(def.height), fields };
  }
  return out;
}

// JSON-schema van de instellingen per soort (gaat mee naar de Werkbank in workspace.kinds).
export const AREA_SETTING_SPECS = Object.freeze(buildSettingSpecs());

const COLOR = /^#[0-9a-fA-F]{6}$/;
const ASSET = /^[A-Za-z0-9_.:-]+$/;

// Controleert settings tegen de regels van de soort. Geeft een lijst foutmeldingen.
export function areaSettingsIssues(soort, settings) {
  const specs = AREA_SETTING_SPECS[soort]?.fields || {};
  if (settings === undefined || settings === null) return [];
  if (typeof settings !== "object" || Array.isArray(settings)) return ["Instellingen moeten een object zijn."];
  const issues = [];
  for (const [key, value] of Object.entries(settings)) {
    const spec = specs[key];
    if (!spec) { issues.push("Onbekende instelling " + key + " voor " + soort + "."); continue; }
    if (value === null) continue;
    const name = spec.label;
    if (spec.type === "number" && (typeof value !== "number" || !Number.isFinite(value) || value < spec.min || value > spec.max)) issues.push(name + " moet een getal tussen " + spec.min + " en " + spec.max + " zijn.");
    else if (spec.type === "boolean" && typeof value !== "boolean") issues.push(name + " moet aan of uit zijn.");
    else if (spec.type === "select" && !spec.options.some((option) => option.value === value)) issues.push(name + " heeft een ongeldige keuze.");
    else if (spec.type === "color" && (typeof value !== "string" || !COLOR.test(value))) issues.push(name + " moet een kleur zijn (#rrggbb).");
    else if (spec.type === "asset" && (typeof value !== "string" || value.length > 160 || !ASSET.test(value))) issues.push(name + " is geen geldig asset.");
    else if (spec.type === "text" && (typeof value !== "string" || value.length > spec.maxLength)) issues.push(name + " is geen geldige tekst.");
    else if (spec.type === "assetList" && (!Array.isArray(value) || value.length > spec.maxItems || value.some((id) => typeof id !== "string" || !ASSET.test(id)))) issues.push(name + " moet een lijst modellen zijn.");
    else if (spec.type === "json" && (typeof value !== "object" || Array.isArray(value))) issues.push(name + " is ongeldig.");
  }
  return issues;
}

export function areaSoort(body) {
  return AREA_SOORTEN[body?.soort] ? body.soort : "deelgebied";
}

const mmToM = (mm) => Math.round(mm) / 1000;

// De punten van een vlak in meters ({x, z} of {x, y, z} bij een loopvlak).
export function areaPointsMeters(body) {
  const points = Array.isArray(body?.pointsMm) ? body.pointsMm : [];
  return points.map((point) => (point.length > 2 ? { x: mmToM(point[0]), y: mmToM(point[2]), z: mmToM(point[1]) } : { x: mmToM(point[0]), z: mmToM(point[1]) }));
}

function bounds(points) {
  if (!points.length) return { x: 0, z: 0, width: 0, depth: 0 };
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minZ = Math.min(...zs); const maxZ = Math.max(...zs);
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, width: Math.max(0.01, maxX - minX), depth: Math.max(0.01, maxZ - minZ) };
}

function nodeDefaults(nodeType) {
  const out = {};
  for (const [key, field] of Object.entries(NODE_TYPES[nodeType]?.fields || {})) {
    if (field.default !== undefined) out[key] = JSON.parse(JSON.stringify(field.default));
  }
  return out;
}

// Document -> waarden zoals de oude node ze had (meters). runtimeId wordt de ID in de wereld.
// Eén functie voor de build (server) en het puntengereedschap (editor), zodat beide hetzelfde zien.
export function areaNodeValues(body, runtimeId) {
  const soort = areaSoort(body);
  const def = AREA_SOORTEN[soort];
  const points = areaPointsMeters(body);
  const box = bounds(points);
  const values = Object.assign(nodeDefaults(def.nodeType), body.settings || {});
  const label = String(body.displayName || runtimeId);
  values.label = label;
  values.points = points;
  if (soort === "begroeiing") {
    Object.assign(values, { scatterId: runtimeId, areaCenterX: box.x, areaCenterZ: box.z, areaWidth: box.width, areaDepth: box.depth, areaRotationY: 0, sourceNodeIds: [] });
  } else if (soort === "pad") {
    values.surfaceId = runtimeId;
  } else if (soort === "blokkade") {
    Object.assign(values, { blockerId: runtimeId, shapeType: "polygon", x: box.x, z: box.z, width: box.width, depth: box.depth });
  } else if (soort === "loopvlak") {
    const firstY = points.find((point) => Number.isFinite(point.y))?.y ?? 0;
    Object.assign(values, { surfaceId: runtimeId, x: box.x, y: firstY, z: box.z, width: box.width, depth: box.depth, rotationY: 0 });
  } else {
    Object.assign(values, { areaId: runtimeId, shapeType: "polygon", x: box.x, y: 0, z: box.z, width: box.width, depth: box.depth });
  }
  return values;
}

const toMm = (meters) => Math.round(Number(meters) * 1000);

// Punten in meters -> pointsMm (hele mm). Een loopvlak houdt zijn hoogte per punt.
export function areaPointsMm(points, withHeight) {
  return (points || []).filter((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.z)))
    .map((point) => (withHeight ? [toMm(point.x), toMm(point.z), toMm(Number.isFinite(Number(point.y)) ? point.y : 0)] : [toMm(point.x), toMm(point.z)]));
}

// Een wijziging van het puntengereedschap (in node-waarden) -> nieuw document.
// Afgeleide velden (midden, breedte, ...) gaan niet mee: die rekent de build zelf uit de punten.
export function areaBodyFromNodePatch(body, patch) {
  const soort = areaSoort(body);
  const def = AREA_SOORTEN[soort];
  const next = JSON.parse(JSON.stringify(body || {}));
  const specs = AREA_SETTING_SPECS[soort].fields;
  for (const [key, value] of Object.entries(patch || {})) {
    if (key === "points") {
      next.pointsMm = areaPointsMm(value, Boolean(def.height));
      if (soort === "deelgebied") {
        next.shape = "polygon";
        for (const field of ["minXMm", "maxXMm", "minZMm", "maxZMm", "centerXMm", "centerZMm", "radiusMm"]) delete next[field];
      }
      continue;
    }
    if (!specs[key]) continue;
    next.settings = Object.assign({}, next.settings || {});
    if (value === null || value === undefined) delete next.settings[key];
    else next.settings[key] = value;
  }
  if (soort !== "deelgebied" && !next.shape) next.shape = "polygon";
  return next;
}

// Welk veld de ID in de wereld draagt per soort (de build zet de game-ID, de editor "doc:area:<id>").
export const AREA_RUNTIME_ID_FIELD = Object.freeze({ begroeiing: "scatterId", pad: "surfaceId", blokkade: "blockerId", loopvlak: "surfaceId" });
export const AREA_EDITOR_PREFIX = "doc:area:";

const DEELGEBIED_FIELDS = ["regionRef", "priority", "musicAssetId", "safe", "minXMm", "maxXMm", "minZMm", "maxZMm", "centerXMm", "centerZMm", "radiusMm"];

// Soort wisselen: de punten blijven, de instellingen van de oude soort gaan weg.
// regions: [{ docKey, body }] om een deelgebied vanzelf in het gebied te zetten waar het ligt.
export function convertAreaSoort(body, soort, regions = []) {
  const next = JSON.parse(JSON.stringify(body || {}));
  const def = AREA_SOORTEN[soort];
  if (!def) return next;
  delete next.settings;
  const points = Array.isArray(next.pointsMm) && next.pointsMm.length ? next.pointsMm : null;
  if (points) next.pointsMm = points.map((point) => (def.height ? [point[0], point[1], point.length > 2 ? point[2] : 0] : [point[0], point[1]]));
  next.soort = soort;
  next.shape = "polygon";
  for (const field of ["minXMm", "maxXMm", "minZMm", "maxZMm", "centerXMm", "centerZMm", "radiusMm"]) delete next[field];
  if (soort === "deelgebied") {
    if (!next.regionRef && points) {
      const cx = points.reduce((sum, point) => sum + point[0], 0) / points.length;
      const cz = points.reduce((sum, point) => sum + point[1], 0) / points.length;
      const region = regions.find((entry) => cx >= entry.body.minXMm && cx < entry.body.maxXMm && cz >= entry.body.minZMm && cz < entry.body.maxZMm);
      if (region) next.regionRef = region.docKey;
    }
  } else {
    for (const field of DEELGEBIED_FIELDS) delete next[field];
  }
  return next;
}
