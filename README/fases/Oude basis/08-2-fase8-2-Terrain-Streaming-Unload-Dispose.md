# Fase 8.2 - Terrain Streaming, Unload en Dispose

Regie-versie: 2026-07-02
Status: vervolg op fase 8.1
Voorwaarde: fase 8 runtime chunk culling en fase 8.1 terrain visual chunking zijn aanwezig

## Doel

Maak de chunkbare terrain visuals uit fase 8.1 echt streamable:

- chunk enter -> preload/build;
- chunk exit -> detach;
- chunk unload -> dispose;
- textures, materials en assets ref-counted houden;
- GPU en CPU geheugen veilig teruggeven wanneer een terrain piece verdwijnt.

Deze fase breidt de bestaande chunk registry uit met een echte resident lifecycle voor terrain stukken.

> Waarschuwing: deze fase lost de legacy full-ground route nog niet op. Als `/game/` nog een volledige `published-ground` mesh rendert naast de chunks, hoort dat bij fase 8.3.

## Wat nu echt werkt

- ground tiles worden niet alleen chunkbaar, maar ook resident/unloaded per chunk window;
- path, water en surface segmenten worden als streamable pieces geregistreerd;
- terrain pieces worden gebouwd wanneer hun chunk in het loaded window valt;
- terrain pieces worden losgekoppeld en disposed wanneer hun chunk het loaded window verlaat;
- texture assets worden via refcounts beheerd;
- surface materials gebruiken per-piece texture clones en shared fallback textures blijven intact;
- `debugState().world.chunkLoading.terrainStreaming` toont resident state, texture refs en chunk counts;
- de Performance HUD kan terrain resident counters tonen;
- `clearContent()` en world switches ruimen terrain runtime state op zonder oude resident chunks te laten hangen.

## Belangrijke afbakening

Deze fase doet:

- de bestaande `world.chunkLoading.editor` en `world.chunkLoading.game` blijven de bron van waarheid;
- geen tweede chunk-systeem;
- geen nieuwe world chunk nodes;
- geen database chunk tables;
- geen worker-based streaming;
- geen IndexedDB cache;
- geen navmesh streaming;
- geen multiplayer interest management.

Deze fase doet niet:

- geen nieuwe terrain gameplay-regels;
- geen server-side terrain compiler;
- geen seeded world generation;
- geen brede editor rewrite.

## Runtime gedrag

### Enter en build

- terrain entries registreren zich als resident candidate in de bestaande chunk runtime registry;
- wanneer een chunk het loaded window binnenkomt, wordt het bijbehorende terrain piece gebouwd;
- built pieces krijgen een eigen object tree en tellen mee in de resident counters;
- texture loads worden alleen uitgevoerd als het asset type geschikt is en de asset nog geldig is.

### Exit en unload

- wanneer een chunk het loaded window verlaat, wordt het terrain object losgekoppeld;
- bij unload worden object tree, geometrie, materialen en texture clones vrijgegeven;
- refcounted texture records worden verlaagd en verdwijnen wanneer de laatste gebruiker weg is;
- surface preview records worden netjes uit de material registry verwijderd.

### Memory safety

- fallback white textures worden per material-clone gebruikt;
- custom texture uniforms worden vervangen via veilige release/replace helpers;
- gedeelde asset textures blijven bestaan zolang er resident pieces van afhangen;
- world switches en `destroy()` zetten de terrain streaming state terug naar nul.

## Debug bewijs

Open de browserconsole en gebruik:

```js
window.__GK_EDITOR_RUNTIME.debugState()
window.__GK_GAME_RUNTIME.debugState()
```

`debugState().world.chunkLoading` bevat nu onder meer:

- `terrainStreaming.blueprintPieces`
- `terrainStreaming.residentPieces`
- `terrainStreaming.builtPieces`
- `terrainStreaming.disposedPieces`
- `terrainStreaming.residentObjects`
- `terrainStreaming.residentMeshes`
- `terrainStreaming.residentChunks`
- `terrainStreaming.residentChunkKeys`
- `terrainStreaming.loadedChunks`
- `terrainStreaming.activeChunks`
- `terrainStreaming.preloadChunks`
- `terrainStreaming.textureRefs`
- `terrainStreaming.textureAssets`
- `terrainStreaming.surfaceMaterials`
- `terrainStreaming.groundTilesResident`
- `terrainStreaming.terrainLayerTilesResident`
- `terrainStreaming.pathSegmentsResident`
- `terrainStreaming.waterSegmentsResident`
- `terrainStreaming.surfaceSegmentsResident`

## Performance HUD

Als `showChunkCulling=true` staat, toont de Performance HUD extra terrain streaming regels:

- `Terrain R`
- `T Chunks`

## Handmatige Kevin-check

### Scenario A - Resident lifecycle

1. Zet een wereld neer met een grote ground, een lang pad en een lange waterlijn.
2. Save Draft of Save To Game.
3. Beweeg de camera of speler naar een andere chunk.
4. De resident terrain counters veranderen mee met het loaded window.
5. Verlaat het gebied weer en controleer dat de resident counts terugvallen.

### Scenario B - Texture release

1. Gebruik terrain surfaces met textures en animated flow settings.
2. Beweeg weg uit de chunks met die surfaces.
3. Controleer dat de stukken verdwijnen uit de resident set.
4. Beweeg terug en controleer dat de stukken opnieuw gebouwd worden zonder stale textures.

### Scenario C - World switch

1. Wissel van world of herlaad de runtime.
2. Controleer dat `terrainStreaming` terugvalt naar nul.
3. Controleer dat geen oude resident chunks of texture refs blijven hangen.

## Checks

`npm run check` bewaakt syntax van runtime, publish en tests.
`npm run smoke` bewaakt de bestaande chunk helper-, culling- en publish-contracten, plus de terrain streaming snapshot-aggregatie.

## Resultaat

Deze fase maakt van terrain chunking een echte streaminglaag in plaats van alleen zichtbaarheidsculling.
