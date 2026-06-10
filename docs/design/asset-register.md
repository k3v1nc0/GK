# Asset Register

## Status

Dit register is de Fase 1-poort voor GLB-, UI- en assetgebruik. Codex heeft de serverassets gecontroleerd.

Fase 1-status: assetbron bevestigd, assets feitelijk geregistreerd, role/content gates open voor latere fases.

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
- runtime-hardcoding van concrete assetkeuzes.

## Assetpaden

| Pad | Status | Eigenaar controle | Opmerking |
|---|---|---|---|
| `assets/` in repo | Bevestigd | GK Code Copiloot via GitHub | Vier `.glb`-bestanden aanwezig. |
| `/var/www/gk/assets` | Bevestigd | Codex buiten Git | Exact dezelfde vier GLB-bestanden aanwezig. |
| `GK_ASSET_SOURCE_DIR` | Bevestigd | Codex buiten Git | `GK_ASSET_SOURCE_DIR="/var/www/gk/assets"` |

## Server assettelling

Codex heeft bevestigd:

| Type | Aantal | Status |
|---|---:|---|
| GLB | 4 | Aanwezig |
| UI image | 0 | Niet aanwezig; latere asset gate |
| Audio | 0 | Niet aanwezig; latere audio gate |

Aanvullend:

- Geen submappen onder `/var/www/gk/assets`.
- Geen dubbele bestandsnamen.
- Repo-assets zijn exact aanwezig op server.
- Git bleef schoon bij de Codex-servercontrole.
- `Blacksmit forge.glb` bevat een spatie in de bestandsnaam.

## GLB assets

Deze bestanden bestaan in repo en server. Hun gameplayrol is nog niet definitief.

| Assetpad | Serverbestand | Status | Toegestaan gebruik | Gekoppelde nodes | Open gate |
|---|---|---|---|---|---|
| `assets/Blacksmit forge.glb` | `/var/www/gk/assets/Blacksmit forge.glb` | Bevestigd | Kandidaat GLB asset; geen definitieve rol | Fase 7: `asset.reference`, `asset.requireCapability`, later `entity.spawnFromAsset` | Role/capability-keuze via editor |
| `assets/Blacksmit.glb` | `/var/www/gk/assets/Blacksmit.glb` | Bevestigd | Kandidaat GLB asset; geen definitieve rol | Fase 7: `asset.reference`, `asset.requireCapability`, later `entity.spawnFromAsset` | Role/capability-keuze via editor |
| `assets/Taverne.glb` | `/var/www/gk/assets/Taverne.glb` | Bevestigd | Kandidaat GLB asset; geen definitieve rol | Fase 7: `asset.reference`, `asset.requireCapability`, later `entity.spawnFromAsset` | Role/capability-keuze via editor |
| `assets/Wizard.glb` | `/var/www/gk/assets/Wizard.glb` | Bevestigd | Kandidaat GLB asset; geen definitieve rol | Fase 7: `asset.reference`, `asset.requireCapability`, later `entity.spawnFromAsset` | Role/capability-keuze via editor |

Let op: bestandsnamen zijn feiten, geen definitieve gamecontentbeslissing. Een assetnaam bepaalt nog niet of iets player, NPC, merchant, enemy, boss, prop, environment of quest object is.

## Filename gate

`Blacksmit forge.glb` bevat een spatie. Fase 7 moet controleren dat scanner, asset IDs, URLs, database records en node pickers dit correct ondersteunen. Als de pipeline geen spaties veilig ondersteunt, moet Fase 7 een structurele normalisatie- of validatieregel ontwerpen voordat assets worden gepubliceerd.

## UI assets

Status: 0 UI images aanwezig.

UI-assets moeten later via asset library en nodes gekozen of toegevoegd worden. Dit blokkeert Fase 1 niet, maar blokkeert latere flows die concrete UI assets vereisen.

Vereiste registratievelden:

| Veld | Betekenis |
|---|---|
| Assetpad | Serverpad na scan |
| Status | `available`, `missing`, `needs-kevin-choice`, `blocked` |
| Herkomst | Server, Kevin-made, later import |
| Toegestaan gebruik | HUD, inventory, dialogue, scroll, minimap, merchant, quest, boss UI |
| Gekoppelde nodes | Bijvoorbeeld `ui.imageAsset`, `ui.iconAsset`, `hud.panel`, `hud.minimap` |
| Ontbrekende input | Welke keuze of asset nog nodig is |

## Audio assets

Status: 0 audio assets aanwezig.

Audio-assets worden inhoudelijk beheerd in `docs/design/audio-register.md`. Audio mag later worden toegevoegd of gekozen via asset library en audio nodes.

## Assetstatussen

Gebruik deze statussen in latere fases:

| Status | Betekenis |
|---|---|
| `server-present` | Bestand staat onder `/var/www/gk/assets` en Codex heeft het geteld. |
| `repo-present` | Bestand staat ook in de repo-assets. |
| `needs-kevin-choice` | Asset bestaat, maar Kevin/editor moet rol of gebruik kiezen. |
| `missing` | Asset is niet aanwezig. |
| `blocked` | Asset is verplicht voor de fase en ontbreekt. |
| `warning-only` | Asset is optioneel of mist niet-blokkerende metadata. |

## Gekoppelde nodefamilies

Latere fases moeten deze assetkoppelingen via nodes beheren:

- Fase 7: asset scan, asset library, role/capability mapping.
- Fase 8: entity/component gebruik van GLB assets.
- Fase 9: world/zone/spawn assetkoppelingen.
- Fase 13: NPC GLB, taakgeluiden en NPC audio.
- Fase 15: UI assets voor inventory, merchant, currency, scrolls.
- Fase 16: enemy, boss, loot, combat icon/audio/VFX assets.
- Fase 17: volledige beginquest-content via gepubliceerde node-data.

## Codex-taken buiten Git

Afgerond voor Fase 1:

1. `/var/www/gk/assets` gecontroleerd.
2. GLB-, UI- en audiobestanden geteld.
3. `GK_ASSET_SOURCE_DIR="/var/www/gk/assets"` bevestigd.
4. Repo-assets en server-assets vergeleken.

Latere fases kunnen nieuwe serverchecks nodig hebben wanneer assets worden toegevoegd of wanneer asset-worker, watcher, rechten, metadata-extractie of runtime serving worden gebouwd.
