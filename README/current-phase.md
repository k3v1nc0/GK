# Current Phase

Actieve status: Fase 11 Git-basis voorbereid op `main`.

Fase 1 t/m Fase 10 zijn afgerond. Fase 10 Publish Flow Core is server-side groen bevestigd. Fase 11 is door Kevin geopend als `Runtime Projection Core`. De Git-basis is toegevoegd, maar Fase 11 is nog niet server-side afgerond totdat Codex/Claude build/typecheck/test/lint, live smokes en docs final bevestigt.

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
- `README/GameBibleNode.json`

## Fase 10 status

Laatste Fase 10 Git-basis commit: `5fc53fa9e290122abc0bfeeb39b3cf6f52c75a2c` (`fase 10`).

Laatste Fase 10 server-side verificatie/fix commit: `cfdc25e03c922904a3628921a7e6fc6c24cf2bf6` (`fix phase 10 server-side verification`).

Server-side verificatie voor Fase 10 is afgerond en groen:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK;
- `pnpm lint`: OK;
- publish route smokes: OK;
- anonymous/game/non-admin denied: OK;
- CSRF/Origin protection op state-changing publish routes: OK;
- Publish Flow panel smoke: OK;
- no-runtime-publish/no-asset-mutation: OK;
- blockers: geen.

## Fase 11 Git-basis

Fase 11 bouwt op:

- Fase 6 typed node graph core;
- Fase 7 asset/audio library;
- Fase 8 entity/component core;
- Fase 8.1 procedural generation core;
- Fase 9 world/camera/lighting/minimap/UI display core;
- Fase 10 Publish Flow Core.

Toegevoegd in de Fase 11 Git-basis:

- runtime projection status/source/manifest/record/read-model/audit/safety contracts;
- validation gates voor publish-ready snapshot source, no raw draft, no procedural preview source, no asset mutation, no concrete gamecontent, UI display sizing, GLB role candidate status, read-model-only en safety flags;
- typed sockets en node types voor runtime projection source, validation, manifest, read model en audit events;
- editor/admin route contracts voor runtime projection status, validate, project en manifest metadata;
- runtime read-only route contracts met veilige empty state;
- Runtime Projection panel/state contract;
- tests voor schemas, validators, routes, auth/CSRF, runtime read-only empty state, node registration en panel registration.

## Fase 11 API/editor contract

Editor/admin route contracts:

- `GET /editor/runtime-projection/status`;
- `POST /editor/runtime-projection/validate`;
- `POST /editor/runtime-projection/project`;
- `GET /editor/runtime-projection/manifests`;
- `GET /editor/runtime-projection/manifests/:id`.

Runtime read-only route contracts:

- `GET /runtime/projection/status`;
- `GET /runtime/projection/manifest`;
- `GET /runtime/projection/records`.

Regels:

- editor/admin projection beheer is editor admin only;
- state-changing editor/admin projection routes vereisen CSRF/Origin bescherming;
- anonymous/game/non-admin sessions denied voor editor/admin beheer;
- runtime routes zijn read-only en lekken geen editor draft data;
- project action maakt alleen contract-safe manifest/read-model metadata;
- geen runtime renderer;
- geen automatic projection;
- geen assetmutatie;
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

GLB roles blijven candidate/editor-data. UI/audio assets blijven asset-library candidates. Source image natural size blijft metadata; display size, scale mode, anchor en pivot blijven node-data/editor-data/publish data.

## Fase 11 grenzen

- Geen runtime game implementatie.
- Geen renderer, movement, combat, HUD runtime, minimap runtime of audio playback runtime.
- Geen automatische publish of automatic projection.
- Geen concrete world map, zones, camera values, lighting presets, HUD layout, minimap layout, audio mapping, NPCs, quests of economy hardcoded.
- Geen GLB role mapping definitief maken.
- Generated Fase 8.1 data blijft draft/candidate totdat publish validation het expliciet accepteert.
- Runtime projection is een read-model/contractlaag, geen Runtime Game renderer/client.
- Geen Fase 12 openen.

## Open aandachtspunten

Fase 11 Git-basis is voorbereid, maar server-side status staat open.

Codex/Claude moet nog draaien/bevestigen:

- `pnpm build`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm lint`;
- live smoke voor `/editor/runtime-projection/*` route contracts;
- live smoke voor `/runtime/projection/*` read-only route contracts;
- anonymous/game/non-admin denied smoke;
- CSRF/Origin smoke voor state-changing projection routes;
- Runtime Projection panel smoke;
- no-runtime-renderer, no-game-client, no-concrete-gamecontent en no-asset-mutation bevestiging;
- docs final.

Volgende fase: geen Fase 12 openen. Fase 11 is pas klaar na server-side validatie en Kevin/Codex/Claude bevestiging.
