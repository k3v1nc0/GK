# Opdracht voor de CLI: Fase 03 controleren op de server

Kopieer alles hieronder als prompt voor Claude CLI (of Codex) in de GK-map op de server.

---

Je werkt in de GK-repo op `main` (geen branches, geen PR's). Lees eerst `CLAUDE.md`,
`README/fases/MMORPG-basis-v2/FASE-03-canonieke-authoring-en-builds.md` en
`README/fases/evidence/MMORPG-v2/F3/VOORTGANG.md`. De commit "Fase 03" bevat de canonieke werkbank, commands,
immutable builds, releasepointer, rollback, verhuizen uit Nodes en de koppeling met de game. Jouw taak is alleen
het deel dat een echte server en browser nodig heeft. Bouw geen nieuwe features.

Regels:
- Kevins server draait alleen op `localhost:3001` / `127.0.0.1:3001`. Geïsoleerde testscripts (`GK_TEST_ISOLATED=1`) starten zelf een tijdelijke server; dat mag.
- Zuinig: elke stap één keer. Is een stap rood, stop, zoek de oorzaak, repareer de code (niet de test) en draai alleen die stap opnieuw.
- Schrijf ruwe uitvoer en screenshots naar `README/fases/evidence/MMORPG-v2/F3/` en werk `VOORTGANG.md` bij. Vraag Kevin akkoord voor elke commit.

## Stap 0 - Basis groen (geïsoleerd)
1. `GK_TEST_ISOLATED=1 npm test` en `npm run check`.
   In de cloud zijn alleen 8 testbestanden gedraaid (27/27). `tests/migrations.test.js` verwacht nu 14 migraties.
2. `GK_TEST_ISOLATED=1 npm run smoke`. Het F3-stuk staat na "queststatus is exact gelijk na serverrestart" en het verhuisstuk vlak voor "SMOKE TEST GESLAAGD".
   Dekt: werkbank-toegang, CSRF, commands, stale 409, mislukte publish laat pointer staan, client/server-scheiding, pickup exact eenmaal,
   rollback met If-Match, inventory en graph onaangeroerd, verhuisrapport, finalize met graphrevisie, Nodes alleen-lezen na verhuizen.
3. `GK_TEST_ISOLATED=1 npm run game:browser-check`.
   Nieuw: "F3 werkbank" (admin maakt in `/editor/canoniek.html` projectnaam, item en pickup via de knoppen, publiceert, A en B zien dezelfde pickup,
   A pakt hem, B niet, open tab meldt nieuwe inhoud, tweede build, rollback via de knop) en "F3 werkbank: 3D-weergave" (laadt de wereld, klik op de grond plaatst een pickup).
   Screenshots `f3-*.png` in de evidence-map.

## Stap 1 - Herstart op :3001
1. `git pull`, daarna een backup: `sh scripts/run-node24.sh scripts/backup-db.js`. Migraties 012 en 013 maken alleen nieuwe tabellen.
2. Herstart de service op :3001 en controleer in de log dat 012 en 013 zijn toegepast.
3. Maak nog een backup en controleer dat de manifest `builds` en `canonicalRelease` bevat.

## Stap 2 - Verhuisrapport op de echte inhoud (schrijft niets)
1. Als admin: `/editor/canoniek.html` -> Publiceren -> "Bekijk verhuisrapport". Of `GET /api/authoring/cutover` met admin-cookie.
2. Bewaar het als `cutover-rapport-<datum>.json`. Noteer per domein: GO/NO-GO, aantal vergeleken objecten, afwijkingen, blokkerend.
3. NIET finalizen op :3001. Dat beslist Kevin zelf, na het rapport en met een verse backup.
   Wil Kevin het eerst zien: kopieer de DB naar een geïsoleerde testmap en finalize daar (project, items, item-pickups), publiceer, en kijk of de game gelijk blijft.

## Stap 3 - Rollback-proef op :3001
1. In de werkbank: projectnaam "GK F3-test", publiceer. Wijzig de naam, publiceer opnieuw.
2. Publiceren -> vorige build -> "Terugzetten naar deze build", reden "Rollback-proef". Meet de tijd tot `GET /api/authoring/active` de oude build geeft (moet < 5 min, verwacht < 1 s) en tot de game na verversen de oude naam toont.
3. Controleer: auditregel van/naar build en reden; inventory van een testaccount ongewijzigd; `server.json` geeft 404.
4. Zet daarna terug naar de nieuwste build (of laat Kevin kiezen).

## Stap 4 - Kevins handtest
Kevin volgt "Zo test je het" in `VOORTGANG.md` met 2 browsers (2 accounts) en neemt een korte video op:
werkbank -> item + pickup (2D en 3D) -> publiceren -> beide spelers zien de pickup -> één pakt hem -> rollback.
Leg zijn akkoord vast in `VOORTGANG.md`.

## Rapport
Per stap GO/NO-GO met één regel bewijs. Bekende grenzen (geen bugs): de server wisselt na publish/rollback meteen voor iedereen,
geld-pickups en `pickup_component` blijven in Nodes, geen "terug naar Nodes" behalve via backup.
