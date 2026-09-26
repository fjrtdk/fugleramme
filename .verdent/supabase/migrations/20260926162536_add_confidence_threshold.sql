ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS confidence_threshold float8 DEFAULT 0.5;