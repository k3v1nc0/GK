# NODE-04 — Campaigns, Quests, Dialogue, Objectives, Conditions, Actions, Rewards en Cross-Zone Progression

**Documenttype:** uitvoeringscontract voor Codex  
**Status:** implementeren nadat NODE-03 volledig is geaccepteerd  
**Repository:** `k3v1nc0/GK`  
**Baseline:** eind-HEAD van NODE-03  
**Afhankelijkheden:** NODE-01 refs/tags/tokens/packages, NODE-02 zones/targets/markers en NODE-03 player state/inventory/currency/abilities/gameplay events  
**Vervolg:** NODE-05 — Economy, Trade, Market, Crafting, Party, UI en finale integratie  
**Contractversie:** `node-system-contract-v1.0`

---

# 1. Opdracht aan Codex

Bouw de complete node-driven story- en questlaag van GK boven op de reeds werkende zone-, catalog-, player-state- en gameplayfundering.

Na deze fase moet Kevin in de node-editor een hoofdquest kunnen bouwen die meerdere zones doorkruist en die volledig speelbaar is zonder quest-specifieke runtimecode:

```text
Campaign Group
-> Chapter Definition
-> Quest Definition
-> Quest Step-flow
-> Dialogue-flow
-> Objectives / Conditions / Actions / Rewards
-> Campaign Output
-> Campaign Registry
-> World Assembly
-> Game Output
-> published campaign package
-> server-authoritative Quest Runtime
-> databaseprogressie per character
-> HUD, dialogue, markers en zone targets
```

De verplichte tastbare verticale slice is:

```text
1. Player spreekt Bram in Zone Home Base.
2. Dialogue toont tokenized tekst.
3. Player kiest Accepteren.
4. Quest wordt actief.
5. Marker verhuist naar een resourcegebied in Zone Road.
6. Player verzamelt 10 Wood.
7. Quest controleert daarnaast Player Level >= 3.
8. Marker verhuist terug naar Bram.
9. Player levert exact 10 Wood in.
10. Consume + reward gebeurt in één atomische servertransactie.
11. Player ontvangt Gold, XP en Ability Attack 1.
12. Volgende step stuurt player naar Zone Peaks.
13. Quest wordt voltooid en volgende hoofdquest wordt ontgrendeld.
14. Refresh, logout/login en serverrestart behouden progressie exact.
15. Een tweede account heeft onafhankelijke questprogressie.
```

Codex hoeft geen questarchitectuur, eventmodel, state-machinebibliotheek, tokenmodel, databasevorm of UX-flow meer te bedenken. Implementeer exact dit contract binnen de bestaande vanilla JavaScript/Node/SQLite/Three.js-basis.

---

# 2. Niet-onderhandelbare regels

1. Geen hardcoded quest, Bram, Wood, Gold, Attack 1 of Zone Peaks in runtimecode.
2. De acceptance-content wordt door nodes authored; tests mogen fixtures via dezelfde editor/API-route aanmaken.
3. Questdefinitions staan in published content; mutable playerprogressie staat in database/server memory.
4. Questflow wordt bepaald door typed `flow`-edges, niet door een JSON-array die buiten de nodegraph wordt bewerkt.
5. Cross-zone targets gebruiken typed refs naar `quest_target_binding`; geen kabel door meerdere Zone Groups.
6. Dialogue is een eigen flowgraph en geen tekstveld in `quest_step`.
7. Objectives, Conditions en Actions zijn generieke executors; geen aparte code per quest.
8. Text gebruikt `@{...}`-tokens en leest de bronwaarde; logic gebruikt typed refs/velden en parseert nooit displaytekst.
9. Alle inventory-, currency-, XP-, ability- en rewardmutaties zijn server-authoritative, transactioneel en idempotent.
10. De client mag nooit zelf een queststep afronden of reward toekennen.
11. Geen `eval`, `new Function`, willekeurige JavaScript-expressies of executable code in nodedata.
12. Geen elke-frame questchecks. Progressie is event-driven plus gerichte statecheck bij login, interactie en turn-in.
13. Geen tweede parallelle inventory/wallet/playerstate naast NODE-03.
14. Geen nieuwe frameworkswitch, externe questbackend of zware visual graph dependency.
15. `npm run check`/tests zijn verplicht maar niet voldoende; de public-URL flow moet zichtbaar werken.
16. Geen seeded gamecontent; een lege database blijft leeg buiten de technische outputnode.

---

# 3. Tastbaar eindresultaat

Kevin moet na NODE-04 in de editor zien en kunnen gebruiken:

## Rootgraph

```text
[Campaign Group: Main Story]
       └── campaignPackage
               ↓
      [Campaign Registry]
               ↓
        [World Assembly]
               ↓
         [Game Output]
```

## Campaign Group

```text
[Campaign Definition]
       ↑ chapters
[Chapter Definition]
       ↑ quests
[Quest Definition: Blacksmith Supplies]
       ├── questDef -> Chapter Definition
       └── start flow -> Quest Step 1

[Dialogue Definition: Bram Quest]
       └── dialogueDef -> Campaign Output

[Campaign Definition/Chapter/Quest/Dialogue]
       -> [Campaign Output]
       -> Group Output
```

## Quest Group

```text
[Quest Definition]
       │ start
       ▼
[Step 1: Talk to Bram]
       │ completed
       ▼
[Step 2: Collect 10 Wood]
       │ completed
       ▼
[Condition Group: Level >= 3]
       │ true
       ▼
[Step 3: Deliver Wood]
       │ completed
       ▼
[Reward Bundle]
       │ success
       ▼
[Step 4: Reach Peaks]
       │ completed
       ▼
[Quest Complete]
       │
       ▼
[Quest Link: next quest]
```

## Dialogue Group

```text
[Dialogue Definition]
       │ start
       ▼
[Dialogue Line: Bram intro]
       │
       ▼
[Dialogue Choice]
   ├── Accepteren -> [Dialogue Action: Start Quest] -> [Dialogue End]
   └── Later       -> [Dialogue Line: Return Later]  -> [Dialogue End]
```

## Game

- echte dialogue-overlay;
- questtracker met current/required amounts;
- questmarker op actieve target;
- markers wisselen bij steptransitie;
- inventory/wallet/ability zichtbaar uit NODE-03;
- serverbevestigde queststatus;
- foutmelding bij ongeldige turn-in zonder verlies;
- exact één reward bij dubbele klik/retry;
- persistentie na refresh/login/serverrestart.

---

# 4. Architectuurgrens: definition, compiled runtime en player state

Deze drie lagen mogen niet worden samengevoegd.

## 4.1 Authoringdefinition

Komt uit nodes:

```text
campaigns
chapters
quests
steps
objectives
conditions
actions
rewards
dialogues
marker rules
text templates
typed references
```

## 4.2 Compiled questpackage

Komt uit de publishcompiler:

```text
resolved stable IDs
validated flowgraph
normalized objective executors
normalized condition AST
normalized action plans
resolved target references
token dependency list
reachable-step index
event subscription index
content version/hash
```

## 4.3 Mutable playerstate

Komt uit database/server memory:

```text
quest state
current/active step IDs
objective current amounts
branch choices
dialogue choices
claimed reward operation IDs
accepted/completed timestamps
quest revision
tracked quest
marker runtime state
```

De runtime voert het compiled package uit tegen de mutable playerstate. De raw editorgraph wordt niet iedere gameplay-event opnieuw doorlopen.

---

# 5. Nieuwe typed datatypes

Voeg aan het shared schema en browser-schema minimaal toe:

```text
campaignDef
chapterDef
questDef
questStepDef
objective
objectiveGroup
condition
conditionGroup
action
actionList
rewardEntry
rewardBundle
questTerminal
eventTrigger
markerRule
dialogueDef
dialogueEntry
dialogueTerminal
dialogueRouterDef
questRuntimeRef
dialogueRuntimeRef
```

`flow` bestaat als speciaal controletype en krijgt een eigen visuele kleur. Een `flow`-poort draagt geen mutable playerdata; hij definieert compile-time transitions.

Aanbevolen kleuren:

```text
flow             #f1c75b
questDef         #d9aa45
questStepDef     #e8bd5a
objective        #7fc9ff
condition        #cf8cff
action           #ff9670
rewardBundle     #74d99f
dialogueDef      #e7a6d7
markerRule       #f6d85a
```

## 5.1 Portregels

- `quest_definition.start` accepteert exact één `flow`-edge.
- Een `quest_step` mag meerdere terminal flowoutputs hebben: `completed`, `failed`, `cancelled`.
- Een gewone next-stepketen gebruikt `completed`.
- Een objective is data-input van een step, geen flowtussenstap.
- Conditions worden als data aan step/branch/action/choice gekoppeld.
- Actions worden als data aan step start/complete, dialogue action/choice en reward gekoppeld.
- Dialogueflow en questflow zijn gescheiden datatypes; een dialogue start een quest via een Action, niet door een direct flow-edge tussen de twee graphfamilies.

---

# 6. Campaign- en package-nodes

# 6.1 `campaign_definition`

**Groep:** Story / Campaign  
**Scope:** Campaign Group  
**Inputs:**

```text
chapters        chapterDef[]  multiple
quests          questDef[]    multiple, voor campaigns zonder chapters
availability    condition     optional
```

**Outputs:**

```text
campaignDef
```

**Velden:**

```text
campaignId          identity, required, namespace campaign.*
displayName         tokenText/text, required
description         tokenText, optional
campaignType        select: main | side | daily | weekly | event | tutorial
version             integer >= 1
repeatPolicy        select: once | repeatable | daily | weekly | event_window
scope               select: character | account | party | world
sortOrder           integer
startQuestRef       questRef, optional; anders eerste verbonden quest/chapter
autoTrack           boolean
visibleInJournal    boolean
tags                tagList
```

**Compileroutput:**

```json
{
  "id": "campaign.main.story",
  "type": "main",
  "version": 1,
  "chapterIds": ["chapter.main.01"],
  "questIds": ["quest.main.blacksmith_supplies"],
  "startQuestId": "quest.main.blacksmith_supplies",
  "availability": null,
  "tags": ["story.main"]
}
```

**Validation:** duplicate ID, ontbrekende startquest, scope/repeat mismatch en cycles tussen campaigns blokkeren publish.

---

# 6.2 `chapter_definition`

**Inputs:**

```text
quests          questDef[] multiple
availability    condition optional
completion      condition optional
```

**Output:** `chapterDef`

**Velden:**

```text
chapterId        identity, chapter.*
displayName      tokenText
description      tokenText
sortOrder        integer
unlockMode       all_previous | explicit_condition | manual
completionMode   all_quests | required_quests | explicit_condition
requiredQuestRefs refList<quest>
tags             tagList
```

Chapter is organisatorisch en journalgericht. De runtime bewaart geen aparte chapterprogressie als die volledig uit queststates kan worden afgeleid. Alleen expliciete chapterflags worden als derived cache opgeslagen.

---

# 6.3 `campaign_output`

**Inputs:**

```text
campaigns       campaignDef[] multiple
chapters        chapterDef[] multiple
quests          questDef[] multiple
dialogues       dialogueDef[] multiple
routers         dialogueRouterDef[] multiple
```

**Output:** `campaignPackage`

**Velden:**

```text
packageId          identity, package.campaign.*
schemaVersion      fixed/read-only: campaign-package-v1
contentVersion     integer
```

**Verantwoordelijkheid:** uitsluitend bundelen en duplicate-local-ID controle. Geen gameplay-executie.

---

# 6.4 `campaign_registry`

NODE-01 heeft de registrybasis toegevoegd. Breid deze uit met:

```text
campaignPackages[]
questIndex
stepIndex
objectiveIndex
dialogueIndex
eventSubscriptionIndex
targetDependencyIndex
tokenDependencyIndex
```

De registry output naar World Assembly blijft `campaignRegistry`.

---

# 7. Questflow-nodes

# 7.1 `quest_definition`

**Inputs:**

```text
availabilityConditions  condition[] multiple
acceptActions           actionList optional
abandonActions          actionList optional
globalRewards           rewardBundle optional
```

**Outputs:**

```text
questDef
start      flow
```

**Velden:**

```text
questId              identity, namespace quest.*
displayName          tokenText, required
summary              tokenText, required
description          tokenText, optional
category             main | side | daily | weekly | event | tutorial
levelMin             integer >= 1
levelRecommended     integer >= levelMin
levelMax             integer/null
scope                 character | account | party | instance | world
repeatPolicy          once | repeatable | daily | weekly | event_window
abandonAllowed        boolean
failureAllowed        boolean
autoAccept            boolean
autoTrack             boolean
shareAllowed          boolean
journalVisible        boolean
markerPolicy          automatic | explicit | none
completionClaim       automatic | turn_in | manual_claim
tags                  tagList
contentVersion        integer >= 1
migrationPolicy       keep_step | restart_step | restart_quest | block_publish
```

**Outputregels:**

- `questDef` gaat naar Chapter/Campaign/Campaign Output.
- `start` gaat naar exact één eerste Quest Step of Quest Branch.
- `autoAccept=true` is alleen toegestaan als availability en trigger expliciet zijn.

---

# 7.2 `quest_step`

**Inputs:**

```text
flowIn              flow, required behalve eerste via quest start
objectives          objective | objectiveGroup, required tenzij purely_action
enterConditions     condition[]
completeConditions  condition[]
onEnterActions      actionList
onCompleteActions   actionList
onFailActions       actionList
reward              rewardBundle optional
markerRules         markerRule[]
```

**Outputs:**

```text
questStepDef
completed   flow
failed      flow
cancelled   flow
```

**Velden:**

```text
stepId             identity binnen quest; compiler canonicaliseert questId::stepId
displayName        tokenText
instruction        tokenText
stepType           objective | turn_in | travel | dialogue | action | checkpoint
savePolicy         immediate | on_objective | on_step_complete
trackingPolicy     auto | manual | hidden
failurePolicy      none | quest_fail | return_to_step | alternate_flow
allowParallel      boolean
optional           boolean
sortOrder          integer, alleen journalweergave
timeLimitSeconds   integer/null
```

**Statecontract:**

```text
locked
active
ready_to_complete
completed
failed
cancelled
```

Een steptransition is één servermutatie. Bij `completed`:

1. controleer current step/revision;
2. hercontroleer complete conditions;
3. voer atomic onComplete/reward uit;
4. markeer step completed;
5. bepaal next flowtarget;
6. activeer next step(s);
7. schrijf state/objectives/event receipt;
8. commit;
9. broadcast delta en markerwijziging.

---

# 7.3 `objective_group`

**Inputs:** `objective[]`

**Output:** `objectiveGroup`

**Velden:**

```text
groupId
mode             all | any | ordered | at_least_n
requiredCount    integer, alleen at_least_n
resetPolicy      never | on_step_restart | on_failure
showChildren     boolean
```

`ordered` activeert alleen de eerst nog onvoltooide childobjective. Progress events voor latere children worden niet vooruit opgeslagen tenzij `allowPreProgress` op het objective staat.

---

# 7.4 `condition_group`

**Inputs:** `condition[]`

**Output:** `condition`

**Velden:**

```text
groupId
operator          all | any | none | not
shortCircuit      boolean, default true
emptyResult       boolean, expliciete default
```

`not` accepteert exact één condition. `none` betekent geen child mag true zijn.

---

# 7.5 `action_sequence`

**Inputs:** `action[]`

**Output:** `actionList`

**Velden:**

```text
sequenceId
executionMode     atomic | ordered_best_effort | parallel_non_mutating
onFailure         rollback | stop | continue
idempotencyScope  quest_transition | dialogue_choice | explicit_operation
```

Muterende actions mogen niet in `parallel_non_mutating`.

---

# 7.6 `reward_bundle`

**Inputs:**

```text
rewards       rewardEntry[] of action[] die als reward zijn gemarkeerd
conditions    condition[] optional
```

**Output:** `rewardBundle`

**Velden:**

```text
bundleId
claimPolicy       automatic | turn_in | manual_claim
atomic            fixed true voor player-owned assets
showPreview       boolean
notificationText  tokenText
overflowPolicy    block | mail_pending | drop_disallowed
operationSource   automatic from questId/stepId/bundleId
```

Rewards gebruiken de bestaande NODE-03 `game-mutation-service`. Geen tweede reward-implementatie.

---

# 7.7 `quest_branch`

**Inputs:**

```text
flowIn      flow
condition   condition
```

**Outputs:**

```text
true        flow
false       flow
```

**Velden:** `branchId`, `rememberChoice`, `debugLabel`.

`rememberChoice=true` schrijft de gekozen branch naar player queststate zodat contentupdates niet willekeurig een andere route kiezen.

---

# 7.8 `quest_parallel`

**Input:** `flowIn`

**Outputs:** configureerbare named `flow`-outputs, minimaal twee.

**Velden:**

```text
parallelId
activationMode    all | selected_by_conditions
```

De compiler slaat actieve branch step IDs op. Geen onbeperkte dynamische output: maximaal 16 branches per node.

---

# 7.9 `quest_join`

**Inputs:** configureerbare named `flow`-inputs.

**Output:** `flow`

**Velden:**

```text
joinId
mode          all | any | at_least_n
requiredCount
cancelRemainder boolean
```

De compiler maakt een joinstate-record per questinstance. Een herhaald branch-complete-event mag de join niet twee keer laten doorlopen.

---

# 7.10 `quest_complete`

**Inputs:**

```text
flowIn
conditions optional
rewards optional
onCompleteActions optional
```

**Output:** `questTerminal`

**Velden:**

```text
terminalId
completionState completed
journalText tokenText
retainInJournal boolean
```

Quest Complete mag een `quest_link` action bevatten, maar start niet stilzwijgend een hardcoded volgende quest.

---

# 7.11 `quest_fail`

**Inputs:** `flowIn`, optional actions/conditions.

**Output:** `questTerminal`

**Velden:**

```text
terminalId
failureReason tokenText
retryPolicy none | restart_step | restart_quest | cooldown
retryCooldownSeconds
retainInJournal
```

---

# 7.12 `quest_link`

**Input:** `flowIn`

**Output:** `action` of terminal metadata.

**Velden:**

```text
nextQuestRef       exact @quest.*
mode               unlock | offer | start
trackNext          boolean
conditions         via condition input
```

Dit is een typed reference en geen cross-group flowkabel.

---

# 7.13 `event_listener`

**Inputs:** optional conditions.

**Output:** `eventTrigger` of `condition`.

**Velden:**

```text
listenerId
eventType          registered event select
sourceRef          optional exact ref
sourceTagQuery     optional tag query
targetRef          optional exact ref
targetTagQuery     optional tag query
playerScope        self | party | any_relevant
countMode          events | distinct_sources | distinct_targets | sum_payload_field
payloadField       whitelisted path, optional
dedupeScope        event_id | source_target | operation_id | custom_key
```

Geen vrije eventnaam invoeren zonder registry. Custom events moeten in een server event registry zijn geregistreerd.

---

# 7.14 `quest_marker_rule`

**Inputs:** optional condition(s).

**Output:** `markerRule`

**Velden:**

```text
ruleId
questRef/stepRef/objectiveRef automatisch contextueel
targetRef          @target.*
markerRef          @marker.* optional; anders default quest icon
visibleWhen        available | active | ready_to_turn_in | completed | failed
priority           integer
labelTemplate      tokenText
hidePrevious       boolean
fallbackZoneEntry  boolean
```

Markers zijn derived runtime presentation. De authoritative queststate blijft leidend.

---

# 8. Objective-nodecontract

Alle objective-librarynodes compileren naar dezelfde vorm:

```json
{
  "id": "objective.collect_wood",
  "kind": "collect",
  "eventTypes": ["item.acquired", "inventory.changed"],
  "requiredAmount": 10,
  "progressMode": "current_inventory",
  "sourceFilter": {},
  "targetRef": "target.zone_road.resource.north_forest",
  "allowPreProgress": false,
  "creditPolicy": "self"
}
```

Elk objective heeft gemeenschappelijke velden:

```text
objectiveId
instruction tokenText
requiredAmount integer/formula >= 1
optional boolean
hidden boolean
allowPreProgress boolean
resetPolicy never | on_step_restart | on_failure
creditPolicy self | party_shared | party_contribution | instance_shared
markerTargetRef optional
```

# 8.1 `objective_talk`

```text
targetRef          @target.* met role npc/entity
dialogueRef        optional @dialogue.*
completionPoint    interaction_started | dialogue_started | dialogue_completed
requiredAmount     default 1
```

Event: `entity.interacted`, `dialogue.started` of `dialogue.completed`.

# 8.2 `objective_interact`

```text
targetRef
interactionTag optional
requiredAmount
uniqueTargets boolean
```

Event: `entity.interacted`.

# 8.3 `objective_collect`

```text
itemRef XOR itemTagQuery
mode              acquired_since_active | current_inventory | lifetime_acquired
requiredAmount
sourceTargetRef optional
consumeOnComplete fixed false
```

`current_inventory` wordt bij stepactivatie en inventorymutaties herberekend. `acquired_since_active` telt alleen events na activatie.

# 8.4 `objective_deliver`

```text
targetRef
itemRequirements[]   exact refs/tagqueries + amounts
currencyRequirements[]
consumePolicy        exact_stacks | oldest_first | lowest_quality_first
partialTurnIn        boolean
```

Dit objective wordt niet door een passief event voltooid. Alleen een server `quest:turn_in` intent kan condition + consume + transition uitvoeren.

# 8.5 `objective_defeat`

```text
enemyRef XOR enemyTagQuery
targetRef optional encounter/area
requiredAmount
creditPolicy
minimumContributionPercent
uniqueInstanceCredit boolean
```

Event: `enemy.defeated` met server-authoritative killer/contributiondata.

# 8.6 `objective_reach`

```text
targetRef anchor/area
radiusOverride optional
stayDurationMs default 0
mustEnterFromOutside boolean
```

Server controleert position tegen target bounds; clientmelding is slechts hint.

# 8.7 `objective_discover`

```text
discoveryRef of zoneRef
requiredAmount default 1
```

Event: `location.discovered`.

# 8.8 `objective_craft`

```text
recipeRef optional
itemRef/itemTagQuery optional
requiredAmount
craftedAfterActivation boolean
```

In NODE-04 is `item.crafted` een geregistreerd event. De node mag met `itemRef` al werken. `recipeRef` wordt pas valide als NODE-05 `recipe_definition` publiceert; tot die tijd geeft de editor een expliciete `dependency_not_available_until_node_05`-melding en verbergt de recipe-picker.

# 8.9 `objective_equip`

```text
itemRef/itemTagQuery optional
slotRef optional
minimumDurationMs default 0
```

Event/statecheck: `item.equipped` + current equipment.

# 8.10 `objective_use_item`

```text
itemRef/itemTagQuery
targetRef optional
requiredAmount
```

Event: `item.used`.

# 8.11 `objective_use_ability`

```text
abilityRef/abilityTagQuery
targetRef optional
hitRequired boolean
requiredAmount
```

Event: `ability.used` of `ability.hit_confirmed`.

# 8.12 `objective_escort`

```text
entityTargetRef
destinationTargetRef
maxDistance optional
failOnEntityDeath boolean
failOnPlayerLeaveZone boolean
```

Server state: escort instance + `escort.arrived`/failure event.

# 8.13 `objective_protect`

```text
targetRef entity/area/encounter
durationSeconds optional
encounterRef optional
minimumRemainingHealth optional
failurePolicy
```

# 8.14 `objective_timer`

```text
durationSeconds
countMode realtime | online_time | in_zone_time | in_area_time
pauseConditions optional
resetConditions optional
```

Timerdeadline wordt server-side opgeslagen. Geen client `setTimeout` als authority.

# 8.15 `objective_currency`

```text
currencyRef
mode earned_since_active | possess | spend
requiredAmountMinor
```

`spend` vereist een expliciete serveractie/turn-in; een willekeurige aankoop telt niet automatisch tenzij sourcefilter dat toestaat.

# 8.16 `objective_dialogue_choice`

```text
dialogueRef
choiceId
requiredAmount default 1
```

Event: `dialogue.choice_selected`.

# 8.17 `objective_custom_event`

```text
eventType uit registry
source/target filters
payloadNumericField optional
requiredAmount
```

Publicatie faalt bij niet-geregistreerde eventtypes of niet-whitelisted payloadpaden.

---

# 9. Condition-nodecontract

Alle conditions worden gecompileerd naar een declaratieve AST:

```json
{
  "kind": "all",
  "children": [
    { "kind": "player_level", "operator": ">=", "value": 3 },
    { "kind": "has_item", "itemId": "item.wood_normal", "amount": 10 }
  ]
}
```

De evaluator is pure logic waar mogelijk en ontvangt een expliciete `EvaluationContext`:

```text
playerSnapshot
questRuntimeState
inventorySnapshot
walletSnapshot
zoneContext
partyContext
worldState
currentTime
published registries
```

# 9.1 `condition_has_item`

```text
itemRef XOR itemTagQuery
amount
comparison >= | == | <=
includeEquipment boolean
includeEscrow fixed false
bindStateFilter optional
```

# 9.2 `condition_has_currency`

```text
currencyRef
amountMinor
comparison
```

# 9.3 `condition_player_level`

```text
value/formula
comparison
```

# 9.4 `condition_quest_state`

```text
questRef
stepRef optional
allowedStates[]
```

# 9.5 `condition_objective_state`

```text
questRef
objectiveRef
comparison state | amount
state completed/active/failed
amount optional
```

# 9.6 `condition_ability_unlocked`

```text
abilityRef
minimumRank
negate boolean
```

# 9.7 `condition_equipment`

```text
slotRef optional
itemRef/itemTagQuery optional
mode equipped | not_equipped
```

# 9.8 `condition_tag_or_flag`

```text
scope character | account | party | instance | world
tagOrFlagId
test has | lacks | value_equals | value_compare
value optional
```

# 9.9 `condition_reputation`

NODE-04 implementeert de evaluator en statevorm; reputation mutations kunnen al door actions worden geschreven. Full faction UI/vendors komen NODE-05.

```text
reputationRef/factionRef
comparison
value/rank
```

# 9.10 `condition_discovery`

```text
zoneRef/discoveryRef/fastTravelRef
mode discovered | not_discovered | unlocked
```

# 9.11 `condition_time_weather`

```text
timeStart/timeEnd optional
weekday/dayIndex optional
weatherTagQuery optional
zoneRef optional
```

# 9.12 `condition_party`

```text
minimumSize/maximumSize
leaderOnly
roleRequired optional
allMembersCondition optional
sameZone boolean
```

In NODE-04 kan deze condition alleen `self/no party` en een voorbereid partycontextcontract evalueren. NODE-05 activeert de volledige partyservice. De compiler markeert partyconditions als `requiresFeature: party`.

# 9.13 `condition_entity_world_state`

```text
targetRef/entityRef/encounterRef
stateKey whitelisted
operator
value
scope instance | zone | world
```

---

# 10. Action- en Reward-nodecontract

Iedere muterende action heeft deze compiled metadata:

```text
actionId
kind
requiresTransaction
requiresPlayerLock
idempotent
permissionScope
payload
```

De `quest-action-executor` gebruikt NODE-03 `game-mutation-service` voor owned assets. Geen directe losse SQL in individuele actionhandlers.

# 10.1 `action_give_item`

```text
itemRef
amount/formula
quality optional
bindOverride optional
reason/source automatisch
```

Outputtype: `action` en `rewardEntry`-compatibel.

# 10.2 `action_remove_item`

```text
itemRef/itemTagQuery
amount
selectionPolicy exact_stack | oldest_first | lowest_quality_first
insufficientPolicy fail_transaction | skip_action
```

# 10.3 `action_give_currency`

```text
currencyRef
amountMinor/formula
capPolicy fail | clamp
```

# 10.4 `action_spend_currency`

```text
currencyRef
amountMinor/formula
insufficientPolicy fail_transaction
```

# 10.5 `action_give_xp`

```text
amount/formula/xpRuleRef
sourceReason
```

# 10.6 `action_unlock_ability`

```text
abilityRef
rank
existingPolicy keep_higher | set_exact | increment_rank
```

# 10.7 `action_unlock_recipe`

Runtime/statecontract wordt nu voorbereid; definitie en crafting komen NODE-05.

```text
recipeRef
```

Zonder published Recipe Definition blokkeert execution en publish indien de action bereikbaar is.

# 10.8 `action_unlock_zone_travel`

```text
zoneRef
zoneLinkRef/fastTravelRef optional
mode discover | unlock_entry | unlock_fast_travel
```

# 10.9 `action_set_tag_flag`

```text
scope character | account | party | instance | zone | world
id
operation add | remove | set
value type-safe
```

# 10.10 `action_start_quest`

```text
questRef
mode offer | accept | force_start
track boolean
```

`force_start` alleen voor trusted server-authored flows; niet vanuit clientpayload.

# 10.11 `action_advance_quest`

```text
questRef
stepRef/objectiveRef
mode complete_objective | complete_step | activate_step
```

Alleen intern/trusted action; public client API accepteert dit niet.

# 10.12 `action_complete_fail_quest`

```text
questRef
state completed | failed | abandoned
reason
```

# 10.13 `action_show_hide_marker`

```text
markerRef/questMarkerRuleRef
action show | hide | replace
targetRef optional
```

Dit schrijft alleen presentation override indien nodig; normale markers worden afgeleid.

# 10.14 `action_spawn_despawn`

```text
spawnControllerRef/entityRef
action activate | deactivate | spawn_once | despawn
scope instance | zone | world
```

# 10.15 `action_change_entity_state`

```text
targetRef/entityRef/encounterRef
stateKey whitelisted
value
duration optional
```

# 10.16 `action_teleport`

```text
zoneRef
spawnPointRef/anchorRef
transitionMode safe | portal | scripted
```

Gebruikt NODE-02 `zone-transition-service`; nooit directe clientpositie.

# 10.17 `action_set_checkpoint`

```text
checkpointRef
scope character | party | instance
```

# 10.18 `action_grant_reputation`

```text
reputationRef/factionRef
delta/formula
```

# 10.19 `action_play_audio`

```text
audioEventRef
targetRef optional
scope player | party | zone
```

# 10.20 `action_play_vfx`

```text
vfxRef
targetRef/anchorRef
scope player | party | zone
```

# 10.21 `action_start_dialogue`

```text
dialogueRef/dialogueRouterRef
speakerTargetRef optional
entryPoint optional
```

# 10.22 `action_start_cutscene`

Definieer het nodecontract en compiled actiontype, maar implementeer in NODE-04 alleen een duidelijke `feature_not_available` validation tenzij een bestaande cutsceneruntime aanwezig is. Geen half cutscenesysteem bouwen.

---

# 11. Dialogue-nodes

Dialogue is een eigen compiled flow met runtime sessionstate.

# 11.1 `dialogue_definition`

**Inputs:** optional availability condition.

**Outputs:**

```text
dialogueDef
start flow
```

**Velden:**

```text
dialogueId
speakerDefaultRef optional
speakerNameTemplate optional
title optional
scope player | party
interruptPolicy allowed | blocked_during_critical_action
resumePolicy restart | resume_node | close
rememberChoices boolean
contentVersion integer
tags tagList
```

# 11.2 `dialogue_line`

**Input:** `flowIn`

**Output:** `flow`

**Velden:**

```text
lineId
speakerRef optional, default from definition
text tokenText or textTemplateRef
voiceAudioRef optional
animationCue optional enum/ref
portrait/iconRef optional
autoAdvanceMs optional
skippable boolean
```

Tokenresolver ontvangt een whitelistcontext en levert server-side of compile-time resolved segments. De client krijgt geen onbeperkte objectgraph.

# 11.3 `dialogue_choice`

**Input:** `flowIn`

**Dynamic outputs:** één per choice, maximaal 12.

Per choice:

```text
choiceId
text tokenText
conditionRef optional
actions actionList optional
hiddenWhenUnavailable boolean
disabledReason tokenText optional
remember boolean
```

De client stuurt alleen `dialogueSessionId`, `choiceId`, `operationId`. De server controleert dat de choice op het huidige node beschikbaar is.

# 11.4 `dialogue_branch`

**Inputs:** `flowIn`, condition.

**Outputs:** true/false flow.

Wordt automatisch server-side geëvalueerd zonder playerinput.

# 11.5 `dialogue_action`

**Inputs:** `flowIn`, actionList.

**Output:** `flow`.

**Velden:** `waitForCompletion`, `onFailure=stop|alternate_output`; bij alternate krijgt node een `failed` flowoutput.

# 11.6 `dialogue_call`

**Input:** flow, exact dialogueRef.

**Output:** return flow.

**Velden:**

```text
entryPoint optional
returnPolicy return | close_parent
maxDepth default 8
```

Compiler blokkeert recursive callcycles boven maxDepth.

# 11.7 `dialogue_end`

**Input:** flow.

**Output:** `dialogueTerminal`.

**Velden:**

```text
resultId optional
closeUI boolean
emitCompletedEvent boolean
```

# 11.8 `dialogue_router`

**Inputs:** condition/route definitions.

**Output:** `dialogueRouterDef`.

**Velden/routevolgorde:**

```text
readyToTurnInDialogueRef
activeQuestDialogueRef
availableQuestDialogueRef
completedQuestDialogueRef
defaultDialogueRef
priorityRoutes[]
```

Evaluatievolgorde is expliciet:

1. custom priority routes;
2. ready to turn in;
3. active;
4. available;
5. completed;
6. default.

`dialogue_provider_component` en `quest_giver_component` uit NODE-02/03 gebruiken deze router.

---

# 12. Quest Giver en targetintegratie

Breid `quest_giver_component` uit/implementeer definitief met:

```text
questRefs[]
dialogueRouterRef
offerPolicy automatic | choose_from_list | priority_first
markerAvailableRef optional
markerTurnInRef optional
interactionPrompt tokenText
```

Runtimeflow bij interactie:

```text
client interact intent
-> server valideert zone/range/LOS/entity enabled
-> resolve quest giver component
-> evaluate dialogue router + quest availability
-> open dialogue session
-> send authoritative dialogue node
```

`quest_target_binding` publiceert:

```json
{
  "id": "target.zone_home.npc.bram",
  "zoneId": "zone.home_base",
  "kind": "entity",
  "entityId": "entity.zone_home.bram",
  "roles": ["talk", "turn_in", "quest_giver"],
  "markerAnchor": { "type": "entity", "offsetY": 2.2 }
}
```

Questcompiled data bevat alleen target ID; de runtime resolveert target via actieve zonepackage/registry.

---

# 13. Tokencontext voor quests en dialogue

Breid NODE-01 tokenresolver uit met expliciete runtime namespaces.

## 13.1 Compile-time

```text
@{global.game_name}
@{item.wood_normal.displayName}
@{ability.attack_1.displayName}
@{currency.gold.displayName}
@{quest.main.blacksmith_supplies.displayName}
```

## 13.2 Quest instance

```text
@{quest.current.id}
@{quest.current.displayName}
@{quest.current.state}
@{step.current.id}
@{step.current.instruction}
@{objective.collect_wood.currentAmount}
@{objective.collect_wood.requiredAmount}
@{reward.gold.amount}
```

## 13.3 Player

```text
@{player.displayName}
@{player.level}
@{player.inventory.item.wood_normal.amount}
@{player.currency.gold.amount}
@{player.ability.attack_1.rank}
```

## 13.4 Target/entity

```text
@{target.current.displayName}
@{entity.npc.bram.displayName}
@{zone.current.displayName}
```

## 13.5 Veiligheidsregels

- Geen arbitrary path traversal.
- Geen prototypes, methods of raw database rows.
- Resolver gebruikt registered property descriptors.
- Sensitive values, IDs of internal sessiondata worden niet exposed.
- Unknown compile-time token = publish error.
- Runtime token zonder waarde = configured fallback of UI placeholder; geen raw unresolved token.
- Tokenpreview in editor laat sample/mock context zien maar schrijft geen fake playerstate.

---

# 14. Quest runtime/state-machinecontract

Implementeer geen externe state-machine dependency tenzij die al in de repo staat. Maak een kleine declaratieve questruntime passend bij het bestaande project.

## 14.1 Compiled questgraph

Per quest:

```text
quest definition
step nodes map
flow transitions map
entry step(s)
terminal nodes
join metadata
objective definitions
condition ASTs
action plans
event subscription index
target dependencies
token dependencies
contentVersion/hash
```

## 14.2 Runtime queststate

```json
{
  "questId": "quest.main.blacksmith_supplies",
  "state": "active",
  "contentVersion": 1,
  "activeStepIds": ["step.collect_wood"],
  "completedStepIds": ["step.talk_bram"],
  "failedStepIds": [],
  "branchState": {},
  "joinState": {},
  "revision": 7,
  "tracked": true,
  "startedAt": "...",
  "updatedAt": "..."
}
```

## 14.3 Queststates

```text
locked
available
offered
active
ready_to_turn_in
completed
failed
abandoned
cooldown
```

`ready_to_turn_in` is een derived quest/stepstatus wanneer alle turn-inrequirements voldaan zijn maar de expliciete turn-in nog niet is uitgevoerd.

## 14.4 Concurrency

Iedere mutation bevat expected quest revision. Binnen één SQLite transaction:

```text
read current state
verify revision/current step
reserve operationId
re-evaluate conditions
apply actions/reward via shared mutation service
update objective/quest state revision +1
write event receipts/audit
complete operationId
commit
```

Bij stale revision: return `409 quest_revision_conflict` met actuele state. Client refetcht/merget niet zelf.

## 14.5 Contentupdates

Elke quest heeft `contentVersion` en `migrationPolicy`.

Bij publish moet de compiler bepalen of actieve players een breaking wijziging kunnen ondervinden:

```text
step verwijderd
objective ID verwijderd/type veranderd
branch/join structuur veranderd
reward gewijzigd
quest scope/repeat veranderd
```

De publishpreview toont affected active questinstances. Apply vereist expliciete migrationstrategie.

---

# 15. Event-driven progressie

Gebruik `gameplay_events` uit NODE-03 als audit/dedupebron en een in-memory dispatcher voor live spelers.

## 15.1 Canonical eventregistry

Minimaal registreren:

```text
quest.offered
quest.accepted
quest.abandoned
quest.step_activated
quest.step_completed
quest.completed
quest.failed
objective.progressed
objective.completed
entity.interacted
dialogue.started
dialogue.line_shown
dialogue.choice_selected
dialogue.completed
item.acquired
item.removed
item.used
item.crafted
item.equipped
inventory.changed
currency.changed
ability.used
ability.hit_confirmed
enemy.defeated
resource.gathered
location.reached
location.discovered
zone.entered
checkpoint.activated
escort.arrived
escort.failed
encounter.completed
encounter.failed
timer.completed
world.flag_changed
party.objective_completed
```

## 15.2 Dispatcherflow

```text
gameplay mutation commits
-> durable gameplay_event row indien relevant
-> in-memory event dispatcher
-> find subscriptions by event type/player active quests
-> filter refs/tags/zone/scope
-> calculate progress delta
-> idempotent event receipt check
-> update objective/step/quest transactionally
-> broadcast quest delta/markers/notifications
```

De oorspronkelijke gameplay transaction en questprogress transaction mogen voor kritieke events in één transaction/servicecall worden gecombineerd. Waar dat niet kan, voorkomt `player_quest_event_receipts` dubbele verwerking.

## 15.3 Login recovery

Bij login:

- laad actieve queststates/objectives;
- valideer contentVersion;
- herbereken state-based objectives zoals current inventory, currency, equipment, discovery;
- verwerk geen oude eventlog volledig opnieuw;
- herstel timers/deadlines;
- stuur quest snapshot en markers.

---

# 16. Database-migratie

Maak:

```text
db/migrations/007_campaign_quest_dialogue_progress.sql
```

Verplichte SQL-verantwoordelijkheden:

```sql
CREATE TABLE IF NOT EXISTS player_quest_states (
  player_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  content_version INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN (
    'locked', 'available', 'offered', 'active',
    'ready_to_turn_in', 'completed', 'failed',
    'abandoned', 'cooldown'
  )),
  active_step_ids_json TEXT NOT NULL DEFAULT '[]',
  completed_step_ids_json TEXT NOT NULL DEFAULT '[]',
  failed_step_ids_json TEXT NOT NULL DEFAULT '[]',
  branch_state_json TEXT NOT NULL DEFAULT '{}',
  join_state_json TEXT NOT NULL DEFAULT '{}',
  tracked INTEGER NOT NULL DEFAULT 0 CHECK (tracked IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1,
  started_at TEXT,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  failed_at TEXT,
  cooldown_until TEXT,
  PRIMARY KEY (player_id, quest_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_quest_state
  ON player_quest_states(player_id, state, updated_at);

CREATE TABLE IF NOT EXISTS player_objective_progress (
  player_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  objective_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('inactive', 'active', 'completed', 'failed')),
  current_amount REAL NOT NULL DEFAULT 0,
  required_amount REAL NOT NULL,
  progress_json TEXT NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 1,
  activated_at TEXT,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (player_id, quest_id, step_id, objective_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_objective_active
  ON player_objective_progress(player_id, state, quest_id);

CREATE TABLE IF NOT EXISTS player_quest_event_receipts (
  player_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  objective_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  applied_delta REAL NOT NULL DEFAULT 0,
  processed_at TEXT NOT NULL,
  PRIMARY KEY (player_id, quest_id, objective_id, event_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES gameplay_events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_dialogue_choices (
  player_id TEXT NOT NULL,
  dialogue_id TEXT NOT NULL,
  choice_id TEXT NOT NULL,
  quest_id TEXT,
  selected_count INTEGER NOT NULL DEFAULT 1,
  first_selected_at TEXT NOT NULL,
  last_selected_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (player_id, dialogue_id, choice_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_flags (
  player_id TEXT NOT NULL,
  flag_id TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('boolean', 'number', 'text', 'json')),
  value_json TEXT NOT NULL,
  source_ref TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, flag_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_reputation (
  player_id TEXT NOT NULL,
  reputation_id TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, reputation_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_recipe_unlocks (
  player_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  unlock_source TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, recipe_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_discoveries (
  player_id TEXT NOT NULL,
  discovery_id TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  discovered_at TEXT NOT NULL,
  source_ref TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, discovery_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_fast_travel_unlocks (
  player_id TEXT NOT NULL,
  travel_ref TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  source_ref TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, travel_ref),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_active_timers (
  player_id TEXT NOT NULL,
  timer_id TEXT NOT NULL,
  quest_id TEXT,
  step_id TEXT,
  objective_id TEXT,
  timer_mode TEXT NOT NULL,
  started_at TEXT NOT NULL,
  deadline_at TEXT,
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL CHECK (state IN ('running', 'paused', 'completed', 'cancelled')),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, timer_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quest_transition_audit (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT,
  from_step_ids_json TEXT NOT NULL DEFAULT '[]',
  to_step_ids_json TEXT NOT NULL DEFAULT '[]',
  reason TEXT NOT NULL,
  event_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quest_transition_player
  ON quest_transition_audit(player_id, quest_id, created_at);
```

## 16.1 Scopes buiten character

NODE-04 implementeert volledig `character`. Voor `account`, `party`, `instance` en `world`:

- compiler accepteert de enum;
- runtime geeft een expliciete unsupported error wanneer de service voor die scope ontbreekt;
- main acceptance gebruikt character scope;
- NODE-05 activeert party/account/marketgerelateerde scopes waar vereist.

Geen fake character-copy gebruiken om party/world scope te simuleren.

## 16.2 SQLitegebruik

- `PRAGMA foreign_keys=ON` behouden;
- korte transacties;
- prepared statements;
- indexes zoals hierboven;
- geen JSON1-afhankelijkheid als project die niet al garandeert;
- JSON-kolommen worden door services gevalideerd en canoniek geserialiseerd;
- operation idempotency uit NODE-03 wordt hergebruikt.

---

# 17. Serverarchitectuur

Maak minimaal deze files:

```text
src/server/campaign-compiler.js
src/server/quest-graph-validator.js
src/server/quest-service.js
src/server/quest-event-service.js
src/server/objective-service.js
src/server/condition-evaluator.js
src/server/quest-action-executor.js
src/server/reward-service.js
src/server/dialogue-compiler.js
src/server/dialogue-service.js
src/server/quest-marker-service.js
src/server/runtime-token-resolver.js
src/server/quest-migration-service.js
src/shared/quest-contract.js
src/shared/dialogue-contract.js
src/shared/gameplay-event-contract.js
```

Indien de repo na NODE-03 een `src/server/services/`-conventie heeft, plaats ze daar consistent. Maak geen duplicate serviceboom.

# 17.1 `campaign-compiler.js`

Verantwoordelijkheden:

- collect campaign/chapter/quest/dialogue source nodes via Group/package resolution;
- normalize IDs/refs/tokens;
- compile flow edges;
- build reachability and event indexes;
- compile conditions/actions/objectives;
- output deterministic campaign package;
- calculate content hashes;
- never read/write playerstate.

# 17.2 `quest-graph-validator.js`

- reachable start;
- terminal reachability;
- cycles only where explicitly permitted;
- parallel/join correctness;
- duplicate step/objective IDs;
- target/catalog refs;
- action/condition safety;
- content update compatibility.

# 17.3 `quest-service.js`

- list available/active/completed quests;
- offer/accept/abandon/track;
- activate steps;
- transition steps;
- turn-in;
- claim manual rewards;
- snapshots/deltas;
- revisions/locking/idempotency.

# 17.4 `quest-event-service.js`

- event subscriptions per active player quest;
- dedupe receipts;
- progress calculation;
- event-driven transition;
- no full scan of every published quest per event.

# 17.5 `objective-service.js`

Registry pattern:

```js
const objectiveExecutors = new Map([
  ["talk", talkObjective],
  ["collect", collectObjective],
  ["deliver", deliverObjective],
  // ...
]);
```

Iedere executor heeft:

```text
validateDefinition
subscriptions
initializeState
applyEvent
reconcileState
canTurnIn
```

# 17.6 `condition-evaluator.js`

- pure recursive AST evaluator;
- registered handlers;
- typed comparisons;
- no side effects;
- returns `{ value, reasons[], dependencies[] }` voor editor/debug;
- runtime fail-closed bij unknown condition.

# 17.7 `quest-action-executor.js`

- registered action handlers;
- transaction plan opbouwen;
- classify mutating/non-mutating;
- reuse game mutation service;
- action permissions;
- operation IDs;
- rollback/error policy.

# 17.8 `reward-service.js`

- reward preview;
- capacity/overflow validation;
- apply as atomic action sequence;
- ledger entries;
- idempotent claim;
- notification payload.

# 17.9 `dialogue-service.js`

- create authoritative dialogue session;
- current node/choice validation;
- condition evaluation;
- token resolution;
- actions;
- choice persistence;
- timeout/close/disconnect cleanup;
- resume according to definition.

# 17.10 `quest-marker-service.js`

- derive active markers from quest state/rules;
- resolve targets in active/unloaded zones;
- fallback to zone entry target;
- produce minimap/world map delta;
- no permanent duplicate marker rows required for derived markers.

# 17.11 `quest-migration-service.js`

- preview active affected players;
- map old step/objective IDs through aliases;
- apply selected migration policy;
- write audit;
- never silently restart quests.

---

# 18. Publish- en compiled packagecontract

Breid World Assembly manifest uit:

```json
{
  "campaigns": {
    "packageIds": ["package.campaign.main"],
    "campaignIndex": {},
    "questIndex": {},
    "dialogueIndex": {},
    "hash": "sha256..."
  }
}
```

Maak afzonderlijke immutable published package rows/files volgens NODE-01/02 packageopslag:

```text
published_game_packages
package_kind = campaign
package_id
build_id
content_hash
package_json
```

## 18.1 Quest compiled shape

```json
{
  "id": "quest.main.blacksmith_supplies",
  "version": 1,
  "scope": "character",
  "repeatPolicy": "once",
  "entryNodeId": "step.talk_bram",
  "steps": {},
  "transitions": {},
  "objectives": {},
  "conditions": {},
  "actions": {},
  "rewards": {},
  "eventSubscriptions": {},
  "targetDependencies": [],
  "tokenDependencies": [],
  "contentHash": "..."
}
```

## 18.2 Determinisme

- sort maps/lists canonical op IDs;
- graphcanvas x/y beïnvloedt hash niet;
- labels die runtimepresentation beïnvloeden wel;
- dezelfde graph/revision maakt dezelfde packagehash;
- runtime leest alleen packages van dezelfde buildId als rootmanifest/zones/catalogs.

---

# 19. API-contract

Voeg routes toe binnen de bestaande serverrouterconventie.

## 19.1 Editor

```text
GET  /api/editor/campaigns/preview
GET  /api/editor/quests/:questId/compiled-preview
POST /api/editor/quests/:questId/validate
POST /api/editor/dialogues/:dialogueId/preview
POST /api/editor/tokens/runtime-preview
GET  /api/editor/quest-migrations/preview
POST /api/editor/quest-migrations/apply
```

Editor runtime-preview gebruikt een expliciet geselecteerde testcontext of sample values; maakt geen persistente fake player aan.

## 19.2 Game player quests

```text
GET  /api/game/quests
GET  /api/game/quests/:questId
POST /api/game/quests/:questId/accept
POST /api/game/quests/:questId/abandon
POST /api/game/quests/:questId/track
POST /api/game/quests/:questId/turn-in
POST /api/game/quests/:questId/claim-reward
```

Alle muterende requests:

```json
{
  "operationId": "client-generated-uuid",
  "expectedRevision": 7,
  "targetRef": "target.zone_home.npc.bram"
}
```

Server ontleent playerId uit sessie. Geen playerId uit request vertrouwen.

## 19.3 Dialogue

```text
POST /api/game/dialogue/start
GET  /api/game/dialogue/:sessionId
POST /api/game/dialogue/:sessionId/choose
POST /api/game/dialogue/:sessionId/continue
POST /api/game/dialogue/:sessionId/close
```

Bij voorkeur live via WebSocket; HTTP blijft recovery/testpad.

## 19.4 Errorcodes

Minimaal:

```text
quest_not_found
quest_not_available
quest_already_active
quest_already_completed
quest_revision_conflict
quest_wrong_target
quest_out_of_range
quest_turn_in_requirements_missing
quest_reward_capacity_blocked
quest_operation_conflict
dialogue_not_found
dialogue_session_not_found
dialogue_choice_unavailable
dialogue_wrong_current_node
dialogue_target_out_of_range
content_version_mismatch
feature_not_available
```

---

# 20. WebSocket-contract

Breid de bestaande MMO-verbinding uit, geen tweede socket.

## Client -> server

```text
quest:request_snapshot
quest:accept
quest:abandon
quest:track
quest:turn_in
quest:claim_reward
dialogue:start
dialogue:continue
dialogue:choose
dialogue:close
```

## Server -> client

```text
quest:snapshot
quest:delta
quest:available_changed
quest:objective_progress
quest:step_changed
quest:completed
quest:failed
quest:error
dialogue:opened
dialogue:node
dialogue:choices
dialogue:closed
dialogue:error
map:quest_markers
notification:show
player:progression_delta
```

## 20.1 Payloadregels

- include `serverTimeMs`, `questRevision`, `buildId` waar relevant;
- geen volledige catalog/zonepackage per update;
- objective progress kan gecollect/batched worden binnen max 50–100 ms, maar completion/turn-in/reward direct;
- kritieke events worden niet weggegooid bij `bufferedAmount`-druk;
- niet-kritieke progress-intermediate updates mogen coalescen tot de nieuwste waarde;
- reconnect vraagt snapshot, niet iedere delta replayen.

---

# 21. Client- en runtime-UI

NODE-04 implementeert minimaal functionele nodes/modules, passend in NODE-03/UI-output.

# 21.1 `quest_tracker_hud`

**Inputs:** quest runtime context.

**Output:** `uiModule`.

**Velden:**

```text
hudId
anchor
maxTrackedQuests
showQuestTitle
showStepTitle
showObjectives
showAmounts
showZoneName
clickMarkerFocus
compact/mobile layout
```

Runtime gebruikt tokenized compiled instructions. Geen client-side questlogic.

# 21.2 `dialogue_hud`

```text
hudId
layout mode panel/modal/bottom
showPortrait
showSpeaker
continueInputAction
choiceNumberHotkeys
mobileChoiceButtons
textSpeed
allowInstantComplete
```

# 21.3 `notification_hud`

```text
quest accepted/completed
objective completed
item/currency/xp reward
ability unlocked
zone/travel unlocked
error notifications
queue length/rate limit
```

# 21.4 Journalbasis

Voeg een eenvoudige questjournalview toe, node-driven via UI module of als deel van quest tracker:

- available/active/completed tabs;
- campaign/chapter grouping;
- selecteer/track;
- objective status;
- geen editor/debugdata tonen;
- lazy render voor grote lijsten.

# 21.5 Map/minimap

- consume `map:quest_markers`;
- follow moving entity target;
- unloaded-zone target -> zone-entry fallback;
- clicking marker mag alleen UI focus/navigation triggeren, niet teleporteren;
- `showQuestMarkers` op bestaande minimap HUD wordt door daadwerkelijke markerregistry gevoed.

---

# 22. Editor-UX

## 22.1 Node Library

Nieuwe hoofdgroepen:

```text
Story / Campaign
Story / Quest Flow
Story / Objectives
Logic / Conditions
Logic / Actions
Story / Dialogue
Story / Rewards
```

Search ondersteunt ID, label, eventtype, targetref en nodekind.

## 22.2 Flowedges

- duidelijk andere kleur/dikte/pijl dan datakabels;
- edge label op outputnaam (`completed`, `false`, choice text verkort);
- flowcycle highlight;
- dead/unreachable node badge;
- first-step badge;
- terminal badge.

## 22.3 Referencepicker

- typed filter voor quest/target/item/currency/ability/dialogue/marker;
- toont source Group/Zone/Catalog;
- klik/focus definition;
- usage count;
- broken status;
- no per-definition cable.

## 22.4 Token editor

- `@` autocomplete;
- toont static/runtime kleurverschil;
- preview van current objective/reward sample;
- duplicate-hardcoded-value warning;
- unresolved token inline error.

## 22.5 Quest debugger

Maak een editor-only inspectpanel, geen alternatieve authoringbron:

```text
compiled flow
reachable/unreachable
subscription events
resolved targets
resolved tokens
action transaction plan
active test state preview
```

Geen knop die echte playerprogressie mutereert zonder expliciete testaccount/debugpermission.

---

# 23. Validationcodes

Gebruik stable machine-readable codes naast menselijk bericht.

## Graph/flow

```text
QUEST_MISSING_START
QUEST_MULTIPLE_START_EDGES
QUEST_UNREACHABLE_STEP
QUEST_NO_TERMINAL
QUEST_ILLEGAL_FLOW_CYCLE
QUEST_BRANCH_MISSING_FALSE
QUEST_PARALLEL_NO_JOIN_WARNING
QUEST_JOIN_INPUT_UNREACHABLE
QUEST_DUPLICATE_STEP_ID
QUEST_DUPLICATE_OBJECTIVE_ID
QUEST_DYNAMIC_PORT_LIMIT
DIALOGUE_MISSING_START
DIALOGUE_UNREACHABLE_NODE
DIALOGUE_CALL_CYCLE
DIALOGUE_CHOICE_NO_OUTPUT
```

## Refs/tokens/targets

```text
QUEST_TARGET_REF_MISSING
QUEST_TARGET_ROLE_MISMATCH
QUEST_ITEM_REF_MISSING
QUEST_CURRENCY_REF_MISSING
QUEST_ABILITY_REF_MISSING
QUEST_DIALOGUE_REF_MISSING
QUEST_MARKER_REF_MISSING
QUEST_WRONG_REF_TYPE
QUEST_STATIC_TOKEN_UNKNOWN
QUEST_RUNTIME_TOKEN_UNKNOWN
QUEST_TARGET_IN_UNPUBLISHED_ZONE
```

## Objectives/conditions/actions

```text
OBJECTIVE_MISSING_EVENT_OR_TARGET
OBJECTIVE_REQUIRED_AMOUNT_INVALID
OBJECTIVE_DELIVER_NO_REQUIREMENTS
OBJECTIVE_DELIVER_CONSUME_MISMATCH
OBJECTIVE_UNSUPPORTED_FEATURE
CONDITION_EMPTY_GROUP_AMBIGUOUS
CONDITION_INVALID_COMPARISON
CONDITION_UNKNOWN_KIND
ACTION_UNKNOWN_KIND
ACTION_MUTATING_IN_NON_ATOMIC_PARALLEL
ACTION_REWARD_NO_IDEMPOTENCY_SOURCE
ACTION_TELEPORT_TARGET_INVALID
ACTION_RECIPE_REF_UNAVAILABLE
REWARD_BUNDLE_NON_ATOMIC
REWARD_OVERFLOW_POLICY_INVALID
```

## Content update

```text
QUEST_ACTIVE_CONTENT_BREAKING_CHANGE
QUEST_STEP_REMOVED_WITH_ACTIVE_PLAYERS
QUEST_OBJECTIVE_TYPE_CHANGED
QUEST_MIGRATION_POLICY_REQUIRED
QUEST_CONTENT_VERSION_NOT_INCREMENTED
```

Warnings:

```text
QUEST_HARDCODED_AMOUNT_HAS_TOKEN_SOURCE
QUEST_NO_MARKER_RULE
QUEST_LONG_DIALOGUE_LINE
QUEST_TOO_MANY_ACTIVE_EVENT_SUBSCRIPTIONS
QUEST_SCOPE_FEATURE_PENDING
```

---

# 24. Migratie en compatibility

## 24.1 Geen bestaande questnodes

De huidige repo heeft nog geen first-class questengine. Daarom is er geen bulkquestmigration behalve eventuele legacy Interactable messages.

## 24.2 Legacy Interactable message

NODE-02 heeft legacy Interactable gemigreerd naar entity/anchor + interaction component. Indien een oude `message` action nog als compatibilityactie bestaat:

- maak geen automatische echte quest;
- converteer naar `text_template` + simpele `dialogue_definition`/line/end;
- interaction component start dialogue;
- toon preview voor apply;
- behoud old message text exact;
- markeer source legacy ID in migration metadata.

## 24.3 Legacy teleport

Blijft NODE-02 Zone Link/action; geen quest aanmaken.

## 24.4 Published compatibility

- NODE-04 rootmanifest zonder campaigns blijft geldig als lege registry;
- game zonder authored quests toont geen quest UI-content;
- bestaande gameplay uit NODE-03 blijft werken;
- campaignpackage is optional totdat Campaign Group aangesloten is;
- unconnected quest/dialogue nodes worden niet gepubliceerd.

---

# 25. Exacte bestandswijzigingen

## Verplicht aanpassen

```text
src/shared/node-types.js
apps/web/public/shared/node-types.js of gegenereerde browser schema-output
src/shared/field-contract.js (indien in NODE-01 ontstaan)
src/server/field-validation.js
src/server/graph-repository.js
src/server/publish-service.js
src/server/server.js
src/server/mmo-service.js
src/server/game-mutation-service.js
src/server/player-state-service.js
src/server/zone-service.js
src/server/checkpoint-service.js
apps/web/public/editor/editor.js
apps/web/public/editor/index.html
apps/web/public/editor/styles.css
apps/web/public/game/game.js
apps/web/public/game/index.html
apps/web/public/game/styles.css
apps/web/public/shared/world-runtime.js
scripts/smoke-test.js
package.json
README/fases/README.md
```

Pas alleen files aan die in de actuele eind-HEAD echt bestaan. Als NODE-01/03 browser-schema heeft gecentraliseerd, verwijder duplicate handmatige schemawijziging.

## Verplicht nieuw

```text
db/migrations/007_campaign_quest_dialogue_progress.sql
src/shared/quest-contract.js
src/shared/dialogue-contract.js
src/shared/gameplay-event-contract.js
src/server/campaign-compiler.js
src/server/quest-graph-validator.js
src/server/quest-service.js
src/server/quest-event-service.js
src/server/objective-service.js
src/server/condition-evaluator.js
src/server/quest-action-executor.js
src/server/reward-service.js
src/server/dialogue-compiler.js
src/server/dialogue-service.js
src/server/quest-marker-service.js
src/server/runtime-token-resolver.js
src/server/quest-migration-service.js
scripts/quest-contract-test.js
scripts/quest-runtime-test.js
README/fases/NODE-04-Campaigns-Quests-Dialogue-Conditions-Actions-Rewards.md
```

## Niet maken

```text
geen tweede database
geen quest.json bronbestand
geen per-quest JavaScriptfile
geen client-only queststore als authority
geen nieuwe WebSocketserver
geen externe workflow/quest SaaS
geen React/Vue rewrite
geen seeded Bram/Wood quest in migration
```

---

# 26. Tests

Voeg `npm test` toe of breid bestaande testscriptconventie uit zonder checks te vervangen.

# 26.1 Compiler/unit

Test minimaal:

- deterministic package/hash;
- start/reachability/terminal;
- branch true/false;
- parallel + join all/any/N;
- illegal cycle;
- duplicate IDs;
- target/ref type resolution;
- token dependencies;
- event subscription index;
- condition AST all/any/not/none;
- action transaction classification;
- objective definitionvalidation;
- dialogue calls/choices/branches;
- content migration diff.

# 26.2 Runtime/service

- quest offer/accept;
- duplicate accept idempotent;
- objective initialization;
- collect current inventory versus acquired-since-active;
- event receipt dedupe;
- level + item condition;
- wrong target turn-in;
- insufficient items leaves state/inventory unchanged;
- valid deliver consumes exact amount;
- reward gives gold/XP/ability once;
- double request same operation returns same result;
- different operation after completion gives no second reward;
- stale revision 409;
- marker transitions;
- timer recovery;
- abandon/restart policy;
- dialogue unavailable choice rejected;
- disconnect/reconnect session recovery;
- content version mismatch behavior.

# 26.3 Database

- migration on empty DB;
- migration on NODE-03 DB;
- foreign keys/indexes;
- transaction rollback;
- unique event receipt;
- quest revision update;
- serverrestart reload.

# 26.4 Smoke vertical slice

Smoke maakt via editor/API dezelfde nodes aan als Kevin:

```text
Catalog definitions from NODE-03
Two zones + quest targets from NODE-02
Campaign/Chapter/Quest/Dialogue nodes from NODE-04
Connections to Campaign Output/Registry/World Assembly/Game Output
Publish
Player accept
Gather 10 wood through real resource endpoint
Ensure level 3 through progression mutation fixture
Turn in at correct target
Verify consume/reward/ability/next step
Restart app
Verify persistence
```

Geen directe inserts voor questdefinitions. Runtime player setup mag testhelpers gebruiken die dezelfde services aanroepen.

# 26.5 Browser

Browsercheck op public/live URL moet minimaal bewijzen:

- editor nodes zichtbaar/connectable;
- publish validation;
- dialogue choice;
- tracker amount update;
- minimap marker switch;
- inventory removal/reward;
- ability hotbar unlock;
- zone transition marker;
- refresh persistence;
- tweede account onafhankelijk.

---

# 27. Kevin-zichtbaar handtestscript

Codex zet dit letterlijk in de fase-doc en voert zoveel mogelijk zelf uit:

```text
1. Open de editor op de publieke GK-URL.
2. Open/maak de Global Catalog Group en controleer Wood, Gold en Attack 1 definitions uit NODE-03.
3. Open Zone Home Base en plaats/selecteer de echte Bram entity.
4. Controleer de Entity Assembly, NPC/Movement/Interaction/Dialogue/Quest Giver components.
5. Controleer Quest Target Binding target.zone_home.npc.bram.
6. Open Zone Road en controleer resource target north_forest.
7. Open Zone Peaks en controleer entry target south_gate.
8. Maak/open Main Campaign Group.
9. Controleer Campaign, Chapter, Quest, Steps, Objectives, Conditions, Reward en Dialogue flow als echte nodes.
10. Controleer dat flowlijnen de questvolgorde tonen.
11. Controleer dat cross-zone targets typed referencevelden zijn en geen lange kabels.
12. Open tokenized questtekst en controleer autocomplete/preview.
13. Save Draft, refresh en controleer dat graph exact blijft.
14. Save To Game en controleer geen publish errors.
15. Log in met testaccount A en open /game/.
16. Loop naar Bram; marker en interactprompt moeten op de bewegende entity staan.
17. Start dialogue; controleer speaker/text/choices.
18. Kies Later; quest mag niet actief worden.
19. Praat opnieuw en kies Accepteren.
20. Controleer questtracker en marker naar Zone Road/resourcegebied.
21. Verzamel minder dan 10 Wood; progress toont actuele waarde.
22. Refresh; progress blijft behouden.
23. Verzamel tot 10 Wood terwijl level nog lager dan 3 is; turn-in mag niet klaar zijn.
24. Bereik level 3 via echte gameplay/testflow; marker wisselt terug naar Bram.
25. Probeer bij verkeerde NPC/afstand in te leveren; server weigert zonder itemverlies.
26. Lever bij Bram in.
27. Controleer exact 10 Wood weg, Gold en XP erbij, Attack 1 unlocked.
28. Dubbelklik turn-in of resend; geen dubbele reward.
29. Controleer volgende step/marker naar Zone Peaks.
30. Ga naar Zone Peaks en voltooi reach objective.
31. Controleer quest completed en volgende quest unlocked/offered volgens node.
32. Logout/login; alle states en rewards blijven correct.
33. Restart de Node-service; login opnieuw en controleer opnieuw.
34. Log in met testaccount B; deze heeft eigen beschikbare quest en nul progress.
35. Controleer Performance HUD/debug: geen per-frame questscan of DB-write.
```

---

# 28. Evidencecontract

Maak:

```text
docs/fases/evidence/node-04-campaigns-quests-dialogue/
```

Verplicht:

```text
README.md
baseline-and-head.md
files-changed.md
migration-proof.md
compiled-campaign-package.json
compiled-quest-package.json
compiled-dialogue-package.json
validation-report.json
quest-database-before.md
quest-database-after.md
turn-in-transaction-proof.md
idempotency-proof.md
restart-persistence-proof.md
two-account-proof.md
performance-proof.md
public-editor-quest-graph.png
public-editor-dialogue-graph.png
public-game-dialogue.png
public-game-quest-tracker-start.png
public-game-marker-resource.png
public-game-marker-turnin.png
public-game-reward-result.png
public-game-zone-peaks-step.png
public-url-browser-log.txt
acceptance-result.md
```

Evidence README vermeldt:

- exacte public URL;
- commit/build ID;
- browser/device;
- databasepad zonder secret;
- testaccounts geanonimiseerd;
- checks;
- pass/fail per acceptancepunt;
- geen localhost screenshot als finale acceptatie.

---

# 29. Performancecontract

Doelhardware blijft Pentium 4417U/4 threads.

## Verplicht

- questcompiler alleen bij draft preview/publish, niet per frame;
- active quest subscription index per player;
- geen scan van alle quests bij ieder event;
- objective progressupdates coalescen waar veilig;
- UI DOM alleen bij delta en met beperkte updatefrequentie;
- tokenized tekst cache per content hash + runtime context revision;
- dialogue session lightweight;
- timer scheduler in één gebudgetteerde serverstructuur, geen interval per timer;
- databasewrites alleen bij mutaties/checkpoints;
- no full player snapshot per objective tick;
- prepared statements/cached compiled packages.

## Metingen

Evidence bevat minimaal:

```text
active quests per player
active objectives
subscriptions per event type
quest event processing p50/p95/max
turn-in transaction duration
quest DB writes during 60 sec idle
quest DB writes during 10 resource gathers
HUD update frequency
WebSocket bytes/messages for quest delta
```

Acceptatie:

- idle quest system: 0 quest DB writes;
- geen lange main-thread spikes door tracker/dialogue;
- 100 authored but inactive quests veroorzaken geen lineaire live eventscan;
- test met minstens 20 active objectives blijft responsief;
- browser/gameplay blijft zichtbaar speelbaar op Kevinhardware.

---

# 30. Security en misbruikpreventie

- server ontleent player/session/zone uit auth state;
- interact/turn-in valideert target, zone, range, LOS waar geconfigureerd;
- server hercontroleert inventory/wallet/level/questrevision;
- choiceId moet op current dialogue node bestaan en beschikbaar zijn;
- client kan geen arbitrary action kind/payload sturen;
- action definitions komen uitsluitend uit published trusted package;
- operationId gekoppeld aan request hash; zelfde ID met andere payload = conflict;
- reward ledger/audit;
- rate limiting op dialogue/quest mutations;
- no raw SQL errors/secrets;
- tokenresolver exposeert whitelist properties;
- event payloads server-generated voor combat/items/currency;
- admin/debug force-progress alleen bestaande editor/admin auth en duidelijk auditlog;
- quest share/party scopes niet improviseren voor gewone client.

---

# 31. Uitdrukkelijk buiten scope

- volledige partyservice en shared questacceptance;
- auction/market/direct trade;
- vendor- en craftingruntime;
- guilds;
- cinematic timeline/cutscene editor;
- voice lip-sync;
- procedural quest generation;
- localization managementsuite buiten basis entries/tokens;
- daily scheduler/live-ops calendar behalve schema/repeatcontract;
- achievementsysteem;
- external analytics platform;
- Graph Assets als aparte documents indien Groups nog de afgesproken basis zijn;
- nieuwe combat-, inventory- of zone-engine naast NODE-02/03.

---

# 32. Verboden shortcuts en faalcriteria

NODE-04 is **niet akkoord** als één van deze voorkomt:

- questflow als hardcoded JS `switch(questId)`;
- questdefinitions in losse JSON bronfile buiten graph/database;
- één megaquestnode met alle steps/objectives/dialogue als verborgen JSON;
- dialogue text direct in interactioncomponent zonder Dialogue Graph;
- client bepaalt objective complete;
- turn-in eerst items verwijdert en daarna reward buiten dezelfde transaction geeft;
- dubbele turn-in dubbele rewards oplevert;
- item/level amount dubbel hardcoded in tekst en logic zonder token;
- cross-zone questkabels door Zone Groups;
- targetcoords gekopieerd in Quest Step in plaats van targetRef;
- iedere gameplayevent alle published quests scant;
- database iedere frame/tick wordt geschreven;
- `eval` of executable formulas;
- runtime raw editorgraph iedere event interpreteert in plaats van compiled package;
- tests direct queststate SQL aanpassen voor normale runtimeproof;
- marker slechts statische 2D stip is en bewegende NPC niet volgt;
- refresh/login/serverrestart questprogress reset;
- tweede account progress deelt zonder scopebeleid;
- public evidence ontbreekt of alleen localhost is;
- fase als klaar wordt gemeld terwijl acceptancequest niet end-to-end speelbaar is.

---

# 33. Definition of Done

- [ ] alle Campaign/Quest/Dialogue nodefamilies bestaan en zijn connectable;
- [ ] flowedges en dataedges zijn duidelijk gescheiden;
- [ ] Campaign Output/Registry/World Assembly compileert;
- [ ] compiled campaign/quest/dialogue packages deterministisch;
- [ ] objective/condition/action registries werken;
- [ ] alle in-scope objectives/conditions/actions geïmplementeerd of expliciet feature-gated zoals beschreven;
- [ ] dialogue sessions server-authoritative;
- [ ] quest event subscriptions/dedupe werken;
- [ ] migration 007 werkt op lege en bestaande DB;
- [ ] quest/objective/dialogue/flags/reputation/discovery state persistent;
- [ ] atomic/idempotent turn-in/reward;
- [ ] runtime tokencontext werkt;
- [ ] questtracker/dialogue/notification UI werkt;
- [ ] markerwissel en cross-zone targetfallback werkt;
- [ ] contentupdate/migration preview bestaat;
- [ ] volledige Bram/Wood/Gold/Ability/Peaks vertical slice via authored nodes werkt;
- [ ] refresh/logout/login/serverrestart behouden state;
- [ ] tweede account onafhankelijk;
- [ ] npm check/test/smoke/browser checks groen;
- [ ] public evidencefolder compleet;
- [ ] geen hardcoded content/parallel systeem toegevoegd.

---

# 34. Verplichte Codex-eindrapportage

Codex eindigt met exact:

1. `Samenvatting`;
2. `Baseline commit en eind-HEAD`;
3. `Aangepaste bestanden met reden per bestand`;
4. `Migration 007 en databaseverantwoordelijkheden`;
5. `Nieuwe node-, datatype- en flowcontracten`;
6. `Campaign/Quest/Dialogue compileroutput`;
7. `Objective/Condition/Action executors`;
8. `Quest runtime, events en persistentie`;
9. `Turn-in/reward transaction en idempotency`;
10. `Tokens, targets en markers`;
11. `API- en WebSocketevents`;
12. `Editor- en game-UI-resultaat`;
13. `Checks en testresultaten`;
14. `Kevin-zichtbare public-URL testresultaten`;
15. `Performance/DB-write bewijs`;
16. `Evidencepaden`;
17. `Bekende beperkingen`;
18. `Expliciet niet uitgevoerd`;
19. `Go/no-go voor NODE-05`.

Een rapport zonder werkende acceptancequest, transactionbewijs en public browserbewijs mag geen `complete` of `akkoord` claimen.

---

# 35. Onderzoeksbasis

De contractkeuzes volgen bruikbare, algemene patronen zonder een nieuwe dependency verplicht te maken:

- Actor/state-machineconcepten scheiden definition, events, state snapshots en persistence; GK implementeert een kleine declaratieve variant passend bij de bestaande server: `https://stately.ai/docs/actors` en `https://stately.ai/docs/persistence`.
- Node-RED Subflows onderbouwen vaste interfaces voor samengevouwen quest/dialoguegroups: `https://nodered.org/docs/user-guide/editor/workspace/subflows`.
- SQLite-transacties en isolation onderbouwen de korte, atomische turn-in/rewardmutaties binnen de bestaande single-serverbasis: `https://www.sqlite.org/lang_transaction.html` en `https://www.sqlite.org/isolation.html`.

GK neemt alleen de principes over. De nodegraph, compiler, runtime en database blijven projecteigen en sluiten aan op de huidige JavaScript/SQLite/Three.js-code.
