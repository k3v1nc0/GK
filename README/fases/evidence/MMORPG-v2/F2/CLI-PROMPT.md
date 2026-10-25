# Opdracht voor de CLI: Fase 02 afmaken op de server

Kopieer alles hieronder als prompt voor Claude CLI (of Codex) in de GK-map op de server.

---

Je werkt in de GK-repo op `main` (geen branches, geen PR's). Lees eerst `CLAUDE.md`, `README/TESTEN.md`,
`README/fases/MMORPG-basis-v2/FASE-02-speelbare-verticale-slice.md` en `README/fases/evidence/MMORPG-v2/F2/VOORTGANG.md`.
De commit "Fase 02" heeft alle serverbouwstenen die zonder draaiende server te maken waren al gebouwd en
unitgetest. Jouw taak is het deel dat een echte server, browser of Kevins wereld nodig heeft.

Regels:
- Alleen `localhost:3001` / `127.0.0.1:3001` voor Kevins eigen server. Geïsoleerde testscripts (`GK_TEST_ISOLATED=1`) mogen hun eigen tijdelijke server starten, zoals in Fase 01.
- Nooit tegen de live DB testen. Botproeven altijd geïsoleerd, tenzij Kevin `--base` expliciet goedkeurt.
- Zuinig: draai een zware run (browsercheck, bots 30 min) pas als de lichte runs groen zijn, en niet dubbel.
- Werk VOORTGANG.md (F2) bij met ruwe uitvoer in `README/fases/evidence/MMORPG-v2/F2/`. Vraag Kevin akkoord voor elke commit.

## Stap 0 - Basis groen
1. `GK_TEST_ISOLATED=1 npm test` en `npm run check`.
2. `GK_TEST_ISOLATED=1 npm run smoke`. De movementkernel is uit `world-runtime.js` gehaald en posities worden nu op een eigen timer (1 s) weggeschreven in plaats van debounce. Als smoke daardoor rood is: oorzaak vinden en de code repareren, de test niet afzwakken.
3. `GK_TEST_ISOLATED=1 npm run game:browser-check`. Alleen de twee bekende flikker-checks mogen rood zijn.

## Stap A - Golden path zichtbaar (belangrijkste stap)
1. Breid `scripts/lib/test-world.js` uit met een fixture via de normale authoringroute (geen directe DB-writes, geen hardcoded content-ID's uit Kevins wereld): een zone met een vijand plus loot table, een pickup, en een quest "versla de vijand, lever in". Gebruik de node-types die `apply-node03-desert-demo.js` en `apply-node04-campaign-quest-slice.js` gebruiken, als voorbeeld.
2. Smoke: speler A valt aan tot de kill, loot komt in de inventory, de quest gaat naar klaar, turn-in geeft de beloning. Daarna:
   - dezelfde operationId opnieuw: `idempotent: true`, geen tweede grant;
   - A en B tegelijk de laatste klap: een grant;
   - `damage`/`x`/`itemId` meesturen bij attack: 400 `CLIENT_AUTHORITY_FIELD`;
   - zelfde operationId door B: 409 `OPERATION_OTHER_PLAYER`.
3. Herstart de geïsoleerde server midden in de smoke en controleer dat inventory, XP en queststatus exact gelijk zijn.
4. Browsercheck: twee pagina's zien dezelfde vijand-HP, A doodt hem, beide zien hem verdwijnen; na twee refreshes is alles gelijk. Screenshots in de evidence-map.
5. HUD (F2-E3-T03): compacte health/target/loot/quest-regel in de bestaande stijl in `apps/web/public/game/game.js`, zonder hardcoded content.

## Stap B - Protocol v1 in de client (F2-E2-T01)
1. Smoke: `POST /api/game/join-ticket` + `/ws/game` met subprotocol `gk-mmo-v1`; zonder ticket of na 5 s geen `auth_ok` (close 4401/4410); `gk-mmo-v2` -> 4406; verkeerde Origin -> 403; >64 KiB -> 1009; een ticket is maar een keer bruikbaar.
2. Zet `game.js` om naar `/ws/game` (ticket ophalen, `auth` als eerste bericht, bij `auth_ok` verder zoals nu). Laat `/api/game/live` werken voor oude tabs.
3. Browsercheck groen.

## Stap C - Prediction en reconcile (F2-E2-T02)
1. Nieuw `apps/web/public/game/netcode.js`: inputseq-buffer, alleen eigen beweging voorspellen, reconcile op `lastProcessedInputSeq` met replay via `movement-kernel.js`, remote interpolatie met begrensde buffer. Padvolgen (pathPoint/settle) en de vaste stapjes uit Fase 01 sessie 6-9 moeten blijven werken.
2. Netwerkproef in de browsercheck (CDP `Network.emulateNetworkConditions`, 150 ms + 5% verlies): na stabiel netwerk <= 0,2 m binnen 2 s. Daarna `feel:world-copy` (alleen met Kevins toestemming).

## Stap D - AOI aanzetten (F2-E2-T03)
1. Draai de browsercheck met `GAME_AOI_ENABLED=1`. De client moet een speler buiten de AOI verbergen (despawn) en weer tonen bij terugkomst.
2. Pas als dat groen is: zet AOI standaard aan (vlag omdraaien) en documenteer het.

## Stap E - Bots en meting (F2-E2-T04, F2-E2-T05, F2-E3-T03)
1. `GK_TEST_ISOLATED=1 npm run perf:db-writes`: dat is een ladder van 1, 10 en 25 bots, elk 2 min. Leg in VOORTGANG vast of de DB-writes binnen het budget blijven. Zo ja: geen DB-worker. Zo nee: meten wat het probleem is en Kevin laten kiezen.
2. `GK_TEST_ISOLATED=1 node scripts/load-bots.js --users=25 --minutes=30`. Bewaar het JSON-rapport. Bij NO-GO stopt de fase tot er een gemeten correctie is.
3. Crashproef: kill het geïsoleerde serverproces (SIGKILL) tijdens de bots. Na herstart zijn er 0 geackte rewards kwijt en is de positie hooguit 5 s oud (vergelijk de laatste `serverPerf.positions` met de DB).

## Stap F - Kevin
1. Laat Kevin de commit pullen en de live service herstarten. Migratie 011 draait dan met een automatische backup.
2. Kevin speelt met twee accounts op `:3001`: kill, loot, quest, twee refreshes, een herstart, en alles is gelijk. Kevin neemt dat op video op.
3. Werk de exitcriteria in VOORTGANG.md bij. Zet de fase pas op voltooid na Kevins akkoord.

Open besluiten voor Kevin (niet zelf beslissen): de tick (vast 20 Hz of de preset houden), het flikkeren aan de camerarand (oplossen of als bekend markeren), en de referentiehost voor de botproef.
