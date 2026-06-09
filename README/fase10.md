# Fase 10 - Runtime 3D client met camera, audio, minimap en HUD host


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

Een speler kan inloggen, 3D runtime openen, bewegen, camera gebruiken, audio horen, minimap zien en HUD panels krijgen uit published node-data.

## Wat Kevin vooraf moet maken, kiezen of samen uitwerken

- Player GLB role gemapt.
- Ground/environment GLB gemapt.
- Camera/minimap/audio basiskeuzes uit fase 9 ingevuld.

## Actie voor Codex

Start API/game-web en controleer asset/audio endpoints.

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


Je werkt aan fase 10: Runtime 3D client met camera, audio, minimap en HUD host.

Doel:
Een speler kan inloggen, 3D runtime openen, bewegen, camera gebruiken, audio horen, minimap zien en HUD panels krijgen uit published node-data.

Werk uit:
Bouw game login, runtime bootstrap, GLB renderer, player movement, camera controller uit node-data, audio runtime, minimap runtime en dockable HUD host. Runtime leest alleen published data.

Verplichte controle:
- Run build/typecheck/tests die beschikbaar zijn.
- Als server/database nodig is, noteer exact wat Codex moet doen.
- Update current-phase.md alleen als de fase echt klaar is.
- Commit met een duidelijke message in zo weinig mogelijk commits.
```

## Acceptatiechecklist

- [ ] Game login.
- [ ] Player GLB laadt.
- [ ] Movement.
- [ ] Camera uit nodes.
- [ ] Audio uit nodes.
- [ ] Minimap uit nodes.
- [ ] HUD host.

## Testplan

Login, beweeg, camera zoom, audio volume, minimap markers en mobile viewport testen.
