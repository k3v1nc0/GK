// Lopen en botsen (3-11): hoe spelers en vijanden tegen water en rots aan lopen.
// Instellingen > Lopen en botsen. De wereldbouwer zet de waarden in world.terrain.waterWalk; de gedeelde loopregels
// (movement-kernel + edge-field) lezen ze, dus game en server doen precies hetzelfde.
// "Afgeronde rand" maakt van water en te steile rots één gladde, ronde rand op afstand: nooit meer vastlopen.
import { help, ui } from "./ui.js";

const num = (label, icon, def, min, max, step, unit, helpText, extra = {}) => ({ type: "number", required: false, min, max, audience: "client", label,
  ui: ui(icon, "slider", "instellingen", Object.assign({ step, unit }, extra)), default: def, help: helpText });
const GROUP_ROUTE = "🧭 Route bij klikken";
const toggle = (label, icon, def, helpText, extra = {}) => ({ type: "boolean", required: false, audience: "client", label,
  ui: ui(icon, "toggle", "instellingen", extra), default: def, help: helpText });

export const WATER_WALK_KINDS = {
  water_walk_settings: {
    label: "Lopen en botsen",
    icon: "🚧",
    place: "instellingen",
    singleton: true,
    domain: "project",
    fields: {
      edgeRound: toggle("Afgeronde rand", "🫧", true,
        help("Water en te steile rots krijgen samen één gladde, ronde rand op afstand. Je loopt er tegenaan als tegen een rechte lijn en glijdt er soepel langs.",
          "Aan laten staan. Uit = de oude regels (cirkel om de speler, helling per stap).",
          "Je komt niet dicht genoeg bij water of rots → Afstand lager. Je blijft haken → Afronden hoger.")),
      edgeDistance: num("Afstand tot water en rots", "📏", 0.7, 0, 3, 0.05, "m",
        help("Hoe ver het midden van je speler van het water en de rots blijft. Je lichaam is ongeveer 0,5 m breed.",
          "0,6 tot 1 m. Groter = je komt er niet eens in de buurt.",
          "Je loopt half in het water of tegen de rots → hoger. Smalle paden zijn dicht → lager."), { range: [0, 2] }),
      edgeSmooth: num("Afronden", "〰️", 1.5, 0, 5, 0.25, "m",
        help("Hoe rond en glad de rand wordt. Kartels en hoekjes van het terrein worden een vloeiende lijn.",
          "1 tot 2 m. 0 = de rand volgt elk hoekje van het terrein.",
          "Je blijft haken aan hoekjes → hoger. Smalle doorgangen of inhammen gaan dicht → lager."), { range: [0, 4] }),
      edgeSteep: toggle("Steile helling is ook een rand", "🪨", true,
        help("Grond die steiler is dan \"Te steil om te lopen\" (Terrein) hoort bij de rand, net als water.",
          "Aan laten staan: dan klim je nooit tegen een rotswand op.",
          "Je kunt een helling niet meer op die wel zou moeten → zet Te steil om te lopen in Terrein hoger.")),
      waterEdgeInset: num("Voeten in het water", "🦶", 0, 0, 1, 0.05, "m",
        help("Alleen als Afgeronde rand uit staat: hoe ver je met je voeten het water in mag bij water dat \"Niet in\" is.",
          "0,1 tot 0,3 m: je staat net aan de waterkant en stapt makkelijk een brug op.",
          "Je stopt te ver van het water of vóór de brug → hoger. Je loopt half in het water → lager."), { range: [0, 0.5], more: true }),
      waterBlockDepth: num("Tegenhouden vanaf diepte", "🌊", 0.02, 0, 2, 0.01, "m",
        help("Water dat \"Niet in\" is houdt je pas tegen als het dieper is dan dit. Ondieper water loop je gewoon door.",
          "0,02 m = altijd tegenhouden. 0,2 tot 0,4 m = door ondiepe randjes en plasjes heen.",
          "Je loopt diep het water in → lager. Je blijft hangen aan ondiepe randjes → hoger."), { range: [0, 1] }),
      edgeCell: num("Fijnheid van de rand", "🔍", 0.5, 0.25, 2, 0.25, "m",
        help("Hoe fijn het raster is waarop de rand wordt berekend.",
          "0,5 m. Kleiner = preciezer maar zwaarder voor een oude laptop.",
          "Game hapert als je ergens nieuw loopt → groter. Rand te grof → kleiner."), { more: true }),
      routeSearchSize: num("Zoekgebied route", "🧭", 16000, 2000, 60000, 1000, "",
        help("Hoeveel plekjes de route mag afzoeken als je ergens klikt om te lopen (bijv. aan de overkant van het water, via de brug).",
          "16.000. Groter = vindt ook een brug die ver weg ligt, maar zoekt langer.",
          "Je character loopt niet als je ver weg of over het water klikt → hoger. Klikken voelt traag → lager."),
        { group: GROUP_ROUTE, range: [4000, 40000] }),
      routeMaxSpacing: num("Grootste stap route", "👣", 8, 1, 8, 0.5, "m",
        help("Hoe grof de route over grote afstanden zoekt. Bruggen vindt hij altijd, ook bij grote stappen.",
          "8 m. Kleiner = preciezer om smalle doorgangen heen, maar zwaarder.",
          "De route mist een smal pad → kleiner. Klikken ver weg voelt traag → groter."),
        { group: GROUP_ROUTE })
    }
  }
};

// De waarden voor de wereld (alleen bekende velden, binnen min/max).
export function waterWalkValues(body = null) {
  const fields = WATER_WALK_KINDS.water_walk_settings.fields;
  const values = {};
  for (const [key, field] of Object.entries(fields)) {
    const raw = body ? body[key] : undefined;
    if (field.type === "boolean") { values[key] = typeof raw === "boolean" ? raw : field.default; continue; }
    const value = Number(raw);
    values[key] = raw !== undefined && raw !== null && raw !== "" && Number.isFinite(value) ? Math.min(field.max, Math.max(field.min, value)) : field.default;
  }
  return values;
}
