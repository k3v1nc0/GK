# Node guide: NODE-03 en NODE-04 bouwen

Deze gids is bedoeld als werklijst naast de editor. Gebruik hem om bestaande nodes na te bouwen, iemand anders uit te leggen wat er moet gebeuren, of een nieuwe campaign stap voor stap op te zetten.

## 1. Het hoofdidee

De game gebruikt drie lagen:

1. Authoring nodes: wat jij in de editor bouwt.
2. Published package: wat de compiler uit die nodes maakt.
3. Player state: wat per speler in de database staat.

Belangrijk: definitions horen in nodes; voortgang hoort in de database. Een quest wijzigen in de editor verandert dus niet vanzelf oude player progress, tenzij je bewust reset gebruikt.

## 2. ROOT opbouw

In de root loopt alles naar `World Assembly`, en daarna naar `Game Output`.

Basisvorm:

```text
Catalog Group -> Catalog Registry -> World Assembly.catalogs
Zone Group(s) -> Zone Registry -> World Assembly.zones
Campaign Group -> Campaign Registry -> World Assembly.campaigns
Player Rules Output -> World Assembly.playerRules
UI Output -> World Assembly.ui
World Assembly.gameProject -> Game Output.gameProject
```

Een Group node is alleen een container met een typed uitgang. De echte inhoud zit binnen die group.

## 3. NODE-03: catalogs en player state

NODE-03 levert de herbruikbare gamecontent waar quests later naar verwijzen.

Gebruik NODE-03 voor:

- `Item Definition`, bijvoorbeeld `item.wood`.
- `Currency Definition`, bijvoorbeeld `currency.gold`.
- `Ability Definition`, bijvoorbeeld `ability.attack_1`.
- resource/enemy/loot/player rules.
- HUD modules zoals inventory, wallet, XP, interaction.

Minimale keten:

```text
Item/Currency/Ability/etc -> Catalog Output
Catalog Output.campaignPackage? nee
Catalog Output.catalogPackage -> Catalog Registry
Catalog Registry.catalogRegistry -> World Assembly.catalogs
```

Voor quests is vooral belangrijk dat items, currencies en abilities al bestaan. Een quest reward verwijst alleen naar hun IDs; hij maakt ze niet zelf aan.

## 4. NODE-04: campaigns en quests

NODE-04 levert verhaal, quests, dialogue, objectives, conditions, actions en rewards.

Root-keten:

```text
Campaign Group.campaignPackage -> Campaign Registry.campaignPackage
Campaign Registry.campaignRegistry -> World Assembly.campaigns
```

Binnen `ROOT > NODE-04 Campaigns` staat normaal:

```text
Campaign Definition -> Campaign Output.campaigns
Chapter Definition -> Campaign Definition.chapters
Quest Definition -> Chapter Definition.quests
Quest Definition -> Campaign Output.quests
Dialogue Definition -> Campaign Output.dialogues
Campaign Output.campaignPackage -> Group Output.campaignPackage
```

De compiler leest vanaf `Campaign Output`. Alles wat daar niet via typed ports aankomt, komt niet in de published campaign.

## 5. Een quest maken

Minimale quest:

```text
Quest Definition
  <- Quest Step
       <- Objective Collect / Deliver / Reach / Talk
       <- Condition Player Level / Has Item
       <- Quest Marker Rule
  <- Reward Bundle of Action Give Currency / XP / Ability
  <- Dialogue Definition als startDialogue
```

Praktische volgorde:

1. Maak of kies eerst zone targets in NODE-02, bijvoorbeeld `target.bram` of `target.wood_area`.
2. Maak of kies item/currency/ability definitions in NODE-03.
3. Maak `Quest Definition` met een stabiele `questId`, bijvoorbeeld `quest.blacksmith_supplies`.
4. Maak steps met stabiele `stepId`s en `sequenceIndex` 1, 2, 3.
5. Koppel objectives aan de juiste step.
6. Koppel marker rules aan de step, zodat de minimap en quest target weten waarheen.
7. Koppel rewards/actions aan de laatste step of aan de quest zelf.
8. Maak dialogue entries en choices.
9. Zet op de accept-choice `action = accept_quest` en `questRef = jouw questId`.
10. Koppel alles aan `Campaign Output`.
11. Publish en test in de game.

## 6. Dialogue maken

Minimale dialogue:

```text
Dialogue Definition
  <- Dialogue Entry
       <- Dialogue Choice
```

Belangrijke velden:

- `Dialogue Definition.targetRef`: de NPC of quest target waar je mee praat.
- `Dialogue Definition.startEntryRef`: eerste entry, of leeg laten als er maar een entry is.
- `Dialogue Choice.action`: `accept_quest`, `turn_in_quest`, `close` of `none`.
- `Dialogue Choice.questRef`: de quest die door deze choice wordt gestart of ingeleverd.

## 7. Quest resetten tijdens testen

Er zijn nu twee hulpmiddelen:

1. `Quest Definition -> Reset on content change`
   Zet dit aan op quests die tijdens development automatisch opnieuw beschikbaar moeten worden wanneer de gepublishte quest-inhoud wijzigt.

2. `Quest Tracker HUD -> Allow quest reset`
   Zet dit aan om in de game een `Reset` knop bij de huidige of laatst voltooide quest te tonen.

Gebruik dit alleen voor development/test. De reset zet alleen de gekozen quest terug naar `available` voor de huidige speler. Inventory, wallet, XP en abilities worden niet teruggedraaid.

## 8. Wat gebeurt er in runtime?

Na publish staat de campaign in `gameProject.campaigns`.

De game vraagt state op via:

```text
GET /api/game/node04/state
POST /api/game/node04/action
```

De server beslist:

- welke quest beschikbaar is;
- welke step actief is;
- of objectives klaar zijn;
- of conditions kloppen;
- of rewards worden gegeven;
- welke marker actief is.

De browser toont alleen wat de server teruggeeft. De browser geeft nooit zelf rewards en rondt nooit zelf server-state af.

## 9. Snelle checklist voor een nieuwe campaign

```text
[ ] Campaign Group heeft groupKind campaign
[ ] Binnen de group bestaat Campaign Output
[ ] Campaign Output gaat naar Group Output
[ ] Group Output gaat buiten de group naar Campaign Registry
[ ] Campaign Registry gaat naar World Assembly.campaigns
[ ] World Assembly gaat naar Game Output
[ ] Quest Definition heeft unieke questId
[ ] Quest Step(s) zijn aan Quest Definition gekoppeld
[ ] Objectives/conditions/rewards zijn aan steps of quest gekoppeld
[ ] Dialogue Definition is aan Campaign Output gekoppeld
[ ] Dialogue Choice accept_quest verwijst naar de quest
[ ] Quest targets bestaan in zone packages
[ ] Item/currency/ability refs bestaan in NODE-03 catalogs
[ ] Quest Tracker HUD bestaat in UI Output
```

