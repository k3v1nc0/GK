// Werkbank Fase 7: het Balans-rapport. Puur: zelfde kaarten -> zelfde rapport. Schrijft niets.
// - findings: meldingen. Rood = aantoonbaar kapot (Kevin 11-11): SAVE TO GAME weigert het, een verwijzing wijst naar
//   niets, of iets is nooit te halen. Oranje = advies (baas zonder schild, niets voor vak 2/3, nutteloze beloning,
//   te ruime farmbron).
// - xpByArea: XP per gebied. Eenmalig = budget; herhaalbaar = tempo per uur (met de aanname erbij).
// - strength: per vijand en klasse: klappen nodig (vak 1) en klappen overleven, op het level van de vijand.
import { CANONICAL_KINDS } from "../../shared/authoring/kinds.js";
import { EQUIPMENT_SLOT_DEFS, balanceValues, equipmentSlotsFrom } from "../../shared/authoring/kinds/balance.js";
import { economyValues, shopBuyPrice, shopSellPrice } from "../../shared/authoring/kinds/economy.js";
import { cleanXpCurve, statAtLevel, xpCostAt } from "../../../apps/web/public/shared/level-math.js";
import { computeDamage } from "../../../apps/web/public/shared/combat-math.js";
import { questRepeatOf, questStartMode, questSteps } from "../../../apps/web/public/shared/quest-graph.js";

// Aannames voor "per uur" (staan ook in het rapport, zodat Kevin ze kan lezen).
export const FIGHT_SECONDS = 15;
export const QUEST_REPEAT_MIN_SECONDS = 300;
export const BALANCE_ASSUMPTION = "Aanname: één speler die blijft vechten. Een gevecht duurt met lopen " + FIGHT_SECONDS
  + " s, elke vijand wordt verslagen zodra hij terug is, en een quest die je zo vaak mag doen als je wilt kost " + (QUEST_REPEAT_MIN_SECONDS / 60) + " minuten.";

const OUTSIDE = "__outside__";
const kindOfRef = (ref) => String(ref || "").split(":")[0];
const idOfRef = (ref) => String(ref || "").replace(/^[a-z_]+:/, "");
const round1 = (value) => Math.round(value * 10) / 10;
const int = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback);

export function balanceReport(documents, { buildErrors = [] } = {}) {
  const active = (Array.isArray(documents) ? documents : []).filter((doc) => doc && !doc.archived && CANONICAL_KINDS[doc.kind]);
  const byKey = new Map(active.map((doc) => [doc.docKey, doc]));
  const of = (kind) => active.filter((doc) => doc.kind === kind);
  const one = (kind) => of(kind)[0]?.body || null;
  const label = (kind) => CANONICAL_KINDS[kind]?.label || kind;
  const nameOf = (doc) => (doc ? String(doc.body?.displayName || idOfRef(doc.docKey)) : "");
  const nameOfRef = (ref) => (byKey.has(ref) ? nameOf(byKey.get(ref)) : idOfRef(ref));
  const fieldLabel = (kind, key) => CANONICAL_KINDS[kind]?.fields?.[key]?.label || key;

  const project = one("project_settings") || {};
  const maxLevel = Math.max(1, int(project.maxLevel, CANONICAL_KINDS.project_settings.fields.maxLevel.default));
  const xpPerLevel = Math.max(1, int(project.xpPerLevel, 100));
  const curve = cleanXpCurve(project.xpCurve, maxLevel);
  const costAt = (level) => xpCostAt(curve, Math.max(1, Math.min(maxLevel, int(level, 1))), xpPerLevel);
  const balance = balanceValues(one("balance_settings"));
  const economy = economyValues(one("economy_settings"));
  const xpRate = balance.xpRatePct / 100;
  const respawnRate = balance.respawnRatePct / 100;
  const slotsOn = new Set(equipmentSlotsFrom(one("equipment_settings")).map((slot) => slot.id));

  const findings = [];
  const seen = new Set();
  const add = (severity, code, docKey, message) => {
    const key = code + "|" + (docKey || "") + "|" + message;
    if (seen.has(key)) return;
    seen.add(key);
    const doc = docKey ? byKey.get(docKey) : null;
    findings.push({ severity, code, docKey: doc ? docKey : null, kind: doc ? doc.kind : null, name: doc ? nameOf(doc) : "", message });
  };

  // ---- Rood 1: wat SAVE TO GAME weigert ----
  const buildText = new Map();
  for (const error of Array.isArray(buildErrors) ? buildErrors : []) {
    if (!error || !error.message) continue;
    add("red", String(error.code || "BUILD"), error.docKey || null, String(error.message));
    if (error.docKey) buildText.set(error.docKey, (buildText.get(error.docKey) || "") + " " + error.message);
  }
  const buildSays = (docKey, text) => (buildText.get(docKey) || "").includes(text);

  // ---- Rood 2: een vak wijst naar een kaart die niet (meer) bestaat ----
  for (const doc of active) {
    for (const [key, field] of Object.entries(CANONICAL_KINDS[doc.kind].fields)) {
      const value = doc.body?.[key];
      const refs = field.type === "ref" ? [value] : field.type === "refList" && Array.isArray(value) ? value.map((row) => row?.ref) : [];
      for (const ref of refs) {
        if (typeof ref !== "string" || !ref || byKey.has(ref) || buildSays(doc.docKey, idOfRef(ref)) || buildSays(doc.docKey, ref)) continue;
        add("red", "REF_MISSING", doc.docKey, label(doc.kind) + " " + nameOf(doc) + ": het vak '" + field.label + "' wijst naar een kaart die niet (meer) bestaat (" + idOfRef(ref) + "). Sleep er een andere kaart op of maak het vak leeg.");
      }
    }
  }

  // ---- Quests: wat ze geven en gebruiken ----
  const quests = of("quest");
  const questRewardRefs = new Map(); // ref -> [quest-doc]
  const usedItemRefs = new Set();
  const noteReward = (ref, quest) => { if (ref) questRewardRefs.set(ref, (questRewardRefs.get(ref) || []).concat(quest)); };
  const questXp = new Map();
  for (const quest of quests) {
    const body = quest.body || {};
    for (const row of Array.isArray(body.rewards) ? body.rewards : []) noteReward(row?.ref, quest);
    if (body.itemRef) usedItemRefs.add(body.itemRef);
    if (body.start?.itemRef) usedItemRefs.add(body.start.itemRef);
    for (const rule of Array.isArray(body.start?.rules) ? body.start.rules : []) if (rule?.type === "item" && rule.ref) usedItemRefs.add(rule.ref);
    let endXp = 0;
    let steps = [];
    try { steps = questSteps(body) || []; } catch { steps = []; }
    for (const step of steps) {
      for (const objective of Array.isArray(step.objectives) ? step.objectives : []) if (kindOfRef(objective?.ref) === "item_definition") usedItemRefs.add(objective.ref);
      if (step.kind !== "end") continue;
      for (const row of Array.isArray(step.rewards) ? step.rewards : []) noteReward(row?.ref, quest);
      if (Number.isInteger(step.xp)) endXp = Math.max(endXp, step.xp);
    }
    questXp.set(quest.docKey, Math.max(0, int(body.rewardXp, 0)) + endXp);
  }
  for (const recipe of of("recipe")) for (const row of Array.isArray(recipe.body.ingredients) ? recipe.body.ingredients : []) if (row?.ref) usedItemRefs.add(row.ref);

  // ---- Rood 3: een vaardigheid die nooit te halen is ----
  const classes = of("player_class");
  const classSkills = (cls) => (Array.isArray(cls.body.skills) ? cls.body.skills : []).map((row) => byKey.get(row?.ref)).filter((doc) => doc && doc.kind === "ability");
  const skillRefs = new Set();
  for (const cls of classes) {
    for (const ability of classSkills(cls)) {
      skillRefs.add(ability.docKey);
      const unlock = Math.max(1, int(ability.body.unlockLevel, 1));
      if (unlock > maxLevel) {
        add("red", "ABILITY_LEVEL", ability.docKey, "Vaardigheid " + nameOf(ability) + " (klasse " + nameOf(cls) + ") komt vrij op level " + unlock + ", maar het hoogste level is " + maxLevel + ": niemand krijgt hem ooit. Zet '" + fieldLabel("ability", "unlockLevel") + "' lager.");
      }
      if (ability.body.unlockQuest === true && !questRewardRefs.has(ability.docKey)) {
        add("red", "ABILITY_NO_QUEST", ability.docKey, "Vaardigheid " + nameOf(ability) + " (klasse " + nameOf(cls) + ") krijg je alleen van een quest, maar geen enkele quest geeft hem. Sleep hem bij een quest op Beloning, of zet '" + fieldLabel("ability", "unlockQuest") + "' uit.");
      }
    }
  }

  // ---- Rood 4: een item dat niemand kan dragen, een quest die niemand kan beginnen ----
  for (const item of of("item_definition")) {
    const need = Math.max(1, int(item.body.requiredLevel, 1));
    if (item.body.equipSlot && need > maxLevel) {
      add("red", "ITEM_LEVEL", item.docKey, "Item " + nameOf(item) + " kun je dragen vanaf level " + need + ", maar het hoogste level is " + maxLevel + ": niemand kan het ooit dragen.");
    }
    if (item.body.equipSlot && !slotsOn.has(item.body.equipSlot)) {
      const slot = EQUIPMENT_SLOT_DEFS.find((entry) => entry.id === item.body.equipSlot);
      add("red", "EQUIP_SLOT_OFF", item.docKey, "Item " + nameOf(item) + " hoort in het vak " + (slot ? slot.name : idOfRef(item.body.equipSlot)) + ", maar dat vak staat uit (Instellingen → Uitrustingsvakken): niemand kan het dragen.");
    }
  }
  for (const quest of quests) {
    for (const rule of Array.isArray(quest.body.start?.rules) ? quest.body.start.rules : []) {
      if (rule?.type !== "level" || !Number.isInteger(rule.min) || rule.min <= maxLevel || buildSays(quest.docKey, "hoogste level")) continue;
      add("red", "QUEST_LEVEL", quest.docKey, "Quest " + nameOf(quest) + " start pas vanaf level " + rule.min + ", maar het hoogste level is " + maxLevel + ": niemand kan hem beginnen.");
    }
  }

  // ---- Oranje 1: een groepsbaas die met alleen vak 1 omvalt ----
  const actors = of("actor_archetype");
  const levelOfActor = (actor) => Math.max(1, Math.min(10, int(actor.body.level, 1)));
  for (const actor of actors) {
    if (actor.body.groupBoss === true && actor.body.shieldAlways !== true) {
      add("orange", "BOSS_AUTO", actor.docKey, "Groepsbaas " + nameOf(actor) + " heeft geen schild: hij valt om met alleen vak 1 (de auto-aanval). Zet '" + fieldLabel("actor_archetype", "shieldAlways") + "' aan, dan zijn vak 2 en 3 nodig.");
    }
  }

  // ---- Oranje 2: een vijand met een schild, terwijl een klasse op dat level nog niets voor vak 2 of 3 heeft ----
  const placedActors = new Set(of("actor_spawn").map((spawn) => spawn.body.archetypeRef));
  for (const quest of quests) for (const spawn of Array.isArray(quest.body.spawns) ? quest.body.spawns : []) if (spawn?.actorRef) placedActors.add(spawn.actorRef);
  for (const actor of actors) {
    if (actor.body.shieldAlways !== true || !placedActors.has(actor.docKey)) continue;
    const level = levelOfActor(actor);
    for (const cls of classes) {
      const attacks = classSkills(cls).filter((ability) => ability.body.abilityKind !== "heal");
      const ready = attacks.some((ability) => ability.body.unlockQuest !== true && Math.max(1, int(ability.body.unlockLevel, 1)) <= level);
      if (ready) continue;
      const first = attacks.filter((ability) => ability.body.unlockQuest !== true).map((ability) => Math.max(1, int(ability.body.unlockLevel, 1))).sort((a, b) => a - b)[0];
      add("orange", "SHIELD_NO_SKILL", actor.docKey, nameOf(actor) + " (level " + level + ") heeft altijd een schild, maar klasse " + nameOf(cls) + " heeft op level " + level
        + " nog geen aanval voor vak 2 of 3" + (first ? " (de eerste komt op level " + first + ")" : "") + ". Zijn schild gaat dan niet stuk.");
    }
  }

  // ---- Oranje 3: een beloning die nergens voor dient ----
  const shopCurrencies = new Set(of("npc").map((npc) => npc.body.shopCurrencyRef).filter(Boolean));
  const portalCurrency = one("portal_settings")?.costCurrencyRef || null;
  if (portalCurrency) shopCurrencies.add(portalCurrency);
  for (const [ref, givers] of questRewardRefs) {
    const doc = byKey.get(ref);
    if (!doc) continue;
    const from = "questbeloning van " + givers.slice(0, 2).map(nameOf).join(" en ") + (givers.length > 2 ? " en meer" : "");
    if (doc.kind === "item_definition") {
      const body = doc.body;
      const useful = body.equipSlot || int(body.healAmount) > 0 || int(body.effectDurationS) > 0 || int(body.vendorValue) > 0 || usedItemRefs.has(ref);
      if (!useful) add("orange", "REWARD_USELESS", ref, "Item " + nameOf(doc) + " (" + from + ") dient nergens voor: je kunt het niet dragen, gebruiken, verkopen, in een recept stoppen of voor een quest inleveren.");
    } else if (doc.kind === "ability" && !skillRefs.has(ref)) {
      add("orange", "REWARD_USELESS", ref, "Vaardigheid " + nameOf(doc) + " (" + from + ") staat bij geen enkele klasse in vak 2 of 3: niemand kan hem gebruiken.");
    } else if (doc.kind === "currency" && !shopCurrencies.has(ref)) {
      add("orange", "REWARD_USELESS", ref, "Valuta " + nameOf(doc) + " (" + from + ") kun je nergens uitgeven: geen winkel en geen portal vraagt erom.");
    }
  }

  // ---- Rood 5: een geldlus. Ergens goedkoop kopen en duurder (terug)verkopen = geld uit het niets.
  // De winkels hebben onbeperkte voorraad, dus één keer kan al eindeloos.
  const shops = of("npc").filter((npc) => Array.isArray(npc.body.shopOffers) && npc.body.shopOffers.length && npc.body.shopCurrencyRef);
  const prices = new Map(); // itemRef -> { buy: {price, shop}, sell: {price, shop} } per valuta
  for (const npc of shops) {
    const currency = npc.body.shopCurrencyRef;
    for (const row of npc.body.shopOffers) {
      const item = byKey.get(row?.ref);
      if (!item || item.kind !== "item_definition") continue;
      const value = int(item.body.vendorValue, 0);
      const buyHere = shopSellPrice(value, row.price, economy.shopMarkupPct);
      const sellHere = shopBuyPrice(value, row.buyBack, economy.shopBuyPct);
      const key = row.ref + "|" + currency;
      const entry = prices.get(key) || { itemRef: row.ref, currency, buy: null, sell: null };
      if (buyHere > 0 && (!entry.buy || buyHere < entry.buy.price)) entry.buy = { price: buyHere, shop: nameOf(npc), docKey: npc.docKey };
      if (sellHere > 0 && (!entry.sell || sellHere > entry.sell.price)) entry.sell = { price: sellHere, shop: nameOf(npc), docKey: npc.docKey };
      prices.set(key, entry);
    }
  }
  for (const entry of prices.values()) {
    if (!entry.buy || !entry.sell || entry.sell.price < entry.buy.price) continue;
    const itemName = nameOfRef(entry.itemRef);
    const where = entry.buy.docKey === entry.sell.docKey
      ? "bij " + entry.buy.shop
      : "bij " + entry.buy.shop + " en verkopen bij " + entry.sell.shop;
    add("red", "MONEY_LOOP", entry.sell.docKey, "Geldlus: " + itemName + " kost " + entry.buy.price + " " + nameOfRef(entry.currency)
      + " " + where + " en levert " + entry.sell.price + " op. Spelers kunnen zo eindeloos geld maken. Maak de terugkoopprijs lager of de winkelprijs hoger (Instellingen → 💰 Geld).");
  }

  // ---- XP per gebied ----
  const regions = of("region").sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const regionAt = (xMm, zMm, ref = null) => {
    if (ref && byKey.get(ref)?.kind === "region") return ref;
    const hit = regions.find((region) => xMm >= region.body.minXMm && xMm < region.body.maxXMm && zMm >= region.body.minZMm && zMm < region.body.maxZMm);
    return hit ? hit.docKey : OUTSIDE;
  };
  const areas = new Map();
  const areaOf = (key) => {
    if (!areas.has(key)) {
      areas.set(key, { key: key === OUTSIDE ? null : key, name: key === OUTSIDE ? "Buiten een gebied" : nameOf(byKey.get(key)),
        onceXp: 0, onceCount: 0, onceLevels: 0, enemyXp: 0, enemyLevels: 0, enemyKills: 0, enemyCount: 0, questXp: 0, questLevels: 0, questCount: 0, sources: [] });
    }
    return areas.get(key);
  };
  for (const spawn of of("actor_spawn")) {
    const actor = byKey.get(spawn.body.archetypeRef);
    if (!actor || actor.kind !== "actor_archetype") continue;
    const level = levelOfActor(actor);
    // Gemiddeld met de sterkere erbij (kans × extra sterkte).
    const elite = 1 + Math.max(0, Math.min(100, int(spawn.body.eliteChancePct, 10))) / 100 * (Math.max(100, int(spawn.body.eliteStrengthPct, 200)) / 100 - 1);
    const xp = Math.max(0, int(actor.body.xpReward, 0)) * level * elite * xpRate;
    const respawnS = Math.max(1, int(actor.body.respawnMs, 30000) / 1000 / respawnRate);
    const area = areaOf(regionAt(int(spawn.body.xMm), int(spawn.body.zMm), spawn.body.regionRef));
    const perHour = xp * 3600 / respawnS;
    area.enemyXp += perHour;
    area.enemyLevels += perHour / costAt(level);
    area.enemyKills += 3600 / respawnS;
    area.enemyCount += 1;
    area.sources.push({ docKey: actor.docKey, name: nameOf(actor), perHour, text: Math.round(xp) + " XP, terug na " + Math.round(respawnS) + " s" });
  }
  for (const quest of quests) {
    const xp = (questXp.get(quest.docKey) || 0) * xpRate;
    if (xp <= 0) continue;
    const giver = questStartMode(quest.body) === "npc" ? byKey.get(quest.body.giverRef) : null;
    const area = areaOf(giver && giver.kind === "npc" ? regionAt(Math.round((Number(giver.body.x) || 0) * 1000), Math.round((Number(giver.body.z) || 0) * 1000)) : OUTSIDE);
    const levelRule = (Array.isArray(quest.body.start?.rules) ? quest.body.start.rules : []).find((rule) => rule?.type === "level" && Number.isInteger(rule.min));
    const cost = costAt(levelRule ? levelRule.min : 1);
    const repeat = questRepeatOf(quest.body);
    if (repeat === "once") {
      area.onceXp += xp;
      area.onceLevels += xp / cost;
      area.onceCount += 1;
      continue;
    }
    const everyS = repeat === "always" ? QUEST_REPEAT_MIN_SECONDS : repeat === "cooldown" ? Math.max(QUEST_REPEAT_MIN_SECONDS, int(quest.body.repeatMinutes, 60) * 60)
      : repeat === "daily" ? 86400 : 604800;
    const perHour = xp * 3600 / everyS;
    area.questXp += perHour;
    area.questLevels += perHour / cost;
    area.questCount += 1;
    area.sources.push({ docKey: quest.docKey, name: nameOf(quest), perHour, text: Math.round(xp) + " XP, opnieuw na " + Math.round(everyS / 60) + " min" });
  }
  const xpByArea = [];
  for (const area of areas.values()) {
    // Eén speler haalt hooguit 3600 / FIGHT_SECONDS gevechten per uur.
    const factor = area.enemyKills > 0 ? Math.min(1, (3600 / FIGHT_SECONDS) / area.enemyKills) : 1;
    const hourXp = area.enemyXp * factor + area.questXp;
    const hourLevels = area.enemyLevels * factor + area.questLevels;
    const top = area.sources.slice().sort((a, b) => b.perHour - a.perHour)[0] || null;
    xpByArea.push({ key: area.key, name: area.name, onceXp: Math.round(area.onceXp), onceCount: area.onceCount, onceLevels: round1(area.onceLevels),
      hourXp: Math.round(hourXp), hourLevels: round1(hourLevels), enemyCount: area.enemyCount, repeatQuestCount: area.questCount,
      top: top ? { docKey: top.docKey, name: top.name, text: top.text } : null });
    // ---- Oranje 4: te ruime farmbron ----
    if (hourLevels > balance.farmLevelsPerHour && top) {
      add("orange", "FARM_WIDE", top.docKey, area.name + ": farmen geeft hier ongeveer " + round1(hourLevels) + " levels per uur (grens: " + balance.farmLevelsPerHour
        + "). Grootste bron: " + top.name + " (" + top.text + "). Geef minder XP, laat hem langzamer terugkomen, of zet de grens hoger in Balans.");
    }
  }
  xpByArea.sort((a, b) => (a.key === null) - (b.key === null) || a.name.localeCompare(b.name));

  // ---- Sterkte per level: klappen nodig en klappen overleven ----
  const classRows = classes.map((cls) => ({ docKey: cls.docKey, name: nameOf(cls), body: cls.body, ability: byKey.get(cls.body.abilityRef)?.body || null }));
  const strength = actors.slice().sort((a, b) => levelOfActor(a) - levelOfActor(b) || nameOf(a).localeCompare(nameOf(b))).map((actor) => {
    const level = levelOfActor(actor);
    const boss = actor.body.groupBoss === true ? Math.max(100, int(actor.body.bossHealthPct, 300)) / 100 : 1;
    const health = Math.max(1, Math.round(Math.max(1, int(actor.body.healthMax, 1)) * level * boss));
    const enemyAbility = byKey.get(actor.body.abilityRef)?.body || null;
    return {
      docKey: actor.docKey, name: nameOf(actor), level, groupBoss: actor.body.groupBoss === true, shield: actor.body.shieldAlways === true, health,
      classes: classRows.map((cls) => {
        const hit = cls.ability ? computeDamage(cls.ability, statAtLevel(cls.body.attackPower, cls.body.attackPerLevel, level), int(actor.body.armor, 0)) : 0;
        const taken = enemyAbility ? computeDamage(enemyAbility, Math.round(int(actor.body.attackPower, 0) * level), statAtLevel(cls.body.armor, cls.body.armorPerLevel, level)) : 0;
        const playerHealth = Math.max(1, statAtLevel(cls.body.healthMax, cls.body.healthPerLevel, level));
        return { docKey: cls.docKey, name: cls.name, hitsNeeded: hit > 0 ? Math.ceil(health / hit) : null, hitsSurvive: taken > 0 ? Math.ceil(playerHealth / taken) : null };
      })
    };
  });

  const order = { red: 0, orange: 1 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return {
    findings,
    counts: { red: findings.filter((finding) => finding.severity === "red").length, orange: findings.filter((finding) => finding.severity === "orange").length },
    xpByArea, strength, classes: classRows.map((cls) => ({ docKey: cls.docKey, name: cls.name })),
    balance, economy, maxLevel, assumption: BALANCE_ASSUMPTION
  };
}

// Fase 8: geld erin en eruit per dag, uit het grootboek (economy_ledger). Alleen lezen.
export function moneyPerDay(db, { days = 14 } = {}) {
  if (!db || typeof db.prepare !== "function") return { days: [], reasons: [] };
  try {
    return moneyPerDayRows(db, days);
  } catch {
    // Een verse projectdatabase heeft nog geen grootboek: dan is er simpelweg niets te melden.
    return { days: [], reasons: [] };
  }
}

function moneyPerDayRows(db, days) {
  const rows = db.prepare(`
    SELECT substr(created_at, 1, 10) AS day, asset_id AS currencyId,
      SUM(CASE WHEN delta_real > 0 THEN delta_real ELSE 0 END) AS inAmount,
      SUM(CASE WHEN delta_real < 0 THEN -delta_real ELSE 0 END) AS outAmount
    FROM economy_ledger WHERE asset_kind = 'currency'
    GROUP BY day, currencyId ORDER BY day DESC, currencyId ASC LIMIT ?
  `).all(Math.max(1, Math.min(120, Math.round(Number(days) || 14))) * 6);
  const reasons = db.prepare(`
    SELECT reason, asset_id AS currencyId,
      SUM(CASE WHEN delta_real > 0 THEN delta_real ELSE 0 END) AS inAmount,
      SUM(CASE WHEN delta_real < 0 THEN -delta_real ELSE 0 END) AS outAmount
    FROM economy_ledger WHERE asset_kind = 'currency'
    GROUP BY reason, currencyId ORDER BY (inAmount + outAmount) DESC LIMIT 20
  `).all();
  const clean = (list) => list.map((row) => Object.assign({}, row, { inAmount: Math.round(Number(row.inAmount) || 0), outAmount: Math.round(Number(row.outAmount) || 0) }));
  return { days: clean(rows), reasons: clean(reasons) };
}

// Lijst per soort van wat nog als node bestaat (de oude route). Alleen tellen; schrijft niets.
export function legacyNodeCounts(graph, titleOf = (type) => type) {
  const counts = new Map();
  for (const node of Array.isArray(graph?.nodes) ? graph.nodes : []) {
    if (!node || !node.type) continue;
    counts.set(node.type, (counts.get(node.type) || 0) + 1);
  }
  return Array.from(counts, ([type, count]) => ({ type, label: String(titleOf(type) || type), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// Fase 8b: het handelslogboek voor de maker. Alleen lezen: wie ruilde wat met wie, en wat ging er over de markt.
// Geen namen uit de code: de spelersnamen komen uit de database.
export function tradeLog(db, { limit = 40 } = {}) {
  if (!db || typeof db.prepare !== "function") return { swaps: [], market: [], busiest: [] };
  try {
    return tradeLogRows(db, limit);
  } catch {
    // Zonder handelstabellen (verse projectdatabase) is er nog niets geruild.
    return { swaps: [], market: [], busiest: [] };
  }
}

function tradeLogRows(db, limit) {
  const max = Math.max(1, Math.min(200, Math.round(Number(limit) || 40)));
  const nameOf = (id) => {
    try { return db.prepare("SELECT display_name FROM player_profiles WHERE id = ? LIMIT 1").get(id)?.display_name || "Speler"; } catch { return "Speler"; }
  };
  const swaps = db.prepare(`
    SELECT id, player_a_id, player_b_id, completed_at
    FROM direct_trade_sessions WHERE state = 'completed'
    ORDER BY completed_at DESC LIMIT ?
  `).all(max).map((row) => {
    const lines = db.prepare("SELECT owner_player_id, asset_kind, asset_id, quantity_minor FROM direct_trade_offers WHERE trade_session_id = ? ORDER BY asset_kind ASC, asset_id ASC")
      .all(row.id);
    const side = (ownerId) => lines.filter((line) => line.owner_player_id === ownerId)
      .map((line) => ({ kind: line.asset_kind === "currency" ? "currency" : "item", id: line.asset_id, quantity: Math.max(1, Math.round(Number(line.quantity_minor) || 1)) }));
    return { tradeId: row.id, at: row.completed_at, aName: nameOf(row.player_a_id), bName: nameOf(row.player_b_id), aGave: side(row.player_a_id), bGave: side(row.player_b_id) };
  });
  const market = db.prepare(`
    SELECT id, order_id, buyer_player_id, seller_player_id, quantity, currency_id, gross_amount_minor, tax_amount_minor, seller_amount_minor, created_at
    FROM market_trades ORDER BY created_at DESC LIMIT ?
  `).all(max).map((row) => ({
    tradeId: row.id, at: row.created_at, buyerName: nameOf(row.buyer_player_id), sellerName: nameOf(row.seller_player_id),
    itemId: db.prepare("SELECT item_id FROM market_orders WHERE id = ? LIMIT 1").get(row.order_id)?.item_id || "",
    quantity: Math.max(1, Math.round(Number(row.quantity) || 1)), currencyId: row.currency_id,
    gross: Math.round(Number(row.gross_amount_minor) || 0), tax: Math.round(Number(row.tax_amount_minor) || 0), toSeller: Math.round(Number(row.seller_amount_minor) || 0)
  }));
  // Wie het drukst handelt: handig om een bot of een lek te zien.
  const busiest = db.prepare(`
    SELECT player_id, COUNT(*) AS total FROM operation_idempotency
    WHERE operation_type IN ('trade_confirm', 'trade:confirm', 'market_list', 'market:create', 'market_buy', 'market:buy')
    GROUP BY player_id ORDER BY total DESC LIMIT 5
  `).all().map((row) => ({ name: nameOf(row.player_id), total: Math.round(Number(row.total) || 0) }));
  return { swaps, market, busiest };
}
