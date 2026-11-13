-- Werkbank Fase 8 herstel 3 (Kevin 13-11): buit hoort bij een plek.
-- Loop je verder weg dan "Buit pakken binnen" (Instellingen > 💰 Geld) of ga je dood, dan is hij weg.
ALTER TABLE player_pending_loot ADD COLUMN x REAL;
ALTER TABLE player_pending_loot ADD COLUMN z REAL;
