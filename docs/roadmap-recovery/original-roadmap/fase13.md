---
source_path: README/fase13.md
source_commit: 2a9a6077510237e8dfc5c638d0ca996b67a5fa05
source_title: Fase 13 - NPC brain, taken, paden, geluiden, groepen en schedules
archived_for: roadmap recovery / deep research
---

# Fase 13 - NPC brain, taken, paden, geluiden, groepen en schedules


## Vaste regels voor deze fase

- Dit is een 100% nieuw project.
- Alles draait eerst op 1 eigen server onder `/var/www/gk`.
- GK Code Copiloot werkt alleen op `main`.
- GK Code Copiloot maakt geen branches en geen pull requests.
- GK Code Copiloot gebruikt zo min mogelijk commits: standaard 1 commit per fase, maximaal 2 als het echt nodig is.
- Codex doet serverwerk buiten Git: OS, MySQL, Redis, Nginx, systemd, secrets, rechten, builds, runtime checks en lokale scans.
- Concrete gamecontent hoort niet in runtimecode.
- Alles wat jij maakt, speelt of instelt loopt via Database > Editor/Node-system > Publish > Runtime Game.
- De code mag alleen engine-capabilities bevatten: schemas, node types, validators, renderer/audio/protocol primitives en vaste socket types.
- Waardes zoals camera, licht, geld, prijzen, levels, NPC routes, NPC taken, dialogen, quests, minimap lagen, audio en HUD instellingen moeten node-data zijn.
- 3D wereldobjecten gebruiken jouw eigen bestaande of door jou gemaakte `.glb` assets.
- UI plaatjes en audio mogen in de assetbibliotheek, maar worden ook via nodes gekozen en ingesteld.
- De AI mag geen dummy assets, nepmodellen, tijdelijke vervangers, definitieve namen of definitieve verhaalcontent verzinnen.
- Als verplichte Kevin-input mist, stopt de fase met een duidelijke lijst ontbrekende items.
- Maak geen losse backupbestanden, geen tijdelijke markdown-dumps en geen extra README-bestanden die niet blijvend onderhouden worden.

## Doel van de fase

NPCs worden via nodes gemaakt uit GLB assets, krijgen taken, routes, geluiden, werkplekken, groepen, spawn timings en schema’s.

## Wat Kevin vooraf moet maken, kiezen of samen uitwerken

- Kies questgiver GLB, friendly NPC GLB en merchant GLB.
- Kies NPC namen/testzinnen.
- Kies NPC taakgeluiden en ambient audio.
- Kies routes/werkplekken/spawngebieden.
- Kies respawn timings.

## Actie voor Codex

Start world service en monitor NPC ticks en audio events.

## Prompt voor GK Code Copiloot

```text
Git-regels:
- Werk alleen op main.
- Maak geen branches.
- Maak geen pull request.
- Gebruik zo min mogelijk commits: standaard 1 commit voor deze fase, maximaal 2 als het echt nodig is.
- Commit pas na de beschikbare checks.

Inhoudsregels:
- Voeg geen dummy assets toe.
- Verzin geen definitieve gamecontent.
- Als Kevin-input mist, stop en rapporteer exact wat mist.
- Concrete waardes moeten uit node-data, Game Bible, asset register of editor input komen.
- Runtimecode mag geen concrete NPC, quest, prijs, camera, licht, boss, item, route of minimap-instelling hard-coded bevatten.


Je werkt aan fase 13: NPC brain, taken, paden, geluiden, groepen en schedules.

Doel:
NPCs worden via nodes gemaakt uit GLB assets, krijgen taken, routes, geluiden, werkplekken, groepen, spawn timings en schema’s.

Werk uit:
Maak npc.task, npc.path, npc.schedule, npc.groupSpawn, npc.populationTable, npc.audio en dialog nodes. NPC state server-owned en synced naar alle spelers. NPC geluiden komen uit audio asset catalog.

Verplichte controle:
- Run build/typecheck/tests die beschikbaar zijn.
- Als server/database nodig is, noteer exact wat Codex moet doen.
- Update current-phase.md alleen als de fase echt klaar is.
- Commit met een duidelijke message in zo weinig mogelijk commits.
```

## Acceptatiechecklist

- [ ] NPC loopt route.
- [ ] NPC heeft taak.
- [ ] NPC maakt taakgeluid.
- [ ] NPC groep spawnt met timing.
- [ ] Dialogen werken.
- [ ] Twee spelers zien dezelfde NPC state.

## Testplan

Maak NPC met werktaak en geluid, NPC groep in wild met respawn, test met twee clients.
