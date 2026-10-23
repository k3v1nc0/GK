# Visual Content Workbench W1

**Status:** accepted by Kevin  
**Datum:** 2026-10-21

## Opgeleverde route

De editor heeft naast `Nodes` een lichte, docked modus `Werkbank`. Selectie blijft de echte selectie in de bestaande Three.js-viewport. De Werkbank projecteert voor één geplaatst `model_entity` de keten:

`Wereldobject → Enemy-definitie → Loot Table → Loot-regels`

De linker selectie, viewport en rechter library gebruiken hetzelfde layout-resizermechanisme als de Nodes-weergave, met onafhankelijk opgeslagen Werkbankmaten. Beide verticale balken rond de viewport en de horizontale balk boven de onderste relatiestrook blijven versleepbaar; de resizeberekening laat panelen zonder aparte Werkbank-minimum- of maximummaat schalen.

Een gewoon geplaatst model toont `Maak Enemy`. Die actie gebruikt de bestaande viewport-first Visual Builder en maakt of hergebruikt `entity_assembly`, `enemy_component` en een bestaande of minimale nieuwe `enemy_archetype`. Het geselecteerde `model_entity` blijft de enige eigenaar van mesh en transform. Een bestaande Enemy opent direct met naam, model/iconbinding, Loot Table en een link naar de echte Stat Block-eigenaar.

De Visual Game Library toont ook de bestaande Asset Library rechtstreeks in de Werkbank. Assets worden uitsluitend door bestanden naar de library te slepen geïmporteerd; het oude losse importformulier wordt niet getoond. Een GLB kan vervolgens met de bestaande plaatsactie naar de echte viewport worden gebracht; daarna verschijnt voor dat geselecteerde model `Maak Enemy`. De tabs `Enemies` en `Loot Tables` lezen definities rechtstreeks uit de graph. Zoeken is begrensd tot veertig definitiekaarten; thumbnails laden lazy. Een Loot Table kan met `Koppel` of drag-and-drop op de Loot-slot worden gezet. De relatiestrook leest echte `loot_item_entry`, `loot_currency_entry` en `loot_table_entry`-childnodes en kan deze menselijke regels toevoegen en wijzigen.

## Hergebruikte contracten

- de bestaande viewportselectie en runtimefocus;
- de bestaande Asset Library, filters, plaatsactie en GLB-drag naar de viewport;
- de Visual Builder-mutatie voor `Maak Enemy`, inclusief stabiele canonical IDs en automatische modelassetbinding;
- `enemy_component.enemyRef` en `enemy_archetype.lootTableRef`;
- de bestaande Catalog Group/package-route voor Enemy- en Loot-definities;
- echte loot-childnodes via `lootEntry → loot_table.entries`;
- bestaande typed references, assets en thumbnails;
- semantische veldhulp voor zichtbare Workbenchvelden;
- graph restore, validation, history, Undo/Redo, Save Draft en publish;
- `Toon in nodes` als technische projectie van dezelfde graph.

De Werkbank heeft geen eigen contentstore, uploadscherm, assetregister, mesh of compiler/runtimepad. Alleen openen, selecteren, zoeken of kaarten bekijken muteert de graph niet. De laatst geselecteerde modelcontext wordt lokaal onthouden en bij refresh alleen hersteld wanneer die node nog bestaat.

## Bewuste W2/W3-grenzen

W1 bevat alleen Enemies en Loot Tables. Items, Resources, Recipes, Vendors, quests, dialogen, algemene cross-category drag-and-drop, window management en nieuwe runtime-AI blijven buiten deze fase. Health en damage zijn niet op de Enemy-kaart gedupliceerd; zij blijven eigendom van de gekoppelde Stat Block.

Microfase 3 is hiermee niet automatisch compleet. De bestaande onafhankelijke browser-, publish-, gameplay- en lifecycleacceptatie blijft nodig.

**Visual Content Workbench W1 accepted by Kevin.** Vervolg: `VISUAL-CONTENT-WORKBENCH-W2.md`.
