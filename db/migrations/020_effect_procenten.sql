-- Healing (2-11, Kevin): genezen over tijd is nu "Levens/Mana per keer" in procent van je max, "om de X seconden".
-- De oude velden "Levens per seconde" en "Mana per seconde" verdwijnen; anders keurt de editor items en aanvallen af.
UPDATE authoring_documents
SET body_json = json_remove(body_json, '$.effectHealthPerS', '$.effectManaPerS'), revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE kind IN ('item_definition', 'ability')
  AND (json_extract(body_json, '$.effectHealthPerS') IS NOT NULL OR json_extract(body_json, '$.effectManaPerS') IS NOT NULL);
