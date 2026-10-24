# Verwerking van Claude's acht reviewpunten

**Oordeel:** de koers van v2 blijft goed: veilige zichtbare twee-account-slice vóór canonical authoring. Claude vond wel echte uitvoeringsfouten. Hieronder staat per punt het besluit in v2.3. De vorige consolidatie- en mappingbestanden zijn **archief**, geen agentwerkdocument en niet in deze zip.

| Punt | Oordeel | Correctie / plek |
| --- | --- | --- |
| 1. Testisolatie en backupvolgorde | Klopt. | F1-E0-T02 komt vóór alle nieuwe securitytests; F1-E2-T00 maakt backup vóór F1-E2-T02 de migratierunner verandert. CI/baseline pas na isolatie. |
| 2. `.gitignore` ontbreekt | Klopt op de opnieuw gecontroleerde `main`-root. Kevin heeft daarna expliciet besloten geen publieke root `.gitignore` te willen. | De verplichte ignore-kaart is vervallen. F1-E0-T02 is de eerste codekaart en controleert getrackte padnamen; een lokale Git-exclude en commitcontrole blijven opties. Een ignore-bestand zou bestaande publicatie niet verbergen. Deze documentatiecommit verandert geen gamecode of database. |
| 3. FULL + DB-worker te zwaar | Klopt als onvoorwaardelijke basisroute. | ADR-002/004 kiezen eerst p50/p95/p99-metingen in F1/F2, dan positie buiten simtick en bestaande atomaire transacties. Geen verplichte worker of VPS-stroomuitvalproef. WAL+NORMAL voor vrijwillige gesloten test alleen met OB-07-acceptatie. **Niet overgenomen:** backups maken NORMAL niet power-loss-durable; recent geackte voortgang kan verloren gaan. [SQLite bevestigt dat](https://www.sqlite.org/pragma.html#pragma_synchronous). |
| 4. Kaarten te groot | Klopt. | 20 Hz is gesplitst in klok/owner/consumerparity (F2-E1-T03..T05); DB-persistentie in meting/checkpoint/contract/node03/node04 (F2-E2-T04..T08); editor in shell en drie flows plus E2E (F3-E3-T02/T04..T07); characterdata in inventaris, schema, backfills, fences en selectie (F6-E1-T01/T04..T11). Geen feature is hierdoor toegevoegd. |
| 5. Oude documenten lijken normatief | Klopt. | Master geeft één actieve rangorde; F1-E0-T03 markeert oude vijf contracten historisch in de repo-index. Geen oude fase of auditarchief kan de v2.3-scope uitbreiden. Oude bestanden worden niet destructief verwijderd. |
| 6. 421 rijen grotendeels scriptmatige traceerbaarheid | Klopt als gebruikskritiek. | 02/04 en de inventaris/red-teamtekst zijn uit de actieve zip gelaten. Het aantal rijen wordt niet langer als 421 individueel bewezen codebevindingen gepresenteerd. De concrete foute koppelingen zijn niet als taakbron meegenomen; repo-/fasepaden in actieve kaarten en ADR's krijgen voorrang. |
| 7. Twee ontbrekende taken | Klopt. | F6-E3-T04 sluit `/api/game/live` en oude HTTP-game-mutaties uiterlijk bij F6-exit; F5-E2-T05 introduceert `015_actor_runtime_state.sql` voor lootclaim en respawn-expiry. |
| 8. `011_characters.sql` versus `player_characters` | Klopt. | F2-E1-T02 gebruikt voortaan `db/migrations/011_player_characters.sql` en de tabel `player_characters`; F6 behoudt de legacy `selected_character_id`-betekenis en gebruikt een nieuw actief-character-veld. |

## Grenzen van deze correctie

Deze revisie is **planwerk**, geen codefix. De actuele root heeft volgens de GitHub-inhoudslijst geen `.gitignore`; andere branches/hostinstellingen zijn niet onderzocht. Er is geen lokale GK-checkout in deze omgeving, dus geen `npm test`, browsertest, restore of echte tickmeting uitgevoerd. De actuele commit en eventueel al gemaakte lokale wijzigingen moeten in de eerste agentopdracht opnieuw worden bekeken. Een planfase is pas klaar na code, testuitvoer en een route die Kevin zelf ziet.
