# Node-system super dynamic contract

Dit is een harde bouwregel. Het doel is dat Kevin later nieuwe content kan toevoegen zonder opnieuw AI-code nodig te hebben.

## Alles wordt node-data

Alles wat inhoudelijk instelbaar is, moet via nodes of editorpanelen op nodes kunnen:

- assets
- audio
- procedural generation seeds
- procedural preview en bake drafts
- generated zones, spawn areas, path networks, resource distributions en entity placements
- camera
- licht
- fog
- sky
- minimap
- levels/zones
- player levels en XP
- money/currency
- merchants
- NPC taken
- NPC routes
- NPC audio
- groepen en spawn timings
- quests
- side quests
- inventory
- items
- readable scrolls
- attacks
- boss mechanics
- HUD panels

## Node UI zoals geometry nodes

Een node heeft:

- titel
- type
- categorie
- input sockets
- output sockets
- dropdowns
- eigen inputvelden
- asset pickers
- audio pickers
- kleurvelden
- sliders
- vectorvelden
- checkboxes
- warning/error status
- meerdere poorten per node

Een output mag naar meerdere inputs. Een node mag meerdere outputs hebben. De editor moet typed sockets gebruiken zodat verkeerde koppelingen direct zichtbaar zijn.

## Socket types

Minimaal ondersteunen:

- flow
- bool
- number
- integer
- string
- enum
- vector2
- vector3
- color
- curve
- schedule
- asset.reference
- audio.reference
- asset.glb
- asset.ui
- asset.audio
- entity
- entity.reference
- component.reference
- entity.group.reference
- npc
- player
- quest
- item
- currency
- merchant
- camera
- light
- minimap.layer
- zone
- level
- procedural.graph.reference
- procedural.seed.reference
- generation.output.reference
- generated.entity.draft.reference
- generated.group.draft.reference
- generated.placement.candidate.reference
- generated.spawn-area.candidate.reference
- generated.path-network.candidate.reference
- generated.resource-distribution.candidate.reference
- list

Fase 6 heeft de eerste typed sockets vastgelegd als engine-capabilities: `var.string`, `number`, `color`, `asset.reference` en `audio.reference`.

Fase 8 breidt de engine-capability sockets uit met `entity.reference`, `component.reference` en `entity.group.reference`. Deze sockets zijn data-contracten voor editor drafts; ze publiceren niets naar Runtime Game.

Fase 8.1 breidt de engine-capability sockets uit met procedural graph, seed, generation output en generated draft/candidate references. Ook die sockets zijn editor/draft-contracten en publiceren niets naar Runtime Game.

## Asset import

Als een bestand in `/var/www/gk/assets` komt:

1. asset-worker ziet het via watcher of periodieke scan.
2. hash, pad, bestandstype en metadata worden opgeslagen waar veilig/haalbaar.
3. GLB metadata wordt gelezen waar mogelijk: basisheader in Fase 7, later scenes, meshes, materials, animation clips, bounding box en triangle estimate.
4. UI images krijgen later width, height, format en alpha info waar mogelijk.
5. Audio krijgt later duration, channels, sample rate en loop candidate info waar mogelijk.
6. Editor krijgt asset library state.
7. Asset verschijnt in asset library.

De scanner kopieert geen assets naar Git, verwijdert geen serverbestanden en publiceert niets naar runtime.

## GLB role mapping blijft editor-data

GLB-bestanden mogen niet automatisch een definitieve runtime-role krijgen.

De scanner mag alleen generieke kandidaat-capability metadata registreren, bijvoorbeeld:

- `asset.glb`
- `renderable_candidate`
- `spawnable_candidate`
- `entity_visual_candidate`
- `npc_visual_candidate`
- `prop_visual_candidate`
- `environment_visual_candidate`

Deze metadata betekent niet dat een GLB al object, NPC, player, prop, environment, enemy of boss is. Kevin/editor kiest de definitieve role mapping later als editor-data.

Role mapping status:

- `unassigned`: geen role mapping gekozen;
- `candidate`: scanner of editor toont mogelijke capabilities zonder definitieve runtime-role;
- `assigned`: editor-data heeft expliciet een role mapping gekozen.

Alleen `assigned` editor-data mag later door publish/runtime worden geconsumeerd als concrete role mapping.

## Fase 8 entity/component laag

Fase 8 voegt een universal entity/component systeem toe als editor- en node-contract. Een GLB kan kandidaat zijn voor meerdere component-combinaties zonder definitieve runtime-role.

Component capabilities:

- `transform`
- `renderable`
- `collider`
- `interactable`
- `npc_brain`
- `audio_emitter`
- `combatant`
- `boss`
- `loot`
- `quest_target`
- `merchant`
- `player_appearance`
- `group_transform`

Belangrijke regels:

- `renderable` gebruikt `asset.reference` naar de Fase 7 asset library.
- `audio_emitter` gebruikt `audio.reference` en blijft gated wanneer audio count 0 is.
- `npc_brain`, `combatant`, `boss`, `merchant`, `quest_target` en `player_appearance` blijven candidate totdat editor-data bestaat.
- Ontbrekende animation mapping is warning voor candidate entities.
- Runtime-active NPC/combat/player behavior vereist expliciete animation mapping via editor-data.
- Entity validation en graph draft preview zijn geen publishstap.

`Taverne.glb` en `Wizard.glb` zijn Fase 8 Kevin-testkeuzes. Ze zijn geen runtime-hardcoded object of NPC.

## Fase 8.1 procedural generation laag

Fase 8.1 voegt procedural generation toe als core engine-capability in het node-system. Server-side verificatie is afgerond en de basis is klaar.

Belangrijke regels:

- Generatoren zijn data-driven en deterministic.
- Zelfde seed + zelfde graph + zelfde inputs geeft dezelfde output.
- Andere seed mag andere output geven.
- Procedural preview publiceert niets naar Runtime Game.
- Procedural bake maakt alleen editor draft data of bake draft result.
- Procedural output blijft draft/candidate totdat een latere publish-flow expliciet publiceert.
- Generated entities gebruiken Fase 8 entity/component contracts.
- Generated assets gebruiken Fase 7 `asset.reference`.
- Generated audio gebruikt `audio.reference` en blijft gated bij audio count 0.
- Client mag geen eigen MMO-state verzinnen; server/runtime blijft later authoritative.

Niet toegestaan:

- vaste dorpen, NPCs, quests, routes, loot tables, bosses, minimap lagen, camera waardes, lighting presets of world maps hard-coden;
- procedural output direct als runtimecontent behandelen;
- procedural core opnieuw bouwen in Fase 9 of latere fases.

## Node families

### Asset nodes

- asset.find
- asset.reference
- asset.byTag
- asset.byCapability
- asset.randomWeighted
- asset.requireCapability
- asset.validateBudget

### Audio nodes

- audio.asset
- audio.ambientZone
- audio.musicState
- audio.emitter3d
- audio.npcTaskSound
- audio.footstepSet
- audio.uiSound
- audio.randomOneShot
- audio.schedule
- audio.ducking
- audio.volumeByDistance

### Procedural generation nodes

- proc.seed
- proc.random
- proc.pickWeighted
- proc.noise2D
- proc.noise3D
- proc.scatterAssets
- proc.scatterEntities
- proc.zoneLayout
- proc.pathNetwork
- proc.spawnArea
- proc.resourceDistribution
- proc.validateGeneratedGraph
- proc.previewGeneration
- proc.bakeGenerationDraft

Fase 8.1 definieert deze nodes als procedural engine-capabilities. De nodes maken generated draft/candidate data, geen concrete runtimecontent.

### World/camera/light nodes

- world.zone
- world.level
- world.spawnPoint
- world.bounds
- world.lighting.sun
- world.lighting.ambient
- world.fog
- world.sky
- world.dayNightCycle
- camera.mode
- camera.follow
- camera.zoomLimits
- camera.bounds
- camera.shake
- camera.cinematic

Fase 9 gebruikt de Fase 8.1 procedural outputs als draft/candidate input waar relevant. Fase 9 mag de procedural core niet opnieuw definieren.

### Minimap nodes

- minimap.definition
- minimap.layer
- minimap.marker
- minimap.editorView
- minimap.gameView
- minimap.visibilityRule
- minimap.zoom
- minimap.fogOfWar
- minimap.questMarker
- minimap.partyMarker

### Entity/component nodes

- entity.spawn
- entity.spawnFromAsset
- entity.addComponent
- entity.transform
- entity.group
- entity.groupTransform
- entity.despawn
- entity.setTag
- entity.setVariable
- component.renderable
- component.transform
- component.collider
- component.interactable
- component.audioEmitter
- component.npcBrain
- component.combatant
- component.boss
- component.loot
- component.questTarget
- component.merchant
- component.playerAppearance

Fase 8 implementeert de generieke `gk.entity.*`, `gk.component.*` en `gk.npc.makeFromAsset` contracten als engine-capabilities. Deze nodes maken candidate data, geen definitieve runtime-rollen.

### NPC task nodes

- npc.makeFromAsset
- npc.brain
- npc.task.workAtPoint
- npc.task.guardArea
- npc.task.patrol
- npc.task.wander
- npc.task.merchant
- npc.task.sleep
- npc.task.talk
- npc.path.route
- npc.schedule.daily
- npc.groupSpawn
- npc.populationTable
- npc.respawnRule
- npc.despawnRule

### Economy and level nodes

- progression.levelCurve
- progression.xpReward
- currency.definition
- currency.wallet
- currency.grant
- currency.spend
- merchant.definition
- merchant.stock
- merchant.price
- merchant.buyRule
- merchant.sellRule
- merchant.openHours

### Combat nodes

- combat.ability
- combat.cooldown
- combat.cost
- combat.targeting
- combat.hitbox
- combat.damage
- combat.statusEffect
- combat.animationClip
- combat.vfxAsset
- combat.audio
- combat.projectile
- combat.areaWarning
- combat.comboStep
- combat.bossPhase
- combat.lootTable

### Quest/story nodes

- quest.definition
- quest.stage
- quest.objective.talk
- quest.objective.collect
- quest.objective.defeat
- quest.objective.interact
- quest.share.party
- quest.reward
- quest.complete
- dialog.tree
- dialog.line
- dialog.choice
- readable.scroll

### HUD/UI nodes

- hud.panel
- hud.dock
- hud.inventory
- hud.questTracker
- hud.abilityBar
- hud.bossHealth
- hud.minimap
- hud.merchant
- ui.imageAsset
- ui.iconAsset
- ui.scrollBackground

## Publish regels

- Een GLB mag pas als concrete object/NPC/player/prop/environment/enemy/boss role worden gebruikt wanneer editor-data die role mapping expliciet heeft toegewezen.
- Ontbrekende animaties geven waarschuwing voor candidate entities.
- Runtime-active NPC/combat/player behavior blokkeert zonder expliciete animation mapping via editor-data.
- Procedural preview en bake zijn geen publishstap.
- Generated procedural output mag pas runtimecontent worden wanneer een latere publishfase expliciet gekozen editor/node-data compileert naar runtime projections.
- Vreemde schaal geeft waarschuwing.
- Hoog triangle budget geeft waarschuwing.
- Ontbrekende audio geeft waarschuwing als audio optioneel is.
- Ontbrekende audio blokkeert als een node die audio verplicht maakt.
- Blokkeren gebeurt alleen als een gekozen node capability verplichte data mist.
- Asset scan, entity validation, procedural preview, procedural bake en draft preview zijn geen publishstap.

Voorbeeld: een boss zonder boss health setup blokkeert pas wanneer editor-data/publish die boss-capability daadwerkelijk vereist. Een GLB met alleen `candidate` status mag niet automatisch boss, NPC of object worden. Een generated spawn area of path network mag niet automatisch runtime-state worden zonder publish.
