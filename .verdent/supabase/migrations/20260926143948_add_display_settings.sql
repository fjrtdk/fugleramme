ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS font_family      text    DEFAULT 'EB Garamond',
  ADD COLUMN IF NOT EXISTS artwork_style    text    DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS show_species_label boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS label_language   text    DEFAULT 'common';