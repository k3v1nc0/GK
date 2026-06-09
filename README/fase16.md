# Fase 16 - Combat, attacks, eindbaas mechanics en loot


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

Combat is server-owned. Aanvallen, damage, cooldowns, VFX, audio, boss phases, loot tables en quest combat objectives zijn node-data.

## Wat Kevin vooraf moet maken, kiezen of samen uitwerken

- Kies enemy minion GLB.
- Kies boss GLB.
- Kies loot drop GLB.
- Kies attack icons/audio.
- Kies boss health UI/music/audio.
- Kies attack namen, boss naam, loot item en mechanics.

## Actie voor Codex

Run asset scan, start world service met combat logs en test met twee spelers.

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


Je werkt aan fase 16: Combat, attacks, eindbaas mechanics en loot.

Doel:
Combat is server-owned. Aanvallen, damage, cooldowns, VFX, audio, boss phases, loot tables en quest combat objectives zijn node-data.

Werk uit:
Maak combat ability nodes, hitbox/damage/cooldown/targeting/status/audio/VFX, boss phase nodes, loot tables en quest defeat coupling. Server valideert alles.

Verplichte controle:
- Run build/typecheck/tests die beschikbaar zijn.
- Als server/database nodig is, noteer exact wat Codex moet doen.
- Update current-phase.md alleen als de fase echt klaar is.
- Commit met een duidelijke message in zo weinig mogelijk commits.
```

## Acceptatiechecklist

- [ ] Nieuwe attack via nodes.
- [ ] Enemy combat.
- [ ] Boss phases.
- [ ] Boss audio/music.
- [ ] Loot.
- [ ] Quest defeat objective.
- [ ] Geen damage/cooldown hard-coded.

## Testplan

Maak ability in editor, koppel icon/audio, spawn boss, vecht solo en met twee spelers, claim loot.
