# Fase 05 - Voortgang (eerste stuk: vijanden, gevechten, loot, grondstoffen)

Gebouwd in de cloud op 25-10-2026, bovenop "Fase 04" (ec60ca4). F4 was op dat moment nog niet geaccepteerd
(CLI-serverproef en Kevins test liepen nog). F5 leunt op de F4-obstakels (colliders) en Regions/Areas.
Serverproef en browsertest: zie `CLI-PROMPT.md` in deze map.

## Wat Kevin kan zien en doen

1. **Werkbank → tab Vijanden** (`/editor/canoniek.html`):
   - *Aanvallen*: schade, schaal met aanvalskracht (%), pantserfactor (%), bereik (m), snelheid (s).
   - *Loot*: regels met item óf andere loottabel, kans (%), min/max. Knop "Proef: 100 keer rollen".
   - *Grondstoffen*: model, loottabel, verzamelbereik, straal, terugkomtijd.
   - *Vijanden*: model + animatienamen (keuzelijst uit het model), levenspunten, aanvalskracht, pantser, aanval,
     gedrag (valt aan / vecht alleen terug), ziet-je-afstand, max. afstand van huis, loopsnelheid, straal, loot, XP,
     terugkomtijd, geluiden. Knop "Proef: hoeveel slagen?" (rekent in de browser met de serverregel, schrijft niets).
   - *Plaatsen*: 2D-kaart met Regions en obstakels. Kies vijand/grondstof, klik in een Region. Klik op een stip:
     X/Z aanpassen, patrouille tekenen (2-16 punten), verwijderen.
2. **Projectinstellingen**: "Aanval van de speler" (leeg = de oude aanval, exact dezelfde schade als NODE-03).
3. **Items**: uitrustingsslot (uit de bestaande slots), extra aanvalskracht, extra pantser.
4. **Wereld → Area**: vinkje "Veilig gebied (geen gevechten)".
5. **Publiceren** zoals altijd. In de game: vijanden lopen (patrouille), zien je, lopen om obstakels heen naar je
   toe, slaan (je levensbalk zakt, melding "Je wordt geraakt"), laten je los en lopen terug als je te ver wegrent
   (en zijn dan weer heel). Klik = aanvallen; dood = neervalanimatie, loot in je tas, na de terugkomtijd een nieuwe.
   Grondstoffen: klik = verzamelen, daarna weg tot de terugkomtijd.

## Wat er technisch staat

| Kaart | Bestand(en) | Stand |
|---|---|---|
| F5-E1-T01 spikes | `scripts/spike-f5.js` (GLB-botten/clips + navtile-hash/tijd, alleen lezen) | gebouwd; draaien op de server = CLI stap 1 |
| F5-E1-T02 actor/spawn-kinds + compiler | `src/shared/authoring/kinds/{actor,combat,loot}.js`, `src/server/authoring/actor-compiler.js`, buildsectie `actors` (`gk-actors-1`) | klaar; zonder actor-documenten blijft een build bytegelijk |
| F5-E1-T03 navigatie + AI | `src/server/runtime/navigation.js` (ADR-011), `src/server/runtime/actor-runtime.js` | klaar; 10 Hz AI, slaapt zonder spelers binnen 80 m, padbudget |
| F5-E2-T01 rekenregels | `apps/web/public/shared/combat-math.js` | klaar; gehele getallen, 40.401 combinaties gelijk aan de oude formules |
| F5-E2-T02 hit-resolutie | `node03-runtime-service.js` (`attackActor`, `applyActorHit`) | klaar; plan → transactie → pas na COMMIT in het geheugen; replay verandert niets |
| F5-E2-T03 loot/grondstoffen | `combat-math.js` (`rollLoot`, seed = build+instance+speler), `gatherResource` | klaar; persoonlijke loot voor iedereen die meevocht, grondstof = eerste verzamelaar |
| F5-E2-T04 uitrusting | `equipItem` (actie `equip`), bonussen in gevechten, slotcontrole bij publish | server klaar; knop in de game-tas volgt (nu: automatisch in een leeg slot, of via de actie) |
| F5-E2-T05 claims/respawn | `db/migrations/015_actor_runtime_state.sql` | klaar; dood/op tot-tijd overleeft een herstart, UNIQUE claim per leven |
| F5-E3-T01 presentatie | `apps/web/public/game/actor-presentation.js`, `world-runtime.js` | klaar; vloeiend (150 ms vertraging), animaties idle/walk/attack/death, geen modelherlaad bij een treffer |
| F5-E3-T02 Actor Builder | `apps/web/public/editor/actor-builder-view.js` | klaar (zonder 3D-preview; "Proef" rekent in de browser) |

Kleine reparaties onderweg: mixers van runtime-targets lekten bij opnieuw opbouwen (nu opgeruimd);
een geraakte vijand laadde zijn model opnieuw bij elke treffer (nu alleen naambord/ring).

## Bewust nog niet (volgend stuk)

- Legacy-vijanden uit Nodes **verhuizen** naar Canoniek (domein `actors` staat al in de cutover-tabel; import + guard volgt).
  Tot dan draaien oude NODE-03-vijanden gewoon naast de nieuwe.
- Quests tellen canonieke kills nog niet mee (event heet `actor_defeated`, NODE-04 luistert naar `enemy_defeated`).
- Levende vijanden (positie, levenspunten) staan alleen in het geheugen; na een herstart staan ze weer heel op hun plek.
- "Uitrusten"-knop in de game-tas; schaduw-export naar `player_characters`.

## Tests (geïsoleerd, zonder server)

`tests/actors-f5.test.js`: 7 tests groen (rekenregels = legacy, loot-determinisme, kinds, compiler incl. fouten en
bytegelijk, AI aggro/aanval/terug naar huis, plan-zonder-schrijven + dood + respawn met nieuwe occurrence, navtile-hash + route om muur).
`tests/migrations.test.js` aangepast naar 15 migraties. `npm run check`: 120/120.
