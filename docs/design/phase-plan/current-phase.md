# Current Phase

## Fase

Actieve status: Fase 18 Generieke quest- en dialoogslice is server-side groen geverifieerd en formeel afgerond als generieke non-visual blocked quest-slice contractlaag. Fase 19 is nog niet geopend.

Fase 1 t/m Fase 17 zijn afgerond. Fase 14 Projection-driven Scene Assembly Core is server-side groen bevestigd via commit `1b583b7f769690c3f7e7a98c41b4dd1937853519` (`fase 14 fix`) en formeel afgerond. Fase 15 Runtime Asset Reference Planning Core is server-side groen bevestigd na commit `b8b4c39f76f1fc778f7af8dd51b3cffdc6d3497d` (`fase 15 fix`) en formeel afgerond. Fase 16 Fundering en herbaseline is afgerond. Fase 17 Runtime Game Core is server-side groen bevestigd op HEAD `8ebbcf4` en formeel afgerond.

## Fase 18 server-side verificatie afgerond

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

## Fase 18 code-slice afgerond

Kevin heeft verduidelijkt dat Fase 18 eerst alleen generieke quest/dialogue/objective/interactable/reward/unlock/checkpoint/asset-role infrastructuur bouwt. Quest 00 zelf is later node-data/editor-data en mag niet in runtimecode of als runtime fallback worden geplaatst.

Gebouwd:

- `packages/schemas/src/runtime-quest-slice.ts`
- `packages/schemas/src/runtime-quest-slice-validation.ts`
- `packages/node-types/src/runtime-quest-slice-nodes.ts`
- `apps/game-web/src/runtime-quest-slice.ts`
- Fase 18 socket types in `packages/schemas/src/node-graph.ts`
- Fase 18 record types in `packages/schemas/src/runtime-projection.ts`
- Fase 18 exports in `packages/schemas/src/index.ts` en `packages/node-types/src/index.ts`
- Fase 18 health/shell-json hooks in `apps/game-web/src/http-server.ts`
- Fase 18 shell rendering in `apps/game-web/src/runtime-client-shell.ts`
- `tests/phase18-runtime-quest-slice.test.mjs`
- `tests/smoke/runtime-quest-slice-smoke.mjs`

Fase 18 hard gates:

- Runtime consumeert alleen published read-model contracts.
- Concrete questcontent komt via editor/node-data en publish-flow.
- Testfixtures mogen niet als runtime fallback of gamecontent dienen.
- Geen dummy assets.
- Geen dummy published data.
- Geen hardcoded dialogue, objective, reward, unlock, checkpoint of asset-role content.
- Unresolved asset roles blijven visible blockers.

## Fase 18 afsluiting

Fase 18 is formeel afgerond als generieke non-visual blocked quest-slice contractlaag. De runtime blijft bewust non-visual blocked zolang latere published node/editor-data en asset-role mapping ontbreken; dat is de juiste eindstatus voor deze fase.

## Fasebeoordeling

Fase 15 formeel afgerond: ja.

Fase 16 formeel afgerond: ja.

Fase 17 Git-basis klaar: ja.

Fase 17 server-side verificatie klaar: ja.

Fase 17 formeel afgerond: ja.

Fase 18 generieke codebasis geopend: ja.

Fase 18 server-side verificatie klaar: ja.

Fase 18 volledige playable Quest 00 klaar: nee.

Fase 18 formeel afgerond: ja.

Fase 19 geopend: nee.
