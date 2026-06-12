# Asset Register

## Status

Dit register is de poort voor GLB-, UI- en assetgebruik. Fase 7 heeft de asset library server-side gevalideerd. Na commit `44defc0f79f032cabc07eba43573a40c5f629b97` (`Assets - new`) is de asset refresh server-side uitgevoerd en is de asset scan OK.

Actuele scanstatus:

| Type | Aantal | Status |
|---|---:|---|
| GLB | 4 | Aanwezig; role mapping blijft `candidate` |
| UI image | 37 | Aanwezig als asset-library candidates |
| Audio | 21 | Aanwezig als asset-library candidates; inhoudelijk beheerd in `docs/design/audio-register.md` |
| Invalid | 0 | Geen invalid assets |
| Missing | 0 | Geen missing assets |

Fase 8-status: server-side afgerond en klaar. `Taverne.glb` is Kevin-testkeuze voor object-candidate validation en `Wizard.glb` is Kevin-testkeuze voor NPC-candidate validation. Dit zijn geen definitieve runtime-role mappings.

Fase 8.1-status: server-side afgerond en klaar. Procedural generated assets mogen uitsluitend via Fase 7 `asset.reference` verwijzen naar geregistreerde assets; Fase 8.1 mag geen assets naar Git kopieren en geen definitieve assetrollen toewijzen.

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
| `assets/` in repo | Bevestigd | GK Code Copiloot via GitHub | Asset package bevat 4 GLB, 37 UI images en 21 audio files. |
| `/var/www/gk/assets` | Bevestigd | Codex buiten Git | Server assetbron voor de scanner. |
| `GK_ASSET_SOURCE_DIR` | Bevestigd | Codex buiten Git | `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` |

## Server assettelling

Na `Assets - new` is bevestigd:

| Type | Aantal | Status |
|---|---:|---|
| GLB | 4 | Aanwezig; bestaande GLB's blijven actief als candidates |
| UI image | 37 | Aanwezig; HUD, icons en minimap markers zijn UI/image assets |
| Audio | 21 | Aanwezig; ambience, music, SFX en UI audio zijn audio assets |
| Invalid | 0 | OK |
| Missing | 0 | OK |

Aanvullend:

- Asset scan publiceert niets naar runtime.
- Asset scan kopieert geen serverassets naar Git: `assetsCopiedToGit=false`.
- Asset scan kent geen definitieve runtime-rollen toe: `assignsDefinitiveRuntimeRoles=false`.
- Asset scan publiceert geen runtime output: `publishesRuntimeOutput=false`.
- GLB role mapping blijft editor-data/Kevin-keuze.
- UI/audio assets zijn beschikbaar als asset-library candidates, niet als hardcoded HUD/audio runtimecontent.

## GLB assets

Deze GLB's bestaan als geregistreerde assets. Hun gameplayrol is nog niet definitief.

| Assetpad | Status | Toegestaan gebruik | Gekoppelde nodes | Open gate |
|---|---|---|---|---|
| `assets/glb/buildings/Blacksmit forge.glb` | Candidate GLB | Kandidaat GLB asset; geen definitieve rol | `asset.reference`, later `entity.spawnFromAsset`, procedural placement candidate | Role/capability-keuze via editor |
| `assets/glb/characters/Blacksmit.glb` | Candidate GLB | Kandidaat GLB asset; geen definitieve rol | `asset.reference`, later `entity.spawnFromAsset`, procedural placement candidate | Role/capability-keuze via editor |
| `assets/glb/buildings/Taverne.glb` | Candidate GLB; Fase 8 object-test | Kevin-testkeuze voor object-candidate validation; geen definitieve rol | `asset.reference`, `gk.entity.spawnFromAsset`, `gk.component.renderable`, procedural placement candidate | Definitieve role mapping via editor |
| `assets/glb/characters/Wizard.glb` | Candidate GLB; Fase 8 NPC-test | Kevin-testkeuze voor NPC-candidate validation; geen definitieve rol | `asset.reference`, `gk.npc.makeFromAsset`, `gk.component.npcBrain`, procedural placement candidate | Definitieve role mapping en animation mapping via editor |

Let op: bestandsnamen zijn feiten, geen definitieve gamecontentbeslissing. Een assetnaam bepaalt nog niet of iets player, NPC, merchant, enemy, boss, prop, environment of quest object is.

## UI image assets

Status: 37 UI images aanwezig als asset-library candidates.

| Groep | Aantal | Voorbeelden | Gate |
|---|---:|---|---|
| HUD frames/fills | 11 | health, mana, stamina, XP, hotbar, minimap frame, quest tracker | Alleen via HUD/UI nodes kiezen |
| Action icons | 6 | attack, cast, defend, interact, pickup, talk | Alleen via UI/action nodes kiezen |
| Item icons | 8 | coin, herb, key, ore, potions, scroll, wood | Alleen via item/UI nodes kiezen |
| Status icons | 6 | buff, burn, debuff, freeze, poison, stun | Alleen via status/combat/UI nodes kiezen |
| Minimap markers | 6 | player, party, NPC, portal, quest, resource | Alleen via minimap nodes kiezen |

HUD-bestanden, icon-bestanden en minimap marker-bestanden worden door de asset scan als UI/image assets gezien. Ze zijn beschikbaar als library candidates, maar zijn geen definitieve HUD-layout, minimapconfiguratie, itemdata, combatdata of runtime UI.

## Audio assets

Status: 21 audio files aanwezig als asset-library candidates.

Audio-assets worden inhoudelijk beheerd in `docs/design/audio-register.md`. Audio mag alleen via asset library en audio nodes worden gekozen of ingesteld.

Fase 8 `audio_emitter` blijft data-driven. Fase 8.1 generated audio references gebruiken `audio.reference` en mogen alleen naar bestaande geregistreerde audio assets verwijzen. Concrete music, ambience, SFX of UI-audio inzet blijft gated door editor/node-data, GameBible, registers of expliciete Kevin-input.

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

Fase 8.1 procedural placement candidates bestaan als Git-contract en zijn server-side gevalideerd.

Regels:

- generated assets gebruiken Fase 7 `asset.reference`;
- generated entities gebruiken Fase 8 entity/component contracts;
- generated placements blijven candidates totdat editor-data of publish-flow ze later expliciet accepteert;
- generated audio gebruikt `audio.reference` en blijft candidate/editor-data;
- procedural preview publiceert niets naar Runtime Game;
- procedural bake maakt alleen editor draft data of bake draft result;
- geen procedural generator mag assets uploaden, kopieren naar Git, verwijderen of verzinnen;
- GLB role mapping blijft editor-data/Kevin-keuze.

Git-basis toegevoegd:

- `ProceduralAssetRecordGate` en generated candidate contracts;
- validator voor missing asset references;
- tests voor `asset.reference`, audio reference gates, no asset copy en no runtime publish.

Server-side bevestigd:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK;
- `pnpm lint`: OK;
- procedural generated asset references blijven via Fase 7 asset library lopen;
- preview/bake kopieren geen assets naar Git;
- generated placement candidates voeren geen runtime publish uit.

## Filename gate

`Blacksmit forge.glb` bevat een spatie. Fase 7 heeft bevestigd dat scanner, asset IDs, database records en node pickers dit correct ondersteunen. Latere runtime serving/URL-fases moeten deze gate opnieuw controleren wanneer assets publiek geserveerd worden.

## Assetstatussen

Gebruik deze statussen in latere fases:

| Status | Betekenis |
|---|---|
| `server-present` | Bestand staat onder `/var/www/gk/assets` en de scanner heeft het geteld. |
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
- Fase 9: world/zone/spawn assetkoppelingen op Fase 8.1 draft/candidate output, plus HUD/minimap/audio candidates via nodes.
- Fase 13: NPC GLB, taakgeluiden en NPC audio.
- Fase 15: UI assets voor inventory, merchant, currency, scrolls.
- Fase 16: enemy, boss, loot, combat icon/audio/VFX assets.
- Fase 17: volledige beginquest-content via gepubliceerde node-data.

## Codex-taken buiten Git

Afgerond voor Fase 1/Fase 7/Fase 8/Fase 8.1 en de asset refresh na `Assets - new`:

1. `/var/www/gk/assets` gecontroleerd.
2. GLB-, UI- en audiobestanden geteld.
3. `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` bevestigd.
4. Fase 7 asset library scan server-side gevalideerd.
5. Fase 8 entity/component migratie toegepast.
6. Asset/entity validation check met `Taverne.glb` en `Wizard.glb` uitgevoerd.
7. Candidate role mapping blijft niet runtime-active zonder editor-data.
8. Missing animation mapping is warning voor candidate en blocker voor runtime-active behavior.
9. Fase 8.1 `pnpm build/typecheck/test/lint` en migratie `0005_procedural_generation_core.sql` bevestigd.
10. Asset refresh na `Assets - new` uitgevoerd met GLB=4, UI images=37, audio files=21, invalid=0, missing=0.
11. `assetsCopiedToGit=false`, `publishesRuntimeOutput=false` en `assignsDefinitiveRuntimeRoles=false` bevestigd.

Latere fases kunnen nieuwe serverchecks nodig hebben wanneer assets worden toegevoegd of wanneer asset-worker, watcher, rechten, metadata-extractie of runtime serving worden gebouwd.
