# Fase 8 - Runtime Chunk Culling

Regie-versie: 2026-07-01
Status: eerste runtime-gedragsfase bovenop fase 7.1
Voorwaarde: fase 7 en fase 7.1 zijn aanwezig

## Doel

Gebruik de gepubliceerde chunk loading policies om runtime-objecten zichtbaar en actief te maken binnen loaded chunks, en tijdelijk verborgen of inactief te maken buiten het actieve/preload venster.

Deze fase doet runtime culling, geen streaming.

## Wat nu echt werkt

- editor runtime gebruikt alleen `world.chunkLoading.editor`;
- game runtime gebruikt alleen `world.chunkLoading.game`;
- model entities worden per chunk zichtbaar of verborgen;
- scatter instances worden per chunk zichtbaar of verborgen;
- interactables buiten loaded chunks worden inactief;
- entity solids buiten loaded chunks tellen niet meer mee in player collision;
- terug bewegen naar een chunk maakt objecten weer zichtbaar en actief;
- `debugState().world.chunkLoading` toont nu ook culling-counters.

## Belangrijke afbakening

Deze fase doet:

- `object.visible = false` buiten loaded chunks;
- interactables tijdelijk uitschakelen;
- entity-solids tijdelijk uitschakelen;
- debug overlay uit fase 7.1 laten staan.

Deze fase doet niet:

- geen asset unload/load;
- geen GLB streaming;
- geen chunk compiler;
- geen database chunk tabellen;
- geen navmesh chunking;
- geen terrain visual culling.

Terrain/path/water/surface visuals blijven in deze fase seam-veilig. Fase 8.1 voegt alleen een kill switch toe voor terrain chunking waar dat visueel klopt, terwijl path/water/surface op de oude renderer blijven als segmentatie uv- of width-artifacts geeft.

## Runtime gedrag

### Editor

- gebruikt de editor policy;
- center volgt de editor camera target;
- geselecteerde chunk blijft loaded als `keepSelectedChunkLoaded=true`;
- `keepSelectedChunkLoadedApplied` wordt zichtbaar in `debugState()` als die veiligheidsregel actief is.

### Game

- gebruikt de game policy;
- `cameraOnly` blijft leidend voor het chunk center;
- `maxLoadedChunks` wordt gerespecteerd;
- `strictUnloadOutsideCamera` blijft zichtbaar in `debugState()`;
- interactables buiten loaded chunks geven geen prompt en zijn niet triggerbaar.

## Debug bewijs

Gebruik in de browserconsole:

```js
window.__GK_EDITOR_RUNTIME.debugState()
window.__GK_GAME_RUNTIME.debugState()
```

`debugState().world.chunkLoading` bevat nu onder meer:

- `enabled`
- `source`
- `centerChunk`
- `activeChunks`
- `preloadChunks`
- `loadedChunks`
- `hiddenObjects`
- `visibleObjects`
- `culledEntities`
- `culledScatter`
- `culledInteractables`
- `culledSolids`
- `inactiveInteractables`
- `inactiveSolids`
- `uncullableObjects`
- `clippedByMaxLoadedChunks`
- `cullingEnabled`
- `lastUpdateReason`
- `keepSelectedChunkLoadedApplied`

## Performance HUD

De bestaande `Performance HUD` node heeft een extra optionele metric:

- `showChunkCulling`

Als die aan staat, toont de HUD:

- loaded chunks
- hidden objects
- culled entities

## Praktische notitie

Als de game een chunk loading policy heeft, blijft static/scatter batching in deze fase uit. Dat is een bewuste fase-8-keuze om per object consistente culling te houden zonder grotere instanced-mesh refactor.

## Handmatige Kevin-check

### Scenario A - Editor ruimer

1. Zet `Editor Chunk Loading` op `enabled=true`.
2. Zet `editorViewRadiusChunks=2`.
3. Zet `debugOverlay=true` en `showChunkGrid=true`.
4. Plaats meerdere model entities verspreid over meerdere chunks.
5. Save Draft.
6. Objecten binnen het editor-window blijven zichtbaar.
7. Objecten buiten het loaded-window verdwijnen.
8. Selecteer een object buiten het normale window.
9. Als `keepSelectedChunkLoaded=true`, blijft die chunk zichtbaar.

### Scenario B - Game strikter

1. Zet `Game Chunk Loading` op `enabled=true`.
2. Zet `gameViewRadiusChunks=1`.
3. Zet `maxLoadedChunks=9`.
4. Zet `debugOverlay=true`.
5. Save To Game.
6. Open `/game/`.
7. Buiten het game-window verdwijnen props en scatter zichtbaar.
8. Loop naar een andere chunk.
9. Oude objecten verdwijnen en nieuwe objecten komen terug.

### Scenario C - Uit

1. Zet `Game Chunk Loading` op `enabled=false`.
2. Save To Game.
3. Alle runtime-objecten blijven zichtbaar en actief.
4. `debugState().world.chunkLoading.cullingEnabled` is `false`.

### Scenario D - Interactables

1. Plaats een interactable buiten de loaded chunks.
2. In `/game/` mag daar geen prompt verschijnen.
3. Beweeg terug zodat de interactable in een loaded chunk valt.
4. De prompt verschijnt weer.

## Checks

`npm run smoke` dekt nu ook:

- pure chunk membership helpers;
- pure culling state helpers;
- loaded/preload/active set gedrag;
- entity/interactable/solid culling state;
- center-move die loaded chunks laat wisselen.

`npm run check` bewaakt syntax van runtime, publish en tests.

## Nog geen streaming

Verborgen objecten zijn nog steeds in geheugen aanwezig. Deze fase verlaagt dus niet automatisch memory-usage zoals een echte streaming-engine dat later kan doen.
