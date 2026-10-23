# MMO-01-FIX-4: Smooth Movement, Remote Animation, MMO Debug Node, Tab Recovery

## Doel

Laatste MMO-01-afrondfix vóór MMO-02. Kevin meldde na FIX-3:

- MMO debug is nog steeds geen node in de editor (hardcoded panel).
- Beweging voelt stug/hakkerig.
- Movement blijft soms hangen.
- Scherm B (zelfde account, ander device) toont geen animatie voor de speler.
- Na wachten/tab-wisselen springt de speler terug naar een oude plek.

Geen MMO-02, geen character select, geen inventory, geen combat, geen nieuwe
architectuur — puur: movement smoothing, remote animation-state, tab/visibility
recovery, en een echte node voor MMO debug.

## Eerst gecontroleerd: stond FIX-3 al in Git?

Ja. `git log` toonde `5e7c32e mmo-01-fix-3` als laatste commit, `git status`
was schoon, en `apps/web/public/game/{index.html,game.js}` bevatten al
`?v=20260707-mmo01-fix3`, `sendPositionIntentViaHttp`, `mmoDebugToggle`, en
géén `touchControls` meer. FIX-3 was dus al volledig in `main`; er is niets om
alsnog te committen uit een eerdere sessie.

## Twee bugs gevonden tijdens het bouwen van de revision-guard

Voordat FIX-9 (revision guard) zin heeft, moesten twee onderliggende bugs eruit
— anders zou de guard het juist erger maken:

1. **`player:state_changed` verloor zijn revision/updatedAt/sourceDevice op de
   client.** `mmoService.publicStateChange()` stuurt die velden als *siblings*
   naast `position` (`{ position: {x,y,z,rotationY}, revision, updatedAt,
   sourceSessionId, sourceDevice }`), maar `game.js`'s
   `updateServerPositionFromBroadcast()` deed `clonePosition(payload.position ||
   payload)` — dat pakt alléén het geneste `{x,y,z,rotationY}`-object, dus
   `revision` viel terug op `0` bij **elke** live broadcast. Dat betekende dat
   `state.position.revision` bij elke `player:state_changed` naar `0` sprong
   (zichtbaar als een flikkerende "Rev 0" in de HUD) en dat een revision-guard
   hier bovenop zonder deze fix alle volgende updates blijvend zou zijn gaan
   negeren. Fix: `updateServerPositionFromBroadcast` leest nu expliciet de
   top-level velden naast de geneste positie.
2. **`player.reconcileDurationMs` deed niets.** `setPlayerState()` in
   `world-runtime.js` zette een `reconcileDurationMs` op de speler, maar de
   lerp in `updatePlayer()` gebruikte een vaste factor (`delta * 10`,
   geclamped) die dat getal nooit las. Voor `externalPlayerAuthority`-mode
   betekende dit dat élke servercorrectie — hoe klein ook — een nieuwe
   "snap-achtige" lerp herstartte op vaste snelheid, ongeacht de gevraagde
   duur. Omdat de oude code *elke* server-update (ook submillimeter-afwijkingen)
   als correctie behandelde, herstartte dit tientallen keren per seconde: dát
   is zeer waarschijnlijk de kern van "stug/hakkerig". Fix: `player.pos` en
   `player.facing` worden nu tijd-gebaseerd geïnterpoleerd van
   `reconcileStart` naar `reconcileTarget` over `reconcileDurationMs`
   (`player.reconcileElapsedMs` bijgehouden per frame), zodat FIX-1's
   `OWN_RECONCILE_MS`/`REMOTE_RECONCILE_MS` nu ook echt het tempo bepalen.

## FIX 1/2 — Smoothing thresholds + send-rate

`apps/web/public/game/game.js` volgt nu drie zones per servercorrectie i.p.v.
elke update hard te verwerken:

```
OWN_SMALL_CORRECTION_THRESHOLD = 0.75   // eigen sessie: negeren, geen zichtbare correctie
OWN_HARD_CORRECTION_THRESHOLD  = 3.0    // eigen sessie: direct snappen (echte desync)
REMOTE_HARD_CORRECTION_THRESHOLD = 5.0  // andere sessie: direct snappen
OWN_RECONCILE_MS    = 180
REMOTE_RECONCILE_MS = 140
MOVE_SEND_INTERVAL_MS = 66  // ~15/s (was 50ms/20s)
```

`updateServerPositionFromBroadcast()`: eigen sessie onder 0.75m → alleen
`authoritativePosition`/`state.position` bijwerken, runtime niet aanraken.
Tussen 0.75–3m → smooth reconcile (180ms). Boven 3m → direct snappen. Andere
sessie (remote) volgt altijd de serverpositie, smooth tot 5m, anders snap.
`predictedPosition` wordt in beide gecorrigeerde gevallen meteen bijgewerkt
zodat lokale dead-reckoning niet blijft doorbouwen op een verouderde
baseline — alleen de *render* wordt smooth gemaakt, niet de volgende
inputberekening.

## FIX 3 — Tab/blur/visibility recovery

Nieuw in `game.js`: `handleInputCancel()`, `handleVisibilityChange()`,
`handleWindowFocus()`, `handlePageShow()`, gebonden op `blur`,
`visibilitychange`, `focus`, `pageshow`, `beforeunload`, `pagehide`. Bij
verbergen: input clearen + forced idle-send. Bij terugkomen:
`state.lastFrameAt = 0` en een volledige `refreshState()` (haalt
`/api/game/player` opnieuw op, past hem toe met `keepPrediction:false`, en
vraagt de WS-state opnieuw op) — dus de eerste beweging na terugkomen start
altijd vanaf de laatste servertruth, nooit vanaf een stale lokale predictie.

## FIX 4 — Remote same-account animatie

`sendMovementIntent()` stuurt nu `moving`/`animationState` mee in de
`player:position_intent`-payload. Server (`mmo-service.js`):
`extractMoveIntent()` valideert `animationState` tegen een allowlist
(`idle`/`walk`/`run`), `applyPositionIntent()` zet het (samen met `moving`) op
het in-memory cache-record — **niet** in de database** (presentatie-only) —
en `publicStateChange()`/`publicPositionForPlayer()` geven het door in de
broadcast. Client past dit toe via `applyRuntimePosition(..., {animationState})`
voor de andere sessie. Stoppen (`clearMovementInput`) stuurt altijd een forced
`animationState:"idle", moving:false`.

## FIX 5 — Centrale `clearMovementInput()`

Eén functie clear't alle input (WASD/sprint/pointer), zet animatie op idle, en
forceert een directe idle-send. Aangeroepen bij: keyup (als geen beweging meer
actief is), pointerup/pointercancel/lostpointercapture, window blur, document
hidden, ws close, logout, beforeunload/pagehide, en de "movement settled"-tak
in `stepMovement`. Geen los pad meer dat alleen een deel van de input clear't.

## FIX 6/7 — Debug MMO HUD is nu een node

Nieuw node-type `debug_mmo_hud` in `src/shared/node-types.js` (groep "UI",
zelfde patroon als `debug_performance_hud`): `hudId`, `enabled`, `anchor`,
`compact`, `startCollapsed`, en één show-flag per veld (`showWsStatus`,
`showUser`, `showPlayer`, `showSession`, `showPosition`, `showRevision`,
`showSessions`, `showLastSent`, `showLastReceived`, `showLastSource`,
`showLastError`). `src/server/publish-service.js` publiceert het read-model
(`buildMmoDebugHudReadModel`) in `world.ui` zodra de node aan
`game_output.ui` hangt — exact dezelfde generieke `incomingNodes()`-resolutie
als de bestaande UI-nodes, dus geen speciale server-casing nodig.

`apps/web/public/game/game.js` bouwt het paneel nu volledig in JS
(`buildMmoDebugHudDom`) op basis van `state.gameWorld.ui`, alleen als er een
`debug_mmo_hud`-node gepubliceerd is (`resolveMmoDebugConfig`). Geen node →
geen paneel. Voor development kan `?debug=mmo` het paneel tonen met
default-waarden zonder dat er een node hoeft te bestaan. De losse
`#hudUser`/`#wsPill`/`#logoutButton`/... ids zijn dezelfde als voorheen (nu
dynamisch aangemaakt) zodat bestaande tooling ze blijft vinden.

## FIX 7 — index.html opgeschoond

`apps/web/public/game/index.html` bevat nu alleen `#gameRoot` →
`#gameCanvas`/`#hud`/`#gameOverlay`. Geen vaste status-panel-markup, geen
vaste debug-knop, geen vaste HUD-ids meer in HTML. `styles.css`'s
`.status-panel` is losgekoppeld van een vaste `top/left` en gebruikt nu
dezelfde `.anchor-*`-classes als de andere HUD-modules, plus een
`.status-panel--compact` modifier.

## FIX 8/9 — Revision guard

`apps/web/public/shared/revision-guard.js` is een pure functie
(`shouldApplyServerPosition(currentRevision, nextRevision)`) zonder DOM/netwerk
—expres geëxtraheerd zodat hij zowel door `game.js` als door
`scripts/smoke-test.js` los van een browser bewezen kan worden. Toegepast in
`applySnapshotToRuntime`, `updateServerPositionFromBroadcast`,
`updateFromConnectionSnapshot` en `applyFallbackPosition`: een inkomende
revision lager dan de huidige wordt genegeerd (met `state.debug.lastError`
gezet), zodat een vertraagde WS-frame of stale HTTP-fallback-response de
speler nooit meer terug kan zetten.

## FIX 10 — Cache busting

Alle imports/links naar `fix4` gebracht: `index.html`
(`styles.css?v=20260707-mmo01-fix4`, `game.js?v=20260707-mmo01-fix4`),
`game.js`'s eigen imports van `world-runtime.js`, `node-types.js` en het
nieuwe `revision-guard.js`.

## FIX 11 — Tests

`npm run check`: 21/21 bestanden syntactisch ok (incl. het nieuwe
`revision-guard.js`).

`npm run smoke` (twee keer achter elkaar groen gedraaid): uitgebreid met:
- `debug_mmo_hud`: node aanmaken, koppelen aan `game_output.ui` → publiceert
  `anchor`/`compact`/`startCollapsed`/`show.*`; een tweede, ongekoppelde node
  publiceert niet.
- Remote animatie: een `player:position_intent` met
  `animationState:"run", moving:true` van device B komt als zodanig aan in de
  `player:state_changed` op device A; een vervolg-intent met
  `animationState:"idle", moving:false` ook.
- Revision guard: `runRevisionGuardChecks()` bewijst
  `shouldApplyServerPosition` los van de browser (nieuwere/gelijke revision
  toegepast, oudere genegeerd, cold-state eerste update niet geblokkeerd).

`npm run game:browser-check` (Puppeteer, echte Chrome): op één na alle checks
groen, inclusief de nieuw node-driven debug-HUD (dezelfde ids, nu dynamisch
opgebouwd via een node die het script zelf aanmaakt/koppelt), two-device live
sync, refresh/logout/login persistence, idle/walk animatie, collision. Zie
"Bekende beperking" hieronder voor de twee gefaalde asserties.

## Bekende beperking — twee screen-space asserties in game-browser-check.js

`assertScreenSpaceLeftRight()` (toegevoegd in FIX-3, en volgens die
fase-memory toen nooit echt in een browser gedraaid) faalt: het meet de
schermpositie van de speler 150ms **na** het loslaten van D/A en verwacht dat
die verschoven is. Maar de camera volgt de speler elk frame
(`camTarget.lerp(player.pos, ...)` in `updateCameraGroundBasis`/
`updatePlayer`), dus de speler staat na het loslaten alweer terug in het
scherm-midden — los van of de beweging zelf goed ging. De
`cosineSimilarity`-asserties vlak erboven (wereld-ruimte, dezelfde test)
bewijzen dat de wereld-positie wél correct camera-relatief beweegt (`cos=1.00`/
`-1.00` voor alle vier richtingen). Dit is een pre-existing test-ontwerpissue
uit FIX-3, niet een regressie van FIX-4 — geverifieerd doordat mijn
`reconcileDurationMs`-fix uitsluitend het `externalPlayerAuthority` +
`reconcileActive`-pad raakt (servercorrecties), terwijl gewone WASD-beweging
via `immediate:true` snapt en dat pad nooit aanraakt. Niet aangepast in deze
fix (buiten scope van FIX-4); aanbevolen voor een latere kleine testfix
(meet tijdens het indrukken, niet 150ms na loslaten).

## Wat bewust naar MMO-02 gaat

Character select, inventory, combat, admin delete, en elke nieuwe architectuur
— ongewijzigd, zoals gevraagd.

## Handmatige acceptatie (voor Kevin)

De node-driven debug HUD bestaat alleen ná een handmatige stap: open de
editor, voeg een **Debug MMO HUD**-node toe (groep "UI"), verbind hem met
**Game Output → UI**, en publiceer. Zonder die node/koppeling toont `/game/`
geen debug-paneel meer (met opzet — zie FIX-6). Verder als in de opdracht:
twee browsers/tabs met hetzelfde account, WASD op scherm A terwijl scherm B
walk/run-animatie toont en omgekeerd, W ingedrukt houden + tab wisselen +
terugkomen zonder vastlopen of terugspringen, en de node ontkoppelen/koppelen
rond een publish om te zien dat het paneel verdwijnt/verschijnt.
