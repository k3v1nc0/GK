# Fase 8.5 - Streaming Correctness Recovery

## Waarom deze fase herschreven is

De oorspronkelijke Fase 8.5 focuste op resident counts en batching (blueprint totals vs. live
counts, `InstancedMesh` voor scatter, HUD-budgetten). Die aanpak was inhoudelijk juist, maar
Kevin heeft daarna in een screen recording een ander, zichtbaar bug bewezen:

- bomen/scatter verdwijnen zodra ze buiten de zichtbare/resident chunks vallen;
- wanneer ze terug in beeld zouden moeten komen, verschijnen ze pas veel te laat - pas nadat de
  speler al ongeveer voorbij het midden van het volgende gebied is;
- hetzelfde gebeurt in `/game/`;
- na een aanpassing in de node editor en daarna save/reload is resident content leeg of blijft
  leeg, ook al staat de blueprint data er wel.

Dat is geen gewenste culling - dat is een streaming *timing* bug. Deze fase vervangt de vorige
8.5-richting en repareert die timing, met dezelfde resident/blueprint-scheiding als uitgangspunt.

## Root cause (bewezen, niet giswerk)

Er bleken drie onafhankelijke bugs samen te werken:

1. **Center-only coverage.** `resolveChunkDebugCenter()` + `buildChunkWindow()` bepaalden de
   volledige active/preload/loaded-ring op basis van één enkel punt (camera target of player
   position). Voor `/game/` is dat standaard de *gelerpte* `camTarget`
   (`camTarget.lerp(player.pos, delta * 8)`), die achter de speler aanloopt. Er was geen tweede
   anker, geen camera-viewbounds en geen bewegingsrichting - dus een chunk die de speler al
   raakte kon nog steeds "niet in beeld" tellen volgens de coverage-berekening.
2. **Signature-gated resident sync (de hoofdoorzaak van de late pop-in en de lege wereld).**
   `syncChunkDebugState()` memoized de volledige sync achter een signature die alleen verandert
   als de center-chunk (of policy) verandert. Zodra `residentChunkBuildBudgetPerFrame` (default
   2/frame) een chunk niet in één keer afmaakte, bleef die chunk in `pendingChunkKeys` staan - en
   omdat de signature-cache de hele `syncResidentChunkContent()`-aanroep oversloeg zolang de
   center-chunk niet wijzigde, werd die pending chunk **nooit meer afgebouwd** totdat er weer een
   volledige chunk-grens werd overgestoken. Dat verklaart zowel het "pas na het midden"-gevoel
   (de vorige grensoversteek liet iets pending staan dat pas bij de volgende grensoversteek verder
   kon bouwen) als de lege wereld na save/reload: na `setWorld()` bouwt de engine één keer binnen
   budget, en als daarna niemand beweegt gebeurt er niets meer.
3. **Render loop stopt in de editor terwijl er nog werk openstaat.** De editor gebruikt een
   on-demand render loop (`shouldAnimate` / `renderRequested`). Na `setWorld()` volgt meestal maar
   één render-frame; als er dan nog `pendingChunkKeys` openstaan, kwam er domweg geen volgend frame
   meer om ze te bouwen.

`buildChunkWindow()`'s `maxLoadedChunks`-clipping bleek overigens *niet* stuk: omdat de sort altijd
op Euclidische afstand gebeurt, winnen active chunks (chebyshev ≤ activeRadius) altijd van preload-
chunks (chebyshev > activeRadius) in die sortering, dus actieve chunks werden nooit stilletjes
wegge-clipt. Dat is bevestigd met een bestaande smoke test
(`maxLoadedChunks clipt het game window` in `scripts/smoke-test.js`).

## Nieuw streamingmodel

`apps/web/public/shared/world-runtime.js` kent nu expliciete coverage-zones in plaats van één
center-punt:

- `activeChunkKeys` - gameplay-actieve ring rond het primaire anker;
- `visibleChunkKeys` - unie van de active-ring van het primaire *en* het secundaire anker (player
  vs. camera target, of camera target vs. camera positie in de editor) - dit maakt de coverage
  robuust tegen camera-lag/-offset;
- `forwardChunkKeys` - kleine lookahead in de bewegingsrichting (heading tussen de huidige en de
  vorige positie), zodat een chunk al resident wordt vóórdat de speler hem binnenloopt;
- `preloadChunkKeys` - bestaande preload-ring, aangevuld met de forward-chunks;
- `desiredResidentChunkKeys` - unie van alles hierboven, dit is wat resident moet zijn;
- `unloadSafeChunkKeys` - desired plus de unload-marge ring, de hysteresis-buffer.

### Fix A - `computeStreamingCoverage(options)`

Nieuwe, pure, exported functie naast `buildChunkWindow`. Neemt `{ mode, policy, player, camTarget,
camera, lastPlayerPosition, lastCameraTarget }` en levert bovenstaande zones plus `centerChunk` en
`source` (`"editor-camera"`, `"game-camera"` of `"player"`). Wordt aangeroepen vanuit
`createChunkDebugState()` via de nieuwe helper `streamingCoverageForCenter()`, die de coverage
samenvoegt in `loadedChunkKeys`/`visibleChunkKeys`/`forwardChunkKeys`/`unloadSafeChunkKeys` van de
bestaande chunk-debug-state - dezelfde array die zowel de culling (`collectChunkCullingStats`) als
de resident content sync aanstuurt.

De cache-signature (`buildChunkDebugSignature`) is uitgebreid met een `primary~secondary`
sleutel (`buildCoverageCenterSignatureKey`), zodat een chunk-grens-oversteek van het secundaire
anker (bijv. de speler, terwijl de camera nog lerpt) ook een her-sync triggert.

### Fix B - `prioritizeResidentChunkBuildQueue(options)`

Nieuwe, pure, exported functie die de pending-queue ordent: active eerst, dan visible, dan
forward, dan preload op afstand, dan de rest. Vervangt de oude ad-hoc
`preferred = activeOrder.concat(preloadOrder)`-logica in `syncResidentChunkContent()`.

### Fix C - resident sync blijft draineren, ook zonder chunk-wissel

`syncChunkDebugState()` roept bij een cache-hit (signature ongewijzigd) nu
`drainPendingResidentChunkBuilds(reason)` aan zodra `residentContentState.pendingChunkKeys.length
> 0`. Die functie hergebruikt het laatst bekende venster (`chunkRuntimeState`) om
`syncResidentChunkContent()` opnieuw te draaien, zonder de dure culling/overlay-recompute te
herhalen. Dit is de kernfix voor de "pas na het midden"-pop-in en de lege wereld na reload.

In `syncResidentChunkContent()` zelf worden `activeChunkKeys` + `visibleChunkKeys` nu altijd direct
gebouwd (nooit pending gelaten door het per-frame budget), alleen `forwardChunkKeys` en
`preloadChunkKeys` blijven onder `residentChunkBuildBudgetPerFrame` vallen.

In `renderFrame()` wordt daarnaast `requestRender("resident-pending-drain")` aangeroepen zolang er
`pendingChunkKeys` zijn - dit houdt de editor's on-demand render loop levend totdat de build-queue
leeg is, in plaats van na één frame te stoppen.

### Fix D - `bootstrapResidentContentForCurrentView(reason)`

Wordt aangeroepen aan het einde van `setWorld()`, na `syncChunkDebugState("setWorld")`. Omdat
`syncResidentChunkContent()` active/visible chunks nu altijd direct bouwt, is de wereld op dat
moment meestal al niet-leeg; deze functie controleert dat, drained eventueel nog een keer, en
schrijft het resultaat naar `residentBootstrapState` (zie debug state hieronder). `setWorld()` is
het enige punt waar dit hoeft: editor save/reload, "Save To Game" en `/game/`'s
`pollVersion()`-reload lopen allemaal via `applyViewportWorld()` respectievelijk `loadWorld()`, die
beide op `runtime.setWorld(world)` uitkomen.

### Fix E - unload hysteresis

`syncResidentChunkContent()` unload niet meer zodra een chunk buiten `desiredChunkKeys` valt, maar
pas als hij `RESIDENT_UNLOAD_HYSTERESIS_STREAK` (2) opeenvolgende syncs buiten
`unloadSafeChunkKeys` blijft (bijgehouden in `unloadHysteresisState.candidateStreaks`). Een chunk
die terugkeert binnen de safe-ring reset zijn streak. Dat voorkomt flikkeren wanneer de speler
heen en weer over een chunkgrens beweegt.

## Debug state

```js
window.__GK_EDITOR_RUNTIME.debugState().world.chunkLoading.streamingCoverage
window.__GK_EDITOR_RUNTIME.debugState().world.chunkLoading.contentStreaming
window.__GK_EDITOR_RUNTIME.debugState().world.chunkLoading.residentBootstrap

window.__GK_GAME_RUNTIME.debugState().world.chunkLoading.streamingCoverage
window.__GK_GAME_RUNTIME.debugState().world.chunkLoading.contentStreaming
window.__GK_GAME_RUNTIME.debugState().world.chunkLoading.residentBootstrap
```

- `streamingCoverage` - `{ source, centerChunk, activeChunkKeys, visibleChunkKeys,
  forwardChunkKeys, preloadChunkKeys, desiredResidentChunkKeys, unloadSafeChunkKeys }`;
- `contentStreaming` - ongewijzigd t.o.v. de vorige fase (blueprint vs. resident counts, budgets,
  `pendingChunkKeys` via `enteringChunkKeys`/`leavingChunkKeys`);
- `residentBootstrap` - `{ lastReason, worldGeneration, activeBuiltImmediately,
  visibleBuiltImmediately, preloadBuiltImmediately, pendingAfterBootstrap, emptyScenePrevented }`.

Goede waarden:

- `visibleChunkKeys` bevat chunks die in beeld of net-niet-in-beeld zijn (dubbel anker, dus ook
  bij camera-lag correct);
- `desiredResidentChunkKeys` bevat active + visible + forward + preload;
- `pendingChunkKeys` (in `contentStreaming`) bevat nooit een chunk uit `activeChunkKeys` of
  `visibleChunkKeys` - die worden altijd direct gebouwd;
- `residentBootstrap.emptyScenePrevented === true` direct na `setWorld()`.

## Tests

`scripts/smoke-test.js` bevat een nieuwe `runStreamingCorrectnessChecks()` met, op het niveau van
de pure helpers (geen WebGL-runtime nodig):

1. een boom-chunk vóór de zichtbare rand wordt `forwardChunkKeys`/`desiredResidentChunkKeys` vóór
   de speler de chunkgrens oversteekt (reproduceert het center-only gat met
   `activeRadiusChunks=0`/`preloadMarginChunks=0`, waar het oude gedrag dit had gemist);
2. een loop x=40→60→90→110 bewijst dat de volgende chunk al desired is vóór x=100, niet pas na
   het midden van de volgende chunk;
3. camera-lag robuustheid: met `cameraOnly=true` en een camTarget die nog in de vorige chunk
   hangt, blijft de speler-chunk toch `visibleChunkKeys` via het secundaire anker;
4. `prioritizeResidentChunkBuildQueue` bouwvolgorde: active/visible/forward vóór verre preload,
   preload onderling op afstand gesorteerd, reeds resident chunks niet opnieuw in de queue;
5. unload-marge: chunks binnen `unloadMarginChunks` blijven in `unloadSafeChunkKeys` staan.

Wat *niet* geautomatiseerd getest is (geen headless-WebGL harness in deze repo voor
`createGkWorldRuntime`): het daadwerkelijke drain-gedrag van `drainPendingResidentChunkBuilds` over
meerdere frames, de render-loop-keep-alive in de editor, en de streak-teller van de unload
hysteresis. Die zijn geverifieerd via de handmatige Kevin-check hieronder en via
`debugState().world.chunkLoading.residentBootstrap`/`contentStreaming` tijdens interactief testen.

## Handmatige Kevin-check

### Editor

1. Open de editor, plaats bomen/scatter in meerdere chunks.
2. Beweeg de camera zodat chunks in en uit beeld gaan.
   - Bomen moeten zichtbaar zijn vóórdat ze midden in beeld staan, niet pas erna.
3. `Save Draft`.
   - Content blijft zichtbaar; `debugState().world.chunkLoading.residentBootstrap.emptyScenePrevented`
     is `true`.
4. `Save To Game`.
5. Open `/game/`.
6. Pas een node aan in de editor en save opnieuw.
   - Resident content in de editor blijft aanwezig na de reload (niet leeg).

### Game

1. Open `/game/?gamePerformanceProfile=laptop`.
2. Loop naar een chunkgrens.
   - Bomen vóór je zijn er al vóórdat je de grens bereikt; geen pop-in pas na het midden.
3. Loop terug over de grens.
   - Geen flikkeren (chunks worden niet meteen unloaded en heropgebouwd).
4. `Save To Game` vanuit de editor, terwijl `/game/` open staat.
   - De volgende `pollVersion()`-reload laat geen lege wereld zien.

Console-commando's om te bevestigen:

```js
window.__GK_GAME_RUNTIME.debugState().world.chunkLoading.streamingCoverage
window.__GK_GAME_RUNTIME.debugState().world.chunkLoading.contentStreaming.pendingChunkKeys
window.__GK_GAME_RUNTIME.debugState().world.chunkLoading.residentBootstrap
```

## Wat bewust niet is gedaan

- geen nieuwe profilerfase of performance dashboard;
- geen nieuwe chunk node of terrain rewrite;
- geen database chunk compiler;
- geen multiplayer / interest management;
- geen navmesh streaming, minimap of nieuwe gameplay-systemen;
- geen wijziging aan `buildChunkWindow()`'s `maxLoadedChunks`-clipping - die bleek al correct
  (active chunks winnen altijd van preload chunks in de afstandssortering), dus is met rust
  gelaten om het risico op regressie te beperken.

## Acceptatie

Deze fase is pas akkoord als Kevin in dezelfde video-situatie (editor + `/game/`, bomen die
verdwijnen/terugkomen, save/reload) ziet dat:

- bomen/scatter resident zijn vóórdat ze zichtbaar nodig zijn, niet pas na het midden;
- save/reload de wereld niet meer leegmaakt;
- editor en game hetzelfde correcte gedrag vertonen;
- `debugState().world.chunkLoading.streamingCoverage/contentStreaming/residentBootstrap` de juiste
  waarden tonen tijdens het testen.

Groene `npm run check`/`npm run smoke` zijn een voorwaarde, geen bewijs op zich - het bewijs is de
video-situatie die opgelost is.
