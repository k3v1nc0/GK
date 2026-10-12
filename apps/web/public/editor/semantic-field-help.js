// Deterministic semantic help for authoring fields.
//
// The registry is deliberately keyed by the exact node type and field key. Shared
// builders only provide wording for meanings that are genuinely shared (position,
// duration, identity, etc.); GOLDEN_OVERRIDES records code-proven exceptions and
// runtime behaviour for the normal authoring route.

export const FIELD_HELP_STATUSES = Object.freeze({
  FULL: "Werkt volledig",
  COMPILED: "Alleen opgeslagen/gecompileerd",
  INACTIVE: "Nog niet actief in runtime",
  TECHNICAL: "Geavanceerd/technisch"
});

const REGISTRY_CACHE = new WeakMap();

const OPTION_MEANINGS = Object.freeze({
  true: "aan", false: "uit", none: "geen extra gedrag", inherit: "neemt de bovenliggende instelling over",
  set: "gebruikt de waarde van dit veld", clear: "wist de bovenliggende waarde",
  enabled: "actief", disabled: "uitgeschakeld", custom: "handmatig ingesteld",
  fixed: "vaste waarde", random: "willekeurige verdeling", runtime: "nieuw gekozen tijdens spelen",
  blue_noise: "gelijkmatige spreiding met minder clustering", edge: "langs de rand", patrol_points: "op patrouillepunten",
  deterministic_build: "dezelfde verdeling per build", zone_loaded: "actief zodra de zone geladen is",
  area_entered: "actief na betreden van het gebied", encounter: "gestuurd door een encounter", always_resident: "altijd actief",
  zone_range: "niveau uit het zonebereik", area_range: "niveau uit het gebiedsbereik",
  player_clamped: "niveau begrensd rond de speler", party_clamped: "niveau begrensd rond de party",
  instant: "direct zonder overgang", fade: "vloeiende fade", loading_screen: "toont een laadscherm",
  polygon: "vorm uit getekende punten", box: "rechthoek", circle: "cirkel",
  item: "item", currency: "valuta", personal: "apart per speler", shared: "gedeeld",
  main: "hoofdvariant", secondary: "tweede laag", both: "beide",
  active_zone_registry: "kaart van de actieve zone", fixed_legacy: "vaste oudere minimapbron",
  north_up: "noord blijft boven", player_facing: "draait met de speler", camera_yaw: "draait met de camera",
  once_per_character: "een keer per personage", repeatable: "opnieuw startbaar", daily: "dagelijks", weekly: "wekelijks",
  talk: "praten met een target", collect: "items bezitten", deliver: "items afleveren", reach: "een plek bereiken",
  main_quest: "hoofdquest", side: "zijquest", tutorial: "uitlegquest", event: "eventquest",
  all: "alle voorwaarden moeten kloppen", any: "minstens een voorwaarde moet kloppen",
  normal: "standaardgedrag", ranged: "vecht op afstand", healer: "ondersteunt met herstel",
  tank: "vangt schade op", elite: "sterkere bijzondere enemy", boss: "bossgedrag", ambient: "omgevingsfiguur",
  consume: "verbruikt de invoer", keep: "behoudt de invoer", infinite: "onbeperkte voorraad", limited: "beperkte voorraad",
  sell_to_player: "vendor verkoopt aan speler", buy_from_player: "vendor koopt van speler",
  door: "doorgang met interactie", portal: "portaal", teleport: "directe verplaatsing",
  fast_travel: "fast-travelverbinding", seamless_boundary: "naadloze zonegrens", scripted_transport: "scriptgestuurd vervoer"
});

const REFERENCE_PLACES = Object.freeze({
  zone: "World/Zone", area: "World/Zone → Wereldinhoud", spawn: "World/Zone → Wereldinhoud",
  target: "World/Zone → Wereldinhoud bij Quest Target", portal: "World/Zone → Wereldinhoud bij Portal",
  zone_link: "World/Zone bij de gekoppelde doorgang", player: "Catalog/Definities bij Playable Character",
  item: "Catalog/Definities bij Item", currency: "Catalog/Definities bij Currency",
  ability: "Catalog/Definities bij Ability", enemy: "Catalog/Definities bij Enemy",
  npc: "Catalog/Definities bij NPC", resource: "Catalog/Definities bij Resource",
  stat: "Catalog/Definities bij Stat", stat_block: "Catalog/Definities bij Stat Block",
  damage_type: "Catalog/Definities bij Damage Type", loot_table: "Catalog/Definities bij Loot Table",
  respawn_policy: "Catalog/Definities bij Respawn Policy", recipe: "Catalog/Definities bij Recipe",
  vendor_catalog: "Catalog/Definities bij Vendor Catalog", quest: "Quest/Dialoog bij Quest",
  quest_step: "Quest/Dialoog bij Quest Step", dialogue: "Quest/Dialoog bij Dialogue",
  audio: "Catalog/Definities bij audio", vfx: "Catalog/Definities bij VFX",
  policy: "Game-instellingen of de passende policy-definitie"
});

const FULL_RUNTIME_NODE_TYPES = new Set([
  "world_settings", "editor_world_settings", "game_world_settings", "ground_surface", "terrain_layer",
  "surface_layer", "blocker_area", "walkable_surface", "game_camera", "top_down_camera", "ambient_light",
  "directional_light", "player_character", "player_spawn", "model_entity", "interactable", "keybind",
  "zone_definition", "zone_environment_settings", "area_definition", "location_anchor", "spawn_point",
  "zone_link", "entity_assembly", "interaction_component", "quest_target_binding", "portal_component",
  "resource_component", "pickup_component", "enemy_component", "npc_component", "enemy_spawn_area",
  "resource_spawn", "pickup_spawn", "spawn_set", "spawn_controller", "game_minimap_hud",
  "quest_definition", "quest_step", "objective_talk", "objective_collect", "objective_deliver",
  "objective_reach", "condition_player_level", "condition_has_item", "condition_group", "dialogue_definition",
  "dialogue_entry", "dialogue_choice", "recipe_ingredient", "recipe_definition", "vendor_offer",
  "vendor_catalog", "crafting_station_component", "vendor_component"
]);

const PROVEN_INACTIVE_KEYS = new Set([
  "revealHeight", "showQuestIcon", "difficultyRef", "healthMultiplier", "damageMultiplier", "armorMultiplier",
  "speedMultiplier", "partyScalingCurveRef", "enemyHealthMultiplier", "enemyDamageMultiplier"
]);

const PROVEN_INACTIVE_FIELDS = new Set([
  "enemy_spawn_area.distribution", "enemy_spawn_area.minimumSpacing", "enemy_spawn_area.levelMode",
  "enemy_spawn_area.maxAlive", "enemy_spawn_area.activationRadius", "enemy_spawn_area.playerExclusionRadius",
  "respawn_policy_definition.jitterMode", "respawn_policy_definition.maxAliveDefault",
  "respawn_policy_definition.corpseDurationMs", "respawn_policy_definition.despawnDistance",
  "respawn_policy_definition.resetEncounterOnWipe", "respawn_policy_definition.oneTimeSpawn",
  "respawn_policy_definition.persistentDefeatFlagRef", "enemy_archetype.combatProfileRef",
  "enemy_archetype.aiProfileRef", "enemy_archetype.animationSetRef", "enemy_archetype.factionRef",
  "enemy_archetype.baseLevel", "enemy_archetype.minimumLevel", "enemy_archetype.maximumLevel",
  "enemy_archetype.networkProfile", "enemy_archetype.corpseDurationMs", "enemy_archetype.defaultRespawnPolicyRef",
  "enemy_archetype.nameplateMode", "enemy_archetype.bestiaryCategory"
]);

const PROVEN_INACTIVE_NODE_TYPES = new Set([
  "enemy_spawn_point", "ai_behavior_profile", "path_behavior_profile", "difficulty_profile"
]);

const GOLDEN_OVERRIDES = Object.freeze({
  "enemy_spawn_area.pathRef": {
    effect: "zou een route voor deze enemyspawngroep aanwijzen, maar NODE-03 leest de koppeling nu niet.",
    defaultReason: "leeg — er is geen actieve routeconsumer en geen normale Path-definition om te kiezen.",
    advice: "Laat leeg. Maak geen raw ID; Path-authoring en runtimegebruik ontbreken nog.",
    reference: "Een toekomstige Path-target. De normale World/Zone-route biedt nu geen aparte Path-definition; de huidige targetpicker maakt hiervan geen werkend pad. Leeg laten verandert niets.",
    status: FIELD_HELP_STATUSES.INACTIVE
  },
  "enemy_spawn_point.pathRef": {
    effect: "zou de looproute van deze enemyspawn aanwijzen, maar NODE-03 leest de koppeling nu niet.",
    defaultReason: "leeg — Path-authoring en een runtimeconsumer ontbreken.",
    advice: "Laat leeg; een gekozen target-ID laat de enemy momenteel niet patrouilleren.",
    reference: "Een toekomstige Path-target; die kan nu niet als werkend Path in de normale route worden gemaakt. Leeg en gevuld hebben hetzelfde runtime-effect.",
    status: FIELD_HELP_STATUSES.INACTIVE
  },
  "enemy_spawn_area.radius": {
    effect: "verdeelt de enemies rond het centrum van deze spawn area.",
    defaultReason: "10 world-units — het schema start met zichtbare spreiding; code bewijst geen algemeen ideaal speelbereik.",
    advice: "Toegestaan: 0–100000 world-units. Geen bewezen voorkeursbereik; test dit in je eigen game.",
    lower: "enemies staan dichter bij het centrum", higher: "enemies worden verder rond het centrum geplaatst",
    unit: "world-units", status: FIELD_HELP_STATUSES.FULL
  },
  "enemy_spawn_area.countMin": {
    effect: "legt de ondergrens van de bedoelde groepsgrootte vast.",
    defaultReason: "1 enemy — de groep kan met één geldige enemy starten.",
    advice: "Toegestaan: 0–100000 enemies; NODE-03 kiest nu countMax als die gevuld is en begrenst runtime op 12. Geen bewezen voorkeursbereik; test dit in je eigen game.",
    lower: "kleinere minimumgroep", higher: "grotere minimumgroep", unit: "enemies",
    status: FIELD_HELP_STATUSES.COMPILED
  },
  "enemy_spawn_area.countMax": {
    effect: "bepaalt hoeveel enemies NODE-03 voor deze groep probeert te maken.",
    defaultReason: "3 enemies — een kleine groep als schema-startpunt; geen algemene balanswaarde.",
    advice: "Toegestaan: 0–100000; de huidige runtime begrenst daadwerkelijk op 1–12. Geen bewezen voorkeursbereik; test dit in je eigen game.",
    lower: "minder enemies tegelijk", higher: "meer enemies, tot de runtimegrens van 12", unit: "enemies",
    status: FIELD_HELP_STATUSES.FULL
  },
  "enemy_archetype.statBlockRef": {
    effect: "kiest de Stat Block waaruit NODE-03 onder meer health en attack power van deze enemy leest.",
    defaultReason: "leeg — een enemy krijgt pas jouw stats na een expliciete Stat Block-koppeling.",
    advice: "Maak/selecteer eerst een Stat Block met entries voor bijvoorbeeld stat.health en stat.attack_power.",
    reference: "Een Stat Block uit Catalog/Definities. Leeg kan in de runtime op een interne fallback uitkomen; vertrouw daarop niet voor eigen content.",
    status: FIELD_HELP_STATUSES.FULL
  },
  "stat_block.entries": {
    effect: "legt per stat de basiswaarde vast; NODE-03 gebruikt stat.health voor enemy health en stat.attack_power voor schade.",
    defaultReason: "lege lijst — een nieuw block kent nog geen gameplaystats.",
    advice: "Voeg alleen bestaande Stat-definities toe; balansbereiken zijn niet in code bewezen.",
    status: FIELD_HELP_STATUSES.FULL
  },
  "ability_definition.damageFormula": {
    effect: "levert de basisschade voor deze ability; de runtime telt daar attack power bij en trekt armor af.",
    defaultReason: "lege formule — zonder eigen formule gebruikt de huidige basisaanval een runtimefallback.",
    advice: "Geen bewezen voorkeursbereik; test dit samen met attack power en armor in je eigen game.",
    status: FIELD_HELP_STATUSES.FULL
  },
  "difficulty_profile.healthMultiplier": {
    effect: "is bedoeld om enemy health per difficulty te vermenigvuldigen, maar NODE-03 past dit nu niet toe.",
    defaultReason: "1× — neutrale multiplier zonder wijziging.", advice: "Nog niet afstellen; de waarde beïnvloedt de game nog niet.",
    lower: "zou minder health betekenen", higher: "zou meer health betekenen", unit: "×", status: FIELD_HELP_STATUSES.INACTIVE
  },
  "difficulty_profile.damageMultiplier": {
    effect: "is bedoeld om enemy damage per difficulty te vermenigvuldigen, maar NODE-03 past dit nu niet toe.",
    defaultReason: "1× — neutrale multiplier zonder wijziging.", advice: "Nog niet afstellen; de waarde beïnvloedt de game nog niet.",
    lower: "zou minder damage betekenen", higher: "zou meer damage betekenen", unit: "×", status: FIELD_HELP_STATUSES.INACTIVE
  },
  "enemy_spawn_area.respawnPolicyRef": {
    effect: "kiest na defeat de wachttijd voordat enemies uit deze groep terugkomen.",
    defaultReason: "leeg — NODE-03 kan dan terugvallen op de enemy- of interne quick-policy.",
    advice: "Kies expliciet een Respawn Policy wanneer de timing onderdeel van je ontwerp is.",
    reference: "Een Respawn Policy uit Catalog/Definities. Leeg gebruikt eerst de enemy-policy en daarna de aantoonbare NODE-03 quick-fallback.",
    status: FIELD_HELP_STATUSES.FULL
  },
  "respawn_policy_definition.minDelayMs": {
    effect: "vormt samen met Max delay de huidige respawnwachttijd.",
    defaultReason: "30000 ms — schema-startwaarde; de runtime neemt nu het gemiddelde met Max delay.",
    advice: "Toegestaan: 0–86400000 ms. Geen bewezen voorkeursbereik; test dit in je eigen game.",
    lower: "snellere gemiddelde respawn", higher: "langzamere gemiddelde respawn", unit: "ms", status: FIELD_HELP_STATUSES.FULL
  },
  "respawn_policy_definition.maxDelayMs": {
    effect: "vormt samen met Min delay de huidige respawnwachttijd; er wordt nog niet willekeurig gekozen.",
    defaultReason: "60000 ms — schema-startwaarde; de runtime gebruikt het gemiddelde van min en max.",
    advice: "Toegestaan: 0–86400000 ms. Geen bewezen voorkeursbereik; test dit in je eigen game.",
    lower: "snellere gemiddelde respawn", higher: "langzamere gemiddelde respawn", unit: "ms", status: FIELD_HELP_STATUSES.FULL
  },
  "portal_component.range": {
    effect: "bepaalt hoe dicht de speler bij dit portal moet zijn om te kunnen reizen.",
    defaultReason: "4 world-units — de runtime gebruikt dezelfde fallback voor portals.",
    advice: "Toegestaan: 0,1–1000 world-units. Geen bewezen voorkeursbereik; test bereik en portalformaat samen.",
    lower: "de speler moet dichterbij staan", higher: "reizen kan van verder weg", unit: "world-units",
    status: FIELD_HELP_STATUSES.FULL
  },
  "quest_step.stepType": {
    effect: "beschrijft het soort stap; de gekoppelde Objective-node bepaalt de werkelijk gemeten voortgang.",
    defaultReason: "collect — geldige schema-startkeuze, niet automatisch een gekoppeld collect-objective.",
    advice: "Laat dit overeenkomen met de Objective-node(s) die je aan de step verbindt.", status: FIELD_HELP_STATUSES.COMPILED
  },
  "objective_collect.requiredAmount": {
    effect: "bepaalt hoeveel exemplaren van Item de speler moet bezitten om dit objective te halen.",
    defaultReason: "1 item — één geldig exemplaar is de kleinste voltooibare opdracht.",
    advice: "Toegestaan: 1–1000000 items. Geen bewezen voorkeursbereik; stem af op beschikbaarheid.",
    lower: "sneller voltooid", higher: "meer verzamelen nodig", unit: "items", status: FIELD_HELP_STATUSES.FULL
  },
  "objective_deliver.requiredAmount": {
    effect: "bepaalt hoeveel exemplaren nodig zijn voor dit afleverobjective.",
    defaultReason: "1 item — kleinste geldige afleverhoeveelheid.",
    advice: "Toegestaan: 1–1000000 items. De objective controleert bezit; innemen vereist een Remove Item-action. Geen bewezen voorkeursbereik; test dit in je eigen game.",
    lower: "sneller voldoende bezit", higher: "meer items nodig", unit: "items", status: FIELD_HELP_STATUSES.FULL
  },
  "recipe_ingredient.itemRef": {
    effect: "kiest welk item deze recipe als ingrediënt controleert en eventueel verbruikt.",
    defaultReason: "leeg — een recipe ingredient hoort pas bij een item na expliciete keuze.",
    advice: "Maak/selecteer eerst het Item in Catalog/Definities en stel daarna Amount en Consume in.",
    reference: "Een Item uit Catalog/Definities. Leeg levert geen bruikbaar itemingrediënt op.", status: FIELD_HELP_STATUSES.FULL
  },
  "recipe_ingredient.amount": {
    effect: "bepaalt hoeveel van dit item of deze currency per craft nodig is.",
    defaultReason: "1 — kleinste bruikbare ingrediënthoeveelheid.",
    advice: "Toegestaan: 0–1000000; compiler/runtime normaliseert een bruikbaar ingrediënt naar minimaal 1. Geen bewezen voorkeursbereik; test dit in je eigen game.",
    lower: "goedkoper craften", higher: "duurder craften", unit: "stuks/minor units", status: FIELD_HELP_STATUSES.FULL
  },
  "recipe_definition.outputItems": {
    effect: "geeft de opgegeven items wanneer een voltooide crafting job wordt geclaimd.",
    defaultReason: "lege lijst — een nieuwe recipe geeft nog geen itemoutput.",
    advice: "Voeg per regel een bestaand Item en een hoeveelheid toe; zonder output levert craften niets op.", status: FIELD_HELP_STATUSES.FULL
  },
  "vendor_offer.itemRef": {
    effect: "kiest het item dat deze vendor offer koopt of verkoopt.",
    defaultReason: "leeg — zonder item bestaat er geen uitvoerbaar aanbod.",
    advice: "Maak/selecteer eerst het Item in Catalog/Definities.",
    reference: "Een Item uit Catalog/Definities. Leeg maakt de offer onbruikbaar.", status: FIELD_HELP_STATUSES.FULL
  },
  "vendor_offer.sellPriceMinor": {
    effect: "bepaalt de prijs per item wanneer de vendor aan de speler verkoopt.",
    defaultReason: "10 minor units — schema-startprijs; geen bewezen economieadvies.",
    advice: "Toegestaan: 0–100000000000 minor units. Geen bewezen voorkeursbereik; balanceer met de gekozen currency.",
    lower: "goedkoper kopen", higher: "duurder kopen", unit: "minor currency units", status: FIELD_HELP_STATUSES.FULL
  },
  "game_camera.startDistance": {
    effect: "bepaalt de beginzoom van de gameplaycamera rond de speler.",
    defaultReason: "24 world-units — dezelfde aantoonbare runtimefallback als de oude distance-instelling.",
    advice: "Toegestaan: 2–400 world-units. Geen bewezen voorkeursbereik; controleer zicht en besturing in je eigen game.",
    lower: "camera start dichterbij", higher: "camera start verder weg", unit: "world-units", status: FIELD_HELP_STATUSES.FULL
  },
  "game_camera.minDistance": {
    effect: "begrenst hoe ver de speler maximaal kan inzoomen.", defaultReason: "10 world-units — schema- en runtimebeginwaarde.",
    advice: "Toegestaan: 1–400 world-units; houd dit onder Max zoom. Geen bewezen voorkeursbereik; test dit in je eigen game.", lower: "dichter inzoomen mogelijk", higher: "camera blijft verder weg",
    unit: "world-units", status: FIELD_HELP_STATUSES.FULL
  },
  "game_camera.maxDistance": {
    effect: "begrenst hoe ver de speler maximaal kan uitzoomen.", defaultReason: "48 world-units — schema- en runtimebeginwaarde.",
    advice: "Toegestaan: 2–400 world-units; houd dit boven Min zoom. Geen bewezen voorkeursbereik; test dit in je eigen game.", lower: "minder overzicht", higher: "meer overzicht",
    unit: "world-units", status: FIELD_HELP_STATUSES.FULL
  },
  "game_minimap_hud.startDistance": {
    effect: "bepaalt hoeveel world-units de minimap bij openen rond de speler toont.",
    defaultReason: "120 world-units — wordt door minimapview en runtime als startafstand gebruikt.",
    advice: "Toegestaan: 5–10000 world-units. Geen bewezen voorkeursbereik; stem af op zonegrootte.",
    lower: "meer detail, kleiner gebied", higher: "meer gebied, minder detail", unit: "world-units", status: FIELD_HELP_STATUSES.FULL
  },
  "game_minimap_hud.fogChunkSize": {
    effect: "bepaalt de wereldgrootte van één opgeslagen fog-of-warcel.",
    defaultReason: "24 world-units — gedeelde server/clientfallback voor fogcellen.",
    advice: "Toegestaan: 1–1000 world-units. Geen bewezen voorkeursbereik; kleinere cellen geven fijnere maar zwaardere voortgang.",
    lower: "fijnere revealcellen", higher: "grovere revealcellen", unit: "world-units per cel", status: FIELD_HELP_STATUSES.FULL
  },
  "game_minimap_hud.revealRadius": {
    effect: "bepaalt hoeveel fogcellen rond de speler als ontdekt worden gemarkeerd.",
    defaultReason: "3 cellen — gedeelde server/clientfallback.",
    advice: "Toegestaan: 0–64 cellen. Geen bewezen voorkeursbereik; beoordeel dit samen met Cell size.",
    lower: "kleiner onthuld gebied", higher: "groter onthuld gebied", unit: "cellen", status: FIELD_HELP_STATUSES.FULL
  }
});

function clean(value) {
  return String(value === null || value === undefined ? "" : value).replace(/\s+/g, " ").trim();
}

function humanize(value) {
  return clean(value).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_:-]+/g, " ").toLowerCase();
}

function shownValue(value) {
  if (value === undefined) return "geen vaste schema-default";
  if (value === null || value === "") return "leeg";
  if (value === true) return "aan";
  if (value === false) return "uit";
  if (Array.isArray(value)) return value.length ? JSON.stringify(value) : "lege lijst";
  if (value && typeof value === "object") return Object.keys(value).length ? JSON.stringify(value) : "leeg object";
  return String(value);
}

function unitFor(key, field) {
  const text = (key + " " + (field.label || "")).toLowerCase();
  if (/basispoints/.test(text)) return "basispunten";
  if (/milliseconds|\bms\b/.test(text)) return "ms";
  if (/seconds|second/.test(text)) return "seconden";
  if (/\bhz\b|ratehz/.test(text)) return "Hz";
  if (/degrees|\bdeg\b|angle|rotation|pitch|yaw|facing|direction/.test(text)) return "graden";
  if (/percent|percentage|opacity|strength|quality/.test(text)) return "%/factor";
  if (/price|minor|balance|fee/.test(text)) return "minor currency units";
  if (/pixel|\bpx\b|fontsize|zindex/.test(text)) return "px/laagwaarde";
  if (/multiplier|\bx\b/.test(text)) return "×";
  if (/count|amount|quantity|maxalive|slots|entries|stacks|rank|level|priority|order|version/.test(text)) return "aantal";
  if (/distance|radius|range|width|depth|height|spacing|offset|position|^x$|^y$|^z$/.test(text)) return "world-units";
  if (/speed/.test(text)) return "world-units per seconde";
  return "schema-eenheden";
}

function effectFor(nodeType, key, field, nodeLabel) {
  const subject = clean(nodeLabel || nodeType);
  const label = clean(field.label || humanize(key));
  if (field.type === "identity" || /(?:^|_)(?:id|version)$/i.test(key)) return "identificeert deze " + subject + " stabiel voor references en publicatie.";
  if (/displayName|speakerName|nameTemplate|title|label/.test(key)) return "bepaalt de naam die Kevin of de speler voor deze " + subject + " ziet.";
  if (/description|summary|instruction|prompt|message|loadingText|fallbackText|text$/.test(key)) return "bepaalt de zichtbare tekst van " + label + " voor deze " + subject + ".";
  if (/tag/i.test(key)) return "labelt deze " + subject + " zodat filters, regels of zoekfuncties hem kunnen herkennen.";
  if (field.type === "reference" || field.type === "referenceList") return "kiest welke " + humanize(label) + " deze " + subject + " gebruikt.";
  if (field.type === "asset") return "kiest de asset die deze " + subject + " voor " + humanize(label) + " gebruikt.";
  if (/^x$|centerX|originX|targetX/.test(key)) return "plaatst " + subject + " op de horizontale X-as.";
  if (/^y$|centerY|originY|targetY/.test(key)) return "plaatst " + subject + " op hoogte Y.";
  if (/^z$|centerZ|originZ|targetZ/.test(key)) return "plaatst " + subject + " op de horizontale Z-as.";
  if (/radius/i.test(key)) return "bepaalt de straal waarbinnen " + subject + " dit gedrag toepast.";
  if (/range|distance/i.test(key)) return "bepaalt de afstand die " + subject + " voor " + humanize(label) + " gebruikt.";
  if (/width|depth|height|size/i.test(key)) return "bepaalt de afmeting " + humanize(label) + " van " + subject + ".";
  if (/speed|rate/i.test(key)) return "bepaalt hoe snel " + subject + " dit gedrag uitvoert.";
  if (/delay|duration|timeout|interval|cooldown|fade/i.test(key)) return "bepaalt hoe lang " + humanize(label) + " bij " + subject + " duurt.";
  if (/count|amount|quantity|maxAlive|stock|capacity|slots|entries|stacks/i.test(key)) return "bepaalt de hoeveelheid voor " + humanize(label) + " bij " + subject + ".";
  if (/multiplier|strength|opacity|chance|percent|weight/i.test(key)) return "schaalt de invloed van " + humanize(label) + " op " + subject + ".";
  if (field.type === "boolean") return "schakelt " + humanize(label) + " voor " + subject + " aan of uit.";
  if (field.type === "select") return "kiest de werkwijze voor " + humanize(label) + " bij " + subject + ".";
  if (field.type === "number") return "stelt " + humanize(label) + " voor " + subject + " in.";
  if (field.type === "json" || field.type === "formula") return "legt de gestructureerde regels voor " + humanize(label) + " bij " + subject + " vast.";
  return "bepaalt " + humanize(label) + " voor deze " + subject + ".";
}

function defaultReasonFor(field, effect) {
  const value = shownValue(field.default);
  if (field.type === "reference" || field.type === "referenceList") return value + " — een koppeling wordt pas geldig nadat de bedoelde definitie bestaat.";
  if (field.type === "identity") return value + " — geldige technische begin-ID; maak hem uniek voordat andere nodes ernaar verwijzen.";
  if (field.type === "boolean") return value + " — schema-beginstand; " + clean(effect).replace(/^./, function (c) { return c.toLowerCase(); });
  return value + " — geldige schema-startwaarde; code bewijst hiervoor geen algemene ontwerpvoorkeur.";
}

function numericAdvice(key, field, unit) {
  const bounds = field.min !== undefined || field.max !== undefined
    ? "Toegestaan: " + shownValue(field.min) + "–" + shownValue(field.max) + " " + unit + ". "
    : "";
  return bounds + "Geen bewezen voorkeursbereik; test dit in je eigen game.";
}

function lowerHigher(key, field) {
  const label = humanize(field.label || key);
  if (/opacity|strength|chance|weight|multiplier/.test(key.toLowerCase())) return { lower: "minder invloed", higher: "meer invloed" };
  if (/delay|duration|timeout|interval|cooldown/.test(key.toLowerCase())) return { lower: "kortere tijd", higher: "langere tijd" };
  if (/speed|rate/.test(key.toLowerCase())) return { lower: "langzamer/minder vaak", higher: "sneller/vaker" };
  if (/count|amount|quantity|stock|capacity|max|size|width|depth|height|radius|range|distance/.test(key.toLowerCase())) return { lower: "minder of kleiner " + label, higher: "meer of groter " + label };
  return { lower: "lagere " + label, higher: "hogere " + label };
}

function choiceLine(field) {
  const options = Array.isArray(field.options) ? field.options : [];
  if (!options.length && field.dynamicOptions) return "Keuzes komen uit " + field.dynamicOptions + "; kies alleen een beschikbare waarde.";
  return options.map(function (option) {
    const value = option && typeof option === "object" ? option.value : option;
    const label = option && typeof option === "object" ? (option.label || option.value) : option;
    const meaning = OPTION_MEANINGS[String(value)] || (clean(label) !== clean(value) ? clean(label) : "kiest " + humanize(value));
    return clean(label) + " = " + meaning;
  }).join("; ") + ".";
}

function referenceLine(field) {
  const kinds = Array.isArray(field.referenceKinds) ? field.referenceKinds : [];
  const names = kinds.length ? kinds.map(humanize).join("/") : "passende definitie";
  const places = Array.from(new Set(kinds.map(function (kind) { return REFERENCE_PLACES[kind]; }).filter(Boolean)));
  const location = places.length ? places.join(" of ") : "de bijbehorende authoringroute";
  return "Kies " + names + " uit " + location + ". Leeg betekent: geen koppeling; alleen een bewezen compiler/runtimefallback kan dat vervangen.";
}

function isTechnical(nodeType, def, field) {
  return field.type === "identity" || def?.system || def?.internal || def?.hidden || /(?:_output|_registry)$/.test(nodeType)
    || ["group", "graph_frame", "constant_value", "global_value_definition", "tag_definition", "text_template", "localization_entry", "value_formula", "curve_lookup", "legacy_world_adapter", "world_assembly", "game_output"].includes(nodeType);
}

function statusFor(nodeType, key, def, field) {
  if (isTechnical(nodeType, def, field)) return FIELD_HELP_STATUSES.TECHNICAL;
  if (PROVEN_INACTIVE_NODE_TYPES.has(nodeType) || PROVEN_INACTIVE_FIELDS.has(nodeType + "." + key)
    || PROVEN_INACTIVE_KEYS.has(key) || /later|nog niet|future|metadata voor latere/i.test(field.help || "")) return FIELD_HELP_STATUSES.INACTIVE;
  return FULL_RUNTIME_NODE_TYPES.has(nodeType) ? FIELD_HELP_STATUSES.FULL : FIELD_HELP_STATUSES.COMPILED;
}

function buildEntry(nodeType, key, field, def) {
  const effect = effectFor(nodeType, key, field, def?.label);
  const unit = field.type === "number" ? unitFor(key, field) : "";
  const direction = field.type === "number" ? lowerHigher(key, field) : {};
  const entry = {
    nodeType, fieldKey: key, label: clean(field.label || key), type: field.type || "waarde",
    effect, defaultReason: defaultReasonFor(field, effect),
    advice: field.type === "number" ? numericAdvice(key, field, unit) : "Kies dit op basis van het concrete ontwerp van deze " + clean(def?.label || nodeType) + ".",
    unit, lower: direction.lower, higher: direction.higher,
    choices: field.type === "select" ? choiceLine(field) : "",
    boolean: field.type === "boolean" ? "Aan: " + effect + " Uit: dit gedrag wordt niet aangevraagd." : "",
    reference: field.type === "reference" || field.type === "referenceList" ? referenceLine(field) : "",
    status: statusFor(nodeType, key, def, field), technical: isTechnical(nodeType, def, field), source: "semantic-registry"
  };
  return Object.assign(entry, GOLDEN_OVERRIDES[nodeType + "." + key] || {});
}

export function createSemanticFieldHelpRegistry(nodeTypes) {
  if (nodeTypes && typeof nodeTypes === "object" && REGISTRY_CACHE.has(nodeTypes)) return REGISTRY_CACHE.get(nodeTypes);
  const entries = new Map();
  for (const [nodeType, def] of Object.entries(nodeTypes || {})) {
    for (const [key, field] of Object.entries(def?.fields || {})) {
      if (!field || field.hidden) continue;
      entries.set(nodeType + "." + key, buildEntry(nodeType, key, field, def));
    }
  }
  if (nodeTypes && typeof nodeTypes === "object") REGISTRY_CACHE.set(nodeTypes, entries);
  return entries;
}

export function semanticFieldHelpEntry(registry, nodeType, key) {
  return registry instanceof Map ? registry.get(nodeType + "." + key) || null : null;
}

export function formatSemanticFieldHelp(entry, field) {
  if (!entry) return "";
  const lines = [entry.label, "Doet: " + entry.effect, "Standaard: " + entry.defaultReason, "Advies: " + entry.advice];
  if (field.type === "number") lines.push("Lager: " + entry.lower + ". Hoger: " + entry.higher + ".");
  else if (field.type === "select") lines.push("Keuzes: " + entry.choices);
  else if (field.type === "boolean") lines.push(entry.boolean);
  else if (field.type === "reference" || field.type === "referenceList") lines.push("Koppeling: " + entry.reference);
  lines.push("Status: " + entry.status + (entry.status === FIELD_HELP_STATUSES.INACTIVE ? " — deze waarde wordt opgeslagen, maar beïnvloedt de game nog niet." : "."));
  lines.push("Techniek: " + entry.nodeType + "." + entry.fieldKey + " · " + entry.type + ".");
  return lines.join("\n");
}

export function semanticFieldHelpCoverage(nodeTypes, registry = createSemanticFieldHelpRegistry(nodeTypes)) {
  const missing = [];
  const genericOnly = [];
  let total = 0;
  let semantic = 0;
  let technical = 0;
  let inactive = 0;
  let noProvenRange = 0;
  for (const [nodeType, def] of Object.entries(nodeTypes || {})) {
    for (const [key, field] of Object.entries(def?.fields || {})) {
      if (!field || field.hidden) continue;
      total += 1;
      const entry = semanticFieldHelpEntry(registry, nodeType, key);
      if (!entry) {
        missing.push(nodeType + "." + key);
        continue;
      }
      const text = formatSemanticFieldHelp(entry, field);
      if (entry.source !== "semantic-registry" || !text.includes("Doet:") || !text.includes("Status:") || /Pas deze waarde aan wanneer dit gedrag/.test(text)) {
        genericOnly.push(nodeType + "." + key);
        continue;
      }
      semantic += 1;
      if (entry.status === FIELD_HELP_STATUSES.TECHNICAL) technical += 1;
      if (entry.status === FIELD_HELP_STATUSES.INACTIVE) inactive += 1;
      if (field.type === "number" && /Geen bewezen voorkeursbereik/.test(entry.advice || "")) noProvenRange += 1;
    }
  }
  return { total, semantic, technical, inactive, noProvenRange, missing, genericOnly };
}
