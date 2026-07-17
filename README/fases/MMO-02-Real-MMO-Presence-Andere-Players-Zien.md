# MMO-02 - Real MMO Presence: Andere Players Zien

MMO-02 bouwt geen nieuwe gameplay op. Dit contract gaat alleen over echte multiplayer-presence in een gedeelde world: accounts zien elkaar live, zonder ghost avatars, zonder full world rebuilds en zonder data-lek naar andere accounts.

## Doel

MMO-02 is geslaagd als:

1. Account A en account B inloggen.
2. Beide `/game/` openen in dezelfde published world.
3. A B als remote player ziet.
4. B A als remote player ziet.
5. A en B elkaars beweging live en soepel zien.
6. Een tweede tab van hetzelfde account geen dubbele remote avatar veroorzaakt.
7. Logout of disconnect de remote avatar verwijdert zonder ghost.
8. Same-account multi-session gedrag uit MMO-01 blijft werken.

## Bestaande MMO-01-basis

MMO-01 blijft de basis voor:

1. Auth, sessions en `/api/game/player`.
2. Server-authoritative movement.
3. Local prediction en reconciliation op de client.
4. Same-account sync via `broadcastToUser`.
5. Persisted player positions met debounce.

MMO-02 voegt daar alleen world-scoped presence bovenop toe.

## Server-indexen

`MmoService` houdt presence nu lichtgewicht in memory bij met extra indexes:

1. `connectionsByWorldId: Map<worldId, Set<connectionId>>`
2. `playerIdsByWorldId: Map<worldId, Set<playerId>>`
3. `primaryPresenceByPlayerId: Map<playerId, presenceRecord>`
4. Bestaand, hergebruikt:
   - `connectionsBySessionId`
   - `connectionsByUserId`
   - `connectionsByPlayerId`
   - `connectedSessionIdsByUserId`

Regel:

1. Meerdere sessies van hetzelfde account tellen als meerdere connections.
2. Andere accounts zien dat account als één avatar.
3. Server broadcast alleen binnen dezelfde `worldId`.

## Events

Nieuwe server -> client events:

1. `world:presence_snapshot`
2. `remote_player:joined`
3. `remote_player:state_changed`
4. `remote_player:left`

De bestaande MMO-01 events blijven bestaan:

1. `connection:ready`
2. `player:state`
3. `player:state_changed`
4. `player:presence`
5. `ping`
6. `pong`

## Payloads

### `world:presence_snapshot`

Payload:

```json
{
  "worldId": "main_world",
  "players": [
    {
      "playerId": "player_...",
      "userId": "user_...",
      "displayName": "Kevin",
      "selectedCharacterId": null,
      "position": { "x": 0, "y": 0, "z": 0, "rotationY": 0 },
      "revision": 12,
      "updatedAt": "2026-07-08T00:00:00.000Z",
      "animationState": "idle",
      "moving": false,
      "connectedSessionCount": 2,
      "isSelfAccount": false
    }
  ]
}
```

Regels:

1. Alleen players in dezelfde world.
2. Geen eigen player als remote avatar.
3. Geen dubbele entries voor meerdere sessies van hetzelfde account.

### `remote_player:joined`

Payload gebruikt dezelfde compacte remote snapshotvorm als hierboven.

### `remote_player:state_changed`

Payload:

```json
{
  "playerId": "player_...",
  "userId": "user_...",
  "worldId": "main_world",
  "position": { "x": 0, "y": 0, "z": 0, "rotationY": 0 },
  "revision": 12,
  "updatedAt": "2026-07-08T00:00:00.000Z",
  "animationState": "walk",
  "moving": true,
  "sourceSessionId": "session_...",
  "sourceDevice": "pc"
}
```

### `remote_player:left`

Payload:

```json
{
  "playerId": "player_...",
  "userId": "user_...",
  "worldId": "main_world",
  "connectedSessionCount": 0,
  "isSelfAccount": false
}
```

## Interpolatie

De client rendert remote players apart van de lokale player-path.

1. `remotePlayers: Map<playerId, RemotePlayerState>` staat in `game.js`.
2. `world-runtime.js` heeft `upsertRemotePlayer`, `setRemotePlayerState` en `removeRemotePlayer`.
3. Remote samples worden per player gebufferd.
4. Rendering loopt ongeveer `100ms` achter op server traffic.
5. De client interpoleert tussen samples.
6. Kleine bewegingen snappen niet hard; grote teleports mogen wel hard snap zijn.
7. Remote animatie volgt server hints `idle/walk/run` en valt terug op afstand/moving.

## Performance-keuzes

1. Geen database writes per remote broadcast.
2. Presence blijft in memory.
3. Broadcast is world-scoped.
4. Broadcast payloads zijn klein en bevatten geen `gameWorld` dumps.
5. De server coalescet op normale movement cadence; laatste geldige state wint.
6. Idle players sturen geen spam.
7. Same-account sync blijft op `broadcastToUser` draaien voor MMO-01-gedrag.

## Bewust buiten scope

1. Inventory.
2. Combat.
3. Admin delete.
4. Item pickup.
5. Character select.
6. Zone/interest-radius management.
7. Per-chunk presence filtering.
8. Database persistence van remote presence events.

## Testen

Minimaal vereist:

1. `npm run check`
2. `npm run smoke`
3. `npm run game:browser-check`

De smoke-test moet bewijzen:

1. A en B kunnen inloggen.
2. Beide WebSockets zijn verbonden.
3. A ziet B in snapshot of joined.
4. B ziet A in snapshot of joined.
5. A movement geeft `remote_player:state_changed` aan B.
6. B movement geeft `remote_player:state_changed` aan A.
7. Same-account extra tab van A maakt geen dubbele avatar bij B.
8. Logout van B geeft `remote_player:left` aan A.
9. Payloads blijven world-scoped en secret-vrij.

De browser-check moet bewijzen:

1. Remote avatars verschijnen in de runtime scene.
2. Interpolatie-buffer wordt opgebouwd.
3. Remote positie schuift smooth, niet per packet hard.
4. Remote animatie is walk/run tijdens bewegen en idle na stop.
5. Logout verwijdert de remote avatar uit de HUD en runtime.

## Kevin-visible testscript

1. Open browser/tab 1 met account A.
2. Open browser/tab 2 of mobiel met account B.
3. Beide staan in dezelfde world.
4. A ziet B.
5. B ziet A.
6. A loopt, B ziet A soepel lopen.
7. B loopt, A ziet B soepel lopen.
8. Remote player animeert walk/run/idle correct.
9. Een extra tab van A maakt geen tweede A-avatar bij B.
10. Logout/disconnect verwijdert remote avatar zonder ghost.
11. Refresh behoudt MMO-01 persistence.

## Bekende beperkingen

1. Presence is nu world-scoped, niet chunk-scoped.
2. Er is nog geen interest radius of proximity culling voor presence.
3. Presence is in-memory; na restart moet de wereld opnieuw presence opbouwen.
4. Remote avatars gebruiken dezelfde player visual als lokaal, met een lichte label/fallback-laag.

## Volgende fase

MMO-03: Character Choice Via Player Character Nodes.

