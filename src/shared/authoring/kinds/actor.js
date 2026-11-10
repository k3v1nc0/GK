// Fase 05 (F5-E1-T02): actordefinitie (archetype) los van de plaatsing (spawn) en van de runtime-instance.
// Stats, gedrag en animatienamen staan als getypeerde velden in het archetype: één formulier voor Kevin.
// Een losse stat_block/faction/animation_set-kind komt pas als hergebruik dat vraagt (zie F5/VOORTGANG.md).
// Werkbank Fase 1: per veld icoon, bediening, plek, standaard en Ⓘ-hulp (zie ./ui.js).
import { MAX_WORLD_MM } from "../../../../apps/web/public/shared/spatial.js";
import { HELP_ID, HELP_MODEL, HELP_NAME, HELP_RESPAWN, HELP_SCALE, help, ui } from "./ui.js";

const M = { unit: "m", scale: 1000 };
const POS_HELP = help(
  "Waar de vijand begint en naar terugloopt.",
  "Sleep het icoon in de 3D-view; het getal volgt vanzelf.",
  "Vijand staat in een muur of valt uit de wereld → sleep hem naar een open plek."
);
const mmField = (label, icon) => ({ type: "integer", required: true, min: -MAX_WORLD_MM, max: MAX_WORLD_MM, audience: "server", label,
  ui: ui(icon, "slider", "viewport", Object.assign({ step: 100 }, M)), default: 0, help: POS_HELP });
const clipHelp = (wat) => help(
  "Welke animatie uit het model speelt bij " + wat + ".",
  "Kies uit de lijst; die komt uit het model dat je erop sleepte.",
  "Vijand staat stijf → kies een andere animatie of controleer of het model animaties heeft."
);
const clipField = (label, icon, wat) => ({ type: "text", required: false, maxLength: 120, audience: "client", label,
  ui: ui(icon, "select", "werkbank", { optionsFrom: "clips:modelAssetId", more: true }), default: null, help: clipHelp(wat) });
const soundHelp = (wat) => help(
  "Het geluid dat speelt " + wat + ".",
  "Sleep een kort geluid (onder 1 s) uit de Bibliotheek op dit vak.",
  "Te hard of te zacht → pas het geluidsbestand aan of kies een ander."
);

export const ACTOR_BEHAVIORS = Object.freeze(["aggressive", "defensive"]);

const HEAL_GROUP = "💚 Genezen";
const ELITE_GROUP = "💪 Af en toe een sterkere";

export const ACTOR_KINDS = {
  actor_archetype: {
    label: "Vijand",
    plural: "Vijanden",
    icon: "👹",
    place: "werkbank",
    singleton: false,
    domain: "actors",
    idField: "actorId",
    fields: {
      actorId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Vijand-ID",
        ui: ui("🔖", "id", "werkbank", { more: true }), default: null, help: HELP_ID("deze vijand") },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam",
        ui: ui("🏷️", "text", "werkbank"), default: "", help: HELP_NAME("deze vijand") },
      modelAssetId: { type: "asset", assetType: "model", required: false, maxLength: 160, audience: "client", label: "Model",
        ui: ui("🧊", "asset", "werkbank"), default: null, help: HELP_MODEL },
      modelScaleBp: { type: "integer", required: false, min: 100, max: 100000, audience: "client", label: "Modelschaal",
        ui: ui("📏", "slider", "werkbank", { step: 100, unit: "%", scale: 100, range: [1000, 40000], more: true }), default: 10000, help: HELP_SCALE },
      idleClip: clipField("Animatie stilstaan", "🧍", "stilstaan"),
      walkClip: clipField("Animatie lopen", "🚶", "lopen"),
      attackClip: clipField("Animatie aanvallen", "🤺", "aanvallen"),
      deathClip: clipField("Animatie neervallen", "💀", "neervallen"),
      healthMax: { type: "integer", required: true, min: 1, max: 1000000, audience: "client", label: "Levenspunten",
        ui: ui("❤️", "slider", "werkbank", { step: 1, range: [1, 1000] }), default: 50,
        help: help("Hoeveel schade de vijand kan hebben voor hij neervalt.", "30-80 voor een vijand aan het begin, 500+ voor een baas.", "Te snel dood → hoger. Gevecht duurt te lang → lager.") },
      attackPower: { type: "integer", required: true, min: 0, max: 1000000, audience: "server", label: "Aanvalskracht",
        ui: ui("💪", "slider", "werkbank", { step: 1, range: [0, 200] }), default: 5,
        help: help("Hoe hard de vijand slaat (telt op bij de schade van zijn aanval).", "3-10 aan het begin van de game.", "Spelers gaan te snel dood → lager.") },
      // Healing (2-11): regeneratie en een genees-spreuk (vijand-healer), samen in een uitklapblok onder Aanvalskracht.
      regenEnabled: { type: "boolean", required: false, audience: "server", label: "Regeneratie",
        ui: ui("💚", "toggle", "werkbank", { group: HEAL_GROUP }), default: false,
        help: help("Krijgt de vijand vanzelf levens terug, ook tijdens het gevecht?", "Uit voor gewone vijanden; aan voor taaie vijanden zoals trollen.", "Vijand is niet kapot te krijgen → zet dit uit of de snelheid lager.") },
      regenBp: { type: "integer", required: false, min: 0, max: 10000, audience: "server", label: "Regeneratie-snelheid",
        ui: ui("⏩", "slider", "werkbank", { step: 10, range: [0, 1000], unit: "%/s", scale: 100, group: HEAL_GROUP, when: { key: "regenEnabled", is: [true] } }), default: 100,
        help: help("Hoeveel procent van zijn levens de vijand per seconde terugkrijgt (alleen als Regeneratie aan staat). 0 % = niets.", "0,5-2 %/s.", "Vijand geneest sneller dan jij schade doet → lager.") },
      healAbilityRef: { type: "ref", refKind: "ability", required: false, audience: "server", label: "Genees-spreuk",
        ui: ui("✨", "ref", "werkbank", { group: HEAL_GROUP }), default: null,
        help: help("Een spreuk waarmee deze vijand zichzelf of de zwakste vijand in de buurt geneest (een vijand-healer).", "Sleep een aanval met soort Genezen hierop. Leeg = geen healer.", "Healer geneest te vaak → maak de wachttijd van de spreuk langer.") },
      armor: { type: "integer", required: true, min: 0, max: 1000000, audience: "server", label: "Pantser",
        ui: ui("🛡️", "slider", "werkbank", { step: 1, range: [0, 200], more: true }), default: 0,
        help: help("Hoeveel schade de vijand tegenhoudt.", "0-5 voor gewone vijanden.", "Je doet bijna geen schade → lager.") },
      abilityRef: { type: "ref", refKind: "ability", required: true, audience: "server", label: "Aanval",
        ui: ui("⚔️", "ref", "werkbank"), default: null,
        help: help("Welke aanval (vaardigheid) de vijand gebruikt.", "Sleep een vaardigheid uit de Bibliotheek op dit vak.", "Vijand doet niets → controleer of hier een aanval op staat.") },
      // Fase 5: een baas heeft altijd een schild (een sterkere vijand van een plek krijgt het vanzelf).
      shieldAlways: { type: "boolean", required: false, audience: "client", label: "Altijd een schild (baas)",
        ui: ui("🛡️", "toggle", "werkbank", { more: true }), default: false,
        help: help("Heeft deze vijand altijd een schild? Zolang het schild staat doet de auto-aanval (vak 1) maar weinig schade; vak 2 of 3 breekt het. Hoe sterk en hoe lang staat in Instellingen > Genezen en effecten.", "Aan voor een baas. Gewone vijanden: uit (een sterkere vijand van een plek krijgt vanzelf een schild).", "Baas valt om met alleen vak 1 → zet dit aan.") },
      behavior: { type: "select", required: true, options: ACTOR_BEHAVIORS.slice(), optionIcons: { aggressive: "😠", defensive: "🙂" }, optionLabels: { aggressive: "Valt aan", defensive: "Alleen terug" }, audience: "server", label: "Gedrag",
        ui: ui("🧠", "select", "werkbank"), default: "aggressive",
        help: help("Valt de vijand je zelf aan, of alleen als jij eerst slaat?", "Valt aan voor gevaarlijke plekken, Alleen terug voor dieren bij het startpunt.", "Beginners worden steeds aangevallen → Alleen terug.") },
      aggroRangeMm: { type: "integer", required: true, min: 0, max: 50000, audience: "server", label: "Ziet je op",
        ui: ui("👁️", "slider", "werkbank", Object.assign({ step: 100, more: true }, M)), default: 8000,
        help: help("Vanaf welke afstand de vijand je opmerkt.", "5 tot 10 meter.", "Vijanden rennen van ver op je af → lager.") },
      leashRangeMm: { type: "integer", required: true, min: 1000, max: 200000, audience: "server", label: "Max. van huis",
        ui: ui("🏠", "slider", "werkbank", Object.assign({ step: 500, range: [1000, 60000], more: true }, M)), default: 20000,
        help: help("Hoe ver de vijand je volgt voor hij terugloopt naar zijn plek.", "Minstens zo groot als 'Ziet je op'; 15-30 m.", "Vijanden volgen je door de hele wereld → lager.") },
      moveSpeedMmPerS: { type: "integer", required: true, min: 0, max: 20000, audience: "server", label: "Loopsnelheid",
        ui: ui("🏃", "slider", "werkbank", { step: 100, unit: "m/s", scale: 1000, more: true }), default: 3000,
        help: help("Hoe snel de vijand loopt.", "2-4 m/s; iets langzamer dan de speler zodat je kunt vluchten.", "Je kunt nooit ontsnappen → lager.") },
      radiusMm: { type: "integer", required: true, min: 200, max: 5000, audience: "client", label: "Botsstraal",
        ui: ui("⭕", "slider", "werkbank", Object.assign({ step: 100, more: true }, M)), default: 600,
        help: help("Hoe breed de vijand is om tegenaan te lopen en aan te klikken.", "Ongeveer de breedte van het model: 0,4-1 m.", "Moeilijk aan te klikken → groter.") },
      lootTableRef: { type: "ref", refKind: "loot_table", required: false, audience: "server", label: "Loot",
        ui: ui("🎁", "ref", "werkbank"), default: null,
        help: help("Wat er valt als de vijand neergaat.", "Sleep een loottabel uit de Bibliotheek op dit vak.", "Er valt niets → controleer de kansen in de loottabel.") },
      xpReward: { type: "integer", required: false, min: 0, max: 1000000, audience: "server", label: "XP",
        ui: ui("⭐", "slider", "werkbank", { step: 1, range: [0, 500], more: true }), default: 10,
        help: help("Hoeveel ervaring je krijgt als je de vijand verslaat.", "10-30 voor gewone vijanden aan het begin.", "Spelers worden te snel sterk → lager.") },
      respawnMs: { type: "integer", required: true, min: 1000, max: 86400000, audience: "server", label: "Terug na",
        ui: ui("⏳", "slider", "werkbank", { step: 1000, unit: "s", scale: 1000, range: [1000, 900000], more: true }), default: 30000, help: HELP_RESPAWN },
      hitSoundAssetId: { type: "asset", assetType: "audio", required: false, maxLength: 160, audience: "client", label: "Geluid bij raak",
        ui: ui("🔊", "asset", "werkbank", { more: true }), default: null, help: soundHelp("als de vijand geraakt wordt") },
      deathSoundAssetId: { type: "asset", assetType: "audio", required: false, maxLength: 160, audience: "client", label: "Geluid bij neervallen",
        ui: ui("🔇", "asset", "werkbank", { more: true }), default: null, help: soundHelp("als de vijand neervalt") }
    }
  },
  actor_spawn: {
    label: "Vijand (plek)",
    icon: "📍",
    place: "werkbank",
    singleton: false,
    domain: "actors",
    idField: "spawnId",
    fields: {
      spawnId: { type: "id", required: true, maxLength: 120, audience: "server", label: "Plek-ID",
        ui: ui("🔖", "id", "werkbank", { more: true }), default: null, help: HELP_ID("deze plek") },
      archetypeRef: { type: "ref", refKind: "actor_archetype", required: true, audience: "server", label: "Vijand",
        ui: ui("👹", "ref", "werkbank"), default: null,
        help: help("Welke vijand hier staat.", "Sleep een vijand uit de Bibliotheek op dit vak.", "Verkeerde vijand → sleep een andere erop.") },
      regionRef: { type: "ref", refKind: "region", required: false, audience: "server", label: "Gebied",
        ui: ui("🗺️", "ref", "viewport", { more: true }), default: null,
        help: help("In welk gebied deze plek ligt (leeg = gewoon in de wereld).", "Wordt vanzelf gekozen als je de plek in een gebied zet; leeg mag ook.", "Melding 'buiten gebied' → sleep de plek binnen het gebied of maak dit vak leeg.") },
      xMm: mmField("X", "↔️"),
      zMm: mmField("Z", "↕️"),
      // Kevin 10-11: welke kant de vijand op kijkt als hij thuis staat (R in de 3D-view).
      rotationY: { type: "number", required: false, min: 0, max: 359, audience: "server", label: "Draaien",
        ui: ui("🔄", "slider", "viewport", { step: 1, unit: "°", more: true }), default: 0,
        help: help("Welke kant de vijand op kijkt als hij op zijn plek staat.", "Klik hem in de 3D-view en druk R, of schuif hier.", "Staat met zijn rug naar het pad → draai hem.") },
      // Fase 5: af en toe verschijnt hier een sterkere (meer levens, harder, met schild en meer XP).
      eliteChancePct: { type: "integer", required: false, min: 0, max: 100, audience: "server", label: "Kans op een sterkere",
        ui: ui("🎲", "slider", "werkbank", { step: 1, unit: "%", group: ELITE_GROUP }), default: 10,
        help: help("Hoe vaak hier een sterkere vijand verschijnt in plaats van de gewone (bij elke keer dat hij terugkomt). Een sterkere heeft een schild (icoon boven de naam) dat je met vak 2 of 3 breekt.", "10 % = ongeveer 1 op de 10. 0 % = nooit.", "Spelers lopen steeds tegen sterkere aan → lager. Nooit een uitdaging → hoger.") },
      eliteStrengthPct: { type: "integer", required: false, min: 100, max: 1000, audience: "server", label: "Hoeveel sterker",
        ui: ui("💪", "slider", "werkbank", { step: 10, unit: "%", range: [100, 500], group: ELITE_GROUP }), default: 200,
        help: help("Hoeveel levens, schade en XP een sterkere heeft vergeleken met de gewone vijand.", "200 % = dubbel zoveel levens, schade en XP.", "Sterkere is niet te doen → lager.") },
      patrolPointsMm: { type: "pointList", required: false, minItems: 2, maxItems: 16, min: -MAX_WORLD_MM, max: MAX_WORLD_MM, audience: "server", label: "Looproute",
        ui: ui("🧭", "points", "viewport"), default: null,
        help: help("De punten waar de vijand langs loopt als hij niet vecht.", "2-5 punten dicht bij de plek; teken ze in de 3D-view.", "Vijand loopt door muren → zet de punten op een open pad.") }
    }
  }
};
