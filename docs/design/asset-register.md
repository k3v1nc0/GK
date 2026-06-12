# Asset Register

## Status

Dit register is de poort voor GLB-, UI- en assetgebruik. Codex heeft de serverassets gecontroleerd en Fase 7 heeft de asset library server-side gevalideerd.

Fase 8-status: server-side afgerond en klaar. `Taverne.glb` is Kevin-testkeuze voor object-candidate validation en `Wizard.glb` is Kevin-testkeuze voor NPC-candidate validation. Dit zijn geen definitieve runtime-role mappings.

Fase 8.1-status: Git-basis voorbereid. Procedural generated assets mogen uitsluitend via Fase 7 `asset.reference` verwijzen naar geregistreerde assets; Fase 8.1 mag geen assets naar Git kopieren en geen definitieve assetrollen toewijzen. Server-side verificatie van Fase 8.1 staat nog open.

## Asset source policy

Assets mogen alleen worden gebruikt wanneer hun bron is bevestigd:

- repo-assets: bestanden die in de repository staan;
- server-assets: bestanden onder `/var/www/gk/assets`;
- later bewust gemaakte assets: assets die Kevin later toevoegt, kiest of goedkeurt.

Niet toegestaan:

- dummy assets;
- nepmodellen;
- tijdelijke vervangers;
- definitieve runtime-roltoewijzing zonder node/editor-data;
- runtime-hardcoding van concrete assetkeuzes;
- procedural generators die assets verzinnen of naar Git kopieren.

## Assetpaden

| Pad | Status | Eigenaar controle | Opmerking |
|---|---|---|---|
| `assets/` in repo | Bevestigd | GK Code Copiloot via GitHub | Vier `.glb`-bestanden aanwezig. |
| `/var/www/gk/assets` | Bevestigd | Codex buiten Git | Exact dezelfde vier GLB-bestanden aanwezig. |
| `GK_ASSET_SOURCE_DIR` | Bevestigd | Codex buiten Git | `GK_ASSET_SOURCE_DIR="/var/www/gk/assets"` |

## Server assettelling

Codex/Claude heeft bevestigd:

| Type | Aantal | Status |
|---|---:|---|
| GLB | 4 | Aanwezig; Fase 7 roleMapping.status=`candidate` |
| UI image | 0 | Niet aanwezig; geldige lege library |
| Audio | 0 | Niet aanwezig; geldige lege library |

Aanvullend:

- Geen submappen onder `/var/www/gk/assets`.
- Geen dubbele bestandsnamen.
- `Blacksmit forge.glb` bevat een spatie en werkt in Fase 7 scanner/library.
- Asset scan publiceert niets naar runtime.
- Asset scan kopieert geen assets naar Git.
- GLB role mapping blijft editor-data.

## GLB assets

Deze bestanden bestaan in repo en server. Hun gameplayrol is nog niet definitief.

| Assetpad | Serverbestand | Status | Toegestaan gebruik | Gekoppelde nodes | Open gate |
|---|---|---|---|---|---|
| `assets/Blacksmit forge.glb` | `/var/www/gk/assets/Blacksmit forge.glb` | Candidate GLB | Kandidaat GLB asset; geen definitieve rol | `asset.reference`, later `entity.spawnFromAsset`, procedural placement candidate | Role/capability-keuze via editor |
| `assets/Blacksmit.glb` | `/var/www/gk/assets/Blacksmit.glb` | Candidate GLB | Kandidaat GLB asset; geen definitieve rol | `asset.reference`, later `entity.spawnFromAsset`, procedural placement candidate | Role/capability-keuze via editor |
| `assets/Taverne.glb` | `/var/www/gk/assets/Taverne.glb` | Candidate GLB; Fase 8 object-test | Kevin-testkeuze voor object-candidate validation; geen definitieve rol | `asset.reference`, `gk.entity.spawnFromAsset`, `gk.component.renderable`, procedural placement candidate | Definitieve role mapping via editor |
| `assets/Wizard.glb` | `/var/www/gk/assets/Wizard.glb` | Candidate GLB; Fase 8 NPC-test | Kevin-testkeuze voor NPC-candidate validation; geen definitieve rol | `asset.reference`, `gk.npc.makeFromAsset`, `gk.component.npcBrain`, procedural placement candidate | Definitieve role mapping en animation mapping via editor |

Let op: bestandsnamen zijn feiten, geen definitieve gamecontentbeslissing. Een assetnaam bepaalt nog niet of iets player, NPC, merchant, enemy, boss, prop, environment of quest object is.

## Fase 8 entity/component gate

Fase 8 mag een GLB alleen als candidate entity/component data gebruiken.

Regels:

- `Taverne.glb` mag als object-test in tests/docs worden gebruikt.
- `Wizard.glb` mag als NPC-test in tests/docs worden gebruikt.
- Geen van beide mag als definitieve runtime object/NPC role in broncode of migratie worden vastgelegd.
- `renderable` gebruikt `asset.reference`.
- `npc_brain`, `combatant`, `boss` en `player_appearance` blijven candidate zonder animation mapping.
- Ontbrekende animation mapping is warning voor candidate.
- Runtime-active NPC/combat/player behavior blokkeert zonder expliciete animation mapping via editor-data.

Fase 8 server-side bevestigd:

- migratie `0004_entity_component_core.sql`: OK;
- entity routes: OK;
- anonymous/game denied: OK;
- `Taverne.glb` object-test: OK;
- `Wizard.glb` NPC-test: OK;
- animation warning/blocker: OK;
- runtime publish nee bevestigd;
- assets niet naar Git;
- blockers: geen.

## Fase 8.1 procedural asset gate

Fase 8.1 procedural placement candidates bestaan als Git-contract, maar zijn nog niet server-side gevalideerd.

Regels:

- generated assets gebruiken Fase 7 `asset.reference`;
- generated entities gebruiken Fase 8 entity/component contracts;
- generated placements blijven candidates totdat editor-data of publish-flow ze later expliciet accepteert;
- generated audio gebruikt `audio.reference` en blijft gated bij audio count 0;
- procedural preview publiceert niets naar Runtime Game;
- procedural bake maakt alleen editor draft data of bake draft result;
- geen procedural generator mag assets uploaden, kopieren naar Git, verwijderen of verzinnen;
- GLB role mapping blijft editor-data/Kevin-keuze.

Git-basis toegevoegd:

- `ProceduralAssetRecordGate` en generated candidate contracts;
- validator voor missing asset references;
- tests voor `asset.reference`, audio count 0 gate, no asset copy en no runtime publish.

Server-side nog open:

- procedural generated asset references via Fase 7 asset library testen;
- bevestigen dat preview/bake geen assets naar Git kopieert;
- bevestigen dat generated placement candidates geen runtime publish uitvoeren.

## Filename gate

`Blacksmit forge.glb` bevat een spatie. Fase 7 heeft bevestigd dat scanner, asset IDs, database records en node pickers dit correct ondersteunen. Latere runtime serving/URL-fases moeten deze gate opnieuw controleren wanneer assets publiek geserveerd worden.

## UI assets

Status: 0 UI images aanwezig.

UI-assets moeten later via asset library en nodes gekozen of toegevoegd worden. Dit blokkeert Fase 8.1 niet, maar blokkeert latere flows die concrete UI assets vereisen.

## Audio assets

Status: 0 audio assets aanwezig.

Audio-assets worden inhoudelijk beheerd in `docs/design/audio-register.md`. Audio mag later worden toegevoegd of gekozen via asset library en audio nodes.

Fase 8 `audio_emitter` blijft gated/leeg bij audio=0 en mag geen dummy audio tonen. Fase 8.1 generated audio references blijven eveneens gated/leeg bij audio=0.

## Assetstatussen

Gebruik deze statussen in latere fases:

| Status | Betekenis |
|---|---|
| `server-present` | Bestand staat onder `/var/www/gk/assets` en Codex heeft het geteld. |
| `repo-present` | Bestand staat ook in de repo-assets. |
| `needs-kevin-choice` | Asset bestaat, maar Kevin/editor moet rol of gebruik kiezen. |
| `candidate` | Asset of component is kandidaat, zonder definitieve runtime-role. |
| `assigned` | Editor-data heeft expliciet een role/component mapping gekozen. |
| `missing` | Asset is niet aanwezig. |
| `blocked` | Asset is verplicht voor de fase en ontbreekt. |
| `warning-only` | Asset is optioneel of mist niet-blokkerende metadata. |

## Gekoppelde nodefamilies

Latere fases moeten deze assetkoppelingen via nodes beheren:

- Fase 7: asset scan, asset library, role/capability mapping.
- Fase 8: entity/component gebruik van GLB assets als candidates.
- Fase 8.1: procedural generated placement candidates via `asset.reference`.
- Fase 9: world/zone/spawn assetkoppelingen op Fase 8.1 draft/candidate output.
- Fase 13: NPC GLB, taakgeluiden en NPC audio.
- Fase 15: UI assets voor inventory, merchant, currency, scrolls.
- Fase 16: enemy, boss, loot, combat icon/audio/VFX assets.
- Fase 17: volledige beginquest-content via gepubliceerde node-data.

## Codex-taken buiten Git

Afgerond voor Fase 1/Fase 7/Fase 8:

1. `/var/www/gk/assets` gecontroleerd.
2. GLB-, UI- en audiobestanden geteld.
3. `GK_ASSET_SOURCE_DIR="/var/www/gk/assets"` bevestigd.
4. Repo-assets en server-assets vergeleken.
5. Fase 7 asset library scan server-side gevalideerd.
6. Fase 8 entity/component migratie toegepast.
7. Asset/entity validation check met `Taverne.glb` en `Wizard.glb` uitgevoerd.
8. Candidate role mapping blijft niet runtime-active zonder editor-data.
9. Missing animation mapping is warning voor candidate en blocker voor runtime-active behavior.

Open voor Fase 8.1:

1. `pnpm install/build/typecheck/test/lint`.
2. Migratie `0005_procedural_generation_core.sql` toepassen.
3. Procedural generated asset references via Fase 7 asset library testen.
4. Bevestigen dat preview/bake geen assets naar Git kopieert.
5. Bevestigen dat generated placement candidates geen runtime publish uitvoeren.

Latere fases kunnen nieuwe serverchecks nodig hebben wanneer assets worden toegevoegd of wanneer asset-worker, watcher, rechten, metadata-extractie of runtime serving worden gebouwd.
