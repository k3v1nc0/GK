# Opdracht voor de CLI: Fase 05 (eerste stuk) controleren op de server

Kopieer alles hieronder als prompt voor Claude CLI (of Codex) in de GK-map op de server.

---

Je werkt in de GK-repo op `main` (geen branches, geen PR's). Lees eerst `CLAUDE.md`,
`README/fases/MMORPG-basis-v2/FASE-05-actors-en-combat-content.md` en `README/fases/evidence/MMORPG-v2/F5/VOORTGANG.md`.
De commit "Fase 05" bevat: tab Vijanden in de Werkbank (aanvallen, loot, grondstoffen, vijanden, plaatsen),
buildsectie `actors`, vijand-AI met looppaden (navtiles), aanvallen/loot/verzamelen via de bestaande NODE-03-actie,
migratie 015 en de weergave in de game. Jouw taak is alleen wat een echte server en browser nodig heeft.
Bouw geen nieuwe features. F4-fouten horen bij de F4-opdracht.

Regels:
- Kevins server draait alleen op `localhost:3001` / `127.0.0.1:3001`. Geïsoleerde testscripts (`GK_TEST_ISOLATED=1`) starten zelf een tijdelijke server; dat mag.
- Zuinig: elke stap één keer. Is een stap rood: stop, zoek de oorzaak, repareer de code (niet de test) en draai alleen die stap opnieuw.
- Schrijf ruwe uitvoer en screenshots naar `README/fases/evidence/MMORPG-v2/F5/` en werk `VOORTGANG.md` bij. Vraag Kevin akkoord voor elke commit.

## Stap 0 - Basis groen (geïsoleerd)
1. `GK_TEST_ISOLATED=1 npm test` en `npm run check`. Nieuw: `actors-f5`. `migrations` verwacht nu 15 migraties
   (014 bestaat niet; het gat in de nummering is bewust, de runner controleert alleen dubbele nummers).

## Stap 1 - Spikes op de echte data (alleen lezen)
1. `node scripts/spike-f5.js --cells=4` (opent de database read-only). Zet de uitvoer in `F5/spikes.txt`.
2. Noteer in `VOORTGANG.md`: welke modellen botten + animaties hebben (en de clipnamen), en per Cell de baktijd en of
   de hash twee keer gelijk is. Rood als een hash verschilt of een Cell > 50 ms kost (dan melden aan Kevin, zie ADR-011).

## Stap 2 - Migratie op een kopie
1. Maak een kopie van de productie-database, start daarop één keer geïsoleerd (bijv. `DATABASE_PATH=<kopie>` met
   `GK_TEST_ISOLATED=1`) en controleer: migratie 015 toegepast, backup gemaakt, `PRAGMA integrity_check` = ok,
   `authoring_cutover` heeft dezelfde rijen als ervoor. Raak de echte database niet aan.

## Stap 3 - Browsercheck F5 (geïsoleerd)
Voeg aan `scripts/game-browser-check.js` één stuk "F5 vijanden" toe, na het F4-stuk, en draai
`GK_TEST_ISOLATED=1 npm run game:browser-check` één keer:
1. Admin opent `/editor/canoniek.html`, tab Vijanden. Maak via de knoppen (selectors `data-cw="new-ability"`,
   `new-loot_table`, `new-actor_archetype`, velden `f-<veldnaam>`, `loot-add`/`loot-target`, `save-<kind>`): een aanval
   (schade 6, bereik 1,5 m, snelheid 1 s), een loottabel met het testitem (kans 100 %, 1-1) en een vijand
   (40 levenspunten, gedrag "valt aan", ziet je op 8 m, max. van huis 30 m, loopsnelheid 3 m/s). Klik "Proef":
   de tekst noemt slagen. Tab Plaatsen: kies de vijand en klik op de kaart vlak bij de testspawn (binnen een Region).
2. Publiceer. Speler A komt in de game binnen 8 m van de vijand: de vijand loopt naar A (positie in `actor:snapshot`
   verandert) en slaat (A's levenspunten dalen, melding "Je wordt geraakt"). Screenshot `f5-vijand-valt-aan.png`.
3. A klikt de vijand tot hij dood is: neervalanimatie, het testitem staat precies 1x in A's tas (een herhaald verzoek
   met dezelfde operationId geeft niets extra). Speler B die ook raakte krijgt zijn eigen loot. Screenshot `f5-loot.png`.
4. A rent > 30 m weg tijdens een gevecht: de vijand loopt terug naar zijn plek en heeft weer volle levenspunten.
5. Herstart de geïsoleerde server terwijl de vijand dood is: hij komt pas na de terugkomtijd terug (niet meteen).
6. Een Area met "Veilig gebied": daarin weigert de server een aanval ("veilig gebied") en laat de vijand A los.

## Stap 4 - Zuinige last (geïsoleerd)
1. Zet 20 vijanden op één Region (via de API of de werkbank) en draai `npm run bots` met 10 gebruikers, 3 minuten.
   Uit `/api/game/player` → `serverPerf.actors`: `avgStepMs`, `maxStepMs`, `pathBudgetHits`, en de tick-cijfers.
   Groen als de tick-p95 niet slechter is dan zonder vijanden + 2 ms en er geen errors in de log staan.

Meld aan het eind aan Kevin, in gewone taal: wat groen is, wat rood is (met de oorzaak) en wat hij zelf moet testen
(stap 3.2-3.4 met de hand: vijand plaatsen, publiceren, laten aanvallen, doden, loot zien).
