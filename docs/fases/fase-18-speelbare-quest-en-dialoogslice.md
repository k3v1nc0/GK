# Fase 18 - Speelbare quest- en dialoogslice

## Status

Gepland. Deze fase mag pas geopend worden nadat Runtime Game Core startbaar is vanuit published data.

## Bronbasis

De GameBible bevat een vroege route rond Home Base, Road, Peaks, Slyph Labyrinth, Pyria, Sunstone en de eerste beacon. Deze fase gebruikt die lijn alleen als contractuele contentbron; runtimecode mag deze waarden niet hard-coden.

## Echt doel

Maak een kleine maar volledige solo-slice waarin een speler via nodes een beginquestlijn kan spelen met dialoog, interacties, objectives, unlocks, checkpoints en rewards.

## Waarom nu

Na Runtime Game Core moet de eerste proof niet meteen combat of MMO zijn. Eerst moet bewezen worden dat node-data de volledige gameplayketen kan dragen: authoring, publish, runtime execution, UI-feedback en save/load.

## Scope

- Dialogue tree executor.
- Quest state machine.
- Objective evaluators.
- Interactable runtime contract.
- Unlock flags.
- Checkpoint flow.
- Quest tracker/HUD adapter.
- Reward application via node-data.
- Save/load van quest- en dialogue-state.

## Niet in scope

- Combat.
- Economy/merchant/inventory als vol systeem.
- Multiplayer.
- Definitieve brede world content.
- Nieuwe lore of dialogen verzinnen.
- Concrete NPC/quest/camera/minimapwaarden hard-coden.

## Verplichte gates

- GameBible en editor/node-data leveren de content; runtime levert alleen generieke executors.
- Als dialogen, rewards, objectivewaarden of assetrollen ontbreken, stopt de fase met blockers.
- Alle questmutaties lopen via objective/quest executors, niet via losse UI-click hacks.
- Published data blijft de enige runtimebron.

## Deliverables

- Quest runtime contract.
- Dialogue runtime contract.
- Interactable/objective executors.
- Quest tracker adapter.
- Persistente quest/dialogue/checkpoint state.
- Testflow voor de eerste solo-slice.

## Acceptatie

- Een speler kan de slice doorlopen zonder handmatige console-acties.
- Save/reload herstelt quest- en dialogue-state.
- Objective, reward en unlock data komen uit node-data/published read models.
- Ontbrekende content blokkeert zichtbaar in plaats van door dummydata te gaan.
- Geen combat, economy of multiplayer is stiekem onderdeel van deze fase.

## Prompt 1 - GK Code Copiloot

```text
Je bent GK Code Copiloot in builder mode. Werk GitHub-only op main en gebruik de actuele repo, GameBible en node-contracten als waarheid.

DOEL
Bouw Fase 18 - Speelbare quest- en dialoogslice. Bewijs dat node-data een kleine solo-questflow kan uitvoeren via Runtime Game Core.

VERPLICHTE BRONNEN
- docs/fases/fase-17-runtime-game-core.md
- README/GameBibleNode.json
- README/node-system-super-dynamic-contract.md
- README/hard-facts-to-node-panels.md
- relevante quest/dialogue/node/publish/runtime codepaden

WERKWIJZE
1. Controleer dat Runtime Game Core uit published data boot.
2. Haal de relevante GameBible nodes voor de vroege slice opnieuw op.
3. Breng authoring > node-data > publish > runtime execution in kaart.
4. Bouw generieke quest, dialogue, objective, interactable en checkpoint executors.
5. Stop als concrete dialogen, rewards, assetrollen of objectivewaarden ontbreken.
6. Geen contentwaarden hard-coden in runtimecode.

ACCEPTATIE
- Complete solo-flow via published node-data.
- Save/reload werkt voor quest/dialogue/checkpoint state.
- Alle contentwaarden zijn data-driven.
- Missing input wordt als blocker gerapporteerd.
```

## Prompt 2 - Server-side verificatie

```text
Je voert server-side verificatie uit voor Fase 18 - Speelbare quest- en dialoogslice.

CONTROLEER
- pnpm build
- pnpm typecheck
- pnpm test
- pnpm lint
- game runtime route-smokes
- volledige solo-slice test, indien harness beschikbaar is
- save/reload midden in de questflow
- no hardcoded NPC/quest/reward/objective values
- no draft/editor route usage in runtime
- missing content blockers

NIET DOEN
- Geen ontbrekende dialogen of lore verzinnen.
- Geen combat/economy/multiplayer accepteren als scope.
- Geen statusdocumenten afronden zonder echte playthrough of duidelijke blocker.

RAPPORTEER
- bewijs van de playthrough;
- welke state persistent is;
- welke Kevin-input ontbreekt;
- regressierisico's voor Runtime Game Core.
```
