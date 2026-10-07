# AUTHORING VISUAL BUILDER - Fase 1 van 3

**Status:** Fase 1 implemented, awaiting Kevin acceptance  
**Datum:** 2026-10-07

## Scope

De bestaande `model_entity -> entity_assembly -> zone_output`-route is de enige
viewport-first authoringroute. Een GLB-drop selecteert het geplaatste model en
opent direct de vijf korte stappen van de Visual Builder. Mesh en transform
blijven van `model_entity`; componenten en targets krijgen geen tweede mesh.

Ondersteunde rollen in deze fase:

- NPC via `npc_component`;
- Enemy via `enemy_component`;
- Resource via `resource_component`;
- fysiek Item/Pickup via `pickup_component`;
- Portal via `portal_component` plus een echte `zone_link`; twee geplaatste
  portals kunnen op menselijke naam worden gekoppeld zonder Spawn Point;
- Crafting Station via `crafting_station_component`;
- Vendor via `vendor_component`;
- Market Access via `marketplace_access_component`;
- Decoratie als assembly zonder gameplaycomponent.

NPC-, enemy-, resource- en itemdefinities kunnen vanuit de wizard gekozen of
minimaal aangemaakt worden. Recipes en Vendor Catalogs gebruiken dezelfde
contextuele type-stap. Nieuwe definities worden in een echte Catalog Group met
Catalog Output/Registry-koppeling opgeslagen; er bestaat geen wizard-only data.
Een nieuwe Resource kan daar meteen zijn opbrengst-item maken. Een nieuw Recipe
maakt echte `recipe_ingredient`-nodes voor één of meer gekozen items en bewaart
één of meer itemoutputs met aantallen. Nieuwe outputs kunnen categorie, tags en
een Equipment Slot krijgen. Een Crafting Station
behoudt bestaande recipes wanneer vanuit zijn wizard een volgend recipe wordt
toegevoegd, zodat bijvoorbeeld `2 Hout -> 1 Plank` en daarna
`Planken + extra ingrediënt -> Schild` dezelfde station gebruiken. Een nieuwe
Vendor Catalog kan meteen een item, currency en echt `vendor_offer`
maken, of bestaande definities kiezen. Daardoor is geen losse Catalog- of
raw-node-voorstap nodig in een leeg project.

Een Vendor Catalog is in de Visual Builder een heropenbare shoplijst. Kevin kan
meerdere artikelen toevoegen, ieder met item, koop/verkooprichting, currency,
prijs en werkelijk ondersteunde oneindige of beperkte voorraad. Bij heropenen
worden de bestaande `vendor_offer`-nodes teruggelezen en bijgewerkt; een nieuw
artikel vervangt de eerdere offers niet. Onvolledige artikelen melden in stap 2
precies welke keuze nog nodig is voordat `Volgende` actief wordt.

Alle typed bronvelden in Authoring gebruiken dezelfde bestaande-contentpicker.
Die toont direct, alfabetisch en met menselijk label, de toegestane Draft- en
opgeslagen bronnen. De zoekbox filtert deze zichtbare lijst; een auteur hoeft
de naam of canonical ID niet vooraf te kennen. De gekozen bron is herkenbaar
gemarkeerd en een werkelijk verwijderde oude bron blijft apart gewaarschuwd.

## Runtimecontracten

- `resource_component` bestond als producer van `entityComponent`, maar de
  NODE-03 consumer las alleen `resource_spawn`. NODE-03 consumeert nu ook de
  component uit een gepubliceerde `entity_assembly`.
- Voor een fysieke authored pickup is `pickup_component -> entityComponent ->
  entity_assembly.components -> zone_output.entities -> NODE-03` toegevoegd.
- Voor een visible authored portal is `portal_component -> entityComponent ->
  entity_assembly.components` gekoppeld aan een echte `zone_link ->
  zone_output.links`; NODE-03 gebruikt de modeltransform als link-origin en de
  travel-server gebruikt de modeltransform van de gekoppelde doelportal als
  aankomstpunt. Bestaande `toSpawnRef`-links blijven compatibel.
- Wanneer Kevin een portal met een oude spawn-link expliciet als doel kiest,
  vervangt de wizard die lokale oude link automatisch door het tweerichtingspaar.
  Nieuwe loadingtekst gebruikt concrete zonenamen en veroorzaakt geen statische
  `@{zone.name}`-previewfouten.
- Runtime-targets met een authored entity gebruiken alleen marker/nameplate/hit
  target en hechten aan de bestaande `model_entity`; zij laden geen tweede mesh.
- De zwarte gameplayballonnen worden in de editor pas opgebouwd nadat de eerste
  gestreamde entity-roots bestaan. Daardoor zijn naam, categorie/status, afstand
  en range direct na laden zichtbaar en niet pas na een verplaatsing. De
  ballonknop naast `A` zet uitsluitend deze editorweergave aan of uit en staat
  standaard aan; de game-output blijft ongewijzigd.

## Eerlijke blocker

Een Enemy kan niet als versla-objective aan een quest worden gekoppeld. De
producer `objective_defeat`, datatype `objective` en compiler/runtime-consumer
voor enemy-defeat-objectives ontbreken. Daarom toont de wizard exact deze
blokkade en maakt hij geen editor-only simulatie. NPC talk/giver/deliver,
Item/Resource collect en Portal reach gebruiken wel bestaande echte objectives.

## Bestaande content

Bestaande models, assemblies, spawnsets, links, catalogdefinities en handmatig
gebouwde componenten blijven leesbaar. De wizard hergebruikt bestaande singleton
componenten en maakt geen tweede assembly. Verwijderen ruimt het lokale pakket
en een eigen Portal-link op en behoudt gedeelde definities.

Er zijn geen database-reset, proof-content, serverstart, npm-test/check, smoke,
Playwright- of performancechecks uitgevoerd. Kevin voert de live acceptatie uit.

**Fase 1 implemented, awaiting Kevin acceptance**
