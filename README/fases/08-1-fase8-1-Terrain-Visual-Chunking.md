# Fase 8.1 - Terrain Visual Chunking

Regie-versie: 2026-07-01
Status: microfase bovenop fase 8
Voorwaarde: fase 8 runtime chunk culling is al aanwezig

## Doel

Maak terrain visuals chunk-aware zonder de seam-veiligheid van path, water en surfaces te breken.

Deze microfase gebruikt geen nieuw chunk-systeem.

## Wat nu echt werkt

- `ground` wordt als chunk tiles opgebouwd;
- `terrain_layer` kan chunk-aware worden gemaakt wanneer `terrainVisualChunkingEnabled=true`;
- `path_layer`, `water_layer` en `surface_layer` blijven op de oude seam-zekere renderer;
- terrain visuals zonder chunk info blijven zichtbaar en worden als uncullable geteld;
- terrain visuals met chunk info kunnen door de bestaande chunk culling registry worden verborgen of getoond;
- `debugState().world.chunkLoading.terrainVisuals` toont terrain visibility counters;
- `debugState().stats` toont ook `drawCalls`, `textures` en `frameMs`;
- de Performance HUD kan extra terrain visibility regels tonen.

## Belangrijke afbakening

Deze microfase doet:

- bestaande `world.chunkLoading.editor` en `world.chunkLoading.game` hergebruiken;
- bestaande runtime culling registry hergebruiken;
- een kill switch toevoegen voor terrain visual chunking;
- seam-veilig renderen voor path/water/surface behouden;
- terrain layer chunking alleen gebruiken waar dat veilig is;
- helpers toevoegen voor chunk keys en ground tiling;
- smoke-tests uitbreiden met helper- en cullingbewijzen.

Deze microfase doet niet:

- geen nieuw streaming systeem;
- geen unload/release/refcount logica;
- geen GPU memory free per chunk;
- geen extra databankstructuur;
- geen nieuw world chunk model;
- geen path/water/surface gameplay regels veranderen;
- geen terrain simulatielaag toevoegen.

## Runtime gedrag

### Ground

- `ground` wordt verdeeld in tiles per chunk boundary;
- iedere tile gebruikt dezelfde ground material waar mogelijk;
- tiles buiten het loaded window worden verborgen.

### Terrain layers

- `shapeType=full` wordt als chunk tile opgebouwd;
- polygon terrain layers worden per chunk tile geclipped;
- wanneer `terrainVisualChunkingEnabled=false`, blijven de tiles uncullable en zichtbaar;
- wanneer `terrainVisualChunkingEnabled=true`, kunnen de tiles door chunk culling verborgen worden.

### Paths, water en surfaces

- line-based terrain blijft als één seam-veilige mesh renderen;
- UV continuity en breedte blijven stabiel;
- geen segmentering per edge, dus geen extra stretch/join artifacts;
- deze visuals blijven uncullable tot een latere, correctere chunk-implementatie.

## Debug bewijs

Open de browserconsole en gebruik:

```js
window.__GK_EDITOR_RUNTIME.debugState()
window.__GK_GAME_RUNTIME.debugState()
```

`debugState().world.chunkLoading` bevat nu onder meer:

- `terrainVisuals.registered`
- `terrainVisuals.visible`
- `terrainVisuals.hidden`
- `terrainVisuals.groundTilesVisible`
- `terrainVisuals.groundTilesHidden`
- `terrainVisuals.terrainLayerTilesVisible`
- `terrainVisuals.terrainLayerTilesHidden`
- `terrainVisuals.pathSegmentsVisible`
- `terrainVisuals.pathSegmentsHidden`
- `terrainVisuals.waterSegmentsVisible`
- `terrainVisuals.waterSegmentsHidden`
- `terrainVisuals.surfaceSegmentsVisible`
- `terrainVisuals.surfaceSegmentsHidden`
- `terrainVisuals.uncullableTerrainVisuals`
- `terrainVisualChunkingEnabled`

`debugState().stats` bevat nu ook:

- `terrainVisible`
- `terrainHidden`
- `drawCalls`
- `textures`
- `frameMs`

## Performance HUD

De bestaande `debug_performance_hud` node kan met `showChunkCulling=true` nu ook terrain visibility tonen:

- `Terrain V`
- `Terrain H`

## Handmatige Kevin-check

### Scenario A - Ground tiles

1. Zet een grote ground neer die meerdere chunks overspant.
2. Save Draft of Save To Game.
3. Beweeg de camera of speler naar een andere chunk.
4. Alleen de ground tiles binnen het loaded window blijven zichtbaar.

### Scenario B - Paths en water

1. Maak een lang pad of waterlijn die meerdere chunks kruist.
2. Save Draft of Save To Game.
3. Controleer dat de lijn seam-veilig en even breed blijft.
4. Beweeg over chunkgrenzen.
5. De lijn vervormt niet en behoudt zijn texture continuity.

### Scenario C - Terrain layers

1. Maak een `terrain_layer` met `shapeType=full` of een polygon layer.
2. Zet `terrainVisualChunkingEnabled=true` voor dezelfde policy.
3. Save Draft of Save To Game.
4. Controleer dat de tile- of polygonstukken mee-cullen met de chunk window.

## Checks

`npm run smoke` dekt nu ook:

- chunk world size helpers;
- negatieve chunk coordinaten;
- line segment splitting;
- polyline splitting per chunk;
- ground tiling per chunk boundary;
- terrain culling stats voor ground tiles;
- seam-veilig gedrag voor path, water en surface visuals;
- terrain layer culling aan/uit via de kill switch.

`npm run check` bewaakt syntax van runtime, publish en tests.

## Nog geen streaming

Verborgen terrain visuals blijven in geheugen aanwezig. Deze fase maakt dus geen echte streaming- of unload-engine.
