# Current Phase

Actieve status: Fase 10 Git-basis voorbereid op `main`.

Fase 8, Fase 8.1 en Fase 9 zijn server-side afgerond en klaar. Fase 10 is door Kevin geopend als `Publish Flow Core`. De Git-basis is toegevoegd en de server-side verificatie van Fase 10 is afgerond.

## Primaire bronnen

Open voor de actuele fasecontractstatus:

- `docs/design/phase-plan/current-phase.md`
- `README/fase8.md`
- `README/fase8.1.md`
- `README/fase9.md`
- `README/fase10.md`
- `README/node-system-super-dynamic-contract.md`
- `docs/architecture/editor-shell.md`
- `docs/architecture/auth-boundaries.md`
- `docs/design/content-gates.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `docs/design/game-bible.md`
- `docs/ops/server-layout.md`
- `README/GameBibleNode.json`

## Fase 9 status

Laatste bevestigde Fase 9 main commit: `445ff68a803a7097d6cd6f59f05fc993cb7fbe4f` (`fase 9 fix build downstream`).

Codex server-side verificatie voor Fase 9 is klaar:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK, 86/86 tests pass;
- `pnpm lint`: OK;
- `gk-api` en `gk-editor-web` herstart: OK;
- editor login en `/auth/editor/me`: OK;
- Fase 9 route smokes: OK;
- anonymous denied 401 en game denied 403: OK;
- editor panels: OK;
- UI scaling validation: OK;
- no-runtime-publish: OK;
- no-asset-mutation: OK;
- blockers: geen.

## Fase 10 Git-basis

Fase 10 bouwt op:

- Fase 6 typed node graph core;
- Fase 7 asset/audio library;
- Fase 8 entity/component core;
- Fase 8.1 procedural generation core;
- Fase 9 world/camera/lighting/minimap/UI display core.

Toegevoegd in de Fase 10 Git-basis:

- publish status/state model voor `draft`, `candidate`, `publish-ready` en `published-snapshot` metadata;
- publish candidate/input references;
- publish validation result en gate model;
- snapshot metadata, audit/event en rollback reference basis;
- validation gates voor node graph completeness, asset candidates, entity/component validity, procedural generated refs, Fase 9 world/UI validity, UI display sizing, no-runtime-publish, no-asset-mutation en no-hardcoded-content;
- typed sockets en node types voor publish candidate, validation en snapshot references;
- editor-only publish route contracts;
- Publish Flow panel/state contract;
- tests voor schemas, routes, auth/CSRF, panel state, validation gates, snapshot metadata en publish safety flags.

## Fase 10 API/editor contract

Editor-only route contracts:

- `GET /editor/publish/status`;
- `POST /editor/publish/validate`;
- `POST /editor/publish/snapshots`;
- `GET /editor/publish/snapshots`;
- `GET /editor/publish/snapshots/:id`;
- `POST /editor/publish/rollback/validate`.

Regels:

- alleen editor admin;
- state-changing routes vereisen CSRF/Origin bescherming;
- anonymous/game sessions denied;
- snapshot creation is metadata-only;
- geen runtime publish;
- geen assets wijzigen of kopieren;
- geen concrete gamecontent in responses.

## Assetstatus

Asset refresh na `Assets - new` blijft bevestigd:

- GLB=4;
- UI images=37;
- audio files=21;
- invalid=0;
- missing=0;
- `assetsCopiedToGit=false`;
- `publishesRuntimeOutput=false`;
- `assignsDefinitiveRuntimeRoles=false`.

GLB roles blijven candidate/editor-data. UI/audio assets blijven asset-library candidates. Source image natural size blijft metadata; display size, scale mode, anchor en pivot blijven node-data/editor-data.

## Fase 10 grenzen

- Geen runtime game implementatie.
- Geen renderer, movement, HUD runtime of minimap runtime.
- Geen automatische publish.
- Geen concrete world map, zones, camera values, lighting presets, HUD layout, minimap layout, audio mapping, NPCs, quests of economy hardcoded.
- Geen GLB role mapping definitief maken.
- Generated Fase 8.1 data blijft draft/candidate totdat publish validation en latere publish-flow dit expliciet accepteren.
- Runtime publish/renderer blijft niet geopend in Fase 10 Git-basis.

## Fase 10 status

Server-side verificatie is afgerond en groen:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK;
- `pnpm lint`: OK;
- `gk-api` en `gk-editor-web`: actief en enabled;
- editor login en `/auth/editor/me`: OK met `editor_admin`;
- `/editor` bereikbaar: OK;
- Publish Flow panel in editor shell: OK;
- `GET /editor/publish/status`: OK;
- `POST /editor/publish/validate`: OK;
- `POST /editor/publish/snapshots`: OK;
- `GET /editor/publish/snapshots`: OK;
- `GET /editor/publish/snapshots/:id`: OK;
- `POST /editor/publish/rollback/validate`: OK;
- anonymous/game/non-admin denied: OK;
- CSRF/Origin protection op state-changing publish routes: OK;
- no-runtime-publish/no-asset-mutation: OK;
- blockers: geen.

Volgende fase: geen Fase 11 openen.
