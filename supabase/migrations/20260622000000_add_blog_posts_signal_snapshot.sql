-- Weekly signal snapshots — one row per (ticker, week) for flip detection
CREATE TABLE IF NOT EXISTS weekly_signal_snapshot (
    ticker     TEXT NOT NULL,
    signal     TEXT NOT NULL,
    week_date  DATE NOT NULL,
    PRIMARY KEY (ticker, week_date)
);

-- Blog posts table (weekly-pulse and future per-ticker posts)
CREATE TABLE IF NOT EXISTS blog_posts (
    id                  BIGSERIAL PRIMARY KEY,
    slug                TEXT UNIQUE NOT NULL,
    title               TEXT NOT NULL,
    excerpt             TEXT,
    content             TEXT,
    category            TEXT NOT NULL DEFAULT 'weekly-pulse',
    ticker              TEXT,
    status              TEXT NOT NULL DEFAULT 'draft',
    published_at        TIMESTAMPTZ,
    author              TEXT DEFAULT 'StockSnack Team',
    featured_image_url  TEXT,
    seo_title           TEXT,
    seo_description     TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
