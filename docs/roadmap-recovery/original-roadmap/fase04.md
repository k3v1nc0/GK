---
source_path: README/fase4.md
source_commit: 2a9a6077510237e8dfc5c638d0ca996b67a5fa05
source_title: Fase 4 - Database, migraties, editor-login en game-login
archived_for: roadmap recovery / deep research
---

# Fase 4 - Database, migraties, editor-login en game-login


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

Maak databasefundering met gescheiden editor-login, game-login, game users, player profiles en characters.

## Wat Kevin vooraf moet maken, kiezen of samen uitwerken

- Eerste editor admin e-mail kiezen.
- Bepaal registratie ja/nee.
- Bepaal accountregels.

## Actie voor Codex

Maak MySQL database/users, zet admin seed secret buiten Git en draai migraties.

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


Je werkt aan fase 4: Database, migraties, editor-login en game-login.

Doel:
Maak databasefundering met gescheiden editor-login, game-login, game users, player profiles en characters.

Werk uit:
Maak migraties voor editor users, game users, sessions, roles, player profiles, characters, audit. Maak auth API routes en editor game-user beheer. Test dat scopes gescheiden zijn.

Verplichte controle:
- Run build/typecheck/tests die beschikbaar zijn.
- Als server/database nodig is, noteer exact wat Codex moet doen.
- Update current-phase.md alleen als de fase echt klaar is.
- Commit met een duidelijke message in zo weinig mogelijk commits.
```

## Acceptatiechecklist

- [ ] Editor login werkt.
- [ ] Game login werkt.
- [ ] Game-user beheer werkt.
- [ ] Kruistoegang faalt.

## Testplan

Test editor login, game login, kruistoegang en game-user status wijzigen.
