-- Klassen (29-10): de aanval van de speler staat nu per klasse. Het oude veld "Aanval van de speler"
-- (playerAbilityRef) op de kaart Project verdwijnt; anders keurt de editor de kaart Project af.
UPDATE authoring_documents
SET body_json = json_remove(body_json, '$.playerAbilityRef'), revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE kind = 'project_settings' AND json_extract(body_json, '$.playerAbilityRef') IS NOT NULL;
