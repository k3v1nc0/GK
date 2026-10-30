// Stap 4 (HUD): het nieuwe game-scherm als één geheel.
// - Altijd in beeld: portret met level, levens, XP-lijntje, één quest-regel, minimap en de ronde knoppen.
// - Eén paneel met tabbladen (tas, uitrusting, quests, geld, characters, instellingen, uitloggen) in drie
//   standen: dicht, smal (alleen iconen) en open. Liggend rechts, staand onderin; het spelbeeld schuift mee.
// - Praten, handelen en maken zijn tijdelijke standen bovenop het paneel. Daarna (en na een gevecht of een
//   herlaad) sta je weer precies waar je was: zelfde paneel, tabblad, filter, item en scrollplek.
// Dit bestand tekent alleen. Alle spelregels blijven op de server; game.js geeft de data en de acties (api).
import { ICON_PATHS } from "./gk-icon-paths.js?v=20261030-hud12";
import { createHudMinimap } from "./gk-minimap.js?v=20261030-hud12";

const STORE_KEY = "gk:hud:v1";
const SVG_NS = "http://www.w3.org/2000/svg";

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
  "water-drop": "mana", "treasure-map": "parchment", expand: "plain", contract: "plain", "magic-portal": "arcane", palette: "arcane"
};
// Kleuren van de iconen (Instellingen): "color" = elk icoon zijn eigen kleur, de rest één kleur voor alles.
const ICON_COLORS = [["color", "Kleur"], ["gold", "Goud"], ["ice", "IJs"], ["plain", "Wit"]];

const TABS = [
  { id: "bag", icon: "knapsack", title: "Tas", module: "inventory_hud", key: "KeyB" },
  { id: "gear", icon: "visored-helm", title: "Uitrusting", module: "equipment_hud", key: "KeyC" },
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
  // Namen boven poppetjes (2D): NPC's/vijanden/spullen, andere spelers, jijzelf.
  nameWorld: true, namePlayers: true, nameSelf: false };
// Kaarten: big/mini = wat je ziet per soort (ontbreekt = aan, dus een nieuwe soort staat vanzelf aan), span = meters in beeld
// op de grote kaart, bigIcon/miniIcon = grootte van de kaarticonen, rotate = minimap draait mee, pin = je eigen pin {x, z}.
// bigText/miniText = grootte van de gebiedsnamen (die zoomen ook mee met de kaart).
const MAP_DEFAULTS = { span: 160, bigIcon: 0.8, miniIcon: 1, bigText: 1, miniText: 1, rotate: false, pin: null, big: {}, mini: {} };
// Alles wat op de kaarten kan staan: [soort, meervoud (legenda), enkelvoud (naamlabel)].
const MAP_KINDS = [["area", "Gebiedsnamen", "Gebied"], ["npc", "NPC's", "NPC"], ["enemy", "Vijanden", "Vijand"], ["resource", "Grondstoffen", "Grondstof"], ["pickup", "Oppakken", "Oppakken"],
  ["player", "Spelers", "Speler"], ["portal", "Portals", "Portal"], ["quest", "Quest-doel", "Quest-doel"], ["pin", "Jouw pin", "Jouw pin"]];

function mapStore(raw) {
  const map = Object.assign({}, MAP_DEFAULTS, raw && typeof raw === "object" ? raw : {});
  map.big = Object.assign({}, raw?.big || {});
  map.mini = Object.assign({}, raw?.mini || {});
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

function loadStore() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}");
    return Object.assign({}, DEFAULTS, raw && typeof raw === "object" ? raw : {}, { scroll: Object.assign({}, raw?.scroll || {}), map: mapStore(raw?.map) });
  } catch {
    return Object.assign({}, DEFAULTS, { scroll: {}, map: mapStore(null) });
  }
}

export function createGkHud(api) {
  const store = loadStore();
  const ui = {
    trade: null,            // { vendorId, offerId } tijdens handelen
    craft: null,            // { stationId, recipeId } tijdens maken
    sure: "",               // knop die een tweede tik nodig heeft (weggooien, uitloggen)
    sureTimer: 0,
    chars: null,            // laatst geladen characters-lijst
    charsAt: 0,
    charsBusy: false,
    lastHp: null,
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
    doTarget: null,
    doKind: "",
    farTradeSince: 0,
    bigMap: false,          // grote kaart open (M of de kaartknop)
    bigAt: 0,
    bigHits: [],            // alles op de grote kaart waar je op kunt tikken
    bigView: null,          // hoe de grote kaart nu staat (midden, meters in beeld)
    bigFocus: null,         // midden van de grote kaart (wereld x, z)
    bigFollow: true,        // de grote kaart volgt jou (tot je gaat schuiven)
    talkFor: "",            // gesprek waar talkServices bij horen
    talkServices: [],       // winkel/werkplaats van de NPC waarmee je praat
    serviceTalk: null,      // NPC zonder gesprek maar met winkel en/of werkplaats
    pendingTalk: null,      // op weg naar een NPC om te praten
    talkAnchor: null        // waar je stond toen het gesprek begon (weglopen = sluiten)
  };
  let saveTimer = 0;

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
  const bars = h("div", { class: "gkBars" }, [name, hp, mp, xp]);
  const questLine = h("button", { type: "button", class: "gkQuestLine gkText", "data-act": "tab", "data-id": "quests", hidden: true });
  const unit = h("div", { class: "gkUnit" }, [portrait, bars, questLine]);

  const mapCanvas = h("canvas", { width: "120", height: "120" });
  const mapNorth = h("div", { class: "gkMapNorth" }, [h("b", { text: "N" })]);
  const mapZoom = h("span", { class: "gkMapZoom" });
  const mapButton = h("button", { type: "button", class: "gkMap", "data-act": "map", title: "Minimap (tik = in- of uitzoomen)" }, [mapCanvas, mapNorth, mapZoom]);
  const mapLabel = h("div", { class: "gkMapLabel gkText" });
  const fullIcon = h("span", { style: "display:contents" }, [ico("expand")]);
  const fullBtn = h("button", { type: "button", class: "gkMini", "data-act": "fullscreen", title: "Volledig scherm" }, [fullIcon]);
  const mapTools = h("div", { class: "gkMapTools" }, [
    h("button", { type: "button", class: "gkMini", "data-act": "mapcycle", title: "Grote kaart (M)" }, [ico("treasure-map"), h("span", { class: "gkKey", text: "M" })]),
    document.fullscreenEnabled ? fullBtn : null]);
  const mapWrap = h("div", { class: "gkMapWrap" }, [mapButton, mapLabel, mapTools]);
  const minimap = createHudMinimap(mapCanvas, function (world) { return api.textureUrl ? api.textureUrl(world?.ground?.textureAssetId) : null; },
    function () { ui.mapAt = 0; if (ui.bigMap) requestBigDraw(); });

  const targetName = h("strong");
  const targetFill = h("i");
  const targetText = h("b");
  const targetFrame = h("div", { class: "gkTarget gkText", hidden: true }, [targetName, h("div", { class: "gkHp" }, [targetFill, targetText])]);
  const toasts = h("div", { class: "gkToasts", "aria-live": "polite" });

  const attackLabel = h("span", { class: "gkActLabel" });
  const attackBtn = h("button", { type: "button", class: "gkAct gkAct--attack", "data-act": "attack", title: "Aanvallen (1)" }, [ico("crossed-swords"), attackLabel, h("span", { class: "gkKey", text: "1" })]);
  const doLabel = h("span", { class: "gkActLabel" });
  const doIcon = h("span", { style: "display:contents" }, [ico("hand")]);
  const doBtn = h("button", { type: "button", class: "gkAct gkAct--do", "data-act": "do", title: "Doen: praten, oppakken of verzamelen (E)" }, [doIcon, doLabel, h("span", { class: "gkKey", text: "E" })]);
  const bagAct = h("button", { type: "button", class: "gkAct gkAct--bag", "data-act": "bag", title: "Tas (B)" }, [ico("knapsack")]);
  const actions = h("div", { class: "gkActions" }, [bagAct, doBtn, attackBtn]);
  const bagBtn = h("button", { type: "button", class: "gkBagBtn", title: "Tas (B)" }, [h("i", { "data-act": "bag" }, [ico("knapsack")]), h("em", { "data-act": "grow", text: "‹", title: "Iconen tonen" })]);

  const talk = h("div", { class: "gkTalk", hidden: true, role: "dialog" });
  const death = h("div", { class: "gkDeath", hidden: true });
  const debugSlot = h("div", { class: "gkDebugSlot" });
  // Namen boven NPC's, vijanden en items: scherpe 2D-tekst die met het doel meebeweegt (geen 3D-bordjes meer).
  const labels = h("div", { class: "gkLabels", "aria-hidden": "true" });
  const labelPool = new Map();
  game.append(labels, unit, targetFrame, toasts, mapWrap, bagBtn, actions, talk, death, debugSlot);

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
  const panel = h("aside", { class: "gkPanel" }, [rail, sheet]);
  root.append(vignette, game, panel, bigMap);
  (api.mount || document.body).append(root);
  document.documentElement.classList.add("gkHudActive");

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
    if (ui.trade) return "trade";
    if (ui.craft) return "craft";
    if (d.dialogue || ui.serviceTalk) return "talk";
    return "explore";
  }
  function combat(now = performance.now()) {
    return now - ui.combatAt < COMBAT_MS;
  }
  function effectivePanel(currentMode, currentOrient) {
    if (currentMode === "trade" || currentMode === "craft") return "open";
    let panelState = store.panel || (currentOrient === "port" ? "closed" : "rail");
    if (panelState === "open" && currentMode === "talk" && currentOrient === "port") panelState = "rail";
    if (panelState === "open" && store.combatFold && currentOrient !== "land" && combat()) panelState = "rail";
    return panelState;
  }
  function applyLayout() {
    const o = orient();
    const m = mode();
    const p = effectivePanel(m, o);
    const key = o + "|" + m + "|" + p + "|" + store.size + "|" + (store.minimap ? 1 : 0);
    if (key === ui.effective) return false;
    ui.effective = key;
    root.dataset.orient = o;
    root.dataset.mode = m;
    root.dataset.panel = p;
    root.dataset.size = store.size;
    root.dataset.minimap = store.minimap ? "on" : "off";
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
    applyLayout();
    renderUnit();
    renderToasts();
    renderTalk();
    renderDeath();
    renderRail();
    renderSheet();
    syncSettings();
  }

  function renderUnit() {
    const d = data();
    const s03 = d.s03;
    const health = healthOf(s03);
    const mana = manaOf(s03);
    const progression = s03?.progression || {};
    const quest = has("quest_tracker_hud") ? trackedQuest() : null;
    const step = quest?.activeStep || null;
    const objective = (step?.objectives || [])[0] || null;
    const questText = quest ? (step?.instruction || step?.displayName || quest.displayName) : "";
    const portraitUrl = api.assetUrl(d.player?.modelAssetId, true);
    const signature = JSON.stringify([d.player?.displayName, d.player?.className, portraitUrl, progression.level, progression.progressPercent,
      health.cur, health.max, mana.cur, mana.max, questText, objective?.currentValue, objective?.requiredValue, step?.complete, has("hud_bar"), has("xp_hud")]);
    // Klap of genezing: zwevend getal bij de levensbalk (alleen bij echte verandering, niet bij de eerste keer).
    if (s03 && ui.lastHp !== null && health.max > 0 && health.cur !== ui.lastHp) {
      const delta = Math.round(health.cur - ui.lastHp);
      if (delta < 0 && !d.defeated) {
        ui.combatAt = performance.now();
        if (performance.now() - ui.lastHitAt > 1200) hitFeedback(-delta);
      } else if (delta > 0 && health.cur < health.max + 1) {
        floatText(hp, "+" + delta, "good");
      }
    }
    if (s03) ui.lastHp = health.cur;
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
    questLine.hidden = !quest;
    if (quest) {
      const progress = objective && num(objective.requiredValue) > 1 ? fmt(objective.currentValue) + "/" + fmt(objective.requiredValue) : "";
      questLine.classList.toggle("gkDone", step?.complete === true);
      questLine.replaceChildren(ico(step?.complete ? "check-mark" : "scroll-unfurled"), h("span", { text: questText }), progress ? h("em", { text: progress }) : "");
      questLine.title = quest.displayName;
    }
  }

  function floatText(anchor, text, tone) {
    const node = h("span", { class: "gkFloat " + tone, text });
    anchor.append(node);
    window.setTimeout(function () { node.remove(); }, 1150);
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
  function levelUp(newLevel) {
    const node = h("div", { class: "gkLevelUp" }, [ico("star-medal"), h("b", { text: "Level " + newLevel + "!" })]);
    game.append(node);
    window.setTimeout(function () { node.remove(); }, 2700);
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

  // Praatstrook: gezicht van de NPC, de tekst en grote keuzeknoppen. Winkel en maken komen er als keuze bij.
  function renderTalk() {
    const d = data();
    const dialogue = d.dialogue || (ui.serviceTalk ? { dialogueId: "", entryId: "", speakerName: ui.serviceTalk.name, text: "Wat kan ik voor je doen?", choices: [], targetRef: "" } : null);
    const npcId = String(dialogue?.targetRef || "").replace(/^target\.npc\./, "");
    // Winkel en werkplaats van deze NPC: via de NPC-kaart, of (oude NPC's) wat er op dezelfde plek staat.
    const extra = d.dialogue ? (ui.talkFor === String(d.dialogue.dialogueId || "") ? ui.talkServices : []) : (ui.serviceTalk?.services || []);
    const pick = function (kind) { const found = extra.find(function (entry) { return entry.kind === kind; }); return found ? (kind === "vendor" ? api.vendor(found.id) : api.station(found.id)) : null; };
    const vendor = dialogue && has("vendor_hud") ? api.vendor("vendor." + npcId) || pick("vendor") : null;
    const station = dialogue && has("crafting_hud") ? api.station("station." + npcId) || pick("station") : null;
    const signature = dialogue ? JSON.stringify([root.dataset.mode, dialogue.speakerName, dialogue.dialogueId, dialogue.entryId, dialogue.text, (dialogue.choices || []).map(function (c) { return c.choiceId; }), Boolean(vendor), Boolean(station), d.busy?.n04]) : "";
    if (ui.sig.talk === signature) return;
    ui.sig.talk = signature;
    talk.hidden = !dialogue || root.dataset.mode !== "talk";
    if (!dialogue) { talk.replaceChildren(); return; }
    const faceUrl = api.npcFaceUrl(dialogue.targetRef) || (ui.serviceTalk?.face || null);
    const choices = h("div", { class: "gkChoices" });
    const list = Array.isArray(dialogue.choices) ? dialogue.choices : [];
    const closing = list.filter(function (c) { return c.action === "close" && !c.nextEntryRef; });
    const normal = list.filter(function (c) { return !closing.includes(c); });
    for (const choice of normal) choices.append(choiceButton(choice));
    if (vendor) choices.append(h("button", { type: "button", class: "gkChoice gkChoice--service", "data-act": "service", "data-kind": "vendor", "data-id": vendor.vendorId }, [ico("shop"), "Handelen"]));
    if (station) choices.append(h("button", { type: "button", class: "gkChoice gkChoice--service", "data-act": "service", "data-kind": "station", "data-id": station.stationId }, [ico("anvil-impact"), "Maken"]));
    for (const choice of closing) choices.append(choiceButton(choice));
    talk.replaceChildren(
      h("div", { class: "gkTalkFace" }, [faceUrl ? h("img", { src: faceUrl, alt: "" }) : ico("talk")]),
      h("div", { class: "gkTalkBody" }, [
        h("div", { class: "gkTalkHead" }, [h("strong", { text: dialogue.speakerName || dialogue.displayName || "" }),
          h("button", { type: "button", class: "gkClose", "data-act": "talk-close", title: "Sluiten (Esc)" }, [ico("cancel")])]),
        h("div", { class: "gkTalkText", text: dialogue.text || "" }),
        choices
      ])
    );
    function choiceButton(choice) {
      const id = String(choice.choiceId || "");
      const icon = id.startsWith("choice.ask.") ? "scroll-unfurled" : id.startsWith("choice.done.") || id.startsWith("choice.accept.") ? "check-mark"
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
    const signature = JSON.stringify([p, m, store.tab, tabs.map(function (tab) { return tab.id; }), questDot]);
    if (ui.sig.rail === signature) return;
    ui.sig.rail = signature;
    rail.hidden = m === "trade" || m === "craft";
    const items = [h("button", { type: "button", class: "gkTab gkHandle", "data-act": "handle", title: p === "open" ? "Kleiner (alleen iconen)" : "Dicht" }, [h("b", { text: "›" })])];
    for (const tab of tabs) {
      const on = p === "open" && tab.id === store.tab;
      items.push(h("button", { type: "button", class: "gkTab" + (on ? " gkOn" : ""), "data-act": "tab", "data-id": tab.id, title: tab.title + (tab.key ? " (" + tab.key.slice(3) + ")" : ""), "aria-pressed": on ? "true" : "false" },
        [ico(tab.icon), tab.id === "quests" && questDot ? h("span", { class: "gkDot" }) : null]));
      if (tab.id === "money") items.push(h("span", { class: "gkRailGap" }));
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
    const parts = [view, store.filter, store.item, store.quest, store.done, ui.sure, d.busy, ui.trade, ui.craft, store.minimap, store.music, store.size, store.combatFold, store.debug, store.icoSize, store.icoColor, store.icoAnim];
    if (view === "bag" || view === "trade" || view === "craft" || view === "gear") parts.push(d.s03?.inventory, d.s03?.equipment, d.s03?.currencies, d.s03?.catalog, d.s03?.stats);
    if (view === "trade") parts.push(api.vendor(ui.trade?.vendorId));
    if (view === "craft") parts.push(api.station(ui.craft?.stationId), d.s05?.crafting?.jobs);
    if (view === "quests") parts.push(d.s04?.quests, d.s04?.trackedQuest?.questId);
    if (view === "money") parts.push(d.s03?.currencies);
    if (view === "chars") parts.push(ui.chars, ui.charsBusy);
    if (view === "settings") parts.push(d.isAdmin);
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
    const built = view === "bag" ? sheetBag() : view === "gear" ? sheetGear() : view === "quests" ? sheetQuests() : view === "money" ? sheetMoney()
      : view === "chars" ? sheetChars() : view === "settings" ? sheetSettings() : view === "logout" ? sheetLogout() : view === "trade" ? sheetTrade() : sheetCraft();
    sheet.replaceChildren(...built);
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

  function head(icon, title, extra) {
    return h("div", { class: "gkSheetHead" }, [extra || h("h2", null, [ico(icon), title]),
      h("button", { type: "button", class: "gkClose", "data-act": "close", title: "Dicht (Esc)" }, [ico("cancel")])]);
  }

  function inventoryEntries() {
    const items = data().s03?.inventory?.items || [];
    return items.map(function (entry) {
      const def = catalogItem(entry.itemId) || {};
      const key = entry.kind === "instance" ? "inst:" + entry.instanceId : "stack:" + entry.itemId;
      return { key, entry, def, category: def.category || entry.category || "misc", name: def.displayName || entry.displayName || entry.itemId };
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
    [itemVisual(item.entry.itemId), qty > 1 ? h("b", { text: fmt(qty) }) : null]);
  }
  function emptyCells(count, min = 20) {
    const cells = [];
    for (let i = count; i < Math.max(min, count); i += 1) cells.push(h("div", { class: "gkCell gkEmpty", "aria-hidden": "true" }));
    return cells;
  }
  // Na het tekenen: de laatste rij vol maken met lege vakjes, zoals een echte tas.
  function padGrids() {
    for (const grid of sheet.querySelectorAll(".gkGrid")) {
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
      if (num(def.healAmount) > 0) buttons.push(h("button", { type: "button", class: "gkBtn gkGo", "data-act": "use", "data-id": itemId, disabled: busy ? true : null }, [ico("heart-plus", "plain"), "Gebruiken"]));
      if (!def.questItem && !options.sell) {
        const sure = ui.sure === "destroy:" + key;
        buttons.push(h("button", { type: "button", class: "gkBtn gkWarn" + (sure ? " gkSure" : ""), "data-act": "destroy", "data-key": key, disabled: busy ? true : null },
          [ico("trash-can", "plain"), sure ? "Zeker? Tik nog eens" : "Weggooien"]));
      }
    }
    const qty = item?.entry.kind === "stack" ? num(item.entry.quantity, 1) : 1;
    const line = [RARITY_LABEL[rarity] || "", CATEGORY_LABEL[def.category] || "", qty > 1 ? qty + " stuks" : "", equipped ? "Gedragen: " + (equipped.slotName || "") : ""].filter(Boolean).join(" · ");
    return h("div", { class: "gkDetail", role: "dialog" }, [
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
    const available = quests.available || [];
    const completed = quests.completed || [];
    if (!active.length && !available.length && !completed.length) list.append(emptyNote("scroll-unfurled", "Nog geen quests. Praat met mensen in de wereld."));
    if (active.length) list.append(h("div", { class: "gkSection", text: "Bezig" }));
    for (const quest of active) list.append(questCard(quest, quest.questId === trackedId, targets.find(function (t) { return t.questId === quest.questId; })));
    if (available.length) list.append(h("div", { class: "gkSection", text: "Te halen" }));
    for (const quest of available) list.append(questCard(quest, false, null));
    if (completed.length) {
      list.append(h("button", { type: "button", class: "gkRow", "data-act": "quests-done" }, [ico("check-mark"), h("span", { text: "Voltooid (" + completed.length + ")" }), h("b", { text: store.done ? "▾" : "▸" })]));
      if (store.done) for (const quest of completed) list.append(questCard(quest, false, null));
    }
    body.append(list);
    return [head("scroll-unfurled", "Quests"), body];
  }
  function questCard(quest, tracked, target) {
    const step = quest.activeStep || null;
    const status = quest.status === "completed" ? "Voltooid" : quest.status === "available" ? "Te halen" : step?.complete ? "Klaar! Ga terug" : tracked ? "Volg je" : "";
    const card = h("div", { class: "gkCard" + (tracked ? " gkOn" : "") }, [
      h("h3", null, [ico(quest.status === "completed" || step?.complete ? "check-mark" : "scroll-unfurled"), h("span", { text: quest.displayName }), status ? h("small", { text: status }) : null])
    ]);
    const text = step?.instruction || quest.summary || quest.description || "";
    if (text) card.append(h("p", { text }));
    for (const objective of step?.objectives || []) {
      const required = Math.max(1, num(objective.requiredValue, 1));
      const current = Math.min(required, num(objective.currentValue));
      if (required > 1) {
        card.append(h("div", { class: "gkObjective" + (objective.complete ? " gkOk" : "") }, [h("span", { text: objective.instruction || objective.displayName || "" }), h("b", { text: fmt(current) + " / " + fmt(required) })]));
        card.append(h("div", { class: "gkProgress" }, [h("i", { style: "width:" + Math.round(current / required * 100) + "%" })]));
      }
    }
    const rewards = (quest.rewards || []).map(function (reward) {
      if (reward.kind === "xp") return stat("round-star", fmt(reward.amount) + " XP");
      if (reward.kind === "currency") return h("span", { class: "gkStat" }, [coin(reward.amount, reward.currencyId)]);
      return h("span", { class: "gkStat" }, [h("span", { style: "width:16px;height:16px;display:inline-block" }, [itemVisual(reward.itemId)]), reward.amount + "× " + (reward.displayName || "")]);
    });
    if (rewards.length && quest.status !== "completed") card.append(h("div", { class: "gkRewards" }, rewards));
    const buttons = [];
    const busy = data().busy?.n04;
    if (tracked && target) buttons.push(h("button", { type: "button", class: "gkBtn gkGo", "data-act": "quest-go", "data-id": target.instanceId, "data-quest": quest.questId, disabled: busy ? true : null }, [ico("position-marker", "plain"), "Ga erheen"]));
    if (!tracked && (quest.status === "active" || quest.status === "ready_to_turn_in")) buttons.push(h("button", { type: "button", class: "gkBtn", "data-act": "quest-track", "data-id": quest.questId, disabled: busy ? true : null }, [ico("compass", "plain"), "Volgen"]));
    if (buttons.length) card.append(h("div", { class: "gkBtns" }, buttons));
    return card;
  }

  function sheetMoney() {
    const list = currencies();
    const body = h("div", { class: "gkBody" }, [h("div", { class: "gkList" }, list.length ? list.map(function (c) {
      return h("div", { class: "gkCard gkMoney" }, [h("span", { class: "gkMoneyIcon" }, [currencyVisual(c.currencyId)]), h("strong", { text: c.displayName }), h("b", { text: fmt(c.amount) })]);
    }) : [emptyNote("two-coins", "Er is nog geen geld in deze wereld.")])]);
    return [head("two-coins", "Geld"), body];
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
    const list = h("div", { class: "gkList" }, [
      toggle("minimap", "compass", "Minimap", "Rechtsboven. Tik op de kaart om te zoomen; M of de kaartknop opent de grote kaart.", store.minimap),
      h("div", { class: "gkRow" }, [ico("treasure-map"), h("span", null, ["Kaarten", h("small", { text: "Wat je op de grote en kleine kaart ziet, grootte van de kaarticonen, je pin." })]),
        h("button", { type: "button", class: "gkBtn", "data-act": "bigmap-open" }, ["Instellen"])]),
      toggle("nameWorld", "talk", "Namen van NPC's en spullen", "Boven NPC's, vijanden, grondstoffen en items.", store.nameWorld),
      toggle("namePlayers", "person", "Namen van andere spelers", null, store.namePlayers),
      toggle("nameSelf", "person", "Mijn eigen naam", "Boven je eigen poppetje.", store.nameSelf),
      toggle("music", store.music ? "musical-notes" : "speaker-off", "Muziek", null, store.music),
      toggle("combatFold", "crossed-swords", "Paneel klein tijdens gevecht", "Op een telefoon of smal venster: na het gevecht komt het terug.", store.combatFold),
      h("div", { class: "gkRow" }, [ico("resize"), h("span", null, ["Grootte van het scherm", h("small", { text: "Knoppen, kaart en paneel." })]), sizes]),
      h("div", { class: "gkRow" }, [ico("knapsack"), h("span", null, ["Grootte van de iconen", h("small", { text: "Alleen de plaatjes, niet de knoppen." })]),
        h("div", { class: "gkSeg" }, [["s", "S"], ["m", "M"], ["l", "L"]].map(function (pair) {
          return h("button", { type: "button", class: store.icoSize === pair[0] ? "gkOn" : null, "data-act": "icosize", "data-id": pair[0] }, [pair[1]]);
        }))]),
      h("div", { class: "gkRow" }, [ico("palette"), h("span", null, ["Kleur van de iconen", h("small", { text: "Kleur = elk icoon zijn eigen kleur." })]),
        h("div", { class: "gkSeg" }, ICON_COLORS.map(function (pair) {
          return h("button", { type: "button", class: (store.icoColor === pair[0] ? "gkOn" : "") + " gkSwatch gkSwatch--" + pair[0], "data-act": "icocolor", "data-id": pair[0], title: pair[1] }, [pair[1]]);
        }))]),
      toggle("icoAnim", "sparkles", "Bewegende iconen", "Het actieve tabblad en de knoppen bewegen zachtjes.", store.icoAnim),
      d.isAdmin ? toggle("debug", "crown", "Prestatie-info (admin)", "FPS, frame-tijd, GPU en netwerk linksonder.", store.debug) : null,
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
    if (!vendor) return [head("shop", "Winkel"), h("div", { class: "gkBody" }, [emptyNote("shop", "Deze winkel is er niet meer.")])];
    const offers = (vendor.offers || []).filter(function (offer) { return ["sell_to_player", "both"].includes(offer.mode); });
    const sellByItem = new Map((vendor.offers || []).filter(function (offer) { return ["buy_from_player", "both"].includes(offer.mode) && num(offer.buyPriceMinor) > 0; })
      .map(function (offer) { return [offer.itemRef, offer]; }));
    const wares = h("div", { class: "gkGrid", "data-drop": "wares" }, offers.map(function (offer) {
      const def = catalogItem(offer.itemRef) || {};
      return h("button", { type: "button", class: "gkCell" + (ui.trade.offerId === offer.offerId ? " gkOn" : "") + (offer.canBuy ? "" : " gkNo"), "data-act": "ware", "data-id": offer.offerId,
        "data-rarity": def.rarity || "common", title: (offer.displayName || def.displayName || offer.itemRef) + " kopen", "data-drag": "buy:" + offer.offerId },
      [itemVisual(offer.itemRef), h("span", { class: "gkPrice" }, [currencyVisual(offer.sellCurrencyRef), fmt(offer.sellPriceMinor)])]);
    }));
    const top = h("div", { class: "gkSplitTop" }, [offers.length ? wares : emptyNote("shop", "Deze winkel verkoopt niets.")]);
    const selected = offers.find(function (offer) { return offer.offerId === ui.trade.offerId; });
    if (selected) {
      top.append(h("div", { class: "gkBar" }, [h("div", { class: "gkCell", "data-rarity": catalogItem(selected.itemRef)?.rarity || "common" }, [itemVisual(selected.itemRef)]),
        h("span", { text: (selected.displayName || selected.itemRef) + (selected.owned ? " · je hebt er " + fmt(selected.owned) : "") }),
        h("button", { type: "button", class: "gkBtn gkGo", "data-act": "buy", "data-id": selected.offerId, disabled: d.busy?.n05 || !selected.canBuy ? true : null },
          [ico("two-coins", "plain"), "Kopen ", coin(selected.sellPriceMinor, selected.sellCurrencyRef)])]));
    }
    const all = inventoryEntries();
    const body = h("div", { class: "gkBody", "data-drop": "bag" }, [h("div", { class: "gkGrid" }, all.map(function (item) {
      const offer = sellByItem.get(item.entry.itemId);
      return bagCell(item, { on: item.key === store.item, no: !offer, drag: offer ? "sell:" + offer.offerId : null });
    }).concat(emptyCells(all.length, 10)))]);
    const parts = [head("shop", vendor.label || vendor.displayName || "Winkel"), top,
      h("div", { class: "gkSplitLabel" }, [ico("knapsack"), "Jouw tas · tik om te verkopen"]), body, bagFoot(all.length)];
    const sellItem = store.item ? all.find(function (item) { return item.key === store.item; }) : null;
    const detail = sellItem ? itemDetail(store.item, { sell: sellByItem.get(sellItem.entry.itemId) || { offerId: "", canSell: false, buyPriceMinor: 0 } }) : null;
    if (detail) parts.push(detail);
    return parts;
  }

  function sheetCraft() {
    const d = data();
    const station = api.station(ui.craft?.stationId);
    if (!station) return [head("anvil-impact", "Maken"), h("div", { class: "gkBody" }, [emptyNote("anvil-impact", "Hier kun je niets meer maken.")])];
    const recipes = station.recipes || [];
    if (!recipes.some(function (recipe) { return recipe.recipeId === ui.craft.recipeId; })) ui.craft.recipeId = recipes[0]?.recipeId || null;
    const recipe = recipes.find(function (entry) { return entry.recipeId === ui.craft.recipeId; }) || null;
    const top = h("div", { class: "gkSplitTop" });
    if (recipes.length > 1) {
      top.append(h("div", { class: "gkRecipeTabs" }, recipes.map(function (entry) {
        const output = (entry.outputs || [])[0];
        return h("button", { type: "button", class: "gkCell" + (entry.recipeId === ui.craft.recipeId ? " gkOn" : ""), "data-act": "recipe", "data-id": entry.recipeId, title: entry.displayName },
          [output?.itemId ? itemVisual(output.itemId) : ico("hammer-drop")]);
      })));
    }
    if (!recipe) top.append(emptyNote("anvil-impact", "Geen recepten."));
    else {
      const row = h("div", { class: "gkRecipe" });
      (recipe.ingredients || []).forEach(function (ingredient, index) {
        if (index) row.append(h("span", { class: "gkSign", text: "+" }));
        const ok = num(ingredient.owned) >= num(ingredient.required, 1);
        row.append(h("div", { class: "gkRecipeItem" }, [h("div", { class: "gkCell", title: ingredient.displayName, "data-rarity": catalogItem(ingredient.itemRef)?.rarity || "common" },
          [ingredient.itemRef ? itemVisual(ingredient.itemRef) : currencyVisual(ingredient.currencyRef)]),
        h("span", { class: "gkNeed " + (ok ? "gkOk" : "gkMiss"), text: fmt(ingredient.owned) + "/" + fmt(ingredient.required) + (ok ? " ✓" : " ✗") })]));
      });
      row.append(h("span", { class: "gkSign", text: "→" }));
      for (const output of recipe.outputs || []) {
        row.append(h("div", { class: "gkRecipeItem" }, [h("div", { class: "gkCell", title: output.displayName, "data-rarity": catalogItem(output.itemId)?.rarity || "common" },
          [output.itemId ? itemVisual(output.itemId) : currencyVisual(output.currencyId), num(output.amount) > 1 ? h("b", { text: fmt(output.amount) }) : null])]));
      }
      row.append(h("button", { type: "button", class: "gkBtn gkGo", "data-act": "craft", "data-id": recipe.recipeId, title: "Maken", disabled: d.busy?.n05 || !recipe.canCraft ? true : null },
        [ico("hammer-drop", "plain"), num(recipe.craftDurationMs) > 0 ? Math.round(num(recipe.craftDurationMs) / 1000) + " s" : ""]));
      top.append(h("strong", { text: recipe.displayName }), row);
    }
    const now = Date.now();
    for (const job of (d.s05?.crafting?.jobs || []).filter(function (entry) { return entry.state === "running"; }).slice(0, 3)) {
      const start = Date.parse(job.startedAt || "") || now;
      const end = Date.parse(job.completesAt || "") || now;
      const pct = end > start ? Math.max(0, Math.min(1, (now - start) / (end - start))) : 1;
      const jobRecipe = recipes.find(function (entry) { return entry.recipeId === job.recipeId; });
      top.append(h("div", { class: "gkJob" }, [ico("hourglass"), h("span", { text: jobRecipe?.displayName || job.recipeId }),
        h("div", { class: "gkProgress" }, [h("i", { style: "width:" + Math.round(pct * 100) + "%" })]),
        h("button", { type: "button", class: "gkBtn gkGo", "data-act": "claim", "data-id": job.jobId, disabled: d.busy?.n05 || !job.canClaim ? true : null }, ["Ophalen"])]));
    }
    const all = inventoryEntries();
    const body = h("div", { class: "gkBody" }, [h("div", { class: "gkGrid" }, all.map(function (item) { return bagCell(item, { on: item.key === store.item }); }).concat(emptyCells(all.length, 10)))]);
    return [head("anvil-impact", station.label || "Maken"), top, h("div", { class: "gkSplitLabel" }, [ico("knapsack"), "Jouw tas"]), body, bagFoot(all.length)];
  }

  function syncSettings() {
    const signature = JSON.stringify([store.music, store.debug && data().isAdmin, has("hotbar_hud"), has("interaction_hud"), store.icoSize, store.icoAnim, store.icoColor]);
    if (ui.sig.settings === signature) return;
    ui.sig.settings = signature;
    root.dataset.ico = store.icoSize || "m";
    root.dataset.icoanim = store.icoAnim ? "on" : "off";
    root.dataset.icocolor = store.icoColor || "color";
    root.dataset.hotbar = has("hotbar_hud") ? "on" : "off";
    root.dataset.dobtn = has("interaction_hud") ? "on" : "off";
    api.setMusic(store.music);
    api.setDebug(Boolean(store.debug && data().isAdmin), debugSlot);
  }

  // ---- elk frame (gedoseerd): minimap, knoppen, doelwit en het meeschuivende beeld ----
  function frame(now = performance.now()) {
    drawLabels(now);
    // Stand en maat van het paneel hooguit 10x per seconde bekijken (zuinig op de oude laptop).
    if (now - ui.layoutAt >= 100) {
      ui.layoutAt = now;
      if (applyLayout()) { renderTalk(); renderRail(); renderSheet(); }
      ui.inset.want = measureInset();
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
  function updateTargets(now) {
    const list = liveTargets();
    const selectedId = String(api.live().selectedTargetId || "");
    const enemies = list.filter(function (t) { return t.entityKind === "enemy" && t.available !== false && t.alive !== false && num(t.distance) <= ATTACK_RANGE_M; })
      .sort(function (a, b) { return num(a.distance) - num(b.distance); });
    ui.attackTarget = enemies.find(function (t) { return String(t.instanceId) === selectedId; }) || enemies[0] || null;
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
    // Op weg naar een NPC: aangekomen = praten (hooguit 20 s blijven wachten).
    if (ui.pendingTalk) {
      const waiting = list.find(function (t) { return String(t.instanceId) === ui.pendingTalk.id; });
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

  // 2D-naamlabels: elke beurt de schermplek bijwerken (alleen transform, geen nieuwe elementen als het niet hoeft).
  let labelRect = null;
  let labelRectAt = 0;
  function drawLabels(now) {
    const anchors = typeof api.labelAnchors === "function" ? api.labelAnchors() : [];
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
      if (el.textContent !== anchor.name) el.textContent = anchor.name;
      const kind = own || markerKind(anchor) || "other";
      const className = "gkLabel gkLabel--" + kind + (anchor.selected ? " gkOn" : "") + (anchor.available === false ? " gkDim" : "");
      if (el.className !== className) el.className = className;
      el.style.transform = "translate3d(" + Math.round(anchor.x - labelRect.left) + "px," + Math.round(anchor.y - labelRect.top) + "px,0) translate(-50%,-100%)";
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
    if (ui.serviceTalk) endServiceTalk();
    else api.closeDialogue();
  }

  function drawMap() {
    const live = api.live();
    const position = live.position;
    if (!position) return;
    if (fogConfig) minimap.revealAround(position.x, position.z, fogConfig.revealRadius);
    const markers = mapMarkers(live);
    const questTarget = mapQuestTarget();
    const zoom = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, num(store.zoom, 1)))];
    const sm = store.map;
    // Meedraaien = jouw kijkrichting staat altijd boven (zoals in WoW); uit = noorden boven.
    const facing = num(live.facingDeg) * Math.PI / 180;
    const north = minimap.draw({ world: live.world, center: position, facingDeg: live.facingDeg, forward: sm.rotate === false ? { x: 0, z: -1 } : { x: Math.sin(facing), z: Math.cos(facing) },
      radius: zoom, markers, quest: questTarget, pin: sm.pin, show: sm.mini, iconScale: sm.miniIcon, areas: areaLabels(live), textScale: sm.miniText });
    const rounded = Math.round(num(north));
    if (ui.sig.north !== rounded) {
      ui.sig.north = rounded;
      mapNorth.style.transform = rounded ? "rotate(" + rounded + "deg)" : "";
    }
    const label = live.region || "";
    if (mapLabel.textContent !== label) mapLabel.textContent = label;
    const zoomText = ["+", "", "−"][num(store.zoom, 1)] || "";
    if (mapZoom.textContent !== zoomText) mapZoom.textContent = zoomText;
    mapZoom.hidden = !zoomText;
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
    for (const target of live.targets || []) {
      if (!target || target.available === false || !Number.isFinite(Number(target.x))) continue;
      const kind = markerKind(target);
      if (!kind) continue;
      // Een NPC met gesprek én winkel: één ruitje.
      if (kind === "npc") {
        if (npcSpots.some(function (spot) { return Math.hypot(spot.x - num(target.x), spot.z - num(target.z)) < 2.5; })) continue;
        npcSpots.push({ x: num(target.x), z: num(target.z) });
      }
      markers.push({ x: target.x, z: target.z, kind, name: target.displayName || target.label || "", target });
    }
    for (const remote of live.remotes || []) markers.push({ x: remote.x, z: remote.z, kind: "player", name: remote.displayName || remote.name || "" });
    return markers;
  }
  function mapQuestTarget() {
    const quest = trackedQuest();
    return quest ? (data().s04?.questTargets || []).find(function (t) { return t.questId === quest.questId; }) || null : null;
  }
  function drawBigMap() {
    const live = api.live();
    const sm = store.map;
    if (live.position && fogConfig) minimap.revealAround(live.position.x, live.position.z, fogConfig.revealRadius);
    if ((ui.bigFollow || !ui.bigFocus) && live.position) ui.bigFocus = { x: num(live.position.x), z: num(live.position.z) };
    const markers = mapMarkers(live);
    const quest = mapQuestTarget();
    const result = minimap.drawFull(bigCanvas, { world: live.world, center: live.position, facingDeg: live.facingDeg, markers,
      quest: quest ? Object.assign({ name: trackedQuest()?.displayName || "" }, quest) : null,
      pin: sm.pin, span: sm.span, focus: ui.bigFocus, show: sm.big, iconScale: sm.bigIcon, areas: areaLabels(live), textScale: sm.bigText });
    ui.bigView = result;
    ui.bigHits = result?.hits || [];
    if (result) ui.bigFocus = result.focus;
    bigCenter.classList.toggle("gkOn", ui.bigFollow);
    const counts = {};
    for (const marker of markers) if (minimap.discovered(marker.x, marker.z)) counts[marker.kind] = (counts[marker.kind] || 0) + 1;
    if (quest) counts.quest = 1;
    if (sm.pin) counts.pin = 1;
    for (const area of areaLabels(live)) if (minimap.discovered(area.x, area.z)) counts.area = (counts.area || 0) + 1;
    const title = live.region || "Kaart";
    if (bigTitle.textContent !== title) bigTitle.textContent = title;
    renderBigLegend(counts);
    if (ui.bigPinDist && sm.pin && live.position) {
      const meters = Math.round(Math.hypot(sm.pin.x - num(live.position.x), sm.pin.z - num(live.position.z)));
      const text = meters + " m";
      if (ui.bigPinDist.textContent !== text) ui.bigPinDist.textContent = text;
    }
  }
  // De legenda wordt alleen opnieuw gebouwd als er iets aan of uit gaat; tellers en afstand worden los bijgewerkt
  // (zo blijft een schuif die je net vasthoudt gewoon werken).
  function renderBigLegend(counts) {
    const sm = store.map;
    const signature = JSON.stringify([sm.big, sm.mini, sm.rotate, Boolean(sm.pin), Boolean(counts.portal)]);
    if (ui.sig.legend !== signature) {
      ui.sig.legend = signature;
      ui.bigCounts = {};
      const check = function (which, kind, label) {
        const on = sm[which][kind] !== false;
        return h("button", { type: "button", class: "gkCheck" + (on ? " gkOn" : ""), "data-act": "mapshow", "data-id": which + ":" + kind, role: "checkbox",
          "aria-checked": on ? "true" : "false", title: label + (which === "big" ? " op de grote kaart" : " op de minimap") });
      };
      const rows = MAP_KINDS.map(function (entry) {
        const count = h("em");
        ui.bigCounts[entry[0]] = count;
        return h("div", { class: "gkLegendRow" }, [h("i", { class: "gkMark gkMark--" + entry[0] }), h("span", { text: entry[1] }), count,
          check("big", entry[0], entry[1]), check("mini", entry[0], entry[1])]);
      });
      const slide = function (id, label) {
        const value = Math.max(0.5, Math.min(2, num(sm[id], 1)));
        return h("label", { class: "gkSlide" }, [h("span", { text: label }), h("em", { text: Math.round(value * 100) + "%" }),
          h("input", { type: "range", min: "0.5", max: "2", step: "0.1", value: String(value), "data-slide": id, "aria-label": label })]);
      };
      ui.bigPinDist = null;
      let pinBox = null;
      if (sm.pin) {
        ui.bigPinDist = h("em");
        pinBox = h("div", { class: "gkLegendBox" }, [h("div", { class: "gkLegendPin" }, [h("i", { class: "gkMark gkMark--pin" }), h("span", { text: "Jouw pin" }), ui.bigPinDist]),
          h("div", { class: "gkBtns" }, [h("button", { type: "button", class: "gkBtn gkGo", "data-act": "pin-walk" }, ["Loop erheen"]),
            h("button", { type: "button", class: "gkBtn", "data-act": "pin-clear" }, ["Weghalen"])])]);
      }
      bigLegend.replaceChildren(...[
        h("div", { class: "gkLegendHead" }, [h("span", { text: "Wat zie je?" }), h("b", { text: "Groot" }), h("b", { text: "Klein" })]),
        h("div", { class: "gkLegendRow" }, [h("i", { class: "gkMark gkMark--self" }), h("span", { text: "Jij" })]),
        ...rows,
        h("div", { class: "gkLegendBox" }, [h("div", { class: "gkLegendSub", text: "Grootte van de kaarticonen" }), slide("bigIcon", "Grote kaart"), slide("miniIcon", "Minimap"),
          h("div", { class: "gkLegendRow gkLegendRow--switch" }, [h("span", { text: "Minimap draait mee" }),
            h("button", { type: "button", class: "gkSwitch" + (sm.rotate !== false ? " gkOn" : ""), "data-act": "maprotate", role: "switch",
              "aria-checked": sm.rotate !== false ? "true" : "false", title: "Aan = jouw kijkrichting boven, uit = noorden boven" })])]),
        h("div", { class: "gkLegendBox" }, [h("div", { class: "gkLegendSub", text: "Grootte van de gebiedsnamen (zoomen mee)" }), slide("bigText", "Grote kaart"), slide("miniText", "Minimap")]),
        pinBox,
        h("p", { class: "gkLegendNote", text: "Slepen = schuiven. Scrollen, knijpen of + en − = zoomen. Tik op een lege plek voor een pin"
          + (counts.portal ? ", op een portal om te reizen." : ". Nog geen portals in deze wereld.") })].filter(Boolean));
    }
    for (const entry of MAP_KINDS) {
      const el = ui.bigCounts?.[entry[0]];
      if (!el) continue;
      const text = counts[entry[0]] && entry[0] !== "quest" && entry[0] !== "pin" ? String(counts[entry[0]]) : "";
      if (el.textContent !== text) el.textContent = text;
      const dim = !counts[entry[0]];
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
    const label = kind ? kind[2] : "";
    bigTip.textContent = hit.name && hit.name !== label ? label + ": " + hit.name : label + (hit.kind === "portal" ? " (tik = reizen)" : hit.kind === "pin" ? " (tik = weghalen)" : "");
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
    if (hit && hit.kind === "portal" && hit.target) {
      toast("Op weg naar " + (hit.name || "het portal") + ".", { icon: "magic-portal", ms: 2500 });
      ui.bigMap = false;
      syncBigMap();
      api.activate(hit.target);
      return;
    }
    if (hit && hit.kind === "pin") { store.map.pin = null; hideBigTip(); changedMap(); return; }
    if (hit) { showBigTip(hit, 2500); return; }
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
      api.walkTo(num(target.x), num(target.z));
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
    if (services.length === 1) { startService(services[0].kind, services[0].id); return; }
    if (!services.length) return;
    ui.serviceTalk = { name: target.displayName || target.label || services[0].name || "", services, x, z, face: null };
    applyLayout();
    render();
  }
  function endServiceTalk() {
    if (!ui.serviceTalk) return;
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
  }
  function openTab(id) {
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
    if (ui.trade || ui.craft) { endService(); return; }
    setPanel(panelNow === "open" ? "rail" : "closed");
  }
  function startService(kind, id) {
    ui.serviceTalk = null;
    api.closeDialogue();
    store.item = null;
    if (kind === "vendor") { ui.trade = { vendorId: id, offerId: null }; ui.craft = null; }
    else { ui.craft = { stationId: id, recipeId: null }; ui.trade = null; }
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
  function confirmTwice(key) {
    if (ui.sure === key) {
      ui.sure = "";
      window.clearTimeout(ui.sureTimer);
      return true;
    }
    ui.sure = key;
    window.clearTimeout(ui.sureTimer);
    ui.sureTimer = window.setTimeout(function () { ui.sure = ""; renderSheet(); }, 3000);
    renderSheet();
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
    if (!ui.attackTarget) { toast("Geen vijand in de buurt.", { icon: "crossed-swords", ms: 2000 }); return; }
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
    if (el.tagName === "BUTTON" && typeof el.blur === "function") el.blur();
    switch (act) {
      case "tab": openTab(id); break;
      case "handle": shrinkPanel(); break;
      case "grow": setPanel("rail"); break;
      case "bag": openTab("bag"); break;
      case "close": if (ui.trade || ui.craft) endService(); else setPanel("closed"); break;
      case "filter": store.filter = id; store.item = null; save(); renderSheet(); break;
      case "item": store.item = store.item === key ? null : key; save(); renderSheet(); break;
      case "slot": {
        const worn = (data().s03?.equipment || []).some(function (row) { return row.slotId === id; });
        if (worn) { store.item = store.item === "eq:" + id ? null : "eq:" + id; save(); renderSheet(); }
        else { store.tab = "bag"; store.filter = "equipment"; store.item = null; save(); renderRail(); renderSheet(); }
        break;
      }
      case "detail-close": store.item = null; save(); renderSheet(); break;
      case "equip": api.run03("equip", null, itemPayload(key)); store.item = null; save(); break;
      case "unequip": api.run03("unequip", null, { slotId: id }); store.item = null; save(); break;
      case "use": api.run03("use", null, { itemId: id }); break;
      case "destroy": if (confirmTwice("destroy:" + key)) { api.run03("destroy", null, Object.assign(itemPayload(key), { amount: 1 })); } break;
      case "quests-done": store.done = !store.done; save(); renderSheet(); break;
      case "quest-go": api.run04("node04:move_marker", id, { questId: el.dataset.quest || null }); break;
      case "quest-track": api.run04("node04:track", null, { questId: id }); break;
      case "choice": {
        const dialogue = data().dialogue;
        if (dialogue) api.run04("node04:choose_dialogue", null, { dialogueId: dialogue.dialogueId, entryId: dialogue.entryId, choiceId: id });
        break;
      }
      case "service": startService(el.dataset.kind, id); break;
      case "talk-close": if (ui.serviceTalk) endServiceTalk(); else api.closeDialogue(); break;
      case "mapcycle": cycleMap(); break;
      case "bigmap-close": ui.bigMap = false; syncBigMap(); break;
      case "bigmap-open": ui.bigMap = true; syncBigMap(); break;
      case "bigzoom": zoomBigTo(bigSpan() * (id === "in" ? 1 / 1.5 : 1.5), null); break;
      case "bigcenter": ui.bigFollow = true; ui.bigFocus = null; requestBigDraw(); break;
      case "mapshow": {
        const [which, kind] = id.split(":");
        if (store.map[which] && kind) { store.map[which][kind] = store.map[which][kind] === false; changedMap(); }
        break;
      }
      case "maprotate": store.map.rotate = store.map.rotate === false; changedMap(); break;
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
      case "icocolor": store.icoColor = id; save(); render(); break;
      case "respawn": api.run03("respawn", null, {}); break;
      case "attack": attack(); break;
      case "do": interact(); break;
      case "map": store.zoom = (num(store.zoom, 1) + 1) % ZOOMS.length; save(); ui.mapAt = 0; break;
      case "toast-close": api.dismissNotice(); break;
      case "ware": if (ui.trade) { ui.trade.offerId = ui.trade.offerId === id ? null : id; store.item = null; renderSheet(); } break;
      case "buy": if (ui.trade) api.run05("vendor_buy", { vendorId: ui.trade.vendorId, offerId: id, quantity: 1 }); break;
      case "sell": if (ui.trade && id) api.run05("vendor_sell", { vendorId: ui.trade.vendorId, offerId: id, quantity: 1 }); break;
      case "recipe": if (ui.craft) { ui.craft.recipeId = id; renderSheet(); } break;
      case "craft": if (ui.craft) api.run05("craft", { stationId: ui.craft.stationId, recipeId: id }); break;
      case "claim": api.run05("crafting:claim", { jobId: id }); break;
      case "set": store[id] = !store[id]; save(); ui.effective = ""; render(); break;
      case "size": store.size = id; save(); ui.effective = ""; render(); break;
      case "play": playCharacter(el.dataset.class, el.dataset.model || null); break;
      case "logout": api.logout(); break;
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
      if (ui.bigMap) { ui.bigMap = false; syncBigMap(); return true; }
      if (store.item) { store.item = null; save(); renderSheet(); return true; }
      if (ui.trade || ui.craft) { endService(); return true; }
      if (ui.serviceTalk) { endServiceTalk(); return true; }
      if (data().dialogue) { api.closeDialogue(); return true; }
      if (root.dataset.panel === "open") { setPanel("rail"); return true; }
      return false;
    }
    if (event.repeat) return false;
    if (code === "Digit1" || code === "Numpad1") { if (!has("hotbar_hud") || data().defeated) return false; attack(); return true; }
    if (code === "KeyE" || code === "KeyF") { if (!has("interaction_hud") || data().defeated) return false; interact(); return true; }
    if (code === "KeyI") { openTab("bag"); return true; }
    if (code === "KeyM") { cycleMap(); return true; }
    if (ui.bigMap && (code === "Equal" || code === "NumpadAdd")) { zoomBigTo(bigSpan() / 1.5, null); return true; }
    if (ui.bigMap && (code === "Minus" || code === "NumpadSubtract")) { zoomBigTo(bigSpan() * 1.5, null); return true; }
    const tab = visibleTabs().find(function (entry) { return entry.key === code; });
    if (tab) { openTab(tab.id); return true; }
    return false;
  }

  root.addEventListener("click", onClick);
  root.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("resize", function () { ui.effective = ""; applyLayout(); render(); padGrids(); });
  render();

  return {
    render,
    frame,
    handleKey,
    toast,
    // Een klap van een vijand (direct uit het netwerkbericht, vóór de nieuwe levens binnen zijn).
    playerHit(amount) {
      if (num(amount) > 0) hitFeedback(num(amount));
    },
    combat() { ui.combatAt = performance.now(); },
    // Een tik op een NPC in de wereld: zelfde als de doe-knop (gesprek + winkel/werkplaats).
    talkTo,
    // Nieuw ontdekte stukken kaart (netwerkbericht fog:discovery).
    fogDiscovered(payload) {
      if (minimap.addFogCells(payload?.newlyDiscoveredCellKeys || [])) { ui.mapAt = 0; ui.bigAt = 0; }
    },
    element: root
  };
}
