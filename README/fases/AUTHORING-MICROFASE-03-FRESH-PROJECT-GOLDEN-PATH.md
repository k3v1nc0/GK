# AUTHORING MICROFASE 3 - Fresh Project Golden Path

**Status:** Checkpoint 1 accepted; Checkpoint 2 accepted; Checkpoint 3 in progress
**Datum:** 2026-10-12

## Scope van deze uitvoering

Checkpoint 1, de menselijke fresh-projectbootstrap en volledige rootplumbing, is live door Kevin geaccepteerd. Checkpoint 2, de menselijke world-, area-, surface- en spawn-authoring, is na alle 25 live stappen door Kevin geaccepteerd. Checkpoint 3 (Kevins onafhankelijke mirror-, playthrough- en lifecycleacceptatie) is in uitvoering.

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

## Checkpoint 2: Wereldinhoud

Het Bouw-overzicht toont bij de actieve zone één sectie `Wereldinhoud` met de acties `Gebied tekenen`, `Surface toevoegen`, `Enemy-groep plaatsen`, `Resourcegroep plaatsen`, `Itempickup plaatsen` en `Currencypickup plaatsen`.

Iedere actie opent een korte taakspecifieke wizard in `aside.tools`. De wizard gebruikt menselijke namen, typed referencepickers, een typed texturepicker voor surfaces, normale getalvelden en een plaatskeuze door in de bestaande 3D-viewport te klikken. Er is geen tweede authoringmodel en de gebruiker voert geen canonical IDs of JSON in.

Gebieden gebruiken uitsluitend de bewezen collisioncontracten:

- `blocker_area -> zone_output.collision` voor niet-betreedbare polygonen;
- `walkable_surface -> zone_output.collision` voor loopvlakken, inclusief hoogte;
- `surface_layer -> zone_output.terrain` voor path/road/water/river/mud/lava/snow/custom-surfaces.

Deze nodes blijven in de bestaande point/polygon- en Surface Layer-tool selecteerbaar. De center/point-handles, G-verplaatsing, F-extrude en de bestaande surfacebewerking blijven eigenaar van de geometrie.

## Checkpoint 2: Spawnpakketten

Een menselijke spawngroep wordt opgeslagen als een bestaand lokaal graphpakket:

1. `enemy_spawn_area`, `resource_spawn` of `pickup_spawn`;
2. één eigen `spawn_set`;
3. de bestaande zone-singleton `spawn_controller` (find-or-create);
4. verbinding naar `zone_output.spawnControllers`;
5. een hergebruikte of eigen `respawn_policy_definition` in het bestaande Catalog package;
6. de gekozen bestaande enemy-, resource-, item-, currency-, loot- en yield-definities.

Heropenen zoekt het pakket via bestaande typed edges en references. Opslaan hergebruikt de bestaande set/controller/policy waar die lokaal is en maakt geen dubbele edges. Een gedeeld stat block of respawnprofiel wordt niet stil voor andere content herschreven: dan krijgt de gekozen enemy/spawn een eigen profiel via het bestaande contract.

De editorpreview en game gebruiken dezelfde door de compiler gebouwde `zonePackage.spawnControllers[].spawnSets[].spawns[]`. De preview toont de bestaande individuele enemy-, resource- en pickupinstanties en gebruikt hun `nodeId` als editorselectie. Er wordt geen extra `model_entity` of tweede mesh aangemaakt.

Het draft-/publish-readmodel neemt voor deze spawns ook het werkelijk door NODE-03 gekozen catalogusmodel op in `world.assets`: enemy `modelAssetId` of variantoverride, resource `worldModelAssetId` en item `worldModelAssetId`. Daardoor kan de game dezelfde bestaande asset laden als de editorpreview zonder een extra gameplay- of meshesysteem.

## Selectie, G, nodes en verwijderen

- Klikken op een gebied, surface of spawnmarkering selecteert de echte authored node en opent direct de menselijke wizard met de bestaande waarden.
- Gebieden en surfaces gebruiken het bestaande point/polygon-G-model.
- Een spawnmarkering gebruikt G als delta op het groepscentrum; daardoor verplaatst een resource- of enemygroep als geheel zonder de offset van de aangeklikte instantie als nieuw centrum op te slaan.
- `Toon in nodes` projecteert alleen de spawn/surface/area-node, lokale set, gedeelde controller, lokale policy, relevante definities en Zone Output.
- Verwijderen meldt de pakketgrootte en externe koppelingen, verwijdert de eigen spawn en set, verwijdert een controller alleen wanneer geen andere sets overblijven, en verwijdert een respawnpolicy alleen wanneer die niet elders wordt gebruikt. Gedeelde gameplaydefinities en loot tables blijven bestaan.

## Aantoonbaar geconsumeerde velden

- Enemy-aantal: NODE-03 en editorpreview gebruiken `countMax` om het aantal instanties te maken; de wizard schrijft daarom één eerlijk `Aantal actief` naar `countMin`, `countMax` en `maxAlive`.
- Enemy health: `stat.health` uit het verbonden `stat_block` wordt `healthMax`.
- Enemy damage: `stat.attack_power` wordt gebruikt voor retaliation damage.
- Enemy loot: `enemy_archetype.lootTableRef` wordt bij defeat door de NODE-03 lootgrant gebruikt.
- Resource-aantal/radius: `resource_spawn.count` en `radius` bouwen de zichtbare resourceinstanties.
- Resource yield: `resource_definition.yieldLootTableRef` wordt bij gather gebruikt.
- Itempickup-aantal: `pickup_spawn.amount` wordt als itemgrant gebruikt.
- Currencypickup minimum/maximum: `minAmount` en `maxAmount` worden door de currency-pickupconsumer gelezen; de huidige NODE-03-consumer geeft daarvan deterministisch het afgeronde middenbedrag en kiest niet willekeurig.
- Respawnseconden: `respawn_policy_definition.minDelayMs/maxDelayMs` bepalen de NODE-03 respawntijd.
- Surface texture/kleur/breedte en collisionpolygonen lopen via de bestaande publish-readmodels naar de bestaande world-runtime.

## Niet ontsloten wegens ontbrekende consumer

- `safe_rule_area`, `discovery_area` en `checkpoint` hebben producer en compileroutput, maar geen aantoonbare gebieds-/activatieconsumer in de huidige game-runtime. Zij worden niet als werkende gebiedsrol aangeboden.
- `respawn_policy_definition.oneTimeSpawn` wordt gecompileerd, maar NODE-03 leest het veld niet. Daarom is `respawn uit` niet als nep-schakelaar aangeboden; alleen de werkelijk werkende respawnvertraging is beschikbaar.
- `enemy_spawn_area.countMin` wordt niet als willekeurig minimum gebruikt; NODE-03 kiest het maximum. De UI toont daarom één exact actief-aantal.
- AI movement speed, sight/aggroafstand, preferred/attack range, faction, difficulty en animationprofielen worden niet door het huidige NODE-03-spawngedrag geconsumeerd en zijn niet in deze wizard gezet.
- Enemy- en resource-modelvelden zijn in het bestaande schema optioneel. De wizard eist daarom geen modelasset; bestaande definitiemodellen worden door preview/runtime gebruikt en anders blijft de bestaande fallbackweergave gelden.

## Checkpoint 3 blocker: semantische veldhulp

Tijdens Checkpoint 3 is aangetoond dat de bestaande I-tooltip bij normale inspectorvelden begon met technische key en datatype en daarna voornamelijk generieke uitleg per veldtype gaf. Daardoor kon Kevin uit de editor niet betrouwbaar afleiden welk gameplay-effect een veld heeft, waarom de default bestaat en of compiler en runtime het veld daadwerkelijk gebruiken. Dit is een acceptance-blocker; Checkpoint 3 blijft open totdat Kevin de hulp in de normale route heeft gecontroleerd.

De editor gebruikt nu één deterministisch semantisch helpregister, exact geïndexeerd op `(nodeType, fieldKey)`. Iedere zichtbare schemacombinatie krijgt `Doet`, de schema-default met een bewezen reden of een expliciete melding dat geen ontwerpvoorkeur bewezen is, praktisch advies, type-afhankelijke betekenis en een runtime-status. Technische key en datatype staan pas op de laatste regel. References vertellen wat gekozen wordt, in welke normale authoringroute de definitie staat en wat leeg werkelijk betekent. Waar code geen voorkeursbereik bewijst, staat letterlijk dat Kevin in de eigen game moet testen.

De read-only coveragecontrole `node scripts/check-semantic-field-help.js` inventariseert het actuele schema en faalt bij een ontbrekende entry of wanneer alleen de oude generieke fallback overblijft. Op 2026-10-12 rapporteert hij 1.851 zichtbare combinaties, 1.851 semantisch gedekt, 242 bewust technisch, 96 aantoonbaar nog niet actief en geen ontbrekende of uitsluitend generieke entries. De aantallen worden uit het actuele schema berekend en zijn geen handmatig vastgezette acceptatiegetallen.

Codebewijs is daarbij leidend. Onder meer `enemy_spawn_area.radius`, stat-block health/attack power, respawngemiddelde, portalrange, questobjectives, recipe-input/output, vendorprijzen, camera-afstanden en minimap-fog worden door hun bestaande compiler/readmodel/runtimeketen geconsumeerd. Daartegenover worden `enemy_spawn_area.pathRef`, spawn-distributie/spacing/activation, de losse `enemy_spawn_point`-runtimevelden, difficulty health/damage-multipliers en meerdere uitgebreide respawnopties wel opgeslagen of gecompileerd maar niet door de huidige runtime toegepast. De tooltip zegt dat nu expliciet en suggereert geen ontbrekende fallback of functionaliteit.

Deze blockerwijziging voegt geen runtimeconsumer toe, verandert geen schemawaarde/default, compilercontract, gameplaycontent of databasecontent en sluit Checkpoint 3 niet.

## Bewuste grenzen

Deze uitvoering maakt zelf geen demo-, proof-, quest-, NPC-, vendor-, enemy-, resource-, pickup- of portalcontent. De bestaande demo/database bleef read-only referentie en de bestaande fallback- en legacyroutes zijn niet verwijderd.

Encountercontrollers zijn niet nodig voor de bewezen zone-loaded NODE-03-spawnketen en worden niet aangemaakt. Spawn sets en controllers blijven technische implementatiedetails achter de menselijke wizard.

Checkpoint 3 blijft verantwoordelijk voor Kevins onafhankelijke mirror, publish/gamebewijs, reload/persistence en delete/republish-lifecycleacceptatie.

Ook buiten deze uitvoering blijven `objective_defeat`, quest branch/join/parallel/fail, demoportal-opruiming, recipecorrecties en bestaande state-skew.

Er is geen server gestart of herstart. Er zijn geen npm-test/check, smoke, Playwright- of performancechecks uitgevoerd. Alleen gerichte JavaScript-syntaxcontrole en read-only diffinspectie horen bij deze checkpointuitvoering.

**Checkpoint 1 accepted; Checkpoint 2 accepted; Checkpoint 3 in progress**
