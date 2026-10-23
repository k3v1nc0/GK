# Fase 7 - Dynamic Loading & Unloading van Chunks

Regie-versie: 2026-07-01
Status: fasecontract voor Codex-runs
Voorwaarde: deze fase mag geen echte streaming engine worden; alleen node-data, publicatie en inspectie

## Doel

Maak chunk loading voor Kevin eerst als node-gestuurde configuratie zichtbaar en publiceerbaar.

De focus is bewust smal:

- twee nieuwe nodes in de editor;
- een nieuw `chunkLoading` data type;
- publish/read-model keten die de instellingen bewaart;
- smoke-test die de keten afdekt;
- minimale runtime-inspectie, geen streaming-engine.

Kevin moet hiermee later zelf kunnen bepalen hoe chunk loading werkt voor editor en game, zonder hardcoded policy als eindwaarheid.

## Belangrijkste scope

Deze fase voegt twee nodes toe:

1. `editor_chunk_loading`
2. `game_chunk_loading`

Beide nodes moeten:

- zichtbaar zijn in de node library;
- inspectorvelden tonen;
- savebaar zijn in draft;
- publishbaar zijn naar `/api/game/world`;
- inspecteerbaar zijn in de gepubliceerde wereld;
- een `chunkLoading` outputpoort hebben.

De `game_output` node krijgt een optionele input:

```js
chunkLoading: {
  label: "Chunk Loading",
  dataType: "chunkLoading",
  required: false,
  multiple: true
}
```

## Nieuw datatype

Voeg het datatype toe:

```js
chunkLoading
```

En voeg een duidelijke kleur toe in `DATA_TYPE_COLORS`. Gebruik bij voorkeur een technische tint, bijvoorbeeld:

```js
chunkLoading: "#67d8c4"
```

## Nieuwe nodes

### Editor Chunk Loading

```js
editor_chunk_loading
```

Beschrijving:

> Editor loading policy for showing more world chunks around the editor camera while authoring.

Aanbevolen groep:

- `World`

Outputs:

```js
chunkLoading: {
  label: "Chunk Loading",
  dataType: "chunkLoading"
}
```

Velden:

- `chunkProfileId` default `editor_chunks`
- `enabled` default `true`
- `chunkWidth` default `100`
- `chunkDepth` default `100`
- `tileSize` default `1`
- `editorViewRadiusChunks` default `2`
- `preloadMarginChunks` default `1`
- `unloadMarginChunks` default `2`
- `maxLoadedChunks` default `49`
- `keepSelectedChunkLoaded` default `true`
- `showChunkGrid` default `true`
- `showChunkLabels` default `false`
- `debugOverlay` default `true`

### Game Chunk Loading

```js
game_chunk_loading
```

Beschrijving:

> Game loading policy for keeping runtime chunks limited to the fixed game camera view.

Aanbevolen groep:

- `World`

Outputs:

```js
chunkLoading: {
  label: "Chunk Loading",
  dataType: "chunkLoading"
}
```

Velden:

- `chunkProfileId` default `game_chunks`
- `enabled` default `true`
- `chunkWidth` default `100`
- `chunkDepth` default `100`
- `tileSize` default `1`
- `cameraOnly` default `true`
- `gameViewRadiusChunks` default `1`
- `fixedCameraPaddingTiles` default `10`
- `preloadMarginChunks` default `1`
- `unloadMarginChunks` default `1`
- `maxLoadedChunks` default `9`
- `strictUnloadOutsideCamera` default `true`
- `loadBudgetPerFrame` default `2`
- `debugOverlay` default `false`

## Publish read-model

De gepubliceerde world krijgt een top-level read-model:

```js
chunkLoading: {
  editor: null,
  game: null
}
```

Of, als nodes verbonden zijn:

```js
chunkLoading: {
  editor: {
    id,
    type: "editor",
    enabled,
    chunkProfileId,
    chunkWidth,
    chunkDepth,
    tileSize,
    editorViewRadiusChunks,
    preloadMarginChunks,
    unloadMarginChunks,
    maxLoadedChunks,
    keepSelectedChunkLoaded,
    showChunkGrid,
    showChunkLabels,
    debugOverlay
  },
  game: {
    id,
    type: "game",
    enabled,
    chunkProfileId,
    chunkWidth,
    chunkDepth,
    tileSize,
    cameraOnly,
    gameViewRadiusChunks,
    fixedCameraPaddingTiles,
    preloadMarginChunks,
    unloadMarginChunks,
    maxLoadedChunks,
    strictUnloadOutsideCamera,
    loadBudgetPerFrame,
    debugOverlay
  }
}
```

Regels:

- als meerdere `editor_chunk_loading` nodes verbonden zijn, gebruik de eerste en geef een warning;
- als meerdere `game_chunk_loading` nodes verbonden zijn, gebruik de eerste en geef een warning;
- als alleen editor verbonden is, blijft `chunkLoading.game` `null`;
- als alleen game verbonden is, blijft `chunkLoading.editor` `null`;
- als geen chunk loading nodes verbonden zijn, blijft `chunkLoading` aanwezig met beide kanten `null`.

## Validatie

Gebruik bestaande field-validatie waar mogelijk. Extra publish-warnings:

- als `unloadMarginChunks < preloadMarginChunks`:
  - `Chunk Loading unload margin is kleiner dan preload margin; chunks kunnen snel laden/lossen.`
- als `cameraOnly === false` op Game Chunk Loading:
  - `Game Chunk Loading cameraOnly staat uit; dit kan meer chunks laden dan de vaste game camera nodig heeft.`
- als `editorViewRadiusChunks < gameViewRadiusChunks`:
  - `Editor Chunk Loading radius is kleiner dan Game Chunk Loading radius; editor toont mogelijk minder dan game.`

De basisvalidatie blijft verder gewoon de bestaande field-grenzen afdwingen.

## Runtime

Alleen minimale runtime-interpretatie is toegestaan.

Toegestaan:

- `debugState` uitbreiden met chunk loading info;
- world-size telling uitbreiden als dat klein en veilig is;
- eventueel debug-visual feedback als dat direct op de bestaande structuur aansluit.

Niet toegestaan:

- echte GLB streaming;
- asset unloading/loading engine;
- terrain splitting;
- database chunk tables;
- server-side chunk compiler;
- seeded chunk content;
- multiplayer interest management;
- navmesh/chunk collision system.

## Smoke test

Breid `scripts/smoke-test.js` uit met minimaal deze checks:

1. Maak `editor_chunk_loading`.
2. Maak `game_chunk_loading`.
3. Verbind beide met `Game Output.chunkLoading`.
4. Save Draft.
5. Controleer `/api/editor/draft-world`.
6. Publish.
7. Controleer `/api/game/world`.
8. Maak een extra ongekoppelde `editor_chunk_loading` node met afwijkende waarden.
9. Publish opnieuw en controleer dat de ongekoppelde node niet verschijnt.
10. Maak, als het praktisch is, een tweede verbonden `game_chunk_loading` node.
11. Controleer dat publish een warning geeft en dat de eerste node leidend blijft.

## Handmatige acceptatie voor Kevin

Kevin moet in de live editor kunnen zien:

1. Node library bevat `Editor Chunk Loading`.
2. Node library bevat `Game Chunk Loading`.
3. Beide nodes kunnen op het canvas worden gezet.
4. Beide nodes tonen duidelijke inspectorvelden.
5. Beide nodes hebben een `chunkLoading` outputpoort.
6. `Game Output` heeft een `Chunk Loading` inputpoort.
7. Beide nodes kunnen verbonden worden met `Game Output`.
8. Save Draft bewaart de waarden.
9. Reload behoudt de waarden.
10. Save To Game publiceert de waarden.
11. `/api/game/world` toont `chunkLoading.editor` en `chunkLoading.game`.
12. `/game/` breekt niet.
13. Er verschijnt geen demo-content en geen fake chunk-world.
14. Editor-instellingen en game-instellingen blijven zichtbaar gescheiden.

## Wat expliciet niet in deze fase zit

Niet doen:

- geen full streaming engine;
- geen automatische chunk compiler;
- geen seeded chunks;
- geen demo forest/chunk content;
- geen nieuwe database chunk-tabellen;
- geen grote refactor van `world-runtime`;
- geen asset cache rewrite;
- geen terrain/navmesh/collision chunk splitting;
- geen multiplayer scope;
- geen hardcoded policy buiten node defaults;
- geen editor/game samenvoegen in één node;
- geen game laten vertrouwen op editor radius.

## Vervolg naar Fase 8

TODO:

`Runtime chunk culling/debug overlay bouwen op basis van gepubliceerde chunkLoading policy.`

