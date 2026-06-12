# Editor Shell Architecture

De editor shell is een generieke editorwerkplek. Deze laag is een editor-capability, geen contentlaag.

## Layout

De standaardindeling bevat:

- links: `Node Library`;
- midden: tabbed main area met `Node Canvas` en `Viewport / World Preview`;
- rechts: `Inspector`, `Validation` en `UI Display Inspector`;
- onder: `History`;
- dock tabs voor asset, audio, entity/component, procedural generation, world, zone, camera, lighting, HUD, minimap en game-user beheer.

Fase 9 voegt panel state toe voor:

- `World Panel`;
- `Zone Panel`;
- `Camera Panel`;
- `Lighting Panel`;
- `Minimap Panel`;
- `UI Display Inspector`.

Deze panels zijn state/contractvoorbereiding. Ze bevatten geen concrete world, camera, lighting, minimap of HUD content.

Server-side panel smoke is bevestigd voor alle Fase 9 panels.

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

UI scaling validation is server-side bevestigd.

## Asset, audio, entity, procedural en Fase 9 panels

Panels zijn generieke capabilities:

- `Asset Panel` leest Fase 7 asset-library state en toont GLB/UI/audio counts.
- `Audio Panel` leest dezelfde asset library en filtert op audio records.
- `Entity / Component Panel` toont Fase 8 component stack state.
- `Procedural Generation Panel` toont Fase 8.1 seed controls, generator graph state, preview result state, validation issues, bake draft actions en generated candidate lists.
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

De preview wacht op editor draft, procedural preview/bake data of gepubliceerde world/node-data. Procedural preview mag editor-output tonen zonder runtime publish.

## Auth boundary

Editor shell toegang gebruikt editor-auth. Game sessions mogen geen editor panel toegang krijgen.

Fase 9 editor world/minimap/UI display beheer blijft editor-only:

- anonymous denied;
- game session denied;
- state-changing route contracts vereisen CSRF/Origin protection;
- route contracts publiceren niets naar Runtime Game;
- route contracts wijzigen geen assets.

Server-side bevestigd:

- editor login OK;
- `/auth/editor/me` OK met `editor_admin`;
- anonymous denied OK, 401 en niet 404;
- game smoke-scope denied OK, 403 en niet 404.

## API runtime contract

Bestaande API runtime contracts blijven geldig. Fase 9 voegt editor-only route contracts toe:

- `GET /editor/world/settings`;
- `POST /editor/world/validate`;
- `GET /editor/minimap/settings`;
- `POST /editor/minimap/validate`;
- `GET /editor/ui-display/assets`;
- `POST /editor/ui-display/validate`.

Deze route contracts:

- vereisen editor scope;
- blijven CSRF/Origin beschermd voor state-changing requests;
- geven anonymous/game sessions geen beheer;
- uploaden geen assets;
- maken geen assets aan;
- kopieren geen assets naar Git;
- verzinnen geen concrete gamecontent;
- publiceren niets naar Runtime Game.

Fase 9 route smokes zijn server-side OK.

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

Server-side bevestigd voor Fase 9:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK, 86/86 tests pass;
- `pnpm lint`: OK;
- `gk-api` herstart: OK;
- `gk-editor-web` herstart: OK;
- services active/enabled: OK;
- beide services draaien via `/opt/gk/node-v22/bin/node`;
- `/editor`: OK;
- editor/API smoke voor world/minimap/UI display contracts: OK;
- no runtime publish: OK;
- no asset mutation: OK;
- anonymous/game denied: OK.
