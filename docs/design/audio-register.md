# Audio Register

## Status

Na commit `44defc0f79f032cabc07eba43573a40c5f629b97` (`Assets - new`) heeft Codex `/var/www/gk/assets` opnieuw laten scannen. Er zijn 21 audio-assets aanwezig.

Fase 8.1, Fase 9 en Fase 10 zijn server-side afgerond en klaar. De audio-assets zijn asset-library candidates en geen hardcoded runtimecontent.

Fase 10 Publish Flow Core valideert candidate references en snapshot metadata, maar kiest geen concrete music, ambience, SFX, UI audio of dialogue runtime mapping.

Fase 11 Runtime Projection Core Git-basis is voorbereid. Fase 11 mag audio alleen als publish-accepted reference/read-model metadata projecteren. Fase 11 speelt geen audio af, bouwt geen audio runtime playback en wijst geen concrete audio mapping toe.

## Audio asset policy

Audio wordt via nodes gekozen en ingesteld. Runtimecode mag alleen generieke audio-capabilities bevatten zoals laden, afspelen, spatialization, mixing, loophandling, distance attenuation en event routing wanneer een latere runtime/audio fase dit expliciet opent.

Niet toegestaan:

- verzonnen audio;
- definitieve audiobestanden die niet bestaan;
- hard-coded muziek, ambience, SFX, UI-audio of dialogue audio in runtimecode;
- dummy audio of tijdelijke vervangers;
- definitieve audio-inzet zonder editor/node-data, GameBible, register of expliciete Kevin-input;
- publish-flow die audio assets kopieert, muteert of automatisch als runtime audio publiceert;
- runtime projection die audio assets kopieert, muteert, afspeelt of concrete audio runtime mapping hardcoded toewijst.

## Bevestigde assetbron

| Veld | Waarde |
|---|---|
| Assetpad | `/var/www/gk/assets` |
| Env var | `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` |
| Audio count | 21 |
| Audio scan | OK |
| Invalid | 0 |
| Missing | 0 |
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

## Fase 9 audio gate

Fase 9 bouwt world/camera/lighting/minimap en UI display contracts. Audio assets kunnen in Fase 9 documentatie en editor/picker contexts als candidates bestaan, maar Fase 9 koppelt ze niet als definitieve runtime audio.

Server-side bevestigd voor Fase 9:

- geen concrete audio runtimecontent hardcoded;
- no-runtime-publish OK;
- no-asset-mutation OK;
- build/typecheck/test/lint OK.

Regels:

- world/zone ambience blijft editor/node-data;
- music state blijft editor/node-data;
- SFX event mapping blijft editor/node-data;
- UI audio blijft editor/node-data;
- geen audio runtime publish vanuit Fase 9 Git-basis;
- geen audio assets toevoegen, wijzigen of kopieren;
- geen hardcoded ambience/music/SFX/UI audio.

## Fase 10 publish audio gate

Fase 10 neemt audio alleen als candidate/reference gate mee:

- audio assets blijven asset-library candidates;
- generated audio blijft draft/candidate input;
- publish validation mag ontbrekende/ongeldige references signaleren;
- snapshot metadata bevat geen audio payload;
- geen audio asset wordt gekopieerd, gewijzigd of gepubliceerd;
- geen concrete music/ambience/SFX/UI runtime mapping wordt toegevoegd.

## Fase 11 runtime projection audio gate

Fase 11 neemt audio alleen als publish-accepted reference/read-model metadata mee:

- audio assets blijven asset-library candidates totdat editor/node-data en publish data ze expliciet kiezen;
- runtime projection records mogen geen audio payload bevatten;
- runtime projection read-only routes mogen geen raw editor draft audio data lekken;
- runtime projection voert geen playback uit;
- runtime projection bouwt geen audio runtime;
- runtime projection wijzigt of kopieert geen audio assets;
- geen concrete music/ambience/SFX/UI audio mapping wordt hardcoded.

## Open audio gates

| Onderwerp | Status | Blokkeert |
|---|---|---|
| Muziekbestanden | Aanwezig als candidates | Geen bestandsgate; wel keuze/mapping gate voor concrete music state |
| Ambience-bestanden | Aanwezig als candidates | Geen bestandsgate; wel zone/context/mapping gate |
| SFX-bestanden | Aanwezig als candidates | Geen bestandsgate; wel event/mapping gate |
| UI audio | Aanwezig als candidates | Geen bestandsgate; wel HUD/UI event/mapping gate |
| Combat/boss audio | SFX candidates bestaan, maar concrete combat/boss mapping ontbreekt | Fase 16/17 wanneer specifieke combat/boss audio verplicht wordt |
| Dialogue/voice gebruik | Nog te bepalen; 0 voice/dialogue bestanden bevestigd | NPC/dialogue flows wanneer voice/audio verplicht wordt |

Deze gates blokkeren Fase 11 Git-basis niet. Ze blokkeren alleen latere fases wanneer concrete audio-keuzes nodig zijn die niet uit GameBible JSON, editor-data, registers, procedural draft output, publish data, runtime projection metadata of Kevin-input komen.

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

## Codex-taken buiten Git

Afgerond voor asset refresh, Fase 9 en Fase 10:

1. `/var/www/gk/assets` gecontroleerd.
2. Audio count vastgesteld op 21.
3. Ambience, music, SFX en UI audio als audio assets herkend.
4. `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` bevestigd.
5. Asset scan OK met invalid=0 en missing=0.
6. `assetsCopiedToGit=false`, `publishesRuntimeOutput=false` en `assignsDefinitiveRuntimeRoles=false` bevestigd.
7. Server-side bevestigd dat Fase 9 geen concrete audio runtimecontent hardcoded.
8. Fase 9 build/typecheck/test/lint bevestigd.
9. Fase 10 build/typecheck/test/lint en publish gates bevestigd.

Open voor Fase 11:

1. Server-side bevestigen dat runtime projection geen concrete audio runtimecontent hardcoded.
2. Server-side bevestigen dat runtime projection geen audio/assets wijzigt of kopieert.
3. Build/typecheck/test/lint en runtime projection route smokes draaien.

Latere fases moeten opnieuw scannen wanneer Kevin audio toevoegt, verwijdert, hernoemt of definitieve node-koppelingen nodig maakt.
