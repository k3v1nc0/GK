# Audio Register

## Status

Na commit `44defc0f79f032cabc07eba43573a40c5f629b97` (`Assets - new`) heeft Codex `/var/www/gk/assets` opnieuw laten scannen. Er zijn 21 audio-assets aanwezig.

Fase 8.1, Fase 9, Fase 10, Fase 11, Fase 12 en Fase 12.1 zijn server-side afgerond en klaar. De audio-assets zijn asset-library candidates en geen hardcoded runtimecontent.

Fase 13 Runtime Render Surface Core Git-basis is toegevoegd. Fase 13 speelt geen audio af, laadt geen audio assets, bouwt geen audio playback runtime en wijst geen concrete audio mapping toe.

## Audio asset policy

Audio wordt via nodes gekozen en ingesteld. Runtimecode mag alleen generieke audio-capabilities bevatten zoals laden, afspelen, spatialization, mixing, loophandling, distance attenuation en event routing wanneer een latere runtime/audio fase dit expliciet opent.

Niet toegestaan:

- verzonnen audio;
- definitieve audiobestanden die niet bestaan;
- hard-coded muziek, ambience, SFX, UI-audio of dialogue audio in runtimecode;
- dummy audio of tijdelijke vervangers;
- definitieve audio-inzet zonder editor/node-data, GameBible, register of expliciete Kevin-input;
- publish-flow die audio assets kopieert, muteert of automatisch als runtime audio publiceert;
- runtime projection die audio assets kopieert, muteert, afspeelt of concrete audio runtime mapping hardcoded toewijst;
- runtime client shell die audio afspeelt, audio assets kopieert/muteert of concrete audio runtime mapping hardcoded toewijst;
- runtime render surface die audio afspeelt, audio assets laadt/kopieert/muteert of concrete audio runtime mapping hardcoded toewijst.

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

Er zijn ook 37 UI images en 4 GLB assets aanwezig. GLB- en UI-assets staan in `docs/design/asset-register.md`.

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

## Fase 12 runtime client shell audio gate

Fase 12 neemt audio alleen als read-only projection metadata mee:

- runtime client shell speelt geen audio af;
- runtime client shell bouwt geen audio playback runtime;
- runtime client shell gebruikt geen audio/editor/admin routes;
- runtime client shell lekt geen editor draft audio data;
- runtime client shell wijzigt of kopieert geen audio assets;
- runtime client shell hardcodet geen music, ambience, SFX, UI audio of dialogue mapping.

## Fase 13 runtime render surface audio gate

Fase 13 neemt audio niet als runtime playback of assetload mee.

Regels:

- render surface speelt geen audio af;
- render surface bouwt geen audio playback runtime;
- render surface laadt geen audio asset;
- render surface gebruikt geen audio/editor/admin routes;
- render surface lekt geen editor draft audio data;
- render surface wijzigt of kopieert geen audio assets;
- render surface hardcodet geen music, ambience, SFX, UI audio of dialogue mapping;
- render surface capability probe mag alleen canvas/WebGL status bepalen.

## Open audio gates

| Onderwerp | Status | Blokkeert |
|---|---|---|
| Muziekbestanden | Aanwezig als candidates | Geen bestandsgate; wel keuze/mapping gate voor concrete music state |
| Ambience-bestanden | Aanwezig als candidates | Geen bestandsgate; wel zone/context/mapping gate |
| SFX-bestanden | Aanwezig als candidates | Geen bestandsgate; wel event/mapping gate |
| UI audio | Aanwezig als candidates | Geen bestandsgate; wel HUD/UI event/mapping gate |
| Combat/boss audio | SFX candidates bestaan, maar concrete combat/boss mapping ontbreekt | Latere combat/boss fase wanneer specifieke audio verplicht wordt |
| Dialogue/voice gebruik | Nog te bepalen; 0 voice/dialogue bestanden bevestigd | NPC/dialogue flows wanneer voice/audio verplicht wordt |
| Runtime audio playback | Niet geopend | Pas wanneer Kevin een expliciete audio/runtime fase opent |

Deze gates blokkeren Fase 13 Git-basis niet. Ze blokkeren alleen latere fases wanneer concrete audio-keuzes nodig zijn die niet uit GameBible JSON, editor-data, registers, procedural draft output, publish data, runtime projection metadata of Kevin-input komen.

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

Afgerond:

1. `/var/www/gk/assets` gecontroleerd.
2. Audio count vastgesteld op 21.
3. Ambience, music, SFX en UI audio als audio assets herkend.
4. `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` bevestigd.
5. Asset scan OK met invalid=0 en missing=0.
6. `assetsCopiedToGit=false`, `publishesRuntimeOutput=false` en `assignsDefinitiveRuntimeRoles=false` bevestigd.
7. Fase 9 build/typecheck/test/lint bevestigd.
8. Fase 10 build/typecheck/test/lint en publish gates bevestigd.
9. Fase 11 build/typecheck/test/lint, runtime projection smokes en no-audio-playback/no-asset-mutation bevestigd.
10. Fase 12 build/typecheck/test/lint, runtime shell smokes en no-audio-playback/no-asset-mutation bevestigd.
11. Fase 12.1 `gk-game-web` service, browser smokes en no-audio-playback/no-asset-mutation bevestigd.

Open voor Fase 13:

1. Server-side bevestigen dat runtime render surface geen audio afspeelt.
2. Server-side bevestigen dat runtime render surface geen audio assets laadt, wijzigt of kopieert.
3. Server-side bevestigen dat runtime render surface geen concrete audio runtimecontent hardcoded.
4. Build/typecheck/test/lint en runtime render surface route/browser smokes draaien.

Latere fases moeten opnieuw scannen wanneer Kevin audio toevoegt, verwijdert, hernoemt of definitieve node-koppelingen nodig maakt.
