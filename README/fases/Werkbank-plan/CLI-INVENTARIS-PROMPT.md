# Prompt voor Codex / Claude CLI op Kevins server: inventaris vóór het Werkbank-plan

Plak alles onder de streep in de CLI op de server (map met de GK-repo, `main` bijgewerkt).

---

Je werkt in de GK-repo op Kevins server. Dit is een **alleen-lezen inventaris**. Je verandert geen code, geen database, geen bestanden behalve het rapport. Je start geen eigen servers en gebruikt geen andere poort. De game draait al op `localhost:3001`; daar alleen kijken (GET), nooit iets opslaan of publiceren. Werk zuinig: geen uitgebreide testrondes.

## Doel

Er komt een nieuw plan waarin de Nodes-tab, de Tools/Authoring-pagina en `canoniek.html` verdwijnen. Alles moet naar `Werkbank | Instellingen`. Het plan is gemaakt door alleen de code te lezen. Jij kijkt naar wat **echt op de server staat**, zodat niets dat nu werkt via een node stilletjes verdwijnt.

## Stappen

1. **Database vinden.** Pad staat in `DATABASE_PATH` of standaard `./storage/gk-real-node-editor.sqlite`. Open hem **alleen-lezen** (`sqlite3 -readonly` of `new Database(pad, { readonly: true })`). Lees niet de productie-DB als schrijfbare verbinding.
2. **Nodes die echt gebruikt worden.** Uit `editor_nodes` (en `editor_node_edges`, `editor_graph_meta`):
   - per nodesoort: aantal, in welke zone/graph, en of hij verbonden is (edges) met iets dat gepubliceerd wordt;
   - per nodesoort: welke velden een **andere waarde dan de standaard** hebben (standaarden staan in `apps/web/public/shared/node-types.js`). Dat zijn de instellingen die Kevin echt heeft gezet;
   - velden of nodesoorten in de DB die **niet** in `node-types.js` staan (oude/onbekende soorten).
3. **Gepubliceerde wereld.** `published_world_state`, `draft_world_state`, `publish_history`: welke zones bestaan er (start, test, ...), hoeveel entities per zone, en welke onderdelen van de gepubliceerde wereld uit nodes komen.
4. **Canoniek.** `authoring_documents` (per soort aantal, gearchiveerd ja/nee), `authoring_cutover` (welk domein is al canonical), `authoring_builds`, `authoring_release`.
5. **Dingen die niet in een node of document zitten maar wel instellingen zijn.** Kijk minstens naar `game_hud_layout_defaults`, `editor_user_layouts`, `asset_library`, `content_id_aliases`, en naar `.env`/omgevingsvariabelen en configbestanden op de server (alleen de **namen** van instellingen noemen, **nooit** waarden van geheimen, wachtwoorden of tokens).
6. **Wat werkt nu in de game via een node?** Loop de gepubliceerde wereld na en maak een lijst van alles wat een speler nu kan zien of doen (vijand, grondstof, pickup, NPC, vendor, quest, dialoog, portal, muziek, minimap, HUD-onderdelen, sneltoetsen, ...) en uit welke nodesoort dat komt.
7. **Markeer** alles uit stap 5 en 6 dat **niet in de repo-code** staat maar wel in DB/config als **ALLEEN SERVER**. Het vergelijken met het plan doet Claude daarna; dat hoef jij niet te doen.

## Rapport

Schrijf één bestand: `README/fases/Werkbank-plan/evidence/INVENTARIS-SERVER.md` (map aanmaken mag). Bovenaan in gewone taal, kort, voor Kevin:
- hoeveel nodes en soorten er echt gebruikt worden;
- de nodesoorten met eigen waarden (welke velden Kevin echt heeft ingesteld);
- de lijst **ALLEEN SERVER**;
- wat een speler nu kan doen en uit welke node dat komt.
Daaronder de ruwe tabellen. Geen geheimen in het rapport.

Commit niets. Zeg aan het eind alleen waar het rapport staat; Kevin geeft het aan Claude, die het plan dan aanvult.
