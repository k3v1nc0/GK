# Current Phase

## Fase

Actieve status: Fase 12 Git-basis voorbereid op `main`.

Fase 1 t/m Fase 11 zijn afgerond. Fase 11 Runtime Projection Core is server-side groen bevestigd. Fase 12 is door Kevin geopend als `Runtime Client Shell Core`.

## Statussamenvatting

Fase 12 opent een veilige browser-runtime client shell die uitsluitend Fase 11 runtime projection read-only data ophaalt en toont als engine/runtime-status en metadata. De shell is een contract- en empty-state laag, geen renderer, geen gameplayclient en geen runtime HUD/minimap/audio implementatie.

Deze fase voegt geen concrete gamecontent, geen dummy world, geen assets, geen renderer, geen movement/combat/player gameplay en geen audio playback toe.

## Afgeronde basis

Fase 10 Publish Flow Core is server-side afgerond en klaar. Laatste Fase 10 server-side verificatie/fix commit: `cfdc25e03c922904a3628921a7e6fc6c24cf2bf6` (`fix phase 10 server-side verification`).

Fase 11 Runtime Projection Core is server-side afgerond en klaar. Laatste Fase 11 docs-final commit: `2a2b779afe3a3a2f28466fa7a49f0be45d12ee17` (`fase 11 fix`). Browser smoke en ops/docs-hardening staan op `main` via commit `346533a98e6786e741fded8bcc5af4177e3cfd36`.

Asset refresh na `Assets - new` blijft bevestigd:

- GLB=4;
- UI images=37;
- audio files=21;
- invalid=0;
- missing=0;
- `assetsCopiedToGit=false`;
- `publishesRuntimeOutput=false`;
- `assignsDefinitiveRuntimeRoles=false`.

## Fase 12 Git-basis

Toegevoegd:

- `packages/schemas/src/runtime-client-shell.ts` voor runtime client shell status, boot, projection, error, capabilities en safety contracts;
- `packages/schemas/src/runtime-client-shell-validation.ts` voor runtime client validation gates;
- runtime client socket types in `packages/schemas/src/node-graph.ts`;
- `packages/node-types/src/runtime-client-shell-nodes.ts` met `runtime-consumer` node types;
- `apps/game-web/src/runtime-projection-client.ts` voor read-only projection fetch contracten;
- `apps/game-web/src/runtime-client-shell.ts` voor de runtime shell HTML/empty-state UI;
- `apps/game-web/src/http-server.ts` voor `/`, `/game`, `/game/`, `/game/shell.json` en `/health/game`;
- game-web entrypoint wiring;
- browser-smoke uitbreiding voor runtime shell marker checks;
- `tests/phase12-runtime-client-shell.test.mjs` voor contractdekking;
- `README/fase12.md` en statusdocs.

## Runtime client validation gates

Fase 12 bewaakt minimaal:

- runtime client gebruikt alleen `/runtime/projection/status`, `/runtime/projection/manifest` en `/runtime/projection/records`;
- runtime client gebruikt geen editor/admin routes;
- runtime client lekt geen editor draft/candidate data;
- safe empty state is geldig wanneer er nog geen projection bestaat;
- no 3D renderer;
- no gameplay;
- no movement/combat;
- no audio playback;
- no HUD/minimap hardcoded layout;
- no asset mutation/copy;
- no hardcoded content.

## Runtime shell/API status

Runtime client shell routes in Git-basis:

- `GET /`;
- `GET /game`;
- `GET /game/`;
- `GET /game/shell.json`;
- `GET /health/game`.

Runtime projection read-only routes die de shell mag consumeren:

- `GET /runtime/projection/status`;
- `GET /runtime/projection/manifest`;
- `GET /runtime/projection/records`.

Regels:

- geen editor/admin endpoints in runtime client;
- geen credentials/secrets in frontend;
- geen CSRF nodig voor read-only runtime GETs;
- geen data mutatie;
- geen asset upload/copy/delete;
- geen concrete gamecontent in responses;
- safe empty state is verwachte output wanneer projection ontbreekt.

## Contractgrenzen

Fase 12 bouwt niet:

- 3D renderer;
- runtime gameplay;
- movement;
- combat;
- player controller;
- HUD runtime layout;
- minimap runtime layout;
- audio playback;
- concrete world, zone, NPC, quest, economy, camera, lighting, minimap, HUD of audio content;
- definitieve GLB role mapping;
- automatic publish of automatic projection.

## Tests/checks

Git-basis bevat tests voor:

- runtime client shell schema exports;
- runtime client socket/node registration;
- safety flags;
- editor/admin route rejection;
- no draft leakage;
- no renderer/gameplay/movement/combat/audio playback;
- no asset mutation;
- no hardcoded content;
- runtime projection fetch client read-only route discipline;
- runtime shell HTML markers en empty state;
- game-web shell routes;
- browser-smoke runtime shell hook.

Niet geclaimd als server-side uitgevoerd in deze GitHub-only update:

- `pnpm build`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm lint`;
- service restart;
- live route smokes;
- Playwright/browser smoke.

## Fasebeoordeling

Fase 12 Git-basis is voorbereid.

Fase 12 is server-side nog niet klaar. Codex/Claude moet de open checks, live smokes, browser smoke en docs final draaien voordat Fase 12 als afgerond gemarkeerd mag worden.
