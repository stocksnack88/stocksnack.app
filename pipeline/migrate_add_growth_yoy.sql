ALTER TABLE stock_scores
    ADD COLUMN IF NOT EXISTS revenue_yoy_rates    TEXT,
    ADD COLUMN IF NOT EXISTS net_income_yoy_rates TEXT,
    ADD COLUMN IF NOT EXISTS fcf_yoy_rates        TEXT,
    ADD COLUMN IF NOT EXISTS growth_years         TEXT,
    ADD COLUMN IF NOT EXISTS gq_signal_revenue    TEXT,
    ADD COLUMN IF NOT EXISTS gq_signal_net_income TEXT,
    ADD COLUMN IF NOT EXISTS gq_signal_fcf        TEXT,
    ADD COLUMN IF NOT EXISTS gq_master            TEXT;
