# NODE-05 — Crafting, Vendors, Party, Direct Trade, Marketplace, Mail, Complete UI en Finale GameProject-integratie

**Documenttype:** uitvoeringscontract voor Codex  
**Status:** implementeren nadat NODE-04 volledig is geaccepteerd  
**Repository:** `k3v1nc0/GK`  
**Baseline:** eind-HEAD van NODE-04  
**Afhankelijkheden:** alle NODE-01 t/m NODE-04-contracten  
**Vervolg:** geen nieuwe architectuurfase; na acceptatie volgen alleen afzonderlijke gameplay/content- en polishfases op deze fundering  
**Contractversie:** `node-system-contract-v1.0`

---

# 1. Opdracht aan Codex

Rond de eerste volledige GK MMO Node System-architectuur af. Bouw de economy-, crafting-, vendor-, party-, direct-trade-, marketplace-, mail- en complete UI-laag boven op de bestaande node-driven world, catalogs, playerstate, combat en questengine. Voer daarna de gecontroleerde finale cutover uit naar:

```text
Global definition Groups
Zone Groups
Campaign Groups
Player Rules Group
UI Group
        ↓ packages
Catalog / Zone / Campaign Registries
        ↓
World Assembly
        ↓ gameProject
Game Output
        ↓
published root manifest + immutable packages
        ↓
server-authoritative MMO runtime + persistent database state
```

Na deze fase moet Kevin zonder codewijziging vanuit nodes kunnen bepalen:

- welke recipes bestaan;
- welke ingrediënten en stationtypes nodig zijn;
- wat vendors kopen/verkopen en tegen welke regels;
- welke items/currencies verhandelbaar zijn;
- hoe direct trade werkt;
- hoe party’s, party loot en questcredit werken;
- welke marktregels, listingduur, fees/tax en currencies gelden;
- welke NPC/entity een vendor, crafting station of marketplace access biedt;
- welke HUD/menu-modules zichtbaar zijn;
- hoe de complete game wordt gepubliceerd.

Verplichte tastbare verticale integratieslice:

```text
1. Account A en B vormen een party.
2. Party verslaat een enemy en krijgt loot volgens node-defined policy.
3. A verzamelt Wood en Ore.
4. A craft een tradable item bij een echte crafting-station entity.
5. A verkoopt een ander item aan een vendor en koopt een item terug.
6. A en B openen direct trade, wijzigen offers, locken en bevestigen beiden.
7. De trade wisselt item en Gold atomisch zonder duplicatie.
8. A plaatst een crafted item op de markt vanuit Zone Home Base.
9. B koopt dezelfde listing vanuit een andere zone.
10. Item gaat uit escrow naar B; Gold minus fee gaat naar A.
11. Offline/volle-inventory delivery komt via mail/pending delivery.
12. Refresh, logout/login en serverrestart behouden alles.
13. Dezelfde operation/retry/dubbele klik geeft nooit dubbele assets.
14. Finale Game Output gebruikt uitsluitend `gameProject`; legacy direct ports zijn gemigreerd/uitgefaseerd.
15. Een lege database bevat nog steeds geen seeded gamecontent.
```

Codex hoeft niets meer te onderzoeken over economytransacties, escrow, marketflow, party ownership, UI-structuur, migration/cutover of acceptatie. Implementeer dit contract exact binnen de huidige JavaScript/Node/SQLite/Three.js-basis.

---

# 2. Harde projectregels

1. De server is altijd authority voor inventory, currency, crafting, vendor, trade, party, loot en market.
2. Alle concrete items, recipes, offers, fees, policies en UI-keuzes komen uit connected nodes/published packages.
3. Geen hardcoded shopstock, recipe, marketfee of tradeafstand in runtimecode.
4. Geen item/currency mutatie zonder transaction, ledgerreason en operationId.
5. Geen halve trade, halve craft, halve marketbuy of halve vendortransactie.
6. Stackitems en unique item instances blijven verschillende dataobjecten.
7. Market en trade gebruiken escrow/reservation; dezelfde asset kan niet tegelijk equipped, traded, listed, mailed of geconsumeerd zijn.
8. SQLite is de huidige database. Gebruik zijn echte single-writer/transactionmodel; claim geen row-level `FOR UPDATE` dat SQLite niet heeft.
9. Gebruik korte `BEGIN IMMEDIATE`-transacties voor high-value economyoperaties en deterministic mutation order.
10. Geen elke-frame/every-tick databasewrites.
11. Party live state kan in memory, maar membership/invites/loot decisions moeten voldoende persistent/auditable zijn.
12. Geen tweede quest/player/inventory runtime; breid NODE-03/04 services uit.
13. Geen tweede WebSocketverbinding of aparte marketserver.
14. Geen externe commerce/paymentdienst; dit gaat alleen om in-game currency/items.
15. Geen real-money trading, gokken, lootbox-aankopen of cashout.
16. Geen client-side prijs-, fee-, ownership-, capacity- of stockauthority.
17. Finale acceptatie vereist public-URL browserbewijs met twee accounts en database/auditbewijs.
18. Performance op Pentium 4417U blijft gate.
19. Geen seeded acceptance-content in migrations; testcontent wordt via editor/API authored.
20. Game Output blijft het enige publish target.

---

# 3. Tastbaar eindresultaat

## 3.1 Rootgraph

```text
[Catalog Group]
   recipes / vendors / policies / economy rules
        ↓ catalogPackage
[Catalog Registry]

[Player Rules Group]
   party / trade / market / inventory / death rules
        ↓ playerRules

[UI Group]
   HUD / Inventory / Vendor / Crafting / Market / Trade / Party / Map
        ↓ uiPackage

[Zone Groups]
   Vendor Entity / Craft Station / Market Entity / Quest Targets
        ↓ zonePackages

[Campaign Registry]
        ↓
[World Assembly]
        ↓ gameProject
[Game Output]
```

## 3.2 Game

- complete HUD layout;
- party panel/invites;
- personal/party loot UI waar beleid dat vraagt;
- vendor buy/sell;
- crafting recipe list/ingredients/progress/result;
- direct trade double-confirm;
- marketplace browse/list/buy/cancel/my orders;
- mail/pending deliveries;
- inventory/equipment/wallet/hotbar/quest/dialogue/world map samenwerkend;
- serverbevestigde deltas;
- offline/reconnect recovery;
- active zone/minimap/markers blijven correct.

## 3.3 Data/audit

- complete ledger;
- escrow ownership;
- idempotent operations;
- market trades;
- trade history;
- crafting jobs;
- party membership/invites/loot decisions;
- mail attachments;
- reconciliation report;
- geen negative balances/quantities;
- geen orphan locked assets.

---

# 4. Systeemgrenzen

# 4.1 Definitionnodes

Published content:

```text
recipe definitions
ingredients
vendor catalogs/offers
party loot policy
trade policy
market policy
economy tax rules
party/trade/market player rules
UI module definitions
entity access components
```

# 4.2 Runtime state

Database/server memory:

```text
crafting jobs
vendor dynamic stock/restock state
party memberships/invites/live presence
trade sessions/offers/confirmations
market orders/escrow/fills
mail/pending deliveries
ledger/audit/reconciliation
```

# 4.3 Assets

Ownershiplocaties zijn exclusief:

```text
inventory
equipment
trade_escrow
market_escrow
crafting_reservation
mail
vendor_system
consumed
deleted
```

Eenzelfde unique item instance heeft exact één `location_type` en één owner/reservationcontext.

Stackitems gebruiken hoeveelheidreserveringen, niet dezelfde stackhoeveelheid dubbel in meerdere systemen.

---

# 5. Nieuwe typed datatypes

Voeg minimaal toe:

```text
recipeDef
recipeIngredient
craftingPolicy
vendorCatalogDef
vendorOffer
vendorPolicy
partyLootPolicy
partyPolicy
tradePolicy
marketPolicy
economyRule
uiModule
uiLayout
menuLayout
mailPolicy
```

Runtime/API-only contracts:

```text
partySnapshot
tradeSnapshot
marketOrder
marketFill
craftingJob
vendorSession
mailMessage
economyOperationResult
```

Deze runtimecontracts zijn geen nodeporttypes tenzij expliciet nodig voor UI definition composition.

---

# 6. Recipe- en craftingdefinition-nodes

# 6.1 `recipe_definition`

**Groep:** Catalog / Crafting  
**Inputs:**

```text
ingredients        recipeIngredient[] multiple
outputActions      actionList/rewardBundle required
conditions         condition[] optional
```

**Output:** `recipeDef`

**Velden:**

```text
recipeId             identity, namespace recipe.*
displayName          tokenText
description          tokenText
category             text/select
tags                 tagList
stationType          stable string/tag, required
craftDurationMs      integer >= 0
batchAllowed         boolean
maxBatch             integer >= 1
consumeTiming        start | completion
cancelPolicy         no_refund | full_refund | partial_refund
unlockMode           default_available | player_unlock_required
skillRef             optional future typed ref
skillLevelRequired   integer default 0
successPolicy        guaranteed | formula
successFormulaRef    optional, only when formula
qualityFormulaRef    optional
tradabilityOverride  inherit_outputs | bind_outputs
visibleWhenLocked    boolean
contentVersion       integer >= 1
```

**Rules:**

- `outputActions` may grant item(s), byproduct, XP and reputation, but cannot directly start arbitrary client code.
- At least one ingredient or explicit free-recipe flag required.
- Output item definitions must exist.
- `consumeTiming=start` is default for jobs > 0 ms and reserves/consumes atomically.
- Cancellation/refund is explicitly node-defined.

---

# 6.2 `recipe_ingredient`

**Inputs:** optional condition/formula.

**Output:** `recipeIngredient`

**Velden:**

```text
ingredientId
kind                item | item_tag | currency
itemRef             when item
itemTagQuery        when item_tag
currencyRef         when currency
amount/formula
consume             boolean default true
qualityMin optional
bindStateAllowed[] optional
alternativesGroup optional
selectionPolicy exact | oldest_first | lowest_quality_first
```

Alternatives met dezelfde `alternativesGroup` betekenen OR. Verschillende groepen/losse entries betekenen AND.

---

# 6.3 `crafting_policy`

**Scope:** Global Player Rules/Catalog policy.

**Output:** `craftingPolicy`

**Velden:**

```text
policyId
maxConcurrentJobs
allowOfflineCompletion
inventoryOverflowPolicy block | mail
cancelAllowed
defaultRefundPercent
stationDistance
stationLineOfSight
operationTimeoutMs
```

---

# 6.4 `crafting_station_component`

**Inputs:** recipe refs/tagquery/policy.

**Output:** `entityComponent`

**Velden:**

```text
stationId
stationType
recipeRefs[] optional
recipeTagQuery optional
craftingPolicyRef
interactionPrompt tokenText
animationRef optional
audioStart/audioComplete refs
vfxStart/vfxComplete refs
enabledCondition optional
```

**Runtime:** component opent crafting session na server range/entity validation.

---

# 6.5 Craftingexecution

## Immediate craft (`duration=0`)

Eén transaction:

```text
reserve operationId
validate player/session/station/range/recipe/unlock
validate ingredients/currency/capacity
consume ingredients
execute output action plan
ledger inputs/outputs
emit item.crafted
complete operation
commit
```

## Timed craft

Starttransaction:

```text
reserve operationId
validate
consume/reserve ingredients according policy
create player_crafting_job state=running
ledger reservation/consumption
commit
```

Completion:

```text
single scheduler finds due job
BEGIN IMMEDIATE
verify job running/revision
execute outputs/overflow policy
mark completed
ledger/event/operation
commit
broadcast
```

Geen `setTimeout` per job.

---

# 7. Vendor-nodes

# 7.1 `vendor_catalog`

**Inputs:** `vendorOffer[]`.

**Output:** `vendorCatalogDef`

**Velden:**

```text
vendorCatalogId
displayName
refreshPolicy static | interval | daily | event
refreshIntervalSeconds optional
priceModifierFormulaRef optional
buybackEnabled boolean
buybackDurationSeconds
sellAllowed boolean
stockScope infinite | global | zone | per_player
contentVersion
```

# 7.2 `vendor_offer`

**Output:** `vendorOffer`

**Velden:**

```text
offerId
itemRef
mode sell_to_player | buy_from_player | both
sellCurrencyRef
sellPriceMinor/formula
buyCurrencyRef
buyPriceMinor/formula
stockMode inherit | infinite | limited
initialStock
maxStock
restockAmount
restockSeconds
purchaseLimitPerCharacter optional
purchaseLimitWindow optional
conditions optional
reputationRef/rank optional
questRef/state optional
bindOnPurchase optional
```

Prijsformules krijgen servercontext maar geen arbitrary code.

# 7.3 `vendor_component`

**Inputs:** vendor catalog/policy.

**Output:** entityComponent.

```text
vendorId
vendorCatalogRef
interactionPrompt
priceModifierFormulaRef optional
faction/reputation overrides
enabledCondition
```

# 7.4 Vendortransaction

Buy:

```text
validate session/vendor/range/offer/condition/stock/price
BEGIN IMMEDIATE
reserve operationId
re-read dynamic stock and wallet
validate capacity
spend currency
decrement stock if limited
grant item
ledger all deltas
commit
broadcast
```

Sell:

```text
validate tradable/bind/ownership/vendor buy policy
BEGIN IMMEDIATE
reserve operationId
remove/move item
credit currency
overflow impossible for currency cap: policy fail/clamp explicitly
write buyback if enabled
ledger
commit
```

Client price is informational; server resolves authoritative offer/price.

---

# 8. Party-nodes en runtime

# 8.1 `party_loot_policy`

**Output:** `partyLootPolicy`

**Velden:**

```text
policyId
mode personal | round_robin | free_for_all | need_greed_pass | master_loot
minimumContributionPercent
lootDistance
ownershipSeconds
rollTimeoutSeconds
needEligibilityByItemTags
roundRobinIncludeOffline boolean false
masterLooterRole leader | assigned
currencyMode personal | split_evenly | killer_only
remainderPolicy leader | random | first_contributor
```

`master_loot` mag alleen worden ingeschakeld als UI/permissions volledig werken; anders validation error in deze fase. Implementeer minimaal personal, round_robin en need_greed_pass volledig.

# 8.2 `party_rules`

NODE-03/04 heeft contractbasis. Implementeer definitief:

```text
partyRulesId
maxSize default 5, configurable 2..20
inviteTimeoutSeconds
leaderTransferPolicy
kickAllowed
sameWorldRequired
sameZoneForSharedCredit
questCreditPolicy individual | shared_if_near | contribution
partyLootPolicyRef
friendlyFirePolicy off | node_condition
disbandWhenEmpty
```

**Output:** `partyPolicy` naar `player_rules_output`.

# 8.3 Party runtime states

```text
pending invite
active party
member online/offline
leader/member roles
member current world/zone
loot round state
shared encounter contribution
```

# 8.4 Party questcredit

Iedere character behoudt eigen queststate. Bij `creditPolicy=party_shared/party_contribution`:

- server bepaalt relevante partyleden;
- same zone/area/range en contributionregels uit policy;
- eventdispatcher maakt per eligible player een eigen event/apply;
- geen één gedeelde player quest row;
- party-scoped quests blijven alleen enabled wanneer expliciet `scope=party`; implementeer hiervoor optionele party quest state tables in sectie 17.

Dit voorkomt dat één member completion alle individuele questkeuzes overschrijft.

# 8.5 Party API/WS

Client intents:

```text
party:invite
party:accept_invite
party:decline_invite
party:leave
party:kick
party:promote_leader
party:set_loot_policy
party:loot_roll
```

Server events:

```text
party:snapshot
party:invite_received
party:member_joined
party:member_left
party:leader_changed
party:member_state
party:loot_offer
party:loot_result
party:error
```

---

# 9. Direct Trade-nodes en runtime

# 9.1 `trade_policy`

**Output:** `tradePolicy`

**Velden:**

```text
policyId
enabled
minimumLevel
sameWorldRequired
maximumDistance
lineOfSightRequired
allowedItemBindStates[]
allowCurrency
allowedCurrencyRefs[] optional
maxItemSlotsPerSide
maxCurrencyTypesPerSide
inviteTimeoutSeconds
sessionTimeoutSeconds
confirmDelayMs
combatBlocked
instanceBlocked optional
safeAreaRequired optional
tradeFeeFormulaRef optional
```

# 9.2 `trade_rules`

Binds `tradePolicyRef` into `player_rules_output` and selects `trade_hud` UI ref.

# 9.3 Trade state machine

```text
invited
open
locked
confirmed_a
confirmed_b
committing
completed
cancelled
expired
failed
```

Offerchange in `open/locked`:

- increases session revision;
- resets both confirmations;
- unlocks state back to open;
- client must render new authoritative snapshot.

# 9.4 Trade ownership/reservation

- Unique item: move/reserve to `trade_escrow` only when both sides lock, or set a durable reservation row.
- Stack item: reserve exact quantity in `trade_escrow_assets`; available inventory = quantity - all active reservations.
- Currency: reserve amount; available wallet = amount - reservations.
- Equipped, market escrow, crafting reserved, mail or already locked assets cannot be offered.

# 9.5 Commit transaction

```text
BEGIN IMMEDIATE
reserve idempotent operationId tied to tradeSessionId/revision
re-read session state/revision/both confirmations
re-read both players, reservations, capacity and balances
verify assets still valid
apply optional fee
transfer stack/unique/currency assets
release reservations
write ledger for both players
write trade history
mark session completed
complete operation
COMMIT
broadcast definitive snapshots
```

Deterministic player order: sort player IDs before mutation queries. Geen half result.

# 9.6 Disconnect

- disconnect cancelt niet direct; short grace period volgens policy;
- if either player fails to reconnect before timeout: cancel and release reservations;
- completed commit is final even if response is lost; operationId returns result on retry.

---

# 10. Marketplace-nodes

# 10.1 `market_policy`

**Output:** `marketPolicy`

**Velden:**

```text
marketPolicyId
enabled
listingMode fixed_price
allowPartialFills boolean
allowedCurrencyRefs[]
allowedItemTagQuery optional
forbiddenItemTagQuery optional
minimumLevel
listingDurationOptionsSeconds[]
defaultDurationSeconds
listingFeeFormulaRef
saleTaxFormulaRef
minimumPriceMinor
maximumPriceMinor optional
maxActiveListingsPerCharacter
cancelAllowed
cancelFeeFormulaRef optional
expiredDelivery mail
soldProceedsDelivery wallet | mail_if_offline
inventoryOverflowPolicy mail
priceTickMinor
rateLimitListingsPerMinute
rateLimitBuysPerMinute
```

**Vaste eerste marktvariant:** fixed-price listings. Geen bids/auction/buy orders in NODE-05.

# 10.2 `economy_tax_rule`

**Output:** `economyRule`

```text
ruleId
operationKind listing | sale | vendor | trade | transfer
currencyRef
formulaRef/percentage basis points
minimum/maximum fee
exemptTagQuery/condition optional
ledgerReason
```

# 10.3 `market_rules`

Binds market policy, access/UI/mail behavior into Player Rules.

# 10.4 `marketplace_access_component`

**Output:** entityComponent.

```text
marketAccessId
marketPolicyRef
interactionPrompt
accessCondition
remoteAccessAllowed boolean default false
```

# 10.5 Order lifecycle

```text
draft client form only
active
partially_filled
filled
cancelled
expired
failed
```

# 10.6 Listing create

Request:

```json
{
  "operationId": "uuid",
  "sourceKind": "stack|instance",
  "sourceId": "...",
  "quantity": 5,
  "currencyId": "currency.gold",
  "unitPriceMinor": 100,
  "durationSeconds": 86400,
  "expectedInventoryRevision": 12
}
```

Transaction:

```text
validate session/access/policy/item tradability/bind/price/duration/limits
BEGIN IMMEDIATE
reserve operation
re-read ownership/available quantity/wallet
calculate authoritative listing fee
charge fee
move/reserve item to market escrow
create order with remaining quantity
ledger fee + escrow movement
complete operation
COMMIT
```

# 10.7 Buy/fill

Transaction:

```text
validate access/policy/request quantity
BEGIN IMMEDIATE
reserve operation
re-read order by id/status/revision/expiry
prevent self-buy unless policy explicitly allows (default false)
calculate total/tax/proceeds
re-read buyer available wallet/capacity
verify escrow asset quantity/instance
spend buyer currency
transfer asset to buyer inventory or mail overflow
credit seller wallet or pending mail/proceeds
decrement remaining quantity
mark partial/filled
write market trade + ledger
release filled escrow
complete operation
COMMIT
```

Bij SQLite serialiseert de write transaction. De `WHERE status IN (...) AND revision = ?`-updates en re-read binnen `BEGIN IMMEDIATE` voorkomen dubbele fills.

# 10.8 Cancel/expire

- cancellation validates seller and policy;
- return remaining escrow to inventory or mail;
- optional cancellation fee;
- expiration worker verwerkt batches in één scheduler, geen timer per order;
- offline seller delivery via mail/pending delivery;
- write ledger/audit.

# 10.9 Search/browse

- paginated cursor or stable `(created_at,id)` ordering;
- indexed item_id/currency/status/price/expiry;
- filters server-side;
- no entire market payload to browser;
- sanitize sort options; no raw SQL field from client.

---

# 11. Mail en pending delivery

# 11.1 `mail_policy`

Kan fieldblock in market/player rules zijn of eigen policy node.

```text
mailPolicyId
maxMailboxMessages
maxAttachmentsPerMessage
expiryDays
allowPlayerMail false in NODE-05
systemDeliveryOnly true
claimAllAllowed
```

# 11.2 System mail uses

- market overflow item;
- seller proceeds if configured/offline/currency cap handling;
- expired/cancelled escrow return;
- crafting output overflow;
- admin/reconciliation recovery.

# 11.3 Claim flow

```text
BEGIN IMMEDIATE
reserve operation
validate message ownership/unclaimed/expiry
validate capacity or partial claim policy
move attachment/currency
mark claimed
ledger
commit
```

Player-to-player mail is outside scope; do not expose send endpoint.

---

# 12. Complete UI-nodefamilie

Alle UI modules outputten `uiModule` en gaan naar `hud_layout`, `menu_layout` en uiteindelijk `ui_output`.

# 12.1 `hud_layout`

```text
layoutId
modules[] input
safeArea
uiScale
breakpoints desktop/tablet/mobile
zOrder policy
hideDuringCutscene/dialogue/death options
```

# 12.2 `menu_layout`

```text
layoutId
modules[]
navigation tabs/stack
modal behavior
keyboard/touch close
responsive size
```

# 12.3 Bestaande modules integreren

Verbind en standaardiseer:

```text
hud_bar
hotbar_hud
xp_hud
quest_tracker_hud
wallet_hud
game_minimap_hud
notification_hud
debug_performance_hud
debug_mmo_hud
```

# 12.4 `inventory_hud`

NODE-03 basis uitbreiden:

```text
grid/list
filters/search/sort
stack split
item details
use/equip/drop/destroy/trade/list actions volgens policy
reserved/locked badge
mobile drag alternative
pagination/virtualization
```

# 12.5 `equipment_hud`

```text
slot layout from definitions
item compare
stats delta
unequip/capacity validation
locked state
```

# 12.6 `world_map_hud`

```text
zone registry + per-zone minimaps
current zone
quest/discovery/portal/resource/party filters
fog/discovery
fast travel selection + server action
click focus/pan/zoom
no client teleport
```

# 12.7 `party_hud`

```text
party members/leader
health/mana optional from replicated state
zone/distance/offline
invite/kick/leave/promote
loot roll panel
```

# 12.8 `vendor_hud`

```text
buy/sell tabs
catalog/stock
currency/price
conditions/lock reason
quantity
buyback
server result
```

# 12.9 `crafting_hud`

```text
station recipes
known/locked recipes
ingredient owned/required
batch count
craft time/jobs
start/cancel/claim result
```

# 12.10 `trade_hud`

```text
both participants
item/currency offers
revision
lock status
confirm countdown/double confirmation
capacity/errors
cancel
```

No client-only offer truth; every edit receives authoritative snapshot.

# 12.11 `market_hud`

```text
browse/search/filter/sort/pagination
listing detail
buy quantity/total/fee display
sell/list form
my active/sold/expired/cancelled orders
mail/pending delivery link
rate limit/error states
```

# 12.12 `mail_hud`

```text
system messages
attachments/currency
claim/claim all
expiry
capacity warning
```

# 12.13 `death_respawn_hud`

NODE-03/04 module integreren met full layout; geen nieuw respawnsysteem.

# 12.14 UI performance

- virtualize inventory/market lists;
- DOM patch/diff, geen volledige rebuild per network tick;
- market polling alleen indien WS delta niet beschikbaar, max laagfrequent;
- images lazy-load;
- debug modules collapsed/off by default;
- one global UI scheduler.

---

# 13. Player Rules-output uitbreidingen

`player_rules_output` inputs:

```text
playerProgression
inventoryPolicy
equipmentPolicy
abilityPolicy
deathPolicy
unstuckPolicy
craftingPolicy
partyPolicy
tradePolicy
marketPolicy
mailPolicy
```

Validation:

- exact één policy per kind, tenzij explicit override architecture bestaat;
- duplicate policies = error of deterministic warning per contract;
- market/trade allowed currencies exist;
- UI modules needed by enabled policy connected;
- disabled system may omit UI/service content.

---

# 14. Database-migratie

Maak:

```text
db/migrations/008_economy_trade_market_crafting_party_mail.sql
```

Verplichte SQL:

```sql
CREATE TABLE IF NOT EXISTS player_crafting_jobs (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  player_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  station_entity_id TEXT,
  zone_id TEXT,
  batch_count INTEGER NOT NULL CHECK (batch_count > 0),
  state TEXT NOT NULL CHECK (state IN ('running', 'completed', 'cancelled', 'failed')),
  input_snapshot_json TEXT NOT NULL,
  output_plan_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completes_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crafting_due
  ON player_crafting_jobs(state, completes_at);

CREATE TABLE IF NOT EXISTS vendor_stock_state (
  vendor_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  quantity INTEGER,
  next_restock_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (vendor_id, offer_id, scope_key)
);

CREATE TABLE IF NOT EXISTS vendor_buyback (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  vendor_id TEXT NOT NULL,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('stack', 'instance')),
  item_id TEXT NOT NULL,
  item_payload_json TEXT NOT NULL DEFAULT '{}',
  quantity INTEGER NOT NULL DEFAULT 1,
  price_currency_id TEXT NOT NULL,
  price_amount_minor INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  claimed_at TEXT,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  leader_player_id TEXT NOT NULL,
  loot_policy_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disbanded_at TEXT,
  FOREIGN KEY (leader_player_id) REFERENCES player_profiles(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS party_members (
  party_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('leader', 'member')),
  joined_at TEXT NOT NULL,
  left_at TEXT,
  contribution_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (party_id, player_id),
  FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_party_member
  ON party_members(player_id)
  WHERE left_at IS NULL;

CREATE TABLE IF NOT EXISTS party_invites (
  id TEXT PRIMARY KEY,
  party_id TEXT,
  inviter_player_id TEXT NOT NULL,
  invitee_player_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  responded_at TEXT,
  FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
  FOREIGN KEY (inviter_player_id) REFERENCES player_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (invitee_player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS party_loot_rolls (
  id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL,
  loot_instance_id TEXT NOT NULL,
  policy_mode TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('open', 'resolved', 'cancelled', 'expired')),
  eligible_player_ids_json TEXT NOT NULL,
  responses_json TEXT NOT NULL DEFAULT '{}',
  winner_player_id TEXT,
  opened_at TEXT NOT NULL,
  resolves_at TEXT NOT NULL,
  resolved_at TEXT,
  operation_id TEXT,
  FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
  FOREIGN KEY (loot_instance_id) REFERENCES loot_instances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS direct_trade_sessions (
  id TEXT PRIMARY KEY,
  player_a_id TEXT NOT NULL,
  player_b_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN (
    'invited', 'open', 'locked', 'confirmed_a', 'confirmed_b',
    'committing', 'completed', 'cancelled', 'expired', 'failed'
  )),
  player_a_confirmed INTEGER NOT NULL DEFAULT 0,
  player_b_confirmed INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  cancelled_at TEXT,
  operation_id TEXT,
  FOREIGN KEY (player_a_id) REFERENCES player_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (player_b_id) REFERENCES player_profiles(id) ON DELETE CASCADE,
  CHECK (player_a_id <> player_b_id)
);

CREATE INDEX IF NOT EXISTS idx_trade_active_players
  ON direct_trade_sessions(state, player_a_id, player_b_id);

CREATE TABLE IF NOT EXISTS direct_trade_offers (
  trade_session_id TEXT NOT NULL,
  owner_player_id TEXT NOT NULL,
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('item_stack', 'item_instance', 'currency')),
  asset_id TEXT NOT NULL,
  quantity_minor INTEGER NOT NULL CHECK (quantity_minor > 0),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (trade_session_id, owner_player_id, asset_kind, asset_id),
  FOREIGN KEY (trade_session_id) REFERENCES direct_trade_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS asset_reservations (
  id TEXT PRIMARY KEY,
  owner_player_id TEXT NOT NULL,
  reservation_kind TEXT NOT NULL CHECK (reservation_kind IN ('trade', 'market', 'crafting', 'mail')),
  reservation_ref TEXT NOT NULL,
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('item_stack', 'item_instance', 'currency')),
  asset_id TEXT NOT NULL,
  quantity_minor INTEGER NOT NULL CHECK (quantity_minor > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'consumed', 'released', 'expired')),
  created_at TEXT NOT NULL,
  expires_at TEXT,
  released_at TEXT,
  UNIQUE (reservation_kind, reservation_ref, asset_kind, asset_id, owner_player_id),
  FOREIGN KEY (owner_player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reservations_owner_active
  ON asset_reservations(owner_player_id, status, asset_kind, asset_id);

CREATE TABLE IF NOT EXISTS market_orders (
  id TEXT PRIMARY KEY,
  seller_player_id TEXT NOT NULL,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('item_stack', 'item_instance')),
  item_id TEXT NOT NULL,
  item_instance_id TEXT,
  quantity_total INTEGER NOT NULL CHECK (quantity_total > 0),
  quantity_remaining INTEGER NOT NULL CHECK (quantity_remaining >= 0),
  currency_id TEXT NOT NULL,
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'partially_filled', 'filled', 'cancelled', 'expired', 'failed')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (seller_player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_browse
  ON market_orders(status, item_id, currency_id, unit_price_minor, created_at, id);
CREATE INDEX IF NOT EXISTS idx_market_seller
  ON market_orders(seller_player_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_market_expiry
  ON market_orders(status, expires_at);

CREATE TABLE IF NOT EXISTS market_trades (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL,
  buyer_player_id TEXT NOT NULL,
  seller_player_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  currency_id TEXT NOT NULL,
  unit_price_minor INTEGER NOT NULL,
  gross_amount_minor INTEGER NOT NULL,
  tax_amount_minor INTEGER NOT NULL,
  seller_amount_minor INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (order_id) REFERENCES market_orders(id) ON DELETE RESTRICT,
  FOREIGN KEY (buyer_player_id) REFERENCES player_profiles(id) ON DELETE RESTRICT,
  FOREIGN KEY (seller_player_id) REFERENCES player_profiles(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_market_trade_order
  ON market_trades(order_id, created_at);

CREATE TABLE IF NOT EXISTS player_mail (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  mail_type TEXT NOT NULL CHECK (mail_type IN ('system_delivery', 'market_sale', 'market_return', 'crafting_output', 'recovery')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('unread', 'read', 'partially_claimed', 'claimed', 'expired')),
  source_ref TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  read_at TEXT,
  claimed_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_mail_state
  ON player_mail(player_id, state, created_at);

CREATE TABLE IF NOT EXISTS player_mail_attachments (
  id TEXT PRIMARY KEY,
  mail_id TEXT NOT NULL,
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('item_stack', 'item_instance', 'currency')),
  asset_id TEXT NOT NULL,
  quantity_minor INTEGER NOT NULL CHECK (quantity_minor > 0),
  payload_json TEXT NOT NULL DEFAULT '{}',
  state TEXT NOT NULL CHECK (state IN ('available', 'claimed', 'expired')),
  claimed_operation_id TEXT,
  claimed_at TEXT,
  FOREIGN KEY (mail_id) REFERENCES player_mail(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS economy_reconciliation_runs (
  id TEXT PRIMARY KEY,
  run_kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  findings_json TEXT NOT NULL DEFAULT '[]',
  repairs_json TEXT NOT NULL DEFAULT '[]',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  actor_user_id TEXT
);
```

## 14.1 Party-scoped quests optioneel maar contractueel compleet

Indien NODE-04 `scope=party` publiceert, voeg toe:

```sql
CREATE TABLE IF NOT EXISTS party_quest_states (
  party_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  content_version INTEGER NOT NULL,
  state TEXT NOT NULL,
  active_step_ids_json TEXT NOT NULL DEFAULT '[]',
  completed_step_ids_json TEXT NOT NULL DEFAULT '[]',
  runtime_state_json TEXT NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 1,
  started_at TEXT,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (party_id, quest_id),
  FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS party_objective_progress (
  party_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  objective_id TEXT NOT NULL,
  state TEXT NOT NULL,
  current_amount REAL NOT NULL DEFAULT 0,
  required_amount REAL NOT NULL,
  progress_json TEXT NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (party_id, quest_id, step_id, objective_id),
  FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE
);
```

Als party-scoped quests te groot blijken voor één Codexrun, mogen ze niet stilzwijgend als character scope worden uitgevoerd. Dan blijft publish voor `scope=party` blokkeren en wordt dit expliciet als enige open NODE-05 blocker gemeld; de rest van NODE-05 mag niet als volledig afgerond worden geclaimd.

## 14.2 Beschikbare hoeveelheden

Services berekenen:

```text
available stack = stored quantity - active reservations
available currency = stored amount - active reservations
unique instance available = correct owner/location + geen active reservation
```

Gebruik SQL aggregates/helpers achter repositorymethods; clientwaarden niet vertrouwen.

---

# 15. Serverarchitectuur

Maak minimaal:

```text
src/server/crafting-service.js
src/server/vendor-service.js
src/server/party-service.js
src/server/party-loot-service.js
src/server/trade-service.js
src/server/market-service.js
src/server/mail-service.js
src/server/asset-reservation-service.js
src/server/economy-policy-service.js
src/server/economy-reconciliation-service.js
src/server/economy-scheduler.js
src/shared/economy-contract.js
src/shared/party-contract.js
src/shared/trade-contract.js
src/shared/market-contract.js
src/shared/crafting-contract.js
src/shared/ui-contract.js
```

# 15.1 Eén mutation-/transactionlaag

Gebruik NODE-03 `game-mutation-service` als centrale transactioncoördinator. Breid uit met transaction context:

```text
db connection/transaction
operation record
player locks/order
ledger writer
asset reservation helper
post-commit events
result builder
```

Services mogen geen eigen nested transactions openen binnen een actieve mutation.

# 15.2 `asset-reservation-service.js`

- reserve/release/consume stacks, instances, currency;
- prevent overlap;
- expiration cleanup;
- available amount calculation;
- reservation audit;
- used by trade/market/crafting/mail.

# 15.3 `economy-scheduler.js`

Eén budgeted scheduler voor:

- due crafting jobs;
- vendor restock;
- market expiry;
- trade expiry;
- party loot rolls;
- mail expiry;
- reservation cleanup.

Geen interval per object. Batchlimit/timebudget configurable via performance settings, niet contenthardcoded.

# 15.4 `economy-reconciliation-service.js`

Detecteer minimaal:

```text
negative quantities/balances
market order quantity versus active escrow mismatch
completed trade with active reservations
orphan reservations
unique item duplicate locations
mail claimed but attachment available
filled order with remaining quantity
currency ledger mismatch for sampled operations
expired sessions still locked
```

Default dry-run. Repairs vereisen editor/admin auth, explicit confirmation en audit.

---

# 16. API-contract

# 16.1 Crafting

```text
GET  /api/game/crafting/stations/:entityId
POST /api/game/crafting/start
POST /api/game/crafting/jobs/:jobId/cancel
GET  /api/game/crafting/jobs
POST /api/game/crafting/jobs/:jobId/claim  // alleen als output claimbeleid dat vereist
```

# 16.2 Vendor

```text
GET  /api/game/vendors/:entityId
POST /api/game/vendors/:entityId/buy
POST /api/game/vendors/:entityId/sell
POST /api/game/vendors/:entityId/buyback
```

# 16.3 Party

```text
GET  /api/game/party
POST /api/game/party/invite
POST /api/game/party/invites/:inviteId/accept
POST /api/game/party/invites/:inviteId/decline
POST /api/game/party/leave
POST /api/game/party/kick
POST /api/game/party/promote
POST /api/game/party/loot-policy
POST /api/game/party/loot-rolls/:rollId/respond
```

# 16.4 Direct trade

```text
POST /api/game/trade/invite
POST /api/game/trade/:tradeId/accept
POST /api/game/trade/:tradeId/offer
DELETE /api/game/trade/:tradeId/offer/:assetKey
POST /api/game/trade/:tradeId/lock
POST /api/game/trade/:tradeId/confirm
POST /api/game/trade/:tradeId/cancel
GET  /api/game/trade/:tradeId
```

# 16.5 Market

```text
GET  /api/game/market/orders
GET  /api/game/market/orders/:orderId
GET  /api/game/market/my-orders
POST /api/game/market/orders
POST /api/game/market/orders/:orderId/buy
POST /api/game/market/orders/:orderId/cancel
```

# 16.6 Mail

```text
GET  /api/game/mail
GET  /api/game/mail/:mailId
POST /api/game/mail/:mailId/read
POST /api/game/mail/:mailId/claim
POST /api/game/mail/claim-all
```

# 16.7 Snapshot

Breid `/api/game/player`/snapshot uit met compacte summaries:

```text
party summary
active trade summary
crafting jobs summary
unread mail count
active market order count
```

Laad volledige lijsten alleen op aanvraag.

---

# 17. WebSocket-contract

Gebruik bestaande MMO-socket.

## Client intents

```text
party:*
trade:*
crafting:start/cancel
vendor:buy/sell
market:create/buy/cancel
mail:claim
```

High-value operations mogen HTTP als primary gebruiken en WS alleen voor updates. Gebruik één duidelijke route per operation; voer dezelfde operation niet onafhankelijk via HTTP en WS uit zonder shared idempotency.

## Server events

```text
party:snapshot/delta/invite/loot
trade:snapshot/completed/cancelled/error
crafting:job_started/job_updated/job_completed/error
vendor:stock_delta/transaction_result
market:order_created/order_updated/order_filled/order_cancelled/error
mail:new/mail_updated/attachment_claimed
player:inventory_delta
player:wallet_delta
economy:operation_result
```

## Backpressure

- economyresultaten zijn critical en worden niet gedropt;
- noncritical stock/list deltas kunnen coalescen;
- client refetcht paginated marketlijst bij gap/reconnect;
- no full market snapshot over WS;
- `bufferedAmount` guard;
- rate limits per session/operation.

---

# 18. Economy validationcodes

## Recipes/crafting

```text
RECIPE_DUPLICATE_ID
RECIPE_NO_OUTPUT
RECIPE_NO_INGREDIENTS_WITHOUT_FREE_FLAG
RECIPE_ITEM_REF_MISSING
RECIPE_STATION_TYPE_MISSING
RECIPE_REFUND_POLICY_INVALID
CRAFT_STATION_WRONG_TYPE
CRAFT_RECIPE_LOCKED
CRAFT_INGREDIENTS_MISSING
CRAFT_INVENTORY_CAPACITY
CRAFT_JOB_REVISION_CONFLICT
```

## Vendor

```text
VENDOR_CATALOG_MISSING
VENDOR_OFFER_DUPLICATE
VENDOR_ITEM_REF_MISSING
VENDOR_CURRENCY_REF_MISSING
VENDOR_PRICE_INVALID
VENDOR_STOCK_INVALID
VENDOR_CONDITION_UNAVAILABLE
```

## Party

```text
PARTY_POLICY_MISSING
PARTY_LOOT_POLICY_UNSUPPORTED
PARTY_MAX_SIZE_INVALID
PARTY_MEMBER_ALREADY_ACTIVE
PARTY_INVITE_INVALID
PARTY_PERMISSION_DENIED
PARTY_QUEST_SCOPE_UNSUPPORTED
```

## Trade

```text
TRADE_POLICY_MISSING
TRADE_SELF_NOT_ALLOWED
TRADE_PLAYER_UNAVAILABLE
TRADE_TOO_FAR
TRADE_ITEM_NOT_TRADABLE
TRADE_ITEM_RESERVED
TRADE_INSUFFICIENT_AVAILABLE_QUANTITY
TRADE_SESSION_REVISION_CONFLICT
TRADE_CONFIRMATION_RESET
TRADE_CAPACITY_FAILED
TRADE_COMMIT_FAILED
```

## Market

```text
MARKET_POLICY_MISSING
MARKET_ACCESS_DENIED
MARKET_ITEM_NOT_ALLOWED
MARKET_ITEM_BOUND
MARKET_PRICE_INVALID
MARKET_DURATION_INVALID
MARKET_LISTING_LIMIT
MARKET_ORDER_NOT_ACTIVE
MARKET_ORDER_EXPIRED
MARKET_ORDER_REVISION_CONFLICT
MARKET_SELF_BUY_FORBIDDEN
MARKET_INSUFFICIENT_FUNDS
MARKET_ESCROW_MISMATCH
MARKET_CAPACITY_FAILED
MARKET_OPERATION_CONFLICT
```

## UI/final integration

```text
UI_ENABLED_POLICY_WITHOUT_MODULE
UI_DUPLICATE_LAYOUT
GAME_OUTPUT_LEGACY_AND_GAMEPROJECT_MIXED
GAME_OUTPUT_GAMEPROJECT_REQUIRED
LEGACY_NODE_UNMIGRATED
PACKAGE_BUILD_ID_MISMATCH
```

---

# 19. Finale World Assembly / Game Output cutover

NODE-01 heeft compatibility geleverd. NODE-05 voltooit de overgang.

# 19.1 Voorwaarden voor cutover

- alle existing draft nodes migreerbaar;
- Zone Registry aanwezig;
- Catalog Registry aanwezig;
- Campaign Registry mag leeg maar typecorrect zijn;
- Player Rules en UI Package aanwezig voor enabled systems;
- World Assembly compiles without legacy adapter;
- root/zone/catalog/campaign packages dezelfde buildId;
- migration preview geen blocking unknowns;
- public game paritytest vóór/na.

# 19.2 `game_output`

Doelinputs na cutover:

```text
gameProject  required, single
```

Legacy direct ports:

- eerst zichtbaar als deprecated met migrationknop;
- mengen met `gameProject` is error;
- na succesvolle projectmigration verborgen;
- server legacy reader blijft één compatibility release/versie;
- daarna verwijderen met expliciete schema migration, niet in dezelfde destructieve stap als first cutover.

# 19.3 Legacy nodes

Na succesvolle migration/apply:

```text
top_down_camera -> game_camera, legacy type niet meer maakbaar
player_spawn -> spawn_point role=zone_default, old type niet meer maakbaar
interactable -> entity/anchor + interaction component, old type niet meer maakbaar
world_settings -> project + zone settings, old type read-only legacy tot cleanup
```

Geen auto-delete zonder preview/backup in publish history. Geen seed.

# 19.4 Publish atomicity

Publishtransaction:

```text
compile all packages
validate cross-package refs
write immutable packages with new buildId
write root manifest referencing exact hashes
write publish history
atomically switch active published root pointer/state
commit
notify runtime version change
```

Game mag nooit een mix van old root/new package zien.

---

# 20. Complete end-to-end stateflow

```text
Editor node edit
-> graph repository + revision
-> Save Draft
-> compile/validation preview
-> Save To Game
-> immutable gameProject packages/build
-> runtime version update
-> server loads definitions/policies
-> player login snapshot
-> gameplay/economy intents
-> authoritative transactions + ledger/events
-> compact WebSocket deltas
-> UI modules render state
```

No content bypass.

---

# 21. Security en anti-duplication

## 21.1 General

- auth/session required;
- server-derived player IDs;
- CSRF/origin protection volgens bestaande cookiearchitectuur;
- request size limits;
- UUID/operation ID validation;
- canonical request hash;
- same operationId + different payload rejected;
- rate limits;
- server timestamps;
- no raw session tokens/logs.

## 21.2 Economy invariants

Na iedere high-value transaction:

```text
quantity >= 0
currency >= 0 unless explicit debt system (not present)
unique item exactly one location
active reservations <= owned amount
order remaining <= total
order escrow == remaining
completed trade has no active reservations
claimed attachment cannot be claimed again
ledger entries balance expected source/sink/transfer
```

## 21.3 Transfer ledger

Een transfer schrijft bij voorkeur twee player ledger entries en één operation metadata link:

```text
seller/owner delta -X or ownership out
buyer/receiver delta +X or ownership in
fees/sinks explicit separate entry
```

Do not rely solely on before/after JSON blobs.

## 21.4 Market abuse

- no self-buy default;
- price min/max/tick;
- listing/buy rate limit;
- active listing limit;
- item tradability/bind validation at create and fill;
- seller cannot mutate escrow item;
- order revision/concurrency check;
- audit unusual operations;
- admin reconciliation no silent auto-credit without report.

---

# 22. Performance en scalability contract

## SQLite now

- WAL where current project enables it;
- short `BEGIN IMMEDIATE` for economy writes;
- no long network/UI work inside transaction;
- prevalidate outside, revalidate critical state inside;
- indexes from migration;
- batch expiration jobs;
- pagination;
- prepared statements;
- repository abstraction for future DB migration.

## Runtime

- active party/trade state indexed in memory;
- market browse reads DB paginated, not all in memory;
- no polling every frame;
- scheduler budget;
- UI virtualization;
- WS delta coalescing;
- avoid stringify full player inventory for each small delta.

## Evidence measurements

```text
vendor buy transaction p50/p95/max
craft start/complete transaction
trade commit transaction
market listing create/buy transaction
SQLite busy/retry count
scheduler batch duration
market query page duration
UI render duration for 500 inventory entries and 1000 market results paged
WS messages/bytes during idle/active flows
DB writes during idle 60 sec
```

Acceptance target is no visible multisecond freeze. Exact ms thresholds must be reported from Kevin’s hardware/public server rather than faked from headless SwiftShader.

---

# 23. Exacte bestandswijzigingen

## Verplicht aanpassen

```text
src/shared/node-types.js
browser shared node schema output
src/shared/field-contract.js
src/server/field-validation.js
src/server/graph-repository.js
src/server/publish-service.js
src/server/server.js
src/server/mmo-service.js
src/server/game-mutation-service.js
src/server/catalog-service.js
src/server/player-state-service.js
src/server/quest-service.js
src/server/quest-event-service.js
src/server/loot-service.js
src/server/zone-service.js
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
PROJECT_CONTRACT.md alleen indien contracttekst moet worden aangevuld, nooit afgezwakt
```

## Verplicht nieuw

```text
db/migrations/008_economy_trade_market_crafting_party_mail.sql
src/shared/economy-contract.js
src/shared/party-contract.js
src/shared/trade-contract.js
src/shared/market-contract.js
src/shared/crafting-contract.js
src/shared/ui-contract.js
src/server/crafting-service.js
src/server/vendor-service.js
src/server/party-service.js
src/server/party-loot-service.js
src/server/trade-service.js
src/server/market-service.js
src/server/mail-service.js
src/server/asset-reservation-service.js
src/server/economy-policy-service.js
src/server/economy-reconciliation-service.js
src/server/economy-scheduler.js
scripts/economy-contract-test.js
scripts/market-concurrency-test.js
scripts/final-gameproject-check.js
README/fases/NODE-05-Economy-Trade-Market-Crafting-Party-UI-Final-Integration.md
```

## Niet maken

```text
geen store.json / market.json / recipes.json source-of-truth
geen payment provider
geen crypto/blockchain
geen client-authoritative trade
geen separate market WebSocketserver
geen Redis/Kafka/microservices zonder expliciete latere schaalfase
geen frameworkrewrite
geen seeded shop/recipe/items
geen hidden admin auto-fix zonder audit/preview
```

---

# 24. Tests

# 24.1 Contract/unit

- recipe ingredient AND/OR alternatives;
- formula validation;
- station type;
- crafting consume/refund/output plan;
- vendor price/stock/restock;
- party invite/membership/leader/limits;
- loot personal/round-robin/need-greed;
- trade state transitions/revision reset;
- reservation availability;
- market listing policy/fee/tax;
- order partial/full fill;
- mail claim;
- reconciliation detectors;
- Game Output cutover validation;
- legacy migration plan.

# 24.2 Transaction/concurrency

Test met parallel requests/process promises:

- two buyers buy last market quantity: exact one succeeds or quantities split validly;
- duplicate operationId same request returns same result;
- same operationId different request conflicts;
- trade confirm raced with offer change cannot commit stale offer;
- seller cancels while buyer buys: one definitive result;
- crafting input also attempted in trade/market: reservation prevents double use;
- two vendor buys limited stock cannot go negative;
- mail attachment double claim prevented;
- server response lost/retry no duplicate;
- transaction failure rollback restores reservations/balances.

# 24.3 Database invariants

- migration empty/existing;
- active party unique membership;
- nonnegative constraints/service checks;
- one unique item location;
- reservation sums;
- order/escrow consistency;
- ledger operation links;
- scheduler expiry cleanup;
- restart recovery.

# 24.4 Smoke full vertical slice

Via nodes/API:

```text
Author item/resource/currency/recipe/vendor/policies/UI
Author station/vendor/market entities in zones
Publish gameProject
Create accounts A/B
Party join
Kill/gather/loot
Craft
Vendor buy/sell
Direct trade
Create market listing
Buy from other account/zone
Mail overflow/claim
Restart
Verify all state
Verify Game Output only gameProject
```

# 24.5 Empty DB/no seed

Fresh DB:

- only technical Game Output seed as projectcontract;
- `/api/game/world` 404 before author/publish;
- no recipes/vendors/items/market orders;
- after author/publish systems appear.

# 24.6 Performance/browser

- public URL;
- two accounts/browsers/devices;
- long inventory/market list;
- reconnect during trade (must cancel/recover safely);
- reconnect after market buy (result recovered);
- no UI freeze;
- debug collapsed versus expanded.

---

# 25. Kevin-zichtbaar handtestscript

Codex neemt dit letterlijk over:

```text
1. Open publieke editor.
2. Controleer finale rootgraph: Catalog, Zones, Campaigns, Player Rules, UI, Registries, World Assembly, Game Output.
3. Controleer Game Output heeft gameProject aangesloten; geen gemengde legacy-inputs.
4. Open Catalog Group en controleer Recipe Definition + Ingredients + outputs.
5. Controleer Vendor Catalog/Offers.
6. Controleer Party Loot, Trade en Market Policy nodes.
7. Open Player Rules Group en controleer policyverbindingen.
8. Open UI Group en controleer HUD/Menu plus Inventory/Vendor/Crafting/Trade/Market/Party/Mail modules.
9. Open Zone Home Base en controleer echte Vendor, Craft Station en Marketplace entities/components.
10. Save Draft, refresh en controleer behoud.
11. Save To Game en controleer manifest/package hashes/build ID.
12. Log in met account A en B in twee browsers/devices.
13. A nodigt B uit; B accepteert; beide zien party panel.
14. Beweeg in dezelfde zone; party locations/state blijven correct.
15. Versla samen een enemy.
16. Controleer lootpolicy en verdeel/roll loot; geen dubbele claim.
17. A verzamelt Wood/Ore.
18. A opent Craft Station; recipe en owned/required amounts kloppen.
19. Start craft; inputs worden één keer gereserveerd/geconsumeerd.
20. Complete craft; output verschijnt exact één keer.
21. Refresh tijdens/na craft en controleer state.
22. A opent Vendor; koop en verkoop een item; stock/wallet/inventory correct.
23. A nodigt B uit voor direct trade.
24. Voeg item en Gold toe; wijzig offer na lock; confirmations resetten.
25. Lock en bevestig beide.
26. Controleer atomische transfer, ledger en geen reservations.
27. Herhaal confirm/reload; geen duplicatie.
28. A opent Marketplace en maakt listing van crafted tradable item.
29. Controleer item is uit available inventory en in escrow.
30. B gaat naar andere zone/market access en zoekt listing.
31. B koopt listing.
32. Controleer item bij B en Gold minus tax/fee bij A.
33. Probeer gelijktijdig dezelfde laatste listing met twee buy requests; geen dubbele fill.
34. Test inventory vol/overflow; delivery komt in system mail.
35. Claim mail eenmaal; double claim weigert.
36. Test listing cancel en expiry; asset komt terug via inventory/mail.
37. Logout A/B, restart service en login opnieuw.
38. Controleer party/trade terminal states, inventory, wallet, crafting, orders, mail en ledger.
39. Open reconciliation dry-run; nul ernstige findings.
40. Controleer Performance HUD en browserrespons op Kevins laptop.
41. Maak fresh testdatabase; controleer geen seeded content en game 404 voor publish.
42. Migreer een kopie van bestaande pre-NODE graph; controleer preview/apply/parity.
```

---

# 26. Evidencecontract

Maak:

```text
docs/fases/evidence/node-05-final-integration/
```

Verplicht:

```text
README.md
baseline-and-head.md
files-changed.md
migration-008-proof.md
final-root-manifest.json
catalog-package.json
zone-package-samples.json
campaign-package-sample.json
player-rules-package.json
ui-package.json
game-output-cutover-proof.md
legacy-migration-preview.json
legacy-migration-result.json
fresh-db-no-seed-proof.md
crafting-transaction-proof.md
vendor-transaction-proof.md
party-loot-proof.md
trade-transaction-proof.md
trade-stale-revision-proof.md
market-listing-proof.md
market-concurrent-buy-proof.md
market-escrow-proof.md
mail-overflow-claim-proof.md
ledger-proof.md
reconciliation-report.json
restart-persistence-proof.md
performance-proof.md
public-editor-final-root.png
public-editor-crafting-vendor-policies.png
public-game-party.png
public-game-crafting.png
public-game-vendor.png
public-game-direct-trade.png
public-game-market-listing.png
public-game-market-buy.png
public-game-mail.png
public-game-final-hud.png
public-url-browser-log.txt
acceptance-result.md
```

Alle economy evidence gebruikt testaccounts/testitems en maskeert sessiontokens/secrets.

---

# 27. Finale migration- en rolloutstrategie

# 27.1 Voorbereiding

- backup is operationeel verstandig maar contract schrijft geen usercontentseed;
- run all migrations idempotently;
- dry-run graph/content migration;
- compile preview;
- compare old/new visible world;
- no active publish switch yet.

# 27.2 Dual-read korte compatibility

- editor kan legacy nodes tonen als deprecated;
- compiler kan legacy adapter lezen;
- runtime leest alleen één active build;
- new authoring uses only new nodes;
- no dual-write of player inventory/economy.

# 27.3 Cutover

- migrate/apply graph;
- connect World Assembly -> Game Output;
- publish new build;
- browser smoke public URL;
- monitor errors/DB busy/ledger/reconciliation;
- only then hide legacy library entries.

# 27.4 Rollback

- active published pointer/root can return to previous immutable build;
- player economy mutations after cutover are not blindly rolled back;
- rollback runtime code must remain schema-compatible;
- no destructive table drops in migration 008;
- cleanup of legacy columns/types is separate later maintenance task.

---

# 28. Definition of Done

- [ ] recipe/ingredient/crafting policy nodes en stationcomponent werken;
- [ ] vendor catalog/offer/component en runtime werken;
- [ ] party rules/invites/membership/presence werken;
- [ ] personal/round-robin/need-greed loot werkt;
- [ ] direct trade state machine/reservations/double confirm/atomic commit werkt;
- [ ] fixed-price market listings/escrow/partial policy/buy/cancel/expiry werkt;
- [ ] fees/tax/ledger werken;
- [ ] system mail/overflow/claim werkt;
- [ ] migration 008 werkt op empty en existing DB;
- [ ] reconciliation dry-run bestaat;
- [ ] complete UI-nodefamilie werkt en is responsive;
- [ ] player rules output bevat all policies;
- [ ] full API/WS deltas werken;
- [ ] idempotency/concurrencytests groen;
- [ ] restart/reconnect persistentie groen;
- [ ] final World Assembly/Game Output cutover werkt;
- [ ] legacy nodes gemigreerd/deprecated volgens plan;
- [ ] fresh DB no-seed/404-before-publish bewezen;
- [ ] complete two-account public-URL vertical slice werkt;
- [ ] performancebewijs op Kevins target;
- [ ] evidencefolder compleet;
- [ ] geen parallel/hardcoded/external system toegevoegd.

---

# 29. Verboden shortcuts en faalcriteria

NODE-05 is **niet akkoord** als:

- market/trade/crafting alleen clientstate is;
- items uit inventory worden gekopieerd naar escrow in plaats van verplaatst/gereserveerd;
- seller asset tijdens active listing nog bruikbaar is;
- twee buyers dezelfde unique/laatste quantity krijgen;
- trade offerchange confirmations niet reset;
- disconnect half trade oplevert;
- operation retry dubbele output/currency geeft;
- fee/tax hardcoded in service staat in plaats van policy node;
- recipe/shopstock in JS array of JSONfile buiten graph staat;
- stack en unique item hetzelfde onveilige model gebruiken;
- negative balance/quantity mogelijk is;
- SQLite `FOR UPDATE` wordt gebruikt/geclaimd;
- transaction netwerkcall of DOMwerk bevat;
- market hele orderdatabase naar browser stuurt;
- player-to-player mail onbedoeld wordt toegevoegd;
- full auction bids/buy orders scope binnensluipen;
- UI een tweede truth houdt;
- legacy direct Game Output ports en gameProject tegelijk publiceren;
- old interactable/player_spawn/top_down_camera zonder migratie verdwijnen;
- fresh database content seedt;
- tests groen maar public twee-accountflow niet werkt;
- reconciliation ernstige invariantfouten vindt;
- fase zonder transaction/escrow/ledger evidence als compleet wordt gemeld.

---

# 30. Verplichte Codex-eindrapportage

Codex eindigt met exact:

1. `Samenvatting`;
2. `Baseline commit en eind-HEAD`;
3. `Aangepaste bestanden met reden per bestand`;
4. `Migration 008 en databaseverantwoordelijkheden`;
5. `Nieuwe recipe/vendor/party/trade/market/UI nodes`;
6. `Crafting runtime en transactions`;
7. `Vendor runtime en stock`;
8. `Party en loot`;
9. `Direct trade state machine en reservations`;
10. `Marketplace, escrow, fills, fees en mail`;
11. `Ledger, idempotency en reconciliation`;
12. `API- en WebSocketevents`;
13. `Complete UI-integratie`;
14. `World Assembly/Game Output cutover`;
15. `Legacy migration en rollback`;
16. `Checks, concurrency- en smoketests`;
17. `Kevin-zichtbare public-URL testresultaten`;
18. `Fresh DB/no-seed bewijs`;
19. `Performancebewijs`;
20. `Evidencepaden`;
21. `Bekende beperkingen`;
22. `Expliciet niet uitgevoerd`;
23. `Finale go/no-go van het vijf-fasen node-system`.

Geen `go` zonder twee-account market/trade/craftingflow, invariantbewijs en final Game Output cutover.

---

# 31. Onderzoeksbasis

De contractkeuzes volgen bewezen algemene principes, aangepast aan GK:

- SQLite transactions zijn all-or-nothing; `BEGIN IMMEDIATE` start een write transaction vroeg en past bij korte, high-value economyoperaties binnen de huidige single-serverbasis: `https://www.sqlite.org/lang_transaction.html` en `https://www.sqlite.org/isolation.html`.
- PostgreSQL-documentatie over transactions en explicit locking blijft een nuttige toekomstige schaalreferentie, maar NODE-05 doet niet alsof SQLite row locks heeft: `https://www.postgresql.org/docs/current/tutorial-transactions.html` en `https://www.postgresql.org/docs/current/explicit-locking.html`.
- Idempotency keys zijn een bekend requestpatroon voor veilig retrypen; GK gebruikt zijn bestaande `operation_idempotency` met requesthash en opgeslagen resultaat: `https://docs.stripe.com/api/idempotent_requests`.
- De browser-WebSocket API heeft geen automatische backpressure; daarom coalescet GK niet-kritieke deltas en beschermt het critical economyresults: `https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API`.

Deze bronnen bepalen geen externe dependency. De implementatie blijft binnen GK’s bestaande JavaScript/SQLite/Three.js-code en projectcontract.
