<?php
// GameBibleNode.php
// Legacy save endpoint for the standalone GameBibleNode editor.
// Preferred long-term save path: editor-auth protected API route /editor/game-bible-node/save.

header('Content-Type: text/plain; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function fail_safe(int $status, string $message): void {
    http_response_code($status);
    echo $message;
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail_safe(400, 'Geen data ontvangen');
}

if (getenv('GK_GAMEBIBLE_LEGACY_SAVE_ENABLED') !== '1') {
    fail_safe(403, 'Opslaan is niet geactiveerd');
}

$allowedOrigin = getenv('GK_GAMEBIBLE_ALLOWED_ORIGIN') ?: '';
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($allowedOrigin !== '' && $origin !== $allowedOrigin) {
    fail_safe(403, 'Origin niet toegestaan');
}

$remoteUser = $_SERVER['REMOTE_USER'] ?? '';
$expectedToken = getenv('GK_GAMEBIBLE_LEGACY_SAVE_TOKEN') ?: '';
$receivedToken = $_SERVER['HTTP_X_GK_GAMEBIBLE_SAVE_TOKEN'] ?? '';

if ($remoteUser === '' && ($expectedToken === '' || !hash_equals($expectedToken, $receivedToken))) {
    fail_safe(403, 'Editor authorisatie vereist');
}

$data = file_get_contents('php://input');
if (!$data) {
    fail_safe(400, 'Geen data ontvangen');
}

$decoded = json_decode($data, true);
if (!is_array($decoded) || json_last_error() !== JSON_ERROR_NONE) {
    fail_safe(400, 'Ongeldige JSON');
}

if (!isset($decoded['schema']) || !is_string($decoded['schema']) || !isset($decoded['nodes']) || !is_array($decoded['nodes'])) {
    fail_safe(400, 'GameBibleNode contract ongeldig');
}

$target = __DIR__ . '/GameBibleNode.json';
$backupDir = __DIR__ . '/.backups';
$timestamp = gmdate('Ymd\THis\Z');
$backup = $backupDir . '/GameBibleNode.json.' . $timestamp . '.bak';
$tmp = __DIR__ . '/.GameBibleNode.json.' . getmypid() . '.' . $timestamp . '.tmp';
$lockPath = __DIR__ . '/GameBibleNode.json.lock';
$payload = json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;

if (!is_dir($backupDir) && !mkdir($backupDir, 0750, true)) {
    fail_safe(500, 'Backupmap kan niet worden gemaakt');
}

$lock = fopen($lockPath, 'c');
if (!$lock || !flock($lock, LOCK_EX)) {
    fail_safe(423, 'Opslaan is tijdelijk vergrendeld');
}

try {
    if (is_file($target) && !copy($target, $backup)) {
        fail_safe(500, 'Backup maken mislukt');
    }

    $handle = fopen($tmp, 'xb');
    if (!$handle) {
        fail_safe(500, 'Tijdelijk bestand kan niet worden gemaakt');
    }

    $written = fwrite($handle, $payload);
    fflush($handle);
    if (function_exists('fsync')) {
        fsync($handle);
    }
    fclose($handle);

    if ($written === false || $written < strlen($payload)) {
        @unlink($tmp);
        fail_safe(500, 'Tijdelijk bestand is onvolledig');
    }

    if (!rename($tmp, $target)) {
        @unlink($tmp);
        fail_safe(500, 'Atomische vervanging mislukt');
    }

    $auditPath = getenv('GK_GAMEBIBLE_AUDIT_LOG') ?: '/var/www/gk/logs/gamebible-node-save.audit.log';
    $auditLine = json_encode([
        'at' => gmdate('c'),
        'action' => 'game_bible_node.save',
        'actor' => $remoteUser !== '' ? $remoteUser : 'legacy-token',
        'target' => $target,
        'backup' => $backup
    ], JSON_UNESCAPED_SLASHES) . PHP_EOL;
    @file_put_contents($auditPath, $auditLine, FILE_APPEND | LOCK_EX);

    echo 'Success';
} finally {
    if (isset($lock) && is_resource($lock)) {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
?>
