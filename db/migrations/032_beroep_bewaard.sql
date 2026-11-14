-- Werkbank Fase 9 herstel 1 (keuze van Kevin 14-11): vergeten bewaart je voortgang.
-- active = 0: vergeten (telt niet mee voor Beroepen per character); xp blijft staan. forgotten_at = wanneer je het vergat
-- (de wachttijd voor opnieuw wisselen telt vanaf de laatste keer, Instellingen > 💰 Geld > 🧰 Beroepen).
ALTER TABLE player_professions ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE player_professions ADD COLUMN forgotten_at TEXT;
