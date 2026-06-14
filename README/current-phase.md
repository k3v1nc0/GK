# Current Phase

Actieve status: Fase 15 Runtime Asset Reference Planning Core is geopend. De Git-basis is toegevoegd op `main`; server-side verificatie door Codex/Claude is nog nodig.

Fase 1 t/m Fase 14 zijn afgerond. Fase 12 Runtime Client Shell Core is server-side groen bevestigd via commit `61792b7e6b923add68fdebd80f673dfdd86210ff` (`fix: verify phase 12 runtime client shell core`). Fase 12.1 Game Web Service Deployment Core is server-side groen bevestigd op Git HEAD `70808b7ac2aa50671fbf4369ef1158a5e5f13736` (`fase 12.1 definitieve Node 22 game-shell`). Fase 13 Runtime Render Surface Core is server-side groen bevestigd via commit `192645f7c33dfc6f800f566784794f6e1111310a` (`fix: verify phase 13 runtime render surface core`) en formeel afgerond. Fase 14 Projection-driven Scene Assembly Core is server-side groen bevestigd via commit `1b583b7f769690c3f7e7a98c41b4dd1937853519` (`fase 14 fix`) en formeel afgerond.

Fase 15 voegt alleen een runtime asset-reference planning metadata-basis toe:

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

Server-side verificatie staat nog open voor Fase 15:

- `pnpm build`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm lint`;
- `gk-api`, `gk-editor-web` en `gk-game-web` active/enabled;
- local route-smokes;
- Apache/front-door smokes;
- `pnpm smoke:browser:game`;
- `pnpm smoke:browser:editor`;
- `pnpm smoke:browser`;
- asset reference planning marker;
- empty asset reference plan;
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

Fase 16 is nog niet geopend of geimplementeerd.

Volgende stap: Codex/Claude mag Fase 15 server-side verifieren. Na groene verificatie volgt docs-final.

## Primaire bronnen

Open voor de actuele fasecontractstatus:

- `docs/design/phase-plan/current-phase.md`
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

Fase 15 Runtime Asset Reference Planning Core is geopend.

Git-basis klaar: ja.

Server-side klaar: nee.

Fase 16 is nog niet geopend of geimplementeerd.
