# Fase 02 voortgang

- Start: 2026-10-24, op `main` na `3a369dc`. Plan: `README/fases/MMORPG-basis-v2/FASE-02-speelbare-verticale-slice.md`.
- Sessie 1 (Claude, cloud): alle kaarten die zonder draaiende server te bouwen en te unittesten zijn. Geen server, smoke, browsercheck of bots gedraaid (CLAUDE.md). Die stappen staan in `CLI-PROMPT.md` voor de CLI op Kevins machine.
- Sessie 2 (Codex CLI, 2026-10-25): geïsoleerde server-, protocol-, golden-path- en browserproeven. De echte service op `:3001` is niet herstart of als testdoel gebruikt. Bots/perfladder/crashproef zijn op Kevins verzoek uitgesteld tot na een veilige tussencommit.
- Tick-keuze (OB-05, nog door Kevin te bevestigen): de tick blijft uit de netwerkpreset van de wereld komen (Kevin tunede in F1 op "fast"). De klok is wel een pure module met vaste stap; 20 Hz is alleen de standaard als niets is opgegeven.

## Kaartstatus

| Kaart | Status | Wat er staat | Nog nodig (CLI / Kevin) |
| --- | --- | --- | --- |
| F2-E1-T01 movementkernel | code + geïsoleerde gates groen | `apps/web/public/shared/movement-kernel.js` (+ `earcut.js`), world-runtime, netcode en server gebruiken dezelfde functies | `feel:world-copy` alleen na Kevin-akkoord |
| F2-E1-T02 character 1-op-1 + lease | code af | migratie `011_player_characters.sql`, `src/server/character-service.js`, lease bij elke WS-join | migratie op kopie van live DB draaien; node03/04/05 handmatig |
| F2-E1-T03 wereldklok | code af | `src/server/runtime/world-clock.js` (max 3 inhaalticks per ronde, DEGRADED, ruwe samples) | — |
| F2-E1-T04 een world-owner | code + smoke groen | tickloop gebruikt de klok; een timer, een muterende loop | — |
| F2-E1-T05 timing-consumers | deels | klok + tickPerf in `serverPerf.clock`; twee-accountbrowserpad groen | botsmeting nog nodig |
| F2-E2-T01 protocol v1 | code + smoke groen | client haalt join-ticket op, opent `/ws/game` met `gk-mmo-v1` en authenticeert vóór gameplay; legacy `/api/game/live` blijft | — |
| F2-E2-T02 prediction/reconcile | code + browserproef groen | `apps/web/public/game/netcode.js`: begrensde inputbuffer/replay en remote interpolatie; 150 ms + 5% verlies convergeerde naar `0.000 m` binnen 2 s | `feel:world-copy` alleen na Kevin-akkoord |
| F2-E2-T03 AOI + backpressure | overgang groen, achter vlag | client verwerkt `remote_player:despawn/spawn`; geïsoleerde AOI-proef zag despawn buiten en respawn bij terugkeer | volledige AOI-browserrun nog schoon afronden; daarom standaard **niet** aangezet |
| F2-E2-T04 DB-schrijfkosten | meting af | `serverPerf.dbWritesMs` per label, `serverPerf.eventLoopDelayMs`; `npm run perf:db-writes` | ladder draaien, besluit worker ja/nee |
| F2-E2-T05 posities buiten de tick | code af | `src/server/persistence/position-checkpoint.js`; flush op eigen timer (1 s, max 5 s); ongezond = geen nieuwe joins | 25 bots/30 min, crash-RPO meten |
| F2-E2-T06 operatiecontract | code af | `src/server/persistence/operation-contract.js` (ook check op andere speler) | — |
| F2-E2-T07 node03 atomair | code + smoke groen | kill+loot+receipt atomair; retry idempotent; gelijktijdige laatste klap geeft één grant | — |
| F2-E2-T08 node04 atomair | code + smoke groen | turn-in via operatiecontract en exact eenmaal beloond | — |
| F2-E3-T01 combat-autoriteit | code + smoke groen | `damage`/`x`/`itemId` bij attack -> 400 `CLIENT_AUTHORITY_FIELD`; operationId van B -> 409 `OPERATION_OTHER_PLAYER` | — |
| F2-E3-T02 quest exact eenmaal | code + smoke/browser groen | kill zet quest klaar; turn-in geeft 75 XP; retry geeft geen tweede beloning | — |
| F2-E3-T03 zichtbare slice + bots | browserdeel groen | authored vijand/loot/pickup/questfixture, compacte HP/target/loot/quest-HUD, twee pagina's en twee refreshes; screenshots in `browser-final/` en `browser-aoi/` | perfladder, 25 bots/30 min, crashproef en Kevin-video |

## Bewijslog

- `npm run check`: alle bestanden syntactisch ok.
- `GK_TEST_ISOLATED=1 npm test`: zie commit "Fase 02" (laatste run: alle tests groen, geen server gestart).
- Pariteit movementkernel tegen de oude world-runtime (eenmalig, 1000 vectoren): maximaal verschil 0.
- Procescrash-test: kindproces stopt voor en na COMMIT; na herstart 0 resp. 1 grant, receipt en grant altijd samen.
- `GK_TEST_ISOLATED=1 npm test`: 107/107 groen.
- `npm run check`: 88/88 groen (laatste run na browser/AOI-aanpassingen).
- `GK_TEST_ISOLATED=1 npm run smoke`: groen. Golden path, idempotency, gelijktijdige kill, vreemde authorityvelden, operation-owner, serverherstart en protocolcodes zijn echt tegen een geïsoleerde server uitgevoerd.
- Browser (`browser-final/`): golden path zichtbaar op twee pagina's; kill/grant, quest ready, turn-in en twee refreshes groen. Netwerkproef 150 ms + 5% verlies: `0.000 m` na stabilisatie. De bekende camerarand-residencycheck bleef rood.
- AOI (`browser-aoi/`, vlag aan): `speler buiten de AOI ... gedespawned` en `speler ... opnieuw` groen. De daaropvolgende algemene smoothnessmeting startte nog in de far-tier; daarom geen standaard-omslag in deze sessie.
- Beknopte ruwe CLI-uitvoer: `SESSIE-02-CLI-2026-10-25.log`.

## Exitcriteria (stand sessie 1)

| # | Criterium | Status |
| --- | --- | --- |
| 1 | Twee browsers kill -> loot -> quest, gelijk na refreshes en restart | CLI: browser + 2 refreshes groen; geïsoleerde serverrestart exact groen in smoke. Kevin-handtest nog nodig |
| 2 | 25 bots, 30 min: tick p95 <= 25, p99 <= 40, eventloop p99 <= 20, 0 dubbele receipts | niet getoetst (`npm run bots`) |
| 3 | Clientmanipulatie: nul servermutaties | unit + echte-server-smoke groen |
| 4 | 5% verlies / 150 ms: <= 0,2 m binnen 2 s | groen (`0.000 m`) |
| 5 | Crash: 0 verloren geackte rewards, positie-RPO <= 5 s, geen SQLite-write in de tick | unit groen; bots + crash op server nodig |
| 6 | Kevin heeft het zelf getest | open |

**Fase 02 is niet voltooid.**
