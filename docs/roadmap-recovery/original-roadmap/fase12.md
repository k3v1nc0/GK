---
source_path: README/fase12.md
source_commit: 2a9a6077510237e8dfc5c638d0ca996b67a5fa05
source_title: Fase 12 - Realtime MMO rooms, presence en player sync
archived_for: roadmap recovery / deep research
---

# Fase 12 - Realtime MMO rooms, presence en player sync


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

Maak MMO realtime: meerdere spelers zien elkaar direct, movement, camera-relevante state, party markers en minimap presence syncen server-owned.

## Wat Kevin vooraf moet maken, kiezen of samen uitwerken

- Kies testlimiet.
- Kies naamlabels/party marker stijl.
- Kies minimap marker stijl voor spelers/party.

## Actie voor Codex

Configureer WebSocket via Nginx, start Redis/realtime/world services.

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


Je werkt aan fase 12: Realtime MMO rooms, presence en player sync.

Doel:
Maak MMO realtime: meerdere spelers zien elkaar direct, movement, camera-relevante state, party markers en minimap presence syncen server-owned.

Werk uit:
Maak net protocol, realtime gateway, room state, initial snapshot, movement deltas, interest management, reconnect en remote player rendering. Minimap markers krijgen realtime updates.

Verplichte controle:
- Run build/typecheck/tests die beschikbaar zijn.
- Als server/database nodig is, noteer exact wat Codex moet doen.
- Update current-phase.md alleen als de fase echt klaar is.
- Commit met een duidelijke message in zo weinig mogelijk commits.
```

## Acceptatiechecklist

- [ ] Twee spelers zien elkaar direct.
- [ ] Movement sync.
- [ ] Reconnect.
- [ ] Party/minimap markers syncen.
- [ ] Server-owned presence.

## Testplan

Open twee accounts, join room, beweeg allebei, kijk naar world en minimap, refresh/reconnect.
