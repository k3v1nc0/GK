// Terugbouw zonder nodes (28-10): de spel-onderdelen die vroeger alleen als node bestonden, nu als kaart.
// Valuta, NPC (praten, winkel, crafting), Quest en Recept staan in de Werkbank;
// placed_model blijft het interne document per wereldinstantie, maar staat niet als Bibliotheek-soort in beeld.
// Speler en Game-scherm (HUD) staan onder Instellingen. De wereldbouwer maakt hieruit de spelwereld.
import { HELP_ID, HELP_MODEL, HELP_NAME, HELP_SCALE, help, ui } from "./ui.js";
import { QUEST_LIMITS, QUEST_SPAWN_LIMITS } from "../../../../apps/web/public/shared/quest-graph.js";

const idField = (label, wat) => ({ type: "id", required: true, maxLength: 120, audience: "client", label,
  ui: ui("🔖", "id", "werkbank", { more: true }), default: null, help: HELP_ID(wat) });
const nameField = (wat) => ({ type: "text", required: true, maxLength: 80, audience: "client", label: "Naam",
  ui: ui("🏷️", "text", "werkbank"), default: "", help: HELP_NAME(wat) });
const int = (label, icon, def, min, max, place, extra, helpText) => ({ type: "integer", required: false, min, max, audience: "client", label,
  ui: ui(icon, "slider", place, Object.assign({ step: 1 }, extra)), default: def, help: helpText });
const toggle = (label, icon, def, place, helpText, extra = {}) => ({ type: "boolean", required: false, audience: "client", label,
  ui: ui(icon, "toggle", place, extra), default: def, help: helpText });
const colorSetting = (label, icon, def, group, helpText) => ({ type: "color", required: false, audience: "client", label,
  ui: ui(icon, "color", "instellingen", { group, more: true }), default: def, help: helpText });
const textSetting = (label, icon, def, group, helpText) => ({ type: "text", required: false, maxLength: 40, audience: "client", label,
  ui: ui(icon, "text", "instellingen", { group, more: true }), default: def, help: helpText });
const selectSetting = (label, icon, def, options, optionLabels, group, helpText) => ({ type: "select", required: false, options,
  optionLabels, audience: "client", label, ui: ui(icon, "select", "instellingen", { group, more: true }), default: def, help: helpText });
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

const CLASS_HEAL_GROUP = "💚 Terugkrijgen en genezen";
export const STACKING_LABELS = Object.freeze({ refresh: "Opnieuw beginnen", extend: "Tijd erbij", block: "Niet nog eens" });

const MAP_ICON_OPTIONS = Object.freeze(["dot", "diamond", "square", "triangle", "star", "pin", "portal", "cross", "ring", "arrow"]);
const MAP_ICON_LABELS = Object.freeze({ dot: "Rondje", diamond: "Ruit", square: "Vierkant", triangle: "Driehoek", star: "Ster",
  pin: "Pin", portal: "Portalring", cross: "Kruis", ring: "Open ring", arrow: "Pijl" });
const MAP_START_GROUP = "🗺️ Kaart: begin en vorm";
const MAP_SIZE_GROUP = "📐 Kaart: maten en tekst";
const MAP_COLOR_GROUP = "🎨 Kaart: algemene kleuren";
const mapLegendFields = (key, label, color, shape, mini = true, big = true) => {
  const group = "📍 Legenda: " + label;
  const title = label.replace(/:.*$/, "");
  return {
    ["map" + key + "Label"]: textSetting("Naam in legenda", "🏷️", label, group,
      help("De naam van deze soort in de legenda en bij kaartlabels.", label + " is de standaard.", "De kaartnaam is onduidelijk → schrijf hier je eigen naam.")),
    ["map" + key + "Color"]: colorSetting("Kleur", "🎨", color, group,
      help("De kleur van het icoon op de kleine kaart, grote kaart en in de legenda.", color + ".", "Het icoon valt niet op → kies meer contrast.")),
    ["map" + key + "Icon"]: selectSetting("Icoon", "🔶", shape, MAP_ICON_OPTIONS.slice(), MAP_ICON_LABELS, group,
      help("De vorm van het icoon voor " + title.toLowerCase() + ". De legenda gebruikt dezelfde vorm.", MAP_ICON_LABELS[shape] + ".", "Het lijkt te veel op een ander icoon → kies een andere vorm.")),
    ["map" + key + "ShowMini"]: toggle("Op minimap bij start", "🧭", mini, "instellingen",
      help("Toont deze soort standaard op de kleine kaart. Een speler kan dit later zelf wijzigen in de legenda.", mini ? "Aan." : "Uit.", "De minimap is te druk → zet uit."), { group, more: true }),
    ["map" + key + "ShowBig"]: toggle("Op grote kaart bij start", "🗺️", big, "instellingen",
      help("Toont deze soort standaard op de grote kaart. Een speler kan dit later zelf wijzigen in de legenda.", big ? "Aan." : "Uit.", "De grote kaart is te druk → zet uit."), { group, more: true })
  };
};
const MAP_LEGEND_FIELDS = Object.freeze(Object.assign({},
  mapLegendFields("Self", "Jij", "#ffffff", "arrow"),
  mapLegendFields("Npc", "NPC's", "#ffd34d", "diamond"),
  mapLegendFields("Enemy", "Vijanden", "#ff4b4b", "dot"),
  mapLegendFields("Resource", "Grondstoffen", "#63d65f", "dot", false),
  mapLegendFields("Pickup", "Oppakken", "#8fe3ff", "dot", false),
  mapLegendFields("Player", "Spelers", "#4da3ff", "dot"),
  mapLegendFields("Portal", "Portals", "#c77dff", "portal"),
  mapLegendFields("QuestgiverAvailable", "Questgever: quest te halen", "#ffe08a", "star"),
  mapLegendFields("Questgiver", "Questgever: geen nieuwe quest", "#d4a84a", "star"),
  mapLegendFields("Quest", "Quest-doel", "#ffb020", "star"),
  mapLegendFields("Pin", "Jouw pin", "#ff4fd8", "pin")
));

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
      // Quest Builder stap 4: hoe de quest start (NPC, item lezen, gebied, vanzelf) en de voorwaarden (EN/OF).
      start: { type: "questStart", required: false, audience: "client", label: "Start en voorwaarden",
        ui: ui("🚪", "questStart", "questbuilder"), default: null,
        help: help("Hoe de quest begint (bij een NPC, een brief lezen, een gebied in of vanzelf) en wat je nodig hebt (level, item, quest af, klasse).", "Meestal: bij een NPC zonder voorwaarden. Een brief uit een kist met 'Level minstens 10' voor een verborgen quest.", "Niemand kan de quest beginnen → kijk in de Quest Builder (🧪 Testen) wat de quest-check zegt.") },
      // Alleen nodig als de quest bij een NPC start (stap 4); de quest-check zegt het als hij ontbreekt.
      giverRef: refField("Wie geeft hem", "🧑", "npc", false,
        help("Bij welke NPC je deze quest aanneemt.", "Sleep een NPC uit de Bibliotheek op dit vak.", "Niemand biedt de quest aan → controleer of de NPC in de wereld staat."),
        { place: "questbuilder", when: { key: "start.mode", is: ["npc"], fallback: "npc" } }),
      goal: { type: "select", required: false, options: QUEST_GOALS.slice(), optionIcons: { deliver: "📦", visit: "🚶" },
        optionLabels: { deliver: "Breng spullen", visit: "Ga naar iemand" }, audience: "client", label: "Doel",
        ui: ui("🎯", "select", "questbuilder", { hideWhen: "steps" }), default: "deliver",
        help: help("Wat de speler moet doen.", "Breng spullen = verzamel items en lever ze in. Ga naar iemand = loop naar een andere NPC.", "Quest wordt nooit klaar → controleer item en aantal, of kies bij 'Ga naar iemand' een NPC bij 🏁 Inleveren bij.") },
      itemRef: refField("Welk item", "🎒", "item_definition", false,
        help("Welk item de speler moet brengen (alleen bij Breng spullen).", "Sleep een item uit de Bibliotheek; bijv. een item dat vijanden laten vallen.", "Quest wordt nooit klaar → kies een item dat je echt kunt krijgen."), { place: "questbuilder", hideWhen: "steps" }),
      amount: int("Hoeveel", "🔢", 1, 1, 9999, "questbuilder", { range: [1, 50], hideWhen: "steps" },
        help("Hoeveel van het item de speler moet brengen.", "1 tot 10 voor een eerste quest.", "Duurt te lang → minder.")),
      // Quest Builder stap 1: de quest als netwerk van stappen. Leeg = de snelle quest hierboven (1 stap + einde).
      // 5-11: het paneel toont hier één samenvatting (start + stappen) met één knop; de velden met plek questbuilder staan alleen in de Quest Builder.
      steps: { type: "questSteps", required: false, maxItems: QUEST_LIMITS.steps, audience: "client", label: "Stappen",
        ui: ui("🪜", "questSteps", "werkbank"), default: null,
        help: help("De stappen van de quest: doelen per stap en waar de quest daarna heen gaat.", "Begin met de snelle quest (1 doel). Meer nodig? Open de Quest Builder en voeg stappen toe.", "Rode melding in de Quest Builder → klik de stap en los op wat er staat.") },
      // Quest Builder stap 5: wat de quest laat verschijnen (vijanden met een eigen naam, voor wie, wanneer weg). Een regel bij een stap
      // (⚡ Als → Dan) laat het verschijnen. Hoort bij de quest, niet bij een stap.
      spawns: { type: "questSpawns", required: false, maxItems: QUEST_SPAWN_LIMITS.spawns, audience: "client", label: "Verschijnen",
        ui: ui("👾", "questSpawns", "questbuilder"), default: null,
        help: help("Vijanden die deze quest laat verschijnen, bijv. een wolvengroep bij het 5e hout.", "Geef ze een naam (Wolvengroep), kies voor wie (meestal de groep) en zet bij een stap (⚡ Wat gebeurt er onderweg) een regel: Dan 👾 laat vijanden verschijnen.", "Ze verschijnen nooit → kijk in de Quest Builder (🧪 Testen) wat de quest-check zegt.") },
      rewards: refList("Beloning", "🎁", ["item_definition", "currency"], [AMOUNT], "werkbank",
        help("Wat de speler krijgt als de quest klaar is.", "Sleep items of valuta uit de Bibliotheek, bijv. 10 goud of een zwaard.", "Spelers worden te snel rijk → minder of goedkopere beloningen.")),
      rewardXp: int("XP", "⭐", 50, 0, 1000000, "werkbank", { range: [0, 1000] },
        help("Hoeveel ervaring de speler krijgt bij het inleveren.", "50-200 voor een eerste quest.", "Spelers stijgen te snel → minder XP.")),
      // 5-11: het verhaal bij de start, in de Quest Builder (tab 🚪 Start). Bij een NPC vertelt de NPC het; bij een brief,
      // gebied of vanzelf toont de game een venster met dit verhaal, het plaatje en de doelen.
      description: { type: "text", required: false, maxLength: 1000, audience: "client", label: "Verhaal bij de start",
        ui: ui("📖", "text", "questbuilder", { multiline: true }), default: null,
        help: help("Het verhaal dat de speler leest als de quest begint: wat de NPC vertelt, wat er in de brief staat, wat er in de buurt gebeurt of een heads-up na de vorige quest.", "Twee tot vijf zinnen: wat er aan de hand is en wat de speler moet doen, bijv. \"Soldaat Bart heeft je hard nodig. Reis naar het kamp bij de brug.\"", "Spelers snappen het niet → zeg precies wat, waar en hoeveel.") },
      imageAssetId: { type: "asset", assetType: "image", required: false, maxLength: 160, audience: "client", label: "Plaatje",
        ui: ui("🖼️", "asset", "questbuilder"), default: null,
        help: help("Een plaatje in het startvenster van de quest, bijv. de brief, een kaart of de persoon die je nodig heeft.", "Een vierkant plaatje (PNG of JPG). Leeg = een icoon past bij hoe de quest start.", "Plaatje wazig → gebruik een groter plaatje (minstens 256 × 256).") },
      targetNpcRef: refField("Inleveren bij", "🏁", "npc", false,
        help("Bij welke NPC je de quest inlevert. Leeg = bij wie hem gaf.", "Bij 'Ga naar iemand' verplicht: de NPC waar de speler heen moet.", "Quest niet in te leveren → controleer of die NPC in de wereld staat."), { place: "questbuilder", hideWhen: "steps" }),
      previousQuestRef: refField("Pas na quest", "⛓️", "quest", false,
        help("Deze quest komt pas als de speler een andere quest af heeft.", "Gebruik dit om een verhaal in stappen te maken.", "Quest komt nooit → controleer of de vorige quest te doen is."), { place: "questbuilder" }),
      // Quest Builder stap 2: wat er gebeurt als je de groep verlaat (alleen bij Team samen-doelen).
      partyLeave: { type: "select", required: false, options: ["keep", "wait", "fail"], optionIcons: { keep: "🎒", wait: "⏸️", fail: "❌" },
        optionLabels: { keep: "Meenemen: alleen verder", wait: "Wachten tot je weer in een groep zit", fail: "Quest mislukt" }, audience: "client", label: "Bij groep verlaten",
        ui: ui("🚪", "select", "questbuilder"), default: "keep",
        help: help("Wat er met Team samen-doelen gebeurt als iemand de groep verlaat. Je eigen bijdrage blijft altijd; er worden nooit vijanden of NPC's gekopieerd.", "Meenemen voor zijquests, Wachten voor groepsquests en bosses.", "Spelers verlaten de groep om sneller klaar te zijn → kies Wachten.") },
      // Oud (voor stap 6): aan = zo vaak als hij wil. Staat niet meer in het paneel; 🔁 Herhalen in de Quest Builder vervangt het.
      repeatable: toggle("Herhaalbaar", "🔁", false, "questbuilder",
        help("Mag de speler deze quest vaker doen?", "Uit voor verhaal-quests, aan voor klusjes (bijv. hout brengen).", "Spelers farmen beloningen → zet dit uit.")),
      // Quest Builder stap 6: hoe vaak (1 keer, altijd, elke dag of week op een vast uur, of na een wachttijd). Tab 🚪 Start.
      repeat: { type: "select", required: false, options: ["once", "always", "daily", "weekly", "cooldown"],
        optionIcons: { once: "1️⃣", always: "🔁", daily: "📅", weekly: "🗓️", cooldown: "⏳" },
        optionLabels: { once: "1 keer", always: "Zo vaak als hij wil", daily: "Elke dag opnieuw", weekly: "Elke week opnieuw (maandag)", cooldown: "Opnieuw na een wachttijd" },
        audience: "client", label: "Herhalen", ui: ui("🔁", "select", "questbuilder"), default: null,
        help: help("Hoe vaak een speler deze quest mag doen.", "1 keer voor het verhaal; elke dag voor klusjes; een wachttijd voor een boss.", "Spelers farmen beloningen → kies 1 keer of een langere wachttijd.") },
      repeatHour: int("Vanaf hoe laat (uur)", "🕕", 6, 0, 23, "questbuilder", { range: [0, 23] },
        help("Hoe laat de quest elke dag (of maandag) weer te doen is. Tijd van de server.", "6 = vanaf 06:00 's ochtends.", "Spelers klagen dat het te laat is → kies een vroeger uur.")),
      repeatMinutes: int("Wachttijd (minuten)", "⏳", 60, 1, 43200, "questbuilder", { range: [1, 1440] },
        help("Hoeveel minuten een speler moet wachten voor hij de quest weer mag doen.", "30-120 minuten voor een boss of een klusje.", "Spelers farmen hem → langer wachten.")),
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
      // Brug-stand (31-10): met deze schakelaar zet de editor Hoogte zelf, zodat de onderkant op het hoogste grondpunt eronder ligt.
      restOnHighest: toggle("Op hoogste grond eronder", "🌉", false, "werkbank",
        help("Legt de onderkant van het model op het hoogste stuk grond eronder, dus bij een brug op de oevers.",
          "Aan voor een brug over een rivier of een plank over een kuil. Na verplaatsen (G), draaien of groter maken zoekt hij opnieuw.",
          "Wil je Hoogte zelf bijstellen → zet dit uit; het model blijft liggen waar het lag.")),
      x: pos("X", "↔️"),
      y: Object.assign({}, height, { ui: ui("↕️", "slider", "werkbank", { step: 0.1, unit: "m", range: [-20, 20] }) }),
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
      // Healing (2-11): vanzelf levens en mana terugkrijgen (buiten gevecht) en een genees-spreuk, in een uitklapblok.
      healthRegenBp: int("Levens terug", "❤️", 100, 0, 10000, "instellingen", { step: 10, range: [0, 1000], unit: "%/s", scale: 100, group: CLASS_HEAL_GROUP },
        help("Hoeveel procent van je levens je per seconde vanzelf terugkrijgt, buiten een gevecht. 0 % = niets.", "0,5-2 %/s. Bij 1 %/s ben je in 100 seconden weer vol.", "Spelers moeten te lang wachten → hoger. Gevechten voelen zonder risico → lager.")),
      manaRegenBp: int("Mana terug", "🔵", 200, 0, 10000, "instellingen", { step: 10, range: [0, 1000], unit: "%/s", scale: 100, group: CLASS_HEAL_GROUP },
        help("Hoeveel procent van je mana je per seconde vanzelf terugkrijgt, buiten een gevecht. 0 % = niets.", "1-3 %/s; meer voor de Healer.", "Mana is te lang op → hoger.")),
      healAbilityRef: { type: "ref", refKind: "ability", required: false, audience: "client", label: "Genees-spreuk",
        ui: ui("✨", "ref", "instellingen", { group: CLASS_HEAL_GROUP }), default: null,
        help: help("De spreuk waarmee deze klasse geneest: jezelf of de meest gewonde speler in de buurt. Komt als 💚-knop (toets 2) in de game.", "Sleep een aanval met soort Genezen uit de Bibliotheek hierop; meestal alleen voor de Healer.", "Geen 💚-knop in de game → zet hier een spreuk op en kies bij de spreuk soort Genezen.") },
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
  // Healing (2-11): de regels voor regeneratie, effecten, doodgaan en level omhoog. Gelden voor alle klassen.
  combat_settings: {
    label: "Genezen en effecten",
    icon: "💚",
    place: "instellingen",
    singleton: true,
    domain: "project",
    fields: {
      regenDelayS: int("Terugkrijgen start na", "⏱️", 5, 0, 600, "instellingen", { range: [0, 60], unit: "s" },
        help("Hoeveel seconden na de laatste klap (geven of krijgen) je vanzelf levens en mana terugkrijgt. Effecten van eten en drinken werken altijd, ook in een gevecht.", "3-10 seconden.", "Tank is onsterfelijk door regeneratie → langer.")),
      effectStacking: { type: "select", required: false, options: ["refresh", "extend", "block"], optionIcons: { refresh: "🔄", extend: "➕", block: "⛔" },
        optionLabels: STACKING_LABELS, audience: "client", label: "Twee keer hetzelfde",
        ui: ui("🥪", "select", "instellingen"), default: "refresh",
        help: help("Wat gebeurt er als je hetzelfde broodje (of hetzelfde gif) nog eens krijgt terwijl het effect nog werkt?", "Opnieuw beginnen: de tijd begint opnieuw. Tijd erbij: de tijd telt op. Niet nog eens: kan pas als het op is (het item blijft dan in je tas).", "Spelers eten 10 broodjes voor 50 minuten kracht → kies Opnieuw beginnen of Niet nog eens.") },
      maxEffects: int("Effecten tegelijk", "🔢", 8, 1, 30, "instellingen", { range: [1, 16], more: true },
        help("Hoeveel effecten een speler tegelijk mag hebben.", "6 tot 10 effecten.", "Spelers stapelen te veel → lager.")),
      clearBuffsOnDeath: toggle("Goede effecten weg bij doodgaan", "💀", true, "instellingen",
        help("Gaan eten- en drankeffecten weg als je doodgaat? Slechte effecten (gif, bloeden) gaan altijd weg.", "Aan: doodgaan kost iets. Uit: lange effecten (5 uur) blijven.", "Spelers balen van een verloren drankje van 5 uur → zet dit uit.")),
      respawnHealthPct: int("Levens na respawn", "❤️", 100, 1, 100, "instellingen", { unit: "%" },
        help("Met hoeveel procent van je levens je terugkomt na doodgaan.", "50-100 %.", "Je gaat na respawn meteen weer dood → hoger.")),
      respawnManaPct: int("Mana na respawn", "🔵", 100, 0, 100, "instellingen", { unit: "%" },
        help("Met hoeveel procent van je mana je terugkomt na doodgaan.", "50-100 %.", "Healer kan na respawn niets → hoger.")),
      levelUpRestore: toggle("Level omhoog = vol", "⭐", true, "instellingen",
        help("Krijg je volle levens en mana als je een level omhoog gaat?", "Meestal aan: dat voelt als een beloning.", "Spelers misbruiken het midden in een gevecht → zet dit uit."))
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
      clickAreaExtraPercent: int("Klikruimte extra", "👆", 10, 0, 200, "instellingen", { range: [0, 100], unit: "%", group: "🎯 Objecten, NPC's en namen", more: true },
        help("Hoeveel procent extra klikruimte er rondom de echte breedte, hoogte en diepte van iedere mesh komt.", "10 % met 0,15 m extra werkt meestal prettig. De klikruimte volgt automatisch het formaat van NPC's, items en andere doelen.", "Je selecteert iets terwijl je er ruim naast klikt → lager.")),
      clickAreaExtraMeters: { type: "number", required: false, min: 0, max: 10, audience: "client", label: "Klikruimte extra in meters",
        ui: ui("📐", "slider", "instellingen", { step: 0.05, unit: "m", range: [0, 2], group: "🎯 Objecten, NPC's en namen", more: true }), default: 0.15,
        help: help("Hoeveel meter extra klikruimte er aan iedere kant van de mesh komt, boven op het percentage.", "0,10 tot 0,25 m maakt kleine items makkelijker aanklikbaar zonder een groot onzichtbaar vlak te maken.", "De klikruimte is nog te breed of te hoog → lager; kleine items zijn lastig → iets hoger.") },
      showWorldRings: toggle("Cirkels om doelen", "⭕", true, "instellingen",
        help("Toont de gekleurde cirkel op de grond rond NPC's, vijanden, items en andere interactieve doelen.", "Zet uit voor een rustiger spelbeeld; aanklikken en de Doen-knop blijven werken.", "Je wilt de doelen weer duidelijk zien → zet aan."),
        { group: "🎯 Objecten, NPC's en namen", more: true }),
      worldNameOffsetMeters: { type: "number", required: false, min: 0, max: 10, audience: "client", label: "Namen boven mesh",
        ui: ui("↕️", "slider", "instellingen", { step: 0.05, unit: "m", range: [0, 3], group: "🎯 Objecten, NPC's en namen", more: true }), default: 0.2,
        help: help("Hoeveel meter boven het hoogste punt van de echte mesh de 2D-naam staat.", "0,15 tot 0,30 m. De hoogte wordt voor ieder model apart gemeten.", "Naam zit in het model → hoger. Naam zweeft te ver erboven → lager.") },
      worldNameFontSizePx: int("Tekstgrootte namen", "🔤", 13, 8, 48, "instellingen", { range: [8, 32], unit: "px", group: "🎯 Objecten, NPC's en namen", more: true },
        help("De grootte van de 2D-namen boven meshes en spelers.", "13 px is de standaard; 16-20 px leest makkelijker op een klein scherm.", "Namen bedekken te veel van het spel → kleiner.")),
      showShop: toggle("Winkel en crafting", "🛒", true, "instellingen", help("Kopen, verkopen en maken bij een NPC: het paneel splitst dan in waren en je tas.", "Aan als een NPC iets verkoopt of maakt.", "Winkel niet te zien → zet aan."), { more: true }),
      mapMinimapVisible: toggle("Minimap zichtbaar bij start", "🧭", true, "instellingen",
        help("Of een nieuwe speler begint met de kleine kaart rechtsboven in beeld. De speler kan hem later zelf uitzetten.", "Aan.", "De kaart mag pas later gebruikt worden → zet uit."), { group: MAP_START_GROUP, more: true }),
      mapLargeStartOpen: toggle("Start met grote kaart open", "🗺️", false, "instellingen",
        help("Opent de grote kaart meteen wanneer een nieuwe speler het spel binnenkomt.", "Uit.", "De kaart moet als beginscherm dienen → zet aan."), { group: MAP_START_GROUP, more: true }),
      mapShape: selectSetting("Vorm minimap", "🔲", "round", ["round", "square"], { round: "Rond", square: "Vierkant" }, MAP_START_GROUP,
        help("De vorm van de kleine kaart rechtsboven.", "Rond.", "Je wilt de hoeken van de kaart gebruiken → kies Vierkant.")),
      mapRotate: toggle("Minimap draait mee", "🧭", false, "instellingen",
        help("Aan = de kijkrichting van de speler blijft boven. Uit = het noorden blijft boven.", "Uit: noorden boven.", "De speler raakt de richting kwijt → probeer de andere stand."), { group: MAP_START_GROUP, more: true }),
      mapAllowPin: toggle("Speler mag een pin plaatsen", "📍", true, "instellingen",
        help("Laat de speler op een lege plek van de grote kaart klikken om een eigen pin te plaatsen en erheen te lopen.", "Aan.", "Je wilt geen persoonlijke routepunten → zet uit."), { group: MAP_START_GROUP, more: true }),
      mapMiniShowRegionName: toggle("Gebiedsnaam onder minimap", "🏷️", true, "instellingen",
        help("Toont de naam van het huidige gebied onder de kleine kaart.", "Aan.", "De naam neemt te veel ruimte in → zet uit."), { group: MAP_START_GROUP, more: true }),
      mapBigShowRegionName: toggle("Gebiedsnaam boven grote kaart", "🏷️", true, "instellingen",
        help("Toont de naam van het huidige gebied als titel van de grote kaart.", "Aan.", "Je wilt alleen 'Kaart' als titel → zet uit."), { group: MAP_START_GROUP, more: true }),
      mapBigShowScale: toggle("Schaalbalk grote kaart", "📏", true, "instellingen",
        help("Toont linksonder hoeveel meter een lijn op de grote kaart is.", "Aan.", "Je wilt een rustigere kaart → zet uit."), { group: MAP_START_GROUP, more: true }),
      mapBigShowCoordinates: toggle("Coördinaten grote kaart", "🔢", true, "instellingen",
        help("Toont rechtsonder de X- en Z-positie van de speler.", "Aan.", "Spelers mogen geen coördinaten zien → zet uit."), { group: MAP_START_GROUP, more: true }),
      mapMiniSizePx: int("Grootte minimap", "📐", 120, 64, 320, "instellingen", { range: [80, 240], unit: "px", group: MAP_SIZE_GROUP, more: true },
        help("De diameter of breedte van de kleine kaart vóór de algemene HUD-schaal wordt toegepast.", "120 px.", "De kaart bedekt te veel → kleiner.")),
      mapMiniZoomNearMeters: int("Minimap zoom dichtbij", "➕", 30, 10, 1000, "instellingen", { range: [15, 120], unit: "m", group: MAP_SIZE_GROUP, more: true },
        help("Hoeveel meter vanaf het midden zichtbaar is in de dichtstbij-stand.", "30 m.", "Je ziet te weinig vlak om je heen → hoger.")),
      mapMiniZoomNormalMeters: int("Minimap zoom normaal", "🔍", 60, 10, 2000, "instellingen", { range: [30, 250], unit: "m", group: MAP_SIZE_GROUP, more: true },
        help("Hoeveel meter vanaf het midden zichtbaar is in de normale stand.", "60 m.", "De normale kaart staat te ver weg → lager.")),
      mapMiniZoomFarMeters: int("Minimap zoom ver", "➖", 120, 10, 4000, "instellingen", { range: [60, 500], unit: "m", group: MAP_SIZE_GROUP, more: true },
        help("Hoeveel meter vanaf het midden zichtbaar is in de verste stand.", "120 m.", "Je wilt meer van de omgeving zien → hoger.")),
      mapMiniDefaultZoom: selectSetting("Beginzoom minimap", "🔍", "normal", ["near", "normal", "far"], { near: "Dichtbij", normal: "Normaal", far: "Ver" }, MAP_SIZE_GROUP,
        help("Met welke van de drie zoomstanden een nieuwe speler begint.", "Normaal.", "Belangrijke dingen zijn buiten beeld → kies Ver.")),
      mapBigSpanMeters: int("Beginzoom grote kaart", "🗺️", 160, 30, 10000, "instellingen", { step: 10, range: [50, 1000], unit: "m", group: MAP_SIZE_GROUP, more: true },
        help("Hoeveel meter breed de grote kaart bij het openen begint. De speler kan daarna zelf zoomen.", "160 m.", "De kaart begint te ver ingezoomd → hoger.")),
      mapMiniIconScalePct: int("Icoongrootte minimap", "🔶", 100, 40, 250, "instellingen", { range: [50, 200], unit: "%", group: MAP_SIZE_GROUP, more: true },
        help("Grootte van alle markeringen op de kleine kaart.", "100 %.", "De icoontjes bedekken elkaar → lager.")),
      mapBigIconScalePct: int("Icoongrootte grote kaart", "🔶", 80, 40, 250, "instellingen", { range: [50, 200], unit: "%", group: MAP_SIZE_GROUP, more: true },
        help("Grootte van alle markeringen op de grote kaart.", "80 %.", "De icoontjes zijn moeilijk te zien → hoger.")),
      mapMiniFixedIconSize: toggle("Alles boven minimap vast bij zoomen", "📌", true, "instellingen",
        help("Aan = alle iconen, namen en gebiedsteksten boven op de kaart-bake houden exact dezelfde pixelgrootte bij in- en uitzoomen. Uit = deze lagen schalen mee met de zoom.", "Aan voor altijd even grote en leesbare kaartlagen.", "Iconen of teksten worden groter of kleiner tijdens zoomen → zet aan."), { group: MAP_SIZE_GROUP, more: true }),
      mapBigFixedIconSize: toggle("Alles boven grote kaart vast bij zoomen", "📌", true, "instellingen",
        help("Aan = alle iconen, namen en gebiedsteksten boven op de grote kaart-bake houden exact dezelfde pixelgrootte bij in- en uitzoomen. Uit = deze lagen schalen mee met de zoom.", "Aan voor altijd even grote en leesbare kaartlagen.", "Iconen of teksten worden groter of kleiner tijdens zoomen → zet aan."), { group: MAP_SIZE_GROUP, more: true }),
      mapMiniAreaTextScalePct: int("Gebiedstekst minimap", "🔤", 100, 40, 250, "instellingen", { range: [50, 200], unit: "%", group: MAP_SIZE_GROUP, more: true },
        help("Grootte van de namen die in de kaart zelf staan.", "100 %.", "Gebiedsnamen bedekken de kaart → lager.")),
      mapBigAreaTextScalePct: int("Gebiedstekst grote kaart", "🔤", 100, 40, 250, "instellingen", { range: [50, 200], unit: "%", group: MAP_SIZE_GROUP, more: true },
        help("Grootte van gebiedsnamen op de grote kaart.", "100 %.", "Gebiedsnamen zijn onleesbaar → hoger.")),
      mapMiniShowMarkerNames: toggle("Namen naast minimap-iconen", "🏷️", false, "instellingen",
        help("Schrijft de naam van NPC's, spelers, vijanden, portals en andere markeringen naast hun icoon op de minimap.", "Uit om de kleine kaart rustig te houden.", "Je wilt direct zien wat ieder punt is → zet aan."), { group: MAP_SIZE_GROUP, more: true }),
      mapBigShowMarkerNames: toggle("Namen naast grote-kaart-iconen", "🏷️", false, "instellingen",
        help("Schrijft de naam van iedere markering naast het icoon op de grote kaart.", "Uit; aanwijzen of tikken toont de naam.", "De kaart moet alle namen meteen tonen → zet aan."), { group: MAP_SIZE_GROUP, more: true }),
      mapMiniMarkerNameSizePx: int("Naamgrootte minimap", "🔤", 10, 6, 32, "instellingen", { range: [7, 20], unit: "px", group: MAP_SIZE_GROUP, more: true },
        help("Tekstgrootte van namen naast markeringen op de minimap.", "10 px.", "Namen zijn te klein → hoger.")),
      mapBigMarkerNameSizePx: int("Naamgrootte grote kaart", "🔤", 12, 6, 40, "instellingen", { range: [8, 28], unit: "px", group: MAP_SIZE_GROUP, more: true },
        help("Tekstgrootte van namen naast markeringen op de grote kaart.", "12 px.", "Namen bedekken elkaar → lager.")),
      mapBackgroundColor: colorSetting("Achtergrond buiten de wereld", "⬛", "#0b1220", MAP_COLOR_GROUP,
        help("De kleur achter kaarttegels en buiten de rand van de wereld.", "Donkerblauw.", "De lege kaartdelen vallen te veel op → kies een donkerdere kleur.")),
      mapBorderColor: colorSetting("Randkleur kaarten", "🟨", "#b99446", MAP_COLOR_GROUP,
        help("De rand om de kleine en grote kaart.", "Goudbruin.", "De rand past niet bij je HUD → kies een andere kleur.")),
      mapBorderWidthPx: int("Dikte kaartrand", "📏", 3, 0, 12, "instellingen", { range: [0, 8], unit: "px", group: MAP_COLOR_GROUP, more: true },
        help("De dikte van de rand om de kleine en grote kaart.", "3 px.", "Geen rand gewenst → 0.")),
      mapAreaLabel: textSetting("Naam in legenda", "🏷️", "Gebiedsnamen", "📍 Legenda: Gebiedsnamen",
        help("De naam van de gebiedstekst in de legenda.", "Gebiedsnamen.", "Gebruik een kortere naam als de legenda te breed wordt.")),
      mapAreaColor: colorSetting("Kleur gebiedsnamen", "🎨", "#f3e2b3", "📍 Legenda: Gebiedsnamen",
        help("De kleur van gebiedsnamen in de kaart en het voorbeeld in de legenda.", "Licht perkament.", "Tekst heeft te weinig contrast → kies lichter.")),
      mapAreaShowMini: toggle("Op minimap bij start", "🧭", true, "instellingen",
        help("Toont gebiedsnamen standaard op de minimap.", "Aan.", "De minimap is te druk → zet uit."), { group: "📍 Legenda: Gebiedsnamen", more: true }),
      mapAreaShowBig: toggle("Op grote kaart bij start", "🗺️", true, "instellingen",
        help("Toont gebiedsnamen standaard op de grote kaart.", "Aan.", "De grote kaart is te druk → zet uit."), { group: "📍 Legenda: Gebiedsnamen", more: true }),
      mapMarkerNameColor: colorSetting("Kleur namen bij iconen", "🎨", "#ffffff", MAP_COLOR_GROUP,
        help("De tekstkleur van namen naast kaarticonen.", "Wit.", "De namen zijn slecht leesbaar → kies meer contrast.")),
      mapFogColor: colorSetting("Kleur van de mist", "🌫️", "#05070a", MAP_COLOR_GROUP,
        help("De kleur waarmee nog niet ontdekte kaartdelen worden bedekt.", "Bijna zwart.", "Je wilt gekleurde mist → kies hier een tint.")),
      ...MAP_LEGEND_FIELDS,
      fogOfWar: toggle("Mist op de kaart", "🌫️", true, "instellingen", help("Fog of war: op de minimap en de grote kaart is alles donker tot je er geweest bent. Ontdekte plekken blijven bewaard.", "Aan voor een avontuurgevoel.", "Spelers zien meteen de hele kaart → zet aan."), { more: true }),
      fogRevealMeters: int("Zicht in de mist", "👁️", 40, 8, 400, "instellingen", { range: [10, 150], more: true },
        help("Hoe ver om je heen de mist weggaat terwijl je loopt (in meters).", "30-60 m.", "De kaart gaat te langzaam open → hoger.")),
      questArrowDistanceMeters: int("Questpijl binnen afstand", "⭐", 200, 0, 2000, "instellingen", { step: 10, range: [0, 2000], unit: "m", more: true },
        help("Binnen deze afstand tot een questgever of quest-doel verschijnt de richtingspijl aan de rand van de minimap of grote kaart als het punt buiten beeld ligt. De queststerren blijven zichtbaar volgens hun eigen mistregels.", "200 m. 0 m = geen questpijlen; de sterren blijven op de kaart.", "Questpijlen verschijnen te vroeg → lager. Je wilt eerder de richting zien → hoger.")),
      fogDarkness: int("Donkerte van de mist", "🌑", 100, 0, 100, "instellingen", { range: [0, 100], more: true },
        help("Hoe donker de mist op de kaart is, in procent. 100 = helemaal dicht, je ziet er niets doorheen.", "90 tot 100.", "Je ziet de kaart door de mist heen → hoger.")),
      // Healing (2-11): effect-icoontjes bij het portret en kleine zwevende getallen (spelers kunnen ze in de game zelf uitzetten).
      showEffects: toggle("Effecten", "✨", true, "instellingen", help("Toont de icoontjes van actieve effecten (eten, drankjes, gif) bij het portret, met hoe lang nog.", "Meestal aan.", "Spelers weten niet dat hun broodje nog werkt → zet dit aan."), { more: true }),
      showFloatNumbers: toggle("Zwevende getallen", "🔢", true, "instellingen", help("Kleine getallen boven spelers en vijanden: rood schade, groen genezen, blauw mana. Spelers kunnen ze in de game zelf uitzetten (Instellingen).", "Meestal aan.", "Te druk in beeld → zet dit uit."), { more: true }),
      fogFadeMeters: int("Zachte rand van de mist", "🌗", 8, 0, 64, "instellingen", { range: [0, 32], more: true },
        help("Hoe breed de zachte overgang aan de rand van de mist is, in meters. 0 = een harde rand.", "4 tot 16 m.", "Je ziet te veel door de rand heen → lager. De rand is te hoekig → hoger."))
    }
  },
  minimap_settings: {
    label: "Minimap",
    icon: "🗺️",
    place: "instellingen",
    singleton: true,
    domain: "project",
    fields: {}
  }
};

// De kaartvelden staan hierboven bij elkaar met de andere HUD-presentatievelden,
// maar vormen in de editor bewust een zelfstandige instellingenpagina.
for (const key of Object.keys(GAME_KINDS.hud_settings.fields)) {
  if (!key.startsWith("map") && !["fogOfWar", "fogRevealMeters", "questArrowDistanceMeters", "fogDarkness", "fogFadeMeters"].includes(key)) continue;
  GAME_KINDS.minimap_settings.fields[key] = GAME_KINDS.hud_settings.fields[key];
  delete GAME_KINDS.hud_settings.fields[key];
}
