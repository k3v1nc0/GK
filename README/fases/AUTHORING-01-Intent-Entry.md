# AUTHORING-01 - Duidelijk beginpunt en contextuele authoringroutes

## Doel

De editor start niet langer als technische Node Library, maar met een intent-first ingang waarin Kevin direct kiest wat hij wil maken.

## Gewijzigde editorroute

- `+ Maken` opent vijf duidelijke routes.
- De gekozen, gevalideerde route stuurt de contextuele `Meer nodes voor <route>`-bibliotheek.
- Bestaande werkruimtes blijven navigeerbaar via de routepanelen en openen bestaande Groups zonder graphdata aan te maken.
- De routekeuze wordt lokaal in de browser onthouden via `localStorage`.
- De laatst geopende Group wordt na het laden van de graph alleen hersteld wanneer die Group nog bestaat; anders valt de editor terug naar root.

## Classificaties

De editor gebruikt een kleine classificatiemodule voor bestaande node-types:

- `viewport_tool`
- `contextual_behavior`
- `logic_flow`
- `data_reference`
- `managed_infrastructure`
- `hidden_future`

Belangrijk:

- `managed_infrastructure` omvat onder meer Game Output, World Assembly, group input/output, registries, technische adapters en package/output-plumbing.
- Deze infrastructuurnodes blijven inspecteerbaar in de graph/system-overzichten, maar verdwijnen uit de normale `+ Maken`-keuzes.
- Geen node-schema's, databasevelden, runtime-mapping of publishroutes zijn gewijzigd.

## Buiten scope

- geen NPC-, enemy-, chest- of interactable-recepten;
- geen automatische questketens;
- geen quest auto-layout;
- geen generated canonical IDs;
- geen structured JSON/referenceList editors;
- geen runtime mapping van Health/Mana/Armor;
- geen verwijdering van hardcoded runtimefallbacks;
- geen nieuwe nodefamilies;
- geen rootgraph-herindeling;
- geen databasewijziging;
- geen compiler- of publishwijziging;
- geen algemene UI-redesign;
- geen tweede editor;
- geen placeholders of "komt later"-knoppen.

## Handmatige acceptatie voor Kevin

1. Open de editor.
2. Controleer dat je niet meer begint in een open technische node-muur.
3. Open `+ Maken` en bevestig dat je precies vijf routes ziet.
4. Kies `Wereld / Zone` en open een bestaande Zone Canvas.
5. Kies `Object of personage` en kom uit bij de 3D-viewport of Assets.
6. Kies `Quest / Dialoog` en open een bestaande Campaigns Group.
7. Kies `Item / Ability / Stat` en open een Catalog Group.
8. Kies `Game-instellingen / UI` en open Player Rules of UI.
9. Open `Meer nodes voor <route>` en controleer dat elke route andere relevante nodes toont.
10. Navigeer alleen tussen routes en controleer dat er geen nodes of edges zijn toegevoegd, verwijderd of aangepast.
11. Controleer dat graph, viewport, `Save Draft` en `Save To Game` blijven werken zoals voorheen.
12. Controleer op mobiel dat de knoppen leesbaar blijven en tekst niet overlapt.

## Status

implemented, awaiting Kevin re-acceptance
