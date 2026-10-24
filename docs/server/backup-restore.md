# Backup en restore

Gebruik altijd expliciete paden; de scripts kiezen bewust geen productiebron of bestaand doel.

```sh
node scripts/backup-db.js --database /privaat/pad/database.sqlite --assets /privaat/pad/assets --target /privaat/pad/backups/2026-10-23 --source-sha <commit>
node scripts/restore-db.js --backup /privaat/pad/backups/2026-10-23 --target /lege/restoremap
```

De backup gebruikt SQLite online backup, kopieert assets en schrijft `manifest.json` met bron-SHA, migratiehead, DB-hash, published build en assethashes. Restore weigert een niet-lege of publiek geserveerde doelmap. Een restore is alleen geslaagd bij `PRAGMA integrity_check=ok`, gelijke tellingen voor `users`, `player_*` en `editor_nodes`, een gelijke published contenthash en geldige assethashes.

Voor iedere operationele backup moet buiten de webroot en buiten dezelfde host worden vastgelegd:

- off-site locatie/provider en object-ID;
- encryptie- en toegangsbeheerder;
- retentiebeleid;
- laatste restore-oefening met datum, release-SHA, manifesthash en uitkomst.

Fase 01 gebruikt uitsluitend tijdelijke fixtures. Er is geen productiebackup of off-site upload uitgevoerd en er zijn geen productiecredentials gebruikt. Bij een incompatibele rollback: onderhoudsvenster starten, schrijfverkeer stoppen, de releasepointer terugzetten en DB plus assets uit dezelfde geverifieerde backup samen herstellen.
