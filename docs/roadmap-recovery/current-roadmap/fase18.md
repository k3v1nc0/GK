# Fase 18 - Polijst, performance, deploy en eindacceptatie

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

Stabiliseer de complete game, test performance, load, backup/restore en deploy. Aan het eind is de eerste versie echt speelbaar.

Fase 18 controleert ook dat de Fase 8.1 procedural generation contracten veilig in de complete flow zitten: deterministic generation, no-runtime-publish preview/bake, accepted generated data only through publish, en geen client-invented MMO-state.

## Verplichte afhankelijkheden

- Fase 8 entity/component core.
- Fase 8.1 procedural generation core.
- Fase 9 world/camera/lighting/minimap nodes.
- Fase 10 runtime client.
- Fase 11 publish pipeline.
- Fase 12 realtime MMO rooms.
- Fase 13 t/m 17 gameplay/content systemen.

## Wat Kevin vooraf moet maken, kiezen of samen uitwerken

- Speel alles uit.
- Noteer bugs.
- Lever betere GLB/UI/audio assets aan als nodig.
- Kies performance target voor mobiel/desktop en spelers per room.
- Controleer of generated world candidates die in de build zitten expliciet geaccepteerd zijn.

## Actie voor Codex

Production build, release naar `/var/www/gk/releases`, current switch, services restart, smoke tests, backup en restore-check.

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
- Eindacceptatie moet bevestigen dat procedural preview/bake niet rechtstreeks runtime wijzigt.

Je werkt aan fase 18: Polijst, performance, deploy en eindacceptatie.

Doel:
Stabiliseer de complete game, test performance, load, backup/restore en deploy. Aan het eind is de eerste versie echt speelbaar.

Werk uit:
Maak full game flow tests, editor publish tests, procedural determinism/regression tests, two-player tests, boss/loot tests, merchant/economy tests, audio/minimap tests, load smoke tests, mobile performance checks, deploy scripts, backup/restore scripts en operations runbook.

Verplichte controle:
- Run build/typecheck/tests die beschikbaar zijn.
- Als server/database nodig is, noteer exact wat Codex moet doen.
- Update current-phase.md alleen als de fase echt klaar is.
- Commit met een duidelijke message in zo weinig mogelijk commits.
```

## Acceptatiechecklist

- [ ] Editor werkt.
- [ ] Node system werkt.
- [ ] Asset/audio auto import werkt.
- [ ] Procedural generation determinism werkt.
- [ ] Procedural preview/bake publiceert niets direct naar runtime.
- [ ] Publish werkt.
- [ ] Runtime werkt.
- [ ] Realtime MMO.
- [ ] NPC/quest/economy/combat/boss/loot.
- [ ] Backup/restore.
- [ ] Deploy.
- [ ] Mobile performance acceptabel.

## Testplan

Volledige eindtest: editor publish, procedural determinism en no-runtime-publish checks, twee spelers, minimap, audio, beginquest, side quest, merchant, boss, loot, refresh, backup/restore check.
