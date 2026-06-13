# Fase 14 - Projection-driven Scene Assembly Core

## Status

Fase 14 is geopend. De Git-basis voor Projection-driven Scene Assembly Core is toegevoegd op `main`.

Server-side verificatie door Codex/Claude is nog nodig. Fase 14 is pas klaar na build, typecheck, test, lint, live route-smokes, Apache/front-door smokes, browser smoke en docs-final.

Fase 1 t/m Fase 13 zijn afgerond. Fase 15 is nog niet geopend of geimplementeerd.

## Doel

Fase 14 voegt een veilige data-driven scene assembly laag toe. De laag mag runtime projection metadata/read-model records omzetten naar neutrale scene descriptor/scene plan metadata voor latere rendererfases.

De keten blijft:

```text
Database / Editor / Node-system
  -> Publish Flow Core
  -> Runtime Projection Core
  -> Runtime Client Shell Core
  -> Game Web Service Deployment Core
  -> Runtime Render Surface Core
  -> Projection-driven Scene Assembly Core
  -> latere Asset Loading / Renderer / Gameplay / HUD / Audio fases
```

## Toegevoegd

- Runtime scene assembly contracts.
- Scene descriptor/read-model contracts.
- Scene assembly lifecycle/status.
- Scene assembly safety flags.
- Projection-to-scene-plan validation.
- Empty scene plan wanneer runtime projection records leeg zijn.
- Scene assembly statuszone in de game shell.
- Marker `data-runtime-scene-assembly="phase-14"`.
- Node/socket contracts voor scene assembly status, source, plan, descriptor en safety flags.
- Browser-smoke check voor scene assembly marker en empty scene plan.
- Tests voor no-content/no-asset/no-render/no-gameplay boundaries.

## Contracten

Schema's:

- `RuntimeSceneAssemblyStatus`;
- `RuntimeSceneAssemblyState`;
- `RuntimeSceneAssemblyPlan`;
- `RuntimeSceneAssemblyDescriptor`;
- `RuntimeSceneAssemblyNode`;
- `RuntimeSceneAssemblySource`;
- `RuntimeSceneAssemblyErrorState`;
- `RuntimeSceneAssemblySafetyFlags`.

Safety flags:

- `consumesRuntimeProjectionRecords=true`;
- `producesScenePlan=true`;
- `loadsAssets=false`;
- `resolvesFinalAssetRoles=false`;
- `rendersScene=false`;
- `implementsGameplay=false`;
- `implementsMovement=false`;
- `implementsCombat=false`;
- `implementsAudioPlayback=false`;
- `hardcodesWorld=false`;
- `hardcodesCamera=false`;
- `hardcodesLighting=false`;
- `hardcodesHud=false`;
- `hardcodesMinimap=false`;
- `hardcodesContent=false`;
- `mutatesAssets=false`;
- `usesEditorDraftData=false`;
- `usesEditorAdminRoutes=false`.

## Scene plan regels

- Als runtime projection records leeg zijn, is een empty scene plan geldig.
- Als runtime projection records bestaan, mag Fase 14 alleen generieke descriptors maken op basis van toegestane metadata.
- Scene descriptors mogen geen concrete payload, renderer instruction, asset-load URL of final asset role bevatten.
- Scene plan nodes zijn metadata-nodes, geen renderer nodes.
- Fase 14 maakt geen hardcoded fallback zoals default village, test NPC of dummy object.

## Niet toegestaan

Fase 14 bouwt niet:

- volledige 3D renderer;
- GLB asset loading;
- texture/audio loading;
- definitive GLB role mapping;
- asset-loader node;
- renderer node;
- gameplay node;
- concrete gamewereld;
- dummy world, NPC, quest of economy;
- gameplay, movement, combat of player runtime;
- audio playback;
- HUD/minimap runtime layout;
- camera/light/fog/sky/world hardcoding;
- automatic publish/projection;
- editor draft/candidate data in runtime;
- editor/admin routes in runtime;
- assetmutatie;
- secrets;
- Fase 15.

## Bestanden

Toegevoegd of bijgewerkt:

- `packages/schemas/src/runtime-scene-assembly.ts`;
- `packages/schemas/src/runtime-scene-assembly-validation.ts`;
- `packages/schemas/src/node-graph.ts`;
- `packages/schemas/src/index.ts`;
- `packages/node-types/src/runtime-scene-assembly-nodes.ts`;
- `packages/node-types/src/index.ts`;
- `apps/game-web/src/runtime-scene-assembly.ts`;
- `apps/game-web/src/runtime-client-shell.ts`;
- `apps/game-web/src/runtime-client-shell-styles.ts`;
- `apps/game-web/src/http-server.ts`;
- `apps/game-web/src/index.ts`;
- `tests/smoke/browser-smoke.mjs`;
- `tests/phase14-runtime-scene-assembly.test.mjs`;
- status-, design- en ops-documentatie.

## Server-side verificatie open

Codex/Claude moet nog bevestigen:

- `pnpm build`: open;
- `pnpm typecheck`: open;
- `pnpm test`: open;
- `pnpm lint`: open;
- `gk-api`, `gk-editor-web`, `gk-game-web` active/enabled: open;
- Node 22 process check via `/opt/gk/node-v22/bin/node`: open;
- local route-smokes op `127.0.0.1:3003`: open;
- Apache/front-door smokes: open;
- `pnpm smoke:browser:game`: open;
- `pnpm smoke:browser:editor`: open;
- `pnpm smoke:browser`: open;
- runtime shell marker: open;
- render surface marker: open;
- scene assembly marker: open;
- empty scene plan: open;
- no editor/admin route usage: open;
- no editor draft/candidate leakage: open;
- no GLB/texture/audio loading: open;
- no asset load requests: open;
- no concrete gamecontent: open;
- no renderer scene draw calls: open;
- no gameplay/movement/combat/audio playback: open;
- no hardcoded HUD/minimap/world/camera/light/audio values: open;
- no asset mutation: open;
- worktree schoon: open;
- blockers: open.

## Fasebeoordeling

Git-basis klaar: ja.

Server-side klaar: nee.
