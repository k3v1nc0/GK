# Fase 8.7 - Editor/Game World Settings Nodes + Shadow/Overlay Repair

## Waarom 8.6 niet genoeg was

Fase 8.6 had wel editor- en game-velden toegevoegd, maar nog steeds op een gedeelde `world_settings`
node. Kevin wilde juist twee echte node types met zichtbare velden, zodat hij direct ziet wat
`quality`, `balanced`, `laptop` en `potato` doen per mode.

Daarom splitst 8.7 het model echt op:

- `world_settings` blijft alleen voor gedeelde basis.
- `editor_world_settings` is editor-only.
- `game_world_settings` is game-only.

## Wat is nu anders

### Shared only

`world_settings` publiceert alleen nog:

- `worldId`
- `displayName`
- `backgroundColor`
- `fogColor`
- `fogDensity`
- `smoothShading`

De node is niet meer leidend voor editor/game shadow quality, performance, static prop shadows,
scatter shadows of debug chunk overlay.

### Twee echte nodes

De editor krijgt nu twee aparte node types:

- `editor_world_settings`
- `game_world_settings`

Beide nodes hebben bovenaan een preset dropdown met:

- `(kies)`
- `quality`
- `balanced`
- `laptop`
- `potato`

Als Kevin een preset kiest:

- alle concrete velden worden zichtbaar gevuld;
- Kevin ziet meteen welke waarden `quality` anders maakt dan `potato`;
- daarna kan Kevin elk veld handmatig aanpassen;
- handmatige waarden winnen altijd van de preset;
- er is geen verborgen profile override meer.

## Presetgedrag

De presets zijn pure definities:

- `EDITOR_WORLD_SETTINGS_PRESETS`
- `GAME_WORLD_SETTINGS_PRESETS`

Een preset zet alleen de zichtbare nodevelden. Runtime leest daarna alleen de gepubliceerde concrete
velden. Er is dus geen extra laag die later alsnog shadows of performance onzichtbaar kan wijzigen.

Dat geldt ook voor `/game/?gamePerformanceProfile=laptop`: als die query nog gebruikt wordt, is dat
alleen debug-only en wordt alleen de game preset tijdelijk overschreven. Daarna resolven de concrete
velden gewoon normaal.

## Shadows

De runtime gebruikt nu per mode eigen shadow policy data:

- editor gebruikt alleen `world.performance.editor`
- game gebruikt alleen `world.performance.game`
- shared values komen alleen uit `world.performance.shared`

Belangrijk voor Kevin:

- `editorStaticPropCastShadows = true` geeft huizen/static props in de editor schaduw;
- `gameStaticPropCastShadows` beïnvloedt alleen de game;
- scatter/tree shadows volgen de eigen editor/game scatter velden;
- debug/helper/chunk-overlay meshes mogen nooit shadow caster zijn;
- chunk overlay staat standaard uit.

Voor de shadow presets geldt nu zichtbaar gedrag:

- `quality` kiest hoge, scherpe waarden;
- `balanced` is de middenweg;
- `laptop` verlaagt pixel ratio en shadow last;
- `potato` zet shadows uit en schakelt zware editor/game details uit.

## Dubbele chunk overlay

De editor mocht niet meer de tweede kleurgecodeerde chunkgroep tonen. Daarom:

- is `editorDebugChunkOverlayVisible` standaard `false`;
- blijft de overlay alleen zichtbaar als zowel de editor setting als de chunk-loading debug vlag aan staat;
- wordt er bij `setWorld`, `save`, `reload` en `restore view` gecontroleerd op duplicate overlay groups;
- worden oude overlay groups verwijderd en disposed;
- mag de overlay niet als camera-child achterblijven.

Debug state:

```js
window.__GK_EDITOR_RUNTIME.debugState().world.shadowDiagnostics
window.__GK_EDITOR_RUNTIME.debugState().world.overlayDiagnostics
```

Belangrijke waarden:

- `chunkOverlayShadowCasters = 0`
- `helperShadowCasters = 0`
- `selectionShadowCasters = 0`
- `cameraChildOverlayGroups = 0`
- `duplicateOverlayFound = false`

## Read-model

Het gepubliceerde model is nu:

```js
world.performance = {
  shared: { worldId, displayName, backgroundColor, fogColor, fogDensity, smoothShading },
  editor: { preset, pixelRatioCap, antialias, fogEnabled, shadowsEnabled, shadowQuality, shadowMapSize, shadowCameraSize, shadowCameraFar, shadowBias, shadowNormalBias, shadowType, staticPropCastShadows, staticPropReceiveShadows, scatterCastShadows, scatterReceiveShadows, groundReceiveShadows, terrainReceiveShadows, debugChunkOverlayVisible, chunkGridVisible, chunkLabelsVisible },
  game: { preset, pixelRatioCap, antialias, fogEnabled, shadowsEnabled, shadowQuality, shadowMapSize, shadowCameraSize, shadowCameraFar, shadowBias, shadowNormalBias, shadowType, staticPropCastShadows, staticPropReceiveShadows, scatterCastShadows, scatterReceiveShadows, groundReceiveShadows, terrainReceiveShadows, debugChunkOverlayVisible, chunkGridVisible, chunkLabelsVisible },
  compatibility: { usedLegacyWorldSettingsPerformanceFields }
}
```

## Hoe Kevin dit gebruikt

### Editor World Settings

1. Voeg `Editor World Settings` toe.
2. Kies `quality`.
3. Kijk dat alle velden zichtbaar veranderen.
4. Zet daarna bijvoorbeeld `editorStaticPropCastShadows` handmatig aan of uit.
5. Save Draft.
6. Reload.
7. De handmatige waarde blijft staan.

### Game World Settings

1. Voeg `Game World Settings` toe.
2. Kies `laptop` of `balanced`.
3. Controleer dat de concrete gamevelden direct meekleuren.
4. Pas daarna handmatig `gameShadowsEnabled`, `gameShadowQuality` of `gameStaticPropCastShadows`
   aan.
5. Open `/game/`.
6. De game gebruikt alleen de game node.

### Shadow check

1. Zet in de editor:
   - `editorShadowsEnabled = true`
   - `editorShadowQuality = high`
   - `editorStaticPropCastShadows = true`
   - `editorGroundReceiveShadows = true`
2. De house/static prop moet schaduw hebben in de editor.
3. Zet in de game:
   - `gamePreset = laptop`
   - `gameShadowsEnabled = true`
   - `gameShadowQuality = high`
   - `gameStaticPropCastShadows = true`
4. Open `/game/`.
5. De house/static prop moet schaduw hebben in game.

## Tests

`npm run check`
`npm run smoke`

`npm run perf:game` is best effort. Als de browser software rendering gebruikt, is dat geen
faalreden voor deze fase.

## Handmatige Kevin check

1. In de node library staan `Editor World Settings` en `Game World Settings`.
2. `world_settings` blijft alleen shared/basic.
3. Presets vullen concrete velden zichtbaar.
4. Handmatige override blijft na save/reload staan.
5. Huis heeft schaduw in de editor.
6. Huis heeft schaduw in game.
7. Er zijn geen ronde helper/chunk shadow blobs.
8. De tweede chunkgroep is weg.
9. `window.__GK_EDITOR_RUNTIME.debugState().world.shadowDiagnostics` laat zero debug/helper casters zien.
10. `window.__GK_EDITOR_RUNTIME.debugState().world.overlayDiagnostics` laat geen camera-child overlay zien.
11. Fase 8.5 streaming correctness blijft groen: bomen poppen niet te laat in en save/reload blijft de scene vullen.

## Acceptatie

Fase 8.7 is pas akkoord als:

- er echt twee nieuwe nodes zijn;
- presets zichtbaar concrete velden wijzigen;
- `world_settings` alleen shared/basic is;
- editor en game elk hun eigen shadow/performance instellingen gebruiken;
- editor static prop shadows werken;
- game static prop shadows blijven werken;
- helper/chunk/debug shadow casters weg zijn;
- de dubbele editor chunkgroep standaard weg is;
- Fase 8.5 streaming gedrag intact blijft.
