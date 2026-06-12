# Fase 11 - Publish pipeline en runtime projections

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

Save en publish worden echt gescheiden. Publish compileert node-data naar runtime projections voor game, editor-preview en rollback.

Fase 11 is de eerste plaats waar Fase 8.1 procedural bake draft data runtime-betekenis mag krijgen, en alleen wanneer publish-validatie die data expliciet accepteert en compileert naar immutable runtime projections.

## Verplichte afhankelijkheden

- Fase 8 entity/component core.
- Fase 8.1 procedural generation core.
- Fase 9 world/camera/lighting/minimap nodes.
- Fase 10 runtime client consumeert alleen published projections.

Publish mag procedural preview niet consumeren. Alleen editor bake draft data die door validators komt, mag naar runtime projections.

## Wat Kevin vooraf moet maken, kiezen of samen uitwerken

- Kies simpele testgraph: player spawn, ground, camera, licht, minimap en 1 prop.
- Kies of accepteer de generated zones/placements/path/resource candidates die in de testpublish gebruikt worden.
- Bevestig dat testcontent uit GameBible/editor-data/asset register/procedural bake draft komt.

## Actie voor Codex

Zorg dat `/var/www/gk/data/published` en releases schrijfbaar zijn voor publish service.

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
- Concrete waardes moeten uit node-data, Game Bible, asset register, procedural bake draft die door editor/publish is geaccepteerd, of editor input komen.
- Runtimecode mag geen concrete NPC, quest, prijs, camera, licht, boss, item, route, generated placement of minimap-instelling hard-coded bevatten.
- Publish mag procedural preview niet behandelen als runtimebron.

Je werkt aan fase 11: Publish pipeline en runtime projections.

Doel:
Save en publish worden echt gescheiden. Publish compileert node-data naar runtime projections voor game, editor-preview en rollback.

Werk uit:
Bouw publish-service, validation, compiler, immutable release manifest, runtime bootstrap/chunks/story/HUD/assets/audio/camera/minimap projections en rollback. Neem Fase 8.1 procedural bake draft data alleen mee wanneer die door editor-data en publish-validatie expliciet is geaccepteerd. Preview en bake zelf blijven geen publishstap.

Verplichte controle:
- Run build/typecheck/tests die beschikbaar zijn.
- Als server/database nodig is, noteer exact wat Codex moet doen.
- Update current-phase.md alleen als de fase echt klaar is.
- Commit met een duidelijke message in zo weinig mogelijk commits.
```

## Acceptatiechecklist

- [ ] Save verandert runtime niet.
- [ ] Publish valideert.
- [ ] Runtime projections bestaan.
- [ ] Audio/camera/light/minimap in projections.
- [ ] Procedural bake draft kan alleen via publish-validatie naar projections.
- [ ] Procedural preview wordt niet als runtimebron gebruikt.
- [ ] Rollback werkt.

## Testplan

Save draft, game blijft gelijk; run procedural preview/bake draft, game blijft gelijk; publish geaccepteerde node/procedural draft data, game verandert; rollback naar vorige release.
