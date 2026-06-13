# Editor Shell Architecture

De editor shell is een generieke editorwerkplek. Deze laag is een editor-capability, geen contentlaag.

## Layout

De standaardindeling bevat:

- links: `Node Library`;
- midden: tabbed main area met `Node Canvas` en `Viewport / World Preview`;
- rechts: `Inspector`, `Validation` en `UI Display Inspector`;
- onder: `History`;
- dock tabs voor asset, audio, entity/component, procedural generation, publish flow, runtime projection, world, zone, camera, lighting, HUD, minimap en game-user beheer.

Fase 9 voegt panel state toe voor:

- `World Panel`;
- `Zone Panel`;
- `Camera Panel`;
- `Lighting Panel`;
- `Minimap Panel`;
- `UI Display Inspector`.

Fase 10 voegt panel state toe voor:

- `Publish Flow`.

Fase 11 voegt panel state toe voor:

- `Runtime Projection`.

Fase 12 voegt geen editorpanel toe. Fase 12 voegt een aparte runtime client shell toe aan `apps/game-web`, zodat de browser-runtime projection read-only metadata kan tonen zonder editor/admin routes te consumeren.

Deze panels en shells zijn state/contractvoorbereiding. Ze bevatten geen concrete world, camera, lighting, minimap, HUD, publish payload, runtime projection payload, renderer output of runtimecontent.

## Node Canvas

Het node canvas bevat generieke graph-capabilities voor schema, asset reference, validation, publish gates, runtime projection gates, runtime client shell gates en typed node graph editing.

Het canvas mag geen concrete quests, NPCs, routes, prijzen, camera, licht, minimap, audio, HUD-keuzes, generated worldcontent, assetrollen, projection payloads, runtime shell payloads of renderer instructions bevatten. Zulke waarden horen uit database, editor/node-data, registers, Game Bible, procedural draft/bake data, publish-data of runtime projection metadata te komen.

Fase 9 breidt de node canvas capabilities uit met:

- world settings, level, zone en spawnpoint nodes;
- generated zone/placement references uit Fase 8.1;
- camera nodes;
- lighting/fog/sky/day-night nodes;
- minimap view/layer/marker/icon/generated layer nodes;
- UI asset display nodes.

Fase 10 breidt de node canvas capabilities uit met publish-boundary nodes:

- publish status;
- publish candidate reference;
- publish validate;
- publish snapshot metadata;
- publish rollback reference.

Fase 11 breidt de node canvas capabilities uit met runtime projection nodes:

- runtime projection source;
- runtime projection validate;
- runtime projection manifest;
- runtime projection read model;
- runtime projection audit event.

Fase 12 breidt de node canvas capabilities uit met runtime client shell nodes:

- runtime client shell;
- runtime client boot state;
- runtime client projection state;
- runtime client safety flags.

## UI Display Inspector

De UI Display Inspector moet bij UI/HUD/minimap assets tonen:

- asset reference;
- source/natural size indien bekend;
- display size;
- scale mode;
- anchor;
- pivot;
- validation issues.

Belangrijke regel: natural size is metadata, geen display size. Display size, scale mode, anchor en pivot moeten uit node-data/editor-data/publish data komen.

UI scaling validation is server-side bevestigd voor Fase 9 en blijft onderdeel van Fase 10 publish validation, Fase 11 runtime projection validation en Fase 12 runtime client shell safety checks.

## Publish Flow Panel

Het Publish Flow panel toont alleen contract/statusinformatie:

- phase/status;
- validation issues;
- candidate summary;
- candidate references;
- snapshot metadata;
- selected snapshot metadata.

Het panel:

- vereist editor session en `editor_admin`;
- is metadata-only;
- publiceert niets naar Runtime Game;
- wijzigt geen assets;
- accepteert geen concrete gamecontent;
- verzint geen world, NPC, quest, economy, HUD, minimap of audio data.

## Runtime Projection Panel

Het Runtime Projection panel toont alleen contract/statusinformatie:

- phase/status;
- validation issues;
- source snapshot metadata;
- projection manifest metadata;
- runtime read-model metadata;
- safety flags;
- audit events;
- runtime read-only route summary.

Het panel:

- vereist editor session en `editor_admin`;
- maakt geen automatic projection;
- bouwt geen Runtime Game renderer of client;
- wijzigt geen assets;
- accepteert geen concrete gamecontent;
- verzint geen world, NPC, quest, economy, HUD, minimap of audio data;
- toont geen asset previews die GLB role mapping definitief maken.

## Runtime Client Shell

Fase 12 runtime client shell zit in `apps/game-web`, niet in de editor shell.

De shell toont alleen:

- runtime client shell marker;
- projection status area;
- manifest empty-state area;
- records empty-state area;
- safe error area;
- read-only projection route summary.

De shell:

- consumeert alleen `/runtime/projection/status`, `/runtime/projection/manifest` en `/runtime/projection/records`;
- consumeert geen editor/admin routes;
- gebruikt geen editor session, editor CSRF token of editor credentials;
- toont geen raw editor draft/candidate data;
- bouwt geen renderer, gameplay, movement, combat, HUD/minimap runtime of audio playback;
- wijzigt geen assets;
- verzint geen concrete world, NPC, quest, economy, HUD, minimap of audio data.

## Asset, audio, entity, procedural, publish, projection en Fase 9 panels

Panels zijn generieke capabilities:

- `Asset Panel` leest Fase 7 asset-library state en toont GLB/UI/audio counts.
- `Audio Panel` leest dezelfde asset library en filtert op audio records.
- `Entity / Component Panel` toont Fase 8 component stack state.
- `Procedural Generation Panel` toont Fase 8.1 seed controls, generator graph state, preview result state, validation issues, bake draft actions en generated candidate lists.
- `Publish Flow` toont Fase 10 validation status, candidate summary en snapshot metadata zonder runtime publish.
- `Runtime Projection` toont Fase 11 projection status, validation issues, source snapshot metadata, manifest/read-model metadata en safety flags zonder renderer.
- `World Panel` toont world settings draft state en generated candidate input, zonder runtime publish.
- `Zone Panel` toont zone draft state en generated candidate input, zonder runtime publish.
- `Camera Panel` toont camera node-data en validation issues, zonder runtime defaults af te dwingen.
- `Lighting Panel` toont lighting/fog/sky/day-night node-data en validation issues, zonder runtime presets af te dwingen.
- `Minimap Panel` toont editor/game minimap view state, layers, markers en validation issues. Editor en game views mogen verschillen via node-data.
- `UI Display Inspector` toont display contracts en validation issues.
- `Game Users` vereist editor scope en `editor_admin`.

GLB, UI en audio assets mogen alleen kandidaat-metadata tonen totdat Kevin/editor concrete node-koppelingen kiest en publish/runtime projection die data later contractueel accepteert.

## Viewport / World Preview

De viewport is een aparte tab naast `Node Canvas`.

De preview blijft gated:

- geen dummy wereld;
- geen dummy assets;
- geen hard-coded camera of licht;
- geen GLB-role mapping;
- geen audio of HUD-keuzes;
- geen minimap layout zonder node-data;
- geen runtime publish;
- geen runtime projection als renderer-output;
- geen runtime client shell als renderer-output.

De preview wacht op editor draft, procedural preview/bake data of gepubliceerde world/node-data. Procedural preview mag editor-output tonen zonder runtime publish. Fase 10 voegt geen runtime renderer toe. Fase 11 voegt geen runtime renderer of game client toe. Fase 12 voegt alleen een runtime client shell toe, geen renderer of gameplay.

## Auth boundary

Editor shell toegang gebruikt editor-auth. Game sessions mogen geen editor panel toegang krijgen.

Fase 9 editor world/minimap/UI display beheer blijft editor-only:

- anonymous denied;
- game session denied;
- state-changing route contracts vereisen CSRF/Origin protection;
- route contracts publiceren niets naar Runtime Game;
- route contracts wijzigen geen assets.

Fase 10 publish-flow beheer is strenger:

- editor admin only;
- anonymous denied;
- game session denied;
- non-admin editor denied;
- state-changing route contracts vereisen CSRF/Origin protection;
- route contracts publiceren niets naar Runtime Game;
- route contracts wijzigen geen assets.

Fase 11 runtime projection beheer is ook editor admin only:

- anonymous denied;
- game session denied;
- non-admin editor denied;
- state-changing projection route contracts vereisen CSRF/Origin protection;
- route contracts bouwen geen renderer of game client;
- route contracts wijzigen geen assets.

Runtime projection read-only routes zijn read-only, geven veilige empty states wanneer er nog geen projection bestaat en mogen geen editor draft data lekken.

Fase 12 runtime client shell gebruikt alleen runtime projection read-only routes. De shell mag geen editor/admin routes, editor sessions of editor draft data consumeren.

## API runtime contract

Fase 9 route contracts:

- `GET /editor/world/settings`;
- `POST /editor/world/validate`;
- `GET /editor/minimap/settings`;
- `POST /editor/minimap/validate`;
- `GET /editor/ui-display/assets`;
- `POST /editor/ui-display/validate`.

Fase 10 route contracts:

- `GET /editor/publish/status`;
- `POST /editor/publish/validate`;
- `POST /editor/publish/snapshots`;
- `GET /editor/publish/snapshots`;
- `GET /editor/publish/snapshots/:id`;
- `POST /editor/publish/rollback/validate`.

Fase 11 editor/admin route contracts:

- `GET /editor/runtime-projection/status`;
- `POST /editor/runtime-projection/validate`;
- `POST /editor/runtime-projection/project`;
- `GET /editor/runtime-projection/manifests`;
- `GET /editor/runtime-projection/manifests/:id`.

Fase 11 runtime read-only route contracts:

- `GET /runtime/projection/status`;
- `GET /runtime/projection/manifest`;
- `GET /runtime/projection/records`.

Fase 12 runtime client shell routes:

- `GET /`;
- `GET /game`;
- `GET /game/`;
- `GET /game/shell.json`;
- `GET /health/game`.

Deze route contracts:

- blijven CSRF/Origin beschermd voor state-changing editor requests;
- geven anonymous/game/non-admin sessions geen editor beheer;
- uploaden geen assets;
- maken geen assets aan;
- kopieren geen assets naar Git;
- verzinnen geen concrete gamecontent;
- bouwen geen Runtime Game renderer of gameplayclient.

## Assetstatus

Asset scan na `Assets - new`:

- GLB=4;
- UI images=37;
- audio files=21;
- invalid=0;
- missing=0.

HUD-, icon- en minimap marker-bestanden zijn UI/image assets en blijven candidates. Ambience, music, SFX en UI-audio zijn audio assets en blijven candidates.

## Server/runtime gate

Fase 8.1 is server-side gevalideerd.

Fase 9 is server-side afgerond en klaar.

Fase 10 is server-side afgerond en klaar.

Fase 11 is server-side afgerond en klaar.

Fase 12 Git-basis is voorbereid, maar server-side validatie staat open voor:

- build/typecheck/test/lint;
- runtime projection read-only route smokes;
- game/runtime shell route smokes;
- browser-smoke runtime shell marker;
- bevestiging dat runtime client shell geen editor/admin routes gebruikt;
- no-runtime-renderer/no-gameplay/no-movement/no-combat/no-audio-playback/no-concrete-gamecontent/no-asset-mutation.
