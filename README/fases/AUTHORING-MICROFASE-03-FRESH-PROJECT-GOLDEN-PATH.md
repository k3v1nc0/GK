# AUTHORING MICROFASE 3 - Fresh Project Golden Path

**Status:** Checkpoint 1 implemented, awaiting Kevin acceptance  
**Datum:** 2026-10-11

## Scope van deze uitvoering

Deze uitvoering bevat uitsluitend checkpoint 1: de menselijke fresh-projectbootstrap en volledige rootplumbing. Checkpoint 2 (ontbrekende demo-zichtbare world/spawn/gameplay-authoring) en checkpoint 3 (Kevins onafhankelijke mirror- en lifecycle-acceptatie) zijn niet uitgevoerd.

De actieve demo, bestaande scripts en databasecontent zijn niet als template gebruikt. Een nieuw project krijgt alleen engine-neutrale basiswaarden en de door de gebruiker gekozen namen, omgeving, speler, camera en besturing.

De drie omgevingspresets gebruiken een hoge, positieve zonpositie en minimaal bruikbaar ambient daglicht. `Gedempt daglicht` verlaagt het contrast en voegt mist toe, maar maakt grond en speler niet vrijwel zwart.

## Menselijke route

Een graph die contractueel alleen `Game Output` bevat, toont in het Bouw-overzicht de actie `Nieuw gameproject`. De wizard vraagt achtereenvolgens:

1. projectnaam;
2. naam van de eerste zone;
3. een engine-neutraal omgevingspreset;
4. een bestaande spelerdefinitie of een typed modelasset voor een nieuwe spelerdefinitie;
5. een top-down camerapreset, de engine-neutrale besturingspreset `WASD standaard` en zichtbare, bewerkbare WASD-/sprint-/interactietoetsen;
6. een controleoverzicht en de ene bevestiging `Project maken`.

De bevestiging bouwt eerst een volledige graph in het geheugen en verstuurt daarna één bestaande graph-restore. Er is geen wizarddatabase, tweede projectmodel of verborgen editorrelatie.

## Aangemaakte projectketen

De helper zoekt bestaande onderdelen eerst op en maakt alleen ontbrekende onderdelen:

- `game_project_settings.projectSettings` naar `world_assembly.projectSettings`;
- `chunk_grid_definition.chunkGrid` naar `world_assembly.chunkGrid`;
- `world_assembly.gameProject` naar `game_output.gameProject`;
- Catalog Group met `catalog_output`, `catalog_registry` en de packageketen naar `world_assembly.catalogs`;
- Campaign Group met `campaign_output`, `campaign_registry` en de packageketen naar `world_assembly.campaigns`;
- Player Rules Group met `player_rules_output` naar `world_assembly.playerRules`;
- UI Group met `ui_output` naar `world_assembly.ui`;
- Zone Group met Group Input/Output, `zone_definition`, `zone_environment_settings`, `zone_gameplay_rules`, `ground_surface`, `spawn_point` en `zone_output` via `zone_registry` naar `world_assembly.zones`;
- `game_project_settings.startZoneRef` en `startSpawnRef` naar de eerste zone en spawn;
- een `playable_character_definition` in de Catalog package en een `player_character` in de eerste Zone package;
- een `game_camera` in de eerste Zone package;
- `ambient_light` en `directional_light` naar World Assembly;
- keybinds voor W, S, A, D, sprint en interactie naar World Assembly.

Poorten worden opgezocht op het actuele node-type, datatype en de bestaande Group Interface. De bootstrap schrijft geen aangenomen alternatieve packagepoort of parallelle compilerroute.

## Idempotentie en herstel

- De helper is find-or-create en veilig opnieuw uitvoerbaar.
- Bestaande assemblies, registries, settings, groups, outputs, spelerdefinities, camera's, lights, keybinds en equivalente edges worden hergebruikt.
- Geldige bestaande root-package-outputs en hun aangesloten content blijven op hun huidige niveau staan. Herstel verplaatst ze niet over een Group-grens en maakt geen concurrerende Player Rules- of UI-koppeling naar World Assembly.
- Normaal herstel vult alleen ontbrekende nodes, waarden en verbindingen aan. Het herschrijft bestaande project-, zone-, omgeving-, camera- of controlwaarden niet stil.
- `Projectbasis beheren` is een expliciete gebruikersactie en mag de in de wizard getoonde waarden wijzigen.
- Een gedeeltelijke foundation toont in het Bouw-overzicht de ontbrekende menselijke onderdelen en `Projectbasis herstellen`.
- Wereld/Zone, Catalog, Campaign, Player Rules en UI sturen bij een ontbrekende basis terug naar dezelfde herstelwizard. Zij maken niet langer stil ongekoppelde rootcontent.
- Raw nodes blijven via `Toon in nodes` inspecteerbaar, maar zijn niet de aanmaak- of herstelworkflow.

## Bewuste grenzen

Checkpoint 1 maakt geen quests, NPCs, vendors, enemies, resources, pickups, portals of andere democontent. De bestaande fallback- en legacyroutes zijn niet verwijderd.

Checkpoint 2 blijft verantwoordelijk voor de nog ontbrekende zichtbare world-, area-, spawncluster-, encounter-, pickup- en advanced gameplay-authoring die nodig is voor gedragsmatige demo-gelijkwaardigheid.

Checkpoint 3 blijft verantwoordelijk voor Kevins onafhankelijke mirror, publish/gamebewijs, reload/persistence en delete/republish-lifecycleacceptatie.

Ook buiten deze uitvoering blijven `objective_defeat`, quest branch/join/parallel/fail, demoportal-opruiming, recipecorrecties en bestaande state-skew.

Er is geen server gestart of herstart. Er zijn geen npm-test/check, smoke, Playwright- of performancechecks uitgevoerd. Alleen gerichte JavaScript-syntaxcontrole en read-only diffinspectie horen bij deze checkpointuitvoering.

**Checkpoint 1 implemented, awaiting Kevin acceptance**
