# Current Phase

## Fase

Actieve status: Fase 12 Runtime Client Shell Core is afgerond en server-side groen bevestigd.

Fase 1 t/m Fase 12 zijn afgerond. Fase 11 Runtime Projection Core is server-side groen bevestigd. Fase 12 Runtime Client Shell Core is server-side groen bevestigd via commit `61792b7e6b923add68fdebd80f673dfdd86210ff` (`fix: verify phase 12 runtime client shell core`).

Fase 13 is nog niet geimplementeerd. Volgende stap: Kevin mag Fase 13 openen.

## Statussamenvatting

Fase 12 heeft een veilige browser-runtime client shell toegevoegd die uitsluitend Fase 11 runtime projection read-only data ophaalt en toont als engine/runtime-status en metadata. De shell is een contract- en empty-state laag, geen renderer, geen gameplayclient en geen runtime HUD/minimap/audio implementatie.

De server-side verificatie is afgerond. Build, typecheck, test, lint, live route-smokes, game/runtime shell smokes en browser smoke zijn groen bevestigd.

Deze fase heeft geen concrete gamecontent, geen dummy world, geen assets, geen renderer, geen movement/combat/player gameplay en geen audio playback toegevoegd.

## Afgeronde basis

Fase 10 Publish Flow Core is server-side afgerond en klaar. Laatste Fase 10 server-side verificatie/fix commit: `cfdc25e03c922904a3628921a7e6fc6c24cf2bf6` (`fix phase 10 server-side verification`).

Fase 11 Runtime Projection Core is server-side afgerond en klaar. Laatste Fase 11 docs-final commit: `2a2b779afe3a3a2f28466fa7a49f0be45d12ee17` (`fase 11 fix`). Browser smoke en ops/docs-hardening staan op `main` via commit `346533a98e6786e741fded8bcc5af4177e3cfd36`.

Fase 12 Runtime Client Shell Core is server-side afgerond en klaar. Server-side fix commit: `61792b7e6b923add68fdebd80f673dfdd86210ff` (`fix: verify phase 12 runtime client shell core`).

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
- `apps/game-web/src/http-server.ts` voor `/`, `/game`, `/game/`, `/game/shell.json`, `/health/game` en same-origin proxy van runtime projection read-only routes naar de API;
- game-web entrypoint wiring;
- browser-smoke uitbreiding voor runtime shell marker checks;
- `tests/phase12-runtime-client-shell.test.mjs` voor contractdekking, async handler en proxy-route test;
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

Runtime client shell routes:

- `GET /`;
- `GET /game`;
- `GET /game/`;
- `GET /game/shell.json`;
- `GET /health/game`.

Runtime projection read-only routes die de shell mag consumeren:

- `GET /runtime/projection/status`;
- `GET /runtime/projection/manifest`;
- `GET /runtime/projection/records`.

Regels en verificatie:

- geen editor/admin endpoints in runtime client: OK;
- geen credentials/secrets in frontend: OK;
- geen CSRF nodig voor read-only runtime GETs: OK;
- geen data mutatie: OK;
- geen asset upload/copy/delete: OK;
- geen concrete gamecontent in responses: OK;
- safe empty state is verwachte output wanneer projection ontbreekt: OK;
- game-web proxyt runtime projection read-only routes naar de API zodat de shell same-origin kan booten zonder console errors: OK.

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

Fase 13 is nog niet geimplementeerd.

## Tests/checks

Server-side bevestigd:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK;
- `pnpm lint`: OK;
- live editor login: OK;
- `/auth/editor/me`: OK;
- runtime projection read-only route smokes: OK;
- game/runtime shell route smokes: OK;
- `/game/shell.json`: OK;
- browser smoke: OK;
- runtime shell marker: OK;
- no editor/admin route usage: OK;
- no draft leakage: OK;
- no concrete content: OK;
- no renderer/gameplay/movement/combat/audio playback: OK;
- no hardcoded HUD/minimap/world/camera/light/audio values: OK;
- no asset mutation: OK;
- GameBible save/protection: OK;
- worktree schoon: OK;
- blockers: geen.

Server/runtime status:

- apache2 actief;
- `gk-api` actief/enabled;
- `gk-editor-web` actief/enabled;
- er is nog geen aparte `gk-game-web` systemd-unit zichtbaar;
- Fase 12 is geverifieerd via tijdelijke Node 22 game-shell op `127.0.0.1:3003`.

## Fasebeoordeling

Fase 12 Runtime Client Shell Core is afgerond en server-side klaar.

Fase 13 is nog niet geimplementeerd. Volgende stap: Kevin mag Fase 13 openen.
