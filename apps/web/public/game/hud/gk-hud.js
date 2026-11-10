// Stap 4 (HUD): het nieuwe game-scherm als één geheel.
// - Altijd in beeld: portret met level, levens, XP-lijntje, één quest-regel, minimap en de ronde knoppen.
// - Eén paneel met tabbladen (tas, uitrusting, quests, geld, characters, instellingen, uitloggen) in drie
//   standen: dicht, smal (alleen iconen) en open. Liggend rechts, staand onderin; het spelbeeld schuift mee.
// - Praten, handelen en maken zijn tijdelijke standen bovenop het paneel. Daarna (en na een gevecht of een
//   herlaad) sta je weer precies waar je was: zelfde paneel, tabblad, filter, item en scrollplek.
// Dit bestand tekent alleen. Alle spelregels blijven op de server; game.js geeft de data en de acties (api).
import { ICON_PATHS } from "./gk-icon-paths.js?v=20261110-fase5b";
import { createHudMinimap } from "./gk-minimap.js?v=20261108-portals3";
import { formatDuration } from "../../shared/effect-math.js?v=20261102-heal2";

const STORE_KEY = "gk:hud:v1";
const SVG_NS = "http://www.w3.org/2000/svg";
// Fase 5: slepen van een vaardigheid uit het boek naar vak 2 of 3.
const SKILL_MIME = "text/gk-skill";

// Kleurverlopen voor de iconen (boven licht, onder donker), zodat de silhouetten op game-iconen lijken.
const THEMES = {
  leather: ["#ffc36e", "#9a4a17"], steel: ["#f4f8fc", "#76869a"], parchment: ["#fff0c4", "#c18a4e"], gold: ["#ffe98a", "#c4820c"],
  arcane: ["#e3b6ff", "#7436cf"], wood: ["#eab06c", "#84461f"], potion: ["#ff9a9a", "#c3162e"], food: ["#ffd796", "#c26a19"],
  gem: ["#a8f6ff", "#2482d6"], fire: ["#ffe07a", "#e2401a"], skin: ["#ffe3c2", "#cf925a"], stone: ["#e8ecf0", "#848e99"],
  leaf: ["#c1f78a", "#3a9327"], heal: ["#b0ffc0", "#1f9e55"], blood: ["#ff9090", "#c0122a"], plain: ["#ffffff", "#c6d0de"],
  sand: ["#ffeab0", "#c48f34"], sky: ["#bfe4ff", "#2f7fd6"], mana: ["#a6dcff", "#1f5fd6"], ice: ["#e6f8ff", "#58a9d8"]
};
const ICON_THEME = {
  knapsack: "leather", "visored-helm": "steel", "scroll-unfurled": "parchment", "two-coins": "gold", "pointy-hat": "arcane", cog: "steel",
  "exit-door": "wood", chest: "wood", broadsword: "steel", "round-bottom-flask": "potion", "wood-pile": "wood", key: "gold",
  "cardboard-box": "wood", sparkles: "arcane", bread: "food", barbute: "steel", "chest-armor": "steel", gauntlet: "steel", "leg-armor": "steel",
  "leather-boot": "leather", "round-shield": "wood", "gem-pendant": "gem", ring: "gold", "crossed-swords": "fire", hand: "skin", talk: "plain",
  grab: "skin", "wood-axe": "wood", mining: "stone", "herbs-bundle": "leaf", tombstone: "stone", "heart-plus": "heal", hearts: "blood",
  "checked-shield": "steel", healing: "heal", "star-medal": "gold", "round-star": "gold", shop: "gold", "anvil-impact": "steel",
  "hammer-drop": "steel", scales: "gold", cancel: "plain", "check-mark": "heal", compass: "gold", "musical-notes": "arcane", speaker: "plain",
  "speaker-off": "plain", resize: "plain", "trash-can": "blood", "position-marker": "gold", crosshair: "fire", hourglass: "sand", info: "sky",
  person: "plain", crown: "gold", "stone-pile": "stone", ore: "stone", minerals: "gem", meat: "blood", "cheese-wedge": "gold",
  "water-drop": "mana", "treasure-map": "parchment", expand: "plain", contract: "plain", "magic-portal": "arcane", palette: "arcane",
  "three-friends": "sky", "shaking-hands": "skin",
  "chat-bubble": "sky", conversation: "plain", lips: "arcane", silenced: "blood", "paper-plane": "sky",
  // Fase 5: vaardigheden.
  "spell-book": "arcane", padlock: "steel", "magic-swirl": "arcane", "fire-ray": "fire", "shield-reflect": "steel"
};
// Kleuren van de iconen (Instellingen): "color" = elk icoon zijn eigen kleur, de rest één kleur voor alles.
const ICON_COLORS = [["color", "Kleur"], ["gold", "Goud"], ["ice", "IJs"], ["plain", "Wit"]];

const TABS = [
  { id: "bag", icon: "knapsack", title: "Tas", module: "inventory_hud", key: "KeyB" },
  { id: "gear", icon: "visored-helm", title: "Uitrusting", module: "equipment_hud", key: "KeyC" },
  // Fase 5: het vaardighedenboek (vak 1 auto-aanval, vak 2 en 3 zelf indelen).
  { id: "skills", icon: "spell-book", title: "Vaardigheden", module: "hotbar_hud", key: "KeyK" },
  { id: "quests", icon: "scroll-unfurled", title: "Quests", module: "quest_tracker_hud", key: "KeyL" },
  { id: "money", icon: "two-coins", title: "Geld", module: "wallet_hud", key: null },
  { id: "chars", icon: "pointy-hat", title: "Characters", module: null, key: "KeyP" },
  { id: "settings", icon: "cog", title: "Instellingen", module: null, key: null },
  { id: "logout", icon: "exit-door", title: "Uitloggen", module: null, key: null }
];
const FILTERS = [
  { id: "all", icon: "chest", title: "Alles" },
  { id: "equipment", icon: "broadsword", title: "Uitrusting" },
  { id: "consumable", icon: "round-bottom-flask", title: "Eten en drinken" },
  { id: "material", icon: "wood-pile", title: "Materiaal" },
  { id: "quest", icon: "key", title: "Quest" },
  { id: "misc", icon: "cardboard-box", title: "Overig" }
];
const CATEGORY_ICON = { consumable: "bread", material: "wood-pile", equipment: "broadsword", quest: "scroll-unfurled", misc: "cardboard-box", custom: "sparkles" };
const CATEGORY_LABEL = { consumable: "Eten/drinken", material: "Materiaal", equipment: "Uitrusting", quest: "Quest", misc: "Overig", custom: "Eigen" };
const RARITY_LABEL = { common: "Gewoon", uncommon: "Ongewoon", rare: "Zeldzaam", epic: "Episch", legendary: "Legendarisch", quest: "Quest" };
const SLOT_ICON = { head: "barbute", chest: "chest-armor", hands: "gauntlet", legs: "leg-armor", feet: "leather-boot", main_hand: "broadsword", off_hand: "round-shield", neck: "gem-pendant", ring: "ring" };
const RIGHT_SLOTS = new Set(["main_hand", "off_hand", "neck", "ring"]);
const ZOOMS = [30, 60, 120];
const ATTACK_RANGE_M = 25;
const DO_RANGE_M = 9;
const TALK_LEAVE_M = 6;      // zo ver weglopen sluit een gesprek
const COMBAT_MS = 6000;

const DEFAULTS = { panel: null, tab: "bag", filter: "all", scroll: {}, item: null, quest: null, done: false,
  minimap: true, zoom: 1, size: "m", music: true, combatFold: true, debug: false, icoSize: "m", icoAnim: true, icoColor: "color", map: null,
  // Alleen waarden die de speler zelf in de game wijzigt mogen een gepubliceerde
  // minimapstandaard overschrijven. Oudere opslag bevatte de hele standaardkaart,
  // waardoor latere editorwijzigingen onzichtbaar bleven.
  mapOverrides: {},
  // Eigen paneelmaat en ingeklapte lijstkoppen worden per speler onthouden.
  panelWidth: null, panelHeight: null, sectionFold: { "settings-server": true, "settings-view": true },
  // Namen boven poppetjes (2D): NPC's/vijanden/spullen, andere spelers, jijzelf.
  nameWorld: true, namePlayers: true, nameSelf: false,
  // Kevin (3-11): verdeling van het gesplitste paneel (deel voor chat/gesprek onderin), standaard precies de helft.
  dockSplit: 0.5,
  // Scherpte van de game: pixels per schermpunt (1 = standaard; hoger = scherper maar zwaarder).
  pixels: 1,
  // Healing (2-11): kleine zwevende getallen boven spelers en vijanden (aan/uit in Instellingen).
  floatNums: true,
  // null = volg de standaard die in de editor is gepubliceerd; na aanpassen geldt de keuze van deze speler.
  healthPing: null, healthTps: null, healthMspt: null, healthCpu: null, healthGpu: null, healthPacketLoss: null,
  // MMO (3-11): teamleden linksboven ingeklapt (alleen de kop "Groep 3/5").
  partyFold: false,
  // MMO stap 2 (3-11): laatst gekozen tabje in de chat.
  chatTab: "all" };
const PIXEL_STEPS = [0.7, 1, 1.5, 2];
// Kaarten: big/mini = wat je ziet per soort (ontbreekt = aan, dus een nieuwe soort staat vanzelf aan), span = meters in beeld
// op de grote kaart, bigIcon/miniIcon = grootte van de kaarticonen, rotate = minimap draait mee, pin = je eigen pin {x, z}.
// bigText/miniText = grootte van de gebiedsnamen (die zoomen ook mee met de kaart).
const MAP_STYLE_DEFAULTS = Object.freeze({
  self: { label: "Jij", color: "#ffffff", shape: "arrow" },
  npc: { label: "NPC's", color: "#ffd34d", shape: "diamond" },
  enemy: { label: "Vijanden", color: "#ff4b4b", shape: "dot" },
  resource: { label: "Grondstoffen", color: "#63d65f", shape: "dot" },
  pickup: { label: "Oppakken", color: "#8fe3ff", shape: "dot" },
  player: { label: "Spelers", color: "#4da3ff", shape: "dot" },
  party: { label: "Groepsleden", color: "#5ee07a", shape: "dot" },
  portal: { label: "Portals", color: "#c77dff", shape: "portal" },
  portal_locked: { label: "Portal: nog niet vrij", color: "#8a7d99", shape: "portal" },
  questgiver_available: { label: "Questgever: quest te halen", color: "#ffe08a", shape: "star" },
  questgiver: { label: "Questgever: geen nieuwe quest", color: "#d4a84a", shape: "star" },
  quest: { label: "Quest-doel", color: "#ffb020", shape: "star" },
  pin: { label: "Jouw pin", color: "#ff4fd8", shape: "pin" }
});
const MAP_DEFAULTS = { span: 160, bigIcon: 0.8, miniIcon: 1, bigText: 1, miniText: 1, rotate: false, pin: null, big: {}, mini: { pickup: false, resource: false } };
// Alles wat op de kaarten kan staan: [soort, meervoud (legenda), enkelvoud (naamlabel)].
const MAP_KINDS = [["self", "Jij", "Jij"], ["area", "Gebiedsnamen", "Gebied"], ["npc", "NPC's", "NPC"], ["enemy", "Vijanden", "Vijand"], ["resource", "Grondstoffen", "Grondstof"], ["pickup", "Oppakken", "Oppakken"],
  ["player", "Spelers", "Speler"], ["party", "Groepsleden", "Groepslid"], ["portal", "Portals", "Portal"], ["portal_locked", "Portal: nog niet vrij", "Portal (nog niet vrij)"],
  ["questgiver_available", "Questgever: quest te halen", "Quest te halen"], ["questgiver", "Questgever: geen nieuwe quest", "Questgever"],
  ["quest", "Quest-doel", "Quest-doel"], ["pin", "Jouw pin", "Jouw pin"]];

function mapPresentation(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  const styles = {};
  const big = { area: value.area?.showBig !== false };
  const mini = { area: value.area?.showMini !== false };
  for (const [kind, fallback] of Object.entries(MAP_STYLE_DEFAULTS)) {
    const source = value.styles?.[kind] || {};
    styles[kind] = {
      label: String(source.label || fallback.label).slice(0, 40),
      color: /^#[0-9a-f]{6}$/i.test(String(source.color || "")) ? String(source.color) : fallback.color,
      shape: String(source.shape || fallback.shape),
      // Kevin 8-11: eigen grootte per icoon (Instellingen > Minimap).
      size: Math.max(0.3, Math.min(3, num(source.size, 1))),
      namesMini: source.namesMini === true,
      namesBig: source.namesBig === true
    };
    big[kind] = source.showBig !== false;
    mini[kind] = source.showMini !== false;
  }
  return {
    minimapVisible: value.minimapVisible !== false,
    largeStartOpen: value.largeStartOpen === true,
    shape: value.shape === "square" ? "square" : "round",
    rotate: value.rotate === true,
    allowPin: value.allowPin !== false,
    clickToMove: value.clickToMove !== false,
    miniShowRegionName: value.miniShowRegionName !== false,
    bigShowRegionName: value.bigShowRegionName !== false,
    bigShowScale: value.bigShowScale !== false,
    bigShowCoordinates: value.bigShowCoordinates !== false,
    miniSizePx: Math.max(64, Math.min(320, num(value.miniSizePx, 120))),
    miniViewportPercent: Math.max(10, Math.min(40, num(value.miniViewportPercent, 22))),
    zoomLevels: Array.isArray(value.zoomLevels) && value.zoomLevels.length === 3
      ? value.zoomLevels.map(function (entry, index) { return Math.max(10, num(entry, ZOOMS[index])); }) : ZOOMS.slice(),
    defaultZoomIndex: Math.max(0, Math.min(2, Math.round(num(value.defaultZoomIndex, 1)))),
    bigSpanMeters: Math.max(30, num(value.bigSpanMeters, 160)),
    miniIconScale: Math.max(0.4, Math.min(2.5, num(value.miniIconScale, 1))),
    bigIconScale: Math.max(0.4, Math.min(2.5, num(value.bigIconScale, 0.8))),
    miniFixedIconSize: value.miniFixedIconSize !== false,
    bigFixedIconSize: value.bigFixedIconSize !== false,
    miniAreaTextScale: Math.max(0.4, Math.min(2.5, num(value.miniAreaTextScale, 1))),
    bigAreaTextScale: Math.max(0.4, Math.min(2.5, num(value.bigAreaTextScale, 1))),
    miniShowMarkerNames: value.miniShowMarkerNames === true,
    bigShowMarkerNames: value.bigShowMarkerNames === true,
    miniMarkerNameSizePx: Math.max(6, Math.min(32, num(value.miniMarkerNameSizePx, 10))),
    bigMarkerNameSizePx: Math.max(6, Math.min(40, num(value.bigMarkerNameSizePx, 12))),
    backgroundColor: /^#[0-9a-f]{6}$/i.test(String(value.backgroundColor || "")) ? String(value.backgroundColor) : "#0b1220",
    borderColor: /^#[0-9a-f]{6}$/i.test(String(value.borderColor || "")) ? String(value.borderColor) : "#b99446",
    borderWidthPx: Math.max(0, Math.min(12, num(value.borderWidthPx, 3))),
    markerNameColor: /^#[0-9a-f]{6}$/i.test(String(value.markerNameColor || "")) ? String(value.markerNameColor) : "#ffffff",
    area: {
      label: String(value.area?.label || "Gebiedsnamen").slice(0, 40),
      color: /^#[0-9a-f]{6}$/i.test(String(value.area?.color || "")) ? String(value.area.color) : "#f3e2b3"
    },
    styles, big, mini
  };
}

function mapStore(raw, authored, overrides = {}) {
  const saved = raw && typeof raw === "object" ? raw : null;
  const custom = function (key) { return overrides[key] === true; };
  const map = Object.assign({}, MAP_DEFAULTS, authored);
  map.span = custom("span") && saved && Number.isFinite(Number(saved.span)) ? Number(saved.span) : authored.bigSpanMeters;
  map.bigIcon = custom("bigIcon") && saved && Number.isFinite(Number(saved.bigIcon)) ? Number(saved.bigIcon) : authored.bigIconScale;
  map.miniIcon = custom("miniIcon") && saved && Number.isFinite(Number(saved.miniIcon)) ? Number(saved.miniIcon) : authored.miniIconScale;
  map.bigText = custom("bigText") && saved && Number.isFinite(Number(saved.bigText)) ? Number(saved.bigText) : authored.bigAreaTextScale;
  map.miniText = custom("miniText") && saved && Number.isFinite(Number(saved.miniText)) ? Number(saved.miniText) : authored.miniAreaTextScale;
  map.rotate = custom("rotate") && saved && typeof saved.rotate === "boolean" ? saved.rotate : authored.rotate;
  map.big = Object.assign({}, authored.big);
  map.mini = Object.assign({}, authored.mini);
  for (const kind of Object.keys(map.big)) if (custom("big:" + kind) && saved?.big && typeof saved.big[kind] === "boolean") map.big[kind] = saved.big[kind];
  for (const kind of Object.keys(map.mini)) if (custom("mini:" + kind) && saved?.mini && typeof saved.mini[kind] === "boolean") map.mini[kind] = saved.mini[kind];
  // Vorm, kleuren, namen en iconen zijn publiceerinstellingen en volgen dus altijd de editor.
  for (const key of ["shape", "allowPin", "miniShowRegionName", "bigShowRegionName", "bigShowScale", "bigShowCoordinates",
    "miniSizePx", "miniViewportPercent", "zoomLevels", "defaultZoomIndex", "bigSpanMeters", "miniFixedIconSize", "bigFixedIconSize",
    "miniShowMarkerNames", "bigShowMarkerNames", "miniMarkerNameSizePx", "bigMarkerNameSizePx",
    "backgroundColor", "borderColor", "borderWidthPx", "markerNameColor"]) map[key] = authored[key];
  map.styles = authored.styles;
  map.area = authored.area;
  map.pin = raw?.pin && Number.isFinite(Number(raw.pin.x)) && Number.isFinite(Number(raw.pin.z)) ? { x: Number(raw.pin.x), z: Number(raw.pin.z) } : null;
  return map;
}

function num(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function fmt(value) {
  const number = Math.round(num(value));
  return number >= 10000 ? (Math.round(number / 100) / 10) + "k" : String(number);
}

// Quest Builder stap 6: aftelklok "1:23" of "1:02:03".
function clockText(ms) {
  const total = Math.max(0, Math.ceil(num(ms) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? hours + ":" + String(minutes).padStart(2, "0") + ":" + seconds : minutes + ":" + seconds;
}
// De eindtijd op deze computer: de server stuurt hoeveel er nog over is; per stand (snapshot) 1× omgerekend.
const clockDeadlines = new WeakMap();
function clockDeadline(timer) {
  if (!timer || typeof timer !== "object") return 0;
  if (!clockDeadlines.has(timer)) clockDeadlines.set(timer, Date.now() + num(timer.leftMs));
  return clockDeadlines.get(timer);
}
// "⏱️ 1:23" (loopt, telt af via data-deadline), "⏸️ 1:23" (staat stil), of niets (geen klok, of gestopt).
function clockBadge(timer, cls) {
  if (!timer || timer.stopped) return null;
  if (timer.paused) return h("b", { class: cls + " gkPaused", text: "⏸️ " + clockText(timer.leftMs), title: "De klok staat stil" });
  const deadline = clockDeadline(timer);
  return h("b", { class: cls, "data-deadline": String(deadline), text: "⏱️ " + clockText(deadline - Date.now()), title: "Zoveel tijd heb je nog" });
}
function repeatText(quest) {
  if (!quest.repeatAt) return quest.repeatMode === "weekly" ? "↻ Volgende week weer" : quest.repeatMode === "daily" ? "↻ Morgen weer" : "Behaald";
  const at = new Date(quest.repeatAt);
  const time = String(at.getHours()).padStart(2, "0") + ":" + String(at.getMinutes()).padStart(2, "0");
  const today = at.toDateString() === new Date().toDateString();
  return "↻ Weer vanaf " + (today ? "" : at.toLocaleDateString("nl-NL", { weekday: "short" }) + " ") + time;
}

// Doelen die tellen (versla, verzamel, pak op, in je tas, breng): altijd "0 / 1" erbij, ook bij 1.
const COUNTED_GOALS = new Set(["defeat", "gather", "pickup", "collect", "deliver"]);

function h(tag, attrs, children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "text") el.textContent = value;
      else if (key === "class") el.className = value;
      else el.setAttribute(key, value === true ? "" : String(value));
    }
  }
  if (children) for (const child of children) if (child !== null && child !== undefined && child !== false) el.append(child);
  return el;
}

function ico(name, theme) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "gkIco");
  svg.setAttribute("viewBox", "0 0 512 512");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", "#gki-" + (ICON_PATHS[name] ? name : "info"));
  use.setAttribute("fill", "url(#gkg-" + (theme || ICON_THEME[name] || "plain") + ")");
  svg.appendChild(use);
  return svg;
}

function spriteMarkup() {
  const parts = ['<svg xmlns="http://www.w3.org/2000/svg" class="gkIcoSprite" aria-hidden="true" focusable="false"><defs>'];
  for (const [id, stops] of Object.entries(THEMES)) {
    parts.push('<linearGradient id="gkg-' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + stops[0] + '"/><stop offset="1" stop-color="' + stops[1] + '"/></linearGradient>');
  }
  for (const [name, body] of Object.entries(ICON_PATHS)) parts.push('<symbol id="gki-' + name + '" viewBox="0 0 512 512">' + body + "</symbol>");
  parts.push("</defs></svg>");
  return parts.join("");
}

function stripEmoji(text) {
  return String(text || "").replace(/^[\p{Extended_Pictographic}️‍\s]+/u, "").trim();
}

// Zonder eigen plaatje of model-thumbnail: een passend icoon op naam, anders op soort.
const NAME_ICONS = [
  [/brood|bread|koek|cake/i, "bread"], [/vlees|meat|ham|worst/i, "meat"], [/kaas|cheese/i, "cheese-wedge"],
  [/drank|potion|fles|elixer|elixir|sap|melk/i, "round-bottom-flask"], [/hout|wood|plank|tak|log/i, "wood-pile"],
  [/erts|ore|ijzer|iron|koper|copper|zilver|silver/i, "ore"], [/kristal|crystal|edelsteen|gem|diamant|robijn/i, "minerals"],
  [/steen|stone|rots|rock|kei/i, "stone-pile"], [/kruid|herb|bloem|flower|plant|blad|leaf|bes/i, "herbs-bundle"],
  [/brief|letter|perkament|scroll|kaart/i, "scroll-unfurled"], [/sleutel|key/i, "key"], [/zwaard|sword|mes|dolk|bijl/i, "broadsword"],
  [/schild|shield/i, "round-shield"], [/helm/i, "barbute"], [/laars|laarzen|boot|schoen/i, "leather-boot"], [/ring/i, "ring"],
  [/ketting|amulet|hanger/i, "gem-pendant"], [/handschoen|glove/i, "gauntlet"], [/broek|legging/i, "leg-armor"],
  [/harnas|armor|armour|tuniek|borst/i, "chest-armor"]
];

function nameIcon(name) {
  const text = String(name || "");
  const hit = NAME_ICONS.find(function (entry) { return entry[0].test(text); });
  return hit ? hit[1] : null;
}

function slotKey(slotId) {
  return String(slotId || "").replace(/^equipment_slot\./, "");
}

function loadStore(authored) {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}");
    const mapOverrides = raw?.mapOverrides && typeof raw.mapOverrides === "object" ? Object.assign({}, raw.mapOverrides) : {};
    return Object.assign({}, DEFAULTS, raw && typeof raw === "object" ? raw : {}, {
      minimap: mapOverrides.minimap === true && Object.prototype.hasOwnProperty.call(raw || {}, "minimap") ? raw.minimap !== false : authored.minimapVisible,
      zoom: mapOverrides.zoom === true && Object.prototype.hasOwnProperty.call(raw || {}, "zoom") ? Math.max(0, Math.min(2, Math.round(num(raw.zoom, 1)))) : authored.defaultZoomIndex,
      scroll: Object.assign({}, raw?.scroll || {}),
      sectionFold: Object.assign({}, DEFAULTS.sectionFold, raw?.sectionFold || {}),
      mapOverrides,
      map: mapStore(raw?.map, authored, mapOverrides)
    });
  } catch {
    return Object.assign({}, DEFAULTS, { minimap: authored.minimapVisible, zoom: authored.defaultZoomIndex,
      scroll: {}, sectionFold: Object.assign({}, DEFAULTS.sectionFold), mapOverrides: {}, map: mapStore(null, authored) });
  }
}

export function createGkHud(api) {
  let authoredMap = mapPresentation(typeof api.mapPresentation === "function" ? api.mapPresentation() : null);
  const store = loadStore(authoredMap);
  const ui = {
    celebrations: [],       // Kevin 6-11: Quest voltooid en Level omhoog na elkaar (niet over elkaar)
    celebrating: false,
    questFeed: [],          // Kevin 6-11: de laatste 3 questmeldingen linksonder (blijven staan, de oudste gaat eruit)
    eventFocus: "",         // Kevin 8-11: aangeklikt wereld-event (gebied op de kaart en in de questregel) zolang je niet meedoet
    eventGone: {},          // Kevin 8-11: weggeklikte wereld-events: questId -> welke keer (begintijd)
    eventOffset: 0,         // serverklok min eigen klok (zo klopt de aftelling)
    eventSnap: null,
    eventKey: "",
    story: null,            // 5-11: verhaal in het gesprek: { kind: "letter", itemId } of { kind: "started", questId }
    storyKnown: null,       // 5-11: quests die al liepen (null = nog geen stand gezien)
    storyQueue: [],         // 5-11: gebied/vanzelf-quests waarvan het verhaal nog moet komen
    focusQuest: null,       // 5-11: { questId, until } = open Menu > Quests bij deze quest zodra hij loopt
    trade: null,            // { vendorId, offerId } tijdens handelen
    craft: null,            // { stationId, recipeId } tijdens maken
    craftSearch: "",        // filter in de compacte receptenlijst
    sure: "",               // knop die een tweede tik nodig heeft (weggooien, uitloggen)
    sureTimer: 0,
    chars: null,            // laatst geladen characters-lijst
    charsAt: 0,
    charsBusy: false,
    lastHp: null,
    lastMp: null,
    effectsBase: null,      // { list, at }: wanneer de effecten binnenkwamen (voor het aftellen)
    cdBase: null,           // { map, at }: idem voor de wachttijd per item
    effectsSig: "",
    lastXp: null,
    lastLevel: null,
    lastHitAt: 0,
    combatAt: -1e9,
    toasts: [],
    sig: {},
    effective: "",
    inset: { right: 0, bottom: 0, tr: 0, tb: 0 },
    layoutAt: 0,
    mapAt: 0,
    targetsAt: 0,
    attackTarget: null,
    skillReadyAt: {},       // Fase 5: wachttijd per vaardigheid (zelf gestart)
    skillSnapAt: 0,
    skillSnapRef: null,
    doTarget: null,
    doKind: "",
    farTradeSince: 0,
    bigMap: authoredMap.largeStartOpen, // grote kaart open (M of de kaartknop)
    bigAt: 0,
    bigHits: [],            // alles op de grote kaart waar je op kunt tikken
    bigView: null,          // hoe de grote kaart nu staat (midden, meters in beeld)
    bigFocus: null,         // midden van de grote kaart (wereld x, z)
    bigFollow: true,        // de grote kaart volgt jou (tot je gaat schuiven)
    talkFor: "",            // gesprek waar talkServices bij horen
    talkServices: [],       // winkel/werkplaats van de NPC waarmee je praat
    serviceTalk: null,      // NPC zonder gesprek maar met winkel en/of werkplaats
    pendingTalk: null,      // op weg naar een NPC om te praten
    talkAnchor: null,       // waar je stond toen het gesprek begon (weglopen = sluiten)
    // MMO (3-11): groep.
    healTarget: "",         // teamlid waar genezen (2) naartoe gaat ("" = de server kiest de meest gewonde)
    menu: null,             // open spelermenu { id, name, x, y } (id "group" = menu van je groep)
    partyBusy: false,
    mateHold: null,         // lang drukken op een teamlid linksboven
    holdFired: false,       // de tik na lang drukken telt niet als tik
    farAt: 0,
    // MMO stap 2 (3-11): chat.
    chatOpen: false,
    chatLines: [],          // laatste berichten (hooguit CHAT_KEEP)
    chatUnread: 0,
    chatModeSel: "near",    // waar je naartoe typt: near | party | whisper
    chatWhisper: null,      // { id, name } aan wie je fluistert
    chatReply: null,        // wie het laatst naar jou fluisterde (/r)
    chatKeyOpen: false,     // geopend met Enter (desktop): Enter = sturen en dicht
    chatBlocksOpen: false,
    chatScrollDown: false,
    chatBig: false,         // Kevin (3-11): chat = het hele paneel (om terug te lezen)
    chatAloneAt: -1e9,
    // Kevin (3-11): chat en gesprek staan onderin het paneel; hiermee wissel je tussen de twee.
    dockPick: "chat",       // chat | talk
    lastMode: "explore",
    bubbles: new Map()      // ballonnen boven het hoofd: anker -> { el, until }
  };
  let saveTimer = 0;
  // Verbinding met de server (zelfde lampje als in de editor): groen = verbonden, oranje = bezig, rood = niet.
  let connKind = "standby";
  const CONN_LABEL = { connected: "antwoordt snel", standby: "traag of wacht op antwoord", disconnected: "geen antwoord" };
  let connTitle = "Server: " + CONN_LABEL[connKind];
  const connectionMetric = function (label) {
    return h("span", { class: "gkConnMetric gkHealth--unknown", "data-label": label },
      [h("span", { class: "gkConnLabel", text: label }), h("span", { class: "gkConnValue", text: "—" })]);
  };
  const connPing = connectionMetric("Ping");
  const connTps = connectionMetric("TPS");
  const connMspt = connectionMetric("MSPT");
  const connCpu = connectionMetric("CPU");
  const connGpu = connectionMetric("GPU");
  const connLoss = connectionMetric("Loss");
  const connMetrics = { healthPing: connPing, healthTps: connTps, healthMspt: connMspt, healthCpu: connCpu, healthGpu: connGpu, healthPacketLoss: connLoss };
  // Kevin (3-11): onder de kaartknoppen, de meetwaarden onder elkaar. Geen bolletje: de kleur van de tekst zegt het al.
  const connStatus = h("div", { class: "gkConnection", title: connTitle, role: "status", "aria-label": connTitle }, [connPing, connTps, connMspt, connCpu, connGpu, connLoss]);

  // ---- opbouw ----
  const root = h("div", { class: "gkHud", "data-panel": "rail", "data-mode": "explore", "aria-label": "Game-scherm" });
  root.innerHTML = spriteMarkup();
  const game = h("div", { class: "gkGame" });
  const vignette = h("div", { class: "gkVignette" });

  const portrait = h("button", { type: "button", class: "gkPortrait", "data-act": "tab", "data-id": "gear", title: "Uitrusting" });
  const level = h("span", { class: "gkLevel", text: "1" });
  const name = h("div", { class: "gkName gkText" });
  const hpFill = h("i");
  const hpText = h("b");
  const hp = h("div", { class: "gkHp", title: "Levens" }, [hpFill, ico("hearts"), hpText]);
  const xpFill = h("i");
  const mpFill = h("i");
  const mpText = h("b");
  const mp = h("div", { class: "gkHp gkMp", title: "Mana", hidden: true }, [mpFill, ico("water-drop"), mpText]);
  const xp = h("div", { class: "gkXp", title: "XP" }, [xpFill]);
  // Healing (2-11): icoontjes van actieve effecten (eten, drankjes, gif) met hoe lang nog.
  const effectsRow = h("div", { class: "gkEffects", hidden: true });
  const bars = h("div", { class: "gkBars" }, [name, hp, mp, xp, effectsRow]);
  const questLine = h("button", { type: "button", class: "gkQuestLine gkText", "data-act": "tab", "data-id": "quests", hidden: true });
  // Kevin 8-11: één kleine melding als je in de buurt van een wereld-event bent, met de tijd (klik = gebied op de kaart).
  const eventLine = h("div", { class: "gkEventLine gkText", hidden: true, role: "button" });
  // MMO (3-11): teamleden onder je eigen balken (tik = doel voor genezen, lang drukken of rechtsklik = menu).
  const partyBox = h("div", { class: "gkParty", hidden: true });
  const unit = h("div", { class: "gkUnit" }, [portrait, bars]);

  const mapCanvas = h("canvas", { width: "120", height: "120" });
  const mapNorth = h("div", { class: "gkMapNorth" }, [h("b", { text: "N" })]);
  const mapZoom = h("button", { type: "button", class: "gkMapZoom", "data-act": "map", title: "Minimap uitzoomen", "aria-label": "Minimap uitzoomen", text: "−" });
  const mapButton = h("div", { class: "gkMap", "data-act": "minimap-walk", role: "button", title: "Klik om hierheen te lopen" }, [mapCanvas, mapNorth, mapZoom]);
  const mapLabel = h("div", { class: "gkMapLabel gkText" });
  const fullIcon = h("span", { style: "display:contents" }, [ico("expand")]);
  const fullBtn = h("button", { type: "button", class: "gkMini", "data-act": "fullscreen", title: "Volledig scherm" }, [fullIcon]);
  const mapTools = h("div", { class: "gkMapTools" }, [
    h("button", { type: "button", class: "gkMini", "data-act": "mapcycle", title: "Grote kaart (M)" }, [ico("treasure-map"), h("span", { class: "gkKey", text: "M" })]),
    document.fullscreenEnabled ? fullBtn : null, connStatus]);
  const mapWrap = h("div", { class: "gkMapWrap" }, [mapButton, mapLabel, mapTools]);
  const minimap = createHudMinimap(mapCanvas, function (world) { return api.textureUrl ? api.textureUrl(world?.ground?.textureAssetId) : null; },
    function () { ui.mapAt = 0; if (ui.bigMap) requestBigDraw(); });

  const targetName = h("strong");
  const targetFill = h("i");
  const targetText = h("b");
  const targetFrame = h("div", { class: "gkTarget gkText", hidden: true }, [targetName, h("div", { class: "gkHp" }, [targetFill, targetText])]);
  const playerStatus = h("div", { class: "gkPlayerStatus" }, [unit, targetFrame, partyBox]);
  const toasts = h("div", { class: "gkToasts", "aria-live": "polite" });

  const attackLabel = h("span", { class: "gkActLabel" });
  // Fase 5: vak 1 = de auto-aanval van je klasse (slaat vanzelf door zolang je een doel hebt).
  const attackIcon = h("span", { style: "display:contents" }, [ico("crossed-swords")]);
  // Kevin 10-11: ook knop 1 laat zijn wachttijd zien.
  const attackCd = h("em", { class: "gkActCd", hidden: true });
  const attackBtn = h("button", { type: "button", class: "gkAct gkAct--attack", "data-act": "attack", title: "Aanvallen (1)" }, [attackIcon, attackLabel, attackCd, h("span", { class: "gkKey", text: "1" })]);
  const doLabel = h("span", { class: "gkActLabel" });
  const doIcon = h("span", { style: "display:contents" }, [ico("hand")]);
  const doBtn = h("button", { type: "button", class: "gkAct gkAct--do", "data-act": "do", title: "Doen: praten, oppakken of verzamelen (E)" }, [doIcon, doLabel, h("span", { class: "gkKey", text: "E" })]);
  const bagAct = h("button", { type: "button", class: "gkAct gkAct--bag", "data-act": "bag", title: "Tas (B)" }, [ico("knapsack")]);
  // Fase 5: vak 2 en 3 = vaardigheden die je zelf indeelt (slepen uit het 📖 boek of daar op 2/3 tikken).
  // Een genees-vaardigheid kiest zelf jou of de meest gewonde speler in de buurt (of het teamlid dat je linksboven aantikte).
  function slotButton(slot) {
    const label = h("span", { class: "gkActLabel" });
    const cd = h("em", { class: "gkActCd", hidden: true });
    const icon = h("span", { style: "display:contents" }, [ico("spell-book")]);
    const btn = h("button", { type: "button", class: "gkAct gkAct--skill gkEmpty", "data-act": "skill", "data-id": String(slot), title: "Vak " + slot, hidden: true },
      [icon, label, cd, h("span", { class: "gkKey", text: String(slot) })]);
    btn.addEventListener("dragover", function (event) {
      if (!Array.from(event.dataTransfer?.types || []).includes(SKILL_MIME)) return;
      event.preventDefault();
      btn.classList.add("gkDrop");
    });
    btn.addEventListener("dragleave", function () { btn.classList.remove("gkDrop"); });
    btn.addEventListener("drop", function (event) {
      btn.classList.remove("gkDrop");
      const abilityId = event.dataTransfer?.getData(SKILL_MIME) || "";
      if (!abilityId) return;
      event.preventDefault();
      putSkill(slot, abilityId);
    });
    return { slot, btn, label, cd, icon, sig: "" };
  }
  const slotUi = { 2: slotButton(2), 3: slotButton(3) };
  const actions = h("div", { class: "gkActions" }, [bagAct, doBtn, slotUi[3].btn, slotUi[2].btn, attackBtn]);
  // Kevin 7-11: ongelezen chat als getal op de tas (het losse chat-icoontje linksonder is weg).
  const bagUnread = h("span", { class: "gkChatUnread", hidden: true });
  const bagBtn = h("button", { type: "button", class: "gkBagBtn", title: "Tas (B)" }, [h("i", { "data-act": "bag" }, [ico("knapsack"), bagUnread]), h("em", { "data-act": "grow", text: "‹", title: "Iconen tonen" })]);

  const talk = h("div", { class: "gkTalk", hidden: true, role: "dialog" });
  const death = h("div", { class: "gkDeath", hidden: true });
  const debugSlot = h("div", { class: "gkDebugSlot" });
  // Namen boven NPC's, vijanden en items: scherpe 2D-tekst die met het doel meebeweegt (geen 3D-bordjes meer).
  const labels = h("div", { class: "gkLabels", "aria-hidden": "true" });
  const labelPool = new Map();
  // Healing (2-11): zwevende getallen (rood schade, groen genezen, blauw mana) die met speler of vijand meebewegen.
  const fxLayer = h("div", { class: "gkFxLayer", "aria-hidden": "true" });
  const floats = [];
  // MMO (3-11): uitnodiging voor een groep (Meedoen / Nee) en het spelermenu (naast je vinger of muis).
  const inviteCard = h("div", { class: "gkInvite", hidden: true, role: "dialog", "aria-live": "polite" });
  // Portals (8-11): "Reizen naar ...?" na een tik op een portal op de minimap of de grote kaart.
  const portalCard = h("div", { class: "gkInvite gkPortalAsk", hidden: true, role: "dialog", "aria-live": "polite" });
  const menuShade = h("div", { class: "gkMenuShade", hidden: true });
  const menuCard = h("div", { class: "gkMenu", hidden: true, role: "menu" });
  // MMO stap 2 (3-11): chat linksonder (boven het verbindingslampje) en ballonnen boven het hoofd van wie praat.
  const bubbleLayer = h("div", { class: "gkBubbles", "aria-hidden": "true" });
  const chatFeed = h("div", { class: "gkChatFeed", hidden: true });
  // Kevin 7-11: één stapel linksonder: questknop, ▴ Alles (uitklappen en alles terugzien), de laatste questmeldingen
  // en chat van je groep of fluisteren, en onderaan de korte meldingen (die stonden rechtsboven onder de kaart).
  const stackMore = h("button", { type: "button", class: "gkStackMore", "data-act": "stack-more", hidden: true });
  const feedStack = h("div", { class: "gkFeedStack" }, [questLine, eventLine, stackMore, chatFeed, toasts]);
  const lowLeft = h("div", { class: "gkLowLeft" }, [debugSlot]);
  const chatTabs = h("div", { class: "gkChatTabs", role: "tablist" });
  const chatLog = h("div", { class: "gkChatLog", role: "log" });
  const chatQuick = h("div", { class: "gkChatQuick" });
  const chatTo = h("button", { type: "button", class: "gkChatTo", "data-act": "chat-to" });
  const chatInput = h("input", { type: "text", class: "gkChatText", enterkeyhint: "send", autocomplete: "off", spellcheck: "true", maxlength: "160", "aria-label": "Chatbericht" });
  const chatSend = h("button", { type: "button", class: "gkChatSend", "data-act": "chat-send", title: "Versturen (Enter)" }, [ico("paper-plane")]);
  const chatBox = h("div", { class: "gkChatBox", hidden: true, role: "dialog", "aria-label": "Chat" }, [chatTabs, chatLog, chatQuick, h("div", { class: "gkChatRow" }, [chatTo, chatInput, chatSend])]);
  // Kevin (3-11): onderin de menubalk Chat en Gesprek (wisselen); ze openen onderin het paneel.
  const railUnread = h("em", { class: "gkChatUnread", hidden: true });
  const railChat = h("button", { type: "button", class: "gkTab gkTabDock", "data-act": "dock", "data-id": "chat", title: "Chat (Enter)" }, [ico("chat-bubble"), railUnread]);
  const railTalk = h("button", { type: "button", class: "gkTab gkTabDock", "data-act": "dock", "data-id": "talk", title: "Gesprek" }, [ico("talk")]);
  game.append(labels, bubbleLayer, fxLayer, playerStatus, mapWrap, bagBtn, actions, death, lowLeft, feedStack, inviteCard, menuShade, menuCard);

  // Grote kaart: noorden boven, begint ingezoomd op jou. Slepen = schuiven, scrollen/knijpen/+− = zoomen.
  // Tik op een portal = reizen, op iets anders = naam, op een lege plek = je pin. Rechts: legenda met vinkjes en schuiven.
  const bigCanvas = h("canvas", { width: "600", height: "600" });
  const bigTitle = h("strong");
  const bigLegend = h("div", { class: "gkLegend" });
  const bigTip = h("div", { class: "gkBigTip", hidden: true });
  const bigCenter = h("button", { type: "button", class: "gkMini", "data-act": "bigcenter", title: "Naar mij" }, [ico("compass")]);
  const bigTools = h("div", { class: "gkBigTools" }, [
    h("button", { type: "button", class: "gkMini", "data-act": "bigzoom", "data-id": "in", title: "Inzoomen (+)" }, [h("b", { text: "+" })]),
    h("button", { type: "button", class: "gkMini", "data-act": "bigzoom", "data-id": "out", title: "Uitzoomen (−)" }, [h("b", { text: "−" })]),
    bigCenter]);
  const bigMap = h("div", { class: "gkBigMap", hidden: true }, [h("div", { class: "gkBigCard" }, [
    h("div", { class: "gkSheetHead" }, [h("h2", null, [ico("treasure-map"), bigTitle]),
      h("button", { type: "button", class: "gkClose", "data-act": "bigmap-close", title: "Sluiten (Esc)" }, [ico("cancel")])]),
    h("div", { class: "gkBigBody" }, [h("div", { class: "gkBigCanvas" }, [bigCanvas, bigTools, bigTip]), bigLegend])])]);

  const rail = h("nav", { class: "gkRail", "aria-label": "Paneel" });
  const sheet = h("section", { class: "gkSheet" });
  // Fase 5: een vaardigheid uit het boek oppakken (slepen naar vak 2 of 3); de vakken lichten dan op.
  sheet.addEventListener("dragstart", function (event) {
    const card = event.target?.closest?.("[data-drag-skill]");
    if (!card || !event.dataTransfer) return;
    event.dataTransfer.setData(SKILL_MIME, card.dataset.dragSkill);
    event.dataTransfer.effectAllowed = "move";
    root.classList.add("gkDragSkill");
  });
  sheet.addEventListener("dragend", function () { root.classList.remove("gkDragSkill"); });
  // Paneel gesplitst: boven het tabblad (tas, quests…), onder de chat of het gesprek met een NPC.
  const dock = h("div", { class: "gkDock" }, [talk, chatBox]);
  // Aan de vrije rand van het paneel: links in liggende stand, boven in staande stand.
  const panelResize = h("div", { class: "gkPanelResize", role: "separator", "aria-label": "Paneelgrootte", title: "Sleep om het paneel groter of kleiner te maken (dubbel tikken = standaard)" }, [h("i")]);
  // Kevin (3-11): schuifje tussen boven en onder (standaard 50/50, wordt onthouden; dubbel tikken = weer 50/50).
  const splitBar = h("div", { class: "gkSplitBar", role: "separator", "aria-orientation": "horizontal", title: "Sleep om de verdeling te veranderen (dubbel tikken = half om half)" }, [h("i")]);
  const panelBody = h("div", { class: "gkPanelBody" }, [sheet, splitBar, dock]);
  const panel = h("aside", { class: "gkPanel" }, [panelResize, rail, panelBody]);
  root.append(vignette, game, panel, bigMap, portalCard);
  applyMapAppearance();
  (api.mount || document.body).append(root);
  document.documentElement.classList.add("gkHudActive");

  function applyMapAppearance() {
    root.dataset.mapshape = store.map.shape;
    root.style.setProperty("--gk-map-border", store.map.borderColor);
    root.style.setProperty("--gk-map-border-width", store.map.borderWidthPx + "px");
    root.style.setProperty("--gk-map-background", store.map.backgroundColor);
  }

  function fitMinimap() {
    const width = game.clientWidth;
    const height = game.clientHeight;
    if (!width || !height) return;
    const compact = width < 600;
    const key = [width, height, store.map.miniSizePx, store.map.miniViewportPercent, store.size, store.minimap].join("|");
    if (ui.sig.mapLayout === key) return;
    ui.sig.mapLayout = key;
    root.dataset.mapcompact = compact ? "1" : "0";
    const desired = Math.min(width, height) * store.map.miniViewportPercent / 100;
    // De pixelmaat is een harde bovengrens. Laat ook bij een hoog percentage
    // ruimte over voor portret/balken en de kaartknoppen naast de kaart.
    const toolsWidth = compact ? 0 : mapTools.getBoundingClientRect().width + 8;
    const room = Math.max(64, width - 30 - toolsWidth - 156);
    const size = Math.floor(Math.min(store.map.miniSizePx, room, Math.max(64, desired)));
    root.style.setProperty("--gk-map", size + "px");
    const rightWidth = store.minimap ? Math.max(size, compact ? mapTools.getBoundingClientRect().width : 0) + toolsWidth
      : Math.max(size, mapTools.getBoundingClientRect().width) + toolsWidth;
    root.style.setProperty("--gk-map-reserve", rightWidth + "px");
    ui.mapAt = 0;
  }

  function markMapOverride(key) {
    store.mapOverrides = Object.assign({}, store.mapOverrides || {}, { [key]: true });
  }

  // De HUD kan al nodig zijn voor de characterkeuze, dus een wereld kan later
  // binnenkomen. Pas de publicatie dan alsnog toe zonder persoonlijke keuzes die
  // de speler daarna bewust in de game maakt te verliezen.
  function setMapPresentation(raw) {
    if (!raw || typeof raw !== "object") return;
    authoredMap = mapPresentation(raw);
    store.map = mapStore(store.map, authoredMap, store.mapOverrides || {});
    if (store.mapOverrides?.minimap !== true) store.minimap = authoredMap.minimapVisible;
    if (store.mapOverrides?.zoom !== true) store.zoom = authoredMap.defaultZoomIndex;
    applyMapAppearance();
    ui.mapAt = 0;
    ui.bigAt = 0;
    ui.sig.legend = "";
    render();
    if (ui.bigMap) requestBigDraw();
  }

  // ---- opslaan ----
  function save() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () {
      try { window.localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch {}
    }, 250);
  }
  window.addEventListener("pagehide", function () {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch {}
  });

  // ---- data ----
  function data() { return api.data() || {}; }
  function healthSettingOn(id) {
    if (typeof store[id] === "boolean") return store[id];
    const key = { healthPing: "ping", healthTps: "tps", healthMspt: "mspt", healthCpu: "cpu", healthGpu: "gpu", healthPacketLoss: "packetLoss" }[id];
    return key ? data().healthDefaults?.[key] !== false : true;
  }
  function syncConnectionMetricVisibility() {
    for (const [id, element] of Object.entries(connMetrics)) element.hidden = !healthSettingOn(id);
    // Alle zes uit in Instellingen: dan ook geen leeg vakje.
    connStatus.hidden = !Object.values(connMetrics).some(function (element) { return !element.hidden; });
  }
  function has(module) {
    const modules = data().modules;
    return !modules || modules.has(module);
  }
  function catalogItem(itemId) {
    const items = data().s03?.catalog?.items || [];
    return items.find(function (item) { return item.itemId === itemId; }) || null;
  }
  function currencies() {
    const d = data();
    const amounts = new Map((d.s03?.currencies || []).map(function (row) { return [row.currencyId, num(row.amountMinor)]; }));
    return (d.s03?.catalog?.currencies || []).filter(function (c) { return c.showInPrimaryWallet !== false; })
      .map(function (c) { return Object.assign({}, c, { amount: amounts.get(c.currencyId) || 0 }); });
  }
  function currencyName(currencyId) {
    const found = (data().s03?.catalog?.currencies || []).find(function (c) { return c.currencyId === currencyId; });
    return found?.displayName || currencyId || "";
  }
  function visibleTabs() {
    return TABS.filter(function (tab) { return !tab.module || has(tab.module); });
  }
  function healthOf(s03) {
    const health = s03?.stats?.health || {};
    return { cur: num(health.current), max: num(health.max), pct: num(health.max) > 0 ? Math.max(0, Math.min(1, num(health.current) / num(health.max))) : 0 };
  }
  function manaOf(s03) {
    const mana = s03?.stats?.mana || {};
    return { cur: num(mana.current), max: num(mana.max), pct: num(mana.max) > 0 ? Math.max(0, Math.min(1, num(mana.current) / num(mana.max))) : 0 };
  }
  // ---- Kevin 8-11: wereld-events ----
  const EVENT_NEAR_M = 80;
  function worldEvents() {
    const s04 = data().s04;
    return Array.isArray(s04?.worldEvents) ? s04.worldEvents : [];
  }
  // Tijd volgens de server (de stand zegt hoe laat het daar was).
  function serverNow() {
    const s04 = data().s04;
    if (s04 && s04 !== ui.eventSnap) { ui.eventSnap = s04; ui.eventOffset = Number.isFinite(Number(s04.serverNow)) ? Number(s04.serverNow) - Date.now() : 0; }
    return Date.now() + (ui.eventOffset || 0);
  }
  // Zelfde rekensom als de server (quest-graph worldEventWindow): elke [every] minuten op de klok, [lasts] minuten lang.
  function eventState(ev, nowMs) {
    const every = Math.max(1, num(ev.every, 30)) * 60000;
    const startsAt = Math.floor(nowMs / every) * every;
    const endsAt = startsAt + Math.min(Math.max(1, num(ev.lasts, 10)) * 60000, every - 1000);
    const active = nowMs < endsAt;
    const nextAt = active ? startsAt : startsAt + every;
    return { active, startsAt, endsAt, nextAt, key: String(nextAt) };
  }
  function eventJoined(ev) {
    return Boolean(ev?.joined) && (ev.status === "active" || ev.status === "ready_to_turn_in");
  }
  function eventNear(ev) {
    const position = api.live().position;
    const center = ev.area?.center;
    if (!position || !center) return false;
    return Math.hypot(num(position.x) - num(center.x), num(position.z) - num(center.z)) - num(ev.area.radius) <= EVENT_NEAR_M;
  }
  function focusedEvent() {
    if (!ui.eventFocus) return null;
    const ev = worldEvents().find(function (entry) { return entry.questId === ui.eventFocus; });
    return ev && !eventJoined(ev) ? ev : null;
  }
  function clockAt(ms) {
    const at = new Date(ms - (ui.eventOffset || 0));
    return String(at.getHours()).padStart(2, "0") + ":" + String(at.getMinutes()).padStart(2, "0");
  }
  // Linksonder: het event in de buurt (of het aangeklikte), met hoe lang nog of wanneer het begint. Doe je mee, dan staat het in de questregel.
  function renderEventLine() {
    const nowMs = serverNow();
    // Meegedaan terwijl hij aangeklikt was: nu is het gewoon je quest (volgen).
    const focus = worldEvents().find(function (entry) { return entry.questId === ui.eventFocus; });
    if (focus && eventJoined(focus)) { ui.eventFocus = ""; api.run04("node04:track", null, { questId: focus.questId }); }
    const pick = worldEvents().filter(function (ev) { return !eventJoined(ev); }).map(function (ev) { return { ev, st: eventState(ev, nowMs) }; })
      .filter(function (entry) { return (entry.ev.questId === ui.eventFocus || eventNear(entry.ev)) && ui.eventGone[entry.ev.questId] !== entry.st.key; })
      .sort(function (a, b) { return (b.ev.questId === ui.eventFocus) - (a.ev.questId === ui.eventFocus); })[0] || null;
    // Begint of eindigt het aangeklikte event? Dan ook de questregel en de kaart bijwerken.
    const focusKey = focusedEvent() ? JSON.stringify(eventState(focusedEvent(), nowMs)) : "";
    if (focusKey !== ui.eventKey) { ui.eventKey = focusKey; ui.sig.unit = null; renderUnit(); ui.mapAt = 0; if (ui.bigMap) requestBigDraw(); }
    const text = pick ? (pick.st.active ? "bezig, nog " + clockText(pick.st.endsAt - nowMs) : "om " + clockAt(pick.st.nextAt) + " (over " + clockText(pick.st.nextAt - nowMs) + ")") : "";
    const signature = pick ? pick.ev.questId + "|" + text + "|" + (ui.eventFocus === pick.ev.questId) : "";
    if (ui.sig.event === signature) return;
    ui.sig.event = signature;
    const wasHidden = eventLine.hidden;
    eventLine.hidden = !pick;
    if (wasHidden !== eventLine.hidden) placeChat();
    if (!pick) return;
    eventLine.classList.toggle("gkEventActive", pick.st.active);
    eventLine.classList.toggle("gkEventFocus", ui.eventFocus === pick.ev.questId);
    eventLine.dataset.act = "event-focus";
    eventLine.dataset.id = pick.ev.questId;
    eventLine.title = pick.st.active ? "Wereld-event: klik voor het gebied op de kaart; loop erin om mee te doen" : "Wereld-event: klik voor het gebied op de kaart";
    eventLine.replaceChildren(h("span", { class: "gkGlobe", text: "🌍" }), h("span", { class: "gkEventName", text: pick.ev.displayName }), h("em", { text: text }),
      h("button", { type: "button", class: "gkFeedClose", "data-act": "event-close", "data-id": pick.ev.questId, title: "Weg (tot de volgende keer)", "aria-label": "Melding weg", text: "✕" }));
  }

  function trackedQuest() {
    const s04 = data().s04;
    const quest = s04?.trackedQuest || null;
    return quest && (quest.status === "active" || quest.status === "ready_to_turn_in") ? quest : null;
  }

  function assetImg(assetId, thumb) {
    const url = api.assetUrl(assetId, thumb);
    return url ? h("img", { src: url, alt: "", loading: "lazy", draggable: "false" }) : null;
  }
  function itemVisual(itemId, slotId) {
    const def = catalogItem(itemId);
    const img = assetImg(def?.iconAssetId, false) || assetImg(def?.modelAssetId, true);
    if (img) return img;
    const slot = slotKey(def?.equipSlot || slotId);
    return ico(SLOT_ICON[slot] || nameIcon(def?.displayName) || CATEGORY_ICON[def?.category] || "cardboard-box");
  }
  function currencyVisual(currencyId) {
    const found = (data().s03?.catalog?.currencies || []).find(function (c) { return c.currencyId === currencyId; });
    return assetImg(found?.iconAssetId, false) || ico("two-coins");
  }
  function coin(amount, currencyId) {
    return h("span", { class: "gkCoin" }, [currencyVisual(currencyId), h("b", { text: fmt(amount) })]);
  }

  // ---- layout: stand, oriëntatie en het spelbeeld dat meeschuift ----
  function orient() {
    const ratio = window.innerWidth / Math.max(1, window.innerHeight);
    return ratio >= 1.25 ? "land" : ratio <= 0.8 ? "port" : "square";
  }
  function mode() {
    const d = data();
    if (d.defeated) return "dead";
    if (d.dialogue || ui.serviceTalk || ui.trade || ui.craft || ui.story) return "talk";
    return "explore";
  }
  function combat(now = performance.now()) {
    return now - ui.combatAt < COMBAT_MS;
  }
  // Wat er onderin het paneel staat: "chat", "talk" (gesprek met een NPC) of niets.
  // Een nieuw gesprek komt meteen in beeld; met de knoppen onderin de menubalk wissel je.
  function dockView(currentMode) {
    const talkOn = currentMode === "talk";
    if (talkOn && ui.dockPick === "talk") return "talk";
    if (ui.chatOpen) return "chat";
    return talkOn ? "talk" : "";
  }
  // Paneel: closed | rail (alleen iconen) | open (tabblad, eventueel met chat/gesprek eronder) | dock (iconen + chat/gesprek).
  function effectivePanel(currentMode, currentOrient, dockNow) {
    // Handelen en maken blijven in Gesprek, maar wel in de bestaande splitsing:
    // het normale tabblad boven en het gesprek onder.
    if ((ui.trade || ui.craft) && dockNow === "talk") return "open";
    let panelState = store.panel || (currentOrient === "port" ? "closed" : "rail");
    if (panelState === "open" && store.combatFold && currentOrient !== "land" && combat()) panelState = "rail";
    if (dockNow && panelState !== "open") panelState = "dock";
    return panelState;
  }
  function chatShown() {
    return ui.chatOpen && root.dataset.dock === "chat";
  }
  function applyLayout() {
    const o = orient();
    const m = mode();
    if (m === "talk" && ui.lastMode !== "talk") ui.dockPick = "talk";
    ui.lastMode = m;
    const dk = dockView(m);
    const big = dk === "chat" && ui.chatBig;
    const p = effectivePanel(m, o, dk);
    const service = ui.trade ? "trade" : ui.craft ? "craft" : "";
    const key = o + "|" + m + "|" + p + "|" + store.size + "|" + (store.minimap ? 1 : 0) + "|" + dk + "|" + (big ? 1 : 0) + "|" + service;
    if (key === ui.effective) return false;
    ui.effective = key;
    root.dataset.orient = o;
    root.dataset.mode = m;
    root.dataset.panel = p;
    root.dataset.dock = dk;
    root.dataset.dockbig = big ? "1" : "0";
    root.dataset.service = service;
    root.dataset.size = store.size;
    root.dataset.minimap = store.minimap ? "on" : "off";
    applyPanelSize();
    fitMinimap();
    ui.sig.rail = "";
    ui.sig.sheet = "";
    return true;
  }
  function measureInset() {
    if (root.dataset.panel === "closed") return { right: 0, bottom: 0 };
    const rect = panel.getBoundingClientRect();
    if (!rect.width || !rect.height) return { right: 0, bottom: 0 };
    if (root.dataset.orient === "port") return { right: 0, bottom: Math.max(0, window.innerHeight - rect.top) };
    return { right: Math.max(0, window.innerWidth - rect.left), bottom: 0 };
  }

  // ---- rendering ----
  function render() {
    watchQuestStarts();
    applyLayout();
    renderUnit();
    renderParty();
    renderInvite();
    renderChat();
    if (ui.menu) renderMenu();
    renderEffects();
    renderSlots();
    renderToasts();
    renderTalk();
    renderDeath();
    renderRail();
    renderSheet();
    syncSettings();
    fitMinimap();
    placeChat();
  }

  function renderUnit() {
    const d = data();
    const s03 = d.s03;
    const health = healthOf(s03);
    const mana = manaOf(s03);
    const progression = s03?.progression || {};
    const quest = has("quest_tracker_hud") ? trackedQuest() : null;
    const step = quest?.activeStep || null;
    // Kevin 8-11: een aangeklikt wereld-event (nog niet meegedaan) staat in de questregel.
    const focusEvent = has("quest_tracker_hud") ? focusedEvent() : null;
    const focusState = focusEvent ? eventState(focusEvent, serverNow()) : null;
    // De questregel boven de chatfeed toont het eerste doel dat nog open staat.
    const objective = (step?.objectives || []).find(function (entry) { return !entry.complete && entry.needed !== false; }) || (step?.objectives || [])[0] || null;
    const questText = quest ? (step?.instruction || step?.displayName || quest.displayName) : "";
    const portraitUrl = api.assetUrl(d.player?.modelAssetId, true);
    const signature = JSON.stringify([d.player?.displayName, d.player?.className, portraitUrl, progression.level, progression.progressPercent,
      health.cur, health.max, mana.cur, mana.max, questText, objective?.currentValue, objective?.requiredValue, step?.complete, has("hud_bar"), has("xp_hud"),
      step?.timer ? [step.timer.stopped, step.timer.paused, Math.round(clockDeadline(step.timer) / 1000)] : null, quest?.startMode, focusEvent?.questId, focusState?.key, focusState?.active]);
    // Klap of genezing: zwevend getal bij de levensbalk (alleen bij echte verandering, niet bij de eerste keer).
    if (s03 && ui.lastHp !== null && health.max > 0 && health.cur !== ui.lastHp) {
      const delta = Math.round(health.cur - ui.lastHp);
      if (delta < 0 && !d.defeated) {
        ui.combatAt = performance.now();
        if (performance.now() - ui.lastHitAt > 1200) hitFeedback(-delta);
      } else if (delta > 0 && health.cur < health.max + 1) {
        // Healing (2-11): genezen als klein groen getal boven je hoofd (of bij de balk als zwevende getallen uit staan).
        if (floatsOn()) worldFloat("self", "+" + delta, "heal");
        else floatText(hp, "+" + delta, "good");
      }
    }
    if (s03) ui.lastHp = health.cur;
    // Healing (2-11): mana erbij of eraf als klein blauw getal boven je hoofd.
    if (s03 && ui.lastMp !== null && mana.max > 0 && mana.cur !== ui.lastMp && !d.defeated) {
      const deltaMp = Math.round(mana.cur - ui.lastMp);
      if (deltaMp !== 0) worldFloat("self", (deltaMp > 0 ? "+" : "") + deltaMp, "mana");
    }
    if (s03) ui.lastMp = mana.cur;
    if (s03 && ui.lastXp !== null && num(progression.xp) > ui.lastXp) floatText(xp, "+" + Math.round(num(progression.xp) - ui.lastXp) + " XP", "xp");
    if (s03 && ui.lastLevel !== null && num(progression.level, 1) > ui.lastLevel) levelUp(num(progression.level, 1));
    if (s03) { ui.lastXp = num(progression.xp); ui.lastLevel = num(progression.level, 1); }
    root.dataset.low = !d.defeated && health.max > 0 && health.pct < 0.3 ? "1" : "0";
    if (ui.sig.unit === signature) return;
    ui.sig.unit = signature;
    portrait.replaceChildren(portraitUrl ? h("img", { src: portraitUrl, alt: "" }) : ico("pointy-hat"), level);
    level.textContent = String(progression.level || 1);
    level.hidden = !has("xp_hud");
    name.replaceChildren(document.createTextNode(d.player?.displayName || "Speler"), d.player?.className ? h("small", { text: d.player.className }) : "");
    hp.hidden = !has("hud_bar") || health.max <= 0;
    hpFill.style.width = Math.round(health.pct * 100) + "%";
    hpText.textContent = fmt(health.cur) + " / " + fmt(health.max);
    mp.hidden = !has("hud_bar") || mana.max <= 0;
    mpFill.style.width = Math.round(mana.pct * 100) + "%";
    mpText.textContent = fmt(mana.cur) + " / " + fmt(mana.max);
    xp.hidden = !has("xp_hud");
    xpFill.style.width = Math.round(num(progression.progressPercent) * 100) + "%";
    xp.title = "XP: " + fmt(progression.xp) + " / " + fmt(progression.nextLevelXp);
    questLine.hidden = !quest && !focusEvent;
    if (focusEvent) {
      // Het event zelf: waar het is en hoe lang nog (of wanneer het begint). De klok loopt via data-deadline.
      questLine.classList.remove("gkDone");
      const deadline = (focusState.active ? focusState.endsAt : focusState.nextAt) - (ui.eventOffset || 0);
      questLine.replaceChildren(h("span", { class: "gkGlobe", text: "🌍" }),
        h("span", { text: focusEvent.displayName + " · " + (focusState.active ? "loop naar " + (focusEvent.area?.name || "het gebied") : "begint straks") }),
        h("em", { text: focusState.active ? "nog" : "over" }), h("b", { class: "gkQuestClock", "data-deadline": String(deadline), text: "⏱️ " + clockText(deadline - Date.now()) }));
      questLine.title = focusEvent.displayName + " (wereld-event)";
    } else if (quest) {
      const progress = objective && num(objective.requiredValue) > 1 ? fmt(objective.currentValue) + "/" + fmt(objective.requiredValue) : "";
      questLine.classList.toggle("gkDone", step?.complete === true);
      // Kevin 8-11: een wereld-event heeft het wereldbolletje.
      const icon = step?.complete ? ico("check-mark") : quest.startMode === "world" ? h("span", { class: "gkGlobe", text: "🌍" }) : ico("scroll-unfurled");
      questLine.replaceChildren(icon, h("span", { text: questText }), progress ? h("em", { text: progress }) : "",
        clockBadge(step?.timer, "gkQuestClock") || "");
      questLine.title = quest.displayName;
    }
  }

  // ---- MMO (3-11): groep ----
  function partyMates() {
    const d = data();
    const members = Array.isArray(d.party?.members) ? d.party.members : [];
    return members.filter(function (member) { return member && member.id && member.id !== d.selfId; });
  }
  function holdMs() {
    return Math.max(250, Math.min(1500, num(api.partyRules ? api.partyRules().holdMs : 500, 500)));
  }
  function barWidth(cur, max) {
    return (num(max) > 0 ? Math.round(Math.max(0, Math.min(1, num(cur) / num(max))) * 100) : 0) + "%";
  }
  function renderParty() {
    const d = data();
    const party = d.party || null;
    const mates = partyMates();
    if (ui.healTarget && !mates.some(function (mate) { return mate.id === ui.healTarget && mate.online; })) ui.healTarget = "";
    const signature = JSON.stringify([party?.partyId, party?.leaderId, d.selfId, party?.maxMembers, party?.members?.length, mates, ui.healTarget, store.partyFold, Boolean(d.s03?.healSpell)]);
    if (ui.sig.party === signature) return;
    ui.sig.party = signature;
    const show = Boolean(party) && mates.length > 0;
    partyBox.hidden = !show;
    if (!show) {
      partyBox.replaceChildren();
      return;
    }
    const compact = mates.length > 4;
    partyBox.classList.toggle("gkCompact", compact);
    const leader = Boolean(d.selfId) && party.leaderId === d.selfId;
    const head = h("button", { type: "button", class: "gkPartyHead", "data-act": "party-menu", title: leader ? "Jij bent de leider. Groep: inklappen of verlaten" : "Groep: inklappen of verlaten" },
      [ico(leader ? "crown" : "three-friends"), h("span", { text: "Groep " + party.members.length + "/" + num(party.maxMembers, party.members.length) }), h("b", { text: store.partyFold ? "▸" : "⋯" })]);
    const rows = store.partyFold ? [] : mates.map(function (mate) { return mateRow(mate, compact, Boolean(d.s03?.healSpell)); });
    partyBox.replaceChildren(head, ...rows);
    ui.farAt = 0;
  }
  function mateRow(mate, compact, canHeal) {
    const dead = mate.online && num(mate.hpMax) > 0 && num(mate.hp) <= 0;
    const url = api.assetUrl(mate.modelAssetId, true);
    const face = h("span", { class: "gkMateFace" }, [url ? h("img", { src: url, alt: "", draggable: "false" }) : ico("person"),
      dead ? h("i", { class: "gkMateDead" }, [ico("tombstone")]) : null, h("em", { text: String(mate.level || 1) })]);
    const nameLine = h("span", { class: "gkMateName" }, [mate.leader ? ico("crown") : null, h("span", { text: mate.name || "Speler" }),
      mate.className && !compact ? h("small", { text: mate.className }) : null]);
    const hpText = !mate.online ? "offline" : dead ? "verslagen" : fmt(mate.hp) + " / " + fmt(mate.hpMax);
    const hpBar = h("span", { class: "gkMateHp" }, [h("i", { style: "width:" + (mate.online ? barWidth(mate.hp, mate.hpMax) : "0%") }), h("b", { text: hpText })]);
    const mpBar = num(mate.mpMax) > 0 && !compact && mate.online ? h("span", { class: "gkMateMp" }, [h("i", { style: "width:" + barWidth(mate.mp, mate.mpMax) })]) : null;
    const className = "gkMate" + (mate.online ? "" : " gkOffline") + (dead ? " gkDead" : "") + (ui.healTarget === mate.id ? " gkOn" : "");
    const title = mate.name + (canHeal ? " (tik = doel voor genezen, lang drukken = menu)" : " (tik = menu)");
    return h("button", { type: "button", class: className, "data-act": "mate", "data-id": mate.id, "data-mate": mate.id, title },
      [face, h("span", { class: "gkMateBars" }, [nameLine, hpBar, mpBar]), ui.healTarget === mate.id ? h("span", { class: "gkMateAim" }, [ico("crosshair")]) : null]);
  }
  function markFarMates() {
    const position = api.live().position;
    const far = Math.max(10, num(api.partyRules ? api.partyRules().farMeters : 60, 60));
    for (const el of partyBox.querySelectorAll("[data-mate]")) {
      const spot = api.playerPosition ? api.playerPosition(el.dataset.mate) : null;
      const isFar = !position || !spot || Math.hypot(num(spot.x) - num(position.x), num(spot.z) - num(position.z)) > far;
      if (el.classList.contains("gkFar") !== isFar) el.classList.toggle("gkFar", isFar);
    }
  }
  function toggleHealTarget(id) {
    const mate = partyMates().find(function (entry) { return entry.id === id; });
    if (!mate) return;
    if (ui.healTarget === id) {
      ui.healTarget = "";
      toast("Genezen kiest weer zelf wie het nodig heeft.", { icon: "healing", ms: 2200 });
    } else if (!mate.online) {
      toast(mate.name + " is offline.", { icon: "three-friends", ms: 2200 });
      return;
    } else {
      ui.healTarget = id;
      toast("Genezen (2) gaat nu naar " + mate.name + ". Tik nog eens om dat uit te zetten.", { icon: "healing", ms: 2800 });
    }
    ui.sig.party = "";
    renderParty();
    if (ui.menu) renderMenu();
  }
  function partyAct(action, payload) {
    if (ui.partyBusy || !api.partyAction) return;
    ui.partyBusy = true;
    ui.sig.invite = "";
    renderInvite();
    Promise.resolve(api.partyAction(action, payload || {})).then(function (result) {
      if (result && result.message) toast(result.message, { icon: result.ok ? "three-friends" : "info", tone: result.ok ? "info" : "error", ms: 3200 });
    }).catch(function (error) {
      toast(error?.message || "Dat lukte niet.", { tone: "error" });
    }).finally(function () {
      ui.partyBusy = false;
      ui.sig.invite = "";
      render();
    });
  }

  // Uitnodiging: de nieuwste, met een balkje dat de tijd laat zien. In een groep geen uitnodigingen.
  function renderInvite(now = performance.now()) {
    const d = data();
    const list = Array.isArray(d.partyInvites) ? d.partyInvites : [];
    const invite = d.party ? null : list.filter(function (entry) { return entry && num(entry.until) > now; }).pop() || null;
    const signature = invite ? invite.inviteId + "|" + (ui.partyBusy ? 1 : 0) : "";
    if (ui.sig.invite === signature) return;
    ui.sig.invite = signature;
    inviteCard.hidden = !invite;
    if (!invite) { inviteCard.replaceChildren(); return; }
    const total = Math.max(1000, num(invite.until) - num(invite.at));
    const left = Math.max(0, num(invite.until) - now);
    const timer = h("i", { class: "gkInviteTime" });
    timer.style.transform = "scaleX(" + (left / total).toFixed(3) + ")";
    inviteCard.replaceChildren(
      h("div", { class: "gkInviteText" }, [ico("three-friends"), h("span", null, [h("b", { text: invite.fromName || "Speler" }), " nodigt je uit voor een groep"])]),
      h("div", { class: "gkInviteBtns" }, [
        h("button", { type: "button", class: "gkInviteYes", "data-act": "invite-yes", "data-id": invite.inviteId, disabled: ui.partyBusy }, [ico("check-mark"), h("span", { text: "Meedoen" })]),
        h("button", { type: "button", class: "gkInviteNo", "data-act": "invite-no", "data-id": invite.inviteId, disabled: ui.partyBusy }, [ico("cancel"), h("span", { text: "Nee" })])]),
      h("div", { class: "gkInviteBar" }, [timer]));
    window.requestAnimationFrame(function () {
      timer.style.transition = "transform " + Math.round(left) + "ms linear";
      timer.style.transform = "scaleX(0)";
    });
  }

  // Spelermenu: alleen wat nu kan (later komen fluisteren, handelen, vriend en bekijken erbij).
  function openPlayerMenu(info) {
    if (!info || !info.id) return;
    ui.sure = "";
    ui.menu = { id: String(info.id), name: String(info.name || "Speler"), x: num(info.x), y: num(info.y) };
    ui.sig.menu = "";
    renderMenu();
  }
  function closeMenu() {
    if (!ui.menu) return;
    ui.menu = null;
    renderMenu();
  }
  function menuItem(act, id, icon, label, extra, why) {
    return h("button", { type: "button", class: "gkMenuItem" + (extra ? " " + extra : ""), "data-act": act, "data-id": id || null, disabled: why ? true : null, role: "menuitem" },
      [ico(icon), h("span", null, [h("b", { text: label }), why ? h("small", { text: why }) : null])]);
  }
  function renderMenu() {
    const m = ui.menu;
    menuCard.hidden = !m;
    menuShade.hidden = !m;
    if (!m) { menuCard.replaceChildren(); ui.sig.menu = ""; return; }
    const d = data();
    const party = d.party || null;
    const members = Array.isArray(party?.members) ? party.members : [];
    const mate = members.find(function (entry) { return entry.id === m.id; }) || null;
    const canHeal = Boolean(d.s03?.healSpell);
    const blocks = chatBlocked();
    const blockedNow = m.id !== "group" && blocks.some(function (entry) { return entry.id === m.id; });
    const signature = JSON.stringify([m, party?.partyId, party?.leaderId, party?.whoCanInvite, members.length, mate, ui.healTarget, ui.sure, canHeal, d.selfId, blocks]);
    if (ui.sig.menu === signature) return;
    ui.sig.menu = signature;
    const items = [];
    let sub = "";
    if (m.id === "group") {
      if (!party) { closeMenu(); return; }
      sub = members.length + " van " + num(party.maxMembers, members.length) + " spelers";
      items.push(menuItem("party-fold", "", store.partyFold ? "expand" : "contract", store.partyFold ? "Teamleden tonen" : "Teamleden inklappen"));
      // Kevin (3-11): de leider zet uitnodigen voor de leden aan of uit; de anderen zien hoe het staat.
      const membersInvite = party.whoCanInvite !== "leader";
      items.push(menuItem("party-rule", membersInvite ? "leader" : "all", "three-friends", "Leden mogen uitnodigen: " + (membersInvite ? "aan" : "uit"), "",
        party.leaderId === d.selfId ? "" : "Alleen de leider kan dit veranderen"));
      items.push(ui.sure === "party-leave"
        ? menuItem("party-leave", "", "exit-door", "Zeker? Tik nog eens", "gkWarn")
        : menuItem("party-leave", "", "exit-door", "Groep verlaten"));
    } else if (mate) {
      sub = "Level " + (mate.level || 1) + (mate.className ? " · " + mate.className : "") + " · in jouw groep" + (mate.online ? "" : " · offline");
      if (canHeal && mate.online) items.push(menuItem("party-target", m.id, "crosshair", ui.healTarget === m.id ? "Geen doel meer" : "Doel voor genezen (2)"));
      if (mate.online && !blockedNow) items.push(menuItem("chat-whisper", m.id, "lips", "Fluisteren"));
      // Kevin 8-11: naar een teamgenoot reizen (de vrije portal die het dichtst bij hem staat).
      if (mate.online && portalList().some(function (portal) { return portal.unlocked; })) items.push(menuItem("portal-mate", m.id, "magic-portal", "Reizen naar " + (mate.name || "teamgenoot")));
      // Kevin (3-11): de leider kan iemand uit de groep zetten (twee keer tikken).
      if (party && party.leaderId === d.selfId) {
        items.push(ui.sure === "kick:" + m.id ? menuItem("party-kick", m.id, "exit-door", "Zeker? Tik nog eens", "gkWarn")
          : menuItem("party-kick", m.id, "exit-door", "Uit de groep zetten"));
      }
    } else {
      let why = "";
      if (blockedNow) why = "Je hebt deze speler geblokkeerd";
      else if (party && party.whoCanInvite === "leader" && party.leaderId !== d.selfId) why = "Alleen de leider van je groep nodigt uit";
      else if (party && members.length >= num(party.maxMembers, 99)) why = "Je groep is vol";
      items.push(menuItem("party-invite", m.id, "three-friends", "Uitnodigen voor groep", "", why));
      if (!blockedNow) items.push(menuItem("chat-whisper", m.id, "lips", "Fluisteren"));
    }
    // MMO stap 2 (3-11): blokkeren (twee keer tikken) of weer deblokkeren.
    if (m.id !== "group") {
      items.push(blockedNow ? menuItem("chat-block", m.id, "silenced", "Deblokkeren")
        : ui.sure === "block:" + m.id ? menuItem("chat-block", m.id, "silenced", "Zeker? Tik nog eens", "gkWarn")
          : menuItem("chat-block", m.id, "silenced", "Blokkeren"));
    }
    const head = h("div", { class: "gkMenuHead" }, [
      h("div", { class: "gkMenuName" }, [h("b", { text: m.name }), sub ? h("small", { text: sub }) : null]),
      h("button", { type: "button", class: "gkClose", "data-act": "menu-close", title: "Sluiten (Esc)" }, [ico("cancel")])]);
    menuCard.replaceChildren(head, ...items);
    if (!items.length) menuCard.append(h("div", { class: "gkMenuNote", text: "Meer opties (praten, handelen) komen later." }));
    // Naast de vinger of muis (niet eronder) en altijd binnen het scherm.
    const area = game.getBoundingClientRect();
    const width = menuCard.offsetWidth || 230;
    const height = menuCard.offsetHeight || 120;
    let left = m.x - area.left + 14;
    let top = m.y - area.top - height - 14;
    if (top < 8) top = m.y - area.top + 18;
    left = Math.max(8, Math.min(area.width - width - 8, left));
    top = Math.max(8, Math.min(area.height - height - 8, top));
    menuCard.style.left = Math.round(left) + "px";
    menuCard.style.top = Math.round(top) + "px";
  }
  function cancelMateHold() {
    const hold = ui.mateHold;
    if (!hold) return;
    window.clearTimeout(hold.timer);
    window.removeEventListener("pointermove", hold.onMove, true);
    window.removeEventListener("pointerup", hold.onEnd, true);
    window.removeEventListener("pointercancel", hold.onEnd, true);
    ui.mateHold = null;
  }
  function startMateHold(event, el) {
    cancelMateHold();
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const hold = { id: el.dataset.mate, pointerId: event.pointerId, x: event.clientX, y: event.clientY, timer: 0, onMove: null, onEnd: null };
    hold.onMove = function (moveEvent) {
      if (moveEvent.pointerId === hold.pointerId && Math.hypot(moveEvent.clientX - hold.x, moveEvent.clientY - hold.y) > 12) cancelMateHold();
    };
    hold.onEnd = function (endEvent) {
      if (endEvent.pointerId === hold.pointerId) cancelMateHold();
    };
    hold.timer = window.setTimeout(function () {
      if (ui.mateHold !== hold) return;
      cancelMateHold();
      ui.holdFired = true;
      window.setTimeout(function () { ui.holdFired = false; }, 700);
      try { if (typeof navigator.vibrate === "function") navigator.vibrate(15); } catch {}
      const mate = partyMates().find(function (entry) { return entry.id === hold.id; });
      openPlayerMenu({ id: hold.id, name: mate?.name || "Speler", x: hold.x, y: hold.y });
    }, holdMs());
    window.addEventListener("pointermove", hold.onMove, true);
    window.addEventListener("pointerup", hold.onEnd, true);
    window.addEventListener("pointercancel", hold.onEnd, true);
    ui.mateHold = hold;
  }

  // ---- MMO stap 2 (3-11): chat linksonder en ballonnen boven het hoofd ----
  const CHAT_TABS = [
    { id: "all", icon: "conversation", title: "Alles" },
    { id: "near", icon: "chat-bubble", title: "Buurt" },
    { id: "party", icon: "three-friends", title: "Groep" },
    { id: "whisper", icon: "lips", title: "Fluister" },
    { id: "system", icon: "info", title: "Systeem" }
  ];
  const CHAT_KEEP = 60;          // zoveel regels onthouden (zuinig op de oude laptop)
  const CHAT_FEED_MS = 12000;    // zo lang blijft een nieuw bericht linksonder staan als de chat dicht is
  // Kevin 6-11: questmeldingen blijven linksonder staan (je keek even weg); hooguit 3, een nieuwe duwt de oudste weg. Klik = naar de quest.
  const QUEST_FEED_MAX = 3;
  // Kevin 7-11: in de stapel linksonder alleen chat voor jou (groep, fluisteren) en systeemregels; buurtchat alleen in het paneel.
  const FEED_CHANNELS = new Set(["party", "whisper", "system"]);
  const FEED_HISTORY_MAX = 20;   // uitgeklapt: zoveel regels terugzien
  function chatRulesNow() {
    const rules = typeof api.chatRules === "function" ? api.chatRules() || {} : {};
    return { maxLength: num(rules.maxLength, 160), bubbleSeconds: num(rules.bubbleSeconds, 6), quick: Array.isArray(rules.quick) ? rules.quick : [] };
  }
  function chatBlocked() {
    const list = data().chatBlocks;
    return Array.isArray(list) ? list : [];
  }
  function chatInParty() {
    const party = data().party;
    return Boolean(party && Array.isArray(party.members) && party.members.length > 1);
  }
  function chatMode() {
    if (ui.chatModeSel === "whisper" && ui.chatWhisper) return "whisper";
    if (ui.chatModeSel === "party" && chatInParty()) return "party";
    return "near";
  }
  function coarsePointer() {
    try { return window.matchMedia("(pointer: coarse)").matches; } catch { return false; }
  }
  function chatAddLine(entry) {
    ui.chatLines.push(entry);
    if (ui.chatLines.length > CHAT_KEEP) ui.chatLines.splice(0, ui.chatLines.length - CHAT_KEEP);
    renderChat();
    renderChatFeed();
  }
  // Een bericht van de server ({ id, channel, fromId, fromName, toId?, toName?, text, at }); heard = hoeveel het hoorden (alleen bij je eigen bericht).
  function chatMessage(message, heard) {
    if (!message || typeof message.text !== "string") return;
    const selfId = data().selfId;
    const mine = Boolean(selfId) && String(message.fromId || "") === String(selfId);
    const entry = { id: String(message.id || Math.random()), channel: ["near", "party", "whisper"].includes(message.channel) ? message.channel : "near",
      fromId: String(message.fromId || ""), fromName: String(message.fromName || "Speler"), toId: message.toId ? String(message.toId) : "",
      toName: message.toName ? String(message.toName) : "", text: message.text, mine, at: performance.now(), time: num(message.at, Date.now()) };
    if (ui.chatLines.some(function (line) { return line.id === entry.id; })) return;
    if (entry.channel === "whisper" && !mine) ui.chatReply = { id: entry.fromId, name: entry.fromName };
    // Fluisteren op naam: vanaf nu op id (de server vond de speler).
    if (entry.channel === "whisper" && mine && ui.chatWhisper && !ui.chatWhisper.id && entry.toName.toLowerCase() === String(ui.chatWhisper.name || "").toLowerCase()) {
      ui.chatWhisper = { id: entry.toId, name: entry.toName };
    }
    if (!mine && !chatShown()) ui.chatUnread += 1;
    chatAddLine(entry);
    if (entry.channel === "near") chatBubble(mine ? "self" : "player:" + entry.fromId, entry.text);
    if (mine && entry.channel === "near" && heard === 0 && performance.now() - ui.chatAloneAt > 30000) {
      ui.chatAloneAt = performance.now();
      chatNotice("Niemand in de buurt hoort je. Probeer Groep of Fluisteren.", "", true);
    }
  }
  // Een melding in het tabje Systeem (quiet = geen toast, bijvoorbeeld omdat game.js al een toast liet zien).
  // questId: een melding over een quest (blijft linksonder staan, klik = naar die quest).
  function chatNotice(text, tone, quiet, questId = null) {
    if (!text) return;
    const line = { id: "n" + Math.random().toString(36).slice(2), channel: "system", tone: tone || "", text: String(text), at: performance.now(), time: Date.now(),
      quest: questId !== null && questId !== undefined, questId: questId ? String(questId) : "" };
    if (line.quest) ui.questFeed = ui.questFeed.concat(line).slice(-QUEST_FEED_MAX);
    chatAddLine(line);
    if (!quiet && !chatShown()) toast(text, { tone: tone === "error" ? "error" : "info", icon: "chat-bubble", ms: 3500 });
  }
  function chatShows(line, tab, blockedIds) {
    if (line.fromId && blockedIds.has(line.fromId)) return false;
    if (tab === "all") return true;
    if (line.channel === "system") return tab === "system" || line.tone === "error";
    return line.channel === tab;
  }
  function chatLineEl(line) {
    const stamp = new Date(line.time || Date.now());
    const title = String(stamp.getHours()).padStart(2, "0") + ":" + String(stamp.getMinutes()).padStart(2, "0");
    if (line.channel === "system") {
      return h("div", { class: "gkChatLine gkCh--system" + (line.tone === "error" ? " gkCh--error" : "") + (line.quest ? " gkCh--quest" : ""), title }, [h("span", { text: line.text })]);
    }
    let who = line.fromName + ":";
    let whoId = line.fromId;
    let whoName = line.fromName;
    if (line.channel === "party") who = "[Groep] " + line.fromName + ":";
    if (line.channel === "whisper") {
      if (line.mine) { who = "[Aan " + (line.toName || "?") + "]"; whoId = line.toId; whoName = line.toName; }
      else who = "[Van " + line.fromName + "]";
    }
    const selfId = String(data().selfId || "");
    const nameEl = whoId && whoId !== selfId
      ? h("button", { type: "button", class: "gkChatWho", "data-act": "chat-name", "data-id": whoId, "data-name": whoName || "Speler", text: who })
      : h("b", { class: "gkChatWho", text: who });
    return h("div", { class: "gkChatLine gkCh--" + line.channel + (line.mine ? " gkMine" : ""), title }, [nameEl, h("span", { text: " " + line.text })]);
  }
  function chatEmptyText(tab) {
    if (tab === "party") return chatInParty() ? "Nog geen groepsberichten." : "Je zit niet in een groep. Lang drukken (of rechtsklik) op een speler > Uitnodigen.";
    if (tab === "whisper") return "Fluisteren: tik op een naam in de chat, of lang drukken (of rechtsklik) op een speler > Fluisteren. Of typ: /f naam bericht";
    if (tab === "system") return "Hier komen meldingen van de groep en de chat.";
    return "Nog geen berichten. Typ iets, of tik op een snel bericht.";
  }
  function renderChat() {
    const open = chatShown();
    if (open) ui.chatUnread = 0;
    chatBox.hidden = !open;
    const unreadText = ui.chatUnread > 9 ? "9+" : String(ui.chatUnread);
    for (const [button, badge] of [[bagBtn, bagUnread], [railChat, railUnread]]) {
      button.classList.toggle("gkOn", open);
      badge.hidden = open || ui.chatUnread <= 0;
      if (badge.textContent !== unreadText) badge.textContent = unreadText;
    }
    if (!open) { ui.sig.chat = ""; ui.chatScrollDown = true; chatBox.classList.remove("gkChatTop"); return; }
    const blocks = chatBlocked();
    const blockedIds = new Set(blocks.map(function (entry) { return entry.id; }));
    const tab = CHAT_TABS.some(function (entry) { return entry.id === store.chatTab; }) ? store.chatTab : "all";
    const mode = chatMode();
    const rules = chatRulesNow();
    const last = ui.chatLines[ui.chatLines.length - 1];
    const signature = JSON.stringify([tab, mode, ui.chatWhisper, ui.chatBlocksOpen, ui.chatBig, blocks, ui.chatLines.length, last?.id, chatInParty(), rules.quick, rules.maxLength, data().selfId]);
    if (ui.sig.chat === signature) return;
    ui.sig.chat = signature;
    const tabs = CHAT_TABS.map(function (entry) {
      const on = entry.id === tab && !ui.chatBlocksOpen;
      return h("button", { type: "button", class: "gkChatTab" + (on ? " gkOn" : ""), "data-act": "chat-tab", "data-id": entry.id, role: "tab", "aria-selected": on ? "true" : "false", title: entry.title },
        [ico(entry.icon), h("span", { text: entry.title })]);
    });
    if (blocks.length) {
      tabs.push(h("button", { type: "button", class: "gkChatTab gkChatBlk" + (ui.chatBlocksOpen ? " gkOn" : ""), "data-act": "chat-blocks", title: "Geblokkeerde spelers" },
        [ico("silenced"), h("span", { text: String(blocks.length) })]));
    }
    tabs.push(h("button", { type: "button", class: "gkClose gkChatSize", "data-act": "chat-size", title: ui.chatBig ? "Terug: chat onderin het paneel" : "Chat over het hele paneel (om terug te lezen)" },
      [ico(ui.chatBig ? "contract" : "expand")]));
    tabs.push(h("button", { type: "button", class: "gkClose", "data-act": "chat-close", title: "Chat dicht (Esc)" }, [ico("cancel")]));
    chatTabs.replaceChildren(...tabs);
    const nearBottom = chatLog.scrollTop + chatLog.clientHeight >= chatLog.scrollHeight - 40;
    if (ui.chatBlocksOpen && blocks.length) {
      chatLog.replaceChildren(h("div", { class: "gkChatNote", text: "Deze spelers zie je niet in de chat, en ze kunnen je niet uitnodigen of fluisteren." }),
        ...blocks.map(function (entry) {
          return h("div", { class: "gkChatBlockRow" }, [h("b", { text: entry.name || "Speler" }),
            h("button", { type: "button", class: "gkChatUnblock", "data-act": "chat-unblock", "data-id": entry.id }, [ico("check-mark"), "Deblokkeren"])]);
        }));
    } else {
      if (ui.chatBlocksOpen) ui.chatBlocksOpen = false;
      const lines = ui.chatLines.filter(function (line) { return chatShows(line, tab, blockedIds); }).map(chatLineEl);
      chatLog.replaceChildren(...(lines.length ? lines : [h("div", { class: "gkChatNote", text: chatEmptyText(tab) })]));
      if (nearBottom || ui.chatScrollDown) { chatLog.scrollTop = chatLog.scrollHeight; ui.chatScrollDown = false; }
    }
    chatQuick.hidden = !rules.quick.length;
    chatQuick.replaceChildren(...rules.quick.map(function (text, index) {
      return h("button", { type: "button", class: "gkChatChip", "data-act": "chat-quick", "data-id": String(index), text });
    }));
    const whisperName = ui.chatWhisper?.name || "?";
    chatTo.className = "gkChatTo gkCh--" + mode;
    chatTo.title = "Tik om te kiezen: Buurt, Groep of Fluisteren";
    chatTo.replaceChildren(ico(mode === "party" ? "three-friends" : mode === "whisper" ? "lips" : "chat-bubble"),
      h("span", { text: mode === "party" ? "Groep" : mode === "whisper" ? "Aan " + whisperName : "Buurt" }));
    chatInput.maxLength = Math.max(20, rules.maxLength);
    chatInput.placeholder = mode === "whisper" ? "Fluister naar " + whisperName + "…" : mode === "party" ? "Bericht aan je groep…" : "Bericht aan wie dichtbij is…";
  }
  // Chat dicht: de laatste berichten staan nog even linksonder (en vervagen).
  function renderChatFeed(now = performance.now()) {
    const showChatLines = !chatShown();
    const blockedIds = new Set(chatBlocked().map(function (entry) { return entry.id; }));
    // Alles voor jou (questmeldingen, groep, fluisteren, systeem), ook wat je wegklikte: dat zie je uitgeklapt terug.
    const history = ui.chatLines.filter(function (line) { return (line.quest || FEED_CHANNELS.has(line.channel)) && chatShows(line, "all", blockedIds); });
    // De open chat toont de gewone regels al in het paneel. Alleen die regels
    // gaan dan uit de stapel; questmeldingen en de overige stapelonderdelen blijven staan.
    const visibleHistory = showChatLines ? history : history.filter(function (line) { return line.quest; });
    const open = ui.stackOpen === true;
    // Ingeklapt: questmeldingen blijven staan (hooguit 3); gewone berichten 12 s. Op volgorde van binnenkomst.
    const chat = showChatLines ? history.filter(function (line) { return !line.quest && now - line.at < CHAT_FEED_MS; }).slice(-5) : [];
    const recent = open ? visibleHistory.slice(-FEED_HISTORY_MAX) : ui.questFeed.concat(chat).sort(function (a, b) { return a.at - b.at; });
    const fading = function (line) { return !open && !line.quest && now - line.at > CHAT_FEED_MS - 1600; };
    const more = open || visibleHistory.length > recent.length;
    const signature = (showChatLines ? "chat-closed|" : "chat-open|") + (open ? "open|" : "") + (more ? visibleHistory.length + "|" : "") + recent.map(function (line) { return line.id + (fading(line) ? "o" : ""); }).join("|");
    if (ui.sig.feed === signature) return;
    ui.sig.feed = signature;
    stackMore.hidden = !more;
    stackMore.textContent = open ? "▾ Inklappen" : "▴ Alles (" + history.length + ")";
    stackMore.title = open ? "Weer alleen de laatste meldingen" : "Uitklappen: alle meldingen en chat voor jou terugzien";
    const wasHidden = chatFeed.hidden;
    chatFeed.hidden = !recent.length;
    chatFeed.classList.toggle("gkFeedOpen", open);
    if (wasHidden && !chatFeed.hidden) placeChat();
    chatFeed.replaceChildren(...recent.map(function (line) {
      const el = chatLineEl(line);
      if (fading(line)) el.classList.add("gkOld");
      if (line.quest) {
        el.classList.add("gkFeedQuest");
        el.dataset.act = "feed-quest";
        el.dataset.id = line.questId;
        el.title = "Naar de quest";
        // ✕ = deze melding weg (staat hij in de weg). Uitgeklapt is het je geschiedenis: daar geen ✕.
        if (!open) el.append(h("button", { type: "button", class: "gkFeedClose", "data-act": "feed-quest-close", "data-id": line.id, title: "Weg", "aria-label": "Melding weg", text: "✕" }));
      }
      return el;
    }));
    if (open) chatFeed.scrollTop = chatFeed.scrollHeight;
  }
  // De chat zelf staat onderin het paneel (Kevin 3-11). Hier alleen nog:
  // - chat dicht: de laatste regels linksonder, naast of boven de actieknoppen (nooit eroverheen);
  // - met de vinger aan het typen: de chat net boven het toetsenbord.
  function chatSpace() {
    const edge = 10;
    const area = game.getBoundingClientRect();
    const act = actions.getBoundingClientRect();
    const hasActions = act.width > 0 && act.height > 0;
    const low = lowLeft.getBoundingClientRect();
    const above = low.width > 0 && low.height > 0 ? area.bottom - low.top + 6 : edge;
    const besideRoom = hasActions ? act.left - area.left - 2 * edge : area.width - 2 * edge;
    // Kevin 10-11: op de telefoon liever smal naast de knoppen dan over de hele breedte erboven.
    const beside = besideRoom >= (coarsePointer() ? 150 : 300);
    // De tekst boven de actieknoppen steekt ook buiten hun rechthoek uit.
    const bottom = beside || !hasActions ? above : Math.max(above, area.bottom - act.top + 30);
    return { edge, area, bottom, beside, besideRoom };
  }
  function placeChat() {
    const area = game.getBoundingClientRect();
    const statusRect = playerStatus.getBoundingClientRect();
    const mapBottom = Math.max(mapWrap.getBoundingClientRect().bottom, mapTools.getBoundingClientRect().bottom);
    // Kevin 7-11: de korte meldingen staan nu onderin de stapel linksonder (niet meer rechtsboven).
    if (!questLine.hidden || !eventLine.hidden || !chatFeed.hidden || !stackMore.hidden || toasts.childElementCount) {
      const space = chatSpace();
      const width = Math.max(0, space.beside ? Math.min(380, space.besideRoom) : space.area.width - 2 * space.edge);
      feedStack.style.bottom = Math.round(space.bottom) + "px";
      feedStack.style.width = Math.floor(width) + "px";
      // Bij weinig hoogte krijgt de berichtenlijst een scrollgebied; de quest
      // blijft erboven staan en schuift niet over spelersbalken of minimap heen.
      const crossesMap = area.left + space.edge + width > mapWrap.getBoundingClientRect().left - 8;
      const top = Math.max(statusRect.bottom, crossesMap ? mapBottom : area.top) + 12;
      // Kevin 10-11: op de telefoon hooguit 40 % van het scherm, zodat je de game blijft zien (de rest kun je scrollen).
      const room = Math.floor(area.bottom - space.bottom - top);
      feedStack.style.maxHeight = Math.max(0, coarsePointer() ? Math.min(room, Math.floor(area.height * 0.4)) : room) + "px";
    }
    const typing = chatShown() && coarsePointer() && document.activeElement === chatInput;
    chatBox.classList.toggle("gkChatTop", typing);
    if (!typing) {
      if (chatBox.style.top) { chatBox.style.top = ""; chatBox.style.height = ""; }
      return;
    }
    // Het zichtbare deel van het scherm (zonder toetsenbord); de chat staat er onderaan in, net boven het toetsenbord.
    const edge = 10;
    const view = window.visualViewport;
    const viewTop = view ? view.offsetTop : 0;
    const viewHeight = view ? view.height : window.innerHeight;
    const base = root.getBoundingClientRect();
    const height = Math.round(Math.max(150, ui.chatBig ? viewHeight - 2 * edge : Math.min(320, viewHeight - 2 * edge)));
    chatBox.style.height = height + "px";
    chatBox.style.top = Math.round(Math.max(0, viewTop - base.top) + viewHeight - edge - height) + "px";
  }
  // Waar HUD-delen staan: namen en ballonnen uit de wereld komen daar niet overheen (10x per seconde bijgewerkt).
  function collectHudBlocks() {
    const list = [];
    for (const el of [playerStatus, mapWrap, mapTools, actions, lowLeft, feedStack, chatBox, inviteCard, talk, bagBtn]) {
      if (!el || el.hidden) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) list.push({ l: r.left - 4, t: r.top - 4, r: r.right + 4, b: r.bottom + 4 });
    }
    ui.hudBlocks = list;
  }
  function underHud(left, top, right, bottom) {
    const list = ui.hudBlocks || [];
    for (const r of list) if (left < r.r && right > r.l && top < r.b && bottom > r.t) return true;
    return false;
  }
  function openChat(options = {}) {
    closeMenu();
    if (options.tab) { store.chatTab = options.tab; save(); }
    const wasOpen = ui.chatOpen;
    ui.chatOpen = true;
    ui.dockPick = "chat";
    ui.chatUnread = 0;
    if (!wasOpen) ui.chatKeyOpen = options.viaKey === true;
    ui.chatScrollDown = true;
    ui.sig.chat = "";
    render();
    renderChatFeed();
    placeChat();
    if (options.prefill && !chatInput.value) chatInput.value = options.prefill;
    if (options.focus === true || (options.focus !== false && !coarsePointer())) {
      try { chatInput.focus({ preventScroll: true }); } catch { chatInput.focus(); }
    }
  }
  function closeChat() {
    if (!ui.chatOpen) return;
    ui.chatOpen = false;
    ui.chatBlocksOpen = false;
    ui.chatKeyOpen = false;
    ui.chatBig = false;
    if (document.activeElement === chatInput) chatInput.blur();
    render();
    renderChatFeed();
  }
  // Gesprek met een NPC stoppen (kruisje, of het pijltje in de menubalk).
  function closeTalk() {
    ui.trade = null;
    ui.craft = null;
    store.item = null;
    ui.story = null;
    if (data().dialogue) {
      ui.serviceTalk = null;
      api.closeDialogue();
    } else if (ui.serviceTalk) {
      endServiceTalk();
    } else {
      applyLayout();
      render();
    }
  }
  function chatTab(id) {
    store.chatTab = id;
    save();
    ui.chatBlocksOpen = false;
    if (id === "near") ui.chatModeSel = "near";
    if (id === "party" && chatInParty()) ui.chatModeSel = "party";
    if (id === "whisper" && (ui.chatWhisper || ui.chatReply)) { ui.chatWhisper = ui.chatWhisper || ui.chatReply; ui.chatModeSel = "whisper"; }
    ui.chatScrollDown = true;
    renderChat();
  }
  // De knop links van het typvak: Buurt → Groep → Fluisteren → Buurt (alleen wat kan).
  function cycleChatMode() {
    const order = ["near"];
    if (chatInParty()) order.push("party");
    if (ui.chatWhisper || ui.chatReply) order.push("whisper");
    const now = chatMode();
    const next = order[(order.indexOf(now) + 1) % order.length];
    if (next === "whisper") ui.chatWhisper = ui.chatWhisper || ui.chatReply;
    ui.chatModeSel = next;
    if (order.length === 1) chatNotice("Nu alleen Buurt. Groep kan in een groep; fluisteren via een naam of /f naam bericht.", "", true);
    renderChat();
  }
  // Versturen. Ook: /b (buurt), /g (groep), /f naam (fluisteren), /r (antwoord op fluisteren).
  function submitChat(quickText) {
    const fromBox = quickText === undefined;
    const raw = String(fromBox ? chatInput.value || "" : quickText).trim();
    if (!raw) return false;
    let mode = chatMode();
    let target = ui.chatWhisper;
    let text = raw;
    const command = fromBox ? /^\/(\S+)\s*([\s\S]*)$/.exec(raw) : null;
    if (command) {
      const word = command[1].toLowerCase();
      const rest = command[2] || "";
      if (["b", "s", "buurt", "say"].includes(word)) { mode = "near"; text = rest; }
      else if (["g", "p", "groep", "party"].includes(word)) { mode = "party"; text = rest; }
      else if (["f", "w", "fluister", "whisper"].includes(word)) {
        const parts = /^(\S+)\s*([\s\S]*)$/.exec(rest);
        if (!parts) { chatNotice("Zo fluister je: /f naam bericht", "error", true); return false; }
        target = { id: "", name: parts[1].slice(0, 40) };
        if (ui.chatWhisper && String(ui.chatWhisper.name || "").toLowerCase() === target.name.toLowerCase()) target = ui.chatWhisper;
        mode = "whisper";
        text = parts[2];
      } else if (["r", "antwoord", "reply"].includes(word)) {
        if (!ui.chatReply) { chatNotice("Nog niemand fluisterde naar je.", "error", true); return false; }
        target = ui.chatReply;
        mode = "whisper";
        text = rest;
      } else {
        chatNotice("Onbekend. /b = buurt, /g = groep, /f naam = fluisteren, /r = antwoord.", "error", true);
        return false;
      }
      ui.chatModeSel = mode;
      if (mode === "whisper") ui.chatWhisper = target;
      if (!text.trim()) { chatInput.value = ""; ui.sig.chat = ""; renderChat(); return false; }
    }
    if (mode === "party" && !chatInParty()) { chatNotice("Je zit niet in een groep. Kies Buurt of Fluisteren.", "error", true); return false; }
    if (mode === "whisper" && !target) { chatNotice("Kies eerst aan wie je fluistert.", "error", true); return false; }
    const payload = { channel: mode, text: text.trim() };
    if (mode === "whisper") { if (target.id) payload.toId = target.id; else payload.toName = target.name; }
    if (typeof api.chatSend !== "function" || !api.chatSend(payload)) {
      chatNotice("Geen verbinding met de server. Probeer het zo nog eens.", "error", true);
      return false;
    }
    if (fromBox) chatInput.value = "";
    ui.chatScrollDown = true;
    ui.sig.chat = "";
    renderChat();
    return true;
  }
  // Ballon boven het hoofd (alleen berichten uit Buurt), anker "self" of "player:<id>".
  function chatBubble(anchorId, text, fixedSeconds = 0) {
    const seconds = fixedSeconds > 0 ? fixedSeconds : chatRulesNow().bubbleSeconds;
    if (!(seconds > 0) || !anchorId) return;
    let bubble = ui.bubbles.get(anchorId);
    if (!bubble) {
      bubble = { el: h("div", { class: "gkBubble" }), until: 0 };
      bubbleLayer.append(bubble.el);
      ui.bubbles.set(anchorId, bubble);
    }
    bubble.el.textContent = text;
    bubble.until = performance.now() + seconds * 1000;
    if (ui.bubbles.size > 12) {
      const [firstId, first] = ui.bubbles.entries().next().value;
      first.el.remove();
      ui.bubbles.delete(firstId);
    }
  }
  function drawBubbles(now, anchors) {
    if (!ui.bubbles.size) return;
    const rect = labelRect || bubbleLayer.getBoundingClientRect();
    const byId = new Map();
    for (const anchor of anchors) byId.set(anchor.id, anchor);
    for (const [id, bubble] of ui.bubbles) {
      if (now > bubble.until) { bubble.el.remove(); ui.bubbles.delete(id); continue; }
      const anchor = byId.get(id);
      if (!anchor) { bubble.el.style.opacity = "0"; continue; }
      // Stap 8: boven een begeleide NPC staan naam en levensbalk; de ballon komt daarboven.
      const lift = anchor.entityKind === "escort" ? (store.nameWorld ? 30 : 4) : (anchor.entityKind === "self" ? store.nameSelf : store.namePlayers) ? 22 : 4;
      if (underHud(anchor.x - 100, anchor.y - lift - 56, anchor.x + 100, anchor.y - lift)) { bubble.el.style.opacity = "0"; continue; }
      bubble.el.style.opacity = String(Math.max(0, Math.min(1, (bubble.until - now) / 400)));
      bubble.el.style.transform = "translate3d(" + Math.round(anchor.x - rect.left) + "px," + Math.round(anchor.y - rect.top - lift) + "px,0) translate(-50%,-100%)";
    }
  }
  chatInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      const typed = Boolean(chatInput.value.trim());
      if (typed) submitChat();
      // Desktop, geopend met Enter: na Enter weer spelen (WASD werkt meteen). De chat blijft in het paneel staan;
      // Enter zonder tekst (of Esc) = chat dicht.
      if (ui.chatKeyOpen && !coarsePointer()) { if (typed) chatInput.blur(); else closeChat(); }
      return;
    }
    if (event.key === "Escape") { event.preventDefault(); closeChat(); }
  });
  chatInput.addEventListener("focus", function () { window.setTimeout(placeChat, 60); });
  chatInput.addEventListener("blur", function () { window.setTimeout(placeChat, 60); });
  // Knoppen in de chat pakken de focus niet af: het toetsenbord blijft open na Versturen of een snel bericht.
  chatBox.addEventListener("mousedown", function (event) {
    if (document.activeElement === chatInput && event.target && typeof event.target.closest === "function" && event.target.closest("button")) event.preventDefault();
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", function () { if (ui.chatOpen) placeChat(); });
    window.visualViewport.addEventListener("scroll", function () { if (ui.chatOpen) placeChat(); });
  }
  window.addEventListener("resize", function () { if (ui.chatOpen) placeChat(); });
  // Kevin (3-11): klik of tik je buiten de chat (in de 3D-wereld, op de kaart…), dan is het typvak los en gaan de toetsen weer naar de game.
  document.addEventListener("pointerdown", function (event) {
    if (document.activeElement !== chatInput) return;
    if (event.target && typeof event.target.closest === "function" && chatBox.contains(event.target)) return;
    chatInput.blur();
  }, true);
  // Snelle berichten (en tabjes): met de vinger schuiven kan al; met de muis slepen of het muiswiel gaat nu ook.
  function dragScroll(strip) {
    let drag = null;
    strip.addEventListener("pointerdown", function (event) {
      if (event.pointerType !== "mouse" || event.button !== 0 || strip.scrollWidth <= strip.clientWidth) return;
      drag = { x: event.clientX, left: strip.scrollLeft, moved: false, id: event.pointerId };
    });
    strip.addEventListener("pointermove", function (event) {
      if (!drag || event.pointerId !== drag.id) return;
      const dx = event.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 6) return;
      if (!drag.moved) { drag.moved = true; try { strip.setPointerCapture(event.pointerId); } catch {} }
      strip.scrollLeft = drag.left - dx;
    });
    const end = function () {
      if (drag?.moved) { strip.dataset.dragged = "1"; window.setTimeout(function () { delete strip.dataset.dragged; }, 0); }
      drag = null;
    };
    strip.addEventListener("pointerup", end);
    strip.addEventListener("pointercancel", end);
    // Na slepen telt de klik niet (anders stuur je per ongeluk een snel bericht).
    strip.addEventListener("click", function (event) { if (strip.dataset.dragged) { event.preventDefault(); event.stopPropagation(); } }, true);
    strip.addEventListener("wheel", function (event) {
      if (strip.scrollWidth <= strip.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
      strip.scrollLeft += event.deltaY;
    }, { passive: false });
  }
  dragScroll(chatQuick);
  dragScroll(chatTabs);
  // Grootte van het hele paneel. De CSS-standaard blijft gelden totdat de speler de rand versleept.
  function panelSizeBounds(vertical) {
    const total = vertical ? root.clientHeight : root.clientWidth;
    const wantedMin = vertical ? 220 : 280;
    const min = Math.min(wantedMin, Math.max(1, total));
    return { min, max: Math.max(min, total - 64) };
  }
  function applyPanelSize() {
    const vertical = (root.dataset.orient || orient()) === "port";
    const key = vertical ? "panelHeight" : "panelWidth";
    const property = vertical ? "--gk-panel-h" : "--gk-panel-w";
    const saved = num(store[key]);
    panelResize.setAttribute("aria-orientation", vertical ? "horizontal" : "vertical");
    if (saved > 0) {
      const bounds = panelSizeBounds(vertical);
      const size = Math.round(Math.max(bounds.min, Math.min(bounds.max, saved)));
      root.style.setProperty(property, size + "px");
      panelResize.setAttribute("aria-valuemin", String(bounds.min));
      panelResize.setAttribute("aria-valuemax", String(bounds.max));
      panelResize.setAttribute("aria-valuenow", String(size));
    } else {
      root.style.removeProperty(property);
      panelResize.removeAttribute("aria-valuemin");
      panelResize.removeAttribute("aria-valuemax");
      panelResize.removeAttribute("aria-valuenow");
    }
  }
  panelResize.addEventListener("pointerdown", function (event) {
    if (event.button > 0 || root.dataset.panel !== "open") return;
    event.preventDefault();
    try { panelResize.setPointerCapture(event.pointerId); } catch {}
    panelResize.classList.add("gkOn");
    const vertical = root.dataset.orient === "port";
    const start = vertical ? event.clientY : event.clientX;
    const edge = panel.getBoundingClientRect();
    let moved = false;
    const move = function (moveEvent) {
      const point = vertical ? moveEvent.clientY : moveEvent.clientX;
      if (!moved && Math.abs(point - start) < 4) return;
      moved = true;
      const bounds = panelSizeBounds(vertical);
      const wanted = vertical ? edge.bottom - moveEvent.clientY : edge.right - moveEvent.clientX;
      store[vertical ? "panelHeight" : "panelWidth"] = Math.round(Math.max(bounds.min, Math.min(bounds.max, wanted)));
      applyPanelSize();
      padGrids();
    };
    const up = function () {
      const now = performance.now();
      if (!moved && now - num(ui.panelResizeTapAt) < 400) store[vertical ? "panelHeight" : "panelWidth"] = null;
      ui.panelResizeTapAt = moved ? 0 : now;
      applyPanelSize();
      panelResize.classList.remove("gkOn");
      panelResize.removeEventListener("pointermove", move);
      panelResize.removeEventListener("pointerup", up);
      panelResize.removeEventListener("pointercancel", up);
      save();
      padGrids();
    };
    panelResize.addEventListener("pointermove", move);
    panelResize.addEventListener("pointerup", up);
    panelResize.addEventListener("pointercancel", up);
  });
  // Kevin (3-11): het schuifje tussen boven (tabblad) en onder (chat/gesprek). Standaard 50/50; wat je kiest wordt onthouden.
  function applySplit() {
    const low = Math.max(0.2, Math.min(0.8, num(store.dockSplit, 0.5)));
    root.style.setProperty("--gk-split-low", String(low));
    root.style.setProperty("--gk-split-top", String(1 - low));
  }
  applySplit();
  splitBar.addEventListener("pointerdown", function (event) {
    if (event.button > 0) return;
    event.preventDefault();
    try { splitBar.setPointerCapture(event.pointerId); } catch {}
    splitBar.classList.add("gkOn");
    const startY = event.clientY;
    let moved = false;
    const move = function (moveEvent) {
      if (!moved && Math.abs(moveEvent.clientY - startY) < 4) return;
      moved = true;
      const box = panelBody.getBoundingClientRect();
      const bar = splitBar.getBoundingClientRect().height;
      const room = box.height - bar;
      if (room <= 0) return;
      store.dockSplit = Math.round(Math.max(0.2, Math.min(0.8, (box.bottom - moveEvent.clientY - bar / 2) / room)) * 100) / 100;
      applySplit();
    };
    const up = function () {
      // Dubbel tikken of dubbelklikken (zonder slepen) = weer precies half om half.
      const now = performance.now();
      if (!moved && now - num(ui.splitTapAt) < 400) store.dockSplit = 0.5;
      ui.splitTapAt = moved ? 0 : now;
      applySplit();
      splitBar.classList.remove("gkOn");
      splitBar.removeEventListener("pointermove", move);
      splitBar.removeEventListener("pointerup", up);
      splitBar.removeEventListener("pointercancel", up);
      save();
      padGrids();
    };
    splitBar.addEventListener("pointermove", move);
    splitBar.addEventListener("pointerup", up);
    splitBar.addEventListener("pointercancel", up);
  });

  function floatText(anchor, text, tone) {
    const node = h("span", { class: "gkFloat " + tone, text });
    anchor.append(node);
    window.setTimeout(function () { node.remove(); }, 1150);
  }
  // ---- Healing (2-11): zwevende getallen boven spelers en vijanden ----
  function floatsOn() {
    return has("float_numbers_hud") && store.floatNums !== false;
  }
  function worldFloat(anchorId, text, tone) {
    if (!floatsOn() || !anchorId) return;
    const now = performance.now();
    const same = floats.filter(function (entry) { return entry.id === anchorId && now - entry.born < 400; }).length;
    const el = h("span", { class: "gkFx gkFx--" + tone, text: String(text) });
    fxLayer.append(el);
    floats.push({ id: String(anchorId), el, born: now, shift: (same % 3 - 1) * 14, x: null, y: null });
    if (floats.length > 40) floats.shift().el.remove();
  }
  function drawFloats(now, anchors) {
    if (!floats.length) return;
    const byId = new Map();
    for (const anchor of anchors) byId.set(anchor.id, anchor);
    const rect = labelRect || fxLayer.getBoundingClientRect();
    for (let index = floats.length - 1; index >= 0; index -= 1) {
      const entry = floats[index];
      const age = now - entry.born;
      if (age > 1200) { entry.el.remove(); floats.splice(index, 1); continue; }
      const anchor = byId.get(entry.id);
      if (anchor) { entry.x = anchor.x - rect.left; entry.y = anchor.y - rect.top; }
      if (entry.x === null) { entry.el.style.opacity = "0"; continue; }
      const rise = 14 + age / 1200 * 34;
      entry.el.style.opacity = String(Math.max(0, Math.min(1, (1200 - age) / 400)));
      entry.el.style.transform = "translate3d(" + Math.round(entry.x + entry.shift) + "px," + Math.round(entry.y - rise) + "px,0) translate(-50%,-100%)";
    }
  }

  // ---- Healing (2-11): effect-icoontjes bij het portret ----
  function effectsList(now) {
    const list = data().s03?.effects;
    if (!Array.isArray(list)) return [];
    if (!ui.effectsBase || ui.effectsBase.list !== list) ui.effectsBase = { list, at: now };
    const passed = now - ui.effectsBase.at;
    return list.map(function (entry) { return Object.assign({}, entry, { left: num(entry.leftMs) - passed }); }).filter(function (entry) { return entry.left > 0; });
  }
  function renderEffects(now = performance.now()) {
    const list = has("effects_hud") ? effectsList(now) : [];
    effectsRow.hidden = !list.length;
    const signature = JSON.stringify(list.map(function (entry) {
      return [entry.key, entry.name, entry.good, entry.iconAssetId, entry.lines, formatDuration(entry.left), entry.left < 10000];
    }));
    if (signature === ui.effectsSig) return;
    ui.effectsSig = signature;
    const existing = new Map(Array.from(effectsRow.children).map(function (el) { return [el.dataset.effectKey, el]; }));
    const wanted = [];
    const occurrences = new Map();
    for (const entry of list) {
      const rawKey = String(entry.key || "effect");
      const occurrence = occurrences.get(rawKey) || 0;
      occurrences.set(rawKey, occurrence + 1);
      const effectKey = rawKey + ":" + occurrence;
      let el = existing.get(effectKey);
      const url = entry.iconAssetId ? api.assetUrl(entry.iconAssetId, false) : null;
      const itemId = rawKey.startsWith("item:") ? rawKey.slice(5) : null;
      const visualKey = url ? "url:" + url : itemId ? "item:" + itemId : "icon:" + (entry.good ? "sparkles" : "tombstone");
      if (!el) {
        el = h("span", { class: "gkEffect", "data-effect-key": effectKey });
        existing.set(effectKey, el);
      }
      if (el.dataset.visualKey !== visualKey) {
        // Geen eigen icoon gekozen: bij een item het plaatje van het item zelf (eigen plaatje of de thumbnail van het 3D-model).
        const pic = url ? h("img", { src: url, alt: "" }) : itemId ? itemVisual(itemId) : ico(entry.good ? "sparkles" : "tombstone");
        el.replaceChildren(pic, h("small"));
        el.dataset.visualKey = visualKey;
      }
      const duration = formatDuration(entry.left);
      const timer = el.querySelector("small");
      if (timer && timer.textContent !== duration) timer.textContent = duration;
      el.classList.toggle("gkBad", !entry.good);
      el.classList.toggle("gkEnding", entry.left < 10000);
      // Houd de browser-tooltip tijdens hover stabiel. De resterende tijd staat al zichtbaar onder het icoon;
      // een title die iedere seconde verandert laat de native tooltip steeds verdwijnen en terugkomen.
      const tip = [entry.name].concat(entry.lines || []).filter(Boolean).join("\n");
      if (el.title !== tip) el.title = tip;
      wanted.push(el);
    }
    const wantedSet = new Set(wanted);
    for (const el of Array.from(effectsRow.children)) if (!wantedSet.has(el)) el.remove();
    wanted.forEach(function (el, index) {
      const current = effectsRow.children[index] || null;
      if (current !== el) effectsRow.insertBefore(el, current);
    });
  }
  // Wachttijd per item (ms nog), ook na een herladen van de tas.
  function cooldownLeft(itemId, now = performance.now()) {
    const map = data().s03?.itemCooldowns;
    if (!map || typeof map !== "object") return 0;
    if (!ui.cdBase || ui.cdBase.map !== map) ui.cdBase = { map, at: now };
    return Math.max(0, num(map[itemId]) - (now - ui.cdBase.at));
  }
  function tickCooldowns(now) {
    for (const el of sheet.querySelectorAll("[data-cd]")) {
      const left = cooldownLeft(el.dataset.cd, now);
      const text = left > 0 ? formatDuration(left) : "";
      if (el.textContent !== text) el.textContent = text;
      el.hidden = !text;
      const button = el.closest("button[data-act='use']");
      if (button) button.disabled = left > 0 || Boolean(data().busy?.n03) ? true : false;
    }
  }
  // ---- Fase 5: vak 1 (auto-aanval), vak 2 en 3 (vaardigheden) ----
  function skillsData() { return data().s03?.skills || null; }
  function skillById(abilityId) { return (skillsData()?.list || []).find(function (entry) { return entry.abilityId === abilityId; }) || null; }
  function skillIcon(entry) { return entry?.icon || (entry?.kind === "heal" ? "healing" : "crossed-swords"); }
  function renderSlots(now = performance.now()) {
    const sk = skillsData();
    if (ui.skillSnapRef !== data().s03) { ui.skillSnapRef = data().s03; ui.skillSnapAt = now; }
    const show = has("hotbar_hud") && (sk?.list || []).length > 0;
    const mana = manaOf(data().s03);
    for (const slot of [2, 3]) {
      const u = slotUi[slot];
      u.btn.hidden = !show;
      if (!show) continue;
      const entry = skillById(sk.slots?.[slot]);
      const sig = entry ? entry.abilityId + "|" + skillIcon(entry) + "|" + entry.kind + "|" + entry.displayName : "empty";
      if (u.sig !== sig) {
        u.sig = sig;
        u.icon.replaceChildren(ico(entry ? skillIcon(entry) : "spell-book"));
        u.btn.classList.toggle("gkEmpty", !entry);
        u.btn.classList.toggle("gkHealSlot", entry?.kind === "heal");
        u.btn.title = entry ? entry.displayName + (entry.manaCost ? " (" + entry.manaCost + " mana)" : "") + " (" + slot + ")" : "Vak " + slot + " is leeg: sleep een vaardigheid uit het boek (K).";
      }
      // Wachttijd: wat de server meegaf (na opnieuw laden) of wat we net zelf startten.
      const serverReady = entry && num(entry.readyInMs) > 0 ? num(ui.skillSnapAt) + num(entry.readyInMs) : 0;
      const left = entry ? Math.max(0, Math.max(num(ui.skillReadyAt[entry.abilityId]), serverReady) - now) : 0;
      u.cd.hidden = left <= 0;
      if (left > 0) u.cd.textContent = cdText(left);
      u.btn.classList.toggle("gkIdle", !entry || left > 0 || (num(entry?.manaCost) > 0 && mana.cur < num(entry.manaCost)));
    }
    const auto = sk?.auto || null;
    const autoIcon = skillIcon(auto);
    if (ui.autoIconSig !== autoIcon) { ui.autoIconSig = autoIcon; attackIcon.replaceChildren(ico(autoIcon)); }
    attackBtn.title = (auto?.displayName || "Aanvallen") + ": auto-aanval (1)";
    attackBtn.classList.toggle("gkAuto", Boolean(data().autoAttack));
    const autoLeft = Math.max(0, num(ui.autoReadyAt) - now);
    attackCd.hidden = autoLeft <= 0;
    if (autoLeft > 0) attackCd.textContent = cdText(autoLeft);
  }
  // Onder 3 s met één cijfer achter de komma (1.2), daarboven hele seconden.
  function cdText(ms) {
    return ms < 3000 ? (Math.ceil(ms / 100) / 10).toFixed(1) : String(Math.ceil(ms / 1000));
  }
  function autoSwung(cooldownMs) {
    ui.autoReadyAt = performance.now() + Math.max(0, num(cooldownMs, 1500));
  }
  function useSlot(slot) {
    const sk = skillsData();
    const entry = skillById(sk?.slots?.[slot]);
    const u = slotUi[slot];
    u.btn.classList.remove("gkFlash");
    void u.btn.offsetWidth;
    u.btn.classList.add("gkFlash");
    ui.combatAt = performance.now();
    if (!entry) { toast("Vak " + slot + " is leeg: zet er een vaardigheid op in het boek.", { icon: "spell-book", ms: 2500 }); openTab("skills"); return; }
    const mana = manaOf(data().s03);
    if (num(entry.manaCost) > 0 && mana.cur < num(entry.manaCost)) { toast("Te weinig mana.", { icon: "water-drop", ms: 2000 }); return; }
    if (performance.now() < num(ui.skillReadyAt[entry.abilityId])) return;
    ui.skillReadyAt[entry.abilityId] = performance.now() + num(entry.cooldownMs, 1500);
    // MMO (3-11): gekozen teamlid (tik linksboven); anders kiest de server de meest gewonde speler in de buurt.
    let targetId = null;
    if (entry.kind === "heal") {
      const mate = partyMates().find(function (m) { return m.id === ui.healTarget && m.online; });
      targetId = mate ? "player:" + mate.id : null;
    }
    api.useSkill(slot, targetId, entry.kind, { rangeM: entry.rangeM, animStyle: entry.animStyle });
  }
  // De server weigerde (te ver, muur, vergrendeld): de wachttijd op de knop mag weg.
  function skillFailed(slot) {
    const entry = skillById(skillsData()?.slots?.[slot]);
    if (entry) ui.skillReadyAt[entry.abilityId] = 0;
    renderSlots();
  }
  function putSkill(slot, abilityId) {
    const entry = skillById(abilityId);
    if (!entry) return;
    if (!entry.unlocked) { toast(entry.displayName + ": " + lockLine(entry) + ".", { icon: "padlock", ms: 2500 }); return; }
    api.run03("loadout_set", null, { slot, abilityId, skipMoveToTarget: true });
  }
  function lockLine(entry) {
    return entry?.lockText ? "vergrendeld, " + entry.lockText : "vergrendeld";
  }
  // Tik op een teamlid + genezen (oude 💚-knop): de genees-vaardigheid op vak 2 of 3.
  function heal() {
    const spell = data().s03?.healSpell || null;
    if (spell && spell.slot) useSlot(Number(spell.slot));
  }

  function hitFeedback(amount) {
    ui.lastHitAt = performance.now();
    ui.combatAt = ui.lastHitAt;
    floatText(hp, "-" + Math.round(amount), "bad");
    hp.classList.remove("gkHit");
    vignette.classList.remove("gkHitFlash");
    void hp.offsetWidth;
    hp.classList.add("gkHit");
    vignette.classList.add("gkHitFlash");
  }
  // Kevin 6-11: Quest voltooid en Level omhoog komen na elkaar, met een korte pauze. Quest voltooid eerst (de XP gaf het level).
  const CELEBRATE_GAP_MS = 700;
  function celebrate(order, ms, build) {
    ui.celebrations.push({ order, ms, build });
    ui.celebrations.sort(function (a, b) { return a.order - b.order; });
    if (ui.celebrating) return;
    ui.celebrating = true;
    // Even wachten: komen ze tegelijk binnen, dan staat Quest voltooid vooraan.
    window.setTimeout(nextCelebration, 300);
  }
  function nextCelebration() {
    const next = ui.celebrations.shift();
    if (!next) { ui.celebrating = false; return; }
    const node = next.build();
    game.append(node);
    window.setTimeout(function () { node.remove(); window.setTimeout(nextCelebration, CELEBRATE_GAP_MS); }, next.ms);
  }
  function levelUp(newLevel) {
    celebrate(1, 2700, function () { return h("div", { class: "gkLevelUp" }, [ico("star-medal"), h("b", { text: "Level " + newLevel + "!" })]); });
  }

  // Kevin 6-11: quest gehaald. Groot en goud zoals level omhoog, met de naam, het einde (na een keuze) en wat je kreeg.
  function questDone(info) {
    const title = String(info?.title || "");
    if (!title) return;
    const rewards = (Array.isArray(info.rewards) ? info.rewards : []).map(String).slice(0, 6);
    celebrate(0, 4300, function () {
      return h("div", { class: "gkQuestDone", role: "status" }, [
        h("div", { class: "gkQuestDoneRays" }),
        ico("star-medal"),
        h("b", { text: "Quest voltooid!" }),
        h("strong", { text: title }),
        info.ending ? h("small", { text: "🏁 " + String(info.ending) }) : null,
        rewards.length ? h("span", { class: "gkQuestDoneRewards", text: rewards.join("  ·  ") }) : null
      ]);
    });
    chatNotice("🏆 Quest voltooid: " + title + (rewards.length ? " (" + rewards.join(", ") + ")" : ""), "", true, String(info.questId || ""));
  }

  // Quest Builder stap 8: wat een NPC zegt die je begeleidt: een ballon boven zijn hoofd (8 s) en een regel in de chat.
  function npcSay(anchorId, text, name = "") {
    const message = String(text || "").trim();
    if (!message || !anchorId) return;
    chatBubble(anchorId, message, 8);
    chatNotice((name ? String(name) + ": " : "") + message, "", true);
  }

  // Quest Builder stap 5: Bericht in beeld (Als → Dan). Groot in het midden, kort, en ook in de chat.
  function questBanner(text, title, questId = "") {
    const message = String(text || "");
    if (!message) return;
    for (const old of game.querySelectorAll(".gkQuestBanner")) old.remove();
    const node = h("div", { class: "gkQuestBanner", role: "status" }, [ico("scroll-unfurled"),
      h("div", { class: "gkQuestBannerText" }, [title ? h("small", { text: String(title) }) : null, h("b", { text: message })])]);
    game.append(node);
    window.setTimeout(function () { node.remove(); }, 5200);
    chatNotice((title ? String(title) + ": " : "") + message, "", true, String(questId || ""));
  }

  function toast(text, options = {}) {
    const entry = { id: Math.random().toString(36).slice(2), text: String(text || ""), tone: options.tone || "info", icon: options.icon || "info" };
    if (!entry.text) return;
    ui.toasts = ui.toasts.filter(function (other) { return other.text !== entry.text; }).concat(entry).slice(-2);
    if (!options.sticky) window.setTimeout(function () { ui.toasts = ui.toasts.filter(function (other) { return other !== entry; }); renderToasts(); }, options.ms || 4500);
    renderToasts();
  }
  function renderToasts() {
    const notice = data().notice;
    const shown = [];
    if (notice?.text && notice.action !== "node03:respawn") shown.push({ id: "notice", text: notice.text, tone: notice.tone || "info", dismiss: notice.dismissible !== false && notice.tone === "error" });
    for (const entry of ui.toasts) shown.push(entry);
    const signature = JSON.stringify(shown.map(function (entry) { return [entry.id, entry.text, entry.tone]; }));
    if (ui.sig.toasts === signature) return;
    ui.sig.toasts = signature;
    toasts.replaceChildren(...shown.map(function (entry) {
      const icon = entry.tone === "error" ? "cancel" : entry.icon || (entry.tone === "warning" ? "info" : "info");
      return h("div", { class: "gkToast " + entry.tone }, [ico(icon, entry.tone === "error" ? "blood" : null), h("span", { text: entry.text }),
        entry.dismiss ? h("button", { type: "button", "data-act": "toast-close", title: "Sluiten" }, [ico("cancel")]) : null]);
    }));
  }

  function renderDeath() {
    const dead = Boolean(data().defeated);
    const signature = dead ? "dead" : "";
    if (ui.sig.death === signature) return;
    ui.sig.death = signature;
    death.hidden = !dead;
    if (dead) {
      death.replaceChildren(h("div", { class: "gkDeathCard" }, [ico("tombstone"), h("strong", { text: "Je bent verslagen" }),
        h("button", { type: "button", class: "gkBtn gkGo", "data-act": "respawn" }, [ico("heart-plus", "plain"), "Opnieuw beginnen"])]));
    }
  }

  // Kevin 5-11: het verhaal van een quest die niet bij een NPC begint staat in het gespreksvenster.
  // Brief: klik op de brief in de tas = de brief in het gesprek met de knop Quest accepteren.
  // Gebied of vanzelf: de quest is al begonnen = het verhaal in het gesprek met Op pad!. Daarna Menu > Quests bij die quest.
  const STORY_LOOK = { item: ["Brief", "scroll-unfurled"], area: ["In de buurt", "position-marker"], auto: ["Nieuwe opdracht", "star-medal"] };
  function watchQuestStarts() {
    const active = data().s04?.quests?.active;
    if (!Array.isArray(active)) return;
    const ids = new Set(active.map(function (quest) { return quest.questId; }));
    // Bij de eerste stand na het laden niet (die quests liepen al).
    if (ui.storyKnown) {
      for (const quest of active) {
        if (!ui.storyKnown.has(quest.questId) && (quest.startMode === "area" || quest.startMode === "auto") && !ui.storyQueue.includes(quest.questId)) ui.storyQueue.push(quest.questId);
      }
    }
    ui.storyKnown = ids;
    ui.storyQueue = ui.storyQueue.filter(function (id) { return ids.has(id); });
    if (ui.focusQuest) {
      const id = ui.focusQuest.questId;
      if (ids.has(id)) { ui.focusQuest = null; ui.storyQueue = ui.storyQueue.filter(function (other) { return other !== id; }); showQuest(id); }
      else if (performance.now() > ui.focusQuest.until) ui.focusQuest = null;
    }
    if (!ui.story && ui.storyQueue.length) ui.story = { kind: "started", questId: ui.storyQueue.shift() };
  }
  function storyView() {
    const story = ui.story;
    const active = data().s04?.quests?.active || [];
    if (story?.kind === "letter") {
      const reads = catalogItem(story.itemId)?.reads;
      if (!reads) return null;
      const running = active.some(function (quest) { return quest.questId === reads.questId; });
      return { mode: "item", questId: reads.questId, itemId: story.itemId, displayName: reads.displayName, description: reads.description, imageAssetId: reads.imageAssetId,
        goals: reads.goals || [], afterQuest: null, button: running ? ["story-open", "Naar quest", "scroll-unfurled"] : ["story-accept", "Quest accepteren", "check-mark"] };
    }
    const quest = story ? active.find(function (entry) { return entry.questId === story.questId; }) : null;
    if (!quest) return null;
    return { mode: STORY_LOOK[quest.startMode] ? quest.startMode : "auto", questId: quest.questId, itemId: "", displayName: quest.displayName, description: quest.description || "",
      imageAssetId: quest.imageAssetId, afterQuest: quest.afterQuest || null, button: ["story-open", "Op pad!", "check-mark"],
      goals: (quest.activeStep?.objectives || []).filter(function (objective) { return objective.needed !== false; }).map(function (objective) { return objective.displayName || objective.objectiveType; }) };
  }
  function renderStoryTalk(view) {
    const busy = Boolean(data().busy?.n03);
    const signature = JSON.stringify(["story", root.dataset.mode, root.dataset.dock, view, busy]);
    if (ui.sig.talk === signature) return;
    ui.sig.talk = signature;
    talk.hidden = root.dataset.mode !== "talk" || root.dataset.dock !== "talk";
    talk.classList.remove("gkTalk--service");
    const look = STORY_LOOK[view.mode];
    const art = api.assetUrl(view.imageAssetId, false);
    talk.replaceChildren(h("div", { class: "gkStoryCard gkStory--" + view.mode, "aria-label": view.displayName }, [
      h("div", { class: "gkStoryArt" }, [art ? h("img", { src: art, alt: "" }) : ico(look[1])]),
      h("div", { class: "gkStoryHead" }, [h("small", { text: look[0] }), h("strong", { text: view.displayName }),
        view.afterQuest ? h("em", null, [ico("check-mark"), view.afterQuest + " afgerond"]) : null]),
      h("button", { type: "button", class: "gkClose", "data-act": "talk-close", title: "Sluiten (Esc)" }, [ico("cancel")]),
      view.description ? h("div", { class: "gkStoryText", text: view.description }) : null,
      view.goals.length ? h("div", { class: "gkStoryGoals" }, [h("b", { text: "Wat moet je doen" })].concat(view.goals.map(function (goal) { return h("span", { text: goal }); }))) : null,
      h("div", { class: "gkStoryBtns" }, [h("button", { type: "button", class: "gkBtn gkGo", "data-act": view.button[0], "data-id": view.questId, "data-item": view.itemId,
        disabled: busy && view.button[0] === "story-accept" ? true : null }, [ico(view.button[2], "plain"), view.button[1]])])
    ]));
  }
  function closeStory() {
    ui.story = null;
    applyLayout();
    render();
  }
  // Menu > Quests open, bij deze quest (even oplichten).
  function showQuest(questId) {
    ui.story = null;
    store.item = null;
    store.tab = "quests";
    ui.combatAt = -1e9;
    setPanel("open");
    window.requestAnimationFrame(function () {
      const card = Array.from(sheet.querySelectorAll("[data-quest]")).find(function (node) { return node.dataset.quest === questId; });
      if (!card) return;
      card.scrollIntoView({ block: "nearest" });
      card.classList.add("gkFlash");
      window.setTimeout(function () { card.classList.remove("gkFlash"); }, 1600);
    });
  }

  // Gezicht, tekst, gesprekskeuzes én winkel/werkplaats blijven in hetzelfde onderdeel Gesprek.
  function renderTalk() {
    const d = data();
    if (ui.story && !d.dialogue && !ui.serviceTalk && !ui.trade && !ui.craft) {
      const view = storyView();
      if (view) { renderStoryTalk(view); return; }
      ui.story = null;
      applyLayout();
    }
    const activeVendor = ui.trade ? api.vendor(ui.trade.vendorId) : null;
    const activeStation = ui.craft ? api.station(ui.craft.stationId) : null;
    const dialogue = d.dialogue || (ui.serviceTalk ? { dialogueId: "", entryId: "", speakerName: ui.serviceTalk.name, text: "Wat kan ik voor je doen?", choices: [], targetRef: "" }
      : activeVendor ? { dialogueId: "", entryId: "", speakerName: activeVendor.label || activeVendor.displayName || "Winkel", text: "Wat kan ik voor je doen?", choices: [], targetRef: "" }
        : activeStation ? { dialogueId: "", entryId: "", speakerName: activeStation.label || "Werkplaats", text: "Wat wil je maken?", choices: [], targetRef: "" } : null);
    const npcId = String(dialogue?.targetRef || "").replace(/^target\.npc\./, "");
    // Winkel en werkplaats van deze NPC: via de NPC-kaart, of (oude NPC's) wat er op dezelfde plek staat.
    const extra = d.dialogue ? (ui.talkFor === String(d.dialogue.dialogueId || "") ? ui.talkServices : []) : (ui.serviceTalk?.services || []);
    const pick = function (kind) { const found = extra.find(function (entry) { return entry.kind === kind; }); return found ? (kind === "vendor" ? api.vendor(found.id) : api.station(found.id)) : null; };
    const vendor = activeVendor || (dialogue && has("vendor_hud") ? api.vendor("vendor." + npcId) || pick("vendor") : null);
    const station = activeStation || (dialogue && has("crafting_hud") ? api.station("station." + npcId) || pick("station") : null);
    const serviceParts = ui.trade
      ? [ui.trade, vendor, d.s03?.inventory, d.s03?.currencies, d.s03?.catalog, d.busy?.n05]
      : ui.craft ? [ui.craft, station, d.s03?.inventory, d.s03?.currencies, d.s03?.catalog, d.s05?.crafting?.jobs, d.busy?.n05] : [];
    const signature = dialogue ? JSON.stringify([root.dataset.mode, root.dataset.dock, dialogue.speakerName, dialogue.dialogueId, dialogue.entryId, dialogue.text,
      (dialogue.choices || []).map(function (c) { return c.choiceId; }), vendor?.vendorId || "", station?.stationId || "", d.busy?.n04, store.item, serviceParts]) : "";
    if (ui.sig.talk === signature) return;
    ui.sig.talk = signature;
    talk.hidden = !dialogue || root.dataset.mode !== "talk" || root.dataset.dock !== "talk";
    if (!dialogue) { talk.classList.remove("gkTalk--service"); talk.replaceChildren(); return; }
    const serviceActive = Boolean(ui.trade || ui.craft);
    const oldBody = talk.querySelector(".gkTalkService .gkBody, .gkTalkService .gkCraftList");
    const oldTop = talk.querySelector(".gkTalkService .gkSplitTop");
    const bodyScroll = oldBody ? oldBody.scrollTop : 0;
    const topScroll = oldTop ? oldTop.scrollTop : 0;
    const faceUrl = api.npcFaceUrl(dialogue.targetRef) || (ui.serviceTalk?.face || null);
    const choices = h("div", { class: "gkChoices" });
    const list = Array.isArray(dialogue.choices) ? dialogue.choices : [];
    const closing = list.filter(function (c) { return c.action === "close" && !c.nextEntryRef; });
    const normal = list.filter(function (c) { return !closing.includes(c); });
    if (!serviceActive) for (const choice of normal) choices.append(choiceButton(choice));
    if (vendor) choices.append(h("button", { type: "button", class: "gkChoice gkChoice--service" + (ui.trade ? " gkOn" : ""), "data-act": "service", "data-kind": "vendor", "data-id": vendor.vendorId }, [ico("shop"), "Handelen"]));
    if (station) choices.append(h("button", { type: "button", class: "gkChoice gkChoice--service" + (ui.craft ? " gkOn" : ""), "data-act": "service", "data-kind": "station", "data-id": station.stationId }, [ico("anvil-impact"), "Maken"]));
    if (serviceActive) choices.append(h("button", { type: "button", class: "gkChoice", "data-act": "service-back" }, [ico("hand"), "Terug naar gesprek"]));
    else for (const choice of closing) choices.append(choiceButton(choice));
    const intro = h("div", { class: "gkTalkIntro" }, [
      h("div", { class: "gkTalkFace" }, [faceUrl ? h("img", { src: faceUrl, alt: "" }) : ico("talk")]),
      h("div", { class: "gkTalkBody" }, [
        h("div", { class: "gkTalkHead" }, [h("strong", { text: dialogue.speakerName || dialogue.displayName || "" }),
          h("button", { type: "button", class: "gkClose", "data-act": "talk-close", title: "Sluiten (Esc)" }, [ico("cancel")])]),
        h("div", { class: "gkTalkText", text: dialogue.text || "" }),
        choices
      ])
    ]);
    const serviceView = serviceActive ? h("section", { class: "gkTalkService" }, ui.trade ? sheetTrade() : sheetCraft()) : null;
    talk.classList.toggle("gkTalk--service", serviceActive);
    talk.replaceChildren(...[intro, serviceView].filter(Boolean));
    const nextBody = talk.querySelector(".gkTalkService .gkBody, .gkTalkService .gkCraftList");
    const nextTop = talk.querySelector(".gkTalkService .gkSplitTop");
    if (nextBody) nextBody.scrollTop = bodyScroll;
    if (nextTop) nextTop.scrollTop = topScroll;
    padGrids();
    function choiceButton(choice) {
      const id = String(choice.choiceId || "");
      const icon = id.startsWith("choice.ask.") || id.startsWith("quest.ask|") ? "scroll-unfurled" : id.startsWith("quest.pick|") ? "check-mark" : id.startsWith("choice.done.") || id.startsWith("choice.accept.") ? "check-mark"
        : choice.action === "close" ? "hand" : "talk";
      return h("button", { type: "button", class: "gkChoice", "data-act": "choice", "data-id": id, disabled: d.busy?.n04 ? true : null }, [ico(icon), stripEmoji(choice.label) || "Verder"]);
    }
  }

  function renderRail() {
    const p = root.dataset.panel;
    const m = root.dataset.mode;
    const tabs = visibleTabs();
    if (!tabs.some(function (tab) { return tab.id === store.tab; })) store.tab = tabs[0]?.id || "bag";
    const questDot = (data().s04?.quests?.active || []).some(function (quest) { return quest.activeStep?.complete; });
    const dockNow = root.dataset.dock || "";
    const signature = JSON.stringify([p, m, dockNow, store.tab, tabs.map(function (tab) { return tab.id; }), questDot]);
    if (ui.sig.rail === signature) return;
    ui.sig.rail = signature;
    rail.hidden = m === "trade" || m === "craft";
    const handleTitle = dockNow === "talk" ? "Gesprek sluiten" : p === "open" ? "Kleiner (alleen iconen)" : p === "dock" ? "Chat dicht" : "Dicht";
    const items = [h("button", { type: "button", class: "gkTab gkHandle", "data-act": "handle", title: handleTitle }, [h("b", { text: "›" })])];
    for (const tab of tabs) {
      const on = p === "open" && tab.id === store.tab;
      items.push(h("button", { type: "button", class: "gkTab" + (on ? " gkOn" : ""), "data-act": "tab", "data-id": tab.id, title: tab.title + (tab.key ? " (" + tab.key.slice(3) + ")" : ""), "aria-pressed": on ? "true" : "false" },
        [ico(tab.icon), tab.id === "quests" && questDot ? h("span", { class: "gkDot" }) : null]));
    }
    // Kevin (3-11): onderin wat geen tabblad is: Chat en (tijdens een gesprek) Gesprek.
    items.push(h("span", { class: "gkRailGap" }));
    railChat.classList.toggle("gkOn", dockNow === "chat");
    items.push(railChat);
    if (m === "talk") {
      railTalk.classList.toggle("gkOn", dockNow === "talk");
      items.push(railTalk);
    }
    rail.replaceChildren(...items);
  }

  // ---- het paneel: per tabblad een eigen inhoud; handelen en maken splitsen het paneel ----
  function renderSheet() {
    const p = root.dataset.panel;
    const m = root.dataset.mode;
    if (p !== "open") {
      if (ui.sig.sheet !== "closed") { ui.sig.sheet = "closed"; sheet.replaceChildren(); }
      return;
    }
    const d = data();
    const view = m === "trade" ? "trade" : m === "craft" ? "craft" : store.tab;
    const parts = [view, store.filter, store.item, store.quest, store.done, store.sectionFold, ui.sure, d.busy, ui.trade, ui.craft, store.minimap, store.music, store.size, store.combatFold, store.debug, store.icoSize, store.icoColor, store.icoAnim];
    // Healing (2-11): levens/mana veranderen elke seconde (regeneratie); de tas hoeft daarvoor niet opnieuw getekend te worden.
    if (view === "bag" || view === "trade" || view === "craft" || view === "gear") parts.push(d.s03?.inventory, d.s03?.equipment, d.s03?.currencies, d.s03?.catalog, Object.keys(d.s03?.itemCooldowns || {}));
    if (view === "gear") parts.push(d.s03?.stats);
    if (view === "trade") parts.push(api.vendor(ui.trade?.vendorId));
    if (view === "craft") parts.push(api.station(ui.craft?.stationId), d.s05?.crafting?.jobs);
    if (view === "quests") parts.push(d.s04?.quests, d.s04?.trackedQuest?.questId);
    if (view === "money") parts.push(d.s03?.currencies);
    if (view === "skills") parts.push(d.s03?.skills?.slots, (d.s03?.skills?.list || []).map(function (e) { return e.abilityId + (e.unlocked ? "" : ":" + e.lock); }), d.s03?.skills?.auto, d.s03?.progression?.level, d.isAdmin);
    if (view === "chars") parts.push(ui.chars, ui.charsBusy);
    if (view === "settings") parts.push(d.isAdmin, d.defeated, store.floatNums, store.nameWorld, store.namePlayers, store.nameSelf,
      store.healthPing, store.healthTps, store.healthMspt, store.healthCpu, store.healthGpu, store.healthPacketLoss, d.healthDefaults);
    const signature = JSON.stringify(parts);
    if (ui.sig.sheet === signature) return;
    const scrollKey = view === "bag" ? "bag:" + store.filter : view;
    const viewChanged = !ui.sig.sheet || ui.sig.sheet === "closed" || ui.sig.sheetView !== scrollKey;
    ui.sig.sheet = signature;
    ui.sig.sheetView = scrollKey;
    const oldBody = sheet.querySelector(".gkBody");
    const scrollTop = viewChanged ? num(store.scroll[scrollKey]) : (oldBody ? oldBody.scrollTop : num(store.scroll[scrollKey]));
    const oldTop = sheet.querySelector(".gkSplitTop");
    const topScroll = !viewChanged && oldTop ? oldTop.scrollTop : 0;
    const built = view === "bag" ? sheetBag() : view === "gear" ? sheetGear() : view === "skills" ? sheetSkills() : view === "quests" ? sheetQuests() : view === "money" ? sheetMoney()
      : view === "chars" ? sheetChars() : view === "settings" ? sheetSettings() : view === "logout" ? sheetLogout() : view === "trade" ? sheetTrade() : sheetCraft();
    replaceSheetChildren(built);
    if (!viewChanged) sheet.style.animation = "none";
    else sheet.style.animation = "";
    const body = sheet.querySelector(".gkBody");
    if (body) {
      body.scrollTop = scrollTop;
      body.addEventListener("scroll", function () {
        store.scroll[scrollKey] = Math.round(body.scrollTop);
        save();
      }, { passive: true });
    }
    const top = sheet.querySelector(".gkSplitTop");
    if (top) top.scrollTop = topScroll;
    padGrids();
  }

  // Houd een open itemkaart op zijn plek bij tasupdates. Zo herstarten het plaatje en de pop-animatie
  // niet wanneer er alleen een item wordt opgepakt of een actie tijdelijk op "bezig" springt.
  function replaceSheetChildren(built) {
    const oldDetail = Array.from(sheet.children).find(function (child) { return child.classList.contains("gkDetail"); }) || null;
    const newDetail = built.find(function (child) { return child?.classList?.contains("gkDetail"); }) || null;
    const keepDetail = oldDetail && newDetail && oldDetail.dataset.key === newDetail.dataset.key && oldDetail.dataset.itemId === newDetail.dataset.itemId;
    if (!keepDetail) {
      sheet.replaceChildren(...built);
      return;
    }
    const oldIcon = oldDetail.querySelector(":scope > .gkDetailIcon");
    const newChildren = Array.from(newDetail.children);
    if (oldIcon && newChildren[0]?.classList.contains("gkDetailIcon")) newChildren[0] = oldIcon;
    oldDetail.replaceChildren(...newChildren);
    for (const child of Array.from(sheet.children)) if (child !== oldDetail) child.remove();
    for (const child of built) if (child !== newDetail) sheet.insertBefore(child, oldDetail);
  }

  function head(icon, title, extra) {
    return h("div", { class: "gkSheetHead" }, [extra || h("h2", null, [ico(icon), title]),
      h("button", { type: "button", class: "gkClose", "data-act": "close", title: "Dicht (Esc)" }, [ico("cancel")])]);
  }

  function inventoryEntries() {
    const items = data().s03?.inventory?.items || [];
    return items.map(function (entry) {
      const def = catalogItem(entry.itemId) || {};
      const key = entry.kind === "instance" ? "inst:" + entry.instanceId : "stack:" + entry.itemId;
      // Stap 4: questitems staan altijd in het eigen vak 🔑 Quest.
      return { key, entry, def, category: def.questItem ? "quest" : (def.category || entry.category || "misc"), name: def.displayName || entry.displayName || entry.itemId };
    }).sort(function (a, b) {
      const order = ["equipment", "consumable", "material", "quest", "misc", "custom"];
      return order.indexOf(a.category) - order.indexOf(b.category) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
    });
  }
  function filterMatch(category, filter) {
    if (filter === "all") return true;
    if (filter === "misc") return category === "misc" || category === "custom";
    return category === filter;
  }
  function bagCell(item, extra = {}) {
    const def = item.def;
    const qty = item.entry.kind === "stack" ? num(item.entry.quantity, 1) : 1;
    return h("button", { type: "button", class: "gkCell" + (extra.on ? " gkOn" : "") + (extra.no ? " gkNo" : ""), "data-act": extra.act || "item", "data-key": item.key,
      "data-rarity": def.rarity || item.entry.rarity || "common", title: item.name, "data-drag": extra.drag || null },
    [itemVisual(item.entry.itemId), qty > 1 ? h("b", { text: fmt(qty) }) : null,
      num(def.useCooldownS) > 0 ? h("em", { class: "gkCd", "data-cd": item.entry.itemId, hidden: true }) : null]);
  }
  function emptyCells(count, min = 20) {
    const cells = [];
    for (let i = count; i < Math.max(min, count); i += 1) cells.push(h("div", { class: "gkCell gkEmpty", "aria-hidden": "true" }));
    return cells;
  }
  // Na het tekenen: de laatste rij vol maken met lege vakjes, zoals een echte tas.
  function padGrids() {
    for (const grid of root.querySelectorAll(".gkSheet .gkGrid, .gkTalkService .gkGrid")) {
      const columns = String(window.getComputedStyle(grid).gridTemplateColumns || "").split(" ").filter(Boolean).length;
      if (columns < 2) continue;
      for (const extra of grid.querySelectorAll(".gkPad")) extra.remove();
      const missing = (columns - (grid.children.length % columns)) % columns;
      for (let i = 0; i < missing; i += 1) grid.append(h("div", { class: "gkCell gkEmpty gkPad", "aria-hidden": "true" }));
    }
  }
  function bagFoot(count) {
    const list = currencies();
    const main = list[0];
    return h("div", { class: "gkFoot" }, [main ? coin(main.amount, main.currencyId) : null, h("span", { text: count + (count === 1 ? " ding" : " dingen") })]);
  }

  function sheetBag() {
    const all = inventoryEntries();
    const presentFilters = FILTERS.filter(function (filter) {
      return filter.id === "all" || all.some(function (item) { return filterMatch(item.category, filter.id); });
    });
    if (!presentFilters.some(function (filter) { return filter.id === store.filter; })) store.filter = "all";
    const filters = h("div", { class: "gkFilters", role: "tablist" }, presentFilters.map(function (filter) {
      return h("button", { type: "button", class: "gkFilter" + (filter.id === store.filter ? " gkOn" : ""), "data-act": "filter", "data-id": filter.id, title: filter.title }, [ico(filter.icon)]);
    }));
    const shown = all.filter(function (item) { return filterMatch(item.category, store.filter); });
    const body = h("div", { class: "gkBody" });
    if (!all.length) body.append(emptyNote("knapsack", "Je tas is nog leeg. Pak iets op of verzamel iets in de wereld."));
    else body.append(h("div", { class: "gkGrid" }, shown.map(function (item) { return bagCell(item, { on: item.key === store.item }); }).concat(emptyCells(shown.length))));
    const parts = [head("knapsack", "Tas", filters), body, bagFoot(all.length)];
    const detail = itemDetail(store.item);
    if (detail) parts.push(detail);
    return parts;
  }

  function emptyNote(icon, text) {
    return h("div", { class: "gkEmptyNote" }, [ico(icon), text]);
  }

  // Item-kaart onderin het paneel: plaatje, naam, wat het doet en de knoppen.
  function itemDetail(key, options = {}) {
    if (!key) return null;
    const d = data();
    let item = null;
    let equipped = null;
    if (key.startsWith("eq:")) {
      equipped = (d.s03?.equipment || []).find(function (row) { return row.slotId === key.slice(3); }) || null;
      if (!equipped) return null;
    } else {
      item = inventoryEntries().find(function (entry) { return entry.key === key; }) || null;
      if (!item) return null;
    }
    const itemId = equipped ? equipped.itemId : item.entry.itemId;
    const def = catalogItem(itemId) || {};
    const title = def.displayName || equipped?.displayName || item?.name || itemId;
    const rarity = def.rarity || "common";
    const stats = [];
    if (def.attackPowerBonus) stats.push(stat("broadsword", "+" + def.attackPowerBonus + " kracht"));
    if (def.armorBonus) stats.push(stat("checked-shield", "+" + def.armorBonus + " pantser"));
    if (def.healAmount) stats.push(stat("heart-plus", "+" + def.healAmount + " levens"));
    // Healing (2-11): wat het effect doet en hoe lang, en de wachttijd.
    if (def.effect) {
      for (const text of def.effect.lines || []) stats.push(stat("sparkles", text));
      stats.push(stat("hourglass", formatDuration(def.effect.durationMs)));
    }
    if (num(def.useCooldownS) > 0) stats.push(stat("hourglass", "wachttijd " + formatDuration(num(def.useCooldownS) * 1000)));
    if (def.vendorValue) stats.push(h("span", { class: "gkStat" }, [coin(def.vendorValue, currencies()[0]?.currencyId), "waarde"]));
    const busy = d.busy?.n03 || d.busy?.n05;
    const buttons = [];
    if (options.sell) {
      buttons.push(h("button", { type: "button", class: "gkBtn gkGo", "data-act": "sell", "data-id": options.sell.offerId, disabled: busy || !options.sell.canSell ? true : null },
        [ico("two-coins", "plain"), "Verkopen ", coin(options.sell.buyPriceMinor, options.sell.buyCurrencyRef)]));
    }
    if (equipped) {
      buttons.push(h("button", { type: "button", class: "gkBtn", "data-act": "unequip", "data-id": equipped.slotId, disabled: busy ? true : null }, [ico("knapsack", "plain"), "Uitdoen"]));
    } else {
      if (def.equipSlot) buttons.push(h("button", { type: "button", class: "gkBtn gkGo", "data-act": "equip", "data-key": key, disabled: busy ? true : null }, [ico(SLOT_ICON[slotKey(def.equipSlot)] || "broadsword", "plain"), "Uitrusten"]));
      if (num(def.healAmount) > 0 || def.effect) {
        const waiting = cooldownLeft(itemId) > 0;
        buttons.push(h("button", { type: "button", class: "gkBtn gkGo", "data-act": "use", "data-id": itemId, disabled: busy || waiting ? true : null },
          [ico(def.effect ? "sparkles" : "heart-plus", "plain"), "Gebruiken", h("em", { class: "gkCd gkCdBtn", "data-cd": itemId, hidden: true })]));
      }
      if (!def.questItem && !options.sell) {
        const sure = ui.sure === "destroy:" + key;
        buttons.push(h("button", { type: "button", class: "gkBtn gkWarn" + (sure ? " gkSure" : ""), "data-act": "destroy", "data-key": key, disabled: busy ? true : null },
          [ico("trash-can", "plain"), sure ? "Zeker? Tik nog eens" : "Weggooien"]));
      }
    }
    const qty = item?.entry.kind === "stack" ? num(item.entry.quantity, 1) : 1;
    const line = [RARITY_LABEL[rarity] || "", CATEGORY_LABEL[def.category] || "", qty > 1 ? qty + " stuks" : "", equipped ? "Gedragen: " + (equipped.slotName || "") : ""].filter(Boolean).join(" · ");
    return h("div", { class: "gkDetail", role: "dialog", "data-key": key, "data-item-id": itemId }, [
      h("div", { class: "gkDetailIcon" }, [h("div", { class: "gkCell", "data-rarity": rarity }, [itemVisual(itemId, equipped?.slotId)])]),
      h("h3", { class: "gkRarity-" + rarity }, [h("span", { text: title }), h("button", { type: "button", class: "gkClose", "data-act": "detail-close", title: "Sluiten" }, [ico("cancel")])]),
      h("p", { text: line }),
      stats.length ? h("div", { class: "gkStats" }, stats) : null,
      buttons.length ? h("div", { class: "gkBtns" }, buttons) : null
    ]);
  }
  function stat(icon, text) {
    return h("span", { class: "gkStat" }, [ico(icon), text]);
  }

  function sheetGear() {
    const d = data();
    const slots = d.s03?.catalog?.equipmentSlots || [];
    const worn = new Map((d.s03?.equipment || []).map(function (row) { return [row.slotId, row]; }));
    const slotButton = function (slot) {
      const row = worn.get(slot.slotId);
      const key = "eq:" + slot.slotId;
      return h("div", null, [
        h("button", { type: "button", class: "gkCell gkSlot" + (store.item === key ? " gkOn" : ""), "data-act": "slot", "data-id": slot.slotId, title: slot.displayName,
          "data-rarity": row ? (catalogItem(row.itemId)?.rarity || row.rarity || "common") : null },
        [row ? itemVisual(row.itemId, slot.slotId) : h("span", { class: "gkSlotIcon", style: "display:block;width:100%;height:100%" }, [ico(SLOT_ICON[slotKey(slot.slotId)] || "cardboard-box")])]),
        h("span", { class: "gkSlotName", text: slot.displayName })
      ]);
    };
    const left = slots.filter(function (slot) { return !RIGHT_SLOTS.has(slotKey(slot.slotId)); });
    const right = slots.filter(function (slot) { return RIGHT_SLOTS.has(slotKey(slot.slotId)); });
    const portraitUrl = api.assetUrl(d.player?.modelAssetId, true);
    const bonus = { attack: 0, armor: 0 };
    for (const row of worn.values()) {
      const def = catalogItem(row.itemId) || {};
      bonus.attack += num(def.attackPowerBonus);
      bonus.armor += num(def.armorBonus);
    }
    const byId = d.s03?.stats?.byId || {};
    const base = function (statId) { const row = byId[statId]; return row ? num(row.baseValue) + num(row.earnedValue) : 0; };
    const health = healthOf(d.s03);
    const statRow = function (icon, label, value, extra) {
      return h("div", { class: "gkStat" }, [h("span", null, [ico(icon), label]), h("b", { text: value + (extra ? " (+" + extra + ")" : "") })]);
    };
    const body = h("div", { class: "gkBody" }, [
      h("div", { class: "gkDoll" }, [
        h("div", { class: "gkDollCol" }, left.map(slotButton)),
        h("div", { class: "gkDollMid" }, [h("div", { class: "gkPortrait" }, [portraitUrl ? h("img", { src: portraitUrl, alt: "" }) : ico("pointy-hat")]),
          h("strong", { text: (d.player?.className || "") + " · Level " + (d.s03?.progression?.level || 1) })]),
        h("div", { class: "gkDollCol" }, right.map(slotButton))
      ]),
      h("div", { class: "gkStatGrid" }, [
        statRow("hearts", "Levens", fmt(health.cur) + " / " + fmt(health.max)),
        statRow("broadsword", "Kracht", fmt(base("stat.attack_power") + bonus.attack), bonus.attack),
        statRow("checked-shield", "Pantser", fmt(base("stat.armor") + bonus.armor), bonus.armor),
        statRow("healing", "Heal-kracht", fmt(base("stat.heal_power")))
      ])
    ]);
    const parts = [head("visored-helm", "Uitrusting"), body];
    const detail = store.item && store.item.startsWith("eq:") ? itemDetail(store.item) : null;
    if (detail) parts.push(detail);
    return parts;
  }

  function sheetQuests() {
    const d = data();
    const quests = d.s04?.quests || {};
    const trackedId = d.s04?.trackedQuest?.questId || null;
    const targets = d.s04?.questTargets || [];
    const body = h("div", { class: "gkBody" });
    const list = h("div", { class: "gkList" });
    const active = quests.active || [];
    const completed = quests.completed || [];
    // Behaald = al eens ingeleverd en kan (nu of later) nog een keer: grijs met ↻. Kan niet meer = Archief.
    const later = function (quest) { return quest.repeatMode === "daily" || quest.repeatMode === "weekly" || quest.repeatMode === "cooldown"; };
    const again = (quests.again || []).concat(completed.filter(later));
    const archive = completed.filter(function (quest) { return !later(quest); });
    // Stap 6: te laat = mislukt, met ↻ Opnieuw.
    const failed = quests.failed || [];
    // Stap 2: een groepslid deelt een quest met je.
    const shares = d.s04?.questShares || [];
    if (shares.length) list.append(sectionGroup("quests-shared", "Gedeeld met jou", shares.map(function (offer) {
      const busy = d.busy?.n04;
      return h("div", { class: "gkCard gkOn" }, [
        h("h3", null, [ico("three-friends"), h("span", { text: offer.displayName }), h("small", { text: "van " + offer.fromName })]),
        h("div", { class: "gkBtns" }, [
          h("button", { type: "button", class: "gkBtn gkGo", "data-act": "quest-share-accept", "data-id": offer.questId, disabled: busy ? true : null }, [ico("check-mark", "plain"), "Aannemen"]),
          h("button", { type: "button", class: "gkBtn", "data-act": "quest-share-decline", "data-id": offer.questId, disabled: busy ? true : null }, [ico("cancel", "plain"), "Nee"])])]);
    })));
    if (!shares.length && !active.length && !again.length && !archive.length && !failed.length) list.append(emptyNote("scroll-unfurled", "Nog geen quests aangenomen. Zoek een questgever op de kaart."));
    if (active.length) list.append(sectionGroup("quests-active", "Bezig", active.map(function (quest) {
      return questCard(quest, quest.questId === trackedId, targets.find(function (t) { return t.questId === quest.questId; }));
    })));
    if (failed.length) list.append(sectionGroup("quests-failed", "Mislukt", failed.map(function (quest) {
      return questCard(quest, false, null);
    })));
    if (again.length) list.append(sectionGroup("quests-again", "Behaald", again.map(function (quest) {
      return questCard(quest, false, null);
    })));
    if (archive.length) {
      list.append(h("button", { type: "button", class: "gkRow", "data-act": "quests-done" }, [ico("check-mark"), h("span", { text: "Archief (" + archive.length + ")" }), h("b", { text: store.done ? "▾" : "▸" })]));
      if (store.done) for (const quest of archive) list.append(questCard(quest, false, null));
    }
    body.append(list);
    return [head("scroll-unfurled", "Quests"), body];
  }
  function questCard(quest, tracked, target) {
    const step = quest.activeStep || null;
    const later = repeatText(quest);
    const status = quest.status === "failed" ? "❌ Mislukt" : quest.status === "completed" ? later : quest.doneBefore ? "↻ Kan nog een keer" : quest.status === "available" ? "Te halen" : step?.rewardChoice ? "🎁 Kies je beloning" : step?.complete ? "Klaar! Ga terug" : tracked ? "Volg je" : "";
    const grey = quest.doneBefore ? (quest.status === "completed" && later === "Behaald" ? " gkGrey gkArchive" : " gkGrey") : "";
    const card = h("div", { class: "gkCard" + (tracked ? " gkOn" : "") + grey, "data-quest": quest.questId }, [
      h("h3", null, [ico(quest.status === "completed" || step?.complete ? "check-mark" : "scroll-unfurled"), h("span", { text: quest.displayName }), status ? h("small", { text: status }) : null])
    ]);
    const text = step?.instruction || quest.summary || quest.description || "";
    if (text) card.append(h("p", { text }));
    // Stap 6: de klok van deze stap, en wat er gebeurt als je te laat bent.
    const clock = clockBadge(step?.timer, "gkCardClock");
    if (clock) card.append(h("div", { class: "gkQuestTimer" }, [clock, h("small", { text: step.timer.late === "restart" ? "te laat = stap opnieuw" : step.timer.late === "step" ? "te laat = andere stap" : "te laat = mislukt" })]));
    if (quest.status === "failed") card.append(h("p", { class: "gkFailed", text: "Je was te laat. Probeer het opnieuw." }));
    // Quest Builder stap 1: elk doel van de stap met een vinkje en (bij tellen) "0 / 2". Bonus/mag staat erbij.
    for (const objective of step?.objectives || []) {
      const required = Math.max(1, num(objective.requiredValue, 1));
      const current = Math.min(required, num(objective.currentValue));
      const counts = COUNTED_GOALS.has(objective.objectiveType) || required > 1;
      // Stap 9: wereld-event = één teller voor iedereen die meedoet.
      const extra = (objective.team ? (objective.team.event ? " 🌍 " + objective.team.size + " spelers" : " 👥 team " + objective.team.size) + (objective.team.waiting ? " ⏸️ wacht op je groep" : "") : "") + (objective.role === "bonus" ? " (bonus)" : objective.role === "optional" ? " (mag)" : "");
      card.append(h("div", { class: "gkObjective" + (objective.complete ? " gkOk" : "") }, [
        h("span", { text: (objective.complete ? "✓ " : "") + (objective.instruction || objective.displayName || "") + extra }),
        counts ? h("b", { text: fmt(current) + " / " + fmt(required) }) : null]));
      if (required > 1) card.append(h("div", { class: "gkProgress" }, [h("i", { style: "width:" + Math.round(current / required * 100) + "%" })]));
    }
    const rewards = (quest.rewards || []).map(function (reward) {
      if (reward.kind === "xp") return stat("round-star", fmt(reward.amount) + " XP");
      if (reward.kind === "currency") return h("span", { class: "gkStat" }, [coin(reward.amount, reward.currencyId)]);
      return h("span", { class: "gkStat" }, [h("span", { style: "width:16px;height:16px;display:inline-block" }, [itemVisual(reward.itemId)]), reward.amount + "× " + (reward.displayName || "")]);
    });
    if (rewards.length && quest.status !== "completed") card.append(h("div", { class: "gkRewards" }, rewards));
    // Stap 7: einde met "Speler kiest 1": tik op de beloning die je wilt.
    if (Array.isArray(step?.rewardChoice) && step.rewardChoice.length) {
      card.append(h("div", { class: "gkBtns" }, step.rewardChoice.map(function (reward) {
        const label = reward.kind === "currency" ? [coin(reward.amount, reward.currencyId)]
          : [h("span", { style: "width:16px;height:16px;display:inline-block" }, [itemVisual(reward.itemId)]), reward.amount + "× " + (reward.displayName || "")];
        return h("button", { type: "button", class: "gkBtn gkGo", "data-act": "quest-reward", "data-id": quest.questId, "data-index": String(reward.index), disabled: data().busy?.n04 ? true : null }, label);
      })));
    }
    const buttons = [];
    const busy = data().busy?.n04;
    if (tracked && target) buttons.push(h("button", { type: "button", class: "gkBtn gkGo", "data-act": "quest-go", "data-id": target.instanceId, "data-quest": quest.questId, disabled: busy ? true : null }, [ico("position-marker", "plain"), "Ga erheen"]));
    if (!tracked && (quest.status === "active" || quest.status === "ready_to_turn_in")) buttons.push(h("button", { type: "button", class: "gkBtn", "data-act": "quest-track", "data-id": quest.questId, disabled: busy ? true : null }, [ico("compass", "plain"), "Volgen"]));
    if (quest.status === "failed") buttons.push(h("button", { type: "button", class: "gkBtn gkGo", "data-act": "quest-retry", "data-id": quest.questId, disabled: busy ? true : null }, [ico("check-mark", "plain"), "↻ Opnieuw"]));
    if (quest.doneBefore && quest.status === "available" && quest.giverTargetId) buttons.push(h("button", { type: "button", class: "gkBtn gkGo", "data-act": "quest-again", "data-id": quest.giverTargetId, disabled: busy ? true : null }, [ico("position-marker", "plain"), "↻ Ga"]));
    // Stap 2: deel je quest met je groep (alleen als je in een groep zit).
    const inParty = (data().party?.members || []).length > 1;
    if (inParty && (quest.status === "active" || quest.status === "ready_to_turn_in")) buttons.push(h("button", { type: "button", class: "gkBtn", "data-act": "quest-share", "data-id": quest.questId, disabled: busy ? true : null }, [ico("three-friends", "plain"), "Delen"]));
    // Quest verlaten: je voortgang gaat weg; daarna kun je hem opnieuw aannemen bij de NPC (dan op de nieuwste versie).
    // Stap 4: een quest die vanzelf start kun je niet verlaten.
    if ((quest.status === "active" || quest.status === "ready_to_turn_in") && quest.canAbandon !== false) {
      const sure = ui.sure === "quest-abandon:" + quest.questId;
      buttons.push(h("button", { type: "button", class: "gkBtn gkWarn" + (sure ? " gkSure" : ""), "data-act": "quest-abandon", "data-id": quest.questId, disabled: busy ? true : null },
        [ico("cancel", "plain"), sure ? "Zeker? Tik nog eens" : "Verlaten"]));
    }
    if (buttons.length) card.append(h("div", { class: "gkBtns" }, buttons));
    return card;
  }

  function sectionGroup(id, label, children, foldedByDefault = false) {
    const saved = Object.prototype.hasOwnProperty.call(store.sectionFold, id) ? store.sectionFold[id] : foldedByDefault;
    const folded = Boolean(saved);
    return h("section", { class: "gkSectionGroup" }, [
      h("button", { type: "button", class: "gkSection", "data-act": "section", "data-id": id, "aria-expanded": folded ? "false" : "true" },
        [h("span", { text: label }), h("b", { text: folded ? "▸" : "▾" })]),
      h("div", { class: "gkSectionBody", hidden: folded }, children)
    ]);
  }

  function sheetMoney() {
    const list = currencies();
    const body = h("div", { class: "gkBody" }, [h("div", { class: "gkList" }, list.length ? list.map(function (c) {
      return h("div", { class: "gkCard gkMoney" }, [h("span", { class: "gkMoneyIcon" }, [currencyVisual(c.currencyId)]), h("strong", { text: c.displayName }), h("b", { text: fmt(c.amount) })]);
    }) : [emptyNote("two-coins", "Er is nog geen geld in deze wereld.")])]);
    return [head("two-coins", "Geld"), body];
  }

  // Fase 5: 📖 vaardigheden. Vak 1 = vaste auto-aanval; de rest sleep je naar vak 2 of 3 (of tik op 2/3).
  // Vergrendeld zegt waarom. Een admin-account krijgt de maker-knoppen (level, XP).
  function sheetSkills() {
    const sk = skillsData();
    const level = Math.max(1, num(data().s03?.progression?.level, 1));
    const list = h("div", { class: "gkList" });
    if (sk?.auto) list.append(skillCard(sk.auto, { auto: true }));
    const entries = sk?.list || [];
    if (!entries.length) list.append(emptyNote("spell-book", "Je klasse heeft nog geen vaardigheden voor vak 2 en 3. De maker zet ze in de editor bij Instellingen > Klassen."));
    for (const entry of entries) list.append(skillCard(entry, { slots: sk.slots || {} }));
    const intro = h("p", { class: "gkSkillIntro", text: "Level " + level + ". Vak 1 slaat vanzelf door zolang je een vijand als doel hebt. Sleep een vaardigheid naar vak 2 of 3, of tik op 2 of 3." });
    const body = h("div", { class: "gkBody" }, [intro, list, data().isAdmin ? makerBox(level) : null]);
    return [head("spell-book", "Vaardigheden"), body];
  }
  function skillCard(entry, opts) {
    const facts = [opts.auto ? "Auto-aanval" : entry.kind === "heal" ? "Genezen" : "Schade", entry.manaCost ? entry.manaCost + " mana" : null,
      (Math.round(num(entry.cooldownMs) / 100) / 10) + " s", (Math.round(num(entry.rangeM) * 10) / 10) + " m"].filter(Boolean).join(" · ");
    const right = [];
    if (opts.auto) right.push(h("span", { class: "gkSkillTag", text: "Vak 1" }));
    else if (!entry.unlocked) right.push(h("button", { type: "button", class: "gkSkillLock", "data-act": "skill-locked", "data-id": entry.abilityId }, [ico("padlock"), h("span", { text: entry.lockText || "vergrendeld" })]));
    else for (const slot of [2, 3]) {
      right.push(h("button", { type: "button", class: "gkSkillPut" + (opts.slots[slot] === entry.abilityId ? " gkOn" : ""), "data-act": "skill-put", "data-id": entry.abilityId, "data-slot": String(slot), title: "Op vak " + slot + " zetten" }, [String(slot)]));
    }
    const drag = !opts.auto && entry.unlocked;
    return h("div", { class: "gkCard gkSkill" + (!opts.auto && !entry.unlocked ? " gkLocked" : ""), draggable: drag ? "true" : null, "data-drag-skill": drag ? entry.abilityId : null,
      title: drag ? "Sleep naar vak 2 of 3" : null }, [
      h("span", { class: "gkSkillIco" }, [ico(skillIcon(entry))]),
      h("div", { class: "gkSkillText" }, [h("strong", { text: entry.displayName }), h("small", { text: facts })]),
      h("div", { class: "gkSkillBtns" }, right)
    ]);
  }
  function makerBox(level) {
    return h("div", { class: "gkCard gkMaker" }, [
      h("strong", null, [ico("crown"), "Maker"]),
      h("div", { class: "gkBtns" }, [
        h("button", { type: "button", class: "gkBtn", "data-act": "maker-level", "data-id": String(Math.max(1, level - 1)), title: "Een level omlaag" }, ["Level −"]),
        h("button", { type: "button", class: "gkBtn gkGo", "data-act": "maker-level", "data-id": String(level + 1), title: "Een level omhoog" }, ["Level +"]),
        h("button", { type: "button", class: "gkBtn", "data-act": "maker-xp", "data-id": "100", title: "100 XP erbij" }, ["+100 XP"])
      ])
    ]);
  }

  // Characters: per klasse een eigen character met eigen tas, level en plek. Wisselen laadt de game opnieuw.
  function loadCharacters(force) {
    if (ui.charsBusy || (!force && ui.chars && performance.now() - ui.charsAt < 20000)) return;
    ui.charsBusy = true;
    api.fetchJson("/api/game/characters").then(function (result) {
      ui.chars = { classes: Array.isArray(result?.classes) ? result.classes : [] };
    }).catch(function (error) {
      ui.chars = { classes: [], error: error?.message || "Laden lukte niet." };
    }).finally(function () {
      ui.charsBusy = false;
      ui.charsAt = performance.now();
      renderSheet();
    });
  }
  function sheetChars() {
    loadCharacters(false);
    const body = h("div", { class: "gkBody" });
    const list = h("div", { class: "gkList" });
    if (!ui.chars) list.append(emptyNote("hourglass", "Laden..."));
    else if (ui.chars.error) list.append(emptyNote("info", ui.chars.error));
    else if (!ui.chars.classes.length) list.append(emptyNote("pointy-hat", "Er zijn nog geen klassen. Maak ze in de editor onder Instellingen > Klassen."));
    for (const entry of ui.chars?.classes || []) {
      const character = entry.character;
      const status = character ? (character.active ? "Je speelt nu" : "Level " + character.level) : "Nog niet gespeeld";
      const card = h("div", { class: "gkCard" + (character?.active ? " gkOn" : "") }, [
        h("h3", null, [ico("pointy-hat"), h("span", { text: entry.displayName }), h("small", { text: status })]),
        h("div", { class: "gkStats" }, [stat("hearts", fmt(entry.healthMax)), stat("broadsword", fmt(entry.attackPower)), stat("checked-shield", fmt(entry.armor)), stat("healing", fmt(entry.healPower))]),
        entry.description ? h("p", { text: entry.description }) : null
      ]);
      const models = Array.isArray(entry.models) ? entry.models : [];
      if (models.length > 1) {
        const current = character?.modelAssetId || models[0];
        card.append(h("div", { class: "gkLooks" }, models.map(function (assetId) {
          const url = api.assetUrl(assetId, true);
          return h("button", { type: "button", class: "gkLook" + (assetId === current ? " gkOn" : ""), "data-act": "play", "data-class": entry.classId, "data-model": assetId, title: "Dit uiterlijk" },
            [url ? h("img", { src: url, alt: "" }) : ico("person")]);
        })));
      }
      if (!character?.active) card.append(h("div", { class: "gkBtns" }, [h("button", { type: "button", class: "gkBtn gkGo", "data-act": "play", "data-class": entry.classId },
        [ico(character ? "pointy-hat" : "sparkles", "plain"), character ? "Spelen" : "Nieuw character"])]));
      list.append(card);
    }
    body.append(list);
    return [head("pointy-hat", "Characters"), body];
  }

  function sheetSettings() {
    const d = data();
    const toggle = function (id, icon, label, note, on) {
      return h("div", { class: "gkRow" }, [ico(icon), h("span", null, [label, note ? h("small", { text: note }) : null]),
        h("button", { type: "button", class: "gkSwitch" + (on ? " gkOn" : ""), "data-act": "set", "data-id": id, role: "switch", "aria-checked": on ? "true" : "false", title: label })]);
    };
    const sizes = h("div", { class: "gkSeg" }, [["s", "S"], ["m", "M"], ["l", "L"]].map(function (pair) {
      return h("button", { type: "button", class: store.size === pair[0] ? "gkOn" : null, "data-act": "size", "data-id": pair[0] }, [pair[1]]);
    }));
    const serverRows = [
      toggle("healthPing", "info", "Ping", "Vertraging van jouw verbinding met de server.", healthSettingOn("healthPing")),
      toggle("healthTps", "hourglass", "TPS", "Werkelijke server-ticks per seconde.", healthSettingOn("healthTps")),
      toggle("healthMspt", "hourglass", "MSPT", "Gemiddelde rekentijd van één server-tick.", healthSettingOn("healthMspt")),
      toggle("healthCpu", "cog", "Server-CPU", "Belasting van het game-serverproces.", healthSettingOn("healthCpu")),
      toggle("healthGpu", "cog", "GPU", "Belasting van de grafische kaart van jouw apparaat.", healthSettingOn("healthGpu")),
      toggle("healthPacketLoss", "info", "Packet loss", "Recente ping-metingen zonder antwoord.", healthSettingOn("healthPacketLoss"))
    ];
    const viewRows = [
      toggle("minimap", "compass", "Minimap", "Rechtsboven. Klik op de kaart om te lopen; zoom alleen met de ronde knop rechtsonder. M of de kaartknop opent de grote kaart.", store.minimap),
      h("div", { class: "gkRow" }, [ico("treasure-map"), h("span", null, ["Kaarten", h("small", { text: "Wat je op de grote en kleine kaart ziet, grootte van de kaarticonen, je pin." })]),
        h("button", { type: "button", class: "gkBtn", "data-act": "bigmap-open" }, ["Instellen"])]),
      toggle("nameWorld", "talk", "Namen van NPC's en spullen", "Boven NPC's, vijanden, grondstoffen en items.", store.nameWorld),
      toggle("namePlayers", "person", "Namen van andere spelers", null, store.namePlayers),
      toggle("nameSelf", "person", "Mijn eigen naam", "Boven je eigen poppetje.", store.nameSelf),
      has("float_numbers_hud") ? toggle("floatNums", "heart-plus", "Zwevende getallen", "Klein boven spelers en vijanden: rood schade, groen genezen, blauw mana.", store.floatNums !== false) : null,
      toggle("music", store.music ? "musical-notes" : "speaker-off", "Muziek", null, store.music),
      toggle("combatFold", "crossed-swords", "Paneel klein tijdens gevecht", "Op een telefoon of smal venster: na het gevecht komt het terug.", store.combatFold),
      h("div", { class: "gkRow" }, [ico("resize"), h("span", null, ["Grootte van het scherm", h("small", { text: "Knoppen, kaart en paneel." })]), sizes]),
      h("div", { class: "gkRow" }, [ico("sparkles"), h("span", null, ["Scherpte", h("small", { text: "1 = standaard. Hoger is scherper (fijn op een telefoon), maar zwaarder voor de computer." })]),
        h("div", { class: "gkSeg" }, PIXEL_STEPS.map(function (step) {
          return h("button", { type: "button", class: Number(store.pixels) === step ? "gkOn" : null, "data-act": "pixels", "data-id": String(step) }, [String(step)]);
        }))]),
      h("div", { class: "gkRow" }, [ico("knapsack"), h("span", null, ["Grootte van de iconen", h("small", { text: "Alleen de plaatjes, niet de knoppen." })]),
        h("div", { class: "gkSeg" }, [["s", "S"], ["m", "M"], ["l", "L"]].map(function (pair) {
          return h("button", { type: "button", class: store.icoSize === pair[0] ? "gkOn" : null, "data-act": "icosize", "data-id": pair[0] }, [pair[1]]);
        }))]),
      h("div", { class: "gkRow" }, [ico("palette"), h("span", null, ["Kleur van de iconen", h("small", { text: "Kleur = elk icoon zijn eigen kleur." })]),
        h("div", { class: "gkSeg" }, ICON_COLORS.map(function (pair) {
          return h("button", { type: "button", class: (store.icoColor === pair[0] ? "gkOn" : "") + " gkSwatch gkSwatch--" + pair[0], "data-act": "icocolor", "data-id": pair[0], title: pair[1] }, [pair[1]]);
        }))]),
      toggle("icoAnim", "sparkles", "Bewegende iconen", "Het actieve tabblad en de knoppen bewegen zachtjes.", store.icoAnim),
      d.isAdmin ? toggle("debug", "crown", "Prestatie-info (admin)", "FPS, frame-tijd, GPU en netwerk linksonder.", store.debug) : null
    ].filter(Boolean);
    const list = h("div", { class: "gkList" }, [
      h("div", { class: "gkRow" }, [ico("magic-portal"), h("span", null, ["Vastgelopen?", h("small", { text: "Terug naar je laatste portal of respawnplek." })]),
        h("button", { type: "button", class: "gkBtn", "data-act": "unstuck", disabled: d.busy?.n03 || d.defeated }, ["Unstuck"])]),
      sectionGroup("settings-server", "Serverstatus onderin", serverRows, true),
      sectionGroup("settings-view", "Spelbeeld", viewRows, true),
      h("p", { class: "gkCredits" }, ["Iconen: ", h("a", { href: "https://game-icons.net", target: "_blank", rel: "noopener", text: "game-icons.net" }), " (Lorc, Delapouite en anderen), CC BY 3.0"])
    ]);
    return [head("cog", "Instellingen"), h("div", { class: "gkBody" }, [list])];
  }

  function sheetLogout() {
    return [head("exit-door", "Uitloggen"), h("div", { class: "gkBody" }, [h("div", { class: "gkList" }, [
      emptyNote("exit-door", "Wil je stoppen met spelen? Je character, tas en plek blijven bewaard."),
      h("div", { class: "gkBtns" }, [h("button", { type: "button", class: "gkBtn gkWarn", "data-act": "logout" }, [ico("exit-door", "plain"), "Uitloggen"]),
        h("button", { type: "button", class: "gkBtn", "data-act": "close" }, [ico("check-mark", "plain"), "Blijven"])])
    ])])];
  }

  function sheetTrade() {
    const d = data();
    const vendor = api.vendor(ui.trade?.vendorId);
    if (!vendor) return [h("div", { class: "gkBody" }, [emptyNote("shop", "Deze winkel is er niet meer.")])];
    const offers = (vendor.offers || []).filter(function (offer) { return ["sell_to_player", "both"].includes(offer.mode); });
    const wares = h("div", { class: "gkGrid", "data-drop": "wares" }, offers.map(function (offer) {
      const def = catalogItem(offer.itemRef) || {};
      return h("button", { type: "button", class: "gkCell" + (ui.trade.offerId === offer.offerId ? " gkOn" : "") + (offer.canBuy ? "" : " gkNo"), "data-act": "ware", "data-id": offer.offerId,
        "data-rarity": def.rarity || "common", title: (offer.displayName || def.displayName || offer.itemRef) + " kopen", "data-drag": "buy:" + offer.offerId },
      [itemVisual(offer.itemRef), h("span", { class: "gkPrice" }, [currencyVisual(offer.sellCurrencyRef), fmt(offer.sellPriceMinor)])]);
    }));
    const top = h("div", { class: "gkBody" }, [offers.length ? wares : emptyNote("shop", "Deze winkel verkoopt niets.")]);
    const selected = offers.find(function (offer) { return offer.offerId === ui.trade.offerId; });
    if (selected) {
      top.append(h("div", { class: "gkBar" }, [h("div", { class: "gkCell", "data-rarity": catalogItem(selected.itemRef)?.rarity || "common" }, [itemVisual(selected.itemRef)]),
        h("span", { text: (selected.displayName || selected.itemRef) + (selected.owned ? " · je hebt er " + fmt(selected.owned) : "") }),
        h("button", { type: "button", class: "gkBtn gkGo", "data-act": "buy", "data-id": selected.offerId, disabled: d.busy?.n05 || !selected.canBuy ? true : null },
          [ico("two-coins", "plain"), "Kopen ", coin(selected.sellPriceMinor, selected.sellCurrencyRef)])]));
    }
    return [top];
  }

  function sheetCraft() {
    const d = data();
    const station = api.station(ui.craft?.stationId);
    if (!station) return [h("div", { class: "gkBody" }, [emptyNote("anvil-impact", "Hier kun je niets meer maken.")])];
    const recipes = station.recipes || [];
    const query = String(ui.craftSearch || "").trim().toLocaleLowerCase();
    const search = h("input", { type: "search", class: "gkCraftSearch", "data-craft-search": "1", value: ui.craftSearch,
      placeholder: "Recept zoeken…", "aria-label": "Recept zoeken", autocomplete: "off", spellcheck: "false" });
    const list = h("div", { class: "gkCraftList" });
    for (const recipe of recipes) {
      const searchText = [recipe.displayName, ...(recipe.ingredients || []).map(function (entry) { return entry.displayName || entry.itemRef || entry.currencyRef; }),
        ...(recipe.outputs || []).map(function (entry) { return entry.displayName || entry.itemId || entry.currencyId; })].filter(Boolean).join(" ").toLocaleLowerCase();
      const row = h("div", { class: "gkCraftRow", "data-craft-row": "1", "data-search": searchText, hidden: query && !searchText.includes(query) ? true : null });
      const strip = h("div", { class: "gkCraftStrip" });
      strip.append(h("button", { type: "button", class: "gkCraftThumb gkCraftMake", "data-act": "craft", "data-id": recipe.recipeId,
        title: (recipe.displayName || "Recept") + " maken", disabled: d.busy?.n05 || !recipe.canCraft ? true : null },
      [ico("anvil-impact", "plain"), h("span", { text: "Maken" }), num(recipe.craftDurationMs) > 0
        ? h("small", { text: Math.round(num(recipe.craftDurationMs) / 1000) + "s" }) : null]));
      for (const output of recipe.outputs || []) {
        strip.append(h("div", { class: "gkCraftThumb gkCell gkCraftResult", title: output.displayName || recipe.displayName,
          "data-rarity": catalogItem(output.itemId)?.rarity || "common" }, [
          output.itemId ? itemVisual(output.itemId) : currencyVisual(output.currencyId),
          h("span", { class: "gkCraftThumbLabel", text: (recipe.displayName || recipe.recipeId) + (num(output.amount, 1) > 1 ? " ×" + fmt(output.amount) : "") })
        ]));
      }
      (recipe.ingredients || []).forEach(function (ingredient) {
        const ok = num(ingredient.owned) >= num(ingredient.required, 1);
        strip.append(h("div", { class: "gkCraftThumb gkCell " + (ok ? "gkOk" : "gkMiss"),
          title: ingredient.displayName || ingredient.itemRef || ingredient.currencyRef,
          "data-rarity": catalogItem(ingredient.itemRef)?.rarity || "common" }, [
          ingredient.itemRef ? itemVisual(ingredient.itemRef) : currencyVisual(ingredient.currencyRef),
          h("span", { class: "gkCraftThumbLabel", text: fmt(ingredient.owned) + "/" + fmt(ingredient.required) })
        ]));
      });
      row.append(strip);
      list.append(row);
    }
    const noRecipes = h("div", { class: "gkCraftEmpty", "data-craft-empty": "1", hidden: recipes.length && recipes.some(function (recipe) {
      const text = [recipe.displayName, ...(recipe.ingredients || []).map(function (entry) { return entry.displayName || entry.itemRef || entry.currencyRef; }),
        ...(recipe.outputs || []).map(function (entry) { return entry.displayName || entry.itemId || entry.currencyId; })].filter(Boolean).join(" ").toLocaleLowerCase();
      return !query || text.includes(query);
    }) ? true : null, text: recipes.length ? "Geen recepten gevonden." : "Geen recepten." });
    const now = Date.now();
    const jobs = h("div", { class: "gkCraftJobs" });
    for (const job of (d.s05?.crafting?.jobs || []).filter(function (entry) { return entry.state === "running"; }).slice(0, 3)) {
      const start = Date.parse(job.startedAt || "") || now;
      const end = Date.parse(job.completesAt || "") || now;
      const pct = end > start ? Math.max(0, Math.min(1, (now - start) / (end - start))) : 1;
      const jobRecipe = recipes.find(function (entry) { return entry.recipeId === job.recipeId; });
      jobs.append(h("div", { class: "gkJob" }, [ico("hourglass"), h("span", { text: jobRecipe?.displayName || job.recipeId }),
        h("div", { class: "gkProgress" }, [h("i", { style: "width:" + Math.round(pct * 100) + "%" })]),
        h("button", { type: "button", class: "gkBtn gkGo", "data-act": "claim", "data-id": job.jobId, disabled: d.busy?.n05 || !job.canClaim ? true : null }, ["Ophalen"])]));
    }
    return [h("div", { class: "gkCraft" }, [h("div", { class: "gkCraftTools" }, [ico("anvil-impact"), search]), list, noRecipes, jobs])];
  }

  function syncSettings() {
    const signature = JSON.stringify([store.pixels, store.music, store.debug && data().isAdmin, has("hotbar_hud"), has("interaction_hud"), store.icoSize, store.icoAnim, store.icoColor,
      store.healthPing, store.healthTps, store.healthMspt, store.healthCpu, store.healthGpu, store.healthPacketLoss, data().healthDefaults]);
    if (ui.sig.settings === signature) return;
    ui.sig.settings = signature;
    root.dataset.ico = store.icoSize || "m";
    root.dataset.icoanim = store.icoAnim ? "on" : "off";
    root.dataset.icocolor = store.icoColor || "color";
    root.dataset.hotbar = has("hotbar_hud") ? "on" : "off";
    root.dataset.dobtn = has("interaction_hud") ? "on" : "off";
    if (typeof api.setPixels === "function") api.setPixels(PIXEL_STEPS.includes(Number(store.pixels)) ? Number(store.pixels) : 1);
    api.setMusic(store.music);
    api.setDebug(Boolean(store.debug && data().isAdmin), debugSlot);
    syncConnectionMetricVisibility();
  }

  // ---- elk frame (gedoseerd): minimap, knoppen, doelwit en het meeschuivende beeld ----
  function frame(now = performance.now()) {
    const anchors = typeof api.labelAnchors === "function" ? api.labelAnchors() : [];
    drawLabels(now, anchors);
    drawFloats(now, anchors);
    drawBubbles(now, anchors);
    if (now - (ui.secAt || 0) >= 250) {
      ui.secAt = now;
      renderChatFeed(now);
      renderEventLine();
      renderEffects(now);
      renderSlots(now);
      tickCooldowns(now);
      renderInvite(now);
    }
    // MMO (3-11): teamleden ver weg worden grijs (2x per seconde bekijken is genoeg).
    if (!partyBox.hidden && now - ui.farAt >= 500) {
      ui.farAt = now;
      markFarMates();
    }
    // Stand en maat van het paneel hooguit 10x per seconde bekijken (zuinig op de oude laptop).
    if (now - ui.layoutAt >= 100) {
      ui.layoutAt = now;
      if (applyLayout()) { renderTalk(); renderRail(); renderSheet(); renderChat(); }
      fitMinimap();
      ui.inset.want = measureInset();
      placeChat();
      collectHudBlocks();
    }
    // Het beeld schuift vloeiend mee met het paneel.
    const inset = ui.inset.want || { right: 0, bottom: 0 };
    ui.inset.right += (inset.right - ui.inset.right) * 0.35;
    ui.inset.bottom += (inset.bottom - ui.inset.bottom) * 0.35;
    if (Math.abs(inset.right - ui.inset.right) < 0.6) ui.inset.right = inset.right;
    if (Math.abs(inset.bottom - ui.inset.bottom) < 0.6) ui.inset.bottom = inset.bottom;
    const rr = Math.round(ui.inset.right);
    const rb = Math.round(ui.inset.bottom);
    if (rr !== ui.inset.tr || rb !== ui.inset.tb) {
      ui.inset.tr = rr;
      ui.inset.tb = rb;
      api.setViewInset(rr, rb);
    }
    if (now - ui.targetsAt >= 200) {
      ui.targetsAt = now;
      updateTargets(now);
      checkTalkDistance();
      checkPortalUnlock(now);
      if (ui.portalAsk) renderPortalAsk();
    }
    if (store.minimap && !ui.bigMap && now - ui.mapAt >= 125) {
      ui.mapAt = now;
      drawMap();
    }
    if (ui.bigMap && now - ui.bigAt >= 250) {
      ui.bigAt = now;
      drawBigMap();
    }
  }

  function liveTargets() {
    return (api.live().targets || []).filter(function (target) { return target && Number.isFinite(Number(target.distance)); });
  }
  function doKindOf(target) {
    const action = String(target?.action || "");
    if (action === "node04:start_dialogue" || action === "node05:focus_service") return "talk";
    if (target?.entityKind === "pickup" || action === "pickup") return "pickup";
    if (target?.entityKind === "resource" || action === "gather") return "gather";
    if (action === "travel") return "travel";
    return "";
  }
  function nearestAttackTarget(targets = liveTargets()) {
    return targets.filter(function (target) {
      return target.entityKind === "enemy"
        && target.available !== false
        && target.alive !== false
        && target.status !== "dead"
        && num(target.distance) <= ATTACK_RANGE_M;
    }).sort(function (a, b) {
      return num(a.distance) - num(b.distance);
    })[0] || null;
  }
  function updateTargets(now) {
    const list = liveTargets();
    const selectedId = String(api.live().selectedTargetId || "");
    ui.attackTarget = nearestAttackTarget(list);
    attackBtn.classList.toggle("gkIdle", !ui.attackTarget);
    const doers = list.filter(function (t) { return t.available !== false && doKindOf(t) && num(t.distance) <= DO_RANGE_M; })
      .sort(function (a, b) { return num(a.distance) - num(b.distance); });
    ui.doTarget = doers[0] || null;
    const kind = ui.doTarget ? doKindOf(ui.doTarget) : "";
    const label = ui.doTarget ? (ui.doTarget.displayName || "") : "";
    if (kind + "|" + label !== ui.doKind) {
      ui.doKind = kind + "|" + label;
      const name = String(label).toLowerCase();
      const icon = kind === "talk" ? "talk" : kind === "pickup" ? "grab" : kind === "travel" ? "exit-door"
        : kind === "gather" ? (/erts|steen|rots|ijzer|ore|rock|stone|kristal/.test(name) ? "mining" : /kruid|bloem|plant|herb|flower|bes/.test(name) ? "herbs-bundle" : "wood-axe") : "hand";
      doIcon.replaceChildren(ico(icon));
      doLabel.textContent = label;
      doBtn.classList.toggle("gkIdle", !ui.doTarget);
    }
    // Doelwit bovenin: de vijand waar je mee vecht, met zijn levens.
    const selected = list.find(function (t) { return String(t.instanceId) === selectedId && t.entityKind === "enemy"; }) || null;
    const showTarget = selected && selected.status !== "dead" && (combat(now) || num(selected.distance) < 12);
    targetFrame.hidden = !showTarget;
    if (showTarget) {
      const max = num(selected.healthMax);
      const cur = Math.max(0, num(selected.healthCurrent, max));
      const signature = selected.instanceId + "|" + cur + "|" + max + "|" + selected.displayName;
      if (ui.sig.target !== signature) {
        ui.sig.target = signature;
        targetName.replaceChildren(ico("crosshair"), document.createTextNode(selected.displayName || "Vijand"));
        targetFill.style.width = (max > 0 ? Math.round(cur / max * 100) : 0) + "%";
        targetText.textContent = max > 0 ? fmt(cur) + " / " + fmt(max) : "";
      }
    }
    // Ook bij een lange route blijft het gesprek klaarstaan; de timeout begint na het lopen.
    if (ui.pendingTalk) {
      const waiting = list.find(function (t) { return String(t.instanceId) === ui.pendingTalk.id; });
      if (waiting && api.isWalkingTo?.(waiting)) ui.pendingTalk.at = now;
      if (!waiting || now - ui.pendingTalk.at > 20000) ui.pendingTalk = null;
      else if (waiting.inRange !== false) talkTo(waiting);
    }
    // Weggelopen bij een NPC zonder gesprek: de strook gaat weg.
    if (ui.serviceTalk) {
      const position = api.live().position;
      if (position && Math.hypot(num(position.x) - ui.serviceTalk.x, num(position.z) - ui.serviceTalk.z) > DO_RANGE_M + 3) endServiceTalk();
    }
    // Weggelopen bij de winkel of het werkstation: terug naar waar je was.
    const service = ui.trade ? api.vendor(ui.trade.vendorId) : ui.craft ? api.station(ui.craft.stationId) : null;
    if ((ui.trade || ui.craft) && (!service || service.inRange === false)) {
      if (!ui.farTradeSince) ui.farTradeSince = now;
      else if (now - ui.farTradeSince > 1500) endService();
    } else {
      ui.farTradeSince = 0;
    }
  }

  // 2D-naamlabels: elke beurt de schermplek bijwerken (geen nieuwe elementen als het niet hoeft).
  let labelRect = null;
  let labelRectAt = 0;
  function snapToScreenPixel(value) {
    // Op een HiDPI-scherm is een halve CSS-pixel vaak precies één fysieke pixel.
    // Afronden op CSS-pixels liet de namen zichtbaar hokken; een doorlopende
    // translate3d maakte Chrome's gerasterde tekst tijdens het lopen wazig.
    const ratio = Math.max(1, Number(window.devicePixelRatio) || 1);
    return Math.round(value * ratio) / ratio;
  }
  function drawLabels(now, anchors) {
    if (!anchors.length && !labelPool.size) return;
    if (!labelRect || now - labelRectAt > 1000) { labelRect = labels.getBoundingClientRect(); labelRectAt = now; }
    const seen = new Set();
    for (const anchor of anchors) {
      const own = anchor.entityKind === "self" ? "self" : anchor.entityKind === "player" ? "player" : "";
      if (own === "self" ? !store.nameSelf : own === "player" ? !store.namePlayers : !store.nameWorld) continue;
      seen.add(anchor.id);
      let el = labelPool.get(anchor.id);
      if (!el) {
        el = h("div", { class: "gkLabel" });
        labels.append(el);
        labelPool.set(anchor.id, el);
      }
      // Kevin 10-11: een vijand krijgt zijn sterkte-cijfer voor de naam (1 = gewoon, 2 = twee keer zo sterk).
      const nameSig = anchor.strength ? anchor.strength + "|" + anchor.name : anchor.name;
      if (el.dataset.sig !== nameSig) {
        el.dataset.sig = nameSig;
        if (anchor.strength) el.replaceChildren(h("span", { class: "gkLvl" + (anchor.strength > 1 ? " gkLvlUp" : ""), text: String(anchor.strength) }), document.createTextNode(anchor.name));
        else el.textContent = anchor.name;
      }
      const fontSize = Math.max(8, Math.min(48, num(anchor.fontSizePx, 13)));
      const fontSizeCss = fontSize + "px";
      if (el.style.fontSize !== fontSizeCss) el.style.fontSize = fontSizeCss;
      // Naam-tags niet verbergen bij overlap met de HUD; ze horen altijd zichtbaar te blijven.
      if (el.style.visibility) el.style.visibility = "";
      const kind = own || (anchor.entityKind === "escort" ? "escort" : markerKind(anchor)) || "other";
      const hasHp = anchor.health !== null && anchor.health !== undefined;
      const className = "gkLabel gkLabel--" + kind + (anchor.selected ? " gkOn" : "") + (anchor.available === false ? " gkDim" : "") + (anchor.shield ? " gkShield" : "") + (hasHp ? " gkHp" : "");
      if (el.className !== className) el.className = className;
      // Stap 8: levensbalk onder de naam van een NPC die je begeleidt (Kevin 10-11: en van elke vijand).
      if (hasHp) {
        const hp = Math.round(anchor.health * 100) + "%";
        if (el.style.getPropertyValue("--gk-hp") !== hp) el.style.setProperty("--gk-hp", hp);
      }
      const left = snapToScreenPixel(anchor.x - labelRect.left) + "px";
      const top = snapToScreenPixel(anchor.y - labelRect.top) + "px";
      if (el.style.left !== left) el.style.left = left;
      if (el.style.top !== top) el.style.top = top;
    }
    for (const [id, el] of labelPool) {
      if (!seen.has(id)) { el.remove(); labelPool.delete(id); }
    }
  }

  // Weglopen bij een NPC sluit het gesprek: meer dan TALK_LEAVE_M van de plek waar het begon.
  function checkTalkDistance() {
    const talking = Boolean(data().dialogue || ui.serviceTalk);
    const position = api.live().position;
    if (!talking || !position) { if (!talking) ui.talkAnchor = null; return; }
    if (!ui.talkAnchor) { ui.talkAnchor = { x: num(position.x), z: num(position.z) }; return; }
    if (Math.hypot(num(position.x) - ui.talkAnchor.x, num(position.z) - ui.talkAnchor.z) <= TALK_LEAVE_M) return;
    ui.talkAnchor = null;
    closeTalk();
  }

  // ---- Portals (8-11) ----
  function portalList() {
    const list = data().s03?.portals?.list;
    return Array.isArray(list) ? list : [];
  }
  // Loop je dichtbij een portal die nog dicht is, dan vraagt de game de server om hem vrij te spelen (de server meet zelf).
  function checkPortalUnlock(now) {
    const list = portalList();
    if (!list.length || data().defeated || typeof api.portalUnlock !== "function") return;
    const position = api.live().position;
    if (!position) return;
    if (!ui.portalTry) ui.portalTry = new Map();
    for (const portal of list) {
      if (portal.unlocked) continue;
      if (Math.hypot(num(position.x) - num(portal.x), num(position.z) - num(portal.z)) > Math.max(1, num(portal.unlockMeters, 4))) continue;
      if (now - (ui.portalTry.get(portal.id) || -Infinity) < 3000) continue;
      ui.portalTry.set(portal.id, now);
      api.portalUnlock(portal.id);
      break;
    }
  }
  function portalCurrencyName(currencyId) {
    const own = (data().s03?.currencies || []).find(function (entry) { return entry && entry.currencyId === currencyId; });
    return own?.displayName || String(currencyId || "");
  }
  function askPortal(portal) {
    if (!portal) return;
    const name = portal.displayName || "deze portal";
    if (!portal.unlocked) { toast(name + " is nog niet vrijgespeeld. Loop er eerst naartoe.", { icon: "magic-portal", ms: 3000 }); return; }
    if (data().s03?.portals?.atPortalId === portal.id) { toast("Je staat al bij " + name + ".", { icon: "magic-portal", ms: 2500 }); return; }
    ui.portalAsk = { id: portal.id };
    ui.sig.portalAsk = "";
    renderPortalAsk();
  }
  // Kevin 8-11: naar een teamgenoot = naar de vrije portal die het dichtst bij hem staat (de server kiest hetzelfde).
  function askMateTravel(mateId) {
    const mate = partyMates().find(function (entry) { return String(entry.id) === String(mateId); }) || null;
    if (!mate) return;
    if (!mate.online) { toast((mate.name || "Je teamgenoot") + " is offline.", { icon: "three-friends", ms: 2200 }); return; }
    const free = portalList().filter(function (portal) { return portal.unlocked; });
    if (!free.length) { toast("Je hebt nog geen portal vrijgespeeld.", { icon: "magic-portal", ms: 2500 }); return; }
    const spot = api.playerPosition ? api.playerPosition(mate.id) : null;
    let best = free[0];
    if (spot) {
      for (const portal of free) {
        if (Math.hypot(num(portal.x) - spot.x, num(portal.z) - spot.z) < Math.hypot(num(best.x) - spot.x, num(best.z) - spot.z)) best = portal;
      }
    }
    ui.portalAsk = { id: best.id, mateId: String(mate.id), mateName: mate.name || "teamgenoot", guess: !spot };
    ui.sig.portalAsk = "";
    renderPortalAsk();
  }
  function closePortalAsk() {
    ui.portalAsk = null;
    renderPortalAsk();
  }
  function renderPortalAsk() {
    const info = ui.portalAsk ? portalList().find(function (entry) { return entry.id === ui.portalAsk.id; }) || null : null;
    if (ui.portalAsk && !info) ui.portalAsk = null;
    const rules = data().s03?.portals?.rules || {};
    const cost = info ? Math.max(0, Math.round(num(info.cost))) : 0;
    const ask = ui.portalAsk || {};
    const signature = info ? [info.id, info.displayName, cost, rules.costCurrencyId || "", ask.mateId || ""].join("|") : "";
    if (ui.sig.portalAsk === signature) return;
    ui.sig.portalAsk = signature;
    portalCard.hidden = !info;
    if (!info) { portalCard.replaceChildren(); return; }
    const costText = cost > 0 ? "Kost " + cost + " " + portalCurrencyName(rules.costCurrencyId) : "Gratis";
    portalCard.replaceChildren(
      h("div", { class: "gkInviteText" }, [ico("magic-portal"), ask.mateId
        ? h("span", null, ["Reizen naar ", h("b", { text: ask.mateName }), "?", h("small", { text: (ask.guess ? "Naar de portal het dichtst bij " + ask.mateName : "Via " + (info.displayName || "portal")) + " · " + costText })])
        : h("span", null, ["Reizen naar ", h("b", { text: info.displayName || "portal" }), "?", h("small", { text: costText })])]),
      h("div", { class: "gkInviteBtns" }, [
        ask.mateId
          ? h("button", { type: "button", class: "gkInviteYes", "data-act": "portal-mate-go", "data-id": ask.mateId }, [ico("magic-portal"), h("span", { text: "Reizen" })])
          : h("button", { type: "button", class: "gkInviteYes", "data-act": "portal-go", "data-id": info.id }, [ico("magic-portal"), h("span", { text: "Reizen" })]),
        h("button", { type: "button", class: "gkInviteNo", "data-act": "portal-no" }, [ico("cancel"), h("span", { text: "Nee" })])]));
  }
  // Tik op de minimap: staat er een portal vlak bij je vinger, dan die; anders gewoon lopen.
  function portalNearMiniClick(world) {
    const rect = mapCanvas.getBoundingClientRect();
    const zooms = Array.isArray(store.map.zoomLevels) && store.map.zoomLevels.length ? store.map.zoomLevels : ZOOMS;
    const radius = zooms[Math.max(0, Math.min(zooms.length - 1, Math.round(num(store.zoom, 1))))];
    const metersPerPx = rect.width > 0 ? num(radius) / (rect.width / 2) : 1;
    const reach = Math.max(2, metersPerPx * 14);
    let best = null;
    let bestDistance = reach;
    for (const portal of portalList()) {
      if (store.map.mini?.[portal.unlocked ? "portal" : "portal_locked"] === false) continue;
      if (!portal.unlocked && !minimap.discovered(portal.x, portal.z)) continue;
      const distance = Math.hypot(num(portal.x) - world.x, num(portal.z) - world.z);
      if (distance <= bestDistance) { best = portal; bestDistance = distance; }
    }
    return best;
  }

  function drawMap() {
    const live = api.live();
    const position = live.position;
    if (!position) return;
    if (fogConfig) minimap.revealAround(position.x, position.z, fogConfig.revealRadius);
    const markers = mapMarkers(live);
    const questTarget = mapQuestTarget();
    const sm = store.map;
    const zooms = Array.isArray(sm.zoomLevels) && sm.zoomLevels.length ? sm.zoomLevels : ZOOMS;
    const zoomIndex = Math.max(0, Math.min(zooms.length - 1, Math.round(num(store.zoom, 1))));
    const zoom = zooms[zoomIndex];
    // Meedraaien = jouw kijkrichting staat altijd boven (zoals in WoW); uit = noorden boven.
    const facing = num(live.facingDeg) * Math.PI / 180;
    const north = minimap.draw({ world: live.world, center: position, facingDeg: live.facingDeg, forward: sm.rotate === false ? { x: 0, z: -1 } : { x: Math.sin(facing), z: Math.cos(facing) },
      radius: zoom, markers, quest: questTarget, questArea: mapQuestArea(), questMarks: mapQuestMarks(live), pin: sm.allowPin ? sm.pin : null,
      show: sm.mini, iconScale: sm.miniIcon, areas: areaLabels(live), textScale: sm.miniText, styles: sm.styles, shape: sm.shape,
      fixedIconSize: sm.miniFixedIconSize, iconReferenceSpan: sm.zoomLevels[Math.max(0, Math.min(sm.zoomLevels.length - 1, sm.defaultZoomIndex))],
      areaColor: sm.area.color, showNames: sm.miniShowMarkerNames, nameFontPx: sm.miniMarkerNameSizePx,
      nameColor: sm.markerNameColor, backgroundColor: sm.backgroundColor });
    const rounded = Math.round(num(north));
    if (ui.sig.north !== rounded) {
      ui.sig.north = rounded;
      mapNorth.style.transform = rounded ? "rotate(" + rounded + "deg)" : "";
    }
    const label = sm.miniShowRegionName === false ? "" : (live.region || "");
    if (mapLabel.textContent !== label) mapLabel.textContent = label;
    mapLabel.hidden = sm.miniShowRegionName === false;
    const zoomText = zoomIndex === zooms.length - 1 ? "+" : "−";
    const zoomTitle = zoomIndex === zooms.length - 1 ? "Minimap inzoomen" : "Minimap uitzoomen";
    if (mapZoom.textContent !== zoomText) mapZoom.textContent = zoomText;
    if (mapZoom.title !== zoomTitle) mapZoom.title = zoomTitle;
    mapZoom.setAttribute("aria-label", zoomTitle);
    mapButton.title = sm.clickToMove === false ? "Minimap" : "Klik om hierheen te lopen";
  }

  // Namen van deelgebieden (uit de build) voor op de kaarten.
  function areaLabels(live) {
    const list = live.world?.minimap?.game?.areaLabels;
    return Array.isArray(list) ? list : [];
  }
  function markerKind(target) {
    const action = String(target.action || "");
    if (action === "travel" || target.entityKind === "zone_link" || target.entityKind === "portal" || target.targetKind === "zone_link") return "portal";
    if (action === "node04:start_dialogue" || action === "node05:focus_service") return "npc";
    return target.entityKind === "enemy" ? "enemy" : target.entityKind === "resource" ? "resource" : target.entityKind === "pickup" ? "pickup" : "";
  }
  function mapMarkers(live) {
    const markers = [];
    const npcSpots = [];
    const givers = data().s04?.questGivers || [];
    for (const target of live.targets || []) {
      if (!target || target.available === false || !Number.isFinite(Number(target.x))) continue;
      const kind = markerKind(target);
      if (!kind) continue;
      // Een NPC met gesprek én winkel: één ruitje.
      if (kind === "npc") {
        // De blijvende questgever-ster vervangt het gewone NPC-ruitje.
        if (givers.some(function (giver) { return sameMapSpot(giver, target); })) continue;
        if (npcSpots.some(function (spot) { return Math.hypot(spot.x - num(target.x), spot.z - num(target.z)) < 2.5; })) continue;
        npcSpots.push({ x: num(target.x), z: num(target.z) });
      }
      markers.push({ x: target.x, z: target.z, kind, name: target.displayName || target.label || "", target });
    }
    // Kevin 8-11: groepsleden met een eigen kleur, los van andere spelers.
    const mates = new Set(partyMates().map(function (member) { return String(member.id); }));
    for (const remote of live.remotes || []) {
      const isMate = Boolean(remote.id) && mates.has(String(remote.id));
      markers.push({ x: remote.x, z: remote.z, kind: isMate ? "party" : "player", name: remote.name || remote.displayName || "", mateId: isMate ? String(remote.id) : null });
    }
    // Portals (8-11): vrije portals altijd (ook onder de mist), dichte alleen waar je al geweest bent.
    for (const portal of portalList()) {
      markers.push({ x: portal.x, z: portal.z, kind: portal.unlocked ? "portal" : "portal_locked", name: portal.displayName || "", portal, alwaysVisible: portal.unlocked === true });
    }
    for (const giver of givers) {
      if (!Number.isFinite(Number(giver.x)) || !Number.isFinite(Number(giver.z))) continue;
      markers.push({ x: giver.x, z: giver.z, kind: giver.hasAvailableQuest ? "questgiver_available" : "questgiver",
        name: giver.displayName || "Questgever", target: giver });
    }
    return markers;
  }
  function sameMapSpot(left, right) {
    return Boolean(left.targetId && left.targetId === right.targetId)
      || Math.hypot(num(left.x, Infinity) - num(right.x, -Infinity), num(left.z, Infinity) - num(right.z, -Infinity)) < 0.5;
  }
  // Quest Builder stap 3: het zoekgebied van de gevolgde quest (alleen als de stap "Zoekgebied" zegt).
  function mapQuestArea() {
    // Kevin 8-11: een aangeklikt wereld-event laat zijn gebied zien.
    const focus = focusedEvent();
    if (focus && Array.isArray(focus.area?.points) && focus.area.points.length >= 3) return Object.assign({ show: "area" }, focus.area);
    const map = trackedQuest()?.activeStep?.map || null;
    return map && map.show === "area" && Array.isArray(map.points) && map.points.length >= 3 ? map : null;
  }
  // Kevin 5-11: ⭐ waar de vijand die je moet verslaan nu loopt. Ziet de game hem zelf (dichtbij), dan de vloeiende plek.
  function mapQuestMarks(live) {
    const marks = trackedQuest()?.activeStep?.marks;
    if (!Array.isArray(marks) || !marks.length) return [];
    const byId = new Map((live.targets || []).map(function (target) { return [String(target.instanceId || ""), target]; }));
    return marks.map(function (mark) {
      const seen = byId.get(String(mark.id || ""));
      if (seen && seen.available === false) return null;
      return seen && Number.isFinite(Number(seen.x)) ? { x: num(seen.x), z: num(seen.z) } : { x: num(mark.x), z: num(mark.z) };
    }).filter(Boolean);
  }
  function mapQuestTarget() {
    const quest = trackedQuest();
    const target = quest ? (data().s04?.questTargets || []).find(function (t) { return t.questId === quest.questId; }) : null;
    // Ook bij terugkeren naar de gever blijft diens eigen ster (en fog-regel) leidend.
    if (target && (data().s04?.questGivers || []).some(function (giver) { return sameMapSpot(giver, target); })) return null;
    return target || null;
  }
  function drawBigMap() {
    const live = api.live();
    const sm = store.map;
    if (live.position && fogConfig) minimap.revealAround(live.position.x, live.position.z, fogConfig.revealRadius);
    if ((ui.bigFollow || !ui.bigFocus) && live.position) ui.bigFocus = { x: num(live.position.x), z: num(live.position.z) };
    const markers = mapMarkers(live);
    const quest = mapQuestTarget();
    const result = minimap.drawFull(bigCanvas, { world: live.world, center: live.position, facingDeg: live.facingDeg, markers,
      quest: quest ? Object.assign({ name: trackedQuest()?.displayName || "" }, quest) : null, questArea: mapQuestArea(), questMarks: mapQuestMarks(live),
      pin: sm.allowPin ? sm.pin : null, span: sm.span, focus: ui.bigFocus, show: sm.big, iconScale: sm.bigIcon, areas: areaLabels(live), textScale: sm.bigText,
      styles: sm.styles, areaColor: sm.area.color, showNames: sm.bigShowMarkerNames, nameFontPx: sm.bigMarkerNameSizePx,
      fixedIconSize: sm.bigFixedIconSize, iconReferenceSpan: sm.bigSpanMeters,
      nameColor: sm.markerNameColor, backgroundColor: sm.backgroundColor, showScale: sm.bigShowScale, showCoordinates: sm.bigShowCoordinates });
    ui.bigView = result;
    ui.bigHits = result?.hits || [];
    if (result) ui.bigFocus = result.focus;
    bigCenter.classList.toggle("gkOn", ui.bigFollow);
    const counts = {};
    counts.self = 1;
    for (const marker of markers) {
      if (marker.kind === "questgiver_available" || marker.alwaysVisible || minimap.discovered(marker.x, marker.z)) counts[marker.kind] = (counts[marker.kind] || 0) + 1;
    }
    if (quest) counts.quest = 1;
    if (sm.allowPin && sm.pin) counts.pin = 1;
    for (const area of areaLabels(live)) if (minimap.discovered(area.x, area.z)) counts.area = (counts.area || 0) + 1;
    const title = sm.bigShowRegionName === false ? "Kaart" : (live.region || "Kaart");
    if (bigTitle.textContent !== title) bigTitle.textContent = title;
    renderBigLegend(counts);
    if (ui.bigPinDist && sm.allowPin && sm.pin && live.position) {
      const meters = Math.round(Math.hypot(sm.pin.x - num(live.position.x), sm.pin.z - num(live.position.z)));
      const text = meters + " m";
      if (ui.bigPinDist.textContent !== text) ui.bigPinDist.textContent = text;
    }
  }
  // De legenda wordt alleen opnieuw gebouwd als er iets aan of uit gaat; tellers en afstand worden los bijgewerkt
  // (zo blijft een schuif die je net vasthoudt gewoon werken).
  function renderBigLegend(counts) {
    const sm = store.map;
    const signature = JSON.stringify([sm.big, sm.mini, sm.rotate, sm.allowPin, Boolean(sm.pin), Boolean(counts.portal), sm.styles, sm.area]);
    if (ui.sig.legend !== signature) {
      ui.sig.legend = signature;
      ui.bigCounts = {};
      const check = function (which, kind, label) {
        const on = sm[which][kind] !== false;
        return h("button", { type: "button", class: "gkCheck" + (on ? " gkOn" : ""), "data-act": "mapshow", "data-id": which + ":" + kind, role: "checkbox",
          "aria-checked": on ? "true" : "false", title: label + (which === "big" ? " op de grote kaart" : " op de minimap") });
      };
      const rows = MAP_KINDS.map(function (entry) {
        const style = entry[0] === "area" ? { label: sm.area.label, color: sm.area.color, shape: "text" } : (sm.styles[entry[0]] || {});
        const label = style.label || entry[1];
        const count = h("em");
        ui.bigCounts[entry[0]] = count;
        return h("div", { class: "gkLegendRow" }, [h("i", { class: "gkMark gkMark--configured", "data-shape": style.shape || "dot",
          style: "--gk-mark-color:" + (style.color || "#ffffff") }), h("span", { text: label }), count,
          check("big", entry[0], label), check("mini", entry[0], label)]);
      });
      const slide = function (id, label) {
        const value = Math.max(0.5, Math.min(2, num(sm[id], 1)));
        return h("label", { class: "gkSlide" }, [h("span", { text: label }), h("em", { text: Math.round(value * 100) + "%" }),
          h("input", { type: "range", min: "0.5", max: "2", step: "0.1", value: String(value), "data-slide": id, "aria-label": label })]);
      };
      ui.bigPinDist = null;
      let pinBox = null;
      if (sm.allowPin && sm.pin) {
        ui.bigPinDist = h("em");
        const pinStyle = sm.styles.pin || MAP_STYLE_DEFAULTS.pin;
        pinBox = h("div", { class: "gkLegendBox" }, [h("div", { class: "gkLegendPin" }, [h("i", { class: "gkMark gkMark--configured", "data-shape": pinStyle.shape,
          style: "--gk-mark-color:" + pinStyle.color }), h("span", { text: pinStyle.label }), ui.bigPinDist]),
          h("div", { class: "gkBtns" }, [h("button", { type: "button", class: "gkBtn gkGo", "data-act": "pin-walk" }, ["Loop erheen"]),
            h("button", { type: "button", class: "gkBtn", "data-act": "pin-clear" }, ["Weghalen"])])]);
      }
      bigLegend.replaceChildren(...[
        h("div", { class: "gkLegendHead" }, [h("span", { text: "Wat zie je?" }), h("b", { text: "Groot" }), h("b", { text: "Klein" })]),
        ...rows,
        h("div", { class: "gkLegendBox" }, [h("div", { class: "gkLegendSub", text: "Grootte van de kaarticonen" }), slide("bigIcon", "Grote kaart"), slide("miniIcon", "Minimap"),
          h("div", { class: "gkLegendRow gkLegendRow--switch" }, [h("span", { text: "Minimap draait mee" }),
            h("button", { type: "button", class: "gkSwitch" + (sm.rotate !== false ? " gkOn" : ""), "data-act": "maprotate", role: "switch",
              "aria-checked": sm.rotate !== false ? "true" : "false", title: "Aan = jouw kijkrichting boven, uit = noorden boven" })])]),
        h("div", { class: "gkLegendBox" }, [h("div", { class: "gkLegendSub", text: "Grootte van de gebiedsnamen (zoomen mee)" }), slide("bigText", "Grote kaart"), slide("miniText", "Minimap")]),
        pinBox,
        h("p", { class: "gkLegendNote", text: "Slepen = schuiven. Scrollen, knijpen of + en − = zoomen."
          + (sm.allowPin ? " Tik op een lege plek voor een pin." : "")
          + (counts.portal ? " Tik op een portal om te reizen." : " Nog geen portals in deze wereld.") })].filter(Boolean));
    }
    for (const entry of MAP_KINDS) {
      const el = ui.bigCounts?.[entry[0]];
      if (!el) continue;
      const text = counts[entry[0]] && entry[0] !== "quest" && entry[0] !== "pin" ? String(counts[entry[0]]) : "";
      if (el.textContent !== text) el.textContent = text;
      const dim = entry[0] !== "self" && !counts[entry[0]];
      if (el.parentNode.classList.contains("gkDim") !== dim) el.parentNode.classList.toggle("gkDim", dim);
    }
  }
  function syncBigMap() {
    bigMap.hidden = !ui.bigMap;
    root.dataset.bigmap = ui.bigMap ? "on" : "off";
    hideBigTip();
    if (ui.bigMap) { ui.bigAt = 0; ui.sig.legend = ""; ui.bigFollow = true; ui.bigFocus = null; drawBigMap(); }
  }
  // Kaartknop en M: grote kaart open of dicht. De minimap zelf aan of uit zetten doe je in Instellingen.
  function cycleMap() {
    ui.bigMap = !ui.bigMap;
    ui.mapAt = 0;
    syncBigMap();
  }

  // ---- grote kaart: schuiven, zoomen, tikken ----
  let bigRaf = 0;
  const bigTouch = new Map();
  let bigGesture = null;
  let bigTipTimer = 0;
  function requestBigDraw() {
    if (bigRaf) return;
    bigRaf = window.requestAnimationFrame(function () { bigRaf = 0; if (ui.bigMap) drawBigMap(); });
  }
  function bigPoint(event) {
    const rect = bigCanvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function bigSpan() {
    const v = ui.bigView;
    const span = num(store.map.span, 160);
    return v ? Math.max(v.minSpan, Math.min(v.maxSpan, span)) : span;
  }
  // CSS-pixel op de kaart -> plek in de wereld.
  function bigWorld(p) {
    const v = ui.bigView;
    const focus = ui.bigFocus || v?.focus;
    if (!v || !focus) return null;
    const k = v.css / bigSpan();
    return { x: focus.x + (p.x - v.css / 2) / k, z: focus.z + (p.y - v.css / 2) / k };
  }
  // Zoomen; met een punt (muis of vingers) blijft dat punt op zijn plek, anders zoom je rond het midden.
  function zoomBigTo(span, p) {
    const v = ui.bigView;
    if (!v) return;
    const now = bigSpan();
    const next = Math.max(v.minSpan, Math.min(v.maxSpan, num(span, now)));
    if (p) {
      const world = bigWorld(p);
      const focus = ui.bigFocus || v.focus;
      if (world && focus) {
        const r = next / now;
        ui.bigFocus = { x: world.x - (world.x - focus.x) * r, z: world.z - (world.z - focus.z) * r };
        ui.bigFollow = false;
      }
    }
    store.map.span = Math.round(next * 10) / 10;
    markMapOverride("span");
    save();
    hideBigTip();
    requestBigDraw();
  }
  function nearestBigHit(p, radius) {
    let best = null;
    let bestDistance = radius;
    for (const hit of ui.bigHits) {
      const distance = Math.hypot(hit.x - p.x, hit.y - p.y);
      if (distance <= bestDistance) { best = hit; bestDistance = distance; }
    }
    return best;
  }
  function showBigTip(hit, ms) {
    const kind = MAP_KINDS.find(function (entry) { return entry[0] === hit.kind; });
    const label = store.map.styles?.[hit.kind]?.label || (kind ? kind[2] : "");
    const hint = hit.kind === "portal" || (hit.kind === "party" && portalList().length) ? " (tik = reizen)" : hit.kind === "portal_locked" ? " (loop er eerst naartoe)" : hit.kind === "pin" ? " (tik = weghalen)" : "";
    bigTip.textContent = (hit.name && hit.name !== label ? label + ": " + hit.name : label) + (hit.kind === "portal" || hit.kind === "portal_locked" || hit.kind === "party" || !hit.name || hit.name === label ? hint : "");
    bigTip.style.left = hit.x + "px";
    bigTip.style.top = hit.y + "px";
    bigTip.hidden = false;
    window.clearTimeout(bigTipTimer);
    if (ms) bigTipTimer = window.setTimeout(hideBigTip, ms);
  }
  function hideBigTip() {
    window.clearTimeout(bigTipTimer);
    if (!bigTip.hidden) bigTip.hidden = true;
  }
  function changedMap() {
    save();
    ui.sig.legend = "";
    ui.mapAt = 0;
    requestBigDraw();
  }
  function onBigTap(p) {
    const hit = nearestBigHit(p, 20);
    if (hit && (hit.kind === "portal" || hit.kind === "portal_locked") && hit.portal) { hideBigTip(); askPortal(hit.portal); return; }
    if (hit && hit.kind === "party" && hit.mateId && portalList().length) { hideBigTip(); askMateTravel(hit.mateId); return; }
    if (hit && hit.kind === "portal" && hit.target) {
      toast("Op weg naar " + (hit.name || "het portal") + ".", { icon: "magic-portal", ms: 2500 });
      ui.bigMap = false;
      syncBigMap();
      api.activate(hit.target);
      return;
    }
    if (hit && hit.kind === "pin") { store.map.pin = null; hideBigTip(); changedMap(); return; }
    if (hit) { showBigTip(hit, 2500); return; }
    if (store.map.allowPin === false) return;
    const world = bigWorld(p);
    if (!world) return;
    store.map.pin = { x: Math.round(world.x * 10) / 10, z: Math.round(world.z * 10) / 10 };
    hideBigTip();
    changedMap();
  }
  bigCanvas.addEventListener("pointerdown", function (event) {
    if (event.button > 0) return;
    try { bigCanvas.setPointerCapture(event.pointerId); } catch {}
    bigTouch.set(event.pointerId, bigPoint(event));
    const points = Array.from(bigTouch.values());
    if (points.length === 1) bigGesture = { mode: "drag", start: points[0], last: points[0], moved: false };
    else if (points.length === 2) bigGesture = { mode: "pinch", dist: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1, span: bigSpan() };
    hideBigTip();
  });
  bigCanvas.addEventListener("pointermove", function (event) {
    const p = bigPoint(event);
    if (!bigTouch.has(event.pointerId)) {
      if (event.pointerType === "mouse") {
        const hit = nearestBigHit(p, 14);
        if (hit) showBigTip(hit, 0);
        else hideBigTip();
      }
      return;
    }
    bigTouch.set(event.pointerId, p);
    if (!bigGesture || !ui.bigView) return;
    if (bigGesture.mode === "drag") {
      if (!bigGesture.moved && Math.hypot(p.x - bigGesture.start.x, p.y - bigGesture.start.y) < 6) return;
      bigGesture.moved = true;
      const k = ui.bigView.css / bigSpan();
      const focus = ui.bigFocus || ui.bigView.focus;
      ui.bigFocus = { x: focus.x - (p.x - bigGesture.last.x) / k, z: focus.z - (p.y - bigGesture.last.y) / k };
      ui.bigFollow = false;
      bigGesture.last = p;
      requestBigDraw();
    } else if (bigGesture.mode === "pinch") {
      const points = Array.from(bigTouch.values());
      if (points.length < 2) return;
      const dist = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1;
      zoomBigTo(bigGesture.span * bigGesture.dist / dist, { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
    }
  });
  function onBigUp(event) {
    if (!bigTouch.has(event.pointerId)) return;
    bigTouch.delete(event.pointerId);
    const gesture = bigGesture;
    if (bigTouch.size === 1 && gesture?.mode === "pinch") {
      const rest = Array.from(bigTouch.values())[0];
      bigGesture = { mode: "drag", start: rest, last: rest, moved: true };
      return;
    }
    if (bigTouch.size > 0) return;
    bigGesture = null;
    if (event.type === "pointerup" && gesture?.mode === "drag" && !gesture.moved) onBigTap(bigPoint(event));
  }
  bigCanvas.addEventListener("pointerup", onBigUp);
  bigCanvas.addEventListener("pointercancel", onBigUp);
  bigCanvas.addEventListener("pointerleave", function (event) { if (event.pointerType === "mouse") hideBigTip(); });
  bigCanvas.addEventListener("wheel", function (event) {
    event.preventDefault();
    const dy = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
    zoomBigTo(bigSpan() * Math.exp(Math.max(-0.6, Math.min(0.6, dy * 0.0015))), bigPoint(event));
  }, { passive: false });
  bigLegend.addEventListener("input", function (event) {
    const input = event.target && typeof event.target.closest === "function" ? event.target.closest("[data-slide]") : null;
    if (!input) return;
    const value = Math.max(0.5, Math.min(2, num(input.value, 1)));
    store.map[input.dataset.slide] = value;
    markMapOverride(input.dataset.slide);
    const out = input.parentNode.querySelector("em");
    if (out) out.textContent = Math.round(value * 100) + "%";
    save();
    ui.mapAt = 0;
    requestBigDraw();
  });
  function toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen({ navigationUI: "hide" });
    } catch {}
  }
  document.addEventListener("fullscreenchange", function () {
    fullIcon.replaceChildren(ico(document.fullscreenElement ? "contract" : "expand"));
    fullBtn.title = document.fullscreenElement ? "Volledig scherm uit" : "Volledig scherm";
  });

  // De kaarttegels (gemaakt bij SAVE TO GAME). Elke 30 s even kijken of er nieuwe zijn.
  function loadMinimapTiles() {
    if (document.hidden) return;
    Promise.resolve(api.fetchJson("/api/game/minimap")).then(function (result) {
      minimap.setTiles(result?.tiles || null);
      ui.mapAt = 0;
      ui.bigAt = 0;
    }).catch(function () {});
  }
  loadMinimapTiles();
  window.setInterval(loadMinimapTiles, 30000);
  // Stap 6: de aftelklokken lopen elke seconde (alleen de tekst, de rest van de HUD blijft staan).
  window.setInterval(function () {
    for (const badge of root.querySelectorAll("[data-deadline]")) badge.textContent = "⏱️ " + clockText(Number(badge.dataset.deadline) - Date.now());
  }, 1000);

  // Fog of war: wat je al ontdekt hebt komt van de server; nieuwe plekken komen via het netwerk (fogDiscovered).
  let fogConfig = null;
  function loadFog() {
    Promise.resolve(api.fetchJson("/api/game/fog/discovery")).then(function (result) {
      if (!result || result.enabled !== true) { fogConfig = null; minimap.setFog(null); return; }
      fogConfig = result.config || {};
      minimap.setFog({ enabled: true, cellSize: fogConfig.cellSize, color: fogConfig.fogColor, opacity: fogConfig.fogOpacity, feather: fogConfig.fogFeatherRadius });
      minimap.addFogCells(result.discoveredCellKeys || []);
      ui.mapAt = 0;
      ui.bigAt = 0;
    }).catch(function () {});
  }
  loadFog();

  // Praten met een NPC: het gesprek van de NPC-kaart, plus zijn winkel/werkplaats op dezelfde plek.
  // Heeft hij geen gesprek, dan een korte strook met alleen Handelen en/of Maken.
  function talkTo(target) {
    // Te ver weg: eerst erheen lopen; aangekomen gaat het gesprek vanzelf open.
    if (target?.inRange === false) {
      ui.pendingTalk = { id: String(target.instanceId || ""), at: performance.now() };
      api.walkTo(num(target.x), num(target.z), target);
      return;
    }
    ui.pendingTalk = null;
    const x = num(target?.x);
    const z = num(target?.z);
    const near = liveTargets().filter(function (t) {
      const action = String(t.action || "");
      return (action === "node04:start_dialogue" || action === "node05:focus_service") && Math.hypot(num(t.x) - x, num(t.z) - z) <= 2.5;
    });
    if (!near.some(function (t) { return t.instanceId === target.instanceId; })) near.push(target);
    const dialogue = String(target.action) === "node04:start_dialogue" ? target : near.find(function (t) { return t.action === "node04:start_dialogue"; }) || null;
    const services = near.filter(function (t) { return t.action === "node05:focus_service"; }).map(function (t) {
      const kind = String(t.kind || t.targetKind || "");
      return { kind: kind === "crafting" ? "station" : kind === "vendor" ? "vendor" : "", id: String(t.id || t.targetId || ""), name: t.displayName || t.label || "" };
    }).filter(function (entry) { return entry.kind && entry.id; });
    ui.serviceTalk = null;
    if (dialogue) {
      ui.talkFor = String(dialogue.dialogueId || "");
      ui.talkServices = services;
      api.activate(dialogue);
      return;
    }
    ui.talkFor = "";
    ui.talkServices = [];
    if (!services.length) return;
    ui.serviceTalk = { name: target.displayName || target.label || services[0].name || "", services, x, z, face: null };
    if (services.length === 1) { startService(services[0].kind, services[0].id); return; }
    applyLayout();
    render();
  }
  function endServiceTalk() {
    if (!ui.serviceTalk) return;
    ui.trade = null;
    ui.craft = null;
    store.item = null;
    ui.serviceTalk = null;
    applyLayout();
    render();
  }

  // ---- bediening ----
  function setPanel(next) {
    store.panel = next;
    if (next !== "open") store.item = null;
    save();
    applyLayout();
    renderRail();
    renderSheet();
    renderTalk();
    renderChat();
  }
  function openTab(id) {
    if (ui.trade || ui.craft) {
      ui.trade = null;
      ui.craft = null;
      store.item = null;
    }
    const panelNow = root.dataset.panel;
    if (panelNow === "open" && store.tab === id && root.dataset.mode !== "trade" && root.dataset.mode !== "craft") {
      setPanel("rail");
      return;
    }
    if (store.tab !== id) store.item = null;
    store.tab = id;
    if (id === "chars") loadCharacters(true);
    // Openen tijdens een gevecht: dan wil je het echt zien, dus niet meteen weer inklappen.
    ui.combatAt = -1e9;
    setPanel("open");
  }
  function shrinkPanel() {
    const panelNow = root.dataset.panel;
    // Bij een gesprek sluit het pijltje alles in één keer. Zo blijft na een
    // winkel of werkplaats niet eerst alleen het gesprek achter.
    if (root.dataset.dock === "talk" || ui.trade || ui.craft) {
      closeTalk();
      setPanel("closed");
      return;
    }
    // Alleen chat open: het pijltje doet die dicht.
    if (panelNow === "dock") { closeChat(); return; }
    setPanel(panelNow === "open" ? "rail" : "closed");
  }
  function startService(kind, id) {
    store.item = null;
    if (kind === "vendor") { ui.trade = { vendorId: id, offerId: null }; ui.craft = null; }
    else { ui.craft = { stationId: id, recipeId: null }; ui.craftSearch = ""; ui.trade = null; }
    ui.dockPick = "talk";
    ui.farTradeSince = 0;
    applyLayout();
    render();
  }
  function endService() {
    ui.trade = null;
    ui.craft = null;
    store.item = null;
    applyLayout();
    render();
  }
  function renderSheetOrService() {
    if (ui.trade || ui.craft) renderTalk();
    else renderSheet();
  }
  function confirmTwice(key) {
    if (ui.sure === key) {
      ui.sure = "";
      window.clearTimeout(ui.sureTimer);
      return true;
    }
    ui.sure = key;
    window.clearTimeout(ui.sureTimer);
    ui.sureTimer = window.setTimeout(function () { ui.sure = ""; renderSheetOrService(); }, 3000);
    renderSheetOrService();
    return false;
  }
  function itemPayload(key) {
    if (key.startsWith("inst:")) {
      const item = inventoryEntries().find(function (entry) { return entry.key === key; });
      return { itemInstanceId: key.slice(5), itemId: item?.entry.itemId || null };
    }
    return { itemId: key.replace(/^stack:/, "") };
  }
  function attack() {
    ui.combatAt = performance.now();
    attackBtn.classList.remove("gkFlash");
    void attackBtn.offsetWidth;
    attackBtn.classList.add("gkFlash");
    // Bij iedere druk/tik opnieuw meten; een eerder geselecteerde vijand mag een
    // inmiddels dichterbij gekomen vijand niet voorgaan.
    // Fase 5: een aangeklikte vijand in bereik gaat voor; anders de dichtstbijzijnde. Vak 1 slaat daarna vanzelf door.
    const selectedId = String(api.live().selectedTargetId || "");
    const candidates = liveTargets();
    ui.attackTarget = nearestAttackTarget(candidates.filter(function (target) { return String(target.instanceId) === selectedId; })) || nearestAttackTarget(candidates);
    // Kevin 10-11: geen vijand in de buurt = toch de uithaal (oefenen); knop 1 telt dan ook af.
    if (!ui.attackTarget) {
      const auto = skillsData()?.auto || null;
      if (performance.now() < num(ui.autoReadyAt)) return;
      if (typeof api.whiff === "function" && api.whiff(auto?.animStyle || "slash")) autoSwung(num(auto?.cooldownMs, 1500));
      else toast("Geen vijand in de buurt.", { icon: "crossed-swords", ms: 2000 });
      return;
    }
    api.activate(ui.attackTarget);
  }
  function interact() {
    doBtn.classList.remove("gkFlash");
    void doBtn.offsetWidth;
    doBtn.classList.add("gkFlash");
    if (!ui.doTarget) { toast("Er is niets in de buurt om te doen.", { icon: "hand", ms: 2000 }); return; }
    if (doKindOf(ui.doTarget) === "talk") talkTo(ui.doTarget);
    else api.activate(ui.doTarget);
  }

  function onClick(event) {
    const el = event.target && typeof event.target.closest === "function" ? event.target.closest("[data-act]") : null;
    if (!el || !root.contains(el) || el.disabled) return;
    if (ui.dragJustEnded) { ui.dragJustEnded = false; return; }
    const act = el.dataset.act;
    const id = el.dataset.id || "";
    const key = el.dataset.key || "";
    if (ui.holdFired && act === "mate") { ui.holdFired = false; return; }
    if (el.tagName === "BUTTON" && typeof el.blur === "function") el.blur();
    switch (act) {
      case "tab": openTab(id); break;
      case "handle": shrinkPanel(); break;
      case "grow": setPanel("rail"); break;
      case "bag": openTab("bag"); break;
      case "close": if (ui.trade || ui.craft) endService(); else setPanel("closed"); break;
      case "filter": store.filter = id; store.item = null; save(); renderSheet(); break;
      case "item": {
        // Kevin 5-11: een brief (item dat een quest start) opent meteen het gesprek met de brief.
        const reading = !ui.trade && !ui.craft ? catalogItem(itemPayload(key).itemId) : null;
        if (reading?.reads) { store.item = null; ui.story = { kind: "letter", itemId: reading.itemId }; ui.dockPick = "talk"; save(); applyLayout(); render(); break; }
        store.item = store.item === key ? null : key; save(); renderSheetOrService(); break;
      }
      case "slot": {
        const worn = (data().s03?.equipment || []).some(function (row) { return row.slotId === id; });
        if (worn) { store.item = store.item === "eq:" + id ? null : "eq:" + id; save(); renderSheet(); }
        else { store.tab = "bag"; store.filter = "equipment"; store.item = null; save(); renderRail(); renderSheet(); }
        break;
      }
      case "detail-close": store.item = null; save(); renderSheetOrService(); break;
      case "equip": api.run03("equip", null, itemPayload(key)); store.item = null; save(); break;
      case "unequip": api.run03("unequip", null, { slotId: id }); store.item = null; save(); break;
      case "use": api.run03("use", null, { itemId: id }); break;
      case "destroy": if (confirmTwice("destroy:" + key)) { api.run03("destroy", null, Object.assign(itemPayload(key), { amount: 1 })); } break;
      case "quests-done": store.done = !store.done; save(); renderSheet(); break;
      case "section": store.sectionFold[id] = !store.sectionFold[id]; save(); renderSheet(); break;
      case "quest-go": api.run04("node04:move_marker", id, { questId: el.dataset.quest || null }); break;
      case "quest-again": api.run04("node04:start_dialogue", id); break;
      case "quest-retry": api.run04("node04:accept_quest", null, { questId: id }); break;
      case "feed-quest": showQuest(id); break;
      // Kevin 8-11: wereld-event aanklikken = het gebied op de kaart en in de questregel (doe je al mee: die quest volgen).
      case "event-focus": {
        const ev = worldEvents().find(function (entry) { return entry.questId === id; });
        if (ev && eventJoined(ev)) api.run04("node04:track", null, { questId: id });
        else ui.eventFocus = id;
        ui.sig.event = null; ui.eventKey = null; renderEventLine();
        break;
      }
      case "event-close": {
        const ev = worldEvents().find(function (entry) { return entry.questId === id; });
        if (ev) ui.eventGone[id] = eventState(ev, serverNow()).key;
        if (ui.eventFocus === id) ui.eventFocus = "";
        ui.sig.event = null; ui.eventKey = null; renderEventLine();
        break;
      }
      case "stack-more": ui.stackOpen = !ui.stackOpen; ui.sig.feed = null; renderChatFeed(); break;
      // null (niet ""): ook de laatste melding weghalen moet de lijst opnieuw tekenen.
      case "feed-quest-close": ui.questFeed = ui.questFeed.filter(function (line) { return line.id !== id; }); ui.sig.feed = null; renderChatFeed(); break;
      case "quest-reward": api.run04("node04:choose_reward", null, { questId: id, choiceId: el.dataset.index }); break;
      case "quest-share": api.run04("node04:share", null, { questId: id }); break;
      case "quest-share-accept": api.run04("node04:accept_share", null, { questId: id }); break;
      case "quest-share-decline": api.run04("node04:decline_share", null, { questId: id }); break;
      case "quest-track": api.run04("node04:track", null, { questId: id }); break;
      case "quest-abandon": if (confirmTwice("quest-abandon:" + id)) api.run04("node04:abandon", null, { questId: id }); break;
      case "choice": {
        const dialogue = data().dialogue;
        if (dialogue) api.run04("node04:choose_dialogue", null, { dialogueId: dialogue.dialogueId, entryId: dialogue.entryId, choiceId: id });
        break;
      }
      case "service": startService(el.dataset.kind, id); break;
      case "service-back": endService(); break;
      case "talk-close": closeTalk(); break;
      case "mapcycle": cycleMap(); break;
      case "bigmap-close": ui.bigMap = false; syncBigMap(); break;
      case "bigmap-open": ui.bigMap = true; syncBigMap(); break;
      case "bigzoom": zoomBigTo(bigSpan() * (id === "in" ? 1 / 1.5 : 1.5), null); break;
      case "bigcenter": ui.bigFollow = true; ui.bigFocus = null; requestBigDraw(); break;
      case "mapshow": {
        const [which, kind] = id.split(":");
        if (store.map[which] && kind) {
          store.map[which][kind] = store.map[which][kind] === false;
          markMapOverride(which + ":" + kind);
          changedMap();
        }
        break;
      }
      case "maprotate": store.map.rotate = store.map.rotate === false; markMapOverride("rotate"); changedMap(); break;
      case "pin-clear": store.map.pin = null; changedMap(); break;
      case "pin-walk":
        if (store.map.pin) {
          const pin = store.map.pin;
          ui.bigMap = false;
          syncBigMap();
          if (api.walkTo && api.walkTo(pin.x, pin.z) !== false) toast("Op weg naar je pin.", { icon: "treasure-map", ms: 2200 });
          else toast("Je staat er al, of je kunt nu niet lopen.", { icon: "treasure-map", ms: 2200 });
        }
        break;
      case "fullscreen": toggleFullscreen(); break;
      case "icosize": store.icoSize = id; save(); render(); break;
      case "pixels": store.pixels = Number(id) || 1; save(); render(); break;
      case "icocolor": store.icoColor = id; save(); render(); break;
      case "respawn": api.run03("respawn", null, {}); break;
      case "story-accept": ui.focusQuest = { questId: id, until: performance.now() + 8000 }; api.run03("use", null, { itemId: el.dataset.item }); break;
      case "story-open": showQuest(id); break;
      case "unstuck": api.run03("unstuck", null, {}); break;
      case "attack": attack(); break;
      case "heal": heal(); break;
      case "skill": useSlot(Number(id)); break;
      case "skill-put": putSkill(Number(el.dataset.slot), id); break;
      case "skill-locked": { const entry = skillById(id); if (entry) toast(entry.displayName + ": " + lockLine(entry) + ".", { icon: "padlock", ms: 2500 }); break; }
      case "maker-level": api.run03("maker_level", null, { level: Number(id), skipMoveToTarget: true }); break;
      case "maker-xp": api.run03("maker_xp", null, { xp: Number(id), skipMoveToTarget: true }); break;
      case "do": interact(); break;
      case "map": {
        const zooms = Array.isArray(store.map.zoomLevels) && store.map.zoomLevels.length ? store.map.zoomLevels : ZOOMS;
        store.zoom = (num(store.zoom, 1) + 1) % zooms.length;
        markMapOverride("zoom");
        save();
        ui.mapAt = 0;
        break;
      }
      case "minimap-walk": {
        if (typeof minimap.worldAtClientPoint !== "function") break;
        const world = minimap.worldAtClientPoint(event.clientX, event.clientY);
        if (!world) break;
        const portal = portalNearMiniClick(world);
        if (portal) { askPortal(portal); break; }
        if (store.map.clickToMove === false) break;
        if (typeof api.walkToMap === "function") api.walkToMap(world.x, world.z);
        else if (typeof api.walkTo === "function") api.walkTo(world.x, world.z);
        break;
      }
      case "toast-close": api.dismissNotice(); break;
      case "ware": if (ui.trade) { ui.trade.offerId = ui.trade.offerId === id ? null : id; store.item = null; renderTalk(); } break;
      case "buy": if (ui.trade) api.run05("vendor_buy", { vendorId: ui.trade.vendorId, offerId: id, quantity: 1 }); break;
      case "sell": if (ui.trade && id) api.run05("vendor_sell", { vendorId: ui.trade.vendorId, offerId: id, quantity: 1 }); break;
      case "craft": if (ui.craft) api.run05("craft", { stationId: ui.craft.stationId, recipeId: id }); break;
      case "claim": api.run05("crafting:claim", { jobId: id }); break;
      case "set":
        store[id] = id.startsWith("health") ? !healthSettingOn(id) : !store[id];
        if (id === "minimap") markMapOverride("minimap");
        save(); ui.effective = ""; render(); break;
      case "size": store.size = id; save(); ui.effective = ""; render(); break;
      case "play": playCharacter(el.dataset.class, el.dataset.model || null); break;
      case "logout": api.logout(); break;
      // MMO (3-11): groep.
      case "mate": {
        if (data().s03?.healSpell) toggleHealTarget(id);
        else {
          const rect = el.getBoundingClientRect();
          const mate = partyMates().find(function (entry) { return entry.id === id; });
          openPlayerMenu({ id, name: mate?.name || "Speler", x: rect.right, y: rect.top + rect.height / 2 });
        }
        break;
      }
      case "party-menu": {
        const rect = el.getBoundingClientRect();
        openPlayerMenu({ id: "group", name: "Groep", x: rect.right, y: rect.bottom });
        break;
      }
      case "party-invite": closeMenu(); partyAct("invite", { targetPlayerId: id }); break;
      case "party-target": closeMenu(); toggleHealTarget(id); break;
      case "party-fold": store.partyFold = !store.partyFold; save(); closeMenu(); renderParty(); break;
      case "party-leave":
        if (ui.sure === "party-leave") { ui.sure = ""; window.clearTimeout(ui.sureTimer); closeMenu(); partyAct("leave", {}); }
        else {
          ui.sure = "party-leave";
          window.clearTimeout(ui.sureTimer);
          ui.sureTimer = window.setTimeout(function () { ui.sure = ""; if (ui.menu) renderMenu(); }, 3000);
          renderMenu();
        }
        break;
      case "party-rule": closeMenu(); partyAct("invite_rule", { rule: id }); break;
      case "party-kick":
        if (ui.sure === "kick:" + id) { ui.sure = ""; window.clearTimeout(ui.sureTimer); closeMenu(); partyAct("kick", { targetPlayerId: id }); }
        else {
          ui.sure = "kick:" + id;
          window.clearTimeout(ui.sureTimer);
          ui.sureTimer = window.setTimeout(function () { ui.sure = ""; if (ui.menu) renderMenu(); }, 3000);
          renderMenu();
        }
        break;
      case "invite-yes": partyAct("accept", { inviteId: id }); break;
      case "invite-no": partyAct("decline", { inviteId: id }); break;
      case "portal-go":
        closePortalAsk();
        if (ui.bigMap) { ui.bigMap = false; syncBigMap(); }
        if (id && typeof api.portalTravel === "function") api.portalTravel(id);
        break;
      case "portal-no": closePortalAsk(); break;
      case "portal-mate": closeMenu(); askMateTravel(id); break;
      case "portal-mate-go":
        closePortalAsk();
        if (ui.bigMap) { ui.bigMap = false; syncBigMap(); }
        if (id && typeof api.portalTravelMate === "function") api.portalTravelMate(id);
        break;
      case "menu-close": closeMenu(); break;
      // MMO stap 2 (3-11): chat.
      case "chat-open": if (chatShown()) closeChat(); else openChat({}); break;
      case "dock":
        if (id === "talk") { ui.dockPick = "talk"; render(); }
        else if (chatShown()) closeChat();
        else openChat({});
        break;
      case "chat-close": closeChat(); break;
      case "chat-tab": chatTab(id); break;
      case "chat-send": submitChat(); break;
      case "chat-quick": { const text = chatRulesNow().quick[Number(id)]; if (text) submitChat(text); break; }
      case "chat-to": cycleChatMode(); break;
      case "chat-blocks": ui.chatBlocksOpen = !ui.chatBlocksOpen; renderChat(); break;
      case "chat-size": ui.chatBig = !ui.chatBig; ui.chatScrollDown = true; render(); placeChat(); break;
      case "chat-unblock": if (!api.chatBlock || !api.chatBlock(id, false)) toast("Geen verbinding met de server.", { tone: "error" }); break;
      case "chat-name": {
        const rect = el.getBoundingClientRect();
        openPlayerMenu({ id, name: el.dataset.name || "Speler", x: rect.right, y: rect.top });
        break;
      }
      case "chat-whisper": {
        const name = ui.menu?.name || "Speler";
        closeMenu();
        ui.chatWhisper = { id, name };
        ui.chatModeSel = "whisper";
        openChat({ tab: store.chatTab === "all" ? null : "whisper", focus: true });
        break;
      }
      case "chat-block": {
        if (chatBlocked().some(function (entry) { return entry.id === id; })) {
          closeMenu();
          if (!api.chatBlock || !api.chatBlock(id, false)) toast("Geen verbinding met de server.", { tone: "error" });
        } else if (ui.sure === "block:" + id) {
          ui.sure = "";
          window.clearTimeout(ui.sureTimer);
          closeMenu();
          if (!api.chatBlock || !api.chatBlock(id, true)) toast("Geen verbinding met de server.", { tone: "error" });
        } else {
          ui.sure = "block:" + id;
          window.clearTimeout(ui.sureTimer);
          ui.sureTimer = window.setTimeout(function () { ui.sure = ""; if (ui.menu) renderMenu(); }, 3000);
          renderMenu();
        }
        break;
      }
      default: break;
    }
  }

  function playCharacter(classId, modelAssetId) {
    if (!classId || ui.charsBusy) return;
    ui.charsBusy = true;
    renderSheet();
    api.postJson("/api/game/characters/play", modelAssetId ? { classId, modelAssetId } : { classId }).then(function () {
      api.onSwitched();
    }).catch(function (error) {
      ui.charsBusy = false;
      toast(error?.message || "Wisselen lukte niet.", { tone: "error" });
      renderSheet();
    });
  }

  // Slepen in de winkel: een waar naar je tas = kopen, iets uit je tas naar de waren = verkopen.
  function onPointerDown(event) {
    // MMO (3-11): naast het menu tikken = menu dicht; lang drukken op een teamlid = menu.
    if (event.target === menuShade) { event.preventDefault(); closeMenu(); return; }
    const mateEl = event.target && typeof event.target.closest === "function" ? event.target.closest("[data-mate]") : null;
    if (mateEl && root.contains(mateEl)) startMateHold(event, mateEl);
    const source = event.target && typeof event.target.closest === "function" ? event.target.closest("[data-drag]") : null;
    if (!source || !root.contains(source) || event.button > 0) return;
    const start = { x: event.clientX, y: event.clientY };
    let ghost = null;
    let over = null;
    const move = function (moveEvent) {
      if (!ghost && Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) < 10) return;
      if (!ghost) {
        ghost = source.cloneNode(true);
        ghost.classList.add("gkDrag");
        document.body.append(ghost);
      }
      ghost.style.left = moveEvent.clientX + "px";
      ghost.style.top = moveEvent.clientY + "px";
      const hit = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const zone = hit && typeof hit.closest === "function" ? hit.closest("[data-drop]") : null;
      if (zone !== over) {
        if (over) over.classList.remove("gkDropOk");
        over = zone;
        const wanted = String(source.dataset.drag).startsWith("buy:") ? "bag" : "wares";
        if (over && over.dataset.drop === wanted) over.classList.add("gkDropOk");
        else over = null;
      }
    };
    const up = function () {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (ghost) {
        ghost.remove();
        ui.dragJustEnded = true;
        window.setTimeout(function () { ui.dragJustEnded = false; }, 0);
      }
      if (over) {
        over.classList.remove("gkDropOk");
        const [kind, offerId] = String(source.dataset.drag).split(":");
        if (ui.trade && offerId) api.run05(kind === "buy" ? "vendor_buy" : "vendor_sell", { vendorId: ui.trade.vendorId, offerId, quantity: 1 });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function handleKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    const code = event.code;
    if (code === "Escape") {
      if (ui.story && !data().dialogue) { closeStory(); return true; }
      if (ui.menu) { closeMenu(); return true; }
      if (chatShown()) { closeChat(); return true; }
      if (ui.bigMap) { ui.bigMap = false; syncBigMap(); return true; }
      if (store.item) { store.item = null; save(); renderSheetOrService(); return true; }
      if (ui.trade || ui.craft) { endService(); return true; }
      if (ui.serviceTalk) { endServiceTalk(); return true; }
      if (data().dialogue) { api.closeDialogue(); return true; }
      if (root.dataset.panel === "open") { setPanel("rail"); return true; }
      return false;
    }
    if (event.repeat) return false;
    // MMO stap 2 (3-11): Enter = chat (typen), / = chat met een opdracht (/g, /f naam, /r).
    if (code === "Enter" || code === "NumpadEnter") { openChat({ viaKey: true, focus: true }); return true; }
    if (code === "Slash" || code === "NumpadDivide") { openChat({ viaKey: true, focus: true, prefill: "/" }); return true; }
    if (code === "Digit1" || code === "Numpad1") { if (!has("hotbar_hud") || data().defeated) return false; attack(); return true; }
    if (code === "Digit2" || code === "Numpad2") { if (!has("hotbar_hud") || data().defeated) return false; useSlot(2); return true; }
    if (code === "Digit3" || code === "Numpad3") { if (!has("hotbar_hud") || data().defeated) return false; useSlot(3); return true; }
    if (code === "KeyE" || code === "KeyF") {
      if (data().defeated) return false;
      // Tijdens een gesprek is E ook "verder": voer de bovenste zichtbare keuze uit.
      // In een geopende winkel/werkplaats doen we dit niet, om onbedoeld kopen/maken te voorkomen.
      const firstTalkChoice = !ui.trade && !ui.craft && !talk.hidden
        ? talk.querySelector(".gkChoices .gkChoice:not(:disabled)")
        : null;
      if (firstTalkChoice) { firstTalkChoice.click(); return true; }
      if (!has("interaction_hud")) return false;
      interact();
      return true;
    }
    if (code === "KeyI") { openTab("bag"); return true; }
    if (code === "KeyM") { cycleMap(); return true; }
    if (ui.bigMap && (code === "Equal" || code === "NumpadAdd")) { zoomBigTo(bigSpan() / 1.5, null); return true; }
    if (ui.bigMap && (code === "Minus" || code === "NumpadSubtract")) { zoomBigTo(bigSpan() * 1.5, null); return true; }
    const tab = visibleTabs().find(function (entry) { return entry.key === code; });
    if (tab) { openTab(tab.id); return true; }
    return false;
  }

  root.addEventListener("click", onClick);
  root.addEventListener("input", function (event) {
    const input = event.target && typeof event.target.closest === "function" ? event.target.closest("[data-craft-search]") : null;
    if (!input || !root.contains(input)) return;
    ui.craftSearch = String(input.value || "");
    const query = ui.craftSearch.trim().toLocaleLowerCase();
    let visible = 0;
    for (const row of root.querySelectorAll("[data-craft-row]")) {
      row.hidden = Boolean(query && !String(row.dataset.search || "").includes(query));
      if (!row.hidden) visible += 1;
    }
    const empty = root.querySelector("[data-craft-empty]");
    if (empty) empty.hidden = visible > 0;
  });
  root.addEventListener("pointerdown", onPointerDown);
  // MMO (3-11): rechtsklik op een teamlid = spelermenu; nooit het browsermenu over het spelermenu heen.
  root.addEventListener("contextmenu", function (event) {
    const target = event.target && typeof event.target.closest === "function" ? event.target : null;
    if (!target) return;
    const mateEl = target.closest("[data-mate]");
    if (mateEl && root.contains(mateEl)) {
      event.preventDefault();
      if (ui.menu?.id === mateEl.dataset.mate) return;
      cancelMateHold();
      ui.holdFired = true;
      window.setTimeout(function () { ui.holdFired = false; }, 700);
      const mate = partyMates().find(function (entry) { return entry.id === mateEl.dataset.mate; });
      openPlayerMenu({ id: mateEl.dataset.mate, name: mate?.name || "Speler", x: event.clientX, y: event.clientY });
      return;
    }
    if (target.closest(".gkMenu, .gkMenuShade, .gkInvite")) event.preventDefault();
  });
  window.addEventListener("resize", function () { ui.effective = ""; applyLayout(); render(); padGrids(); });
  render();
  if (ui.bigMap) syncBigMap();

  return {
    render,
    frame,
    handleKey,
    toast,
    skillFailed,
    autoSwung,
    questBanner,
    questDone,
    npcSay,
    setMapPresentation,
    // Kevin 8-11: klik op een portal in de wereld = de grote kaart open, om te kiezen waarheen.
    openPortalMap(portalId) {
      if (!ui.bigMap) { ui.bigMap = true; ui.mapAt = 0; syncBigMap(); }
      const here = portalList().find(function (portal) { return portal.id === portalId; }) || null;
      toast(here && !here.unlocked ? (here.displayName || "Deze portal") + " is nog niet vrijgespeeld. Loop er eerst naartoe."
        : "Tik op een portal op de kaart om te reizen.", { icon: "magic-portal", ms: 3000 });
    },
    openCharacters() { openTab("chars"); },
    // kind: "connected" | "connecting" | "reconnecting" | "disconnected" (uit game.js).
    // detail = extra uitleg in de tooltip; de compacte meetwaarden krijgen ieder hun eigen gezondheidskleur.
    setConnection(kind, detail = "", pingMs = null, health = null) {
      const next = kind === "connected" ? "connected" : kind === "disconnected" ? "disconnected" : "standby";
      const label = "Server: " + CONN_LABEL[next] + (detail ? " (" + detail + ")" : "");
      const value = function (raw) { return raw === null || raw === undefined || raw === "" ? NaN : Number(raw); };
      const oneDecimal = function (number) { return Math.round(number * 10) / 10; };
      const setMetric = function (element, metricValue, tone, title) {
        const valueElement = element.querySelector(".gkConnValue");
        if (valueElement) valueElement.textContent = metricValue;
        element.className = "gkConnMetric gkHealth--" + tone;
        element.title = title;
      };
      const current = health && typeof health === "object" ? health : {};
      const ping = value(pingMs);
      const tps = value(current.tps);
      const targetTps = value(current.targetTps);
      const mspt = value(current.mspt);
      const tickBudgetMs = value(current.tickBudgetMs);
      const cpu = value(current.cpuPercent);
      const gpu = value(current.gpuPercent);
      const gpuMs = value(current.gpuMs);
      const loss = value(current.packetLossPercent);
      // Zonder bolletje toont de ping ook de verbinding: rood = geen antwoord, oranje = bezig of traag.
      setMetric(connPing, Number.isFinite(ping) ? Math.round(ping) + "ms" : "—",
        next === "disconnected" ? "bad" : next !== "connected" ? "warn" : !Number.isFinite(ping) ? "unknown" : ping < 100 ? "good" : ping < 200 ? "warn" : "bad",
        label + ". Ping: tijd heen en terug naar de server");
      const tpsRatio = Number.isFinite(tps) && Number.isFinite(targetTps) && targetTps > 0 ? tps / targetTps : NaN;
      setMetric(connTps, Number.isFinite(tps) ? String(oneDecimal(tps)) : "—",
        !Number.isFinite(tpsRatio) ? "unknown" : current.tickStatus === "DEGRADED" || tpsRatio < 0.75 ? "bad" : tpsRatio < 0.95 ? "warn" : "good",
        "TPS: werkelijke server-ticks per seconde" + (Number.isFinite(targetTps) ? " (doel " + oneDecimal(targetTps) + ")" : ""));
      setMetric(connMspt, Number.isFinite(mspt) ? String(oneDecimal(mspt)) : "—",
        !Number.isFinite(mspt) || !Number.isFinite(tickBudgetMs) ? "unknown" : mspt <= tickBudgetMs ? "good" : mspt <= tickBudgetMs * 1.6 ? "warn" : "bad",
        "MSPT: gemiddelde rekentijd per server-tick" + (Number.isFinite(tickBudgetMs) ? " (ruimte " + oneDecimal(tickBudgetMs) + " ms)" : ""));
      setMetric(connCpu, Number.isFinite(cpu) ? Math.round(cpu) + "%" : "—",
        !Number.isFinite(cpu) ? "unknown" : cpu < 70 ? "good" : cpu < 90 ? "warn" : "bad", "CPU van het game-serverproces");
      setMetric(connGpu, Number.isFinite(gpu) ? Math.round(gpu) + "%" : "—",
        !Number.isFinite(gpu) ? "unknown" : gpu < 70 ? "good" : gpu < 90 ? "warn" : "bad",
        Number.isFinite(gpu) ? "GPU: deel van de beeldtijd dat de grafische kaart bezig is" + (Number.isFinite(gpuMs) ? " (" + oneDecimal(gpuMs) + " ms per beeld)" : "")
          : "GPU: deze browser kan de grafische kaart niet meten");
      setMetric(connLoss, Number.isFinite(loss) ? oneDecimal(loss) + "%" : "—",
        !Number.isFinite(loss) ? "unknown" : loss < 1 ? "good" : loss < 5 ? "warn" : "bad", "Recente ping-metingen zonder antwoord");
      connKind = next;
      connTitle = label;
      connStatus.title = label;
      syncConnectionMetricVisibility();
      const visibleMetrics = Object.values(connMetrics).filter(function (element) { return !element.hidden; }).map(function (element) {
        return element.dataset.label + " " + (element.querySelector(".gkConnValue")?.textContent || "—");
      });
      connStatus.setAttribute("aria-label", label + (visibleMetrics.length ? ", " + visibleMetrics.join(", ") : ""));
    },
    // Een klap van een vijand (direct uit het netwerkbericht, vóór de nieuwe levens binnen zijn).
    playerHit(amount) {
      if (num(amount) > 0) hitFeedback(num(amount));
    },
    combat() { ui.combatAt = performance.now(); },
    // Healing (2-11): klein zwevend getal boven een vijand ("actor:..."), een speler ("player:...") of jezelf ("self").
    worldFloat,
    // Een tik op een NPC in de wereld: zelfde als de doe-knop (gesprek + winkel/werkplaats).
    talkTo,
    // MMO (3-11): lang drukken of rechtsklik op een andere speler in de wereld ({ id, name, x, y }).
    playerMenu: openPlayerMenu,
    // MMO stap 2 (3-11): chatbericht van de server, en meldingen (fout of info) voor het tabje Systeem.
    chatMessage,
    chatNotice,
    // Nieuw ontdekte stukken kaart (netwerkbericht fog:discovery).
    fogDiscovered(payload) {
      if (minimap.addFogCells(payload?.newlyDiscoveredCellKeys || [])) { ui.mapAt = 0; ui.bigAt = 0; }
    },
    element: root
  };
}
