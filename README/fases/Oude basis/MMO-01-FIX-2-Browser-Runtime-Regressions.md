# MMO-01-FIX-2: Browser Runtime Regression Fix

## Doel

MMO-01-FIX-1 controleerde de MMO-01-backend (account/login/WebSocket/persistence)
tegen het contract en vond daar één gat (`ws` als directe dependency). Die fix
bleef staan en is niet teruggedraaid. Maar de echte `/game/` browser-runtime was
kapot: muis/touch deden niets, WASD voelde verkeerd, animatie bleef lopen,
Performance HUD stond linksboven i.p.v. rechtsboven, en Bounded Area Scatter met
"Boundary blocks player" hield de speler niet tegen.

Deze fix pakt precies dat aan: de client-side game-runtime in de browser, met
`externalPlayerAuthority: true` (server-authoritative) intact.

## De echte hoofdoorzaak: `#hud` werd leeggemaakt door de runtime

Voordat de losse fixes hieronder werden gebouwd, is eerst uitgezocht **waarom**
Kevin de HUD/logout-knop/touch-knoppen niet kon zien of gebruiken. Dat bleek
niet (alleen) een kwestie van ontbrekende waarden, maar een structurele bug:

- `apps/web/public/shared/world-runtime.js` heeft een `buildHud()` die bij het
  aanmaken van de runtime in game-mode **onvoorwaardelijk** `hudElement.innerHTML
  = ""` doet, om daarna zelf `hud_text`/`debug_performance_hud`-modules in dat
  element te zetten. Dat gebeurt voor **elke** game-runtime, ongeacht
  `externalPlayerAuthority`.
- Vóór MMO-01 was `apps/web/public/game/index.html` se `#hud` element altijd leeg
  (`<div id="hud" class="hud"></div>`) — puur gereserveerd voor de runtime zelf
  (geverifieerd via git-historie, fase 8: `0c06936`).
- De MMO-01-commit (`a4b2538`) heeft `.status-panel` (User/Player/Session/
  Position/WS-pill/Refresh/Logout-knop) en `#touchControls` (de ▲◀▼▶-knoppen)
  **binnen** datzelfde `#hud`-element geplaatst.
- Gevolg: zodra `createGkWorldRuntime` in `/game/` aanmaakt, werden
  `.status-panel` en `#touchControls` **direct uit de DOM verwijderd**. De
  JS-variabelen in `game.js` (`hudUser`, `hudPosition`, `logoutButton`, ...)
  bleven verwijzen naar de losgekoppelde (verwijderde) nodes, dus
  `updateHud()` "werkte" zonder fout te geven, maar er was niets meer
  zichtbaar op het scherm — en de touch-knoppen waren niet alleen onzichtbaar
  maar ook fysiek weg.

Dit verklaart in één keer waarom Kevin de status/HUD/logout/touch-knoppen niet
kon vinden: ze bestonden een fractie van een seconde, en verdwenen daarna
onherroepelijk uit de pagina.

**Fix:** `.status-panel` en `#touchControls` zijn in
`apps/web/public/game/index.html` verplaatst naar buiten `#hud`, als broertjes
van `#hud`/`#gameCanvas`/`#gameOverlay` binnen `#gameRoot`. `#hud` is weer
exact wat de runtime verwacht: leeg, uitsluitend voor de node-gedreven
hud-modules. Z-index is opnieuw ingesteld in `apps/web/public/game/styles.css`
zodat de stacking-volgorde correct blijft: `.status-panel`/`.touch-controls`
(z-index 1) onder `.hud` (z-index 2, met `.perf-hud`/`.hud-text` daarbinnen op
2/3) onder `.overlay` (z-index 10, altijd bovenop bij laden/login-prompt).

## Fix 1 — Runtime-helpers voor external-authority mode

`apps/web/public/shared/world-runtime.js` had de oude input (`gamePointerDownHandler`,
`gameKeyDownHandler`, ...) volledig uitgeschakeld via
`if (!externalPlayerAuthority) { ... }`, zonder vervanging. Er is gekozen voor
de voorkeursoplossing uit de opdracht: de runtime blijft server-authoritative,
maar biedt nu expliciete helpers die `game.js` gebruikt om zelf input/collision
af te handelen:

- `getPlayerState()` — alias van de bestaande interne `snapshotPlayerState()`.
- `getCameraGroundBasis()` — roept de bestaande `updateCameraGroundBasis()` aan
  en geeft `{ forward: {x,z}, right: {x,z} }` terug, exact dezelfde basis die
  de oude (nu uitgeschakelde) editor-achtige input gebruikte voor WASD.
- `resolvePlayerMovementIntent(start, desired, options)` — dunne wrapper rond
  de al bestaande `resolveMovement`, met de actuele wereld (`world.ground`,
  `activeSolids`) en walkability-index (die `setWorld()` al bijhoudt via
  `buildWalkabilityIndex`). Geeft `{x,y,z,blocked,collided}` terug.
- `setPlayerAnimationState(animationState)` — forceert idle/walk/run zonder de
  positie te wijzigen, gebruikt `playAnimationState` die al bestond.

Al deze functies zijn toegevoegd aan de `return {...}` van
`createGkWorldRuntime` en dus publiek beschikbaar op
`window.__GK_GAME_RUNTIME`. `screenToGround` bestond al en is ongewijzigd
hergebruikt.

## Fix 2 — Muis/vinger/click-to-move hersteld

`apps/web/public/game/game.js` bindt nu zelf pointer-events op `#gameCanvas`
(`bindPointerControls`), onafhankelijk van de (uitgeschakelde) oude
runtime-input:

- `pointerdown` (linkermuisknop of touch) → capture, `runtime.screenToGround()`
  → `state.pointer.target`.
- `pointermove` (terwijl actief) → target opnieuw berekenen (drag = doel
  verplaatst mee).
- `pointerup`/`pointercancel`/`lostpointercapture` → pointer inactief, target
  weg, character stopt en wordt idle (zie Fix 5).

Toetsenbord-invoer (WASD/pijltjes) en de touch-knoppen wissen het pointer-doel
bij indrukken, zodat besturingsvormen elkaar niet tegenwerken.

## Fix 3 — WASD is weer camera-relatief

`currentMoveVector()` in `game.js` gebruikte hardcoded wereldassen
(`z += 1` voor W). Dat is vervangen door `state.runtime.getCameraGroundBasis()`:
W/S bewegen langs `forward`/`-forward`, A/D langs `-right`/`right`, exact zoals
de oude (editor-)runtime dat deed. Diagonale beweging blijft genormaliseerd
(zelfde snelheid als recht vooruit).

## Fix 4 — Movement-intent -> server -> database (geverifieerd, geen wijziging nodig)

De server-kant (`src/server/mmo-service.js`) bleek al correct: `applyPositionIntent`
gebruikt `resolveMovement` met de gepubliceerde `walkabilityIndex`, verhoogt
`revision`, broadcast `player:state_changed` met `sourceSessionId`, en
`schedulePersist` schrijft (gedebounced, 250ms) naar `player_positions`. Dat
pad werkte al voor toetsenbord-input; het echte gat zat in de client (muis/
touch deden niets, dus er werd nooit een intent verstuurd — zie Fix 2/3/6).

## Fix 5 — Idle/walk/run animatie hersteld

`stepMovement()` in `game.js` deed voorheen een kale `return` zodra er geen
input was, zonder de animatie ooit terug te zetten naar `idle` — de laatste
`walk`/`run`-state bleef eeuwig hangen. Nu:

- Geen input (toetsenbord én pointer) → `setMovementAnimationState("idle")`
  (idempotent, geen spam) en één laatste positie-intent geforceerd verstuurd
  zodat andere devices ook de stop-state zien.
- Wél input maar netto bewegingsvector ~0 (bv. W+S tegelijk) → ook idle.
  Anders → `walk` of `run` (sprint via Shift), zowel bij toetsenbord- als
  muis/touch-beweging.

## Fix 6 — Client-prediction door collision heen voorkomen

`stepMovement()` paste voorheen `predictedPosition + vector*speed*dt` blind toe,
zonder enige lokale botsingscontrole — de speler liep zichtbaar door bomen/
blockers heen totdat de servercorrectie arriveerde. Nu wordt elke voorspelde
stap eerst door `runtime.resolvePlayerMovementIntent()` gehaald (dezelfde
`resolveMovement`/walkability-index die de server gebruikt), en alleen de
resolved positie wordt lokaal toegepast én naar de server gestuurd.

## Fix 7 — Bounded Area Scatter "Boundary blocks player" bewezen werkend

Server-kant was al correct (`src/server/publish-service.js`:
`buildScatterBoundaryBlockerReadModel` pusht een polygon-blocker naar
`collision.blockers` zodra `boundaryBlocksPlayer` aan staat; al gedekt door
bestaande smoke-test-assertions op regel ~2606-2613). Er ontbrak alleen een
assertion die daadwerkelijk beweging tegen die boundary test — toegevoegd aan
`scripts/smoke-test.js`: een `resolveMovement` van ruim buiten naar diep
binnen de scatter-boundary eindigt niet binnen de polygon (`isPointBlockedByBlocker`
op de resolved positie is `false`, en de afgelegde afstand is duidelijk minder
dan de gewenste afstand). Client-kant loopt nu via Fix 6 altijd door dezelfde
resolver, dus zichtbaar-door-bomen-lopen is opgelost.

## Fix 8 — Performance HUD anchor-CSS

`apps/web/public/game/styles.css` had geen enkele `.anchor-*`-klasse — niet in
`/game/`, niet in de editor. De runtime zet altijd
`"perf-hud anchor-" + (mod.anchor || "top-right")`, maar zonder CSS-regel had
dat geen effect en viel het element terug op de standaard-flow-positie
(zichtbaar linksboven). Toegevoegd: `.anchor-top-left`, `.anchor-top-right`,
`.anchor-bottom-left`, `.anchor-bottom-right`, `.anchor-center` — exact de
opties die `debug_performance_hud`/`ui_hud_text` in `src/shared/node-types.js`
ondersteunen. `.hud-text` (voor `hud_text`-nodes) kreeg dezelfde behandeling.

## Fix 9 — WebSocket/HUD/debug zichtbaar gemaakt

HUD in `/game/` toont nu, naast de al bestaande velden (User/Player/Session/
Position/Sessions/World/WS-status):

- **Revision** (los veld, naast de al bestaande "World · rev X").
- **Last sent** — laatste verstuurde WS-eventtype + tijd geleden.
- **Last received** — laatste ontvangen WS-eventtype + tijd geleden.
- **Last source** — `sourceSessionId` (verkort) van de laatst ontvangen
  `player:state_changed`.
- **Last error** — laatste WS `error`-event (code/message).

`game.js` houdt dit bij in `state.debug` en update het via `updateHud()`.
DevTools-uitleg staat onderaan dit document.

## Fix 10 — Logout in game (geverifieerd, geen wijziging nodig)

`#logoutButton` (nu weer zichtbaar dankzij de `#hud`-fix hierboven) doet
`POST /api/auth/logout` en redirect naar `/login/?next=%2Fgame%2F`. Server-kant
sluit alleen de WebSocket-verbindingen van de eigen sessie
(`closeSessionConnections`); andere sessies/devices van hetzelfde account
blijven verbonden. Dit was al correct en is bevestigd via zowel
`scripts/smoke-test.js` als de nieuwe browser-check.

## Fix 11 — Echte browsertest, niet alleen backend-smoke

`scripts/smoke-test.js` kreeg een nieuwe assertion-groep (server-side
collision tegen de scatter-boundary, zie Fix 7).

Belangrijker: er is een nieuw script bijgekomen,
**`scripts/game-browser-check.js`** (`npm run game:browser-check`), dat Puppeteer
gebruikt om de **echte** `/game/`-pagina in een headless Chromium te draaien —
niet alleen HTTP/WS-calls zoals de bestaande smoke-test. Het script:

1. Start een tijdelijke server + tijdelijke database.
2. Bouwt en publiceert via de admin-editor-API een testwereld (grond, camera,
   speler-character, een Bounded Area Scatter met `boundaryBlocksPlayer: true`,
   een Performance HUD-node met `anchor: "top-right"`).
3. Opent de echte `/login/`-pagina, vult het formulier in en registreert een
   testaccount (`mmo01_fix2_test`) — precies de flow die Kevin doorloopt.
4. Bewijst in de echte browser (niet gemockt):
   - HUD toont User/Player/WS-status.
   - Performance HUD staat daadwerkelijk tegen de rechterkant van het scherm
     (`getBoundingClientRect`), niet meer linksboven.
   - `resolvePlayerMovementIntent` blokkeert beweging door de gepubliceerde
     scatter-boundary.
   - W/S/A/D bewegen exact langs `getCameraGroundBasis()`'s `forward`/`right`
     (cosinus-vergelijking, niet een aangenomen wereldas).
   - Animatie gaat naar `walk`/`run` tijdens bewegen en terug naar `idle` bij
     loslaten — voor toetsenbord, muis-vasthouden én synthetische
     touch-pointer-events.
   - Database (`player_positions`) toont een hogere `revision` en gewijzigde
     x/z na beweging.
   - Refresh en logout/login behouden de laatste serverpositie.
   - Twee sessies van hetzelfde account tonen hetzelfde player-id en live
     WS-connected status.

Zie "Testresultaten" hieronder voor de exacte uitkomst van dit script in deze
omgeving, inclusief een eerlijke uitleg van de ene test (twee-devices-in-één-
proces) die in deze specifieke sandbox niet stabiel dubbel-browser-context kon
draaien door geheugendruk van een gelijktijdig proces — dat exacte scenario is
wel bewezen op protocolniveau via de bestaande MMO-01 smoke-test (twee losse
WebSocket-sessies, live sync in beide richtingen, al aanwezig vóór deze fix en
opnieuw gedraaid).

## Fix 12 — Cache busting

Version-strings in `apps/web/public/game/index.html` en de imports in
`apps/web/public/game/game.js` zijn opgehoogd naar `20260707-mmo01-fix2`.

## Fix 13 — Database-bewijs

Commando om zelf te controleren (tegen de echte productie-achtige database,
niet de tijdelijke test-database van `game-browser-check.js`):

```
cd /var/www/gk
node --experimental-sqlite -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./storage/gk-real-node-editor.sqlite');
console.log(db.prepare('SELECT player_id, world_id, x, y, z, rotation_y, revision, updated_at FROM player_positions ORDER BY updated_at DESC LIMIT 10').all());
"
```

In de automatische browser-check (tijdelijke database) is dit exacte patroon
bevestigd: vóór beweging `revision 1`, na een WASD/muis/touch-sessie
`revision 5` (in één van de testruns), met gewijzigde `x`/`z` — zie
"Testresultaten".

## Waar zie ik dit? (voor Kevin)

1. **Logout** — knop rechtsboven in het statuspaneel in `/game/` (nu weer
   zichtbaar). Uitloggen op mobiel logt de pc niet uit (aparte sessies).
2. **WebSocket** — statuspaneel toont een pil: connecting/connected/
   reconnecting/disconnected. DevTools → Network → WS → `/api/game/live` →
   Messages laat de ruwe frames zien.
3. **Player profile** — statuspaneel toont Player-id. Twee devices met
   hetzelfde account tonen exact dezelfde Player-id.
4. **Serverpositie** — statuspaneel toont Position + Revision. Loop wat, wacht
   twee seconden, en herhaal het `node --experimental-sqlite`-commando hierboven
   — x/z/revision zijn veranderd.
5. **Live sync** — open twee browsers/tabbladen met hetzelfde account, beide
   moeten "connected" tonen; beweeg in de ene, de andere beweegt zonder
   refresh mee.
6. **sourceSessionId** — statuspaneel toont "Last source" (verkort). In
   DevTools staat het volledige veld in het `player:state_changed`-frame.
7. **Muis/vinger/WASD** — klik en houd de muis vast op de grond, of houd een
   vinger op het canvas: de speler loopt ernaartoe en stopt bij loslaten.
   WASD/pijltjes zijn camera-relatief.
8. **Animatie** — lopen = walk/run, stilstaan = idle; geen permanente
   loop-animatie meer.
9. **Performance HUD** — als de node-instelling `top-right` is, staat hij ook
   in de browser rechtsboven.
10. **Bounded Area Scatter** — met "Boundary blocks player" aan kun je niet
    door het scatter-gebied heen lopen; de database-positie komt niet aan de
    andere kant terecht.

## Testresultaten

### `npm run check`

**20/20 bestanden syntactisch ok** (was 19/19 vóór deze fix; `scripts/game-browser-check.js`
is nieuw).

### `npm run smoke`

**SMOKE TEST GESLAAGD**, twee keer op rij gedraaid na alle wijzigingen. Eén keer
faalde een reeds bestaande (niet door deze fix aangeraakte) timing-assertion
("database revision volgt de laatste server-accepted update", 500ms sleep vs.
250ms persist-debounce) — gereproduceerd op de ongewijzigde `main`-branch via
`git stash`, dus een pre-existing sandbox-timing-flake, geen regressie van deze
fix. Alle andere runs (voor en na) waren volledig groen, inclusief de nieuwe
scatter-boundary-assertions.

### `npm run game:browser-check` (nieuw, echte headless-browser test)

Op deze specifieke sandbox (2 CPU/4GB, software-WebGL via SwiftShader, en
tijdens het testen bleek een **gelijktijdig ander proces** in dezelfde omgeving
óók zware Puppeteer/Chrome-taken te draaien) zijn er meerdere volledige runs
gedaan. De kernbevindingen, consistent over meerdere onafhankelijke runs:

**Altijd groen, elke run:**
- Registreren via het echte `/login/`-formulier logt in en stuurt naar `/game/`.
- HUD toont User/Player-id/WS "connected" — bevestigt de `#hud`-fix.
- Performance HUD-element zit tegen de rechterkant van het scherm met class
  `anchor-top-right`.
- `resolvePlayerMovementIntent` blokkeert beweging door de gepubliceerde
  scatter-boundary (`blocked: true`, beweging stopt vóór het midden van het
  gebied).
- W/S/A/D-verplaatsingsvectoren zijn (bijna) perfect (anti-)parallel aan
  `getCameraGroundBasis()`'s `forward`/`right` (cosinus 1.00 / -1.00 in beide
  volledige runs) en onderling loodrecht — WASD is aantoonbaar camera-relatief,
  niet hardcoded wereldas.
- Animatie: `walk`/`run` tijdens bewegen, `idle` na loslaten — voor
  toetsenbord, muis-vasthouden én synthetische touch-pointer-events.
- Muis- en touch-drag verplaatsen de speler merkbaar en stoppen bij loslaten.
- Logout stuurt terug naar `/login/`; opnieuw inloggen behoudt exact dezelfde
  x/z-positie.

**Bevestigd in minstens één volledige run:**
- Database-`revision` liep op van 1 naar 5 na een reeks WASD/muis/touch-
  bewegingen, met bijbehorende x/z-wijziging in `player_positions` — het volledige
  pad input → collision → WS → server → debounced persist is aantoonbaar
  intact.
- Refresh behoudt de laatste serverpositie.

**Niet stabiel te reproduceren in deze specifieke sandbox:**
- Het exacte moment waarop de HUD-tekst een net-verzonden revision toont (een
  paar honderd milliseconden timing-marge tussen syntetische input, WS-broadcast
  en DOM-update) faalde in één run onder zware gelijktijdige CPU-belasting;
  opgelost door op de HUD-tekst te pollen in plaats van een vaste wachttijd.
- De twee-devices-live-sync-stap (twee volledige browser-contexts tegelijk)
  liep tegen `Network.enable timed out`/geheugen-uitputting aan zodra de
  sandbox onder de ~50MB vrij geheugen kwam (mede door het genoemde
  gelijktijdige externe proces). Dit is een omgevingsbeperking van deze
  specifieke sandbox, geen aanwijzing voor een productbug: hetzelfde scenario
  (twee sessies, zelfde account, live sync in beide richtingen,
  `sourceSessionId`, revision-reconciliatie) wordt al onafhankelijk bewezen
  door de bestaande MMO-01-smoke-test via twee losse lichte WebSocket-clients
  (geen volledige browser nodig), en die test bleef groen.

`scripts/game-browser-check.js` ruimt zijn eigen ge-uploade test-assets op
(bestandspaden uit de asset-service-response) en veegt eigen vastgelopen
`generate-glb-thumbnail.cjs`/Xvfb-processen weg in de `finally`-cleanup, zodat
herhaald draaien deze sandbox niet permanent volstouwt.

**Bekende opruim-actie voor Kevin:** tijdens het debuggen van dit script zijn
enkele testmodel-uploads (`assets/uploads/asset_*.glb` met bijbehorende
`.tmp.png`-thumbnails, gedateerd vandaag) in de echte projectmap beland omdat
de asset-upload-opslag niet aan de tijdelijke testdatabase gebonden is. De
duidelijk herkenbare bestanden (`browser-check-wizard.glb`/`browser-check-tree.glb`)
zijn al verwijderd; de overige automatisch benoemde `asset_<uuid>.glb`-bestanden
van vandaag zijn expres niet blind verwijderd (kon niet met zekerheid worden
vastgesteld dat ze niet van het gelijktijdige andere proces in deze sandbox
waren) — een korte controle en eventueel opruimen van `assets/uploads/`/
`assets/thumbnails/` bestanden van vandaag wordt aangeraden.

## Aangepaste bestanden

- `apps/web/public/game/game.js` — pointer-/touch-besturing, camera-relatieve
  WASD, idle/walk/run-state-machine, client-side collision-prediction,
  uitgebreide debug-HUD-tracking, cache-busting.
- `apps/web/public/game/index.html` — `.status-panel`/`#touchControls` uit
  `#hud` gehaald (hoofdoorzaak-fix), nieuwe HUD-velden (Revision/Last sent/
  Last received/Last source/Last error), cache-busting.
- `apps/web/public/game/styles.css` — `.anchor-*`-klassen, `.hud-text`-basis,
  z-index-laagverdeling tussen statuspaneel/node-HUD/overlay.
- `apps/web/public/shared/world-runtime.js` — nieuwe publieke runtime-API:
  `getPlayerState`, `getCameraGroundBasis`, `resolvePlayerMovementIntent`,
  `setPlayerAnimationState`.
- `scripts/smoke-test.js` — nieuwe assertions dat de scatter-boundary
  daadwerkelijk beweging blokkeert (niet alleen dat hij gepubliceerd wordt).
- `scripts/game-browser-check.js` — **nieuw**, echte headless-browsertest van
  `/game/` (zie Fix 11).
- `package.json`/`package-lock.json` — `puppeteer` als directe dependency
  toegevoegd (was alleen transitief via `@shopify/screenshot-glb`, dezelfde
  categorie risico als de eerdere `ws`-fix); nieuw npm-script
  `game:browser-check`.

## Niet in scope (bewust niet aangeraakt)

Zelfde lijst als MMO-01-FIX: character select, inventory, combat, enemy/item-
persistence, admin delete, sharding, zones, interest management, nieuwe
game-backend, grote architectuurherziening. Ook niet aangeraakt: `scripts/perf-game.js`
(bleek los van deze fix al mogelijk stale te zijn t.o.v. de MMO-01-auth-gate op
`/game/`, maar dat is een apart, ongerelateerd script buiten de opdracht van
deze fix).
