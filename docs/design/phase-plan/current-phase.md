# Current Phase

## Fase

Actieve status: Fase 11 Runtime Projection Core is afgerond en server-side groen bevestigd op `main`.

Fase 1 t/m Fase 11 zijn afgerond. Fase 11 heeft de gecontroleerde Runtime Projection Core toegevoegd en is door Codex/Claude server-side gevalideerd. Fase 12 is nog niet geimplementeerd en wordt pas geopend wanneer Kevin dat doet.

## Statussamenvatting

Fase 11 bouwt een gecontroleerde, data-driven Runtime Projection Core waarmee gevalideerde Fase 10 publish-ready snapshotmetadata kan worden omgezet naar runtime projection contracts en read-model metadata.

Deze fase voegt geen runtime game, geen renderer, geen game client, geen gameplay, geen HUD/minimap/audio runtime en geen concrete gamecontent toe. Runtime projection blijft contract/read-model metadata totdat een latere expliciete Runtime Game fase wordt geopend.

## Afgeronde basis

Fase 10 is server-side afgerond en klaar. Laatste Fase 10 Git-basis commit: `5fc53fa9e290122abc0bfeeb39b3cf6f52c75a2c` (`fase 10`). Laatste Fase 10 server-side verificatie/fix commit: `cfdc25e03c922904a3628921a7e6fc6c24cf2bf6` (`fix phase 10 server-side verification`).

Fase 11 Runtime Projection Core is server-side afgerond en klaar.

Asset refresh na `Assets - new` blijft bevestigd:

- GLB=4;
- UI images=37;
- audio files=21;
- invalid=0;
- missing=0;
- `assetsCopiedToGit=false`;
- `publishesRuntimeOutput=false`;
- `assignsDefinitiveRuntimeRoles=false`.

## Fase 11 Git-basis

Toegevoegd en gevalideerd:

- `packages/schemas/src/runtime-projection.ts` voor projection status/source/manifest/record/read-model/audit/safety contracts;
- `packages/schemas/src/runtime-projection-validation.ts` voor runtime projection validation gates;
- runtime projection socket types in `packages/schemas/src/node-graph.ts`;
- `packages/node-types/src/runtime-projection-nodes.ts` met publish-boundary runtime projection node types;
- editor/admin en runtime read-only route contracts in `apps/api-server/src/runtime-projection-routes.ts`;
- API router wiring voor `/editor/runtime-projection/*` en `/runtime/projection/*`;
- `apps/editor-web/src/runtime-projection-panel.ts` en editor-shell panel wiring;
- `tests/phase11-runtime-projection.test.mjs` voor contractdekking.

## Runtime projection validation gates

Fase 11 bewaakt minimaal:

- projection source komt uit Fase 10 publish snapshotmetadata en publish-ready validation;
- geen projection vanuit raw editor draft;
- geen projection vanuit procedural preview/bake zonder publish acceptatie;
- generated procedural refs blijven draft/candidate totdat publish validation ze accepteert;
- geen asset mutation/copy;
- geen concrete gamecontent;
- geen hardcoded content;
- UI display sizing uit node/editor/publish data, niet uit source natural size;
- GLB roles blijven candidate/editor-data tenzij expliciet via publish data;
- projection manifest/read-model is geen renderer;
- safety flags blijven read-model-only.

## Editor/API status

Editor/admin route contracts zijn server-side groen bevestigd:

- `GET /editor/runtime-projection/status`;
- `POST /editor/runtime-projection/validate`;
- `POST /editor/runtime-projection/project`;
- `GET /editor/runtime-projection/manifests`;
- `GET /editor/runtime-projection/manifests/:id`.

Runtime read-only route contracts zijn server-side groen bevestigd:

- `GET /runtime/projection/status`;
- `GET /runtime/projection/manifest`;
- `GET /runtime/projection/records`.

Regels blijven bevestigd:

- editor admin only voor editor/admin projection beheer;
- state-changing editor/admin routes CSRF/Origin protected;
- anonymous/game/non-admin denied voor editor/admin beheer;
- runtime routes zijn read-only en geven veilige empty state wanneer er nog geen projection bestaat;
- geen runtime renderer;
- geen game client;
- geen runtime gameplay;
- geen assets wijzigen;
- geen concrete gamecontent in responses.

## Contractgrenzen

Fase 11 bouwt niet:

- runtime game, renderer of game client;
- movement, combat, player gameplay, HUD runtime, minimap runtime of audio playback;
- concrete world, zone, NPC, quest, economy, camera, lighting, HUD, minimap of audio content;
- definitieve GLB role mapping;
- automatische publish of automatic projection.

UI/HUD/minimap source image natural size blijft metadata. Display size, scale mode, anchor en pivot blijven node-data/editor-data/publish data.

## Tests/checks

Git-basis bevat tests voor:

- runtime projection schema exports;
- runtime projection socket/node registration;
- invalid raw draft/candidate projection issues;
- generated procedural refs als candidate input totdat publish validation accepteert;
- UI display sizing en natural-size metadata;
- no-runtime-renderer/no-game-client/no-asset-mutation/no-hardcoded-content;
- runtime projection manifest/read-model zonder concrete payload;
- editor/admin route contracts, anonymous/game/non-admin denied en CSRF/Origin gate;
- runtime read-only routes met veilige empty state;
- Runtime Projection panel registratie.

Codex/Claude heeft server-side bevestigd:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK, 111 tests / 55 suites / 0 fail;
- `pnpm lint`: OK;
- `gk-api` active/enabled: OK;
- `gk-editor-web` active/enabled: OK;
- beide services via `/opt/gk/node-v22/bin/node`: OK;
- editor login en `/auth/editor/me`: OK, `editor_admin`;
- `/editor`: OK;
- Runtime Projection panel smoke: OK;
- editor/runtime projection route smokes: OK;
- runtime read-only projection route smokes: OK;
- anonymous/game/non-admin denied: OK;
- CSRF/Origin protection: OK;
- GameBible save beschermd en content ongewijzigd: OK;
- game-site reachable: OK;
- worktree schoon: OK;
- blockers: geen.

Browser smoke en ops/docs-hardening staan op `main`. Gebruik `docs/ops/server-verification-runbook.md` voor vaste Playwright/headless Chromium browser-smokes. Editor browser-smoke is groen; game browser-smoke mag `skipped` blijven totdat game front door/login expliciet wordt geopend.

## Fasebeoordeling

Fase 11 Runtime Projection Core is afgerond en server-side klaar.

Fase 12 is nog niet geimplementeerd. Volgende stap: Kevin mag Fase 12 openen.
