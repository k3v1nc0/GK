-- Fase 5 (vaardigheden): een klasse heeft een lijst vaardigheden voor vak 2 en 3. De oude losse "Genees-spreuk"
-- (healAbilityRef) gaat als eerste vaardigheid in die lijst, zodat bestaande characters niets kwijtraken.
UPDATE authoring_documents
SET body_json = json_remove(
      json_set(body_json, '$.skills', json_array(json_object('ref', json_extract(body_json, '$.healAbilityRef')))),
      '$.healAbilityRef'),
    revision = revision + 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE kind = 'player_class'
  AND json_extract(body_json, '$.healAbilityRef') IS NOT NULL
  AND json_extract(body_json, '$.skills') IS NULL;
UPDATE authoring_documents
SET body_json = json_remove(body_json, '$.healAbilityRef'), revision = revision + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE kind = 'player_class' AND json_extract(body_json, '$.healAbilityRef') IS NOT NULL;
