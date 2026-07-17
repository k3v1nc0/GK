# MMO-02-FIX-2 - Online Readiness + Realtime Movement Pipeline Rebuild

Deze fase herbouwt de MMO-startup en remote movement pipeline zodat de game niet half-online lijkt terwijl de MMO-laag nog niet echt klaar is.

## Oude probleem

De vorige fix loste een deel van de zichtbare WebSocket-ruis op, maar liet nog een structurele mismatch over:

1. De HTTP snapshot kon de runtime al vullen terwijl de WebSocket nog niet klaar was.
2. De startup-overlay kon te vroeg verdwijnen.
3. Presence werd niet hard genoeg gekoppeld aan de eerste online-ready toestand.
4. Remote spelers konden visueel blijven achterlopen door een combinatie van arrival-time logica, buffer-opstapeling en te losse readiness-gates.

Het gevolg was dat de game lokaal speelbaar leek terwijl de MMO-laag intern nog bezig was met verbinden.

## Root Cause

De echte oorzaak zat in de startup-volgorde en niet in één losse delay:

1. `/api/game/player` werd eerst geladen.
2. De wereld/runtime werd toegepast.
3. Pas daarna werd de WebSocket opgezet.
4. De client had geen harde gate die alle MMO-voorwaarden samen afdwong.
5. Remote interpolatie vertrouwde te veel op packet arrival in plaats van server-timestamps en sequence discipline.

## Nieuwe readiness-regel

De game mag pas online-ready worden als al dit waar is:

1. HTTP `/api/game/player` snapshot geladen.
2. Runtime/world geladen.
3. WebSocket open.
4. `connection:ready` ontvangen.
5. Lokale `player:state` toegepast.
6. Eerste `world:presence_snapshot` ontvangen en verwerkt.
7. Presence snapshot van `0` spelers is alleen geldig als die snapshot expliciet is ontvangen.

Tot dat moment blijft de overlay zichtbaar met een duidelijke status zoals `MMO verbinden... waiting_for_*`.
Na ongeveer 8 seconden moet een debug/foutstatus zichtbaar worden, niet een stille hang.

## Protocolwijzigingen

De server stuurt nu de belangrijke MMO-berichten met consistente metadata:

1. `serverTimeMs`
2. `serverSeq`
3. `worldId`
4. `protocolVersion: 2`

Nieuwe bootstrap-flow:

1. `mmo:bootstrap` is het primaire startup-pakket.
2. Het bevat `connection`, `localPlayer` en `presence`.
3. Bestaande events blijven backward-compatible:
   - `connection:ready`
   - `player:state`
   - `world:presence_snapshot`
   - `remote_player:joined`
   - `remote_player:state_changed`
   - `remote_player:left`

De server blijft authoritative en blijft beweging coalescen rond ongeveer 20Hz.
Er worden geen full world payloads over WebSocket gestuurd en er zijn geen extra database writes per broadcast toegevoegd.

## Server timestamp/sequence model

Serverberichten dragen nu een monotone sequence en een server-timestamp. Daardoor kan de client:

1. Stale packets herkennen.
2. Clock offset schatten.
3. Ping/jitter van echte render-backlog onderscheiden.
4. Remote samples rangschikken op server-timeline in plaats van arrival-time.

De client gebruikt nu ook:

1. `pingMs`
2. `jitterMs`
3. `clockOffsetMs`
4. `latestRemoteSampleAgeMs`
5. `interpolationBacklogMs`
6. `remoteRenderDelayMs`
7. `droppedRemoteSamples`
8. `remoteCatchupCount`

## Remote interpolation model

De client is nu de enige eigenaar van remote interpolation.

Model:

1. Client buffert remote samples per player.
2. Server timestamps bepalen de render-timeline.
3. Runtime krijgt al geïnterpoleerde zichtbare posities.
4. De runtime doet geen extra trailing smoothing bovenop remote interpolation.

Backlog-beleid:

1. Oude samples worden agressief weggegooid.
2. De render delay wordt tijdelijk verlaagd als backlog groeit.
3. Bij sterke backlog volgt een catch-up snap naar de nieuwste sample.
4. De remote avatar mag bewust ongeveer 80-140ms achter lopen om jitter te maskeren, maar niet seconden.

## Testbewijs

De browsercheck is uitgebreid met drie relevante controles en is nu groen.

1. Twee verschillende accounts zien elkaar direct na online-ready, zonder eerst te bewegen.
2. Een 20 seconden steady movement duurtest controleert of sample-age en backlog niet oplopen.
3. Een reconnect test controleert dat bootstrap/presence opnieuw verwerkt wordt zonder dubbele of ghost avatars.

Laatste verificatie:

1. `npm run check` - geslaagd.
2. `npm run smoke` - geslaagd.
3. `npm run game:browser-check` - geslaagd.

Browsercheck-bewijs uit de laatste geslaagde run:

1. Direct presence: A en B zien elkaar zonder beweging binnen `997ms`.
2. Steady movement: `379` samples, backlog max `21ms`, sample-age `0 -> 51ms`.
3. Remote movement: `34` samples, backlog max `84ms`, sample-age `0 -> 0ms`.
4. Reconnect cleanup: geen dubbele avatars, geen ghost avatars, remote ids correct opgeschoond na logout.

De verplichte checks voor deze fase zijn:

1. `npm run check`
2. `npm run smoke`
3. `npm run game:browser-check`

## Bekende grenzen

1. `mmo:bootstrap` is de primaire startup-flow, maar de backward-compatible events blijven bestaan.
2. Presence is world-scoped en blijft per player profile samengevallen voor meerdere sessies van hetzelfde account.
3. De client houdt remote render delay adaptief, maar nog steeds bounded. Ping/jitter kan dus nog zichtbaar zijn als de verbinding slecht is.
4. De browsercheck valideert aanwezigheid en backlog op representatieve samples, niet op elk mogelijk netwerkscenario.
