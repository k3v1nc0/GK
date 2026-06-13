# Node-system super dynamic contract

Dit is een harde bouwregel. Het doel is dat Kevin later nieuwe content kan toevoegen zonder opnieuw AI-code nodig te hebben.

## Alles wordt node-data

Alles wat inhoudelijk instelbaar is, moet via nodes of editorpanelen op nodes kunnen:

- assets;
- audio;
- procedural generation seeds;
- procedural preview en bake drafts;
- generated zones, spawn areas, path networks, resource distributions en entity placements;
- world settings;
- levels/zones;
- spawnpoints;
- camera;
- licht;
- fog;
- sky;
- day/night;
- minimap;
- HUD/UI display;
- publish candidates en validation gates;
- snapshot metadata;
- runtime projection source, manifest, read model, safety flags en audit events;
- player levels en XP;
- money/currency;
- merchants;
- NPC taken;
- NPC routes;
- NPC audio;
- groepen en spawn timings;
- quests;
- side quests;
- inventory;
- items;
- readable scrolls;
- attacks;
- boss mechanics;
- HUD panels.

Concrete gamecontent hoort niet in runtimecode. De keten blijft `Database > Editor/Node-system > Publish > Runtime Projection > Runtime Game`.

## Node UI zoals geometry nodes

Een node heeft typed sockets, eigen velden, dropdowns, pickers, kleur/numeric fields en warning/error status. Een output mag naar meerdere inputs. De editor moet typed sockets gebruiken zodat verkeerde koppelingen direct zichtbaar zijn.

## Socket types

Fase 6 heeft de eerste typed sockets vastgelegd als engine-capabilities: `var.string`, `number`, `color`, `asset.reference` en `audio.reference`.

Fase 8 breidt uit met `entity.reference`, `component.reference` en `entity.group.reference`.

Fase 8.1 breidt uit met procedural graph, seed, generation output en generated draft/candidate references.

Fase 9 breidt uit met:

- `generated.zone.candidate.reference`;
- `world.settings.reference`;
- `world.level.reference`;
- `world.zone.reference`;
- `world.spawnpoint.reference`;
- `camera.reference`;
- `lighting.reference`;
- `minimap.view.reference`;
- `minimap.layer.reference`;
- `minimap.marker.reference`;
- `ui.asset-display.reference`.

Fase 10 breidt uit met:

- `publish.candidate.reference`;
- `publish.validation.reference`;
- `publish.snapshot.reference`.

Fase 11 breidt uit met:

- `runtime.projection.source.reference`;
- `runtime.projection.validation.reference`;
- `runtime.projection.manifest.reference`;
- `runtime.projection.read-model.reference`;
- `runtime.projection.audit.reference`.

Deze sockets zijn editor/draft/node-data/publish-boundary/runtime-read-model contracts. Ze bouwen geen Runtime Game renderer en voegen geen concrete gamecontent toe.

## Asset import

Als een bestand in `/var/www/gk/assets` komt:

1. asset-worker ziet het via watcher of periodieke scan.
2. hash, pad, bestandstype en metadata worden opgeslagen waar veilig/haalbaar.
3. GLB metadata wordt gelezen waar mogelijk.
4. UI images krijgen width, height, format en alpha info waar mogelijk.
5. Audio krijgt duration, channels, sample rate en loop candidate info waar mogelijk.
6. Editor krijgt asset library state.
7. Asset verschijnt in asset library.

De scanner kopieert geen assets naar Git, verwijdert geen serverbestanden en publiceert niets naar runtime.

Actuele asset scan na `Assets - new`:

- GLB=4;
- UI images=37;
- audio files=21;
- invalid=0;
- missing=0.

GLB, UI en audio blijven candidates totdat editor/node-data, GameBible/registers of expliciete Kevin-input ze kiest.

## GLB role mapping blijft editor-data

GLB-bestanden mogen niet automatisch een definitieve runtime-role krijgen.

De scanner mag alleen generieke kandidaat-capability metadata registreren. Alleen `assigned` editor-data mag later door publish/runtime worden geconsumeerd als concrete role mapping.

`Taverne.glb` en `Wizard.glb` zijn Fase 8 Kevin-testkeuzes. Ze zijn geen runtime-hardcoded object of NPC.

## Fase 8 entity/component laag

Fase 8 voegt een universal entity/component systeem toe als editor- en node-contract. Een GLB kan kandidaat zijn voor meerdere component-combinaties zonder definitieve runtime-role.

Belangrijke regels:

- `renderable` gebruikt `asset.reference` naar de Fase 7 asset library;
- `audio_emitter` gebruikt `audio.reference` en blijft data-driven;
- `npc_brain`, `combatant`, `boss`, `merchant`, `quest_target` en `player_appearance` blijven candidate totdat editor-data bestaat;
- runtime-active NPC/combat/player behavior vereist expliciete animation mapping via editor-data;
- entity validation en graph draft preview zijn geen publishstap.

## Fase 8.1 procedural generation laag

Fase 8.1 voegt procedural generation toe als core engine-capability in het node-system. Server-side verificatie is afgerond en de basis is klaar.

Belangrijke regels:

- generatoren zijn data-driven en deterministic;
- zelfde seed + zelfde graph + zelfde inputs geeft dezelfde output;
- procedural preview publiceert niets naar Runtime Game;
- procedural bake maakt alleen editor draft data of bake draft result;
- procedural output blijft draft/candidate totdat een publish-flow expliciet publiceert;
- generated entities gebruiken Fase 8 entity/component contracts;
- generated assets gebruiken Fase 7 `asset.reference`;
- generated audio gebruikt `audio.reference` en blijft candidate/editor-data.

## Fase 9 world/camera/minimap laag

Fase 9 is server-side afgerond en klaar. Deze laag voegt world, camera, lighting, minimap en UI display toe als engine-capabilities.

Belangrijke regels:

- world settings, levels, zones, spawnpoints, bounds en transitions zijn node/editor-data contracts;
- generated zones, placements, spawn areas, path networks en resource distributions uit Fase 8.1 blijven draft/candidate input;
- camera mode, follow target, orbit, zoom, bounds, collision en transition zijn node-data;
- directional light, ambient, fog, sky en day/night cycle zijn node-data;
- minimap view, layers, markers, icons en generated layers zijn node-data;
- editor minimap en game minimap mogen verschillen via node-data;
- anonymous/game sessions krijgen geen editor world/minimap beheer;
- Fase 9 publiceert niets naar Runtime Game.

## Fase 10 publish-flow laag

Fase 10 Git-basis is voorbereid als publish-boundary laag en server-side validatie is afgerond.

Publish flow states:

- `draft`;
- `candidate`;
- `publish-ready`;
- `published-snapshot` metadata.

Belangrijke regels:

- publish validation bundelt node graph, asset/audio candidates, entity/component drafts, procedural generated refs en Fase 9 world/UI data;
- generated Fase 8.1 refs blijven draft/candidate input totdat publish validation ze accepteert;
- asset candidates mogen geen definitieve runtime role mapping krijgen;
- UI display natural size blijft metadata en mag display size niet vervangen;
- snapshot creation is metadata-only;
- rollback reference valideert alleen en herstelt runtime niet automatisch;
- anonymous, game en non-admin editor sessions krijgen geen publish-flow beheer;
- Fase 10 publiceert niets naar Runtime Game en wijzigt geen assets.

### Publish nodes

- `gk.publish.status`
- `gk.publish.candidateReference`
- `gk.publish.validate`
- `gk.publish.snapshotMetadata`
- `gk.publish.rollbackReference`

## Fase 11 runtime projection laag

Fase 11 Git-basis is voorbereid als runtime projection contractlaag. Server-side validatie staat nog open.

Belangrijke regels:

- runtime projection source moet uit Fase 10 publish snapshotmetadata en publish-ready validation komen;
- raw editor drafts mogen niet direct worden geprojecteerd;
- procedural preview/bake mag niet direct worden geprojecteerd zonder publish acceptatie;
- generated refs blijven draft/candidate totdat publish validation ze accepteert;
- runtime projection manifest en read model zijn contract/read-model metadata;
- runtime projection bouwt geen renderer, game client, gameplay, HUD runtime, minimap runtime of audio playback;
- UI display natural size blijft metadata en mag display size niet vervangen;
- GLB roles blijven candidate/editor-data tenzij publish data ze later expliciet toewijst;
- runtime projection wijzigt of kopieert geen assets;
- runtime projection bevat geen concrete gamecontent of hardcoded world/camera/light/minimap/HUD/audio values;
- Fase 11 opent Fase 12 niet.

### Runtime projection nodes

- `gk.runtimeProjection.source`
- `gk.runtimeProjection.validate`
- `gk.runtimeProjection.manifest`
- `gk.runtimeProjection.readModel`
- `gk.runtimeProjection.auditEvent`

## UI/HUD/minimap display contract

Source images mogen groot zijn. Natural width/height is metadata en mag niet automatisch display size worden.

UI display nodes moeten dragen:

- `asset.reference`;
- natural width/height metadata indien bekend;
- `displayWidth`;
- `displayHeight`;
- optional min/max width/height;
- `scaleMode`: `contain`, `cover`, `stretch`, `nineSlice`, `none`;
- `anchor`: `topLeft`, `topRight`, `bottomLeft`, `bottomRight`, `center`, `topCenter`, `bottomCenter`, `leftCenter`, `rightCenter`;
- `pivot`: `center`, `topLeft`, `topRight`, `bottomLeft`, `bottomRight`, `bottomCenter`;
- `opacity`;
- `zIndex`;
- responsive rules.

Schema defaults zijn editor/schema hints, geen concrete HUD layout:

- icon display hint: 32x32;
- minimap marker display hint: 24x24;
- small status icon hint: 24x24;
- HUD bar/frame display size blijft node-data required;
- `nineSlice` is alleen geldig met slice margins uit node-data.

## Node families

### World/camera/light nodes

- `gk.world.settings`
- `gk.world.level`
- `gk.world.zone`
- `gk.world.spawnpoint`
- `gk.world.generatedZoneReference`
- `gk.world.generatedPlacementReference`
- `gk.camera.mode`
- `gk.camera.followTarget`
- `gk.camera.orbit`
- `gk.camera.zoom`
- `gk.camera.bounds`
- `gk.camera.collision`
- `gk.camera.transition`
- `gk.lighting.directional`
- `gk.lighting.ambient`
- `gk.lighting.fog`
- `gk.lighting.sky`
- `gk.lighting.dayNightCycle`

### Minimap nodes

- `gk.minimap.view`
- `gk.minimap.layer`
- `gk.minimap.marker`
- `gk.minimap.icon`
- `gk.minimap.zoneBounds`
- `gk.minimap.generatedPathLayer`
- `gk.minimap.generatedResourceLayer`
- `gk.minimap.generatedSpawnLayer`

### HUD/UI nodes

- `gk.ui.assetDisplay`
- `gk.ui.iconDisplay`
- `gk.ui.hudFrame`
- `gk.ui.hudBar`
- `gk.ui.nineSlice`

### Publish nodes

- `gk.publish.status`
- `gk.publish.candidateReference`
- `gk.publish.validate`
- `gk.publish.snapshotMetadata`
- `gk.publish.rollbackReference`

### Runtime projection nodes

- `gk.runtimeProjection.source`
- `gk.runtimeProjection.validate`
- `gk.runtimeProjection.manifest`
- `gk.runtimeProjection.readModel`
- `gk.runtimeProjection.auditEvent`

## Publish en projection regels

- GLB role mapping mag pas runtime worden wanneer editor-data die role expliciet heeft toegewezen en publish-flow dit later accepteert.
- Runtime-active behavior blokkeert zonder verplichte editor-data.
- Procedural preview en bake zijn geen publishstap.
- Generated procedural output mag pas runtime betekenis krijgen wanneer publish-flow de output expliciet accepteert en runtime projection die accepted snapshotmetadata leest.
- Runtime projection is nog geen renderer of Runtime Game client.
- UI display natural size is nooit automatisch display size.
- Missing display size of missing responsive rule geeft validation issue.
- Missing `nineSlice` margins geeft validation issue.
- Asset scan, entity validation, procedural preview, procedural bake, Fase 9 validation, Fase 10 publish validation, Fase 11 runtime projection validation en draft preview zijn geen Runtime Game renderer.
