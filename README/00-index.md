# Node-Driven MMO Bouwplan - Fasepakket V3

Dit pakket splitst het bouwplan in losse fasebestanden. Zet de map bijvoorbeeld hier neer:

```text
/var/www/gk/repo/docs/phase-plan/
```

## V3 afspraak

Alles wat de speler of editor straks inhoudelijk ziet of voelt, moet via nodes kunnen:

- GLB assets
- UI plaatjes
- audio en sfeer
- NPC taken
- NPC routes
- NPC groepen
- timings en schedules
- camera settings
- wereldbelichting
- minimap voor editor
- minimap voor game
- level/zone beheer
- player levels en XP
- geld, prijzen en merchants
- inventory en items
- aanvallen en boss mechanics
- quests en side quests
- HUD panels en docks

De code mag vaste engine-feiten bevatten, maar die moeten als node types, dropdowns, inputvelden, sockets, panelen en validators zichtbaar worden in de editor. De editor moet werken als een node-systeem met typed sockets, dropdowns, eigen velden en meerdere bolletjes/poorten per node.

## Belangrijke levende documenten

- `kevin-maaklijst.md`: wat Kevin per fase moet maken, kiezen of samen uitwerken.
- `node-system-super-dynamic-contract.md`: welke systemen via nodes moeten kunnen.
- `hard-facts-to-node-panels.md`: wat de code vast mag weten en hoe dit als panelen/nodes zichtbaar wordt.
- `current-phase.md`: welke fase nu actief is.

## Fasevolgorde

| Fase | Bestand | Hoofdresultaat |
|---:|---|---|
| 1 | `fase1.md` | Game Bible, content gates en maaklijst |
| 2 | `fase2.md` | Serverfundering onder `/var/www/gk` |
| 3 | `fase3.md` | Repo-skelet en modulaire file werkwijze |
| 4 | `fase4.md` | Database, migraties, editor-login en game-login |
| 5 | `fase5.md` | Editor-shell, node-canvas, panels en game-user beheer |
| 6 | `fase6.md` | Node graph core met typed sockets, dropdowns en undo/redo |
| 7 | `fase7.md` | Auto asset/audio library uit jouw assets-map |
| 8 | `fase8.md` | Universal entity/component systeem voor GLB objecten en NPCs |
| 9 | `fase9.md` | World, camera, lighting, levels/zones en minimap nodes |
| 10 | `fase10.md` | Runtime 3D client met camera, audio, minimap en HUD host |
| 11 | `fase11.md` | Publish pipeline en runtime projections |
| 12 | `fase12.md` | Realtime MMO rooms, presence en player sync |
| 13 | `fase13.md` | NPC brain, taken, paden, geluiden, groepen en schedules |
| 14 | `fase14.md` | Quest systeem, story, side quests en party sharing |
| 15 | `fase15.md` | Economy, levels, money, merchants, inventory en scrolls |
| 16 | `fase16.md` | Combat, attacks, eindbaas mechanics en loot |
| 17 | `fase17.md` | Complete beginquest met side quest en eindbaas |
| 18 | `fase18.md` | Polijst, performance, deploy en eindacceptatie |

## Werkwijze

Werk 1 fase tegelijk. Open eerst:

1. `current-phase.md`
2. `kevin-maaklijst.md`
3. het fasebestand
4. `node-system-super-dynamic-contract.md`
5. `hard-facts-to-node-panels.md`
