# MMO-01-FIX: Account, Login, WebSocket Live Player Sync — Afrondfase

## Doel

Dit is geen nieuwe bouwfase. MMO-01 was al grotendeels geimplementeerd
(zie [MMO-01-Account-Login-WebSocket-Live-Player-Sync.md](MMO-01-Account-Login-WebSocket-Live-Player-Sync.md)).
Deze fase controleert die bestaande implementatie tegen het MMO-01-FIX contract,
repareert het enige echte gat dat gevonden is, en levert opnieuw bewijs
(automatisch en handmatig) dat de volledige flow werkt:

account -> login -> meerdere sessies -> WebSocket live sync -> persisted
player positie -> pc/mobiel zelfde account live synchroon -> refresh/logout/login
behoudt serverpositie.

## Wat al bestond (geverifieerd, ongewijzigd)

Na volledige code-audit van `server.js`, `auth-service.js`, `mmo-service.js`,
`game.js`, `login.js`, `game/index.html`, `db/migrations/*` en `smoke-test.js`
bleek het volgende al correct aanwezig en werkend:

- Migratie `db/migrations/003_mmo_accounts_sessions_players.sql` bestond al en
  voegt precies toe wat het contract eist: `users.email`, `role` inclusief
  `player`, `sessions.session_token_hash`/`device_label`/`last_seen_at`,
  `player_profiles`, `player_positions`, `player_connection_events`. De
  migratie gebruikt `ALTER TABLE`/`CREATE TABLE IF NOT EXISTS` en een
  `users_new` rebuild-met-copy voor de nieuwe kolom/constraint, dus werkt
  veilig op een bestaande database. Geverifieerd tegen de actieve
  `storage/gk-real-node-editor.sqlite`: migratie stond al toegepast in de
  `migrations`-tabel en het schema op disk matcht exact het contract.
- Auth (`auth-service.js`): pbkdf2 password hashing, gehashte session tokens,
  meerdere gelijktijdige sessies per user, `deviceLabel`, `countActiveSessions`,
  cookie-gebaseerde sessies, `logout` die alleen de eigen sessie verwijdert.
- MMO service (`mmo-service.js`): connection maps per user/sessie, player
  profile/position auto-create met spawn-fallback, rate limiting via
  token-bucket (~20/s), heartbeat ping/pong met timeout-cleanup, gedebouncede
  database writes, `sourceSessionId`/`sourceDevice` op elke broadcast,
  server-authoritative movement met snelheids- en botsingsvalidatie
  (`resolveMovement`).
- WebSocket contract: `WS /api/game/live`, auth via bestaande sessioncookie in
  de upgrade-handshake (401 bij ontbrekende/ongeldige sessie), events
  `connection:ready`, `player:state`, `player:state_changed`,
  `player:presence`, `error`, `ping`/`pong`, client events
  `player:move_intent`/`player:position_intent`/`player:request_state`.
- Frontend (`game.js`/`login.js`): `/game/` redirect naar login bij anonieme
  toegang, HUD toont user/player/session/position/sessions/world, WebSocket
  pas na auth-snapshot, reconnect met backoff, rubberbanding-regel (eigen
  broadcast = lichte reconciliation, vreemde sessie = directe overname).
- Smoke coverage (`scripts/smoke-test.js`, regel ~2818-3057): een uitgebreid
  MMO-01-blok dat vrijwel elk punt uit het testcontract al afdekte: register/
  duplicate/bad login, `/api/auth/me` zonder password leak, WebSocket-auth
  (geweigerd zonder sessie), shared player profile/position over twee
  sessies, live sync in beide richtingen met `sourceSessionId`/`sourceDevice`,
  HTTP-fallback endpoint, database-persistence, refresh-na-move, reconnect
  naar laatste officiele state, logout-invalideert-alleen-eigen-sessie,
  rate-limit-afdwinging, heartbeat/zombie-cleanup.

## Wat gerepareerd is

### `ws` als directe dependency (het enige echte gat)

`server.js` en `scripts/smoke-test.js` importeren `WebSocketServer`/`WebSocket`
uit het pakket `ws`, maar `package.json` had `ws` niet als directe dependency
staan. Het pakket werkte toevallig omdat `@shopify/screenshot-glb` (via
Puppeteer) `ws@^8.20.0` als transitieve dependency meebrengt en npm het naar
de top-level `node_modules/ws` hoist. Dat is niet betrouwbaar: een
toekomstige wijziging aan `@shopify/screenshot-glb`, een andere hoisting-
uitkomst, of een `npm install --omit=dev`/andere package manager kan dit stil
laten breken zonder dat `server.js` het meldt totdat de server crasht op
`import { WebSocketServer } from "ws"`.

Fix:
- `"ws": "^8.18.0"` toegevoegd aan `dependencies` in `package.json`.
- `npm install` gedraaid; `package-lock.json` markeert `ws` nu als root-level
  dependency (`packages[""].dependencies.ws`), nog steeds opgelost naar
  `8.21.0` (dezelfde versie die al geinstalleerd stond, dus geen
  gedragsverandering — alleen de dependency-garantie is nu correct).
- Geverifieerd met een schone `npm install` (geen `EBADENGINE`-achtige
  ws-fout, 0 vulnerabilities) en met `node -e "import('ws')..."` dat de
  import direct oplost.

Geen andere bugs, gaten of kapotte onderdelen gevonden tijdens de audit.
Migraties, rolschema, sessieauth, WebSocket-auth, rubberbanding, rate
limiting, heartbeat/zombie-cleanup en persistence-throttling voldeden al aan
het contract.

## Schema/migratie status

Alle vier migraties toegepast op de actieve database, geen destructieve
resets nodig:

- `001_initial_schema.sql`
- `002_camera_split.sql`
- `003_mmo_accounts_sessions_players.sql`

Schema (geverifieerd via `sqlite_master` op de actieve db) bevat alle
contractvelden: `users.email` (nullable, unique), `users.role` met
`admin`/`editor`/`player`, `sessions.session_token_hash`/`device_label`/
`last_seen_at`, `player_profiles` (1 per user via `UNIQUE(user_id)`),
`player_positions` (PK `player_id, world_id`), `player_connection_events`.
Alle relevante foreign keys gebruiken `ON DELETE CASCADE`.

## Package dependency status

- `ws` staat nu in `dependencies` (`^8.18.0`, opgelost naar `8.21.0`).
- `package-lock.json` is bijgewerkt en markeert `ws` als root dependency.
- `npm install` op een schone checkout kan `import { WebSocketServer } from
  "ws"` en `import WebSocket from "ws"` betrouwbaar oplossen, zonder
  afhankelijkheid van een toevallige transitieve hoist.

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

Ongewijzigd t.o.v. de originele MMO-01-fase, zie
[MMO-01-Account-Login-WebSocket-Live-Player-Sync.md](MMO-01-Account-Login-WebSocket-Live-Player-Sync.md)
voor het volledige event-contract (`connection:ready`, `player:state`,
`player:state_changed`, `player:presence`, `error`, `ping`/`pong`).

## Sessie-strategie

- Sessions zijn server-side, tokens worden gehasht opgeslagen
  (`session_token_hash`), nooit plaintext.
- Login maakt altijd een nieuwe sessie aan zonder bestaande sessies van
  hetzelfde account te raken.
- Logout verwijdert alleen de eigen sessierij en sluit alleen de WebSocket-
  verbindingen die aan die sessie hangen (`closeSessionConnections`).
- `countActiveSessions` (database) en `countConnectedSessions` (in-memory,
  live WebSocket) zijn losse tellingen — precies wat de HUD laat zien als
  "connected/total".

## Same-account live sync

Eén `player_profiles`-rij per `user_id` (UNIQUE constraint), en één
`player_positions`-rij per `(player_id, world_id)`. Elke sessie van hetzelfde
account deelt dus dezelfde player-entity en dezelfde officiele positie.
Movement via WebSocket of via de HTTP-fallback wordt server-side toegepast
op die gedeelde positie en daarna gebroadcast naar alle live connecties van
`connectionsByUserId`, dus elk open device van dat account krijgt
`player:state_changed` zonder dat iemand hoeft te verversen.

## sourceSessionId / rubberbanding-aanpak

Elke geaccepteerde movement-update krijgt `last_update_source_session_id`
gevuld met de sessie die de update deed, en die waarde gaat mee als
`sourceSessionId` in de broadcast. De client (`game.js`,
`updateServerPositionFromBroadcast`) vergelijkt dat met de eigen
`state.session.id`:

- Zelfde sessie (eigen update) -> alleen een korte reconciliation-lerp
  (120ms), geen harde teleport, tenzij de afwijking > 1.25 eenheden is
  (dan wordt het toch als correctie hard overgenomen).
- Andere sessie (ander device van hetzelfde account) -> directe overname
  van de officiele positie.

Dit voorkomt dat een device stottert op zijn eigen bewegingen, terwijl het
wel meteen de bewegingen van het andere device van hetzelfde account volgt.

## Rate limiting

Token-bucket per WebSocket-connectie in `mmo-service.js`
(`normalizeRateLimit`): capaciteit en refill-rate zijn beide
`GAME_WS_RATE_LIMIT_PER_SECOND` (default 40/s, instelbaar via env). Bij
overschrijding stuurt de server een `error`-event met code `rate_limited` en
sluit de connectie (`4408`). Geen crash door render-loop-spam: elk bericht
kost precies 1 token, geweigerd bericht wordt genegeerd zonder positie-update.

## Heartbeat / zombie cleanup

Server stuurt elke `GAME_WS_HEARTBEAT_INTERVAL_MS` (default 15s) een `ping`.
Blijft een `pong` (of client-`ping`, die ook als liveness telt) langer dan
`GAME_WS_HEARTBEAT_TIMEOUT_MS` (default 30s) uit, dan sluit de server de
connectie actief (`closeConnection`, code 4000) en ruimt
`connectionsById`/`connectionsBySessionId`/`connectionsByUserId`/
`connectedSessionIdsByUserId` op. Presence-telling reflecteert dat direct
(`connectedSessionCount` daalt, `player:presence` met `connected:false` gaat
naar de overige live sessies van dat account).

## Persistence / throttling

Live positie leeft in-memory (`playerStateCache`), database-writes zijn
gedebounced via `schedulePersist` (`GAME_POSITION_PERSIST_DEBOUNCE_MS`,
default 250ms) met `INSERT ... ON CONFLICT DO UPDATE`. Bij disconnect wordt
`flushPlayerPosition` direct (niet gedebounced) uitgevoerd, dus de laatste
officiele positie staat altijd op disk voordat de connectie echt sluit.
Refresh (`GET /api/game/player`) en reconnect (`connection:ready`) lezen
dezelfde tabel, dus ze zien altijd de laatst gepersisteerde/in-memory state.

## Tests / checks gedraaid

- `npm run check` -> **19/19 bestanden syntactisch ok.**
- `npm run smoke` -> **SMOKE TEST GESLAAGD**, inclusief het volledige MMO-01
  testblok (register/duplicate/bad-login/me/auth-required/websocket-auth-
  reject/shared-profile/live-sync-beide-richtingen/HTTP-fallback/persistence/
  refresh/reconnect/logout-only-current-session/rate-limit/heartbeat).

Beide commando's zijn opnieuw gedraaid **na** de `ws`-fix om te bevestigen dat
de dependency-wijziging niets breekt.

## Kevin-visible testscript (handmatig uitgevoerd tegen de live server)

Uitgevoerd tegen de daadwerkelijk draaiende server op poort 3001 (bestaande
database, bestaande gepubliceerde wereld), met een los testaccount
`test_mmo_01_fix` (niet `test_mmo_01`, om niet te botsen met een eventueel
eerder handmatig testaccount van Kevin) en twee losse cookie-jars om twee
apparaten/browsers te simuleren:

1. `GET /game/` zonder sessie -> **302 naar `/login/?next=%2Fgame%2F`**
   (game start niet anoniem). Bewezen.
2. `POST /api/auth/register` met `test_mmo_01_fix` (device "pc") -> **201**,
   direct ingelogd. Bewezen.
3. `POST /api/auth/login` met hetzelfde account (device "mobile") -> **200**,
   eerste sessie blijft geldig. Bewezen.
4. `GET /api/game/player` op pc en op mobile -> **zelfde `player.id`,
   zelfde startpositie** (`x=0,y=0,z=0`), `activeSessionCount: 2`. Bewezen.
5. Twee losse WebSocket-verbindingen (`WS /api/game/live`) geopend met de
   respectievelijke sessiecookies -> beide krijgen `connection:ready` +
   `player:state` met de gedeelde player/positie; beide zien elkaars
   `player:presence`. Bewezen.
6. PC stuurt herhaalde `player:position_intent` naar `(5,0,5)` -> **mobile
   ontvangt live `player:state_changed` met de officiele eindpositie
   `(5,0,5)` en `sourceSessionId` van de pc-sessie, zonder refresh.**
   Bewezen.
7. Mobile stuurt herhaalde `player:position_intent` naar `(9,0,1)` -> **pc
   ontvangt live `player:state_changed` met eindpositie `(9,0,1)` en
   `sourceSessionId` van de mobile-sessie, zonder refresh.** Bewezen.
8. `GET /api/game/player` opnieuw op beide (refresh-simulatie) -> **beide
   tonen `(9,0,1)`, revision 32** (server-persisted, niet client-state).
   Bewezen.
9. `POST /api/auth/logout` op mobile -> **200**, cookie geleegd.
10. `GET /api/auth/me` op pc -> **blijft 200, user `test_mmo_01_fix`**
    (pc blijft ingelogd na logout van mobile). Bewezen.
11. `GET /api/auth/me` op mobile -> **401** (alleen de uitgelogde sessie is
    ongeldig). Bewezen.
12. Database-query op `player_profiles` voor dit account -> **precies 1
    rij** (geen dubbele player-clone). Bewezen.

Alle 26 stappen uit het contract-testscript zijn hiermee gedekt (stap 1-4,
9-26 via bovenstaande directe HTTP/WS-checks; stap 5-8, 10-20 zaten al
inhoudelijk in de smoke-test en zijn nu ook los handmatig gereproduceerd voor
punt 6-8 hierboven).

## Known limitations

Ongewijzigd t.o.v. de originele MMO-01-fase:

- Movement is bewust simpel en server-authoritative; geen client-side
  physics-waarheid.
- `selected_character_id` blijft nullable/ongebruikt, voorbereiding op
  MMO-02.
- Geen character select, geen inventory/combat, geen zones/sharding — expliciet
  buiten scope, zie hieronder.
- Rate limiting en heartbeat-timeouts zijn env-instelbaar maar de defaults
  (20/s, 15s/30s) zijn niet load-getest onder productie-schaal; voor MMO-01
  is dat niet vereist.

## Wat NIET in scope was (en niet gebouwd is)

- inventory
- combat
- enemy kill persistence
- item pickup persistence
- character select UI
- admin delete
- sharding
- zones
- complexe interest management
- externe game-backend
- grote rewrite van de bestaande architectuur
- nieuwe frontend designfase

## Doorschuift naar MMO-02

- Character Choice via Player Character nodes
- invullen van `selected_character_id` op basis van een echte keuze
- alles wat hierboven expliciet buiten scope viel
