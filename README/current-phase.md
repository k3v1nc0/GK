# Current Phase

Actieve status: Fase 13 Runtime Render Surface Core is geopend en de Git-basis is toegevoegd op `main`.

Fase 1 t/m Fase 12.1 zijn afgerond. Fase 12 Runtime Client Shell Core is server-side groen bevestigd via commit `61792b7e6b923add68fdebd80f673dfdd86210ff` (`fix: verify phase 12 runtime client shell core`). Fase 12.1 Game Web Service Deployment Core is server-side groen bevestigd op Git HEAD `70808b7ac2aa50671fbf4369ef1158a5e5f13736` (`fase 12.1 definitieve Node 22 game-shell`).

Fase 13 voegt alleen de generieke runtime render-surface basis toe: contracts, lifecycle/status, capability flags, canvas/render host, WebGL/canvas capability probe, safe empty render state, node/socket contracts, browser-smoke marker en tests.

Server-side verificatie door Codex/Claude is nog nodig. Fase 13 is pas klaar na build/typecheck/test/lint, live route-smokes, browser-smoke, no-content/no-asset/no-gameplay checks en docs-final.

Fase 14 is nog niet geopend.

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
- `README/node-system-super-dynamic-contract.md`
- `docs/architecture/editor-shell.md`
- `docs/architecture/auth-boundaries.md`
- `docs/design/content-gates.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `docs/design/game-bible.md`
- `docs/ops/server-layout.md`
- `docs/ops/server-verification-runbook.md`
- `ops/systemd/gk-game-web.service`
- `README/GameBibleNode.json`

## Fase 13 Git-basis

Toegevoegd:

- runtime render surface schemas en validation gates;
- runtime render lifecycle/status/capability/safety models;
- typed sockets en node types voor runtime render surface, status, capability, lifecycle en safety flags;
- game-web render-surface helper met canvas host en client-side canvas/WebGL capability probe;
- runtime shell UI marker `data-runtime-render-surface="phase-13"`;
- safe empty render state wanneer er geen renderbare projection payload is;
- browser-smoke uitbreiding voor render surface marker, safe empty state, console/page errors en asset-request stilte;
- Fase 13 tests voor schemas, validators, nodes, shell UI, route contracts en no-content/no-asset/no-gameplay boundaries;
- Fase 13 docs/statusupdates.

## Fase 13 grenzen

Niet toegevoegd of gewijzigd:

- geen volledige 3D renderer;
- geen projection-driven scene assembly;
- geen concrete gamewereld;
- geen GLB loading;
- geen definitive GLB role mapping;
- geen dummy world, NPC, quest of economy;
- geen gameplay, movement, combat of player runtime;
- geen audio playback;
- geen HUD/minimap runtime layout;
- geen hardcoded world/camera/light/minimap/HUD/audio values;
- geen assetmutatie;
- geen editor draft/candidate data direct in runtime;
- geen automatic publish/projection;
- geen secrets;
- geen Fase 14 implementatie.

De keten blijft:

```text
Database / Editor / Node-system
  -> Publish Flow Core
  -> Runtime Projection Core
  -> Runtime Client Shell Core
  -> Game Web Service Deployment Core
  -> Runtime Render Surface Core
  -> latere Projection-driven Scene Assembly / Gameplay / HUD / Audio fases
```

## Fasebeoordeling

Fase 13 Git-basis is toegevoegd.

Fase 13 is server-side nog niet klaar. Codex/Claude moet build/typecheck/test/lint, live `gk-game-web` route-smokes, browser-smoke en Fase 13 safety checks nog draaien en rapporteren.

Fase 14 is nog niet geopend.
