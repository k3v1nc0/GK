# Apache voor GK (sinds 2026-10-24)

Kevin meldde dat inloggen in de game vaak minuten duurde ("MMO verbinden mislukt", `waiting_for_socket`, `waiting_for_http_snapshot`). Oorzaken en wat er is veranderd.

## Wat er mis was

1. **Te weinig plekken.** Apache draaide met `mpm_prefork` en `MaxRequestWorkers 10`. In prefork houdt elke WebSocket, en elke open keep-alive-verbinding, een heel Apache-proces vast. Met twee spelvensters plus code-server en de editor waren de 10 plekken op. Een nieuwe WebSocket of snapshot wachtte dan in de rij tot er een vrijkwam (met `Timeout 300` kon dat 5 minuten duren). Met 50 spelers kan dat principieel niet.
2. **503 na een Node-herstart.** Lukte Apache één keer niet verbinden met Node (tijdens een herstart), dan markeerde hij de backend standaard 60 s als defect en weigerde hij alles met 503.
3. **"Connection reset"-fouten.** Apache hergebruikte backendverbindingen die Node na 5 s idle al had gesloten. Het verzoek mislukte dan (vandaag 103× in het gk-foutlog).
4. **Ongecomprimeerde JSON.** De spelersnapshot (met de hele wereld) is ~1,9 MB; JSON stond niet in de compressielijst.

## Wat er is veranderd (live, met Kevins akkoord)

- `php8.3-fpm` geïnstalleerd. PHP (phpMyAdmin en de bestanden op mc-node) draait nu via php-fpm (`a2enconf php8.3-fpm`, `proxy_fcgi`). De aangepaste PHP-limieten (512M, 120 s) staan ook in `/etc/php/8.3/fpm/php.ini`.
- `mpm_prefork` + `mod_php` → **`mpm_event`**. Instellingen staan in `/etc/apache2/mods-available/mpm_event.conf`: 4 processen × 64 threads, `MaxRequestWorkers 256`. Keep-alive kost in event geen worker meer.
- gk-vhost (`/etc/apache2/sites-available/gk-k3v1nc0.conf`):
  - `retry=0` op alle `ProxyPass`-regels (na een Node-herstart direct opnieuw proberen);
  - `ttl=4` op de http-regels (geen hergebruik van verbindingen die Node mogelijk al sloot);
  - `AddOutputFilterByType DEFLATE application/json` (snapshot 1,9 MB → ~226 KB).
- Node: `server.keepAliveTimeout = 65000` en `headersTimeout = 66000`, plus ETag/304 voor statische bestanden. Code die opnieuw gedownload moest worden, staat nu op `no-cache` in plaats van `no-store`.
- Client:
  - een WebSocket-poging die na 4 s niet open is, wordt opnieuw gedaan;
  - geen volledige sessie-herlaad meer bij elke vensterwissel.

Controle na de omzetting (lokaal via Apache):
- phpMyAdmin 200;
- `/api/health` 200 in 45 ms;
- code-server bereikbaar;
- geheugen 4 Apache-processen samen 61 MB (was 11 × 13 MB voor 10 plekken), php-fpm 62 MB.

## `.git` afgeschermd (alle sites)

Op Kevins verzoek levert Apache geen `.git`-mappen meer uit, op geen enkele site. Aanleiding: `https://mc-node.duckdns.org/.git/config` was leesbaar. De regel staat in `/etc/apache2/conf-available/block-git.conf` (`a2enconf block-git`, een `DirectoryMatch` met `Require all denied`). Hij raakt alleen bestanden van schijf, dus geproxyde sites (game, code-server) merken er niets van. Controle: mc-node `.git/config` geeft 403, en de site, phpMyAdmin, de game en code-server werken. Terugdraaien: `a2disconf block-git && apache2ctl graceful`.

## Terugdraaien

Back-up van de oude config: `/root/apache2-backup-20261024-202641.tgz` (heel `/etc/apache2`), en de vhost los in `/root/gk-k3v1nc0.conf.bak-*`.

```sh
a2dismod mpm_event proxy_fcgi && a2disconf php8.3-fpm && a2enmod mpm_prefork php8.3
apache2ctl configtest && systemctl restart apache2
```

Voor de vhost: zet de back-up terug naar `/etc/apache2/sites-available/gk-k3v1nc0.conf`, dan `apache2ctl configtest && apache2ctl graceful`.

Let op bij `sed -i` op `sites-enabled`: dat vervangt de symlink door een los bestand. Bewerk altijd het bestand in `sites-available`.
