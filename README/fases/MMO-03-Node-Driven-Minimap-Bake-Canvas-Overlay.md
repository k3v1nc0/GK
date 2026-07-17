# MMO-03 Node-Driven Minimap: Bake Image + 2D Live Canvas Markers + Editor Minimap

## Richting

Geen live tweede 3D minimap-camera in `/game/`. De minimap is een eenmalig gebakken top-down image (webp/png), opgeslagen op de server en gekoppeld aan node values. `/game/` en de editor tekenen daar bovenop een 2D canvas met live markers uit bestaande runtime/MMO/player state. Alles loopt via nodes, editor-data, Save Draft/Save To Game en de published runtime — geen hardcoded gamecontent, geen losse JSON-eilandjes, geen nieuwe MMO-only WebSocket events.

Character select is bewust buiten scope; dat schuift door naar een latere MMO-fase.

## Gewijzigde/nieuwe bestanden

- `src/shared/node-types.js` — `minimap` dataType, `minimap_bake`/`game_minimap_hud`/`editor_minimap_hud` node types, Game Output `minimap` input.
- `apps/web/public/shared/node-types.js` — browser-subset `DATA_TYPE_COLORS`/`MULTI_VALUE_TYPES` in sync.
- `src/server/publish-service.js` — minimap read-model builders (`buildMinimapBakeReadModel`, `buildGameMinimapHudReadModel`, `buildEditorMinimapHudReadModel`, `collectMinimapReadModel`), wiring in `buildWorldFromGraph`, validatieregels in `validateGraphForPublish`.
- `src/server/asset-service.js` — `AssetService.saveMinimapBake()`: valideert/bewaart de gebakken image onder `assets/minimap-bakes/` en patcht de node values.
- `src/server/server.js` — nieuwe route `POST /api/editor/minimap-bakes`.
- `apps/web/public/shared/world-runtime.js` — `bakeMinimapImage()` (tijdelijke orthographic camera + WebGLRenderTarget, one-shot render) en `getMinimapMarkerSnapshot()` op de runtime-API.
- `apps/web/public/shared/minimap-utils.js` (nieuw) — `worldToMinimapPoint`/`resolveMinimapPoint`/`clampMinimapPoint` en canvas marker-tekenhelpers (triangle/dot/diamond/square/cross/star/label/viewport cone), gedeeld door editor en game.
- `apps/web/public/editor/editor.js` + `index.html` + `styles.css` — inspector bake-knop voor `minimap_bake`, `editorMinimapRoot` overlay in de viewport, redraw-hooks op transform/selectie/wereld-refresh + lichte poll voor camera-orbit.
- `apps/web/public/game/game.js` + `index.html` + `styles.css` — `game_minimap_hud` DOM in `#hud`, throttled canvas draw-loop in de bestaande remote-rAF-loop, markers uit bestaande `state.remote.players`/`state.predictedPosition`/`state.gameWorld`.
- `scripts/smoke-test.js` — schema/read-model/validatie/upload-endpoint dekking.

## Nieuwe route

`POST /api/editor/minimap-bakes` (editor-auth vereist via `authService.requireEditor`)

Multipart/form-data velden: `nodeId`, `minimapId`, `worldHash`, `resolution`, `width`, `height`, `format`, `bounds` (JSON string), `file` (webp/png blob, max 3MB).

Server:
1. Controleert sessie/editor-auth.
2. Zoekt de node op via de graph en eist `type === "minimap_bake"`.
3. Valideert bestandsgrootte (<3MB) en echte PNG/WEBP-signature (geen vertrouwen op client-`Content-Type`).
4. Slaat het bestand op onder `assets/minimap-bakes/<minimapId-slug>-<node-kort-id>-<timestamp>.<ext>`.
5. Patcht de node values (`bakedImageUrl`, `bakedImageWidth`, `bakedImageHeight`, `bakedAt`, `bakedWorldHash`, `bakedBounds`) via de bestaande `graphRepository.updateNodeValues`.
6. Retourneert `{ ok, bakedImageUrl, bakedImageWidth, bakedImageHeight, bakedAt, bakedWorldHash, bakedBounds, graph }`.

Geen base64 in de database, geen user-controlled path, geen publiek schrijf-endpoint zonder auth.

## Node types

- **Minimap Bake** (`minimap_bake`, group UI) — bounds (ground/explicit), padding, resolution (≤2048), formaat/kwaliteit, achtergrond, include/hide-toggles voor de bake, en hidden `baked*` velden die de server patcht.
- **Game Minimap HUD** (`game_minimap_hud`, group UI) — `sourceMinimapId`, anchor/size/marge/radius/opacity, `markerUpdateMs` throttle, `rotationMode` (alleen `north_up` volledig gegarandeerd), show-toggles voor local/remote players, namen, spawn, NPC-entities, interactables, quest/enemy-velden (voorbereid, niet gevuld), viewport cone.
- **Editor Minimap** (`editor_minimap_hud`, group UI) — editor-only preview: camera/selectie/spawn/entities/interactables/chunk grid/bake bounds, `clickToFocus` (voorbereid, standaard uit).

Alle drie outputten `dataType: "minimap"` naar de nieuwe Game Output-input `minimap` (`required: false, multiple: true`).

## Read-model

Draft/editor (`GET /api/editor/draft-world`):

```
minimap: {
  bakes: [ { id, nodeId, minimapId, label, enabled, boundsMode, bounds, ...bakeConfig, bakedImageUrl, bakedImageWidth, bakedImageHeight, bakedAt, bakedWorldHash, bakedBounds } ],
  game: { hudId, sourceMinimapId, enabled, anchor, sizePx, ... } | null,
  editor: { hudId, sourceMinimapId, enabled, anchor, sizePx, showEditorCamera, showSelectedObject, showBakeBounds, ... } | null
}
```

Published (`GET /api/game/world`):

```
minimap: {
  bakes: [ ...zelfde vorm... ],
  game: { ... } | null
}
```

`minimap.editor` bestaat niet in het publieke world-object (zelfde patroon als `editorCamera`: alleen gezet als de build met `includeEditorCamera: true` draait). Unconnected `minimap_bake`/`game_minimap_hud`/`editor_minimap_hud` nodes verschijnen nooit in draft of published read-model (ze worden alleen opgehaald via `incomingNodes` vanaf Game Output).

Validatie (`GET /api/editor/validate`):

- Hard error: twee enabled `minimap_bake` nodes met dezelfde `minimapId`; `resolution > 2048`; `explicit_bounds` met `minX >= maxX` of `minZ >= maxZ`; `sizePx <= 0` op een HUD-node.
- Warning: `game_minimap_hud` verwijst naar een `minimap_bake` die niet bestaat/niet verbonden is, of nog geen `bakedImageUrl` heeft.

## Bake-pipeline (client)

`world-runtime.js#bakeMinimapImage(config)`:

1. Bewaart huidige render target/clear color/alpha/autoClear.
2. Verbergt (tijdelijk) selection helper, transform guide, terrain/scatter editor-overlays en chunk debug overlay als de bijbehorende `hide*` flags aan staan; verbergt scatter/model entity roots als `includeStaticModels` uit staat.
3. Bouwt een tijdelijke `THREE.OrthographicCamera` recht boven het middelpunt van de bounds, kijkend naar beneden.
4. Rendert één keer naar een `THREE.WebGLRenderTarget` (resolution × resolution).
5. Leest pixels, flipt de rijen (WebGL leest onderaan-boven), zet ze in een 2D canvas, exporteert via `canvas.toBlob("image/webp"|"image/png", quality)`.
6. Herstelt render target/clear state/helper-zichtbaarheid en vraagt één losse render aan voor de live viewport (geen permanente state-wijziging, geen camera-reset).

De editor (`editor.js#bakeMinimapForNode`) lost bounds op (ground bounds uit de draft world, of explicit bounds + padding), roept `runtime.bakeMinimapImage(...)` aan, en POST't de blob naar `/api/editor/minimap-bakes`. Bij succes wordt de lokale graph-state bijgewerkt en de inspector/viewport herrenderd; bij falen blijft een eerder gezette `bakedImageUrl` onaangeroerd.

## Live markers

`apps/web/public/shared/minimap-utils.js#worldToMinimapPoint(x, z, bounds, w, h)` is de enige plek waar wereld-naar-pixel gerekend wordt; game en editor gebruiken hem allebei.

- **Game** (`game_minimap_hud`): local player uit `state.predictedPosition || state.position || state.authoritativePosition` (zelfde bron als de rest van de client), remote players uit `state.remote.players` via `entry.renderState.position` (dezelfde geïnterpoleerde stand als de 3D avatar, geen ruwe packet-positie), entities/interactables uit `state.gameWorld.entities`/`.interactables`. Canvas redraw zit in de bestaande remote-rAF-loop, begrensd door `markerUpdateMs`.
- **Editor** (`editor_minimap_hud`): camera target, geselecteerd object, spawn en model entities uit `runtime.getMinimapMarkerSnapshot()` (nieuwe runtime-API, leest de al bestaande selectie/camera/wereld-state). Redraw op transform/selectie/wereld-refresh plus een lichte 250ms poll voor vrije camera-orbit (geen node-writes, puur lokale canvas-redraw).

Geen nieuwe MMO WebSocket events, geen database writes per marker-update, geen tweede live 3D camera.

## Testscript voor Kevin

1. Open `/editor/`.
2. Maak of gebruik een bestaande gepubliceerde testwereld met ground, player, spawn, camera en minstens één model entity.
3. Voeg node Minimap Bake toe.
4. Zet minimapId op `main_minimap`.
5. Connect Minimap Bake naar Game Output → minimap.
6. Voeg Game Minimap HUD node toe.
7. Zet sourceMinimapId op `main_minimap`.
8. Connect Game Minimap HUD naar Game Output → minimap.
9. Voeg Editor Minimap node toe.
10. Zet sourceMinimapId op `main_minimap`.
11. Connect Editor Minimap naar Game Output → minimap.
12. Selecteer Minimap Bake.
13. Klik "Maak minimap afbeelding".
14. Controleer dat er een echte top-down minimap preview verschijnt in de inspector.
15. Controleer dat de editor camera niet reset.
16. Controleer dat transform controls/debug overlays niet in de bake image staan.
17. Klik Save Draft.
18. Refresh `/editor/`.
19. Controleer dat de baked minimap preview en metadata bewaard zijn.
20. Controleer dat de editor minimap zichtbaar is in de viewport.
21. Controleer dat editor markers zichtbaar zijn: spawn, model entity, selected object indien geselecteerd, editor camera/viewport marker indien enabled.
22. Klik Save To Game.
23. Open `/game/`.
24. Controleer dat rechtsboven (of gekozen anchor) de minimap zichtbaar is.
25. Controleer dat de baked image als background zichtbaar is.
26. Beweeg de speler.
27. Controleer dat de local player marker over de minimap beweegt.
28. Open een tweede account/browser uit MMO-02.
29. Controleer dat remote player marker verschijnt.
30. Beweeg remote player.
31. Controleer dat remote marker live meebeweegt zonder refresh.
32. Controleer dat namen zichtbaar zijn als showRemotePlayerNames aan staat.
33. Controleer dat er geen tweede live 3D minimap camera of tweede game WebGL-render in de HUD draait.
34. Controleer Performance HUD: minimap mag geen grote frame-ms stijging veroorzaken.
35. Maak een losse unconnected minimap node.
36. Save To Game.
37. Controleer dat unconnected minimap node niet in `/api/game/world` verschijnt.

## Known limitations

- Fog of war is niet gebouwd.
- Quest/enemy markers bestaan alleen als voorbereide velden (`showQuestMarkers`/`showEnemies`) — geen fake data, geen quest/enemy systeem.
- `clickToFocus` op de editor minimap is alleen als veld voorbereid; het klik-gedrag zelf is niet aangesloten in MMO-03.
- `rotationMode: player_facing`/`camera_yaw` bestaan als veld maar vallen in MMO-03 altijd terug op `north_up` (de kaart zelf roteert niet mee; alleen de local-player marker toont zijn eigen facing).
- `includeGround`/`includeTerrainSurfaces`/`includeWater`/`includeInteractables` op Minimap Bake worden bewaard in de node values en het read-model, maar de bake zelf onderscheidt scene-lagen nog niet fijnmazig — alleen editor-helpers/transform controls/chunk debug overlay en (optioneel) statische models worden echt uit de render gehaald. Volledige laag-per-laag include/exclude is een vervolgstap.
- De bake reflecteert alleen chunks die op het moment van bakken resident/geladen zijn (geen geforceerde full-world load vóór het bakken).
- Character select blijft buiten scope; schuift door naar een latere MMO-fase.
