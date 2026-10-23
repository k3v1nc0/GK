# Fase 8.3 - Ground Chunk Streaming Root-Cause Repair

Regie-versie: 2026-07-02
Status: root-cause repair op fase 8.2
Voorwaarde: fase 8 runtime chunk culling, fase 8.1 terrain visual chunking en fase 8.2 streaming/dispose zijn aanwezig

## Doel

Repareer de echte performance-root cause:

- in `/game/` mag geen oude volledige `published-ground` plane actief blijven als Game Chunk Loading aan staat;
- ground moet dan alleen als resident chunk tiles renderen;
- grondtextures moeten world-space getiled blijven in plaats van over de wereld uit te rekken;
- path, water en surface moeten seam-safe blijven zoals vóór de kapotte segmentatie;
- shadows en licht moeten de actieve speelzone beter volgen.

Dit is geen nieuw breed streamingproject. Dit is een bypass en vervanging van de legacy full-ground route.

## Wat nu echt moet kloppen

- `resolveGroundRenderMode()` kiest `"chunked"` wanneer runtime chunk loading aan staat en ground chunking is toegestaan;
- `shouldUseChunkedGround()` is de expliciete check voor de ground render route;
- `debugState().world.chunkLoading.ground` laat zien of de ground route `full` of `chunked` is;
- `debugState().world.chunkLoading.ground.fullGroundPlaneActive` moet `false` zijn in `/game/` met Game Chunk Loading aan;
- `debugState().world.performance` toont `sceneChildren`, `runtimeObjects` en `hiddenObjects`;
- `debugState().world.lighting.shadowAnchor` laat zien hoe het shadow anchor meebeweegt met de actieve zone.

## Belangrijke afbakening

Deze fase doet:

- de legacy full-ground plane uitschakelen zodra game chunk loading actief is;
- ground chunk tiles als eigen resident lifecycle laten renderen;
- de bestaande chunk policies hergebruiken;
- geen nieuw HLOD/proxy systeem bouwen;
- geen path/water/surface re-segmentatie terugbrengen;
- geen nieuwe database- of worker-architectuur introduceren.

Deze fase doet niet:

- geen multiplayer interest management;
- geen minimap;
- geen navmesh chunking;
- geen asset bundle pipeline;
- geen server-side chunk compiler.

## Runtime gedrag

### Game mode

- als `world.chunkLoading.game.enabled=true` en `groundChunkingEnabled=true`, dan is ground chunked;
- de oude `published-ground` mesh wordt niet aangemaakt of zichtbaar gehouden;
- loaded chunk keys bepalen welke ground tiles resident zijn;
- verlaten tiles worden detached en disposed;
- ground textures blijven world-space tiled.

### Editor mode

- de editor mag ook chunked ground gebruiken als `world.chunkLoading.editor.enabled=true`;
- editor chunk policy blijft apart van game policy;
- `terrainVisualChunkingEnabled` blijft los staan van ground chunking;
- `pathWaterSurfaceChunkingEnabled` blijft standaard uit.

## Debug bewijs

Gebruik in de browserconsole:

```js
window.__GK_EDITOR_RUNTIME.debugState()
window.__GK_GAME_RUNTIME.debugState()
```

`debugState().world.chunkLoading.ground` bevat onder meer:

- `mode`
- `enabled`
- `policySource`
- `fullGroundPlaneActive`
- `fullGroundPlaneName`
- `fullGroundPlaneVisible`
- `groundTilesBlueprint`
- `groundTilesResident`
- `groundTilesVisible`
- `groundTilesHidden`
- `loadedChunkKeys`
- `residentChunkKeys`
- `enteringChunkKeys`
- `leavingChunkKeys`
- `lastSyncReason`

`debugState().world.performance` bevat:

- `frameMs`
- `drawCalls`
- `triangles`
- `geometries`
- `textures`
- `sceneChildren`
- `runtimeObjects`
- `hiddenObjects`

## Handmatige Kevin-check

### Scenario A - Bypass full ground

1. Zet Game Chunk Loading aan.
2. Open `/game/`.
3. Controleer dat `fullGroundPlaneActive=false`.
4. Controleer dat er geen volledige `published-ground` plane zichtbaar is.

### Scenario B - Ground streaming

1. Loop of teleport door de wereld.
2. Controleer dat ground tiles rond de speler/camera verschijnen.
3. Controleer dat tiles achter je verdwijnen.
4. Controleer dat resident chunk keys mee verschuiven.

### Scenario C - Texture schaal en shadows

1. Gebruik een grotere ground met een zichtbare texture.
2. Controleer dat de texture wereldschaal behoudt en niet uitrekt.
3. Controleer dat shadow anchors de actieve zone volgen.

## Checks

`npm run check` bewaakt syntax van runtime, publish en tests.
`npm run smoke` bewaakt de helper-, lifecycle- en publish-contracten voor ground chunk streaming.

Voor de performance-baseline en het runtime-budget na deze ground fix is Fase 8.4 verantwoordelijk.

## Resultaat

Deze fase maakt de ground root-cause zichtbaar en verwijdert de legacy full-ground render route uit de chunked game mode.
