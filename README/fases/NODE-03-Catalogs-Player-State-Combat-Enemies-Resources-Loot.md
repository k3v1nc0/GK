# NODE-03 — Global Catalogs, Player State, Inventory, Abilities, Combat, Enemies, Resources en Loot

**Documenttype:** uitvoeringscontract voor Codex  
**Status:** implementeren nadat NODE-02 volledig is geaccepteerd  
**Repository:** `k3v1nc0/GK`  
**Baseline:** eind-HEAD van NODE-02  
**Afhankelijkheden:** NODE-01 symbols/refs/tokens/packages en NODE-02 zones/entity assembly/spawns  
**Vervolg:** NODE-04 — Campaigns, Quests, Dialogue, Conditions, Actions en Rewards  
**Contractversie:** `node-system-contract-v1.0`

---

# 1. Opdracht aan Codex

Bouw de volledige data- en runtimebasis voor herbruikbare globale gamecontent en blijvende playerprogressie. Na deze fase kan één globale enemydefinition op tientallen plekken in meerdere zones worden gebruikt, kan de player met node-defined abilities vechten, resources verzamelen, loot oppakken, items/equipment/currency bewaren en na opnieuw inloggen doorgaan.

Verplichte end-to-end keten:

```text
Global Item / Ability / Enemy / Resource / Loot definitions
-> Catalog Output
-> Catalog Registry
-> World Assembly
-> Game Output
-> published typed catalog

Zone Enemy/Resource/Pickup Spawn nodes
-> Spawn Set/Controller
-> Zone Output
-> published zonepackage
-> server runtime spawnt instances

Player intent
-> server authority/validation
-> combat/gather/pickup mutation
-> atomic database transaction + operationId
-> inventory/wallet/abilities/equipment/progression
-> WebSocket state update
-> HUD en gamewereld zichtbaar
-> refresh/login behoudt state
```

Codex hoeft niet te kiezen welk combat-, loot-, inventory- of catalogmodel wordt gebruikt. Dit contract is leidend.

---

# 2. Niet-onderhandelbare regels

1. Definitions staan in nodes/published catalog; player- en runtime-state staat in database/server memory.
2. Client bepaalt nooit damage, loot, XP, itemownership, currency, cooldown of enemydeath.
3. Eén enemydefinition wordt niet per spawn gekopieerd.
4. Itemdefinition, inventory stack, unique item instance, world pickup en quest/rewardreference zijn verschillende objecten.
5. Currency wordt als wallet/minor units opgeslagen, niet als normaal inventory-item.
6. Alle inventory/currency/XP/ability-mutaties gebruiken atomische transacties en een unieke `operationId`.
7. Geen databasewrite per servertick/frame.
8. Enemy AI/combat gebruikt de bestaande authoritative worldtick; geen tweede ongecontroleerde tick/RAF/timerloop.
9. WebSocket `bufferedAmount`, inputrate en clientbacklog worden begrensd; WebSocket heeft geen automatische backpressure.
10. Geen seeded definitions of demo-enemies.
11. Geen arbitrary scripts/eval in formulas/AI/abilities.
12. Runtime asset/entity helpers blijven echte GLB’s gebruiken, geen proxyboxen als acceptatieresultaat.
13. Normale enemies/resources mogen disposable in memory zijn; alleen expliciet persistent state gaat naar DB.
14. Death en respawn gebruiken NODE-02 checkpoints/spawns.
15. Crafting/vendor/market/direct trade worden pas NODE-05 uitgevoerd; hun definitionrefs mogen al voorbereid worden waar expliciet beschreven.

---

# 3. Tastbaar eindresultaat

Na NODE-03 kan Kevin:

- Global Catalog Groups vullen met item-, currency-, stat-, ability-, enemy-, resource-, loot-, animation-, audio- en VFX-nodes;
- `@item...`, `@enemy...`, `@ability...` en `#tag...` in typed pickers gebruiken;
- één Forest Wolf-definitie maken;
- diezelfde wolf in drie zones met verschillende level/variant/spawnregels plaatsen;
- de wolf met een node-defined basic attack aanvallen;
- wolfhealth, damage, deathanimation, respawn en loot zichtbaar zien;
- server-generated gold/items oppakken;
- een resource zoals hout of steen verzamelen met animation/audio/VFX;
- inventory, equipment, wallet, XP/level en unlocked abilities in HUD/menu zien;
- items stacken en unique equipment apart bewaren;
- abilityslots instellen;
- doodgaan en bij NODE-02 checkpoint/default spawn respawnen;
- refresh/logout/login doen zonder verlies van items, geld, level, ability of equipment;
- twee clients dezelfde authoritative enemy/resource state zien wanneer scope shared is;
- controleren dat dezelfde enemydefinition niet 50 keer is gekopieerd.

---

# 4. Catalogstructuur

Published catalogvorm:

```json
{
  "items": {},
  "itemModifiers": {},
  "resources": {},
  "currencies": {},
  "equipmentSlots": {},
  "stats": {},
  "statBlocks": {},
  "statCurves": {},
  "abilities": {},
  "abilityRanks": {},
  "statusEffects": {},
  "damageTypes": {},
  "combatProfiles": {},
  "enemies": {},
  "npcs": {},
  "variants": {},
  "aiProfiles": {},
  "pathBehaviors": {},
  "animationSets": {},
  "lootTables": {},
  "recipes": {},
  "factions": {},
  "reputationTracks": {},
  "musicTracks": {},
  "musicPlaylists": {},
  "audioEvents": {},
  "vfx": {},
  "difficultyProfiles": {},
  "respawnPolicies": {}
}
```

Alle maps zijn keyed op canonical ID. Definitions bevatten `definitionVersion`, `contentHash`, tags en dependencyrefs.

---

# 5. Nieuwe datatypes

```text
playableCharacterDef
itemDef
itemModifierDef
resourceDef
currencyDef
equipmentSlotDef
statDef
statBlock
statCurve
abilityDef
abilityRankDef
statusEffectDef
damageTypeDef
combatProfile
enemyDef
npcDef
variantDef
aiProfile
pathBehaviorDef
animationSet
lootEntry
lootTable
recipeDef
recipeIngredient
factionDef
reputationDef
musicTrackDef
musicPlaylistDef
audioEventDef
vfxDef
difficultyDef
respawnPolicy
spawnEntry
spawnSet
spawnController
encounter
playerPolicy
inventoryPolicy
equipmentPolicy
abilityPolicy
xpRule
deathPolicy
unstuckPolicy
uiModule
```

`catalogDefinition` blijft de generieke alias waarmee iedere definition naar Catalog Output kan.

---

# 6. Definitionnode-conventie

Iedere definitionnode heeft minimaal:

```text
<kind>Id: identity
displayName: text/localizedText
internalLabel: text optional
definitionVersion: integer default 1
tags: tagList
description: tokenText/localizedText optional
enabled: boolean default true
```

Compilerregels:

- unconnected definition niet gepubliceerd;
- disabled definition wel inspecteerbaar maar niet runtime-selecteerbaar, tenzij bestaande refs migrationwarning geven;
- dependencycycle alleen toegestaan waar expliciet, bijvoorbeeld nested loot met cycleverbod;
- ID immutable na publish, aliasmigratie vereist;
- definitioncontenthash wordt zonder nodepositie/editor metadata berekend.

---

# 7. Character, item, currency en statnodes

## 7.1 `playable_character_definition`

Inputs:

```text
statBlock
animationSet
combatProfile
equipmentPolicy optional
```

Output: `playableCharacterDef` + `catalogDefinition`.

Fields:

```text
characterId
displayName
modelAssetId
iconAssetId
classTags
baseMoveSpeed
sprintMultiplier
turnSpeed
collisionRadius
scale
startingAbilityRefs: referenceList ability
startingItemGrants: json [{itemRef, amount}]
startingCurrencyGrants: json [{currencyRef, amountMinor}]
defaultLoadoutId
```

Starting grants worden uitsluitend bij eerste playerinitialisatie uitgevoerd met idempotent operation `character_init:<playerId>:<characterId>:v<definitionVersion>`.

## 7.2 `item_definition`

Output `itemDef` + catalogDefinition.

Fields:

```text
itemId
displayName
description
iconAssetId
worldModelAssetId
category
subcategory
rarity: common|uncommon|rare|epic|legendary|quest|custom
stackable
stackLimit
weight
vendorBaseValueMinor
vendorCurrencyRef
bindPolicy: unbound|bind_on_pickup|bind_on_equip|character_bound|account_bound|quest_bound
tradable
droppable
destroyable
marketEligible
questItem
equipmentSlotRef optional
durabilityMax optional
useActionRefs future action references
statModifierRefs
pickupAudioRef
pickupVfxRef
pickupAnimationRef optional
inventoryTags
```

Validation:

- stackable false -> stackLimit 1;
- equipment -> stackable false en equipmentSlotRef verplicht;
- quest_bound/questItem -> marketEligible false, tradable false;
- durability alleen unique equipment;
- currencyref/value consistent.

## 7.3 `item_modifier_definition`

Fields:

```text
modifierId
displayName
applicableItemTagQuery
statChanges [{statRef, operation add|multiply|set, min, max}]
statusEffectRefs
rarityWeight
exclusiveGroup optional
```

## 7.4 `currency_definition`

Fields:

```text
currencyId
displayName
iconAssetId
precision 0..4
maxBalanceMinor integer
tradable
marketAllowed
showInPrimaryWallet
sortOrder
sourceTags
sinkTags
```

Alle databasebedragen zijn integers in minor units. UI formatteert volgens precision.

## 7.5 `equipment_slot_definition`

Fields:

```text
slotId
displayName
allowedItemTags tagQuery
maxItems default 1
conflictingSlotRefs
uiOrder
```

## 7.6 `stat_definition`

Fields:

```text
statId
displayName
valueType integer|decimal|percent
minimum
maximum
defaultValue
persistCurrentValue
replicateMode owner|nearby|all|none
uiFormat
```

Canonical basisstats voor engineexecutors worden via refs gekozen, niet hardcoded names. Player Rules identificeert welke refs health/mana/stamina/armor zijn.

## 7.7 `stat_block`

Inputs: formula/value nodes optional. Output `statBlock`.

Fields:

```text
statBlockId
entries [{statRef, baseValue, formulaRef optional}]
overrideMode merge|replace
```

## 7.8 `stat_curve`

Fields:

```text
curveId
inputKind level|rank|party_size|custom
interpolation linear|step|smooth
points [{x,y}]
clampBefore
clampAfter
```

Points x ascending; duplicate x error.

---

# 8. Ability-, status- en combatnodes

## 8.1 `damage_type_definition`

Fields:

```text
damageTypeId
displayName
resistanceStatRef optional
color
hitVfxRef
hitAudioRef
```

## 8.2 `status_effect_definition`

Fields:

```text
statusEffectId
displayName
iconAssetId
durationMs
maxStacks
stackMode refresh_duration|add_duration|independent|replace_stronger
tickIntervalMs optional
statModifierRefs
damagePerTickFormula optional
healPerTickFormula optional
damageTypeRef optional
dispelTags
immunityTags
controlType none|stun|root|slow|silence|fear|knockback
controlStrength
applyVfxRef
loopVfxRef
removeVfxRef
```

## 8.3 `ability_definition`

Inputs:

```text
rankDefinitions[] optional
statusEffects[] optional
```

Fields:

```text
abilityId
displayName
description
iconAssetId
abilityType basic_attack|melee|ranged|spell|heal|buff|debuff|movement|passive|gather
resourceCostStatRef optional
resourceCostFormula
cooldownMs
castTimeMs
globalCooldownMs
range
minimumRange
areaShape single|circle|cone|line|self|ground_target
areaRadius
coneAngle
targetMode enemy|ally|self|ground|resource
requiresLineOfSight
requiresWeaponTagQuery optional
damageFormula optional
healFormula optional
damageTypeRef optional
statusEffectRefs
animationRole
castAudioRef
impactAudioRef
castVfxRef
impactVfxRef
interruptible
movementAllowedDuringCast
serverPredictionMode none|local_animation_only
```

Formulas gebruiken safe value/formula-contract. Server leest authoritative stats/level.

## 8.4 `ability_rank`

Fields:

```text
abilityRankId
abilityRef
rank
requiredPlayerLevel
costMultiplier
damageFormulaOverride
healFormulaOverride
cooldownOverrideMs
statusEffectOverrides
```

## 8.5 `combat_profile`

Inputs/refvelden:

```text
basicAttackRef
abilityRefs
conditionRefs future
```

Fields:

```text
combatProfileId
preferredRange
aggroResponse passive|defensive|aggressive
abilitySelection sequential|priority|weighted|conditions
rotationEntries [{abilityRef, priority, weight, minRange, maxRange}]
targetPriority nearest|lowest_health|highest_threat|random
canFlee
fleeHealthPercent
enrageHealthPercent optional
enrageStatusEffectRef optional
```

## 8.6 Combatformula-standaard

Geen verborgen RPG-formule hardcoderen. Iedere ability heeft formula. Engine biedt alleen whitelisted operands:

```text
attacker.level
attacker.stat.<id>
target.level
target.stat.<id>
ability.rank
random.criticalRoll
```

Enginecapabilities die wel vast mogen zijn:

- rangecheck;
- cooldowncheck;
- line of sight;
- critical roll;
- damage clamp minimaal 0;
- authoritative transaction/event;
- deathdetectie.

Een project kan via formulas bepalen hoeveel damage ontstaat.

---

# 9. Enemy, NPC, AI, variants en presentation

## 9.1 `enemy_archetype`

Inputs/refs:

```text
statBlock required
combatProfile required voor combatant enemy
aiProfile required
animationSet required
lootTable optional
faction optional
difficulty optional
```

Fields:

```text
enemyId
displayName
species
role normal|ranged|healer|tank|elite|boss|ambient
modelAssetId
iconAssetId
baseLevel
minimumLevel
maximumLevel
scale
collisionRadius
networkProfile low|normal|boss
corpseDurationMs
defaultRespawnPolicyRef
nameplateMode
bestiaryCategory
```

## 9.2 `npc_archetype`

Fields vergelijkbaar, maar zonder verplichte loot/combat. Role:

```text
civilian|quest_giver|vendor|trainer|guard|companion|craftsman|custom
```

Dialogue/vendor/questcomponenten komen later/lokaal.

## 9.3 `entity_variant`

Fields:

```text
variantId
baseKind enemy|npc|item
baseRef
displayNameOverride
modelAssetOverride
statBlockOverrideRef
statMultipliers
abilityAddRefs
abilityRemoveRefs
lootOverrideRef
factionOverrideRef
tagAdds
tagRemoves
scaleMultiplier
```

Compiler resolveert variant naar base+delta en bewaart ook refs voor debugging.

## 9.4 `ai_behavior_profile`

Fields:

```text
aiProfileId
idleMode stand|patrol|wander|sleep
sightRange
hearingRange
aggroRange
assistRange
leashDistance
returnHealPercentPerSecond
preferredRange
chaseSpeedMultiplier
fleeThresholdPercent
callForHelp
callForHelpCooldownMs
lostTargetTimeoutMs
wanderRadius
thinkIntervalMs
sleepOutsideInterest
stuckTimeoutMs
```

Constraints:

- thinkInterval minimaal 100ms normal, boss minimaal 50ms;
- AI tick budget per zone;
- sleeping enemy voert geen think uit;
- geen pathfinding/navmesh in NODE-03; movement gebruikt direct path/steering en bestaande collision.

## 9.5 `path_behavior_profile`

Fields:

```text
pathBehaviorId
mode loop|ping_pong|one_way|wander
baseSpeed
waitMinMs
waitMaxMs
randomStart
stuckRecoveryMode return_home|next_point|despawn_respawn
```

## 9.6 `animation_set`

Fields:

```text
animationSetId
modelAssetId optional validation source
idleClip
walkClip
runClip
basicAttackClip
abilityClipMap json abilityRef->clip
castClip
hitClip
deathClip
spawnClip
gatherClip
interactClip
emoteClipMap
blendDurationMs
```

Cliprefs worden tegen assetmetadata gevalideerd.

## 9.7 `faction_definition`

Fields:

```text
factionId
displayName
relations [{factionRef, relation hostile|neutral|friendly, value}]
defaultPlayerRelation
pvpTags
```

## 9.8 `difficulty_profile`

Fields:

```text
difficultyId
displayName
healthMultiplier
damageMultiplier
armorMultiplier
speedMultiplier
xpMultiplier
lootMultiplier
partyScalingCurveRef optional
```

## 9.9 `respawn_policy_definition`

Fields:

```text
respawnPolicyId
minDelayMs
maxDelayMs
jitterMode uniform|none
maxAliveDefault
corpseDurationMs
despawnDistance
resetEncounterOnWipe
oneTimeSpawn
persistentDefeatFlagRef optional future
```

---


## 9.10 `reputation_track`

**Output:** `reputationDef`

Fields:

```text
reputationId identity, namespace reputation.*
factionRef exact @faction.*
displayName tokenText
description tokenText
minimumValue integer
maximumValue integer
startValue integer
ranks [{rankId, displayName, minValue, color/icon optional}]
decayPolicy none|online_time|calendar optional future-safe
accountOrCharacterScope character|account
unlockActionRefs optional
vendorPriceModifierFormulaRef optional
tags tagList
```

Rules:

- rank thresholds strikt oplopend en binnen min/max;
- player mutable value wordt pas in NODE-04 migration/state geschreven;
- definitions gaan naar Catalog Output;
- conditions/actions gebruiken exact `reputationId`, niet faction display name;
- geen reputationwaarde in editor nodes als live playerstate.

## 9.11 `music_track`

**Output:** `musicTrackDef`

Fields:

```text
musicTrackId identity
displayName tokenText
audioAssetId required audio asset
loop boolean
loopStartSeconds optional
loopEndSeconds optional
volume 0..1
fadeInMs
fadeOutMs
moodTags tagList
bpm optional
priority integer
preloadPolicy on_zone_preload|on_demand
```

Validate assettype/audio metadata en loopbounds. Een track wordt door `zone_music_assignment` of playlistref gebruikt; geen directe globale kabel naar iedere zone.

## 9.12 `music_playlist`

**Inputs:** `musicTrackDef[]`

**Output:** `musicPlaylistDef`

Fields:

```text
musicPlaylistId identity
displayName tokenText
playMode sequential|shuffle|weighted
crossfadeMs
avoidImmediateRepeat boolean
combatPlaylistRef optional
dayPlaylistRef optional
nightPlaylistRef optional
trackWeights json/map by track ID
tags tagList
```

Compiler output bevat alleen track IDs/weights en valideert recursive playlistrefs/cycles.

## 9.13 `audio_event`

**Output:** `audioEventDef`

Fields:

```text
audioEventId identity
displayName tokenText
audioAssetIds refList<audio>
selectionMode random|sequential|weighted
weights optional
volumeMin/volumeMax
pitchMin/pitchMax
spatial boolean
minDistance/maxDistance
cooldownMs
maxConcurrent
scope local|player|party|zone
loop boolean
priority integer
```

Gebruikt door abilities, pickups, resources, entities, quests en UI. Runtime heeft één audio event executor/cache; individuele systemen laden niet zelf dezelfde assets.

## 9.14 `vfx_definition`

**Output:** `vfxDef`

Fields:

```text
vfxId identity
displayName tokenText
kind sprite|billboard|model|mesh_effect|screen_overlay
textureAssetId/modelAssetId optional afhankelijk kind
lifetimeMs
loop boolean
scale
attachmentPoint root|hand_left|hand_right|weapon|target|ground|custom
customAttachmentName optional
followTarget boolean
rotationMode fixed|face_camera|align_surface
lowPerformanceFallbackRef optional
maxConcurrentPerSource
priority
```

Rules:

- geen zware algemene particleframeworkswitch;
- VFX executor gebruikt bestaande Three.js-runtime en pooled/lightweight instances;
- ontbrekende attachment valt expliciet terug op root met warning;
- assetrefs en fallbackcycle worden gevalideerd.

---

# 10. Lootnodes

## 10.1 `loot_table`

Inputs `lootEntry[]`; output lootTable+catalogDefinition.

Fields:

```text
lootTableId
rollMode independent|weighted_pick|all
rollCount
allowDuplicates
ownershipMode personal|shared|party_policy
partyLootPolicyRef optional future
pityPolicy none|guaranteed_after_n
pityCount optional
```

Cycle in nested tables is error.

## 10.2 `loot_item_entry`

Fields:

```text
entryId
itemRef
chance 0..1
weight >=0
minQuantity
maxQuantity
guaranteed
qualityMode definition|fixed|weighted
qualityValue optional
modifierPoolRefs
conditionTagQuery optional
```

## 10.3 `loot_currency_entry`

Fields:

```text
entryId
currencyRef
chance
weight
minAmountMinor
maxAmountMinor
guaranteed
```

## 10.4 `loot_table_entry`

Fields:

```text
entryId
lootTableRef
chance
weight
repeatMin
repeatMax
```

## 10.5 Lootuitvoering

Server:

1. bepaalt eligible player/party;
2. gebruikt server RNG;
3. maakt concrete lootresultaten;
4. schrijft voor persistent/personal loot `loot_instances`;
5. broadcast visible loot alleen naar owners/eligible clients;
6. claim gebruikt operationId;
7. inventory capacity/overflowpolicy;
8. ledger/event;
9. mark claimed in dezelfde transaction.

Geen client-supplied randomresultaten.

---

# 11. Resource- en pickupdefinitions

## 11.1 `resource_definition`

Fields:

```text
resourceId
displayName
worldModelAssetId
iconAssetId
yieldLootTableRef
yieldItemRefs optional simple grants
requiredToolTagQuery optional
requiredAbilityRef optional
requiredSkillStatRef optional
requiredSkillValue optional
harvestDurationMs
depletionMode disappear|stump|disabled_model
respawnPolicyRef
scope shared_zone|per_player|instance
ownershipClaimMs
harvestAnimationRole
gatherAudioRef
gatherVfxRef
depletedModelAssetId optional
```

## 11.2 `resource_component`

Output entityComponent kind resource.

Fields:

```text
componentId
resourceRef
yieldMultiplier
respawnPolicyOverrideRef
scopeOverride optional
```

## 11.3 `lootable_component`

Fields:

```text
componentId
lootTableRef
ownershipMode
oneTime
respawnPolicyRef optional
interactionPrompt tokenText
```

## 11.4 `destructible_component`

Fields:

```text
componentId
statBlockRef
allowedDamageTagQuery
lootTableRef optional
destroyedActionRefs future
respawnPolicyRef optional
persistenceScope disposable|zone|world
```

## 11.5 `audio_emitter_component` / `vfx_emitter_component`

Reference-based presentation, no hardcoded assetpath.

---

# 12. Spawn- en encounter nodes

## 12.1 `enemy_component`

Input/ref enemy/variant/difficulty; output entityComponent.

Fields:

```text
componentId
enemyRef
variantRef optional
difficultyRef optional
levelMode fixed|zone_range|area_range|player_clamped|party_clamped
fixedLevel
minimumLevelOverride
maximumLevelOverride
statMultiplierOverrides
lootOverrideRef optional
respawnOverrideRef optional
```

Voor handgeplaatste boss/NPC-achtige enemy in Entity Assembly.

## 12.2 `npc_component`

Fields:

```text
componentId
npcRef
variantRef optional
level
persistenceScope
```

## 12.3 `combatant_component`

Fields:

```text
componentId
statBlockRef optional override
combatProfileRef optional override
factionRef optional override
targetable
invulnerable
deathMode normal|knockout|despawn
creditMode personal|party|shared
```

## 12.4 `faction_component`

Fields factionRef/local relation overrides.

## 12.5 `schedule_component`

Fields:

```text
componentId
scheduleEntries [{startMinute,endMinute,targetAnchorRef,pathRef,behaviorMode}]
defaultBehavior
```

## 12.6 `nameplate_component`

Fields:

```text
componentId
nameTemplate tokenText
showLevel
showHealth
showFaction
showQuestIcon future
visibility always|near|targeted|combat
```

## 12.7 `enemy_spawn_point`

Output spawnEntry.

Fields:

```text
spawnEntryId
anchorRef/input
enemyRef
variantRef
difficultyRef
levelMode/fixedLevel
pathRef optional
respawnPolicyRef
maxAlive 1
activationRadius
playerExclusionRadius
conditions future refs
tags
```

## 12.8 `enemy_spawn_area`

Fields:

```text
spawnEntryId
areaRef/input
enemyRef
variantRef
difficultyRef
countMin
countMax
distribution random|blue_noise|edge|patrol_points
minimumSpacing
levelMode/fixed/range
pathRef optional
respawnPolicyRef
maxAlive
activationRadius
playerExclusionRadius
```

## 12.9 `resource_spawn`

Fields:

```text
spawnEntryId
anchor/area input
resourceRef
count
minimumSpacing
distribution
respawnOverrideRef
yieldMultiplier
markerPolicyRef optional
```

## 12.10 `pickup_spawn`

Fields:

```text
spawnEntryId
anchor input
pickupKind item|currency
itemRef/currencyRef
amount/min/max
respawnPolicyRef
ownershipMode
pickupAudio/VFX override refs
```

## 12.11 `spawn_set`

Inputs spawnEntry[] + optional path/area. Output spawnSet.

Fields:

```text
spawnSetId
activationMode zone_loaded|area_entered|encounter|always_resident
maxAliveTotal
randomSeedMode deterministic_build|runtime
sharedRespawnPolicyRef optional
```

## 12.12 `spawn_controller`

Inputs spawnSet[]; output spawnController.

Fields:

```text
spawnControllerId
scope zone|area|instance
sleepOutsideInterest
interestRadius
preloadRadius
buildBudgetPerTick
maxActiveInstances
persistenceScope disposable|zone|world
```

## 12.13 `encounter_controller`

Inputs:

```text
encounterArea
spawnControllers[]
completionConditions[] future
actions/reward refs future
```

Fields:

```text
encounterId
mode single_wave|multi_wave|boss
waveDefinitions json
resetPolicy
lockoutPolicy none|character_daily|party_instance|world
startMode proximity|interaction|event_future
```

NODE-03 ondersteunt single/multi-wave completionevent; quest/action/reward koppeling volgt NODE-04.

---

# 13. Player Rules nodes

## 13.1 `player_progression_rules`

Fields:

```text
rulesId
maxLevel
xpCurveRef
baseStatBlockRef
healthStatRef
manaStatRef optional
staminaStatRef optional
armorStatRef optional
levelUpHealPolicy full|percent|none
levelUpNotificationTemplateRef optional
```

## 13.2 `xp_source_rule`

Fields:

```text
xpRuleId
sourceTagQuery
amountFormula/curveRef
dailyCap optional
diminishingReturnsMode none|same_source|same_enemy
```

## 13.3 `inventory_rules`

Fields:

```text
rulesId
slotCapacity
weightCapacity
capacityMode slots|weight|both|unlimited
stackMergePolicy exact_item_and_bind
pickupOverflow reject|mail_future|drop
allowDestroy
allowDrop
```

## 13.4 `equipment_rules`

Inputs equipment slot definitions refs.

Fields:

```text
rulesId
slotRefs
bindOnEquip
allowSwapInCombat
durabilityEnabled
deathDurabilityLossPercent
```

## 13.5 `ability_loadout_rules`

Fields:

```text
rulesId
loadoutCount
slotsPerLoadout
allowedAbilityTagQuery
changeInCombat
changeCooldownMs
```

## 13.6 `death_respawn_rules`

Fields:

```text
rulesId
respawnDelayMs
respawnPriority instance_checkpoint|character_checkpoint|zone_default|project_start
healthRestorePercent
manaRestorePercent
staminaRestorePercent
currencyLossRules []
durabilityLossPercent
xpLossFormula optional
dropItems false default
```

## 13.7 `unstuck_rules`

Vervangt NODE-02 tijdelijke defaults.

Fields:

```text
rulesId
cooldownMs
castTimeMs
cancelOnMove
cancelOnDamage
allowInCombat
fallbackOrder
logThresholdPerHour
```

---

# 14. Player Character-node migratie

Breid huidige `player_character` uit:

```text
playableCharacterRef: reference playableCharacterDef
useDefinitionPresentation: boolean default true
useDefinitionMovement: boolean default true
```

Legacy model/animations/movementfields blijven overrides. Resolvevolgorde:

```text
explicit legacy override wanneer useDefinition... false
anders Playable Character Definition
anders publisherror wanneer geen valide model/movement
```

`selected_character_id` in player profile gebruikt canonical characterId. Als null gebruikt server de aangesloten Player Character/playableCharacterRef en slaat dat bij eerste start op.

---

# 15. Database-migratie

Maak:

```text
db/migrations/006_catalog_player_state_combat_loot.sql
```

Verplichte tabellen/kolommen:

```sql
CREATE TABLE IF NOT EXISTS player_progression (
  player_id TEXT PRIMARY KEY,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  skill_points INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_stats (
  player_id TEXT NOT NULL,
  stat_id TEXT NOT NULL,
  base_value REAL NOT NULL,
  earned_value REAL NOT NULL DEFAULT 0,
  current_value REAL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, stat_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_inventory_stacks (
  stack_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  bind_state TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (player_id, item_id, bind_state),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inventory_player
  ON player_inventory_stacks(player_id, item_id);

CREATE TABLE IF NOT EXISTS player_item_instances (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  bind_state TEXT NOT NULL,
  quality TEXT,
  durability REAL,
  max_durability REAL,
  modifiers_json TEXT NOT NULL DEFAULT '[]',
  location_type TEXT NOT NULL CHECK (location_type IN ('inventory', 'equipment', 'escrow', 'mail', 'deleted')),
  location_ref TEXT,
  locked_by_operation_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_item_instances_owner
  ON player_item_instances(player_id, location_type);

CREATE TABLE IF NOT EXISTS player_equipment (
  player_id TEXT NOT NULL,
  slot_id TEXT NOT NULL,
  item_instance_id TEXT NOT NULL,
  equipped_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, slot_id),
  UNIQUE (item_instance_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (item_instance_id) REFERENCES player_item_instances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_currencies (
  player_id TEXT NOT NULL,
  currency_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, currency_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_abilities (
  player_id TEXT NOT NULL,
  ability_id TEXT NOT NULL,
  rank INTEGER NOT NULL DEFAULT 1,
  unlock_source TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, ability_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_ability_loadouts (
  player_id TEXT NOT NULL,
  loadout_id TEXT NOT NULL,
  slot_index INTEGER NOT NULL,
  ability_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, loadout_id, slot_index),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS operation_idempotency (
  operation_id TEXT PRIMARY KEY,
  player_id TEXT,
  operation_type TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  result_json TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  expires_at TEXT,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_operation_player
  ON operation_idempotency(player_id, created_at);

CREATE TABLE IF NOT EXISTS economy_ledger (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  player_id TEXT,
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('item_stack', 'item_instance', 'currency', 'xp', 'ability', 'stat')),
  asset_id TEXT NOT NULL,
  delta_real REAL NOT NULL,
  before_real REAL,
  after_real REAL,
  reason TEXT NOT NULL,
  source_ref TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_economy_ledger_player
  ON economy_ledger(player_id, created_at);
CREATE INDEX IF NOT EXISTS idx_economy_ledger_operation
  ON economy_ledger(operation_id);

CREATE TABLE IF NOT EXISTS gameplay_events (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT UNIQUE,
  world_id TEXT NOT NULL,
  zone_id TEXT,
  player_id TEXT,
  event_type TEXT NOT NULL,
  source_id TEXT,
  target_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gameplay_events_player
  ON gameplay_events(player_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_gameplay_events_type
  ON gameplay_events(event_type, occurred_at);

CREATE TABLE IF NOT EXISTS world_entity_state (
  world_id TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  state_kind TEXT NOT NULL,
  state_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  expires_at TEXT,
  PRIMARY KEY (world_id, zone_id, instance_id)
);

CREATE TABLE IF NOT EXISTS player_resource_state (
  player_id TEXT NOT NULL,
  resource_instance_id TEXT NOT NULL,
  depleted_until TEXT,
  gather_count INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, resource_instance_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS loot_instances (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  source_instance_id TEXT,
  owner_player_id TEXT,
  ownership_mode TEXT NOT NULL,
  loot_kind TEXT NOT NULL CHECK (loot_kind IN ('item_stack', 'item_instance', 'currency')),
  definition_id TEXT NOT NULL,
  quantity_minor INTEGER NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('available', 'claimed', 'expired', 'cancelled')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  claimed_at TEXT,
  claimed_operation_id TEXT,
  FOREIGN KEY (owner_player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_loot_owner_status
  ON loot_instances(owner_player_id, status, expires_at);

CREATE TABLE IF NOT EXISTS pickup_claims (
  pickup_instance_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  operation_id TEXT NOT NULL UNIQUE,
  claimed_at TEXT NOT NULL,
  PRIMARY KEY (pickup_instance_id, player_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);
```

Gebruik integer minor units voor currency en stackquantity. `quantity_minor` bij loot betekent quantity voor itemstack of minor units voor currency; `loot_kind` bepaalt interpretatie.

---

# 16. Serverarchitectuur

Nieuwe files:

```text
src/shared/catalog-contract.js
src/shared/combat-contract.js
src/shared/player-state-contract.js
src/server/catalog-service.js
src/server/player-state-service.js
src/server/game-mutation-service.js
src/server/inventory-service.js
src/server/equipment-service.js
src/server/wallet-service.js
src/server/ability-service.js
src/server/progression-service.js
src/server/gameplay-event-service.js
src/server/spawn-service.js
src/server/combat-service.js
src/server/enemy-ai-service.js
src/server/loot-service.js
src/server/resource-service.js
src/server/death-respawn-service.js
src/server/catalog-compiler.js
```

## 16.1 `game-mutation-service.js`

Enige entry voor mutaties die items/currency/XP/abilities/equipment beïnvloeden.

API intern:

```js
runOperation({
  operationId,
  playerId,
  operationType,
  requestPayload,
  execute(db, context)
})
```

Gedrag:

- hash requestpayload canonical;
- bestaande completed operation met dezelfde hash -> eerder result terug;
- zelfde operationId andere hash -> 409;
- transaction `BEGIN IMMEDIATE` waar nodig;
- insert started;
- execute;
- ledger/events;
- completed result;
- rollback + failedrecordstrategie zonder halfmutatie;
- korte transacties.

## 16.2 `catalog-service.js`

- read published catalog;
- typed get/require;
- resolve variant;
- tagquery matching;
- contenthash cache;
- geen DBdefinitions buiten manifest.

## 16.3 `player-state-service.js`

- load/create snapshot;
- memorycache actieve players;
- profile/current zone/position uit bestaande services;
- progression/stats/inventory/equipment/currencies/abilities/loadouts/checkpoint;
- invalidate/update na mutation;
- flush current stats bij logout/death/checkpoint, niet iedere tick.

## 16.4 `spawn-service.js`

- compilede spawncontrollers per active zone;
- runtime instance IDs deterministisch voor placements en uniek voor dynamic respawns;
- active/sleep/despawn;
- max alive;
- respawn schedule;
- zone/interest filtering;
- snapshots/deltas naar clients;
- shared state in memory, persistent only when policy requires.

## 16.5 `combat-service.js`

- integrates with existing MmoService world tick;
- no separate `setInterval`;
- player/enemy authoritative stats;
- cooldown/cast state in memory;
- ability intents;
- range/LOS/target/faction;
- formula evaluation;
- damage/heal/status;
- threat/aggro;
- death event;
- persistence only meaningful checkpoints.

## 16.6 `enemy-ai-service.js`

- AI think scheduled within worldtick at per-instance `nextThinkAt`;
- budget per zone/tick;
- sleeping outside relevance;
- patrol/wander/chase/return/flee/basic ability selection;
- no navmesh/pathfinding beyond current collision/path support.

## 16.7 `loot-service.js`

- server RNG injection;
- evaluate table;
- create loot instances;
- claim atomic;
- personal/shared visibility;
- expiry cleanup;
- inventory overflow.

## 16.8 `resource-service.js`

- validate distance/tool/ability/skill/state;
- gather start/complete state;
- cancellation on movement/damage;
- yield through Loot Service/Game Mutation;
- shared/per-player depletion;
- respawn.

---

# 17. API-contract

## Player state

```text
GET  /api/game/player/state
GET  /api/game/player/inventory
GET  /api/game/player/equipment
GET  /api/game/player/wallet
GET  /api/game/player/abilities
PATCH /api/game/player/ability-loadouts/:loadoutId
POST /api/game/player/equipment/equip
POST /api/game/player/equipment/unequip
POST /api/game/player/items/:itemInstanceId/destroy
```

## World interactions

```text
POST /api/game/pickups/:instanceId/claim
POST /api/game/resources/:instanceId/gather/start
POST /api/game/resources/:instanceId/gather/complete
POST /api/game/resources/:instanceId/gather/cancel
GET  /api/game/zones/:zoneId/runtime-snapshot
```

HTTP endpoints zijn recovery/test/accessibilitypath. Realtime combat en instance deltas gaan via WebSocket.

Alle mutating bodies bevatten `operationId` en waar nodig `expectedRevision`.

---

# 18. WebSocket-events

Client -> server:

```text
combat:ability_intent
combat:target_select
combat:cancel_cast
pickup:claim_intent
resource:gather_start
resource:gather_complete
resource:gather_cancel
player:loadout_change_intent
player:equip_intent
player:respawn_request
```

Server -> client:

```text
world:runtime_snapshot
world:entity_spawned
world:entity_state_changed
world:entity_despawned
combat:ability_started
combat:ability_resolved
combat:damage
combat:heal
combat:status_applied
combat:status_removed
combat:cast_cancelled
entity:died
loot:spawned
loot:claimed
resource:gather_started
resource:gather_progress optional throttled
resource:depleted
resource:respawned
player:state_changed
player:inventory_changed
player:wallet_changed
player:ability_changed
player:equipment_changed
player:progression_changed
player:died
player:respawned
operation:result
```

Payloads bevatten server sequence/time/buildId/zoneId. Geen full inventory iedere hit; stuur compacte deltas plus revision.

---

# 19. Combat tick en performance

Bestaande `MmoService` heeft een fixed worldtick. Integreer services via één orchestrator:

```text
movement simulation
-> zone/spawn lifecycle budget
-> enemy AI think budget
-> combat cast/status resolution
-> dirty entity/player snapshot collection
-> one compact world snapshot broadcast
-> debounced persistence outside hot path
```

Defaults:

- movement tick bestaand 50Hz mag blijven;
- enemy AI think normal 5Hz, combatactive max 10Hz, boss max 20Hz;
- world snapshot 20Hz of bestaand configured cadence;
- HUD DOM updates max 4Hz behalve bars via lightweight transform/width update;
- inventory/wallet only on mutation;
- no JSON stringify per client wanneer same payload; reuse serialized payload;
- cap WebSocket bufferedAmount; bij overschrijding drop noncritical intermediate snapshots, nooit transaction results.

---

# 20. Client/runtime rendering

Nieuwe files:

```text
apps/web/public/shared/entity-runtime.js
apps/web/public/shared/combat-runtime.js
apps/web/public/shared/presentation-runtime.js
apps/web/public/game/player-state-store.js
apps/web/public/game/inventory-ui.js
apps/web/public/game/equipment-ui.js
apps/web/public/game/wallet-ui.js
apps/web/public/game/hotbar-ui.js
apps/web/public/game/combat-ui.js
```

Shared runtime methods:

```text
upsertRuntimeEntity(instanceSnapshot)
removeRuntimeEntity(instanceId)
applyRuntimeEntityState(delta)
playEntityAnimationRole(instanceId, role)
showCombatVfx/audio
showWorldLoot
showResourceState
```

Enemy model/animations komen uit catalog definition/variant. Client mag alleen presentatieinterpoleren; authoritative health/death/state komt server-side.

---

# 21. Minimale functionele UI-nodes in NODE-03

## `hud_bar`

Fields:

```text
moduleId
sourceStatRef
maxStatRef optional zelfde stat definition max
label tokenText
anchor
widthPx
heightPx
showNumbers
showPercent
frameAssetId/fillAssetId optional
```

## `hotbar_hud`

Fields:

```text
moduleId
loadoutId
slotCount from policy or override
anchor
showKeybinds
showCooldown
showCosts
mobileTouchEnabled
```


## `xp_hud`

Fields:

```text
moduleId
anchor
showLevel
showCurrentXp
showRequiredXp
showPercent
barFrameAssetId optional
barFillAssetId optional
levelLabel tokenText default "Level @{player.level}"
xpLabel tokenText
compact boolean
```

De module leest uitsluitend de authoritative Player Snapshot/delta en de connected `player_progression_rules`/Stat Curve. Hij berekent geen alternatieve XP-curve in de client.

## `inventory_hud`

Fields:

```text
moduleId
layout grid|list
columns
showWeight
showFilters
allowStackSplit
allowDestroy
```

## `equipment_hud`

Uses slot definitions; basic equip/unequip.

## `wallet_hud`

Fields currencyRefs/referenceList, formatting and anchor.

## `death_respawn_hud`

Shows countdown, destination label, respawn/unstuck status. Detailed layout integration NODE-05.

Alle outputs `uiModule` en gaan via existing UI Output.

---

# 22. Death en respawn

Bij player health <= 0:

1. state `dead` server-side;
2. movement/combat intents blokkeren;
3. emit `player:died`;
4. death animation;
5. respawn timer uit `death_respawn_rules`;
6. destination via NODE-02 checkpoint fallback;
7. apply penalty in one mutation operation;
8. update authoritative position/zone if needed;
9. restore configured stats;
10. emit `player:respawned` teleport snapshot.

Enemy death:

1. mark dead;
2. emit gameplay event `enemy.defeated`;
3. determine credit;
4. generate loot/XP;
5. death/corpse;
6. respawn schedule.

---

# 23. Gameplay events

NODE-03 introduceert canonical events voor NODE-04:

```text
player.level_changed
player.died
player.respawned
item.acquired
item.removed
item.equipped
item.unequipped
item.used
currency.changed
ability.unlocked
ability.used
enemy.spawned
enemy.damaged
enemy.defeated
resource.gathered
resource.depleted
pickup.claimed
zone.entered
location.discovered
checkpoint.activated
```

Events hebben:

```json
{
  "id": "event_uuid",
  "dedupeKey": "...",
  "type": "item.acquired",
  "worldId": "...",
  "zoneId": "...",
  "playerId": "...",
  "sourceId": "...",
  "targetId": "...",
  "payload": {},
  "occurredAt": "..."
}
```

Niet ieder movement/combat frame wordt persistent event. Alleen semantische events.

---

# 24. Validationcodes

## Catalog

```text
CATALOG_DEFINITION_DUPLICATE
CATALOG_REFERENCE_MISSING
CATALOG_REFERENCE_WRONG_KIND
CATALOG_DEPENDENCY_CYCLE
ITEM_STACK_RULE_INVALID
ITEM_EQUIPMENT_SLOT_MISSING
ITEM_TRADE_POLICY_CONFLICT
CURRENCY_PRECISION_INVALID
STAT_RANGE_INVALID
STAT_BLOCK_DUPLICATE_STAT
CURVE_POINTS_INVALID
ANIMATION_CLIP_MISSING
ABILITY_FORMULA_INVALID
ABILITY_TARGET_RULE_INVALID
STATUS_EFFECT_INVALID
ENEMY_ARCHETYPE_INCOMPLETE
VARIANT_BASE_MISSING
AI_PROFILE_INTERVAL_UNSAFE
LOOT_TABLE_EMPTY
LOOT_TABLE_CYCLE
LOOT_ENTRY_RANGE_INVALID
RESOURCE_DEFINITION_INCOMPLETE
```

## Runtime/spawns/player

```text
SPAWN_ENEMY_REF_MISSING
SPAWN_AREA_INVALID
SPAWN_MAX_ALIVE_INVALID
SPAWN_CONTROLLER_BUDGET_INVALID
ENTITY_COMBAT_COMPONENT_CONFLICT
PLAYER_CHARACTER_DEFINITION_MISSING
PLAYER_RULES_MISSING
PLAYER_STAT_MAPPING_MISSING
PLAYER_INVENTORY_POLICY_MISSING
PLAYER_ABILITY_POLICY_MISSING
```

Runtime errorcodes:

```text
OPERATION_ID_REUSED_DIFFERENT_REQUEST
INVENTORY_FULL
ITEM_NOT_OWNED
ITEM_BOUND
ITEM_NOT_EQUIPPABLE
EQUIPMENT_SLOT_INVALID
CURRENCY_INSUFFICIENT
ABILITY_NOT_UNLOCKED
ABILITY_ON_COOLDOWN
ABILITY_RESOURCE_INSUFFICIENT
TARGET_INVALID
TARGET_OUT_OF_RANGE
TARGET_LINE_OF_SIGHT_BLOCKED
ENTITY_DEAD
LOOT_NOT_OWNED
LOOT_ALREADY_CLAIMED
RESOURCE_UNAVAILABLE
RESOURCE_REQUIREMENT_MISSING
```

---

# 25. Exacte bestandswijzigingen

## Aanpassen

```text
src/shared/node-types.js
src/shared/node-contract.js
src/shared/zone-contract.js
src/server/field-validation.js
src/server/graph-repository.js
src/server/publish-service.js
src/server/game-project-compiler.js
src/server/zone-compiler.js
src/server/mmo-service.js
src/server/server.js
apps/web/public/editor/editor.js
apps/web/public/editor/styles.css
apps/web/public/shared/world-runtime.js
apps/web/public/game/game.js
apps/web/public/game/index.html
apps/web/public/game/styles.css
scripts/smoke-test.js
scripts/game-browser-check.js
package.json
README/fases/README.md
```

## Nieuw

```text
db/migrations/006_catalog_player_state_combat_loot.sql
src/shared/catalog-contract.js
src/shared/combat-contract.js
src/shared/player-state-contract.js
src/server/catalog-compiler.js
src/server/catalog-service.js
src/server/player-state-service.js
src/server/game-mutation-service.js
src/server/inventory-service.js
src/server/equipment-service.js
src/server/wallet-service.js
src/server/ability-service.js
src/server/progression-service.js
src/server/gameplay-event-service.js
src/server/spawn-service.js
src/server/combat-service.js
src/server/enemy-ai-service.js
src/server/loot-service.js
src/server/resource-service.js
src/server/death-respawn-service.js
apps/web/public/shared/entity-runtime.js
apps/web/public/shared/combat-runtime.js
apps/web/public/shared/presentation-runtime.js
apps/web/public/game/player-state-store.js
apps/web/public/game/inventory-ui.js
apps/web/public/game/equipment-ui.js
apps/web/public/game/wallet-ui.js
apps/web/public/game/hotbar-ui.js
apps/web/public/game/combat-ui.js
tests/catalog-compiler.test.js
tests/tag-query.test.js
tests/player-state.test.js
tests/game-mutation-idempotency.test.js
tests/inventory-equipment-wallet.test.js
tests/ability-combat.test.js
tests/enemy-ai-spawn.test.js
tests/loot-service.test.js
tests/resource-service.test.js
tests/death-respawn.test.js
README/fases/NODE-03-Catalogs-Player-State-Combat-Enemies-Resources-Loot.md
```

---

# 26. Tests

## Contract/unit

Minimaal:

- alle definitionnodes compile/validate;
- unconnected definitions excluded;
- exact refs/tagqueries;
- variant resolve;
- stat curves/formulas;
- animation clip validation;
- item/currency/equipment constraints;
- starting grants idempotent;
- inventory stack merge/bind;
- unique instance/equipment move transaction;
- currency minor units/cap;
- ability unlock/loadout/cooldown/cost;
- combat damage/range/LOS/death;
- AI sleep/budget/leash/respawn;
- enemy reuse in three zone spawn entries resolves same enemy hash;
- loot independent/weighted/nested/no cycles;
- personal/shared ownership;
- duplicate claim blocked;
- resource shared/per-player state;
- operationId replay returns same result;
- same operationId different payload 409;
- death/respawn/checkpoint/penalty;
- gameplay events dedupe;
- no DB writes per tick (instrument count).

## Smoke vertical slice

Smoke maakt via normale nodes/API:

```text
Currency Gold
Item Wood
Item Wolf Hide
Equipment Sword
Health/Mana/Armor stats
Player stat block
Basic Attack ability
Wolf Bite ability
Wolf stat/combat/AI/animation/loot definitions
Wolf enemy archetype
Young/Corrupted variants
Wood Resource Definition
Player Rules
Inventory/Equipment/Ability policies
3 zones met Wolf Spawn Area refs
resource spawn
pickup spawn
HUD modules
```

Test:

- publish;
- player init grants;
- inventory/wallet/state endpoints;
- spawn snapshot;
- basic attack kill wolf;
- loot claim;
- gather wood;
- equip sword;
- ability/loadout;
- death/respawn;
- reconnect persistence;
- second player sees shared enemy state but not personal loot;
- catalog unconnected content absent.

## Browser

- Global Catalog group screenshot;
- Enemy node connection graph;
- three zone spawn refs;
- combat in game;
- resource gathering;
- inventory/wallet/equipment/hotbar;
- death/respawn;
- refresh proof;
- performance HUD comparison.

---

# 27. Kevin-zichtbaar testscript

```text
1. Maak in Global Catalog een Gold currency, Wood item, Wolf Hide item en Sword item.
2. Maak Health, Mana, Armor en Attack Power stats plus stat blocks.
3. Maak Basic Attack en Wolf Bite abilities.
4. Maak animation set voor player en wolf met echte GLB clips.
5. Maak Wolf loot table met Gold en Hide.
6. Maak Wolf AI/combat profile en Forest Wolf enemy archetype.
7. Maak Young Wolf en Corrupted Wolf variants.
8. Open Zone A en plaats Enemy Spawn Area met @enemy.forest_wolf level 3.
9. Open Zone B en plaats dezelfde ref level 15/Young of Alpha variant.
10. Open Zone C en plaats dezelfde ref level 28/Corrupted variant.
11. Controleer via referencechips dat alle drie naar dezelfde definition focussen.
12. Maak Wood Resource Definition en resource spawn.
13. Publiceer.
14. Start game en controleer player stats/hotbar.
15. Val wolf aan; controleer server-authoritative health/damage/death.
16. Claim loot; controleer inventory/wallet.
17. Probeer dezelfde loot dubbel te claimen; tweede poging moet hetzelfde result/geen duplicate geven.
18. Verzamel hout; controleer animation/audio/VFX en resource depletion.
19. Equip Sword; controleer equipment en statwijziging.
20. Refresh; inventory, wallet, equipment, level en loadout blijven.
21. Laat player doodgaan; controleer checkpointrespawn en penalties.
22. Open tweede account; controleer shared enemy/resource state en persoonlijke lootvisibility.
23. Loop buiten interestrange; controleer AI sleep/performance.
24. Controleer dat er maar één Wolf definition in catalog staat.
```

---

# 28. Evidence

```text
README/fases/evidence/NODE-03-catalog-combat-player-state/
```

Verplicht:

```text
README.md
acceptance-result.md
catalog-manifest.json
player-snapshot-before.json
player-snapshot-after.json
database-schema-proof.md
operation-idempotency-proof.md
economy-ledger-proof.md
editor-global-catalog.png
editor-wolf-definition.png
editor-three-zone-spawns.png
game-wolf-combat.png
game-loot.png
game-resource-gather.png
game-inventory.png
game-equipment.png
game-hotbar.png
game-death-respawn.png
multi-client-shared-state.md
checks.txt
browser-console.txt
performance-proof.md
```

---

# 29. Performance- en schaalcontract

- active player snapshot in memory;
- persistent mutations immediate/transactional, movement/current health throttled;
- normal enemy AI max 5Hz think; combat 10Hz; boss 20Hz;
- sleep outside interest;
- spawn/build budgets;
- no full catalog in every zonepackage: refs plus needed dependency manifest;
- client asset cache shared by definitions;
- same GLB loaded once/refcounted;
- compact deltas;
- drop stale noncritical WebSocket snapshots bij buffered backlog;
- no inventory DOM rebuild per frame;
- SQLite WAL short transactions, one writer awareness;
- cleanup expired loot/idempotency/event rows budgeted buiten hot tick.

---

# 30. Security/anti-cheat

- client userId/playerId/zoneId/position/damage/lootresult niet vertrouwen;
- ability target/range/cooldown/cost server-side;
- inventory ownership en revision server-side;
- unique item constraints;
- operation IDs;
- loot ownership/expiry;
- rate limits combat/gather/pickup;
- no arbitrary formulas/code;
- audit rare item/currency grants;
- asset IDs validated via AssetService;
- errorpayload geen hidden definition/serverstate.

---

# 31. Buiten scope

- quests/dialogue/rewards through story: NODE-04;
- crafting execution/vendor/market/trade/party: NODE-05;
- full navmesh/pathfinding;
- advanced skill trees;
- mounts/pets;
- physics projectile simulation; line/range/simple projectile presentation toegestaan, authoritative resolve server-side;
- complex raid AI;
- procedural item affix editor beyond modifier pools;
- PostgreSQL migration;
- cross-server sharding.

---

# 32. Verboden shortcuts/faalcriteria

Niet klaar als:

- enemy stats/loot/abilities in spawnnode worden gekopieerd;
- client damage of loot bepaalt;
- inventory in localStorage staat;
- gold als itemstack wordt behandeld;
- alle items als dezelfde JSON blob per player worden opgeslagen;
- unique equipment geen instance-ID heeft;
- DB iedere tick wordt geschreven;
- combat een tweede uncontrolled timerloop toevoegt;
- formulas `eval` gebruiken;
- dummy cubes echte GLB acceptance vervangen;
- loot dubbel claimbaar is;
- refresh progressie reset;
- tests groen zijn maar game geen echte combat/gather/inventory toont.

---

# 33. Definition of Done

- [ ] alle global catalognodes bestaan;
- [ ] typed catalog compileert en refs/tags werken;
- [ ] Player Rules bestaan;
- [ ] migration 006 werkt;
- [ ] player snapshot persistent;
- [ ] inventory stacks/unique instances/equipment/wallet/abilities/loadout;
- [ ] mutation idempotency/ledger/events;
- [ ] enemy archetype/variant/components/spawns;
- [ ] server authoritative combat/AI/death/respawn;
- [ ] resources/pickups/loot;
- [ ] one enemy reused in three zones;
- [ ] functional HUD modules;
- [ ] multi-client shared state/personal loot;
- [ ] npm check/test/smoke/browser evidence groen;
- [ ] performance/DB write proof;
- [ ] evidencefolder compleet.

---

# 34. Verplichte Codex-eindrapportage

1. samenvatting;
2. baseline/eind-HEAD;
3. files per verantwoordelijkheid;
4. migration 006;
5. catalog/node families;
6. player state schema/services;
7. combat/AI/spawnruntime;
8. loot/resource/mutationtransactions;
9. API/WS-events;
10. tests/checks;
11. Kevin browserflow;
12. performance/DB write bewijs;
13. evidencepaden;
14. known limitations;
15. buiten scope;
16. go/no-go NODE-04.

---

# 35. Onderzoeksbasis

- SQLite WAL laat readers en een writer gelijktijdig werken, maar er kan nog steeds slechts één writer tegelijk zijn; daarom gebruikt GK korte transacties en houdt live simulation buiten de DB-hot path: `https://www.sqlite.org/wal.html` en `https://www.sqlite.org/isolation.html`.
- De browser-WebSocket API biedt geen automatische backpressure; `bufferedAmount`, rate limiting en het laten vallen van niet-kritieke intermediate snapshots zijn daarom onderdeel van het contract: `https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API`.
- Unreal Gameplay Tags onderbouwen hiërarchische labels en Any/All/None-queries: `https://dev.epicgames.com/documentation/unreal-engine/using-gameplay-tags-in-unreal-engine`.
