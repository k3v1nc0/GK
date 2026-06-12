# Fase 15 - Economy, levels, money, merchants, inventory en scrolls

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

Maak player levels, XP, currency, merchant stock/prijzen, buy/sell, inventory, items, readable scrolls en UI/audio assets via nodes.

Generated resource distributions uit Fase 8.1/Fase 9 mogen later als draft/candidate input dienen, maar economywaarden, prices, rewards, XP, merchant stock en lootkansen blijven GameBible/editor/Kevin-data.

## Verplichte afhankelijkheden

- Fase 8 entity/component core.
- Fase 8.1 procedural generation core voor eventuele resource candidates.
- Fase 9 world/zone/resource context.
- Fase 11 publish projections voor runtime.

## Wat Kevin vooraf moet maken, kiezen of samen uitwerken

- Kies currency naam/icoon.
- Kies startgeld.
- Kies item icons en prijzen.
- Kies merchant stock.
- Kies inventory UI.
- Kies scroll background en scroll tekst.
- Kies level curve 1 t/m 5 of basisregels.
- Kies of accepteer eventuele generated resource distributions als draftbasis, zonder dat die prijzen/rewards invullen.

## Actie voor Codex

Run asset scan voor UI/audio en draai economy/inventory migraties.

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
- Runtimecode mag geen concrete NPC, quest, prijs, camera, licht, boss, item, route, generated resource distribution of minimap-instelling hard-coded bevatten.
- Procedural generation mag geen economywaarden, prices, rewards, merchant stock, XP of lootkansen verzinnen.

Je werkt aan fase 15: Economy, levels, money, merchants, inventory en scrolls.

Doel:
Maak player levels, XP, currency, merchant stock/prijzen, buy/sell, inventory, items, readable scrolls en UI/audio assets via nodes.

Werk uit:
Maak progression, currency, merchant, inventory, item en readable.scroll nodes. Merchant stock en prijzen zijn node-data. Wallet en inventory server-side. Scrolls gebruiken UI assets en tekst uit data. Generated resource distributions mogen alleen candidate input zijn voor editorkeuzes.

Verplichte controle:
- Run build/typecheck/tests die beschikbaar zijn.
- Als server/database nodig is, noteer exact wat Codex moet doen.
- Update current-phase.md alleen als de fase echt klaar is.
- Commit met een duidelijke message in zo weinig mogelijk commits.
```

## Acceptatiechecklist

- [ ] Geldnaam/icoon via nodes.
- [ ] Player levels/XP via nodes.
- [ ] Merchant stock/prijzen via nodes.
- [ ] Inventory werkt.
- [ ] Scrolls leesbaar.
- [ ] Geen prijzen hard-coded.
- [ ] Generated resources blijven candidate input en vullen geen economywaarden in.

## Testplan

Geef speler geld, koop item bij merchant, lees scroll, level/XP reward testen. Controleer dat generated resources geen prices/rewards/merchant stock hebben verzonnen en alleen gekozen editor-data zijn.
