# Fase 01 - Veiligheid en bewijsbasis

> Status: voorstel voor implementatie, **niet** gerealiseerd op de geauditeerde `main`-baseline. De implementatietaken zijn nog niet uitgevoerd; deze documentatiecommit verandert geen gamecode of database.

**Doel:** De bestaande game blijft speelbaar, maar bekende misbruikpaden zijn gesloten en herstel, tests en metingen zijn aantoonbaar.

## Waarom nu
De huidige HTTP-positieroute accepteert clientteleports, debugacties zijn voor spelers bereikbaar en de migratierunner kent geen backup of checksums. Later repareren laat echte data en spelers blootstaan.

## Afbakening
**Wel:** Gerichte securityfixes, geisoleerde tests, migratiecontrole, backup/restore, bestaand tweespelerscenario en een nulmeting.

**Niet:** Nieuwe node-types, canonieke contenttabellen, nieuwe gameplay, UI Studio, productieclaims zonder serverconfiguratie.

## Afhankelijkheden en instap
**Afhankelijkheden:** Geen; begin met F1-E0-T02 in een wegwerpcheckout. De eerdere verplichte root-ignore-kaart is vervallen op Kevins besluit. De geauditeerde baseline is `8a976e346fcadf2f2a9fbced13b8ed48269df4d2`; verifieer de actuele HEAD opnieuw.

**Instapcriteria:** Een schone checkout of wegwerpwerkmap is beschikbaar; productiedata worden niet gebruikt voor tests.

## Exit-criteria / Definition of Done
- [ ] `GK_TEST_ISOLATED=1 npm test` en `GK_TEST_ISOLATED=1 npm run smoke` groen op tijdelijke opslag; testverslag met aantallen en commit-SHA.
- [ ] Teleport, stop-resync, debuggrant, dubbele command-ID, fout-URL en verkeerde WebSocket-Origin hebben elk een negatieve integratietest.
- [ ] Restore naar lege directory: `PRAGMA integrity_check=ok`, aantallen users/player_*/nodes gelijk en gepubliceerde hash gelijk.
- [ ] Twee echte accounts zien elkaar in dezelfde bestaande published world; Kevin bevestigt beweging, aanval en quest met screenshots/video.
- [ ] Nulmeting bewaart machine, browser, resolutie, DB-grootte, sync-writekosten, client frametime, event-loop-delay en tickduur; geen capaciteitsclaim nog.
- [ ] Alle taakacceptaties en de fase-evidence zijn nagekeken door een mens; Kevin heeft het zichtbare resultaat zelf getest. Een schema, mock of testfixture zonder gameconsumer sluit de fase niet.

## Deliverables, risico en test
**Deliverables:** Securitypatches, CI-workflow, migratierunner, backup/restore-runbook, geisoleerde fixtures, bewijsmap `README/fases/evidence/MMORPG-v2/F1/`.

**Testplan:** Pas na F1-E0-T02: `GK_TEST_ISOLATED=1 npm test` en `GK_TEST_ISOLATED=1 npm run smoke`; twee-browser handtest; restore-oefening; security-negative matrix.

**Inschatting:** L, 2-4 weken bij 1 engineer plus AI-agents, 20-30 gerichte werkdagen; aanname: bestaande demo-content en toegang tot deployment bestaan.

**Met eigen ogen:** Kevin ziet twee spelers, een echte geweigerde cheat en een herstelbare wereld; niet alleen groene tests.

| Risico | Kans | Impact | Mitigatie |
| --- | --- | --- | --- |
| Bestaande client gebruikt de onveilige positieroute | hoog | kritiek | Eerst compatibiliteitstest, dan serverweigering en clientmelding. |
| Runnerwijziging raakt live database | middel | hoog | Alleen op kopie, backup plus restore voor GO. |

## Taakkaarten

Een kaart is maximaal een agentsessie. Bij een wijziging die toch meer dan circa 1 werkdag of meer dan een reviewbare PR vraagt: stop, splits de kaart en behoud het ID als parent. `nieuw:` betekent voorgesteld pad; bestaande paden zijn op `main` geverifieerd tenzij anders vermeld. Testcommando's met nieuwe bestanden zijn uit te voeren nadat die taak ze heeft gemaakt.

### 1-E0 - Veilige start

#### F1-E0-T02 - Testopslag isoleren

**Context:** Geen nieuwe of bestaande test mag standaard speleropslag raken. Kevins keuze voor geen publieke root `.gitignore` verandert deze veiligheidsgrens niet. Deze kaart draagt direct bij aan het doel van Fase 01.

**Betrokken paden:** tests/fixtures.js; scripts/smoke-test.js; scripts/game-browser-check.js; scripts/perf-game.js; src/server/db.js; nieuw: tests/test-isolation.test.js.

**Concrete stappen:**

1. Controleer actuele HEAD, `git status --short` en alleen de namen van reeds getrackte DB-/secretbestanden, zonder inhoud te tonen.
2. Maak een verplichte testmodus met tijdelijke DB/assets, willekeurige poort en cleanup.
3. Laat tests fail-closed stoppen als zij naar de standaard storage-directory of publieke host wijzen.
4. Voer pas daarna de bestaande suite uit.

**Acceptatie:**

- [ ] Elke test krijgt een tijdelijke DB en assetroot
- [ ] sentinel in een nagebootste normale opslagmap blijft byte-identiek
- [ ] test zonder isolatiemodus weigert standaard opslag
- [ ] testfout ruimt tijdelijke bestanden op
- [ ] eventuele reeds getrackte gevoelige bestanden zijn alleen met padnaam als incident gemeld, niet gewijzigd.

**Test:** GK_TEST_ISOLATED=1 node --test tests/test-isolation.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** Geen binnen het plan; fase-instap blijft gelden.

**Grootte:** M (een agentsessie).

#### F1-E0-T03 - Oude fasecontracten historisch markeren

**Context:** De vijf originele fasecontracten blijven in de repo, maar mogen geen opdrachtbron voor nieuwe agents zijn. Deze kaart draagt direct bij aan het doel van Fase 01.

**Betrokken paden:** README/fases/README.md; README/fases/MMORPG-basis/; nieuw: README/fases/MMORPG-basis-v2/START-HIER.md.

**Concrete stappen:**

1. Voeg in de fase-index een duidelijke verwijzing naar het actieve v2.3-plan toe.
2. Label de vijf oude bestanden historisch en niet-normatief.
3. Verwijder geen historie of oude code.

**Acceptatie:**

- [ ] Fase-index noemt slechts v2.3 als actieve MMORPG-basisplanning
- [ ] oud pad heet historisch/niet-normatief
- [ ] een agentprompt kan niet per ongeluk oud F3 als scope krijgen.

**Test:** documentreview; rg -n "MMORPG-basis" README/fases/README.md.

**Afhankelijkheden:** F1-E0-T02.

**Grootte:** S (een agentsessie).

### 1-E1 - Live misbruik sluiten

#### F1-E1-T01 - Teleport en stop-resync sluiten

**Context:** Clientpositionering is nu een authority-bypass. Deze kaart draagt direct bij aan het doel van Fase 01.

**Betrokken paden:** src/server/mmo-service.js; src/server/server.js; apps/web/public/game/game.js; nieuw: tests/authority-position.test.js.

**Concrete stappen:**

1. Inventariseer callers.
2. Accepteer uitsluitend input-intenties.
3. Valideer stop vanuit serverpositie, snelheid en collision.
4. Behoud server-eigen teleport voor spawn/zone-reis.

**Acceptatie:**

- [ ] HTTP en WS absolute positie/teleport geven INPUT_REJECTED
- [ ] stop door collider of boven snelheidsbudget blijft ongewijzigd
- [ ] zone-link werkt.

**Test:** GK_TEST_ISOLATED=1 node --test tests/authority-position.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F1-E0-T02.

**Grootte:** M (een agentsessie).

#### F1-E1-T02 - Debugmutaties en cooldown afschermen

**Context:** Bestaande debugacties kunnen waarde en questvoortgang creeren. Deze kaart draagt direct bij aan het doel van Fase 01.

**Betrokken paden:** src/server/node03-runtime-service.js; src/server/node04-quest-runtime-service.js; src/server/node05-economy-runtime-service.js; nieuw: tests/security-actions.test.js.

**Concrete stappen:**

1. Zet debug/reset achter admin plus expliciete dev-flag.
2. Hasj volledige genormaliseerde payload per operationId.
3. Voeg servercooldown voor attack/gather toe.

**Acceptatie:**

- [ ] Player krijgt 403 voor debug/reset
- [ ] admin zonder flag krijgt 403
- [ ] zelfde ID met ander bedrag krijgt 409
- [ ] 10 aanvallen in 1 seconde leveren maximaal toegestane hits.

**Test:** GK_TEST_ISOLATED=1 node --test tests/security-actions.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F1-E1-T01.

**Grootte:** M (een agentsessie).

#### F1-E1-T03 - Auth en sessies begrenzen

**Context:** Synchrone PBKDF2 en onbeperkte loginpogingen blokkeren of belasten de eventloop. Deze kaart draagt direct bij aan het doel van Fase 01.

**Betrokken paden:** src/server/auth-service.js; src/server/server.js; nieuw: tests/auth-hardening.test.js.

**Concrete stappen:**

1. Verplaats passwordhash naar async pad.
2. Maak IP- en accountlimiet 5/min burst 5.
3. Roteer sessie bij login.
4. Weiger productie zonder Secure-cookie.

**Acceptatie:**

- [ ] Zesde login binnen minuut geeft 429
- [ ] sessie-ID is nooit fallback-token
- [ ] productie zonder Secure-cookie start niet
- [ ] oude cookie werkt niet na logout.

**Test:** GK_TEST_ISOLATED=1 node --test tests/auth-hardening.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F1-E0-T02.

**Grootte:** M (een agentsessie).

#### F1-E1-T04 - HTTP en WebSocket grens sluiten

**Context:** Origin, CSRF, foutrespons en remote identiteit zijn nu onvolledig afgeschermd. Deze kaart draagt direct bij aan het doel van Fase 01.

**Betrokken paden:** src/server/server.js; src/server/mmo-service.js; nieuw: tests/http-ws-boundary.test.js.

**Concrete stappen:**

1. Voeg exacte Origin-allowlist en sessiegebonden CSRF voor mutaties toe.
2. Zet WS maxPayload 64 KiB.
3. Vang URIError/streamfouten af.
4. Schrap user/session/device IDs uit remote payloads.

**Acceptatie:**

- [ ] Verkeerde Origin en ontbrekende CSRF: 403
- [ ] 70 KiB WS: close 1009
- [ ] GET /%FF: 400, proces leeft
- [ ] remote snapshot bevat geen privé-ID.

**Test:** GK_TEST_ISOLATED=1 node --test tests/http-ws-boundary.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F1-E1-T03.

**Grootte:** M (een agentsessie).

### 1-E2 - Data en testbasis

#### F1-E2-T00 - Consistente backup vóór migratie

**Context:** De migratierunner mag niet starten voordat er een herleidbare DB- en assetkopie bestaat. Deze kaart draagt direct bij aan het doel van Fase 01.

**Betrokken paden:** src/server/db.js; nieuw: scripts/backup-db.js; nieuw: tests/backup-db.test.js.

**Concrete stappen:**

1. Gebruik SQLite online backup API op een geïsoleerde DB.
2. Leg DB-hash, bron-SHA, migratiehead en asset/buildmanifest vast.
3. Kopieer bestanden naar een nieuwe niet-publieke doelmap.

**Acceptatie:**

- [ ] Backup opent met integrity_check=ok
- [ ] manifest en DB-hash zijn verifieerbaar
- [ ] falende backup laat de bron onveranderd
- [ ] script weigert publieke webroot als doel.

**Test:** GK_TEST_ISOLATED=1 node --test tests/backup-db.test.js.

**Afhankelijkheden:** F1-E0-T02.

**Grootte:** S (een agentsessie).

#### F1-E2-T01 - Baseline tests en CI

**Context:** Na F1-E0-T02 mag de bestaande suite veilig draaien en wordt de feitelijke baseline zichtbaar. Deze kaart draagt direct bij aan het doel van Fase 01.

**Betrokken paden:** tests/fixtures.js; scripts/smoke-test.js; nieuw: .github/workflows/test.yml.

**Concrete stappen:**

1. Draai de bestaande tests op geïsoleerde opslag.
2. Herstel bewezen testfouten zonder productregels te verzwakken.
3. Voeg CI voor npm ci, check en geïsoleerde tests toe.

**Acceptatie:**

- [ ] Aantal geslaagde/falende tests en commit-SHA vastgelegd
- [ ] CI raakt geen standaard storage of vaste poort
- [ ] CI draait npm ci, npm run check en GK_TEST_ISOLATED=1 npm test.

**Test:** npm run check; GK_TEST_ISOLATED=1 npm test; GK_TEST_ISOLATED=1 npm run smoke.

**Afhankelijkheden:** F1-E0-T02.

**Grootte:** M (een agentsessie).

#### F1-E2-T02 - Migratierunner met checksums

**Context:** De huidige runner past SQL zonder checksum, duplicate-prefix gate of betrouwbare FK-rebuild toe. Deze kaart draagt direct bij aan het doel van Fase 01.

**Betrokken paden:** src/server/db.js; db/migrations/; scripts/backup-db.js; nieuw: tests/migrations.test.js.

**Concrete stappen:**

1. Inventariseer dubbele 006-prefixen zonder oude bestanden te wijzigen.
2. Nieuwe migraties vanaf 011 uniek.
3. Roep vóór elke migratie F1-E2-T00-backup aan en valideer manifest.
4. Voeg checksum, BEGIN IMMEDIATE en foreign_key_check toe.
5. Schakel FK alleen buiten transactie uit met expliciete header.

**Acceptatie:**

- [ ] Ontbrekende/mislukte backup blokkeert migratie
- [ ] gewijzigde checksum en nieuwe dubbele prefix blokkeren startup
- [ ] falende migratie laat de bron intact
- [ ] oude 006-bestanden blijven ongewijzigd.

**Test:** GK_TEST_ISOLATED=1 node --test tests/migrations.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F1-E2-T00,F1-E2-T01.

**Grootte:** M (een agentsessie).

#### F1-E2-T03 - Restore-oefening en opslaggrens

**Context:** Een backup zonder geteste restore is geen herstelplan. Deze kaart draagt direct bij aan het doel van Fase 01.

**Betrokken paden:** scripts/backup-db.js; nieuw: scripts/restore-db.js; nieuw: docs/server/backup-restore.md; nieuw: tests/backup-restore.test.js.

**Concrete stappen:**

1. Herstel DB plus assets/builds in een lege directory.
2. Vergelijk hash, rijaantallen en published build.
3. Test deny-regels voor .env, storage en .git op de echte webserverconfig.

**Acceptatie:**

- [ ] Restorehash en tellingen gelijk
- [ ] HTTP-probes naar geheime paden geven 403/404
- [ ] off-site locatie en laatste restore zijn vastgelegd
- [ ] geen productiedata gebruikt.

**Test:** GK_TEST_ISOLATED=1 node --test tests/backup-restore.test.js; handmatige restore op kopie.

**Afhankelijkheden:** F1-E2-T02.

**Grootte:** M (een agentsessie).

### 1-E3 - Zichtbaar bewijs

#### F1-E3-T01 - Twee-account golden path

**Context:** Echte zichtbare status ontbreekt als tests alleen losse modules controleren. Deze kaart draagt direct bij aan het doel van Fase 01.

**Betrokken paden:** scripts/smoke-test.js; scripts/game-browser-check.js; README/fases/evidence/; bestaand: apps/web/public/game/.

**Concrete stappen:**

1. Maak een geisoleerde published fixture uit bestaande authoring zonder live content te muteren.
2. Automatiseer login, join, twee avatars, attack en quest.
3. Bewaar screenshots en eventlog.

**Acceptatie:**

- [ ] Twee accounts zien elkaar binnen 2 s
- [ ] aanval/quest komen overeen na refresh
- [ ] Kevin doorloopt dezelfde route op de echte testomgeving
- [ ] geen seeded content in verse DB.

**Test:** GK_TEST_ISOLATED=1 npm run smoke; GK_TEST_ISOLATED=1 npm run game:browser-check; Kevin-handtest.

**Afhankelijkheden:** F1-E1-T02,F1-E2-T03.

**Grootte:** M (een agentsessie).

#### F1-E3-T02 - Nulmeting en writekosten

**Context:** Latere prestatieclaims en een workerbesluit zijn oncontroleerbaar zonder identieke scene en machinegegevens. Deze kaart draagt direct bij aan het doel van Fase 01.

**Betrokken paden:** scripts/perf-game.js; nieuw: scripts/perf-server.js; README/fases/evidence/MMORPG-v2/F1/.

**Concrete stappen:**

1. Meet 1/2 spelers, tickduur, event-loop-lag, sync DB-write p50/p95/p99 per actietype, publishduur en browserframes.
2. Leg machine, energieprofiel, browser en build vast.

**Acceptatie:**

- [ ] JSON/CSV met ruwe samples en percentielen
- [ ] testscenario en contenthash vastgelegd
- [ ] gemeten DB-writekosten staan los van een workerbelofte.

**Test:** GK_TEST_ISOLATED=1 npm run perf:game; GK_TEST_ISOLATED=1 node scripts/perf-server.js.

**Afhankelijkheden:** F1-E3-T01.

**Grootte:** S (een agentsessie).

