# Current Phase

## Fase

Actieve status: Fase 9 server-side afgerond en klaar op `main`.

Fase 8, Fase 8.1 en Fase 9 zijn server-side afgerond en klaar. Fase 10 is nog niet geopend of geimplementeerd.

## Statussamenvatting

Fase 9 is `World, camera, lighting, levels/zones en minimap nodes`.

De Git-basis is voorbereid en server-side gevalideerd als engine-capability en editor/node-data contractlaag. Er is geen runtime publish toegevoegd, er zijn geen assets toegevoegd of gewijzigd, en er is geen concrete gamecontent hardcoded.

Laatste bevestigde Fase 9 main commit: `445ff68a803a7097d6cd6f59f05fc993cb7fbe4f` (`fase 9 fix build downstream`).

Server-side verificatie door Codex:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK, 86/86 tests pass;
- `pnpm lint`: OK;
- `gk-api` herstart: OK;
- `gk-editor-web` herstart: OK;
- services active/enabled: OK;
- beide services draaien via `/opt/gk/node-v22/bin/node`;
- `/editor`: OK;
- editor login: OK;
- `/auth/editor/me`: OK, `editor_admin`;
- Fase 9 route smokes: OK;
- anonymous denied: OK, 401 en niet 404;
- game smoke-scope denied: OK, 403 en niet 404;
- editor panels: OK, inclusief World Panel, Zone Panel, Camera Panel, Lighting Panel, Minimap Panel en UI Display Inspector;
- UI scaling validation: OK;
- no-runtime-publish: OK;
- no-asset-mutation: OK;
- GameBible save: OK via testdekking;
- game-site reachable: OK;
- worktree schoon;
- blockers: geen.

Asset refresh na `Assets - new` blijft bevestigd:

- commit `44defc0f79f032cabc07eba43573a40c5f629b97` staat op `main`;
- GLB=4;
- UI images=37;
- audio files=21;
- invalid=0;
- missing=0;
- `assetsCopiedToGit=false`;
- `publishesRuntimeOutput=false`;
- `assignsDefinitiveRuntimeRoles=false`.

## Fase 9 Git-basis

Toegevoegd en gevalideerd:

- `packages/schemas/src/world-camera-minimap.ts` voor world, level, zone, spawnpoint, generated world references, camera, lighting, minimap en UI display contracts;
- `packages/schemas/src/world-camera-minimap-validation.ts` voor Fase 9 validators;
- typed socket additions voor world, camera, lighting, minimap, UI display en generated zone/placement/path/resource candidate references;
- `packages/node-types/src/world-camera-minimap-nodes.ts` met Fase 9 graph node types;
- editor-only world/minimap/UI display route contracts;
- Fase 9 editor panel state voor World, Zone, Camera, Lighting, Minimap en UI Display Inspector;
- `tests/phase9-world-camera-minimap.test.mjs` voor contract coverage.

## Contractgrenzen

Fase 9 gebruikt Fase 8.1 procedural output alleen als draft/candidate input:

- generated zones;
- generated placements;
- generated spawn areas;
- generated path networks;
- generated resource distributions.

Fase 9 mag niet:

- procedural generation core opnieuw definieren;
- generated data als definitieve runtimecontent behandelen;
- world maps, zones, spawnpoints, camera values, lighting presets, fog, sky, minimap layout, HUD layout of audio hardcoden;
- assets toevoegen, wijzigen of kopieren;
- runtime publish uitvoeren buiten de publish-flow.

Willowmere Workshop mag alleen als bestaande Kevin/GameBible input worden genoemd of gebruikt als data/input. Het mag niet als runtimecode of vaste world map hardcoded worden.

## UI/HUD/minimap display rule

UI/HUD/minimap source images mogen groot zijn. Runtime/editor mag de bronpixelmaat nooit blind als display size gebruiken.

Display moet via node-data/editor-data komen:

- `displayWidth`;
- `displayHeight`;
- optional min/max width/height;
- `scaleMode`: `contain`, `cover`, `stretch`, `nineSlice`, `none`;
- `anchor`;
- `pivot`;
- `opacity`;
- `zIndex`;
- responsive rules.

Schema defaults zijn hints, geen concrete HUD-layout:

- icon display hint: 32x32;
- minimap marker display hint: 24x24;
- small status icon hint: 24x24;
- HUD bar/frame display size blijft node-data required;
- `nineSlice` is alleen geldig met slice margins uit node-data.

## Editor/API status

Fase 9 introduceert editor-only route contracts:

- `GET /editor/world/settings`;
- `POST /editor/world/validate`;
- `GET /editor/minimap/settings`;
- `POST /editor/minimap/validate`;
- `GET /editor/ui-display/assets`;
- `POST /editor/ui-display/validate`.

State-changing route contracts vereisen CSRF/Origin bescherming. Anonymous/game sessions krijgen geen editor world/minimap/UI display beheer. De route responses starten zonder verzonnen world/minimap content en publiceren niets naar Runtime Game.

Server-side smoke is OK voor deze routes, inclusief anonymous denied 401 en game smoke-scope denied 403 zonder 404 fallback.

## Tests/checks

Server-side bevestigd:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK, 86/86 tests pass;
- `pnpm lint`: OK;
- editor/API smoke: OK;
- no-runtime-publish: OK;
- no-asset-mutation: OK.

## Fasebeoordeling

Fase 8 is klaar.

Fase 8.1 is server-side afgerond en klaar.

Fase 9 is server-side afgerond en klaar.

Volgende stap: Fase 10 is toekomstwerk en mag later worden geopend wanneer Kevin dat doet. Fase 10 is nog niet geimplementeerd.
