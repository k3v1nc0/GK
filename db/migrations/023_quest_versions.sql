-- Quest Builder stap 1 (4-11): elke questversie waarmee een speler begon blijft bewaard.
-- Past Kevin later een quest aan, dan maakt de speler een lopende quest af op zijn eigen versie.
CREATE TABLE IF NOT EXISTS quest_versions (
  quest_id TEXT NOT NULL,
  version TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (quest_id, version)
);
