ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS audio_source_device_id text;
