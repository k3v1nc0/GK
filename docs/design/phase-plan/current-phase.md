# Current Phase

## Fase

Actieve status: Fase 15 Runtime Asset Reference Planning Core is geopend. De Git-basis is toegevoegd op `main`; server-side verificatie door Codex/Claude is nog nodig.

Fase 1 t/m Fase 14 zijn afgerond. Fase 14 Projection-driven Scene Assembly Core is server-side groen bevestigd via commit `1b583b7f769690c3f7e7a98c41b4dd1937853519` (`fase 14 fix`) en formeel afgerond.

Fase 16 is nog niet geopend of geimplementeerd.

## Statussamenvatting

Fase 15 bouwt een veilige metadata-only runtime asset-reference planninglaag tussen Projection-driven Scene Assembly Core en latere asset loading/renderer/gameplay fases. De laag mag scene-plan descriptors omzetten naar generieke asset-reference descriptors en metadata candidates.

Toegevoegd of bijgewerkt:

- `packages/schemas/src/runtime-asset-reference-planning.ts`;
- `packages/schemas/src/runtime-asset-reference-planning-validation.ts`;
- `packages/schemas/src/node-graph.ts`;
- `packages/schemas/src/index.ts`;
- `packages/node-types/src/runtime-asset-reference-planning-nodes.ts`;
- `packages/node-types/src/index.ts`;
- `apps/game-web/src/runtime-asset-reference-planning.ts`;
- `apps/game-web/src/runtime-client-shell.ts`;
- `apps/game-web/src/http-server.ts`;
- `apps/game-web/src/index.ts`;
- `tests/smoke/browser-smoke.mjs`;
- `tests/phase15-runtime-asset-reference-planning.test.mjs`;
- `scripts/check-workspace-boundaries.mjs`;
- `README/fase15.md`;
- status-, design- en ops-documentatie.

## Fase 15 grenzen

Fase 15 is geen asset loader en geen renderer. De Git-basis bevat:

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
- editor/admin routegebruik in runtime asset planning;
- Fase 16.

## Server-side verificatie nog open

Fase 15 is pas klaar na:

- `pnpm build`: open;
- `pnpm typecheck`: open;
- `pnpm test`: open;
- `pnpm lint`: open;
- live service checks: open;
- local route-smokes: open;
- Apache/front-door smokes: open;
- `pnpm smoke:browser:game`: open;
- `pnpm smoke:browser:editor`: open;
- `pnpm smoke:browser`: open;
- asset reference planning marker: open;
- empty asset reference plan: open;
- no editor/admin route usage: open;
- no draft leakage: open;
- no GLB/texture/audio loading: open;
- no asset byte fetch: open;
- no definitive asset role mapping: open;
- no concrete content: open;
- no renderer draw calls: open;
- no gameplay/movement/combat/audio playback: open;
- no hardcoded runtime values: open;
- no asset mutation: open;
- worktree schoon: open;
- blockers: open.

## Fasebeoordeling

Git-basis klaar: ja.

Server-side klaar: nee.

Fase 15 formeel afgerond: nee.

Fase 16 geimplementeerd: nee.
