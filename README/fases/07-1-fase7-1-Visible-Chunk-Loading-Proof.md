# Fase 7.1 - Visible Chunk Loading Proof

Regie-versie: 2026-07-01
Status: zichtbare proof-laag bovenop fase 7
Voorwaarde: fase 7 read-model en publish-keten zijn al aanwezig

## Doel

Maak chunk loading zichtbaar in de runtime zonder al runtime culling of asset streaming toe te voegen.

Deze microfase bewijst alleen:

- editor runtime leest `world.chunkLoading.editor`;
- game runtime leest `world.chunkLoading.game`;
- `debugOverlay` werkt echt;
- `showChunkGrid` werkt echt in de editor;
- `showChunkLabels` werkt echt in de editor;
- `debugState()` toont chunk loading status en window-counts.

## Wat deze fase wel doet

- chunk policy normaliseren in `world-runtime`;
- active/preload/loaded chunk windows berekenen rond de runtime center;
- editor overlay tekenen met chunk fills, grid en optionele labels;
- game overlay tekenen met chunk fills en grid wanneer `debugOverlay` aan staat;
- `debugState()` uitbreiden met chunk loading info;
- smoke-test uitbreiden met pure helper-bewijzen;
- editor runtime via `window.__GK_EDITOR_RUNTIME` inspecteerbaar maken.

## Wat deze fase niet doet

- geen object visibility culling;
- geen interactable/solid deactivatie;
- geen asset unload/load;
- geen streaming cache;
- geen terrain chunk compiler.

Dat hoort pas in fase 8 en later.

## Runtime gedrag

### Editor

- gebruikt alleen `world.chunkLoading.editor`;
- center volgt de editor camera target;
- `debugOverlay=false` verbergt de overlay;
- `showChunkGrid=false` verbergt gridlijnen maar laat de actieve/preload/loaded chunk fills staan;
- `showChunkLabels=true` toont chunk labels op de loaded chunks.

### Game

- gebruikt alleen `world.chunkLoading.game`;
- center volgt de game camera target, of de speler als `cameraOnly=false`;
- `debugOverlay=false` verbergt de overlay;
- de game node heeft geen aparte `showChunkGrid` of `showChunkLabels` velden, dus de zichtbare proof gebruikt daar `debugOverlay` als hoofdschakelaar en toont grid zonder labels.

## Debug bewijs

Open de browserconsole en gebruik:

```js
window.__GK_EDITOR_RUNTIME.debugState()
window.__GK_GAME_RUNTIME.debugState()
```

`debugState().world.chunkLoading` bevat nu onder meer:

- `enabled`
- `source`
- `policyId`
- `centerChunk`
- `activeChunks`
- `preloadChunks`
- `loadedChunks`
- `activeChunkKeys`
- `preloadChunkKeys`
- `loadedChunkKeys`
- `debugOverlay`
- `showChunkGrid`
- `showChunkLabels`

## Handmatige acceptatie

### Scenario A - Editor proof

1. Verbind een `Editor Chunk Loading` node met `Game Output`.
2. Zet `enabled=true`, `debugOverlay=true`, `showChunkGrid=true`.
3. Save Draft.
4. De editor viewport toont een chunk overlay rond de editor camera target.
5. Zet `showChunkLabels=true`.
6. De editor toont nu ook chunk labels.
7. Zet `showChunkGrid=false`.
8. De gridlijnen verdwijnen, maar de actieve/preload/loaded chunk fills blijven zichtbaar.

### Scenario B - Game proof

1. Verbind een `Game Chunk Loading` node met `Game Output`.
2. Zet `enabled=true`, `debugOverlay=true`.
3. Save To Game.
4. Open `/game/`.
5. De game toont een compactere chunk overlay dan de editor.
6. Beweeg de speler naar een andere chunk.
7. De overlay verschuift mee met de game center.

### Scenario C - Uitgeschakeld

1. Zet `enabled=false` op editor of game policy.
2. Save Draft of Save To Game.
3. De overlay verdwijnt.
4. `debugState().world.chunkLoading.enabled` is `false`.

## Testbewijs

`npm run smoke` dekt nu ook:

- policy-resolutie voor editor en game;
- negatieve chunk coordinaten via `Math.floor`;
- active/preload/loaded chunk window telling;
- deterministische `maxLoadedChunks` clipping;
- editor policy ruimere window dan game policy.
