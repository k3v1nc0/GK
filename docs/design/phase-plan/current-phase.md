# Current Phase

## Fase

Actieve status: Fase 9 Git-basis voorbereid op `main`.

Fase 8 en Fase 8.1 blijven server-side afgerond en klaar. Fase 9 is nog niet server-side afgerond totdat Codex/Claude de huidige Git-basis server-side valideert.

## Statussamenvatting

Fase 9 is `World, camera, lighting, levels/zones en minimap nodes`.

De Git-basis is voorbereid als engine-capability en editor/node-data contractlaag. Er is geen runtime publish toegevoegd, er zijn geen assets toegevoegd of gewijzigd, en er is geen concrete gamecontent hardcoded.

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

Toegevoegd:

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
- runtime publish uitvoeren.

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

## Tests/checks

Lokaal in deze GitHub-only omgeving is uitgevoerd:

- syntaxischeck met `node --experimental-strip-types --check` op de tijdelijke Fase 9 werkset: OK.

Niet uitgevoerd in deze omgeving, omdat er geen lokale repo checkout/buildcontext gebruikt mocht worden:

- `pnpm build`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm lint`;
- server/API smoke.

Deze checks blijven Codex/Claude-taken op de server.

## Fasebeoordeling

Fase 8 is klaar.

Fase 8.1 is server-side afgerond en klaar.

Fase 9 Git-basis is voorbereid, maar Fase 9 is nog niet server-side klaar.

Volgende stap: Codex/Claude valideert de Fase 9 Git-basis server-side met build/typecheck/test/lint en editor/API smoke. Pas daarna mag Fase 9 als server-side afgerond worden gemarkeerd.
