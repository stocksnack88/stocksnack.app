-- User wishlist/watchlist (feedback #5, 2026-08-06): a personal list of tickers
-- users want to keep an eye on. Applied directly via `supabase db query --linked`;
-- this file documents the change for the repo's migration history.

CREATE TABLE IF NOT EXISTS watchlist (
    id         bigint generated always as identity primary key,
    user_id    uuid not null references auth.users(id) on delete cascade,
    ticker     text not null,
    created_at timestamptz not null default now(),
    unique (user_id, ticker)
);
CREATE INDEX IF NOT EXISTS watchlist_user_id_idx ON watchlist(user_id);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_watchlist"   ON watchlist;
DROP POLICY IF EXISTS "users_insert_own_watchlist" ON watchlist;
DROP POLICY IF EXISTS "users_delete_own_watchlist" ON watchlist;

-- A user may only read, add to, and remove from their own watchlist.
-- No UPDATE policy — rows are add/remove only, never edited in place.
CREATE POLICY "users_read_own_watchlist"
    ON watchlist FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_watchlist"
    ON watchlist FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_delete_own_watchlist"
    ON watchlist FOR DELETE
    USING (auth.uid() = user_id);
