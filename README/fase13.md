# Fase 13 - Runtime Render Surface Core

Fase 13 is door Kevin geopend.

Git-basis: toegevoegd op `main`.

Server-side status: nog niet klaar. Codex/Claude moet build/typecheck/test/lint, live route-smokes, browser-smoke en Fase 13 safety checks server-side uitvoeren voordat Fase 13 als afgerond mag worden gemarkeerd.

Fase 1 t/m Fase 12.1 zijn afgerond. Fase 14 is nog niet geopend.

## Doel

Fase 13 voegt een veilige render-surface laag toe aan de runtime client shell, zodat de game-web client een canvas/render host, renderer lifecycle state en capability checks heeft.

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

Fase 13 is alleen de generieke render-oppervlakte en lifecycle-basis. Deze fase bouwt geen volledige renderer, geen scene assembly, geen gameplay, geen HUD/minimap runtime en geen audio playback.

## Vaste grenzen

Niet toegestaan en niet toegevoegd in Fase 13:

- volledige 3D renderer bouwen;
- concrete gamewereld renderen;
- GLB assets laden;
- definitive GLB role mapping maken;
- dummy world, NPC, quests of economy toevoegen;
- gameplay, movement, combat of player runtime bouwen;
- audio playback bouwen;
- HUD/minimap runtime layout hardcoden;
- camera values hardcoden;
- lighting/fog/sky presets hardcoden;
- world map, zones of spawn routes hardcoden;
- assets toevoegen, wijzigen, verwijderen of kopieren;
- automatic publish/projection;
- editor draft/candidate data direct in runtime tonen;
- secrets toevoegen;
- Fase 14 openen of implementeren.

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

`tests/smoke/browser-smoke.mjs` controleert nu voor game-smoke:

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

## Open Codex/Claude server-side taken

Nog server-side uitvoeren en rapporteren:

1. start HEAD en eind HEAD vastleggen.
2. `pnpm build`.
3. `pnpm typecheck`.
4. `pnpm test`.
5. `pnpm lint`.
6. `gk-api`, `gk-editor-web` en `gk-game-web` active/enabled bevestigen.
7. Node 22 process check via `/opt/gk/node-v22/bin/node`.
8. `curl http://127.0.0.1:3003/health/game`.
9. `curl http://127.0.0.1:3003/game/shell.json`.
10. `curl http://127.0.0.1:3003/runtime/projection/status`.
11. `curl http://127.0.0.1:3003/runtime/projection/manifest`.
12. `curl http://127.0.0.1:3003/runtime/projection/records`.
13. Apache/front-door `/game/` smoke bevestigen.
14. `pnpm smoke:browser:game`.
15. `pnpm smoke:browser`.
16. runtime shell marker bevestigen.
17. render surface marker bevestigen.
18. safe empty render state bevestigen.
19. no editor/admin route usage bevestigen.
20. no draft leakage bevestigen.
21. no GLB loading of asset requests bevestigen.
22. no concrete gamecontent bevestigen.
23. no renderer scene assembly bevestigen.
24. no gameplay/movement/combat/audio playback bevestigen.
25. no hardcoded HUD/minimap/world/camera/light/audio values bevestigen.
26. no asset mutation bevestigen.
27. GameBible save/protection bevestigen.
28. worktree schoon bevestigen.
29. blockers rapporteren.

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
- [ ] Server-side build bevestigd.
- [ ] Server-side typecheck bevestigd.
- [ ] Server-side test bevestigd.
- [ ] Server-side lint bevestigd.
- [ ] Live route smokes bevestigd.
- [ ] Browser smoke bevestigd.
- [ ] Docs-final bevestigd.

## Fasebeoordeling

Fase 13 Git-basis is toegevoegd.

Fase 13 is server-side nog niet klaar. Markeer Fase 13 pas als afgerond nadat Codex/Claude build/typecheck/test/lint, live route-smokes, browser smoke, safety checks en docs-final groen bevestigt.

Fase 14 is nog niet geopend.
