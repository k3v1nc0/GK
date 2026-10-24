# Fase 02 voortgang

- Start: 2026-10-24, op `main` na `3a369dc`. Plan: `README/fases/MMORPG-basis-v2/FASE-02-speelbare-verticale-slice.md`.
- Sessie 1 (Claude, cloud): alle kaarten die zonder draaiende server te bouwen en te unittesten zijn. Geen server, smoke, browsercheck of bots gedraaid (CLAUDE.md). Die stappen staan in `CLI-PROMPT.md` voor de CLI op Kevins machine.
- Tick-keuze (OB-05, nog door Kevin te bevestigen): de tick blijft uit de netwerkpreset van de wereld komen (Kevin tunede in F1 op "fast"). De klok is wel een pure module met vaste stap; 20 Hz is alleen de standaard als niets is opgegeven.

## Kaartstatus

| Kaart | Status | Wat er staat | Nog nodig (CLI / Kevin) |
| --- | --- | --- | --- |
| F2-E1-T01 movementkernel | code af | `apps/web/public/shared/movement-kernel.js` (+ `earcut.js`), world-runtime en server gebruiken dezelfde functies; server laadt geen Three.js meer | smoke + browsercheck + `feel:world-copy` groen |
| F2-E1-T02 character 1-op-1 + lease | code af | migratie `011_player_characters.sql`, `src/server/character-service.js`, lease bij elke WS-join | migratie op kopie van live DB draaien; node03/04/05 handmatig |
| F2-E1-T03 wereldklok | code af | `src/server/runtime/world-clock.js` (max 3 inhaalticks per ronde, DEGRADED, ruwe samples) | — |
| F2-E1-T04 een world-owner | code af | tickloop gebruikt de klok; een timer, een muterende loop | smoke |
| F2-E1-T05 timing-consumers | deels | klok + tickPerf in `serverPerf.clock` | replay twee-accountfixture voor/na |
| F2-E2-T01 protocol v1 | server af | `apps/web/public/shared/protocol-v1.js`, `POST /api/game/join-ticket`, `/ws/game` (gk-mmo-v1, AUTH binnen 5 s); legacy `/api/game/live` blijft | client (`game.js`) omzetten; smoke-checks echte upgrade |
| F2-E2-T02 prediction/reconcile | open | — | `netcode.js`, netwerkproef 5%/150 ms |
| F2-E2-T03 AOI + backpressure | server af, achter vlag | `src/server/runtime/interest.js`; `GAME_AOI_ENABLED=1` zet per-ontvanger snapshots aan | browsercheck met vlag aan, client-despawn, daarna standaard aan |
| F2-E2-T04 DB-schrijfkosten | meting af | `serverPerf.dbWritesMs` per label, `serverPerf.eventLoopDelayMs`; `npm run perf:db-writes` | ladder draaien, besluit worker ja/nee |
| F2-E2-T05 posities buiten de tick | code af | `src/server/persistence/position-checkpoint.js`; flush op eigen timer (1 s, max 5 s); ongezond = geen nieuwe joins | 25 bots/30 min, crash-RPO meten |
| F2-E2-T06 operatiecontract | code af | `src/server/persistence/operation-contract.js` (ook check op andere speler) | — |
| F2-E2-T07 node03 atomair | code af | node03 gebruikt het contract; kill+loot+receipt in een transactie | smoke kill/loot |
| F2-E2-T08 node04 atomair | code af | node04 (en node05) gebruiken het contract | smoke turn-in |
| F2-E3-T01 combat-autoriteit | code af | `src/server/runtime/combat-adapter.js`: attack/gather/pickup alleen actie + doel, vervalste velden -> 400 | smoke-negatives |
| F2-E3-T02 quest exact eenmaal | code af (contract) | via F2-E2-T08 | smoke dubbele turn-in |
| F2-E3-T03 zichtbare slice + bots | deels | `scripts/load-bots.js` (`npm run bots`) | golden-path fixture, HUD, browsercheck, 25 bots/30 min, Kevin-video |

## Bewijslog

- `npm run check`: alle bestanden syntactisch ok.
- `GK_TEST_ISOLATED=1 npm test`: zie commit "Fase 02" (laatste run: alle tests groen, geen server gestart).
- Pariteit movementkernel tegen de oude world-runtime (eenmalig, 1000 vectoren): maximaal verschil 0.
- Procescrash-test: kindproces stopt voor en na COMMIT; na herstart 0 resp. 1 grant, receipt en grant altijd samen.

## Exitcriteria (stand sessie 1)

| # | Criterium | Status |
| --- | --- | --- |
| 1 | Twee browsers kill -> loot -> quest, gelijk na refreshes en restart | niet getoetst (CLI + Kevin) |
| 2 | 25 bots, 30 min: tick p95 <= 25, p99 <= 40, eventloop p99 <= 20, 0 dubbele receipts | niet getoetst (`npm run bots`) |
| 3 | Clientmanipulatie: nul servermutaties | unit groen; smoke nodig |
| 4 | 5% verlies / 150 ms: <= 0,2 m binnen 2 s | open (F2-E2-T02) |
| 5 | Crash: 0 verloren geackte rewards, positie-RPO <= 5 s, geen SQLite-write in de tick | unit groen; bots + crash op server nodig |
| 6 | Kevin heeft het zelf getest | open |

**Fase 02 is niet voltooid.**
