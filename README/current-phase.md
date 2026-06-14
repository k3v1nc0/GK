# Current Phase

Actieve status: Fase 17 Runtime Game Core is geopend en de Git-basis staat op `main`. Fase 17 is nog niet formeel afgerond, omdat server-side verificatie nog moet bevestigen dat build, typecheck, test, lint en runtime/browser-smokes groen zijn.

Fase 1 t/m Fase 15 zijn afgerond. Fase 12 Runtime Client Shell Core is server-side groen bevestigd via commit `61792b7e6b923add68fdebd80f673dfdd86210ff` (`fix: verify phase 12 runtime client shell core`). Fase 12.1 Game Web Service Deployment Core is server-side groen bevestigd op Git HEAD `70808b7ac2aa50671fbf4369ef1158a5e5f13736` (`fase 12.1 definitieve Node 22 game-shell`). Fase 13 Runtime Render Surface Core is server-side groen bevestigd via commit `192645f7c33dfc6f800f566784794f6e1111310a` (`fix: verify phase 13 runtime render surface core`) en formeel afgerond. Fase 14 Projection-driven Scene Assembly Core is server-side groen bevestigd via commit `1b583b7f769690c3f7e7a98c41b4dd1937853519` (`fase 14 fix`) en formeel afgerond. Fase 15 Runtime Asset Reference Planning Core is server-side groen bevestigd na commit `b8b4c39f76f1fc778f7af8dd51b3cffdc6d3497d` (`fase 15 fix`) en formeel afgerond.

Fase 16 Fundering en herbaseline heeft de speelbare vervolgplanning opnieuw gebaselined zonder code, assets, nodecontracts, runtimegedrag of concrete gamecontent toe te voegen.

## Fase 15 afgerond

Fase 15 voegde alleen een runtime asset-reference planning metadata-basis toe:

- runtime asset reference planning contracts;
- asset reference plan/read-model contracts;
- asset reference candidate metadata contracts;
- asset reference planning lifecycle/status;
- asset reference safety flags;
- scene-plan-to-asset-reference validation;
- empty asset reference plan wanneer er geen scene descriptors zijn;
- asset reference planning status/marker in de game shell;
- node/socket contracts;
- browser-smoke marker;
- tests en docs voor no-asset-load/no-final-role/no-render/no-gameplay boundaries.

Server-side verificatie is groen bevestigd voor Fase 15:

- `pnpm build`: groen;
- `pnpm typecheck`: groen;
- `pnpm test`: groen;
- `pnpm lint`: groen;
- `gk-api`, `gk-editor-web` en `gk-game-web` active/enabled;
- local route-smokes: groen;
- Apache/front-door smokes: groen;
- `pnpm smoke:browser:game`: groen;
- `pnpm smoke:browser:editor`: groen;
- `pnpm smoke:browser`: groen;
- asset reference planning marker aanwezig;
- empty asset reference plan aanwezig;
- no editor/admin route usage;
- no draft leakage;
- no GLB/texture/audio loading;
- no asset byte fetch;
- no asset load requests;
- no definitive asset role mapping;
- no concrete content;
- no renderer draw calls;
- no gameplay/movement/combat/audio playback;
- no hardcoded runtime values;
- no asset mutation;
- worktree schoon;
- blockers geen.

Fase 15 is geen asset loader. Er is geen GLB loading, geen texture/audio loading, geen asset byte fetch, geen definitive asset role mapping, geen renderer draw call, geen gameplay/movement/combat/audio playback, geen concrete gamecontent, geen hardcoded world/camera/light/minimap/HUD/audio values en geen assetmutatie toegevoegd.

## Fase 16 afgerond

Fase 16 Fundering en herbaseline heeft de roadmap gesaneerd en de speelbare lijn vastgelegd in `docs/fases`.

Verwerkt:

- Fase 15 status en blockers hard bevestigd op basis van server-side groen bewijs.
- Canonieke speelbare fasevolgorde staat in `docs/fases`.
- Oude live toekomstfasebestanden `README/fase16.md`, `README/fase17.md` en `README/fase18.md` zijn niet meer aanwezig als live roadmapbron.
- De tijdelijke onderzoeksmap `docs/roadmap-research-input` is geen levende roadmapbron.
- Geen gameplaycode, runtimecode, assets, nodecontracts of concrete GameBible-content toegevoegd.

## Fase 17 geopend

Fase 17 Runtime Game Core bouwt de eerste runtime bootlaag bovenop published/read-model-data en Fase 15 asset-reference metadata.

Git-basis toegevoegd:

- Runtime Game Core schema contracts en validation.
- Runtime game socket types.
- Runtime Game Core node contracts.
- Game-web Runtime Game Core section met `data-runtime-game-core="phase-17"`.
- `/health/game` en `/game/shell.json` Fase 17 status.
- Safe blocked diagnostics wanneer required published data ontbreekt.
- Player session bootstrap contract.
- Input intent adapter boundary.
- Runtime-state only save/load basis.
- Browser-smoke voor Runtime Game Core.
- Fase 17 tests.
- Architectuurdocument `docs/architecture/runtime-game-core.md`.

Niet gebouwd:

- concrete gamecontent;
- dummy world/NPC/quest/fallback model;
- quest/combat/economy/multiplayer;
- movement binding;
- asset byte loading;
- renderer draw calls;
- hardcoded world/camera/light/HUD/minimap/audio/content values;
- editor/admin routegebruik in game runtime;
- draft/candidate data usage in game runtime.

## Server-side verificatie open voor Fase 17

Nog nodig voordat Fase 17 formeel dicht mag:

- `pnpm lint`;
- `pnpm test`;
- `pnpm build`;
- `pnpm typecheck`;
- local route-smokes voor `/health/game`, `/game/` en `/game/shell.json`;
- Apache/front-door route-smokes;
- `pnpm smoke:browser:game`;
- `pnpm smoke:browser`;
- bewijs dat Runtime Game Core marker aanwezig is;
- bewijs dat er geen editor/admin route usage, draft leakage, asset byte fetch, renderer draw call of hardcoded content is.

## Primaire bronnen

Open voor de actuele fasecontractstatus:

- `docs/design/phase-plan/current-phase.md`
- `docs/fases/fase-16-fundering-en-herbaseline.md`
- `docs/fases/fase-17-runtime-game-core.md`
- `docs/fases/fase-18-speelbare-quest-en-dialoogslice.md`
- `docs/fases/fase-19-progressie-inventaris-en-combat.md`
- `docs/fases/fase-20-authoritative-gedeelde-wereld.md`
- `docs/fases/fase-21-mmo-builder-en-lange-termijn-platform.md`
- `docs/architecture/runtime-game-core.md`
- `README/fase8.md`
- `README/fase8.1.md`
- `README/fase9.md`
- `README/fase10.md`
- `README/fase11.md`
- `README/fase12.md`
- `README/fase12.1.md`
- `README/fase13.md`
- `README/fase14.md`
- `README/fase15.md`
- `README/node-system-super-dynamic-contract.md`
- `docs/architecture/auth-boundaries.md`
- `docs/design/content-gates.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `docs/design/game-bible.md`
- `docs/ops/server-layout.md`
- `docs/ops/server-verification-runbook.md`
- `README/GameBibleNode.json`

## Fasebeoordeling

Fase 15 Runtime Asset Reference Planning Core is formeel afgerond.

Fase 16 Fundering en herbaseline is formeel afgerond.

Fase 17 Runtime Game Core is geopend met Git-basis op main, maar wacht op server-side verificatie.

Git-basis klaar voor Fase 17: ja.

Server-side klaar voor Fase 17: nee, nog open.

Fase 17 formeel afgerond: nee.
