# Current Phase

## Fase

Actieve status: Fase 19 Quest authoring publish bridge heeft een Git-basis op `main`, maar is nog niet server-side geverifieerd of formeel afgerond. Fase 18 Generieke quest- en dialoogslice is server-side groen geverifieerd en formeel afgerond als generieke non-visual blocked quest-slice contractlaag.

Fase 1 t/m Fase 18 zijn afgerond. Fase 14 Projection-driven Scene Assembly Core is server-side groen bevestigd via commit `1b583b7f769690c3f7e7a98c41b4dd1937853519` (`fase 14 fix`) en formeel afgerond. Fase 15 Runtime Asset Reference Planning Core is server-side groen bevestigd na commit `b8b4c39f76f1fc778f7af8dd51b3cffdc6d3497d` (`fase 15 fix`) en formeel afgerond. Fase 16 Fundering en herbaseline is afgerond. Fase 17 Runtime Game Core is server-side groen bevestigd op HEAD `8ebbcf4` en formeel afgerond. Fase 18 is server-side groen bevestigd en formeel afgerond.

## Fase 18 server-side afgerond

Groen bevestigd:

- `pnpm lint`;
- `pnpm test`;
- `pnpm build`;
- `pnpm typecheck`;
- lokale route-smokes voor `/health/game`, `/game/` en `/game/shell.json`;
- Apache/front-door game route-smokes;
- `pnpm smoke:browser:game`;
- `pnpm smoke:browser`;
- asset load requests: 0;
- console errors count: 0;
- page errors count: 0.

Runtime bewijs:

- `/health/game` meldt `runtimeQuestSlice:"phase-18"`;
- `/game/` bevat `data-runtime-quest-slice="phase-18"`;
- `/game/shell.json` bevat `runtimeQuestSlice` en `runtimeQuestSliceContract`;
- `usesEditorAdminRoutes:false`;
- `usesEditorDraftData:false`;
- `hardcodesQuestContent:false`;
- `loadsAssets:false`;
- `fetchesAssetBytes:false`;
- `resolvesFinalAssetRoles:false`;
- `supportsNonVisualBlockedSlice:true`;
- `blockedByUnresolvedAssetRoles:true` in default blocked state;
- geen `/assets` byte requests, GLB/texture/audio loads of renderer draw calls;
- geen concrete Quest 00-contentwaarden in runtimecode;
- geen testfixture content in runtime output.

## Fase 19 Git-basis geopend

Fase 19 is de generieke Quest authoring publish bridge. Deze fase maakt concrete questinhoud later authorable via node-data/editor-data en publish-flow, zonder runtime hardcoding.

Gebouwd:

- `packages/schemas/src/quest-authoring.ts`
- `packages/schemas/src/quest-authoring-validation.ts`
- `packages/node-types/src/quest-authoring-nodes.ts`
- Fase 19 socket types in `packages/schemas/src/node-graph.ts`
- Fase 19 exports in `packages/schemas/src/index.ts`
- Fase 19 node registry in `packages/node-types/src/index.ts`
- `tests/phase19-quest-authoring-publish-bridge.test.mjs`
- `docs/fases/fase-19-quest-authoring-publish-bridge.md`

Fase 19 contract:

- quest/dialogue/objective/interactable/reward/unlock/checkpoint/asset-role content leeft in editor/node-data;
- publish bridge emit normalized runtime projection record references;
- runtime payload blijft buiten deze records;
- runtime fallbackcontent is verboden;
- dummy published data is verboden;
- asset byte loading en final asset-role resolving zijn verboden;
- Quest 00 wordt nog niet als echte node-data ingevoerd.

## Server-side verificatie open

Fase 19 mag pas formeel dicht na server-side groen:

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm typecheck`
- `/health/game`
- `/game/`
- `/game/shell.json`
- `pnpm smoke:browser:game`
- `pnpm smoke:browser`

## Fasebeoordeling

Fase 15 formeel afgerond: ja.

Fase 16 formeel afgerond: ja.

Fase 17 formeel afgerond: ja.

Fase 18 generieke codebasis geopend: ja.

Fase 18 server-side verificatie klaar: ja.

Fase 18 volledige playable Quest 00 klaar: nee.

Fase 18 formeel afgerond: ja.

Fase 19 Git-basis geopend: ja.

Fase 19 server-side verificatie klaar: nee.

Fase 19 formeel afgerond: nee.