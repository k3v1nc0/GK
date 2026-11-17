// Fase 05 (F5-E1-T02 + F5-E2-T03): aanvallen, loottabellen, grondstoffen en vijanden -> buildsectie "actors".
// Pure functie: zelfde documenten -> zelfde sectie. Zonder actor-documenten geen sectie, zodat oudere builds
// bytegelijk blijven. server.json krijgt formules en loot; client.json alleen wat de game moet tonen.
import { cellKeyForPointMm, rectContains } from "../../../apps/web/public/shared/spatial.js";
import { LEGACY_PLAYER_ATTACK, MAX_LOOT_DEPTH } from "../../../apps/web/public/shared/combat-math.js";
import { splitByAudience } from "../../shared/authoring/kinds.js";
import { routePointsOf } from "../../shared/authoring/route-points.js";

export const ACTOR_SECTION_VERSION = "gk-actors-1";
export const ACTOR_DOC_KINDS = Object.freeze(["ability", "loot_table", "resource_definition", "resource_spawn", "actor_archetype", "actor_spawn"]);

// Zonder eigen spelersaanval gebruikt de speler de oude NODE-03-aanval (zelfde schade als legacy).
export const DEFAULT_PLAYER_ABILITY = Object.freeze(Object.assign({ abilityId: "legacy.basic_attack", displayName: "Aanval", rangeMm: 2800, cooldownMs: 250 }, LEGACY_PLAYER_ATTACK));

const idFromRef = (ref) => String(ref || "").replace(/^[a-z_]+:/, "");
// Fase 5: standaard voor "af en toe een sterkere" als het veld op een oude plek nog leeg is.
export const ELITE_DEFAULTS = Object.freeze({ chancePct: 10, strengthPct: 200 });

// Zoekt cycli en te diepe nesting in loottabellen. tables: Map docKey -> doc.
export function lootGraphIssues(tables) {
  const issues = [];
  const state = new Map(); // docKey -> "busy" | "done"
  const depthOf = new Map();
  const visit = (key, path) => {
    if (state.get(key) === "busy") {
      issues.push({ code: "LOOT_CYCLE", docKey: key, message: "Loottabellen wijzen in een kring naar elkaar: " + path.concat(key).map(idFromRef).join(" -> ") });
      return 0;
    }
    if (state.get(key) === "done") return depthOf.get(key);
    const doc = tables.get(key);
    if (!doc) return 0;
    state.set(key, "busy");
    let depth = 1;
    for (const entry of doc.body.entries || []) {
      if (entry.tableRef && tables.has(entry.tableRef)) depth = Math.max(depth, 1 + visit(entry.tableRef, path.concat(key)));
    }
    state.set(key, "done");
    depthOf.set(key, depth);
    return depth;
  };
  for (const key of Array.from(tables.keys()).sort()) {
    const depth = visit(key, []);
    if (depth > MAX_LOOT_DEPTH && !issues.some((issue) => issue.docKey === key)) {
      issues.push({ code: "LOOT_TOO_DEEP", docKey: key, message: "Loottabel " + idFromRef(key) + " nest dieper dan " + MAX_LOOT_DEPTH + " tabellen." });
    }
  }
  return issues;
}

// Plaatsingsregels (ook bij elk command): plek en patrouille binnen de eigen Region.
// Zonder Region (terugbouw zonder nodes) staat de plek gewoon in de ene wereld: geen gebiedscontrole.
export function actorSpawnIssues(docs) {
  const regions = new Map(docs.filter((doc) => doc.kind === "region" && !doc.archived).map((doc) => [doc.docKey, doc]));
  const issues = [];
  for (const doc of docs) {
    if (doc.archived || (doc.kind !== "actor_spawn" && doc.kind !== "resource_spawn")) continue;
    const label = (doc.kind === "actor_spawn" ? "Vijand-plek " + doc.body.spawnId : "Grondstof-plek " + doc.body.resourceSpawnId);
    if (!doc.body.regionRef) continue;
    const region = regions.get(doc.body.regionRef);
    if (!region) {
      issues.push({ code: "SPAWN_REGION_MISSING", docKey: doc.docKey, otherDocKey: doc.body.regionRef, message: label + " hoort bij een Region die niet (meer) bestaat." });
      continue;
    }
    const points = [[doc.body.xMm, doc.body.zMm]].concat(Array.isArray(doc.body.patrolPointsMm) ? doc.body.patrolPointsMm : []);
    if (points.some((point) => !rectContains(region.body, point[0], point[1]))) {
      issues.push({ code: "SPAWN_OUTSIDE_REGION", docKey: doc.docKey, otherDocKey: region.docKey, message: label + " (of een patrouillepunt) ligt buiten Region " + region.body.displayName + "." });
    }
  }
  return issues;
}

// options.assetInfo: Map assetId -> { assetType, sourcePath, animations: [naam] | null }.
export function compileActorSection(documents, options = {}) {
  const active = documents.filter((doc) => !doc.archived);
  const actorDocs = active.filter((doc) => ACTOR_DOC_KINDS.includes(doc.kind)).sort((a, b) => a.docKey.localeCompare(b.docKey));
  // Werkbank Fase 10: ook zonder vijanden laat de server NPC's rondlopen (dan is er een sectie met alleen npcWalkers).
  if (!actorDocs.length && !active.some((doc) => doc.kind === "npc" && (npcWalkerOf(doc.body) || npcChatterOf(doc.body).length))) return null;
  const errors = [];
  const byKey = new Map(active.map((doc) => [doc.docKey, doc]));
  const of = (kind) => actorDocs.filter((doc) => doc.kind === kind);
  const needRef = (doc, ref, kind, label) => {
    const target = ref ? byKey.get(ref) : null;
    if (ref && (!target || target.kind !== kind)) errors.push({ code: "REF_UNRESOLVED", docKey: doc.docKey, message: label + " wijst naar " + ref + ", maar die bestaat niet (meer)." });
    return target && target.kind === kind ? target : null;
  };
  const assetInfo = options.assetInfo || null;
  const assets = {};
  const needAsset = (doc, assetId, type, label) => {
    if (!assetId) return null;
    const info = assetInfo ? assetInfo.get(assetId) : null;
    if (assetInfo && !info) { errors.push({ code: "ASSET_UNKNOWN", docKey: doc.docKey, message: label + " gebruikt onbekend asset " + assetId }); return null; }
    if (info && info.assetType !== type) { errors.push({ code: "ASSET_TYPE", docKey: doc.docKey, message: label + ": " + assetId + " is geen " + type }); return null; }
    if (info && info.sourcePath) assets[assetId] = { assetType: type, url: info.sourcePath };
    return info;
  };


  // Fase 5: welke quests een vaardigheid als beloning geven (de game zegt dan "na quest …").
  const questsGiving = new Map();
  for (const quest of active.filter((doc) => doc.kind === "quest").sort((a, b) => a.docKey.localeCompare(b.docKey))) {
    const rows = [].concat(Array.isArray(quest.body.rewards) ? quest.body.rewards : [],
      ...(Array.isArray(quest.body.steps) ? quest.body.steps : []).map((step) => (step?.kind === "end" && Array.isArray(step.rewards) ? step.rewards : [])));
    for (const row of rows) {
      if (!row?.ref || !String(row.ref).startsWith("ability:")) continue;
      const list = questsGiving.get(row.ref) || [];
      if (!list.includes(quest.body.displayName)) list.push(quest.body.displayName || quest.body.questId);
      questsGiving.set(row.ref, list);
    }
  }
  const abilities = { server: {}, client: {} };
  for (const doc of of("ability")) {
    const split = splitByAudience(doc.kind, doc.body);
    const fromQuests = questsGiving.get(doc.docKey) || [];
    if (fromQuests.length) split.client.fromQuests = split.server.fromQuests = fromQuests.slice(0, 3);
    abilities.server[doc.body.abilityId] = split.server;
    abilities.client[doc.body.abilityId] = split.client;
  }

  const lootDocs = new Map(of("loot_table").map((doc) => [doc.docKey, doc]));
  errors.push(...lootGraphIssues(lootDocs).map(({ code, docKey, message }) => ({ code, docKey, message })));
  const lootTables = {};
  for (const doc of lootDocs.values()) {
    const entries = [];
    doc.body.entries.forEach((entry, index) => {
      const label = "Loottabel " + doc.body.lootTableId + " regel " + (index + 1);
      const base = { chanceBp: entry.chanceBp, minQty: entry.minQty, maxQty: entry.maxQty };
      if (entry.itemRef) {
        if (needRef(doc, entry.itemRef, "item_definition", label)) entries.push(Object.assign({ itemId: idFromRef(entry.itemRef) }, base));
      } else if (entry.tableRef) {
        if (needRef(doc, entry.tableRef, "loot_table", label)) entries.push(Object.assign({ lootTableId: idFromRef(entry.tableRef) }, base));
      } else if (entry.currencyRef) {
        // Fase 8: geld uit een loottabel.
        if (needRef(doc, entry.currencyRef, "currency", label)) entries.push(Object.assign({ currencyId: idFromRef(entry.currencyRef) }, base));
      }
    });
    lootTables[doc.body.lootTableId] = { displayName: doc.body.displayName, entries };
  }

  const resources = { server: {}, client: {} };
  for (const doc of of("resource_definition")) {
    const label = "Grondstof " + doc.body.resourceId;
    needRef(doc, doc.body.lootTableRef, "loot_table", label);
    needAsset(doc, doc.body.modelAssetId, "model", label);
    const split = splitByAudience(doc.kind, doc.body);
    const server = Object.assign({}, split.server, { lootTableId: idFromRef(doc.body.lootTableRef) });
    delete server.lootTableRef;
    // Fase 9: bij welk beroep, vanaf welk niveau en hoeveel beroeps-XP (zonder beroep: iedereen, geen XP).
    delete server.professionRef;
    delete server.professionLevel;
    delete server.professionXp;
    if (doc.body.professionRef && needRef(doc, doc.body.professionRef, "profession", label + " (beroep)")) {
      server.professionId = idFromRef(doc.body.professionRef);
      server.professionLevel = Number.isInteger(doc.body.professionLevel) ? doc.body.professionLevel : 1;
      server.professionXp = Number.isInteger(doc.body.professionXp) ? doc.body.professionXp : 10;
    }
    resources.server[doc.body.resourceId] = server;
    resources.client[doc.body.resourceId] = split.client;
  }

  const archetypes = { server: {}, client: {} };
  for (const doc of of("actor_archetype")) {
    const label = "Vijand " + doc.body.actorId;
    needRef(doc, doc.body.abilityRef, "ability", label);
    if (doc.body.lootTableRef) needRef(doc, doc.body.lootTableRef, "loot_table", label);
    // Healing (2-11): een vijand-healer heeft een genees-spreuk (aanval met soort Genezen).
    const healAbility = doc.body.healAbilityRef ? needRef(doc, doc.body.healAbilityRef, "ability", label + " (genees-spreuk)") : null;
    if (healAbility && healAbility.body.abilityKind !== "heal") errors.push({ code: "HEAL_ABILITY_KIND", docKey: doc.docKey, message: label + ": de genees-spreuk " + healAbility.body.displayName + " heeft niet de soort Genezen." });
    const model = needAsset(doc, doc.body.modelAssetId, "model", label);
    needAsset(doc, doc.body.hitSoundAssetId, "audio", label);
    needAsset(doc, doc.body.deathSoundAssetId, "audio", label);
    const clipNames = model && Array.isArray(model.animations) ? new Set(model.animations) : null;
    for (const field of ["idleClip", "walkClip", "attackClip", "deathClip"]) {
      const clip = doc.body[field];
      if (!clip) continue;
      if (!doc.body.modelAssetId) errors.push({ code: "CLIP_WITHOUT_MODEL", docKey: doc.docKey, message: label + ": animatie " + clip + " zonder model." });
      else if (clipNames && !clipNames.has(clip)) errors.push({ code: "CLIP_UNKNOWN", docKey: doc.docKey, message: label + ": model heeft geen animatie " + clip + "." });
    }
    const split = splitByAudience(doc.kind, doc.body);
    const server = Object.assign({}, split.server, { abilityId: idFromRef(doc.body.abilityRef) });
    if (doc.body.lootTableRef) server.lootTableId = idFromRef(doc.body.lootTableRef);
    if (healAbility) server.healAbilityId = healAbility.body.abilityId;
    delete server.abilityRef;
    delete server.lootTableRef;
    delete server.healAbilityRef;
    archetypes.server[doc.body.actorId] = server;
    archetypes.client[doc.body.actorId] = split.client;
  }

  // Stap 8: een NPC die je begeleidt loopt als quest-NPC mee; de game heeft zijn naam, model en animaties nodig.
  const npcs = {};
  // Werkbank Fase 10 (Kevin 15-11): NPC's die rondlopen (de server laat ze lopen, alleen als er spelers in de buurt zijn).
  const npcWalkers = [];
  for (const doc of active.filter((item) => item.kind === "npc").sort((a, b) => a.docKey.localeCompare(b.docKey))) {
    // Fouten in het model meldt de NPC-kaart zelf al (game-compiler); hier alleen het pad voor de game.
    const info = doc.body.modelAssetId && assetInfo ? assetInfo.get(doc.body.modelAssetId) : null;
    if (info && info.assetType === "model" && info.sourcePath) assets[doc.body.modelAssetId] = { assetType: "model", url: info.sourcePath };
    npcs[doc.body.npcId] = { displayName: doc.body.displayName || doc.body.npcId, modelAssetId: doc.body.modelAssetId || null,
      modelScaleBp: doc.body.modelScaleBp || 10000, idleClip: doc.body.idleClip || null, walkClip: doc.body.walkClip || null };
    const chatter = npcChatterOf(doc.body);
    if (chatter.length) npcs[doc.body.npcId].chatter = chatter;
    // Alleen een lopende NPC heeft zijn praatafstand in de game nodig (zijn klikvak loopt met hem mee).
    const walker = npcWalkerOf(doc.body);
    if (walker) {
      npcWalkers.push(walker);
      // Kevin 16-11: geluid per routepunt (de game speelt het als hij daar aankomt).
      for (const point of walker.route || []) if (point.sound && !needAsset(doc, point.sound, "audio", "NPC " + doc.body.displayName + " (geluid op de route)") && assetInfo) delete point.sound;
      Object.assign(npcs[doc.body.npcId], { walks: true, talkRange: Number(doc.body.talkRange) > 0 ? Number(doc.body.talkRange) : 2.5 });
      // Werkbank Fase 10 (Kevin 16-11): geluid tijdens het lopen (alleen een bestaand geluidsbestand).
      const sound = doc.body.walkSound && assetInfo ? assetInfo.get(doc.body.walkSound) : null;
      if (doc.body.walkSound && assetInfo && !sound) errors.push({ code: "ASSET_UNKNOWN", docKey: doc.docKey, message: "NPC " + doc.body.displayName + " gebruikt onbekend geluid " + doc.body.walkSound });
      else if (sound && sound.assetType !== "audio") errors.push({ code: "ASSET_TYPE", docKey: doc.docKey, message: "NPC " + doc.body.displayName + ": " + doc.body.walkSound + " is geen geluid" });
      else if (sound?.sourcePath) {
        assets[doc.body.walkSound] = { assetType: "audio", url: sound.sourcePath };
        npcs[doc.body.npcId].walkSound = doc.body.walkSound;
      }
    }
  }

  errors.push(...actorSpawnIssues(active).map(({ code, docKey, message }) => ({ code, docKey, message })));
  const spawns = [];
  const spawnSounds = {};
  for (const doc of of("actor_spawn")) {
    const label = "Vijand-plek " + doc.body.spawnId;
    needRef(doc, doc.body.archetypeRef, "actor_archetype", label);
    const spawn = { spawnId: doc.body.spawnId, actorId: idFromRef(doc.body.archetypeRef), regionId: doc.body.regionRef ? idFromRef(doc.body.regionRef) : null, xMm: doc.body.xMm, zMm: doc.body.zMm, cellKey: cellKeyForPointMm(doc.body.xMm, doc.body.zMm) };
    if (Array.isArray(doc.body.patrolPointsMm) && doc.body.patrolPointsMm.length) spawn.patrolPointsMm = doc.body.patrolPointsMm;
    // Kevin 16-11: Lopen = stilstaan, rondlopen of een route (net als een NPC). Een oudere plek zonder keuze: rondwandelen als die straal er staat.
    const walkMode = doc.body.walkMode || (Number(doc.body.wanderRadiusMm) > 0 ? "wander" : "stand");
    if (walkMode === "wander" && Number(doc.body.wanderRadiusMm) > 0) spawn.wanderRadiusMm = Math.round(Number(doc.body.wanderRadiusMm));
    if (walkMode === "route") {
      const route = routePointsOf(doc.body.route);
      for (const point of route) if (point.sound && !needAsset(doc, point.sound, "audio", label + " (geluid op de route)") && assetInfo) delete point.sound;
      if (route.length) {
        const speed = Number(doc.body.walkSpeed) > 0 ? Math.max(0.3, Math.min(30, Number(doc.body.walkSpeed))) : 2;
        Object.assign(spawn, { route, routeLoop: doc.body.routeEnd !== "back", routeSpeedMmPerS: Math.round(speed * 1000) });
      }
    }
    if (walkMode !== "stand" && doc.body.walkSound && (needAsset(doc, doc.body.walkSound, "audio", label + " (geluid tijdens lopen)") || !assetInfo)) spawnSounds[doc.body.spawnId] = doc.body.walkSound;
    if (Number(doc.body.rotationY)) spawn.rotationY = Number(doc.body.rotationY);
    // Fase 5: af en toe een sterkere (leeg = de standaard van het schema: 10 % kans, 200 % sterk).
    const chance = Number.isInteger(doc.body.eliteChancePct) ? doc.body.eliteChancePct : ELITE_DEFAULTS.chancePct;
    if (chance > 0) {
      spawn.eliteChancePct = chance;
      spawn.eliteStrengthPct = Number.isInteger(doc.body.eliteStrengthPct) ? doc.body.eliteStrengthPct : ELITE_DEFAULTS.strengthPct;
    }
    spawns.push(spawn);
    // Kevin 16-11: het groepje rond deze vijand (hooguit 12), in een kring om hem heen. Ze lopen met hem mee en vechten samen.
    const followers = [];
    for (const row of Array.isArray(doc.body.followers) ? doc.body.followers : []) {
      const archetype = needRef(doc, row?.ref, "actor_archetype", label + " (groepje)");
      const count = Math.max(1, Math.min(12, Math.round(Number(row?.count) || 1)));
      for (let i = 0; archetype && i < count && followers.length < PACK_MAX; i += 1) followers.push(archetype.body.actorId);
    }
    if (followers.length) spawn.packLeader = true;
    followers.forEach((actorId, i) => {
      const angle = (i / followers.length) * Math.PI * 2;
      const ringMm = PACK_RING_MM + Math.floor(i / 8) * 1500;
      const dx = Math.round(Math.cos(angle) * ringMm); const dz = Math.round(Math.sin(angle) * ringMm);
      spawns.push({ spawnId: doc.body.spawnId + "~" + (i + 1), actorId, regionId: spawn.regionId, xMm: spawn.xMm + dx, zMm: spawn.zMm + dz,
        cellKey: cellKeyForPointMm(spawn.xMm + dx, spawn.zMm + dz), leaderSpawnId: doc.body.spawnId, followMm: [dx, dz] });
    });
  }
  const resourceSpawns = [];
  for (const doc of of("resource_spawn")) {
    needRef(doc, doc.body.resourceRef, "resource_definition", "Grondstof-plek " + doc.body.resourceSpawnId);
    const resourceSpawn = { resourceSpawnId: doc.body.resourceSpawnId, resourceId: idFromRef(doc.body.resourceRef), regionId: doc.body.regionRef ? idFromRef(doc.body.regionRef) : null, xMm: doc.body.xMm, zMm: doc.body.zMm, cellKey: cellKeyForPointMm(doc.body.xMm, doc.body.zMm) };
    for (const key of ["rotationX", "rotationY", "rotationZ"]) if (Number(doc.body[key])) resourceSpawn[key] = Number(doc.body[key]);
    resourceSpawns.push(resourceSpawn);
  }

  // Klassen: per klasse een vaste auto-aanval (vak 1) en een lijst vaardigheden voor vak 2 en 3 (Fase 5).
  // Zonder auto-aanval de ingebouwde standaardklap.
  const classAbilityIds = {};
  const classSkills = {};
  for (const doc of active.filter((candidate) => candidate.kind === "player_class").sort((a, b) => a.docKey.localeCompare(b.docKey))) {
    const label = "Klasse " + doc.body.displayName;
    const ability = doc.body.abilityRef ? needRef(doc, doc.body.abilityRef, "ability", label + " (auto-aanval)") : null;
    if (ability) classAbilityIds[doc.body.classId] = ability.body.abilityId;
    const list = [];
    for (const row of Array.isArray(doc.body.skills) ? doc.body.skills : []) {
      const skill = needRef(doc, row?.ref, "ability", label + " (vaardigheden)");
      if (skill && !list.includes(skill.body.abilityId)) list.push(skill.body.abilityId);
    }
    if (list.length) classSkills[doc.body.classId] = list;
  }
  return {
    server: { schema: ACTOR_SECTION_VERSION, classAbilityIds, classSkills, abilities: abilities.server, lootTables, resources: resources.server, archetypes: archetypes.server, spawns, resourceSpawns,
      ...(npcWalkers.length ? { npcWalkers } : {}) },
    client: { schema: ACTOR_SECTION_VERSION, classAbilityIds, classSkills, abilities: abilities.client, resources: resources.client, archetypes: archetypes.client, assets,
      ...(Object.keys(npcs).length ? { npcs } : {}), ...(Object.keys(spawnSounds).length ? { spawnSounds } : {}) },
    errors
  };
}

// Kevin 16-11: een groepje rond een vijand: hooguit 12, op 2,5 m om hem heen (meer dan 8: een tweede kring).
export const PACK_MAX = 12;
const PACK_RING_MM = 2500;

// Werkbank Fase 10: een NPC die rondloopt (Lopen = Loopt rond). Met "Alleen als vlag" blijft hij staan: niet iedereen ziet hem.
export const NPC_WALK_SPEED_MM = 1200;
// Werkbank Fase 10: de praatjes van een NPC (één per regel, hooguit 8 van 120 tekens). Een NPC met een vlag zegt niets.
export function npcChatterOf(body) {
  if (!body || body.flagRef) return [];
  return String(body.chatter || "").split(/\r?\n/).map((line) => line.trim().slice(0, 120)).filter(Boolean).slice(0, 8);
}
// Werkbank Fase 10: een NPC die rondloopt of (Kevin 16-11) een getekende route loopt, met zijn eigen snelheid.
// Een route zonder punten = hij blijft staan.
export function npcWalkerOf(body) {
  if (!body || (body.walkMode !== "wander" && body.walkMode !== "route") || body.flagRef) return null;
  const x = Number(body.x); const z = Number(body.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const route = body.walkMode === "route" ? routePointsOf(body.route) : null;
  if (route && !route.length) return null;
  const talkRange = Number(body.talkRange) > 0 ? Number(body.talkRange) : 2.5;
  const speed = Number(body.walkSpeed) > 0 ? Math.max(0.3, Math.min(8, Number(body.walkSpeed))) : NPC_WALK_SPEED_MM / 1000;
  return { npcId: body.npcId, x, z, rotationY: Number(body.rotationY) || 0, radiusM: Math.max(1, Math.min(60, Number(body.walkRadius) || 8)),
    speedMmPerS: Math.round(speed * 1000), stopM: talkRange + 1, ...(route ? { route, routeLoop: body.routeEnd !== "back" } : {}) };
}

// Fase 5: de vaardigheden van een klasse voor vak 2 en 3 (ability-ID's op volgorde). Een oudere build had alleen een
// losse genees-spreuk per klasse (classHealAbilityIds); die telt dan als de eerste vaardigheid.
export function classSkillIdsFromSection(section, classId = null) {
  if (!classId || !section) return [];
  const list = Array.isArray(section.classSkills?.[classId]) ? section.classSkills[classId].slice() : [];
  const legacyHeal = section.classHealAbilityIds?.[classId];
  if (legacyHeal && !list.includes(legacyHeal)) list.unshift(legacyHeal);
  return list.filter((id) => section.abilities?.[id]);
}

// Runtime: welke aanval gebruikt de speler (die van zijn klasse), anders de ingebouwde standaardklap.
export function playerAbilityFromSection(section, classId = null) {
  const id = classId ? section?.classAbilityIds?.[classId] : null;
  const ability = id ? section.abilities?.[id] : null;
  return ability ? Object.assign({}, DEFAULT_PLAYER_ABILITY, ability) : DEFAULT_PLAYER_ABILITY;
}

// Een vaardigheid uit de build (met zijn ID), of null.
export function abilityFromSection(section, abilityId) {
  const ability = abilityId ? section?.abilities?.[abilityId] : null;
  return ability ? Object.assign({ abilityId }, ability) : null;
}
