<?php
declare(strict_types=1);

require_once __DIR__ . '/GameBibleNode.auth.php';

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function gkb_save_fail(int $status, string $message): void {
    http_response_code($status);
    echo $message;
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    gkb_save_fail(405, 'Alleen POST toegestaan');
}

if (gkb_env('GK_GAMEBIBLE_LEGACY_SAVE_ENABLED') !== '1') {
    gkb_save_fail(403, 'Opslaan is niet geactiveerd');
}

if (!gkb_same_origin()) {
    gkb_save_fail(403, 'Origin niet toegestaan');
}

gkb_bootstrap_session();

if (!gkb_is_authenticated()) {
    gkb_save_fail(401, 'Login vereist');
}

session_write_close();

$data = file_get_contents('php://input');
if ($data === false || $data === '') {
    gkb_save_fail(400, 'Geen data ontvangen');
}

$decoded = json_decode($data, true);
if (!is_array($decoded) || json_last_error() !== JSON_ERROR_NONE) {
    gkb_save_fail(400, 'Ongeldige JSON');
}

if (!isset($decoded['schema']) || !is_string($decoded['schema']) || !isset($decoded['nodes']) || !is_array($decoded['nodes'])) {
    gkb_save_fail(400, 'GameBibleNode contract ongeldig');
}

$target = gkb_env('GK_GAMEBIBLE_JSON_PATH', __DIR__ . '/GameBibleNode.json');
$payload = json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
if ($payload === false) {
    gkb_save_fail(500, 'JSON kan niet worden geschreven');
}

$tmp = tempnam(dirname($target), '.GameBibleNode.json.');
if ($tmp === false) {
    gkb_save_fail(500, 'Tijdelijk bestand kan niet worden gemaakt');
}

$tmpHandle = fopen($tmp, 'wb');
if ($tmpHandle === false) {
    @unlink($tmp);
    gkb_save_fail(500, 'Tijdelijk bestand kan niet worden geopend');
}

$written = fwrite($tmpHandle, $payload . PHP_EOL);
if ($written === false || $written < strlen($payload) + 1) {
    fclose($tmpHandle);
    @unlink($tmp);
    gkb_save_fail(500, 'Tijdelijk bestand is onvolledig');
}

fflush($tmpHandle);
if (function_exists('fsync')) {
    fsync($tmpHandle);
}
fclose($tmpHandle);

if (!rename($tmp, $target)) {
    @unlink($tmp);
    gkb_save_fail(500, 'Atomische vervanging mislukt');
}

echo 'Success';
