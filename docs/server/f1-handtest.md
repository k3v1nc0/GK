# Fase 01 handtest

Voor Kevin. Alles staat op `main` (samengevoegd op 2026-10-24).

## Stand (2026-10-24)

- `.env` bevat `COOKIE_SECURE=true` en `ALLOWED_ORIGINS` (gecontroleerd op aanwezigheid, waarden niet bekeken).
- Geïsoleerde runs door Claude, met ruwe uitvoer in `README/fases/evidence/MMORPG-v2/F1/`:
  - unittests;
  - smoke (945 checks, inclusief alle Fase 01-securitynegatives tegen het echte serverproces);
  - browsertest (tweespelerscenario groen, met screenshots en eventlog);
  - `perf:game`.
- Wat alleen jij kunt: de live service herstarten, de zichtbare tweespelertest in je eigen wereld, de Apache-probe en optioneel een restore-oefening op je eigen data.

## Update 2026-10-24 (na je video's)

Gerepareerd: portal "te ver weg", heen en weer lopen na een korte klik, terugschuiven na loslaten, en de minimap die elk frame opnieuw tekende (grootste FPS-kostenpost in je wereld). Omdat ook de server is aangepast: herstart de service (stap 0) en ververs `/game/` met Ctrl+Shift+R.

Tip voor je laptop: zet in de editor bij de wereldprestaties (game) `pixelRatioCap` op 1. Nu rendert de game op een scherm met hoge resolutie tot 2× zoveel pixels in elke richting. Dat is jouw wereldinstelling; Claude heeft die niet aangepast.

## Update 2026-10-24 laat (inloggen)

Inloggen hing door Apache: maximaal 10 gelijktijdige verbindingen, en na een herstart 60 s lang 503. Apache is omgezet naar event-MPM met php-fpm; zie `docs/server/apache-gk.md`, inclusief terugdraaien. phpMyAdmin werkt via php-fpm. Herstart nog de game-service (stap 0) voor de Node-kant, en ververs met Ctrl+Shift+R. Inloggen hoort nu binnen een paar seconden klaar te zijn.

## Update 2026-10-24 avond (realtime, kaas, debug)

- **Medespeler loopt achter.** Je MMO-netwerkknoop staat op preset "7 Smooth MMO", waarbij de medespeler bewust 220 ms vertraagd wordt getoond, met 20 snapshots per seconde. Kies in de editor bij die knoop preset **"5 Fast"** (130 ms, 25 snapshots/s, servertick 50/s) en publiceer. Op papier scheelt dat ruim 100 ms. Op een kopie van je wereld bleef alles foutloos, en de achterstand was daar gemiddeld duidelijk lager (die meting schommelt flink, omdat de testbrowser maar 4 fps haalt).
- **Kaas.** Dat is de grondstof "Chees" met respawn-instelling `respawn_policy.visual.object` (ongeveer 10 s). Na 10 s ligt er een nieuwe kaas; vandaag zat er steeds minstens 10,4 s tussen twee keer verzamelen. Er is dus niets dubbel uitgegeven. Wil je dat hij langer wegblijft, verhoog dan de respawntijd van die policy in de editor. Nieuw: zodra iemand de kaas pakt, zien andere spelers hem direct verdwijnen (eerst pas na maximaal 2,5 s).
- **Debug-knoppen.** Sinds Fase 01 werken debug en reset alleen voor een admin-account én met `DEV_GAME_ACTIONS=1` op de server. Zonder die vlag zijn de knoppen nu uitgeschakeld (met uitleg), in plaats van een fout te geven. Aanzetten, alleen als je het wilt: zet in `/var/www/gk/.env` de regel `DEV_GAME_ACTIONS=1`, herstart de service (stap 0) en log in met je admin-account. test2/test3 blijven zonder debug, dat is bewust.

## Update 2026-10-24, video 3

Opgelost en gemeten op een kopie van je wereld:
- klikken zonder heen en weer;
- client en server op dezelfde plek;
- een portal aanklikken laat je er in één beweging naartoe lopen en reizen;
- na aankomst sta je naast de portal en niet erin (geen terugschieten meer);
- medespelers uit een andere zone verdwijnen;
- geen spookkopie van je eigen speler meer.

Herstart de service (stap 0) en ververs met Ctrl+Shift+R.

FPS: kijk in het prestatie-HUD naar de nieuwe regels:
- **GPU:** tijd per frame en resolutiefactor;
- **Render:** CPU-tijd en draw calls;
- **Let op:** een rode regel betekent dat Chrome geen hardwareversnelling gebruikt (`chrome://settings/system`).

Test bij voorkeur met één gamevenster per laptop. Twee vensters delen dezelfde videokaart.

## 0. Live service herstarten met de nieuwe code

    systemctl restart gk-real-node-editor
    systemctl status gk-real-node-editor --no-pager
    journalctl -u gk-real-node-editor -n 30 --no-pager

De eerste start met de nieuwe code maakt automatisch een geverifieerde backup (DB + assets, ca. 320 MB) in `storage/migration-backups/…-before-migration-checksum-baseline-…/` en voegt de tabel `migration_checksums` toe. Er draaien geen nieuwe SQL-migraties. Debugacties werken alleen nog voor een admin met `DEV_GAME_ACTIONS=1`.

**Terug naar de code van vóór Fase 01:** `git switch --detach 26f231e && systemctl restart gk-real-node-editor`. Weer terug naar de nieuwe code: `git switch main && systemctl restart gk-real-node-editor`. De extra tabel en de backupmap zijn onschadelijk voor de oude code.

## 1. Zichtbare tweespelertest (jij zelf)

1. Open twee gescheiden browserprofielen (bijvoorbeeld normaal + incognito) en log in met twee accounts. Maak zo nodig een tweede testaccount via `/login/`.
2. Open in beide `/game/`. Je ziet elkaars naam en avatar binnen 2 seconden.
3. Beweeg A; B ziet A lopen en daarna stilstaan. Loop A tegen een muur of collider: A gaat er niet doorheen.
4. Cheatpoging in de DevTools-console van A:

       const me = await (await fetch("/api/auth/me")).json();
       const r = await fetch("/api/game/player/position", { method: "PATCH", headers: { "Content-Type": "application/json", "X-GK-CSRF": me.csrfToken }, body: JSON.stringify({ position: { x: 9999, y: 0, z: 9999 } }) });
       console.log(r.status, await r.json());

   Verwacht: `400` met `code: "INPUT_REJECTED"`. A blijft in beide browsers op zijn plek.
5. Val met A een vijand aan en accepteer of voltooi een queststap (als je gepubliceerde wereld die heeft). Ververs beide pagina's: combat- en queststatus blijven gelijk.
6. Maak per browser een screenshot met beide avatars, plus één van de geweigerde cheat in de console.

## 2. Probe op de echte Apache-config

Deze probe kon Claude niet zelf draaien: de agent-sandbox weigerde het commando. Alleen statuscodes; de inhoud gaat naar `/dev/null`.

    E=README/fases/evidence/MMORPG-v2/F1
    for p in /.env /.git/config /storage/gk-real-node-editor.sqlite /README/../.env /assets/..%2f.env; do printf '%-42s %s\n' "$p" "$(curl -sk --path-as-is -o /dev/null -w '%{http_code}' --resolve gk-k3v1nc0.duckdns.org:443:127.0.0.1 "https://gk-k3v1nc0.duckdns.org$p")"; done | tee $E/apache-probes.txt

Verwacht: overal 403 of 404.

## 3. Restore-oefening op je eigen data (optioneel)

Dit leest je live DB alleen-lezen (SQLite online backup) en schrijft uitsluitend buiten de webroot:

    mkdir -p /root/gk-backups /root/gk-restore
    sh scripts/run-node24.sh scripts/backup-db.js --database storage/gk-real-node-editor.sqlite --assets assets --target /root/gk-backups/f1-$(date +%F) --source-sha $(git rev-parse HEAD)
    sh scripts/run-node24.sh scripts/restore-db.js --backup /root/gk-backups/f1-$(date +%F) --target /root/gk-restore/f1-$(date +%F)

Verwacht in de JSON-uitvoer: integrity `ok`, gelijke tellingen en dezelfde published hash. Verwijder beide mappen daarna zelf als je ze niet wilt bewaren.

## Automatische runs zelf herhalen

Zie `README/TESTEN.md`. Kort, één tegelijk:

    GK_TEST_ISOLATED=1 npm test
    GK_TEST_ISOLATED=1 npm run smoke
    GK_TEST_ISOLATED=1 GK_BROWSER_EVIDENCE_DIR=/tmp/gk-browser-evidence npm run game:browser-check
    GK_TEST_ISOLATED=1 PERF_GAME_RESULT_FILE=/tmp/gk-perf.json npm run perf:game

## Noteer

Commit-SHA, browser + versie + resolutie, datum, je naam als reviewer, resultaat per stap en de bestandsnamen van screenshots en logs. Let op: Apache serveert `README/` publiek. Zet in de evidencemap dus geen wachtwoorden, cookies of privégegevens.
