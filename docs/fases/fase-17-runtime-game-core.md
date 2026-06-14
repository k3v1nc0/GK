# Fase 17 - Runtime Game Core

## Status

Formeel afgerond. Server-side verificatie is groen bevestigd op HEAD `8ebbcf4`.

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

## Server-side verificatie

Groen bevestigd:

- `git status --short` voor en na: schoon;
- `git pull --ff-only`: up to date;
- `pnpm lint`: groen;
- `pnpm test`: groen;
- `pnpm build`: groen;
- `pnpm typecheck`: groen;
- lokale `GET /health/game`: groen;
- lokale `GET /game/`: groen;
- lokale `GET /game/shell.json`: groen;
- Apache/front-door game route-smokes: groen;
- `pnpm smoke:browser:game`: groen;
- `pnpm smoke:browser`: groen.

Runtime bewijs:

- `/health/game` geeft `runtimeGameCore:"phase-17"`, `bootsRuntimeGame:true`, `consumesPublishedReadModel:true`, `consumesRuntimeAssetReferencePlan:true` en `blockedByMissingPublishedData:true`;
- `/game/` bevat `data-runtime-game-core="phase-17"`;
- safe blocked diagnostics zijn aanwezig: `published_manifest_missing`, `published_world_read_model_missing`, `runtime_asset_reference_plan_empty`;
- `/game/shell.json` bevat `runtimeGameCore` en `runtimeGameCoreContract`;
- browser-smoke via front-door had `asset load requests: 0`, `console errors count: 0`, `page errors count: 0`.

## Acceptatie

Bevestigd:

- Runtime Game Core marker in game shell.
- `/game/shell.json` en `/health/game` expose Fase 17 status.
- Safe blocked diagnostics wanneer required published data ontbreekt.
- Ready-state alleen mogelijk uit published read-model + metadata asset plan.
- Geen draft/editor route usage.
- Geen hard-coded contentwaarden.
- Geen quest/combat/economy/multiplayer buiten expliciete latere fases.
- Save/load basis is runtime-state only: `saveLoad.status:"contract-ready"` en `savesRuntimeStateOnly:true`.

## Afsluitoordeel

Fase 17 mag formeel afgesloten blijven. De live runtime boot is veilig blocked door ontbrekende published data; dat is voor Fase 17 valide eindgedrag en geen blocker voor Fase 17 zelf.

Fase 18 is daardoor nog niet automatisch open: Fase 18 vereist echte published quest/dialogue data en concrete slice-input uit GameBible/editor/node-data of expliciete Kevin-input.
