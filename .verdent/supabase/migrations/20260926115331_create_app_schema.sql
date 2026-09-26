-- ── user_settings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_settings (
  user_id         uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_mode    text    NOT NULL DEFAULT 'collage'
                          CHECK (display_mode IN ('collage', 'latest_bird', 'newest_arrival')),
  margin_percent  integer NOT NULL DEFAULT 4
                          CHECK (margin_percent BETWEEN 0 AND 20),
  lookback_window text    NOT NULL DEFAULT '24h'
                          CHECK (lookback_window IN ('15m', '1h', '6h', '24h', 'all')),
  max_species     integer          CHECK (max_species IS NULL OR max_species >= 1),
  species_sort    text    NOT NULL DEFAULT 'most_heard'
                          CHECK (species_sort IN ('most_heard', 'rarest_window', 'rarest_all_time'))
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users insert own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own settings"
  ON user_settings FOR UPDATE
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own settings"
  ON user_settings FOR DELETE
  USING (auth.uid() = user_id);


-- ── detections ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS detections (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  species_common      text        NOT NULL,
  species_scientific  text        NOT NULL,
  confidence          real        NOT NULL CHECK (confidence BETWEEN 0.0 AND 1.0),
  illustration_path   text,
  detected_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_detections_user_detected
  ON detections (user_id, detected_at DESC);

ALTER TABLE detections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users select own detections"
  ON detections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users delete own detections"
  ON detections FOR DELETE
  USING (auth.uid() = user_id);

-- INSERT and UPDATE are reserved for the service role (Python detection backend)


-- ── species (public reference data) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS species (
  common_name       text NOT NULL PRIMARY KEY,
  scientific_name   text NOT NULL UNIQUE,
  body_mass_g       real,
  illustration_path text
);

ALTER TABLE species ENABLE ROW LEVEL SECURITY;

CREATE POLICY "species public read"
  ON species FOR SELECT
  TO anon, authenticated
  USING (true);

-- INSERT/UPDATE reserved for the service role (backend seeding)