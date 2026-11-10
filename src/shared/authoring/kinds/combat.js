// Fase 05 (F5-E2-T01): een aanval (ability) als getypeerde data. Alleen hele getallen:
// schade in punten, schaal in basispunten (10000 = 100%), afstand in mm en wachttijd in ms. Geen formules of scripts.
// Werkbank Fase 1: per veld icoon, bediening, plek, standaard en Ⓘ-hulp (zie ./ui.js).
import { HELP_ID, HELP_NAME, help, ui } from "./ui.js";
import { effectFields } from "./effect-fields.js";

// Healing (2-11): een aanval kan ook genezen, mana kosten en een effect op het doel geven (gif, genezing over tijd).
export const ABILITY_KINDS = Object.freeze(["damage", "heal"]);
const HEAL_GROUP = "💚 Genezen en mana";
const EFFECT_GROUP = "✨ Effect op het doel";
const HEAL_ONLY = Object.freeze({ key: "abilityKind", is: ["heal"] });
const RING_GROUP = "💥 Ring om je heen";
const RING_ONLY = Object.freeze({ key: "hitsAll", is: [true] });

const PCT = { unit: "%", scale: 100 };

// Fase 5 (vaardigheden): wanneer een speler deze vaardigheid krijgt, hoe hij eruitziet in de game en welk icoon op de knop staat.
const PLAYER_GROUP = "📖 Voor spelers";
export const ABILITY_ANIM_STYLES = Object.freeze(["slash", "cast", "shot"]);
// Iconen die de game al kent (gk-icon-paths.js); leeg = het icoon van de soort (⚔️ of 💚).
export const ABILITY_ICONS = Object.freeze(["crossed-swords", "broadsword", "round-shield", "shield-reflect", "anvil-impact", "crosshair", "fire-ray", "magic-swirl", "sparkles", "magic-portal", "water-drop", "healing", "heart-plus"]);
const ABILITY_ICON_EMOJI = Object.freeze({ "crossed-swords": "⚔️", broadsword: "🗡️", "round-shield": "🛡️", "shield-reflect": "🔰", "anvil-impact": "💥", crosshair: "🎯",
  "fire-ray": "🔥", "magic-swirl": "🌪️",
  sparkles: "✨", "magic-portal": "🌀", "water-drop": "💧", healing: "💚", "heart-plus": "❤️" });
const ABILITY_ICON_LABELS = Object.freeze({ "crossed-swords": "Zwaarden", broadsword: "Zwaard", "round-shield": "Schild", "shield-reflect": "Schildslag", "anvil-impact": "Klap", crosshair: "Doelwit",
  "fire-ray": "Vuurstraal", "magic-swirl": "Magie",
  sparkles: "Sterren", "magic-portal": "Wervel", "water-drop": "Druppel", healing: "Genezen", "heart-plus": "Hart" });

export const COMBAT_KINDS = {
  ability: {
    label: "Vaardigheid",
    plural: "Vaardigheden",
    icon: "⚔️",
    place: "werkbank",
    singleton: false,
    domain: "actors",
    idField: "abilityId",
    fields: {
      abilityId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Vaardigheid-ID",
        ui: ui("🔖", "id", "werkbank", { more: true }), default: null, help: HELP_ID("deze vaardigheid") },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam",
        ui: ui("🏷️", "text", "werkbank"), default: "", help: HELP_NAME("deze vaardigheid") },
      abilityKind: { type: "select", required: false, options: ABILITY_KINDS.slice(), optionIcons: { damage: "⚔️", heal: "💚" },
        optionLabels: { damage: "Schade", heal: "Genezen" }, audience: "client", label: "Soort",
        ui: ui("🎭", "select", "werkbank"), default: "damage",
        help: help("Doet deze vaardigheid schade, of geneest hij? Schade raakt een vijand; Genezen kiest vanzelf de meest gewonde speler binnen het bereik (of jou).", "Schade voor aanvallen. Genezen voor de genees-spreuk van een klasse of een vijand-healer.", "Spreuk doet schade in plaats van genezen → kies Genezen.") },
      baseDamage: { type: "integer", required: true, min: 0, max: 1000000, audience: "server", label: "Basisschade",
        ui: ui("💥", "slider", "werkbank", { step: 1, range: [0, 200] }), default: 10,
        help: help("Hoeveel schade de aanval altijd doet, voordat kracht en pantser meetellen.", "5-20 voor het begin van de game, hoger voor latere vijanden.", "Vijanden gaan te snel dood → lager. Gevechten duren te lang → hoger.") },
      powerScalingBp: { type: "integer", required: true, min: 0, max: 100000, audience: "server", label: "Kracht telt mee",
        ui: ui("💪", "slider", "werkbank", Object.assign({ step: 500, range: [0, 30000] }, PCT)), default: 10000,
        help: help("Hoeveel de aanvalskracht van de aanvaller erbij telt.", "100 % = alle kracht telt mee. 50-150 % is gebruikelijk.", "Betere wapens maken geen verschil → hoger zetten.") },
      armorFactorBp: { type: "integer", required: true, min: 0, max: 100000, audience: "server", label: "Pantser telt mee",
        ui: ui("🛡️", "slider", "werkbank", Object.assign({ step: 500, range: [0, 30000] }, PCT)), default: 10000,
        help: help("Hoeveel het pantser van het doel de schade tegenhoudt.", "100 % = pantser werkt volledig. 0 % = pantser negeren.", "Gepantserde vijanden zijn onverslaanbaar → lager zetten.") },
      rangeMm: { type: "integer", required: true, min: 500, max: 50000, audience: "client", label: "Bereik",
        ui: ui("🎯", "slider", "werkbank", { step: 100, unit: "m", scale: 1000, range: [500, 20000] }), default: 2000,
        help: help("Hoe ver weg het doel mag staan om te raken.", "1,5-2,5 m voor zwaarden, 10-20 m voor bogen en spreuken.", "Je moet tegen het doel aan lopen → hoger. Raken van te ver → lager.") },
      cooldownMs: { type: "integer", required: true, min: 100, max: 600000, audience: "client", label: "Wachttijd",
        ui: ui("⏱️", "slider", "werkbank", { step: 100, unit: "s", scale: 1000, range: [100, 30000] }), default: 1500,
        help: help("Hoe lang je moet wachten voor je deze aanval weer kunt doen.", "1-2 s voor een gewone aanval, 10-60 s voor een sterke.", "Te veel klikken → langer. Gevecht voelt traag → korter.") },
      baseHeal: { type: "integer", required: false, min: 0, max: 1000000, audience: "server", label: "Geneest",
        ui: ui("💚", "slider", "werkbank", { step: 1, range: [0, 200], group: HEAL_GROUP, when: HEAL_ONLY }), default: 20,
        help: help("Hoeveel levens deze spreuk geneest (alleen bij soort Genezen). De heal-kracht van de klasse telt erbij.", "15-30 aan het begin van de game.", "Healer geneest te weinig → hoger.") },
      healScalingBp: { type: "integer", required: false, min: 0, max: 100000, audience: "server", label: "Heal-kracht telt mee",
        ui: ui("📈", "slider", "werkbank", Object.assign({ step: 500, range: [0, 30000], group: HEAL_GROUP, when: HEAL_ONLY }, PCT)), default: 10000,
        help: help("Hoeveel de heal-kracht van de genezer erbij telt.", "100 % = alle heal-kracht telt mee.", "Heal-kracht maakt geen verschil → hoger.") },
      manaCost: { type: "integer", required: false, min: 0, max: 1000000, audience: "client", label: "Kost mana",
        ui: ui("🔵", "slider", "werkbank", { step: 1, range: [0, 200], group: HEAL_GROUP }), default: 0,
        help: help("Hoeveel mana een speler kwijt is als hij deze aanval of spreuk doet. 0 = gratis.", "10-25 voor een genees-spreuk.", "Mana is meteen op → lager. Spelers genezen eindeloos → hoger.") },
      // Kevin 10-11: raakt iedereen in de ring om je heen (je bereik); de gekozen vijand krijgt de volle schade.
      hitsAll: { type: "boolean", required: false, audience: "client", label: "Raakt iedereen binnen bereik",
        ui: ui("💥", "toggle", "werkbank", { group: RING_GROUP }), default: false,
        help: help("Raakt deze aanval alle vijanden in de ring om je heen (zo ver als het Bereik), in plaats van alleen het doel? De vijand die je koos krijgt de volle schade, de rest minder.", "Aan voor een zwaai of een vuurring; ook fijn op vak 1 als je vaak tegen groepjes vecht.", "Je moet in een groepje steeds de goede vijand zoeken → zet dit aan.") },
      othersPct: { type: "integer", required: false, min: 0, max: 100, audience: "server", label: "Schade aan de anderen",
        ui: ui("➗", "slider", "werkbank", Object.assign({ step: 5, range: [0, 100], group: RING_GROUP, when: RING_ONLY }, { unit: "%" })), default: 50,
        help: help("Hoeveel van de schade de andere vijanden in de ring krijgen (de gekozen vijand krijgt altijd 100 %).", "30-60 %.", "Groepjes gaan te snel neer → lager. Te traag → hoger.") },
      // Fase 5: vrij vanaf level of via een quest, hoe het eruitziet en het icoon op de knop (vak 2 en 3).
      unlockLevel: { type: "integer", required: false, min: 1, max: 1000, audience: "client", label: "Vrij vanaf level",
        ui: ui("🔓", "slider", "werkbank", { step: 1, range: [1, 50], group: PLAYER_GROUP }), default: 1,
        help: help("Vanaf welk level een speler deze vaardigheid kan gebruiken (als hij bij zijn klasse staat).", "Level 1 voor de eerste vaardigheid van een klasse, daarna bijv. 3, 5 en 8.", "Speler ziet een slot met 'vanaf level …' → zet het level lager of geef XP met de maker-knop.") },
      unlockQuest: { type: "boolean", required: false, audience: "client", label: "Alleen via een quest",
        ui: ui("📜", "toggle", "werkbank", { group: PLAYER_GROUP }), default: false,
        help: help("Krijgt een speler deze vaardigheid pas als een quest hem als beloning geeft? (en vanaf het level hierboven)", "Aan voor een bijzondere vaardigheid uit een lorequest. Zet hem in de quest bij 🎁 Beloning.", "Niemand krijgt hem → kijk of een quest hem bij 🎁 Beloning heeft.") },
      animStyle: { type: "select", required: false, options: ABILITY_ANIM_STYLES.slice(), optionIcons: { slash: "🤺", cast: "✨", shot: "🏹" },
        optionLabels: { slash: "Uithaal", cast: "Spreuk", shot: "Schot" }, audience: "client", label: "Animatie",
        ui: ui("🎬", "select", "werkbank", { group: PLAYER_GROUP }), default: "slash",
        help: help("Wat iedereen in de buurt ziet als deze vaardigheid gebruikt wordt: een uithaal, een spreuk-gloed of een schot naar het doel, met een flits bij het doel.", "Uithaal voor zwaarden, Spreuk voor magie en genezen, Schot voor bogen.", "Past niet bij de vaardigheid → kies een andere.") },
      icon: { type: "select", required: false, options: ABILITY_ICONS.slice(), optionIcons: ABILITY_ICON_EMOJI, optionLabels: ABILITY_ICON_LABELS, audience: "client", label: "Icoon",
        ui: ui("🖼️", "select", "werkbank", { group: PLAYER_GROUP }), default: null,
        help: help("Het plaatje op de knop in de game (vak 1, 2 of 3) en in het vaardighedenboek.", "Kies iets dat bij de vaardigheid past. Leeg = zwaarden bij Schade, hartje bij Genezen.", "Twee knoppen lijken op elkaar → kies een ander icoon.") },
      ...effectFields(EFFECT_GROUP, { unit: "s", what: "de vaardigheid" })
    }
  }
};
