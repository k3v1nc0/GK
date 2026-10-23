# Fase 5 - MMO-authority, chat/party/guild, productie, performance en definitieve nodeverwijdering

**Status:** definitief implementatiecontract, nog niet geimplementeerd  
**Datum:** 2026-10-23  
**Repo-basis:** `main` op `47e1331c5a15b9338709a1abc4e0a6fd35b0aa6f`  
**Doelpad:** `README/fases/MMORPG-basis/5 MMO-authority, chat/party/guild, productie, performance en definitieve nodeverwijdering.md`  
**Vereiste voorgangers:** Fase 1 tot en met 4 in deze map  

---

## 0. Normatieve positie

Dit document voltooit de afgesproken MMORPG-basis. Het vervangt geen contract uit Fase 1-4, maar maakt hun authority-, runtime- en lifecyclegrenzen productierijp.

Bij tegenspraak geldt:

1. Fase 1 wint voor canonical authoring, documents, commands, builds, publish en domaincutover.
2. Fase 2 wint voor World/Region/Area/Cell, spatial opslag, streaming, audio en PlayPreview.
3. Fase 3 wint voor actor simulation, stats, abilities, combat, equipment, AI, animation, VFX en action-audio.
4. Fase 4 wint voor account/character, RPG-persistence, boot, UI en story/economy-integratie.
5. Fase 5 wint voor wire protocol, multiplayer routing, social authority, productie, observability, capacity en definitieve legacyverwijdering.

### 0.1 Eerlijke status

Fase 1-4 zijn op deze repo-basis implementatiecontracten, geen bewijs van implementatie. Fase 5 mag pas worden uitgevoerd nadat hun afhankelijke checkpoints aantoonbaar werken. Dit document maakt het huidige project niet door zijn bestaan multiplayer- of productierijp.

### 0.2 Geen onmogelijke belofte

Geen architectuur is voor iedere toekomstige schaal letterlijk onveranderlijk. Dit contract zet een gecontroleerde schaalgrens neer:

- één host en SQLite blijven de eerste productieklasse zolang gemeten capaciteit en availability dat toelaten;
- regionprocessen kunnen op dezelfde host worden gescheiden zonder protocolwijziging;
- multi-host vereist vóór activatie een expliciete database- en message-buscutover;
- clientprotocol, authority en canonical buildpackages blijven daarbij gelijk.

### 0.3 Normatieve taal

**MOET**, **MAG NIET**, **BEHOORT**, **MAG** en **OPTIONEEL** hebben de betekenis uit Fase 1. Getallen en byte-layouts in dit document zijn normatief tenzij `voorbeeld` is vermeld.

---

## 1. Bewezen uitgangssituatie

Op repo-basis `47e1331c` is bewezen:

- `src/server/server.js` maakt één `ws` `WebSocketServer` met `noServer:true` en bindt die aan `MmoService`.
- `mmo-service.js` combineert verbindingen, sessions, movement, presence, persistence en broadcasts in één groot procespad.
- movement gebruikt al `clientSessionId` en input sequence voor stale/duplicate rejection, serverwalkability en revisioned state.
- positions worden legacy gedebounced naar SQLite geschreven; dit is geen volledige Fase-3 tick simulation of Fase-4 characteraggregate.
- migration 008 bevat `parties` en `party_members`; `node05-economy-runtime-service.js` gebruikt playerprofielen en legacy player IDs.
- er is geen bewezen canonical guild-, guildrank-, guildmembership-, chatmoderation- of presencecontract.
- bestaande Node-03/04/05-services lezen graph-compiled content en zijn migratiebronnen, geen eindarchitectuur.
- `server.js`, `game.js` en `mmo-service.js` zijn nog compositionele monolieten.
- Node 24, `ws`, Three.js, SQLite, Apache reverse proxy en systemd vormen de bestaande deploymentbasis.
- Fase 3 reserveert een 20 Hz authoritative simulation en dezelfde HTTPS-origin/WebSocketpoort.
- Fase 4 reserveert build-gepinde world joins, characterleases, revisioned aggregates en een eventgedreven UI.

Daarom is het verboden bestaande broadcasts of partytabellen simpelweg “MMO af” te noemen. Zij worden behouden waar correct, gemigreerd waar nodig en verwijderd waar legacyauthority overblijft.

---

## 2. Fasedoel, scope en niet-doelen

### 2.1 Fasedoel

Fase 5 is geslaagd wanneer:

1. twee of meer echte accounts gelijktijdig dezelfde published wereld kunnen betreden;
2. iedere movement-, combat-, inventory-, quest- en economyactie server-authoritative blijft;
3. lokale movement direct voelt door prediction, maar altijd convergeert naar serverstate;
4. andere actors vloeiend en begrensd via interest management verschijnen;
5. global, local, party, guild en whisper veilig werken;
6. parties en guilds reconnect/restart en concurrencyconflicten doorstaan;
7. één slechte of trage client geen tick, proces of andere clients blokkeert;
8. builds reproduceerbaar, beveiligd, observeerbaar, backupbaar en rollbackbaar worden uitgerold;
9. browser en server de vastgelegde performance- en leakgates halen;
10. geen live code, tabel, route, bundle of authoringactie meer van nodes/graph afhankelijk is;
11. Kevin de volledige multiplayerlus op de echte omgeving zichtbaar heeft geaccepteerd.

### 2.2 In scope

- authoritative realtimeprotocol en exacte packetversie.
- movement prediction/reconciliation en remote interpolation.
- region/cell interest, entity lifecycle en backpressure.
- session, reconnect, resume, lease en duplicate-loginbeleid.
- chat, block/mute/report, party, guild, roles en presence.
- single-host procesisolatie en meetbare multi-host seam.
- deploy, migrations, health/readiness/drain, rollback en backups.
- browser/server/network/database/WebGL-performance.
- assetbuild, hashes, compressie, caching en private sourcemaps.
- definitieve graph/nodeverwijdering na bewezen parity.

### 2.3 Buiten scope

- WebRTC peer-to-peer gameplay.
- UDP/QUIC/WebTransport voordat browser-, proxy- en loadbewijs een migratie rechtvaardigt.
- PvP ranking, matchmaking, battlegrounds en guild warfare.
- guild bank, guild housing, alliances en guild progression.
- voice chat, realtime translation en end-to-end encrypted chat.
- cross-shard party gameplay en seamless multi-region failover.
- Kubernetes, service mesh, Kafka of Redis als vooraf verplichte infrastructuur.
- anti-cheat kernelsoftware of clientvertrouwen.
- DRM of code-obfuscation als beveiligingsmaatregel.
- cash shop, payments en platform entitlements.

---

## 3. Onbreekbare invarianten

### N-01 - Serverauthority

De client stuurt alleen intenties. Positie, velocity, hit, damage, cooldown, inventory, currency, XP, questprogress, loot, party, guild en moderation worden uitsluitend door servercode geaccepteerd en gemuteerd.

### N-02 - Een actorowner

Op ieder moment bezit exact één region simulation owner de mutable actorstate. Gateways, social services, database en clients simuleren die actor niet parallel.

### N-03 - Een protocolversie per verbinding

Na handshake gebruikt een verbinding exact één negotiated protocolversie. Onbekende majorversie wordt geweigerd; onbekende message type binnen dezelfde major sluit met protocol error.

### N-04 - Deterministische tick

World simulation draait op 20 Hz: `tickDurationNs = 50_000_000`. Geen gameplayuitkomst gebruikt browserframe-delta of wall clock als integratiestap.

### N-05 - Ordered intent

Per connection epoch accepteert de server input sequences strikt oplopend. Duplicates zijn idempotent no-op; gaps worden gemarkeerd; te oude of te verre future input wordt geweigerd.

### N-06 - Bounded work

Iedere inbound queue, outbound queue, packet, commandbatch, chattekst, interestset en databasebatch heeft een harde limiet. Geen clientinput veroorzaakt onbeperkte loops, allocations of fan-out.

### N-07 - Build pinning

Connection, characterlease, regioninstance en entityspawn dragen hetzelfde `buildId`. Gameplaydata van verschillende builds wordt nooit in één simulation gemengd.

### N-08 - Social identity

Chat-, party- en guildafzender komen uit geauthenticeerde `characterId`/lease, nooit uit clientpayload.

### N-09 - Durable versus ephemeral

Guildmembership, sanctions en geaccepteerde social mutations zijn durable. Socketpresence, typing state, interpolationbuffers en tijdelijke party-ready status zijn ephemeral.

### N-10 - Geen socket-DB coupling

Een WebSocket messagehandler voert geen onbegrensde synchronous databasequery uit. Validatie en enqueue zijn begrensd; durable mutations lopen via getypeerde services/transactions.

### N-11 - Geen nodeauthority

Na eindcutover kan geen productieproces `editor_nodes`, `editor_node_edges`, node types, graph evaluator of graph compiler lezen of schrijven.

### N-12 - Release immutability

Een release en published build worden nooit ter plaatse gewijzigd. Deploy, assetmanifest en runtimepackages zijn content-addressed.

### N-13 - Observeerbaar zonder secrets

Iedere command/connection/deploy heeft correlation metadata; logs bevatten geen sessiontoken, jointicket, volledige chat/private payload, saveaggregate of wachtwoord.

### N-14 - Graceful overload

Bij druk verliest de client eerst cosmetische/far updates, nooit authoritative self state, commands, durable mutations of disconnectreden.

### N-15 - Geen security door minification

Minification en private sourcemaps verkleinen distributie; alleen serverauthority, authentication, authorization, validation en rate limits beschermen gameplay.

---

## 4. Doelarchitectuur

```text
browser client
  HTTPS bootstrap/assets/API
  WSS realtime
        |
Apache/TLS same origin
        |
Gateway / connection registry
  auth + origin + protocol + limits + routing
        |                         |
RegionSimulationOwner       SocialService
  20 Hz actor world          chat/party/guild/presence
        |                         |
Character/RPG services ---- Transaction coordinator
        |                         |
   SQLite single-host persistence + outbox
        |
immutable canonical build packages/assets
```

### 4.1 Procesrollen

De code kent vaste rollen, ook wanneer zij aanvankelijk in één OS-proces draaien:

- `gateway`: HTTP upgrade, connection lifecycle, decode/encode, rate limits, route.
- `region`: tick simulation, actors, cells, movement/combat authority, interest snapshots.
- `social`: chat, party, guild, presence en moderation.
- `persistence`: character/RPG/social transactions, outbox en recovery.
- `build-reader`: immutable manifest/package loading en hashverification.
- `web`: static hashed browserassets en REST.

Rolinterfaces gebruiken typed commands/events. Rechtstreekse imports van interne mutable maps tussen rollen zijn verboden.

### 4.2 Uitrolniveau P0

Eerste production deployment is één Node.js-proces op één host, één HTTP/S-listener achter Apache en één SQLite writer. Rollen zijn modules met queues en lifecycle, geen microservices. Dit is de minimale betrouwbare vorm voor de huidige projectomvang.

### 4.3 Uitrolniveau P1

Wanneer loadtests tonen dat tick/event-loop budget bij 60% van gewenste peak wordt overschreden:

- gateway/web blijft hoofdproces;
- iedere actieve RegionInstance draait in een `child_process`, niet in `worker_threads`;
- IPC gebruikt hetzelfde interne command/eventschema met transferable binary buffers waar beschikbaar;
- een crash herstart uitsluitend de region en herstelt uit durable snapshot/eventboundary;
- verbindingen worden na region recovery geresynct of gecontroleerd gesloten.

`worker_threads` worden alleen als vaste pool gebruikt voor gemeten CPU-taken zonder authority, zoals offline compression/buildvalidation. Node asynchronous I/O blijft op de normale event loop.

### 4.4 Uitrolniveau P2

Multi-host is pas toegestaan na een apart goedgekeurd capacitycheckpoint:

- durable online state migreert van SQLite naar een transactiedatabase met multi-process/multi-host concurrency, normatief PostgreSQL;
- distributed presence/routing krijgt een bewezen ephemeral broker;
- region ownership gebruikt fencing tokens/leases uit een consistente store;
- outbox/inbox blijft idempotent;
- protocol en canonical buildformat veranderen niet.

SQLite mag op P2 read-only buildcatalog of lokale cache blijven, niet gedeelde online writeauthority. P2 is geen voorwaarde om Fase 5 op de huidige schaal te accepteren.

---

## 5. Transportkeuze en handshake

### 5.1 Transport

- Productie gebruikt uitsluitend `wss://<same-origin>/ws/game` via RFC 6455.
- Eén bestaande HTTPS-poort; geen tweede publieke gamepoort.
- Subprotocol exact `gk-mmo-v1`.
- `perMessageDeflate=false`.
- `maxPayload=65536` bytes inclusief applicatieheader.
- Proxy ondersteunt HTTP/1.1 Upgrade en idle timeout minimaal 75 s.
- WebRTC wordt niet gebruikt: peertrust, NAT, authority en operationele complexiteit voegen geen waarde toe voor server-authoritative gameplay.

### 5.2 Upgradevolgorde

Voor `handleUpgrade` controleert gateway exact:

1. methode `GET` en pad `/ws/game`;
2. HTTPS-forwarded policy uit vertrouwde Apache-hop;
3. `Origin` exact in configured allowlist, geen substring/wildcard;
4. geldige sessioncookie en niet verlopen/revoked session;
5. single-use Fase-4 worldJoinTicket uit `Sec-WebSocket-Protocol` companion authheader of eerste AUTH message, nooit querystring;
6. requested subprotocol bevat `gk-mmo-v1`;
7. IP/session/account connectionrate en concurrentielimiet;
8. ticket user/profile/character/build/region matcht;
9. ticket atomisch consumeren;
10. pas daarna socket accepteren en connection epoch uitgeven.

Wanneer browser-API geen custom authheader ondersteunt, bevat de eerste JSON-controlmessage binnen 5 s het single-use ticket. Tot validatie accepteert gateway uitsluitend `AUTH`, verstuurt geen protected state en limiteert unauthenticated sockets per IP.

### 5.3 Welkomstbericht

```ts
interface WelcomeV1 {
  type: "WELCOME";
  protocol: "gk-mmo-v1";
  connectionId: string;
  connectionEpoch: number;
  characterId: string;
  buildId: string;
  regionInstanceId: string;
  serverTick: number;
  tickRateHz: 20;
  snapshotRates: { self: 20; near: 10; far: 2 };
  resumeToken: string;
  resumeExpiresAt: string;
}
```

`resumeToken` is 256-bit random, server-side hashed, gebonden aan session/character/epoch en maximaal 30 s geldig.

---

## 6. Wire protocol

### 6.1 Hybride encoding

- Hoge frequentie gameplay gebruikt binary WebSocket messages.
- Handshake, errors, chat en laagfrequente social commands gebruiken UTF-8 JSON.
- Een WebSocket message bevat exact één applicatiepacket; application fragmentation is verboden.
- JSON wordt schema-strict gevalideerd: onbekende keys, verkeerde types, nonfinite numbers en te lange strings falen.
- Binary decoder controleert lengte vóór iedere read en accepteert geen trailing bytes.

### 6.2 Binary header V1

Alle integers zijn big-endian. Header is exact 28 bytes:

| Offset | Type | Veld |
| ---: | --- | --- |
| 0 | `u16` | magic `0x474B` (`GK`) |
| 2 | `u8` | major `1` |
| 3 | `u8` | messageType |
| 4 | `u16` | flags |
| 6 | `u16` | headerBytes, exact `28` |
| 8 | `u32` | payloadBytes |
| 12 | `u32` | connectionEpoch |
| 16 | `u32` | packetSequence |
| 20 | `u32` | ackPacketSequence |
| 24 | `u32` | authoritativeTick of `0` client control |

`payloadBytes + 28` moet exact message length zijn. Sequencevergelijking gebruikt RFC-1982-achtige 32-bit serial arithmetic: `a` is nieuwer dan `b` als `0 < ((a-b) mod 2^32) < 2^31`.

### 6.3 Message types

| Code | Richting | Naam | Klasse |
| ---: | --- | --- | --- |
| `0x01` | C->S | `INPUT_BATCH` | critical |
| `0x02` | S->C | `SELF_STATE` | critical, supersedable ouder |
| `0x03` | S->C | `WORLD_DELTA` | supersedable |
| `0x04` | S->C | `WORLD_KEYFRAME_PART` | critical |
| `0x05` | S->C | `ENTITY_SPAWN` | critical |
| `0x06` | S->C | `ENTITY_DESPAWN` | critical |
| `0x07` | S->C | `GAMEPLAY_EVENT` | critical/dedupe |
| `0x08` | C->S | `COMMAND` | critical |
| `0x09` | S->C | `COMMAND_RESULT` | critical |
| `0x0A` | beide | `TIME_SYNC` | critical |

Onbekende code sluit met 1002. Protocolbeleidsschending sluit met 1008. Te groot sluit met 1009. Serverfout sluit met 1011 zonder interne details.

### 6.4 `INPUT_BATCH`

Payloadprefix:

| Bytes | Type | Veld |
| ---: | --- | --- |
| 0..3 | `u32` | firstInputSequence |
| 4 | `u8` | commandCount, `1..4` |
| 5..7 | zero | reserved |

Daarna exact `commandCount` records van 16 bytes:

| Offset record | Type | Veld |
| ---: | --- | --- |
| 0 | `u32` | inputSequence |
| 4 | `u32` | predictedServerTick |
| 8 | `i16` | moveX, `-32767..32767` |
| 10 | `i16` | moveZ, `-32767..32767` |
| 12 | `u16` | yaw, `0..65535` maps op `[0,2pi)` |
| 14 | `u16` | buttons bitset |

`sqrt(moveX^2+moveZ^2)` wordt server-side begrensd tot 32767. Buttons bevatten alleen movement/sprint/jump/interact en ability slots als edge bits; payload bevat nooit positie, damage of targetresultaat. Commands voor inventory/social blijven aparte idempotente commands.

### 6.5 `SELF_STATE`

Payload exact:

```text
u32 lastProcessedInputSequence
u32 stateRevision
i32 xMm, i32 yMm, i32 zMm
i32 velocityXMmS, i32 velocityYMmS, i32 velocityZMmS
u16 yaw, u16 movementFlags
i32 healthMilli, i32 resourceMilli
u32 effectsRevision, u32 equipmentRevision
```

Ongewijzigde omvang: 52 bytes. Detailarrays volgen via `GAMEPLAY_EVENT` of revision-triggered statepatch, niet in iedere movementstate.

### 6.6 Entity mapping en delta

`ENTITY_SPAWN` kent een connection-local `u32 netEntityId` toe en draagt één keer runtime archetype key, generation, initial transform, presentation state en component revisions. IDs worden binnen dezelfde epoch niet hergebruikt.

`WORLD_DELTA` bevat:

```text
u32 snapshotId
u32 baseSnapshotId
u16 entityCount
u16 reserved
repeated {
  u32 netEntityId
  u16 generation
  u16 componentMask
  fields in fixed mask order
}
```

Maskvolgorde: transform, velocity, animation, health-public, nameplate-state, combat-public, interactable-state. Transform is `i32 x/y/z mm + u16 yaw`. Private stats/inventory worden nooit als remote delta verzonden.

Iedere 5 s en na gap/resume verstuurt server een keyframe. Keyframes groter dan 60 KiB worden in maximaal 16 genummerde parts verdeeld; client activeert ze atomisch na volledige hash/partset, anders vraagt hij resync.

### 6.7 JSON envelope

```ts
interface JsonMessageV1<T> {
  v: 1;
  type: string;
  requestId?: string;
  clientSequence?: number;
  expectedRevision?: number;
  payload: T;
}
```

Max JSON message 16 KiB; chat send 4 KiB transport en maximaal 500 Unicode scalar values na normalisatie. JSON commandresponses bevatten `requestId`, typed result/error en actuele revision.

---

## 7. Tick, input en authoritative simulatie

### 7.1 Tickclock

Gebruik monotonic `process.hrtime.bigint()`. Tick `T` heeft targettime `startNs + T * 50_000_000`. De server:

1. verzamelt gevalideerde commands met `targetTick <= T`;
2. sorteert per actor op inputSequence en daarna stable actor ID;
3. draait Fase-3 movement/AI/ability/effect/combatvolgorde;
4. commit durable boundary events via transaction/outbox;
5. bouwt interest deltas;
6. enqueue outbound packets;
7. meet duration en event-loop delay.

Geen `setInterval`-drift: volgende wake gebruikt absolute deadline. Bij minder dan één tick achterstand draait exact één tick. Bij achterstand:

- maximaal 3 catch-up ticks per event-loop turn;
- daarna blijft simulation time authoritative achterlopen en rapporteert `tick_lag`, zonder grotere `dt`;
- 5 opeenvolgende ticks >50 ms zet instance `DEGRADED`;
- 100 ticks of 5 s onafgebroken lag zet `DRAINING`, weigert joins en alarmeert.

### 7.2 Input acceptancewindow

Per actor/epoch:

- maximaal 4 inputs per packet;
- maximaal 40 inputrecords/s, burst 12;
- sequence moet nieuwer zijn dan `lastAcceptedInputSequence`;
- `predictedServerTick` mag maximaal 2 ticks voor en 20 ticks achter actuele serverTick liggen;
- ontbrekende ticks herhalen laatste movementvector maximaal 2 ticks, daarna zero input;
- buttons edge wordt nooit kunstmatig herhaald;
- meer dan 32 sequence gap vraagt input resync en verhoogt suspicion metric.

### 7.3 Validatievolgorde

Voor iedere intentie:

```text
connection/session/epoch alive
-> character lease ownership
-> build/region match
-> sequence/tick/rate/size
-> actor alive/control allowed
-> normalized movement and speed policy
-> nav/collision/surface/area rules
-> ability/equipment/resource/cooldown/range/LOS
-> deterministic simulation
-> authoritative events/state
```

De client kan animation state aanvragen noch hit bevestigen. Animation volgt server movement/ability events.

---

## 8. Client prediction en reconciliation

### 8.1 Predictiongrens

Client voorspelt alleen de eigen locomotion met dezelfde versioned pure movementkernel als server. Niet voorspeld als waarheid:

- damage, death en hitresultaat;
- resourcekosten/cooldowns;
- loot, inventory, currency en XP;
- interactie-, quest-, craft-, vendor- of marketresultaat;
- remote actorposities.

Een ability mag lokaal wind-up animatie/VFX tonen als `pending`; server accept/reject bepaalt committed presentatie.

### 8.2 Inputbuffer

Client bewaart maximaal 256 inputrecords:

```ts
interface PredictedInput {
  sequence: number;
  predictedServerTick: number;
  command: NormalizedMoveCommand;
  predictedAfter: FixedMovementState;
}
```

Na `SELF_STATE`:

1. verifieer epoch/revision;
2. verwijder inputs `<= lastProcessedInputSequence` via serial arithmetic;
3. zet basis op authoritative state;
4. replay resterende inputs in volgorde met exact 50 ms step;
5. bereken fout tegen huidig gerenderd selfmodel;
6. update simulationstate direct en rendercorrectie volgens 8.3.

### 8.3 Correctie

`positionErrorMm = length(authoritativeReplayed - rendered)` en kleinste yawerror:

- `<=75 mm` en `<=2 graden`: renderoffset lineair naar nul in 100 ms;
- `>75 mm` en `<=500 mm`: renderoffset critically damped naar nul, half-life 60 ms, maximaal 200 ms;
- `>500 mm`, region/cell mismatch, respawn of collisiontopologie gewijzigd: hard snap binnen hetzelfde frame;
- camera gebruikt aparte gedempte followoffset zodat correctie geen dubbele simulation veroorzaakt.

Correcties veranderen nooit opnieuw serverinput. Telemetry telt correcties per band; p95 hard snaps buiten teleport/respawn moet nul zijn tijdens acceptatieload.

### 8.4 Remote interpolation

Remote actors worden niet gepredict. Client bewaart maximaal 32 snapshots/actor en rendert op `estimatedServerTime - interpolationDelay`.

- startdelay 100 ms;
- jitter EWMA `J = J + 0.1*(abs(transitDelta)-J)`;
- delay `clamp(100 ms + 2*J, 100 ms, 250 ms)`;
- interpolatie lineair positie, shortest-arc yaw, animationparameters uit snapshots;
- extrapolatie maximaal 150 ms met laatste velocity, daarna hold;
- teleport/spawn/respawn snap en resetbuffer.

---

## 9. Interest management

### 9.1 Spatial bron

Fase-2 Cell van 64.000 mm is de interestunit. Iedere connection heeft:

- `ownedCell`: cell van authoritative actor;
- `nearCells`: Chebyshev radius 1;
- `farCells`: radius 2 minus near;
- explicit subscriptions: party marker/quest event zonder private spatial details.

### 9.2 Updatefrequentie

| Klasse | Frequentie | Inhoud |
| --- | ---: | --- |
| self | 20 Hz | volledige public/self movementkern |
| near actor <=1 cell | 10 Hz | transform/animation/combatpublic |
| far actor radius 2 | 2 Hz | transform/coarse state |
| static unchanged | spawn eenmaal | alleen change events |
| buiten interest | 0 | despawn na hysterese |

Enter gebruikt radius; leave pas wanneer actor 5 m buiten buitenrand staat of 500 ms buiten set blijft. Dit voorkomt boundaryflap.

### 9.3 Visibility en privacy

Interest is noodzakelijk maar niet voldoende. Server filtert ook phase/instance, stealth/discovery, team/permission en private componentpolicy. Party/guildmembership geeft nooit automatisch remote inventory, exact health of verborgen locatie.

### 9.4 Fan-out

Region maakt één immutable delta per spatial cohort en encodeert per connection alleen verschillen door netEntity mapping/privacy. Chat/social broadcast deelt immutable UTF-8 payloadbuffers. Geen `JSON.stringify` per ontvanger in tickhotpath.

---

## 10. Backpressure en verbindinglifecycle

### 10.1 Outbound queues

Per socket:

- critical queue: max 256 messages of 512 KiB;
- supersedable state: maximaal nieuwste self, worlddelta per cohort en presence revision;
- cosmetic queue: max 64 messages of 128 KiB;
- totaal hard max 1 MiB inclusief `ws.bufferedAmount`.

Bij `bufferedAmount >256 KiB`: coalesce/drop cosmetic en oudere deltas. Boven 512 KiB langer dan 2 s: stuur `SLOW_CLIENT`, force keyframe op herstel. Boven 1 MiB of 10 s boven 512 KiB: close 4008 `slow_client`.

Critical durable results worden nooit stil gedropt; als zij niet binnen limiet passen sluit connection en client haalt na reconnect authoritative snapshot/result op.

### 10.2 Heartbeat

- server RFC ping iedere 15 s;
- client pongdeadline 10 s;
- twee gemiste pongdeadlines sluiten 4000 `heartbeat_timeout`;
- session validity iedere 5 min en bij security event opnieuw controleren;
- logout/revoke sluit alle sessionconnections direct 4001.

### 10.3 Reconnect/resume

Client reconnect met full-jitter exponential backoff: random `[0,min(30s,500ms*2^attempt)]`. Resume binnen 30 s levert token, last received packet/snapshot, last processed event en input sequence.

Server accepteert resume alleen bij dezelfde session, characterlease, build, region en niet-ingetrokken epoch. Server geeft nieuwe connection epoch, invalidates oud socket, stuurt self snapshot + keyframe + durable event gap. Anders volgt nieuwe Fase-4 world join.

### 10.4 Duplicate login

Een character heeft exact één controlling connection. Nieuwe geldige join:

- verhoogt lease epoch;
- sluit oude controller 4002 `replaced`;
- read-only account/menu sockets mogen blijven maar sturen geen gameplaycommands.

---

## 11. Command- en eventcontract

### 11.1 Client command

```ts
interface ClientCommandV1<T> {
  commandId: string;          // UUIDv7
  commandType: string;
  characterId: string;        // moet lease identity matchen
  connectionEpoch: number;
  expectedRevision?: number;
  clientTick?: number;
  payload: T;
}
```

Server negeert client `characterId` als authority en vergelijkt hem met connectioncontext. Inventory/economy/storycommands gebruiken `operation_idempotency` uit Fase 4: zelfde ID+hash retourneert eerder resultaat; zelfde ID+andere hash is conflict.

### 11.2 Authoritative event

```ts
interface AuthoritativeEventV1<T> {
  eventId: string;
  eventType: string;
  buildId: string;
  regionInstanceId?: string;
  serverTick?: number;
  aggregateType: string;
  aggregateId: string;
  aggregateRevision: number;
  occurredAt: string;
  payload: T;
}
```

Events worden transactioneel met state en outbox vastgelegd waar durable. Region-only movement snapshots zijn ephemeral en komen niet in de database.

---

## 12. Chatarchitectuur

### 12.1 Channels

| Channel | Ontvangers | Persistentie |
| --- | --- | --- |
| `global` | online characters met channel enabled | 7 dagen |
| `local` | zelfde regioninstance, <=60.000 mm en visibility | 24 uur |
| `party` | actuele partyleden | 7 dagen |
| `guild` | actuele guildleden met view permission | 30 dagen |
| `whisper` | exact sender/recipient | 30 dagen |
| `system` | servergeselecteerde audience | policy/eventaudit |

Retention is serverjob, dagelijks in batches van maximaal 1000 rows per transaction. Deletebeleid en privacytekst worden in productie zichtbaar gemaakt.

### 12.2 Sendflow

```text
CHAT_SEND request
-> session/lease/rate/size/schema
-> Unicode NFC + trim + control-character rejection
-> mute/block/sanction/channel permission
-> derive sender and audience server-side
-> persist accepted message when channel requires
-> allocate monotonic channel sequence
-> enqueue immutable delivery event
-> return accepted message ID
```

Geen HTML/Markdown. Client rendert met `textContent`. URLs blijven platte tekst. Bericht mag na normalisatie 1..500 Unicode scalar values en 2000 UTF-8 bytes bevatten.

### 12.3 Rate limits

Token bucket per character en account:

- global: 1/s, burst 3, max 20/min;
- local: 2/s, burst 5, max 60/min;
- party/guild: 3/s, burst 6, max 90/min;
- whisper: 2/s, burst 4, max 30/min per recipient en 60/min totaal;
- duplicate normalized content binnen 5 s wordt geweigerd.

Rate hit geeft typed cooldown; herhaald misbruik verhoogt securitymetric en kan automatische tijdelijke mute volgens moderationpolicy geven.

### 12.4 Chat SQL

```sql
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  channel_type TEXT NOT NULL CHECK (channel_type IN
    ('global','local','party','guild','whisper','system')),
  channel_key TEXT NOT NULL,
  channel_sequence INTEGER NOT NULL,
  sender_character_id TEXT,
  recipient_character_id TEXT,
  body_text TEXT NOT NULL,
  normalized_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  moderation_state TEXT NOT NULL DEFAULT 'visible'
    CHECK (moderation_state IN ('visible','hidden','deleted')),
  FOREIGN KEY (sender_character_id) REFERENCES player_characters(id),
  FOREIGN KEY (recipient_character_id) REFERENCES player_characters(id),
  UNIQUE (channel_type, channel_key, channel_sequence)
);

CREATE INDEX idx_chat_channel_sequence
ON chat_messages(channel_type, channel_key, channel_sequence DESC);

CREATE INDEX idx_chat_expiry ON chat_messages(expires_at);
```

`channel_key`: `global`, regionInstanceId, partyId, guildId of canonical sorted `minCharacterId:maxCharacterId` voor whisper.

### 12.5 Block, mute en report

```sql
CREATE TABLE character_blocks (
  owner_character_id TEXT NOT NULL,
  blocked_character_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_character_id, blocked_character_id),
  CHECK (owner_character_id <> blocked_character_id),
  FOREIGN KEY (owner_character_id) REFERENCES player_characters(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_character_id) REFERENCES player_characters(id) ON DELETE CASCADE
);

CREATE TABLE chat_sanctions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('mute','chat_ban')),
  scope TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  created_by TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE chat_reports (
  id TEXT PRIMARY KEY,
  reporter_character_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','reviewed','actioned','dismissed')),
  UNIQUE (reporter_character_id, message_id),
  FOREIGN KEY (reporter_character_id) REFERENCES player_characters(id),
  FOREIGN KEY (message_id) REFERENCES chat_messages(id)
);
```

Block voorkomt whisper beide richtingen en verbergt niet-system chat voor blocker. Staff/auditdata heeft apart permissionpad; normale client ontvangt geen moderationdetails.

---

## 13. Partycontract

### 13.1 Model

Party is server-owned social aggregate, maximaal 5 actieve members. Party is niet hetzelfde als regioninstance; leden mogen tijdelijk in verschillende regions zijn.

```sql
CREATE TABLE parties_v2 (
  id TEXT PRIMARY KEY,
  leader_character_id TEXT NOT NULL,
  loot_policy TEXT NOT NULL DEFAULT 'personal'
    CHECK (loot_policy IN ('personal','round_robin')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','disbanded')),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disbanded_at TEXT,
  FOREIGN KEY (leader_character_id) REFERENCES player_characters(id)
);

CREATE TABLE party_members_v2 (
  party_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('leader','assistant','member')),
  joined_at TEXT NOT NULL,
  left_at TEXT,
  PRIMARY KEY (party_id, character_id),
  FOREIGN KEY (party_id) REFERENCES parties_v2(id),
  FOREIGN KEY (character_id) REFERENCES player_characters(id)
);

CREATE UNIQUE INDEX idx_party_one_active_per_character
ON party_members_v2(character_id) WHERE left_at IS NULL;

CREATE TABLE party_invites (
  id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL,
  inviter_character_id TEXT NOT NULL,
  invitee_character_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN
    ('pending','accepted','declined','expired','revoked')),
  expected_party_revision INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  responded_at TEXT,
  FOREIGN KEY (party_id) REFERENCES parties_v2(id),
  FOREIGN KEY (inviter_character_id) REFERENCES player_characters(id),
  FOREIGN KEY (invitee_character_id) REFERENCES player_characters(id)
);

CREATE UNIQUE INDEX idx_party_one_pending_invite
ON party_invites(party_id, invitee_character_id)
WHERE status = 'pending';
```

### 13.2 Mutations

Create, invite, accept, decline, cancel, leave, kick, promote, transfer leader, set loot policy en disband zijn idempotente commands met expected revision.

Accept transaction controleert invite pending/niet verlopen, invitee niet al in party, party active, count <5 en revision. Zij voegt member toe of activeert bij eerder lidmaatschap dezelfde `(party_id,character_id)`-rij opnieuw met nieuwe `joined_at` en `left_at=NULL`, markeert invite accepted, verhoogt revision en schrijft outboxevent atomisch.

Leader leave kiest geen willekeurige clientwaarde: eerst oudste online assistant, anders oudste online member, anders oudste member. Laatste member disbandt party.

### 13.3 Party gameplay

- Fase-3 loot attribution gebruikt membership snapshot op killtick.
- Personal loot blijft default.
- Round robin cursor is serverstate en verschuift alleen na succesvolle grant.
- Party UI krijgt coarse region/online/dead state; exacte remote location alleen wanneer dezelfde region en normal interest toestaat.
- Disconnect verwijdert member niet. Presence wordt offline; explicit leave/kick/disband muteert membership.

Legacy `parties`/`party_members` uit migration 008 worden character-ID-bewust geimporteerd, vergeleken en daarna verwijderd in sectie 29.

---

## 14. Guildcontract

### 14.1 Grenzen

Een character is lid van maximaal één actieve guild. Guild maximum is initieel 100 actieve members; wijziging is serverconfig met migration/capacitytest, geen clientveld.

### 14.2 SQL

```sql
CREATE TABLE guilds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  tag TEXT NOT NULL,
  tag_key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  owner_character_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','disbanded')),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disbanded_at TEXT,
  FOREIGN KEY (owner_character_id) REFERENCES player_characters(id)
);

CREATE TABLE guild_ranks (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  rank_order INTEGER NOT NULL CHECK (rank_order BETWEEN 0 AND 9),
  name TEXT NOT NULL,
  is_owner_rank INTEGER NOT NULL DEFAULT 0 CHECK (is_owner_rank IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1,
  UNIQUE (guild_id, rank_order),
  FOREIGN KEY (guild_id) REFERENCES guilds(id)
);

CREATE TABLE guild_rank_permissions (
  rank_id TEXT NOT NULL,
  permission_key TEXT NOT NULL CHECK (permission_key IN (
    'view_roster','invite','remove_member','edit_motd','edit_ranks',
    'promote_below_self','demote_below_self','read_guild_chat',
    'write_guild_chat','transfer_ownership','disband'
  )),
  PRIMARY KEY (rank_id, permission_key),
  FOREIGN KEY (rank_id) REFERENCES guild_ranks(id) ON DELETE CASCADE
);

CREATE TABLE guild_members (
  guild_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  rank_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  left_at TEXT,
  note_text TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (guild_id, character_id),
  FOREIGN KEY (guild_id) REFERENCES guilds(id),
  FOREIGN KEY (character_id) REFERENCES player_characters(id),
  FOREIGN KEY (rank_id) REFERENCES guild_ranks(id)
);

CREATE UNIQUE INDEX idx_guild_one_active_per_character
ON guild_members(character_id) WHERE left_at IS NULL;

CREATE TABLE guild_invites (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  inviter_character_id TEXT NOT NULL,
  invitee_character_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN
    ('pending','accepted','declined','expired','revoked')),
  expected_guild_revision INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  responded_at TEXT,
  FOREIGN KEY (guild_id) REFERENCES guilds(id),
  FOREIGN KEY (inviter_character_id) REFERENCES player_characters(id),
  FOREIGN KEY (invitee_character_id) REFERENCES player_characters(id)
);

CREATE UNIQUE INDEX idx_guild_one_pending_invite
ON guild_invites(guild_id, invitee_character_id)
WHERE status = 'pending';
```

### 14.3 Naamnormalisatie

Guild name: NFC, trim/collapse whitespace, 3..32 Unicode scalar values. Tag: NFC uppercase, 2..5 letters/digits volgens configured Unicodepolicy. `name_key`/`tag_key` gebruikt dezelfde versioned casefold/normalizer als characternamen. Reserved/profane policy is server-side en versioned.

### 14.4 Rankinvarianten

- exact één owner rank met `rank_order=0`;
- owner is exact één actief member en matcht `guilds.owner_character_id`;
- een actor mag alleen targets met numeriek hogere `rank_order` wijzigen;
- niemand kan owner permission verwijderen;
- ownership transfer muteert oude/nieuwe rank en guild owner atomisch;
- guild disband vereist owner, recente auth en confirmation nonce;
- disband sluit membership/chatwrite, maar bewaart audit/retention.

### 14.5 Guild mutationflow

Iedere mutation controleert session, character, active membership, permission, target hierarchy, expected guild revision en idempotency in één transaction. Accept gebruikt dezelfde heractivatieregel als party membership: een bestaande historische `(guild_id,character_id)`-rij krijgt nieuwe `joined_at`, gekozen rank en `left_at=NULL`. De transaction muteert state, verhoogt guildrevision exact eenmaal en schrijft outbox. Clients ontvangen nieuwe aggregate snapshot/delta; zij passen geen optimistic guildauthority toe.

---

## 15. Presence

Presence is ephemeral en privacybegrensd:

```ts
interface PresenceV1 {
  characterId: string;
  state: "online" | "away" | "offline";
  regionRuntimeKey?: string;
  activity: "menu" | "loading" | "playing";
  revision: number;
  changedAt: string;
}
```

- online na geldige characterlease + world ready;
- away na 5 min zonder input/UI action, maar simulation blijft serverpolicy volgen;
- offline na lease expiry/disconnect grace 30 s;
- guild/party ziet regionlabel, niet coordinates;
- blocked characters krijgen geen whisper/presencedetail;
- presence wordt niet per tick naar SQLite geschreven.

Op single process is memory authoritative met outbox-afgeleide social updates. Op P2 is presencebroker vervangbaar achter `PresencePort`.

---

## 16. Main-thread en queue-isolatie

### 16.1 Geen blocking werk

In gateway/tickhotpath verboden:

- synchronous filesystem I/O;
- schema compilation;
- GLB/image processing;
- onbeperkte JSON parse/stringify;
- full-table queries;
- password hashing;
- compression per packet;
- dynamische import of code evaluation.

Schemas, builds en static buffers worden vóór readiness geladen. SQLite statements zijn prepared en queries begrensd/indexed.

### 16.2 Queues

Iedere rol heeft bounded MPSC-logica met vaste commandobjecten of binary buffers:

- gateway->region max 4096 commands/region;
- region->gateway max 8192 outbound descriptors;
- gateway->social max 2048;
- persistence queue max 2048 durable operations;
- outbox dispatcher max batch 100, max 10 batches/turn.

Queue vol geeft typed overload: gameplayinput mag nieuwste movement per actor coalescen; durable command wordt `SERVER_BUSY` zonder mutation; join wordt geweigerd. Geen verborgen onbeperkte Promiseketens.

### 16.3 CPU workers

Vaste workerpoolgrootte `max(1, min(2, availableParallelism()-1))` op huidige host. Alleen taken >5 ms CPU die geen mutable online authority dragen. Queue max 32; timeout/cancellation verplicht. Simulatie en SQLiteconnection gaan niet naar workerthread.

---

## 17. Persistence, outbox en recovery

### 17.1 SQLite single-host contract

- één processrol bezit writeconnection;
- foreign keys ON, WAL, `busy_timeout=5000`;
- transactions kort en zonder network/file await;
- iedere social/RPG mutation state + revision + idempotency + outbox atomisch;
- readers zien committed snapshots;
- WAL checkpoint wordt gemonitord en gecoördineerd, niet per request geforceerd.

### 17.2 Outbox

```sql
CREATE TABLE runtime_outbox (
  id TEXT PRIMARY KEY,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  aggregate_revision INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL,
  dispatched_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  last_error_code TEXT,
  UNIQUE (aggregate_type, aggregate_id, aggregate_revision, event_type)
);
```

Dispatcher levert at-least-once; consumers dedupen eventId/revision. Exponential retry 250 ms, 1 s, 4 s, 16 s, 60 s, daarna iedere 5 min en alarm. Outbox failure rolt gecommitte gameplay niet terug.

### 17.3 Region snapshots

Ephemeral actors worden niet iedere tick persisted. Durable character checkpoint volgens Fase 4 en world entity state via events/snapshots. Region schrijft recovery snapshot bij graceful drain en periodiek maximaal iedere 30 s voor uitsluitend daarvoor aangewezen durable state. Crash recovery herstelt laatste snapshot + durable events; tijdelijke projectiles/VFX verdwijnen.

### 17.4 Backup

Production deploy verandert bestaand dagelijks off-site backupcontract niet. Voor migration/node-drop is extra consistente pre-cutover backup plus restore rehearsal verplicht. Backup bevat database, canonical documents/builds, assets, release manifest, config/secrets volgens bestaand beveiligingsbesluit en migrationreport.

---

## 18. Security en anti-cheat

### 18.1 Trust boundary

Browsercode, WebGL, DOM, localStorage, packet timestamps, modelpositie en UI zijn volledig onbetrouwbaar. TLS beschermt transport, niet tegen een gemodificeerde client.

### 18.2 Verplichte controles

- WSS en exact Origin allowlist.
- HttpOnly Secure SameSite sessioncookie; rotation/revoke.
- single-use join/resume tokens, nooit URL/log.
- ownership + permission op iedere command.
- strict schemas/length/range/enums en finite integers.
- per-IP/session/account/character/message rate limits.
- max connections en unauthenticated timeout.
- no `eval`, Function, dynamic authored JS of SQL interpolation.
- constant-time token/hash comparison waar relevant.
- CSP, trusted asset origins, output escaping.
- production errors tonen code/correlationId, geen stack/SQL/path.

### 18.3 Movement/combat detection

Server voorkomt cheats primair door authority. Daarnaast registreert hij zonder automatische permanente ban:

- excessive input rate/gaps/future ticks;
- repeated invalid speed/nav/collision attempts;
- impossible ability target/range/LOS/cooldown;
- command replay/hash conflict;
- abnormal reconciliation/hard snap pattern.

Scores zijn metrics voor onderzoek en tijdelijke throttling. Alleen bewezen policy beslist sanction; latency of browserstutter mag geen ban veroorzaken.

### 18.4 Chat abuse

Normalisatie, length/rate, block, mute, reports en staffaudit zijn verplicht. Automatische contentfilters geven een versioned reason en mogen geen SQL/regex-catastrophic path hebben. Usertekst wordt nooit gelogd buiten geautoriseerde message/auditstore.

---

## 19. Productiebuild

### 19.1 Reproduceerbaarheid

Build draait vanuit schone checkout met locked Node major/minor, `npm ci`, lockfile en expliciete timezone/locale. Outputmanifest bevat:

```ts
interface ReleaseManifestV1 {
  schemaVersion: 1;
  releaseId: string;
  gitCommit: string;
  nodeVersion: string;
  lockfileSha256: string;
  builtAt: string;
  appFiles: Array<{ path: string; sha256: string; bytes: number }>;
  buildIds: string[];
  migrationHead: string;
}
```

Tweemaal bouwen uit dezelfde inputs moet dezelfde contentfiles/hashes geven; `builtAt` staat in los releasemetadata en mag contenthashes niet vervuilen.

### 19.2 Browserbundles

- ESM code splitting per boot/menu/world/editor.
- tree shaking en minification in production.
- content-hashed filenames en immutable cache 1 jaar.
- HTML/bootstrap no-cache; manifest revalidate.
- Brotli vooraf voor JS/CSS/JSON/text, gzip fallback.
- production sourcemaps niet publiek; apart beveiligd bij release artifacts.
- geen obfuscation als securitylaag; alleen optioneel wanneer gemeten download/runtime niet verslechtert.
- editorcode wordt nooit in gamebundle geladen.

### 19.3 Assetpipeline

Uploadbron blijft ongewijzigd origineel met hash. Published variants:

- GLB validation en bounds/animation/material manifest;
- meshopt of Draco alleen na decode/performancevergelijking op reference laptop;
- KTX2/Basis textures met ETC1S voor color/ORM en UASTC waar normal/quality dit vereist;
- mipmaps verplicht voor minified worldtextures;
- texture dimensions/power policy en max per qualitytier;
- LOD0/1/2 waar silhouette/usage dit vereist;
- audio WebM/Opus of ondersteund fallback volgens Fase 2/3;
- alle variants content-addressed en in asset manifest.

Runtime kiest alleen manifestvariants die capabilitycheck ondersteunt; onbekende compression faalt naar bewezen fallback, niet blank object.

---

## 20. WebGL- en browserperformance

### 20.1 Qualitytiers

| Budget in camera | Low | Medium |
| --- | ---: | ---: |
| draw calls p95 | 120 | 250 |
| rendered triangles p95 | 350.000 | 900.000 |
| resident texture estimate | 256 MiB | 512 MiB |
| dynamic shadow lights | 1 | 1 |
| shadow map | 1024 | 2048 |
| active skeletal actors near | 12 | 24 |
| particles visible | 500 | 1500 |

Low is default op Kevins Pentium 4417U-klasse totdat calibrated probe medium aantoonbaar haalt. Qualitywissel verandert presentatie, nooit interestauthority/gameplayrange.

### 20.2 Draw-callregels

- statischezelfde geometry/material per cell via `InstancedMesh` of offline merge waar selectie niet nodig is;
- skinned actors delen geometry/material/texture waar mogelijk, maar skeleton/animationstate blijft per actor;
- maximaal bewezen materialslots; geen materialclone per entity;
- frustum + Cell visibility + LOD;
- transparent objects beperkt en back-to-front alleen in lokaal set;
- shadows alleen geselecteerde casters/receivers per tier;
- nameplates/UI in begrensde DOM/canvaslaag, niet één WebGL draw per letter.

### 20.3 Resource lifecycle

Asset cache gebruikt `{assetHash,variant}` refcount. Op refcount nul begint grace 30 s; unload verwijdert scene references en dispose geometries, materials, textures, skeletons en render targets exact eenmaal. Shared resources hebben ownership handles; entity dispose mag shared asset niet direct vernietigen.

`renderer.info` en cache counters worden gemeten. Na 20 region enter/leave en 50 UI/social-panelcycli moeten textures/geometries/subscriptions/timers binnen 5% van warmed baseline komen; heaptrend laatste 10 cycli binnen 10% band.

### 20.4 Framebudget

Low-tier doel op reference laptop: p95 frame <=33,3 ms en p99 <=50 ms tijdens afgesproken reference scene. CPU per frame:

- network decode/store <=2 ms p95;
- actor interpolation/animation <=5 ms;
- world update/culling <=5 ms;
- UI scripting/layout <=5 ms volgens Fase 4;
- rest renderdriver/GPU met totaalbudget.

Twee opeenvolgende 5 s windows boven budget verlagen één presentationtier met cooldown 30 s. Automatisch verhogen pas na 60 s onder 70% budget en nooit vaker dan eenmaal/60 s.

### 20.5 Client network allocation

- binary packets via pooled `ArrayBuffer`/DataView of generated typed decoder;
- snapshot ringbuffers hebben vaste capaciteit;
- vectors/quaternions in hotpath worden hergebruikt;
- geen spread/map/filter/JSON in per-actor per-frame loop;
- DOM/store events worden per rAF gebatcht;
- network decode mag maximaal 200 packets of 2 ms per frame verwerken, rest volgende microtask/frame behalve critical selfstate.

---

## 21. Serverperformance en GC

### 21.1 Tickhotpath

Na warmup:

- vaste actor/component arrays of pools;
- generation handles tegen stale references;
- geen object/array/string allocation per actor per tick;
- spatial queries gebruiken Cell-index, nooit alle actors;
- events gebruiken bounded pools en immutable payloadbuffer na encode;
- sortkeys/buffers worden hergebruikt;
- logging/metrics aggregeert buiten tick.

### 21.2 Budgetten

Per regionprocess bij geaccepteerde capacityscenario:

- tick p50 <=15 ms, p95 <=30 ms, p99 <=40 ms;
- geen tick >50 ms in meer dan 0,1% over 15 min;
- event-loop delay p99 <=20 ms;
- heap na full GC stable binnen 10% over 60 min soak;
- RSS <= vooraf gemeten capacitylimiet met 25% hostreserve;
- outbound bytes/client en messages/s binnen scenario-envelop.

Max players/region is geen verzonnen constant. Loadtest verhoogt synthetische spelers trapsgewijs. `certifiedCapacity` is hoogste count waarbij alle gates 30 min slagen; production joinlimit is `floor(certifiedCapacity * 0.6)`.

### 21.3 GC-regel

Geen handmatige `global.gc()` als runtimeoplossing. Heap snapshots/profiling alleen gecontroleerd. Een stijgende old-space trend, meer dan 2 stop-the-world pauses >20 ms per minuut of allocation spike wordt als defect onderzocht vóór capaciteit verhogen.

---

## 22. Databaseperformance

- Alle hot queries hebben `EXPLAIN QUERY PLAN` zonder ongewenste full scans.
- Chat history cursorpagination op `(channel_type,channel_key,channel_sequence)`; geen OFFSET voor diepe pagina's.
- Party/guild mutation raakt één aggregate per transaction.
- Writes uit tick worden gebatcht per durable boundary, niet per actorframe.
- `operation_idempotency`, outbox, chat expiry en audit hebben begrensde retention/prunejobs.
- Databasegrootte, WALgrootte, checkpointduur, transaction p95/p99, busy errors en freelist worden gemeten.
- Publish-history blijft onder bestaande retention; full world JSON wordt niet opnieuw per runtimeevent opgeslagen.

SQLite write transaction p95 doel <=10 ms en p99 <=25 ms onder certified load. Overschrijding blokkeert launch of verlaagt capacity; het wordt niet verborgen met langere queues.

---

## 23. Observability

### 23.1 Metrics

Minimaal:

- connections/auth/resume/disconnect per reason;
- inbound/outbound bytes/messages, queue depth, bufferedAmount;
- tick duration/lag/catch-up, actor count, interest count;
- inputs accepted/duplicate/gap/rate/invalid;
- corrections per band en remote buffer underruns;
- commands success/error/idempotent/stale;
- DB duration/busy/WAL/outbox lag;
- chat rate/reject/report, party/guild mutations;
- process RSS/heap/GC/event-loop delay/CPU;
- browser frame/drawcall/triangle/resource/network sampling;
- build/release/migration/health status.

Label cardinality is bounded: geen userId, characterId, messageId of raw routeparameter als metriclabel.

### 23.2 Structured logs

JSON log bevat timestamp, level, serviceRole, releaseId, buildId, correlationId, eventCode en veilige dimensions. Player-identifiers worden voor operationeel zoeken gepseudonimiseerd of access-controlled. Chatbody/tokens/cookies/jointickets ontbreken.

### 23.3 Tracing

Correlation volgt HTTP/WS command -> gateway -> region/social -> transaction -> outbox -> response. Sampling 100% errors, 10% mutations en 1% succesvolle movement/control flows, configureerbaar zonder restart binnen veilige limiet.

### 23.4 Alerts

Launch vereist zichtbare alerts voor service down, readiness false, tick p99, event-loop lag, DB busy/error, outbox oldest age, disk <20%, backup stale/fail, repeated auth/origin/rate abuse en crashloop.

---

## 24. Health, readiness en graceful shutdown

### 24.1 Endpoints

- `/health/live`: event loop leeft; geen DB/network fan-out.
- `/health/ready`: release/build geladen en gehashed, migrations exact head, DB read/write probe recent, gateway accepting, required region/social roles ready, disk above threshold.
- `/health/detail`: alleen authenticated operator; componentstatus zonder secrets.

### 24.2 Drain

Op SIGTERM/deploy:

1. readiness false en nieuwe joins weigeren;
2. stuur `SERVER_DRAIN` met deadline 30 s;
3. stop nieuwe noncritical social mutations na 20 s, critical commands afronden;
4. tick tot safe boundary;
5. flush character checkpoints/outbox en region recovery snapshot;
6. sockets close 1012/4003 met reconnect hint;
7. DB checkpoint volgens policy, connections sluiten;
8. exit 0 binnen 45 s, anders supervisor killt en recovery treedt in.

---

## 25. Deployment en rollback

### 25.1 Release layout

```text
/var/www/gk/releases/<releaseId>/
  server/
  public/
  manifests/release.json
  migrations/
/var/www/gk/current -> releases/<releaseId>
/var/www/gk/shared/storage/
/var/www/gk/shared/assets/
```

Exacte live paden worden vóór implementatie tegen deployment gecontroleerd; bestaand storagepad wordt niet blind verplaatst.

### 25.2 Deployvolgorde

1. backup/restorepoint en diskcheck;
2. artifact hash/signature en manifest verify;
3. install release in nieuwe immutable directory;
4. offline config/build/package validation;
5. additive/compatible migrations met migration lock;
6. start candidate op bestaande interne serviceconfig zonder publieke alternatieve poort als eindstaat;
7. liveness/readiness en synthetic login/join checks;
8. drain old, atomische current/service switch;
9. observe 15 min gates;
10. mark release accepted en prune volgens retention.

### 25.3 Migrationbeleid

Expand -> migrate/backfill -> application cutover -> verify -> contract. Destructive schema/node drop gebeurt alleen in definitieve cutoverwindow na backup/parity en maakt rollback naar nodecode bewust onmogelijk zonder database restore.

### 25.4 Rollback

Vóór destructive contractstep: switch naar vorige release toegestaan als migrations backward compatible. Na node/drop of nieuwe canonical-only mutations: code-only rollback verboden. Herstel gebruikt getest database+assetsnapshot en vorige release als één recoveryactie.

---

## 26. Runtime packageformat na nodeverwijdering

Client en server lezen alleen deze immutable buildroot:

```text
builds/<buildId>/
  manifest.json
  project/settings.json
  world/world-index.bin
  world/regions/<regionKey>/region.json
  world/cells/<regionKey>/<cx>_<cz>.bin
  navigation/<regionKey>/<cx>_<cz>.nav
  actors/actor-catalog.bin
  combat/ability-catalog.bin
  equipment/equipment-catalog.bin
  story/story-catalog.bin
  economy/economy-catalog.bin
  presentation/ui-package.json
  presentation/audio-package.json
  presentation/vfx-package.json
  assets/asset-manifest.json
```

### 26.1 Manifest

```ts
interface RuntimeBuildManifestV1 {
  schemaVersion: 1;
  buildId: string;
  projectId: string;
  sourceWorkspaceRevision: number;
  compilerVersion: string;
  protocolMajor: 1;
  createdAt: string;
  packages: Array<{
    key: string;
    path: string;
    mediaType: string;
    sha256: string;
    bytes: number;
    audience: "client" | "server" | "both";
    dependencies: string[];
  }>;
  rootSha256: string;
}
```

`rootSha256` is hash over canonical manifest zonder eigen hash, met packages key-sorted. Server laadt server/both; client ontvangt alleen client/both. Server-only AI coefficients, lootsecrets, moderation en authorityregels komen nooit in clientpackage.

### 26.2 Loader

Loader:

1. leest release pointer en manifest;
2. valideert schema/protocol/compiler compatibility;
3. verifieert package size/hash/dependency DAG;
4. decodeert naar immutable typed runtime views;
5. valideert cross-package runtime keys;
6. warmt indexes/pools;
7. activeert build atomisch;
8. houdt last-known-good actief bij fout.

Geen loader importeert authoring schemas, JSON Schema, graph/node code of editorcomponenten.

---

## 27. Definitieve nodeverwijdering: toelatingspoort

Node removal begint pas als ieder canonical domain uit Fase 1-4:

- mode `canonical` heeft;
- alle actieve projects/workspaces succesvol geimporteerd zijn;
- exact output parity of expliciet goedgekeurde typed differences heeft;
- minimaal 30 dagen of 20 geaccepteerde publishcycli zonder legacy fallback heeft gedraaid, wat langer duurt;
- create/edit/undo/redo/draft/preview/publish/runtime/delete/restart acceptance heeft;
- geen runtime/editor route graphwrite of graphread uitvoert;
- consistente pre-cutover backup en restore rehearsal heeft.

Een leeg legacydomain zonder consumer mag eerder verwijderd worden na bewezen inventory. Geen tabel wordt bewaard “voor misschien” in live production; historische recovery zit in de offline backup en Gitgeschiedenis.

---

## 28. Definitieve nodeverwijdering: statische inventory

Maak machineleesbaar `node-removal-inventory.json` met voor ieder resultaat:

```ts
interface LegacyArtifactInventoryEntry {
  pathOrTable: string;
  kind: "file" | "import" | "route" | "table" | "column" | "bundle" | "test";
  owners: string[];
  runtimeReachable: boolean;
  replacement: string;
  action: "delete" | "rewrite" | "retain-non-node";
  proof: string[];
}
```

Verplichte zoektermen omvatten minimaal:

```text
editor_nodes, editor_node_edges, node-types, GraphRepository,
GraphMigrationService, graph evaluator, group input, group output,
node03, node04, node05, Toon in nodes, Meer nodes,
graph coordinates, ports, edges, catalog compiler from nodes
```

Bundleanalyzer en runtime importgraph moeten aantonen dat nodecode niet vanuit production entrypoints bereikbaar is. Alleen tekst in historische migrations/docs/git mag na cutover overblijven; actieve code niet.

---

## 29. Definitieve nodeverwijdering: uitvoering

### 29.1 Freeze

1. kondig maintenancewindow aan;
2. blokkeer authoring mutations/publish;
3. laat game op last-known-good build doorlopen of drain volgens window;
4. consistente DB/assets/releasebackup;
5. verifieer restore in geisoleerde omgeving;
6. leg canonical workspace/build hashes vast.

### 29.2 Laatste parity

Voor elk project:

- legacy import opnieuw op frozen snapshot;
- canonical compile tweemaal voor determinisme;
- semantische packagevergelijking met laatste legacybuild;
- alle typed differences verklaard;
- referential integrity, no missing asset/runtime key;
- Kevin opent Werkbank, Preview en published game.

### 29.3 Code cut

Verwijder of herschrijf in dezelfde release:

- graph/node API routes en websocketevents;
- `GraphRepository`, graph migration/evaluator/layout/group/portcode;
- node type registries client en server;
- Node-03/04/05 runtime services nadat canonical consumers parity hebben;
- editor nodecanvas, inspector, groupnavigation, `Toon in nodes` en node-CSS/assets;
- graph-only scripts, fixtures, smokechecks en dependencies;
- graph compilerbranches en cutover flags;
- demo/proof hardcode en compatibility fallbacks die alleen nodes ondersteunen.

Normale history/docs worden niet herschreven; actuele README verwijst naar canonical Werkbank/Instellingen.

### 29.4 Database contract

Na code deployment maar vóór drop draait startup in `canonical_only_assert` en faalt readiness als graphquery wordt geprobeerd. Daarna destructive migration:

```sql
DROP TABLE IF EXISTS editor_node_edges;
DROP TABLE IF EXISTS editor_nodes;
```

Ook graph-only indexes/triggers/mappingtabellen worden alleen gedropt wanneer inventory bewijst dat audit/provenance niet nodig is. `authoring_legacy_import_mappings` mag als niet-actieve provenance behouden blijven wanneer Fase 1 dat eist; het mag geen runtime FK naar gedropte graphrows vereisen.

SQLite voert destructive change uit via nieuwe database/rebuild waar nodig, gevolgd door `foreign_key_check`, `integrity_check`, canonical row/buildhash check en gecontroleerde compactie buiten live verkeer.

### 29.5 Na cut

- start canonical-only release;
- health/readiness;
- editor create/edit/publish;
- Preview en multiplayer playthrough;
- logs/SQL trace tonen nul graph access;
- production gamebundle bevat nul nodecode/stringroutes;
- 60 min observe en Kevinacceptatie;
- maintenance sluiten.

---

## 30. Overblijvende authoring- en runtimeketen

```text
Werkbank | Instellingen
-> typed canonical commands
-> authoring_documents + semantic references
-> deterministic domain compilers
-> immutable hashed runtime buildpackages
-> atomic release pointer
-> server/client audience-specific loaders
-> authoritative simulation + eventgedreven presentation
```

Er is daarna:

- geen graphdatabase;
- geen nodecanvas;
- geen verborgen nodegeneratie;
- geen port/edge/group-layout;
- geen dual-read/dual-write;
- geen client die authoringdata compileert;
- geen server die editorvisualisatie nodig heeft.

Nieuwe capability voegt canonical kind/schema/editor/compiler/runtimeconsumer/tests toe, nooit een nieuw node-type.

---

## 31. API en serviceports

```ts
interface RegionPort {
  enqueueInput(connection: ConnectionRef, input: InputBatch): EnqueueResult;
  enqueueCommand(connection: ConnectionRef, command: ClientCommandV1<unknown>): EnqueueResult;
  attach(connection: ConnectionRef, join: VerifiedJoin): Promise<RegionAttachResult>;
  detach(connectionId: string, reason: string): void;
  drain(deadlineMs: number): Promise<void>;
}

interface SocialPort {
  sendChat(actor: SocialActor, command: ChatSend): Promise<ChatResult>;
  mutateParty(actor: SocialActor, command: PartyCommand): Promise<PartyResult>;
  mutateGuild(actor: SocialActor, command: GuildCommand): Promise<GuildResult>;
  subscribe(connection: ConnectionRef, scopes: SocialScope[]): Subscription;
}

interface PersistencePort {
  transact<T>(operation: TypedOperation<T>): Promise<TypedResult<T>>;
  loadCharacter(characterId: string): Promise<CharacterAggregate>;
  appendOutbox(events: AuthoritativeEventV1<unknown>[]): Promise<void>;
}

interface ConnectionPort {
  sendCritical(connectionId: string, message: EncodedMessage): SendResult;
  replaceLatest(connectionId: string, key: string, message: EncodedMessage): SendResult;
  close(connectionId: string, code: number, reasonCode: string): void;
}
```

Ports accepteren geen raw socket, SQLite handle of mutable actorobject buiten eigenaarmodule.

---

## 32. Errors en closecodes

Applicatiefouten:

| Code | Betekenis |
| --- | --- |
| `PROTOCOL_UNSUPPORTED` | major/subprotocol ongeldig |
| `AUTH_REQUIRED` | session/ticket ontbreekt |
| `AUTH_EXPIRED` | session verlopen/revoked |
| `JOIN_TICKET_INVALID` | ticket mismatch/gebruikt |
| `BUILD_MISMATCH` | client/region build verschillend |
| `LEASE_STALE` | connection epoch niet owner |
| `INPUT_STALE` | sequence/tick te oud |
| `INPUT_FUTURE` | tick te ver vooruit |
| `RATE_LIMITED` | bucket leeg |
| `SERVER_BUSY` | bounded queue/capacity vol |
| `REVISION_CONFLICT` | aggregate gewijzigd |
| `PERMISSION_DENIED` | social/action permission |
| `TARGET_UNAVAILABLE` | target offline/niet zichtbaar |
| `CONTENT_UNAVAILABLE` | runtime key ontbreekt in build |
| `RESYNC_REQUIRED` | delta/eventgap niet herstelbaar |

Private closecodes:

- 4000 heartbeat timeout;
- 4001 session revoked;
- 4002 connection replaced;
- 4003 server drain;
- 4004 build mismatch;
- 4005 lease stale;
- 4008 slow client;
- 4009 rate/abuse policy.

Client toont menselijke actie en correlationId; nooit raw stack of securitydetail.

---

## 33. Teststrategie

### 33.1 Protocol conformance

- golden bytes voor ieder binary type;
- endian, wraparound sequence, exact/truncated/trailing length;
- fuzz random bytes, unknown flags/types, max/min integers;
- JSON unknown keys, Unicode, sizes, nonfinite values;
- protocol version negotiation en closecodes.

### 33.2 Authority

- client position/damage/item/currency spoof;
- speed/nav/collision/tick/sequence manipulation;
- cooldown/range/LOS/target/ownership spoof;
- replay same command same/different hash;
- stale epoch/lease/build;
- simultaneous connections en replacement.

### 33.3 Prediction

- zero/50/100/250 ms RTT en 0/10/30% jitter in controlled harness;
- burst/delayed/lost connection, ordered WS behavior en reconnect;
- reconciliation thresholds en replay determinism;
- teleports/respawn/cell seam/collision change;
- remote interpolation underrun/extrapolation cap.

### 33.4 Interest/backpressure

- cell enter/leave hysterese;
- 1000 non-interested actors veroorzaken geen per-client fan-out;
- privacy/phase/stealth filters;
- slow client queue thresholds/coalescing/close;
- keyframe part loss/resync;
- no critical durable result silently dropped.

### 33.5 Social

- channel audience, local distance en cross-region;
- block/mute/report/rate/normalization/injection;
- whisper offline/blocked;
- party concurrent invite/accept/full/leave/kick/leader transfer;
- guild name/tag race, permissions/rank hierarchy/owner transfer/disband;
- reconnect/restart/outbox duplicate;
- no cross-account identity spoof.

### 33.6 Persistence/chaos

- crash voor/tijdens/na transaction/outbox dispatch;
- DB busy/disk full/WAL growth;
- kill gateway/region/social process;
- resume within/after grace;
- corrupted/missing buildpackage;
- last-known-good activation;
- backup restore and hash parity.

### 33.7 Security

- wrong/missing Origin and plain ws;
- stolen/used/expired join/resume token;
- session revoke/logout on open socket;
- oversized/frame flood/slow consumer;
- CSWSH, XSS text, SQL metacharacters, path traversal;
- unauthorized staff/moderation route;
- secrets/PII absent from logs/sourcemaps/bundles.

### 33.8 Production/performance

- reproducible build hashes;
- clean install/migrate/deploy/drain/rollback;
- certified capacity ladder en 60 min soak;
- tick/event-loop/DB/outbox/network budgets;
- reference laptop low-tier frame/draw/resource budgets;
- 20 regioncycles, 50 panelcycles en GPU/heap baselines;
- asset fallback/corruption/cache invalidation.

### 33.9 Node removal

- static importgraph zero reachable nodecode;
- API route inventory returns no graph endpoints;
- SQL trace zero graph access before drop;
- tables absent after migration;
- canonical create/edit/undo/redo/publish/preview/runtime/delete;
- game/editor bundles contain geen node UI;
- restored pre-cutover snapshot plus old release works in isolated recoverytest.

---

## 34. Implementatiecheckpoints

### Checkpoint 5A - Protocol en echte authority

- Split gateway/region/persistence ports binnen P0.
- Binary codec/conformance, handshake/security, 20 Hz tick.
- Prediction, reconciliation, interpolation, interest en backpressure.
- Twee-account visible movement/combat/inventory authority.

Zichtbaar bewijs: twee browsers/accounts zien elkaar vloeiend; gemanipuleerde movement/damage wordt geweigerd; reconnect convergeert zonder duplicate reward.

### Checkpoint 5B - Social

- Chat channels, block/mute/report en retention.
- Character-ID party migration en volledige lifecycle.
- Guild/rank/permission/membership lifecycle.
- Presence, UI-events, restart/outbox recovery.

Zichtbaar bewijs: Kevin doorloopt chat/party/guild met twee echte accounts en ziet permissions, offline/reconnect en restart correct.

### Checkpoint 5C - Productie en performance

- Reproducible release/assets, health/readiness/drain/deploy.
- Metrics/logs/traces/alerts/backups.
- Server certified capacity en reference-laptop qualitygates.
- Memory/GPU/queue/DB soak en chaos.

Zichtbaar bewijs: deployment zonder corrupte sessie/save, dashboard/alerts tonen echte toestand en game blijft binnen geaccepteerde budgets.

### Checkpoint 5D - Definitieve nodeverwijdering

- 30 dagen/20 publishes canonical-only bewijs.
- Inventory, backup/restore, freeze/parity.
- Code/routes/bundles/services/tests verwijderen.
- Graph tables droppen en canonical-only production deploy.

Zichtbaar bewijs: volledige authoring/playthrough zonder node-route; statische/runtime/SQL-proofs tonen nul nodeafhankelijkheid.

### Checkpoint 5E - Launchacceptatie

- Volledige multiplayer RPG-playthrough.
- Security/load/chaos/recovery/restore gates.
- Operations runbook en incident/release/rollback rehearsal.
- Kevin eindacceptatie.

Geen checkpoint sluit op schemas, mocks, localhost-only bewijs of alleen groene tests.

---

## 35. Kevin-acceptatietest

Kevin gebruikt de echte publieke omgeving en twee afzonderlijke accounts/browsers.

### A. Join en sync

1. Publiceer één accepted build.
2. Log met account A en B in en kies verschillende characters.
3. Betreed dezelfde region en zie juiste modellen/equipment/nameplates.
4. Loop tegelijk, kruis elkaar en betreed/verlaat Cells.
5. Controleer vloeiende remote beweging en geen dubbele actors.
6. Refresh B; B hervat correct en A ziet één B.

### B. Authority en combat

1. Beweeg tegen blocker en controleer servercorrectie.
2. Laat een testtool alleen in beveiligde developmentomgeving snelheid/positie vervalsen; server weigert.
3. Val dezelfde enemy aan en controleer health/damage/death/loot eenmaal.
4. Probeer ability buiten range/cooldown; server weigert.
5. Reconnect rond kill/loot; geen duplicate of verdwenen reward.

### C. Chat

1. Test global en local binnen/buiten 60 m/region.
2. Whisper A naar B en terug.
3. Block B; whispers en zichtbare normale berichten volgen policy.
4. Test rate limit met snelle berichten zonder disconnect van andere speler.
5. Report één bericht en controleer menselijke bevestiging zonder staffdetails.

### D. Party

1. A maakt party en nodigt B uit.
2. B accepteert; beide zien roster/presence.
3. Speel samen en controleer server-owned lootpolicy.
4. Transfer leader, reconnect en serverrestart.
5. Leave/disband; partychat/permissions sluiten correct.

### E. Guild

1. A maakt guild met naam/tag.
2. Nodig B uit en wijs custom rank toe.
3. Test toegestane en geweigerde invite/chat/rankactie.
4. Transfer ownership en herlaad beide browsers.
5. Leave/disband met bevestiging; state blijft na restart correct.

### F. Complete RPG-lus

1. Doorloop samen movement, combat, quest en dialogue.
2. Ontvang XP/item/currency/ability exact eenmaal.
3. Craft, vendor en market terwijl beide online zijn.
4. Equip/wissel wapen en controleer model/stats bij beide clients.
5. Sterf/respawn, logout/login en serverrestart; durable state blijft gelijk.

### G. Performance en productie

1. Speel reference scene op Kevins laptop met low tier.
2. Bekijk FPS/frame/drawcall/resource diagnostics zonder merkbare extra last.
3. Doorloop drukke actor/VFX/chat/party-situatie.
4. Laat operator een gecontroleerde drain/deploy uitvoeren.
5. Clients krijgen begrijpelijke melding, reconnecten en behouden state.
6. Controleer zichtbaar dashboard en laatste backupstatus.

### H. Geen nodes meer

1. Open Werkbank/Instellingen en bouw/wijzig content.
2. Save, Undo/Redo, Preview, publish en speel.
3. Zoek in normale UI: geen Nodes, Meer nodes, Toon in nodes, Groups, ports of edges.
4. Controleer met operatorbewijs dat graphroutes/tables/bundles ontbreken.
5. Maak nieuw item, actor, quest en UI-wijziging; alles loopt canonical end-to-end.

---

## 36. Operations runbook

Voor launch bestaan versioned procedures voor:

- deploy en rollbackgrens;
- server drain/restart;
- build corrupt/missing en last-known-good;
- region crash/recovery;
- database busy/corrupt/disk full;
- outbox lag;
- session compromise/mass revoke;
- chat abuse/moderation;
- capacity full;
- backupcontrole en volledige restore;
- certificate/domain/proxy failure;
- security incident en log preservation.

Iedere procedure noemt eigenaar, trigger, concrete commands/controls, expected output, stopconditie, communicatie en post-incidentbewijs. Secrets staan niet in het document.

---

## 37. Definition of Done

Fase 5 en daarmee de afgesproken MMORPG-basis zijn alleen compleet wanneer:

- protocolcodec en conformance exact werken;
- server movement/combat/RPG/economyauthority end-to-end bezit;
- prediction/reconciliation/interpolation/interest/backpressure hun gates halen;
- chat/party/guild/presence veilig, persistent en zichtbaar werken;
- restart/reconnect/crash/idempotency geen state of rewards dupliceren/verliezen;
- deployment, health, drain, rollbackgrens, backup en restore bewezen zijn;
- loadtest certified capacity en 40% headroom vastlegt;
- Kevins laptop de low-tier render/UI/networkgates haalt;
- node/graph code, routes, bundles en tabellen definitief verwijderd zijn;
- canonical Werkbank -> build -> server/client de enige actieve keten is;
- security-, chaos-, soak-, leak- en recoverymatrix slaagt;
- Kevin sectie 35 expliciet accepteert;
- documentatie de echte code/deploymentstatus toont.

Een werkende socket, twee bewegende avatars, chatvenster, guildschema, minified bundle of verwijderde nodeknop alleen telt niet als voltooiing.

---

## 38. Wat na Fase 5 wel en niet “af” betekent

Na acceptatie is de **afgesproken MMORPG-basis** technisch compleet: Kevin kan canonical content maken, een streamed wereld publiceren, levende actors/combat/RPG-systemen gebruiken, meerdere characters spelen, multiplayer/social doorlopen en het product betrouwbaar deployen/beheren zonder nodes.

Dit betekent niet dat een commerciële MMORPG inhoudelijk af is. Contentvolume, balancing, localization, live operations, customer support, privacyvoorwaarden, moderationstaffing, PvP/raids/guild bank, payments en communitygroei blijven productwerk of aparte uitbreidingen. Zij mogen de authority- en canonical grenzen niet terugdraaien.

---

## 39. Bronnen en technische onderbouwing

Het GK-contract hierboven is normatief; deze primaire/gezaghebbende bronnen onderbouwen transport-, runtime-, security- en renderingkeuzes:

- RFC 6455 WebSocket protocol, frames, ping/pong en closecodes: https://www.rfc-editor.org/rfc/rfc6455.html
- Browser WebSocket `bufferedAmount`: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/bufferedAmount
- OWASP WebSocket Security Cheat Sheet voor WSS, Origin, auth, limits en logging: https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html
- Node.js 24 worker threads, geschikt voor CPU-werk en niet als vervanging van async I/O: https://nodejs.org/download/release/v24.20.0/docs/api/worker_threads.html
- Node.js clusterprocesgedrag en ontbreken van applicatierouting: https://nodejs.org/api/cluster.html
- Node.js performance measurement: https://nodejs.org/download/release/v24.21.0/docs/api/perf_hooks.html
- SQLite transactions/isolation/WAL: https://www.sqlite.org/lang_transaction.html , https://www.sqlite.org/isolation.html en https://www.sqlite.org/wal.html
- Three.js `InstancedMesh` voor draw-callreductie: https://threejs.org/docs/pages/InstancedMesh.html
- Three.js resource disposal en `renderer.info`: https://threejs.org/manual/pages/how-to-dispose-of-objects.html
- Khronos KTX 2.0/Basis texture specification: https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html

---

## 40. Eindstatement

De definitieve keten is:

```text
canonical Werkbank/Instellingen
-> versioned documents en semantic references
-> deterministic immutable buildpackages
-> production release + audience-specific loaders
-> server-authoritative 20 Hz region simulation
-> secure bounded realtimeprotocol
-> predicted/reconciled clientpresentatie
-> atomic character/RPG/social persistence
-> observeerbare, backupbare en herstelbare productie
```

Nodes, graph edges, Groups en verborgen graphcompilers hebben daarin geen rol meer. De browser stelt intenties voor; de server beslist. De UI presenteert; zij bezit geen gameplaywaarheid. Social systemen gebruiken dezelfde characteridentity en transactiongrenzen. Schaalvergroting vervangt proces- of storageadapters, niet de authoring-, build-, authority- of protocolbetekenis. Daarmee eindigt de tijdelijke architectuur en blijft één controleerbare MMORPG-basis over.
