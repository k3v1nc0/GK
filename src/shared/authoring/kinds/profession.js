// Werkbank Fase 9: beroepen. Een beroep (bijv. Smeden) heeft niveaus; je stijgt door grondstoffen te verzamelen en
// dingen te maken. Grondstoffen en recepten zeggen bij welk beroep ze horen, vanaf welk niveau en hoeveel beroeps-XP
// ze geven. Een werkplek (NPC of model) hoort bij één beroep. Hoeveel beroepen een character mag hebben staat in
// Instellingen > 💰 Geld (keuze van Kevin 13-11: een schuifje, standaard alle).
import { HELP_ID, HELP_NAME, help, ui } from "./ui.js";

export const PROFESSION_GROUP = "🧰 Beroep";
export const LEARN_MODES = Object.freeze(["start", "buy", "quest", "level"]);

export const PROFESSION_KINDS = {
  profession: {
    label: "Beroep",
    plural: "Beroepen",
    icon: "🧰",
    place: "werkbank",
    singleton: false,
    domain: "economy",
    idField: "professionId",
    fields: {
      professionId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Beroep-ID",
        ui: ui("🔖", "id", "werkbank", { more: true }), default: null, help: HELP_ID("dit beroep") },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam",
        ui: ui("🏷️", "text", "werkbank"), default: "", help: HELP_NAME("dit beroep") },
      iconAssetId: { type: "asset", assetType: "image", required: false, maxLength: 160, audience: "client", label: "Icoon",
        ui: ui("🖼️", "asset", "werkbank"), default: null,
        help: help("Het plaatje van dit beroep in de game (bij Maken en bij Uitrusting onder Beroepen).", "Een klein vierkant plaatje, bijv. een hamer voor Smeden. Leeg mag: dan een gereedschapje.", "Wazig plaatje → kies een groter plaatje (64-128 px).") },
      maxLevel: { type: "integer", required: false, min: 1, max: 100, audience: "client", label: "Hoogste niveau",
        ui: ui("🏔️", "slider", "werkbank", { step: 1, range: [1, 50] }), default: 10,
        help: help("Hoe ver je in dit beroep kunt stijgen. Een recept of grondstof boven dit niveau is nooit te halen (⚖️ Balans zegt het).", "10 voor een eerste beroep; meer als je veel recepten hebt.", "Spelers zijn snel klaar met het beroep → hoger, en zet er recepten bij.") },
      xpPerLevel: { type: "integer", required: false, min: 1, max: 100000, audience: "client", label: "XP per niveau",
        ui: ui("⭐", "slider", "werkbank", { step: 5, range: [10, 1000] }), default: 100,
        help: help("Hoeveel beroeps-XP je nodig hebt voor elk volgend niveau (elk niveau evenveel).", "100: met 10 XP per grondstof ben je na 10 keer verzamelen een niveau hoger.", "Spelers stijgen te snel → hoger. Het duurt eindeloos → lager, of geef meer beroeps-XP per grondstof of recept.") }
    }
  }
};

// Velden die een grondstof en een recept allebei krijgen (beroep, niveau, beroeps-XP).
// subject = "deze grondstof", verb = "oogsten", verbYou = "oogst" (je ... oogst).
export function professionFields(subject, verb, verbYou, { xpDefault = 10 } = {}) {
  return {
    professionRef: { type: "ref", refKind: "profession", required: false, audience: "server", label: "Beroep",
      ui: ui("🧰", "ref", "werkbank"), default: null,
      help: help("Bij welk beroep " + subject + " hoort. Leeg = iedereen kan het " + verb + ", zonder niveau.", "Sleep een 🧰 Beroep uit de Bibliotheek, bijv. Smeden. Niveau en beroeps-XP staan in het blok " + PROFESSION_GROUP + ".", "Iedereen kan het meteen → sleep hier een beroep op en zet een niveau.") },
    professionLevel: { type: "integer", required: false, min: 1, max: 100, audience: "server", label: "Vanaf niveau",
      ui: ui("🎚️", "slider", "werkbank", { step: 1, range: [1, 50], group: PROFESSION_GROUP }), default: 1,
      help: help("Vanaf welk niveau in het beroep je " + subject + " kunt " + verb + ". Daaronder zegt de game waarom niet.", "1 voor het begin; hogere niveaus voor betere spullen.", "Niemand komt zo ver → lager, of geef meer beroeps-XP.") },
    professionXp: { type: "integer", required: false, min: 0, max: 100000, audience: "server", label: "Beroeps-XP",
      ui: ui("⭐", "slider", "werkbank", { step: 1, range: [0, 200], group: PROFESSION_GROUP }), default: xpDefault,
      help: help("Hoeveel beroeps-XP je krijgt elke keer dat je " + subject + " " + verbYou + ". Gewone XP (je level) geeft het niet.", "10 bij XP per niveau 100: tien keer en je stijgt een niveau.", "Spelers stijgen te snel → minder. Te traag → meer.") }
  };
}

// Recept: hoe leer je het.
export const recipeLearnFields = () => ({
  learn: { type: "select", required: false, options: LEARN_MODES.slice(), optionIcons: { start: "✅", buy: "🪙", quest: "📜", level: "🎚️" },
    optionLabels: { start: "Meteen bekend", buy: "Kopen bij de werkplek", quest: "Van een quest", level: "Vanzelf op het niveau" },
    audience: "server", label: "Hoe leer je het", ui: ui("📖", "select", "werkbank", { group: PROFESSION_GROUP }), default: "start",
    help: help("Hoe een speler dit recept leert. Een recept dat je nog niet kent, zie je niet bij Maken (behalve Kopen: daar staat de knop Leren).",
      "Meteen voor de eerste recepten (te hoog niveau = grijs met de reden). Kopen of een quest voor bijzondere recepten. Vanzelf: het verschijnt zodra je het niveau hebt.",
      "Niemand kent het → kijk of een quest het als beloning geeft (⚖️ Balans zegt het).") },
  learnPrice: { type: "integer", required: false, min: 0, max: 100000000, audience: "server", label: "Prijs om te leren",
    ui: ui("🪙", "slider", "werkbank", { step: 5, range: [0, 1000], group: PROFESSION_GROUP, when: { key: "learn", is: ["buy"] } }), default: 50,
    help: help("Wat leren kost bij de werkplek (in de eerste valuta). Dat geld verdwijnt uit het spel.", "50-200 voor een goed recept.", "Niemand koopt het → goedkoper. Iedereen heeft het meteen → duurder.") }
});

// Een werkplek (NPC of model) hoort bij één beroep.
export const workstationProfessionField = (wat, group) => ({
  type: "ref", refKind: "profession", required: false, audience: "client", label: "Werkplek voor",
  ui: ui("🧰", "ref", "werkbank", { group, when: { key: "crafting", is: [true], fallback: false } }), default: null,
  help: help("Voor welk beroep je bij " + wat + " dingen maakt. Alleen recepten van dat beroep kun je hier maken.",
    "Sleep een 🧰 Beroep uit de Bibliotheek, bijv. Smeden bij de smid. Leeg = alleen recepten zonder beroep.",
    "Een recept staat er niet bij → geef het recept hetzelfde beroep, of sleep hier het goede beroep op.")
});

// Niveau uit beroeps-XP: elk niveau kost evenveel, hooguit het hoogste niveau.
export function professionProgress(def, xp) {
  const maxLevel = Math.max(1, Math.round(Number(def?.maxLevel) || 10));
  const per = Math.max(1, Math.round(Number(def?.xpPerLevel) || 100));
  const total = Math.max(0, Math.round(Number(xp) || 0));
  const level = Math.min(maxLevel, 1 + Math.floor(total / per));
  const atMax = level >= maxLevel;
  return { level, maxLevel, xp: total, into: atMax ? per : total - (level - 1) * per, need: per, atMax };
}
