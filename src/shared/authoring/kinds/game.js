// Terugbouw zonder nodes (28-10): de spel-onderdelen die vroeger alleen als node bestonden, nu als kaart.
// Valuta, NPC (praten, winkel, crafting), Quest en Recept staan in de Werkbank;
// placed_model blijft het interne document per wereldinstantie, maar staat niet als Bibliotheek-soort in beeld.
// Speler en Game-scherm (HUD) staan onder Instellingen. De wereldbouwer maakt hieruit de spelwereld.
import { HELP_ID, HELP_MODEL, HELP_NAME, HELP_SCALE, help, ui } from "./ui.js";

const idField = (label, wat) => ({ type: "id", required: true, maxLength: 120, audience: "client", label,
  ui: ui("🔖", "id", "werkbank", { more: true }), default: null, help: HELP_ID(wat) });
const nameField = (wat) => ({ type: "text", required: true, maxLength: 80, audience: "client", label: "Naam",
  ui: ui("🏷️", "text", "werkbank"), default: "", help: HELP_NAME(wat) });
const int = (label, icon, def, min, max, place, extra, helpText) => ({ type: "integer", required: false, min, max, audience: "client", label,
  ui: ui(icon, "slider", place, Object.assign({ step: 1 }, extra)), default: def, help: helpText });
const toggle = (label, icon, def, place, helpText, extra = {}) => ({ type: "boolean", required: false, audience: "client", label,
  ui: ui(icon, "toggle", place, extra), default: def, help: helpText });
const refField = (label, icon, refKind, required, helpText, extra = {}) => ({ type: "ref", refKind, required, audience: "client", label,
  ui: ui(icon, "ref", "werkbank", extra), default: null, help: helpText });
// Een lijst regels { ref, aantal/prijs }: slepen of kiezen per regel (zie werkbank-docs.js refListControl).
const refList = (label, icon, refKinds, columns, place, helpText, extra = {}) => Object.assign({ type: "refList", refKinds, columns,
  required: false, minItems: 0, maxItems: 24, audience: "client", label, ui: ui(icon, "refList", place), default: [], help: helpText }, extra);
const AMOUNT = Object.freeze({ key: "amount", label: "Aantal", icon: "🔢", min: 1, max: 1000000, default: 1 });

const POS_HELP = help(
  "Waar dit in de wereld staat.",
  "Klik het in de 3D-view en druk G om te verplaatsen; het getal volgt vanzelf.",
  "Staat in een muur of zweeft → klik het in de 3D-view en verplaats het met G."
);
const pos = (label, icon, more = false) => ({ type: "number", required: true, min: -100000, max: 100000, audience: "client", label,
  ui: ui(icon, "slider", "viewport", { step: 0.1, unit: "m", more }), default: 0, help: POS_HELP });
const height = { type: "number", required: false, min: -1000, max: 10000, audience: "client", label: "Hoogte",
  ui: ui("↕️", "slider", "viewport", { step: 0.1, unit: "m", more: true }), default: 0, help: POS_HELP };
const turn = (place, more) => ({ type: "number", required: false, min: 0, max: 359, audience: "client", label: "Draaien",
  ui: ui("🔄", "slider", place, { step: 1, unit: "°", more }), default: 0,
  help: help("Welke kant het op kijkt.", "Schuif tot het de goede kant op kijkt, of klik het in de 3D-view en druk R.", "Staat met de rug naar de speler → draai 180°.") });
const clipField = (label, icon) => ({ type: "text", required: false, maxLength: 120, audience: "client", label,
  ui: ui(icon, "select", "werkbank", { optionsFrom: "clips:modelAssetId", more: true }), default: null,
  help: help("Welke animatie uit het model speelt als hij stilstaat.", "Kies uit de lijst; die komt uit het model dat je erop sleepte.", "Staat stijf → kies een andere animatie of controleer of het model animaties heeft.") });

export const QUEST_GOALS = Object.freeze(["deliver", "visit"]);

export const GAME_KINDS = {
  currency: {
    label: "Valuta",
    plural: "Valuta",
    icon: "🪙",
    place: "werkbank",
    singleton: false,
    domain: "economy",
    idField: "currencyId",
    fields: {
      currencyId: idField("Valuta-ID", "deze valuta"),
      displayName: nameField("deze valuta"),
      iconAssetId: { type: "asset", assetType: "image", required: false, maxLength: 160, audience: "client", label: "Icoon",
        ui: ui("🖼️", "asset", "werkbank"), default: null,
        help: help("Het plaatje van deze valuta.", "Een klein rond plaatje, bijv. een gouden munt. Leeg mag ook.", "Wazig plaatje → kies een groter plaatje (64-128 px).") }
    }
  },
  npc: {
    label: "NPC",
    plural: "NPC's",
    icon: "🧑",
    place: "werkbank",
    singleton: false,
    domain: "npcs",
    idField: "npcId",
    fields: {
      npcId: idField("NPC-ID", "deze NPC"),
      displayName: nameField("deze NPC"),
      modelAssetId: { type: "asset", assetType: "model", required: false, maxLength: 160, audience: "client", label: "Model",
        ui: ui("🧊", "asset", "werkbank"), default: null, help: HELP_MODEL },
      greeting: { type: "text", required: false, maxLength: 300, audience: "client", label: "Wat zegt hij",
        ui: ui("💬", "text", "werkbank"), default: null,
        help: help("Wat de NPC zegt als je met hem praat.", "Eén of twee korte zinnen, bijv. \"Hallo reiziger! Kan ik je helpen?\"", "Spelers lezen het niet → maak het korter.") },
      shopOffers: refList("Winkel: verkoopt", "🛒", ["item_definition"], [
        { key: "price", label: "Prijs", icon: "🪙", min: 0, max: 1000000000, default: 10 },
        { key: "buyBack", label: "Koopt terug voor", icon: "↩️", min: 0, max: 1000000000, default: 0 }
      ], "werkbank", help("Wat je bij deze NPC kunt kopen (en terugverkopen).", "Sleep items uit de Bibliotheek. Prijs 5-50 aan het begin; terugkoop 0 = koopt niet terug.", "Spelers worden te snel rijk → maak de terugkoopprijs lager.")),
      shopCurrencyRef: refField("Betalen met", "🪙", "currency", false,
        help("Met welke valuta je bij deze NPC betaalt.", "Sleep een valuta (bijv. Goud) uit de Bibliotheek op dit vak.", "Melding 'winkel zonder valuta' → sleep hier een valuta op.")),
      crafting: toggle("Kan dingen maken", "🔨", false, "werkbank",
        help("Kun je bij deze NPC recepten maken (crafting)?", "Aan voor een smid of kok. Alle recepten werken bij elke NPC met dit aan.", "Je ziet geen recepten → zet dit aan en maak een Recept-kaart.")),
      talkRange: { type: "number", required: false, min: 1, max: 10, audience: "client", label: "Praat-afstand",
        ui: ui("🗣️", "slider", "werkbank", { step: 0.5, unit: "m" }), default: 2.5,
        help: help("Hoe dichtbij de speler moet staan om te praten, te handelen of te maken.", "2 tot 3 meter voelt natuurlijk.", "Je moet te ver lopen → maak hem groter. Je praat al van ver → maak hem kleiner.") },
      modelScaleBp: { type: "integer", required: false, min: 100, max: 100000, audience: "client", label: "Modelschaal",
        ui: ui("📏", "slider", "werkbank", { step: 100, unit: "%", scale: 100, range: [1000, 40000], more: true }), default: 10000, help: HELP_SCALE },
      idleClip: clipField("Animatie stilstaan", "🧍"),
      x: pos("X", "↔️"),
      y: height,
      z: pos("Z", "↕️"),
      rotationY: turn("viewport", true)
    }
  },
  quest: {
    label: "Quest",
    plural: "Quests",
    icon: "📜",
    place: "werkbank",
    singleton: false,
    domain: "quests",
    idField: "questId",
    fields: {
      questId: idField("Quest-ID", "deze quest"),
      displayName: nameField("deze quest"),
      giverRef: refField("Wie geeft hem", "🧑", "npc", true,
        help("Bij welke NPC je deze quest aanneemt.", "Sleep een NPC uit de Bibliotheek op dit vak.", "Niemand biedt de quest aan → controleer of de NPC in de wereld staat.")),
      goal: { type: "select", required: false, options: QUEST_GOALS.slice(), optionIcons: { deliver: "📦", visit: "🚶" },
        optionLabels: { deliver: "Breng spullen", visit: "Ga naar iemand" }, audience: "client", label: "Doel",
        ui: ui("🎯", "select", "werkbank"), default: "deliver",
        help: help("Wat de speler moet doen.", "Breng spullen = verzamel items en lever ze in. Ga naar iemand = loop naar een andere NPC.", "Quest wordt nooit klaar → controleer item en aantal, of kies bij 'Ga naar iemand' een NPC onder ⚙️ meer.") },
      itemRef: refField("Welk item", "🎒", "item_definition", false,
        help("Welk item de speler moet brengen (alleen bij Breng spullen).", "Sleep een item uit de Bibliotheek; bijv. een item dat vijanden laten vallen.", "Quest wordt nooit klaar → kies een item dat je echt kunt krijgen.")),
      amount: int("Hoeveel", "🔢", 1, 1, 9999, "werkbank", { range: [1, 50] },
        help("Hoeveel van het item de speler moet brengen.", "1 tot 10 voor een eerste quest.", "Duurt te lang → minder.")),
      rewards: refList("Beloning", "🎁", ["item_definition", "currency"], [AMOUNT], "werkbank",
        help("Wat de speler krijgt als de quest klaar is.", "Sleep items of valuta uit de Bibliotheek, bijv. 10 goud of een zwaard.", "Spelers worden te snel rijk → minder of goedkopere beloningen.")),
      rewardXp: int("XP", "⭐", 50, 0, 1000000, "werkbank", { range: [0, 1000] },
        help("Hoeveel ervaring de speler krijgt bij het inleveren.", "50-200 voor een eerste quest.", "Spelers stijgen te snel → minder XP.")),
      description: { type: "text", required: false, maxLength: 300, audience: "client", label: "Wat de NPC vertelt",
        ui: ui("💬", "text", "werkbank", { more: true }), default: null,
        help: help("De uitleg die de NPC geeft als hij de quest aanbiedt.", "Eén of twee zinnen: wat en waarom, bijv. \"Breng me 3 appels voor de taart.\"", "Spelers snappen het niet → zeg precies wat en hoeveel.") },
      targetNpcRef: refField("Inleveren bij", "🏁", "npc", false,
        help("Bij welke NPC je de quest inlevert. Leeg = bij wie hem gaf.", "Bij 'Ga naar iemand' verplicht: de NPC waar de speler heen moet.", "Quest niet in te leveren → controleer of die NPC in de wereld staat."), { more: true }),
      previousQuestRef: refField("Pas na quest", "⛓️", "quest", false,
        help("Deze quest komt pas als de speler een andere quest af heeft.", "Gebruik dit om een verhaal in stappen te maken.", "Quest komt nooit → controleer of de vorige quest te doen is."), { more: true }),
      repeatable: toggle("Herhaalbaar", "🔁", false, "werkbank",
        help("Mag de speler deze quest vaker doen?", "Uit voor verhaal-quests, aan voor klusjes (bijv. hout brengen).", "Spelers farmen beloningen → zet dit uit."), { more: true })
    }
  },
  recipe: {
    label: "Recept",
    plural: "Recepten",
    icon: "🔨",
    place: "werkbank",
    singleton: false,
    domain: "economy",
    idField: "recipeId",
    fields: {
      recipeId: idField("Recept-ID", "dit recept"),
      displayName: nameField("dit recept"),
      ingredients: refList("Nodig", "🧺", ["item_definition"], [AMOUNT], "werkbank",
        help("Welke items je nodig hebt (die gaan op).", "Sleep items uit de Bibliotheek; 1 tot 3 soorten is genoeg.", "Niemand kan het maken → minder of makkelijkere items."),
        { required: true, minItems: 1, maxItems: 8 }),
      outputItemRef: refField("Maakt", "🎁", "item_definition", true,
        help("Welk item je krijgt.", "Sleep een item uit de Bibliotheek op dit vak.", "Verkeerd item → sleep een ander item erop.")),
      outputAmount: int("Aantal", "🔢", 1, 1, 9999, "werkbank", { range: [1, 20] },
        help("Hoeveel je er krijgt per keer.", "Meestal 1; bij pijlen of brood meer.", "Te veel → minder.")),
      craftSeconds: int("Duurt", "⏱️", 0, 0, 3600, "werkbank", { unit: "s", range: [0, 120] },
        help("Hoe lang maken duurt. 0 = meteen.", "0 voor eenvoudige dingen; 10-60 s voor waardevolle.", "Te traag → korter. Na de tijd haal je het op in het crafting-venster."))
    }
  },
  placed_model: {
    label: "Model",
    plural: "Modellen",
    icon: "🧊",
    place: "werkbank",
    singleton: false,
    domain: "world",
    idField: "placedModelId",
    fields: {
      placedModelId: idField("Model-ID", "dit model"),
      displayName: nameField("dit model"),
      modelAssetId: { type: "asset", assetType: "model", required: true, maxLength: 160, audience: "client", label: "Model",
        ui: ui("🧊", "asset", "werkbank"), default: null, help: HELP_MODEL },
      scale: { type: "number", required: false, min: 0.01, max: 100, audience: "client", label: "Grootte",
        ui: ui("📏", "slider", "werkbank", { step: 0.05, unit: "×", range: [0.1, 5] }), default: 1, help: HELP_SCALE },
      rotationY: turn("werkbank", false),
      solid: toggle("Er niet doorheen lopen", "🧱", false, "werkbank",
        help("Botst de speler tegen dit model?", "Aan voor huizen, rotsen en bomen. Uit voor gras en bloemen.", "Spelers blijven haken → zet uit of maak de botsstraal kleiner.")),
      collisionRadius: { type: "number", required: false, min: 0.1, max: 50, audience: "client", label: "Botsstraal",
        ui: ui("⭕", "slider", "werkbank", { step: 0.1, unit: "m", range: [0.1, 10], more: true }), default: 1,
        help: help("Hoe groot het stuk is waar je niet doorheen kunt.", "Ongeveer de halve breedte van het model.", "Je botst al ver ervoor → kleiner.") },
      idleClip: clipField("Animatie", "🎞️"),
      x: pos("X", "↔️"),
      y: height,
      z: pos("Z", "↕️")
    }
  },
  // Klassen (29-10): er is geen losse kaart Speler meer. Elke klasse heeft eigen levens, kracht, pantser, heal-kracht,
  // start-spullen en een lijst modellen. Elk account heeft per klasse een eigen character met eigen voortgang.
  // Zonder klassen speelt iedereen met de standaardwaarden hieronder.
  player_class: {
    label: "Klasse",
    plural: "Klassen",
    icon: "🧙",
    place: "instellingen",
    singleton: false,
    domain: "project",
    idField: "classId",
    fields: {
      classId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Klasse-ID",
        ui: ui("🔖", "id", "instellingen", { more: true }), default: null, help: HELP_ID("deze klasse") },
      displayName: { type: "text", required: true, maxLength: 40, audience: "client", label: "Naam",
        ui: ui("🏷️", "text", "instellingen"), default: "",
        help: help("De naam die spelers zien, bijv. DPS, Healer of Tank.", "Eén kort woord.", "Spelers snappen de keuze niet → zet er onder ⚙️ meer een korte uitleg bij.") },
      description: { type: "text", required: false, maxLength: 160, audience: "client", label: "Uitleg",
        ui: ui("💬", "text", "instellingen", { more: true }), default: null,
        help: help("Eén zin onder de naam in het Characters-venster.", "Bijv. \"Veel levens en pantser; houdt vijanden bezig.\"", "Iedereen kiest hetzelfde → maak de andere klassen aantrekkelijker.") },
      abilityRef: { type: "ref", refKind: "ability", required: false, audience: "client", label: "Aanval",
        ui: ui("⚔️", "ref", "instellingen"), default: null,
        help: help("De aanval die deze klasse gebruikt tegen vijanden.", "Sleep een aanval uit de Bibliotheek (Werkbank) hierop of kies hem uit de lijst; bijv. een snelle steek voor DPS en een schildslag voor Tank.", "Leeg → een simpele standaardklap; kies hier een aanval.") },
      healthMax: int("Levens", "❤️", 100, 1, 1000000, "instellingen", { range: [10, 1000] },
        help("Hoeveel levens deze klasse heeft.", "DPS 80, Healer 60, Tank 100; vijanden doen 5-20 schade per klap.", "Deze klasse gaat te snel dood → hoger.")),
      attackPower: int("Kracht", "💪", 10, 0, 1000000, "instellingen", { range: [0, 200] },
        help("Hoe hard deze klasse slaat (telt op bij de schade van de aanval).", "DPS 10, Healer en Tank 5.", "Vijanden gaan te langzaam dood → hoger.")),
      armor: int("Pantser", "🛡️", 0, 0, 1000000, "instellingen", { range: [0, 200] },
        help("Hoeveel schade deze klasse tegenhoudt zonder uitrusting.", "Tank 10, de rest 0.", "Te sterk → lager.")),
      healPower: int("Heal-kracht", "💚", 5, 0, 1000000, "instellingen", { range: [0, 200] },
        help("Hoe goed deze klasse kan genezen (telt op bij een heal).", "5 voor de meeste klassen, 10 voor de Healer.", "Healer geneest te weinig → hoger.")),
      manaMax: int("Mana", "🔵", 50, 0, 1000000, "instellingen", { range: [0, 1000], more: true },
        help("Hoeveel mana deze klasse heeft (blauwe balk onder de levens).", "Healer 100, DPS 50, Tank 30. 0 = geen manabalk.", "Spreuken raken te snel op → hoger.")),
      startItems: refList("Start-spullen", "🎒", ["item_definition", "currency"], [AMOUNT], "instellingen",
        help("Wat een nieuw character van deze klasse één keer krijgt (onder ⚙️ meer).", "Bijv. een zwaard voor de DPS en een schild voor de Tank. Uitrusting wordt meteen aangedaan.", "Character krijgt niets → kies hier iets. Bestaande characters krijgen het niet nog eens."),
        { ui: ui("🎒", "refList", "instellingen", { more: true }) }),
      models: { type: "assetList", assetType: "model", required: false, minItems: 0, maxItems: 40, maxLength: 160, audience: "client", label: "Uiterlijk",
        ui: ui("🧍", "assetList", "instellingen"), default: [],
        help: help("De modellen waaruit een speler van deze klasse zijn uiterlijk kiest.", "Sleep modellen uit de Bibliotheek hierop, bijv. 10 tovenaars voor DPS, elfen voor Healer, dwergen voor Tank. De eerste is de standaard.", "Speler ziet er standaard uit → sleep hier minstens één model op.") }
    }
  },
  hud_settings: {
    label: "Game-scherm",
    icon: "🖥️",
    place: "instellingen",
    singleton: true,
    domain: "project",
    fields: {
      showHealth: toggle("Levensbalk", "❤️", true, "instellingen", help("Toont de levens linksboven, naast het portret.", "Meestal aan.", "Spelers zien niet dat ze doodgaan → zet aan.")),
      showXp: toggle("XP-balk", "⭐", true, "instellingen", help("Toont het level bij het portret en een dun XP-lijntje onder de levens.", "Aan als je levels gebruikt.", "Scherm te vol → zet uit.")),
      showHotbar: toggle("Actiebalk", "🎛️", true, "instellingen", help("De ronde knoppen onderin: de aanval van je klasse en 🤝 doen.", "Aan als spelers aanvallen hebben.", "Spelers kunnen niet aanvallen met een tik → zet aan.")),
      showBag: toggle("Tas", "🎒", true, "instellingen", help("Het tabblad 🎒 Tas in het paneel, met Uitrusten, Gebruiken en Weggooien.", "Meestal aan.", "Spelers vinden hun spullen niet → zet aan.")),
      showEquipment: toggle("Uitrusting", "🧥", true, "instellingen", help("Het tabblad ⛑️ Uitrusting: wat de speler draagt, met Uitdoen.", "Aan als je wapens of kleding hebt.", "Geen wapens of kleding in je game → zet uit.")),
      showWallet: toggle("Portemonnee", "🪙", true, "instellingen", help("Het tabblad 🪙 Geld: hoeveel van elke valuta de speler heeft.", "Aan als je een winkel hebt.", "Geen geld in je game → zet uit.")),
      showQuests: toggle("Quests", "📜", true, "instellingen", help("Het tabblad 📜 Quests, de quest-regel bij het portret en praten met NPC's.", "Aan als je quests of NPC's hebt.", "Praten werkt niet → zet aan.")),
      showInteractions: toggle("Doen-knop", "🤝", true, "instellingen", help("De knop 🤝 onderin: praten, oppakken of verzamelen bij wat het dichtstbij is.", "Aan; handig op een telefoon of laptop zonder muis.", "Spelers moeten precies op kleine dingen tikken → zet aan."), { more: true }),
      showShop: toggle("Winkel en crafting", "🛒", true, "instellingen", help("Kopen, verkopen en maken bij een NPC: het paneel splitst dan in waren en je tas.", "Aan als een NPC iets verkoopt of maakt.", "Winkel niet te zien → zet aan."), { more: true }),
      fogOfWar: toggle("Mist op de kaart", "🌫️", true, "instellingen", help("Fog of war: op de minimap en de grote kaart is alles donker tot je er geweest bent. Ontdekte plekken blijven bewaard.", "Aan voor een avontuurgevoel.", "Spelers zien meteen de hele kaart → zet aan."), { more: true }),
      fogRevealMeters: int("Zicht in de mist", "👁️", 40, 8, 400, "instellingen", { range: [10, 150], more: true },
        help("Hoe ver om je heen de mist weggaat terwijl je loopt (in meters).", "30-60 m.", "De kaart gaat te langzaam open → hoger.")),
      fogDarkness: int("Donkerte van de mist", "🌑", 100, 0, 100, "instellingen", { range: [0, 100], more: true },
        help("Hoe donker de mist op de kaart is, in procent. 100 = helemaal dicht, je ziet er niets doorheen.", "90 tot 100.", "Je ziet de kaart door de mist heen → hoger.")),
      fogFadeMeters: int("Zachte rand van de mist", "🌗", 8, 0, 64, "instellingen", { range: [0, 32], more: true },
        help("Hoe breed de zachte overgang aan de rand van de mist is, in meters. 0 = een harde rand.", "4 tot 16 m.", "Je ziet te veel door de rand heen → lager. De rand is te hoekig → hoger."))
    }
  }
};
