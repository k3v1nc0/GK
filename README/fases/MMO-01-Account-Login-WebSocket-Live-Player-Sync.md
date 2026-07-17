# MMO-01 Account, Login, WebSocket Live Player Sync en Persisted Player Start

## Doel
De eerste MMO-fundering staat server-authoritative:

- account aanmaken
- inloggen en uitloggen
- meerdere sessies per user tegelijk
- per user een gedeeld player profile
- eerste game start maakt of laadt automatisch player profile en player position
- live WebSocket sync tussen devices op hetzelfde account
- refresh en reconnect halen de laatste serverstate terug

## Wat gebouwd is

- Registratie en login met username of e-mail.
- Logout van alleen de huidige sessie.
- `/api/auth/me` voor de huidige user en sessie.
- `/api/game/player` voor initial load, refresh en recovery.
- `/api/game/player/position` als HTTP fallback voor officiële position updates.
- `WS /api/game/live` als live player-state channel.
- Server-side sessions met meerdere gelijktijdige sessies per user.
- Player profile per user.
- Player position per world op de server/database.
- Presence voor connected/disconnected sessions.
- Minimal login/register UI.
- Minimal game UI met user, player, positie, session count en WebSocket-status.
- Smoke coverage voor register/login/me/game/player/WebSocket sync/persistence.

## Databasewijzigingen

Nieuwe migratie:

- `db/migrations/003_mmo_accounts_sessions_players.sql`

Wijzigingen:

- `users`
  - `email` toegevoegd
  - `role` accepteert nu ook `player`
  - `password_hash` blijft server-side gehashed
- `sessions`
  - `session_token_hash`
  - `device_label`
  - `last_seen_at`
- `player_profiles`
  - `user_id`
  - `display_name`
  - `selected_character_id` nullable/default
  - `current_world_id`
- `player_positions`
  - `player_id`
  - `world_id`
  - `x`, `y`, `z`, `rotation_y`
  - `revision`
  - `last_update_source_session_id`
- `player_connection_events`
  - optionele diagnostics voor connect/disconnect/state changes

De published `player_spawn` node levert de eerste spawn; als die ontbreekt gebruikt de server een veilige fallback:

- `x = 0`
- `z = 0`
- `y = ground.y`
- `rotationY = 0`

## Routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/game/player`
- `POST /api/game/player/position`
- `PATCH /api/game/player/position`
- `WS /api/game/live`

## WebSocket endpoint en events

### Endpoint

- `WS /api/game/live`

### Client -> server

- `player:move_intent`
- `player:position_intent`
- `player:request_state`
- `ping`
- `pong`

### Server -> client

- `connection:ready`
- `player:state`
- `player:state_changed`
- `player:presence`
- `error`
- `ping`
- `pong`

### `player:state_changed`

Payload bevat:

- `playerId`
- `worldId`
- `position`
  - `x`
  - `y`
  - `z`
  - `rotationY`
- `revision`
- `updatedAt`
- `sourceSessionId`
- `sourceDevice`

## Sessie-aanpak

- Sessions zijn server-side en worden als hashed token opgeslagen.
- Login maakt een nieuwe sessie aan.
- Bestaande sessies van dezelfde user blijven bestaan.
- Device A en device B kunnen tegelijk ingelogd zijn.
- Logout invalideert alleen de huidige sessie.
- Logout sluit alleen de WebSocket connections van die sessie.
- `me` lekt geen `password_hash` en geen raw session token.

## Multi-device gedrag

- Eén user => één player profile.
- Meerdere sessies => hetzelfde player profile.
- Device A en device B krijgen dezelfde officiële player state.
- De zender gebruikt eigen `player:state_changed` alleen als lichte correctie.
- Ontvangers nemen de serverpositie direct over of lerpen kort daarnaartoe.
- `sourceSessionId` voorkomt hard rubberbanden op de zender.

## Player persistence flow

1. User logt in.
2. `GET /api/game/player` vindt of maakt het player profile.
3. Server vindt of maakt de player position voor de actieve world.
4. Spawn komt uit de gepubliceerde `player_spawn` node als die bestaat.
5. De position wordt server-side opgeslagen.
6. Movement via WebSocket past de officiële positie toe.
7. Database writes worden gedebounced, niet per frame geschreven.
8. Refresh of reconnect leest dezelfde serverstate terug.

## Jitter / rubberbanding correctie

- Sender krijgt zijn eigen broadcast terug.
- Sender gebruikt die broadcast alleen voor lichte correctie/reconciliation.
- Ontvangers nemen de officiële serverpositie live over.
- De client bewaart de browserpositie dus niet als waarheid.

## Rate limiting

- In-memory rate limiting per WebSocket connection/session.
- Richtwaarde: ongeveer 20 input messages per seconde per connection.
- Overschrijding mag leiden tot negeren of sluiten van de verbinding.
- Smoke gebruikt een kortere timeout om dit snel te bewijzen.

## Zombie cleanup

- Heartbeat gebruikt ping/pong.
- De server sluit dode connections actief na timeout.
- In-memory connection references worden opgeruimd.
- Presence telt dode connections niet als online.

## Conflictregel

Tijdelijke MMO-01-regel:

- last server-accepted update wins
- server-tijd is leidend
- client-tijd is niet leidend
- bij bijna gelijktijdige inputs wint de laatst ontvangen geldige intentie op de server

## Kevin-visible testscript

1. Open de app als uitgelogde gebruiker.
2. Ga naar `/game/`.
3. Controleer dat de game niet als anonieme speler start.
4. Maak account `test_mmo_01` aan.
5. Log in.
6. Open `/game/`.
7. Controleer dat username/player zichtbaar is.
8. Controleer dat WebSocket status `connected` wordt.
9. Noteer startpositie.
10. Beweeg de speler naar een duidelijke andere plek.
11. Controleer dat server/officiële positie update.
12. Refresh browser.
13. Controleer dat de speler op dezelfde plek terugkomt.
14. Open een tweede browser, incognito venster of mobiel device.
15. Log daar in met hetzelfde account `test_mmo_01`.
16. Open `/game/` en controleer WebSocket `connected`.
17. Controleer dat de positie gelijk is aan device 1.
18. Beweeg op device 1 naar positie A.
19. Controleer dat device 2 live naar positie A synchroniseert zonder refresh.
20. Beweeg op device 2 naar positie B.
21. Controleer dat device 1 live naar positie B synchroniseert zonder refresh.
22. Refresh beide devices.
23. Controleer dat beide devices positie B behouden.
24. Log uit op device 2.
25. Controleer dat device 1 ingelogd en connected blijft.
26. Controleer via API/database/test dat er nog steeds maar één player profile/entity voor dit account is.

## Checks

Gedraaide checks:

- `npm run check`
- `npm run smoke`

## Bewust niet in scope

- character select UI
- inventory
- combat
- item pickup persistence
- enemy kills persistence
- admin delete
- zones
- sharding
- interest management
- guest/localStorage-only accounts
- externe game backend zoals Nakama/PlayFab

## Known limitations

- Movement in MMO-01 is bewust simpel en server-authoritative.
- De fase bewaart `selected_character_id` alleen nullable/default als voorbereiding op MMO-02.
- De game gebruikt nu nog dezelfde world/player runtime, maar zonder character select.
- WebSocket reconnect is aanwezig, maar de fase is nog niet bedoeld als volledige MMO-platformlaag.

## Acceptatie checklist

- [x] Kevin kan nieuw account maken.
- [x] Kevin kan inloggen.
- [x] Kevin kan uitloggen.
- [x] Game weigert of redirect ongeauthenticeerde toegang.
- [x] Eerste game start maakt/laadt player profile.
- [x] Player heeft server-side positie.
- [x] WebSocket verbindt alleen met geldige sessie.
- [x] Game toont WebSocket connected/reconnecting/disconnected status.
- [x] Kevin kan positie zichtbaar veranderen.
- [x] Server stuurt officiële positie terug.
- [x] Refresh houdt nieuwe positie vast.
- [x] Logout/login houdt nieuwe positie vast.
- [x] Dezelfde user kan tegelijk op twee devices/browsers ingelogd zijn.
- [x] Login op device B verwijdert sessie van device A niet.
- [x] Device A en device B delen hetzelfde player profile.
- [x] Device A beweging is live zichtbaar op device B zonder refresh.
- [x] Device B beweging is live zichtbaar op device A zonder refresh.
- [x] `player:state_changed` bevat `sourceSessionId`.
- [x] Zendende client gebruikt eigen broadcast als correctie/reconciliation.
- [x] Ontvangende client neemt serverpositie live over.
- [x] Server heeft per-connection WebSocket rate limiting.
- [x] Server ruimt zombie connections op na heartbeat/ping-pong timeout.
- [x] Refresh op beide devices behoudt de laatste serverpositie.
- [x] Hetzelfde account krijgt geen dubbele player clone/entity.
- [x] Database/server state bewijst dat positie niet alleen in browser/localStorage staat.
- [x] Passwords staan niet plaintext in de database.
- [x] Tests/smoke checks bewijzen register/login/session/player persistence/WebSocket sync.
- [x] Fase-doc legt uit wat Kevin zelf moet checken.

## Doorschuift naar MMO-02

- echte character select UI
- invullen van `selected_character_id` op basis van player character nodes
- character-keuze als gameplay-keuze
- verdere MMO-uitbreidingen die niet nodig zijn voor session/player sync
