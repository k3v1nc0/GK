# GameBibleNode Access

Fase 5.1 houdt Kevin toegang tot de bestaande GameBibleNode-bestanden, maar maakt onderscheid tussen publieke leesroutes en beschermde schrijfacties.

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

## Legacy PHP

`README/GameBibleNode.php` blijft alleen als tijdelijk legacy-pad voor de bestaande standalone GameBibleNode UI.

Deze PHP-route is niet de definitieve security-oplossing. Hij mag alleen schrijven wanneer Codex server-side bescherming activeert:

- `GK_GAMEBIBLE_LEGACY_SAVE_ENABLED=1` buiten Git;
- Apache Basic Auth, IP allowlist of gelijkwaardige server-side admin gate;
- optioneel `GK_GAMEBIBLE_LEGACY_SAVE_TOKEN` buiten Git;
- toegestane Origin via `GK_GAMEBIBLE_ALLOWED_ORIGIN`.

Als die server-side gate ontbreekt, moet PHP save falen met `403`.

## Codex server-gate

Codex moet buiten Git bevestigen:

1. alleen de drie GameBibleNode routes zijn bereikbaar;
2. andere README-bestanden blijven `403`;
3. publieke GET op HTML/JSON werkt;
4. save via API vereist editor-admin;
5. legacy PHP POST faalt zonder server-side auth;
6. legacy PHP POST werkt alleen met buiten-Git auth/token;
7. save maakt backup, lock, auditregel en atomische vervanging;
8. browser-save vanuit GameBibleNode blijft bruikbaar voor Kevin zonder publieke write open te zetten.
