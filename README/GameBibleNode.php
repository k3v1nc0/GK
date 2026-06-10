<?php
// GameBibleNode.php
header('Content-Type: text/plain; charset=utf-8');

$data = file_get_contents('php://input');

if (!$data) {
    http_response_code(400);
    echo "Geen data ontvangen";
    exit;
}

$decoded = json_decode($data, true);
if ($decoded === null && json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo "Ongeldige JSON: " . json_last_error_msg();
    exit;
}

$result = file_put_contents('GameBibleNode.json', json_encode($decoded, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

if ($result !== false) {
    echo "Success";
} else {
    http_response_code(500);
    echo "Kan bestand niet wegschrijven";
}
?>