# Fase 3 - Levende actors, animatie, AI, combat, equipment, audio en VFX

**Status:** definitief implementatiecontract, nog niet geimplementeerd  
**Datum:** 2026-10-22  
**Repo-basis:** `main` op `043a1258390e0cb864e94540dfca7db57d60d5b4`  
**Doelpad:** `README/fases/MMORPG-basis/3 Levende actors, animatie, AI, combat, equipment, audio en VFX.md`  
**Vereiste voorgangers:** Fase 1 en Fase 2 in deze map  

---

## 0. Normatieve positie

Dit document erft alle invarianten, identiteit-, transaction-, canonical-JSON-, migration-, compile-, publish-, rollback-, coördinaten-, Region-, Area-, Cell-, streaming-, audio- en Previewcontracten uit Fase 1 en Fase 2.

Bij tegenspraak geldt:

1. Fase 1 wint voor authoring, persistence, revisions, commands, references, builds en cutover.
2. Fase 2 wint voor World/Region/Area/Cell, millimetercoördinaten, streaming en de AudioContext.
3. Fase 3 wint alleen voor actor-, navigatie-, animatie-, AI-, combat-, equipment-, action-audio- en VFX-semantiek.

Fase 1 heeft de nodegraph uitdrukkelijk uitgefaseerd als writer en uitvoeringsautoriteit. Daarom betekent integratie met de vroegere node-logica hier uitsluitend:

- bestaande nodes zijn een eenmalige legacy-importbron;
- canonieke documenten zijn de authoringbron;
- de compiler produceert immutable runtimepackages;
- servercommands en de actor-simulatie voeren gameplay uit;
- de runtime leest nooit nodes of editorpayloads.

Nieuwe actors, abilities, AI-regels, equipment, animaties of effecten mogen geen nodes, edges, Groups of verborgen graphpakketten maken.

### 0.1 Eerlijke grens

Een document kan toekomstige schaalbaarheid afdwingen, maar niet bewijzen voordat de implementatie, loadtests en live exploit-tests zijn uitgevoerd. Deze fase levert een complete speelbare actor/combatbasis voor de huidige single-process Node-server en maakt de grenzen voor latere horizontale simulatieservers expliciet. Zij belooft niet dat duizenden gelijktijdige spelers na alleen deze fase productie-klaar zijn.

### 0.2 Normatieve taal

**MOET**, **MAG NIET**, **BEHOORT**, **MAG** en **OPTIONEEL** hebben dezelfde betekenis als in Fase 1. Een implementatie die een MOET-regel schendt, voldoet niet aan deze fase.

---

## 1. Bewezen uitgangssituatie

Op de genoemde repo-basis is bewezen:

- `package.json` gebruikt Node 24+, Three.js `^0.184.0` en `ws` `^8.18.0`.
- `src/shared/node-types.js` beschrijft legacy `stat_definition`, `stat_block`, `ability_definition`, `combat_profile`, `enemy_archetype`, `npc_archetype`, `ai_behavior_profile`, `path_behavior_profile`, `animation_set`, `equipment_slot_definition`, `audio_event` en `vfx_definition`.
- `src/server/catalog-compiler.js` publiceert delen daarvan als catalogsecties en volgt enkele graphreferenties.
- `src/server/node03-runtime-service.js` bevat bestaande inventory/equipment/combatachtige runtimepaden en schrijft onder meer `player_equipment`.
- `db/migrations/006_catalog_player_state_combat_loot.sql` bevat bestaande player-, inventory-, equipment- en lootstate die behouden of gemigreerd moet worden.
- De legacyvelden vormen geen bewijs van een complete animation mixer, navmesh, AI-simulatie, server-authoritative hitdetectie, equipmentvisuals of VFX-lifecycle.
- `semantic-field-help.js` markeert verschillende spawn-/AI-/difficultyvelden zelf als niet bewezen actief.
- Fase 2 heeft navmesh/pathfinding en echte network-interest expliciet buiten scope gelaten.

Conclusie: deze fase mag bruikbare namen en content importeren, maar mag legacy schemas niet klakkeloos tot canonieke architectuur verheffen.

---

## 2. Fasedoel, scope en niet-doelen

### 2.1 Fasedoel

Fase 3 is geslaagd wanneer Kevin zonder Nodes:

1. een speler-, NPC-, enemy- en wildlife-archetype kan maken;
2. modellen, skeletons, animation clips, sockets en equipmentvisueel kan inspecteren;
3. stats, abilities, damage, status effects, factions en equipment kan instellen;
4. patrols en spawngebieden in de wereld kan tekenen;
5. actors betrouwbaar over walkable navmesh kan zien bewegen;
6. combat met serverbevestigde hits, damage, death, loot en respawn kan spelen;
7. wapens kan equippen en wisselen met zichtbare attachment en animatie;
8. action-audio en VFX synchroon kan horen/zien;
9. dezelfde betekenis in editor, Preview en published game krijgt;
10. unload/reload, reconnect, death, respawn en poolhergebruik zonder duplicaten of leaks kan bewijzen.

### 2.2 Canonical domains

| Domain key | Canonical kinds |
| --- | --- |
| `actors.catalog` | `actor_archetype`, `stat_definition`, `stat_block`, `faction_definition` |
| `combat.catalog` | `damage_type_definition`, `status_effect_definition`, `ability_definition`, `combat_profile` |
| `equipment.catalog` | `equipment_slot_definition`, `equipment_loadout`; uitbreiding `item_definition` naar versie 2 |
| `presentation.actors` | `skeleton_profile`, `animation_set`, `vfx_definition`; hergebruik `audio_event` versie 1 |
| `navigation.catalog` | `nav_agent_profile`, `ai_profile`, `patrol_path` |
| `world.actors` | `actor_spawn`, `spawn_group`; uitbreiding `placed_entity` naar versie 3 voor een actorcomponent |

### 2.3 In scope

- Een data-oriented actor runtime met expliciete components en systemen.
- Server-authoritative vaste simulatiestap, commandvalidatie, snapshots en events.
- Fixed-point stat- en combatmath met vastgelegde rounding.
- Actor lifecycle, spawns, corpses, respawn en Cell-interest.
- Recast/Detour-navmeshbaking per Fase-2-Cell en runtimepathfinding.
- Deterministische AI-state machines, perception, threat en abilityselectie.
- Three.js AnimationMixer-presentatie, layers, crossfades, markers en baked root motion.
- Equipmenttransacties, sockets, weapon swap en stat/abilitymodifiers.
- Hitboxes, hurtboxes, projectiles, cooldowns, resources en status effects.
- Action-audio via de Fase-2-audiograph en pooled VFX.
- Object pools, assetownership, disposal, budgets en diagnostics.
- Legacy-import, parityrapporten en domeingewijze cutover.
- Editor/Preview/game-UX die de systemen visueel maakbaar en testbaar maakt.

### 2.4 Buiten scope

- PvP, duels, guild warfare en friendly-fire policies.
- Raids, threat sharing tussen servers en instanced dungeons.
- Volledige physics-engine, ragdolls, cloth en destructible skeletal meshes.
- Motion matching, inverse-kinematicsauthoring en automatische retargeting tussen willekeurige rigs.
- Voice chat, lipsync en cinematics.
- Geavanceerde projectile ballistics met aerodynamica.
- Client-side gameplayscripts, user shaders of evalbare formules.
- Horizontale shardhandoff; het protocol maakt een latere world-server authority transfer mogelijk.
- Een onbeperkte generieke behavior-tree-editor. Fase 3 gebruikt getypeerde profielen en vaste, geteste state machines.

---

## 3. Onbreekbare invarianten

### A-01 - Server authority

De client stuurt intenties. Alleen de server beslist over positiecorrectie, abilitystart, targets, hits, damage, resources, cooldowns, effects, equipment, death, loot en respawn.

### A-02 - Geen runtime-nodelezing

ActorSim, AI, combat en presentation lezen uitsluitend compileroutput met een ondersteunde runtime-schemaversie.

### A-03 - Vaste tijd

Gameplay gebruikt een monotone servertick. Wall-clock en renderdelta bepalen geen combatuitkomst.

### A-04 - Integer gameplaymath

Posities zijn millimeters; statwaarden zijn milli-units; kansen en ratio's zijn basispunten. Gameplay gebruikt geen onbegrensde floating-point accumulatie.

### A-05 - Een actor-ID, een lifecycle

Een runtime `actorId` is uniek binnen een world instance. Iedere actor doorloopt de vastgelegde lifecycle exact eenmaal per generatie.

### A-06 - Definition versus instance

Archetypes zijn immutable builddata. Actuele HP, cooldowns, threat, effects en transform zijn runtime-instance state en worden nooit in definitiondocuments teruggeschreven.

### A-07 - Presentatie is gevolg

Animatie, audio, VFX, UI en camera mogen serveruitkomsten tonen of tijdelijk voorspellen, maar veranderen geen gameplaystate.

### A-08 - Navmesh is afgeleid

Navmeshdata is deterministische compileroutput uit canonical surfaces/colliders plus een nav-agentprofile. Kevin bewerkt geen navmeshpolygonen als brondata.

### A-09 - Bounded work

AI-queries, pathrequests, snapshots, events, voices, particles, projectiles en pools hebben harde limieten. Overschrijding degradeert zichtbaar en meetbaar, nooit via onbeperkte groei.

### A-10 - Reset voor reuse

Een pooled object mag pas opnieuw worden uitgegeven nadat alle transforms, timers, callbacks, mixeractions, attachments, materials, audio nodes en ownershiptokens zijn gereset.

### A-11 - Build pinning

Een world instance draait exact een `buildId`. Een actor kan geen definition uit een ander build gebruiken.

### A-12 - Preview-isolatie

Preview gebruikt dezelfde simulator en compileroutput, maar een ephemeral sandboxrepository. Preview schrijft geen echte player-, inventory-, loot- of equipmentstate.

### A-13 - Deterministische tie-break

Wanneer waarden gelijk zijn, wint altijd de lexicografisch kleinste canonical ID of runtime actor-ID, zoals per algoritme vastgelegd.

### A-14 - Geen stille fallback

Een verplicht model, skeleton, clip, ability, stat of navtile dat ontbreekt blokkeert publish. Alleen velden die uitdrukkelijk optional zijn hebben de beschreven fallback.

### A-15 - Idempotente gameplaymutaties

Inventory-, equipment-, reward-, lootclaim- en persistent playercommands gebruiken een request-ID en leveren bij retry dezelfde uitkomst.

### A-16 - Een collisionbetekenis

Gameplay hit/hurtvolumes komen uit compilerdata. Renderbounds, pixels en client-skeletonpose zijn nooit de serverbron voor een hit.

---

## 4. Architectuurblueprint

```text
Werkbank / Instellingen
  actor-, animation-, AI-, combat-, equipment- en effecteditors
        |
        v
Canonical AuthoringCommandService (Fase 1)
        |
        v
Versioned documents + typed refs
        |
        v
GameProjectCompiler
  + ActorCatalogCompiler
  + CombatCatalogCompiler
  + NavigationTileCompiler
  + AnimationMetadataCompiler
  + PresentationCatalogCompiler
        |
        v
Immutable build
  manifest + actor package + combat package + nav tiles + world cell fragments
        |
        +--------------------------+
        |                          |
        v                          v
WorldInstance / ActorSim      Client Presentation
20 Hz authority              render interpolation
AI + nav + combat            Three AnimationMixer
spawn + lifecycle            equipment visuals
inventory transactions       audio/VFX pools
        |                          ^
        +---- snapshots/events ----+
```

### 4.1 Servermodules

| Module | Verantwoordelijkheid |
| --- | --- |
| `actor-runtime-registry` | Dense actorstorage, generation handles, componentpresence |
| `world-instance-service` | Build pin, tickloop, Region/Cell-interest, sessions |
| `movement-system` | Intent, acceleration, nav-following, collision, authoritative transform |
| `navigation-service` | Navtile registry, nearest-poly, path/crowd queries |
| `ai-system` | Perception, state transitions, threat, path/ability intent |
| `ability-system` | Cast state, cost, cooldown, target validation, scheduled markers |
| `combat-system` | Hit query, damage, heal, effects, death |
| `equipment-service` | Persistent equip/unequip/swap transaction en derived modifiers |
| `spawn-system` | Spawn groups, caps, corpses, respawn |
| `replication-service` | Interest, snapshots, reliable events, backpressure |
| `simulation-audit` | Structured counters en invariant failures |

### 4.2 Clientmodules

| Module | Verantwoordelijkheid |
| --- | --- |
| `actor-replica-store` | Snapshotbuffers en eventdeduplicatie |
| `actor-render-system` | Render proxies, LOD, visibility en interpolation |
| `animation-controller` | Mixer, state/layers, fades, markers voor cosmetica |
| `equipment-render-system` | Modelattachments op gevalideerde sockets |
| `action-audio-system` | Fase-2 AudioContext, voicebudget en spatial emitters |
| `vfx-system` | Effecttemplates, pools, lifetime en quality fallback |
| `prediction-reconciler` | Alleen lokale locomotion en toegestane cosmetische voorspelling |

---

## 5. Identiteit, tijd, eenheden en rounding

### 5.1 IDs

| Begrip | Vorm | Levensduur |
| --- | --- | --- |
| Definition | Fase-1 `documentId` en `runtimeKey` | permanent |
| World instance | `worldinst:` + UUID | process/recovery session |
| Actor | `actor:` + UUID | een spawnlevenscyclus |
| Generation handle | `{index:uint32,generation:uint32}` | poolslot; stale handles falen |
| Ability execution | `abilityexec:` + UUID | cast tot resolved/cancelled |
| Combat event | `combatevent:` + UUID | immutable event |
| Spawn occurrence | `spawnocc:` + UUID | spawn tot definitieve cleanup |

Een respawn maakt een nieuw `actorId` en een nieuwe generation handle. `spawnOccurrenceId` verwijst naar de betreffende occurrence; `spawnPointId` en `spawnGroupRef` blijven stabiel.

### 5.2 Tick

```text
SIM_HZ = 20
TICK_MS = 50
SNAPSHOT_HZ = 10
SNAPSHOT_INTERVAL_TICKS = 2
AI_DEFAULT_HZ = 5
AI_DEFAULT_INTERVAL_TICKS = 4
```

De server gebruikt `performance.now()` uitsluitend om een accumulator te vullen. Per event-loopturn worden maximaal vier simticks ingehaald. Blijft de accumulator daarna groter dan `200 ms`, dan wordt `SIM_OVERRUN` gelogd en wordt achterstand weggegooid; gameplay versnelt niet onbeperkt.

### 5.3 Fixed-point types

```ts
type Mm = number;          // safe integer millimeter
type Milli = number;       // safe integer, 1000 = 1 displayed unit
type BasisPoints = number; // integer, 10000 = 100%
type Tick = number;        // safe integer, monotone per world instance
```

Alle waarden MOETEN `Number.isSafeInteger` zijn na parsing. Compiler en server weigeren overflow.

### 5.4 Exacte helpers

```ts
function divRoundHalfAwayFromZero(numerator, denominator) {
  // denominator > 0; BigInt intern
  const sign = numerator < 0n ? -1n : 1n;
  const abs = numerator < 0n ? -numerator : numerator;
  return sign * ((abs + denominator / 2n) / denominator);
}

function mulBps(valueMilli, bps) {
  return Number(divRoundHalfAwayFromZero(
    BigInt(valueMilli) * BigInt(bps), 10000n
  ));
}
```

Iedere vermenigvuldiging die twee authored of runtimegetallen combineert gebruikt tijdelijk `BigInt`. Pas na division, rangecheck en veilige-integercheck wordt naar `number` geconverteerd.

### 5.5 Afstanden

Squared distance gebruikt `BigInt` bij servervalidatie:

```text
dx = axMm - bxMm
dy = ayMm - byMm
dz = azMm - bzMm
distanceSq = dx*dx + dy*dy + dz*dz
within = distanceSq <= rangeMm*rangeMm
```

AI op vlak terrein mag XZ-afstand gebruiken; ability- en hitvalidatie gebruikt de in de ability vastgelegde `distanceMode`.

---

## 6. Canonical documents

Alle voorbeelden tonen payloads. Fase-1 documentenvelop, IDs, revisions, timestamps, refs, validation en hashing blijven van toepassing.

### 6.1 `stat_definition` versie 1

```json
{
  "displayName": "Health",
  "semantic": "health_current",
  "valueKind": "resource",
  "minimumMilli": 0,
  "maximumMilli": 1000000000000,
  "defaultMilli": 100000,
  "replication": "nearby",
  "persistence": "character",
  "uiFormat": "integer"
}
```

Enums:

- `semantic`: `health_current|health_max|resource_current|resource_max|attack_power|spell_power|armor|resistance|move_speed|crit_chance|crit_multiplier|custom`.
- `valueKind`: `scalar|resource|basis_points`.
- `replication`: `owner|nearby|all|none`.
- `persistence`: `none|character|account`.
- `uiFormat`: `integer|decimal_1|percent_1|duration_seconds`.

Een build heeft exact een `health_current` en een `health_max`. Custom semantics zijn toegestaan, maar engineformules verwijzen naar runtimeKey, nooit naar displayName.

### 6.2 `stat_block` versie 1

```json
{
  "displayName": "Raider level 1",
  "entries": [
    {"entryId":"entry:...","statRef":"doc:...","baseMilli":100000}
  ]
}
```

- Een `statRef` komt maximaal eenmaal voor.
- Ontbrekende stat gebruikt `stat_definition.defaultMilli`.
- Er is geen `overrideMode`; mergevolgorde wordt in sectie 9 exact bepaald.

### 6.3 `faction_definition` versie 1

```json
{
  "displayName": "Desert Raiders",
  "defaultTowardPlayer": "hostile",
  "relations": [
    {"entryId":"entry:...","otherFactionRef":"doc:...","relation":"hostile"}
  ]
}
```

`relation = hostile|neutral|friendly`. De compiler materialiseert een volledige matrix. A->B en B->A mogen verschillen. Ontbrekend paar is `neutral`; self is altijd `friendly`.

### 6.4 `skeleton_profile` versie 1

```json
{
  "displayName": "Humanoid A",
  "modelAssetId": "asset:...",
  "rootBone": "Armature/Hips",
  "sockets": [
    {
      "entryId":"entry:...",
      "socketKey":"hand_right",
      "bonePath":"Armature/Hips/Spine/RightArm/RightHand",
      "positionMm":{"x":0,"y":0,"z":0},
      "rotationMilliDeg":{"x":0,"y":0,"z":0},
      "scaleMilli":{"x":1000,"y":1000,"z":1000}
    }
  ],
  "hurtboxes": [
    {
      "entryId":"entry:...",
      "hurtboxKey":"body",
      "shape":"capsule",
      "bonePath":"Armature/Hips",
      "offsetMm":{"x":0,"y":900,"z":0},
      "radiusMm":450,
      "halfHeightMm":450,
      "damageMultiplierBps":10000
    }
  ]
}
```

- `socketKey` is uniek en matcht `^[a-z][a-z0-9_]{0,63}$`.
- `bonePath` moet exact in de geïmporteerde GLB bestaan.
- Shape is `sphere|capsule|box`; shape-specifieke velden zijn verplicht.
- Minimaal één hurtbox is verplicht voor combatants.
- Importer normaliseert geen botnamen op basis van gokwerk.

### 6.5 `animation_set` versie 1

```json
{
  "displayName":"Humanoid combat",
  "modelAssetId":"asset:...",
  "skeletonProfileRef":"doc:...",
  "defaultFadeMs":150,
  "clips":[
    {
      "entryId":"entry:...",
      "role":"locomotion.idle",
      "clipName":"Idle",
      "loop":"repeat",
      "playbackRateMilli":1000,
      "rootMotion":"none",
      "markers":[]
    },
    {
      "entryId":"entry:...",
      "role":"ability.basic_attack",
      "clipName":"Sword_Slash",
      "loop":"once",
      "playbackRateMilli":1000,
      "rootMotion":"extract_xz_yaw",
      "markers":[
        {"entryId":"entry:...","markerKey":"commit","timeMs":220},
        {"entryId":"entry:...","markerKey":"hit_start","timeMs":260},
        {"entryId":"entry:...","markerKey":"hit_end","timeMs":410}
      ]
    }
  ],
  "locomotionBlend": {
    "idleRole":"locomotion.idle",
    "walkRole":"locomotion.walk",
    "runRole":"locomotion.run",
    "walkFullSpeedMmPerSec":1800,
    "runFullSpeedMmPerSec":6000
  }
}
```

Regels:

- Rollen zijn uniek.
- Verplichte rollen voor bewegende actors: `locomotion.idle`, `locomotion.walk`, `locomotion.run`, `reaction.hit`, `lifecycle.death`.
- Iedere gebruikte ability verwijst naar een bestaande `ability.<animationRole>`.
- Marker times liggen in `[0, clipDurationMs]` en zijn strikt oplopend per clip.
- `commit`, `hit_start`, `hit_end`, `projectile_spawn`, `audio:*` en `vfx:*` zijn gereserveerde markerfamilies.
- Gameplaymarkers worden door de compiler in ticks gekwantiseerd met `ceil(timeMs / 50)`; clientmarkerevents zijn cosmetisch.
- Root-motioncurves worden bij compile uit de rootbone gesampled op 60 Hz, naar millimeters/milligraden gekwantiseerd en in runtime metadata opgeslagen.

### 6.6 `damage_type_definition` versie 1

```json
{
  "displayName":"Physical",
  "mitigation":"armor",
  "resistanceStatRef":null,
  "impactAudioRef":"doc:...",
  "impactVfxRef":"doc:..."
}
```

`mitigation = none|armor|resistance`. `resistance` vereist een statref met semantic `resistance` of `custom`.

### 6.7 `status_effect_definition` versie 1

```json
{
  "displayName":"Burning",
  "durationTicks":100,
  "tickIntervalTicks":20,
  "maxStacks":3,
  "stackPolicy":"add_stack_refresh",
  "dispelCategory":"magic",
  "modifiers":[
    {"entryId":"entry:...","statRef":"doc:...","operation":"add_bps","value":-1000}
  ],
  "periodic":{"kind":"damage","amountMilli":5000,"damageTypeRef":"doc:..."},
  "applyAudioRef":null,
  "applyVfxRef":"doc:...",
  "loopVfxRef":null
}
```

Enums:

- `stackPolicy`: `refresh|add_stack_refresh|add_duration|replace_stronger|independent`.
- `operation`: `add_milli|add_bps|multiply_bps|override_milli`.
- `dispelCategory`: `none|physical|magic|curse|poison`.

`independent` maakt per bron/execution een effectinstance, maximaal `maxStacks`. `replace_stronger` vergelijkt de absolute som van statmodifiers; gelijkstand wint de nieuwste applicationTick.

### 6.8 `ability_definition` versie 1

```json
{
  "displayName":"Sword Slash",
  "abilityKind":"melee",
  "targetMode":"hostile_actor",
  "distanceMode":"xz",
  "rangeMm":2500,
  "minimumRangeMm":0,
  "castTicks":0,
  "recoveryTicks":10,
  "cooldownTicks":15,
  "globalCooldownTicks":10,
  "resourceCost":{"statRef":"doc:...","amountMilli":0},
  "requiresLineOfSight":true,
  "requiredWeaponTags":{"all":["weapon.sword"],"any":[],"none":[]},
  "animationRole":"basic_attack",
  "execution":"melee_sweep",
  "hitShape":{
    "shape":"capsule",
    "socketKey":"hand_right",
    "radiusMm":250,
    "lengthMm":1100
  },
  "damage":{
    "baseMilli":10000,
    "powerStatRef":"doc:...",
    "powerCoefficientBps":7500,
    "damageTypeRef":"doc:...",
    "canCrit":true
  },
  "statusApplications":[],
  "castAudioRef":"doc:...",
  "impactAudioRef":"doc:...",
  "castVfxRef":"doc:...",
  "impactVfxRef":"doc:...",
  "multiHit":{"enabled":false,"perTargetIntervalTicks":0,"maxHitsPerTarget":1}
}
```

Enums:

- `abilityKind`: `melee|projectile|area|heal|buff|debuff|movement|passive|interact`.
- `targetMode`: `self|hostile_actor|friendly_actor|any_actor|ground_point|direction`.
- `execution`: `instant|melee_sweep|projectile|ground_area|self_area|movement_curve`.
- `distanceMode`: `xz|xyz`.

`projectile` vereist een getypeerd projectileblock met speed, radius, maxLifetimeTicks en collisionmask. `ground_area` en `self_area` vereisen een circle/capsule/box-volume. Vrije formula-AST's uit legacy worden niet uitgevoerd; de importer vertaalt alleen bewezen `constant`, `stat * coefficient` en `add`-vormen. Andere formules blokkeren import met `LEGACY_FORMULA_UNSUPPORTED`.

### 6.9 `combat_profile` versie 1

```json
{
  "displayName":"Raider melee",
  "basicAttackRef":"doc:...",
  "abilities":[
    {"entryId":"entry:...","abilityRef":"doc:...","priority":100,"weight":100,"minHealthBps":0,"maxHealthBps":10000}
  ],
  "preferredRangeMm":1800,
  "targetPriority":"highest_threat",
  "autoAttack":true
}
```

`targetPriority = highest_threat|nearest|lowest_health`. Random targetselectie is niet toegestaan in versie 1; weighted abilityselectie gebruikt server-RNG en daarna canonical ID als tie-break.

### 6.10 `equipment_slot_definition` versie 1

```json
{
  "displayName":"Main hand",
  "slotKey":"main_hand",
  "allowedItemTags":{"all":["equipment"],"any":["weapon"],"none":[]},
  "conflictingSlotRefs":[],
  "socketKey":"hand_right",
  "uiOrder":10
}
```

`slotKey` is uniek per build. Conflicten moeten symmetrisch zijn; de compiler materialiseert de inverse en meldt een warning wanneer slechts één kant is authored.

### 6.11 `item_definition` versie 2: equipmentuitbreiding

```json
{
  "displayName":"Iron Sword",
  "tags":["equipment","weapon","weapon.sword"],
  "stackLimit":1,
  "equipment":{
    "allowedSlotRefs":["doc:..."],
    "requiredLevel":1,
    "visualAssetId":"asset:...",
    "visualTransform":{
      "positionMm":{"x":0,"y":0,"z":0},
      "rotationMilliDeg":{"x":0,"y":0,"z":0},
      "scaleMilli":{"x":1000,"y":1000,"z":1000}
    },
    "statModifiers":[
      {"entryId":"entry:...","statRef":"doc:...","operation":"add_milli","value":12000}
    ],
    "grantedAbilityRefs":[],
    "durabilityMax":100000
  }
}
```

Niet-equippable items hebben `equipment:null`. Een iteminstance bewaart durability als integer milli. Fase 3 verlaagt durability nog niet automatisch; reparatie/economieregels blijven een latere consumer.

### 6.12 `equipment_loadout` versie 1

```json
{
  "displayName":"Starter fighter",
  "entries":[
    {"entryId":"entry:...","slotRef":"doc:...","itemRef":"doc:..."}
  ],
  "hotbarAbilityRefs":["doc:..."]
}
```

Dit is een starttemplate. Playerinstances verwijzen na creatie naar echte iteminstance-IDs in persistent state.

### 6.13 `nav_agent_profile` versie 1

```json
{
  "displayName":"Humanoid",
  "radiusMm":400,
  "heightMm":1800,
  "maxClimbMm":450,
  "maxSlopeMilliDeg":45000,
  "maxSpeedMmPerSec":6000,
  "accelerationMmPerSec2":18000,
  "turnRateMilliDegPerSec":540000,
  "stoppingDistanceMm":150,
  "avoidanceQuality":"medium"
}
```

Compilelimieten: radius 100..3000, height 300..10000, climb 0..2000, slope 0..60000, speed 100..30000. Fase 3 ondersteunt maximaal vier unieke `(radius,height,maxClimb,maxSlope)` bakeklassen per build.

### 6.14 `ai_profile` versie 1

```json
{
  "displayName":"Aggressive melee",
  "idleMode":"patrol",
  "sightRangeMm":20000,
  "hearingRangeMm":10000,
  "aggroRangeMm":12000,
  "assistRangeMm":8000,
  "leashDistanceMm":30000,
  "lostTargetTicks":100,
  "thinkIntervalTicks":4,
  "pathReplanTicks":10,
  "returnHealBpsPerSecond":1000,
  "callForHelp":true,
  "callForHelpCooldownTicks":100,
  "sleepOutsideInterest":true,
  "stuckTicks":60,
  "fleeHealthBps":0
}
```

Ranges zijn compilergeclamped tot wereld-/performancegrenzen; authored waarden worden nooit stil aangepast. Een out-of-range waarde is een publisherror.

### 6.15 `patrol_path` versie 1

```json
{
  "displayName":"Village guard route",
  "regionRef":"doc:...",
  "mode":"loop",
  "points":[
    {"entryId":"entry:...","positionMm":{"x":0,"y":0,"z":0},"waitTicks":20}
  ],
  "randomStart":false
}
```

`mode = loop|ping_pong|one_way`. Minimaal twee punten. Iedere positie moet op een navpoly liggen binnen `agentRadiusMm * 2` van de nearest-poly query.

### 6.16 `actor_archetype` versie 1

```json
{
  "displayName":"Sand Raider",
  "actorKind":"enemy",
  "modelAssetId":"asset:...",
  "skeletonProfileRef":"doc:...",
  "animationSetRef":"doc:...",
  "statBlockRef":"doc:...",
  "combatProfileRef":"doc:...",
  "aiProfileRef":"doc:...",
  "navAgentProfileRef":"doc:...",
  "factionRef":"doc:...",
  "lootTableRef":"doc:...",
  "defaultLoadoutRef":null,
  "interactionProfile":"hostile",
  "level":1,
  "scaleMilli":1000,
  "nameplate":"nearby",
  "corpseTicks":300,
  "audio":{
    "spawn":null,"idle":null,"aggro":null,"attack":null,
    "hit":null,"death":null,"footstep":null
  }
}
```

`actorKind = player|npc|enemy|wildlife`. Vereisten:

- player: animation, stats, nav agent, faction, combat optioneel;
- npc: animation, stats, nav agent, faction; AI optioneel voor stilstaan;
- enemy: animation, stats, nav agent, faction, combat en AI verplicht;
- wildlife: animation, stats, nav agent, faction en AI verplicht; combat optioneel.

Quest/dialogue/vendorrefs blijven components van `placed_entity` of latere domeindocumenten; zij worden niet in actor archetypes gemengd.

### 6.17 `actor_spawn` versie 1

```json
{
  "displayName":"Raider north camp",
  "regionRef":"doc:...",
  "actorArchetypeRef":"doc:...",
  "positionMm":{"x":0,"y":0,"z":0},
  "yawMilliDeg":0,
  "patrolPathRef":"doc:...",
  "respawn":{
    "mode":"delay",
    "delayTicks":600,
    "jitterTicks":100,
    "activationRadiusMm":128000,
    "despawnRadiusMm":192000
  }
}
```

Spawn jitter gebruikt de server-RNG. `despawnRadiusMm` moet minimaal activation + 32000 zijn. Een actor in combat despawnt niet door afstand; na 1200 ticks zonder playerinterest wordt hij gereset en vrijgegeven.

### 6.18 `spawn_group` versie 1

```json
{
  "displayName":"Raider camp",
  "regionRef":"doc:...",
  "shape":{"kind":"polygon","pointsMm":[{"x":0,"z":0},{"x":10000,"z":0},{"x":0,"z":10000}]},
  "entries":[
    {"entryId":"entry:...","actorArchetypeRef":"doc:...","weight":100,"minAlive":2,"maxAlive":5}
  ],
  "minimumSpacingMm":3000,
  "maxAliveTotal":5,
  "respawnDelayTicks":600,
  "respawnJitterTicks":100,
  "seed":12345
}
```

De compiler genereert geen vaste spawnpunten. De server kiest deterministisch kandidaatposities uit de group seed, occurrence sequence en valide navpoly. Maximaal 64 kandidaatpogingen per spawn; daarna `SPAWN_NO_VALID_POSITION` en backoff 200 ticks.

### 6.19 `placed_entity` versie 3 actorcomponent

```json
{
  "components":[
    {
      "componentId":"cmp:...",
      "kind":"actor",
      "actorArchetypeRef":"doc:...",
      "patrolPathRef":null,
      "respawn":null
    }
  ]
}
```

Een placed entity mag maximaal één actorcomponent hebben. Model/transform blijven eigendom van `placed_entity`; wanneer een actorcomponent aanwezig is, moet het placed model overeenkomen met het archetypemodel of leeg zijn en door compile worden afgeleid. Twee verschillende modelauthorities blokkeren publish.

### 6.20 `vfx_definition` versie 1

```json
{
  "displayName":"Sword impact",
  "kind":"sprite_emitter",
  "textureAssetId":"asset:...",
  "modelAssetId":null,
  "lifetimeMs":800,
  "loop":false,
  "attachment":"impact_point",
  "followTarget":false,
  "billboard":true,
  "spawnCount":12,
  "maxConcurrentPerSource":4,
  "priority":50,
  "qualityFallbackRef":null
}
```

`kind = sprite_emitter|mesh_effect|model_effect|screen_overlay`. Material- en emitterparameters gebruiken een gesloten, versioned schema. Arbitrary shadercode, URLs en JavaScript zijn verboden.

---

## 7. Runtimepackages en compile-output

### 7.1 Buildmanifestuitbreiding

```json
{
  "actorSchemaVersion":1,
  "combatSchemaVersion":1,
  "navigationSchemaVersion":1,
  "presentationSchemaVersion":1,
  "packages":{
    "actors":"packages/actors.json",
    "combat":"packages/combat.json",
    "presentation":"packages/actor-presentation.json",
    "navIndex":"navigation/index.json"
  }
}
```

### 7.2 Actorpackage

Definitions worden gesorteerd op `runtimeKey`. References worden naar compacte buildlokale integerindexes vertaald, maar provenance bewaart documentId/runtimeKey/revision. Runtime leest geen displaynamen voor beslissingen.

### 7.3 World Cell-fragmentuitbreiding

```json
{
  "actorSpawns":[...],
  "spawnGroups":[...],
  "actorPlacements":[...],
  "navTiles":[
    {"agentClass":0,"tileKey":"r1:12:8:0","hash":"sha256:...","url":"..."}
  ]
}
```

### 7.4 Determinisme

- Alle definitionarrays: runtimeKey ascending.
- Entries: authored order waar betekenisvol, anders entryId ascending zoals per schema aangegeven.
- Navtriangles: quantized vertices, vervolgens tile/poly canonical order.
- Geen buildtimestamp in gehashte payloads.
- Dezelfde documentsnapshot, assets en compilerversies leveren byte-identieke packages en hashes.

---

## 8. Actor registry en componentmodel

### 8.1 Keuze

GK gebruikt een data-oriented registry met vaste, getypeerde componentstores. Het gebruikt geen inheritancehiërarchie en geen onbeperkte user-defined ECS-components. Deze keuze houdt hot loops compact en maakt netwerk/persistence expliciet.

### 8.2 Verplichte stores

```ts
interface ActorCore {
  actorId: string;
  archetypeIndex: number;
  lifecycle: "spawning"|"alive"|"dying"|"corpse"|"despawned";
  spawnOccurrenceId: string;
  ownerPlayerId: string|null;
}

interface SpatialState {
  regionIndex: number;
  positionMm: {x:number;y:number;z:number};
  yawMilliDeg: number;
  velocityMmPerSec: {x:number;y:number;z:number};
  grounded: boolean;
  cellKey: string;
}

interface StatState {
  baseMilli: Int32Array|BigInt64Array;
  derivedMilli: Int32Array|BigInt64Array;
  currentMilli: Int32Array|BigInt64Array;
  dirtyMask: Uint32Array;
}
```

Andere vaste stores: `NavState`, `AiState`, `ThreatState`, `AbilityState`, `CooldownState`, `EffectState`, `EquipmentState`, `ReplicationState` en `PersistenceState`.

### 8.3 Capacity

- Initial authoritative capacity: 2048 actors per world instance.
- Hard limit: 8192 actors per process until a measured scale phase changes it.
- Dense slots grow only at world-instance creation or an explicitly monitored capacity change, never midden in een simtick.
- Exceeding hard limit rejects a spawn with `ACTOR_CAPACITY_EXCEEDED`; existing actors continue.

### 8.4 Tickorder

Iedere tick voert exact deze volgorde uit:

1. drain en valideer inputcommands;
2. update Cell/player-interest;
3. activate/deactivate spawn sources;
4. perception jobs binnen budget;
5. AI decisions binnen budget;
6. ability intents en cast transitions;
7. nav/path results toepassen;
8. movement integreren en collision oplossen;
9. gameplay animation markers uitvoeren;
10. projectile movement en hitqueries;
11. melee/area hitqueries;
12. damage/heal/status application;
13. periodic effects en cooldowns;
14. death/corpse/respawn transitions;
15. persistent mutation outbox vullen;
16. snapshots/events bouwen;
17. released actor/poolslots na iteratie vrijgeven.

Systemen mogen de actieve dense collection niet tijdens iteratie structurueel muteren; zij schrijven commands naar een end-of-stage queue.

---

## 9. Stats en derived values

### 9.1 Modifierbronnen en volgorde

Per stat:

1. archetype/stat-block base;
2. level/rank base wanneer later toegevoegd;
3. equipment `add_milli`, slotRef dan iteminstanceId ascending;
4. passive ability `add_milli`, ability runtimeKey ascending;
5. status `add_milli`, effect application sequence ascending;
6. som van alle `add_bps`;
7. alle `multiply_bps` afzonderlijk in dezelfde stabiele sourcevolgorde;
8. hoogste-priority `override_milli`; gelijkstand kleinste source runtimeKey;
9. clamp naar stat minimum/maximum.

```text
flat = base + sum(add_milli)
afterAdditivePercent = flat + mulBps(flat, sum(add_bps))
value = afterAdditivePercent
for multiplier in ordered multiply_bps:
    value = mulBps(value, 10000 + multiplier)
if override exists: value = override.value
derived = clamp(value, minimumMilli, maximumMilli)
```

Een `add_bps`-som wordt geclamped op `[-9000, 100000]`. Iedere `multiply_bps` ligt in `[-9000, 100000]`.

### 9.2 Current resources

Wanneer max HP/resource wijzigt:

- bij spawn/equip buiten combat: behoud percentage, afgerond half-away-from-zero;
- bij equip in combat: equip is standaard verboden;
- door tijdelijke effectwijziging: behoud absolute current en clamp omlaag indien nodig;
- bij verwijderen effect: current stijgt niet automatisch.

### 9.3 Dirty propagation

Definitions leveren een acyclische dependencygraph. Versie 1 ondersteunt alleen directe modifiers en geen stat-uit-stat-formules; daardoor kan een wijziging precies de betrokken stat dirty maken. Cycles zijn compile-time onmogelijk.

---

## 10. Combatmath

### 10.1 Ability requestvalidatie

Een `UseAbility` slaagt alleen als, in deze volgorde:

1. sessie en actorownership kloppen;
2. actor `alive` is;
3. ability door actor/equipment is granted;
4. sequence nieuw en request niet dubbel is;
5. global/ability cooldown klaar is;
6. actor niet door een blocking cast/control effect bezet is;
7. weapon tag query klopt;
8. targettype/faction geldig is;
9. target leeft en in dezelfde world instance/build zit;
10. range klopt tegen serverpose-history;
11. line-of-sight klopt indien vereist;
12. resource voldoende is;
13. nav/groundtarget geldig is.

Pas daarna worden cost en cooldown gereserveerd. Een interrupt voor de `commit`-marker geeft resource terug en start geen abilitycooldown; global cooldown blijft staan. Na commit wordt niets teruggegeven.

### 10.2 Damagevolgorde

Voor één hit:

```text
scaledPower = mulBps(attackerPowerMilli, powerCoefficientBps)
raw = max(0, baseMilli + scaledPower)

if mitigation == armor:
  effectiveArmor = max(0, targetArmorMilli - armorPenetrationMilli)
  mitigated = divRoundHalfAwayFromZero(raw * 100000, 100000 + effectiveArmor)
else if mitigation == resistance:
  resistanceBps = clamp(targetResistanceBps - penetrationBps, -5000, 7500)
  mitigated = raw - mulBps(raw, resistanceBps)
else:
  mitigated = raw

if critical:
  critted = mulBps(mitigated, max(10000, attackerCritMultiplierBps))
else:
  critted = mitigated

afterDoneModifiers = apply ordered source damage-done multipliers
afterTakenModifiers = apply ordered target damage-taken multipliers
finalDamageMilli = clamp(afterTakenModifiers, 0, 1000000000000)
if raw > 0 and finalDamageMilli == 0 and target is not immune:
  finalDamageMilli = 1000
```

Armorconstante is exact `100000 milli` = 100 displayed armor. Daardoor geeft 100 armor 50% reductie en 300 armor 75% reductie. De formule is monotoon en asymptotisch; negatieve armor is in versie 1 verboden.

### 10.3 Crit

```text
critChanceBps = clamp(attackerCritChanceBps - targetCritAvoidanceBps, 0, 10000)
critical = rngBps < critChanceBps
```

Default crit multiplier is 15000 bps. Healing crits zijn alleen mogelijk als `canCrit` op de heal staat.

### 10.4 Server-RNG

Combat gebruikt een processsecret dat niet in builds of clients staat:

```text
digest = HMAC-SHA256(secret,
  worldInstanceId | actorId | abilityExecutionId | eventSequence | purpose)
uint = first 32 bits big-endian
rngBps = uint mod 10000
```

`purpose` is bijvoorbeeld `crit`, `status:<runtimeKey>`, `loot:<entryId>` of `spawn:jitter`. Replaylogs bewaren de getrokken uitkomst, niet het secret.

### 10.5 Heal

Heal gebruikt base + coefficient zoals raw damage, daarna heal-done en heal-taken modifiers. Resultaat clamped current HP op max HP. Overheal wijzigt geen state, maar mag als metric worden gelogd.

### 10.6 Threat

```text
damage threat = finalDamageMilli
healing threat = effectiveHealMilli / 2 voor hostile actors binnen 20000 mm
explicit taunt = currentHighestThreat + 1000
```

Threat entries onder 1000 milli worden na 200 ticks zonder toevoeging verwijderd. Maximaal 32 targets per AI-actor; bij overflow valt de laagste threat weg, gelijkstand grootste actorId.

### 10.7 Death

Wanneer HP van >0 naar 0 gaat:

1. emit één `actor.death_started`;
2. lifecycle `dying` en input/AI blokkeren;
3. casts/projectiles volgens abilitypolicy cancelen;
4. loot server-side exact eenmaal genereren;
5. death presentationevent sturen;
6. na deathclip of uiterlijk 100 ticks naar `corpse`;
7. na corpseTicks render/hit/collision verwijderen;
8. spawn occurrence afsluiten en respawn plannen.

Een atomic compare-and-set op lifecycle voorkomt dubbele death/loot.

---

## 11. Hitboxes, hurtboxes en projectiles

### 11.1 Broadphase

Actors zijn per Fase-2-Cell plus aangrenzende Cells geïndexeerd. Een query verzamelt kandidaten uit Cells die de swept AABB kruisen, dedupliceert op actorId en sorteert actorId ascending.

### 11.2 Serverpose

De server gebruikt skeleton-onafhankelijke baked socketcurves uit de animation metadata. Voor tick `t`:

```text
worldSocketTransform = actorWorldTransform * sampledBakedSocketTransform(t)
```

Hurtboxes volgen baked bone proxies. De server laadt geen Three.js skeletons.

### 11.3 Swept collision

- Sphere/capsule movement gebruikt segment-sweeps van vorige naar huidige tick.
- Box volumes gebruiken oriented-box versus capsule/sphere tests.
- Een hit vereist broadphase overlap en exacte narrowphase overlap.
- Contactpunt is de closest point tussen primitives; normal is genormaliseerde target-naar-source vector, met `(0,1,0)` fallback bij nulafstand.
- Multi-hit registry key is `(abilityExecutionId,targetActorId)`.

### 11.4 Projectile

Projectiles zijn serverentiteiten zonder actorarchetype:

```ts
interface ProjectileState {
  projectileId: string;
  sourceActorId: string;
  abilityExecutionId: string;
  positionMm: Vec3i;
  velocityMmPerSec: Vec3i;
  radiusMm: number;
  expiresAtTick: number;
  pierceRemaining: number;
}
```

Integratie gebruikt semi-implicit Euler op fixed tick, integer remainder per as om drift te voorkomen. Maximaal 256 active projectiles per world instance; overflow weigert de ability voor commit met `PROJECTILE_CAPACITY_EXCEEDED`.

### 11.5 Lag compensation

- Server bewaart 8 snapshots = 400 ms pose-history voor player actors.
- Rewind is alleen voor player-initiated ranged/melee hitvalidation.
- Rewindtijd = `currentServerTime - min(measuredRtt/2, 200 ms)`.
- Clienttimestamps kunnen de cap of measured RTT niet vergroten.
- AI en environment hits gebruiken current serverpose.
- Resultaat wordt altijd op huidige state toegepast; een reeds dode/ongeldige target wordt niet heropend.

---

## 12. Ability- en actorstate machines

### 12.1 Ability execution

```text
requested -> validating -> casting -> committed -> active -> recovery -> completed
                          \-> cancelled
```

| State | Entry | Exit |
| --- | --- | --- |
| `validating` | checks sectie 10.1 | reject of reserve |
| `casting` | cast timer, cast event | commit tick of interrupt |
| `committed` | cost definitief, cooldown start | dezelfde tick naar active |
| `active` | hit/projectile/area windows | laatste execution marker |
| `recovery` | movement/ability locks volgens definitie | recoveryTicks verstreken |
| `completed` | cleanup execution registry | terminal |
| `cancelled` | rollback alleen vóór commit | terminal |

### 12.2 Actor lifecycle

```text
allocated -> spawning -> alive -> dying -> corpse -> despawned -> released
```

Geen overgang mag worden overgeslagen behalve `spawning -> despawned` bij asset/nav failure vóór zichtbaarheid. `released` is geen gameplaystate maar registrycleanup.

### 12.3 Control priority

Van hoog naar laag:

1. dead/despawn;
2. cinematic lock (toekomstig; nu nooit gezet);
3. stun;
4. knockback/movement ability;
5. cast lock;
6. AI/player locomotion;
7. idle.

Een lagere priority mag geen hogere overschrijven.

---

## 13. Animation Controller

### 13.1 Scheiding authority/presentatie

De server stuurt `movementMode`, `speed`, `facing`, `abilityExecution`, marker sequence, hit reaction en lifecycle. De client kiest de exacte Three.js action en blend. Client-animation completion bepaalt nooit serverstate.

### 13.2 Three.js ownership

- Een zichtbaar skinned actor heeft exact één `AnimationMixer` per renderroot.
- `clipAction` wordt per clip/root gecached.
- Bij release: listeners verwijderen, actions stoppen, `stopAllAction()`, daarna `uncacheRoot(root)`.
- Shared clips/geometries/materials worden via reference-counted asset cache beheerd; een actorpoolslot dispose't gedeelde assets niet.

### 13.3 Layers

| Layer | Mask | Rollen | Priority |
| --- | --- | --- | --- |
| Base | volledig skeleton | spawn, locomotion, death | 0/100 |
| Action | upper body indien mask bestaat, anders full body | abilities, interact, gather | 50 |
| Reaction | full body of authored reactionmask | hit, stun | 80 |
| Death | full body | death | 100 |

Een build zonder valide upper-bodymask gebruikt full-body action; dit is zichtbare compilewarning, geen stille botgok.

### 13.4 Locomotion 1D blend

```text
s = horizontalSpeedMmPerSec
walkWeight = clamp(s / walkFullSpeed, 0, 1) voor s <= walkFullSpeed
runWeight = clamp((s - walkFullSpeed) /
                  (runFullSpeed - walkFullSpeed), 0, 1)

idleWeight = 1 - clamp(s / 150, 0, 1)
```

Voor `s > 150`: normaliseer walk/run naar som 1. Actions lopen met timeScale:

```text
walkTimeScale = clamp(s / walkFullSpeed, 0.5, 1.5)
runTimeScale  = clamp(s / runFullSpeed, 0.5, 1.5)
```

Geen viewportafhankelijke thresholds.

### 13.5 Transitions

- Default fade uit animation set, 0..1000 ms.
- Death: 100 ms, niet interruptible.
- Hit reaction: 80 ms in, 120 ms uit.
- Ability: authored override of default; `LoopOnce`, `clampWhenFinished=true` tijdens recovery.
- Crossfade gebruikt `warp=false`, behalve locomotion walk/run waar `warp=true` is toegestaan.
- Iedere transition reset de doelactiontime alleen bij nieuwe execution sequence.

### 13.6 Root motion

- Compiler extract XZ en yaw; Y blijft door server ground/nav bepaald.
- Server evalueert de baked cumulative curve per tick en valideert displacement tegen ability max.
- Client verwijdert root XZ/yaw uit skeletonclip en volgt de gerepliceerde actorroot.
- Een clip met onverwachte rootmotion terwijl `rootMotion:none` blokkeert publish als displacement > 20 mm of yaw > 1000 millideg.

### 13.7 Markerreconciliatie

Gameplaymarkers komen van serverevents. Een client mag `audio`/`vfx` cosmetisch lokaal voorspellen met key `(abilityExecutionId,markerKey)`. Bij serverevent wordt dezelfde key gededupliceerd. Bij reject wordt een loopend voorspeld effect binnen 100 ms uitgefaded.

### 13.8 Missing presentation

Een actor met ontbrekende optional hit/audio/VFX blijft speelbaar. Ontbrekende verplichte locomotion/death/abilityclip blokkeert publish. Runtime toont nooit T-pose als geaccepteerde fallback.

---

## 14. Navigation en navmesh

### 14.1 Librarybesluit

Gebruik exact versie `0.35.0` voor `@recast-navigation/core`, `@recast-navigation/generators`, `@recast-navigation/wasm` en waar nuttig `@recast-navigation/three`. Geen caret-/tilderanges en geen CDN-imports. De WASM-buildhash staat in compilerprovenance. De bestaande presentatie- en netwerkdependencies blijven exact de huidige lockfileversies `three@0.184.0` en `ws@8.22.0` totdat een expliciete, geteste dependency-upgrade ze wijzigt.

### 14.2 Input

Navmesh wordt gebakken uit:

- Fase-2 `surface_patch` met `walkable=true`;
- statische colliders van placed entities;
- Regionbounds en Cellgrenzen;
- per agentklasse radius/height/climb/slope.

Dynamic actors en tijdelijke VFX zijn geen bakeinput. Deuren/obstacles worden versie 1 als Detour-obstacle of getypeerde tijdelijke blocked volumes toegevoegd; als tile-cache support niet betrouwbaar is, forceert de implementatie een server-side traversal gate en plant opnieuw.

### 14.3 Tileconfig

Een navtile correspondeert met één Fase-2-Cell van 64 m plus border:

```text
cellSize = 0.20 m
cellHeight = 0.10 m
tileWorldSize = 64.00 m
border = agentRadius + 0.40 m
regionPartition = watershed
edgeMaxLen = 12.0 m
edgeMaxError = 1.3 voxels
vertsPerPoly = 6
detailSampleDist = 1.2 m
detailSampleMaxError = 0.20 m
```

Agentwaarden worden in meters aan Recast geleverd na exacte mm/1000-conversie. Uitvoervertices worden terug naar mm half-away-from-zero gekwantiseerd.

### 14.4 Tile seam gate

Voor iedere aangrenzende tilepair controleert compile:

- borderpolygons overlappen binnen 20 mm quantizationtolerantie;
- iedere portalverbinding heeft wederzijdse neighbourref;
- isolated walkable islands kleiner dan 1 m² worden als warning gerapporteerd;
- authored spawn/patrolpunten zijn bereikbaar vanaf minimaal één Region spawn point.

Seam mismatch of onbereikbare vereiste actorplacement blokkeert publish.

### 14.5 Runtime tile states

```text
absent -> fetching -> decoded -> registered -> active
   ^          |           |          |
   +----------+-----------+----------+-> evicting -> absent
```

Een pathquery mag alleen active tiles gebruiken. Required actor Cells houden hun tile pin vast. Tile eviction gebeurt pas als geen actorpath, spawnquery of playerinterest hem gebruikt.

### 14.6 Pathquery

```ts
interface PathRequest {
  requestId: string;
  actorId: string;
  agentClass: number;
  startMm: Vec3i;
  goalMm: Vec3i;
  maxPathLengthMm: number;
  issuedTick: number;
  navRevision: number;
}
```

- Maximaal 32 nieuwe pathqueries per tick per world instance.
- Maximaal 256 pending.
- Prioriteit: player movement abilities, combat chase, return, patrol/wander.
- Gelijke priority: issuedTick, daarna actorId.
- Resultaat ouder dan actor's laatste request of andere navRevision wordt weggegooid.
- Maximaal 256 polygons en 64 straight-path corners.

### 14.7 Movement

Desired velocity wordt naar acceleration en max speed begrensd. Per tick:

```text
maxDeltaV = accelerationMmPerSec2 / 20 met remainderaccumulator
velocity = moveToward(velocity, desiredVelocity, maxDeltaV)
deltaPosition = velocity / 20 met remainderaccumulator per as
```

De navquery clamped de nieuwe positie op de corridor. Bij `stuckTicks`: één replan; tweede failure binnen 200 ticks -> return-home; derde -> gecontroleerd despawn/respawn voor NPC/enemy, nooit voor players.

### 14.8 Crowd avoidance

Detour crowd/avoidance mag lokale desired velocity beïnvloeden, maar server clamped snelheid en positie. Maximaal 256 high-quality crowd agents; daarboven medium/low volgens distance-to-nearest-player. Dit verandert alleen movement smoothness, niet combatregels.

---

## 15. AI

### 15.1 Geen generieke behavior tree

Versie 1 gebruikt een hiërarchische, code-owned state machine met data-owned thresholds. Dit voorkomt evalbare content en maakt gedrag testbaar.

### 15.2 State machine

```text
DORMANT
  -> SPAWNING
  -> IDLE <-> PATROL/WANDER
  -> INVESTIGATE
  -> COMBAT_ACQUIRE
  -> COMBAT_CHASE <-> COMBAT_ATTACK
  -> FLEE
  -> RETURN_HOME
  -> DEAD
```

### 15.3 Overgangen

| Van | Naar | Voorwaarde |
| --- | --- | --- |
| DORMANT | SPAWNING | playerinterest en spawncap |
| SPAWNING | IDLE | actor alive/nav ready |
| IDLE | PATROL/WANDER | idleMode en wait verstreken |
| noncombat | INVESTIGATE | gehoord event, geen zichttarget |
| noncombat | COMBAT_ACQUIRE | hostile target binnen aggro, LOS |
| ACQUIRE | CHASE | target buiten preferred range |
| ACQUIRE/CHASE | ATTACK | ability geldig en range/LOS |
| ATTACK | CHASE | target buiten range of ability klaar |
| combat | FLEE | HP bps <= fleeHealthBps |
| combat | RETURN_HOME | leash overschreden of target timeout |
| RETURN_HOME | IDLE | binnen stopping distance home |
| any alive | DEAD | lifecycle dying/dead |

### 15.4 Perception

- Broadphase: actors binnen sight/hearing Cells.
- Sight: XZ range, vertical difference <= 10 m, faction hostile, 120 graden horizontal FOV, server LOS ray tegen static collision.
- Aggro: `min(sightRange,aggroRange)` tenzij ontvangen damage.
- Hearingevents hebben origin, radius, faction en expiryTick; max 256 actieve events.
- Perception update default 5 Hz; actors binnen 20 m van player mogen 10 Hz, buiten 80 m 2 Hz.
- Max 128 LOS rays per tick; deferred actors behouden vorige perception tot maximaal 10 ticks.

### 15.5 Targetselectie

1. verwijder dead/invalid/out-of-leash targets;
2. hoogste threat wanneer profile dat vraagt;
3. anders profilemetric;
4. gelijkstand kleinste actorId.

Random targetselectie zonder server-RNG/context is verboden.

### 15.6 Abilityselectie

Filter op cooldown, resource, health band, range, LOS en target. Kies daarna:

- priority: hoogste integer, gelijkstand ability runtimeKey;
- weighted: HMAC-RNG over som positieve weights, stabiele runtimeKeyvolgorde;
- sequential: opgeslagen cursor over runtimeKey-gesorteerde entries.

### 15.7 Assist en call for help

Een call bevat source, target, faction, position en expiry `tick+20`. Alleen friendly AI binnen assistRange, niet in return/dead en binnen eigen leash accepteert. Call mag niet recursief nieuwe calls genereren.

### 15.8 Wildlife

Wildlife met hostile threat kan vluchten: kies op navmesh maximaal acht kandidaten op een ring van 12 m, score `distanceFromThreat - pathCost*0.25`; hoogste score, gelijkstand lexicografische quantized position. Geen valide punt -> return/home/idle volgens profile.

### 15.9 Sleep

Zonder playerinterest:

- noncombat AI gaat `DORMANT` en krijgt geen think/pathupdates;
- timers blijven tickgebaseerd via absolute expiryTicks;
- actors in combat blijven maximaal 1200 ticks actief, daarna reset;
- persistent NPC placements blijven logisch bestaan maar render/AI proxy kan slapen.

---

## 16. Equipment

### 16.1 Persistence en authority

De bestaande player inventory/equipmenttabellen blijven bron van playerinstancebezit. Canonical item/slotdefinitions komen uit het pinned build. Iedere equipmutatie draait in één SQLite `BEGIN IMMEDIATE` transaction met idempotencyrecord.

### 16.2 Equip command

```json
{
  "type":"EquipItem",
  "requestId":"uuid",
  "playerActorId":"actor:...",
  "itemInstanceId":"...",
  "slotRef":"equipment-slot-runtime-key",
  "expectedEquipmentRevision":12
}
```

Validatie:

1. actor en inventory behoren bij sessieplayer;
2. niet in Preview behalve sandboxrepository;
3. actor alive en niet in combat/cast;
4. iteminstance bestaat, inventorylocation en niet locked;
5. builddefinition bestaat;
6. slot allowed, tags en levelrequirements kloppen;
7. conflicts worden bepaald;
8. inventory heeft ruimte voor items die unequipped worden;
9. expected revision klopt;
10. transaction schrijft alle locations, slots en revision;
11. outbox event wordt in dezelfde transaction geschreven.

### 16.3 Weapon swap

Een player mag twee authored weapon sets hebben wanneer equipment rules dat later toestaan. Fase-3-default:

```text
swapDurationTicks = 12 (600 ms)
commitTickOffset = 6
```

Voor commit kan stun/death annuleren. Na commit zijn slots omgewisseld; animation kan nog recovery tonen. Swap tijdens ability/recovery of binnen 20 ticks na damage is verboden. De server stuurt het nieuwe equipmentrevisionevent.

### 16.4 Derived rebuild

Na equip:

1. rebuild equipment modifiers in stabiele slot/itemvolgorde;
2. mark affected stats dirty;
3. recalc derived;
4. clamp resources volgens sectie 9.2;
5. rebuild granted abilityset;
6. cancel een niet langer granted cast vóór volgende tick;
7. stuur equipment snapshot en actor stat delta.

### 16.5 Visual attachment

- Socket komt uit equipment slot/skeleton profile.
- Clone van equipment visual gebruikt pool/cache.
- Transform komt uitsluitend uit itemdefinition.
- Ontbrekende socket/model blokkeert publish voor default loadout en geeft runtime `EQUIPMENT_VISUAL_MISSING` voor oude persistence; gameplay blijft dan equip correct maar toont een expliciete missing-asset marker in development, niet in production.

---

## 17. Networking en toekomstige server-authority

### 17.1 Transport

Gebruik de bestaande HTTP/S-server en één `ws` WebSocketServer via upgrade routing. Geen tweede poort. Server-side `perMessageDeflate=false` totdat representatieve loadtests de memorykosten aantoonbaar accepteren.

Subprotocol:

```text
gk-world-v1
```

### 17.2 Envelope

```ts
interface WireEnvelope<T> {
  protocolVersion: 1;
  type: string;
  sequence: number;
  ack: number;
  worldInstanceId: string;
  buildId: string;
  serverTick: number|null;
  payload: T;
}
```

JSON is versie-1 transport. Max frame 64 KiB client->server en 256 KiB server->client. Een grotere of ongeldige frame sluit met policy error na structured diagnostic.

### 17.3 Clientcommands

Toegestaan:

- `input.move` met normalized axes, facing intent en client sequence;
- `ability.use` met ability runtimeKey en target intent;
- `equipment.equip`, `equipment.unequip`, `equipment.swap`;
- `interaction.use`;
- `snapshot.ack`, `ping`.

Client stuurt nooit damage, HP, hitActorIds, lootresultaat, authoritative position of cooldown expiry.

### 17.4 Rate limits

Per sessie sliding windows:

| Command | Limiet |
| --- | --- |
| movement | 30/s, nieuwste coalescen |
| ability | 12/s, excess reject |
| interaction | 8/s |
| equipment | 4/s |
| ping | 2/s |

Herhaald misbruik logt securityevent en sluit na 20 ernstige violations in 60 s.

### 17.5 Snapshots

10 Hz snapshot bevat alleen actors in interest:

```json
{
  "snapshotId":123,
  "baseSnapshotId":122,
  "tick":4560,
  "created":[],
  "updated":[],
  "removed":[],
  "self":{...}
}
```

- Full snapshot bij join/reconnect/base missing.
- Deltafields hebben presence bitset.
- Critical reliable events: ability accepted/rejected, hit, effect, death, loot, equipment.
- Transformupdates zijn coalescable; critical events nooit stil droppen.
- Per connection outbound queued bytes soft limit 512 KiB, hard limit 2 MiB. Soft: transformdeltas coalescen; hard: close slow consumer en laat reconnect/resync toe.

### 17.6 Client interpolation

- Remote actors renderen 100 ms achter serverlatest.
- Tussen snapshots: Hermite/linear position en shortest-path yaw.
- Max extrapolation 100 ms, daarna freeze en connectionindicator.
- Lokale movementprediction corrigeert fout <=100 mm over 100 ms; >100 mm snap plus camera smoothing 150 ms.
- Ability/damage/death worden niet teruggerold door client.

### 17.7 Later scale-out

ActorSim kent een `AuthorityLease {worldInstanceId, regionPartition, epoch, ownerServerId, expiresAt}` interface, maar Fase 3 implementeert één owner. Alle events dragen epoch; clients/server accepteren nooit een lagere epoch. Er is geen half werkende cross-server handoff in deze fase.

---

## 18. Action audio

### 18.1 Integratie met Fase 2

- Exact één AudioContext en één listener.
- Action Audio gebruikt dezelfde master/SFX buses en `audio_event` definitions.
- De Fase-3-compiler hergebruikt `audio_event` versie 1; geen tweede audioregistry.
- Actor emitterpositie komt iedere renderframe uit de geïnterpoleerde renderpose.

### 18.2 Eventselectie

Server event bevat `eventId`, `audioEventIndex`, sourceActorId, positionMm, tick en scope. Client dedupliceert eventId gedurende 30 s.

Variantselectie voor gameplay-gerepliceerde audio is deterministisch uit eventId; lokale footsteps mogen lokaal sequential/random selecteren omdat zij geen gameplaybetekenis hebben.

### 18.3 Voicebudget

```text
MAX_AUDIO_VOICES = 64
MAX_LOOP_VOICES = 16
MAX_VOICES_PER_EVENT = audioEvent.maxConcurrent, hard max 8
```

Score:

```text
score = priority*100000 - distanceMm - ageMs*10
```

UI/local-player critical geluid krijgt distance 0 en priority floor 100. Bij overflow vervangt een nieuwe voice alleen de laagste score als zijn score hoger is; anders wordt hij gedropt en gemeten.

### 18.4 Lifecycle

Acquire maakt/geregistreert source/gain/panner. Release stopt source, verwijdert callbacks, disconnect alle nodes en verwijdert emitterref. Loopvoices stoppen binnen 100 ms bij actor release, effect removal of Cell eviction.

### 18.5 Footsteps

Animationmarkers `audio:foot_left/right` vragen een lokaal footstep-event. Surface wordt bepaald door Fase-2 surface membership onder de actor. Max 8 footsteps/s per actor; remote actors buiten 30 m produceren geen footsteps.

---

## 19. VFX

### 19.1 Triggercontract

```ts
interface VfxEvent {
  eventId: string;
  vfxIndex: number;
  sourceActorId: string|null;
  targetActorId: string|null;
  positionMm: Vec3i;
  normalMilli: Vec3i|null;
  socketKey: string|null;
  serverTick: number;
  seed: number;
}
```

Client resolveert buildindex, quality fallback en attachment. Onbekende index wordt gelogd en genegeerd; geen crash.

### 19.2 Poolbudgetten

| Pool | Initial | Hard max | Overflow |
| --- | ---: | ---: | --- |
| VFX emitter instances | 64 | 128 | drop laagste priority |
| Particle sprites totaal | 2048 | 4096 | clamp spawnCount |
| Mesh/model effects | 32 | 64 | fallback of drop |
| Decals | 64 | 128 | oudste lage priority release |
| Screen overlays | 8 | 16 | laagste priority vervangen |

### 19.3 Poolprotocol

```text
FREE -> ACQUIRED -> ACTIVE -> STOPPING -> RESETTING -> FREE
```

Acquire geeft generation handle. Iedere async callback vergelijkt generation. Reset:

1. stop emit;
2. verwijder uit scene/parent;
3. wis target/socketrefs;
4. reset transforms, opacity, uniforms en particlebuffers;
5. verwijder listeners/timeouts/promises;
6. decrement assetrefs;
7. mark FREE met generation+1.

### 19.4 Updates en offscreen

- VFX updatebudget 2 ms CPU/frame op reference desktop, 1 ms low quality.
- Offscreen non-loop effects mogen simulatie in 4-frame stappen bijwerken.
- Loop effects buiten interest stoppen.
- Particles veranderen nooit actor/gameplaystate.

### 19.5 GPU ownership

Geometry, texture en material uit assetcache worden disposed wanneer reference count nul is en geen in-flight loader/pooltemplate ze bezit. Het verwijderen van een Object3D uit scene is niet voldoende. Development diagnostics vergelijkt `renderer.info.memory` voor/na lifecycle tests.

---

## 20. Actor render pooling en LOD

### 20.1 Renderproxies

Per model/skeleton key bestaat een pool. Skinned actorinstances delen immutable geometry/textures waar Three.js dat veilig toelaat; skeleton/bones/mixer zijn instance-owned.

### 20.2 Zichtbaarheidsbudget

Default desktop:

```text
maxFullAnimatedActors = 80
maxReducedAnimatedActors = 160
maxVisibleActorProxies = 256
fullAnimationDistance = 30000 mm
reducedAnimationDistance = 70000 mm
```

- Full: mixer iedere frame.
- Reduced: mixer 10 Hz en interpolated root.
- Distant: 2 Hz pose of billboard/LOD als asset aanwezig.
- Player target, party en boss krijgen priority, maar hard max blijft gelden.

Deze zijn project performance settings met gevalideerde ranges; zij veranderen gameplay/AI niet.

### 20.3 Releasegate

Een actorproxy mag pas naar pool wanneer equipment children, nameplate, audio emitters, VFX attachments en animation listeners nul zijn. Anders `ACTOR_PROXY_RELEASE_BLOCKED` en forced cleanup in development; production verwijdert veilig en telt de violation.

---

## 21. World, Region, Area en Cell-integratie

### 21.1 Ownership

- Actor authoritative position gebruikt Fase-2 world millimeters en exact één Region membership.
- Actor Cell is afgeleid uit position, nooit authored.
- Region crossing gebruikt Fase-2 half-open boundaryregels.
- Area membership mag muziek/ambience en toekomstige modifiers sturen; Fase 3 gebruikt geen verborgen combatbonussen uit Areas.

### 21.2 Server interest

Per player:

- simulation interest: Cells binnen radius 2;
- prewarm interest: radius 3 voor spawn/nav/assets;
- replication interest: actor binnen 128 m of party/target/boss override;
- hysterese removal: 160 m.

Een Cell zonder interest kan visuals/assets unloaden. Authoritative persistent playerstate blijft bestaan. NPC/enemy spawnstate wordt volgens spawnpolicy geslapen of gereset, niet stil verdubbeld.

### 21.3 Cell unload

Voor unload moeten:

1. geen player in Cell;
2. geen actor in combat met geïnteresseerde player;
3. geen pinned navpath/tile;
4. geen pending reliable event dat positieasset vereist;
5. actor proxies en action loops gereleased;
6. spawn controller absolute respawnTicks behouden.

### 21.4 Regiontransfer

Binnen dezelfde world instance blijft actorId gelijk. Transform, nav corridor en Area membership worden atomic op één tick bijgewerkt. Wanneer doelnavtile niet active is, stopt actor maximaal 500 ms aan de movement gate; daarna krijgt player `WORLD_STREAM_BLOCKED` en AI replanned/returns.

---

## 22. Persistence

### 22.1 Persistent versus ephemeral

Persistent:

- player base stats/current persistent resources;
- inventory iteminstances;
- equipment slots en revision;
- granted permanent abilities;
- last safe position/checkpoint via bestaand playerstatecontract.

Ephemeral:

- NPC/enemy actorId;
- threat;
- cooldowns bij normale disconnect langer dan recoverywindow;
- nav paths;
- VFX/audio/animationstate;
- ordinary enemy HP/spawn occurrence, tenzij een later encounterdocument persistence eist.

### 22.2 Nieuwe tabellen

```sql
CREATE TABLE player_actor_state (
  player_id TEXT PRIMARY KEY,
  build_id TEXT NOT NULL,
  stat_state_json TEXT NOT NULL CHECK (json_valid(stat_state_json)),
  ability_state_json TEXT NOT NULL CHECK (json_valid(ability_state_json)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE gameplay_operation_idempotency (
  player_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (player_id, request_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE gameplay_outbox (
  event_id TEXT PRIMARY KEY,
  player_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL,
  delivered_at TEXT
);
```

Voor implementatie moet eerst de actuele schema-introspectie bewijzen dat gelijkwaardige tabellen niet al bestaan. Bestaande tabellen worden uitgebreid/migreerd; er komen geen duplicate authorities.

### 22.3 Disconnect

- Player actor blijft 200 ticks = 10 s in reconnect grace, zonder nieuwe movement/ability commands.
- AI mag hem niet als nieuw target kiezen; bestaand combat blijft maximaal 40 ticks, daarna target invalid.
- Reconnect met dezelfde session/player krijgt actor/snapshot terug.
- Na grace: persist snapshot transactioneel, actor despawn en equipment/inventory blijven DB-state.

---

## 23. Commands en HTTP/API

### 23.1 Authoring commands

Via Fase-1 endpoint en If-Match:

- `CreateActorArchetype`, `UpdateActorArchetype`, `DeleteActorArchetype`;
- `CreateStatDefinition`, `UpsertStatBlockEntry`;
- `CreateAbility`, `UpdateAbilityExecution`;
- `CreateAnimationSet`, `MapAnimationClip`, `UpsertAnimationMarker`;
- `CreateAiProfile`, `CreatePatrolPath`, `MovePatrolPoint`;
- `CreateActorSpawn`, `CreateSpawnGroup`, `MoveSpawnShapePoint`;
- `CreateEquipmentSlot`, `UpdateItemEquipment`;
- `CreateVfxDefinition`;
- generieke rename/archive/restore volgens Fase 1.

Geen command accepteert raw document JSON vanuit normale UI.

### 23.2 Query endpoints

```text
GET /api/authoring/actors?workspace=draft
GET /api/authoring/actors/:documentId/relations
GET /api/authoring/animation-assets/:assetId/clips
GET /api/authoring/animation-assets/:assetId/skeleton
GET /api/authoring/navigation/diagnostics?regionId=...
GET /api/authoring/combat/preview?attacker=...&target=...&ability=...
```

Combat preview gebruikt dezelfde pure mathfuncties als server, maar muteert niets en labelt de uitkomst als preview.

### 23.3 Runtime endpoints

```text
GET /api/game/builds/:buildId/actors
GET /api/game/builds/:buildId/combat
GET /api/game/builds/:buildId/presentation
GET /api/game/builds/:buildId/navigation/:agentClass/:tileKey
```

Zelfde immutable cache/hashregels als Fase 2.

---

## 24. Werkbank en visuele authoring

### 24.1 Hoofdroutes

Alles komt in Werkbank/Instellingen, niet in Nodes:

- **Actors**: Players, NPCs, Enemies, Wildlife;
- **Combat**: Stats, Abilities, Damage, Effects, Combat profiles;
- **Equipment**: Slots, Items, Loadouts;
- **Beweging & AI**: Agent profiles, AI profiles, Patrol paths, Spawn groups;
- **Presentatie**: Skeletons, Animations, Action audio, VFX.

### 24.2 Actor Builder

Een actor wordt als menselijke flow gebouwd:

1. soort en naam;
2. model en skeletoninspectie;
3. animation clips toewijzen met inline preview;
4. stats en faction;
5. gedrag/combat;
6. equipment en sockets;
7. audio/VFX;
8. plaats/spawn in viewport;
9. Validate en PlayPreview.

Iedere stap toont compact: **Klaar**, **Optioneel** of **Blokkeert publiceren**. Geen raw IDs/JSON.

### 24.3 Animation inspector

- 3D modelpreview met clipplay/pause/scrub/speed.
- Lijst van daadwerkelijke clipnamen en duration uit GLB.
- Marker timeline in milliseconden plus gekwantiseerde servertick.
- Root-motion trajectory overlay.
- Hurtbox/socket overlays en bone picker.
- Publish diagnostics bij ontbrekende roles/bones.

### 24.4 Navigation tools

- Walkable navmesh overlay per agentklasse.
- Tile seams, unreachable islands en loaded tiles.
- Patrol path tekenen/slepen in viewport, punten automatisch op navmesh projecteren maar originele intent pas na confirm wijzigen.
- Spawn group polygon tekenen; preview toont kandidaatposities en caps.
- `Test pad` toont path, length, corners en failurecode.

### 24.5 Combat preview

Selecteer attacker, target, ability en optionele equipment. Toon:

- base/power/mitigation/crit-range/final damage;
- cost, cast, active, recovery en cooldown op tijdlijn;
- hitshape/hurtboxes in 3D;
- status duration/stacks;
- alle bronnen van derived stats.

Previewresultaat is educatief en gebruikt geen echte RNG; toon non-crit en critwaarden apart.

### 24.6 Geen verborgen waarden

Ieder veld toont een concrete korte hulptekst: standaard, effect van lager/hoger, veilige range en runtimeconsumer. Een niet-geconsumeerd veld mag niet als normale instelling zichtbaar zijn.

---

## 25. Validatie en foutafhandeling

### 25.1 Validatielagen

1. JSON/schema en integer/range;
2. references/kinds/delete policy;
3. asset metadata: GLB, clips, bones, audio, textures;
4. semantic actor/combat/equipmentregels;
5. navmeshbake en reachability;
6. deterministic compile en package hashes;
7. runtime package load/self-check;
8. Preview sandbox acceptance.

### 25.2 Errorcodes

Minimaal:

```text
ACTOR_ARCHETYPE_INCOMPLETE
ACTOR_CAPACITY_EXCEEDED
STAT_SEMANTIC_DUPLICATE
STAT_RANGE_INVALID
ABILITY_EXECUTION_INVALID
ABILITY_MARKER_MISSING
ABILITY_TARGET_INVALID
ABILITY_ON_COOLDOWN
ABILITY_RESOURCE_INSUFFICIENT
ANIMATION_CLIP_MISSING
ANIMATION_BONE_MISSING
ANIMATION_ROOT_MOTION_MISMATCH
HURTBOX_INVALID
EQUIPMENT_SLOT_CONFLICT
EQUIPMENT_ITEM_INCOMPATIBLE
EQUIPMENT_REVISION_CONFLICT
NAV_BAKE_FAILED
NAV_TILE_SEAM_MISMATCH
NAV_POINT_UNREACHABLE
NAV_PATH_NOT_FOUND
AI_PROFILE_INVALID
SPAWN_NO_VALID_POSITION
PROJECTILE_CAPACITY_EXCEEDED
RUNTIME_BUILD_MISMATCH
WIRE_PROTOCOL_MISMATCH
POOL_GENERATION_STALE
PRESENTATION_ASSET_MISSING
```

Iedere fout heeft `code`, menselijke Nederlandse message, `documentId/actorId` indien relevant, JSON pointer of runtime stage, severity en actionable fix. Geen stacktrace naar normale clients.

### 25.3 Runtime containment

- Ongeldig clientcommand: reject alleen command.
- Ongeldige actor: quarantine/despawn die actor, wereld blijft draaien.
- Ontbrekende navtile: movement gate/return, geen teleport door geometry.
- Presentation failure: placeholder/skip met diagnostic, simulator blijft draaien.
- Package hash/schema mismatch: world instance start niet; last-known-good published build blijft actief.
- Sim invariant violation: structured fatal for affected world instance, sessions disconnect met resynccode; proces mag door supervisor gecontroleerd herstarten.

---

## 26. Security

- Authenticate WebSocket upgrade met bestaande sessie; Origin allowlist en CSRF-achtige tokenbinding voor browserupgrade.
- Authoringroles en runtimeplayerrollen blijven gescheiden.
- Validate alle envelopes met gesloten schemas; onbekende velden mogen bij commands niet stil betekenis krijgen.
- Geen client asset URL, formula AST, shader, bone path of runtime index vertrouwen.
- Server resolveert runtimeKeys uit pinned build.
- Replays/audit loggen commandtype, sequence, tick, actor, resultcode en event IDs zonder secrets.
- HMAC-secret roteert bij processtart; persistent loot/economytransacties bewaren uitkomst idempotent.
- Movement anti-cheat controleert maximale displacement uit authoritative speed/abilities; violation corrigeert eerst, logt daarna, automatische ban valt buiten scope.

---

## 27. Performance- en memorycontract

### 27.1 Server tickbudget bij 20 Hz

Reference acceptancetarget per world instance, 95e percentiel:

| Stage | Budget |
| --- | ---: |
| input/interest | 2 ms |
| perception/AI | 8 ms |
| navigation | 8 ms |
| movement/collision | 8 ms |
| abilities/combat/effects | 8 ms |
| replication/persistence queues | 8 ms |
| reserve/GC | 8 ms |

Totaal <= 50 ms. P99 <= 75 ms gedurende maximaal 5 opeenvolgende ticks; daarna degradation/alert.

### 27.2 Client frame

Op de vastgelegde reference desktop in 1080p:

- P95 frame <= 16.7 ms met 80 full actors;
- actor/animation update <= 4 ms;
- VFX <= 2 ms;
- audio bookkeeping <= 1 ms;
- geen long task > 50 ms bij actor Cell attach/detach.

Reference hardware/browser moet in testconfig worden vastgelegd; zonder die context is een performanceclaim ongeldig.

### 27.3 Leakgate

Test 20 cycli:

1. enter actor-heavy Cell;
2. 60 s combat/VFX/audio;
3. leave en force normal eviction;
4. wacht twee GC-observatiewindows;

Acceptatie:

- active actor/proxy/voice/effect counts terug op baseline;
- geen listeners/timers met released generation;
- `renderer.info.memory` na warm-up groeit niet monotoon; laatste vijf cycli binnen 5% band;
- JS heaptrend laatste vijf cycli binnen 10% band, gemeten onder dezelfde browsercondities;
- geen pool groeit boven hard max.

---

## 28. Legacy import en cutover

### 28.1 Volgorde

1. inventory/equipment DB-schema introspecteren en backup volgens Fase 1;
2. canonical stats/damage/effects/abilities;
3. skeleton/animation/VFX/audio refs;
4. equipment slots/items/loadouts;
5. actor archetypes/factions;
6. nav agents/AI/patrols;
7. actor spawns/groups/placements;
8. shadow compile en parityrapport;
9. Preview acceptance;
10. domain cutover legacy -> canonical;
11. legacy nodes read-only houden.

### 28.2 Mapping

| Legacy | Canonical |
| --- | --- |
| `npc_archetype` | `actor_archetype.actorKind=npc` |
| `enemy_archetype` | `actor_archetype.actorKind=enemy` |
| `stat_definition`, `stat_block` | gelijknamig canonical, waarden naar milli |
| `ability_definition` | canonical ability; alleen ondersteunde formulas |
| `combat_profile` | canonical combat profile, typed rotations |
| `animation_set` | canonical clips; asset metadata moet namen bewijzen |
| `ai_behavior_profile` | `ai_profile`, ms naar ticks via `ceil(ms/50)` |
| `path_behavior_profile` + waypoints | `patrol_path`; profile speed verhuist naar nav/actor settings |
| `equipment_slot_definition` | canonical slot |
| item equipmentfields | `item_definition` v2 |
| `audio_event` | Fase-2 canonical audio event |
| `vfx_definition` | canonical typed VFX |
| enemy spawn point/area | `actor_spawn` / `spawn_group` |

### 28.3 Importclassificatie

- `exact`: zelfde betekenis en bewezen refs/assets;
- `converted`: unit/shape deterministisch vertaald;
- `manual_required`: clip/bone/formula/path semantiek niet bewijsbaar;
- `unsupported`: field zonder consumer of strijdig met canoniek contract.

Geen `manual_required` of `unsupported` item mag automatisch canonical active worden.

### 28.4 Parity

Parity vergelijkt niet nodevorm. Het vergelijkt zichtbare/uitvoerbare betekenis: model, stats, abilities, slots, clips, faction, spawnlocatie, lootref, respawn en presentationrefs. Verschillen staan per contentobject in Nederlands rapport.

---

## 29. Verplichte bestandsarchitectuur

Exacte namen mogen alleen met ADR wijzigen; verantwoordelijkheden niet:

```text
src/server/authoring/domains/actors/
  actor-domain.js
  actor-schemas.js
  actor-validation.js
  actor-commands.js
  actor-compiler.js

src/server/authoring/domains/combat/
src/server/authoring/domains/navigation/
src/server/authoring/domains/presentation/

src/server/runtime/actors/
  actor-registry.js
  actor-simulation.js
  stat-system.js
  ability-system.js
  combat-system.js
  effect-system.js
  spawn-system.js

src/server/runtime/navigation/
  navmesh-service.js
  nav-tile-registry.js
  path-scheduler.js

src/server/runtime/ai/
  ai-system.js
  perception-system.js
  threat-system.js

src/server/runtime/network/
  world-socket-server.js
  replication-service.js
  wire-schemas.js

apps/web/public/shared/runtime/actors/
  actor-replica-store.js
  actor-render-system.js
  animation-controller.js
  equipment-render-system.js
  action-audio-system.js
  vfx-system.js
  object-pool.js

apps/web/public/editor/workbench/
  actor-builder.js
  animation-inspector.js
  navigation-tools.js
  combat-preview.js
```

Pure combatmath en schema constants staan in een environment-neutrale shared module zonder DOM, Three.js, SQLite of network imports, zodat compiler/server/tests exact dezelfde functies gebruiken.

---

## 30. Implementatiecheckpoints

Een volgende coder voert deze volgorde uit. Geen checkpoint mag alleen intern zijn: elk eindigt met zichtbaar bewijs.

### Checkpoint 3A - Canonical catalog en actor preview

- Schemas/commands/compiler voor stats, actors, factions, animation metadata.
- Actor Builder en model/skeleton/clippreview.
- Pure statkernel en validation.
- Zichtbaar bewijs: Kevin maakt NPC/enemy/wildlife, ziet model, clips, hurtboxes en save/refresh.

### Checkpoint 3B - Navigation, patrols en lifecycle

- Recast dependencies pinned.
- Cell navtile compiler/loader/seam validation.
- Nav agents, patrolpath tool, spawns/groups.
- Actor registry, movement, sleep/despawn/respawn.
- Zichtbaar bewijs: actors lopen over getoonde navmesh, Region/Cell over, respawnen zonder dubbelingen.

### Checkpoint 3C - Authoritative combat en netwerk

- Abilities, effects, combat profiles, fixed math en HMAC RNG.
- Tickloop, wire protocol, snapshots, interpolation, hit/hurt/projectiles.
- Death/loot exactly-once.
- Zichtbaar bewijs: player en enemy bevechten elkaar; damage/cooldown/death/loot blijft gelijk na reconnect.

### Checkpoint 3D - Equipment en animation fidelity

- Slot/item/loadout migration en transactionservice.
- Visual sockets, weapon swap, ability/stat rebuild.
- Animation layers, crossfades, markers en baked root motion.
- Zichtbaar bewijs: equip/unequip/swap verandert model/stats/abilities correct en houdt stand na refresh.

### Checkpoint 3E - Audio, VFX, pooling en cutover

- Action audio/VFX events en pools.
- Budgets, disposal/leak diagnostics en LOD.
- Legacy importer/parity/cutover.
- Volledige Preview/published playthrough en lifecycle loadtest.
- Zichtbaar bewijs: effects synchroon, geen groei/dubbels na 20 cycli, Nodes blijven read-only.

---

## 31. Verplichte testmatrix

### 31.1 Unit/determinisme

- rounding positief/negatief en BigInt overflow;
- stat modifier order en clamp;
- armor/resistance/crit/heal golden vectors;
- cooldown/cast/marker tickgrenzen;
- status stacking per policy;
- RNG dezelfde input zelfde result, andere purpose andere stream;
- faction matrix en targetfilter;
- AI transitiontable en tie-breaks.

### 31.2 Compile/assets

- missing/wrong clip, bone, socket, assetkind;
- root-motion mismatch;
- missing ability marker;
- invalid hurtbox;
- formula import unsupported;
- reference cycle/delete/backlink;
- byte-identieke packages uit dezelfde snapshot.

### 31.3 Navigation

- tile bakehash deterministisch;
- seams alle vier kanten;
- Region boundary/cell negative coordinates;
- nearest-poly en unreachable points;
- path query stale result;
- tile pin/evict;
- stuck/replan/return;
- spawn minimum spacing/cap/no valid point.

### 31.4 Combat/integratie

- duplicate command/event/death/loot;
- attack precies op rangegrens;
- hit sweep bij lage/high speed;
- multi-hit interval;
- target dies between request/commit/hit;
- interrupt voor/na commit;
- projectile cap;
- lag compensation 0/100/200/>200 ms;
- reconnect full snapshot.

### 31.5 Equipment/persistence

- stale revision/idempotent retry;
- conflicting slots en full inventory rollback;
- equip transaction crash halfway -> volledig rollback;
- stat/resource preservation;
- granted ability removal cancels cast;
- old persisted item with deleted definition blocks publish/delete via backlink.

### 31.6 Presentation/lifecycle

- mixer/action listener cleanup;
- equipment attachment recycle;
- audio loop actor unload;
- VFX async callback met stale generation;
- pooled transform/material reset;
- missing optional effect no crash;
- 20 Cell/combat lifecyclecycli en leakgate.

### 31.7 Security/fuzz

- malformed/oversized/unknown WebSocket frames;
- spoofed actor/target/build/world IDs;
- sequence replay en rate limits;
- NaN/infinity/noninteger/overflow payloads;
- movement speed/teleport claims;
- client hit/damage fields worden geweigerd.

---

## 32. Kevin-acceptatietest

Kevin levert zichtbaar browser- en gameplaybewijs; geautomatiseerde tests vervangen dat niet.

### A. Actor maken

1. Maak één speler, NPC, enemy en wildlife via Actor Builder.
2. Kies modellen en controleer skeleton/socket/hurtbox overlay.
3. Wijs idle/walk/run/hit/death en één attackclip toe.
4. Save Draft, refresh en controleer alle menselijke waarden.

### B. Wereldgedrag

1. Toon navmesh en maak een patrol over minimaal twee Cells.
2. Plaats NPC en teken een enemy spawn group.
3. Start Preview en zie idle, patrol, chase, return en wildlife flee.
4. Loop over Regiongrens; geen teleport, dubbels of stilgevallen route.

### C. Combat

1. Maak basic attack, damage type en burneffect.
2. Bekijk hitshape/tijdlijn in editor.
3. Vecht in Preview: range, cooldown, hit, crit/non-crit, status en HP kloppen.
4. Dood enemy; één lootresultaat, corpse weg, één respawn.
5. Reconnect tijdens/na combat; geen dubbele actor/loot.

### D. Equipment

1. Maak main-hand slot en sword item.
2. Equip en controleer socketmodel, stats en ability.
3. Swap/unequip; visual en derived stats veranderen exact eenmaal.
4. Refresh/reconnect; DB en visible model blijven gelijk.

### E. Audio/VFX

1. Koppel attack, impact, hit, death en footsteps.
2. Koppel cast/impact/status VFX.
3. Test nabij/veraf, meerdere enemies en actor unload.
4. Geen loops die blijven hangen; belangrijke lokale sound blijft hoorbaar binnen budget.

### F. Lifecycle en publish

1. Verlaat/enter actor Cell twintig keer met combat.
2. Bekijk pool/voice/actor/nav diagnostics terug naar baseline.
3. Publish en herhaal kernplaythrough in game.
4. Editor en game tonen dezelfde modellen, posities, equipment, animaties en betekenis.
5. Nodes zijn read-only en geen nieuwe canonical edit heeft graphwrites gemaakt.

---

## 33. Definition of Done

Fase 3 is pas complete wanneer:

- alle canonical kinds, commands, schemas, validation en migrations geïmplementeerd zijn;
- actor runtime 20 Hz authoritative en deterministisch testbaar is;
- navmesh, pathfinding, AI en spawn lifecycle zichtbaar werken;
- animation, equipment, audio en VFX uit dezelfde actor/combat events volgen;
- combatmath golden vectors en exploitcases slagen;
- client nooit damage/hit/loot authority heeft;
- pools/budgets/disposal/leakgates slagen;
- Preview geen echte persistence muteert;
- published game dezelfde buildbetekenis toont;
- legacy-import/parity/cutover per domein voltooid is;
- Kevin de volledige sectie 32 expliciet heeft geaccepteerd;
- fase- en projectdocumentatie de werkelijke status tonen.

Een schema, mock, inspector of node-import zonder werkende runtimeconsumer telt niet als voltooid.

---

## 34. Bronnen en technische onderbouwing

Deze bronnen bepalen librarygedrag en platformgrenzen; GK's hierboven vastgelegde gamecontract blijft projecteigen:

- Three.js `AnimationMixer`: een mixer per onafhankelijk animated object, update, stop en uncache lifecycle: https://threejs.org/docs/pages/AnimationMixer
- Three.js `AnimationAction`: loop, weight, crossfade, warp en actionstate: https://threejs.org/docs/pages/AnimationAction.html
- Three.js animation system en ondersteunde clipworkflow: https://threejs.org/manual/pages/animation-system.html
- Three.js resource disposal: scene removal dispose't GPU resources niet automatisch: https://threejs.org/manual/pages/how-to-dispose-of-objects.html
- Three.js `InstancedMesh`: draw-callreductie en expliciete disposal: https://threejs.org/docs/pages/InstancedMesh.html
- Recast Navigation: voxel/meshgeneratie en Detour runtime pathfinding/crowd: https://github.com/recastnavigation/recastnavigation
- `recast-navigation-js`: browser/Node WASM-packages en Three.js-integratie: https://github.com/isaac-mason/recast-navigation-js
- `ws`: serverimplementatie, upgrade-routing, ping/pong en expliciete compressiekosten: https://github.com/websockets/ws
- WebSocket Protocol RFC 6455: framing, close en protocolbasis: https://www.rfc-editor.org/rfc/rfc6455
- Web Audio API: de gedeelde graph/listener/source lifecycle die Fase 2 en deze fase gebruiken: https://www.w3.org/TR/webaudio-1.1/
- glTF 2.0 specificatie: skins, animations, nodes en assetsemantiek: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html

Dependencies worden exact gepind in lockfile. Een brondocument is geen toestemming om defaults ongecontroleerd over te nemen; de waarden in dit contract zijn de GK-defaults en moeten door de acceptatietests worden bewezen.

---

## 35. Eindstatement

Na Fase 3 heeft GK geen verzameling los ingevulde NPC-, enemy- of abilityvelden, maar één doorlopende keten:

```text
menselijke authoring
-> gevalideerde canonical documenten
-> deterministic build + navtiles
-> server-authoritative actorsimulatie
-> snapshots en immutable events
-> gesynchroniseerde animation/equipment/audio/VFX-presentatie
```

De kernbeslissingen zijn vast: definitions zijn data, de server is authority, gameplaymath is integer en geordend, navmesh is afgeleid, presentatie is gevolg, pools zijn begrensd en nodes zijn alleen legacy-import. Latere gameplay kan nieuwe getypeerde definitions en systems toevoegen zonder deze authority-, lifecycle- of dataflowregels te omzeilen.
