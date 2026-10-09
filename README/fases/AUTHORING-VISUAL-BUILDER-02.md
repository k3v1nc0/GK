# AUTHORING VISUAL BUILDER - Microfase 2

**Status:** implemented, awaiting Kevin acceptance  
**Datum:** 2026-10-07

## Contextwerkbank

Een enkel geselecteerd `model_entity` bestuurt nu direct `aside.tools`. De
werkbank toont de menselijke naam, wereldrol, zone, asset- en transformstatus,
volledigheid, componenten, gedeelde definitie en quest-/dialoogbacklinks.
`Bewerken in Visual Builder` is de normale heropenroute. `+ Maken` blijft als
contextuele compatibiliteitsroute bestaan.

Een echte leegklik of Escape wist de objectselectie en opent het
Bouw-overzicht. Camera-orbit, viewportdrag en een actieve gizmo blijven door de
bestaande pointerdrempels buiten deze leegklikroute.

## Bouw-overzicht

Het overzicht toont de huidige zonebasis, omgeving, portals/links en geplaatste
objecten; daarnaast Wereld/Zones, Quests/Dialogen, Catalogus/Definities,
Game/UI en aantallen per geplaatste gameplayrol. Een menselijke zoekingang opent
bestaande content rechtstreeks. Ontbrekende Zone Output, omgeving, Campaign of
Catalog Group wordt als waarschuwing getoond.

De bestaande `renderWorldZoneHub`, `renderQuestDialogueWorkspace`,
`renderCatalogHub` en `renderSettingsUiHub` blijven de editors. Overzichtskaarten
openen die renderers met de juiste bestaande workspace; er is geen tweede opslag
of parallelle editor toegevoegd.

## Questcontract

Werkelijk aangeboden relaties:

- NPC: spreker, questgever/inleverpunt, praatdoel en afleverdoel;
- Resource en fysiek Item/Pickup: collect en deliver;
- Portal: reach/reisdoel;
- Enemy: zichtbaar geblokkeerd omdat `objective_defeat` ontbreekt;
- Crafting Station, Vendor en Market Access: geen questrol zonder contract.

Quest, stap en dialoog worden menselijk gekozen. De builder leest een bestaande
relatie terug, maakt of hergebruikt één `quest_target_binding`, maakt de gekozen
ondersteunde objective in de gekozen bestaande stap en koppelt een startdialoog
met de echte `dialogueDef -> quest.startDialogue`-edge. Een questgever waarschuwt
wanneer de gekozen dialoog nog geen `accept_quest`-keuze voor die quest bevat.
Wijzigen verwijdert alleen de eerder door deze keuze beheerde relatie; andere
relaties van hetzelfde object blijven behouden. Een ongebruikte target wordt
opgeruimd. Quest- en dialoogschermen tonen wederzijdse wereldobjectbacklinks.

De blocker blijft exact: node-type/producer `objective_defeat`, compilatie naar
een record met `objectiveType: "defeat"` en de defeat-consumer in de
quest-runtime ontbreken. Het algemene poortdatatype `objective` bestaat wel en
wordt door talk, collect, deliver en reach gebruikt.

## Nodes en ordening

`Toon in nodes` projecteert dezelfde persistente nodes van het lokale pakket:
model en definities, componenten, assembly, Zone Output en gekoppelde
quest/objective/dialoog/serviceonderdelen. De projectie kan relevante nodes uit
hun bestaande Groups samen tonen zonder nodes te kopiëren.

`Orden dit pakket` gebruikt vijf vaste betekenisvolle kolommen. `Orden deze
workspace` legt de objectpakketten in niet-overlappende rijen. Beide acties zijn
expliciet en undoable; er draait geen continue auto-layout. Bestaande edges
blijven echt en krijgen een zichtbaar onderscheid voor flow, typed reference,
package en output.

Er is geen proof-content gemaakt, geen database gewijzigd en geen server, npm
test/check, smoke, Playwright of performancecheck gestart.

**Microfase 2 implemented, awaiting Kevin acceptance**
