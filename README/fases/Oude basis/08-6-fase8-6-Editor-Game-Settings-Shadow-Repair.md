# Fase 8.6 - Editor/Game World Settings Split, Shadow Repair & Duplicate Chunk Preview Cleanup

## Waarom deze fase nodig was

Na Fase 8.5 (streaming correctness) meldde Kevin vijf losstaande problemen in een live test:

1. World Settings waren onduidelijk: één gedeelde `shadowQuality`/`shadowBias`/`shadowCameraSize`
   groep stuurde zowel editor als game, en `gamePerformanceProfile` kon shadows/objecten
   onzichtbaar weglaten zonder dat Kevin zag welke velden daardoor overschreven werden.
2. Static props cast shadows werkte in `/game/` wel, maar in de editor nooit - er was geen
   editor-equivalent van dat veld.
3. Boomschaduwen zagen er rond/vlekkerig uit in plaats van boomvorm.
4. De editor toonde een tweede, kleurgecodeerde chunk/terrain-tegelgroep bovenop de echte grond.
5. Dit is nadrukkelijk geen nieuwe streaming-, terrain- of performancefase - het is een gerichte
   repair op basis van dat live-testverslag, met Fase 8.5's streaming correctness volledig intact.

## Root causes (bewezen door de code te lezen, niet giswerk)

- **Onduidelijke settings**: `src/shared/node-types.js` had precies vijf shadow-velden
  (`shadowQuality`, `shadowBias`, `shadowNormalBias`, `shadowCameraSize`, `shadowCameraFar`) onder
  `WORLD_SETTINGS_SHARED_FIELDS`, gebruikt door **zowel** editor als game. Editor had alleen
  `editorPixelRatioCap`/`editorFogEnabled`/`editorShadowsEnabled` - geen eigen shadow quality, geen
  eigen static/scatter/ground shadow-velden.
- **Static props cast shadows ontbrak in editor**: `activeModePerformance()` in
  `apps/web/public/shared/world-runtime.js` gaf voor editor-mode een object terug met alleen
  `{ pixelRatioCap, fogEnabled, shadowsEnabled }`. `staticPropShadowOptions()` leest
  `performance.staticPropCastShadows` - in editor-mode was dat altijd `undefined`, dus
  `undefined === true` is `false`. In game-mode bestond het veld wel. Dit was de exacte oorzaak van
  "huis heeft in editor geen schaduw, in game wel".
- **Performance profile overschreef shadows onzichtbaar**: `resolveWorldPerformance()` combineerde
  de node-waarde altijd met het profiel via AND/MIN
  (`staticPropCastShadows: game.staticPropCastShadows === true && profile.staticPropCastShadows !== false`,
  `shadowQuality: lowestShadowQuality(shared.shadowQuality, profile.shadowQuality)`). Een profiel
  als `laptop`/`potato` heeft `staticPropCastShadows: false`/`shadowQuality: "low"` in zijn preset,
  dus zelfs met `gameShadowQuality = high` en `gameStaticPropCastShadows = true` op de node, won het
  profiel altijd. Dat is exact "alleen shadow quality = quality/high geeft goede schaduw; andere
  profielen laten te veel weg".
- **Boomschaduw-blobs**: geen enkele debug/helper/chunk-overlay/selection mesh had ooit
  `castShadow` op `true` staan (THREE's default is al `false`), dus die waren niet de oorzaak. De
  reële oorzaak was dat editor altijd `THREE.PCFSoftShadowMap` gebruikte met de shared
  `shadowCameraSize` (default 60) over de hele wereld, zonder per-mode override en zonder een
  quality-afhankelijke camera-size-fallback - een brede shadow-frustum met een laag-poly
  boomkroon-mesh geeft precies dat ronde/vlekkerige effect. Er was géén per-mode manier om dit te
  verkleinen.
- **Dubbele chunk/terrain preview**: `chunkDebugOverlay` (de kleurgecodeerde active/preload/loaded
  tegels + grid + labels) rendert met `depthTest:false`/`depthWrite:false` en stond in de editor
  **standaard aan** (`EDITOR_CHUNK_LOADING_FIELDS.debugOverlay` default `true`), zichtbaar
  gestapeld bovenop de echte ground/chunk tiles. Dat is de "tweede groep chunk/terrain tiles" die
  Kevin zag. `terrainRuntimeGroup`/`chunkDebugOverlay` bleken overigens al correct als singleton
  geïmplementeerd (`if (x) return x;`-guard, nooit als camera-child toegevoegd) - het probleem was
  zichtbaarheid-by-default, niet een echte duplicate-bug. Fase 8.6 voegt alsnog een harde
  `removeDuplicateRuntimeGroups()`-garantie toe zodat dat ook in de toekomst zo blijft.

## Wat is opgelost

### World Settings: Shared / Editor / Game

De `world_settings` node heeft nu drie duidelijke groepen (`section` in de inspector):

- **Shared World**: `worldId`, `displayName`, `backgroundColor`, `fogColor`, `fogDensity`,
  `smoothShading`. Dit is de enige groep die editor en game echt delen.
- **Editor World Settings**: `editorPixelRatioCap`, `editorFogEnabled`, `editorShadowsEnabled`,
  `editorShadowQuality`, `editorShadowMapSize`, `editorShadowCameraSize`, `editorShadowCameraFar`,
  `editorShadowBias`, `editorShadowNormalBias`, `editorShadowType`,
  `editorStaticPropCastShadows`, `editorStaticPropReceiveShadows`, `editorScatterCastShadows`,
  `editorScatterReceiveShadows`, `editorGroundReceiveShadows`, `editorDebugChunkOverlayVisible`.
- **Game World Settings**: dezelfde lijst met `game`-prefix, plus `gamePerformanceProfile`,
  `gamePerformanceProfileAppliesDefaultsOnly`, `gameFogEnabled`, `gameBatchStaticProps`,
  `gameBatchScatterProps`.
- **Legacy shadow fallback (fase <8.6)**: de oude vijf gedeelde velden
  (`shadowQuality`/`shadowBias`/`shadowNormalBias`/`shadowCameraSize`/`shadowCameraFar`) blijven
  bestaan, maar alleen als fallback-bron. Zodra een world de nieuwe `editorShadowQuality` of
  `gameShadowQuality` heeft (elke world aangemaakt via de editor-API heeft die altijd, want elk
  veld krijgt bij het aanmaken van een node meteen zijn eigen default), winnen de nieuwe velden.
  Alleen een world die van vóór deze fase dateert - waarvan de opgeslagen `values_json` de nieuwe
  sleutels dus letterlijk niet bevat - valt terug op de oude gedeelde waarde. Zie
  `buildWorldPerformanceReadModel()` in `src/server/publish-service.js`.

`shadowMapSize`/`shadowCameraSize`/`shadowCameraFar` gebruiken `0` als "niet ingevuld, automatisch
op basis van shadow quality"; elke waarde boven `0` is een expliciete override die altijd wint (zie
Shadow presets hieronder).

### Performance profile is een preset, geen onzichtbare override

`gamePerformanceProfileAppliesDefaultsOnly` (default `true`) is de nieuwe regel:

- **Aan (default)**: `gamePerformanceProfile` is alleen nog informatief/preset. Elk expliciet
  Game-veld (`gameShadowQuality`, `gameShadowsEnabled`, `gameStaticPropCastShadows`, ...) wordt
  direct toegepast, zonder dat het profiel het nog verlaagt. Kevin kan dus `laptop` laten staan en
  toch `gameShadowQuality = high` + `gameStaticPropCastShadows = true` gebruiken.
- **Uit**: herstelt het oude fase <8.6-gedrag (profiel kan shadow quality/static prop shadows nog
  verlagen via `AND`/`min`) - bewust bewaard als escape hatch in plaats van verwijderd.

`resolveWorldPerformanceForRenderer()` in `apps/web/public/shared/world-runtime.js` (nieuw
geëxporteerd, puur, geen WebGL nodig) implementeert dit en wordt zowel door de live runtime als
door `scripts/smoke-test.js` gebruikt.

### Editor static/scatter/ground shadows werken nu per mode

`activeModePerformance()` geeft nu voor editor **en** game een volledig gevuld object terug
(`staticPropCastShadows`, `staticPropReceiveShadows`, `scatterCastShadows`, `scatterReceiveShadows`,
`groundReceiveShadows`, shadow quality/map/camera/bias/type). `staticPropShadowOptions()` en
`scatterShadowOptions()` waren al mode-aware via `activeModePerformance()` - de bug zat in de data,
niet in die functies. Een nieuwe `groundShadowOptions()` maakt ground-tile `receiveShadow` ook
mode-correct (`editorGroundReceiveShadows`/`gameGroundReceiveShadows`), gebruikt op alle drie de
plekken waar een ground-tile mesh wordt aangemaakt (chunked tile, terrain-streaming tile, full
ground plane).

### Shadow presets (DEEL H)

`SHADOW_QUALITY_MAP_SIZES` / `SHADOW_QUALITY_CAMERA_SIZE_FALLBACK` / `SHADOW_QUALITY_TYPE_FALLBACK`
in `world-runtime.js`:

| quality | mapSize (auto) | cameraSize (auto) | type (auto) |
| --- | --- | --- | --- |
| off | 0 | 60 | basic |
| low | 512 | 80 | basic |
| medium | 1024 | 60 | pcf |
| high | 2048 | 45 | pcfSoft |

Zodra Kevin `editorShadowMapSize`/`gameShadowMapSize` of `...ShadowCameraSize`/`...ShadowCameraFar`
invult (waarde > 0), wint die waarde altijd - de tabel hierboven is alleen de fallback voor "niet
ingevuld" (`0`). Dit is de directe repair voor de te-brede shadow-frustum die boomschaduwen liet
verblobben: een editor op `high` gebruikt nu standaard een `cameraSize` van 45 in plaats van de
oude gedeelde 60, met een scherpere `mapSize` (2048) en `pcfSoft`.

### `sanitizeNonWorldShadowCasters` en shadow diagnostics

Debug/helper/chunk-overlay/selectie-meshes bleken al `castShadow`/`receiveShadow` op `false` te
hebben (THREE's default), maar er was geen garantie of zichtbaarheidscontrole. Nieuw:

- `sanitizeNonWorldShadowCasters(root)` zet `castShadow`/`receiveShadow` hard op `false` voor een
  hele object-tree; aangeroepen na het (her)bouwen van `selectionHelper`, `transformGuide`,
  `terrainEditorOverlay`, `scatterEditorOverlay` en `chunkDebugOverlay`.
- `debugState().world.shadowDiagnostics` telt per categorie (`chunkOverlayShadowCasters`,
  `helperShadowCasters`, `debugShadowCasters`, `selectionShadowCasters`) en apart voor echte content
  (`scatterShadowCasters`, `staticPropShadowCasters`), zodat een toekomstig "ronde schaduw"-rapport
  meteen bewezen kan worden in plaats van geraden.

### Dubbele chunk/terrain preview

- `editorDebugChunkOverlayVisible`/`gameDebugChunkOverlayVisible` (nieuw, default `false`) is een
  extra gate bovenop de bestaande chunk-loading-node `debugOverlay`-vlag
  (`state.overlayVisible = state.enabled && state.debugOverlay && activeModePerformance().debugChunkOverlayVisible === true && ...`).
  Dit is de directe fix voor "de dubbele tegelgroep staat standaard aan" - de kleurgecodeerde
  debug-tiles zijn nu standaard uit.
- `removeDuplicateRuntimeGroups()` (nieuw) verwijdert elk overtollig object met de naam
  `"GK runtime terrain visuals"` of `"GK chunk debug overlay"` uit de scene, en verwijdert elk
  exemplaar dat per ongeluk als camera-child hangt. Aangeroepen in `clearContent()`, in `setWorld()`
  (na `restoreViewState()`) en vóór elke `rebuildChunkDebugOverlay()`.
- `debugState().world.overlayDiagnostics` rapporteert `terrainRuntimeGroups`,
  `chunkDebugOverlayGroups`, `cameraChildOverlayGroups`, `sceneChildOverlayGroups`,
  `duplicateOverlayFound`, `removedDuplicateOverlays`.

## Publish read-model (`world.performance`)

```js
world.performance = {
  shared: { smoothShading, fogColor, fogDensity },
  editor: { pixelRatioCap, fogEnabled, shadowsEnabled, shadowQuality, shadowMapSize,
            shadowCameraSize, shadowCameraFar, shadowBias, shadowNormalBias, shadowType,
            staticPropCastShadows, staticPropReceiveShadows, scatterCastShadows,
            scatterReceiveShadows, groundReceiveShadows, debugChunkOverlayVisible },
  game: { performanceProfile, performanceProfileAppliesDefaultsOnly, pixelRatioCap, fogEnabled,
          shadowsEnabled, batchStaticProps, batchScatterProps, ...zelfde shadow/prop-velden als editor },
  compatibility: { usedLegacySharedShadowFields },
  gamePerformanceProfile // legacy top-level mirror voor bestaande /game/ query-string override
}
```

## Debug commands

```js
window.__GK_EDITOR_RUNTIME.debugState().world.performance
window.__GK_EDITOR_RUNTIME.debugState().world.performanceProfile
window.__GK_EDITOR_RUNTIME.debugState().world.shadowDiagnostics
window.__GK_EDITOR_RUNTIME.debugState().world.overlayDiagnostics

window.__GK_GAME_RUNTIME.debugState().world.performance
window.__GK_GAME_RUNTIME.debugState().world.performanceProfile
window.__GK_GAME_RUNTIME.debugState().world.shadowDiagnostics
window.__GK_GAME_RUNTIME.debugState().world.overlayDiagnostics
```

Let op: de bestaande `debugState().world.performance` (frame/render performance-cijfers zoals
`frameMs`/`drawCalls`) heet nu `debugState().world.frameStats` - die naam was al in gebruik voor iets
anders en moest wijken voor de nieuwe settings-snapshot hierboven. Niets in de repo las die sleutel
voor frame-stats rechtstreeks vanaf `debugState()` (HUD-nodes gebruiken hun eigen
`buildPerformanceSnapshot()`-pad), dus dit is een veilige hernoeming.

## Hoe Kevin dit instelt

1. **Editor shadows scherp zetten**: World Settings -> Editor World Settings ->
   `editorShadowQuality = high`. Laat `editorShadowMapSize`/`editorShadowCameraSize` op `0` voor de
   automatische high-preset (2048 / 45), of vul een eigen waarde in om te overrulen.
2. **Editor static props shadows aanzetten**: `editorStaticPropCastShadows = true` (en houd
   `editorShadowsEnabled = true`). Een huis in de editor krijgt dan een schaduw.
3. **Game shadows met een laptop-profiel**: `gamePerformanceProfile = laptop`,
   `gamePerformanceProfileAppliesDefaultsOnly = true` (default), `gameShadowsEnabled = true`,
   `gameShadowQuality = high`. Het laptop-profiel blijft actief voor de rest van de nog niet
   node-gestuurde velden, maar shadows blijven aan op high.
4. **Debug chunk overlay** (de kleurgecodeerde active/preload/loaded tegels) blijft standaard uit;
   zet `editorDebugChunkOverlayVisible`/`gameDebugChunkOverlayVisible` aan om ze tijdelijk terug te
   zien voor debugging.

## Tests

`scripts/smoke-test.js` uitgebreid met:

- `runWorldSettingsSplitChecks()` (nieuw, pure functions, geen server nodig): fresh-node defaults,
  legacy-only fallback (`compatibility.usedLegacySharedShadowFields === true`), nieuwe velden
  winnen van legacy zodra ze bestaan, en de twee performance-profile-scenario's uit DEEL C
  (defaults-only laat een handmatige `gameShadowQuality=high` staan; met
  `gamePerformanceProfileAppliesDefaultsOnly=false` wint het profiel weer, als bewuste escape
  hatch).
- `runShadowPolicyChecks()` herschreven voor de nieuwe per-mode preset-tabel (512/1024/2048,
  cameraSize-fallback 80/60/45) en om te bewijzen dat een lagere `gameShadowQuality` de
  `editorShadowQuality` niet beïnvloedt en andersom.
- De bestaande grote publish-integratietest (draft/game world) is uitgebreid met assertions die
  bewijzen dat editor- en game-shadowQuality/staticPropCastShadows via de echte
  node-graph-publish-flow onafhankelijk van elkaar gepubliceerd worden.

Wat *niet* geautomatiseerd getest is (geen headless-WebGL harness in deze repo): het daadwerkelijk
zichtbaar worden van een schaduw op een huis in de editor-viewport, en het optisch verdwijnen van de
dubbele chunk-tegelgroep op een screenshot. Dat is de handmatige Kevin-check hieronder.

## Handmatige Kevin-check

1. **Editor settings**: World Settings openen, zie de drie secties (Shared World / Editor World
   Settings / Game World Settings). Zet `editorShadowQuality = high` en
   `editorStaticPropCastShadows = true`. Een huis in de editor moet nu een schaduw werpen.
2. **Game settings**: `gamePerformanceProfile = laptop`, `gameShadowsEnabled = true`,
   `gameShadowQuality = high`, `gameStaticPropCastShadows = true`. Open `/game/` - huis/boom
   shadows moeten werken ondanks het laptop-profiel.
3. **Boomschaduw**: geen ronde/cirkelachtige helper-shadow-vlekken meer.
   `window.__GK_EDITOR_RUNTIME.debugState().world.shadowDiagnostics` moet tonen:
   `chunkOverlayShadowCasters === 0`, `helperShadowCasters === 0`, `selectionShadowCasters === 0`.
4. **Dubbele chunk groep**: editor-viewport bekijken - geen tweede, kleurgecodeerde tegelgroep meer
   zichtbaar bovenop de grond (die stond aan via de default-`debugOverlay`, nu uit via
   `editorDebugChunkOverlayVisible = false`). `window.__GK_EDITOR_RUNTIME.debugState().world.overlayDiagnostics`
   moet tonen: `cameraChildOverlayGroups === 0`, `duplicateOverlayFound === false`.
5. **Fase 8.5 regressie**: bomen/scatter verdwijnen en verschijnen nog steeds op tijd (niet pas na
   het midden van een chunk); save/reload laat geen lege wereld zien.

## Wat bewust niet is gedaan

- geen nieuwe chunk streaming rewrite (Fase 8.5's coverage/build-queue/hysteresis logica is
  ongewijzigd gelaten);
- geen minimap, geen terrain rewrite, geen path/water/surface segmentatie, geen database chunk
  compiler, geen multiplayer, geen nieuwe profilerfase;
- `gamePerformanceProfile` is niet verwijderd, alleen begrijpelijk en overridable gemaakt;
- geen "zet alles op quality"-workaround - editor en game blijven onafhankelijk instelbaar.

## Acceptatie

Akkoord zodra Kevin bevestigt dat:

- World Settings helder gesplitst zijn in Shared / Editor / Game;
- editor static prop shadows werken en game static prop shadows blijven werken, onafhankelijk van
  elkaar;
- een performance profile handmatige shadow-keuzes niet meer onzichtbaar overschrijft;
- boomschaduwen geen rare ronde helper/chunk/selection-shadows meer zijn;
- de dubbele camera-onafhankelijke chunk/terrain-tegelgroep weg is uit de standaardweergave;
- Fase 8.5's streaming correctness (pop-in timing, save/reload) intact blijft.
