# Fase 19 - Progressie, inventaris en combat

## Status

Gepland. Deze fase mag pas geopend worden nadat de quest- en dialoogslice speelbaar en persistent is.

## Bronbasis

De onderzoeksbijlagen adviseren om progressie, economy en combat pas te koppelen nadat de eerste node-authored questflow werkt. De GameBible noemt onder meer Shadowfen en Gloommaw als latere vroege contentpunten; deze fase mag zulke inhoud alleen uit GameBible/editor/node-data gebruiken.

## Echt doel

Maak van de verhalende slice een echte gameplay-slice met progression, inventory, merchant/economy, ability/cooldown/damage, boss phases en loot, zonder client-owned truth of hard-coded waardes.

## Waarom nu

Questflow bewijst dat content uitvoerbaar is. Deze fase bewijst daarna dat spelmechanieken dezelfde datagedreven keten volgen en later server-authoritative kunnen worden zonder herschrijven.

## Scope

- XP/progression model als data-driven engine capability.
- Inventory en item instances.
- Wallet/currency contract.
- Merchant stock/pricing/opening rules als node-data.
- Ability/cooldown/damage executor.
- Boss phase toolkit.
- Loot table executor.
- Combat objective coupling voor quests.
- Audit/event log voor rewards en economy mutaties.

## Niet in scope

- Grote MMO-schaal.
- Definitieve brede economy.
- Client-owned damage/rewards.
- Hard-coded abilitywaarden, damage, cooldowns, prices, loot chances of boss mechanics.
- Nieuwe concrete enemy/boss/itemnamen verzinnen.

## Verplichte gates

- Combatregels worden ontworpen alsof server authority later verplicht wordt.
- Client mag presentatie en feel doen, niet de bronwaarheid voor damage, wallet of loot.
- Missing GLB/UI/audio roles blokkeren de fase.
- Merchant, loot en abilitywaarden komen uit node-data, GameBible/registers of expliciete Kevin/editorinput.

## Deliverables

- Progression contract.
- Inventory/wallet/item instance contract.
- Economy/merchant contract.
- Combat command-to-resolution flow.
- Boss phase executor.
- Loot persistence.
- Negatieve tests voor duplicate loot, free money en invalid cooldown bypass.

## Acceptatie

- Inventory, wallet en loot blijven persistent na reload.
- Ability cooldowns en damage komen uit data.
- Boss phases wisselen via node-state.
- Merchant regels komen uit node-data.
- Exploitcases voor dubbele rewards en vrije currency falen veilig.

## Prompt 1 - GK Code Copiloot

```text
Je bent GK Code Copiloot in builder mode. Werk GitHub-only op main en gebruik repo, GameBible, assets/registers en node-contracten als waarheid.

DOEL
Bouw Fase 19 - Progressie, inventaris en combat. Voeg mechanics toe bovenop de speelbare quest-slice zonder runtimecontent te hard-coden.

VERPLICHTE BRONNEN
- docs/fases/fase-18-speelbare-quest-en-dialoogslice.md
- README/GameBibleNode.json
- README/node-system-super-dynamic-contract.md
- README/hard-facts-to-node-panels.md
- asset/register documentatie
- bestaande runtime, quest en publish codepaden

WERKWIJZE
1. Controleer dat de solo-slice speelbaar en persistent is.
2. Bepaal welke progression/inventory/economy/combat data al in repo-contracten bestaat.
3. Ontwerp combat als command > authoritative resolution > presentation.
4. Bouw generic executors en contracts, niet concrete gamecontent.
5. Stop als Kevin-input, GameBible-data of assetroles ontbreken.
6. Voeg exploit- en persistence-tests toe.

ACCEPTATIE
- Inventory/wallet/loot persistent.
- Combatwaarden data-driven.
- Merchantregels data-driven.
- Client is niet de bronwaarheid voor rewards, damage of currency.
```

## Prompt 2 - Server-side verificatie

```text
Je voert server-side verificatie uit voor Fase 19 - Progressie, inventaris en combat.

CONTROLEER
- pnpm build
- pnpm typecheck
- pnpm test
- pnpm lint
- inventory/wallet persistence
- cooldown en damage tests
- boss phase transition tests
- loot duplicate negative tests
- merchant price/stock/opening rules uit data
- no hardcoded damage/cooldown/loot/price/boss values
- no client-owned truth voor rewards of combat resolution

NIET DOEN
- Geen ontbrekende boss, item, merchant of attack content verzinnen.
- Geen MMO schaal toevoegen.
- Geen current-phase afronden zonder groene checks.

RAPPORTEER
- groene checks;
- exploit-testresultaten;
- ontbrekende Kevin-input;
- of de fase klaar is voor authoritative shared-world werk.
```
