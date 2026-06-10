# Asset Register

## Status

Dit register is de Fase 1-poort voor GLB-, UI- en assetgebruik. Het registreert alleen geverifieerde bronnen en open input. Het wijst nog geen definitieve gameplayrollen toe.

Fase-status: documentbasis opgezet, asset-input gates open.

## Asset source policy

Assets mogen alleen worden gebruikt wanneer hun bron is bevestigd:

- repo-assets: bestanden die in de repository staan en door de repo-controle zijn gezien;
- server-assets: bestanden onder `/var/www/gk/assets` nadat Codex ze buiten Git heeft gecontroleerd;
- later bewust gemaakte assets: assets die Kevin later toevoegt, kiest of goedkeurt.

Niet toegestaan:

- dummy assets;
- nepmodellen;
- tijdelijke vervangers;
- definitieve assetnamen die niet uit repo- of servercontrole komen;
- runtime-hardcoding van concrete assetkeuzes.

## Assetpaden

| Pad | Status | Eigenaar controle | Opmerking |
|---|---|---|---|
| `assets/` in repo | Beperkt gecontroleerd | GK Code Copiloot via GitHub | Vier `.glb`-bestanden zichtbaar in repo-assets. |
| `/var/www/gk/assets` | Te controleren | Codex buiten Git | Serverpad mag niet als geinventariseerd worden geclaimd totdat Codex telt. |
| `GK_ASSET_SOURCE_DIR` | Te zetten | Codex buiten Git | Moet naar de gekozen assetbron wijzen. |

## Repo assettelling

Deze telling is alleen gebaseerd op zichtbare repo-assets, niet op `/var/www/gk/assets`.

| Type | Repo-telling | Server-telling | Status |
|---|---:|---:|---|
| GLB | 4 | Onbekend | Repo bevestigd, server open |
| UI image | 0 zichtbaar | Onbekend | Kevin/Codex-input vereist |
| Audio | 0 zichtbaar | Onbekend | Kevin/Codex-input vereist |

## GLB assets

Deze bestanden bestaan in de repo. Hun rol is nog niet definitief.

| Assetpad | Status | Herkomst | Toegestaan gebruik | Gekoppelde nodes | Ontbrekende input |
|---|---|---|---|---|---|
| `assets/Blacksmit forge.glb` | Repo aanwezig | Repo asset | Kandidaat GLB asset na asset scan; geen definitieve rol | Fase 7: `asset.reference`, `asset.requireCapability`, later `entity.spawnFromAsset` | Serverbevestiging, metadata, role/capability-keuze |
| `assets/Blacksmit.glb` | Repo aanwezig | Repo asset | Kandidaat GLB asset na asset scan; geen definitieve rol | Fase 7: `asset.reference`, `asset.requireCapability`, later `entity.spawnFromAsset` | Serverbevestiging, metadata, role/capability-keuze |
| `assets/Taverne.glb` | Repo aanwezig | Repo asset | Kandidaat GLB asset na asset scan; geen definitieve rol | Fase 7: `asset.reference`, `asset.requireCapability`, later `entity.spawnFromAsset` | Serverbevestiging, metadata, role/capability-keuze |
| `assets/Wizard.glb` | Repo aanwezig | Repo asset | Kandidaat GLB asset na asset scan; geen definitieve rol | Fase 7: `asset.reference`, `asset.requireCapability`, later `entity.spawnFromAsset` | Serverbevestiging, metadata, role/capability-keuze |

Let op: bestandsnamen zijn repo-feiten, geen definitieve gamecontent. Een assetnaam bepaalt nog niet of iets player, NPC, merchant, enemy, boss, prop of environment is.

## UI assets

Status: geen UI-assets zichtbaar in de repo-assets tijdens Fase 1-controle.

UI-assets moeten later via asset library en nodes gekozen worden. Vereiste velden voor registratie:

| Veld | Betekenis |
|---|---|
| Assetpad | Repo- of serverpad na controle |
| Status | `available`, `missing`, `needs-kevin-choice`, `blocked` |
| Herkomst | Repo, server, Kevin-made, later import |
| Toegestaan gebruik | HUD, inventory, dialogue, scroll, minimap, merchant, quest, boss UI |
| Gekoppelde nodes | Bijvoorbeeld `ui.imageAsset`, `ui.iconAsset`, `hud.panel`, `hud.minimap` |
| Ontbrekende input | Welke keuze of asset nog nodig is |

## Audio assets

Audio-assets worden beheerd in `docs/design/audio-register.md`. Dit asset-register verwijst daarnaar voor muziek, ambience, SFX, UI-audio en voice/dialogue.

Status: geen audio-assets zichtbaar in de repo-assets tijdens Fase 1-controle.

## Assetstatussen

Gebruik deze statussen in latere fases:

| Status | Betekenis |
|---|---|
| `repo-present` | Bestand staat in de repo en is gezien. |
| `server-present` | Bestand staat onder `/var/www/gk/assets` en Codex heeft het geteld. |
| `needs-kevin-choice` | Asset bestaat mogelijk, maar Kevin moet rol of gebruik kiezen. |
| `needs-codex-scan` | Server- of metadata-scan is nog niet uitgevoerd. |
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

Codex moet buiten Git uitvoeren:

1. Controleer `/var/www/gk/assets`.
2. Tel GLB-, UI- en audiobestanden.
3. Rapporteer ontbrekende of dubbele assets.
4. Stel `GK_ASSET_SOURCE_DIR` in.
5. Controleer leesrechten voor runtime/editor asset-worker.
6. Bevestig of repo-assets ook op de server aanwezig zijn of bewust apart blijven.

Tot deze taken klaar zijn, is server-assetstatus onbekend.
