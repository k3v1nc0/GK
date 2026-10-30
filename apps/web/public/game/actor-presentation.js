// Fase 05 (F5-E3-T01): vijanden en grondstoffen in de game tonen. De server beslist alles; dit bestand
// houdt alleen bij wat de server stuurde (actor:snapshot / actor:event), loopt vloeiend tussen updates
// en maakt er gewone runtime-targets van (klikken = de bestaande attack/gather-actie).

const RENDER_DELAY_MS = 150;
const DYING_MS = 1600;
const STALE_GAP_MS = 300;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
  let delta = (b - a) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}

export function createActorPresentation(options = {}) {
  const fetchJson = options.fetchJson;
  const records = new Map();
  let buildId = null;
  let defs = null; // client.actors uit de actieve build
  let loadingBuildId = null;
  let registeredFor = null;

  async function loadDefinitions(nextBuildId) {
    if (!nextBuildId || loadingBuildId === nextBuildId || (defs && buildId === nextBuildId)) return;
    loadingBuildId = nextBuildId;
    try {
      const data = await fetchJson("/api/authoring/builds/" + encodeURIComponent(nextBuildId) + "/client.json");
      defs = data?.client?.actors || null;
      buildId = nextBuildId;
      registeredFor = null;
      if (typeof options.onDefinitions === "function") options.onDefinitions();
    } catch (error) {
      console.warn("[actors] build niet geladen:", error?.message || error);
    } finally {
      loadingBuildId = null;
    }
  }

  function registerAssets(runtime) {
    if (!defs || !runtime || typeof runtime.registerRuntimeAssets !== "function" || registeredFor === buildId) return;
    const list = Object.entries(defs.assets || {}).map(([id, asset]) => ({ id, assetType: asset.assetType, sourcePath: asset.url, name: id, metadata: {} }));
    runtime.registerRuntimeAssets(list);
    registeredFor = buildId;
  }

  function addSample(record, entry, at) {
    const last = record.samples[record.samples.length - 1];
    if (last && at - last.t > STALE_GAP_MS) record.samples.push({ t: at - 100, x: last.x, y: last.y, z: last.z, r: last.r });
    record.samples.push({ t: at, x: Number(entry.x), y: Number(entry.y) || 0, z: Number(entry.z), r: Number(entry.r) || 0 });
    while (record.samples.length > 4) record.samples.shift();
  }

  // Geeft true als er iets veranderde dat de targetlijst raakt (nieuw/weg/levenspunten/status).
  function applySnapshot(message, now = performance.now()) {
    if (message.buildId && message.buildId !== buildId) loadDefinitions(message.buildId);
    let changed = false;
    const seen = new Set();
    for (const entry of Array.isArray(message.actors) ? message.actors : []) {
      if (!entry?.id) continue;
      seen.add(entry.id);
      let record = records.get(entry.id);
      if (!record) {
        record = { id: entry.id, k: entry.k, d: entry.d, samples: [], hp: entry.hp, hm: entry.hm, s: entry.s, dyingUntil: 0 };
        records.set(entry.id, record);
        changed = true;
      }
      if (record.hp !== entry.hp || record.s !== entry.s || record.hm !== entry.hm) changed = true;
      if (record.s !== "d" && entry.s === "d" && record.k === "a") record.dyingUntil = now + DYING_MS;
      record.hp = entry.hp;
      record.hm = entry.hm;
      record.s = entry.s;
      addSample(record, entry, now);
    }
    const remove = new Set(Array.isArray(message.gone) ? message.gone : []);
    if (message.full === true) for (const id of records.keys()) if (!seen.has(id)) remove.add(id);
    for (const id of remove) if (records.delete(id)) changed = true;
    return changed;
  }

  function applyEvent(message, now = performance.now()) {
    const record = records.get(message.id);
    if (!record) return false;
    if (message.e === "death") {
      record.s = "d";
      record.hp = 0;
      record.dyingUntil = now + DYING_MS;
      return true;
    }
    if (message.e === "hit" && Number.isFinite(Number(message.hp))) {
      record.hp = Number(message.hp);
      return true;
    }
    if (message.e === "attack") {
      record.attackUntil = now + 600;
      return false;
    }
    return false;
  }

  function currentPose(record, now) {
    const samples = record.samples;
    if (!samples.length) return null;
    const at = now - RENDER_DELAY_MS;
    if (at <= samples[0].t || samples.length === 1) return samples[0];
    for (let i = samples.length - 1; i > 0; i -= 1) {
      const a = samples[i - 1]; const b = samples[i];
      if (at >= a.t) {
        if (at >= b.t) return b;
        const t = (at - a.t) / Math.max(1, b.t - a.t);
        return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), r: lerpAngle(a.r, b.r, t) };
      }
    }
    return samples[samples.length - 1];
  }

  function statusOf(record, now) {
    if (record.k === "r") return record.s === "d" ? "depleted" : "available";
    if (record.s === "d") return now < record.dyingUntil ? "dying" : "dead";
    return "alive";
  }

  function animationOf(record, now) {
    if (record.k !== "a") return "idle";
    if (record.s === "d") return "death";
    if (record.s === "a" || now < (record.attackUntil || 0)) return "attack";
    return record.s === "w" ? "walk" : "idle";
  }

  function targetFor(record, now) {
    const pose = currentPose(record, now);
    if (!pose || !defs) return null;
    const status = statusOf(record, now);
    if (record.k === "r") {
      const def = defs.resources?.[record.d];
      if (!def) return null;
      return {
        instanceId: record.id, entityKind: "resource", targetKind: "resource", action: "gather", prompt: "Verzamel",
        displayName: def.displayName, x: pose.x, y: pose.y, z: pose.z,
        range: def.gatherRangeMm / 1000, radius: def.radiusMm / 1000,
        available: record.s !== "d", status,
        modelAssetId: def.modelAssetId || "", modelScale: def.modelScaleBp ? def.modelScaleBp / 10000 : 1,
        actorTarget: true
      };
    }
    const def = defs.archetypes?.[record.d];
    if (!def) return null;
    // Klassen: de aanval van je eigen klasse (zonder: standaardbereik).
    const classId = typeof options.classId === "function" ? options.classId() : null;
    const ability = (classId && defs.abilities?.[defs.classAbilityIds?.[classId]]) || null;
    return {
      instanceId: record.id, entityKind: "enemy", targetKind: "enemy", action: "attack", prompt: "Aanvallen",
      displayName: def.displayName, x: pose.x, y: pose.y, z: pose.z,
      range: ability ? ability.rangeMm / 1000 : 2.8, radius: def.radiusMm / 1000,
      // "dying" blijft zichtbaar (neervalanimatie); pas "dead" verbergt de vijand.
      available: status !== "dead", alive: status !== "dead", status,
      healthCurrent: record.hp, healthMax: record.hm,
      modelAssetId: def.modelAssetId || "", modelScale: def.modelScaleBp ? def.modelScaleBp / 10000 : 1,
      actorClips: { idle: def.idleClip || "", walk: def.walkClip || "", attack: def.attackClip || "", death: def.deathClip || "" },
      actorTarget: true
    };
  }

  function targets(runtime, now = performance.now()) {
    registerAssets(runtime);
    const list = [];
    for (const record of records.values()) {
      const target = targetFor(record, now);
      if (target) list.push(target);
    }
    return list;
  }

  function targetById(id, now = performance.now()) {
    const record = records.get(String(id || ""));
    return record ? targetFor(record, now) : null;
  }

  // Elk frame: vloeiende positie, richting en animatie. Geeft true als een vijand net klaar is met neervallen.
  function frame(runtime, now = performance.now()) {
    if (!runtime || typeof runtime.setRuntimeTargetPose !== "function" || !records.size) return false;
    let finishedDying = false;
    for (const record of records.values()) {
      const pose = currentPose(record, now);
      if (!pose) continue;
      runtime.setRuntimeTargetPose(record.id, pose.x, pose.y, pose.z, pose.r);
      if (typeof runtime.setRuntimeTargetAnimation === "function") runtime.setRuntimeTargetAnimation(record.id, animationOf(record, now));
      if (record.dyingUntil && now >= record.dyingUntil) {
        record.dyingUntil = 0;
        finishedDying = true;
      }
    }
    return finishedDying;
  }

  function clear() {
    records.clear();
  }

  return { applySnapshot, applyEvent, targets, targetById, frame, clear, debug: () => ({ buildId, records: records.size, hasDefinitions: Boolean(defs) }) };
}
