# Current Phase

## Fase

Actieve status: Fase 14 Projection-driven Scene Assembly Core is server-side groen bevestigd en formeel afgerond.

Fase 1 t/m Fase 14 zijn afgerond. Fase 12 Runtime Client Shell Core is server-side groen bevestigd via commit `61792b7e6b923add68fdebd80f673dfdd86210ff` (`fix: verify phase 12 runtime client shell core`). Fase 12.1 Game Web Service Deployment Core is server-side groen bevestigd op Git HEAD `70808b7ac2aa50671fbf4369ef1158a5e5f13736` (`fase 12.1 definitieve Node 22 game-shell`). Fase 13 Runtime Render Surface Core is server-side groen bevestigd via commit `192645f7c33dfc6f800f566784794f6e1111310a` (`fix: verify phase 13 runtime render surface core`) en formeel afgerond. Fase 14 Projection-driven Scene Assembly Core is server-side groen bevestigd via commit `1b583b7f769690c3f7e7a98c41b4dd1937853519` (`fase 14 fix`) en formeel afgerond.

Fase 15 is nog niet geopend of geimplementeerd.

Volgende stap: Kevin mag Fase 15 openen.

## Statussamenvatting

Fase 14 bouwde een veilige data-driven scene assembly laag tussen Runtime Render Surface Core en latere renderer/gameplay fases. De laag zet runtime projection read-model records om naar neutrale scene-plan metadata.

Toegevoegd of bijgewerkt:

- `packages/schemas/src/runtime-scene-assembly.ts`;
- `packages/schemas/src/runtime-scene-assembly-validation.ts`;
- runtime scene assembly socket types in `packages/schemas/src/node-graph.ts`;
- `packages/node-types/src/runtime-scene-assembly-nodes.ts`;
- `apps/game-web/src/runtime-scene-assembly.ts`;
- Fase 14 scene assembly UI/marker in `apps/game-web/src/runtime-client-shell.ts`;
- Fase 14 health/shell JSON contract in `apps/game-web/src/http-server.ts`;
- browser-smoke scene assembly checks in `tests/smoke/browser-smoke.mjs`;
- `tests/phase14-runtime-scene-assembly.test.mjs`;
- `README/fase14.md` en statusdocs.

Fase 14 voegde alleen projection-driven scene assembly metadata/scene-plan contracts toe. Fase 14 is geen renderer.

## Runtime scene assembly contract

Safety flags bewaken minimaal:

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

Validatie bewaakt:

- alleen runtime projection read-only records als bron;
- geen editor/admin routes;
- geen editor draft/candidate leakage;
- geen asset-load requests;
- geen GLB/texture/audio load;
- geen definitive role mapping;
- geen concrete NPC/quest/economy/world hardcoding;
- geen hardcoded camera/light/HUD/minimap/audio values;
- geen renderer scene draw calls;
- geen gameplay/movement/combat/audio playback;
- geldige empty scene plan status.

## Browser-smoke contract

Game browser-smoke controleert vanaf Fase 14:

- game shell bereikbaar via local origin of front-door;
- runtime shell marker `data-runtime-client-shell="phase-12"`;
- render surface marker `data-runtime-render-surface="phase-13"`;
- scene assembly marker `data-runtime-scene-assembly="phase-14"`;
- empty scene plan marker;
- console/page errors count;
- geen editor/admin route usage;
- geen asset/GLB/audio requests door Fase 14;
- geen screenshots/traces tenzij expliciet via env aangezet.

Server-side is bevestigd dat de game-smoke groen is en niet wordt overgeslagen.

## Server-side bevestigd

Codex/Claude heeft Fase 14 server-side groen bevestigd:

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

De minimale server-side fix commit was `1b583b7f769690c3f7e7a98c41b4dd1937853519` (`fase 14 fix`). Die paste alleen `scripts/check-workspace-boundaries.mjs` aan om `packages/schemas/src/runtime-scene-assembly.ts` toe te staan als groot bronbestand. Er was geen inhoudelijke Fase 14 runtimewijziging.

## Contractgrenzen

Fase 14 bouwde niet:

- volledige 3D renderer;
- GLB loader of texture/audio loader;
- definitive GLB of asset role mapping;
- concrete gamewereld;
- dummy world, NPC, quest of economy;
- renderer scene draw calls;
- gameplay, movement, combat of player runtime;
- audio playback;
- HUD/minimap runtime layout;
- hardcoded world/camera/light/fog/sky/minimap/HUD/audio values;
- automatic publish of automatic projection;
- editor draft/candidate runtimegebruik;
- assetmutatie;
- Fase 15.

## Fasebeoordeling

Fase 14 Git-basis klaar: ja.

Fase 14 server-side klaar: ja.

Fase 14 formeel afgerond: ja.

Fase 15 geimplementeerd: nee.
