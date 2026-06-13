# Node-system super dynamic contract

Dit is een harde bouwregel. Het doel is dat Kevin later nieuwe content kan toevoegen zonder opnieuw AI-code nodig te hebben.

## Alles wordt node-data

Alles wat inhoudelijk instelbaar is, moet via nodes of editorpanelen op nodes kunnen:

- assets en audio;
- procedural generation seeds, previews en bake drafts;
- generated zones, spawn areas, path networks, resource distributions en entity placements;
- world settings, levels, zones en spawnpoints;
- camera, lighting, fog, sky en day/night;
- minimap, HUD en UI display;
- publish candidates, validation en snapshotmetadata;
- runtime projection source, manifest, read model, safety flags en audit events;
- runtime client shell status, boot state, projection state en safety flags;
- runtime render surface status, capability, lifecycle en safety flags;
- latere player, economy, merchant, NPC, quest, item, combat, HUD en audio inhoud.

Concrete gamecontent hoort niet in runtimecode. De keten blijft:

```text
Database > Editor/Node-system > Publish > Runtime Projection > Runtime Client Shell > Runtime Render Surface > Runtime Game
```

Fase 13 opent alleen een generieke render-surface capability. Concrete renderer scene assembly, gameplay, HUD/minimap runtime en audio playback blijven latere expliciete fases.

## Node UI zoals geometry nodes

Een node heeft typed sockets, eigen velden, dropdowns, pickers, kleur/numeric fields en warning/error status. Een output mag naar meerdere inputs. De editor moet typed sockets gebruiken zodat verkeerde koppelingen direct zichtbaar zijn.

## Socket types per fase

Fase 6:

- `var.string`;
- `number`;
- `color`;
- `asset.reference`;
- `audio.reference`.

Fase 8:

- `entity.reference`;
- `component.reference`;
- `entity.group.reference`.

Fase 8.1:

- `procedural.seed.reference`;
- `procedural.graph.reference`;
- `generation.output.reference`;
- `generated.entity.draft.reference`;
- `generated.group.draft.reference`;
- `generated.zone.candidate.reference`;
- `generated.placement.candidate.reference`;
- `generated.spawn-area.candidate.reference`;
- `generated.path-network.candidate.reference`;
- `generated.resource-distribution.candidate.reference`.

Fase 9:

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

Fase 10:

- `publish.candidate.reference`;
- `publish.validation.reference`;
- `publish.snapshot.reference`.

Fase 11:

- `runtime.projection.source.reference`;
- `runtime.projection.validation.reference`;
- `runtime.projection.manifest.reference`;
- `runtime.projection.read-model.reference`;
- `runtime.projection.audit.reference`.

Fase 12:

- `runtime.client.shell.reference`;
- `runtime.client.boot-state.reference`;
- `runtime.client.projection-state.reference`;
- `runtime.client.safety.reference`.

Fase 13:

- `runtime.render.surface.reference`;
- `runtime.render.status.reference`;
- `runtime.render.capability.reference`;
- `runtime.render.lifecycle.reference`;
- `runtime.render.safety.reference`.

Deze sockets zijn editor/draft/node-data/publish-boundary/runtime-read-model/runtime-client-shell/runtime-render-surface contracts. Ze voegen geen concrete gamecontent toe.

## Asset import en role mapping

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

GLB, UI en audio blijven candidates totdat editor/node-data, GameBible/registers of expliciete Kevin-input ze kiest. Fase 13 laadt geen GLB, textures, UI images of audio assets.

## Fase 8 entity/component laag

Fase 8 voegt een universal entity/component systeem toe als editor- en node-contract. Een GLB kan kandidaat zijn voor meerdere component-combinaties zonder definitieve runtime-role.

Belangrijke regels:

- `renderable` gebruikt `asset.reference` naar de Fase 7 asset library;
- `audio_emitter` gebruikt `audio.reference` en blijft data-driven;
- runtime-active NPC/combat/player behavior vereist expliciete mapping via editor-data;
- entity validation en graph draft preview zijn geen publishstap.

## Fase 8.1 procedural generation laag

Fase 8.1 voegt procedural generation toe als core engine-capability in het node-system.

Belangrijke regels:

- generatoren zijn data-driven en deterministic;
- preview en bake publiceren niets naar Runtime Game;
- procedural output blijft draft/candidate totdat publish-flow expliciet publiceert;
- generated entities gebruiken Fase 8 entity/component contracts;
- generated assets/audio blijven references en candidates.

## Fase 9 world/camera/minimap laag

Fase 9 voegt world, camera, lighting, minimap en UI display toe als engine-capabilities.

Belangrijke regels:

- world, camera, lighting, minimap en UI display zijn node/editor-data contracts;
- generated zones, placements en paths blijven draft/candidate input;
- UI source natural size is metadata en nooit automatisch display size;
- Fase 9 publiceert niets naar Runtime Game.

## Fase 10 publish-flow laag

Fase 10 is een publish-boundary contractlaag.

Belangrijke regels:

- publish validation bundelt node graph, assets, audio, entities, procedural refs en Fase 9 world/UI data;
- snapshot creation is metadata-only;
- rollback reference valideert alleen en herstelt runtime niet automatisch;
- Fase 10 publiceert niets naar Runtime Game en wijzigt geen assets.

### Publish nodes

- `gk.publish.status`;
- `gk.publish.candidateReference`;
- `gk.publish.validate`;
- `gk.publish.snapshotMetadata`;
- `gk.publish.rollbackReference`.

## Fase 11 runtime projection laag

Fase 11 is een runtime projection contractlaag.

Belangrijke regels:

- runtime projection source moet uit Fase 10 publish snapshotmetadata en publish-ready validation komen;
- raw editor drafts en procedural preview/bake mogen niet direct worden geprojecteerd;
- manifest en read model zijn contract/read-model metadata;
- runtime projection bouwt geen renderer, game client, gameplay, HUD runtime, minimap runtime of audio playback;
- GLB roles blijven candidate/editor-data tenzij latere publish data ze expliciet accepteert;
- runtime projection wijzigt of kopieert geen assets.

### Runtime projection nodes

- `gk.runtimeProjection.source`;
- `gk.runtimeProjection.validate`;
- `gk.runtimeProjection.manifest`;
- `gk.runtimeProjection.readModel`;
- `gk.runtimeProjection.auditEvent`.

## Fase 12 runtime client shell laag

Fase 12 is server-side afgerond en klaar als runtime client shell contractlaag.

Belangrijke regels:

- runtime client shell mag alleen runtime projection read-only routes consumeren;
- geen editor/admin routes;
- geen editor draft/candidate data;
- veilige loading/empty/error/status states;
- projection manifest/records alleen als metadata/read model;
- geen 3D renderer, gameplay, movement, combat, HUD runtime, minimap runtime of audio playback;
- geen assetmutatie;
- geen concrete gamecontent of hardcoded world/camera/light/minimap/HUD/audio values.

### Runtime client shell nodes

- `gk.runtimeClient.shell`;
- `gk.runtimeClient.bootState`;
- `gk.runtimeClient.projectionState`;
- `gk.runtimeClient.safetyFlags`.

## Fase 12.1 game-web service laag

Fase 12.1 is server-side afgerond en klaar als vaste deployment/service-basis voor `apps/game-web`.

Belangrijke regels:

- `gk-game-web` draait als vaste active/enabled systemd service;
- service draait via `/opt/gk/node-v22/bin/node`;
- Apache routeert `/game/`, `/health/game` en `/runtime/projection/` naar `127.0.0.1:3003`;
- game browser-smoke is groen en niet meer skipped;
- geen renderer/gameplay/content/assetmutatie.

## Fase 13 runtime render surface laag

Fase 13 Git-basis is toegevoegd als runtime render surface contractlaag. Server-side verificatie staat nog open.

Belangrijke regels:

- render surface mag een canvas/render host maken;
- render surface mag canvas/WebGL/WebGL2 capability proben;
- render surface mag alleen runtime projection metadata/read-only state consumeren;
- safe empty render state is geldig wanneer er geen renderbare projection payload is;
- render lifecycle states zijn `booting`, `ready`, `empty` en `error`;
- render surface bouwt geen volledige renderer en geen scene assembly;
- render surface laadt geen GLB, texture, UI image of audio asset;
- render surface toont geen concrete world/entity/NPC/quest/economy payload;
- render surface bouwt geen gameplay, movement, combat of audio playback;
- render surface hardcodet geen camera, lighting, HUD, minimap, world of audio values;
- render surface wijzigt of kopieert geen assets;
- Fase 13 opent Fase 14 niet.

### Runtime render surface nodes

- `gk.runtimeRender.surface`;
- `gk.runtimeRender.status`;
- `gk.runtimeRender.capability`;
- `gk.runtimeRender.lifecycle`;
- `gk.runtimeRender.safetyFlags`.

## Publish, projection, client shell en render surface regels

- GLB role mapping mag pas runtime worden wanneer editor-data die role expliciet heeft toegewezen en publish-flow dit later accepteert.
- Runtime-active behavior blokkeert zonder verplichte editor-data.
- Procedural preview en bake zijn geen publishstap.
- Runtime projection is nog geen renderer of gameplayclient.
- Runtime client shell is nog geen renderer, gameplay, HUD, minimap of audio runtime.
- Runtime render surface is nog geen scene assembly, gameplay, HUD, minimap of audio runtime.
- Runtime client shell en render surface mogen geen editor/admin routes of editor draft data consumeren.
- UI display natural size is nooit automatisch display size.
- Missing display size of missing responsive rule geeft validation issue.
- Asset scan, entity validation, procedural preview/bake, Fase 9 validation, Fase 10 publish validation, Fase 11 runtime projection validation, Fase 12 runtime client shell validation en Fase 13 runtime render surface validation zijn geen Runtime Game renderer.
