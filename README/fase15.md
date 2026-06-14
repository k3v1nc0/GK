# Fase 15 - Runtime Asset Reference Planning Core

## Status

Fase 15 Runtime Asset Reference Planning Core is server-side groen bevestigd en formeel afgerond op 2026-06-14.

Fase 1 t/m Fase 15 zijn afgerond. Fase 16 Fundering en herbaseline is daarna als documentatie- en roadmapfase verwerkt. Fase 17 Runtime Game Core is nog niet geopend of geimplementeerd.

Server-side bewijs:

- `pnpm build`: groen;
- `pnpm typecheck`: groen;
- `pnpm test`: groen;
- `pnpm lint`: groen;
- `pnpm smoke:browser:game`: groen;
- `pnpm smoke:browser:editor`: groen;
- `pnpm smoke:browser`: groen;
- lokale route-smokes: groen;
- Apache/front-door smokes: groen;
- `gk-api`, `gk-editor-web` en `gk-game-web`: actief en enabled;
- `GET /health/editor` en `GET /health/game`: groen;
- game shell en `/game/shell.json`: Fase 15 metadata-only asset reference planning bevestigd;
- workspace-boundary drift opgelost via commit `b8b4c39f76f1fc778f7af8dd51b3cffdc6d3497d` (`fase 15 fix`);
- werktree schoon na server-side verificatie.

## Doel

Fase 15 voegt een veilige asset-reference planninglaag toe bovenop Fase 14 scene assembly. De laag mag scene-plan descriptors koppelen aan generieke asset-reference metadata/candidates, maar mag nog geen assets laden, downloaden, renderen, afspelen of definitief mappen.

De keten blijft:

```text
Database / Editor / Node-system
  -> Publish Flow Core
  -> Runtime Projection Core
  -> Runtime Client Shell Core
  -> Game Web Service Deployment Core
  -> Runtime Render Surface Core
  -> Projection-driven Scene Assembly Core
  -> Runtime Asset Reference Planning Core
  -> latere Asset Loading / Renderer / Gameplay / HUD / Audio fases
```

## Toegevoegd

Fase 15 voegt alleen runtime asset-reference planning metadata toe:

- Runtime asset reference planning contracts.
- Asset reference plan/read-model contracts.
- Asset reference candidate metadata contracts.
- Asset reference planning lifecycle/status.
- Asset reference safety flags.
- Scene-plan-to-asset-reference validation.
- Empty asset reference plan wanneer er geen scene descriptors zijn.
- Asset reference planning statuszone in de game shell.
- Marker `data-runtime-asset-reference-planning="phase-15"`.
- Node/socket contracts voor asset reference source, status, plan, descriptor, candidate en safety flags.
- Browser-smoke check voor asset reference planning marker en empty asset reference plan.
- Tests voor no-asset-load/no-final-role/no-render/no-gameplay boundaries.

## Contracten

Schema's:

- `RuntimeAssetReferencePlanningStatus`;
- `RuntimeAssetReferencePlanningState`;
- `RuntimeAssetReferencePlan`;
- `RuntimeAssetReferenceDescriptor`;
- `RuntimeAssetReferenceCandidate`;
- `RuntimeAssetReferenceSource`;
- `RuntimeAssetReferenceErrorState`;
- `RuntimeAssetReferenceSafetyFlags`.

Safety flags:

- `consumesRuntimeScenePlan=true`;
- `producesAssetReferencePlan=true`;
- `usesAssetMetadataOnly=true`;
- `loadsAssets=false`;
- `fetchesAssetBytes=false`;
- `resolvesFinalAssetRoles=false`;
- `rendersScene=false`;
- `rendererDrawCalls=false`;
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

## Asset reference plan regels

- Als scene plan leeg is, is een empty asset reference plan geldig.
- Als scene descriptors bestaan, mag Fase 15 alleen generieke reference descriptors en metadata-only candidates maken.
- Reference descriptors en candidates mogen geen asset bytes, asset-load URL, final asset role, concrete asset-library binding, renderer instruction of concrete payload bevatten.
- Fase 15 kiest geen definitive GLB/asset role mapping.
- Fase 15 maakt geen hardcoded fallback zoals default model, test texture of dummy object.

## Server-side verificatie afgerond

Fase 15 is afgerond na Codex server-side bevestiging van:

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

## Niet toegestaan en niet gebouwd

Fase 15 is geen asset loader en bouwt niet:

- asset loading;
- GLB loading;
- texture/audio loading;
- asset byte fetch;
- definitive GLB role mapping;
- definitive asset role mapping;
- asset-loader node;
- renderer node;
- gameplay node;
- volledige renderer;
- renderer scene draw calls;
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
- Fase 16 runtimecode.

## Bestanden

Toegevoegd of bijgewerkt in de Fase 15 Git-basis:

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
- status-, design- en ops-documentatie.

## Fasebeoordeling

Git-basis klaar: ja.

Server-side klaar: ja.

Fase 15 formeel afgerond: ja.

Fase 16 herbaseline verwerkt: ja.

Fase 17 geimplementeerd: nee.