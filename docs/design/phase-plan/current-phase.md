# Current Phase

## Fase

Actieve fase: Fase 1 - Game Bible, content gates en maaklijst.

## Status

Fase-status: klaar voor Fase 2, met asset- en content-gates voor latere fases.

Fase 1 is niet hetzelfde als alle content afhebben. Fase 1 is klaar wanneer de leidende Game Bible, registers, gates, assetbron en maaklijststatus betrouwbaar genoeg zijn om Fase 2 veilig te starten.

## Doel

Fase 1 legt het levende contract vast voor:

- Game Bible;
- assets;
- UI;
- audio;
- camera;
- lighting;
- minimap;
- economy;
- levels;
- boss/quest keuzes;
- content gates;
- maaklijst en phase-plan.

## Wat is aangemaakt of bijgewerkt

- `docs/design/game-bible.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `docs/design/world-settings-plan.md`
- `docs/design/economy-plan.md`
- `docs/design/content-gates.md`
- `docs/design/phase-plan/current-phase.md`
- `README/current-phase.md`

## Leidende Game Bible

Kevin heeft bevestigd:

- `README/GameBibleNode.json` is de actuele leidende Game Bible voor deze nieuwe game.

Concrete gamecontent mag alleen uit deze GameBible JSON, editor/node-data, registers, database of expliciete Kevin-input komen.

## Assetstatus

Codex heeft bevestigd:

| Veld | Waarde |
|---|---|
| Assetpad | `/var/www/gk/assets` |
| Env var | `GK_ASSET_SOURCE_DIR="/var/www/gk/assets"` |
| GLB | 4 |
| UI images | 0 |
| Audio | 0 |
| Submappen | Geen |
| Dubbele bestandsnamen | Geen |
| Repo/server match | Exact gelijk |
| Git-status bij Codex | Schoon |

Aanwezige GLB-bestanden:

- `Blacksmit forge.glb`
- `Blacksmit.glb`
- `Taverne.glb`
- `Wizard.glb`

Let op: `Blacksmit forge.glb` bevat een spatie. Fase 7 moet dit testen in asset scanner, URLs, database records en node IDs.

## Checks

Uitgevoerd:

- Repo-structuur gecontroleerd via GitHub connector.
- Bestaande Fase 1-documenten opnieuw opgehaald.
- `README/GameBibleNode.json` gericht gecontroleerd.
- Codex-serverassetscan als Kevin/Codex-bevestiging verwerkt.
- Bevestigd dat `package.json` niet bestaat op rootpad via connectorcontrole.
- Wijzigingsscope beperkt tot documentatie en phase-plan.

Niet uitvoerbaar hier:

- `build`: geen package/config-tooling zichtbaar in de repo-root.
- `typecheck`: geen TypeScript/package tooling zichtbaar in de repo-root.
- `tests`: geen testconfig of package script zichtbaar in de repo-root.
- `lint`: geen lintconfig of package script zichtbaar in de repo-root.
- Nieuwe server/runtime checks: niet nodig voor deze documentupdate; Codex heeft de assetscan al uitgevoerd.

Beperkte verificatie:

- Geen runtimecode gewijzigd.
- Geen assets toegevoegd.
- Geen dummy assets of tijdelijke vervangers toegevoegd.
- Geen extra gamecontent verzonnen buiten `README/GameBibleNode.json`.

## Afgeronde Codex-taken buiten Git

- `/var/www/gk/assets` gecontroleerd.
- GLB/UI/audio bestanden geteld.
- `GK_ASSET_SOURCE_DIR="/var/www/gk/assets"` bevestigd.
- Repo-assets exact aanwezig op server.
- Geen submappen en geen dubbele bestandsnamen gevonden.
- Git bleef schoon bij Codex.

## Open gates voor latere fases

Niet Fase 1-blokkerend, wel belangrijk voor latere fases:

- UI images staan nu op 0.
- Audio staat nu op 0.
- GLB-assets hebben nog geen definitieve role/capability mapping.
- `Blacksmit forge.glb` met spatie moet in Fase 7 pipeline-validatie krijgen.
- Camera, lighting, minimap, economy, levels, merchants, combat en bosswaarden moeten uit GameBible JSON, editor/node-data of Kevin-input komen.

## Fasebeoordeling

Fase 1 is klaar voor Fase 2.

Reden:

- De leidende Game Bible is bevestigd.
- Assetpad en `GK_ASSET_SOURCE_DIR` zijn bevestigd.
- GLB/UI/audio telling is bekend.
- Registers en gates bestaan.
- Ontbrekende UI/audio en asset role mappings zijn expliciet latere gates.
- Runtimecode is niet gewijzigd en bevat geen nieuwe concrete content.

Fase 2 mag starten zolang toekomstige agents deze gates blijven respecteren.
