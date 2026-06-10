# Audio Register

## Status

Dit register bewaakt audio als contentdata. Er zijn in de repo-assets geen audio-bestanden zichtbaar tijdens Fase 1-controle. Server-audio onder `/var/www/gk/assets` moet nog door Codex buiten Git worden geteld.

Fase-status: documentbasis opgezet, audio-input gates open.

## Audio asset policy

Audio wordt via nodes gekozen en ingesteld. Runtimecode mag alleen generieke audio-capabilities bevatten zoals laden, afspelen, spatialization, mixing, loophandling, distance attenuation en event routing.

Niet toegestaan:

- verzonnen audio;
- definitieve audiobestanden die niet bestaan;
- hard-coded muziek, ambience, SFX, UI-audio of dialogue audio in runtimecode;
- dummy audio of tijdelijke vervangers.

## Open Kevin-input

| Onderwerp | Status | Blokkeert |
|---|---|---|
| Audio-richting en sfeer | Later samen uitwerken | Fase 9, 10, 13, 16, 17 audio |
| Bestaande audio-bestanden | Codex-controle vereist | Asset/audio library |
| Muziekkeuzes | Kevin-input vereist | Music state nodes |
| Ambience-keuzes | Kevin-input vereist | World/zone ambience |
| UI audio | Kevin-input vereist | HUD/UI feedback |
| Combat/boss audio | Kevin-input vereist | Fase 16 en 17 |
| Dialogue/voice gebruik | Later samen uitwerken | NPC/dialogue flows |

## Registratievelden

Elke audio asset moet later minimaal deze velden krijgen:

| Veld | Betekenis |
|---|---|
| Assetpad | Repo- of serverpad na controle |
| Status | `available`, `missing`, `needs-kevin-choice`, `blocked`, `warning-only` |
| Categorie | Music, ambience, SFX, UI audio, voice/dialogue |
| Node-koppeling | Audio node of content node die dit bestand gebruikt |
| Loopgedrag | Door Kevin/editor gekozen; geen Fase 1-waarde |
| Volume/mix-categorie | Door Kevin/editor gekozen; geen Fase 1-waarde |
| Runtime gebruik | Generieke playback capability, geen concrete hardcoding |
| Blokkade | Wanneer ontbrekende audio een fase stopt |

## Music

Status: geen definitieve muziek.

Toekomstige nodefamilies:

- `audio.musicState`
- `audio.schedule`
- `audio.ducking`

Gate: muziek mag pas gekoppeld worden wanneer het bestand bestaat en Kevin de context bevestigt.

## Ambience

Status: geen definitieve ambience.

Toekomstige nodefamilies:

- `audio.ambientZone`
- `audio.emitter3d`
- `audio.volumeByDistance`

Gate: startgebied-ambience vereist eerst startgebied, sfeer en assetkeuze.

## SFX

Status: geen definitieve SFX.

Toekomstige nodefamilies:

- `audio.randomOneShot`
- `audio.footstepSet`
- `audio.npcTaskSound`
- `combat.audio`

Gate: SFX voor NPC taken, combat, boss, item pickup en loot mogen niet worden verzonnen.

## UI audio

Status: geen definitieve UI-audio.

Toekomstige nodefamilies:

- `audio.uiSound`
- HUD/UI nodes die audio-events publiceren

Gate: UI audio moet gekoppeld zijn aan UI nodes en asset library records.

## Voice en dialogue

Status: nog niet besloten of voice/dialogue audio relevant is.

Toekomstige nodefamilies:

- `dialog.line`
- `audio.npcTaskSound`
- mogelijke dialogue audio picker

Gate: dialogue tekst, voice richting en bestanden vereisen Kevin-input.

## Codex-taken buiten Git

Codex moet buiten Git:

1. `/var/www/gk/assets/audio` en eventuele submappen controleren.
2. Audioformaten tellen: `.ogg`, `.mp3`, `.wav` en eventueel andere afgesproken formaten.
3. Duur, channels, sample rate en loop-candidate info verzamelen waar mogelijk.
4. `GK_ASSET_SOURCE_DIR` bevestigen.
5. Resultaten terugleggen in asset/audio library of rapporteren aan Kevin.
