# Phase Title Comparison

## Source refs

- Original roadmap basis: `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` (`Fases en GameBible`).
- Current main snapshot archived here: `9c75fa648b48516943bb4763e2271753b60d829f` (`fase 15`).
- Original files found: `README/fase1.md` through `README/fase18.md` all found in the same original commit.
- Current files found: `README/current-phase.md` and `README/fase1.md` through `README/fase18.md` all found on main. `README/fase12.1.md` also exists on main and is archived as an extra current subphase file.

| Fase | Originele titel | Originele commit | Huidige titel | Huidige main status | Verschil |
|---|---|---|---|---|---|
| 1 | Fase 1 - Game Bible, content gates en maaklijst | `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` | Fase 1 - Game Bible, content gates en maaklijst | Huidige statusdocs zeggen Fase 1 t/m 14 afgerond. | Geen titel-drift. |
| 2 | Fase 2 - Serverfundering onder /var/www/gk | `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` | Fase 2 - Serverfundering onder /var/www/gk | Huidige statusdocs zeggen Fase 1 t/m 14 afgerond. | Geen titel-drift. |
| 3 | Fase 3 - Repo-skelet en modulaire file werkwijze | `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` | Fase 3 - Repo-skelet en modulaire file werkwijze | Huidige statusdocs zeggen Fase 1 t/m 14 afgerond. | Geen titel-drift. |
| 4 | Fase 4 - Database, migraties, editor-login en game-login | `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` | Fase 4 - Database, migraties, editor-login en game-login | Huidige statusdocs zeggen Fase 1 t/m 14 afgerond. | Geen titel-drift. |
| 5 | Fase 5 - Editor-shell, node-canvas, panels en game-user beheer | `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` | Fase 5 - Editor-shell, node-canvas, panels en game-user beheer | Huidige statusdocs zeggen Fase 1 t/m 14 afgerond. | Geen titel-drift. |
| 6 | Fase 6 - Node graph core met typed sockets, dropdowns en undo/redo | `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` | Fase 6 - Node graph core met typed sockets, dropdowns en undo/redo | Afgerond volgens huidig fasebestand. | Titel gelijk; huidige bestand bevat afgeronde server-side status. |
| 7 | Fase 7 - Auto asset/audio library uit jouw assets-map | `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` | Fase 7 - Auto asset/audio library uit jouw assets-map | Afgerond volgens huidig fasebestand. | Titel gelijk; GLB role mapping is strakker als candidate-only vastgelegd. |
| 8 | Fase 8 - Universal entity/component systeem voor GLB objecten en NPCs | `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` | Fase 8 - Universal entity/component systeem voor GLB objecten en NPCs | Afgerond volgens huidig fasebestand. | Titel gelijk; current roadmap voegde later Fase 8.1 procedural generation toe als extra tussenfase. |
| 9 | Fase 9 - World, camera, lighting, levels/zones en minimap nodes | `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` | Fase 9 - World, camera, lighting, levels/zones en minimap nodes | Afgerond volgens huidig fasebestand. | Titel gelijk; current roadmap integreert Fase 8.1 generated references. |
| 10 | Fase 10 - Runtime 3D client met camera, audio, minimap en HUD host | `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` | Fase 10 - Publish Flow Core | Afgerond volgens huidig fasebestand. | Grote drift: oude runtime/gameplay clientfase is vervangen door technische publish-flow foundation. |
| 11 | Fase 11 - Publish pipeline en runtime projections | `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` | Fase 11 - Runtime Projection Core | Afgerond volgens huidig fasebestand. | Drift/opsplitsing: publish pipeline schoof naar Fase 10; Fase 11 werd runtime projection contractlaag. |
| 12 | Fase 12 - Realtime MMO rooms, presence en player sync | `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` | Fase 12 - Runtime Client Shell Core | Afgerond volgens huidig fasebestand. | Grote drift: realtime MMO/player sync vervangen door runtime shell foundation. |
| 12.1 | Niet aanwezig in originele 18-fasenroadmap | n.v.t. | Fase 12.1 - Game Web Service Deployment Core | Afgerond volgens huidig fasebestand. | Extra technische subfase toegevoegd voor vaste game-web service deployment. |
| 13 | Fase 13 - NPC brain, taken, paden, geluiden, groepen en schedules | `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` | Fase 13 - Runtime Render Surface Core | Afgerond volgens huidig fasebestand. | Grote drift: NPC gameplayfase vervangen door render-surface foundation. |
| 14 | Fase 14 - Quest systeem, story, side quests en party sharing | `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` | Fase 14 - Projection-driven Scene Assembly Core | Afgerond volgens huidig fasebestand. | Grote drift: quest/story/party fase vervangen door scene-plan metadata foundation. |
| 15 | Fase 15 - Economy, levels, money, merchants, inventory en scrolls | `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` | Fase 15 - Runtime Asset Reference Planning Core | Geopend; Git-basis klaar; server-side klaar: nee volgens current-phase. | Grote drift: economy/inventory/scrolls vervangen door asset-reference planning metadata. |
| 16 | Fase 16 - Combat, attacks, eindbaas mechanics en loot | `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` | Fase 16 - Combat, attacks, eindbaas mechanics en loot | Niet geopend volgens current-phase. | Titel grotendeels gelijk, maar dependencies verwijzen naar gameplayfases 13-15 die huidig technisch zijn ingevuld. |
| 17 | Fase 17 - Complete beginquest met side quest en eindbaas | `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` | Fase 17 - Complete beginquest met side quest en eindbaas | Niet geopend volgens current-phase. | Titel grotendeels gelijk, maar prerequisites zijn door phase drift niet meer dezelfde als de originele roadmap. |
| 18 | Fase 18 - Polijst, performance, deploy en eindacceptatie | `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` | Fase 18 - Polijst, performance, deploy en eindacceptatie | Niet geopend volgens current-phase. | Titel grotendeels gelijk, maar eindacceptatie hangt nu af van herplanning van de ontbrekende gameplay/contentfases. |
