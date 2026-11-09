// Portals (8-11): reizen binnen dezelfde wereld.
// - Kaart 🌀 Portal in de Bibliotheek: sleep hem op de wereld (G = verplaatsen, R = draaien, S = groter/kleiner).
// - Loop je dichtbij, dan speel je hem vrij (de server onthoudt het per speler).
// - Tik op een portal op de minimap of de grote kaart = reizen. Doodgaan = terug bij de dichtstbijzijnde vrije portal.
// - Instellingen > 🌀 Portals: kosten, wachttijd, niet tijdens een gevecht en vanaf waar je mag reizen.
import { HELP_ID, HELP_MODEL, HELP_NAME, HELP_SCALE, help, ui } from "./ui.js";

const toggle = (label, icon, def, place, helpText, extra = {}) => ({ type: "boolean", required: false, audience: "client", label,
  ui: ui(icon, "toggle", place, extra), default: def, help: helpText });
const int = (label, icon, def, min, max, place, extra, helpText) => ({ type: "integer", required: false, min, max, audience: "client", label,
  ui: ui(icon, "slider", place, Object.assign({ step: 1 }, extra)), default: def, help: helpText });
const POS_HELP = help(
  "Waar de portal in de wereld staat.",
  "Klik hem in de 3D-view en druk G om te verplaatsen; het getal volgt vanzelf.",
  "Staat in een muur of zweeft → klik hem in de 3D-view en verplaats hem met G."
);
const pos = (label, icon) => ({ type: "number", required: true, min: -100000, max: 100000, audience: "client", label,
  ui: ui(icon, "slider", "viewport", { step: 0.1, unit: "m" }), default: 0, help: POS_HELP });

const COST_GROUP = "💰 Kosten van een reis";

export const PORTAL_TRAVEL_FROM = Object.freeze(["anywhere", "portal"]);

export const PORTAL_KINDS = {
  portal: {
    label: "Portal",
    plural: "Portals",
    icon: "🌀",
    place: "werkbank",
    singleton: false,
    domain: "world",
    idField: "portalId",
    fields: {
      portalId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Portal-ID",
        ui: ui("🔖", "id", "werkbank", { more: true }), default: null, help: HELP_ID("deze portal") },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam",
        ui: ui("🏷️", "text", "werkbank"), default: "", help: HELP_NAME("deze portal") },
      modelAssetId: { type: "asset", assetType: "model", required: false, maxLength: 160, audience: "client", label: "Model",
        ui: ui("🧊", "asset", "werkbank"), default: null, help: HELP_MODEL },
      scale: { type: "number", required: false, min: 0.01, max: 100, audience: "client", label: "Grootte",
        ui: ui("📏", "slider", "werkbank", { step: 0.05, unit: "×", range: [0.1, 5] }), default: 1, help: HELP_SCALE },
      rotationY: { type: "number", required: false, min: 0, max: 359, audience: "client", label: "Draaien",
        ui: ui("🔄", "slider", "werkbank", { step: 1, unit: "°" }), default: 0,
        help: help("Welke kant de portal op kijkt. Wie aankomt, staat aan de voorkant.", "Schuif tot de voorkant naar het pad wijst, of klik hem in de 3D-view en druk R.",
          "Je komt in een muur of in het water aan → draai de portal.") },
      unlockMeters: int("Vrijspelen binnen", "✨", 4, 1, 50, "werkbank", { range: [1, 20], unit: "m" },
        help("Hoe dichtbij een speler moet komen om deze portal vrij te spelen. Daarna kan hij er via de kaart naartoe reizen.",
          "3 tot 6 m: je moet er echt langs lopen.", "Spelers lopen er langs zonder hem vrij te spelen → hoger.")),
      startUnlocked: toggle("Meteen vrij", "🔓", false, "werkbank",
        help("Is deze portal voor iedereen al vanaf het begin vrijgespeeld?", "Aan voor de portal in het startdorp; uit voor alle andere.",
          "Nieuwe spelers kunnen nergens heen reizen → zet bij de start-portal aan.")),
      respawnHere: toggle("Respawn hier", "💀", true, "werkbank",
        help("Mag je hier terugkomen als je doodgaat? Je komt bij de dichtstbijzijnde vrijgespeelde portal waar dit aan staat.",
          "Aan voor de meeste portals.", "Spelers komen na doodgaan op een gevaarlijke plek terug → zet hier uit.")),
      arriveMeters: { type: "number", required: false, min: 0, max: 30, audience: "client", label: "Aankomst voor de portal",
        ui: ui("👣", "slider", "werkbank", { step: 0.5, unit: "m", range: [0, 10], more: true }), default: 2.5,
        help: help("Hoeveel meter voor de portal je aankomt na het reizen of na doodgaan.", "2 tot 3 m: net voor de portal.",
          "Je komt in de portal zelf aan → hoger. Je komt te ver weg aan → lager.") },
      flagRef: { type: "ref", refKind: "world_flag", required: false, audience: "client", label: "Alleen als vlag",
        ui: ui("🚩", "ref", "werkbank", { more: true }), default: null,
        help: help("Is deze portal er alleen als een vlag aan (of uit) staat? Per speler: de een ziet hem wel, de ander niet. Ook vrijspelen en reizen volgen dit.",
          "Leeg = altijd. Sleep een 🚩 Vlag uit de Bibliotheek, bijv. Brug hersteld; een quest zet hem aan.", "Niemand ziet de portal → kijk of een quest de vlag wel aanzet.") },
      flagOn: { type: "select", required: false, options: ["on", "off"], optionLabels: { on: "De vlag staat aan", off: "De vlag staat uit" }, audience: "client", label: "Wanneer",
        ui: ui("🔁", "select", "werkbank", { more: true }), default: "on",
        help: help("Staat de portal er als de vlag aan is, of juist als hij uit is?", "Aan: verschijnt na de quest. Uit: verdwijnt na de quest.", "Het werkt andersom → kies de andere.") },
      x: pos("X", "↔️"),
      y: { type: "number", required: false, min: -1000, max: 10000, audience: "client", label: "Hoogte",
        ui: ui("↕️", "slider", "viewport", { step: 0.1, unit: "m", more: true }), default: 0, help: POS_HELP },
      z: pos("Z", "↕️")
    }
  },
  portal_settings: {
    label: "Portals",
    icon: "🌀",
    place: "instellingen",
    singleton: true,
    domain: "project",
    fields: {
      travelFrom: { type: "select", required: false, options: PORTAL_TRAVEL_FROM.slice(), optionIcons: { anywhere: "🗺️", portal: "🌀" },
        optionLabels: { anywhere: "Overal (tik op de kaart)", portal: "Alleen als je bij een portal staat" }, audience: "client", label: "Reizen vanaf",
        ui: ui("🧭", "select", "instellingen"), default: "anywhere",
        help: help("Waar een speler moet zijn om te reizen. Overal: tik op een portal op de minimap of de grote kaart. Alleen bij een portal: eerst naar een portal lopen.",
          "Overal is het makkelijkst. Alleen bij een portal maakt lopen belangrijker.", "Spelers reizen te makkelijk weg uit gevaar → Alleen bij een portal.") },
      costCurrencyRef: { type: "ref", refKind: "currency", required: false, audience: "client", label: "Betalen met",
        ui: ui("🪙", "ref", "instellingen", { group: COST_GROUP }), default: null,
        help: help("Met welke valuta je betaalt voor een reis. Leeg = reizen is altijd gratis.", "Leeg, of sleep Goud uit de Bibliotheek op dit vak.",
          "Kosten worden niet afgeschreven → sleep hier een valuta op.") },
      costFlat: int("Kosten per reis", "💰", 0, 0, 1000000, "instellingen", { range: [0, 1000], group: COST_GROUP },
        help("Vaste prijs voor elke reis (met de valuta hierboven).", "0 tot 20 aan het begin van het spel.", "Spelers lopen nooit meer → hoger.")),
      costPer100m: int("Kosten per 100 m", "📏", 0, 0, 100000, "instellingen", { range: [0, 100], group: COST_GROUP },
        help("Extra prijs voor elke 100 meter dat de reis lang is. Ver reizen kost zo meer.", "0 tot 5.", "Een korte reis is te duur → lager.")),
      freeAtPortal: toggle("Gratis vanaf een portal", "🆓", true, "instellingen",
        help("Sta je bij een portal (binnen zijn vrijspeel-afstand), dan is de reis gratis. Alleen vanaf een andere plek betaal je.",
          "Aan: zo werkt het in veel MMO's (ESO).", "Spelers betalen nooit omdat ze altijd eerst naar een portal lopen → zet uit."), { group: COST_GROUP }),
      cooldownSeconds: int("Wachttijd na reizen", "⏳", 0, 0, 3600, "instellingen", { range: [0, 300], unit: "s" },
        help("Hoe lang je moet wachten voordat je weer mag reizen.", "0 s, of 30 tot 60 s als spelers te vaak heen en weer springen.",
          "Spelers springen steeds heen en weer → hoger.")),
      combatBlockSeconds: int("Niet reizen na een gevecht", "⚔️", 8, 0, 120, "instellingen", { range: [0, 60], unit: "s" },
        help("Zolang je minder dan zoveel seconden geleden hebt gevochten (geslagen of geraakt), kun je niet reizen. 0 = reizen mag altijd.",
          "5 tot 10 s, zodat je niet midden in een gevecht wegspringt.", "Spelers ontsnappen uit elk gevecht → hoger.")),
      respawnAtPortal: toggle("Respawn bij een portal", "💀", true, "instellingen",
        help("Kom je na doodgaan terug bij de dichtstbijzijnde vrijgespeelde portal (met Respawn hier aan)? Uit = altijd bij de startplek.",
          "Aan (standaard).", "Spelers moeten na doodgaan steeds ver teruglopen → zet aan."))
    }
  }
};

// De waarden voor de wereld (alleen bekende velden, binnen min/max).
export function portalSettingsValues(body = null) {
  const fields = PORTAL_KINDS.portal_settings.fields;
  const values = {};
  for (const [key, field] of Object.entries(fields)) {
    const raw = body ? body[key] : undefined;
    if (field.type === "select") { values[key] = field.options.includes(raw) ? raw : field.default; continue; }
    if (field.type === "boolean") { values[key] = typeof raw === "boolean" ? raw : field.default; continue; }
    if (field.type === "ref") { values[key] = typeof raw === "string" && raw ? raw : null; continue; }
    const value = Math.round(Number(raw));
    values[key] = raw !== undefined && raw !== null && raw !== "" && Number.isFinite(value) ? Math.min(field.max, Math.max(field.min, value)) : field.default;
  }
  return values;
}
