# Fase 02 stap E: bots en crashproef

Kevin voert deze drie proeven zelf uit, op `main`, vanuit de GK-reporoot. Iedere proef gebruikt een tijdelijke database en een automatisch gereserveerde vrije loopbackpoort op `127.0.0.1`. De live game op poort 3001 mag dus blijven draaien. Voer de stappen wel na elkaar uit, zodat de metingen elkaar niet beïnvloeden.

Eerst de nieuwste code ophalen (bevat de reparaties uit de cloudrun: bots beantwoorden nu de server-ping, en eventloop/DB-writes worden gemeten in een schoon venster na 15 s opwarmen, zonder de 10 ms meetresolutie):

```bash
cd /var/www/gk
git pull origin main
```

De regels met `[bots] GO` of `[bots] NO-GO` staan aan het einde van elk log. `tail -f` blijft wachten nadat het proces klaar is; druk na die eindregel op `Ctrl-C`. Dat stopt alleen `tail`, niet de met `nohup` gestarte proef.

Bij de start toont het log `BASE`, `HOST` en `PORT`; die moeten exact naar dezelfde tijdelijke loopbackpoort verwijzen. Server-stdout en stderr verschijnen als `[server:stdout]` en `[server:stderr]`, zodat een startfout direct in hetzelfde log staat.

## 1. DB-schrijfkostenladder

Exacte start- en volgcommando's:

```bash
cd /var/www/gk
nohup env GK_TEST_ISOLATED=1 npm run perf:db-writes > README/fases/evidence/MMORPG-v2/F2/perf-db-writes.log 2>&1 & echo $! | tee README/fases/evidence/MMORPG-v2/F2/perf-db-writes.pid
tail -f README/fases/evidence/MMORPG-v2/F2/perf-db-writes.log
```

Duur: ongeveer 6 tot 8 minuten: 2 minuten met 1 bot, 2 minuten met 10 bots en 2 minuten met 25 bots, plus opstarttijd.

GO betekent dat in alle drie de stappen tick-p95 maximaal 25 ms, tick-p99 maximaal 40 ms en eventloop-p99 maximaal 20 ms is, zonder dubbele receipts, verbindingsfouten of onverwachte socket-closes. Bekijk daarnaast de geprinte `DB-writes ms` per label; die waarden zijn het bewijs voor de schrijfkostenbeslissing.

Bij NO-GO: voer stap 2 en 3 nog niet uit. Stuur het log en het genoemde JSON-rapport terug.

## 2. 25 bots gedurende 30 minuten

Alleen uitvoeren als stap 1 GO gaf:

```bash
cd /var/www/gk
nohup env GK_TEST_ISOLATED=1 npm run bots -- --users=25 --minutes=30 > README/fases/evidence/MMORPG-v2/F2/bots-25x30.log 2>&1 & echo $! | tee README/fases/evidence/MMORPG-v2/F2/bots-25x30.pid
tail -f README/fases/evidence/MMORPG-v2/F2/bots-25x30.log
```

Duur: ongeveer 30 tot 32 minuten, inclusief het bouwen van de tijdelijke testwereld.

GO betekent: tick-p95 maximaal 25 ms, tick-p99 maximaal 40 ms, eventloop-p99 maximaal 20 ms, nul dubbele receipts, alle 25 bots verbonden en nul onverwachte socket-closes.

Bij NO-GO: voer stap 3 nog niet uit. Stuur het log en het genoemde JSON-rapport terug.

## 3. Crashproef

Alleen uitvoeren als stap 2 GO gaf:

```bash
cd /var/www/gk
nohup env GK_TEST_ISOLATED=1 npm run bots:crash > README/fases/evidence/MMORPG-v2/F2/bots-crash.log 2>&1 & echo $! | tee README/fases/evidence/MMORPG-v2/F2/bots-crash.pid
tail -f README/fases/evidence/MMORPG-v2/F2/bots-crash.log
```

Duur: ongeveer 10 tot 12 minuten. De server krijgt na 5 minuten `SIGKILL`. Het script opent daarna dezelfde tijdelijke database alleen-lezen, controleert de crashgates, herstart op dezelfde database, controleert de rewards, verbindt de bots opnieuw en laat de resterende tijd doorlopen.

Naast de gewone botgates betekent GO hier:

- `lostAcknowledgedOperations = 0`: iedere node03-`operationId` met HTTP 200 staat als `completed` in `operation_idempotency`;
- `positionRpoMs <= 5000`: voor iedere bot is het verschil tussen het vastgelegde killtijdstip en de nieuwste persistente `player_positions.updated_at` maximaal 5 seconden;
- `restartOk = true`: `/api/health` kwam terug, alle botaccounts waren via de API leesbaar en minstens één geackte reward plus zijn ledger- en spelerstaat stond na de herstart nog in de database;
- `allBotsReconnected = 25`: alle bots verbonden na de herstart opnieuw.

`player_positions.updated_at` is bewust de RPO-maat. `mmo-service` vernieuwt deze waarde bij iedere bewegings-tick; de position-checkpointer schrijft de actuele positie en timestamp buiten de tick iedere seconde weg en begrenst zijn interval hard op 5 seconden. Het JSON-rapport bevat de RPO ook afzonderlijk per player-id.

## Wat terugsturen

Stuur na de laatste uitgevoerde stap het volgende terug:

1. de volledige logbestanden van de uitgevoerde stappen;
2. de exacte paden van de door elk log genoemde `bots-*.json`-rapporten, plus die JSON-bestanden;
3. de `[bots] GO`/`[bots] NO-GO`-eindregel en alle gate-regels erboven;
4. bij de crashproef uit het JSON-rapport: `steps[0].crash.signalSentAt`, `killAt`, `inspection`, `restart` en `gates`.

Bij een NO-GO niets repareren of opnieuw draaien voordat de oorzaak is bekeken.
