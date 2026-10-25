# Fase 03 voortgang

- Start: 2026-10-25, op `main` na "Fase 02". Plan: `README/fases/MMORPG-basis-v2/FASE-03-canonieke-authoring-en-builds.md`.
- Instap: F3 is gestart terwijl Kevins F2-handtest nog liep. F2 is dezelfde dag door Kevin geaccepteerd (handtest-filmpje), dus dat risico is weg.
- Gebouwd door Claude in de cloud, in één commit "Fase 03". In de cloud zijn alleen de unit-tests gedraaid (geen eigen servers, zie CLAUDE.md).
  Smoke, browsercheck, parity op de echte inhoud, rollback-proef en Kevins handtest staan in `CLI-PROMPT.md`.

## Zo test je het (Kevin)

1. Editor -> knop **Canoniek** (of `/editor/canoniek.html`).
2. **Project**: vul een naam en welkomsttekst in, Opslaan.
3. **Items**: + Nieuw item, naam invullen, Item maken. De ID wordt uit de naam gemaakt. Icoon en model kies je uit de assetlijst.
4. **Pickups**: kies zone en item, klik op de kaart. Klik een bolletje om het te kiezen; sleep om te verplaatsen; rechts pas je aantal, plek en respawn aan.
   Met **3D-weergave tonen** zie je de echte wereld: klik op de grond om te plaatsen (of de gekozen pickup te verplaatsen).
5. **Publiceren**: Publiceer build.
6. Game: een open tab meldt "Nieuwe inhoud gepubliceerd". Na verversen staat de naam bovenaan. De pickup staat op de gekozen plek. Oppakken lukt één keer.
7. Terug: in Publiceren bij de vorige build **Terugzetten naar deze build** (reden invullen). Je inventaris blijft gelijk.
8. Verhuizen uit Nodes (alleen admin, eenmalig per domein): Publiceren -> **Bekijk verhuisrapport**. Staat er GO, dan **Verhuis ...**.
   Volgorde: Projectnaam, Items, Item-pickups. Daarna zijn die dingen in Nodes alleen-lezen. Maak eerst een backup: terug kan alleen via backup.

## Kaartstatus

| Kaart | Status | Wat er staat | Nog nodig |
| --- | --- | --- | --- |
| F3-E1-T01 contract + kinds | code + test | `src/shared/authoring/kinds.js`: 3 kinds, audience per veld (client/server), geen defaults bij read, onbekend veld = fout. Item heeft alle velden die de runtime leest (categorie, zeldzaamheid, stack, bind, ruilbaar, questitem, icoon, model, tags, verkoopwaarde). `README/PROJECT_CONTRACT.md` writer per domein | review Kevin |
| F3-E1-T02 documenten + commands | code + test | migratie `012_authoring_core.sql`; `document-repository.js`, `command-service.js`: CAS, 409 bij stale, requestId-retry (zelfde id + andere inhoud = 409), refs, archiefblokkade bij gebruik | — |
| F3-E1-T03 API + CSRF | code + test + serverproef | `routes.js`; in `server.js` pas ná de Origin/CSRF-controle; actor uit sessie; If-Match/ETag; 413; spelers alleen `client.json`. Adminlogin en `GET /api/authoring/cutover` op `127.0.0.1:3001` geven 200 | — |
| F3-E2-T01 runtime compatibility | code + test + echte inhoud | `runtime-overlay.js`: canoniek -> exact de vorm die node03 leest; verhuisde legacy-pickups houden instance-ID; gearchiveerde items blijven in de servercatalogus. Op de echte DB zijn project (1 object) en items (21 objecten) zonder afwijkingen; pickups is geblokkeerd vóór vergelijking | pickup-blokkers oplossen vóór verhuizen |
| F3-E2-T02 immutable build + pointer | code + test | migratie `013_builds.sql`; `build-service.js`: tmp-map, fsync, rename, pointer in transactie met If-Match, hashes, zelfde inhoud = zelfde root-hash, `server.json` nooit via HTTP. Builds in backup/restore | — |
| F3-E2-T03 rollback + provenance | code + test | `POST /api/authoring/rollback` (admin, If-Match, reden, audit); provenance per build; knop in de werkbank | echte rollback-proef overgeslagen op verzoek van Kevin |
| F3-E3-T01 legacy import + guard | code + test + echt rapport | `legacy-import.js`: rapport per domein, finalize met graphrevisie (ook in de transactie), blokkeert bij afwijkingen tenzij bewust geaccepteerd. `cutover-guard.js`: Nodes alleen-lezen per object en per domein (`409 CANONICAL_OWNED` / `CANONICAL_DOMAIN`) | project/items GO; pickups NO-GO; niets gefinalized |
| F3-E3-T02 editor-shell | code | losse pagina `canoniek.html` + `canonical-slice.js` (mount/unmount via AbortSignal); `editor.js` niet aangeraakt, alleen een link in `index.html` | browsercheck (CLI) |
| F3-E3-T04 projectformulier | code | `project-settings-view.js` | browsercheck (CLI) |
| F3-E3-T05 itemformulier | code | `item-definition-view.js`: alle velden, asset-kiezers, archiveren/terugzetten | browsercheck (CLI) |
| F3-E3-T06 pickupplaatsing | code | `pickup-placement-view.js` (2D, licht voor de oude laptop) + `pickup-viewport-3d.js` (optioneel, laadt pas na klikken, zelfde world-runtime als editor en game) | browsercheck incl. 3D (CLI) |
| F3-E3-T07 editor -> game | code | game laadt `client.json`, toont naam/welkomsttekst, meldt nieuwe builds; server gebruikt de actieve build | browsercheck 2 browsers (CLI) |
| F3-E3-T08 evidence | open | dit bestand, smoke- en browsercheck-stukken | Kevin-video, akkoord |

## Bewuste keuzes en grenzen

- Eén gedeelde wereld: na publish of rollback gebruikt de server meteen de nieuwe build voor iedereen. Alleen het clientpakket in een open tab blijft staan, met een melding om te verversen. "Elke sessie houdt haar eigen build" kan niet in één server-authoritative wereld.
- Geld-pickups en `pickup_component` blijven in Nodes. Alleen item-pickups verhuizen.
- Geen "terug naar Nodes" na verhuizen. Terug kan alleen via een backup (die nu ook de builds bevat).
- Geen DOM-unit-tests voor de werkbank; de UI wordt getest in `scripts/game-browser-check.js`.

## Servercontrole 2026-10-25

- **Stap 0 — gedeeltelijk GO.** `GK_TEST_ISOLATED=1 npm test` is 118/118 groen, `npm run check` is 105/105 groen en de geïsoleerde smoke eindigt met `SMOKE TEST GESLAAGD`. De browsercheck is op Kevins verzoek gestopt en krijgt daarom geen GO. De B-afstand bleek timing-/margegevoelig; de testgrens is met toestemming van 1,5 naar 2,5 gezet. De laatste 3D-grondklikreparatie is niet opnieuw met de browsercheck bevestigd.
- **Stap 1 — GO.** `git pull --ff-only` was al bij; de pre- en post-migratiebackups zijn beide `integrity: ok`; de bestaande systemd-service draait op `127.0.0.1:3001`; de database bevat 14 migraties en registreert `012_authoring_core.sql` en `013_builds.sql`. Het post-migratiemanifest bevat `builds` en `canonicalRelease`.
- **Stap 2 — project GO, items GO, pickups NO-GO.** Droog rapport op graphrevisie 26495: project 1 vergeleken/0 afwijkingen/0 blokkers; items 21/0/0; pickups 0/0/4. Blokkers: eerst Items overzetten, één ongeldig respawnbeleid en twee ontbrekende actieve canonieke itemreferenties. Er is op `:3001` niets gefinalized.
- **Stap 3 — overgeslagen op verzoek van Kevin.** Geen rollback-proef of testpublicaties op `:3001` uitgevoerd.
- **Stap 4 — open.** Kevins handtest en akkoord/video zijn nog niet vastgelegd.

Ruw bewijs: `stap0-npm-test-2026-10-25.log`, `stap0-npm-check-2026-10-25.log`, `stap0-smoke-2026-10-25.log`, de gestopte `stap0-browser-check*.log`-bestanden, `stap1-git-pull-2026-10-25.log`, `stap1-backup-voor-herstart-2026-10-25.log`, `stap1-herstart-en-migraties-2026-10-25.log`, `stap1-backup-na-herstart-2026-10-25.log`, `stap1-manifestcontrole-2026-10-25.log`, `cutover-rapport-2026-10-25.json` en `stap2-cutover-samenvatting-2026-10-25.log`.

## Bewijslog

- Cloud, Node 22, `GK_TEST_ISOLATED=1 node --test` op authoring-commands, build-atomic, authoring-api, authoring-lifecycle, migrations, backup-db, backup-restore, graph-repository: 27/27 groen.
  Dekt o.a.: valid/invalid vectors, 409 stale zonder write, requestId-hergebruik, refblokkade, gelijke root-hash bij gelijke input,
  fout na bestanden laat de pointer staan, rollback + audit, geen server-only velden in client.json, graph-tabellen ongewijzigd door commands,
  rollen en If-Match op de API, CSRF vóór de routes, Nodes-blokkade per object, verhuisvolgorde, race op de graphrevisie, parity-afwijkingen blokkeren,
  bewerken/archiveren na verhuizen, backup + restore met builds.
- `node --check` op alle gewijzigde bestanden: ok.
- Klaargezet, niet in de cloud gedraaid: F3-stukken in `scripts/smoke-test.js` en `scripts/game-browser-check.js`. Zie `CLI-PROMPT.md`.
- Server, Node 24: tests 118/118, checks 105/105 en smoke groen. Browsercheck gestopt op verzoek van Kevin; geen eind-GO toegekend.
- Echte database: migraties 012/013 toegepast; twee integere backups; droog verhuisrapport bewaard als `cutover-rapport-2026-10-25.json`; geen finalize en geen rollback-proef uitgevoerd.
