# Current Phase

## Fase

Actieve fase: Fase 1 - Game Bible, content gates en maaklijst.

## Status

Fase-status: documentbasis opgezet, content-input gates open.

Niet markeren als volledig klaar zolang de open Kevin-input en externe Codex-taken hieronder nog openstaan.

## Doel

Fase 1 legt het levende contract vast voor:

- verhaal;
- namen;
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

Het doel is niet om definitieve gamecontent in te vullen. Het doel is voorkomen dat latere fases gokken, dummy content toevoegen of runtimecode vullen met concrete waardes.

## Scope van deze update

Aangemaakt of bijgewerkt in `docs/design/`:

- `game-bible.md`
- `asset-register.md`
- `audio-register.md`
- `world-settings-plan.md`
- `economy-plan.md`
- `content-gates.md`
- `phase-plan/current-phase.md`

Ondersteunende bestaande repo-documentatie die opnieuw geraadpleegd is:

- `README/00-index.md`
- `README/fase1.md`
- `README/kevin-maaklijst.md`
- `README/node-system-super-dynamic-contract.md`
- `README/hard-facts-to-node-panels.md`
- relevante fasebestanden voor Fase 7, 9, 13, 14, 15, 16 en 17.

## Repo-context

Gecontroleerde hoofdstructuur:

- `README/`
- `assets/`
- `.gitignore`
- `index.php`

`docs/design/` bestond niet als bevestigd bestandspad tijdens Fase 1-controle en wordt nu als blijvende design-contractlaag toegevoegd.

## Assetstatus

Repo-assets zichtbaar in `assets/`:

- `assets/Blacksmit forge.glb`
- `assets/Blacksmit.glb`
- `assets/Taverne.glb`
- `assets/Wizard.glb`

Deze bestandsnamen zijn repo-feiten, geen definitieve rolkeuzes. Server-assets onder `/var/www/gk/assets` zijn nog niet gecontroleerd door Codex.

## Checks

Uitgevoerd:

- Repo-structuur gecontroleerd via GitHub connector en GitHub webweergave.
- Bestaande README-, fase-, maaklijst- en node-contractdocumentatie gericht gecontroleerd.
- Repo-assets in `assets/` gericht gecontroleerd.
- Bevestigd dat `package.json` niet bestaat op rootpad via connectorcontrole.
- Bevestigd dat de zichtbare rootstructuur geen build-, typecheck-, test- of lintconfig toont.
- Wijzigingsscope beperkt tot documentatie en phase-plan.

Niet uitvoerbaar hier:

- `build`: geen package/config-tooling zichtbaar in de repo-root.
- `typecheck`: geen TypeScript/package tooling zichtbaar in de repo-root.
- `tests`: geen testconfig of package script zichtbaar in de repo-root.
- `lint`: geen lintconfig of package script zichtbaar in de repo-root.
- Server/runtime checks: vallen buiten Git en moeten door Codex op de server gebeuren.

Beperkte verificatie:

- Documenten bevatten geen bewust ingevulde definitieve game naam, quest, side quest, boss, currency, camerawaarde, lightingwaarde, minimapwaarde, price, reward, merchant stock of dialogue.
- Er zijn geen dummy assets of tijdelijke vervangers toegevoegd.
- Runtimecode is niet aangepast.

## Open Codex-taken buiten Git

Codex moet buiten Git uitvoeren:

1. Controleer `/var/www/gk/assets`.
2. Tel GLB-, UI- en audiobestanden.
3. Zet of bevestig `GK_ASSET_SOURCE_DIR`.
4. Controleer asset-worker/serverrechten zodra Fase 7 dat nodig heeft.
5. Controleer MySQL, Redis, Nginx, systemd, secrets, builds en runtime checks pas wanneer een latere fase dat nodig heeft.

## Open Kevin-input

Nog verplicht te bevestigen of samen uit te werken:

- Assetpad.
- Game naam.
- Startgebied.
- Sfeer.
- MMO-stijl.
- Welke GLB-assets al bestaan en welke rol ze krijgen.
- Welke UI-assets al bestaan.
- Welke audio-assets al bestaan.
- Welke namen later samen verzonnen of gekozen moeten worden.
- Welke quests later samen verzonnen of gekozen moeten worden.
- Welke side quests later samen verzonnen of gekozen moeten worden.
- Welke boss later samen verzonnen of gekozen moet worden.
- Welke currency later samen verzonnen of gekozen moet worden.
- Camera-, lighting-, minimap-, economy-, level- en merchantkeuzes wanneer latere fases die concreet nodig hebben.

## Documentatieconflict

`README/GameBibleNode.json` en `README/story - The Staff of Eldoria.md` bevatten concrete verhaal- en naamcontent. Omdat Kevin deze fase als 100% nieuw project heeft vastgelegd, is die content niet automatisch bindend. Nieuwe agents moeten dit als te verifieren of te vervangen behandelen en mogen de content niet stilzwijgend als definitieve nieuwe-game waarheid gebruiken.

## Fasebeoordeling

Fase 1 is gedeeltelijk voorbereid.

Klaar:

- Documentbasis voor Game Bible, registers, world/economy-plannen, content gates en current phase is opgezet.
- Gates leggen vast dat ontbrekende Kevin-input blokkeert.
- Latere fases hebben duidelijke verificatiepunten.

Niet klaar:

- Definitieve Kevin-content ontbreekt nog.
- Server-assetinventarisatie ontbreekt nog.
- `GK_ASSET_SOURCE_DIR` is nog niet door Codex bevestigd.

Fase 1 mag pas volledig klaar heten wanneer deze open punten zijn opgelost of expliciet als latere niet-blokkerende input zijn herclassificeerd.
