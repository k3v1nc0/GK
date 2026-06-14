# Fase 17 - Runtime Game Core

## Status

Geopend en Git-basis toegevoegd op `main`. Server-side verificatie staat nog open; deze fase is dus nog niet formeel afgerond.

Fase 16 Fundering en herbaseline is afgerond. Fase 15 Runtime Asset Reference Planning Core blijft het directe upstream-contract voor Fase 17.

## Bronbasis

Deze fase volgt uit het repo-contract waarin de keten eindigt met `Runtime Game`, terwijl Fase 15 expliciet geen asset loader, renderer, gameplay, movement, combat of audio playback is.

Professionele toets: server-authoritative multiplayer en latere room-state blijven later; deze fase bouwt eerst een reproduceerbaar runtimepad uit published data.

## Echt doel

Bouw de eerste echte `Runtime Game Core`: een runtime die uitsluitend published/read-model-data leest en daar een startbare game-shell uit maakt.

## Waarom nu

Zonder deze laag blijft GK technisch sterk maar niet speelbaar. De bestaande lagen zijn metadata-, projection-, shell-, surface-, scene-assembly- en asset-reference-planninglagen. Deze fase zet published data voor het eerst om naar een runtimepad dat een speler kan starten.

## Scope

- Published build loader contract.
- Runtime manifest reader.
- Asset reference resolver als contractlaag, nog zonder definitive role mapping buiten toegestane published data.
- World bootstrap vanuit published read models.
- Player session bootstrap.
- Input adapter.
- Camera/HUD/audio adapterpunten als engine-capabilities.
- Save/load basis voor runtime state.
- Diagnostics wanneer required published data ontbreekt.

## Niet in scope

- Questinhoud.
- Combat.
- Economy.
- Multiplayer.
- Concrete zone-layout hard-coden.
- Dummy world, dummy NPC, dummy quest of fallback model.
- Draft/editordata direct in runtime lezen.
- Asset byte loading.
- Renderer draw calls.

## Verplichte gates

- Runtime leest geen editor/admin routes.
- Runtime leest geen draft/candidate data.
- Concrete gamewaarden komen uit published data, GameBible/registers of expliciete editorinput.
- Asset loading mag alleen volgens het contract dat deze fase expliciet toevoegt; geen verborgen byte fetches.
- Engine-capabilities worden gescheiden van concrete content.

## Geimplementeerde Git-basis

Toegevoegd of bijgewerkt:

- `docs/architecture/runtime-game-core.md`
- `packages/schemas/src/runtime-game-core.ts`
- `packages/schemas/src/runtime-game-core-validation.ts`
- `packages/schemas/src/index.ts`
- `packages/schemas/src/node-graph.ts`
- `packages/node-types/src/runtime-game-core-nodes.ts`
- `packages/node-types/src/index.ts`
- `apps/game-web/src/runtime-game-core.ts`
- `apps/game-web/src/runtime-client-shell.ts`
- `apps/game-web/src/http-server.ts`
- `apps/game-web/src/index.ts`
- `apps/game-web/src/runtime-client-shell-styles.ts`
- `tests/phase17-runtime-game-core.test.mjs`
- `tests/smoke/runtime-game-core-smoke.mjs`
- `package.json`
- `scripts/check-workspace-boundaries.mjs`

## Huidig gedrag

De default Runtime Game Core state blokkeert veilig wanneer er nog geen published runtime manifest, published world read-model of asset-reference metadata-plan beschikbaar is.

Dat betekent:

- `data-runtime-game-core="phase-17"` staat in de game shell;
- `/game/shell.json` exposeert `runtimeGameCore` en `runtimeGameCoreContract`;
- `/health/game` exposeert `runtimeGameCore:"phase-17"`;
- boot/readiness komt alleen uit published read-model en Fase 15 asset-reference metadata;
- missing published data wordt diagnostic, geen dummy content;
- save/load basis is een runtime-state envelope;
- input is een intent-adapter zonder movement/combat binding;
- camera/HUD/audio blijven adapterpunten die published data vereisen.

## Acceptatie

Nog te bevestigen server-side:

- Runtime kan starten vanuit alleen published data.
- Geen hard-coded world/camera/light/HUD/minimap/audio/contentwaarden.
- Save/load basis werkt of ontbreekt expliciet als blocker.
- Fouten door ontbrekende data zijn zichtbaar en blokkeren veilig.
- Geen quest/combat/economy/multiplayer is per ongeluk gebouwd.
- Browser-smoke ziet de Fase 17 marker en geen editor/draft/asset-byte/render leaks.

## Server-side verificatie open

Nog te draaien op de servercheckout:

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm typecheck`
- lokale route-smokes voor `/health/game`, `/game/` en `/game/shell.json`
- Apache/front-door route-smokes
- `pnpm smoke:browser:game`
- `pnpm smoke:browser`

## Prompt 1 - GK Code Copiloot

```text
Je bent GK Code Copiloot in builder mode. Werk GitHub-only op main en gebruik de actuele repository als waarheid.

DOEL
Rond Fase 17 - Runtime Game Core af. Controleer de bestaande Git-basis op main en corrigeer alleen structurele issues die de Fase 17 gates blokkeren.

VERPLICHTE BRONNEN
- docs/fases/fase-16-fundering-en-herbaseline.md
- docs/fases/fase-17-runtime-game-core.md
- docs/architecture/runtime-game-core.md
- README/current-phase.md
- docs/design/phase-plan/current-phase.md
- README/fase15.md
- README/node-system-super-dynamic-contract.md
- README/hard-facts-to-node-panels.md
- packages/schemas/src/runtime-game-core.ts
- packages/schemas/src/runtime-game-core-validation.ts
- packages/node-types/src/runtime-game-core-nodes.ts
- apps/game-web/src/runtime-game-core.ts
- apps/game-web/src/http-server.ts
- apps/game-web/src/runtime-client-shell.ts
- tests/phase17-runtime-game-core.test.mjs
- tests/smoke/runtime-game-core-smoke.mjs

WERKWIJZE
1. Controleer eerst dat Fase 16 klaar is en Fase 15 server-side groen blijft.
2. Controleer dat Fase 17 alleen published/read-model-data en Fase 15 asset-reference metadata consumeert.
3. Houd editor/draft en runtime strikt gescheiden.
4. Voeg geen concrete gamecontent, dummy world, dummy NPC, dummy quest of fallback model toe.
5. Voeg geen asset byte loading, renderer draw calls, quest/combat/economy/multiplayer of hardcoded runtime values toe.
6. Corrigeer alleen echte gate-fouten en update docs/status alleen als server-side bewijs dat rechtvaardigt.

ACCEPTATIE
- Runtime Game Core marker in game shell.
- /game/shell.json en /health/game expose Fase 17 status.
- Safe blocked diagnostics wanneer required published data ontbreekt.
- Ready-state alleen mogelijk uit published read-model + metadata asset plan.
- Geen draft/editor route usage.
- Geen hard-coded contentwaarden.
- Geen quest/combat/economy/multiplayer buiten expliciete latere fases.
```

## Prompt 2 - Server-side verificatie

```text
Je voert server-side verificatie uit voor Fase 17 - Runtime Game Core op de servercheckout.

START
- Pull eerst `main`.
- Controleer `git status --short` voor en na je werk.
- Raak Fase 18 niet aan.

CONTROLEER
- pnpm lint
- pnpm test
- pnpm build
- pnpm typecheck
- GET /health/game
- GET /game/
- GET /game/shell.json
- Apache/front-door route-smokes voor de game route
- pnpm smoke:browser:game
- pnpm smoke:browser

SPECIFIEKE ASSERTIES
- Game shell bevat `data-runtime-game-core="phase-17"`.
- /health/game bevat `runtimeGameCore:"phase-17"`, `bootsRuntimeGame:true`, `consumesPublishedReadModel:true`, `consumesRuntimeAssetReferencePlan:true`.
- /game/shell.json bevat `runtimeGameCore` en `runtimeGameCoreContract`.
- Default state blokkeert veilig op ontbrekende published data en gebruikt diagnostics.
- Geen editor/admin route usage in game runtime output.
- Geen draft leakage.
- Geen /assets byte fetches, GLB/texture/audio loads of asset load requests.
- Geen renderer draw calls.
- Geen hardcoded world/camera/light/HUD/minimap/audio/content values.
- Geen quest/combat/economy/multiplayer runtime gebouwd.
- Save/load basis is runtime-state only of rapporteert expliciet blocker.

NIET DOEN
- Geen ontbrekende Kevin-content invullen.
- Geen dummy assets toevoegen.
- Geen dummy world/NPC/quest/fallback model toevoegen.
- Geen Fase 18 quest/dialooginhoud openen.

RAPPORTEER
- groene checks;
- falende checks;
- exacte runtime boot bewijzen;
- exacte blockers als Fase 17 niet dicht kan;
- commit SHA als je een fix moest maken;
- of Fase 17 formeel wel/niet mag worden afgesloten.
```
