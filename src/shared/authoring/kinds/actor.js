// Fase 05 (F5-E1-T02): actordefinitie (archetype) los van de plaatsing (spawn) en van de runtime-instance.
// Stats, gedrag en animatienamen staan als getypeerde velden in het archetype: één formulier voor Kevin.
// Een losse stat_block/faction/animation_set-kind komt pas als hergebruik dat vraagt (zie F5/VOORTGANG.md).
import { MAX_WORLD_MM } from "../../../../apps/web/public/shared/spatial.js";

const mmField = (label) => ({ type: "integer", required: true, min: -MAX_WORLD_MM, max: MAX_WORLD_MM, audience: "server", label });
const clipField = (label) => ({ type: "text", required: false, maxLength: 120, audience: "client", label });

export const ACTOR_BEHAVIORS = Object.freeze(["aggressive", "defensive"]);

export const ACTOR_KINDS = {
  actor_archetype: {
    label: "Vijand",
    singleton: false,
    domain: "actors",
    idField: "actorId",
    fields: {
      actorId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Vijand-ID" },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam" },
      modelAssetId: { type: "asset", assetType: "model", required: false, maxLength: 160, audience: "client", label: "Model" },
      modelScaleBp: { type: "integer", required: false, min: 100, max: 100000, audience: "client", label: "Modelschaal (10000 = 1x)" },
      idleClip: clipField("Animatie stilstaan"),
      walkClip: clipField("Animatie lopen"),
      attackClip: clipField("Animatie aanvallen"),
      deathClip: clipField("Animatie neervallen"),
      healthMax: { type: "integer", required: true, min: 1, max: 1000000, audience: "client", label: "Levenspunten" },
      attackPower: { type: "integer", required: true, min: 0, max: 1000000, audience: "server", label: "Aanvalskracht" },
      armor: { type: "integer", required: true, min: 0, max: 1000000, audience: "server", label: "Pantser" },
      abilityRef: { type: "ref", refKind: "ability", required: true, audience: "server", label: "Aanval" },
      behavior: { type: "select", required: true, options: ACTOR_BEHAVIORS.slice(), audience: "server", label: "Gedrag" },
      aggroRangeMm: { type: "integer", required: true, min: 0, max: 50000, audience: "server", label: "Ziet je op (mm)" },
      leashRangeMm: { type: "integer", required: true, min: 1000, max: 200000, audience: "server", label: "Max. afstand van huis (mm)" },
      moveSpeedMmPerS: { type: "integer", required: true, min: 0, max: 20000, audience: "server", label: "Loopsnelheid (mm/s)" },
      radiusMm: { type: "integer", required: true, min: 200, max: 5000, audience: "client", label: "Straal (mm)" },
      lootTableRef: { type: "ref", refKind: "loot_table", required: false, audience: "server", label: "Loottabel" },
      xpReward: { type: "integer", required: false, min: 0, max: 1000000, audience: "server", label: "XP" },
      respawnMs: { type: "integer", required: true, min: 1000, max: 86400000, audience: "server", label: "Terug na (ms)" },
      hitSoundAssetId: { type: "asset", assetType: "audio", required: false, maxLength: 160, audience: "client", label: "Geluid bij raak" },
      deathSoundAssetId: { type: "asset", assetType: "audio", required: false, maxLength: 160, audience: "client", label: "Geluid bij neervallen" }
    }
  },
  actor_spawn: {
    label: "Vijand (plek)",
    singleton: false,
    domain: "actors",
    idField: "spawnId",
    fields: {
      spawnId: { type: "id", required: true, maxLength: 120, audience: "server", label: "Plek-ID" },
      archetypeRef: { type: "ref", refKind: "actor_archetype", required: true, audience: "server", label: "Vijand" },
      regionRef: { type: "ref", refKind: "region", required: true, audience: "server", label: "Region" },
      xMm: mmField("X (mm)"),
      zMm: mmField("Z (mm)"),
      patrolPointsMm: { type: "pointList", required: false, minItems: 2, maxItems: 16, min: -MAX_WORLD_MM, max: MAX_WORLD_MM, audience: "server", label: "Patrouillepunten (mm)" }
    }
  }
};
