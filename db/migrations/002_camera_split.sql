UPDATE editor_nodes
SET type = 'game_camera',
    title = CASE
      WHEN title LIKE 'Top-Down Camera%' THEN REPLACE(title, 'Top-Down Camera', 'Game Camera')
      ELSE title
    END
WHERE type = 'top_down_camera';

DELETE FROM draft_world_state WHERE id = 1;
