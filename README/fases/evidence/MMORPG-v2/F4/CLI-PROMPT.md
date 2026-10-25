# Opdracht voor de CLI: Fase 04 (eerste stuk) controleren op de server

Kopieer alles hieronder als prompt voor Claude CLI (of Codex) in de GK-map op de server.

---

Je werkt in de GK-repo op `main` (geen branches, geen PR's). Lees eerst `CLAUDE.md`,
`README/fases/MMORPG-basis-v2/FASE-04-wereld-en-playpreview.md` en `README/fases/evidence/MMORPG-v2/F4/VOORTGANG.md`.
De commit "Fase 04" bevat Regions/Areas in de Werkbank (tab Wereld), ruimteregels, Cells in de build, Region/Area per speler op de server
(`world:membership`), naam + muziek + minimaprand in de game, obstakels (colliders) voor server én prediction, en een 2D draft-preview. Jouw taak is alleen het deel dat een echte server en browser nodig heeft.
Bouw geen nieuwe features. F3-fouten horen bij de F3-opdracht, niet hier.

Regels:
- Kevins server draait alleen op `localhost:3001` / `127.0.0.1:3001`. Geïsoleerde testscripts (`GK_TEST_ISOLATED=1`) starten zelf een tijdelijke server; dat mag.
- Zuinig: elke stap één keer. Is een stap rood, stop, zoek de oorzaak, repareer de code (niet de test) en draai alleen die stap opnieuw.
- Schrijf ruwe uitvoer en screenshots naar `README/fases/evidence/MMORPG-v2/F4/` en werk `VOORTGANG.md` bij. Vraag Kevin akkoord voor elke commit.

## Stap 0 - Basis groen (geïsoleerd)
1. `GK_TEST_ISOLATED=1 npm test` en `npm run check`. Nieuw: `spatial-migration`, `world-commands`, `world-membership`, `world-audio-map`, `preview-isolation`, `walkable-collider`.

## Stap 1 - Schaal meten (F4-E1-T01)
1. Lees uit de gepubliceerde wereld (alleen lezen, geen writes) de spelerradius/-hoogte uit de movement-instellingen en de grenzen van twee zones.
2. Schrijf in `VOORTGANG.md` of 1 legacy-unit = 1 meter klopt (speler ~0,3-0,6 breed en ~1,6-2 hoog). Klopt het niet: stop en meld het aan Kevin; dan moet `LEGACY_UNITS_PER_METER` in `apps/web/public/shared/spatial.js` worden aangepast vóór verder testen.

## Stap 2 - Browsercheck F4 (geïsoleerd)
Voeg aan `scripts/game-browser-check.js` één stuk "F4 wereld" toe, na het F3-stuk, en draai `GK_TEST_ISOLATED=1 npm run game:browser-check` één keer:
1. Admin opent `/editor/canoniek.html`, tab Wereld. Teken via de knoppen (muis op het canvas) twee aangrenzende Regions (rechthoek naast rechthoek, gedeelde rand) op de plek waar de testspeler spawnt,
   en drie Areas: rechthoek, cirkel en polygoon. Ververs: de vormen, selectie en kaartbeeld staan er nog. Probeer een overlappende Region: melding, niets opgeslagen.
2. Publiceer via tab Publiceren. Speler A ververst de game: `#worldRegionLabel` toont de Region.
3. Loop A over de gedeelde rand (toetsen). Verwacht: label wisselt, banner "Je bent nu in ...", `state.debug.worldRebuilds` (of de teller die setWorld telt) is NIET gestegen, geen console-errors.
4. Zet één Area op een klein audio-asset (upload een korte .ogg of .mp3 in de test), publiceer, loop erin zonder eerst te klikken: label meldt "klik of druk een toets voor muziek" en er is geen crash (`data-audio="audio_locked"`). Na een klik: `data-audio="playing"`.
5. Obstakel: teken een **Obstakel: rechthoek** op het looppad van A, publiceer, ververs A en loop er recht op af. Verwacht: A stopt ervoor, geen rubberband
   (server en prediction gebruiken dezelfde blocker). Noteer de serverpositie (`state.position`) en de getoonde positie: verschil < 0,1 m.
6. Draft-preview: wijzig na het publiceren een Area (opslaan, niet publiceren), kies **Preview (draft)** en sleep de testspeler erin.
   `[data-cw=preview-where]` toont de gewijzigde Area; tel vóór en na de rijen in `player_positions`, `authoring_builds` en `authoring_release`: gelijk.
7. Screenshots `f4-wereld.png`, `f4-grens.png`, `f4-minimap.png`, `f4-obstakel.png`, `f4-preview.png`.

## Stap 3 - Op :3001
1. `git pull`, backup (`sh scripts/run-node24.sh scripts/backup-db.js`), herstart de server. Er zijn geen nieuwe migraties.
2. Open de Werkbank -> Wereld en controleer alleen dat de zones zichtbaar zijn en de lijst "Oude zones" klopt. Teken of publiceer hier NIETS: dat doet Kevin zelf.

## Stap 4 - Rapport voor Kevin
Kort in `VOORTGANG.md`: wat groen is, wat rood was en wat je gerepareerd hebt, plus de schaalmeting.
Kevin test daarna zelf: twee Regions + drie Areas tekenen, publiceren, over de grens lopen, muziek horen wisselen.
