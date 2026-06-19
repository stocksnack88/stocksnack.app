-- Add updated_at column and auto-update trigger to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Back-fill existing rows to match created_at
UPDATE user_profiles SET updated_at = created_at;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
