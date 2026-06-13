# Current Phase

## Fase

Actieve status: Fase 13 Runtime Render Surface Core is geopend en de Git-basis is toegevoegd op `main`.

Fase 1 t/m Fase 12.1 zijn afgerond. Fase 12 Runtime Client Shell Core is server-side groen bevestigd via commit `61792b7e6b923add68fdebd80f673dfdd86210ff` (`fix: verify phase 12 runtime client shell core`). Fase 12.1 Game Web Service Deployment Core is server-side groen bevestigd op Git HEAD `70808b7ac2aa50671fbf4369ef1158a5e5f13736` (`fase 12.1 definitieve Node 22 game-shell`).

Fase 13 is nu de actieve open fase. Server-side verificatie door Codex/Claude is nog nodig. Fase 14 is nog niet geopend.

## Statussamenvatting

Fase 13 voegt een veilige runtime render-surface laag toe aan de bestaande game-web runtime client shell. De laag biedt:

- render surface contracts;
- renderer lifecycle/status model;
- render capability flags;
- canvas/render host in de game shell;
- WebGL/canvas capability probe zonder scene/content te renderen;
- safe empty render state;
- render-surface browser-smoke marker;
- node/socket contracts voor runtime render surface, status, capability, lifecycle en safety flags;
- tests en docs voor no-content/no-asset/no-gameplay boundaries.

De render surface is geen volledige renderer en geen projection-driven scene assembly. Deze fase laadt geen GLB, textures, audio of UI assets en toont geen concrete gamecontent.

## Afgeronde basis

Fase 10 Publish Flow Core is server-side afgerond en klaar. Laatste Fase 10 server-side verificatie/fix commit: `cfdc25e03c922904a3628921a7e6fc6c24cf2bf6` (`fix phase 10 server-side verification`).

Fase 11 Runtime Projection Core is server-side afgerond en klaar. Laatste Fase 11 docs-final commit: `2a2b779afe3a3a2f28466fa7a49f0be45d12ee17` (`fase 11 fix`). Browser smoke en ops/docs-hardening staan op `main` via commit `346533a98e6786e741fded8bcc5af4177e3cfd36`.

Fase 12 Runtime Client Shell Core is server-side afgerond en klaar. Server-side fix commit: `61792b7e6b923add68fdebd80f673dfdd86210ff` (`fix: verify phase 12 runtime client shell core`). Docs-final/fix commit: `199df8642cfa6f20ce518742a0ea0e35ec5fb2fe` (`fase 12 fix`).

Fase 12.1 Game Web Service Deployment Core is server-side afgerond en klaar. Server-side bevestigde Git HEAD: `70808b7ac2aa50671fbf4369ef1158a5e5f13736` (`fase 12.1 definitieve Node 22 game-shell`).

Asset refresh na `Assets - new` blijft bevestigd:

- GLB=4;
- UI images=37;
- audio files=21;
- invalid=0;
- missing=0;
- `assetsCopiedToGit=false`;
- `publishesRuntimeOutput=false`;
- `assignsDefinitiveRuntimeRoles=false`.

## Fase 13 Git-basis

Toegevoegd of bijgewerkt:

- `packages/schemas/src/runtime-render-surface.ts`;
- `packages/schemas/src/runtime-render-surface-validation.ts`;
- runtime render socket types in `packages/schemas/src/node-graph.ts`;
- `packages/node-types/src/runtime-render-surface-nodes.ts`;
- `apps/game-web/src/runtime-render-surface.ts`;
- Fase 13 render surface UI/marker in `apps/game-web/src/runtime-client-shell.ts`;
- Fase 13 health/shell JSON contract in `apps/game-web/src/http-server.ts`;
- browser-smoke render surface checks in `tests/smoke/browser-smoke.mjs`;
- `tests/phase13-runtime-render-surface.test.mjs`;
- `README/fase13.md` en statusdocs.

## Runtime render surface contract

Safety flags bewaken minimaal:

- `createsRenderSurface=true`;
- `consumesRuntimeProjectionMetadata=true`;
- `loadsAssets=false`;
- `rendersConcreteWorld=false`;
- `implementsGameplay=false`;
- `implementsMovement=false`;
- `implementsCombat=false`;
- `implementsAudioPlayback=false`;
- `hardcodesCamera=false`;
- `hardcodesLighting=false`;
- `hardcodesHud=false`;
- `hardcodesMinimap=false`;
- `hardcodesContent=false`;
- `mutatesAssets=false`;
- `usesEditorDraftData=false`;
- `usesEditorAdminRoutes=false`.

Validatie bewaakt:

- alleen runtime projection metadata/read-only routes;
- geen editor/admin routes;
- geen editor draft/candidate leakage;
- geen asset load requests;
- geen concrete world/entity/NPC/quest/economy payload;
- geen hardcoded camera/light/HUD/minimap/audio values;
- geen gameplay/movement/combat/audio playback;
- geldige safe empty render state;
- lifecycle states `booting`, `ready`, `empty` en `error`.

## Browser-smoke contract

Game browser-smoke controleert vanaf Fase 13:

- game shell bereikbaar via local origin of front-door;
- runtime shell marker `data-runtime-client-shell="phase-12"`;
- render surface marker `data-runtime-render-surface="phase-13"`;
- render surface safe empty state;
- console/page errors count;
- geen editor/admin route usage;
- geen Fase 13 asset load requests;
- geen screenshots/traces tenzij expliciet via env aangezet.

## Contractgrenzen

Fase 13 bouwt niet:

- volledige 3D renderer;
- projection-driven scene assembly;
- concrete gamewereld;
- GLB loader of definitive GLB role mapping;
- runtime gameplay;
- movement;
- combat;
- player controller;
- HUD runtime layout;
- minimap runtime layout;
- audio playback;
- concrete world, zone, NPC, quest, economy, camera, lighting, minimap, HUD of audio content;
- automatic publish of automatic projection.

## Server-side checks open

Codex/Claude moet server-side nog bevestigen:

- start HEAD/eind HEAD;
- `pnpm build`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm lint`;
- `gk-api` active/enabled;
- `gk-editor-web` active/enabled;
- `gk-game-web` active/enabled;
- Node 22 process OK;
- local game-web route smokes voor `/health/game`, `/game/shell.json`, `/runtime/projection/status`, `/runtime/projection/manifest` en `/runtime/projection/records`;
- Apache/front-door `/game/` smoke;
- `pnpm smoke:browser:game`;
- `pnpm smoke:browser`;
- runtime shell marker OK;
- render surface marker OK;
- safe empty render state OK;
- no editor/admin route usage OK;
- no draft leakage OK;
- no GLB loading/asset requests OK;
- no concrete gamecontent OK;
- no renderer scene assembly OK;
- no gameplay/movement/combat/audio playback OK;
- no hardcoded HUD/minimap/world/camera/light/audio values OK;
- no asset mutation OK;
- GameBible save/protection OK;
- worktree schoon;
- blockers.

## Fasebeoordeling

Fase 13 Runtime Render Surface Core Git-basis is toegevoegd.

Fase 13 is server-side nog niet klaar. Markeer Fase 13 pas als afgerond nadat Codex/Claude build/typecheck/test/lint, live smokes, browser smoke en docs-final groen bevestigt.

Fase 14 is nog niet geopend.
