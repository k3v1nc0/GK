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
- quest authoring quest, dialogue, objective, interactable, reward, unlock, checkpoint, asset-role en publish bridge records;
- runtime projection source, manifest, read model, safety flags en audit events;
- runtime client shell status, boot state, projection state en safety flags;
- runtime render surface status, capability, lifecycle en safety flags;
- runtime scene assembly source, status, plan, descriptor en safety flags;
- runtime asset reference planning source, status, plan, descriptor, candidate en safety flags;
- runtime game source, status, boot, session, input, save-state, diagnostics en safety flags;
- runtime quest slice, dialogue, objective, interactable, reward, unlock, checkpoint, asset-role, state, diagnostics en safety flags;
- latere concrete player, economy, merchant, NPC, quest, item, combat, HUD en audio inhoud.

Concrete gamecontent hoort niet in runtimecode. De keten blijft:

```text
Database > Editor/Node-system > Quest Authoring > Publish > Runtime Projection > Runtime Client Shell > Runtime Render Surface > Runtime Scene Assembly > Runtime Asset Reference Planning > Runtime Game Core > Runtime Quest Slice > Runtime Game
```

## Spelinhoud eerst in nodes

Als een fase, prototype of voorproefje concrete spelinhoud nodig heeft, moet die inhoud eerst als node-system voorbereiding worden gebouwd. Dat mag en is zelfs de gewenste route, zolang het via de data-keten loopt.

Toegestaan als voorbereiding:

- nieuwe node types;
- node fields en sockets;
- schema's en validators;
- editorpanelen of schema-gegenereerde panelen;
- publish/read-model contracts;
- expliciete node/editor-data;
- neutrale testfixtures die alleen tests voeden.

Niet toegestaan:

- concrete spelinhoud direct in runtimecode zetten;
- runtime fallback content maken wanneer node/editor-data ontbreekt;
- testfixtures door de game runtime laten gebruiken;
- dummy assets of dummy published data toevoegen om een fase groen te laten lijken;
- hardcoded NPCs, quests, rewards, unlocks, flags, camera, lighting, HUD, minimap, audio of asset roles gebruiken.

Beslisregel: als concrete spelinhoud nog geen node type, node field, validator, publish contract of read-model pad heeft, moet eerst die node-system voorbereiding worden gebouwd. De runtime mag daarna alleen published read-model data consumeren.

Fase 13 is server-side afgerond als generieke render-surface capability. Fase 14 is server-side afgerond als projection-driven scene assembly metadata. Fase 15 is server-side afgerond als runtime asset-reference planning metadata. Fase 16 is afgerond als fundering/herbaseline. Fase 17 is server-side afgerond als Runtime Game Core. Fase 18 is server-side afgerond als generieke non-visual blocked runtime quest-slice. Fase 19 is geopend als Quest authoring publish bridge Git-basis, maar nog niet server-side geverifieerd of formeel afgerond.

Concrete questcontent, concrete asset loading, renderer draw calls, full gameplay, HUD/minimap runtime, combat/economy/multiplayer en audio playback blijven latere expliciete fases totdat de bijbehorende node-data en publishcontracts aanwezig zijn.

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

Fase 15:

- `runtime.asset.reference.source.reference`;
- `runtime.asset.reference.planning.status.reference`;
- `runtime.asset.reference.plan.reference`;
- `runtime.asset.reference.descriptor.reference`;
- `runtime.asset.reference.candidate.reference`;
- `runtime.asset.reference.safety.reference`.

Fase 17:

- `runtime.game.source.reference`;
- `runtime.game.status.reference`;
- `runtime.game.boot.reference`;
- `runtime.game.session.reference`;
- `runtime.game.input.reference`;
- `runtime.game.save-state.reference`;
- `runtime.game.diagnostics.reference`;
- `runtime.game.safety.reference`.

Fase 18:

- `runtime.quest.slice.reference`;
- `runtime.quest.dialogue.reference`;
- `runtime.quest.objective.reference`;
- `runtime.quest.interactable.reference`;
- `runtime.quest.reward.reference`;
- `runtime.quest.unlock.reference`;
- `runtime.quest.checkpoint.reference`;
- `runtime.quest.asset-role.reference`;
- `runtime.quest.state.reference`;
- `runtime.quest.diagnostics.reference`;
- `runtime.quest.safety.reference`.

Fase 19:

- `quest.authoring.quest.reference`;
- `quest.authoring.dialogue.reference`;
- `quest.authoring.objective.reference`;
- `quest.authoring.interactable.reference`;
- `quest.authoring.reward.reference`;
- `quest.authoring.unlock.reference`;
- `quest.authoring.checkpoint.reference`;
- `quest.authoring.asset-role.reference`;
- `quest.authoring.publish-contract.reference`.

Deze sockets zijn editor/draft/node-data/publish-boundary/runtime-read-model/runtime-client-shell/runtime-render-surface/runtime-scene-assembly/runtime-asset-reference-planning/runtime-game-core/runtime-quest-slice contracts. Ze voegen geen concrete gamecontent toe.

## Runtime projection record types voor Fase 18 en Fase 19

Fase 18 voegt published read-model record types toe voor:

- `quest.reference`;
- `dialogue.reference`;
- `objective.reference`;
- `interactable.reference`;
- `reward.reference`;
- `unlock.reference`;
- `checkpoint.reference`;
- `asset-role.reference`.

Fase 19 maakt authoring-node records die naar deze runtime projection record types mappen. Runtime projection records bevatten references, geen runtime payload. De payload blijft editor/node-data en publish-source metadata.

Deze record types mogen alleen via published data gevuld worden. Runtimecode mag geen concrete questcontentwaarden bevatten.

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

GLB, UI en audio blijven candidates totdat editor/node-data, GameBible/registers of expliciete Kevin-input ze kiest. Fase 15 laadt geen GLB, textures, UI images of audio assets, fetcht geen asset bytes en maakt geen definitive role mapping. Fase 17 consumeert alleen Fase 15 asset-reference metadata en opent nog geen asset byte loading of final role mapping.

Fase 18 asset-regel:

- asset-role records moeten expliciet in published data bestaan;
- unresolved asset roles moeten zichtbaar runtime completion blokkeren;
- non-visual blocked slice is toegestaan;
- dummy assets zijn verboden;
- runtime hardcoding van asset roles is verboden;
- volledig visual playable claim mag pas na editor/node-data mapping of expliciete Kevin-confirmatie.

Fase 19 asset-regel:

- asset-role authoring nodes mogen asset-role records voorbereiden;
- final asset-role mapping blijft later;
- geen asset byte loading;
- geen asset copy/mutation;
- geen dummy assets.

## Fase 15 runtime asset reference planning laag

Fase 15 is server-side afgerond als runtime asset-reference planning contractlaag.

Belangrijke regels:

- asset reference planning consumeert alleen runtime scene-plan metadata;
- asset reference planning produceert alleen neutrale asset-reference plan metadata;
- empty asset reference plan is geldig wanneer scene descriptors leeg zijn;
- asset reference descriptors en candidates mogen geen concrete payload, asset-load URL, asset byte URL, renderer instruction of final asset role bevatten;
- asset reference planning gebruikt geen editor/admin routes en geen editor draft/candidate data;
- asset reference planning laadt geen GLB, texture, UI image of audio asset;
- asset reference planning fetcht geen asset bytes;
- asset reference planning finaliseert geen asset/GLB roles;
- asset reference planning rendert geen scene en doet geen renderer draw calls;
- asset reference planning bouwt geen gameplay, movement, combat of audio playback;
- asset reference planning hardcodet geen world, camera, lighting, HUD, minimap of audio values;
- asset reference planning wijzigt of kopieert geen assets.

### Runtime asset reference planning nodes

- `gk.runtimeAssetReferencePlanning.source`;
- `gk.runtimeAssetReferencePlanning.plan`;
- `gk.runtimeAssetReferencePlanning.descriptor`;
- `gk.runtimeAssetReferencePlanning.candidate`;
- `gk.runtimeAssetReferencePlanning.status`;
- `gk.runtimeAssetReferencePlanning.safetyFlags`.

## Fase 17 Runtime Game Core laag

Fase 17 is server-side afgerond als Runtime Game Core boot- en contractlaag.

Belangrijke regels:

- Runtime Game Core consumeert alleen published runtime projection read-models en Fase 15 asset-reference metadata;
- Runtime Game Core gebruikt geen editor/admin routes en geen draft/candidate data;
- default boot mag veilig blokkeren wanneer published manifest, world read-model of asset-reference metadata ontbreekt;
- ontbrekende published data wordt diagnostic, geen dummy world, dummy NPC, dummy quest of fallback model;
- player session bootstrap bevat geen concrete player content;
- input adapter consumeert intenten maar bindt nog geen movement of combat;
- save/load basis bewaart runtime-state only en muteert geen published data;
- camera/HUD/audio blijven adapterpunten die published data vereisen;
- Runtime Game Core laadt geen asset bytes en finaliseert geen asset roles;
- Runtime Game Core doet geen renderer draw calls;
- Runtime Game Core hardcodet geen world, camera, lighting, HUD, minimap, audio of content values;
- Runtime Game Core bouwt geen quest, combat, economy, multiplayer, movement of audio playback.

### Runtime Game Core nodes

- `gk.runtimeGameCore.source`;
- `gk.runtimeGameCore.boot`;
- `gk.runtimeGameCore.playerSession`;
- `gk.runtimeGameCore.inputAdapter`;
- `gk.runtimeGameCore.saveState`;
- `gk.runtimeGameCore.diagnostics`.

## Fase 18 Runtime Quest Slice laag

Fase 18 is server-side afgerond als generieke non-visual blocked runtime quest-slice.

Belangrijke runtime-regels:

- Runtime Quest Slice consumeert alleen published runtime projection read-model records;
- runtime gebruikt geen editor/admin routes en geen draft/candidate data;
- runtime hardcodet geen concrete questcontent, dialogue, objective, reward, checkpoint of asset-role data;
- Quest 00 en andere quests zijn later node-data/editor-data, niet runtimecode;
- testfixtures mogen alleen tests voeden en mogen nooit runtime fallback of gamecontent worden;
- questmutaties lopen via quest/objective executors;
- dialogue runtime advance gebeurt via dialogue state;
- reward applicator grant alleen vanuit published data;
- save/load bewaart runtime quest/dialogue/checkpoint state only;
- unresolved asset roles blijven visible blockers;
- runtime laadt geen assets, fetcht geen bytes en finaliseert geen asset roles;
- runtime opent geen combat, economy, movement, multiplayer of audio playback.

### Runtime Quest Slice nodes

- `gk.runtimeQuestSlice.source`;
- `gk.runtimeQuestSlice.questState`;
- `gk.runtimeQuestSlice.dialogueExecutor`;
- `gk.runtimeQuestSlice.objectiveEvaluator`;
- `gk.runtimeQuestSlice.rewardApplicator`;
- `gk.runtimeQuestSlice.checkpointFlow`;
- `gk.runtimeQuestSlice.assetRoleBlockers`.

## Fase 19 Quest Authoring Publish Bridge laag

Fase 19 is geopend als generieke editor/node-data naar publish/read-model brug.

Belangrijke regels:

- Quest authoring nodes mogen concrete contentvelden voorbereiden, maar die content blijft editor/node-data;
- publish bridge emit alleen normalized runtime projection record references;
- runtime projection records bevatten geen runtime payload;
- runtime fallbackcontent is verboden;
- dummy published data en dummy assets zijn verboden;
- asset byte loading, asset copy/mutation en final asset-role resolving zijn verboden;
- Quest 00 wordt nog niet als echte node-data ingevoerd in deze fase.

### Quest Authoring nodes

- `gk.questAuthoring.quest`;
- `gk.questAuthoring.dialogue`;
- `gk.questAuthoring.objective`;
- `gk.questAuthoring.interactable`;
- `gk.questAuthoring.reward`;
- `gk.questAuthoring.unlock`;
- `gk.questAuthoring.checkpoint`;
- `gk.questAuthoring.assetRole`;
- `gk.questAuthoring.publishBridge`.

## Publish, projection, client shell, render surface, scene assembly, asset reference planning en runtime game core regels

- GLB role mapping mag pas runtime worden wanneer editor-data die role expliciet heeft toegewezen en publish-flow dit later accepteert.
- Runtime-active behavior blokkeert zonder verplichte editor-data.
- Procedural preview en bake zijn geen publishstap.
- Runtime projection is geen renderer of gameplayclient.
- Runtime client shell is geen renderer, gameplay, HUD, minimap of audio runtime.
- Runtime render surface is geen scene assembly, gameplay, HUD, minimap of audio runtime.
- Runtime scene assembly is geen renderer, asset-loader, gameplay, HUD, minimap of audio runtime.
- Runtime asset reference planning is geen asset loader, renderer, gameplay, HUD, minimap of audio runtime.
- Runtime Game Core is geen renderer, combat, economy, multiplayer, movement of audio runtime.
- Runtime Quest Slice is geen asset loader, renderer, combat, economy, multiplayer, movement of audio runtime.
- Quest Authoring Publish Bridge is geen runtime renderer, runtime gameplayclient of asset-role resolver.
- Runtime client shell, render surface, scene assembly, asset reference planning, Runtime Game Core en Runtime Quest Slice mogen geen editor/admin routes of editor draft data consumeren.
- UI display natural size is nooit automatisch display size.
- Asset scan, entity validation, procedural preview/bake, Fase 9 validation, Fase 10 publish validation, Fase 11 runtime projection validation, Fase 12 runtime client shell validation, Fase 13 runtime render surface validation, Fase 14 runtime scene assembly validation, Fase 15 runtime asset reference planning validation, Fase 17 Runtime Game Core validation, Fase 18 Runtime Quest Slice validation en Fase 19 Quest Authoring validation zijn geen Runtime Game renderer.