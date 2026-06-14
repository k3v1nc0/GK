# Current Phase

## Fase

Actieve status: Fase 17 Runtime Game Core is geopend en de Git-basis staat op `main`. Fase 17 is nog niet formeel afgerond, omdat server-side verificatie nog moet bevestigen dat build, typecheck, test, lint en runtime/browser-smokes groen zijn.

Fase 1 t/m Fase 15 zijn afgerond. Fase 14 Projection-driven Scene Assembly Core is server-side groen bevestigd via commit `1b583b7f769690c3f7e7a98c41b4dd1937853519` (`fase 14 fix`) en formeel afgerond. Fase 15 Runtime Asset Reference Planning Core is server-side groen bevestigd na commit `b8b4c39f76f1fc778f7af8dd51b3cffdc6d3497d` (`fase 15 fix`) en formeel afgerond.

Fase 16 heeft de roadmap en fasebronnen opnieuw gebaselined zonder code, assets, nodecontracts, runtimegedrag of concrete gamecontent toe te voegen.

## Statussamenvatting

Fase 15 bouwde een veilige metadata-only runtime asset-reference planninglaag tussen Projection-driven Scene Assembly Core en latere asset loading/renderer/gameplay fases. De laag mag scene-plan descriptors omzetten naar generieke asset-reference descriptors en metadata candidates.

Fase 16 bevestigde daarna de harde overgang naar de speelbare lijn:

- Fase 15 is formeel afgesloten op groen server-side bewijs.
- De canonieke speelbare fasevolgorde staat in `docs/fases`.
- Oude live roadmapbestanden in `README/fase16.md`, `README/fase17.md` en `README/fase18.md` zijn niet aanwezig als live toekomstfasebron.
- Onderzoeksinput blijft geen levende statusbron.
- De volgende implementatiefase is Fase 17 Runtime Game Core.

Fase 17 heeft nu een Git-basis:

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

## Fase 15 grenzen

Fase 15 is geen asset loader en geen renderer. De afgeronde Git-basis bevat:

- runtime asset reference planning contracts;
- asset reference plan/read-model contracts;
- asset reference candidate metadata contracts;
- asset reference planning lifecycle/status;
- asset reference safety flags;
- scene-plan-to-asset-reference validation;
- empty asset reference plan wanneer er geen scene descriptors zijn;
- asset reference planning statuszone en marker in de game shell;
- node/socket contracts;
- browser-smoke marker;
- tests voor no-asset-load/no-final-role/no-render/no-gameplay boundaries.

Niet gebouwd:

- asset loading;
- GLB/texture/audio loading;
- asset byte fetch;
- definitive GLB/asset role mapping;
- renderer draw calls;
- gameplay, movement, combat of audio playback;
- concrete gamecontent;
- hardcoded world/camera/light/minimap/HUD/audio values;
- assetmutatie;
- editor/admin routegebruik in runtime asset planning.

## Fase 17 grenzen

Fase 17 is een Runtime Game Core boot- en contractlaag. De fase mag runtime startbaarheid voorbereiden, maar nog geen inhoudelijke gameplay bouwen.

Niet gebouwd in Fase 17:

- concrete gamecontent;
- dummy world/NPC/quest/fallback model;
- quest/combat/economy/multiplayer;
- movement binding;
- asset byte loading;
- renderer draw calls;
- hardcoded world/camera/light/HUD/minimap/audio/content values;
- editor/admin routegebruik in game runtime;
- draft/candidate data usage in game runtime;
- Fase 18 quest/dialoogslice.

## Server-side verificatie afgerond

Fase 15 is afgerond na:

- `pnpm build`: groen;
- `pnpm typecheck`: groen;
- `pnpm test`: groen;
- `pnpm lint`: groen;
- live service checks: groen;
- local route-smokes: groen;
- Apache/front-door smokes: groen;
- `pnpm smoke:browser:game`: groen;
- `pnpm smoke:browser:editor`: groen;
- `pnpm smoke:browser`: groen;
- asset reference planning marker: groen;
- empty asset reference plan: groen;
- no editor/admin route usage: groen;
- no draft leakage: groen;
- no GLB/texture/audio loading: groen;
- no asset byte fetch: groen;
- no definitive asset role mapping: groen;
- no concrete content: groen;
- no renderer draw calls: groen;
- no gameplay/movement/combat/audio playback: groen;
- no hardcoded runtime values: groen;
- no asset mutation: groen;
- worktree schoon: groen;
- blockers: geen.

## Fase 17 server-side verificatie open

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

## Fase 16 grenzen

Fase 16 is een documentatie- en herbaselinefase. Er is geen code, asset, runtimegedrag, nodecontract of concrete GameBible-content toegevoegd.

Fase 16 levert alleen:

- harde Fase 15 statusbevestiging;
- opgeschoonde roadmapstatus;
- geplande speelbare fasevolgorde in `docs/fases`;
- expliciete blokkade tegen oude/live fasebestanden die de nieuwe technische lijn tegenspreken.

## Fasebeoordeling

Git-basis Fase 15 klaar: ja.

Server-side Fase 15 klaar: ja.

Fase 15 formeel afgerond: ja.

Fase 16 formeel afgerond: ja.

Fase 17 Git-basis klaar: ja.

Fase 17 server-side verificatie klaar: nee.

Fase 17 formeel afgerond: nee.
