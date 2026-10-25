# Fase 01 voortgang

- Branch: `codex/fase-01-veiligheid-bewijsbasis`
- Baseline: `26f231efc203abc7dc4cd2969c793e829b3c7b09`
- Startdatum: 2026-10-23
- Normatief gelezen: `START-HIER.md`, `00-MASTERPLAN.md`, Fase 01 en ADR-001 t/m ADR-010.
- Lokale instructie: alleen `localhost:3001` / `127.0.0.1:3001`; geen eigen servers starten. Daarom worden server-, smoke- en browserruns pas door Kevin op de bestaande lokale server gecontroleerd, tenzij die instructie wordt gewijzigd.
- Bestaande werkboomwijzigingen bij start (niet van Fase 01): verwijderde `README/NODE-GUIDE-CAMPAIGNS-QUESTS.md`, verwijderde `README/fases/README.md`, nieuwe `README/README.md` en nieuwe `README/fases/Oude basis/NODE-GUIDE-CAMPAIGNS-QUESTS.md`. Niet wissen of meenemen in Fase-commits.
- Initiële naamcontrole: geen getrackte DB-/secretbestanden gevonden met de afgesproken bestandsnaamfilter; er is geen inhoud bekeken.
- Migratie-inventaris: bestaande dubbele prefix `006_`; beide bestanden blijven ongewijzigd. Nieuwe migraties starten vanaf `011_`.

## Kaartstatus

- [x] F1-E0-T02 — commit `8fd5ad1`; wegwerpworktree: 4/4 groen, byte-identieke DB-/assetsentinel en cleanup na fout. Veilige baseline: 34 tests, 29 groen en 5 bestaande regressies rood.
- [x] F1-E0-T03 — fase-index (nu `README/README.md`, verplaatst in `394f2ab`; oorspronkelijk `README/fases/README.md`, Kevins commit `26f231e`) noemt alleen v2.3 als actieve ingang en de vijf oude `MMORPG-basis/`-documenten historisch. Die map bestaat niet meer in de werkboom (wel in git-historie op `8a976e3`), dus er valt niets te labelen of per ongeluk als scope te geven. Bewijs: `rg -n "MMORPG-basis" README/fases/README.md` → regels 5, 7 en 9. Documentreview door Kevin open.
- [x] F1-E1-T01 — absolute positie/teleport en stop-resynccoördinaten geweigerd; remote identity gesaneerd; 3/3 gerichte authoritytests groen. Zone-link blijft op het afzonderlijke serverinterne teleportpad en wacht op smoke/handbewijs.
- [x] F1-E1-T02 — debug/reset vereist admin + `DEV_GAME_ACTIONS=1`; operation-ID bindt volledige genormaliseerde payload in node03/04/05; attack/gather hebben servercooldown; 3/3 gerichte tests groen.
- [x] F1-E1-T03 — async PBKDF2, IP+account 5/min, sessierotatie, geen sessie-ID-fallback en productiestart vereist Secure-cookie; 3/3 gerichte tests groen. Live service mist `COOKIE_SECURE=true` → startweigering bij herstart; zie `docs/server/f1-handtest.md` stap 0.
- [x] F1-E1-T04 — Afgerond: 70 KiB → 1009, `/%FF` → 400 en verkeerde WS-Origin slagen in smoke tegen het echte serverproces (`smoke-a038d44.txt`, `smoke-7ba2ec0.txt`). Oorspronkelijk: exacte Origin, sessiegebonden CSRF, 64 KiB WS, fout-URL/streamafvang en remote identity-sanitizing geïmplementeerd; 8/8 gecombineerde boundary/auth/authoritytests groen. Echte 70-KiB-close en proces-liveness wachten op toegestane servercheck. De integratieasserts (70 KiB → 1009, `/%FF` → 400 + server leeft, verkeerde WS-Origin) staan sinds `2ec122d` in smoke maar zijn nog niet gedraaid.
- [x] F1-E2-T00 — online SQLite-backup, hashes/manifest, assetkopie en publieke-doelweigering; 3/3 gerichte tests groen.
- [x] F1-E2-T01 — vijf baseline-regressies hersteld, CI toegevoegd; `check` 69/69 en volledige geïsoleerde suite 48/48 groen.
- [x] F1-E2-T02 — backup+manifest vóó elk pending bestand, checksums, duplicate-prefixgate, `BEGIN IMMEDIATE`, expliciete FK-rebuildgrens en rollback; 3/3 migratietests groen. Historische `006_`-bestanden niet gewijzigd.
- [x] F1-E2-T03 — Afgerond: Apache-probe geslaagd (`apache-probe-2026-10-24.txt`), off-site backup via ssh naar Kevins NAS (zie "Afronding open punten"). Oorspronkelijk: restore naar lege privémap met integrity/tellingen/published hash/assethashes groen op fixtures; deny-regels voor `.env`/`.git`/`storage` en runbook staan er. Open: HTTP-probe op de echte Apache-config (commando in handtest A; de agent-sandbox weigerde de probe), en off-site locatie + laatste restore vastleggen (vraagt Kevins keuze, niet toetsbaar zonder hem). Node-laagprobes staan nu ook in smoke. Geen productiegegevens gebruikt.
- [x] F1-E3-T01 — Afgerond: browsercheck met twee accounts groen (`browser-check-7ba2ec0.txt`) en Kevins handtest-akkoord 2026-10-24 (zie Sessie 9). Oorspronkelijk: browsercheck eist twee accounts binnen 2 s, live remote beweging en bewaart twee screenshots plus eventlog. Uitvoering, attack/quest na refresh en Kevins zichtbare bevestiging wachten op de toegestane geïsoleerde `:3001`-handrun. Commando's: handtest A (browsercheck met `GK_BROWSER_EVIDENCE_DIR`) en B (zichtbare route).
- [x] F1-E3-T02 — Afgerond: browsernulmeting (`baseline-browser-7ba2ec0.json`) en GPU-meting op Kevins laptop (`gpu-meting-laptop-2026-10-24.png`). Oorspronkelijk: servernulmeting met ruwe JSON/CSV uitgevoerd (machine, totale SQLite+WAL+SHM-grootte, 250 writes, 240 ticks, eventloop); geen capaciteitsclaim. Browsernaam/resolutie/frametime blijven eerlijk `not_measured` tot toegestane `:3001`-browserrun. Browserdeel: `GK_TEST_ISOLATED=1 npm run perf:game` (handtest A).

## Bewijslog

- `GK_TEST_ISOLATED=1 ... --test tests/test-isolation.test.js` in detached wegwerpworktree op `8fd5ad1`: 4 tests, 4 geslaagd, 0 gefaald, 1595 ms.
- Eerste veilige `GK_TEST_ISOLATED=1 npm test` op `8fd5ad1`: 34 tests, 29 geslaagd, 5 gefaald. Regressies: drie compilerfixtures, foundation-migratiecount en dubbele datatypekleur. Baseline is niet groen; herstel hoort bij F1-E2-T01.
- `GK_TEST_ISOLATED=1 ... --test tests/backup-db.test.js`: 3 tests, 3 geslaagd, 0 gefaald, 263 ms.
- `GK_TEST_ISOLATED=1 ... --test tests/authority-position.test.js tests/mmo-service.test.js`: 3 tests, 3 geslaagd, 0 gefaald, 617 ms.
- `GK_TEST_ISOLATED=1 ... --test tests/security-actions.test.js`: 3 tests, 3 geslaagd, 0 gefaald, 148 ms.
- `GK_TEST_ISOLATED=1 ... --test tests/auth-hardening.test.js`: 3 tests, 3 geslaagd, 0 gefaald, 845 ms.
- `GK_TEST_ISOLATED=1 ... --test tests/http-ws-boundary.test.js tests/authority-position.test.js tests/auth-hardening.test.js`: 8 tests, 8 geslaagd, 0 gefaald, 1251 ms.
- `npm run check`: 69/69 JavaScriptbestanden syntactisch groen.
- `GK_TEST_ISOLATED=1 npm test`: 48 tests, 48 geslaagd, 0 gefaald, 3971 ms.
- `GK_TEST_ISOLATED=1 ... --test tests/migrations.test.js`: 3 tests, 3 geslaagd, 0 gefaald, 504 ms; echte set leverde 12 gevalideerde pre-migrationbackups.
- `GK_TEST_ISOLATED=1 ... --test tests/backup-restore.test.js tests/backup-db.test.js`: 5 tests, 5 geslaagd, 0 gefaald, 496 ms; restoreproof: integrity `ok`, tellingen `{editor_nodes:1, player_positions:2, player_profiles:2, users:2}`, published hash `sha256:published`, 1 asset.
- `GK_TEST_ISOLATED=1 npm run perf:server`: ruwe `baseline-server.json` en `.csv`; DB totaal 1.536.576 bytes; write p95 positie 0,080 ms, receipt 0,117 ms, publish 0,154 ms; tick p95 1 speler 0,008 ms / 2 spelers 0,001 ms; eventloop p99 10,445 ms. Dit is een lokale microbaseline, geen CCU-claim.
- Eindcontrole (Claude) op code-SHA `2ec122d`: `npm run check` 72/72 ok; `GK_TEST_ISOLATED=1 npm test` 53 tests, 53 geslaagd, 0 gefaald, 5649 ms. Ruwe uitvoer: `eindcontrole-unit-2ec122d.txt`. Geen van de unittests start een server.

## Sessie 2 — Claude, 2026-10-23 (vervolg na Codex-sessiegrens)

- Codex stopte om 21:23 tijdens de eindcontrole; al het werk zat in commits t/m `2ec122d` en de werkboom was schoon.
- Kevins vier README-wijzigingen (zie boven) zijn om 21:37 teruggedraaid, 14 minuten na de laatste Codex-actie; het Codex-log bevat geen commando dat dit deed. `README/README.md` was inhoudelijk gelijk aan `README/fases/README.md` (alleen verplaatst); opnieuw doen kan met `git mv`.
- Live-risico: `gk-real-node-editor.service` (systemd, `Restart=always`) draait uit deze werkmap met `NODE_ENV=production`. `.env` heeft `COOKIE_SECURE` niet op `true` en geen `ALLOWED_ORIGINS`. Bij een herstart op deze branch weigert de server te starten; via het duckdns-domein zouden login en WebSocket 403 geven. Niet zelf aangepast (productieconfig); instructie in `docs/server/f1-handtest.md` stap 0. Het draaiende proces (sinds 21 okt) gebruikt nog de oude servercode.
- Eerste herstart op deze branch tegen de live DB: geverifieerde backup in `storage/migration-backups/` plus nieuwe tabel `migration_checksums`; geen SQL-migraties pending. Aanvullend en terug te draaien.
- Smoke uitgebreid met HTTP-probes naar `/.env`, `/.git/config`, `/storage/…` en `/assets/..%2f.env` (verwacht 403/404).
- Smoke, browsercheck en perf:game niet door de agent gedraaid (CLAUDE.md: geen eigen servers). Commando's in handtest A.

## Exitcriteria (stand 2026-10-23)

| # | Criterium | Status | Reden |
| --- | --- | --- | --- |
| 1 | `npm test` + `npm run smoke` groen op tijdelijke opslag | deels | test 53/53 groen; smoke niet gedraaid |
| 2 | Zes negatieve integratietests | niet getoetst | alle zes staan in smoke (unitvarianten groen); smoke niet gedraaid |
| 3 | Restore naar lege map: integrity, tellingen, published hash | geslaagd | `backup-restore.test.js` in eindcontrole; alleen fixtures |
| 4 | Twee echte accounts; Kevin bevestigt beweging, aanval, quest | niet getoetst | vereist browserrun en Kevin |
| 5 | Volledige nulmeting | deels | serverdeel gemeten; browser/resolutie/frametime `not_measured` |
| 6 | Menselijke review; Kevin heeft zelf getest | niet getoetst | wacht op Kevin |

Fase 01 is **niet voltooid**.

## Sessie 3 — Claude, 2026-10-23 (Kevin: "alles ombouwen", smoke + browsertest als blijvende basis)

- Kevins README-verplaatsing teruggezet en apart gecommit (`394f2ab`, pure renames); v2.3-link in de verplaatste index hersteld (`ab8c537`). De fase-index staat nu op `README/README.md`.
- `.env`-lek in testmodus gedicht: geïsoleerde servers laden de `.env` van de checkout niet meer (`7a569cd`).
- Productfixes gevonden door smoke: `/%FF` → 400 (`4e41448`), uniek `entityId` bij tweede drop (`12f5181`), validator ziet World Assembly-chunkloading en zone-minimaps, legacy-schaduwvlag alleen bij echte overrides, geen `minimap.editor` in /game/ (`7ee335f`).
- Smoke omgebouwd naar de NODE-01/02-route (`a038d44`): **`GK_TEST_ISOLATED=1 npm run smoke` groen, 945 checks**, ruwe uitvoer `smoke-a038d44.txt`. Alle F1-security-negatives draaien en slagen tegen het echte serverproces.
- Bekend productgat (buiten F1): `zone_environment_settings` wordt gepubliceerd maar de client tekent achtergrond/mist nog uit `world.world.*` (standaardwaarden in de nieuwe route).
- Werkomgeving: de editor-TypeScript-server groeit tot ~1,3 GB; vóór elke test-run gestopt (`pkill -f 'typescript/lib/tsserve[r]'`), de editor start hem zelf opnieuw.
- Volgende: browsertest (`scripts/game-browser-check.js`) ombouwen tot blijvende basis, `perf:game`, README-afspraak testonderhoud.

## Eindstand — 2026-10-24, code-SHA `7ba2ec0`

Ruwe uitvoer: `eindcontrole-unit-7ba2ec0.txt`, `smoke-7ba2ec0.txt`, `browser-check-7ba2ec0.txt` + `browser-7ba2ec0/`, `perf-game-7ba2ec0.txt` + `baseline-browser-7ba2ec0.json`. (De reeks op `43ff980` is onder zware belasting gedraaid en de perf-run daarvan brak af bij een sessie-einde; bewaard als geschiedenis.)

- Browsertest en `perf:game` omgebouwd naar de NODE-01/02-route via de gedeelde module `scripts/lib/test-world.js`; testafspraak in `README/TESTEN.md`.
- Smoke dekt nu ook servereigen zone-reis via Zone Link (F1-E1-T01), 973 checks.

| # | Exitcriterium | Status | Bewijs / reden |
| --- | --- | --- | --- |
| 1 | `npm test` + `npm run smoke` groen op tijdelijke opslag | Geslaagd | unit 54/54, check 73/73, smoke 973 checks groen |
| 2 | Negatieve integratietest voor teleport, stop-resync, debuggrant, dubbele command-ID, fout-URL, verkeerde WS-Origin | Geslaagd | alle zes (plus 70 KiB → 1009, CSRF, verkeerde Origin, geheime paden) slagen in smoke tegen het echte serverproces |
| 3 | Restore naar lege map: integrity, tellingen, published hash | Geslaagd | `backup-restore.test.js` (fixtures); restore op eigen data is optioneel voor Kevin (handtest §3) |
| 4 | Twee echte accounts zien elkaar; Kevin bevestigt beweging, aanval, quest | Deels | automatisch: A en B zien elkaar binnen 2 s (941 ms) met screenshots en eventlog; Kevins eigen bevestiging in zijn wereld staat open |
| 5 | Nulmeting compleet | Deels | server: `baseline-server.json/.csv`; browser: Chrome 148 headless, 1366×768, frametime gemiddeld 240 ms / p95 283 ms op SwiftShader (niet representatief); echte GPU-meting door Kevin |
| 6 | Menselijke review; Kevin heeft zelf getest | Niet getoetst | wacht op Kevin |

Kaarten: alle kaarten zijn code-matig af. Nog open: F1-E2-T03 Apache-probe (de agent-sandbox weigerde die) en een off-site backuplocatie (Kevins keuze); F1-E3-T01/T02 de Kevin-handtest en de GPU-meting.

Bekende open bevinding (buiten F1): flikkeren aan de rand van het camera-venster bij heen-en-weer lopen (2 browserchecks, zie `README/TESTEN.md`).

**Fase 01 is niet voltooid:** alleen nog Kevin-acties (handtest, review, Apache-probe, off-site locatie, GPU-meting).

## Sessie 5 — Claude, 2026-10-24 (Kevin-handtest video 1 en 2)

Bevindingen van Kevin: haperen/lage FPS op zijn laptop, portal geeft "te ver weg" terwijl je erop staat, medespeler laat zichtbaar, korte klik bij het karakter laat het heen en weer lopen.

Oorzaken en fixes:

- **Medespeler laat / portal (video 1)**: de client nam in stilstand de laatste serverpositie niet over. Opgelost in `f7ce14d`.
- **Heen en weer na korte klik, portal "te ver weg" (video 2)**: bij aankomst (klikpunt of portalbereik) stuurde de client direct een stop. De server loopt iets achter en stopte daardoor te vroeg, waarna de client terugschoof. Nu stuurt de client zijn stopplek als laatste looppunt (`settle`) en de stop pas later als vangnet. Een actie op afstand start pas 0,4 binnen het bereik, omdat de server een looppunt binnen 0,15 als bereikt telt. Hetzelfde geldt bij het loslaten van toetsen of muis.
- **`settle` op de server**: telt voor de besturing als stop. Een ander apparaat van hetzelfde account neemt er nooit de besturing mee over (browsercheck "laatste actieve controller blijft op device B").
- **Spelers zonder ingestelde gezondheid** (max 0) golden in de client als verslagen, waardoor alle beweging bevroor zodra er node03-targets waren.
- **FPS**: profiel op een kopie van Kevins wereld (`npm run perf:world-copy`; alleen wereldtabellen en assets, geen accounts of spelergegevens). Grootste JavaScript-kost was de minimap:
  - Lopen markeerde hem elk frame als gewijzigd, waardoor hij elk frame volledig opnieuw werd getekend.
  - De markercategorieën werden per marker opnieuw genormaliseerd.
  - Elke HUD-herschikking dwong een extra tekenbeurt af.
  - Na de fix: minimap-JS −62% (1,42 s → 0,54 s per 12,5 s lopen), gemiddelde beweegstap 30–48 ms → 8–19 ms op deze server.
- **Niet meetbaar op deze server**: GPU-tijd. De software-renderer kopieert elk frame terug (`ReadPixels` tot 600 ms). Kevins wereld rendert in de game op volledige schermresolutie tot 2× (`pixelRatioCap: 2`); op een laptop met hoge-resolutiescherm is `pixelRatioCap` 1 een flinke winst. Dat is een wereldinstelling voor Kevin. `maxFps: 30` wordt door de runtime niet gebruikt.

Browsercheck: alle nieuwe checks groen (korte klik, portal aanklikken en reizen, lostpointercapture, takeover); alleen de bekende flikker-check is rood.

## Sessie 6 — Claude, 2026-10-24 (Kevin-handtest video 3: "er gaat nog te veel fout")

Bevindingen van Kevin:
- iedereen vliegt overal heen en komt te laat of te vroeg aan;
- na een portalreis schiet je terug, en de medespeler verschijnt raar bij de tweede portal;
- een klik op een portal laat je een meter vooruitschieten in plaats van ernaartoe te lopen;
- de FPS is slecht.

Werkwijze: een nieuwe meet-test `npm run feel:world-copy` draait op een kopie van Kevins wereld (alleen wereldtabellen en assets) met twee nep-spelers. Hij legt per frame de lokale positie, de serverpositie, de zone en de medespeler vast.

Gevonden oorzaken en fixes:

**Lokale speler**
- De client stapte per frame, de server per tick van 33 ms. `resolveMovement` glijdt per as langs obstakels, dus ze liepen om obstakels een andere route en de server liep langzamer. Bovendien raakte de client bij frames boven 0,25 s tijd kwijt. Nu rekent de client in dezelfde vaste stapjes als de server, zonder tijdverlies (tot 1 s).
- Een klik schoot voorbij het doel bij een trage frame en liep dan terug. Nu is de stap begrensd tot de resterende afstand, en de aankomst gebruikt dezelfde regel als de server (0,15).
- Een harde stop bij meer dan 3 eenheden verschil liet de server te vroeg stoppen, waarna de client terugsprong. Nu loopt de server altijd naar het stoppunt (`settle`), tot 15 eenheden.
- De server stopt zelf als een looppunt 6 ticks lang geen voortgang geeft (obstakel). De tijdgebonden vangnet-stops van de client zijn weg.
- Correcties in stilstand duurden bij lage fps vele seconden, omdat de runtime-blend met een delta van maximaal 50 ms rekende. Ze rekenen nu in echte tijd, zijn binnen ongeveer 120 ms klaar en springen nooit meer in één frame.

**Portals**
- Aankomst lag in het middelpunt van een solid doelportal, dus in het botsobject en binnen het bereik van de terugportal. Een klik naast je karakter stuurde je direct terug. Nu kom je naast de portal uit, buiten dat bereik en niet in een ander obstakel (`portalArrivalPointFor`, unittest).

**Medespelers**
- Je eigen speler kon via "joined"/"state_changed" als naamloze medespeler verschijnen (spookkopie met speler-id in de video). Dat wordt nu centraal uitgesloten.
- Spelers in een andere zone worden verborgen.
- Na een zonewissel verschijnen stilstaande spelers in de nieuwe zone direct, uit het laatst bewaarde bericht.

**FPS**
- De wereld is licht: 72 draw calls en 24.000 driehoeken op het startpunt.
- Kevins frametijd van 33 ms (vast 30 fps) wijst op net te traag voor 60 Hz: de GPU, of Chrome zonder hardwareversnelling.
- Het prestatie-HUD toont nu de GPU-tijd (`EXT_disjoint_timer_query_webgl2`), de render-CPU-tijd met draw calls, en een rode waarschuwing bij software-rendering.
- Automatische resolutie verlaagt de pixelratio (tot `pixelRatioMin`) alleen als frames traag zijn en de GPU de rem is.
- Twee gamevensters naast elkaar op één laptop delen dezelfde GPU.

**Server**
- Ticktijden zijn zichtbaar in `/api/game/player` (`serverPerf`).

Meting op de wereldkopie (headless, ~4 fps), vóór → na:

| Geval | Vóór | Na |
| --- | --- | --- |
| Korte en lange klikken | tot 11 terugbewegingen, drift 2,5 | 0 terugbewegingen, drift 0, client-server ≤ 0,15 |
| Portal | geen reis (server bleef achter) | reis vanaf de portalrand, 0 verschuiving na aankomst |
| Zonegrens | — | 1 zonewissel, 1 herbouw |

**Zonegrens te voet**
- De client herbouwde de hele wereld ook als alleen de targets (node03) nog op de oude zone stonden. Zolang die achterliepen, gebeurde dat telkens opnieuw: witte flitsen en haperingen. Nu worden dan alleen de targets herladen, en blijft het bij 1 herbouw per oversteek.
- Bij die herbouw blijft de speler op zijn voorspelde plek en wordt progressief opgebouwd.

Bekend en nog open: die ene herbouw geeft nog een hapering (op deze server zonder GPU ongeveer 1,3 s; de progressieve opbouw scheelt weinig). De runtime ziet een andere zone als een andere wereld; dat lichter maken raakt de chunk-streaming (zie Fase 8.5) en is een apart stuk werk.

Ruwe uitvoer: `feel-world-copy-voor.txt` (eerste meting) en `feel-world-copy-na.txt` (eindmeting), `browser-check-video3.txt`, `smoke-video3.txt`.

## Sessie 7 — Claude, 2026-10-24 avond (Kevin: "server niet echt realtime", kaas, debug-knoppen)

**Kaas twee keer gepakt.** Dit is geen duplicatie. "Chees" is een grondstof met `respawn_policy.visual.object` (ongeveer 10 s). Volgens `gameplay_events` zat er steeds minstens 10,4 s tussen twee keer verzamelen; een actie draait in één `BEGIN IMMEDIATE`-transactie. Wel was de wereld niet realtime: andere spelers pollen node03 elke 2,5 s. Nu broadcast de server na attack/gather/pickup/reset een `node03:entities_changed` en verversen clients direct (smoke-check).

**Debug-knoppen.** Dit werkt zoals bedoeld sinds Fase 01: alleen een admin met `DEV_GAME_ACTIONS=1`. De node03-snapshot meldt nu `debugActionsAllowed`. Zonder die toestemming zijn de knoppen uitgeschakeld met uitleg, en is de Reset-knop in Targets verborgen. Er zijn smoke-checks voor een speler (false) en een admin met vlag (true).

**Medespeler loopt achter.**
- Kevins wereld gebruikt preset "smooth_mmo": 220 ms interpolatie, 20 snapshots/s.
- Gemeten op de wereldkopie met de nieuwe vertragingsmeting (headless, beide pagina's op 4 fps, dus veel ruis): smooth 595–840 ms, "fast" 315–660 ms. Op papier scheelt "fast" ruim 100 ms (interpolatie 220 → 130 ms, snapshots 50 → 40 ms, tick 33 → 20 ms). Met "fast" bleven klikken, toetsen, portals en de zonegrens foutloos (vier runs).
- Advies aan Kevin: preset "5 Fast" in de editor. Dat is zijn instelling, niet aangepast.

**Nog twee bewegingsfouten gevonden en gerepareerd**
- **Na loslaten van een toets** schoof het karakter heen en weer. De client rekende alleen per frame, dus de tijd tussen het laatste frame en het loslaten telde niet mee, en de server liep een stukje voorbij. Daarna volgde de client in stilstand die doorschietende server. Nu rekent de client de beweging door tot het moment van indrukken en loslaten. In stilstand corrigeert hij pas als de server zelf stilstaat.
- **Lopen met ingedrukte muis tijdens een wereld-herbouw:** de server liep de laatste richting blind door terwijl de client stilstond (tot 18 eenheden), met daarna een sprong. Nu stopt de server lopen op richting als er 750 ms geen input komt (dodemansknop). De client stuurt tijdens het lopen elke ~33 ms. Lopen naar een klik- of stoppunt valt daar niet onder.

Tests sessie 7: unit 60/60, smoke 976 groen (`smoke-realtime.txt`), browsercheck 233 ok met alleen de twee bekende flikker-checks rood (`browser-check-realtime.txt`), meting met "fast" (`feel-world-copy-fast.txt`).

## Sessie 8 — Claude, 2026-10-24 avond (Kevin: inloggen duurt minuten, "MMO verbinden mislukt")

Oorzaken en fixes staan uitgebreid in `docs/server/apache-gk.md`.

**Server (live, met Kevins akkoord)**
- Apache stond op prefork met `MaxRequestWorkers 10`; elke WebSocket en keep-alive hield een proces vast. Overgezet naar `mpm_event` (256 workers) met php-fpm voor phpMyAdmin en mc-node.
- De gk-vhost krijgt `retry=0` (geen 60 s 503 na een Node-herstart), `ttl=4` (geen "connection reset" op hergebruikte verbindingen) en JSON-compressie (snapshot 1,9 MB → 226 KB).

**Node**
- `keepAliveTimeout` 65 s.
- ETag/304 voor statische bestanden; code op `no-cache` in plaats van `no-store`.

**Client**
- Een WebSocket-poging die na 4 s nog niet open is, wordt opnieuw gedaan. Voorheen bleef zo'n poging hangen, met minutenlang "waiting_for_socket".
- Geen volledige sessie-herlaad (2 MB) meer bij elke vensterwissel. Vandaag gaf dat ~16.000 snapshot-aanvragen, ~2 per seconde tijdens de handtest.

**Tests**
- Browsercheck bewaakt nu de inlogtijd: 1,4–1,6 s gemeten.
- Smoke controleert ETag/304: 978 checks groen.
- Browsercheck 235 ok; alleen de bekende flikker-checks zijn rood.

## Sessie 9 — Claude, 2026-10-24 laat (Kevin: rubberband en vastlopen tegen bomen bij het bos)

Kevins video (21:16): je loopt langs de bosgrens naar de portal, en bij stilstaan spring je terug naar (511,3; 83,6), een plek waar je nooit was. Twee oorzaken:

1. **Andere obstakels.** De client botste alleen tegen obstakels in actieve render-chunks (residentiebudget), de server tegen alle 112 (ook scatter-bomen met "items blokkeren speler"). Nu gebruiken beide dezelfde lijst (`solidCollisionEntriesForWorld`, verhuisd naar `world-runtime.js`), los van wat er getekend wordt.
2. **De server sneed bochten af.** Met alleen richting of klikdoel liep de server een rechte lijn vanaf zijn eigen (achterlopende) positie. Bij de punt van de bosgrens bleef hij hangen, en bij stilstaan werd de speler daarheen teruggezet. Nu is er **padvolgen** (aanvulling op ADR-003): de client stuurt bij elke beweging zijn positie als tussenpunt, en de server loopt die punten af (normale snelheid, botsingen; een onbereikbaar punt wordt overgeslagen). Daarbij:
   - Bij stoppen gaat er altijd een stoppunt mee (de oude grens van 15 eenheden is weg).
   - Tegen een obstakel geldt ook een stoppunt.
   - Bij een overname door een ander apparaat wordt de rij geleegd.

Meting op de wereldkopie, bosroute: de server week eerst tot **3,77** af van de gelopen route, met padvolgen **0,25**. Na het stoppen 0,04. Kevins exacte route uit de video, nagespeeld met de serverbotsingen: de server komt aan op (529,0; 64,0). Unit: `tests/path-follow.test.js` (5 tests), totaal 65/65. Smoke groen op de padvolgcode.

De laatste volledige browser/smoke-herhaling is op Kevins verzoek gestopt nadat hij het live had getest en goedgekeurd.

**Kevin, 2026-10-24: "ik heb het al goed gekeurd, het is goed, hij heeft er op het moment geen last meer van."** Daarmee zijn exitcriterium 4 (Kevin bevestigt het spelen met twee accounts) en 6 (Kevins handtest en review) door Kevin goedgekeurd.

Nog open voor de volledige Fase 01-lijst (Kevins keuze om af te ronden of uit te stellen):
- F1-E2-T03 Apache-probe;
- off-site backuplocatie;
- GPU-frametime op Kevins laptop (het prestatie-HUD toont nu GPU-tijd).

## Afronding open punten — 2026-10-24

- **F1-E2-T03 Apache-probe: geslaagd.** Alle 15 geheime paden (`.env`, `.git`, `storage/…sqlite`, broncode, `node_modules`, traversal-varianten) geven via de echte Apache-config 403 of 404. Bewijs: `apache-probe-2026-10-24.txt`.
- **Off-site backup: geregeld (Kevin).** De back-ups gaan via ssh naar Kevins NAS thuis.
- **GPU-meting: Kevin accepteert de GPU-regel** in het prestatie-HUD als meetinstrument. Een concrete meetwaarde van zijn laptop staat nog niet in dit verslag.

## Eindstand — Fase 01 VOLTOOID (2026-10-24)

Kevin heeft na zijn handtests met twee accounts akkoord gegeven en de laatste meting aangeleverd.

| # | Exitcriterium | Status | Bewijs |
| --- | --- | --- | --- |
| 1 | `npm test` + `npm run smoke` groen op tijdelijke opslag | Geslaagd | unit 65/65; smoke groen (`smoke-login.txt` 978 checks, `smoke-padvolgen.txt`) |
| 2 | Negatieve integratietests (teleport, stop-resync, debuggrant, dubbele command-ID, fout-URL, verkeerde WS-Origin) | Geslaagd | alle zes in smoke tegen het echte serverproces |
| 3 | Restore naar lege map: integrity, tellingen, published hash | Geslaagd | `backup-restore.test.js`; off-site via ssh naar Kevins NAS; Apache-probe `apache-probe-2026-10-24.txt` |
| 4 | Twee echte accounts; Kevin bevestigt het spelen | Geslaagd | Kevins handtests (video's) en akkoord 2026-10-24 |
| 5 | Nulmeting compleet | Geslaagd | server: `baseline-server.*`; browser: `baseline-browser-7ba2ec0.json` (SwiftShader); echte GPU (Kevins laptop): 59/60 fps, frame 17,1 ms, GPU 6,9 ms (pixelratio 0,75), render 6,0 ms, 65 draw calls (`gpu-meting-laptop-2026-10-24.png`) |
| 6 | Menselijke review; Kevin heeft zelf getest | Geslaagd | Kevin: "ik heb het al goed gekeurd, het is goed" |

Ook afgerond:
- **Login-infrastructuur:** Apache event-MPM met php-fpm (`docs/server/apache-gk.md`).
- **`.git`:** afgeschermd op alle sites.

**Bekend en bewust doorgeschoven (buiten Fase 01)**

| Punt | Toelichting / planning |
| --- | --- |
| Flikkeren aan de rand van het camera-venster | 2 browserchecks rood; een streamingkeuze voor Kevin |
| Korte hapering bij een zonegrens te voet | F4-E2-T02: streaming zonder full rebuild |
| Wereldbeschrijving en medespelers worden in hun geheel gestuurd | F2-E2-T03 (AOI), F4-E2-T01 (Cell-fragmenten) |
