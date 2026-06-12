# Fase 14 - Quest systeem, story, side quests en party sharing

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

NPCs kunnen quests geven, party sharing werkt, progressie blijft bewaard en side quests worden via nodes gemaakt.

Questdoelen mogen later verwijzen naar world/zone/entity candidates die via Fase 8.1/Fase 9 zijn ontstaan, maar questnamen, teksten, objectives en rewards blijven GameBible/editor/Kevin-data. Procedural generation mag geen questcontent verzinnen.

## Verplichte afhankelijkheden

- Fase 8 entity/component core.
- Fase 8.1 procedural generation core voor eventuele generated placement/path/zone candidates.
- Fase 9 world/zone/minimap nodes.
- Fase 13 NPC/task/dialog basis wanneer quest-NPCs nodig zijn.

## Wat Kevin vooraf moet maken, kiezen of samen uitwerken

- Kies naam eerste quest.
- Kies minimaal 1 side quest idee.
- Kies quest stappen.
- Kies party sharing gedrag.
- Kies quest tracker UI/audio.
- Kies of accepteer eventuele generated zone/entity/path candidates die questdoelen mogen gebruiken.

## Actie voor Codex

Draai quest/party migraties en test met twee game accounts.

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
- Concrete waardes moeten uit node-data, Game Bible, asset register, procedural draft output die door editor/publish is geaccepteerd, of editor input komen.
- Runtimecode mag geen concrete NPC, quest, prijs, camera, licht, boss, item, route, generated placement of minimap-instelling hard-coded bevatten.
- Procedural generation mag geen questtekst, questnamen, rewards of objectives verzinnen.

Je werkt aan fase 14: Quest systeem, story, side quests en party sharing.

Doel:
NPCs kunnen quests geven, party sharing werkt, progressie blijft bewaard en side quests worden via nodes gemaakt.

Werk uit:
Maak quest nodes, dialog quest effects, quest state, party state, quest tracker HUD, quest audio events en server validation. Geen quest tekst verzinnen buiten Game Bible. Questdoelen mogen verwijzen naar geaccepteerde world/entity candidates, maar de questinhoud blijft expliciete data.

Verplichte controle:
- Run build/typecheck/tests die beschikbaar zijn.
- Als server/database nodig is, noteer exact wat Codex moet doen.
- Update current-phase.md alleen als de fase echt klaar is.
- Commit met een duidelijke message in zo weinig mogelijk commits.
```

## Acceptatiechecklist

- [ ] Quest accept.
- [ ] Progress blijft na refresh.
- [ ] Party share.
- [ ] Side quest mogelijk.
- [ ] Quest audio/HUD via nodes.
- [ ] Procedural candidates kunnen alleen als gekozen target/input dienen, niet als questcontentbron.

## Testplan

Speler A accepteert quest, deelt met B, objective progress sync, side quest test. Controleer dat alle questtekst en rewards uit GameBible/editor-data komen en dat generated zone/entity references alleen geaccepteerde node-data zijn.
