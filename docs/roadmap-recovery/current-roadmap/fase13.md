# Fase 13 - Runtime Render Surface Core

Fase 13 is server-side groen bevestigd en formeel afgerond.

Git-basis: toegevoegd op `main`.

Server-side status: klaar. Codex/Claude heeft build/typecheck/test/lint, live route-smokes, browser-smokes en Fase 13 safety checks groen bevestigd via commit `192645f7c33dfc6f800f566784794f6e1111310a` (`fix: verify phase 13 runtime render surface core`).

Fase 1 t/m Fase 13 zijn afgerond. Fase 14 is nog niet geopend of geimplementeerd.

## Doel

Fase 13 voegde een veilige render-surface laag toe aan de runtime client shell, zodat de game-web client een canvas/render host, renderer lifecycle state en capability checks heeft.

De pipeline blijft:

```text
Database / Editor / Node-system
  -> Publish Flow Core
  -> Runtime Projection Core
  -> Runtime Client Shell Core
  -> Game Web Service Deployment Core
  -> Runtime Render Surface Core
  -> latere Projection-driven Scene Assembly / Gameplay / HUD / Audio fases
```

Fase 13 is alleen de generieke render-oppervlakte en lifecycle-basis. Deze fase bouwde geen volledige renderer, geen scene assembly, geen gameplay, geen HUD/minimap runtime en geen audio playback.

## Vaste grenzen

Niet toegevoegd in Fase 13:

- volledige 3D renderer;
- concrete gamewereld rendering;
- GLB loading;
- definitive GLB role mapping;
- dummy world, NPC, quests of economy;
- gameplay, movement, combat of player runtime;
- audio playback;
- HUD/minimap runtime layout;
- hardcoded camera values;
- hardcoded lighting/fog/sky presets;
- hardcoded world map, zones of spawn routes;
- asset toevoeging, wijziging, verwijdering of kopie;
- automatic publish/projection;
- editor draft/candidate data direct in runtime;
- secrets;
- Fase 14 implementatie.

## Toegevoegde Git-basis

### Runtime render surface contracts

Toegevoegd:

- `RuntimeRenderSurfaceStatus`;
- `RuntimeRenderSurfaceState`;
- `RuntimeRenderSurfaceCapabilities`;
- `RuntimeRenderSurfaceSafetyFlags`;
- `RuntimeRenderSurfaceErrorState`;
- `RuntimeRenderLifecycleState`.

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
- `usesEditorDraftData=false`.

### Runtime render validation gates

Toegevoegd voor:

- runtime projection metadata/read-only route discipline;
- no editor/admin routes;
- no editor draft/candidate leakage;
- no asset load requests;
- no concrete world/entity/NPC/quest/economy payload;
- no hardcoded camera/light/HUD/minimap/audio values;
- no gameplay/movement/combat/audio playback;
- safe empty render state;
- lifecycle states `booting`, `ready`, `empty` en `error`;
- safety flags.

De server-side fix commit heeft de interne Fase 13 asset-load veldnamen aangescherpt naar `assetLoadUrls` en `no-asset-loads`, zodat de bestaande Fase 12 safety-test geen false positives meer geeft.

### Game-web render surface UI

Toegevoegd in de Fase 12 game shell:

- canvas/render host container;
- marker `data-runtime-render-surface="phase-13"`;
- safe empty render state;
- render lifecycle status;
- capability flag display;
- client-side canvas/WebGL/WebGL2 capability probe;
- no-projection/no-renderable-payload empty state.

De UI laadt geen GLB, textures, audio of concrete gamecontent.

### Runtime render surface helper

Toegevoegd:

- `apps/game-web/src/runtime-render-surface.ts`;
- lifecycle/safety/capability helper;
- render-surface HTML section;
- browser-side capability probe zonder scene/rendering;
- metadata-only contract dat alleen runtime projection read-only routes kent.

### Node/socket contracts

Toegevoegd:

- `runtime.render.surface.reference`;
- `runtime.render.status.reference`;
- `runtime.render.capability.reference`;
- `runtime.render.lifecycle.reference`;
- `runtime.render.safety.reference`.

Toegevoegde node types:

- `gk.runtimeRender.surface`;
- `gk.runtimeRender.status`;
- `gk.runtimeRender.capability`;
- `gk.runtimeRender.lifecycle`;
- `gk.runtimeRender.safetyFlags`.

Deze nodes hebben scope `runtime-consumer`, maken geen concrete gamecontent, laden geen assets en bouwen geen gameplay/rendered-world nodes.

### Browser smoke uitbreiding

`tests/smoke/browser-smoke.mjs` controleert voor game-smoke:

- game shell bereikbaar via front-door/local origin;
- runtime shell marker bestaat;
- render surface marker bestaat;
- render surface safe empty state zichtbaar is;
- console/page errors count OK;
- geen editor/admin route usage;
- geen Fase 13 asset load requests;
- geen screenshots/traces standaard.

### Tests

Toegevoegd:

- `tests/phase13-runtime-render-surface.test.mjs`.

De tests bewaken minimaal:

- schema exports;
- lifecycle states;
- render surface sockets/nodes;
- safety flags;
- safe empty render state;
- geen editor/admin routes;
- geen editor draft/candidate data;
- geen asset load requests;
- geen concrete gamecontent;
- no GLB load;
- no renderer scene assembly;
- no gameplay;
- no movement/combat;
- no audio playback;
- no hardcoded camera/light/HUD/minimap/audio values;
- no asset mutation;
- game shell render surface marker;
- browser-smoke render surface hook.

## Server-side bevestigd

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK;
- `pnpm lint`: OK;
- `gk-api` active/enabled: OK;
- `gk-editor-web` active/enabled: OK;
- `gk-game-web` active/enabled: OK;
- Node 22 process check via `/opt/gk/node-v22/bin/node`: OK;
- local route-smokes op `127.0.0.1:3003`: OK;
- Apache/front-door smokes: OK;
- `pnpm smoke:browser:game`: OK;
- `pnpm smoke:browser:editor`: OK;
- `pnpm smoke:browser`: OK;
- runtime shell marker: OK;
- render surface marker: OK;
- safe empty render state: OK;
- no editor/admin route usage: OK;
- no editor draft/candidate leakage: OK;
- no GLB loading: OK;
- no asset load requests: OK;
- no concrete gamecontent: OK;
- no full 3D renderer: OK;
- no projection-driven scene assembly: OK;
- no gameplay/movement/combat/audio playback: OK;
- no hardcoded HUD/minimap/world/camera/light/audio values: OK;
- no asset mutation: OK;
- worktree schoon: OK;
- blockers: geen.

## Checklist

- [x] Fase 13 geopend.
- [x] Runtime render surface schemas/contracts toegevoegd.
- [x] Runtime render validation gates toegevoegd.
- [x] Runtime render sockets/nodes toegevoegd.
- [x] Game shell render surface UI/marker toegevoegd.
- [x] Runtime render lifecycle/capability helper toegevoegd.
- [x] Browser-smoke render surface checks toegevoegd.
- [x] Tests toegevoegd.
- [x] Docs bijgewerkt.
- [x] Geen assets gewijzigd.
- [x] Geen concrete gamecontent toegevoegd.
- [x] Geen GLB loading of definitive GLB role mapping gebouwd.
- [x] Geen volledige 3D renderer of scene assembly gebouwd.
- [x] Geen gameplay/movement/combat/audio playback gebouwd.
- [x] Geen hardcoded world/camera/light/minimap/HUD/audio values toegevoegd.
- [x] Server-side build bevestigd.
- [x] Server-side typecheck bevestigd.
- [x] Server-side test bevestigd.
- [x] Server-side lint bevestigd.
- [x] Live route smokes bevestigd.
- [x] Browser smoke bevestigd.
- [x] Docs-final bevestigd.

## Fasebeoordeling

Fase 13 Runtime Render Surface Core is formeel klaar.

Fase 14 is nog niet geopend of geimplementeerd. Volgende stap: Kevin mag de volgende fase openen.
