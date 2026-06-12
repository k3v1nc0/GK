# Audio Register

## Status

Na commit `44defc0f79f032cabc07eba43573a40c5f629b97` (`Assets - new`) heeft Codex `/var/www/gk/assets` opnieuw laten scannen. Er zijn nu 21 audio-assets aanwezig.

Fase 1-status: audio-inventaris afgerond, audio-content gate open voor latere fases.

Fase 8.1 blijft server-side afgerond en klaar. De nieuwe audio-assets zijn asset-library candidates en geen hardcoded runtimecontent.

## Audio asset policy

Audio wordt via nodes gekozen en ingesteld. Runtimecode mag alleen generieke audio-capabilities bevatten zoals laden, afspelen, spatialization, mixing, loophandling, distance attenuation en event routing.

Niet toegestaan:

- verzonnen audio;
- definitieve audiobestanden die niet bestaan;
- hard-coded muziek, ambience, SFX, UI-audio of dialogue audio in runtimecode;
- dummy audio of tijdelijke vervangers;
- definitieve audio-inzet zonder editor/node-data, GameBible, register of expliciete Kevin-input.

## Bevestigde assetbron

| Veld | Waarde |
|---|---|
| Assetpad | `/var/www/gk/assets` |
| Env var | `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` |
| Audio count | 21 |
| Audio scan | OK |
| Invalid | 0 |
| Missing | 0 |
| Git status bij servercheck | Clean |
| Runtime publish | Nee, `publishesRuntimeOutput=false` |
| Assets naar Git door scan | Nee, `assetsCopiedToGit=false` |

Er zijn ook 37 UI images aanwezig. GLB- en UI-assets staan in `docs/design/asset-register.md`.

## Audio categorieen

| Categorie | Aantal | Status | Gate |
|---|---:|---|---|
| Ambience | 4 | Aanwezig als candidates | Zone/world ambience pas via nodes/editor-data kiezen |
| Music | 4 | Aanwezig als candidates | Music state pas via nodes/editor-data kiezen |
| SFX | 6 | Aanwezig als candidates | NPC/combat/item/UI events pas via nodes/editor-data kiezen |
| UI audio | 7 | Aanwezig als candidates | HUD/UI events pas via UI/audio nodes kiezen |
| Voice/dialogue | 0 | Nog niet besloten of aanwezig | Alleen later toevoegen/kiezen als voice/dialogue nodig wordt |

Ambience, music, SFX en UI audio worden door de asset scan als audio assets gezien.

## Open audio gates

| Onderwerp | Status | Blokkeert |
|---|---|---|
| Muziekbestanden | Aanwezig als candidates | Geen bestandsgate; wel keuze/mapping gate voor concrete music state |
| Ambience-bestanden | Aanwezig als candidates | Geen bestandsgate; wel zone/context/mapping gate |
| SFX-bestanden | Aanwezig als candidates | Geen bestandsgate; wel event/mapping gate |
| UI audio | Aanwezig als candidates | Geen bestandsgate; wel HUD/UI event/mapping gate |
| Combat/boss audio | SFX candidates bestaan, maar concrete combat/boss mapping ontbreekt | Fase 16/17 wanneer specifieke combat/boss audio verplicht wordt |
| Dialogue/voice gebruik | Nog te bepalen; 0 voice/dialogue bestanden bevestigd | NPC/dialogue flows wanneer voice/audio verplicht wordt |

Deze gates blokkeren Fase 8.1 niet. Ze blokkeren alleen latere fases wanneer concrete audio-keuzes nodig zijn die niet uit GameBible JSON, editor-data, registers, procedural draft output of Kevin-input komen.

## Registratievelden

Elke audio asset moet later minimaal deze velden krijgen:

| Veld | Betekenis |
|---|---|
| Assetpad | Serverpad na scan |
| Status | `available`, `missing`, `needs-kevin-choice`, `blocked`, `warning-only` |
| Categorie | Music, ambience, SFX, UI audio, voice/dialogue |
| Node-koppeling | Audio node of content node die dit bestand gebruikt |
| Loopgedrag | Door Kevin/editor gekozen |
| Volume/mix-categorie | Door Kevin/editor gekozen |
| Runtime gebruik | Generieke playback capability, geen concrete hardcoding |
| Blokkade | Wanneer ontbrekende audio of ontbrekende mapping een fase stopt |

## Music

Status: 4 bestanden aanwezig als library candidates.

Toekomstige nodefamilies:

- `audio.musicState`
- `audio.schedule`
- `audio.ducking`

Gate: muziek mag pas gekoppeld worden wanneer het bestand bestaat en de context uit GameBible JSON, editor-data, registers, procedural draft output of Kevin-input komt. Aanwezigheid van music files wijst nog geen theme, state, timing, loopgedrag of runtimegebruik toe.

## Ambience

Status: 4 bestanden aanwezig als library candidates.

Toekomstige nodefamilies:

- `audio.ambientZone`
- `audio.emitter3d`
- `audio.volumeByDistance`

Gate: startgebied- of zone-ambience vereist bestaande audio en zone/contextdata. Aanwezigheid van ambience files wijst nog geen zone, biome, trigger of runtimegebruik toe.

## SFX

Status: 6 bestanden aanwezig als library candidates.

Toekomstige nodefamilies:

- `audio.randomOneShot`
- `audio.footstepSet`
- `audio.npcTaskSound`
- `combat.audio`

Gate: SFX voor NPC taken, combat, boss, item pickup en loot mogen alleen via nodes/editor-data worden gekozen. Aanwezigheid van SFX files wijst nog geen event, NPC, item, combat action of lootgedrag toe.

## UI audio

Status: 7 bestanden aanwezig als library candidates.

Toekomstige nodefamilies:

- `audio.uiSound`
- HUD/UI nodes die audio-events publiceren

Gate: UI audio moet gekoppeld zijn aan UI nodes en asset library records. Aanwezigheid van UI audio wijst nog geen definitieve HUD-flow, panel state, button action of runtime UI feedback toe.

## Voice en dialogue

Status: nog niet besloten of voice/dialogue audio relevant is; 0 voice/dialogue bestanden bevestigd.

Toekomstige nodefamilies:

- `dialog.line`
- `audio.npcTaskSound`
- mogelijke dialogue audio picker

Gate: dialogue audio vereist bestaande bestanden en node-koppeling.

## Codex-taken buiten Git

Afgerond voor Fase 1 en de asset refresh na `Assets - new`:

1. `/var/www/gk/assets` gecontroleerd.
2. Audio count vastgesteld op 21.
3. Ambience, music, SFX en UI audio als audio assets herkend.
4. `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` bevestigd.
5. Asset scan OK met invalid=0 en missing=0.
6. `pnpm build`, `pnpm typecheck`, `pnpm test` en `pnpm lint` zijn OK gemeld na de asset refresh.
7. `assetsCopiedToGit=false`, `publishesRuntimeOutput=false` en `assignsDefinitiveRuntimeRoles=false` bevestigd.

Latere fases moeten opnieuw scannen wanneer Kevin audio toevoegt, verwijdert, hernoemt of definitieve node-koppelingen nodig maakt.
