# Editor Shell Architecture

De editor shell is een generieke editorwerkplek. Deze laag is een editor-capability, geen contentlaag.

## Layout

De standaardindeling bevat:

- links: `Node Library`;
- midden: tabbed main area met `Node Canvas` en `Viewport / World Preview`;
- rechts: `Inspector`, `Validation` en `UI Display Inspector`;
- onder: `History`;
- dock tabs voor asset, audio, entity/component, procedural generation, publish flow, world, zone, camera, lighting, HUD, minimap en game-user beheer.

Fase 9 voegt panel state toe voor:

- `World Panel`;
- `Zone Panel`;
- `Camera Panel`;
- `Lighting Panel`;
- `Minimap Panel`;
- `UI Display Inspector`.

Fase 10 voegt panel state toe voor:

- `Publish Flow`.

Deze panels zijn state/contractvoorbereiding. Ze bevatten geen concrete world, camera, lighting, minimap, HUD, publish payload of runtimecontent.

## Node Canvas

Het node canvas bevat generieke graph-capabilities voor schema, asset reference, validation, publish gates en typed node graph editing.

Het canvas mag geen concrete quests, NPCs, routes, prijzen, camera, licht, minimap, audio, HUD-keuzes, generated worldcontent of assetrollen bevatten. Zulke waarden horen uit database, editor/node-data, registers, Game Bible, procedural draft/bake data of publish-data te komen.

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

## UI Display Inspector

De UI Display Inspector moet bij UI/HUD/minimap assets tonen:

- asset reference;
- source/natural size indien bekend;
- display size;
- scale mode;
- anchor;
- pivot;
- validation issues.

Belangrijke regel: natural size is metadata, geen display size. Display size, scale mode, anchor en pivot moeten uit node-data/editor-data komen.

UI scaling validation is server-side bevestigd voor Fase 9 en blijft onderdeel van Fase 10 publish validation.

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

## Asset, audio, entity, procedural, publish en Fase 9 panels

Panels zijn generieke capabilities:

- `Asset Panel` leest Fase 7 asset-library state en toont GLB/UI/audio counts.
- `Audio Panel` leest dezelfde asset library en filtert op audio records.
- `Entity / Component Panel` toont Fase 8 component stack state.
- `Procedural Generation Panel` toont Fase 8.1 seed controls, generator graph state, preview result state, validation issues, bake draft actions en generated candidate lists.
- `Publish Flow` toont Fase 10 validation status, candidate summary en snapshot metadata zonder runtime publish.
- `World Panel` toont world settings draft state en generated candidate input, zonder runtime publish.
- `Zone Panel` toont zone draft state en generated candidate input, zonder runtime publish.
- `Camera Panel` toont camera node-data en validation issues, zonder runtime defaults af te dwingen.
- `Lighting Panel` toont lighting/fog/sky/day-night node-data en validation issues, zonder runtime presets af te dwingen.
- `Minimap Panel` toont editor/game minimap view state, layers, markers en validation issues. Editor en game views mogen verschillen via node-data.
- `UI Display Inspector` toont display contracts en validation issues.
- `Game Users` vereist editor scope en `editor_admin`.

GLB, UI en audio assets mogen alleen kandidaat-metadata tonen totdat Kevin/editor concrete node-koppelingen kiest.

## Viewport / World Preview

De viewport is een aparte tab naast `Node Canvas`.

De preview blijft gated:

- geen dummy wereld;
- geen dummy assets;
- geen hard-coded camera of licht;
- geen GLB-role mapping;
- geen audio of HUD-keuzes;
- geen minimap layout zonder node-data;
- geen runtime publish.

De preview wacht op editor draft, procedural preview/bake data of gepubliceerde world/node-data. Procedural preview mag editor-output tonen zonder runtime publish. Fase 10 voegt geen runtime renderer toe.

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

Deze route contracts:

- blijven CSRF/Origin beschermd voor state-changing requests;
- geven anonymous/game sessions geen beheer;
- uploaden geen assets;
- maken geen assets aan;
- kopieren geen assets naar Git;
- verzinnen geen concrete gamecontent;
- publiceren niets naar Runtime Game.

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

Fase 10 Git-basis is voorbereid, maar server-side validatie staat open:

- `pnpm build`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm lint`;
- publish route smokes;
- auth/CSRF smokes;
- panel smoke;
- no-runtime-publish;
- no-asset-mutation.
