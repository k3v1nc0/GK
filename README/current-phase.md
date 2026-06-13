# Current Phase

Actieve status: Fase 12 Git-basis voorbereid op `main`.

Fase 1 t/m Fase 11 zijn afgerond. Fase 11 Runtime Projection Core is server-side groen bevestigd. Fase 12 is door Kevin geopend als `Runtime Client Shell Core`. De Git-basis is toegevoegd, maar Fase 12 is server-side nog niet klaar totdat Codex/Claude build/typecheck/test/lint, live smokes, browser smoke en docs final bevestigt.

## Primaire bronnen

Open voor de actuele fasecontractstatus:

- `docs/design/phase-plan/current-phase.md`
- `README/fase8.md`
- `README/fase8.1.md`
- `README/fase9.md`
- `README/fase10.md`
- `README/fase11.md`
- `README/fase12.md`
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

## Fase 12 Git-basis

Fase 12 bouwt op:

- Fase 6 typed node graph core;
- Fase 7 asset/audio library;
- Fase 8 entity/component core;
- Fase 8.1 procedural generation core;
- Fase 9 world/camera/lighting/minimap/UI display core;
- Fase 10 Publish Flow Core;
- Fase 11 Runtime Projection Core;
- de vaste browser-smoke en server-verification runbook.

Toegevoegd in de Fase 12 Git-basis:

- runtime client shell status/boot/projection/error/capabilities/safety contracts;
- validation gates voor read-only runtime projection routes, no editor/admin routes, no editor draft leakage, no renderer/gameplay, no audio playback, no asset mutation en no hardcoded content;
- typed sockets en node types voor runtime client shell, boot state, projection state en safety flags;
- game-web runtime client shell routes voor `/`, `/game`, `/game/` en `/game/shell.json`;
- projection fetch client die alleen `/runtime/projection/status`, `/runtime/projection/manifest` en `/runtime/projection/records` gebruikt;
- veilige runtime empty-state UI met shell marker;
- browser-smoke uitbreiding voor de game/runtime shell;
- tests voor schemas, validators, routes, shell UI, node registration, browser-smoke hook en no-content/no-renderer/no-asset boundaries.

## Runtime client route contract

Fase 12 mag alleen deze runtime projection read-only routes consumeren:

- `GET /runtime/projection/status`;
- `GET /runtime/projection/manifest`;
- `GET /runtime/projection/records`.

De runtime client shell consumeert geen editor/admin routes, gebruikt geen editor draft/candidate data direct en muteert geen data of assets.

## Fase 12 grenzen

- Geen concrete gamecontent toegevoegd.
- Geen dummy world, NPCs, quests, economy of assets.
- Geen assets toegevoegd, gewijzigd, verwijderd of gekopieerd.
- Geen GLB role mapping definitief gemaakt.
- Geen hardcoded world/camera/light/minimap/HUD/audio values toegevoegd.
- Geen 3D renderer gebouwd.
- Geen gameplay, movement, combat of player runtime gebouwd.
- Geen audio playback runtime gebouwd.
- Geen HUD/minimap runtime layout hardcoded.
- Geen automatic publish of automatic projection.
- Geen Fase 13 geopend.

UI/HUD/minimap source image natural size blijft metadata. Display size, scale mode, anchor en pivot blijven node-data/editor-data/publish data. Runtime client shell toont alleen read-only projection status/metadata en veilige empty states.

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

GLB roles blijven candidate/editor-data. UI/audio assets blijven asset-library candidates.

## Open Codex/Claude server-side taken

Nog server-side valideren volgens `docs/ops/server-verification-runbook.md`:

- `pnpm build`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm lint`;
- `gk-api` en relevante webservice restart indien server-layout dat gebruikt;
- runtime projection read-only route smokes;
- game/runtime shell route smokes voor `/game`, `/game/` en `/game/shell.json` waar beschikbaar;
- browser-smoke met runtime shell marker wanneer `GK_GAME_WEB_ORIGIN` of `GK_GAME_FRONT_DOOR_URL` is gezet;
- bevestigen dat runtime client geen editor/admin routes gebruikt;
- bevestigen dat er geen renderer/gameplay/movement/combat/audio playback, hardcoded content of assetmutatie is;
- docs final.

## Fasebeoordeling

Fase 12 Git-basis is voorbereid.

Fase 12 is server-side nog niet klaar. Markeer Fase 12 pas als afgerond nadat Codex/Claude de open checks, live smokes en browser smoke bevestigt.
