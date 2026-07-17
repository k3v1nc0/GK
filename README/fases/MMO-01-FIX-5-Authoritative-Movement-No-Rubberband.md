# MMO-01-FIX-5: Authoritative Movement, No Rubberband Loops

## Doel

FIX-5 sluit de laatste movement-gaten uit FIX-4:

- de client moet zijn intenties sequencen per browser session;
- de server moet oude intents per session kunnen herkennen en negeren;
- een eigen ACK mag de render niet terugtrekken terwijl er nog nieuwere lokale input pending is;
- tab/focus resyncs mogen geen laad-overlay tonen;
- pointer-hold moet tijdens het indrukken blijven doorlopen en op `mouseup`/
  `lostpointercapture` stoppen;
- de MMO debug HUD moet de nieuwe seq/ack/controller-velden tonen.

Geen nieuwe gameplay, geen character select, geen inventory. Alleen authoritative
movement zonder rubberband-loops.

## Wat is toegevoegd

### Client: sequenced movement intents

`apps/web/public/game/game.js` stuurt nu bij elke movement intent mee:

- `clientSessionId`
- `clientInputSeq`
- `clientIntentId`
- `clientSentAt`
- `controllerEpoch`

De client bewaart de sequencer in `sessionStorage`, zodat een browser session
na reload niet opnieuw op nul begint. De HUD toont nu ook:

- laatst verzonden seq
- laatst ge-ackte seq
- pending intent count
- controller status
- transport
- laatste ignore-reason
- server seq

### Server: stale ignore per browser session

`src/server/mmo-service.js` en `src/server/server.js` accepteren de nieuwe
metadata en houden per `clientSessionId` de laatst geaccepteerde input seq bij.

Bij een oudere of herhaalde seq:

- de update wordt genegeerd;
- alleen de sender krijgt `player:input_ignored`;
- andere sessies krijgen geen nieuwe broadcast;
- de response bevat de metadata die de client nodig heeft om de situatie te
  begrijpen.

### Client reconciliation

De client behandelt authoritative updates nu centraal via een helper die:

- revision/updatedAt beschermt tegen stale snapshots;
- eigen ACKs niet laat terugrollen zolang er nieuwere input pending is;
- remote updates soepel reconcilet;
- silent resyncs zonder overlay uitvoert.

### Click-to-move

Pointer input houdt de screen-positie van de cursor vast zolang de knop
ingedrukt is. De client projecteert dat punt elke tick opnieuw naar de wereld,
zodat de speler blijft doorlopen zolang de cursor vastgehouden wordt. Loslaten
van de pointer of `lostpointercapture` beëindigt de input direct.

### Debug HUD

`debug_mmo_hud` is uitgebreid met nieuwe read-model velden en de game bouwt het
paneel nog steeds volledig node-driven. De HUD kan nu de seq/ack/controller-
status en stale-ignore diagnose tonen.

### Cache bust

Alle game-includes zijn naar `fix5` gezet zodat de browser geen oude JS/CSS
meer uit de cache haalt.

## Tests

De regressies zijn afgedekt in:

- `scripts/smoke-test.js`
- `scripts/game-browser-check.js`

Nieuwe coverage:

- HTTP/WS movement echoes `clientSessionId`, `clientInputSeq`,
  `clientIntentId`, `controllerEpoch`, `activeControllerSessionId`, `transport`
  terug;
- stale HTTP input wordt genegeerd en niet opnieuw gebroadcast;
- debug HUD publiceert de nieuwe show-flags;
- focus-triggered silent resync toont geen loading overlay;
- pointer-hold blijft tijdens ingedrukt houden actief en stopt op release.

## Handmatige acceptatie

Controleer in twee tabs met hetzelfde account:

- beweging op scherm A beweegt scherm B live mee;
- een oude intent met dezelfde `clientSessionId` en `clientInputSeq` wordt
  genegeerd;
- focus/tab-wissel laat geen overlay flikkeren;
- click-hold blijft doorlopen zolang de pointer ingedrukt is en stopt op
  loslaten.
