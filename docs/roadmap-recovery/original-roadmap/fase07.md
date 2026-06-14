---
source_path: README/fase7.md
source_commit: 2a9a6077510237e8dfc5c638d0ca996b67a5fa05
source_title: Fase 7 - Auto asset/audio library uit jouw assets-map
archived_for: roadmap recovery / deep research
---

# Fase 7 - Auto asset/audio library uit jouw assets-map


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

Bouw asset-worker en editor bibliotheek die jouw GLB, UI en audio assets automatisch scant, toont en bijwerkt.

## Wat Kevin vooraf moet maken, kiezen of samen uitwerken

- Zorg dat bestaande GLB assets in assets-map staan.
- Zorg voor minimaal 1 GLB voor player/character, 1 environment, 1 prop.
- Voeg eventueel eerste UI en audio testassets toe.

## Actie voor Codex

Run asset scan en rapporteer aantallen GLB, UI en audio. Controleer watcher/polling.

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


Je werkt aan fase 7: Auto asset/audio library uit jouw assets-map.

Doel:
Bouw asset-worker en editor bibliotheek die jouw GLB, UI en audio assets automatisch scant, toont en bijwerkt.

Werk uit:
Implementeer recursive scanner en watcher/polling. Registreer GLB, UI en audio metadata. Editor krijgt realtime asset updates. Elke GLB krijgt standaard object/NPC capabilities. Bouw capability editor en role mapping.

Verplichte controle:
- Run build/typecheck/tests die beschikbaar zijn.
- Als server/database nodig is, noteer exact wat Codex moet doen.
- Update current-phase.md alleen als de fase echt klaar is.
- Commit met een duidelijke message in zo weinig mogelijk commits.
```

## Acceptatiechecklist

- [ ] Nieuwe GLB verschijnt automatisch.
- [ ] Nieuwe UI asset verschijnt automatisch.
- [ ] Nieuwe audio asset verschijnt automatisch.
- [ ] Elke GLB kan object/NPC kandidaat.
- [ ] Geen assets in Git.

## Testplan

Plaats een GLB, UI image en audio file in assets; controleer dat editor ze zonder codewijziging ziet.
