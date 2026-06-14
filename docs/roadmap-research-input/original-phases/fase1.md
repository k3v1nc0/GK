# Fase 1 - Game Bible, content gates en maaklijst


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

Maak de levende projectdocumenten voor verhaal, namen, assets, UI, audio, camera, lighting, minimap, economy, levels en boss/quest keuzes.

## Wat Kevin vooraf moet maken, kiezen of samen uitwerken

- Kies of bevestig assetpad.
- Begin met game naam, startgebied, sfeer en MMO-stijl.
- Noteer welke GLB, UI en audio assets je al hebt.
- Noteer welke namen, quests, side quests, boss en currency later samen verzonnen moeten worden.

## Actie voor Codex

Controleer `/var/www/gk/assets` en tel GLB, UI en audio bestanden. Zet `GK_ASSET_SOURCE_DIR`.

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


Je werkt aan fase 1: Game Bible, content gates en maaklijst.

Doel:
Maak de levende projectdocumenten voor verhaal, namen, assets, UI, audio, camera, lighting, minimap, economy, levels en boss/quest keuzes.

Werk uit:
Maak docs/design/game-bible.md, asset-register.md, audio-register.md, world-settings-plan.md, economy-plan.md, content-gates.md en phase-plan/current-phase.md. Leg vast dat ontbrekende Kevin-content een fase blokkeert en dat de AI geen definitieve inhoud verzint.

Verplichte controle:
- Run build/typecheck/tests die beschikbaar zijn.
- Als server/database nodig is, noteer exact wat Codex moet doen.
- Update current-phase.md alleen als de fase echt klaar is.
- Commit met een duidelijke message in zo weinig mogelijk commits.
```

## Acceptatiechecklist

- [ ] Game Bible bestaat.
- [ ] Asset/UI/audio register bestaat.
- [ ] World/camera/light/minimap keuzes hebben secties.
- [ ] Economy/levels/merchant keuzes hebben secties.
- [ ] Content gates blokkeren missende input.

## Testplan

Laat een nieuwe agent alleen de docs openen en controleren wat Kevin voor fase 7, 9, 13, 15, 16 en 17 moet aanleveren.
