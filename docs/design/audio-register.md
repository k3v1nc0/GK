# Audio Register

## Status

Codex heeft `/var/www/gk/assets` gecontroleerd. Er zijn nu 0 audio-assets aanwezig.

Fase 1-status: audio-inventaris afgerond, audio-content gate open voor latere fases.

## Audio asset policy

Audio wordt via nodes gekozen en ingesteld. Runtimecode mag alleen generieke audio-capabilities bevatten zoals laden, afspelen, spatialization, mixing, loophandling, distance attenuation en event routing.

Niet toegestaan:

- verzonnen audio;
- definitieve audiobestanden die niet bestaan;
- hard-coded muziek, ambience, SFX, UI-audio of dialogue audio in runtimecode;
- dummy audio of tijdelijke vervangers.

## Bevestigde assetbron

| Veld | Waarde |
|---|---|
| Assetpad | `/var/www/gk/assets` |
| Env var | `GK_ASSET_SOURCE_DIR="/var/www/gk/assets"` |
| Audio count | 0 |
| Submappen | Geen |
| Git-status bij Codex | Schoon |

Er zijn ook 0 UI images aanwezig. GLB-assets staan in `docs/design/asset-register.md`.

## Open audio gates

| Onderwerp | Status | Blokkeert |
|---|---|---|
| Muziekbestanden | Niet aanwezig | Fases die concrete music state nodig hebben |
| Ambience-bestanden | Niet aanwezig | World/zone ambience in Fase 9/10/17 |
| SFX-bestanden | Niet aanwezig | NPC, combat, item, loot en UI feedback wanneer verplicht |
| UI audio | Niet aanwezig | HUD/UI feedback wanneer verplicht |
| Combat/boss audio | Niet aanwezig | Fase 16/17 wanneer verplicht |
| Dialogue/voice gebruik | Nog te bepalen | NPC/dialogue flows wanneer voice/audio verplicht wordt |

Deze open gates blokkeren Fase 1 niet. Ze blokkeren alleen latere fases die concrete audio nodig hebben.

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
| Blokkade | Wanneer ontbrekende audio een fase stopt |

## Music

Status: 0 bestanden aanwezig.

Toekomstige nodefamilies:

- `audio.musicState`
- `audio.schedule`
- `audio.ducking`

Gate: muziek mag pas gekoppeld worden wanneer het bestand bestaat en de context uit GameBible JSON, editor-data of Kevin-input komt.

## Ambience

Status: 0 bestanden aanwezig.

Toekomstige nodefamilies:

- `audio.ambientZone`
- `audio.emitter3d`
- `audio.volumeByDistance`

Gate: startgebied-ambience vereist bestaande audio en zone/contextdata.

## SFX

Status: 0 bestanden aanwezig.

Toekomstige nodefamilies:

- `audio.randomOneShot`
- `audio.footstepSet`
- `audio.npcTaskSound`
- `combat.audio`

Gate: SFX voor NPC taken, combat, boss, item pickup en loot mogen niet worden verzonnen.

## UI audio

Status: 0 bestanden aanwezig.

Toekomstige nodefamilies:

- `audio.uiSound`
- HUD/UI nodes die audio-events publiceren

Gate: UI audio moet gekoppeld zijn aan UI nodes en asset library records.

## Voice en dialogue

Status: nog niet besloten of voice/dialogue audio relevant is; 0 bestanden aanwezig.

Toekomstige nodefamilies:

- `dialog.line`
- `audio.npcTaskSound`
- mogelijke dialogue audio picker

Gate: dialogue audio vereist bestaande bestanden en node-koppeling.

## Codex-taken buiten Git

Afgerond voor Fase 1:

1. `/var/www/gk/assets` gecontroleerd.
2. Audio count vastgesteld op 0.
3. `GK_ASSET_SOURCE_DIR="/var/www/gk/assets"` bevestigd.

Latere fases moeten opnieuw scannen wanneer Kevin audio toevoegt.
