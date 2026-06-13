# Current Phase

Actieve status: Fase 11 Runtime Projection Core is afgerond en server-side groen bevestigd op `main`.

Fase 1 t/m Fase 11 zijn afgerond. Fase 11 Runtime Projection Core is door Codex/Claude server-side gevalideerd. Fase 12 is nog niet geimplementeerd; Kevin mag Fase 12 als volgende fase openen wanneer hij dat wil.

## Primaire bronnen

Open voor de actuele fasecontractstatus:

- `docs/design/phase-plan/current-phase.md`
- `README/fase8.md`
- `README/fase8.1.md`
- `README/fase9.md`
- `README/fase10.md`
- `README/fase11.md`
- `README/node-system-super-dynamic-contract.md`
- `docs/architecture/editor-shell.md`
- `docs/architecture/auth-boundaries.md`
- `docs/design/content-gates.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `docs/design/game-bible.md`
- `docs/ops/server-layout.md`
- `docs/ops/server-verification-runbook.md`
- `README/GameBibleNode.json`

## Fase 11 status

Fase 11 bouwt op:

- Fase 6 typed node graph core;
- Fase 7 asset/audio library;
- Fase 8 entity/component core;
- Fase 8.1 procedural generation core;
- Fase 9 world/camera/lighting/minimap/UI display core;
- Fase 10 Publish Flow Core.

Toegevoegd en gevalideerd in Fase 11:

- runtime projection status/source/manifest/record/read-model/audit/safety contracts;
- validation gates voor publish-ready snapshot source, no raw draft, no procedural preview source, no asset mutation, no concrete gamecontent, UI display sizing, GLB role candidate status, read-model-only en safety flags;
- typed sockets en node types voor runtime projection source, validation, manifest, read model en audit events;
- editor/admin route contracts voor runtime projection status, validate, project en manifest metadata;
- runtime read-only route contracts met veilige empty state;
- Runtime Projection panel/state contract;
- tests voor schemas, validators, routes, auth/CSRF, runtime read-only empty state, node registration en panel registration.

## Server-side verificatie

Codex/Claude heeft Fase 11 server-side groen bevestigd:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK, 111 tests / 55 suites / 0 fail;
- `pnpm lint`: OK;
- `gk-api` active/enabled: OK;
- `gk-editor-web` active/enabled: OK;
- beide services via `/opt/gk/node-v22/bin/node`: OK;
- editor login: OK;
- `/auth/editor/me` geeft `editor_admin`: OK;
- `/editor` bereikbaar: OK;
- Runtime Projection panel smoke: OK;
- editor/runtime projection route smokes: OK;
- runtime read-only projection route smokes: OK;
- anonymous/game/non-admin denied: OK;
- CSRF/Origin protection: OK;
- no-runtime-renderer: OK;
- no-game-client: OK;
- no-runtime-gameplay: OK;
- no-asset-mutation: OK;
- no hardcoded content: OK;
- GameBible save/protection: OK, content ongewijzigd;
- game-site reachable: OK;
- worktree schoon: OK;
- blockers: geen.

## Browser-smoke runbook

Browser smoke en ops/docs-hardening staan op `main` via commit `346533a98e6786e741fded8bcc5af4177e3cfd36` (`Codex/Claude - browser en ops/docs-hardining`).

`docs/ops/server-verification-runbook.md` is de vaste bron voor server-side verificatie, smoke-routes, editor login flow, frontend panel checks, Playwright/headless Chromium browser-smokes, secret-handling regels en eindrapportage.

De editor browser-smoke is groen bevestigd. Game browser-smoke mag `skipped` blijven totdat game front door/login expliciet wordt geopend.

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

GLB roles blijven candidate/editor-data. UI/audio assets blijven asset-library candidates. Source image natural size blijft metadata; display size, scale mode, anchor en pivot blijven node-data/editor-data/publish data.

## Fase 11 grenzen

- Geen runtime game implementatie.
- Geen renderer, movement, combat, HUD runtime, minimap runtime of audio playback runtime.
- Geen automatische publish of automatic projection.
- Geen concrete world map, zones, camera values, lighting presets, HUD layout, minimap layout, audio mapping, NPCs, quests of economy hardcoded.
- Geen GLB role mapping definitief maken.
- Generated Fase 8.1 data blijft draft/candidate totdat publish validation het expliciet accepteert.
- Runtime projection is een read-model/contractlaag, geen Runtime Game renderer/client.

## Volgende stap

Fase 12 is nog niet geimplementeerd. Kevin mag Fase 12 openen als volgende fase.
