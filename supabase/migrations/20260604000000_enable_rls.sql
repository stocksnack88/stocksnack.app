-- Enable Row Level Security on all public tables.
-- Previously RLS was disabled, leaving all tables accessible to any client
-- holding the anon key. This migration locks them down to appropriate roles.

-- ============================================================
-- stocks
-- Holds S&P 500 company profiles (name, sector, exchange, etc.)
-- Anyone may read; only the pipeline (service role) may write.
-- ============================================================
ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;

-- Public market data — readable by both anon and authenticated clients
CREATE POLICY "stocks_select_public"
    ON stocks FOR SELECT
    USING (true);

-- No INSERT / UPDATE / DELETE policies → blocked for all client roles.
-- Pipeline writes via service role, which bypasses RLS entirely.


-- ============================================================
-- stock_prices
-- Current price snapshots (price, market cap, 52-week range, etc.)
-- Anyone may read; only the pipeline (service role) may write.
-- ============================================================
ALTER TABLE stock_prices ENABLE ROW LEVEL SECURITY;

-- Public market data — readable by both anon and authenticated clients
CREATE POLICY "stock_prices_select_public"
    ON stock_prices FOR SELECT
    USING (true);

-- No INSERT / UPDATE / DELETE policies → blocked for all client roles.


-- ============================================================
-- stock_fundamentals
-- Historical financial statements per ticker per fiscal year.
-- Anyone may read; only the pipeline (service role) may write.
-- ============================================================
ALTER TABLE stock_fundamentals ENABLE ROW LEVEL SECURITY;

-- Public market data — readable by both anon and authenticated clients
CREATE POLICY "stock_fundamentals_select_public"
    ON stock_fundamentals FOR SELECT
    USING (true);

-- No INSERT / UPDATE / DELETE policies → blocked for all client roles.


-- ============================================================
-- stock_scores
-- Computed scoring signals (PPM, growth, health, final score, signal).
-- Anyone may read; only the pipeline (service role) may write.
-- ============================================================
ALTER TABLE stock_scores ENABLE ROW LEVEL SECURITY;

-- Public screener data — readable by both anon and authenticated clients
CREATE POLICY "stock_scores_select_public"
    ON stock_scores FOR SELECT
    USING (true);

-- No INSERT / UPDATE / DELETE policies → blocked for all client roles.


-- ============================================================
-- user_profiles
-- User account rows linked to auth.users (subscription status, Stripe ID, etc.)
-- Each user may only read and update their own row.
-- Stripe webhook handler writes via service role.
-- ============================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop any policies that may have been created by create_user_profiles.sql
-- to avoid duplicate-name errors when this migration runs.
DROP POLICY IF EXISTS "users_read_own_profile"  ON user_profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "service_role_all"         ON user_profiles;

-- A user may only read their own profile row
CREATE POLICY "users_read_own_profile"
    ON user_profiles FOR SELECT
    USING (auth.uid() = id);

-- A user may only update their own profile row; the id column cannot be changed
CREATE POLICY "users_update_own_profile"
    ON user_profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Service role (Stripe webhook, auth trigger) may perform all operations.
-- Supabase service_role key already bypasses RLS at the connection level;
-- this policy makes the intent explicit and covers any future direct-SQL paths.
CREATE POLICY "service_role_all"
    ON user_profiles FOR ALL
    USING  (auth.jwt() ->> 'role' = 'service_role')
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role');


-- ============================================================
-- pipeline_runs
-- Internal audit log written exclusively by the pipeline process.
-- No client access at all — service role bypasses RLS by default.
-- ============================================================
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

-- Intentionally no policies.
-- Any SELECT / INSERT / UPDATE / DELETE from an anon or authenticated client
-- will be denied. The pipeline connects via service_role and is unaffected.
