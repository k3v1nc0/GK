# Fase 17 - Complete beginquest met side quest en eindbaas

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

Maak de eerste volledige speelbare content via nodes: startgebied, camera/light/audio/minimap, NPCs, dialogen, main quest, side quest, merchant, boss, loot en afronding.

Fase 17 mag Fase 8.1/Fase 9 generated world candidates gebruiken als editor/node-data basis, maar complete content mag pas worden geseed wanneer GameBible JSON, registers en Kevin/editor-input voldoende concrete data geven.

## Verplichte afhankelijkheden

- Fase 8 entity/component core.
- Fase 8.1 procedural generation core.
- Fase 9 world/camera/lighting/minimap nodes.
- Fase 11 publish pipeline.
- Fase 12 realtime MMO state.
- Fase 13 NPC/task/dialog basis.
- Fase 14 quest/party basis.
- Fase 15 economy/inventory basis.
- Fase 16 combat/boss/loot basis.

## Wat Kevin vooraf moet maken, kiezen of samen uitwerken

- Game Bible compleet.
- Alle namen definitief.
- Dialogen definitief.
- Beginquest en side quest definitief.
- Currency/merchant/levels ingevuld.
- Alle required GLB/UI/audio roles gemapt.
- Generated zones, spawn areas, paths, resources en placements uit Fase 8.1/Fase 9 expliciet geaccepteerd of vervangen door editor-data.

## Actie voor Codex

Run asset scan, start alle services, draai content seed alleen als Game Bible compleet is en alle required generated/editor candidates expliciet geaccepteerd zijn.

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
- Procedural generation mag geen beginquestcontent, bosscontent, economywaarden, NPC namen, dialogen of questtekst verzinnen.

Je werkt aan fase 17: Complete beginquest met side quest en eindbaas.

Doel:
Maak de eerste volledige speelbare content via nodes: startgebied, camera/light/audio/minimap, NPCs, dialogen, main quest, side quest, merchant, boss, loot en afronding.

Werk uit:
Maak node-content seed uit Game Bible, geaccepteerde procedural/world draft data en asset/audio/UI registers. Als content ontbreekt, stop. Flow: spawn, NPC, quest accept/share, NPC taak/audio, objective, merchant optioneel, minions, boss gate, boss fight, loot, complete, side quest.

Verplichte controle:
- Run build/typecheck/tests die beschikbaar zijn.
- Als server/database nodig is, noteer exact wat Codex moet doen.
- Update current-phase.md alleen als de fase echt klaar is.
- Commit met een duidelijke message in zo weinig mogelijk commits.
```

## Acceptatiechecklist

- [ ] Beginquest van start tot eind.
- [ ] Side quest.
- [ ] Merchant/economy.
- [ ] Boss fight.
- [ ] Loot/inventory.
- [ ] Audio/sfeer.
- [ ] Camera/light/minimap via nodes.
- [ ] Generated world candidates alleen gebruikt als geaccepteerde editor/node-data.
- [ ] Alles via publish.

## Testplan

Twee spelers spelen complete beginquest en side quest, kopen item, verslaan boss, claimen loot en refreshen. Controleer dat alle generated world candidates expliciet geaccepteerde editor/node-data zijn en dat geen procedural generator contentwaarden heeft verzonnen.
