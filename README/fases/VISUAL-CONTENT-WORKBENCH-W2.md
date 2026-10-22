# Visual Content Workbench W2

**Status:** implemented, awaiting Kevin acceptance  
**Datum:** 2026-10-21  
**Basis:** W1 (`f9635f4`, accepted by Kevin)

## Opgeleverde route

De Werkbank is uitgebreid tot één Visual Game Content Library voor normale Catalog-definities. Alles blijft een projectie van de echte graph: er is geen tweede contentdatabase, geen tweede cataloguscontract en geen parallelle runtime.

- **Werkbankmodi** (links, naast de titel `Werkbank`): `Wereld` toont de echte W1-viewport; `Contentoverzicht` gebruikt de middenruimte voor vaste kolommen met kaarten. `+ Nieuwe definitie` staat bovenaan het linkerpaneel.
- **Bibliotheek** (rechts): de echte Asset Library en de categorieën Alles, NPC's, Enemies, Resources, Items, Recipes, Vendor Catalogs, Abilities, Stats, Currencies en Loot Tables (met aantallen). Iedere kaart toont thumbnail/icoon (of het icoon van een gekoppeld item), menselijke naam, type, maximaal drie eigenschappen, relatieaantallen, `Gebruikt`/`Ongebruikt` en waarschuwingen voor ontbrekende assets, ontbrekende references en definities die niet in een package zitten. Kaarten zijn compact en staan naast elkaar zodra de bibliotheek breder wordt gesleept. Zoeken is begrensd tot veertig kaarten; afbeeldingen laden lazy. `Toon in nodes` staat alleen in het linkerpaneel, niet op de kaarten.
- **Definitie kiezen**: een kaart wordt de Werkbankselectie. Links staan naam, eigenschappen, assets en de acties `Bewerk`, `Dupliceer` (alleen voor types zonder eigen regels), `Verwijder`, `Toon in nodes` en `Waar gebruikt`. Het midden schakelt naar het Contentoverzicht met de relaties; onderaan staat de flow van dat type; rechts blijft de bibliotheek. Een klik op een model in de viewport (Wereld) of `← Terug` brengt de W1-modelweergave terug.
- **Contentoverzicht**: `Economie: Resources → Items & Currencies → Recipes → Vendors` en `Wezens en gevecht: Enemies & NPC's → Abilities & Stats → Loot Tables`. Selecteren highlight uitsluitend gerelateerde kaarten (rest gedimd) en tekent maximaal veertig korte verbindingen: doorgetrokken = actief in de game, gestreept = nog niet actief. Keuze `Alleen directe relaties`, `Alle relaties` (maximaal drie stappen, begrensd) of `Waar gebruikt` (inclusief wereldobjecten/quests). Kaarten zonder relatie blijven zichtbaar met `Los`. Geen poorten, geen force-layout, geen naam- of tagkoppelingen.
- **Nieuwe definitie**: soort → menselijke naam → optionele assets → alleen belangrijke waarden → Collectie. De echte node wordt met de bestaande managed Catalog-route in een bestaande Catalog Group gemaakt; IDs en package/registry-verbindingen volgen automatisch. Bij één Collectie wordt die gebruikt; bij meerdere moet Kevin een Collectie (menselijke naam) kiezen en wordt de laatste onthouden. Zonder Collectie verschijnt alleen een zichtbare knop `Maak Collectie`. Een dubbele naam in dezelfde Collectie wordt gemeld met `Open bestaande`.
- **Inline bewerken**: belangrijkste velden direct, overige normale velden onder `Meer eigenschappen`, semantische veldhulp per veld, `Nog niet actief` bij velden die gecompileerd maar niet door de runtime gelezen worden. JSON/formules blijven via `Toon in nodes`. Opslaan is één restore met één history-entry en houdt de nodetitel gelijk aan de menselijke naam.
- **Asset binding**: alleen de assetvelden die het schema van dat type heeft (`iconAssetId`, `modelAssetId`, `worldModelAssetId`, `depletedModelAssetId`, `previewModelAssetId`). Op Kevins verzoek heeft `recipe_definition` er twee echte schemavelden bij gekregen: `iconAssetId` (afbeelding) en `previewModelAssetId` (GLB), zodat een recipe een eigen thumbnail heeft; de game-runtime gebruikt ze (nog) niet. Kiezen via een thumbnailpicker of door een asset uit de tab Assets op het vak te slepen; `Assetgebruik` opent het bestaande assetvenster (`/api/assets/:id/usage`).

## Aanvulling: Wereldobject → Resource

Op Kevins verzoek als aanvulling op W2: bij een geselecteerd geplaatst model staat naast `Maak Enemy` nu `Maak Resource`. Die gebruikt dezelfde Visual Builder-route als W1 (`visualBuilderBegin`/`visualBuilderCommit`, rol `resource`): bestaande Resource-definitie kiezen, of een nieuwe maken met opbrengst-item (bestaand of nieuw), naam in de wereld, opbrengst per oogst en respawntijd. Het geplaatste model blijft de enige mesh en wordt bij een nieuwe Resource het wereldmodel. Een model met Resource toont `Open Resource` en onderaan `Wereldobject → Resource-definitie → Opbrengst`, waar een Item (`yieldItemRefs`) of Loot Table (`yieldLootTableRef`) op gesleept kan worden. Een Loot Table hangt dus altijd aan een definitie (Enemy of Resource), nooit los aan een wereldobject.

## Flows en drag-and-drop (echte graphmutaties)

| Doel | Slepen | Resultaat |
| --- | --- | --- |
| Recipe → Ingrediënten | Item / Currency | inline formulier (aantal, verbruiken) → één echte `recipe_ingredient` (`kind=item` of `kind=currency`) |
| Recipe → Outputs | Item / Currency | inline formulier (aantal) → regel in `outputItems` / `outputCurrencies`; ↑/↓ wijzigt de HUD-volgorde |
| Vendor → Offers | Item | inline formulier (handel, currency, prijs, voorraad) → één echte `vendor_offer` |
| Vendor-offer | Currency | alleen de prijs-currency; bij `Verkoopt en koopt` kiest Kevin verkoop, inkoop of beide |
| Loot Table → Drops | Item / Currency / Loot Table | inline formulier (minimum, maximum, kans, altijd) → één echte `loot_item_entry` / `loot_currency_entry` / `loot_table_entry` |
| Resource → Opbrengst | Item / Loot Table | `yieldItemRefs` uitgebreid of `yieldLootTableRef` gezet |
| Enemy → Loot Table | Loot Table | `lootTableRef` gezet |
| Assetvak | asset uit Assets | assetveld gezet |

Een Resource wordt nooit stil als Item gebruikt: op een item-zone verschijnt *"Een Resource-definitie is geen recipe-item. Kies het item dat deze resource oplevert."*, met knoppen voor de echte `yieldItemRefs` van die resource. Een tweede regel voor hetzelfde item/dezelfde currency geeft eerst een waarschuwing met `Bestaand offer bewerken` / `Bestaande regel bewerken`. Drops op een zone die het type niet accepteert lichten niet op.

Verwijderen toont eerst een menselijke waarschuwing met alle gebruikers (inclusief recipe-outputs en Stat Block-regels die de oude usagecheck niet ziet) en loopt daarna via de bestaande `deleteManagedNode` met zijn eigen bevestiging; eigen regels gaan mee.

## Hergebruikte contracten

- managed Catalog-route: `commitManagedDraft`, `commitCatalogChildEntryDraft`, `deleteManagedNode`, `CATALOG_CHILD_EDITOR_SPECS`, `ensureCatalogGroupPackage`;
- `patchValues` (PATCH values) en `restoreGraphObject` voor één history-entry per wijziging; Undo/Redo, validation, Save Draft en publish ongewijzigd;
- typed `buildReferencePickerField`, `normalizeRecipeGrantList`, semantische veldhulp, symbol/alias-resolutie, Asset Library, thumbnails, assetvenster en `/api/assets/:id/usage`;
- W1: viewportselectie, Enemy → Loot-route (`Gebruik voor model`, `Koppel`, Loot-slot), `Toon in nodes`, layoutmaten en resizers.

Nieuwe optie `preserveEditorContext` op de drie managed mutaties: Werkbankwijzigingen laten de huidige zone en viewportselectie staan, zodat een later geplaatst model nooit in een Catalog Group belandt. Zonder die optie werkt de Catalog-hub exact als voorheen.

`content-workbench.js` bevat de declaratieve specificatie per type en een lichte afgeleide index (relaties, gebruik, ontbrekende references), alleen herbouwd wanneer de graph verandert. Het leest uitsluitend getypte schemavelden, child-edges en bewezen JSON-referenties (recipe-outputs, Stat Block-regels, startgrants).

## Eerlijke schema- en runtimegaten (niet nagebootst)

1. NPC-definities hebben geen abilities, Stat Block of loot in het schema; die relaties worden niet getoond.
2. Enemy → abilities bestaat alleen via Combat Profile; de runtime leest Combat Profiles niet → `Nog niet actief`.
3. Geneste Loot Tables worden gecompileerd maar de runtime kent hun drops niet toe → `Nog niet actief`.
4. Loot-runtime (aangepast op Kevins verzoek na W2-oplevering): elke regel gooit apart met een echte kans (`altijd` valt altijd) en een willekeurig aantal tussen minimum en maximum (0 = niets). Weight, roll mode/count, pity en ownership worden nog niet gelezen.
5. Vendor: max stock, restock en bind-on-purchase, en alle catalogusinstellingen (refresh, buyback, sell allowed, stock scope) worden niet gelezen. Lege offer-currency valt in de runtime terug op de vendorvaluta van het item of `currency.gold`; de Werkbank toont dat als `(standaard)` en vraagt bij nieuwe offers een expliciete currency.
6. Recipe: ingrediënten op item-tags werken niet in de runtime (alleen-lezen `Nog niet actief`); batch, consume timing, cancel, success, tradability en visible-when-locked worden niet gelezen; `outputActions` (rewardEntry-poort) wordt gecompileerd maar niet uitgekeerd en wordt niet getoond. `stationType` is een identity-veld en blijft via Nodes; de Werkbank toont alleen bij hoeveel crafting stations de recipe beschikbaar is.
7. Volgorde van ingrediënten, offers en lootregels wordt niet bewaard: edges komen na herladen gesorteerd op tijd/id terug. Daarom geen herschikken voor die regels; recipe-outputs (array) zijn wel herschikbaar.
8. Iconen van items, currencies, abilities, enemies, NPC's en resources worden in de game-HUD niet gebruikt (`Nog niet in game`); NPC-modelasset en resource-`depletedModelAssetId` evenmin.
9. Stat-definities: value type, minimum, maximum en default worden niet gelezen; waarden komen uitsluitend uit Stat Block-regels (JSON, beheer via Nodes).
10. Ability: alleen bereik (basisaanval en oogst-abilities) en damage formula (basisaanval) worden gelezen; cooldown, cast time, type en kosten niet.
11. Bestaande bevinding buiten W2: de oude Catalog-hub (`commitManagedDraft`/`commitCatalogChildEntryDraft`) zet bij bewerken secundaire identity-velden (bijv. recipe `stationType`, ingrediënt `alternativesGroup`) terug naar hun standaard. De Werkbank gebruikt patch-semantiek en heeft hier geen last van; de hub is niet aangepast.

## Gewijzigde bestanden

- `apps/web/public/editor/content-workbench.js` (nieuw)
- `apps/web/public/editor/editor.js`
- `apps/web/public/editor/index.html`
- `apps/web/public/editor/styles.css`
- `tests/content-workbench-contract.test.js` (nieuw, read-only contractcontrole)
- `README/fases/VISUAL-CONTENT-WORKBENCH-W1.md` (status `accepted by Kevin`)

## Bewust W3 of later

Queststoryboard, dialoogflow, objectives/rewards, NPC-queststart, wereldplaatsingshighlight voor alle definities, nieuwe spawngroepen, crafting-station- en vendor-objectplaatsing, market access, nieuwe runtime-AI, `objective_defeat`, branch/join/parallel, window manager, het bewerken van Stat Block-regels en het herstellen van de runtimegaten hierboven.

**Visual Content Workbench W2 implemented, awaiting Kevin acceptance.**
