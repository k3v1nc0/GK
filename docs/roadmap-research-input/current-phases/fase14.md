# Fase 14 - Projection-driven Scene Assembly Core

## Status

Fase 14 Projection-driven Scene Assembly Core is server-side groen bevestigd en formeel afgerond.

Fase 1 t/m Fase 14 zijn afgerond. Fase 15 is nog niet geopend of geimplementeerd.

Server-side fix commit:

- `1b583b7f769690c3f7e7a98c41b4dd1937853519` (`fase 14 fix`).

De minimale server-side fix paste alleen `scripts/check-workspace-boundaries.mjs` aan om `packages/schemas/src/runtime-scene-assembly.ts` toe te staan als groot bronbestand. Er was geen inhoudelijke Fase 14 runtimewijziging en er zijn geen assets, gamecontent, package-bestanden of secrets gewijzigd.

Volgende stap: Kevin mag Fase 15 openen.

## Doel

Fase 14 voegde een veilige data-driven scene assembly laag toe. De laag mag runtime projection metadata/read-model records omzetten naar neutrale scene descriptor/scene plan metadata voor latere rendererfases.

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

Fase 14 voegde alleen projection-driven scene assembly metadata/scene-plan contracts toe:

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

## Server-side bevestigd

Codex/Claude heeft Fase 14 groen bevestigd:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK;
- `pnpm lint`: OK;
- `gk-api`, `gk-editor-web` en `gk-game-web` active/enabled: OK;
- `gk-game-web` draait via `/opt/gk/node-v22/bin/node`: OK;
- local route-smokes: OK;
- Apache/front-door smokes: OK;
- `pnpm smoke:browser:game`: OK;
- `pnpm smoke:browser:editor`: OK;
- `pnpm smoke:browser`: OK;
- scene assembly marker: OK;
- empty scene plan: OK;
- no editor/admin route usage: OK;
- no draft leakage: OK;
- no GLB/texture/audio loading: OK;
- no asset load requests: OK;
- no definitive asset role mapping: OK;
- no concrete content: OK;
- no renderer draw calls: OK;
- no gameplay/movement/combat/audio playback: OK;
- no hardcoded runtime values: OK;
- no asset mutation: OK;
- worktree schoon: OK;
- blockers: geen.

## Niet toegestaan en niet gebouwd

Fase 14 is geen renderer en bouwde niet:

- volledige 3D renderer;
- GLB asset loading;
- texture/audio loading;
- definitive GLB role mapping;
- asset-loader node;
- renderer node;
- gameplay node;
- concrete gamewereld;
- dummy world, NPC, quest of economy;
- renderer scene draw calls;
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

Toegevoegd of bijgewerkt in de Fase 14 Git-basis:

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

Docs-final wijzigde alleen statusdocumentatie.

## Fasebeoordeling

Git-basis klaar: ja.

Server-side klaar: ja.

Fase 14 formeel afgerond: ja.

Fase 15 geimplementeerd: nee.
