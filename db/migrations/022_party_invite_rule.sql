-- MMO (3-11, Kevin): de leider kiest per groep of de leden mogen uitnodigen.
-- NULL = de standaard uit Instellingen > Groep (MMO) > Wie mag uitnodigen.
ALTER TABLE parties ADD COLUMN invite_rule TEXT;
