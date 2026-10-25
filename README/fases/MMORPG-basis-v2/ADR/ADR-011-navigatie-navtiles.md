# ADR-011 - Vijandpaden met eigen navtiles (geen Recast)

**Status:** aangenomen in Fase 05 (eerste stuk). **Context:** F5-E1-T03 vraagt looppaden voor vijanden die dezelfde obstakels respecteren als spelers. Recast/Detour (WASM) zou een nieuwe dependency, een bakestap en een tweede botsingswaarheid naast `movement-kernel.js` betekenen. De server moet op een oude laptop (Pentium 4417U) draaien.

**Besluit:** eigen raster van 0,5 m per 64 m Cell (128 x 128 tegels, 1 byte per tegel), lui berekend uit precies dezelfde data als de spelerbeweging: walkability-index (blockers, oppervlakken, walkables), vaste obstakels (solids) en de grondgrens, met de straal van de vijand. Per Cell wordt eerst gefilterd welke vormen in de buurt liggen, zodat één tegelcheck goedkoop blijft. A* met 8 richtingen, zonder hoeken af te snijden, met een budget (max 4000 knopen per zoekopdracht, max 4 zoekopdrachten per AI-stap van 100 ms) en daarna inkorten met vrije lijnen. De uiteindelijke stap gaat altijd door `resolveMovement`, dus een vijand loopt nooit door een muur, ook als een route niet perfect is. Hash per Cell (sha256 van de tegels) bewijst determinisme.

**Alternatieven:** Recast (beter voor hoogteverschillen en grote werelden, maar dependency + bakestap); alleen rechtdoor lopen met glijden (te dom bij muren); vooraf bakken bij publish (sneller in de tick, maar grotere builds en een extra waarheid).

**Gevolgen:** geen hoogteverschillen/bruggen-op-hoogte in paden (de wereld is 2D + walkables); paden worden opnieuw berekend als de gepubliceerde wereld wijzigt (cache leeg). Geheugen begrensd tot 96 Cells per vijandstraal.

**Toets:** `tests/actors-f5.test.js` (zelfde hash, route om een muur), `scripts/spike-f5.js` (tijd per Cell op de echte wereld). **Herzien als:** een Cell bakken op Kevins server > 50 ms kost, of vijanden in de praktijk vastlopen op hoogte.
