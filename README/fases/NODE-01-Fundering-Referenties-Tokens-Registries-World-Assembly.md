# NODE-01 — Fundering: Referenties, Tags, Teksttokens, Specialized Groups, Registries en World Assembly

**Documenttype:** uitvoeringscontract voor Codex  
**Status:** klaar om te implementeren nadat Kevin dit contract heeft goedgekeurd  
**Repository:** `k3v1nc0/GK`  
**Branchbeleid:** werk op de huidige werkbranch/main; maak geen extra branch of PR tenzij Kevin dat uitdrukkelijk vraagt  
**Baseline:** de meegeleverde code rond commit `c815f4c3a7dc7b282eab2ee70ceb9b2f30a063d5`  
**Afhankelijkheden:** geen eerdere NODE-fase  
**Vervolg:** NODE-02 — Zones, Areas, Spawns, Travel en Minimap  
**Contractversie:** `node-system-contract-v1.0`

---

# 1. Opdracht aan Codex

Implementeer de fundering waarop alle latere GK-nodefamilies worden gebouwd. Deze fase maakt nog niet alle zones, enemies, quests, inventory of marktfunctionaliteit. Deze fase maakt wél het complete technische contract waarmee die systemen later zonder nieuwe architectuurkeuzes kunnen worden toegevoegd:

```text
editable node values
-> persistent graph data
-> typed ports en specialized groups
-> symbol/reference index
-> tag queries en teksttokens
-> package outputs en registries
-> World Assembly
-> Game Output
-> published manifest met versie/hash/build-id
-> editor/game blijven werken
```

Codex hoeft geen alternatieve architectuur te onderzoeken. De keuzes in dit document zijn bindend voor deze fase.

---

# 2. Niet-onderhandelbare projectregels

1. **Geen seeded gamecontent.** Een lege database bevat na initialisatie uitsluitend de technische `game_output`-node, zoals het bestaande projectcontract voorschrijft.
2. **Geen hardcoded gamewaarden.** Namen, bedragen, itemrefs, zone-IDs, abilities, questteksten en andere concrete content komen uit nodes en published data.
3. **Geen losse JSON als verborgen bron van waarheid.** JSON is alleen serialisatie van database-backed nodewaarden, draft/published manifests, API-responses en evidence.
4. **Geen frameworkwissel.** Houd Node ESM, vanilla browser-JS, SQLite, Three.js en `ws` aan.
5. **Geen tweede editor of parallelle runtime.** Breid de bestaande editor, publishlaag en gedeelde runtime uit.
6. **Geen fake visuele acceptatie.** De live editor en `/game/` moeten dezelfde gepubliceerde waarden aantoonbaar gebruiken.
7. **Geen lokale groene tests als eindbewijs.** `npm run check`, tests en smoke zijn verplicht, maar Kevin-zichtbare bewijsvoering is ook verplicht.
8. **Geen duplicatie tussen server- en browserschema.** Nieuwe nodecontracten mogen niet op twee plaatsen handmatig uiteenlopen.
9. **Geen globale kabelspaghetti.** Exacte projectbrede definities worden later via typed refs gebruikt; Groups geven alleen echte packages/composition/flow door.
10. **Chunkbasis staat vast:** fysieke chunk width `14`, depth `14`, maximaal `81` loaded/resident chunks.

---

# 3. Huidige repositorybasis die Codex moet behouden

De huidige code heeft onder meer:

- `src/shared/node-types.js`: centrale server-side node- en poortdefinities;
- `apps/web/public/shared/node-types.js`: gedeeltelijk gedupliceerde browserhelpers en kleuren/presets;
- `src/server/field-validation.js`: generieke veldcoercion en basisvalidatie;
- `src/server/graph-repository.js`: CRUD, Groups, edges, draft invalidation en restore;
- `src/server/publish-service.js`: graphresolutie, publishvalidatie en read-modelbouw;
- `src/server/server.js`: HTTP-routes en WebSocket-upgrade;
- `apps/web/public/editor/editor.js`: nodebibliotheek, inspector, graphcanvas, viewport en assetauthoring;
- `apps/web/public/shared/world-runtime.js`: gedeelde Three.js-editor/game-runtime;
- `apps/web/public/game/game.js`: gamebootstrap, MMO-client en HUD;
- `db/migrations/001...003`: huidige databasebasis;
- `scripts/check.js`, `scripts/smoke-test.js`, `scripts/game-browser-check.js`.

De huidige graphopslag gebruikt één graph met `editor_nodes.parent_id` voor nested Groups. NODE-01 verandert dit **niet** in losse graph-assets. Specialized Groups worden boven op de bestaande Group-engine gebouwd.

---

# 4. Tastbaar eindresultaat van deze fase

Na NODE-01 kan Kevin in de editor:

1. specialized Groups maken voor Catalog, Zones, Campaigns, Player Rules en UI;
2. in de nodebibliotheek de nieuwe foundationnodes vinden;
3. één `Game Project Settings`-node maken met bijvoorbeeld `gameName`;
4. één `Global Value Definition` maken;
5. één `Tag Definition` maken;
6. een tokenized HUD-tekst typen, bijvoorbeeld:

```text
Welkom in @{global.game_name}
```

7. in een referenceveld een `@`-picker openen, zoeken en een typed definitie kiezen;
8. op een gekozen referencechip klikken en de definitienode laten focussen;
9. Catalog/Zone/Campaign/Player/UI packages via Group Output naar registries verbinden;
10. `World Assembly.gameProject` met `Game Output.gameProject` verbinden;
11. Save Draft en Save To Game gebruiken;
12. in `/api/game/world` een versieerbaar `gameProject`-manifest met `buildId`, `contentHash` en symbolindex zien;
13. in `/game/` dezelfde bestaande wereld blijven zien via de compatibilityroute;
14. controleren dat `Chunk Grid Definition` exact `14 × 14` en `maxLoadedChunks = 81` afdwingt.

Deze fase is pas klaar als bovenstaande keten zichtbaar werkt en de bestaande wereld niet breekt.

---

# 5. Architectuur die in deze fase wordt vastgelegd

## 5.1 Vier verbindingsvormen

### A. Kabel

Gebruik een edge voor echte datacomposition of flow binnen dezelfde graphscope:

```text
[Global Value Definition] -> [Catalog Output]
[Catalog Output Group] -> [Catalog Registry]
[World Assembly] -> [Game Output]
```

### B. Group Interface

Een edge kruist nooit rechtstreeks een Groupgrens. Intern gaat data naar `group_output`; extern toont de Group dezelfde typed output.

### C. Exacte typed reference

Een field bewaart intern een bare canonical ID:

```text
item.wood_normal
ability.attack_1
zone.home_base
```

De editor toont dit als:

```text
@item.wood_normal
@ability.attack_1
@zone.home_base
```

De `@` is dus UI-/authoringsyntax. De opgeslagen ID blijft schoon en typeerbaar.

### D. Tagquery

Een tagquery bewaart een object:

```json
{
  "all": ["item.resource"],
  "any": ["item.resource.wood", "item.resource.branch"],
  "none": ["item.quest_bound"]
}
```

De editor toont tags met `#`, bijvoorbeeld `#item.resource.wood`.

### E. Teksttoken

Tekst bewaart de daadwerkelijke tokensyntax:

```text
@{global.game_name}
@{item.wood_normal.displayName}
@{player.displayName}
```

Static tokens worden bij publish gecontroleerd en waar passend vooraf geresolved. Runtime tokens blijven als veilige, gecompileerde tokenexpressie in het manifest staan.

---

# 6. Canonical IDs, refs, tags en tokens

## 6.1 Canonical ID-regel

Nieuwe definition-ID-fields gebruiken exact dit patroon:

```regex
^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$
```

Aanvullende regels:

- lengte minimaal 3, maximaal 160;
- lowercase;
- geen spaties;
- geen opeenvolgende separators;
- geen separator aan begin of einde;
- IDs worden na eerste succesvolle publish immutable;
- display names mogen vrij worden aangepast;
- ID-wijziging na publish vereist een aliasmigratie.

Voorbeelden:

```text
global.game_name
item.wood_normal
currency.gold
quest.main.chapter_01.quest_001
target.zone_home.npc.bram
```

## 6.2 Referencekind

Iedere exact-reference krijgt naast de ID een verwacht kind. Voorbeelden:

```text
item
ability
currency
zone
quest
target
enemy
npc
audio
vfx
policy
```

Het verwachte kind komt uit het fieldschema, niet uit vrije userinput.

## 6.3 Tagregels

- tags gebruiken hetzelfde lowercase dot/underscore/colon/hyphen-karaktercontract;
- parenttags zijn impliciet: `item.resource.wood` matcht ook `item.resource`;
- tags zijn classificatie, nooit unieke identiteit;
- een exact-required field mag geen tagquery accepteren;
- een multi-match field mag exact-ref, tagquery of beide toestaan als het schema dat expliciet aangeeft.

## 6.4 Tokenpaden

Tokenpadsegmenten mogen alleen whitelisted properties aanspreken. Geen JavaScript-evaluatie, prototypes, brackets of functies.

Toegestaan:

```text
@{global.game_name}
@{item.wood_normal.displayName}
@{objective.collect_wood.requiredAmount}
@{player.currency.gold.amount}
```

Verboden:

```text
@{constructor.constructor(...)}
@{player["secret"]}
@{eval(...)}
```

---

# 7. Nieuwe shared fieldtypes

Voeg in de canonical node-schema ondersteuning toe voor onderstaande veldtypes.

| Fieldtype | Opslag | Inspectorcontrol | Servervalidatie |
|---|---|---|---|
| `identity` | string | tekstveld met live slugmelding | canonical ID-regex, lengte, namespace/kind |
| `reference` | bare canonical ID of `null` | doorzoekbare `@`-picker + chip | kind, bestaan, scope, allowNull |
| `referenceList` | array bare IDs | multi-picker/chips | elk kind/bestaan, duplicate verwijderen |
| `tagList` | array bare tags | `#`-chips | canonical tag, duplicate verwijderen |
| `tagQuery` | `{all,any,none}` | query-editor met drie chiprijen | canonical tags, geen duplicate/conflict |
| `tokenText` | string met `@{...}` | textarea + tokenpicker + preview | parser, static/runtime schema, max length |
| `formula` | declaratief JSON | compacte formula-editor/JSON fallback | whitelist operators, typed operands, geen code |
| `localizedText` | key/ref of inline fallback | referencepicker + fallbackveld | localization key en fallbackcontract |

Bestaande fieldtypes blijven behouden.

---

# 8. Nieuwe typed datatypes

Voeg minimaal deze datatypes toe aan `DATA_TYPE_COLORS`, `DATA_TYPE_OPTIONS`, portresolutie, Group interfacevalidatie en editorvisualisatie:

```text
value
projectSettings
chunkGrid
chunkPolicy
legacyWorldPackage
globalValueDef
tagDef
textTemplate
localizedTextDef
catalogDefinition
catalogPackage
catalogRegistry
zonePackage
zoneRegistry
campaignPackage
campaignRegistry
playerRules
uiPackage
gameProject
```

Kleurfamilies:

- System/packages: grijs/blauwgrijs;
- Values/tokens/tags: lichtpaars;
- Catalog: groen;
- Zone: blauw;
- Campaign: goud;
- Player Rules: turquoise;
- UI: roze;
- Game Project: oranje/wit.

Exacte hexwaarden mogen aansluiten op het bestaande palet, maar dezelfde datatype moet server en browser identiek renderen.

---

# 9. Nieuwe en aangepaste nodes

## 9.1 `game_project_settings`

**Library label:** Game Project Settings  
**Group:** Project  
**Output:** `projectSettings`

Fields:

| Field | Type | Default | Verplicht | Regel |
|---|---|---:|---|---|
| `projectId` | identity | `gk.project` | ja | kind `project` |
| `gameName` | text | `GK Game` | ja | max 120 |
| `defaultLanguage` | identity | `nl` | ja | max 16 |
| `contentVersion` | text | `0.1.0` | ja | semverachtig, max 32 |
| `startZoneRef` | reference | `null` | nee in NODE-01 | kind zone; verplicht vanaf NODE-02 |
| `startSpawnRef` | reference | `null` | nee in NODE-01 | kind spawn; verplicht vanaf NODE-02 |
| `allowLegacyWorld` | boolean | `true` | ja | wordt in NODE-05 verwijderd/false |

Tokenregistratie:

```text
global.game_name -> gameName
global.default_language -> defaultLanguage
global.content_version -> contentVersion
```

## 9.2 `chunk_grid_definition`

**Output:** `chunkGrid`

Fields zijn zichtbaar maar projectlocked:

| Field | Waarde | Bewerkbaar |
|---|---:|---|
| `gridId` | `chunk_grid.main` | ID wel vóór eerste publish |
| `chunkWidth` | `14` | nee |
| `chunkDepth` | `14` | nee |
| `tileSize` | `1` | ja, standaard 1 |
| `maxLoadedChunks` | `81` | nee |
| `maxWindowWidth` | `9` | nee |
| `maxWindowDepth` | `9` | nee |
| `originX` | `0` | ja |
| `originZ` | `0` | ja |
| `edgeMode` | `clip_to_zone_bounds` | nee |

Validatie blokkeert iedere andere width/depth/maxLoaded-waarde.

## 9.3 `constant_value`

**Output:** dynamisch typed `value`.

Fields:

```text
valueId: identity, lokaal namespace
valueType: select(text, number, boolean, color, vector2, vector3, reference)
textValue
numberValue
booleanValue
colorValue
jsonValue
referenceKind
referenceValue
```

Slechts het veld dat bij `valueType` hoort wordt gepubliceerd. De outputport krijgt metadata `valueType` zodat incompatibele verbindingen worden geblokkeerd.

## 9.4 `global_value_definition`

**Output:** `globalValueDef` en compatibele `catalogDefinition`-alias.

Fields:

```text
valueId: identity, bijvoorbeeld global.market_listing_days
valueType: text|number|boolean|color|reference
value / typed valuevelden
referenceKind: alleen bij reference
format: raw|integer|decimal|percent|currency|duration
label: text
description: tokenText zonder runtime-only tokens
tags: tagList
```

## 9.5 `tag_definition`

**Output:** `tagDef` + `catalogDefinition`-alias.

Fields:

```text
tagId
label
description
parentTagRef optional
allowedKinds referenceList van kind-namen
restricted boolean
owner text optional
```

## 9.6 `text_template`

**Output:** `textTemplate` + `catalogDefinition`-alias.

Fields:

```text
templateId
label
text: tokenText
contextKinds: tagList van toegestane runtimecontexten
fallbackText
maxRenderedLength
```

## 9.7 `localization_entry`

**Output:** `localizedTextDef` + `catalogDefinition`-alias.

Fields:

```text
localizationId
language
text: tokenText
fallbackText
```

NODE-01 ondersteunt één entry per taal. Locale bundles/vertalersworkflow vallen buiten scope.

## 9.8 `value_formula`

**Inputs:** meerdere named `value`-inputs via dynamische Group-achtige interface  
**Output:** `value`

Fields:

```text
formulaId
resultType: number|boolean
expressionJson
roundMode: none|floor|ceil|round
clampMin optional
clampMax optional
```

Toegestane operators:

```text
add subtract multiply divide min max clamp
lt lte eq gte gt
and or not
if
```

Geen willekeurige JS, stringscripts of `eval`.

## 9.9 `curve_lookup`

NODE-01 levert alleen het generieke contract; echte `stat_curve`-definitions komen in NODE-03.

Inputs:

```text
curve reference/value
input number value
```

Output: numeric `value`.

## 9.10 `catalog_output`

Inputs, allemaal multiple waar logisch:

```text
definitions: catalogDefinition[]
values: globalValueDef[]
tags: tagDef[]
textTemplates: textTemplate[]
localization: localizedTextDef[]
```

Output: `catalogPackage`.

Fields:

```text
catalogId
catalogVersion
namespaceOwnership: json array, bijvoorbeeld ["global", "item"]
```

Gedrag:

- bundelt alleen;
- voert geen gameplaylogic uit;
- detecteert duplicate IDs binnen package;
- output gaat via Group Output naar `catalog_registry`.

## 9.11 `catalog_registry`

Input: `catalogPackage[]`  
Output: `catalogRegistry`

Fields:

```text
registryId = catalog_registry.main
duplicatePolicy = error
missingOptionalPolicy = warning
```

## 9.12 `zone_registry`

Input: `zonePackage[]`  
Output: `zoneRegistry`

In NODE-01 mag de input leeg zijn als `allowLegacyWorld = true`. Vanaf NODE-02 is minimaal één zone verplicht.

## 9.13 `campaign_registry`

Input: `campaignPackage[]`  
Output: `campaignRegistry`

Lege campaignregistry is geldig tot NODE-04.

## 9.14 `player_rules_output`

Input: generic `policy[]` of de concrete policyports die in NODE-03 worden toegevoegd.  
Output: `playerRules`.

NODE-01 implementeert packagevorm en lege geldige output; concrete policies volgen later.

## 9.15 `ui_output`

Input: bestaande `ui[]`, bestaande `minimap[]`, toekomstige `uiLayout`  
Output: `uiPackage`.

Bestaande HUD-nodes kunnen hierdoor al naar World Assembly worden gerouteerd.

## 9.16 `legacy_world_adapter`

**Doel:** bestaande losse Game Output-keten veilig inpakken zonder die direct te verwijderen.

Inputs zijn gelijk aan de huidige Game Output-worldinputs:

```text
world
editorWorldSettings
gameWorldSettings
ground
camera[]
lights[]
player
spawn
entities[]
interactables[]
chunkLoading[]
keybinds[]
ui[]
minimap[]
terrain[]
collision[]
```

Output: `legacyWorldPackage`.

Deze node gebruikt intern dezelfde builders als de huidige `buildWorldFromGraph`; geen tweede read-modelimplementatie.

## 9.17 `world_assembly`

Inputs:

| Port | Type | NODE-01 verplicht |
|---|---|---|
| `projectSettings` | projectSettings | ja |
| `chunkGrid` | chunkGrid | ja |
| `editorWorldSettings` | editorWorldSettings | nee |
| `gameWorldSettings` | gameWorldSettings | nee |
| `chunkPolicies` | chunkPolicy[] | nee |
| `catalogs` | catalogRegistry | nee |
| `zones` | zoneRegistry | nee tot NODE-02 |
| `campaigns` | campaignRegistry | nee tot NODE-04 |
| `playerRules` | playerRules | nee tot NODE-03 |
| `ui` | uiPackage | nee |
| `legacyWorld` | legacyWorldPackage | toegestaan tot NODE-05 |

Output: `gameProject`.

Fields:

```text
assemblyId
schemaVersion = gk-game-project-v3
validationMode = strict
includeEditorDiagnostics = false
```

## 9.18 `game_output` aanpassing

Voeg input toe:

```text
gameProject: dataType gameProject, required false in NODE-01, multiple false
```

Publishselectie:

1. Is `gameProject` verbonden: publiceer het samengestelde manifest.
2. Zijn daarnaast legacyports direct verbonden: geef warning `GAME_OUTPUT_LEGACY_IGNORED` en negeer die directe legacy-inputs.
3. Is `gameProject` niet verbonden: bestaande legacy publishroute blijft werken.
4. Vanaf NODE-05 wordt `gameProject` verplicht en worden directe legacy-inputs publisherrors.

## 9.19 `group` aanpassing

Voeg fields toe:

```text
groupKind: generic|catalog|zone|area|campaign|quest|dialogue|player_rules|ui
interfacePresetVersion: number
collapsedSummary: boolean
```

Groupkind-presets in NODE-01:

| groupKind | Standaard publieke output |
|---|---|
| generic | bestaande vrije interface |
| catalog | `catalogPackage` |
| zone | `zonePackage` |
| campaign | `campaignPackage` |
| player_rules | `playerRules` |
| ui | `uiPackage` |
| area/quest/dialogue | voorbereid, concrete presets later |

Presetwijziging mag bestaande customports niet stil verwijderen. Toon preview en vereis expliciete apply.

---

# 10. Canonical schema delen met de browser

De huidige browserhelper dupliceert delen van `DATA_TYPE_COLORS`, multi-value types en presets. Dit is een drift-risico.

Implementeer:

1. `GET /api/node-types` blijft de volledige node-schemarespons leveren;
2. de editor gebruikt deze API-respons voor nodefields, poorten, kleuren, multiplicity, referenceKinds en fieldtypes;
3. `apps/web/public/shared/node-types.js` wordt een dunne runtimehelper voor pure render/presetfuncties die niet uit API-data kunnen komen;
4. alle duplicaten van nieuwe node-/datatype-lijsten worden verwijderd;
5. voeg een check toe die server-schema en browserverwachtingen vergelijkt.

Nieuwe file:

```text
src/shared/node-contract.js
```

Verantwoordelijkheden:

- canonical ID/tag helpers;
- fieldtypeconstants;
- referencekindconstants;
- tokencontextconstants;
- schemaVersion;
- pure utilities die server én eventueel via een veilige statische route browser kunnen gebruiken.

Als Codex de shared file rechtstreeks aan de browser serveert, mag die file geen Node-only imports bevatten.

---

# 11. Symbol- en reference-index

## 11.1 Nieuwe service

Maak:

```text
src/server/symbol-index-service.js
```

Verantwoordelijkheden:

- scan actuele graphnodes;
- registreer definitions op basis van nodeschema `symbolKind` en `identityField`;
- registreer static properties voor tokenautocomplete;
- registreer Group/package ownership en nodeId;
- registreer aliases;
- detecteer duplicate IDs;
- geef zoekresultaten voor editorpickers;
- cache op `editor_graph_meta.graph_revision`;
- invalidatie bij iedere graphmutatie.

Symbolrecord:

```json
{
  "id": "global.game_name",
  "kind": "globalValue",
  "nodeId": "node_...",
  "parentId": "group_...",
  "label": "Game Name",
  "properties": {
    "value": { "valueType": "text", "tokenSafe": true },
    "label": { "valueType": "text", "tokenSafe": true }
  },
  "tags": ["global.project"],
  "published": false,
  "aliases": []
}
```

## 11.2 Nieuwe API-routes

### `GET /api/editor/symbols`

Queryparameters:

```text
q
kind
parentId
limit default 50 max 200
includeProperties boolean
```

Response:

```json
{
  "graphRevision": 42,
  "symbols": [],
  "errors": [],
  "warnings": []
}
```

### `POST /api/editor/references/validate`

Body:

```json
{
  "references": [
    { "id": "item.wood_normal", "expectedKinds": ["item"] }
  ]
}
```

### `POST /api/editor/tokens/preview`

Body:

```json
{
  "text": "Welkom in @{global.game_name}",
  "staticContextOnly": true,
  "sampleRuntimeContext": null
}
```

Response bevat parsed tokens, errors, static preview en runtime placeholders.

### `GET /api/editor/manifest-preview`

Geeft hetzelfde compilepad als Save Draft, maar schrijft niets. Response bevat manifest, validation, buildId preview, contentHash en dependency summary.

---

# 12. Teksttokenparser en resolver

Nieuwe shared files:

```text
src/shared/token-contract.js
src/server/token-resolver.js
apps/web/public/shared/token-preview.js
```

## 12.1 Parseroutput

```json
{
  "segments": [
    { "type": "text", "value": "Welkom in " },
    {
      "type": "token",
      "raw": "@{global.game_name}",
      "scope": "static",
      "path": ["global", "game_name"],
      "expectedType": "text"
    }
  ]
}
```

## 12.2 Static versus runtime

Static roots in NODE-01:

```text
global
```

Voorbereide toekomstige roots:

```text
item ability currency enemy npc zone quest target reward
player objective step dialogue market party
```

Onbekende root is een error. Een bekende toekomstige runtime-root mag alleen worden gebruikt als het fieldschema die runtimecontext toestaat.

## 12.3 Geen dubbele bronwaarden

De editor toont een warning als tokenText hardcoded tekst bevat die aantoonbaar een gekoppelde typed property dupliceert. NODE-01 hoeft dit alleen te doen voor duidelijke numeric patterns in een `text_template` naast een connected `constant_value`; het blijft een warning, geen blocker.

---

# 13. Databasewijziging

Maak exact:

```text
db/migrations/004_node_system_foundation.sql
```

Inhoudelijke verantwoordelijkheden:

```sql
CREATE TABLE IF NOT EXISTS editor_graph_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  graph_revision INTEGER NOT NULL DEFAULT 0,
  content_schema_version TEXT NOT NULL DEFAULT 'gk-node-content-v1',
  last_mutation_at TEXT NOT NULL
);

INSERT OR IGNORE INTO editor_graph_meta
  (id, graph_revision, content_schema_version, last_mutation_at)
VALUES
  (1, 0, 'gk-node-content-v1', CURRENT_TIMESTAMP);

ALTER TABLE editor_nodes ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS content_id_aliases (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL,
  symbol_kind TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_content_alias_new_id
  ON content_id_aliases(new_id);

CREATE TABLE IF NOT EXISTS graph_migration_runs (
  id TEXT PRIMARY KEY,
  migration_key TEXT NOT NULL,
  from_version TEXT NOT NULL,
  to_version TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('preview', 'applied', 'failed')),
  plan_json TEXT NOT NULL,
  result_json TEXT,
  actor_user_id TEXT,
  created_at TEXT NOT NULL,
  applied_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_graph_migration_key
  ON graph_migration_runs(migration_key, created_at);

ALTER TABLE draft_world_state ADD COLUMN build_id TEXT;
ALTER TABLE draft_world_state ADD COLUMN schema_version TEXT;
ALTER TABLE draft_world_state ADD COLUMN content_hash TEXT;

ALTER TABLE published_world_state ADD COLUMN build_id TEXT;
ALTER TABLE published_world_state ADD COLUMN schema_version TEXT;
ALTER TABLE published_world_state ADD COLUMN content_hash TEXT;

ALTER TABLE publish_history ADD COLUMN build_id TEXT;
ALTER TABLE publish_history ADD COLUMN schema_version TEXT;
ALTER TABLE publish_history ADD COLUMN content_hash TEXT;
```

Codex moet rekening houden met SQLite-migraties die exact één keer draaien. Geen runtime `ALTER TABLE` in services.

## 13.1 Graphrevision

Elke muterende repositoryhandeling verhoogt in dezelfde database-transactie `graph_revision`:

- create/update/delete node;
- update position;
- create/delete edge;
- restore graph;
- group interface update;
- migration apply;
- minimap bake nodewaarde-update.

`Save Draft` en publish verhogen graphrevision niet tenzij zij nodes muteren.

---

# 14. GraphRepository-aanpassingen

Pas `src/server/graph-repository.js` aan met exact deze verantwoordelijkheden:

1. `getGraphRevision()`;
2. `touchGraphRevision(dbOrTransaction)`;
3. revision bump in iedere mutatie;
4. node `schema_version` lezen/schrijven;
5. identitywijziging na publish detecteren;
6. aliaspreview genereren;
7. symbolservice invalidatie aanroepen;
8. `getGraph()` response uitbreiden met:

```json
{
  "graphRevision": 42,
  "contentSchemaVersion": "gk-node-content-v1"
}
```

De bestaande model-entity autowiring en Group-systemnodes blijven functioneren.

---

# 15. Publish- en manifestcontract

## 15.1 Nieuwe compilerlaag

Maak:

```text
src/server/game-project-compiler.js
```

De compiler gebruikt de bestaande Group-resolverhelpers uit `publish-service.js`. Verplaats pure resolutiehelpers alleen als dat zonder functionele wijziging kan; anders exporteer ze gecontroleerd.

Verantwoordelijkheden:

- connected `world_assembly` vinden;
- registries/packages verzamelen;
- symbolindex bouwen;
- refs/tokens valideren;
- manifest deterministisch sorteren;
- `contentHash` berekenen op canonical JSON zonder timestamps;
- `buildId` genereren als `gk-<hash eerste 12 tekens>`;
- compatibilityworld toevoegen;
- assetmanifest samenvoegen;
- diagnostics toevoegen zonder editorsecrets.

## 15.2 Published shape in NODE-01

```json
{
  "schemaVersion": "gk-game-project-v3",
  "buildId": "gk-0123456789ab",
  "contentHash": "sha256:...",
  "publishedAt": "...",
  "project": {
    "id": "gk.project",
    "gameName": "GK Game",
    "defaultLanguage": "nl",
    "contentVersion": "0.1.0",
    "startZoneRef": null,
    "startSpawnRef": null
  },
  "chunkGrid": {
    "id": "chunk_grid.main",
    "chunkWidth": 14,
    "chunkDepth": 14,
    "tileSize": 1,
    "maxLoadedChunks": 81,
    "edgeMode": "clip_to_zone_bounds"
  },
  "catalogs": {
    "definitions": {},
    "tags": {},
    "values": {},
    "textTemplates": {},
    "localization": {}
  },
  "zones": {},
  "campaigns": {},
  "playerRules": {},
  "ui": {},
  "symbols": {
    "byId": {},
    "aliases": {}
  },
  "assetManifest": [],
  "legacyWorld": {},
  "diagnostics": {
    "warnings": [],
    "counts": {}
  }
}
```

Voor compatibility retourneert `/api/game/world` in NODE-01:

```json
{
  "...oude top-level wereldvelden": "...",
  "gameProject": { "...v3 manifest...": true },
  "schemaVersion": "gk-game-project-v3",
  "buildId": "...",
  "contentHash": "...",
  "publishedAt": "..."
}
```

De browsergame kan dus bestaande top-levelfields blijven consumeren terwijl nieuwe systemen `gameProject` gebruiken.

## 15.3 Determinisme

Twee publishes van exact dezelfde graphcontent moeten dezelfde `contentHash` opleveren. Timestamps en random build UUID’s mogen niet in de hashinput zitten.

---

# 16. Migratiecontract

Maak:

```text
src/server/graph-migration-service.js
```

NODE-01-migratiekey:

```text
node-system-foundation-v1
```

## 16.1 Preview

Route:

```text
GET /api/editor/migrations/node-system-foundation-v1/preview
```

Preview bepaalt:

- bestaat `Game Project Settings` al;
- bestaat `Chunk Grid Definition` al;
- zijn gespecialiseerde rootgroups aanwezig;
- is `World Assembly` aanwezig;
- welke huidige nodes direct aan Game Output hangen;
- welk `legacy_world_adapter`-pakket wordt gemaakt;
- welke edges worden verplaatst;
- welke node-/edge-IDs worden aangemaakt;
- welke waarschuwingen bestaan.

Geen writes.

## 16.2 Apply

Route:

```text
POST /api/editor/migrations/node-system-foundation-v1/apply
```

Body:

```json
{
  "previewId": "...",
  "expectedGraphRevision": 42
}
```

Apply faalt met `409` als graphrevision intussen veranderde.

Migratie maakt:

- `Game Project Settings`;
- `Chunk Grid Definition`;
- rootgroups Catalog, Zones, Campaigns, Player Rules en UI;
- lege outputs/registries waar nodig;
- `Legacy World Adapter` met verbindingen vanuit de huidige worldketen;
- `World Assembly`;
- `World Assembly.gameProject -> Game Output.gameProject`;
- oude directe Game Output edges blijven tijdelijk bestaan maar worden ignored/warning; de preview noemt ze expliciet.

De migratie mag geen usercontent verwijderen.

## 16.3 Idempotentie

Tweede apply:

- maakt geen duplicaten;
- rapporteert `alreadyApplied: true`;
- verandert graphrevision niet als er niets wijzigt.

---

# 17. Editor-UX

## 17.1 Project Navigator

Voeg een compacte navigator toe met categorieën:

```text
Project
Global Catalogs
Zones
Campaigns
Player Rules
UI
Legacy
```

Deze navigator is een view op bestaande Groups/nodes; geen tweede opslaglaag.

## 17.2 Specialized Group aanmaken

De `Add Group`-actie krijgt een `Group kind`-selectie. Bij creatie worden Group Input/Output en interfacepreset automatisch correct aangemaakt.

## 17.3 Referencepicker

Gedrag:

- typing `@` in reference- en tokenTextvelden opent picker;
- filter op verwachte kinds;
- zoek op ID, label en tags;
- maximaal 50 resultaten initieel;
- chip toont `@id` plus typebadge;
- ontbrekende ref rood;
- klik chip focust node en opent juiste Groupbreadcrumb;
- usage count via symbolindex;
- geen vrije stringacceptatie zonder validatie.

## 17.4 Tagquery-editor

Drie rijen:

```text
ALL
ANY
NONE
```

Elke chip wordt met `#` getoond. De editor voorkomt dezelfde tag tegelijk in ALL en NONE.

## 17.5 TokenText-editor

- textarea;
- tokenautocomplete na `@{`;
- onder textarea een parsed tokenlijst;
- static preview;
- runtime tokens met contextbadge;
- invalid token inline rood;
- raw token mag nooit stil als gewone tekst worden gepubliceerd.

## 17.6 Rootgraph zichtbaarheid

Na migratie ziet Kevin minimaal:

```text
[Game Project Settings] ----\
[Chunk Grid Definition] -----\
[Catalog Registry] -----------\
[Zone Registry] ---------------> [World Assembly] -> [Game Output]
[Campaign Registry] ----------/
[Player Rules Output] -------/
[UI Output] ----------------/
[Legacy World Adapter] -----/
```

---

# 18. Runtime-aanpassingen

NODE-01 mag de bestaande worldruntime niet herschrijven.

Vereist:

1. `/game/` leest `world.gameProject` als beschikbaar;
2. game toont in debugstate `schemaVersion`, `buildId`, `contentHash`;
3. bestaande ground/entities/camera/lights blijven uit top-level compatibilitydata laden;
4. tokenized `ui_hud_text` kan static tokens uit `gameProject.catalogs/ project` renderen;
5. runtime tokens die nog niet bestaan tonen een gecontroleerde fallback en één warning, niet het raw token;
6. geen per-frame tokenparser; compileer/cache templates bij world load.

---

# 19. Validationcodes

Gebruik stabiele codes naast menselijke meldingen.

## Errors

```text
FOUNDATION_PROJECT_SETTINGS_MISSING
FOUNDATION_CHUNK_GRID_MISSING
FOUNDATION_CHUNK_GRID_INVALID
FOUNDATION_WORLD_ASSEMBLY_MISSING
FOUNDATION_GAME_PROJECT_NOT_CONNECTED
SYMBOL_DUPLICATE_ID
SYMBOL_INVALID_ID
REFERENCE_MISSING
REFERENCE_WRONG_KIND
TOKEN_PARSE_ERROR
TOKEN_STATIC_PATH_MISSING
TOKEN_CONTEXT_NOT_ALLOWED
GROUP_INTERFACE_INVALID
PACKAGE_DUPLICATE_NAMESPACE
FORMULA_UNSAFE_OPERATOR
FORMULA_TYPE_MISMATCH
```

## Warnings

```text
GAME_OUTPUT_LEGACY_ONLY
GAME_OUTPUT_LEGACY_IGNORED
TOKEN_RUNTIME_UNRESOLVED_PREVIEW
GLOBAL_VALUE_UNUSED
TAG_UNUSED
GROUP_PRESET_CUSTOMIZED
LEGACY_SCHEMA_FIELD_USED
```

Validationresponse bevat per item:

```json
{
  "code": "REFERENCE_MISSING",
  "severity": "error",
  "message": "...",
  "nodeId": "...",
  "field": "...",
  "referenceId": "...",
  "fixHint": "..."
}
```

---

# 20. Exacte bestandswijzigingen

## Verplicht aanpassen

```text
src/shared/node-types.js
src/server/field-validation.js
src/server/graph-repository.js
src/server/publish-service.js
src/server/server.js
src/server/db.js
apps/web/public/shared/node-types.js
apps/web/public/editor/editor.js
apps/web/public/editor/index.html
apps/web/public/editor/styles.css
apps/web/public/shared/world-runtime.js
apps/web/public/game/game.js
scripts/check.js
scripts/smoke-test.js
package.json
README/fases/README.md
```

## Verplicht nieuw

```text
db/migrations/004_node_system_foundation.sql
src/shared/node-contract.js
src/shared/token-contract.js
src/server/symbol-index-service.js
src/server/token-resolver.js
src/server/game-project-compiler.js
src/server/graph-migration-service.js
apps/web/public/shared/reference-utils.js
apps/web/public/shared/token-preview.js
tests/node-contract.test.js
tests/symbol-index.test.js
tests/token-resolver.test.js
tests/game-project-compiler.test.js
tests/graph-migration-foundation.test.js
README/fases/NODE-01-Fundering-Referenties-Tokens-Registries-World-Assembly.md
```

## Niet maken

- React/Vue/Svelte-app;
- nieuwe database naast SQLite;
- aparte microservice;
- Redis;
- graph-assets/tabellen;
- quest- of inventorytabellen;
- contentseeders;
- tweede manifestformat naast v3 en de tijdelijke legacy compatibilityshape.

---

# 21. Tests

Voeg aan `package.json` toe:

```json
{
  "scripts": {
    "test": "sh scripts/run-node24.sh --test tests/*.test.js"
  }
}
```

## 21.1 Unit/contracttests

Minimaal:

1. canonical IDs geldig/ongeldig;
2. tag parentmatching;
3. referencekindvalidatie;
4. tokenparser met static/runtime tokens;
5. tokenparser blokkeert unsafe paths;
6. formula whitelist;
7. Group preset levert juiste poorten;
8. symbolindex detecteert duplicate IDs;
9. symbolindex cache invalidatie op graphrevision;
10. contenthash deterministisch;
11. chunkgrid accepteert alleen 14/14/81;
12. `legacy_world_adapter` levert exact dezelfde compatibilityworld als oude publishroute;
13. gameProject verbonden overschrijft legacy direct inputs;
14. migration preview schrijft niets;
15. migration apply is atomisch en idempotent;
16. migration apply met stale revision geeft 409.

## 21.2 Smoke-uitbreiding

`npm run smoke` moet een lege tijdelijke database gebruiken en bewijzen:

- startgraph heeft uitsluitend technische Game Output;
- foundationnodes kunnen worden gemaakt;
- specialized Groups hebben systeemnodes en correcte interfaces;
- Global Value en Tag worden in Catalog Output verzameld;
- tokenized HUD-resolutie werkt;
- Legacy World Adapter compileert bestaande minimale world;
- World Assembly compileert gameProject;
- publish slaat buildId/schemaVersion/contentHash op;
- `/api/game/world` bevat compatibilityworld én gameProject;
- unconnected definitions verschijnen niet in gepubliceerd catalog;
- broken ref blokkeert publish;
- duplicate ID blokkeert publish;
- onbekende static token blokkeert publish;
- tweede identieke publish heeft dezelfde contentHash.

## 21.3 Browsercheck

Breid `scripts/game-browser-check.js` of een nieuwe gerichte browsercheck uit:

- login editor;
- run migration preview/apply;
- open rootgraph;
- screenshot specialized Groups/World Assembly/Game Output;
- wijzig `gameName`;
- tokenized HUD toont wijziging in editorpreview;
- Save Draft/reload behoudt;
- publish;
- `/game/` toont hetzelfde tokenized gameName;
- console heeft geen uncaught errors.

---

# 22. Kevin-zichtbaar handtestscript

Codex zet dit letterlijk in fase-evidence en voert uit waar mogelijk:

```text
1. Open de publieke editor-URL.
2. Controleer dat de bestaande wereld nog zichtbaar is.
3. Open de Node Library en zoek “Game Project Settings”.
4. Maak die node als hij nog niet door migratie bestaat.
5. Controleer Chunk Grid: width 14, depth 14, max 81.
6. Maak een Global Value Definition met id global.welcome_text.
7. Maak een HUD Text met tekst: Welkom in @{global.game_name}.
8. Gebruik de tokenpicker; typ de token niet blind.
9. Controleer dat de editor een static preview toont.
10. Maak/controleer Catalog, Zones, Campaigns, Player Rules en UI Groups.
11. Open iedere Group en controleer één Group Input en één Group Output.
12. Controleer dat een directe edge door een groupwand nog steeds wordt geweigerd.
13. Verbind Group packages met de registries.
14. Verbind alles met World Assembly.
15. Verbind World Assembly.gameProject met Game Output.gameProject.
16. Save Draft en refresh de browser.
17. Controleer dat alle nodes, waarden, edges en groupinterfaces terugkomen.
18. Save To Game.
19. Open /api/game/world en controleer schemaVersion/buildId/contentHash/gameProject.
20. Open /game/ en controleer dat de bestaande wereld nog werkt.
21. Controleer dat “Welkom in <gameName>” correct wordt getoond.
22. Wijzig gameName, publiceer opnieuw en controleer dezelfde wijziging in /game/.
23. Maak tijdelijk een kapotte reference en controleer dat publish blokkeert met node/field/fixhint.
24. Herstel de reference en publiceer succesvol.
```

---

# 23. Evidencecontract

Maak:

```text
README/fases/evidence/NODE-01-node-foundation/
```

Verplicht:

```text
README.md
acceptance-result.md
repo-baseline.md
migration-preview.json
migration-result.json
editor-root-graph.png
editor-reference-picker.png
editor-token-preview.png
editor-validation-broken-ref.png
game-token-result.png
draft-manifest.json
published-manifest.json
database-proof.md
checks.txt
browser-console.txt
```

`README.md` vermeldt:

- commit/HEAD;
- public URL;
- databasepad zonder secrets;
- Node-versie;
- checks;
- welke screenshots van exact dezelfde public URL komen;
- known limitations;
- pass/fail per acceptancepunt.

Localhostscreenshots zijn alleen diagnostisch en sluiten de fase niet.

---

# 24. Performancecontract

- symbolindex rebuild alleen bij graphrevisionwijziging;
- referencepicker zoekresultaten server-side of indexed client-side, geen volledige DOM-render van duizenden symbols;
- tokenparser niet per frame;
- manifesthash alleen bij draft preview/publish, niet bij node drag;
- node position updates mogen geen symbolindex rebuild veroorzaken als geen symboldata veranderde; graphrevision mag stijgen, maar symbolservice gebruikt een aparte `symbolRevisionKey` of detecteert position-only mutatie;
- geen extra RAF-loop;
- debug UI maximaal 2–4 Hz;
- editor blijft bruikbaar op Pentium 4417U-doelhardware.

Aanbevolen implementatie: laat `touchGraphRevision` een mutation kind opslaan (`position`, `values`, `structure`) zodat symbolcache bij position-only mutatie kan blijven staan.

---

# 25. Securitycontract

- alle nieuwe editorroutes vereisen `requireEditor`;
- migration apply vereist editor/admin en expected graphrevision;
- tokenresolver exposeert geen serverenv, filesystem, sessions of secrets;
- formulaengine heeft geen eval/function constructor;
- API-foutpayload bevat geen stacktrace in productie;
- referencepicker toont alleen editorcontent die editoruser toch mag lezen;
- published manifest bevat geen editor notes, user IDs, sessiongegevens of migrationplannen.

---

# 26. Uitdrukkelijk buiten scope

- zones daadwerkelijk bouwen: NODE-02;
- losse graph-assets: toekomstig, niet in deze vijf fasen vereist;
- enemies/items/abilities: NODE-03;
- inventory/playerprogressie: NODE-03;
- quests/dialogue: NODE-04;
- market/trade/vendor/crafting: NODE-05;
- volledige localizationworkflow;
- Lua/JS scriptingnodes;
- willekeurige usercode;
- nieuw renderingsysteem;
- grote UI-redesign buiten navigator/pickers/tokenpreview.

---

# 27. Verboden shortcuts en faalcriteria

NODE-01 is **niet** klaar als:

- nieuwe definitions alleen als JSON in een panel staan en niet als echte nodes;
- browser en server handmatig verschillende datatype-/node-lijsten hebben;
- references vrije tekst zonder symbolvalidatie zijn;
- tokens via `string.replace` zonder parser/whitelist worden uitgevoerd;
- de migratie oude nodes verwijdert;
- `Chunk Grid` andere waarden dan 14/14/81 accepteert;
- Game Output niet daadwerkelijk gameProject kan publiceren;
- `/game/` breekt of alleen localhost werkt;
- manifesthash willekeurig verandert bij identieke content;
- tests slagen maar Kevin geen rootgraph, picker of tokenresultaat kan zien;
- content wordt geseed om de demo te laten werken;
- Codex al zones, quests, inventory of markt half implementeert.

---

# 28. Definition of Done

Alle onderstaande punten moeten waar zijn:

- [ ] migratie 004 bestaat en werkt op bestaande en lege database;
- [ ] graphrevision en schemaVersion zijn zichtbaar;
- [ ] nieuwe fieldtypes zijn server- en editorondersteund;
- [ ] canonical IDs/refs/tags/tokens hebben één contract;
- [ ] symbolindex en API werken;
- [ ] specialized Groups werken via bestaande Group Input/Output;
- [ ] alle foundationnodes bestaan en zijn connectable;
- [ ] World Assembly compileert deterministisch;
- [ ] Game Output publiceert gameProject;
- [ ] legacyworld blijft tijdelijk werken;
- [ ] 14×14/max81 is afgedwongen;
- [ ] broken refs/duplicate IDs/invalid tokens blokkeren publish;
- [ ] static tokenized HUD werkt in editor en game;
- [ ] Save Draft/reload/publish werken;
- [ ] `npm run check`, `npm test`, `npm run smoke` groen;
- [ ] public-URL browserbewijs aanwezig;
- [ ] evidencefolder compleet;
- [ ] geen seeded content of parallel systeem toegevoegd.

---

# 29. Verplichte Codex-eindrapportage

Codex eindigt met exact deze hoofdstukken:

1. `Samenvatting`;
2. `Baseline commit en eind-HEAD`;
3. `Aangepaste bestanden met reden per bestand`;
4. `Nieuwe database-migratie en uitgevoerde SQL-verantwoordelijkheden`;
5. `Nieuwe node- en fieldtypes`;
6. `Reference/tag/tokencontract`;
7. `World Assembly en published manifestvorm`;
8. `Migratieresultaat bestaande graph`;
9. `API-routes`;
10. `Checks en testresultaten`;
11. `Kevin-zichtbare browserresultaten`;
12. `Evidencepaden`;
13. `Bekende beperkingen`;
14. `Expliciet niet uitgevoerd`;
15. `Go/no-go voor NODE-02`.

Een eindrapport zonder browserresultaat/evidence mag de fase niet als voltooid markeren.

---


# 30. Volledige dekking van bestaande foundationnodes en gereserveerde Graph Reference

Deze sectie is bindend en voorkomt dat Codex tijdens NODE-01 zelf moet beslissen wat met bestaande nodes gebeurt.

## 30.1 `graph_reference`

`graph_reference` krijgt in NODE-01 al een **gereserveerd schema- en datatypecontract**, maar wordt nog niet als vrij maakbare librarynode geactiveerd zolang de database slechts één graph met `parent_id`-Groups kent.

Fields:

```text
graphReferenceId
referencedGraphId
graphKind catalog|zone|area|campaign|quest|dialogue|ui
revisionPolicy latest_published|pinned_revision
pinnedRevision optional
interfaceSnapshot json read-only
status active|missing|incompatible
```

Outputs worden later dynamisch afgeleid uit de gerefereerde graphinterface. In NODE-01:

- registreer node type als `hidden: true`, `experimental: true`;
- publicatie van een werkelijk gebruikte `graph_reference` blokkeert met `GRAPH_ASSET_STORAGE_NOT_AVAILABLE`;
- voeg geen fake graphasset-JSON of tweede opslagroute toe;
- specialized Groups blijven de echte uitvoerbare basis;
- leg de interfacevorm vast zodat een latere Graph Asset-fase Groups kan promoveren zonder andere zone/catalog/campaignpoorten.

## 30.2 Bestaande nodebesluiten in NODE-01

| Bestaande node | NODE-01-besluit | Exacte uitvoering |
|---|---|---|
| `world_settings` | behouden als legacy input | Niet uitbreiden met zonecontent. `legacy_world_adapter` leest hem; migrationpreview toont latere splitsing naar project + zone settings. |
| `editor_world_settings` | behouden | Blijft globale editorperformance/shadow/debugpolicy en gaat naar `world_assembly.editorWorldSettings`. |
| `game_world_settings` | behouden | Blijft globale runtimeperformance/shadow/debugpolicy en gaat naar `world_assembly.gameWorldSettings`. |
| `editor_chunk_loading` | aanpassen | Voeg `chunkGrid` input/ref toe; de fysieke width/depth mag niet meer zelfstandig 100×100 blijven. Override fields voor fysieke maat worden deprecated/read-only en resolve naar 14×14. |
| `game_chunk_loading` | aanpassen/vastzetten | Voeg `chunkGrid` input/ref toe en valideer width=14, depth=14, maxLoadedChunks=81. Policyvelden zoals radius/preload blijven editable binnen veilige grenzen. |
| `game_camera` | behouden | Globale defaultcamera blijft via legacy adapter of later World Assembly lopen; zone overrides volgen NODE-02. |
| `editor_camera` | behouden editor-only | Mag nooit in `gameProject` runtimepackages komen. Workspace/draft authoringstate blijft intact. |
| `top_down_camera` | legacy/deprecated | Niet meer in library tonen. Migrationservice zet hem later idempotent om naar `game_camera`; NODE-01 blijft hem lezen voor compatibility. |
| `keybind` | behouden | Routeer via `player_rules_output` of rechtstreeks World Assembly compatibilityinput; geen per-zone kopieën. Voeg nog geen combatkeys hardcoded toe. |
| `debug_performance_hud` | behouden debugmodule | Kan naar `ui_output`; default disabled/collapsed en nooit vereist voor gameplay. |
| `debug_mmo_hud` | behouden debugmodule | Kan naar `ui_output`; geen tuningwaarde wordt alleen in DOM bewaard. |
| `group` | uitbreiden | `groupKind`, interfacepreset en typed public ports zoals eerder vastgelegd. |
| `group_input` | behouden locked systemnode | Dynamische outputs komen uitsluitend uit parent Group interface. Geen handmatige usercreate/delete. |
| `group_output` | behouden locked systemnode | Dynamische inputs komen uitsluitend uit parent Group interface. Required public outputs moeten intern aangesloten zijn. |
| `game_output` | uitbreiden | Voeg `gameProject`; behoud legacyroute tijdelijk; finale verplichting in NODE-05. |

## 30.3 Chunk Grid is één bron

Na NODE-01 geldt:

```text
chunk_grid_definition.width = 14
chunk_grid_definition.depth = 14
chunk_grid_definition.maxLoadedChunks = 81
```

`editor_chunk_loading` en `game_chunk_loading` mogen deze drie fysieke waarden niet onafhankelijk publiceren. Editor/game verschillen uitsluitend in policy zoals view radius, preload/unload, selection residency en debug.

---

# 31. Onderzoeksbasis

Deze contractkeuzes volgen onder meer bekende patronen:

- Node-RED Subflows: nodes achter een vaste input/outputinterface samenvoegen om visuele complexiteit te verminderen en hergebruik mogelijk te maken: `https://nodered.org/docs/user-guide/editor/workspace/subflows`.
- Unreal Gameplay Tags: hiërarchische labels en Any/All/None-queryvormen: `https://dev.epicgames.com/documentation/unreal-engine/using-gameplay-tags-in-unreal-engine`.
- Node-RED Search: zoeken op node-ID/type/property en focussen van resultaten: `https://nodered.org/docs/user-guide/editor/workspace/search`.

GK neemt het principe over, niet de implementatie of dependency.
