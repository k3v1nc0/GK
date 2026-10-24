# ADR-001 - Eerst een speelbare slice

**Status:** voorgesteld, besluit nodig vóór F1. **Context:** oud F1-F5 in `README/fases/MMORPG-basis/` zetten canonical authoring, World Builder en actorplatform vóór de finale MMO-proef. `src/server/mmo-service.js`, `src/server/node03-runtime-service.js` en `src/server/node04-quest-runtime-service.js` leveren al deelpaden voor een vroege proef, maar met securitygaten. Zonder vroeg visueel bewijs groeit implementatierisico en is Kevins voortgang lastig te beoordelen.

**Besluit:** F1 beveiligt het bestaande spel, F2 levert een twee-account kill/loot/quest verticale slice uit bestaande published content, F3-6 vervangen de relevante authoring- en RPG-lagen, F7 certificeert een gesloten test. Geen nieuwe node-types vanaf start F2. De bestaande graph mag tot per-domein cutover nog writer zijn. Volledige UI Studio, guild, market en graphdrop horen niet bij deze basis.

**Alternatieven:** (A) oud 1->5: uniform canonical plan, maar eerste MMO-bewijs laat; (B) Claude 0->5: security eerder, maar nog veel onzichtbare basis vóór spelen; (C) direct alles herschrijven: te groot regressieoppervlak. V2 kiest een omkeerbare proof-first volgorde.

**Gevolgen:** tijdelijke legacycompatibiliteit kost testwerk. F2 mag geen nieuwe contentregel hardcoden of nieuwe graphsoort ontwerpen. F3-golden master gebruikt F2 als contract. Uitbreidingen krijgen eigen mijlpaal, geen stille fase-inflatie. **Toets:** F2-E3-T03 met Kevin-video, bots en crashproef. **Herzien als:** bestaande content niet veilig in een geisoleerde F2-fixture kan draaien; dan eerst een kleine contentfixture, niet het hele oude F1-contract.
