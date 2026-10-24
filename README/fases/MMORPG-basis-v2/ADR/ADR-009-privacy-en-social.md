# ADR-009 - Kleine social scope met privacyreview

**Status:** voorgesteld. **Context:** migratie 008 heeft party-tabellen; er zijn geen gevonden chat-/guildtabellen op main. `player_connection_events` in migratie 003 bevat account-/sessierelaties. Een echte gesloten test verwerkt persoonsgegevens en gebruikersberichten.

**Besluit:** F7 levert local/party chat, partij van max vijf, block/report/mute en admin-audit; global chat, vrienden en guilds blijven buiten eerste basis. Voor externe testers bestaat per datacategorie een doel, grondslag, retentie en rechtenprocedure (export/verwijderverzoek), getoetst door een deskundige. Gesloten test voorlopig 18+ als scopekeuze, niet als vervanging van naleving. Geen universele 30-dagen-grace of ononderbouwde bewaartermijn.

**Alternatieven:** onbeperkte social vóór moderatie (misbruikrisico), helemaal geen social (zwak MMO-bewijs), guilds direct (meer rollen/abuse). **Gevolgen:** moderatorcapaciteit en privacybeleid zijn harde instap voor externe test. Zie [AVG-tekst](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679) en [Nederlandse toezichthouder over toestemming/kinderen](https://autoriteitpersoonsgegevens.nl/themas/basis-avg/avg-algemeen/grondslag-toestemming); de concrete toepasselijkheid vereist review. **Toets:** F7-E1-T01..T04. **Herzien als:** doelgroep of public-chatplan verandert.
