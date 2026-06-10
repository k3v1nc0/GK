# Node-system super dynamic contract

Dit is een harde bouwregel. Het doel is dat Kevin later nieuwe content kan toevoegen zonder opnieuw AI-code nodig te hebben.

## Alles wordt node-data

Alles wat inhoudelijk instelbaar is, moet via nodes of editorpanelen op nodes kunnen:

- assets
- audio
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
- asset.glb
- asset.ui
- asset.audio
- entity
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
- list

## Asset import

Als een bestand in `/var/www/gk/assets` komt:

1. asset-worker ziet het via watcher of periodieke scan.
2. hash, pad, bestandstype en metadata worden opgeslagen.
3. GLB metadata wordt gelezen waar mogelijk: scenes, meshes, materials, animation clips, bounding box en triangle estimate.
4. UI images krijgen width, height, format en alpha info.
5. Audio krijgt duration, channels, sample rate en loop candidate info waar mogelijk.
6. Editor krijgt realtime update.
7. Asset verschijnt in asset library.

## Elke GLB is object en NPC kandidaat

Elke GLB krijgt standaard capabilities:

- renderable
- spawnable_object
- spawnable_npc_candidate
- transformable
- selectable
- group_selectable

Kevin kan extra capabilities aanvinken:

- collidable
- interactable
- npc_brain
- enemy_combatant
- boss_combatant
- loot_container
- quest_target
- merchant
- dialogue_speaker
- player_appearance
- vfx
- audio_emitter_anchor

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

### Entity nodes

- entity.spawn
- entity.spawnFromAsset
- entity.addComponent
- entity.transform
- entity.group
- entity.groupTransform
- entity.despawn
- entity.setTag
- entity.setVariable

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

- Elk GLB mag als object of NPC kandidaat gebruikt worden.
- Ontbrekende animaties geven waarschuwing.
- Vreemde schaal geeft waarschuwing.
- Hoog triangle budget geeft waarschuwing.
- Ontbrekende audio geeft waarschuwing als audio optioneel is.
- Ontbrekende audio blokkeert als een node die audio verplicht maakt.
- Blokkeren gebeurt alleen als een gekozen node capability verplichte data mist.

Voorbeeld: een boss zonder boss health setup blokkeert. Een NPC zonder walk animatie mag als static/talk NPC met waarschuwing.
