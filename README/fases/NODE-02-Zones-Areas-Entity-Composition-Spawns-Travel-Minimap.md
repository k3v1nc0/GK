# NODE-02 — Zones, Areas, Entity Composition, Spawns, Checkpoints, Travel en Per-Zone Minimap

**Documenttype:** uitvoeringscontract voor Codex  
**Status:** implementeren nadat NODE-01 volledig is geaccepteerd  
**Repository:** `k3v1nc0/GK`  
**Baseline:** eind-HEAD van NODE-01  
**Afhankelijkheden:** NODE-01 fundering, symbolindex, packages, registries en World Assembly  
**Vervolg:** NODE-03 — Catalogs, Player State, Combat, Enemies, Resources en Loot  
**Contractversie:** `node-system-contract-v1.0`

---

# 1. Opdracht aan Codex

Bouw het volledige zone- en world-compositionmodel boven op NODE-01. Na deze fase is de wereld niet langer één monolithische set losse Game Output-inputs. Iedere speelbare zone wordt een specialized `zone` Group met één `Zone Output`, interne Areas, lokale entities, spawns, links, markers en een eigen minimap.

De fase moet tastbaar bewijzen:

```text
Zone Group A (500x500)
-> Area Groups
-> Ground/terrain/lights/entities
-> safe default spawn
-> per-zone minimap 2048x2048
-> Zone Output
-> Zone Registry

Zone Group B (500x500)
-> eigen settings/spawn/minimap
-> Zone Link tussen A en B

Zone Registry
-> World Assembly
-> Game Output
-> published root + afzonderlijke zonepackages
-> player kan server-authoritative van zone wisselen
```

Codex hoeft niet te bepalen hoe een zone, spawn, checkpoint, link of entitycomposition eruitziet. Dit document legt dat vast.

---

# 2. Harde uitgangspunten

1. Iedere normale outdoor-zone heeft exact `500 × 500` world-unit bounds, tenzij `zoneType` expliciet interieur/dungeon/custom is.
2. Fysieke chunks blijven overal `14 × 14`; max loaded/resident blijft `81`.
3. Randchunks worden op zonebounds afgeknipt. Geen stille omzetting naar 504×504.
4. Iedere speelbare zone heeft exact één `zone_default` safe spawn.
5. Iedere zone krijgt een eigen Minimap Bake met standaard `2048 × 2048 WebP`.
6. Zonecontent gaat uitsluitend via `Zone Output -> zonePackage -> Zone Registry` naar World Assembly.
7. Quests komen nog niet in deze fase, maar zones registreren al stabiele `quest_target_binding`-IDs.
8. `model_entity` blijft de echte viewportmesh; gedrag wordt via componentnodes aan `entity_assembly` toegevoegd.
9. De huidige standalone `interactable` wordt gemigreerd; er komt geen tweede mesh-/positie-eigenaar.
10. Playerzone en positie zijn server-authoritative en persistent.
11. Geen seeded testzones. Smoke/browserchecks maken tijdelijke content via normale editor/API-routes.
12. Geen volledige seamless open-worldrenderer. Zoneovergangen worden correct, preloadbaar en veilig uitgevoerd; `seamless_boundary` gebruikt een gecontroleerde fallback als targetcontent nog niet klaar is.

---

# 3. Tastbaar eindresultaat

Na NODE-02 kan Kevin:

- een `Zone Group` aanmaken;
- binnen die Group `Zone Definition`, `Zone Environment Settings`, `Zone Gameplay Rules`, Ground Surface, lights, terrain en entities plaatsen;
- één of meerdere `Area Groups` maken;
- een bestaande GLB als `Model Entity` plaatsen en via `Entity Assembly` samenstellen;
- een meshloze `Location Anchor` in de viewport selecteren/verplaatsen;
- meerdere `Spawn Point`-nodes gebruiken met rollen `zone_default`, `entry`, `checkpoint`, `respawn`, `bind` en `instance`;
- een `Checkpoint` activeren;
- `Unstuck` gebruiken en naar een veilige plek terugkeren;
- twee zones met `Zone Link` verbinden;
- vanuit `/game/` door een portal/deur/link van zone wisselen;
- na refresh/login in dezelfde zone en positie terugkomen;
- per zone een 2048×2048 minimap bakken;
- bij zonewissel automatisch de juiste minimap zien;
- zone-, area-, entity-, spawn-, link-, marker- en minimapdata in published packages inspecteren;
- controleren dat editor en game dezelfde fysieke 14×14-grid gebruiken.

---

# 4. Zone- en area-hiërarchie

```text
ROOT GRAPH
│
├── Zone Group: zone.home_base
│   ├── Zone Definition
│   ├── Zone Environment Settings
│   ├── Zone Gameplay Rules
│   ├── Ground Surface
│   ├── Terrain / Surface / Collision
│   ├── Ambient / Directional Lights
│   ├── Area Group: area.home_base.village
│   │   ├── Area Definition
│   │   ├── Entities / anchors / targets
│   │   └── Area Output -> areaPackage
│   ├── Area Group: area.home_base.forest
│   │   ├── Area Definition
│   │   ├── paths / markers / spawns
│   │   └── Area Output -> areaPackage
│   ├── Spawn Points / Checkpoints / Zone Links
│   ├── Minimap Bake
│   └── Zone Output -> Group Output -> zonePackage
│
├── Zone Group: zone.road
│   └── ...
│
└── Zone Registry -> World Assembly
```

## 4.1 Groupkind-contract

### Zone Group preset

Publieke output:

```text
zonePackage: zonePackage, multiple false, required true
```

Geen publieke Catalog/Campaign-inputs. Zonecontent gebruikt typed refs uit het published catalog/symbolcontract, niet individuele kabels van globals.

### Area Group preset

Publieke output:

```text
areaPackage: areaPackage, multiple false, required true
```

Area Group moet als child van een Zone Group staan. Een root-Area is publisherror.

---

# 5. Nieuwe datatypes

Voeg toe:

```text
zoneDef
environment
zoneRules
area
areaPackage
environmentOverride
anchor
spawnPoint
checkpoint
zoneLink
discoveryDef
areaRule
markerDef
markerRule
audioAssignment
path
encounterArea
cameraOverride
entityBase
entityComponent
entity
questTarget
action
zonePackageRef
```

Bestaande `ground`, `terrain`, `collision`, `light`, `camera`, `minimap` blijven behouden.

---

# 6. Zone-nodes

## 6.1 `zone_definition`

**Scope:** uitsluitend binnen Zone Group  
**Output:** `zoneDef`

Fields:

| Field | Type | Default | Regel |
|---|---|---|---|
| `zoneId` | identity | `zone.new_zone` | kind zone, immutable na publish |
| `displayName` | text | `New Zone` | max 120 |
| `zoneType` | select | `outdoor_normal` | outdoor_normal, interior, dungeon, instance, hub, custom |
| `originX` | number | 0 | worldindex/origin |
| `originY` | number | 0 | meestal 0 |
| `originZ` | number | 0 | worldindex/origin |
| `width` | number | 500 | outdoor_normal locked 500 |
| `depth` | number | 500 | outdoor_normal locked 500 |
| `minY` | number | -100 | validation/render metadata |
| `maxY` | number | 500 | validation/render metadata |
| `recommendedLevelMin` | number | 1 | >=1 |
| `recommendedLevelMax` | number | 10 | >= min |
| `biomeTags` | tagList | [] | bijvoorbeeld zone.biome.forest |
| `zoneTags` | tagList | [] | classificatie |
| `allowFastTravel` | boolean | true | zonepolicydefault |
| `allowRespawn` | boolean | true | zonepolicydefault |
| `activeByDefault` | boolean | true | content gating, niet runtime loaded |

Rules:

- één Zone Definition per Zone Group;
- zoneId uniek projectbreed;
- `outdoor_normal` moet exact 500×500 zijn;
- andere types mogen 1..5000 gebruiken;
- output wordt altijd direct of via kleine helpers met `zone_output.zone` verbonden.

## 6.2 `zone_environment_settings`

**Output:** `environment`

Fields:

```text
environmentId
backgroundColor
fogColor
fogDensity
smoothShading
timeOfDayOffset
weatherProfileRef optional
musicPlaylistRef optional
ambienceRef optional
cameraOverrideRef optional
shadowPresetOverride: inherit|geen|licht|middel|hoog|extreem
```

Renderperformancevelden zoals pixelratio/FPS blijven in globale Editor/Game World Settings, niet per zone.

## 6.3 `zone_gameplay_rules`

**Output:** `zoneRules`

Fields:

```text
rulesId
pveEnabled true
pvpMode disabled|duel_only|open|faction
levelScalingMode fixed_range|clamp_to_range|party_average|custom
resourceYieldMultiplier 1
enemyHealthMultiplier 1
enemyDamageMultiplier 1
lootMultiplier 1
xpMultiplier 1
respawnPolicyRef optional
networkInterestProfileRef optional
allowTrade true
allowMarketAccess false
allowUnstuck true
```

Multiplierrange 0..100, default 1.

## 6.4 `area_definition`

**Scope:** Area Group  
**Output:** `area`

Fields:

```text
areaId
zoneRef: exact reference naar owning zone; auto-filled/locked vanuit parent Zone Group
label
shapeType: polygon|box|circle
x, y, z
width, depth, radius
points
priority
recommendedLevelMin/Max
areaTags
mapRevealMode: hidden|outline|full
```

Een area mag overlappen. Bij meerdere environment/rule-overrides wint hoogste priority; gelijke priority gebruikt kleinste specifieke area, daarna stable ID-sortering.

## 6.5 `area_environment_override`

Inputs:

```text
area
conditions[] optional
```

Output: `environmentOverride`.

Fields hebben voor ieder overrideveld een tri-state:

```text
inherit
set value
clear/disable waar toepasbaar
```

Ondersteun minimaal fog, background, music, ambience, weather, camera en light intensity multipliers.

## 6.6 `area_output`

Inputs:

```text
area required
environmentOverrides[]
areaRules[]
terrain[]
collision[]
lights[]
entities[]
spawns[]
questTargets[]
markers[]
audioAssignments[]
paths[]
encounterAreas[]
```

Output: `areaPackage`.

Bundelt alleen; geen runtime logic.

## 6.7 `zone_output`

Inputs:

```text
zone required
environment required
rules optional
ground required voor outdoor_normal/hub
terrain[]
collision[]
lights[] minimaal één ambient of directional warning/requirements per projectstyle
cameraOverrides[]
areas[]
entities[]
spawns[]
checkpoints[]
links[]
discoveries[]
questTargets[]
markers[]
minimap required voor outdoor_normal/hub
audioAssignments[]
paths[]
encounterAreas[]
```

Output: `zonePackage`.

Fields:

```text
packageId auto = <zoneId>.package
packageVersion = 1
includeEditorOnlyData false
```

---

# 7. Anchor-, spawn-, checkpoint- en travelnodes

## 7.1 `location_anchor`

Outputs:

```text
anchor
entityBase (renderMode none)
```

Fields:

```text
anchorId
label
x, y, z
rotationY
shapeType: point|circle|box
radius
width
depth
visibleInEditor true
visibleInGame false
editorIcon: anchor|spawn|target|portal|custom
anchorTags
```

Viewport:

- selecteerbaar;
- verplaatsbaar;
- compact icoon/outline;
- nooit als fake gamegeometry renderen;
- gamehelper standaard verborgen.

## 7.2 `spawn_point`

Input: optioneel `anchor`; zonder anchor bezit de node eigen x/y/z/facing en editorhelper.  
Output: `spawnPoint`.

Fields:

```text
spawnId
role: zone_default|entry|checkpoint|respawn|bind|instance|fast_travel_arrival
zoneRef auto from parent
label
x,y,z,facing
safeRadius
snapToGround true
validateCollision true
activationConditionRef optional
priority
```

Rules:

- exact één zone_default per speelbare zone;
- entry/arrivalspawns mogen veel;
- safeRadius > player collision radius;
- spawn binnen zonebounds;
- geen blocker overlap bij publish;
- walkable surface/ground moet beschikbaar zijn.

## 7.3 `checkpoint`

Inputs:

```text
spawnPoint required
activationConditions[] optional
onActivateActions[] optional
marker optional
audio/vfx optional later refs already allowed
```

Output: `checkpoint`.

Fields:

```text
checkpointId
label
activationMode: proximity|interact|quest_action|automatic_entry
saveScope: character|party|instance
respawnEligible
fastTravelEligible
healPolicy: none|full|percent|fixed
healAmount
manaPolicy
staminaPolicy
activationRadius
oneTimeMessage: tokenText
```

## 7.4 `zone_link`

Input:

```text
fromAnchor or fromSpawn exactly one
conditions[] optional
```

Output: `zoneLink`.

Fields:

```text
linkId
fromZoneRef auto
fromTargetRef auto/from input
toZoneRef required
toSpawnRef required
mode: door|portal|teleport|fast_travel|seamless_boundary|scripted_transport
bidirectional boolean
reverseLinkRef optional
transitionVisual: none|fade|loading_screen
loadingText tokenText
preloadDistance
interactionRequired
prompt tokenText
oneWayReason tokenText optional
```

Validation:

- target zone/spawn bestaan;
- target spawn hoort bij target zone;
- bidirectional vereist geldige reverse link of compiler genereert expliciete warning, nooit stil een reverse link;
- seamless boundary moet aan zoneboundary liggen;
- geen self-link behalve expliciete `allowSelfLink` debugfalse; niet implementeren als field in normale UI.

## 7.5 `discovery_area`

Input: `area` of `anchor`; output `discoveryDef`.

Fields:

```text
discoveryId
label
revealZoneMap
revealAreaMap
unlockFastTravelRef optional
xpRewardFormula optional
notificationTemplateRef/inline tokenText
oneTimePerCharacter true
```

## 7.6 `safe_rule_area`

Input `area`; output `areaRule`.

Fields:

```text
safeZone
combatAllowed
pvpAllowed
tradeAllowed
marketAllowed
unstuckAllowed
mountAllowed future flag only
respawnAllowed
priority
```

---

# 8. Markers en per-zone minimap

## 8.1 `map_marker_definition`

Input target exactly één van:

```text
entity
anchor
area
questTarget
spawnPoint
checkpoint
zoneLink
```

Output: `markerDef`.

Fields:

```text
markerId
label: tokenText
iconAssetId optional
markerType: npc|enemy|quest|resource|portal|checkpoint|vendor|market|crafting|custom
showOnMinimap
showOnWorldMap
showOnCompass
priority
clampOutside
minDistance
maxDistance
iconSizePx
labelVisibility: never|hover|always|near
```

## 8.2 `marker_visibility_rule`

Inputs conditions[]; output `markerRule`.

Fields:

```text
ruleId
defaultVisible
hideWhenTargetUnloaded false
fallbackToZoneEntry true
```

Queststatecondities worden pas in NODE-04 toegevoegd; NODE-02 ondersteunt discovery/zone/always/player-level placeholderkind alleen als het conditioncontract beschikbaar is. Tot NODE-04 mag rule alleen `always`, `discovered`, `not_discovered` gebruiken.

## 8.3 `minimap_bake` aanpassing

Voeg fields/inputs toe:

```text
zoneRef: reference zone, auto-filled from parent Zone Group
zone: optional zoneDef input
ground: ground input
```

Regels:

- outdoor_normal/hub default resolution 2048;
- bakebounds exact zonebounds, vierkant 500×500 voor normal zone;
- imageformat WebP;
- filename bevat zoneId en contenthash;
- bake wordt aan zonePackage gekoppeld;
- één enabled bake per zone;
- oude global `main_minimap` wordt via migration aan compatibilityzone gekoppeld.

## 8.4 `game_minimap_hud` aanpassing

Verwijder functionele afhankelijkheid van één handmatig `sourceMinimapId` zodra registry-mode actief is.

Nieuwe fields:

```text
sourceMode: active_zone_registry|fixed_legacy
fallbackMinimapRef optional
transitionMode: instant|fade
```

In active-zone mode:

- resolveer minimap uit current zone package;
- reset pan/follow bij zonewissel;
- behoud zoom binnen min/max als dat logisch is;
- markers filteren op current zone;
- unloaded-zone questmarker gebruikt zone-entry fallback in NODE-04.

## 8.5 `editor_minimap_hud`

Editor toont de minimap van de geopende/actieve Zone Group, niet willekeurig de startzone. Klik-focussen blijft editor-only.

---

# 9. Zone-audio, weather, paths en encounter anchors

## 9.1 `zone_music_assignment`

Inputs: zone/area + playlist reference. Output `audioAssignment`.

Fields:

```text
assignmentId
playlistRef
priority
fadeInMs
fadeOutMs
restartPolicy
conditionMode always|day|night|combat|custom_future
```

## 9.2 `zone_ambience_assignment`

Fields:

```text
assignmentId
audioEventRef
loop
volume
spatial
radius
priority
```

## 9.3 `zone_weather_assignment`

Fields:

```text
assignmentId
weatherProfileRef
weight
transitionSeconds
conditionMode
```

Weather definitions zelf komen in NODE-03 als catalog/presentation definition of blijven future placeholder. Broken refs blokkeren alleen zodra een assignment daadwerkelijk verbonden is.

## 9.4 `path_instance`

Output `path`.

Fields:

```text
pathId
label
points [{x,y,z,waitMs,speedMultiplier}]
mode loop|ping_pong|one_way
startIndex
reverse
pathBehaviorRef optional
pathTags
visibleInEditor
```

De lokale punten horen bij zonecoördinaten en worden nooit global gekopieerd.

## 9.5 `encounter_area`

Output `encounterArea`.

Fields:

```text
encounterAreaId
shape/bounds
activationMargin
deactivationMargin
leashToArea
resetWhenEmpty
minimumPlayers
maximumPlayers
```

De echte encounter/spawnlogica komt NODE-03.

---

# 10. Entity Composition basis

## 10.1 `model_entity` aanpassing

Outputs:

```text
entityBase: nieuw canonical output
entity: legacy alias tot NODE-05
```

Nieuwe fields:

```text
entityTags: tagList
renderLayer: world|foreground|background
persistenceScope: disposable|zone|instance|world
```

Transform/model/animation/collisionvelden blijven bestaan. `model_entity` krijgt geen quest-, vendor-, AI- of lootvelden.

## 10.2 `entity_assembly`

Inputs:

```text
base: entityBase required exactly one
components: entityComponent[]
```

Output: `entity`.

Fields:

```text
assemblyId
labelOverride optional
additionalTags tagList
runtimeEnabled true
```

Compileroutput:

```json
{
  "id": "entity.zone_home.bram",
  "base": { "...model/transform...": true },
  "components": {
    "movement": null,
    "interaction": null,
    "portal": null,
    "marker": null
  },
  "tags": [],
  "zoneId": "zone.home_base",
  "areaId": "area.home_base.village"
}
```

Duplicate singleton components zijn errors. Multi-components worden later expliciet per type toegestaan.

## 10.3 `movement_component`

Output `entityComponent`, componentKind `movement`.

Fields:

```text
componentId
moveSpeedOverride optional
turnSpeedOverride optional
acceleration
deceleration
movementMode static|patrol|wander|scripted
homeAnchorRef optional
leashDistance
```

NODE-02 implementeert static en patrol. Wander/advanced AI komt NODE-03.

## 10.4 `patrol_component`

Input `path`; output entityComponent kind patrol.

Fields:

```text
componentId
startMode first|nearest|random
waitPolicy path_points|fixed
fixedWaitMs
activeByDefault
```

Runtime laat een entity server-authoritative of deterministic editorpreview langs path bewegen. MMO-broadcastfrequentie blijft bestaand/tuned; geen databasewrite per tick.

## 10.5 `interaction_component`

Inputs:

```text
onInteract: action[]
enabledRules: markerRule/condition placeholder optional
dialogueFlowRef future reference allowed maar niet uitgevoerd tot NODE-04
```

Output entityComponent kind interaction.

Fields:

```text
componentId
prompt tokenText
range
requiresLineOfSight
requiresFacing
facingAngle
activationMode key_or_click|key_only|click_only|proximity
repeatMode always|once_per_character|once_per_session|cooldown
cooldownMs
authorityScope character|party|world
```

## 10.6 `action_show_message`

Output `action`.

Fields:

```text
actionId
message tokenText
durationMs
style info|success|warning|error
```

## 10.7 `action_use_zone_link`

Input/reference zoneLink; output action.

Fields:

```text
actionId
zoneLinkRef
```

## 10.8 `portal_component`

Input/reference zoneLink; output entityComponent kind portal.

Fields:

```text
componentId
zoneLinkRef
autoActivate false
```

## 10.9 `marker_component`

Input/reference marker definition/rule; output entityComponent kind marker.

Fields:

```text
componentId
markerRef
boneName optional
offsetX/Y/Z
```

## 10.10 `quest_target_binding`

Input exactly één targettype:

```text
entity
anchor
area
spawnPoint
checkpoint
zoneLink
encounterArea
```

Output `questTarget`.

Fields:

```text
targetId, canonical kind target
targetRoles: talk|interact|collect_area|defeat|reach|deliver|escort|portal|custom
label tokenText
markerRef optional
enabledByDefault true
```

NODE-02 compileert/registreert targets; questengine gebruikt ze pas NODE-04.

---

# 11. Legacy Interactable-migratie

De huidige `interactable` bezit eigen x/z, optioneel model en actionType message/teleport. Dat wordt vervangen.

## 11.1 Zonder model

```text
old interactable
-> location_anchor op oude x/z
-> entity_assembly met anchor entityBase
-> interaction_component
-> action_show_message of action_use_zone_link
-> entity output naar Zone/Area Output
```

## 11.2 Met model

```text
old interactable.modelAssetId
-> model_entity met oude model/x/z
-> entity_assembly
-> interaction_component
-> action...
```

## 11.3 Teleport zonder bestaande zone

Als legacy teleport alleen coordinates bevat:

- maak binnen compatibilityzone een target `spawn_point` role entry;
- maak een self-zone `zone_link` mode teleport;
- action_use_zone_link verwijst hiernaar;
- preview toont exact wat wordt gemaakt.

## 11.4 Oude node verwijderen

- na successful migration blijft oude node gemarkeerd `legacyMigrated=true`, hidden uit library;
- edges worden naar nieuwe entity output omgezet;
- oude node wordt pas fysiek verwijderd wanneer migration result gevalideerd en draft opgeslagen is;
- rollback snapshot wordt in `graph_migration_runs.plan_json/result_json` bewaard.

---

# 12. Zonepublicatie en opslag

## 12.1 Rootmanifest

`gameProject.zones` bevat een lichte index:

```json
{
  "startZoneId": "zone.home_base",
  "byId": {
    "zone.home_base": {
      "id": "zone.home_base",
      "displayName": "Home Base",
      "type": "outdoor_normal",
      "bounds": { "width": 500, "depth": 500 },
      "contentHash": "sha256:...",
      "packageUrl": "/api/game/zones/zone.home_base",
      "defaultSpawnId": "spawn.zone_home.default",
      "minimap": { "id": "minimap.zone_home", "url": "/assets/...webp" },
      "links": []
    }
  }
}
```

Heavy entities/terrain/areas gaan naar zonepackage.

## 12.2 Zonepackage

```json
{
  "schemaVersion": "gk-zone-package-v1",
  "buildId": "...",
  "zoneId": "zone.home_base",
  "contentHash": "sha256:...",
  "definition": {},
  "environment": {},
  "rules": {},
  "ground": {},
  "terrain": {},
  "collision": {},
  "lights": [],
  "cameraOverrides": [],
  "areas": {},
  "entities": [],
  "spawns": [],
  "checkpoints": [],
  "links": [],
  "discoveries": [],
  "questTargets": {},
  "markers": [],
  "minimap": {},
  "audio": [],
  "paths": [],
  "encounterAreas": [],
  "assetManifest": []
}
```

Arrays/maps worden deterministisch gesorteerd voor contenthash.

---

# 13. Database-migratie

Maak:

```text
db/migrations/005_zones_areas_spawns_travel.sql
```

SQL-verantwoordelijkheden:

```sql
ALTER TABLE player_profiles ADD COLUMN current_zone_id TEXT;

ALTER TABLE player_positions ADD COLUMN zone_id TEXT;
ALTER TABLE player_positions ADD COLUMN last_safe_spawn_id TEXT;
ALTER TABLE player_positions ADD COLUMN last_safe_x REAL;
ALTER TABLE player_positions ADD COLUMN last_safe_y REAL;
ALTER TABLE player_positions ADD COLUMN last_safe_z REAL;
ALTER TABLE player_positions ADD COLUMN last_safe_rotation_y REAL;

CREATE INDEX IF NOT EXISTS idx_player_positions_zone_id
  ON player_positions(world_id, zone_id);

CREATE TABLE IF NOT EXISTS player_zone_discoveries (
  player_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  discovery_id TEXT NOT NULL,
  discovered_at TEXT NOT NULL,
  source_event_id TEXT,
  PRIMARY KEY (player_id, world_id, zone_id, discovery_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_checkpoints (
  player_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('character', 'party', 'instance')),
  zone_id TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  activated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, world_id, scope),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS zone_transition_log (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  player_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  from_zone_id TEXT,
  to_zone_id TEXT NOT NULL,
  link_id TEXT NOT NULL,
  target_spawn_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('prepared', 'committed', 'cancelled', 'failed')),
  reason TEXT,
  created_at TEXT NOT NULL,
  committed_at TEXT,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_zone_transition_player
  ON zone_transition_log(player_id, created_at);

CREATE TABLE IF NOT EXISTS published_zone_state (
  zone_id TEXT PRIMARY KEY,
  build_id TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  zone_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_published_zone_build
  ON published_zone_state(build_id);

CREATE TABLE IF NOT EXISTS publish_history_zones (
  history_id TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  build_id TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  zone_json TEXT NOT NULL,
  published_at TEXT NOT NULL,
  PRIMARY KEY (history_id, zone_id),
  FOREIGN KEY (history_id) REFERENCES publish_history(id) ON DELETE CASCADE
);
```

`GraphRepository.publishWorld` wordt één transaction die rootmanifest, alle zonepackages, publish history en history zones schrijft. Half-publish is verboden.

---

# 14. Serverfiles en verantwoordelijkheden

Maak:

```text
src/server/zone-compiler.js
src/server/zone-service.js
src/server/zone-transition-service.js
src/server/checkpoint-service.js
src/server/zone-migration-service.js
src/shared/zone-contract.js
apps/web/public/shared/zone-utils.js
apps/web/public/shared/zone-runtime.js
apps/web/public/editor/zone-authoring.js
```

## `zone-compiler.js`

- resolve Zone/Area Groups;
- compile zonepackages;
- validate ownership/bounds/default spawn/minimap;
- build zone index;
- assetmanifest per zone;
- hashes.

## `zone-service.js`

- read published zonepackage;
- current zone voor player bepalen;
- zoneaccess/checks;
- root + active zone response bouwen;
- in-memory cache op buildId/contentHash.

## `zone-transition-service.js`

- prepare/commit/cancel state;
- operationId/idempotentie;
- linkconditions;
- targetspawn;
- playerprofile/position update in één transaction;
- MMO eventbroadcast.

## `checkpoint-service.js`

- activate checkpoint;
- last safe position;
- respawn/unstuck destination resolution;
- databasewrites alleen bij activatie/transition/unstuck, niet per frame.

## `zone-migration-service.js`

- bestaande legacyworld naar één compatibility Zone Group omzetten;
- interactables/spawn/minimap migreren;
- preview + apply + rollbackdata.

---

# 15. API-contract

## Editor

```text
GET  /api/editor/zones
GET  /api/editor/zones/:zoneId/summary
GET  /api/editor/zones/:zoneId/preview
GET  /api/editor/migrations/zones-v1/preview
POST /api/editor/migrations/zones-v1/apply
POST /api/editor/zones/:zoneId/minimap-bakes
```

Bestaande `/api/editor/minimap-bakes` blijft tijdelijk alias en vereist zoneId uit node.

## Game

```text
GET  /api/game/world
GET  /api/game/zones/:zoneId
GET  /api/game/zones/:zoneId/version
POST /api/game/zones/transition/prepare
POST /api/game/zones/transition/commit
POST /api/game/zones/transition/cancel
POST /api/game/checkpoints/:checkpointId/activate
POST /api/game/unstuck
```

Iedere game-route vereist geldige sessie.

## Responses

### Zonepackage

- `ETag`/contentHash header;
- `Cache-Control: private, no-cache` of conditionele fetch;
- 404 voor onbekende zone;
- 403 voor niet-toegankelijke zone wanneer een condition later blokkeert;
- buildId moet gelijk zijn aan rootmanifest; mismatch geeft `409 ZONE_BUILD_MISMATCH` en client reloadt rootmanifest.

---

# 16. WebSocket-contract

Nieuwe client->server events:

```text
zone:transition_request
zone:transition_commit
zone:transition_cancel
checkpoint:activate
player:unstuck_request
```

Nieuwe server->client events:

```text
zone:transition_prepare
zone:transition_rejected
zone:changed
checkpoint:activated
player:unstuck_result
world:zone_presence_snapshot
```

## 16.1 Twee-fasen transition

```text
1. Client interacteert met Zone Link.
2. Client stuurt transition_request {linkId, operationId, currentBuildId}.
3. Server valideert current zone, link, target zone/spawn en state.
4. Server schrijft zone_transition_log status prepared.
5. Server stuurt transition_prepare met transitionId, targetZoneId, packageUrl, contentHash en targetSpawn.
6. Client haalt target zonepackage op en bouwt/preloadt assets.
7. Client stuurt transition_commit.
8. Server update player profile + position + safe spawn atomisch.
9. Server markeert log committed en stuurt zone:changed/teleport snapshot.
10. Client maakt target zone actief en ruimt vorige zone volgens runtimepolicy op.
```

Timeout prepared transition: 30 seconden; daarna cancelled.

## 16.2 Presence

Remote players worden alleen in dezelfde `worldId + zoneId` zichtbaar. Bij zonewissel:

- oude zone krijgt remote_player:left;
- nieuwe zone krijgt remote_player:joined;
- same-account multiple sessions blijven één avatar volgens bestaande MMO-regels.

---

# 17. Runtimecontract

## 17.1 Gamebootstrap

```text
GET /api/game/player
-> currentZoneId bepalen
GET /api/game/world
-> rootmanifest + active zone summary
GET /api/game/zones/:currentZoneId
-> volledige zonepackage
worldRuntime.setZone(zonePackage)
-> WebSocket ready/presence voor dezelfde zone
```

## 17.2 Shared world runtime

Refactor `world-runtime.js` niet volledig. Voeg een duidelijke zonecontainerlaag toe:

```text
root scene
├── persistent global runtime roots
├── active zone root
├── preloaded next zone root optional
├── remote players current zone
└── editor helpers
```

Nieuwe publieke methods:

```text
setGameProjectShell(project)
setZone(zonePackage, options)
preloadZone(zonePackage)
activatePreloadedZone(zoneId)
unloadZone(zoneId)
getActiveZoneId()
getZoneDebugState()
```

`setWorld()` blijft compatibilitywrapper en roept intern `setGameProjectShell` + `setZone` aan.

## 17.3 Chunkgrid

- chunkcoordberekening gebruikt root `chunkGrid`;
- alle zonecontent gebruikt lokale zonecoördinaten voor chunking;
- zone origin wordt alleen voor world index/verbindingen gebruikt;
- edge chunks clippen geometry/collision aan bounds;
- max loaded 81 blijft harde cap;
- editor/game view policy mag verschillen, fysieke grid niet.

## 17.4 Minimap

- current zone map wordt gebruikt;
- world-to-pixel rekent exact op zonebounds;
- Y-as spiegeling wordt één canonical utility;
- markers buiten current zone worden niet op current minimap getekend;
- click-to-move blijft binnen zonebounds en gebruikt server-authoritative movement.

---

# 18. Playerposition, respawn en unstuck

## 18.1 Current zone

Bij eerste login na migratie:

1. bestaand `current_zone_id` gebruiken als geldig;
2. anders `project.startZoneRef`;
3. anders compatibilityzone;
4. position zone_id vullen;
5. positie controleren binnen bounds;
6. anders zone default spawn.

Geen hardcoded `0,0,0` behalve als expliciete laatste diagnostic fallback; normale publish vereist safe spawn.

## 18.2 Safe position

Update last safe position:

- na zone transition commit;
- bij checkpoint activation;
- periodiek alleen als player op walkable ground staat en niet in combat/transition; max één write per 10 seconden;
- niet iedere tick.

## 18.3 Unstuck

Fallbackvolgorde:

```text
actief instance checkpoint
-> actief character checkpoint
-> last safe spawn/position
-> zone default spawn
-> project start zone/start spawn
```

Rules in NODE-02:

- cooldown 120 sec hard engine default totdat `unstuck_rules` NODE-03 komt;
- niet tijdens pending zone transition;
- niet tijdens trade/market later;
- server valideert destination;
- operationId voorkomt dubbel uitvoeren;
- teleport als authoritative snapshot.

---

# 19. Migratie bestaande graph

Migration key:

```text
zones-v1
```

Preview/apply gebruikt NODE-01 graphrevisioncontract.

## 19.1 Compatibilityzone

Voor bestaande monolithische world:

```text
zoneId: zone.legacy_main
zoneType: outdoor_normal als ground ongeveer buitenwereld is, anders custom
bounds: bestaande Ground Surface bounds; als niet 500x500, custom type om content niet te wijzigen
```

Kevin kan later handmatig naar 500x500 normal profile aanpassen.

Migratie:

- maakt Zone Group;
- verplaatst bestaande ground/terrain/collision/lights/entities/scatter/interactables/minimap/spawn naar Zone Group;
- maakt Zone Environment/Rules/Output;
- maakt default spawn uit bestaande player_spawn;
- migreert Interactables volgens hoofdstuk 11;
- maakt Area Group `area.legacy_main.root` alleen als nodig om structuur te bewaren;
- verbindt Zone Output met Zone Registry;
- update project startZone/startSpawn;
- houdt editor/game settings/keybind/player/UI buiten zone;
- preserveert node IDs waar mogelijk;
- parentId-wijzigingen en edges gebeuren atomisch;
- preview vermeldt iedere move/create/delete/rewire.

## 19.2 Geen stille 500×500-resize

Legacy ground wordt nooit automatisch resized. Alleen nieuw gemaakte `outdoor_normal` zones krijgen 500×500 locked default.

---

# 20. Validationcodes

## Errors

```text
ZONE_GROUP_MISSING_DEFINITION
ZONE_GROUP_MISSING_OUTPUT
ZONE_ID_DUPLICATE
ZONE_PARENT_INVALID
ZONE_NORMAL_SIZE_INVALID
ZONE_BOUNDS_INVALID
ZONE_DEFAULT_SPAWN_MISSING
ZONE_DEFAULT_SPAWN_MULTIPLE
ZONE_SPAWN_OUT_OF_BOUNDS
ZONE_SPAWN_BLOCKED
ZONE_LINK_TARGET_ZONE_MISSING
ZONE_LINK_TARGET_SPAWN_MISSING
ZONE_LINK_TARGET_SPAWN_WRONG_ZONE
ZONE_MINIMAP_MISSING
ZONE_MINIMAP_BOUNDS_MISMATCH
ZONE_CHUNK_GRID_MISMATCH
AREA_PARENT_INVALID
AREA_BOUNDS_INVALID
AREA_OUTPUT_MISSING
ENTITY_ASSEMBLY_BASE_MISSING
ENTITY_ASSEMBLY_BASE_MULTIPLE
ENTITY_COMPONENT_DUPLICATE
QUEST_TARGET_DUPLICATE
QUEST_TARGET_INPUT_INVALID
CHECKPOINT_SPAWN_INVALID
PUBLISHED_ZONE_BUILD_MISMATCH
```

## Warnings

```text
ZONE_NO_DIRECTIONAL_LIGHT
ZONE_NO_AMBIENCE
ZONE_LINK_REVERSE_MISSING
ZONE_SEAMLESS_FALLBACK_LOADING
AREA_OVERLAP_EQUAL_PRIORITY
ENTITY_WITHOUT_ASSEMBLY_LEGACY
LEGACY_INTERACTABLE_PENDING_MIGRATION
MINIMAP_STALE_CONTENT_HASH
```

---

# 21. Bestanden

## Verplicht aanpassen

```text
src/shared/node-types.js
src/shared/node-contract.js
src/server/field-validation.js
src/server/graph-repository.js
src/server/publish-service.js
src/server/game-project-compiler.js
src/server/mmo-service.js
src/server/server.js
apps/web/public/editor/editor.js
apps/web/public/editor/index.html
apps/web/public/editor/styles.css
apps/web/public/shared/world-runtime.js
apps/web/public/shared/minimap-utils.js
apps/web/public/game/game.js
apps/web/public/game/styles.css
scripts/smoke-test.js
scripts/game-browser-check.js
package.json
README/fases/README.md
```

## Verplicht nieuw

```text
db/migrations/005_zones_areas_spawns_travel.sql
src/shared/zone-contract.js
src/server/zone-compiler.js
src/server/zone-service.js
src/server/zone-transition-service.js
src/server/checkpoint-service.js
src/server/zone-migration-service.js
apps/web/public/shared/zone-utils.js
apps/web/public/shared/zone-runtime.js
apps/web/public/editor/zone-authoring.js
tests/zone-compiler.test.js
tests/zone-validation.test.js
tests/zone-transition.test.js
tests/checkpoint-unstuck.test.js
tests/entity-assembly.test.js
tests/legacy-interactable-migration.test.js
tests/minimap-zone.test.js
README/fases/NODE-02-Zones-Areas-Entity-Composition-Spawns-Travel-Minimap.md
```

---

# 22. Tests

## Unit/contract

1. outdoor normal exact 500×500;
2. edge chunk clipping bij 500/14;
3. 14×14/max81 rootgrid gebruikt door editor en game;
4. default spawn precies één;
5. spawn blockers/bounds;
6. area parent/priority;
7. zone package deterministic hash;
8. root index en separate package matching buildId;
9. entity assembly duplicate component errors;
10. location anchor entityBase zonder gamegeometry;
11. legacy interactable message/teleport migration;
12. minimap 2048/bounds/world-pixel conversion;
13. transition prepare/commit/cancel/idempotency;
14. transition stale build mismatch;
15. checkpoint activation persistence;
16. unstuck fallback order;
17. presence filtered op zoneId;
18. publish root + zones atomisch;
19. migration preview no writes/idempotent apply.

## Smoke

Maak via normale API tijdelijke authored content:

- root foundation uit NODE-01;
- twee 500×500 zones;
- elk ground, environment, default spawn, minimap metadata;
- één Area Group;
- één GLB Model Entity + Entity Assembly;
- één Location Anchor;
- één interaction/portal action;
- Zone Link A->B en B->A;
- Zone Outputs -> Registry -> Assembly -> Game Output;
- publish;
- fetch beide zonepackages;
- player start in A;
- prepare/commit naar B;
- position/zone persistent na refresh;
- unstuck naar B default spawn;
- current minimap is B;
- unconnected zone niet gepubliceerd;
- invalid link blokkeert publish.

## Browser

- screenshot Zone Group root;
- screenshot binnen Zone Group;
- viewport entity/anchor/spawn helpers;
- per-zone minimap;
- game before/after zone transition;
- refresh proof;
- no console errors.

---

# 23. Kevin-zichtbaar testscript

```text
1. Open editor en controleer dat NODE-01 rootgraph nog intact is.
2. Maak Zone Group Home Base.
3. Controleer automatisch Group Input/Output en zonePackage output.
4. Voeg Zone Definition toe; controleer outdoor_normal 500x500.
5. Voeg Ground Surface, environment, ambient/directional light toe.
6. Voeg Spawn Point role zone_default toe en plaats zichtbaar in viewport.
7. Voeg Minimap Bake toe; bake 2048x2048.
8. Maak Area Group Village Center en verbind Area Output met Zone Output.
9. Plaats een echte GLB als Model Entity.
10. Verbind Model Entity.entityBase met Entity Assembly.base.
11. Voeg Movement/Interaction/Marker component toe.
12. Controleer dat één echte mesh blijft selecteerbaar/verplaatsbaar.
13. Maak Quest Target Binding voor de entity; alleen registratie, nog geen quest.
14. Maak tweede Zone Group Road met eigen ground/settings/spawn/minimap.
15. Maak portal/door entity en Zone Links heen/terug.
16. Verbind beide Zone Outputs met Zone Registry.
17. Save Draft en refresh; controleer behoud.
18. Publish.
19. Start /game/ in Home Base.
20. Controleer Home Base minimap.
21. Gebruik portal naar Road.
22. Controleer veilige overgang, juiste spawn en juiste minimap.
23. Refresh/login opnieuw; controleer dat player in Road blijft.
24. Activeer checkpoint en loop ergens anders heen.
25. Gebruik Unstuck; controleer checkpoint/default fallback.
26. Open tweede account in Home Base en controleer dat die niet als remote in Road verschijnt.
27. Maak tijdelijke invalid link en controleer publisherror met node/fixhint.
```

---

# 24. Evidence

Folder:

```text
README/fases/evidence/NODE-02-zones-areas-travel/
```

Verplicht:

```text
README.md
acceptance-result.md
migration-preview.json
migration-result.json
editor-root-zones.png
editor-zone-inside.png
editor-area-group.png
editor-entity-assembly.png
editor-spawn-anchor.png
editor-zone-minimap-home.png
editor-zone-minimap-road.png
game-home-zone.png
game-road-zone.png
game-zone-transition.webm of frame-sequence
player-zone-database-proof.md
published-root-manifest.json
published-zone-home.json
published-zone-road.json
checks.txt
browser-console.txt
```

---

# 25. Performance

- rootmanifest bevat geen volledige zware zonecontent;
- game haalt alleen current/preload target zonepackage op;
- zonepackagecache keyed door buildId+hash;
- zone transition preload bouwt assets budgeted, niet één lange blocking loop;
- oude zonecontent wordt na transition volgens chunk/asset refcount veilig vrijgegeven;
- maximaal één actieve en één preloaded zone in NODE-02;
- minimap is baked WebP, geen tweede live 3D-camera;
- markerupdate respecteert bestaande throttling;
- geen extra RAF-loop;
- editor active zone preview rebuild alleen als zone-relevante nodes veranderen;
- player position DB-write blijft debounced.

---

# 26. Security en authority

- client kan geen willekeurige toZone/toPosition sturen; alleen linkId;
- server resolveert target uit published manifest;
- transition operationId uniek;
- checkpointactivation valideert afstand/zone;
- unstuck destination server-side;
- player current zone en position in één transaction;
- target package buildId moet current published build matchen;
- zones/API lekken geen editor-only fields;
- editorhelpers niet in gamepackage/rendering.

---

# 27. Buiten scope

- items/enemies/combat/resources/loot: NODE-03;
- echte questprogressie: NODE-04;
- marketplace/trade/party: NODE-05;
- los opgeslagen Graph Assets;
- onbeperkt meerdere simultaneously loaded zones;
- volledige seamless persistent terrain stitch tussen zones;
- navmeshgenerator;
- GLB triangle collision;
- procedural zone generation;
- server shards/instances buiten datamodelvoorbereiding.

---

# 28. Verboden shortcuts/faalcriteria

Niet klaar als:

- zone slechts een labelfield is en content nog direct naar Game Output gaat;
- zonecontent in losse JSON buiten nodes wordt onderhouden;
- editor/game verschillende chunkmaten gebruiken;
- 500×500 stil naar 504×504 wordt gemaakt;
- player direct op client gekozen zone/coords teleporteert;
- iedere Group verplicht eigen spawn krijgt in plaats van zone default + optionele checkpoints;
- minimap één globale bake blijft;
- Model Entity wordt gekopieerd door componentnodes;
- legacy Interactable nog model/positie-eigenaar blijft;
- zone transition alleen visueel is zonder DB/state-update;
- andere-zone remote players zichtbaar blijven;
- tests groen zijn zonder echte zonewissel op public URL.

---

# 29. Definition of Done

- [ ] Zone/Area specialized Groups werken;
- [ ] alle zone-/area-/spawn-/travel-/marker-nodes bestaan;
- [ ] normale zone exact 500×500;
- [ ] 14×14/max81 afgedwongen;
- [ ] Zone Output/Registry/World Assembly compileert;
- [ ] separate published zonepackages bestaan;
- [ ] root/zone buildId en hashes matchen;
- [ ] player current zone persistent;
- [ ] zone transition twee-fasen server-authoritative;
- [ ] checkpoint/unstuck werken;
- [ ] per-zone 2048 minimap werkt;
- [ ] active-zone HUD switcht;
- [ ] Entity Assembly en basiscomponenten werken;
- [ ] legacy interactable/spawn/world migratie veilig;
- [ ] npm check/test/smoke groen;
- [ ] public browserbewijs/evidence compleet.

---

# 30. Verplichte Codex-eindrapportage

1. Samenvatting;
2. baseline/eind-HEAD;
3. aangepaste bestanden met reden;
4. migration 005;
5. nieuwe nodes/poorten;
6. Zone/Area packagevorm;
7. Entity Assembly/migratie;
8. zone transition/checkpoint/unstuck;
9. minimapresultaat;
10. API/WS-events;
11. checks;
12. public browserproof;
13. evidencepaden;
14. known limitations;
15. expliciet buiten scope;
16. go/no-go NODE-03.

---


# 31. Volledige dekking van bestaande world-/zonenodes

Deze aanvullende contractsectie maakt alle huidige worldnodes expliciet onderdeel van de zonearchitectuur.

## 31.1 Bestaande nodes

| Bestaande node | Plaats na NODE-02 | Contract |
|---|---|---|
| `ground_surface` | exact één primaire ground per normal outdoor Zone Group | Default 500×500. Edge chunks clippen op bounds. Output naar `zone_output.ground`, niet rechtstreeks Game Output. Speciale zoneprofielen mogen alleen met expliciete `zone_definition.zoneType/sizeOverride`. |
| `terrain_layer` | Zone of Area Group | Output naar Area/Zone Output. Polygon/full shape blijft lokaal. Geen global catalogkabel. |
| `surface_layer` | Zone of Area Group | Paden/water/lava/sneeuw/modder blijven lokale geometry/materialdata; output naar Area/Zone Output. |
| `blocker_area` | Zone of Area Group | Expliciete gameplaycollision, los van GLB. Output naar Area/Zone Output. |
| `walkable_surface` | Zone of Area Group | Brug/platformhoogte en walkability; output naar Area/Zone Output. |
| `ambient_light` | Zone/Area environment | Per-zone licht; area override toegestaan met priority. |
| `directional_light` | Zone/Area environment | Per-zone sun/light direction; globale render/shadowperformance blijft in World Settings. |
| `player_spawn` | deprecated/migreren | Automatisch naar `spawn_point` met role `zone_default`; old node niet meer maakbaar na succesvolle migration. |
| `bounded_area_scatter` | Zone/Area statische content | Blijft voor bomen/props. Output wordt entityBase/entities in package. Niet gebruiken voor levende enemies/resources met respawnstate. |
| `minimap_bake` | exact per Zone Group | 2048×2048 WebP default, bounds uit exact zone/ground. Output naar Zone Output. |
| `game_minimap_hud` | globale UI | Resolveert automatisch minimap van active zone via Zone Registry; geen handmatig global source ID als enige route. |
| `editor_minimap_hud` | editor-only active zone | Niet als gameplaymodule publiceren. |
| `model_entity` | Zone/Area | Wordt `entityBase` voor `entity_assembly`; transform blijft viewportselecteerbaar. |
| `interactable` | alleen migration source | Geen nieuwe instances; omzetting volgens legacycontract naar anchor/entity + `interaction_component`. |

## 31.2 `zone_camera_override`

Voeg deze node in NODE-02 daadwerkelijk toe.

**Inputs:**

```text
area optional
baseCameraRef optional exact @camera.* of default game camera
conditions optional
```

**Output:** `cameraOverride`

**Velden:**

```text
cameraOverrideId identity
scope zone|area
priority integer
blendDurationMs integer >= 0
pitch optional
yaw optional
startDistance optional
minDistance optional
maxDistance optional
fov optional
targetHeightOffset optional
follow optional
rotateSpeed optional
activationMode always|on_enter|condition
restoreMode previous|global_default
```

Rules:

- alleen ingevulde waarden overschrijven de globale `game_camera`;
- editorcamera wordt nooit als base gebruikt;
- meerdere actieve overrides: hoogste priority, daarna meest specifieke Area, daarna stable ID;
- invalid min/max zoom blokkeert publish;
- runtime blendt zonder een tweede renderloop;
- output gaat naar `area_output` of `zone_output`, nooit direct Game Output.

## 31.3 Licht en zone-overerving

Canonical volgorde:

```text
global game render/performance policy
-> zone_environment_settings
-> ambient_light/directional_light definitions
-> area_environment_override/zone_camera_override
-> tijdelijke runtime quest/world-state override
```

De laatste laag mag alleen whitelisted environmentproperties wijzigen en wordt door published actions/conditions gestuurd.

---

# 32. Onderzoeksbasis

- Unreal World Partition beschrijft een logische wereld die technisch in afstandsgebaseerd geladen gridcellen wordt verdeeld: `https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partitioned-navigation-mesh`.
- Streaming Sources koppelen cell-loading aan een positie, bijvoorbeeld player of teleportbestemming: `https://dev.epicgames.com/documentation/en-us/fortnite/streaming-source`.
- Node-RED Subflows ondersteunen de keuze om Zone/Area-groepen achter typed interfaces samen te vouwen: `https://nodered.org/docs/user-guide/editor/workspace/subflows`.

GK gebruikt deze principes met zijn eigen 14×14/max81-contract en bestaande Three.js/SQLite-runtime.
