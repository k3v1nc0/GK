# MMO-02-FIX-1 - Stable WebSocket Status + Smooth Remote Player Movement

Dit is een fixfase op MMO-02. Geen nieuwe gameplay, geen extra systemen, geen character select, inventory, combat, item pickup, admin delete of zone-bouw.

## Klacht van Kevin

Kevin zag drie dingen:

1. De WebSocket-status sprong zonder goede reden naar connecting/reconnecting.
2. Remote spelers schokten of hapten door de scene.
3. De game voelde niet echt ping-bound, maar cadans-bound door code.

## Wat er mis zat

De fixes richten zich op twee lagen:

1. UI/statuslaag: socket events werden te zichtbaar en te snel doorgegeven.
2. Remote-renderlaag: remote updates kwamen te dicht op packet-arrival en konden te hard op de runtime landen.

Concreet zijn de volgende problemen aangepakt:

1. Stale socket events konden de zichtbare status overschrijven.
2. Korte disconnects werden direct als reconnecting zichtbaar.
3. Ping en jitter waren niet zichtbaar genoeg om onderscheid te maken tussen netwerk en code.
4. Remote samples werden niet stabiel genoeg in een interpolation buffer gerenderd.
5. Remote runtime updates mochten niet per packet hard snappen.

## WebSocket status hysteresis

De client houdt nu twee staten bij:

1. `wsRawState` / `wsStateRaw` voor de echte socketfase.
2. `wsVisibleState` / `wsStateVisible` voor de zichtbare HUD-status.

Regels:

1. `connected` mag direct zichtbaar worden zodra de socket echt open is.
2. `connecting` wordt alleen direct getoond bij een echte eerste connect.
3. `reconnecting` wordt pas zichtbaar na een hysteresis van ongeveer `800ms`.
4. Korte blips worden intern geteld, maar niet meteen visueel geflipt.
5. Oude socket-events krijgen een attempt-id guard zodat ze nieuwe state niet overschrijven.

HUD/debug toont nu onder meer:

1. `wsRawState`
2. `wsVisibleState`
3. `reconnectAttempt`
4. `lastCloseCode`
5. `lastCloseReason`
6. `lastConnectedAt`
7. `lastDisconnectedAt`
8. `reconnectSuppressedCount`

## Ping en jitter

De client stuurt periodiek een lichte ping met client timestamp.

1. Client pingt elke `2s`.
2. Server antwoordt goedkoop met pong.
3. De client bewaart een rolling window van `20` RTT-metingen.
4. Daaruit worden `pingMs`, `avgPingMs`, `jitterMs` en `maxPingMs` berekend.

Ook zichtbaar:

1. `lastPongAgeMs`
2. `packetAgeMs`
3. `remoteBufferDelayMs`

Doel:

1. Kevin kan direct zien of de verbinding zelf slecht is.
2. Als ping laag is en remote spelers nog haperen, zit het probleem in code en niet in internet.

## Remote interpolation buffer

Remote players worden nu niet meer packet-voor-packet hard verplaatst.

Model:

1. Server blijft authoritative.
2. Client buffert remote samples per player.
3. Render-loop kiest een renderTime iets in het verleden.
4. Client interpoleert tussen samples.
5. Alleen echte teleports snappen hard.

Belangrijke regels:

1. `REMOTE_TELEPORT_DISTANCE = 5.0`
2. `REMOTE_INTERPOLATION_BASE_DELAY_MS = 120`
3. Adaptieve delay: ongeveer `100-180ms` op basis van jitter
4. Bufferlengte is begrensd
5. Oude samples worden weggepruned
6. Stale updates worden gedropt

Wanneer mag er hard gesnapt worden?

1. Eerste sample.
2. World change.
3. Respawn/reset.
4. Grote correctie boven teleportdrempel.

Wanneer niet?

1. Normale beweging.
2. Kleine netwerkjitter.
3. Onregelmatige packet arrival.

## Remote runtime gedrag

`world-runtime.js` houdt remote players op een eigen root/object aan.

1. `upsertRemotePlayer` maakt alleen aan of ververst metadata.
2. `setRemotePlayerState` werkt transform en animatie bij.
3. De runtime wordt niet opnieuw opgebouwd per remote packet.
4. Lokale player-predictie blijft apart.
5. Remote players gebruiken geen lokale prediction path.

Animatie:

1. `walk/run` tijdens beweging.
2. `idle` na stop.
3. Geen idle schuiven.

## Server broadcast cadence

De server stuurt geen zwaardere payloads.

1. Geen `gameWorld` dumps over WS.
2. Geen extra database writes voor remote movement.
3. Broadcast blijft world-scoped.
4. Same-account sync blijft apart werken.
5. Remote movement updates worden gecoalesced zodat de laatste state wint.

De remote broadcast-route is compact gebleven:

1. `remote_player:joined`
2. `remote_player:state_changed`
3. `remote_player:left`

## Bestanden

Aangepast:

1. [`apps/web/public/game/game.js`](/var/www/gk/apps/web/public/game/game.js)
2. [`apps/web/public/shared/world-runtime.js`](/var/www/gk/apps/web/public/shared/world-runtime.js)
3. [`src/server/mmo-service.js`](/var/www/gk/src/server/mmo-service.js)
4. [`src/shared/node-types.js`](/var/www/gk/src/shared/node-types.js)
5. [`src/server/publish-service.js`](/var/www/gk/src/server/publish-service.js)
6. [`scripts/game-browser-check.js`](/var/www/gk/scripts/game-browser-check.js)
7. [`scripts/smoke-test.js`](/var/www/gk/scripts/smoke-test.js)

## Tests

Uit te voeren:

1. `npm run check`
2. `npm run smoke`
3. `npm run game:browser-check`

Browser-check dekking:

1. WebSocket status stability.
2. Remote smoothness op render-FPS.
3. Reconnect guard met forced socket close.
4. Ping/jitter metrics zichtbaar.
5. Logout cleanup zonder ghost avatars.

Smoke-test dekking:

1. Payloads zijn world-scoped.
2. `remote_player:state_changed` bevat geen `gameWorld`.
3. Geen secrets in remote payloads.
4. Same-account sync blijft werken.

## Kevin-visible testscript

1. Open account A.
2. Open account B.
3. Beide in `/game/`.
4. Controleer ping/jitter in debug HUD.
5. Laat A 10 seconden bewegen.
6. B moet A vloeiend zien.
7. Laat B 10 seconden bewegen.
8. A moet B vloeiend zien.
9. Reconnect een client.
10. De status mag niet random blijven flikkeren.
11. Remote avatars mogen niet dupliceren.
12. Logout van B moet B netjes verwijderen zonder ghost.

## Bekende beperkingen

1. Presence is nog world-scoped, niet chunk-scoped.
2. De interpolation buffer voegt iets latency toe om jitter te verbergen.
3. De game voelt bewust iets later maar stabieler aan dan packet-arrival rendering.
4. Remote avatars blijven visueel hetzelfde model als lokaal, met alleen runtime-scheiding en labels.

