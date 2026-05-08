-- user_profiles table and trigger — run once in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS user_profiles (
    id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email               TEXT,
    full_name           TEXT,
    avatar_url          TEXT,
    stripe_customer_id  TEXT,
    subscription_status TEXT NOT NULL DEFAULT 'free',
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own profile
CREATE POLICY "users_read_own_profile"
    ON user_profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "users_update_own_profile"
    ON user_profiles FOR UPDATE
    USING (auth.uid() = id);

-- Service role can do everything (for webhook updates)
CREATE POLICY "service_role_all"
    ON user_profiles FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Trigger: auto-create profile row when a new auth user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO user_profiles (id, email, subscription_status)
    VALUES (NEW.id, NEW.email, 'free')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
