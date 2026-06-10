# Fase 8 - Universal entity/component systeem voor GLB objecten en NPCs


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

Maak component-gedreven entities zodat dezelfde GLB via nodes object, NPC, enemy, boss, loot, VFX of player appearance kan worden.

## Wat Kevin vooraf moet maken, kiezen of samen uitwerken

- Kies 1 GLB als object test.
- Kies 1 GLB als NPC test.
- Bepaal validatieregel voor ontbrekende animaties.

## Actie voor Codex

Controleer asset catalog records en start editor/API.

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


Je werkt aan fase 8: Universal entity/component systeem voor GLB objecten en NPCs.

Doel:
Maak component-gedreven entities zodat dezelfde GLB via nodes object, NPC, enemy, boss, loot, VFX of player appearance kan worden.

Werk uit:
Implementeer components: renderable, transform, collider, interactable, npc_brain, audio_emitter, combatant, boss, loot, quest_target, merchant, player_appearance. Voeg entity.spawnFromAsset, entity.addComponent, entity.group, groupTransform en npc.makeFromAsset nodes toe.

Verplichte controle:
- Run build/typecheck/tests die beschikbaar zijn.
- Als server/database nodig is, noteer exact wat Codex moet doen.
- Update current-phase.md alleen als de fase echt klaar is.
- Commit met een duidelijke message in zo weinig mogelijk commits.
```

## Acceptatiechecklist

- [ ] Elke GLB kan object.
- [ ] Elke GLB kan NPC-kandidaat.
- [ ] Components via nodes.
- [ ] Group select/transform.
- [ ] Audio emitter component.

## Testplan

Gebruik dezelfde GLB als prop en als NPC-kandidaat, voeg audio emitter toe, test transform en group transform.
