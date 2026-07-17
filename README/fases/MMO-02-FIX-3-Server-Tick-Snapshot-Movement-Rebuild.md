# MMO-02-FIX-3 Server Tick / Snapshot Movement Rebuild

## Waarom FIX-2 niet genoeg was

FIX-2 maakte connect en presence bruikbaar, maar de live movement voelde nog niet als MMO movement:

- remote spelers schokten zichtbaar
- remote reactietijd voelde te laat
- de observer leek achter de speler aan te hobbelen
- de code bleef op een patch-voor-patch route leunen
- movement liep nog te veel via directe positie-echo's in plaats van via authoritative snapshots

Kort: startup was acceptabel, maar live movement was nog geen snapshot-driven MMO loop.

## Oude route die is verwijderd of gedegradeerd

De hoofdroute was te veel:

1. client stuurt absolute of half-absolute positie
2. server verwerkt direct per bericht
3. server broadcast per intent/packet
4. client probeert losse correcties te interpoleren

Dat pad is niet meer de hoofdroute voor normale movement.

Wat nu geldt:

- normale movement loopt via `player:input_state`
- de server simuleert authoritative movement op een vaste tick
- de server broadcast compacte `mmo:snapshot` updates
- `remote_player:state_changed` blijft alleen bestaan voor presence, teleport, forced correction en backward compatibility

## Nieuwe server tick loop

De server heeft nu een vaste MMO world tick van 20Hz en een snapshot cadence van 20Hz.

Belangrijke regels:

- client input is niet de waarheid
- serverpositie is de waarheid
- geen database writes in de tick loop
- persistence gebeurt debounced of bij disconnect/logout
- snapshots zijn world-scoped en sturen alleen changed players

Server state bewaart per player onder meer:

- `playerId`
- `userId`
- `worldId`
- `x`, `y`, `z`
- `rotationY`
- `velocityX`, `velocityZ`
- `moving`
- `animationState`
- `lastProcessedInputSeq`
- `activeControllerSessionId`
- `controllerEpoch`
- `revision`

## Nieuw snapshotprotocol

Normale movement gebruikt nu `mmo:snapshot` als hoofd-event.

Belangrijkste eigenschappen:

- `protocolVersion: 3`
- per world
- alleen changed players
- geen display names in iedere movement snapshot
- geen secrets
- geen full world payload
- geen database data die niet nodig is voor renderen

De snapshot draagt genoeg informatie om remote clients vloeiend te renderen zonder packet-correctie op packet-correctie.

## Nieuwe client input-state flow

De client stuurt geen officiële positie meer voor normale movement.

Nieuwe flow:

- local input capture
- local prediction voor de eigen speler
- `sendInputState()` op 20Hz tijdens beweging
- direct sturen bij start en stop
- kleine heartbeat input alleen als nodig
- WebSocket is het hoofdpad; HTTP is alleen degraderende fallback als WS echt dood is

De client bewaart pending inputs en reconcile't alleen de local player op basis van snapshots en `lastProcessedInputSeq`.

## Nieuwe remote interpolation flow

Remote players gebruiken nu een single snapshot buffer per player.

Regels:

- remote interpolation gebeurt in de client, niet in runtime
- de runtime krijgt al berekende visual state
- snapshot buffers zijn bounded
- geen object rebuild per snapshot in de hot path
- korte extrapolatie mag, maar alleen beperkt
- teleport/snap blijft een expliciet pad

De client laat remote spelers renderen uit een interpolation buffer in plaats van uit losse correcties.

## Same-account multi-device

Hetzelfde account mag op meerdere devices tegelijk ingelogd zijn.

Regels:

- beide sessions blijven bestaan
- dezelfde avatar blijft een enkele player entity
- `activeControllerSessionId` bepaalt wie op dat moment stuurt
- nieuwere input met hogere controllerEpoch of recentere active input wint
- een oude idle/stop input van een vorig device mag de actieve controller niet terugzetten

## Testbewijs

De nieuwe checks bewijzen nu expliciet:

- startup en online-ready blijven werken
- normale movement loopt via `mmo:snapshot`
- snapshots blijven bounded
- snapshotSeq blijft monotonic
- visual freeze blijft bounded
- observer lag blijft bounded
- remote jump blijft bounded
- same-account takeover werkt zonder dubbele avatars
- oude idle input stopt de actieve controller niet

Relevante checks:

- `npm run check`
- `npm run smoke`
- `npm run game:browser-check`

Laatste browser-run liet zien:

- gemiddelde snapshot interval: `40.5ms`
- maximale snapshot interval: `151.9ms`
- maximale visual freeze: `111.0ms`
- maximale observer lag: `180.0ms`
- maximale remote jump: `7.700`
- normale movement loopt via `mmo:snapshot`: `yes`

## Wat Kevin met eigen ogen moet zien

Kevin moet in de echte game zien:

- connect/startup blijft acceptabel
- de andere speler is direct zichtbaar
- remote movement beweegt vloeiend mee
- geen merkbaar achterhobbelen
- geen seconden-late reactie bij normale ping
- geen schokken bij steady movement
- geen idle-sliding
- geen dubbele avatars
- geen ghost players

Als dat visueel klopt, dan is de movement architectuur nu snapshot-driven genoeg voor MMO-02-FIX-3.
