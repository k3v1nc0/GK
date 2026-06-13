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
- runtime scene assembly source, status, plan, descriptor en safety flags;
- latere player, economy, merchant, NPC, quest, item, combat, HUD en audio inhoud.

Concrete gamecontent hoort niet in runtimecode. De keten blijft:

```text
Database > Editor/Node-system > Publish > Runtime Projection > Runtime Client Shell > Runtime Render Surface > Runtime Scene Assembly > Runtime Game
```

Fase 13 is server-side afgerond als generieke render-surface capability. Fase 14 opent alleen projection-driven scene assembly metadata. Concrete asset loading, renderer draw calls, gameplay, HUD/minimap runtime en audio playback blijven latere expliciete fases.

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

Fase 14:

- `runtime.scene.assembly.source.reference`;
- `runtime.scene.assembly.status.reference`;
- `runtime.scene.assembly.plan.reference`;
- `runtime.scene.assembly.descriptor.reference`;
- `runtime.scene.assembly.safety.reference`.

Deze sockets zijn editor/draft/node-data/publish-boundary/runtime-read-model/runtime-client-shell/runtime-render-surface/runtime-scene-assembly contracts. Ze voegen geen concrete gamecontent toe.

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

GLB, UI en audio blijven candidates totdat editor/node-data, GameBible/registers of expliciete Kevin-input ze kiest. Fase 14 laadt geen GLB, textures, UI images of audio assets en maakt geen definitive role mapping.

## Fase 13 runtime render surface laag

Fase 13 is server-side afgerond en klaar als runtime render surface contractlaag.

Belangrijke regels:

- render surface mag een canvas/render host maken;
- render surface mag canvas/WebGL/WebGL2 capability proben;
- render surface mag alleen runtime projection metadata/read-only state consumeren;
- safe empty render state is geldig wanneer er geen renderbare projection payload is;
- render surface bouwt geen volledige renderer en geen scene assembly;
- render surface laadt geen GLB, texture, UI image of audio asset;
- render surface bouwt geen gameplay, movement, combat of audio playback;
- render surface hardcodet geen camera, lighting, HUD, minimap, world of audio values;
- render surface wijzigt of kopieert geen assets.

### Runtime render surface nodes

- `gk.runtimeRender.surface`;
- `gk.runtimeRender.status`;
- `gk.runtimeRender.capability`;
- `gk.runtimeRender.lifecycle`;
- `gk.runtimeRender.safetyFlags`.

## Fase 14 runtime scene assembly laag

Fase 14 Git-basis is toegevoegd als projection-driven scene assembly contractlaag. Server-side verificatie staat nog open.

Belangrijke regels:

- scene assembly consumeert alleen runtime projection read-only records;
- scene assembly produceert alleen neutrale scene plan metadata;
- empty scene plan is geldig wanneer runtime projection records leeg zijn;
- scene descriptors mogen geen concrete payload, renderer instruction, asset-load URL of final asset role bevatten;
- scene assembly gebruikt geen editor/admin routes en geen editor draft/candidate data;
- scene assembly laadt geen GLB, texture, UI image of audio asset;
- scene assembly finaliseert geen asset/GLB roles;
- scene assembly rendert geen scene en doet geen renderer draw calls;
- scene assembly bouwt geen gameplay, movement, combat of audio playback;
- scene assembly hardcodet geen world, camera, lighting, HUD, minimap of audio values;
- scene assembly wijzigt of kopieert geen assets;
- Fase 14 opent Fase 15 niet.

### Runtime scene assembly nodes

- `gk.runtimeSceneAssembly.source`;
- `gk.runtimeSceneAssembly.plan`;
- `gk.runtimeSceneAssembly.descriptor`;
- `gk.runtimeSceneAssembly.status`;
- `gk.runtimeSceneAssembly.safetyFlags`.

## Publish, projection, client shell, render surface en scene assembly regels

- GLB role mapping mag pas runtime worden wanneer editor-data die role expliciet heeft toegewezen en publish-flow dit later accepteert.
- Runtime-active behavior blokkeert zonder verplichte editor-data.
- Procedural preview en bake zijn geen publishstap.
- Runtime projection is geen renderer of gameplayclient.
- Runtime client shell is geen renderer, gameplay, HUD, minimap of audio runtime.
- Runtime render surface is geen scene assembly, gameplay, HUD, minimap of audio runtime.
- Runtime scene assembly is geen renderer, asset-loader, gameplay, HUD, minimap of audio runtime.
- Runtime client shell, render surface en scene assembly mogen geen editor/admin routes of editor draft data consumeren.
- UI display natural size is nooit automatisch display size.
- Asset scan, entity validation, procedural preview/bake, Fase 9 validation, Fase 10 publish validation, Fase 11 runtime projection validation, Fase 12 runtime client shell validation, Fase 13 runtime render surface validation en Fase 14 runtime scene assembly validation zijn geen Runtime Game renderer.
