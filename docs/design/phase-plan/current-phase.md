# Current Phase

## Fase

Actieve status: Fase 10 Git-basis voorbereid op `main`.

Fase 8, Fase 8.1 en Fase 9 zijn server-side afgerond en klaar. Fase 10 is door Kevin geopend als `Publish Flow Core`. De Git-basis is toegevoegd en de server-side verificatie van Fase 10 is afgerond.

## Statussamenvatting

Fase 10 bouwt een gecontroleerde Publish Flow Core waarmee editor/node/procedural/world/camera/minimap/UI data vanuit draft/candidate state gevalideerd kan worden naar publish-ready snapshots.

Deze fase voegt geen runtime game, geen renderer, geen automatische publish en geen concrete gamecontent toe. Snapshot creation blijft metadata-only totdat een latere expliciete publish/runtime fase wordt geopend.

## Afgeronde basis

Fase 9 is server-side afgerond en klaar. Laatste bevestigde Fase 9 main commit: `445ff68a803a7097d6cd6f59f05fc993cb7fbe4f` (`fase 9 fix build downstream`).

Server-side Fase 9 verificatie was OK voor build/typecheck/test/lint, services, editor login, route smokes, auth-deny smoke, panels, UI scaling validation, no-runtime-publish en no-asset-mutation.

Asset refresh na `Assets - new` blijft bevestigd:

- GLB=4;
- UI images=37;
- audio files=21;
- invalid=0;
- missing=0;
- `assetsCopiedToGit=false`;
- `publishesRuntimeOutput=false`;
- `assignsDefinitiveRuntimeRoles=false`.

## Fase 10 Git-basis

Toegevoegd:

- `packages/schemas/src/publish-flow.ts` voor status/state, candidate references, validation result, snapshot metadata, audit/event en rollback reference contracts;
- `packages/schemas/src/publish-flow-validation.ts` voor publish validation gates;
- publish socket types in `packages/schemas/src/node-graph.ts`;
- `packages/node-types/src/publish-flow-nodes.ts` met publish-boundary node types;
- editor-only publish route contracts in `apps/api-server/src/editor-publish-routes.ts`;
- API router wiring voor `/editor/publish/*`;
- `apps/editor-web/src/publish-flow-panel.ts` en editor-shell panel wiring;
- `tests/phase10-publish-flow.test.mjs` voor contractdekking.

## Publish validation gates

Fase 10 bewaakt minimaal:

- node graph completeness;
- asset candidates zonder definitieve hardcoded role mapping;
- entity/component validity;
- procedural generated refs als draft/candidate input;
- world/zone/camera/lighting/minimap/UI display validity;
- UI display sizing uit node/editor data, niet uit source natural size;
- no-runtime-publish;
- no-asset-mutation/copy;
- no-hardcoded-content.

## Editor/API status

Nieuwe route contracts:

- `GET /editor/publish/status`;
- `POST /editor/publish/validate`;
- `POST /editor/publish/snapshots`;
- `GET /editor/publish/snapshots`;
- `GET /editor/publish/snapshots/:id`;
- `POST /editor/publish/rollback/validate`.

Regels:

- editor admin only;
- state-changing routes CSRF/Origin protected;
- anonymous/game/non-admin denied;
- geen runtime publish;
- geen assets wijzigen;
- geen concrete gamecontent in responses.

## Contractgrenzen

Fase 10 mag niet:

- runtime game of renderer bouwen;
- concrete world, zone, NPC, quest, economy, camera, lighting, HUD, minimap of audio content hardcoden;
- GLB roles definitief maken;
- assets toevoegen, wijzigen, verwijderen of kopieren;
- procedural output automatisch publiceren;
- runtime publish uitvoeren.

UI/HUD/minimap source image natural size blijft metadata. Display size, scale mode, anchor en pivot blijven node-data/editor-data.

## Tests/checks

Git-basis bevat tests voor:

- publish schema exports;
- publish node/socket registration;
- invalid draft/candidate validation issues;
- generated procedural refs als candidate input;
- UI display sizing en nineSlice margins;
- no-runtime-publish/no-asset-mutation/no-hardcoded-content;
- snapshot metadata en rollback references zonder runtime payload;
- publish route contracts, anonymous/game/non-admin denied en CSRF/Origin gate;
- Publish Flow panel registratie.

## Fasebeoordeling

Server-side verificatie van Fase 10 is afgerond:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK;
- `pnpm lint`: OK;
- `gk-api` en `gk-editor-web`: actief en enabled;
- editor login en `/auth/editor/me`: OK met `editor_admin`;
- `/editor` bereikbaar en Publish Flow panel zichtbaar in de editor shell: OK;
- publish route smokes: OK;
- anonymous/game/non-admin denied: OK;
- CSRF/Origin smokes voor state-changing publish routes: OK;
- no-runtime-publish en no-asset-mutation: OK;
- blockers: geen.

Volgende stap: geen Fase 11 openen.
