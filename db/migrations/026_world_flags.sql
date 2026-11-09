-- Quest Builder stap 9 (8-11): wereldstatus. Een quest zet een vlag aan of uit: per speler (bij een groepsvlag voor elk
-- groepslid een eigen rij) of voor de hele server (owner_id '*'). Geen rij = de vlag staat uit.
CREATE TABLE IF NOT EXISTS world_flags (
  owner_id TEXT NOT NULL,
  flag_id TEXT NOT NULL,
  is_on INTEGER NOT NULL,
  quest_id TEXT,
  set_by TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, flag_id)
);
