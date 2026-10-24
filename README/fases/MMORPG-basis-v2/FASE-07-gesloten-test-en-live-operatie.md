# Fase 07 - Gesloten test en live-operatie

> Status: voorstel voor implementatie, **niet** gerealiseerd op de geauditeerde `main`-baseline. De implementatietaken zijn nog niet uitgevoerd; deze documentatiecommit verandert geen gamecode of database.

**Doel:** Een kleine gesloten test draait met chat, party, moderatie, privacyrechten, herstelbare releases en een eerlijk gecertificeerde CCU-capaciteit.

## Waarom nu
Een speelbare RPG is nog geen live dienst; netwerkdruk, misbruik, migraties, incidenten en privacy moeten voor externe testers worden bewezen.

## Afbakening
**Wel:** Local/party chat, block/report/mute, party, basisprivacy, staging/deploy/rollback, observability, load/soak, versiebeleid en gecontroleerde gesloten test.

**Niet:** Guilds, vriendenlijst, global chat voor brede publieke uitrol, direct trade/market, multi-host shards, destructieve nodeverwijdering, commerciele launch.

## Afhankelijkheden en instap
**Afhankelijkheden:** F6 volledige RPG-lus; F1 backup/CI; F3 pinned builds; F2 netwerk.

**Instapcriteria:** Een staging-host met gedocumenteerde CPU/RAM/disk/netwerk; juridisch/privacy-besluit voor doelgroep; testaccounts zonder echte persoonsgegevens waar mogelijk. OB-07 moet vóór externe uitnodiging expliciet getekend zijn.

## Exit-criteria / Definition of Done
- [ ] Meet 10/25/50/100/200 CCU tot de eerste gefaalde trede: gekozen gesloten-testcap >=5 en <=60% van hoogste geslaagde 2 uur soak; nooit 200 claimen zonder bewijs.
- [ ] Onder gekozen cap: tick p95 <=25 ms/p99 <=40 ms, event-loop-delay p99 <=20 ms, outbound p95 <=12 KiB/s per speler of gedocumenteerde herziene cap, nul duplicate receipts.
- [ ] Deploy van build N naar N+1 en code-rollback binnen 10 min op staging; DB/asset-restore met geteste RPO/RTO in runbook; geen code-only rollback na niet-additieve migratie.
- [ ] Twee accounts chatten en partyen; block/mute/report werkt; geen sessie/user/device ID in andermans payload; moderator kan incident terugvinden.
- [ ] Export en verwijderverzoek hebben een geteste procedure; privacy- en retentiebeleid is vóór externe test zichtbaar en juridisch beoordeeld.
- [ ] OB-07 is door Kevin bevestigd: WAL+NORMAL-risico en onbekend power-loss-RPO zijn aan testers uitgelegd; de test bevat geen betaalde waarde.
- [ ] Kevin heeft de gesloten test met ten minste vijf echte testers, 60 min, afgerond en issues geprioriteerd; geen P0/P1 open.
- [ ] Alle taakacceptaties en de fase-evidence zijn nagekeken door een mens; Kevin heeft het zichtbare resultaat zelf getest. Een schema, mock of testfixture zonder gameconsumer sluit de fase niet.

## Deliverables, risico en test
**Deliverables:** Closed-test release, runbook, stagingconfiguratie, dashboards/alerts, bot-/soak-/restorebewijzen, social en privacyprocedures.

**Testplan:** Protocol- en socialconformance, 2 uur soak, chaos, deploy/rollback/restore rehearsal, privacy requesttest, vijf-testersessie.

**Inschatting:** XL, 5-8 weken plus tijd voor privacyreview en externe testers; aanname een EU single-host staging/closed-testomgeving.

**Met eigen ogen:** Kevin ziet twee spelers samenwerken, een moderatoractie, echte dashboards en een aantoonbaar teruggedraaide testrelease.

| Risico | Kans | Impact | Mitigatie |
| --- | --- | --- | --- |
| Hostcapaciteit valt lager uit dan doel | hoog | hoog | Cap wordt uit meting afgeleid, toelating bewaakt headroom. |
| Juridische/retentiekeuze onjuist | middel | kritiek | Geen openbare registratie voor review; jurist/privacybeoordeling. |
| Nodeverwijdering te vroeg | middel | hoog | Geen graphcleanup in deze basis; een later apart plan vereist gebruiks- en paritybewijs. |

## Taakkaarten

Een kaart is maximaal een agentsessie. Bij een wijziging die toch meer dan circa 1 werkdag of meer dan een reviewbare PR vraagt: stop, splits de kaart en behoud het ID als parent. `nieuw:` betekent voorgesteld pad; bestaande paden zijn op `main` geverifieerd tenzij anders vermeld. Testcommando's met nieuwe bestanden zijn uit te voeren nadat die taak ze heeft gemaakt.

### 7-E1 - Sociaal en privacy

#### F7-E1-T01 - Local en party chat met misbruikgrens

**Context:** Een chatfunctie zonder rate limits en retentie is operationeel onveilig. Deze kaart draagt direct bij aan het doel van Fase 07.

**Betrokken paden:** nieuw: src/server/social/chat-service.js; nieuw: db/migrations/018_chat.sql; nieuw: tests/chat.test.js; apps/web/public/game/.

**Concrete stappen:**

1. Maak server-owned local/party channels met maxlengte, rate limits, HTML escaping, per-character identiteit en configureerbare retentie.
2. Geen globale chat in basis.

**Acceptatie:**

- [ ] Onbekend kanaal of spoofed sender geweigerd
- [ ] 6e bericht binnen limietvenster 429
- [ ] block verbergt berichten
- [ ] HTML wordt tekst
- [ ] retentiejob testbaar.

**Test:** GK_TEST_ISOLATED=1 node --test tests/chat.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F6-E1-T11,F6-E3-T04,F2-E2-T01.

**Grootte:** M (een agentsessie).

#### F7-E1-T02 - Party en presence

**Context:** Spelers moeten samenwerken zonder dat social state gameplay-ownership overneemt. Deze kaart draagt direct bij aan het doel van Fase 07.

**Betrokken paden:** db/migrations/008_economy_trade_market_crafting_party_mail.sql; nieuw: db/migrations/019_party_v2.sql; nieuw: src/server/social/party-service.js; nieuw: tests/party.test.js.

**Concrete stappen:**

1. Migreer bestaande party-rijen via 1:1 charactermap.
2. Gebruik parties_v2/party_members_v2/party_invites_v2.
3. Max vijf leden.
4. Revision CAS, leader transfer en reconnectpresence.

**Acceptatie:**

- [ ] Character in hoogstens een actieve party
- [ ] gelijktijdige inviteaccept geeft een lidmaatschap
- [ ] restart behoudt party
- [ ] presence lekt geen verborgen gebruiker.

**Test:** GK_TEST_ISOLATED=1 node --test tests/party.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F7-E1-T01,F6-E1-T11.

**Grootte:** M (een agentsessie).

#### F7-E1-T03 - Report, mute en beheerlog

**Context:** Een gesloten test heeft menselijke interventie en bewijs nodig. Deze kaart draagt direct bij aan het doel van Fase 07.

**Betrokken paden:** nieuw: src/server/social/moderation-service.js; nieuw: db/migrations/020_moderation.sql; nieuw: tests/moderation.test.js; nieuw: docs/server/moderation.md.

**Concrete stappen:**

1. Maak block/report/mute, admin kick en audittrail.
2. Beperken admin-API op rol/CSRF.
3. Maak inzage met minimale persoonsgegevens en retentie.

**Acceptatie:**

- [ ] Gemute speler kan niet chatten
- [ ] report heeft target/evidence zonder sessietoken
- [ ] adminactie auditbaar
- [ ] gewone speler krijgt 403.

**Test:** GK_TEST_ISOLATED=1 node --test tests/moderation.test.js; GK_TEST_ISOLATED=1 npm test.

**Afhankelijkheden:** F7-E1-T01.

**Grootte:** M (een agentsessie).

#### F7-E1-T04 - Privacybeleid, export en verwijderprocedure

**Context:** AVG-rechten en doelgroepkeuze kunnen niet als nagedachte aan een live account worden gehangen. Deze kaart draagt direct bij aan het doel van Fase 07.

**Betrokken paden:** nieuw: docs/privacy/data-inventory.md; nieuw: src/server/account-data-service.js; nieuw: tests/privacy-requests.test.js.

**Concrete stappen:**

1. Inventariseer users/sessions/chat/economy/logs/backups.
2. Definieer doel/grondslag/retentie.
3. Implementeer account-export en verzoekworkflow met juridische uitzonderingen.
4. Kies gesloten test 18+ totdat minderjarigenbeleid is beoordeeld.

**Acceptatie:**

- [ ] Export bevat eigen data en geen andermans data
- [ ] verwijderverzoek blokkeert login en heeft auditeerbare afhandeling
- [ ] retentiejob testbaar
- [ ] privacytekst/reviewerakkoord vastgelegd.

**Test:** GK_TEST_ISOLATED=1 node --test tests/privacy-requests.test.js; juridische review.

**Afhankelijkheden:** F7-E1-T03.

**Grootte:** M (een agentsessie).

### 7-E2 - Operations

#### F7-E2-T01 - Staging en reproduceerbare release

**Context:** Huidige repo bevat geen CI of deploymentconfig als verifieerbare bron. Deze kaart draagt direct bij aan het doel van Fase 07.

**Betrokken paden:** nieuw: infra/; nieuw: .github/workflows/release.yml; nieuw: docs/server/deploy.md; package-lock.json.

**Concrete stappen:**

1. Leg single-host EU staging vast als code zonder secrets.
2. Pin Node/dependencies.
3. Bouw manifest met commit/build/schema.
4. Gescheiden dev/staging/prod configuraties.

**Acceptatie:**

- [ ] Schoon checkout reproduceert gelijke artifacthash
- [ ] secrets staan buiten repo
- [ ] stagingdeploy logt versie
- [ ] infra dry-run toont geen onbedoelde wijzigingen.

**Test:** npm ci; npm run check; GK_TEST_ISOLATED=1 npm test; infra dry-run volgens gekozen provider.

**Afhankelijkheden:** F1-E2-T01,F3-E2-T02.

**Grootte:** M (een agentsessie).

#### F7-E2-T02 - Health, metrics en alarmen

**Context:** Een operator moet tickachterstand en falende writes zien voor spelers dat doen. Deze kaart draagt direct bij aan het doel van Fase 07.

**Betrokken paden:** src/server/server.js; nieuw: src/server/observability/metrics.js; nieuw: docs/server/alerts.md; nieuw: tests/health.test.js.

**Concrete stappen:**

1. Maak live/ready gescheiden, metrics voor tick/queue/DB/WS/errors en gestructureerde logs zonder secrets.
2. Alarm op 5 overschreden ticks, queuegrens, disk en backupmiss.

**Acceptatie:**

- [ ] Ready faalt bij corrupte build of DB write-fail
- [ ] live blijft simpel
- [ ] 4 alarmscenario's vuren in test
- [ ] log bevat requestId/buildId zonder token.

**Test:** GK_TEST_ISOLATED=1 node --test tests/health.test.js; staging alarmtest.

**Afhankelijkheden:** F7-E2-T01,F2-E2-T04.

**Grootte:** M (een agentsessie).

#### F7-E2-T03 - Drain, patch, rollback en restore

**Context:** Een release mag geen geackte reward verliezen of oude client stil breken. Deze kaart draagt direct bij aan het doel van Fase 07.

**Betrokken paden:** nieuw: src/server/runtime/drain.js; nieuw: docs/server/runbook.md; nieuw: tests/release-recovery.test.js.

**Concrete stappen:**

1. Kondig maintenance aan, weiger nieuwe joins, laat lopende kritieke transacties aflopen, snapshot en switch build.
2. Test oude/nieuwe clientversion gate.
3. Oefen code-rollback en DB+assetrestore.

**Acceptatie:**

- [ ] Drain binnen 60 s of expliciete force/fail
- [ ] 0 geackte rewards verloren bij procesrestart
- [ ] rollback <=10 min op staging
- [ ] incompatible client krijgt updatecode
- [ ] restorehash gelijk.

**Test:** GK_TEST_ISOLATED=1 node --test tests/release-recovery.test.js; staging rehearsal.

**Afhankelijkheden:** F7-E2-T02,F7-E2-T01.

**Grootte:** M (een agentsessie).

### 7-E3 - Capaciteit en acceptatie

#### F7-E3-T01 - Bots, bandbreedte en gecertificeerde cap

**Context:** Een CCU-getal zonder host en trafficmodel is marketing, geen engineering. Deze kaart draagt direct bij aan het doel van Fase 07.

**Betrokken paden:** scripts/load-bots.js; nieuw: scripts/soak-report.js; README/fases/evidence/MMORPG-v2/F7/perf/.

**Concrete stappen:**

1. Meet 10/25/50/100/200 bots tot de eerste gefaalde trede met mix 50% bewegen, 20% combat, 15% quest/economie, 15% idle/chat.
2. 2 uur soak op kandidaat-cap.
3. Log tick, egress, DB, GC en client FPS.

**Acceptatie:**

- [ ] Ruwe dataset per laddertrede
- [ ] certifiedCCU = hoogste trede die alle gates haalt
- [ ] admission cap <=60%
- [ ] 200 niet geclaimd als mislukte trede.

**Test:** node scripts/load-bots.js --ladder --soak=120 --isolated; inspecteer JSON.

**Afhankelijkheden:** F7-E2-T02,F7-E1-T02.

**Grootte:** M (een agentsessie).

#### F7-E3-T02 - Chaos en dataconsistentie

**Context:** Restart, volle disk en vertraagde DB moeten duidelijke gevolgen hebben. Deze kaart draagt direct bij aan het doel van Fase 07.

**Betrokken paden:** nieuw: tests/chaos-recovery.test.js; scripts/backup-db.js; docs/server/runbook.md.

**Concrete stappen:**

1. Injecteer crash vóór/na commit, DB-busy, disk vol en trage socket op geisoleerde kopie.
2. Herstel en vergelijk receipts/ledger/quest/position met referentie.

**Acceptatie:**

- [ ] Nul duplicate critical ops
- [ ] RPO position <=5 s
- [ ] geen stil verloren grant
- [ ] server weigert joins bij volle disk
- [ ] RTO gemeten en vastgelegd.

**Test:** GK_TEST_ISOLATED=1 node --test tests/chaos-recovery.test.js; restore drill.

**Afhankelijkheden:** F7-E2-T03,F7-E3-T01.

**Grootte:** M (een agentsessie).

#### F7-E3-T03 - Gesloten test en Kevin-acceptatie

**Context:** Basisacceptatie vraagt echte testers; graph cleanup is geen onderdeel van deze test. Deze kaart draagt direct bij aan het doel van Fase 07.

**Betrokken paden:** README/fases/evidence/MMORPG-v2/F7/; README/fases/MMORPG-basis-v2/OPEN-BESLISSINGEN.md.

**Concrete stappen:**

1. Draai vijf testers 60 min op capped staging.
2. Registreer incidenten, bugprioriteit en Kevinacceptatie.
3. Wijzig of verwijder geen graph-tabellen.

**Acceptatie:**

- [ ] Geen P0/P1 open
- [ ] vijf testers en 60 min vastgelegd
- [ ] Kevin ziet gameplay, moderatie en herstelbewijs
- [ ] beslissing over volgende uitbreiding is geregistreerd.

**Test:** GK_TEST_ISOLATED=1 npm run game:browser-check; handtest op staging.

**Afhankelijkheden:** F7-E3-T02,F7-E1-T04.

**Grootte:** M (een agentsessie).

