# GameBibleNode Access

Fase 5.2 houdt Kevin toegang tot de bestaande GameBibleNode-bestanden, maar maakt onderscheid tussen publieke leesroutes, browser-save en beschermde schrijfacties. Codex heeft de Fase 5.2 browser-save en security smoke server-side afgerond.

## Bronnen

De huidige repo bevat:

- `README/GameBibleNode.html`
- `README/GameBibleNode.json`
- `README/GameBibleNode.php`

`README/GameBibleNode.json` blijft de leidende Game Bible voor de nieuwe game. Concrete gamecontent mag niet in runtimecode worden overgenomen.

## Publieke leesroutes

Alleen deze routes mogen publiek leesbaar blijven:

- `/README/GameBibleNode.html`
- `/README/GameBibleNode.json`
- `/README/GameBibleNode.php`

De rest van de `README`-map blijft dicht. Apache moet dit server-side afdwingen met expliciete allow-routes en een deny voor overige `README`-paden.

## Beschermde save-flow

De voorkeursroute voor opslaan is:

- `POST /editor/game-bible-node/save`

Deze route vereist:

- editor-auth;
- `editor_admin`;
- POST-only;
- CSRF/Origin-check;
- geldige JSON-body;
- GameBibleNode JSON-contract;
- atomische write via tijdelijk bestand en rename;
- backup voor vervanging;
- lock tegen gelijktijdige writes;
- audit event `game_bible_node.save`;
- foutmeldingen zonder stacktrace of secrets.

De API-route is een engine-capability voor het opslaan van het GameBible contract. De route mag geen concrete gamecontent hard-coden.

## Browser-save vanuit GameBibleNode.html

De bestaande `README/GameBibleNode.html` mag bereikbaar blijven als standalone GameBible editor, maar de browser-save mag niet meer standaard naar een onbeschermde PHP-write gaan.

Fase 5.2 gebruikt daarom deze veilige bridge:

1. Apache serveert alleen `README/GameBibleNode.html` en `README/GameBibleNode.json` publiek leesbaar.
2. Apache injecteert de save-client `GET /editor/game-bible-node/save-client.js` in `GameBibleNode.html`.
3. De save-client vervangt de oude browserfunctie `saveData`.
4. De browser post met `credentials: same-origin` naar `POST /editor/game-bible-node/save`.
5. De save-client stuurt `X-GK-CSRF-Token` mee vanuit de runtime CSRF-cookie of meta-tag.
6. De API-route blijft de enige normale schrijfroute en controleert editor-auth, `editor_admin`, Origin, CSRF, JSON-contract, lock, backup, atomische write en audit.

Codex heeft server-side bevestigd dat browser-save naar de beschermde API-route post en niet meer naar `GameBibleNode.php`.

## Legacy PHP

`README/GameBibleNode.php` blijft alleen als tijdelijk legacy-pad voor de bestaande standalone GameBibleNode UI.

Deze PHP-route is niet de browser-default en niet de definitieve security-oplossing. Hij is gedepricieerd voor normale browser-saves en mag alleen schrijven wanneer Codex server-side bescherming activeert:

- `GK_GAMEBIBLE_LEGACY_SAVE_ENABLED=1` buiten Git;
- Apache Basic Auth, IP allowlist of gelijkwaardige server-side admin gate;
- optioneel `GK_GAMEBIBLE_LEGACY_SAVE_TOKEN` buiten Git;
- toegestane Origin via `GK_GAMEBIBLE_ALLOWED_ORIGIN`.

Als die server-side gate ontbreekt, moet PHP save falen met `403`. Een open publieke PHP-write is altijd een faseblokkade.

## Codex server-validatie

Codex heeft buiten Git bevestigd:

1. `/README/GameBibleNode.html` geeft `200`;
2. `/README/GameBibleNode.json` geeft `200`;
3. `/README/GameBibleNode.php` is bereikbaar maar geen open write;
4. andere README-bestanden blijven `403`;
5. publieke POST naar legacy PHP faalt;
6. publieke POST naar de save API faalt;
7. public smoke headers via Apache worden gestript;
8. browser-save post naar `POST /editor/game-bible-node/save`, niet naar `GameBibleNode.php`;
9. beveiligde `editor_admin` save werkt;
10. invalid JSON geeft `400`;
11. invalid contract JSON geeft `400`;
12. lock-test faalt veilig;
13. backup en audit werken;
14. `GameBibleNode.json` is na test exact hersteld.

Er is geen Fase 5.2 GameBibleNode save-flow blocker meer. De write-route blijft beschermd; een open publieke PHP-write blijft altijd een faseblokkade.
