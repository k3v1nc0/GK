# Current Phase

Actieve status: Fase 16 Fundering en herbaseline is verwerkt en formeel afgerond. Fase 17 Runtime Game Core is de volgende geplande fase en is nog niet geopend of geimplementeerd.

Fase 1 t/m Fase 15 zijn afgerond. Fase 12 Runtime Client Shell Core is server-side groen bevestigd via commit `61792b7e6b923add68fdebd80f673dfdd86210ff` (`fix: verify phase 12 runtime client shell core`). Fase 12.1 Game Web Service Deployment Core is server-side groen bevestigd op Git HEAD `70808b7ac2aa50671fbf4369ef1158a5e5f13736` (`fase 12.1 definitieve Node 22 game-shell`). Fase 13 Runtime Render Surface Core is server-side groen bevestigd via commit `192645f7c33dfc6f800f566784794f6e1111310a` (`fix: verify phase 13 runtime render surface core`) en formeel afgerond. Fase 14 Projection-driven Scene Assembly Core is server-side groen bevestigd via commit `1b583b7f769690c3f7e7a98c41b4dd1937853519` (`fase 14 fix`) en formeel afgerond. Fase 15 Runtime Asset Reference Planning Core is server-side groen bevestigd na commit `b8b4c39f76f1fc778f7af8dd51b3cffdc6d3497d` (`fase 15 fix`) en formeel afgerond.

Fase 16 heeft de speelbare vervolgplanning opnieuw gebaselined zonder code, assets, nodecontracts, runtimegedrag of concrete gamecontent toe te voegen.

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

## Volgende geplande fase

Fase 17 Runtime Game Core is de volgende geplande fase. Die fase mag pas geopend worden met een nieuw expliciet verzoek en moet starten vanuit published/read-model-data zonder editor/admin routes, draft leakage of hard-coded gamecontent.

## Primaire bronnen

Open voor de actuele fasecontractstatus:

- `docs/design/phase-plan/current-phase.md`
- `docs/fases/fase-16-fundering-en-herbaseline.md`
- `docs/fases/fase-17-runtime-game-core.md`
- `docs/fases/fase-18-speelbare-quest-en-dialoogslice.md`
- `docs/fases/fase-19-progressie-inventaris-en-combat.md`
- `docs/fases/fase-20-authoritative-gedeelde-wereld.md`
- `docs/fases/fase-21-mmo-builder-en-lange-termijn-platform.md`
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

Fase 17 Runtime Game Core is nog niet geopend.

Git-basis klaar: ja.

Server-side klaar voor Fase 15: ja.

Fase 16 roadmap/herbaseline klaar: ja.