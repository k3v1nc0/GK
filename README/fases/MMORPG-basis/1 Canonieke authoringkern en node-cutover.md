# Fase 1 - Canonieke authoringkern en node-cutover

**Status:** definitief implementatiecontract, nog niet geimplementeerd  
**Datum:** 2026-10-22  
**Repo-basis:** `main` op `5b7e36869a1aa98661753e02a4f319816e91eda7`  
**Doelpad:** `README/fases/MMORPG-basis/1 Canonieke authoringkern en node-cutover.md`  
**Architectuureigenaar:** Lead Systems Architect / Principal Game Engine Developer  

---

## 0. Besluit en interpretatie

Deze fase voert de cutover uit **van de graph als authoringbron naar een canonieke domeinauthoringkern**.

Dit document staat geen tegengestelde interpretatie toe:

- Nodes worden geen uitbreidingsmechanisme voor nieuwe gameplay.
- De Werkbank en Instellingen mogen na cutover geen verborgen nodes, edges, Groups, poorten, outputs of registries maken.
- Bestaande graphcontent blijft tijdelijk leesbaar via een legacy-adapter en wordt domein voor domein geimporteerd.
- De runtime blijft gepubliceerde, immutable read-modellen consumeren.
- Nieuwe enginecapaciteiten worden als code en getypeerde domeincontracten toegevoegd.
- Nieuwe projectinhoud wordt uitsluitend als canonieke authoringdocumenten opgeslagen.

De uitdrukking **node-cutover** betekent in dit document: gecontroleerd stoppen met de nodegraph als bron van waarheid. Zij betekent niet dat enginefuncties opnieuw naar nodes worden verplaatst.

### 0.1 Geen onmogelijke belofte

Geen softwarearchitectuur kan eerlijk garanderen dat zij nooit meer hoeft te evolueren. Deze kern wordt future-proof door onveranderlijke regels voor identiteit, transactions, references, schema versioning, migrations, compile-output en rollback. Nieuwe documentsoorten en nieuwe schemaversies mogen worden toegevoegd zonder bestaande content stil te herschrijven of bestaande runtimebuilds ongeldig te maken.

### 0.2 Normatieve taal

De woorden **MOET**, **MAG NIET**, **BEHOORT**, **MAG** en **OPTIONEEL** zijn normatief:

- **MOET / MAG NIET:** harde acceptatievoorwaarde.
- **BEHOORT:** alleen afwijken met een vastgelegde ADR en aantoonbaar gelijkwaardige garantie.
- **MAG / OPTIONEEL:** toegestane uitbreiding die de fase niet blokkeert.

---

## 1. Bewezen uitgangssituatie

Deze specificatie is gebaseerd op de actuele repository, niet op de verouderde statusregel in het eerdere legacyplan.

### 1.1 Huidige opslag

`db/migrations/001_initial_schema.sql` maakt onder andere:

- `editor_nodes`;
- `editor_node_edges`;
- `asset_library`;
- `draft_world_state`;
- `published_world_state`;
- `publish_history`.

`db/migrations/004_node_system_foundation.sql` voegt onder andere toe:

- `editor_graph_meta.graph_revision`;
- `content_id_aliases`;
- `graph_migration_runs`;
- build-ID, schemaversie en contenthash op draft/published/history.

### 1.2 Huidige write path

`src/server/graph-repository.js`:

- valideert node-types en velden;
- schrijft `editor_nodes` en `editor_node_edges`;
- bewaakt Groups en poorten;
- verhoogt `graph_revision`;
- wist de draftcache bij graphmutaties;
- slaat draft- en published world JSON op.

De W1-W3 Werkbank muteert deze graph via dezelfde routes. De graph is daardoor nog steeds de feitelijke authoringbron, ook wanneer Kevin geen nodes ziet.

### 1.3 Huidige compile path

`src/server/publish-service.js` en `src/server/game-project-compiler.js`:

1. lezen de graph;
2. volgen edges en Group Input/Output;
3. valideren nodewaarden en referenties;
4. compileren catalog-, campaign-, zone-, player-, UI- en worldreadmodellen;
5. schrijven draft of published world JSON.

### 1.4 Te behouden onderdelen

Deze fase vervangt niet onnodig:

- Node 24 en ESM;
- `node:sqlite`;
- dezelfde SQLite-databasefile;
- `asset_library` en bestaande uploads;
- gebruikers, sessies en rollen;
- runtime/player-state/economytabellen;
- de gedeelde Three.js-runtime;
- bestaande runtime-services;
- de vorm van bestaande published read-modellen zolang consumers die verwachten;
- het onderscheid tussen Save Draft en Save To Game;
- publish history retention;
- bestaande canonical IDs van geimporteerde content.

---

## 2. Fasedoel, scope en niet-doelen

### 2.1 Fasedoel

Fase 1 is geslaagd wanneer de nieuwe authoringkern bewezen is met drie verschillende aggregateklassen:

1. een globale singleton: `project_settings`;
2. een herbruikbare definitie: `item_definition`;
3. een ruimtelijke instantie: `placed_entity` met een ingebouwde `pickup`-component.

Kevin moet deze drie via Werkbank/Instellingen kunnen maken of bewerken, draften, herladen, publiceren, spelen, verplaatsen, verwijderen en opnieuw publiceren zonder een write naar `editor_nodes` of `editor_node_edges`.

### 2.2 In scope

- Canonieke project/workspace-identiteit.
- Getypeerde, versioned authoringdocumenten.
- Semantische document- en assetreferences.
- Domain kind registry.
- Commandservice, idempotency, optimistic concurrency en Undo/Redo.
- Deterministische canonical JSON en contenthashing.
- Structurele, semantische, referentie- en publishvalidatie.
- Draftcompile, publishcompile en atomic release pointer.
- Legacy graph importer en per-domein cutover state machine.
- Read-only Nodes-tab.
- Directe authoringroute voor Project Settings, Item en Placed Pickup.
- Compatibility-output naar de bestaande runtimecontracten.
- Corruptie-, lifecycle-, concurrency- en migrationtests.

### 2.3 Niet in scope

- Migratie van alle 186 node-types.
- Verwijderen van de legacytabellen.
- Nieuwe audio-, animatie-, AI-, combat-, quest- of UI-features.
- Herontwerp van de hele Werkbank-UI.
- Automatische demo- of acceptatiecontent.
- Een tweede database, tweede server of tweede runtime.
- Multiplayer schaalverbreding.
- Een generieke scripting- of pluginruntime uit databasecontent.

### 2.4 Wat na deze fase nog legacy mag zijn

Niet-gemigreerde domeinen mogen tijdelijk via bestaande Werkbankservices graphdata lezen en schrijven. Daarbij gelden drie harde voorwaarden:

1. de Nodes-tab zelf is read-only;
2. iedere documentsoort heeft precies een actieve writer;
3. een naar `canonical` omgezet domein mag nooit meer graphwrites ontvangen.

Dit is tijdelijke domeingewijze coexistentie, geen permanente dual-write.

---

## 3. Onveranderlijke kerninvarianten

Iedere implementatie en iedere latere fase MOET deze invarianten behouden.

### I-01 - Een bron per domein

Voor ieder authoringdomein is op ieder moment exact een bron schrijfbaar: legacy graph of canonieke documenten. Er bestaat geen toestand waarin dezelfde gebruikersactie beide bronnen schrijft.

### I-02 - Opaque, stabiele identiteit

Een `documentId` en `runtimeKey` zijn na creatie immutable. Hernoemen verandert uitsluitend `displayName` en payloadtekst.

### I-03 - Menselijke UI, technische IDs intern

Kevin kiest content op naam en preview. `documentId` en `runtimeKey` worden gegenereerd, niet ingevoerd in normale formulieren.

### I-04 - Atomic commands

Een gebruikersactie is precies een command en precies een SQLite-write transaction. Een command slaagt volledig of verandert niets.

### I-05 - Geen verloren writes

Iedere mutation vereist een actuele workspace-ETag. Een stale client krijgt `412 Precondition Failed`; de server overschrijft nooit stil nieuwere data.

### I-06 - Idempotente retries

Het opnieuw verzenden van exact hetzelfde `requestId` en dezelfde commandpayload geeft exact hetzelfde resultaat en voert de mutation niet opnieuw uit.

### I-07 - Getypeerde references

References wijzen naar immutable `documentId`s. Het verwachte targetkind en deletebeleid zijn schema-eigendom, niet clientinput.

### I-08 - Geen kapotte references

Een active document kan geen reference bevatten naar een ontbrekend, tombstoned of verkeerd getypeerd target.

### I-09 - Assets buiten payloadblobs

Binaire assets blijven in `asset_library` en bestandenopslag. Authoringpayloads bevatten uitsluitend asset-IDs.

### I-10 - Deterministische compile

Dezelfde canonieke documentsnapshot plus dezelfde compilerversie levert byte-identieke canonical runtime JSON en dezelfde SHA-256-contenthash op.

### I-11 - Published-only game

De normale game leest uitsluitend het atomisch aangewezen published build. Draft Preview is een apart kanaal en mag geen live player-state muteren.

### I-12 - Last-known-good

Een mislukte compile, corrupte build of onbekende runtime-schemaversie verandert de actieve published pointer niet. De game blijft de laatste geldige build gebruiken.

### I-13 - Versioned evolution

Iedere documentsoort heeft een integer schemaversie en uitsluitend sequentiele, geteste migraties. Code mag geen onbekende toekomstige versie raden.

### I-14 - Geen executable content

Payload JSON bevat data, geen JavaScript, SQL, HTML, bestandspaden of evalbare expressions. Formules gebruiken alleen bestaande getypeerde formulecontracten.

### I-15 - Een ruimtelijke eigenaar

Een `placed_entity` is de enige authoringowner van model, transform, collision en attached components voor die wereldinstantie.

### I-16 - Compile provenance

Iedere runtime-entry is herleidbaar tot `documentId`, `runtimeKey`, documentrevision en build-ID. Provenance mag diagnostics verrijken maar verandert geen gameplaybetekenis.

### I-17 - Verwijderen is veilig

Delete is standaard `restrict`. Vereiste backlinks blokkeren verwijderen. Optionele references worden alleen via een expliciet atomic replace/nullify-command gewijzigd.

### I-18 - Runtime vertrouwt geen editorpayload

De runtime ontvangt uitsluitend gevalideerde compileroutput. Hij interpreteert nooit rechtstreeks authoringdocumenten of legacy nodes.

### I-19 - Server is autoriteit

De server genereert IDs, timestamps, revisions, actor-ID en schema-eigendom. De client kan deze waarden niet afdwingen.

### I-20 - Herstelbaarheid

Voor iedere cutover bestaat vooraf een consistente databasebackup, een importreport, een parityreport en een laatste geldige published build.

---

## 4. Architectuurblueprint

```text
Browser editor
  Werkbank / Instellingen
       |
       | POST /api/authoring/commands + If-Match
       v
AuthoringCommandService
  - auth / idempotency / concurrency
  - command handler
  - schema + semantic validation
  - reference extraction
       |
       | one BEGIN IMMEDIATE transaction
       v
CanonicalAuthoringRepository (SQLite)
  - projects/workspace revision
  - documents/tombstones
  - semantic references
  - asset references
  - operations/inverse operations
  - cutover/import records
       |
       +--> AuthoringQueryService --> editor projections/backlinks
       |
       +--> CanonicalInputAdapter --------+
       |                                  |
Legacy graph --> LegacyGraphAdapter ------+--> CanonicalCompileInput
                 (read-only per cutover)   |      |
                                          |      v
                                          +--> GameProjectCompiler
                                                  |
                                                  v
                                  validated canonical runtime artifact
                                                  |
                           +----------------------+------------------+
                           |                                         |
                           v                                         v
                    Draft Preview build                       Published build
                    no player mutation                        atomic pointer
                                                                     |
                                                                     v
                                                          existing game runtime
```

### 4.1 Laagverantwoordelijkheden

| Laag | Verantwoordelijkheid | Mag niet |
| --- | --- | --- |
| UI projection | Menselijke formulieren, selection context, optimistic local state | IDs verzinnen, schema-eigendom bepalen, direct SQL of graphwrites doen |
| Command service | Een intent naar een atomic domeinmutation vertalen | Runtime JSON handmatig opbouwen |
| Domain registry | Schema, defaults, normalisatie, references, semantic validation, compilemapper | DB-state of DOM gebruiken |
| Repository | Transactions, revisions, persistence, query's | Gameplayregels of UI-logica bevatten |
| Query service | Documenten, relaties, backlinks en overzichten projecteren | Muteren |
| Legacy adapter | Bestaande graph deterministisch naar compile-input/importkandidaten vertalen | Nieuwe graphcontent ontwerpen |
| Compiler | Canonical compile-input naar runtimeartifact omzetten | Authoringdata muteren of defaults stil terugschrijven |
| Runtime | Published artifact uitvoeren | Authoringdocumenten/nodes lezen of repareren |

---

## 5. Identiteit, tijd en serialisatie

### 5.1 Project-ID

Fase 1 maakt exact een projectrecord voor de bestaande game:

```text
projectId = "project:main"
```

Latere multi-projectondersteuning gebruikt dezelfde tabellen met andere IDs; er mag geen globale singleton zonder `project_id` worden toegevoegd.

### 5.2 Document-ID

Nieuwe documenten krijgen server-side:

```text
documentId = "doc:" + crypto.randomUUID().toLowerCase()
```

Voorbeeld:

```text
doc:550e8400-e29b-41d4-a716-446655440000
```

De ID is opaque, immutable en nooit afgeleid van de naam.

### 5.3 Runtime-key

Nieuwe documenten krijgen server-side:

```text
runtimeKey = <kindPrefix> + ":" + crypto.randomUUID().toLowerCase()
```

Fase-1-prefixes:

| Kind | Prefix |
| --- | --- |
| `project_settings` | `project` |
| `item_definition` | `item` |
| `placed_entity` | `entity` |

Bestaande geimporteerde canonical IDs blijven exact behouden als `runtimeKey`, ook als zij punten of andere reeds toegestane separators bevatten. Een conflict blokkeert import; de importer mag nooit automatisch suffixes toevoegen.

### 5.4 Component-ID

Components zijn owned values binnen een `placed_entity` en krijgen:

```text
componentId = "cmp:" + crypto.randomUUID().toLowerCase()
```

Component-IDs zijn uniek binnen het document en immutable.

### 5.5 Entry-ID

Owned lijstregels zoals latere queststeps, offers en recipe ingredients krijgen:

```text
entryId = "entry:" + crypto.randomUUID().toLowerCase()
```

Arrayvolgorde is presentatie-/uitvoervolgorde; references en UI-selectie gebruiken `entryId`, nooit alleen de array-index.

### 5.6 Timestamps

- De server schrijft UTC RFC 3339 met milliseconden via `new Date().toISOString()`.
- Clienttimestamps worden genegeerd.
- Timestamps bepalen nooit commandvolgorde; revisions doen dat.

### 5.7 Canonical JSON

- Payloads moeten geldige I-JSON zijn.
- `undefined`, functions, symbols, BigInt, `NaN`, `Infinity`, `-Infinity` en `-0` zijn verboden.
- Integerwaarden buiten `Number.MIN_SAFE_INTEGER..Number.MAX_SAFE_INTEGER` worden als gedocumenteerde decimale strings gemodelleerd.
- Objectkeys worden recursief gesorteerd volgens RFC 8785 JCS.
- Arrayvolgorde blijft behouden.
- De opgeslagen `payload_json` is compact canonical JSON zonder extra whitespace.
- `payload_hash` is lowercase hex SHA-256 over de UTF-8-bytes van die canonical JSON.

De implementatie MOET vaste RFC-8785-testvectors gebruiken; een willekeurige `JSON.stringify` met alleen top-level sortering is onvoldoende.

---

## 6. Domain kind registry

Er bestaat exact een server-side registry als bron voor authoringcontracten. Databasecontent mag geen nieuw uitvoerbaar kind registreren.

### 6.1 Verplicht modulecontract

Iedere kindmodule exporteert conceptueel:

```js
{
  kind: "item_definition",
  domain: "catalog.items",
  runtimePrefix: "item",
  currentSchemaVersion: 1,
  jsonSchema: { /* JSON Schema 2020-12 */ },
  createDefaults(context),
  normalize(payload, context),
  validateSemantic(payload, context),
  extractDocumentReferences(payload),
  extractAssetReferences(payload),
  migrate: {
    // 1: migrateV1ToV2; alleen aanwezig wanneer versie 2 bestaat
  },
  compile(document, compileContext),
  legacyImport: {
    supportedNodeTypes: [/* ... */],
    import(legacyContext)
  }
}
```

### 6.2 Registryregels

- `kind` is lowercase snake_case en immutable.
- `domain` is een lowercase dotted key.
- Iedere kind heeft exact een `currentSchemaVersion`.
- Schema's gebruiken JSON Schema Draft 2020-12.
- Validator draait in strict mode; onbekende formats of keywords zijn implementatiefouten.
- `additionalProperties` staat standaard op `false` op ieder objectniveau.
- Defaults worden uitsluitend bij Create toegepast. Read/Compile vult geen ontbrekende velden stil aan.
- Normalize mag uitsluitend representatie normaliseren, bijvoorbeeld trimmen en tagvolgorde. Normalize mag geen referentietarget kiezen of gameplaywaarde bedenken.
- Semantic validation retourneert gestructureerde issues en gooit geen ongeclassificeerde exceptions.
- Compile is puur: geen DB, klok, random, netwerk of bestandssysteem.

### 6.3 Schema-evolutie

- Een bestaande schemaversie wordt nooit inhoudelijk gewijzigd nadat published content ermee is gemaakt.
- Een wijziging in betekenis, required velden, defaults of representatie vereist `schemaVersion + 1`.
- Migraties bestaan voor iedere stap `n -> n+1`; sprongen zijn verboden.
- Onbekende hogere versies geven `UNSUPPORTED_DOCUMENT_SCHEMA` en blokkeren edit/publish.
- Publish accepteert uitsluitend documenten op de huidige versie.
- Een migration run is expliciet, transactioneel en geaudit; read mag niet stil persistent migreren.

### 6.4 Concrete validator

De server gebruikt **Ajv 8** voor payloadschema's. `package.json` declareert `ajv` op major 8 en `package-lock.json` pint de werkelijk geinstalleerde versie. Er wordt exact een Draft-2020-12-instance gemaakt via `ajv/dist/2020.js` met:

```js
new Ajv2020({
  strict: true,
  allErrors: true,
  useDefaults: false,
  removeAdditional: false,
  coerceTypes: false,
  validateFormats: true
});
```

Aanvullende regels:

- Iedere schema bevat `$schema: "https://json-schema.org/draft/2020-12/schema"` en een unieke, stabiele `$id` met kind en versie.
- De authoring-validator mengt geen oudere JSON-Schema-drafts in dezelfde Ajv-instance.
- Fase 1 gebruikt geen custom keywords en geen niet-standaard formats.
- Schema's worden bij serverstartup gecompileerd. Een compilefout is een startupfout, geen contentdiagnostic.
- Ajv mag payloads nooit wijzigen. Defaults komen alleen uit `createDefaults`; normalization gebeurt ervoor als expliciete pure stap.
- Ajv-errors worden deterministisch gesorteerd op `instancePath`, `schemaPath` en `keyword` en daarna naar het error-envelope uit sectie 16 vertaald.

---

## 7. Normatieve Fase-1-documenten

### 7.1 Gemeenschappelijke envelope

De envelope staat in SQL-kolommen en wordt zo via de API geprojecteerd:

```json
{
  "projectId": "project:main",
  "documentId": "doc:<uuid>",
  "kind": "item_definition",
  "domain": "catalog.items",
  "schemaVersion": 1,
  "runtimeKey": "item:<uuid>",
  "displayName": "IJzererts",
  "state": "active",
  "documentRevision": 1,
  "payloadHash": "<sha256-hex>",
  "payload": {},
  "createdAt": "<server timestamp>",
  "updatedAt": "<server timestamp>"
}
```

`projectId`, IDs, kind, domain, schemaVersion, state, revisions, hashes en timestamps zijn server-owned.

`state` is normaal `active` of `tombstone`. `shadow` is uitsluitend een interne, niet-bewerkbare importstatus tijdens sectie 15; normale documentqueries verbergen deze records tenzij de expliciete cutoverdiagnosticroute ze opvraagt.

### 7.2 `project_settings` versie 1

Cardinaliteit: exact een active document per project.

```json
{
  "gameName": "GK Game",
  "defaultLanguage": "nl",
  "contentVersion": "0.1.0",
  "startRegionRef": null,
  "startSpawnRef": null
}
```

Regels:

- `gameName`: string, trim, 1..120 Unicode codepoints.
- `defaultLanguage`: lowercase BCP-47-basistaal voor Fase 1, regex `^[a-z]{2,3}$`.
- `contentVersion`: string, 1..32; Fase 1 valideert alleen lengte omdat huidige contentversies geen bewezen SemVer-contract hebben.
- `startRegionRef`: null of documentreference naar toekomstig kind `region_definition`; blijft in Fase 1 null.
- `startSpawnRef`: null of documentreference naar toekomstig kind `spawn_point`; blijft in Fase 1 null.
- Legacy `allowLegacyWorld` is cutoverconfiguratie en hoort niet in deze payload of nieuwe runtimecontent.

Compilecompatibiliteit:

```json
{
  "projectId": "<runtimeKey>",
  "gameName": "<payload.gameName>",
  "defaultLanguage": "<payload.defaultLanguage>",
  "contentVersion": "<payload.contentVersion>",
  "startZoneRef": null,
  "startSpawnRef": null,
  "allowLegacyWorld": true
}
```

`allowLegacyWorld: true` is uitsluitend een tijdelijke adapterwaarde zolang de overige werelddomeinen legacy zijn. Zij verdwijnt wanneer het worlddomein canonical wordt.

### 7.3 `item_definition` versie 1

De payload behoudt bewezen bestaande itemvelden zodat de huidige catalog- en economyruntime niet opnieuw ontworpen hoeft te worden:

```json
{
  "description": "",
  "tags": [],
  "iconAssetId": null,
  "worldModelAssetId": null,
  "category": "misc",
  "subcategory": "",
  "rarity": "common",
  "stackable": true,
  "stackLimit": 99,
  "weight": 0,
  "vendorBaseValueMinor": 0,
  "vendorCurrencyRef": null,
  "bindPolicy": "unbound",
  "tradable": true,
  "droppable": true,
  "destroyable": true,
  "marketEligible": false,
  "questItem": false,
  "equipmentSlotRef": null,
  "durabilityMax": 0,
  "useActionRefs": [],
  "statModifierRefs": [],
  "pickupAudioRef": null,
  "pickupVfxRef": null,
  "pickupAnimationRef": null,
  "inventoryTags": []
}
```

Normatieve grenzen:

| Veld | Contract |
| --- | --- |
| `description` | string, max 4000 codepoints |
| `tags`, `inventoryTags` | unieke lowercase canonical tags, lexicografisch genormaliseerd |
| assetvelden | null of bestaand `asset_library.id` van correct assettype |
| `category` | `material`, `consumable`, `equipment`, `quest`, `misc`, `custom` |
| `subcategory` | string, max 96 |
| `rarity` | `common`, `uncommon`, `rare`, `epic`, `legendary`, `quest`, `custom` |
| `stackLimit` | integer 1..1,000,000 |
| `weight` | finite number 0..1,000,000 |
| `vendorBaseValueMinor` | safe integer 0..100,000,000,000 |
| `bindPolicy` | `unbound`, `bind_on_pickup`, `bind_on_equip`, `character_bound`, `account_bound`, `quest_bound` |
| `durabilityMax` | integer 0..1,000,000 |
| refs | null of active document van het schema-eigen targetkind |

Semantische regels:

- Als `stackable=false`, MOET `stackLimit=1`.
- Als `questItem=true`, MOET `droppable=false`; `tradable=false`; `marketEligible=false`.
- Als `marketEligible=true`, MOET `tradable=true` en `questItem=false`.
- Als `vendorBaseValueMinor>0`, MOET `vendorCurrencyRef` niet-null zijn.
- Als `vendorBaseValueMinor=0`, MAG `vendorCurrencyRef` null of gezet zijn; dit verandert geen prijs zonder policyconsumer.
- `durabilityMax>0` is alleen toegestaan wanneer `category="equipment"`.
- Fase 1 biedt velden zonder actieve runtimeconsumer niet in de normale editor aan. Zij blijven wel schema-compatible voor import en latere fases.

Compilecompatibiliteit:

- `runtimeKey` wordt bestaande `itemId`.
- `displayName` wordt bestaande `displayName`.
- `description` en `tags` worden overeenkomstige definitievelden.
- Documentreferences worden voor compileroutput naar target `runtimeKey` vertaald.
- Asset-IDs blijven bestaande asset-IDs.

### 7.4 `placed_entity` versie 1

```json
{
  "label": "IJzererts pickup",
  "modelAssetId": "asset_<existing-id>",
  "transform": {
    "position": { "x": 0, "y": 0, "z": 0 },
    "rotationDegrees": { "x": 0, "y": 0, "z": 0 },
    "scale": { "x": 1, "y": 1, "z": 1 }
  },
  "solid": false,
  "walkable": false,
  "collisionRadius": 1,
  "minimapCategory": null,
  "animation": {
    "defaultClip": null,
    "idleClip": null,
    "walkClip": null,
    "runClip": null
  },
  "entityTags": [],
  "components": [
    {
      "componentId": "cmp:<uuid>",
      "type": "pickup",
      "itemRef": "doc:<item-uuid>",
      "amount": 1,
      "ownershipMode": "shared",
      "respawnPolicyRef": null,
      "interactionPrompt": "Pick up",
      "range": 3
    }
  ]
}
```

Transformregels:

- `position.x/y/z`: finite, -100000..100000, precisie maximaal 0.001.
- `rotationDegrees.x/y/z`: finite; normalize naar `[-180, 180)` bij write.
- `scale.x/y/z`: finite, 0.001..1000.
- Geen matrix/quaternion in Fase 1-payload. Compiler/runtime mag intern quaternion gebruiken.
- `collisionRadius`: finite, 0.05..100.

Model- en animationregels:

- `modelAssetId` is verplicht en verwijst naar `asset_library.asset_type='model'`.
- Clipvelden zijn null of exact een clipnaam uit gevalideerde assetmetadata.
- Fase 1 speelt geen nieuwe animation state machine; velden behouden huidige modelcompatibiliteit.

Componentregels:

- `components` bevat in Fase 1 exact een `pickup`-component voor de walking slice.
- `componentId` is uniek binnen het document.
- `(type, componentId)` wordt nooit door arraypositie geidentificeerd.
- `itemRef` is verplicht en verwijst naar een active `item_definition`.
- `amount`: integer 1..1,000,000.
- `ownershipMode`: `personal`, `shared`, `party_policy`.
- `range`: finite 0.1..1000.
- `respawnPolicyRef` blijft null totdat dat kind canonical is.
- Een pickup mag geen currency simuleren; currency wordt later een expliciete componentvariant.

Compilecompatibiliteit:

- De canonical adapter maakt in memory dezelfde betekenis als een `model_entity` plus `entity_assembly` plus `pickup_component`.
- De adapter maakt geen database-node of edge.
- `runtimeKey` is de enige entity-ID in editor- en gameruntime.
- De pickupcomponent verwijst in compile-output naar het item zijn `runtimeKey`.
- Model, transform, collision en componentgedrag worden precies een keer uitgegeven.

---

## 8. Exact SQLite-schema

De eerstvolgende vrije migrationnummers worden bij implementatie uit `db/migrations` gelezen. Bestandsnamen in dit document zijn logisch; een developer mag geen bestaand nummer overschrijven.

### 8.1 Preflight

Voor de schema-migration MOET de startupcheck uitvoeren:

```sql
PRAGMA foreign_keys;
PRAGMA journal_mode;
SELECT json_valid('{}') AS json1_available;
```

Verplicht:

- `foreign_keys = 1`;
- journal mode `wal` op de live database;
- `json1_available = 1`.

Bij mislukken stopt startup met een gerichte configuratiefout voordat migrations worden uitgevoerd.

### 8.2 Migration SQL

```sql
CREATE TABLE IF NOT EXISTS authoring_projects (
  project_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  workspace_revision INTEGER NOT NULL DEFAULT 0 CHECK (workspace_revision >= 0),
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS authoring_documents (
  project_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  domain_key TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  runtime_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN ('shadow', 'active', 'tombstone')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  payload_hash TEXT NOT NULL,
  document_revision INTEGER NOT NULL CHECK (document_revision >= 1),
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  tombstoned_at TEXT,
  PRIMARY KEY (project_id, document_id),
  UNIQUE (project_id, runtime_key),
  FOREIGN KEY (project_id) REFERENCES authoring_projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_authoring_documents_kind
  ON authoring_documents(project_id, kind, lifecycle_state, display_name);

CREATE INDEX IF NOT EXISTS idx_authoring_documents_domain
  ON authoring_documents(project_id, domain_key, lifecycle_state);

CREATE TABLE IF NOT EXISTS authoring_references (
  project_id TEXT NOT NULL,
  source_document_id TEXT NOT NULL,
  field_path TEXT NOT NULL,
  instance_path TEXT NOT NULL,
  target_document_id TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  required INTEGER NOT NULL CHECK (required IN (0, 1)),
  delete_policy TEXT NOT NULL CHECK (delete_policy IN ('restrict', 'nullify')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, source_document_id, instance_path),
  FOREIGN KEY (project_id, source_document_id)
    REFERENCES authoring_documents(project_id, document_id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, target_document_id)
    REFERENCES authoring_documents(project_id, document_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_authoring_references_target
  ON authoring_references(project_id, target_document_id, source_document_id);

CREATE TABLE IF NOT EXISTS authoring_asset_references (
  project_id TEXT NOT NULL,
  source_document_id TEXT NOT NULL,
  field_path TEXT NOT NULL,
  instance_path TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  required INTEGER NOT NULL CHECK (required IN (0, 1)),
  expected_asset_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, source_document_id, instance_path),
  FOREIGN KEY (project_id, source_document_id)
    REFERENCES authoring_documents(project_id, document_id) ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES asset_library(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_authoring_asset_references_asset
  ON authoring_asset_references(asset_id, project_id, source_document_id);

CREATE TABLE IF NOT EXISTS authoring_operations (
  operation_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  actor_user_id TEXT,
  command_type TEXT NOT NULL,
  target_document_id TEXT,
  base_workspace_revision INTEGER NOT NULL,
  result_workspace_revision INTEGER NOT NULL,
  forward_json TEXT NOT NULL CHECK (json_valid(forward_json)),
  inverse_json TEXT NOT NULL CHECK (json_valid(inverse_json)),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  undoes_operation_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, request_id),
  UNIQUE (project_id, result_workspace_revision),
  FOREIGN KEY (project_id) REFERENCES authoring_projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_authoring_operations_target
  ON authoring_operations(project_id, target_document_id, result_workspace_revision);

CREATE TABLE IF NOT EXISTS authoring_domain_cutovers (
  project_id TEXT NOT NULL,
  domain_key TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('legacy', 'shadow', 'canonical', 'retired')),
  legacy_graph_revision INTEGER,
  canonical_workspace_revision INTEGER,
  import_run_id TEXT,
  parity_hash TEXT,
  changed_by_user_id TEXT,
  changed_at TEXT NOT NULL,
  PRIMARY KEY (project_id, domain_key),
  FOREIGN KEY (project_id) REFERENCES authoring_projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS authoring_import_runs (
  import_run_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  domain_key TEXT NOT NULL,
  source_graph_revision INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('preview', 'shadow', 'final', 'failed')),
  source_hash TEXT NOT NULL,
  result_hash TEXT,
  report_json TEXT NOT NULL CHECK (json_valid(report_json)),
  actor_user_id TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (project_id) REFERENCES authoring_projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_authoring_import_runs_domain
  ON authoring_import_runs(project_id, domain_key, created_at);

CREATE TABLE IF NOT EXISTS authoring_schema_migration_runs (
  migration_run_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  from_schema_version INTEGER NOT NULL CHECK (from_schema_version >= 1),
  to_schema_version INTEGER NOT NULL CHECK (to_schema_version = from_schema_version + 1),
  source_workspace_revision INTEGER NOT NULL,
  result_workspace_revision INTEGER,
  status TEXT NOT NULL CHECK (status IN ('started', 'succeeded', 'failed')),
  migrated_count INTEGER NOT NULL DEFAULT 0 CHECK (migrated_count >= 0),
  report_json TEXT NOT NULL CHECK (json_valid(report_json)),
  actor_user_id TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (project_id) REFERENCES authoring_projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_authoring_schema_migrations_kind
  ON authoring_schema_migration_runs(project_id, kind, created_at);

CREATE TABLE IF NOT EXISTS authoring_legacy_map (
  project_id TEXT NOT NULL,
  domain_key TEXT NOT NULL,
  legacy_node_id TEXT NOT NULL,
  legacy_node_type TEXT NOT NULL,
  document_id TEXT NOT NULL,
  import_run_id TEXT NOT NULL,
  legacy_content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, legacy_node_id),
  UNIQUE (project_id, document_id, legacy_node_id),
  FOREIGN KEY (project_id, document_id)
    REFERENCES authoring_documents(project_id, document_id) ON DELETE RESTRICT,
  FOREIGN KEY (import_run_id) REFERENCES authoring_import_runs(import_run_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS authoring_builds (
  build_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('draft', 'published')),
  source_workspace_revision INTEGER NOT NULL,
  compiler_version TEXT NOT NULL,
  runtime_schema_version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  artifact_json TEXT NOT NULL CHECK (json_valid(artifact_json)),
  diagnostics_json TEXT NOT NULL CHECK (json_valid(diagnostics_json)),
  actor_user_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, channel, source_workspace_revision, compiler_version),
  FOREIGN KEY (project_id) REFERENCES authoring_projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_authoring_builds_project_channel
  ON authoring_builds(project_id, channel, created_at DESC);

CREATE TABLE IF NOT EXISTS authoring_release_channels (
  project_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('draft', 'published')),
  build_id TEXT NOT NULL,
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, channel),
  FOREIGN KEY (project_id) REFERENCES authoring_projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY (build_id) REFERENCES authoring_builds(build_id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS authoring_compile_attempts (
  attempt_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('draft', 'published')),
  source_workspace_revision INTEGER NOT NULL,
  compiler_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('failed', 'succeeded')),
  diagnostics_json TEXT NOT NULL CHECK (json_valid(diagnostics_json)),
  build_id TEXT,
  actor_user_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES authoring_projects(project_id) ON DELETE CASCADE,
  FOREIGN KEY (build_id) REFERENCES authoring_builds(build_id) ON DELETE SET NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

### 8.3 Initialisatie

Na schema-aanmaak maakt de bootstrapservice exact een project idempotent aan. `now` is eenmaal door de server berekend met `new Date().toISOString()` en wordt tweemaal als gebonden parameter gebruikt:

```sql
INSERT OR IGNORE INTO authoring_projects (
  project_id, display_name, workspace_revision,
  created_by_user_id, updated_by_user_id, created_at, updated_at
) VALUES (
  'project:main', 'GK Game', 0,
  NULL, NULL, :now, :now
);
```

Cutoverrijen gebruiken dezelfde serverwaarde `now`:

```sql
INSERT OR IGNORE INTO authoring_domain_cutovers
  (project_id, domain_key, mode, changed_at)
VALUES
  ('project:main', 'project.settings', 'legacy', :now),
  ('project:main', 'catalog.items', 'legacy', :now),
  ('project:main', 'world.placements', 'legacy', :now);
```

De SQL-driver bindt `:now`; de placeholdertekst wordt nooit letterlijk opgeslagen. Bootstrap draait binnen dezelfde migration/startuptransactie en controleert daarna dat alle drie de cutoverrijen bestaan.

### 8.4 Wat niet in SQL-triggers hoort

SQLite-triggers mogen geen JSON payload normaliseren, references extraheren, schema migreren of runtimeoutput compileren. Dat blijft geteste applicatielogica. Foreign keys, uniqueness en CHECK-constraints vormen de laatste opslagbarriere.

---

## 9. Command- en statemanagement

### 9.1 Workspace revision

`authoring_projects.workspace_revision` is de totale volgorde van succesvolle authoringcommands binnen een project.

- Startwaarde: 0.
- Iedere succesvolle mutation verhoogt exact met 1.
- Een no-op die na normalisatie geen state verandert, maakt geen operation en verhoogt niet.
- Imports en schema migrations die documents veranderen tellen als een command/batch en verhogen precies eenmaal per atomic batch.
- Compile en publish veranderen de workspace revision niet.

### 9.2 Command envelope

```json
{
  "requestId": "req:<uuid>",
  "command": {
    "type": "CreateDocument",
    "payload": {}
  }
}
```

HTTP-header:

```text
If-Match: "ws:42"
```

De server leidt `projectId` en actor af uit route/authcontext. Clientvelden met actor, timestamps, revision, hash of lifecycle worden geweigerd als onbekende properties.

### 9.3 Fase-1-commandtypes

| Command | Betekenis |
| --- | --- |
| `CreateDocument` | Maakt een document met server-IDs/defaults. |
| `ReplaceDocumentPayload` | Vervangt displayName + volledige payload na validatie. |
| `SetProjectTitle` | Gerichte UI-command voor projectnaam; vertaalt server-side naar replace. |
| `CreateItemDefinition` | Gerichte create-command. |
| `UpdateItemDefinition` | Gerichte replace-command. |
| `PlacePickupEntity` | Maakt een placed entity met pickupcomponent op een bestaand modelasset. |
| `UpdatePlacedEntityTransform` | Vervangt alleen transform met volledige entityvalidatie. |
| `UpdatePickupComponent` | Wijzigt de owned pickupcomponent. |
| `TombstoneDocument` | Logisch verwijderen na backlinkcheck. |
| `RestoreDocument` | Herstelt een tombstone wanneer runtimeKey en references nog geldig zijn. |
| `ReplaceReferenceAndTombstone` | Atomic targetvervanging bij alle expliciet gekozen sources en daarna delete. |
| `UndoOperation` | Voert opgeslagen inverse uit als een nieuwe operation. |
| `RedoOperation` | Voert de oorspronkelijke forward intent opnieuw uit als nieuwe operation. |

Een generieke clientgestuurde SQL-, JSON Patch- of `set arbitrary path`-command is verboden.

### 9.4 Atomic mutation-algoritme

Iedere commandhandler volgt exact deze volgorde:

1. Authenticatie en editorrol controleren.
2. Requestbodylimiet en JSON parse controleren.
3. Command envelope strict valideren.
4. Canonical requesthash berekenen over `{projectId, command}`.
5. `BEGIN IMMEDIATE`.
6. Bestaand `(project_id, request_id)` opzoeken.
7. Bij bestaande receipt:
   - gelijke requesthash: opgeslagen `result_json` retourneren; transaction rollback/commit zonder mutation;
   - andere hash: rollback en `409 IDEMPOTENCY_CONFLICT`.
8. Project en huidige workspace revision lezen.
9. `If-Match` strong vergelijken.
10. Cutovermode voor betrokken domein lezen en writebevoegdheid controleren.
11. Betrokken documenten/assets/references binnen dezelfde transaction lezen.
12. Command naar kandidaat-state reduceren.
13. Normalize uitvoeren.
14. JSON Schema valideren.
15. Semantic validation uitvoeren.
16. Document- en assetreferences extraheren en targets valideren.
17. Exacte forward- en inverse-intent opbouwen.
18. Documents en reference-index schrijven.
19. Workspace revision exact met 1 verhogen met guarded update.
20. Operation row schrijven.
21. `COMMIT`.
22. Pas na commit caches invalidaten en response sturen.

Geen `await`, netwerkcall, bestand-I/O, thumbnailwerk of compilerwerk mag binnen de SQLite-write transaction plaatsvinden.

### 9.5 Guarded revision update

De revisionupdate gebruikt:

```sql
UPDATE authoring_projects
SET workspace_revision = workspace_revision + 1,
    updated_by_user_id = ?,
    updated_at = ?
WHERE project_id = ? AND workspace_revision = ?;
```

`changes !== 1` betekent concurrency conflict, gevolgd door rollback en `412`.

### 9.6 Undo/Redo

- Undo is geen lokale graphrestore meer.
- Iedere operation bewaart een volledige, gevalideerde inverse commandpayload.
- Undo vereist de actuele workspace ETag.
- Undo maakt een nieuwe operation met `undoes_operation_id`.
- Een operation kan maximaal eenmaal direct worden undone; Redo is een nieuwe toepassing van de forward intent.
- Als latere wijzigingen de inverse ongeldig maken, faalt Undo met gestructureerde conflictissues en verandert niets.
- Undo kan nooit een published build terugdraaien; publiceren is een apart expliciet commando.

---

## 10. References, ownership en deletion

### 10.1 Documentreferencevorm

In authoringpayloads is een reference uitsluitend een `documentId`-string of null. `runtimeKey`, naam of node-ID wordt niet als authoringreference opgeslagen.

### 10.2 JSON Pointer

- `instance_path` gebruikt RFC 6901 JSON Pointer naar de concrete payloadlocatie.
- `field_path` gebruikt de stabiele schemapadnotatie met `*` voor lijstitems, bijvoorbeeld `/components/*/itemRef`.
- Pointers beginnen altijd bij de payloadroot.
- `~` wordt `~0`; `/` wordt `~1`.

### 10.3 Reference extraction

Na iedere payloadmutation:

1. kindmodule extraheert complete gewenste reference-sets;
2. server valideert dubbele `instance_path`s;
3. server valideert target active, projectgelijk en kindcompatibel;
4. bestaande source rows worden verwijderd;
5. nieuwe rows worden ingevoegd;
6. dezelfde aanpak geldt voor assetreferences.

Incremental half-update is verboden; de index is een transactionele projectie van de volledige payload.

### 10.4 Owned data versus references

Owned data zonder zelfstandig hergebruik leeft binnen het aggregate:

- pickupcomponent in placed entity;
- later recipe ingredients in recipe;
- vendor offers in vendor catalog;
- queststeps/objectives/rewards in quest;
- dialogue entries/choices in dialogue.

Herbruikbare of zelfstandig geplaatste objecten zijn aparte documenten en worden gerefereerd.

### 10.5 Deletebeleid

- Required reference: altijd `restrict`.
- Optional reference: schema kiest `restrict` of `nullify`; client kan dit niet wijzigen.
- Fase 1 gebruikt `restrict` voor `placed_entity.components[*].itemRef`.
- Tombstone verwijdert uitgaande reference-indexrows maar bewaart de payload voor Undo/audit.
- Inkomende required references blokkeren tombstone.
- UI toont menselijke backlinks voordat delete wordt bevestigd.
- Hard delete/purge is geen editoractie en valt buiten Fase 1.

### 10.6 Assetdelete

`asset_library`-delete wordt geblokkeerd zolang `authoring_asset_references` of legacy usage de asset gebruikt. Tijdens coexistentie telt usage uit beide bronnen; dubbel getelde usage wordt op bron weergegeven, niet stil samengevoegd.

---

## 11. HTTP API-contract

Alle routes vereisen bestaande editorauthenticatie. JSON responses gebruiken UTF-8 en `application/json`.

### 11.1 Queries

```text
GET /api/authoring/workspace
GET /api/authoring/documents?kind=<kind>&state=active
GET /api/authoring/documents/:documentId
GET /api/authoring/documents/:documentId/backlinks
GET /api/authoring/cutovers
GET /api/authoring/builds/current?channel=draft|published
GET /api/authoring/validation
```

Iedere workspace/documentresponse bevat een strong ETag:

```text
ETag: "ws:<workspaceRevision>"
ETag: "doc:<documentRevision>:<payloadHash>"
```

Documentlijsten zijn stabiel gesorteerd op `displayName` met codepointvergelijking, daarna `documentId`. Locale-afhankelijke DB-sortering bepaalt nooit compilevolgorde.

### 11.2 Mutations

```text
POST /api/authoring/commands
POST /api/authoring/validate
POST /api/authoring/save-draft
POST /api/authoring/publish
POST /api/authoring/imports/:domain/preview
POST /api/authoring/imports/:domain/shadow
POST /api/authoring/cutovers/:domain/finalize
```

`commands`, `save-draft`, `publish` en cutovermutations vereisen `If-Match`.

### 11.3 Succesresponse command

```json
{
  "ok": true,
  "operationId": "op:<uuid>",
  "workspaceRevision": 43,
  "changedDocumentIds": ["doc:<uuid>"],
  "documents": [],
  "warnings": []
}
```

Header:

```text
ETag: "ws:43"
```

### 11.4 Error envelope

```json
{
  "ok": false,
  "error": {
    "code": "REFERENCE_KIND_MISMATCH",
    "message": "Item verwijst naar een definitie van het verkeerde type.",
    "requestId": "req:<uuid>",
    "retryable": false,
    "issues": [
      {
        "documentId": "doc:<uuid>",
        "kind": "placed_entity",
        "path": "/components/0/itemRef",
        "code": "REFERENCE_KIND_MISMATCH",
        "message": "Verwacht item_definition, kreeg currency_definition."
      }
    ]
  }
}
```

### 11.5 Statuscodes

| HTTP | Gebruik |
| --- | --- |
| 400 | JSON/envelope/routeparameters ongeldig |
| 401 | niet ingelogd |
| 403 | geen editorbevoegdheid |
| 404 | document/project/build niet gevonden |
| 409 | idempotencyconflict, duplicate runtime key of domeinstateconflict |
| 410 | legacy mutation voor canonical/retired domein |
| 412 | stale/mismatching `If-Match` |
| 413 | body/payload te groot |
| 422 | schema-, semantic-, reference- of publishvalidatie |
| 428 | verplichte `If-Match` ontbreekt |
| 500 | geclassificeerde interne fout met serverlog-correlation ID |
| 503 | DB busy na ingestelde timeout of tijdelijk compiler/runtime niet beschikbaar |

Stacktraces, SQL, absolute paden en payloads met mogelijk gevoelige tekst worden nooit naar de browser gestuurd.

---

## 12. Query- en editorstate

### 12.1 Serverstate is autoriteit

De browser bewaart:

- de laatst geladen workspace revision;
- een querycache per documentId;
- lokale formulierdrafts;
- selection/focus/layoutstate;
- een queue van maximaal een actieve mutation.

De browser bewaart niet als autoriteit:

- canonical IDs;
- references buiten formulierdrafts;
- operation history;
- published status;
- compilevaliditeit.

### 12.2 Optimistic UI

- De UI mag een formulier lokaal tonen voordat de response terug is.
- De viewport mag transformdrag visueel direct tonen.
- De canonical cache wordt pas bevestigd met serverresponse.
- Bij 412 herlaadt de UI de betrokken documenten, behoudt de menselijke formulierdraft en toont een conflictkeuze; hij retryt niet automatisch.
- Bij andere fout keert de authoritative projection terug naar de laatst bevestigde state.

### 12.3 Selectie en identiteit

Viewportobjecten dragen `documentId` als editor metadata en `runtimeKey` als runtime identity. Selectie wordt nooit via label, modelasset of positie afgeleid.

---

## 13. Canonical compile-input

### 13.1 Doel

`GameProjectCompiler` mag na de overgang niet weten of content oorspronkelijk uit nodes of canonical documents kwam.

### 13.2 Interface

```js
{
  projectId: "project:main",
  sourceWorkspaceRevision: 43,
  compilerVersion: "gk-project-compiler-v<N>",
  domains: {
    project: { settings: {/* compiled authoring representation */} },
    catalog: { items: new Map() },
    world: { placedEntities: [] }
  },
  provenance: {
    "<runtimeKey>": {
      source: "canonical" | "legacy_graph",
      documentId: "doc:<uuid>" | null,
      documentRevision: 1,
      legacyNodeIds: []
    }
  }
}
```

Maps worden voor serialisatie/compile altijd op `runtimeKey`, daarna documentId gesorteerd.

### 13.3 Adapters

- `CanonicalInputAdapter` leest active documents voor canonical domeinen.
- `LegacyGraphAdapter` gebruikt bestaande graphresolver/compilerlogica voor legacy/shadow domeinen.
- `CanonicalCompileInputBuilder` kiest per `authoring_domain_cutovers.mode` exact een semantic source.
- In `shadow` wordt legacy als actieve compilebron gebruikt; canonical wordt alleen parallel gecompileerd voor paritydiagnostics.
- In `canonical` en `retired` mag de graphadapter niets voor dat domein leveren.
- Een duplicate `runtimeKey` over actieve domeinbronnen is een blocking error.

### 13.4 Geen mix binnen een domein

`catalog.items` komt als geheel uit legacy of canonical. Een compiler mag niet enkele items uit nodes en andere items uit documents samenvoegen in dezelfde actieve bron. Nieuwe canonical items worden pas normaal publiceerbaar nadat `catalog.items` canonical is.

Fase 1 maakt daarom de final cutover voor de drie genoemde domeinen voordat Kevin de walking-slice content maakt.

---

## 14. Draft, publish en runtime-activatie

### 14.1 Compile snapshot

Voor Save Draft of Publish:

1. Auth en `If-Match` controleren.
2. Korte SQLite read transaction starten.
3. Projectrevision, cutoverstates, active documents, refs en benodigde legacy graphrevision lezen.
4. In-memory immutable snapshot maken.
5. Read transaction sluiten.
6. Buiten transaction normal input bouwen, valideren en compileren.
7. Canonical runtimeartifact volgens RFC 8785 serialiseren.
8. SHA-256-contenthash berekenen.
9. Resultaat in een korte write transaction opslaan.

Als workspace revision tijdens compile verandert, blijft de build geldig voor zijn vastgelegde source revision. De UI krijgt een waarschuwing dat nieuwere niet-gecompileerde wijzigingen bestaan. Publish mag alleen de expliciet aangevraagde snapshot activeren; hij mag niet halverwege naar nieuwere data springen.

### 14.2 Build-ID

```text
buildId = "build:" + crypto.randomUUID().toLowerCase()
```

Buildmetadata bevat minimaal:

```json
{
  "buildId": "build:<uuid>",
  "projectId": "project:main",
  "channel": "published",
  "sourceWorkspaceRevision": 43,
  "compilerVersion": "gk-project-compiler-v<N>",
  "runtimeSchemaVersion": "<existing project schema version>",
  "contentHash": "<sha256>"
}
```

### 14.3 Validatiegate

Een build wordt alleen ingevoegd als er nul blocking issues zijn. Warnings worden opgeslagen in `diagnostics_json` maar veranderen de hash van het gameplayartifact niet.

### 14.4 Atomic pointer

Buildinsert en update van `authoring_release_channels` gebeuren in een `BEGIN IMMEDIATE` transaction. Een crash voor commit laat de oude pointer staan; een crash na commit wijst naar een volledig opgeslagen build.

### 14.5 Compatibility mirror

Totdat alle bestaande runtime-endpoints de nieuwe buildrepository lezen:

- dezelfde succesvol gecompileerde artifact JSON wordt in dezelfde transaction of een bewezen idempotente coordinator naar bestaande `draft_world_state` / `published_world_state` geschreven;
- `build_id`, `schema_version` en `content_hash` moeten gelijk zijn;
- bij failure mag de release pointer niet worden geactiveerd;
- deze mirror is runtimecompatibiliteit, geen tweede authoringbron;
- een contracttest vergelijkt byte/canonical hash tussen beide opslagvormen.

### 14.6 Runtime load

De runtime:

1. leest build-ID/version;
2. haalt alleen bij gewijzigd build-ID de artifact op;
3. controleert runtime schema version;
4. canonicaliseert en verifieert contenthash;
5. bouwt een nieuwe in-memory world naast de actieve state;
6. activeert pas na succesvolle parse/constructie;
7. behoudt bij failure de vorige in-memory build en logt een geclassificeerde fout.

Een corrupte build mag niet leiden tot gedeeltelijk gewiste worldstate.

### 14.7 Draft Preview

- Preview leest channel `draft`.
- Preview gebruikt een gescheiden tijdelijke playersession of read-only sandboxstate.
- Pickup, rewards, inventory en questacties uit preview worden nooit in echte playertabellen vastgelegd.
- Terugkeren naar Editor vernietigt de previewsession, niet de authoringstate.

---

## 15. Exact node-cutoverprotocol

### 15.1 Domeinen in Fase 1

| Domain key | Legacybron | Canonieke bron |
| --- | --- | --- |
| `project.settings` | `game_project_settings` via bestaande projectcompiler | exact een `project_settings` document |
| `catalog.items` | `item_definition` nodes via Catalog Compiler | `item_definition` documents |
| `world.placements` | `model_entity` + `entity_assembly` + `pickup_component` graphketen | `placed_entity` documents met owned pickupcomponent |

### 15.2 State machine

```text
legacy -> shadow -> canonical -> retired
```

- `legacy`: graph is actieve bron/writer voor dit domein.
- `shadow`: graph blijft actieve bron; importer onderhoudt alleen expliciet opnieuw gegenereerde canonical shadowdocuments en parityreports. Normale canonical writes zijn geblokkeerd.
- `canonical`: documents zijn bron/writer; graphcontent voor het domein is frozen en genegeerd door actieve compile.
- `retired`: parity-/observatieperiode is voorbij; legacy mapping blijft auditbaar, graphdata mag later offline worden gearchiveerd.

Teruggaan naar een eerdere mode via de normale editor is verboden. Een operationele rollback activeert een eerdere published build en herstelt applicatiecode/databasebackup volgens sectie 22; hij maakt geen nieuwe graphwaarheid.

### 15.3 Stap 0 - Freeze

Voor implementatie:

- Geen nieuw node-type.
- Geen nieuw veld aan de drie legacytypes behalve een blockerfix die import noodzakelijk maakt.
- Nodes-tab label `Legacy - alleen lezen`.
- Create/connect/delete/field/position-controls verdwijnen of worden disabled met uitleg.
- `Toon in nodes` blijft inspectie.

### 15.4 Stap 1 - Inventory

Importer maakt per domein een report met:

- graph revision;
- betrokken node IDs/types/schemaVersions;
- canonical IDs/runtime keys;
- edges die eigendom/relaties bepalen;
- assets;
- warnings;
- blocking ambiguity/collision/orphan issues;
- canonical source hash.

Geen data wordt geschreven in previewmode.

### 15.5 Stap 2 - Shadow import

- Vereist dat graph revision nog gelijk is aan preview revision.
- Maakt of vervangt uitsluitend shadowdocuments en mappings voor dat domein.
- Bestaande mapping bepaalt dezelfde `documentId`; herhaalde import is idempotent.
- Eerste import genereert server-side documentIds maar behoudt legacy runtime keys.
- Shadowdocuments zijn niet schrijfbaar via normale commands.
- Iedere source node krijgt exact een legacy maprow; owned componentnodes mogen naar hetzelfde placed-entity-document wijzen.

### 15.6 Projectimport

- Exact een actieve `game_project_settings` is toegestaan.
- Nul nodes: blocker; er wordt geen projectinhoud verzonnen.
- Meer dan een: blocker.
- `projectId` wordt runtimeKey.
- `gameName`, `defaultLanguage`, `contentVersion` worden exact genormaliseerd.
- `startZoneRef` wordt niet stil naar `startRegionRef` omgezet; zolang worldregions niet canonical zijn blijft die informatie in importdiagnostics/compatibility provenance en de legacy worldcompiler levert de runtimewaarde.

### 15.7 Itemimport

- Iedere `item_definition` wordt een document.
- `itemId` wordt runtimeKey.
- `displayName` wordt envelope displayName.
- Overige bewezen velden worden payloadvelden.
- References worden eerst op legacy canonical ID opgelost via de bestaande symbolindex; daarna naar imported target documentId vertaald.
- Een reference naar een nog legacy ander domein mag tijdens shadow als unresolved external legacy reference in het importreport staan, maar blokkeert final canonical cutover tenzij het Fase-1-schema die reference null laat of het targetdomein gelijktijdig canonical wordt.
- Geen reference wordt op naam of ID-prefix gegokt.

### 15.8 Placement/pickupimport

- De importer gebruikt bestaande group-aware edge resolution.
- Een `entity_assembly` mag maximaal een modelbron en maximaal een pickupcomponent voor deze Fase-1-import hebben.
- De model node levert model/transform/collision/animationvelden.
- Assembly levert runtime entityId/label/tags waar dat bestaande compilecontract eigenaar van is.
- Pickup node levert componentvelden.
- Ambigue meerdere modellen, meerdere pickups, ontbrekend verplicht model, cross-group fout of niet-oplosbare itemRef blokkeert import.
- Los `pickup_spawn` is niet hetzelfde als een authored placed pickup en wordt in Fase 1 niet geimporteerd naar `placed_entity`.
- RuntimeKey volgt de bestaande authoritative assembly/entity-ID volgens de huidige compileruitkomst; de importer mag niet op basis van nodevolgorde kiezen.

### 15.9 Stap 3 - Parity compile

Voor ieder domein worden twee compile-inputs gemaakt vanaf dezelfde graph revision/import run:

- A: bestaande legacy compile;
- B: canonical shadow compile.

Voor vergelijking worden alleen expliciet niet-semantische velden uitgesloten:

- build-ID;
- timestamps;
- provenancebron;
- diagnosticsvolgorde nadat issues canoniek zijn gesorteerd.

Geen gameplayveld, transform, asset, ID, reference, default of component mag worden uitgesloten.

Parity vereist:

- canonical JSON deep equality;
- gelijke semantic contenthash;
- gelijke assetmanifestset;
- gelijke reference-/symbolset;
- nul blocking importissues.

### 15.10 Stap 4 - Finalize

Finalize vereist:

- actuele graph revision gelijk aan import source revision;
- actuele workspace revision gelijk aan request ETag;
- laatste shadow parity pass;
- recente consistente databasebackup geregistreerd door operator;
- geen actieve editorcommandqueue;
- successful draft compile.

In een transaction:

1. alle shadowdocuments van het domein worden na herhaalde validatie atomisch naar lifecycle state `active` gezet;
2. cutover mode wordt `canonical`;
3. graph revision, workspace revision, import run en parity hash worden vastgelegd;
4. workspace revision stijgt eenmaal;
5. cutover operation wordt gelogd.

Na commit:

- querycache invalideren;
- legacy mutationguard activeren;
- nieuwe draft compile starten op expliciete gebruikersactie, niet stil publiceren.

### 15.11 Stap 5 - Mutation guard

Na `canonical`:

- graphcreate/update/delete/restore-acties die nodes van dit domein zouden wijzigen geven `410 LEGACY_DOMAIN_READ_ONLY`;
- oude Werkbankhandlers voor dit domein worden vervangen door canonical commands;
- compiler negeert legacy nodes uit dit domein;
- `Toon in nodes` labelt ze als frozen legacy source en linkt naar het canonical document;
- geen sync terug naar graph.

### 15.12 Stap 6 - Observatie en retire

`retired` mag pas na Kevins volledige lifecycleacceptatie en minimaal:

- create/edit/reload;
- draft preview;
- publish/game;
- move;
- delete/republish;
- Undo/Redo;
- server restart;
- database backup/restoretest;
- nul parity- of orphanissues.

Fysieke verwijdering van graphrows gebeurt niet in Fase 1.

---

## 16. Validatie- en foutafhandelingsmodel

### 16.1 Issuevorm

```json
{
  "severity": "error",
  "stage": "reference",
  "code": "REFERENCE_TARGET_TOMBSTONED",
  "documentId": "doc:<uuid>",
  "kind": "placed_entity",
  "path": "/components/0/itemRef",
  "message": "Het gekozen item is verwijderd.",
  "relatedDocumentId": "doc:<uuid>",
  "repairAction": null
}
```

Issuevolgorde is deterministisch: severity, stage, documentId, path, code.

### 16.2 Validatiestages

| Stage | Controle |
| --- | --- |
| transport | bodylimiet, JSON parse, content-type |
| envelope | strict command/API-shape |
| concurrency | ETag/revision |
| registry | bekend kind en ondersteunde schemaversie |
| canonical JSON | I-JSON, forbidden numbers/types, grootte |
| schema | JSON Schema 2020-12 |
| semantic | cross-fieldregels binnen aggregate |
| asset | bestaat, type, metadata/clip |
| reference | target active, project, kind, cardinaliteit |
| domain | uniqueness/singletons/aggregategrenzen |
| compile | complete projectinput en runtimecontract |
| artifact | runtime schema, canonical hash, assetmanifest |

### 16.3 Foutisolatie

- Een documentfout wordt een issue, niet een processcrash.
- Een unexpected exception krijgt correlation ID, wordt server-side met stack gelogd en levert een generieke 500.
- SQLite constraintfouten worden naar stabiele errorcodes vertaald; ruwe SQL komt niet in UI.
- Compiler verzamelt onafhankelijke issues waar veilig, maar maakt nooit een partial build.
- Een runtimebuild wordt nooit geactiveerd bij enige parse/hash/schema/constructiefout.

### 16.4 Corruptie bij read

Wanneer een opgeslagen payload niet parseert, hash mismatcht of schema-invalid is:

- queryresponse markeert document als `corrupt` diagnostic state zonder payload blind te renderen;
- normale mutation op dat document is geblokkeerd;
- publish is geblokkeerd;
- de actieve published build blijft ongewijzigd;
- reparatie gebeurt alleen via restore uit backup of een expliciete, geteste migration/repairtool;
- de server verzint geen defaults om corrupte data door publish te krijgen.

### 16.5 Safety limits

Fase 1 hanteert server-side:

- maximaal 512 KiB requestbody voor een authoringcommand;
- maximaal 256 KiB canonical payload per normaal document;
- maximaal 256 references per Fase-1-document;
- maximaal 64 components per placed entity, hoewel Fase 1 er exact een gebruikt;
- strings worden per schema begrensd;
- geen recursion vanuit payload; schema's hebben een vaste maximale structurele diepte van 16;
- compile-artifactgrootte wordt gemeten en gelogd, niet stil afgekapt.

Latere grote terrain/geometrydata krijgt gespecialiseerde tile-/geometrydocuments en verhoogt niet simpelweg deze limieten.

---

## 17. Security en trust boundaries

- Alle mutationroutes gebruiken bestaande `requireEditor`-auth.
- Actor-ID komt uitsluitend uit de sessie.
- Requests van een andere Origin worden voor unsafe methods geweigerd; bestaande same-site sessiecookie-instellingen worden gecontroleerd.
- `If-Match` en requestId zijn geen authorisatie en vervangen auth niet.
- Display names, descriptions en prompts worden als tekst behandeld en bij DOM-render escaped; geen `innerHTML` met contentwaarden.
- Assetpaths komen uitsluitend uit `asset_library`, nooit uit payload.
- Kind, schema, reference targetkind en deletebeleid komen uit serverregistry.
- Importer leest graphdata maar voert geen strings uit.
- Published artifacts bevatten geen editor user IDs, operation payloads of absolute paden.
- Logs bevatten IDs/errorcodes en geen volledige descriptions/dialoguetekst tenzij een expliciete debugmodus lokaal is geactiveerd.

---

## 18. Performance- en schaalregels

### 18.1 Geen full-graph mutations

Een normale canonical command:

- leest alleen project, targetaggregate, relevante targets en backlinks;
- schrijft alleen gewijzigd document, zijn referenceprojecties, projectrevision en operation;
- serialiseert niet de volledige graph;
- triggert niet automatisch een volledige compile of viewportworld rebuild.

### 18.2 Indexgebruik

Verplichte querypatronen hebben bovengenoemde indexes:

- document by `(project_id, document_id)`;
- kindlists;
- targetbacklinks;
- assetusage;
- operation by requestId/revision;
- build by channel/revision;
- cutover by domain.

Integratietests gebruiken `EXPLAIN QUERY PLAN` voor backlinks, kindlist en idempotencylookup en blokkeren een full scan op groeiende tabellen.

### 18.3 Caching

- Registry/schema's zijn process-immutable na startup.
- Querycachekey bevat project workspace revision.
- Compilecachekey is `(projectId, sourceWorkspaceRevision, compilerVersion, runtimeSchemaVersion)`.
- Cache wordt pas na transaction commit geinvalideerd.
- Geen cache mag een DB-revision overschrijven.

### 18.4 Oude laptop

- Browser haalt lijsten paginated/incremental op; geen volledige payloads voor alle kinds bij iedere render.
- Viewport update bij transform gebruikt het bestaande object, geen volledige world rebuild per pointermove.
- Transform commit gebeurt eenmaal op pointerup; previewframes zijn lokaal.
- Editor en Play Preview houden niet twee volledige Three.js-worlds tegelijk actief.

---

## 19. Verplichte bestandsarchitectuur

Exacte namen mogen alleen veranderen wanneer een bestaand gelijkwaardig bestand aantoonbaar beter past; verantwoordelijkheden mogen niet worden samengevoegd in `editor.js` of `publish-service.js`.

```text
db/migrations/
  <next>_canonical_authoring_core.sql

src/shared/authoring/
  authoring-contract.js
  canonical-json.js
  error-codes.js
  domain-registry.js
  kinds/
    project-settings-v1.js
    item-definition-v1.js
    placed-entity-v1.js

src/server/authoring/
  authoring-repository.js
  authoring-command-service.js
  authoring-query-service.js
  authoring-validation-service.js
  authoring-reference-service.js
  authoring-build-service.js
  canonical-input-adapter.js
  legacy-graph-adapter.js
  legacy-import-service.js
  cutover-service.js

apps/web/public/editor/authoring/
  authoring-api.js
  authoring-store.js
  project-settings-panel.js
  item-editor.js
  placed-pickup-editor.js

tests/
  canonical-json.test.js
  authoring-repository.test.js
  authoring-command-service.test.js
  authoring-validation.test.js
  authoring-build-service.test.js
  legacy-import-service.test.js
  canonical-cutover-integration.test.js
```

### 19.1 Bestaande files die gericht wijzigen

- `src/server/db.js`: preflight en migration blijft transactioneel.
- `src/server/server.js`: nieuwe routes/services en legacy guards.
- `src/server/game-project-compiler.js`: accepteert canonical compile-input in plaats van graphspecifieke bron.
- `src/server/publish-service.js`: wordt facade/coordinator; graphresolution verhuist naar legacy adapter.
- `src/server/graph-repository.js`: legacy domain writeguards en read-only inspectie; geen canonical opslag.
- `apps/web/public/editor/index.html`: Legacy-label en canonical panels/routes.
- `apps/web/public/editor/editor.js`: integratiepunten; nieuwe kernlogica wordt niet hierin ingeplakt.
- bestaande Workbenchmodules: alleen drie Fase-1-routes naar authoring API omschakelen.
- `README/fases/NODES-LEGACY-WERKBANK-INSTELLINGEN-PLAN.md`: status superseded met link naar deze fase, inhoudsinventaris behouden.

### 19.2 Verboden structuur

- Geen `canonicalAuthoring`-blob in een enkele settingsrow.
- Geen tweede kopie van schemas in browser en server.
- Geen domain switch met honderden `if (kind===...)` in `editor.js`.
- Geen compiler die zowel graphedges als documentrefs in dezelfde domeinfunctie resolveert.
- Geen tijdelijke write naar graph “voor compatibility”.
- Geen nieuwe contenthardcode in runtimefallbacks.

Browserformulieren krijgen schema-/projectiondata via API of een daadwerkelijk gedeelde ESM-contractroute; handmatig gedupliceerde fieldlijsten mogen niet opnieuw ontstaan.

---

## 20. Implementatievolgorde en checkpoints

Iedere checkpoint eindigt met codechecks en een korte Kevin-test. Ga niet door bij een failed gate.

### Checkpoint 1A - Persistence kernel

Levert:

- migration/preflight;
- project/document/reference/operation repositories;
- canonical JSON/hash;
- kind registry met drie schemas;
- commandservice zonder UI;
- tests voor transaction, idempotency, concurrency, refs en tombstone.

Gate:

- repositorytests volledig groen;
- een failed command laat alle betrokken tabellen en revision exact gelijk;
- retry na gesimuleerde lost response maakt geen dubbel document.

### Checkpoint 1B - Compile/build kernel

Levert:

- canonical input adapter;
- ref naar runtimeKey-resolutie;
- buildservice/release channels;
- compatibility mirror;
- last-known-good behavior;
- pure compiletests.

Gate:

- gelijke input maakt gelijke contenthash;
- invalid input maakt geen build/pointerupdate;
- corrupte kandidaat vervangt actieve build niet.

### Checkpoint 1C - Legacy import en shadow parity

Levert:

- per-domein inventory/preview/shadow;
- legacy mappings;
- parity compiler/report;
- blocking ambiguityrapporten;
- cutover state machine.

Gate:

- imports zijn idempotent;
- graph revision race blokkeert finalize;
- semantische outputs voor bestaande project/items/eligible pickupplacements zijn gelijk.

### Checkpoint 1D - Canonical UI slice

Levert:

- Nodes-tab read-only;
- Instellingen projectnaam;
- Item create/edit/delete;
- viewportmodel -> Maak Pickup;
- direct canonical API;
- menselijke pickers/backlinks/errors;
- viewport transform command.

Gate:

- UI gebruikt geen node CRUD/restore voor deze routes;
- IDs/JSON/nodes zijn niet nodig;
- stale tab overschrijft geen nieuwer werk.

### Checkpoint 1E - Lifecycleacceptatie

Levert bewijs voor:

- draft/reload;
- Preview pickup;
- publish/game pickup;
- move/republish;
- delete/republish;
- Undo/Redo;
- restart;
- backup/restore;
- graphtabellen onveranderd door canonical actions.

Pas na Kevins expliciete akkoord worden de drie domeinen als Fase-1 accepted beschouwd.

---

## 21. Verplichte testmatrix

### 21.1 Canonical JSON

- RFC 8785 objectkey-order testvectors.
- Nested objects in arrays.
- Unicode behouden zonder ongewenste normalisatie.
- `-0`, NaN/Infinity en unsafe integers afwijzen.
- Zelfde semantic object, andere inputkeyvolgorde -> gelijke bytes/hash.

### 21.2 Repository/transactions

- Create success.
- Duplicate runtime key rollback.
- Required target missing rollback.
- Assettype mismatch rollback.
- Reference row failure rollback.
- Workspace guarded update failure rollback.
- Operation insert failure rollback.
- Foreign keys werkelijk actief.

### 21.3 Concurrency/idempotency

- Actuele If-Match success.
- Ontbrekende If-Match 428.
- Stale If-Match 412 zonder statechange.
- Zelfde requestId/hash retourneert zelfde result/revision.
- Zelfde requestId/andere hash 409.
- Twee gelijktijdige commands op revision N: exact een success, een 412.

### 21.4 Schema/semantic

- Unknown property rejected.
- Wrong enum/type/range rejected.
- Stackable false met stackLimit >1 rejected.
- Quest item trade/market mismatch rejected.
- Pickup amount 0 rejected.
- Transform NaN/out of range rejected.
- Duplicate componentId rejected.

### 21.5 References/delete

- Correct kind accepted.
- Wrong kind, tombstone, cross-project en missing rejected.
- Backlinks correct na replace.
- Tombstone blocked door required pickupref.
- ReplaceReferenceAndTombstone atomic.
- Assetdelete blocked door canonical en legacy usage.

### 21.6 Undo/Redo

- Create -> Undo tombstone/result; Redo nieuwe geldige state.
- Update -> Undo exact vorige canonical payload/hash.
- Delete -> Undo restore.
- Conflict na latere wijziging faalt zonder partial state.
- Undo/Redo revisions blijven monotonic.

### 21.7 Compile/publish

- Pure deterministic compile.
- Canonical ref naar runtimeKey.
- Een entity/model/transform/pickup in output.
- Assetmanifest compleet en zonder duplicaten.
- Buildmetadata correct.
- Failed compile behoudt pointer.
- Compatibility mirror hash gelijk.
- Publish history retention blijft toegepast.

### 21.8 Import/cutover

- Preview schrijft niets.
- Shadow rerun op zelfde graph geeft zelfde mappings/hash.
- Changed graph revision blokkeert finalize.
- Duplicate canonical IDs blokkeren.
- Ambigue assembly blokkeert.
- Los pickup_spawn wordt niet fout als placed pickup geimporteerd.
- Canonical mode blokkeert legacy write voor betrokken types.
- Compiler neemt per domein exact een bron.

### 21.9 Corruptie

- Invalid payload JSON via handmatige fixture wordt als corrupt gemeld.
- Payload hash mismatch blokkeert publish.
- Unknown schemaVersion blokkeert.
- Invalid buildhash activeert niet.
- Runtimeconstructiefout houdt vorige world actief.

### 21.10 Lifecycle/integratie

- Server restart behoudt documents/revisions/build pointers.
- Databasebackup en restore behouden IDs/hashes/references.
- Browser refresh behoudt menselijke waarden.
- Canonical mutation verandert counts/hashes van graphnodes/edges niet.
- Delete/republish verwijdert mesh, collision, hit target en runtimepickup.

---

## 22. Rollback, backup en disaster recovery

### 22.1 Voor migration

Voor schema- of final cutover:

1. consistente SQLite backup maken via SQLite backupmechanisme of gecontroleerde serviceprocedure;
2. WAL/checkpointstatus registreren;
3. backup integrity check uitvoeren;
4. huidige Git commit, DB migrationlijst, graph revision en published build-ID registreren;
5. restorepad op een geisoleerde kopie testen voor de eerste productiecutover.

Een losse kopie van alleen het `.sqlite`-bestand terwijl WAL writes actief zijn is geen geaccepteerde backupmethode.

### 22.2 Schema rollback

Migrations zijn forward-only. Bij migrationfailure wordt de transaction gerollbackt. Na succesvolle schema-migration wordt niet geprobeerd tabellen destructief terug te migreren; applicatierollback gebruikt een vooraf gemaakte databasebackup wanneer de oudere code de nieuwe database niet veilig kan openen.

### 22.3 Runtime rollback

Een operator kan de published release pointer atomisch terugzetten naar een bestaande geldige published build. Dit verandert geen authoringdocuments en geen playerstate.

### 22.4 Cutover rollback

Na `canonical` worden geen canonical writes naar graph gerepliceerd. Daarom is een simpele modeswitch terug naar `legacy` verboden. Herstel bestaat uit:

- applicatiefix die canonical data begrijpt; of
- volledige database/applicatierestore naar het pre-cutover herstelpunt;
- runtime kan ondertussen een last-known-good published build blijven gebruiken.

Dit voorkomt een schijnrollback die nieuw authored werk verliest.

---

## 23. Observability en audit

Verplichte structured logevents:

- `authoring.command.applied`;
- `authoring.command.rejected`;
- `authoring.concurrency.conflict`;
- `authoring.import.started/completed/failed`;
- `authoring.cutover.finalized`;
- `authoring.compile.succeeded/failed`;
- `authoring.release.activated/rollback`;
- `runtime.build.rejected`.

Ieder event bevat waar relevant:

- correlation/request/operation/build ID;
- project ID;
- actor ID in serverlog;
- domain/kind/document ID;
- base/result revision;
- duration;
- errorcode;
- nooit wachtwoorden, sessietokens of volledige contentpayloads.

Healthdiagnostics tonen:

- DB bereikbaar en foreign keys actief;
- workspace revision;
- cutovermode per domein;
- draft/published build-ID en source revision;
- laatste compilefailurecode;
- graph revision zolang legacy bestaat;
- geen volledige artifact JSON.

---

## 24. Kevin-acceptatietest

Kevin gebruikt geen Nodes, raw IDs, JSON, SQL of scripts.

### A. Project en Item

1. Open Instellingen en verander de gameprojectnaam.
2. Klik Save Draft en herlaad de hele editor.
3. Controleer dat de naam gelijk terugkomt.
4. Maak in de Werkbank een Item met naam, category, rarity, stackinstelling en optioneel icon/worldmodel.
5. Bewerk het Item en herlaad opnieuw.
6. Open Waar gebruikt; er zijn nog geen usages.

### B. Pickup plaatsen

7. Sleep een bestaand GLB-model naar de viewport.
8. Kies `Maak Pickup`.
9. Kies het zojuist gemaakte Item, aantal 1 en bevestig.
10. Controleer dat er exact een zichtbaar model staat.
11. Verplaats het met G en bevestig.
12. Klik Save Draft en herlaad.
13. Controleer model, positie, Itemrelatie en pickupinstellingen.
14. Controleer bij het Item dat de plaatsing onder Waar gebruikt staat.

### C. Preview en publish

15. Schakel in dezelfde applicatie naar Draft Play Preview.
16. Loop naar het object en pak het op.
17. Controleer dat het juiste Item en aantal in de previewsandbox verschijnen.
18. Ga terug naar Editor; authoringpositie en echte playerinventory zijn niet veranderd.
19. Klik Save To Game.
20. Open de published game en pak het object op.
21. Controleer dat de server het juiste Item toekent en dubbele interactie niet mogelijk is.

### D. Lifecycle

22. Verplaats het object opnieuw, Save Draft en publiceer.
23. Controleer de nieuwe positie in de game.
24. Probeer het gebruikte Item te verwijderen; verwijderen wordt met de menselijke backlink geblokkeerd.
25. Verwijder eerst het pickupobject en publiceer opnieuw.
26. Controleer dat model, collision, hit target en runtimepickup weg zijn.
27. Verwijder daarna het ongebruikte Item.
28. Doe Undo en Redo op een ondersteunde laatste authoringactie en controleer het zichtbare resultaat.
29. Herstart/herlaad editor en game volledig.
30. Controleer dat geen verwijderd object terugkomt en geen geldig document verdwijnt.

### E. Legacybewijs

31. Open `Legacy - alleen lezen`.
32. Controleer dat geen create/connect/delete/edit/move mogelijk is.
33. Controleer dat de nieuwe projectwijziging, Item en Pickup geen nieuwe node of edge hebben gemaakt.
34. Controleer diagnostics: de drie Fase-1-domeinen staan `canonical`; overige domeinen staan eerlijk `legacy`.

---

## 25. Definition of Done

Fase 1 is alleen compleet wanneer alle onderstaande punten waar zijn:

- [ ] Alle invarianten I-01 t/m I-20 hebben geautomatiseerd of zichtbaar bewijs.
- [ ] Exacte migration is op een kopie van de live database toegepast en geverifieerd.
- [ ] Project Settings, Item en Placed Pickup schrijven alleen canonical tables.
- [ ] Graph node/edge counts en relevante hashes blijven gelijk tijdens canonical acceptatieacties.
- [ ] De drie domains zijn via preview -> shadow -> parity -> canonical gegaan.
- [ ] Geen dual-writecode bestaat.
- [ ] Legacy Nodes is read-only.
- [ ] Save Draft en Publish gebruiken een deterministische source snapshot.
- [ ] Failed compile/publish behoudt last-known-good.
- [ ] Runtime gebruikt exact een entity/model/transform/pickupowner.
- [ ] References/backlinks/delete werken transactioneel.
- [ ] Idempotency en stale-write tests slagen.
- [ ] Undo/Redo gebruikt domain operations, niet graphrestore.
- [ ] Corruptie-injectietests crashen server/runtime niet en activeren geen corrupte build.
- [ ] Backup/restorebewijs is geleverd.
- [ ] Kevin heeft sectie 24 volledig doorlopen en expliciet geaccepteerd.
- [ ] Het fasedocument is bijgewerkt met commit, checks, afwijkingen en Kevins acceptatiedatum.

Niet toegestaan als open eind bij acceptatie:

- “werkt alleen via nodes”;
- “wordt later verbonden”;
- “schema bestaat maar runtime leest het niet”;
- “tijdelijk dual-write”;
- “alleen getest met seeded/demo-content”;
- “handmatig databaseherstel nodig na normale editoractie”;
- “published game wijkt af van editor zonder blocking diagnostic”.

---

## 26. Bronnen en technische onderbouwing

Repositorybronnen:

- `db/migrations/001_initial_schema.sql`
- `db/migrations/004_node_system_foundation.sql`
- `src/server/db.js`
- `src/server/graph-repository.js`
- `src/server/publish-service.js`
- `src/server/game-project-compiler.js`
- `src/server/catalog-compiler.js`
- `src/shared/node-types.js`
- `README/fases/VISUAL-CONTENT-WORKBENCH-W3.md`
- `README/fases/NODES-LEGACY-WERKBANK-INSTELLINGEN-PLAN.md`

Normatieve/externe bronnen:

- SQLite transactions: <https://www.sqlite.org/lang_transaction.html>
- SQLite foreign keys: <https://www.sqlite.org/foreignkeys.html>
- SQLite WAL: <https://www.sqlite.org/wal.html>
- JSON Schema Draft 2020-12: <https://json-schema.org/draft/2020-12>
- Ajv Draft 2020-12 en strict mode: <https://ajv.js.org/json-schema.html> en <https://ajv.js.org/strict-mode.html>
- RFC 8785 JSON Canonicalization Scheme: <https://www.rfc-editor.org/rfc/rfc8785.html>
- RFC 6901 JSON Pointer: <https://www.rfc-editor.org/rfc/rfc6901.html>
- RFC 9110 `ETag` / `If-Match`: <https://www.rfc-editor.org/rfc/rfc9110.html>

Deze bronnen bepalen opslag-, hashing-, path- en concurrencysemantiek. Zij voegen geen externe game-engine of tweede runtime toe.

---

## 27. Eindstatement

Na acceptatie van Fase 1 staat de basisregel vast:

> Werkbank en Instellingen schrijven getypeerde, versioned domeincommands naar een canonieke SQLite-authoringkern. De compiler maakt daar deterministische runtimebuilds van. De game voert alleen een atomisch geactiveerde, gevalideerde published build uit. Nodes zijn uitsluitend tijdelijke read-only legacy-invoer voor gecontroleerde migratie en worden nooit meer uitgebreid.

Iedere latere MMORPG-fase moet via deze keten lopen. Een feature die alleen een formulier, schema, node, catalogentry of runtimehardcode toevoegt zonder de complete authoring -> validate -> publish -> runtime -> lifecycleketen, is niet geimplementeerd.

