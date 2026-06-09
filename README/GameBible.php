<?php
// GameBible.php
$data = file_get_contents('php://input');

if ($data) {
    // Probeer de JSON te overschrijven
    $result = file_put_contents('GameBible.json', $data);
    
    if ($result !== false) {
        echo "Success";
    } else {
        // Geef een harde foutmelding als schrijven mislukt (bijv. door map-rechten)
        http_response_code(500);
        echo "Kan bestand niet wegschrijven";
    }
} else {
    http_response_code(400);
    echo "Geen data ontvangen";
}
?>