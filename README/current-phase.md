# Current Phase

Actieve status: Fase 14 Projection-driven Scene Assembly Core is geopend. De Git-basis is toegevoegd; server-side verificatie door Codex/Claude is nog nodig.

Fase 1 t/m Fase 13 zijn afgerond. Fase 12 Runtime Client Shell Core is server-side groen bevestigd via commit `61792b7e6b923add68fdebd80f673dfdd86210ff` (`fix: verify phase 12 runtime client shell core`). Fase 12.1 Game Web Service Deployment Core is server-side groen bevestigd op Git HEAD `70808b7ac2aa50671fbf4369ef1158a5e5f13736` (`fase 12.1 definitieve Node 22 game-shell`). Fase 13 Runtime Render Surface Core is server-side groen bevestigd via commit `192645f7c33dfc6f800f566784794f6e1111310a` (`fix: verify phase 13 runtime render surface core`) en formeel afgerond.

Fase 14 voegt alleen een generieke projection-driven scene assembly basis toe:

- runtime scene assembly contracts;
- scene descriptor/read-model contracts;
- scene assembly lifecycle/status;
- scene assembly safety flags;
- projection-to-scene-plan validation;
- empty scene plan wanneer er geen runtime projection records zijn;
- scene assembly status/marker in de game shell;
- node/socket contracts;
- browser-smoke marker;
- tests en docs voor no-content/no-asset/no-render/no-gameplay boundaries.

Fase 14 is geen renderer. Er is geen GLB loading, geen texture/audio loading, geen definitive asset role mapping, geen renderer scene draw call, geen gameplay/movement/combat/audio playback, geen concrete gamecontent, geen hardcoded world/camera/light/minimap/HUD/audio values en geen assetmutatie toegevoegd.

Fase 14 is pas klaar na server-side bevestiging van build, typecheck, test, lint, live route-smokes, Apache/front-door smokes, browser-smoke game/full en docs-final.

Fase 15 is nog niet geopend of geimplementeerd.

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

Fase 14 Projection-driven Scene Assembly Core Git-basis staat op `main`.

Server-side klaar: nee.
