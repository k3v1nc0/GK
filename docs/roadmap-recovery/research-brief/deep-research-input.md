# GK Roadmap Recovery - Deep Research Input

## Projectdoel

Eerste speelbare versie van GK maken, op eigen server, met editor/node-system/publish/runtime flow.

De architectuurregel blijft:

```text
Database > Editor/Node-system > Publish > Runtime Game
```

Concrete gamecontent hoort niet hardcoded in runtimecode. Concrete waarden moeten via editor/node-data, GameBible, registers of Kevin-input lopen.

## Originele planning

Originele roadmap basis: commit `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` (`Fases en GameBible`).

| Fase | Titel | Doel | Soort fase | Kevin-input vereist |
|---|---|---|---|---|
| 1 | Game Bible, content gates en maaklijst | Levende projectdocumenten voor verhaal, assets, UI, audio, world/camera/lighting/minimap/economy/levels/boss/quest keuzes. | foundation | ja |
| 2 | Serverfundering onder /var/www/gk | Single-server omgeving voorbereiden met repo, assets, data, releases, secrets, logs, MySQL, Redis, Nginx en systemd. | foundation / deploy | ja |
| 3 | Repo-skelet en modulaire file werkwijze | Workspace en apps/packages structuur maken. | foundation | beperkt |
| 4 | Database, migraties, editor-login en game-login | Databasefundering, editor-login, game-login, users/profiles/characters. | foundation / editor-tooling | ja |
| 5 | Editor-shell, node-canvas, panels en game-user beheer | Editor werkplek met node canvas, inspector, panels, lege world/view en game-user beheer. | editor/tooling | ja |
| 6 | Node graph core met typed sockets, dropdowns en undo/redo | Geometry-node-achtig graph core met typed sockets, fields, validators, undo/redo en draft preview. | editor/tooling | ja |
| 7 | Auto asset/audio library uit jouw assets-map | Asset-worker en editor bibliotheek voor GLB, UI en audio assets. | editor/tooling | ja |
| 8 | Universal entity/component systeem voor GLB objecten en NPCs | Component-gedreven entities zodat GLB assets via nodes object/NPC/enemy/boss/loot/VFX/player appearance kunnen worden. | foundation / editor-tooling | ja |
| 9 | World, camera, lighting, levels/zones en minimap nodes | World settings volledig node-driven maken. | editor/tooling / runtime config | ja |
| 10 | Runtime 3D client met camera, audio, minimap en HUD host | Speler kan inloggen, 3D runtime openen, bewegen, camera/audio/minimap/HUD gebruiken uit published node-data. | runtime | ja |
| 11 | Publish pipeline en runtime projections | Save/publish scheiden; node-data compileren naar runtime projections voor game, editor-preview en rollback. | foundation / runtime | ja |
| 12 | Realtime MMO rooms, presence en player sync | Meerdere spelers zien elkaar, movement/camera state/party markers/minimap presence syncen server-owned. | runtime / gameplay system | ja |
| 13 | NPC brain, taken, paden, geluiden, groepen en schedules | NPCs via nodes uit GLB assets, met taken, routes, geluiden, werkplekken, groepen en schedules. | gameplay system | ja |
| 14 | Quest systeem, story, side quests en party sharing | NPC quest giving, party sharing, persisted progression en side quests via nodes. | gameplay system / content | ja |
| 15 | Economy, levels, money, merchants, inventory en scrolls | Levels, XP, currency, merchant stock/prijzen, buy/sell, inventory, items, readable scrolls via nodes. | gameplay system | ja |
| 16 | Combat, attacks, eindbaas mechanics en loot | Server-owned combat, attacks, damage, cooldowns, VFX, audio, boss phases, loot tables en quest combat objectives via nodes. | gameplay system | ja |
| 17 | Complete beginquest met side quest en eindbaas | Eerste volledige speelbare content via nodes: startgebied, NPCs, dialogen, quests, merchant, boss, loot, afronding. | content/vertical slice | ja |
| 18 | Polijst, performance, deploy en eindacceptatie | Complete game stabiliseren, performance/load/backup/restore/deploy testen; eerste versie echt speelbaar. | polish/deploy | ja |

## Huidige uitvoering

Current main snapshot voor dit archief: `9c75fa648b48516943bb4763e2271753b60d829f` (`fase 15`).

Volgens huidige docs:

- Fase 1 t/m Fase 14 zijn afgerond.
- Fase 12 Runtime Client Shell Core is server-side groen bevestigd via commit `61792b7e6b923add68fdebd80f673dfdd86210ff` (`fix: verify phase 12 runtime client shell core`).
- Fase 12.1 Game Web Service Deployment Core is server-side groen bevestigd op Git HEAD `70808b7ac2aa50671fbf4369ef1158a5e5f13736` (`fase 12.1 definitieve Node 22 game-shell`).
- Fase 13 Runtime Render Surface Core is server-side groen bevestigd via commit `192645f7c33dfc6f800f566784794f6e1111310a` (`fix: verify phase 13 runtime render surface core`).
- Fase 14 Projection-driven Scene Assembly Core is server-side groen bevestigd via commit `1b583b7f769690c3f7e7a98c41b4dd1937853519` (`fase 14 fix`).
- Fase 15 Runtime Asset Reference Planning Core is gestart op main via commit `9c75fa648b48516943bb4763e2271753b60d829f` (`fase 15`).
- Fase 15 server-side verificatie staat volgens `README/current-phase.md` nog open.
- Fase 16 is volgens current-phase nog niet geopend of geimplementeerd.

Belangrijke huidige technische lagen:

- Fase 10 Publish Flow Core.
- Fase 11 Runtime Projection Core.
- Fase 12 Runtime Client Shell Core.
- Fase 12.1 Game Web Service Deployment Core.
- Fase 13 Runtime Render Surface Core.
- Fase 14 Projection-driven Scene Assembly Core.
- Fase 15 Runtime Asset Reference Planning Core.

## Belangrijk verschil

Originele Fase 15 was:

- `Economy, levels, money, merchants, inventory en scrolls`.
- Kevin-input: currency naam/icoon, startgeld, item icons/prijzen, merchant stock, inventory UI, scroll background/tekst, level curve 1 t/m 5.
- Output: progression, currency, merchant, inventory, item en readable.scroll nodes; wallet/inventory server-side; scrolls uit UI assets en tekst uit data.

Huidige Fase 15 is:

- `Runtime Asset Reference Planning Core`.
- Output: metadata-only asset-reference planning, no asset loading, no final role mapping, no renderer, no gameplay.
- Server-side status: nog open volgens current-phase.

Daardoor is de roadmap gaan afwijken: dezelfde fase-nummers betekenen niet meer dezelfde inhoud. De technische lagen kunnen nuttig zijn, maar ze hebben gameplay/contentfases uit de oorspronkelijke planning vervangen of vooruitgeschoven.

## Te beantwoorden door Diepgaand onderzoek

Vraag Diepgaand onderzoek om:

1. Bepaal of we beter de originele 18-fasenroadmap herstellen of een nieuwe roadmap maken vanaf huidige main.
2. Behoud nuttige technische lagen zonder gameplayfases eindeloos uit te stellen.
3. Maak een realistische fasekaart tot speelbare eerste versie.
4. Zet per fase:
   - doel;
   - concrete output;
   - Kevin-input vooraf;
   - wat GK Code Copiloot doet;
   - wat Codex/Claude server-side doet;
   - acceptatiecriteria;
   - wat absoluut niet mag;
   - wanneer de fase klaar is.
5. Beperk het aantal resterende fases.
6. Zorg dat er een echte speelbare vertical slice komt, niet alleen contracts/docs.
7. Gebruik bestaande assets alleen via assetregister/nodes; geen dummy content verzinnen.
8. Respecteer:
   - geen hardcoded gamecontent in runtimecode;
   - concrete waarden via editor/node/GameBible/Kevin;
   - geen assets muteren/kopiëren zonder keuze;
   - geen secrets;
   - alles via Database > Editor/Node-system > Publish > Runtime Game.

## Open vragen voor Kevin

Ontbrekende Kevin-keuzes die nodig zijn voor echte gameplayfases:

- currency naam/icoon;
- startgeld;
- item icons/prijzen;
- merchant stock;
- inventory UI;
- scroll background/tekst;
- level curve;
- enemy/boss/loot GLB;
- attack icons/audio;
- boss health UI/music/audio;
- beginquest/sidequest/dialogen;
- accepted generated world/resource/path candidates.

## Bronnen in dit archief

- `docs/roadmap-recovery/original-roadmap/`: originele fasebestanden uit commit `2a9a6077510237e8dfc5c638d0ca996b67a5fa05`.
- `docs/roadmap-recovery/current-roadmap/`: huidige main-kopie van `README/current-phase.md`, `README/fase1.md` t/m `README/fase18.md`, plus `README/fase12.1.md` als extra current subphase.
- `docs/roadmap-recovery/evidence/phase-title-comparison.md`: tabel met originele en huidige titels/status.
- `docs/roadmap-recovery/evidence/phase-drift-notes.md`: neutrale driftanalyse.
