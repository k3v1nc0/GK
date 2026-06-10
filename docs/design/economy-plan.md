# Economy Plan

## Status

Dit plan bewaakt economy, levels, money, merchants, rewards en item economy als node/editor/database-data. Er worden in Fase 1 geen concrete economywaarden gekozen.

Fase-status: documentbasis opgezet, economy-input gates open.

## Hoofdregel

Economy loopt via:

`Database > Editor/Node-system > Publish > Runtime Game`

Runtimecode mag geen currency, prices, rewards, merchant inventories, itemwaarden, XP, level curves of lootkansen hard-coden.

## Currency

Status: Kevin-input vereist of later samen uitwerken.

Geen Fase 1-waarde voor:

- currency naam;
- currency icoon;
- startgeld;
- wallet limits;
- grant/spend regels.

Toekomstige node/schema-structuur:

- `currency.definition`
- `currency.wallet`
- `currency.grant`
- `currency.spend`

Gate: currency mag pas worden gebruikt wanneer naam, icoon en basisregels door Kevin zijn gekozen of goedgekeurd.

## Money en prices

Status: later samen uitwerken.

Geen Fase 1-waarde voor:

- item prices;
- buy/sell modifiers;
- repair/crafting costs;
- reward money;
- enemy/boss reward values.

Toekomstige node/schema-structuur:

- `merchant.price`
- `merchant.buyRule`
- `merchant.sellRule`
- `quest.reward`
- `progression.xpReward`

Gate: geen prijzen of beloningen in runtimecode.

## Merchants

Status: Kevin-input vereist voor definitieve merchant content.

Geen Fase 1-waarde voor:

- merchant NPC;
- merchant naam;
- merchant stock;
- open hours;
- buy/sell regels;
- merchant UI/audio.

Toekomstige node/schema-structuur:

- `merchant.definition`
- `merchant.stock`
- `merchant.price`
- `merchant.buyRule`
- `merchant.sellRule`
- `merchant.openHours`
- `npc.task.merchant`
- `hud.merchant`

Gate: Fase 15 moet blokkeren als merchant stock, prices of UI assets ontbreken voor een verplichte merchant flow.

## Rewards

Status: later samen uitwerken.

Geen Fase 1-waarde voor:

- quest rewards;
- side quest rewards;
- boss loot;
- XP values;
- item drops;
- scroll rewards;
- unlocks.

Toekomstige node/schema-structuur:

- `quest.reward`
- `combat.lootTable`
- `progression.xpReward`
- `entity.spawnFromAsset` voor loot visuals
- inventory/item nodes wanneer beschikbaar

Gate: rewards mogen pas worden gepubliceerd wanneer ze in nodes/database staan en door Kevin zijn gekozen of goedgekeurd.

## Item economy

Status: later samen uitwerken.

Geen Fase 1-waarde voor:

- item names;
- item icons;
- item descriptions;
- item value;
- stack sizes;
- item rarity;
- inventory slot rules;
- readable scroll text.

Gate: inventory en scrolls gebruiken UI assets en tekst uit data, niet uit runtimecode.

## Level unlocks en balancing

Status: later samen uitwerken.

Geen Fase 1-waarde voor:

- level curve;
- player levels;
- enemy levels;
- boss level;
- unlock levels;
- XP reward waarden;
- loot drop kansen.

Toekomstige node/schema-structuur:

- `progression.levelCurve`
- `progression.xpReward`
- level/zone nodes uit world planning
- combat and quest reward nodes

Gate: Fase 15 en 16 moeten stoppen als balancingwaarden nodig zijn maar niet door Kevin zijn gekozen.

## Fasekoppelingen

- Fase 15: bouwt economy, levels, money, merchants, inventory en scroll nodes.
- Fase 16: gebruikt loot, combat rewards en boss-related economy.
- Fase 17: mag complete beginquest-content pas seeden wanneer economy-input volledig genoeg is.

## Stopregel

Als een feature een economywaarde nodig heeft en die waarde ontbreekt, voeg geen tijdelijke waarde toe. Stop en rapporteer welke Kevin-input ontbreekt.
