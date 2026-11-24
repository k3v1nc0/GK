// Doorgangen (22-11): een portal van precies twee kanten, A en B. Los van 🌀 Portals: geen netwerk, geen vrijspelen,
// niet op de kaart als reisdoel. Voor de deur van een huis, een grot-ingang, een trap naar een etage, of een sprong
// naar een ander stuk wereld. De server beslist (afstand, sleutel, level, gevecht, vlag) en zet je aan de overkant.
// - Kaart 🚪 Doorgang in de Bibliotheek: sleep hem op de wereld = kant A onder de muis (kant B komt ernaast).
// - Klik een kant in de 3D-view: G = verplaatsen, R = draaien, T = groter/kleiner (elke kant apart).
import { LEVEL_LIMIT } from "../../../../apps/web/public/shared/level-math.js";
import { HELP_ID, HELP_NAME, help, ui } from "./ui.js";

const SIDE_A = "🅰️ Kant A";
const SIDE_B = "🅱️ Kant B";
const RULES = "🔒 Voorwaarden";

const POS_HELP = help(
  "Waar deze kant van de doorgang in de wereld staat.",
  "Klik de kant in de 3D-view en druk G om te verplaatsen; het getal volgt vanzelf.",
  "Staat in een muur of zweeft → klik hem in de 3D-view en verplaats hem met G."
);
const pos = (label, icon, required = false) => ({ type: "number", required, min: -100000, max: 100000, audience: "client", label,
  ui: ui(icon, "slider", "viewport", { step: 0.1, unit: "m", more: !required }), default: required ? 0 : null, help: POS_HELP });
const height = (label) => ({ type: "number", required: false, min: -1000, max: 10000, audience: "client", label,
  ui: ui("↕️", "slider", "viewport", { step: 0.1, unit: "m", more: true }), default: 0, help: POS_HELP });
const model = (label, group) => ({ type: "asset", assetType: "model", required: false, maxLength: 160, audience: "client", label,
  ui: ui("🧊", "asset", "werkbank", { group }), default: null,
  help: help("Het model van deze kant: een deur, een grot-ingang, een trap. Leeg = een rechtop staand vlak met een pijl (editor en game).",
    "Groene pijl omhoog = hier kun je door. Rode pijl omlaag = kant B van 'Alleen van A naar B': hier kom je alleen aan. Sleep een model op dit vak om in plaats van de pijl een deur of trap te tonen.",
    "Je ziet de pijl en wilt een deur → sleep een model op dit vak. De pijl is rood → zet 'Alleen van A naar B' uit als je ook terug moet kunnen.") });
const scale = (group) => ({ type: "number", required: false, min: 0.01, max: 100, audience: "client", label: "Grootte",
  ui: ui("📏", "slider", "werkbank", { step: 0.05, unit: "×", range: [0.1, 5], group }), default: 1,
  help: help("Hoe groot het model van deze kant getekend wordt.", "1 = zoals het model is gemaakt. Of klik de kant in de 3D-view en druk T.",
    "Model te groot of te klein → schuif, of druk T in de 3D-view.") });
const turn = (group) => ({ type: "number", required: false, min: 0, max: 359, audience: "client", label: "Draaien",
  ui: ui("🔄", "slider", "werkbank", { step: 1, unit: "°", group }), default: 0,
  help: help("Welke kant deze deur op kijkt. Wie hier aankomt, staat aan de voorkant en kijkt van de deur af.",
    "Schuif tot de voorkant naar het pad of de kamer wijst, of klik de kant in de 3D-view en druk R.",
    "Je komt in een muur of buiten de kamer aan → draai deze kant 180°.") });

// Kevin 24-11: elke kant heeft in de game een eigen naam: waar je naartoe gaat. Leeg = de naam van het deelgebied
// waar de andere kant staat (kant B in "Kasteel Hal" = kant A heet "Kasteel Hal").
const sideName = (group, side, other) => ({ type: "text", required: false, maxLength: 80, audience: "client", label: "Naam in de game",
  ui: ui("🏷️", "text", "werkbank", { group }), default: "",
  help: help("De naam boven kant " + side + " in de game: waar je naartoe gaat als je hier doorheen gaat.",
    "Leeg laten = vanzelf de naam van het deelgebied waar kant " + other + " staat. Iets anders (bijv. Kasteel)? Vul het hier in.",
    "Er staat een verkeerde naam boven de deur → vul hier zelf een naam in, of zet kant " + other + " in het goede deelgebied.") });

export const DOORWAY_USE_MODES = Object.freeze(["click", "walk"]);

export const DOORWAY_KINDS = {
  doorway: {
    label: "Doorgang",
    plural: "Doorgangen",
    icon: "🚪",
    place: "werkbank",
    singleton: false,
    domain: "world",
    idField: "doorwayId",
    fields: {
      doorwayId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Doorgang-ID",
        ui: ui("🔖", "id", "werkbank", { more: true }), default: null, help: HELP_ID("deze doorgang") },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam",
        ui: ui("🏷️", "text", "werkbank"), default: "", help: HELP_NAME("deze doorgang (bijv. \"Huis van Bram\")") },
      useMode: { type: "select", required: false, options: DOORWAY_USE_MODES.slice(), optionIcons: { click: "👆", walk: "🚶" },
        optionLabels: { click: "Klikken of E", walk: "Erin lopen" }, audience: "client", label: "Hoe ga je erdoor",
        ui: ui("🚪", "select", "werkbank"), default: "click",
        help: help("Klik je op de deur (of druk je E ervoor), of ga je er vanzelf door als je erin loopt?",
          "Klikken voor een deur van een huis. Erin lopen voor een grot, tunnel of trap.",
          "Spelers lopen per ongeluk naar binnen → kies Klikken of E.") },
      useMeters: { type: "integer", required: false, min: 1, max: 20, audience: "client", label: "Gebruiken binnen",
        ui: ui("👣", "slider", "werkbank", { step: 1, unit: "m", range: [1, 10] }), default: 2,
        help: help("Hoe dichtbij je moet staan. Bij Erin lopen: hoe dicht bij het midden van de deur je erdoor gaat.",
          "2 m voor een deur, 3 tot 4 m voor een brede grot-ingang.",
          "Je gaat er al door als je er langs loopt → lager. Je moet er te precies in lopen → hoger.") },
      oneWay: { type: "boolean", required: false, audience: "client", label: "Alleen van A naar B",
        ui: ui("➡️", "toggle", "werkbank"), default: false,
        help: help("Kun je alleen van kant A naar kant B? Kant B is dan alleen een aankomstplek.",
          "Uit voor een huis (heen en terug). Aan voor een val of een glijbaan naar beneden.",
          "Je kunt niet meer terug → zet dit uit.") },
      sideName: sideName(SIDE_A, "A", "B"),
      modelAssetId: model("Model", SIDE_A),
      scale: scale(SIDE_A),
      rotationY: turn(SIDE_A),
      bSideName: sideName(SIDE_B, "B", "A"),
      bModelAssetId: model("Model", SIDE_B),
      bScale: scale(SIDE_B),
      bRotationY: turn(SIDE_B),
      keyItemRef: { type: "ref", refKind: "item_definition", required: false, audience: "client", label: "Sleutel nodig",
        ui: ui("🗝️", "ref", "werkbank", { group: RULES }), default: null,
        help: help("Moet je een item in je tas hebben om erdoor te gaan? Het item blijft in je tas.",
          "Leeg = altijd open. Sleep een item (bijv. Keldersleutel) uit de Bibliotheek op dit vak.",
          "Niemand komt erin → kijk of het item ergens te krijgen is (buit, quest of winkel).") },
      minLevel: { type: "integer", required: false, min: 1, max: LEVEL_LIMIT, audience: "client", label: "Vanaf level",
        ui: ui("⭐", "slider", "werkbank", { step: 1, range: [1, 50], group: RULES }), default: 1,
        help: help("Vanaf welk level een speler erdoor mag.", "1 = iedereen. Hoger voor een gevaarlijke grot of kerker.",
          "Spelers komen te vroeg in een zwaar gebied → hoger.") },
      combatBlockSeconds: { type: "integer", required: false, min: 0, max: 120, audience: "client", label: "Niet na een gevecht",
        ui: ui("⚔️", "slider", "werkbank", { step: 1, unit: "s", range: [0, 60], group: RULES }), default: 5,
        help: help("Zolang je minder dan zoveel seconden geleden hebt gevochten, kun je er niet door. 0 = altijd.",
          "5 s, zodat je niet midden in een gevecht naar binnen vlucht.", "Spelers ontsnappen uit elk gevecht door een deur → hoger.") },
      flagRef: { type: "ref", refKind: "world_flag", required: false, audience: "client", label: "Alleen als vlag",
        ui: ui("🚩", "ref", "werkbank", { group: RULES }), default: null,
        help: help("Is de doorgang er alleen als een vlag aan (of uit) staat? Per speler: de een ziet de deur wel, de ander niet.",
          "Leeg = altijd. Sleep een 🚩 Vlag uit de Bibliotheek, bijv. Kelder open; een quest zet hem aan.",
          "Niemand ziet de deur → kijk of een quest de vlag wel aanzet.") },
      flagOn: { type: "select", required: false, options: ["on", "off"], optionLabels: { on: "De vlag staat aan", off: "De vlag staat uit" }, audience: "client", label: "Wanneer",
        ui: ui("🔁", "select", "werkbank", { group: RULES }), default: "on",
        help: help("Is de doorgang er als de vlag aan is, of juist als hij uit is?", "Aan: verschijnt na de quest. Uit: verdwijnt na de quest.",
          "Het werkt andersom → kies de andere.") },
      arriveMeters: { type: "number", required: false, min: 0, max: 30, audience: "client", label: "Aankomst voor de deur",
        ui: ui("🛬", "slider", "werkbank", { step: 0.5, unit: "m", range: [0, 10], more: true }), default: 2.5,
        help: help("Hoeveel meter voor de andere kant je aankomt.", "2 tot 3 m: net voor de deur, en verder dan 'Gebruiken binnen'.",
          "Je gaat meteen weer terug → hoger dan 'Gebruiken binnen'. Je komt te ver weg aan → lager.") },
      x: pos("X (kant A)", "↔️", true),
      y: height("Hoogte (kant A)"),
      z: pos("Z (kant A)", "↕️", true),
      bX: pos("X (kant B)", "↔️"),
      bY: height("Hoogte (kant B)"),
      bZ: pos("Z (kant B)", "↕️")
    }
  }
};

// Waar kant B staat. Nog niet neergezet (leeg) = 6 m naast kant A, zodat hij altijd te vinden is.
export function doorwaySideB(body = {}) {
  const has = Number.isFinite(Number(body.bX)) && Number.isFinite(Number(body.bZ)) && body.bX !== null && body.bZ !== null;
  return has
    ? { x: Number(body.bX), y: Number(body.bY) || 0, z: Number(body.bZ) }
    : { x: (Number(body.x) || 0) + 6, y: Number(body.y) || 0, z: Number(body.z) || 0 };
}
