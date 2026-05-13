-- StockSnack Screener — run once in Supabase SQL Editor before running the pipeline

CREATE TABLE IF NOT EXISTS stocks (
    ticker          TEXT PRIMARY KEY,
    name            TEXT,
    sector          TEXT,
    industry        TEXT,
    exchange        TEXT,
    description     TEXT,
    website         TEXT,
    country         TEXT,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_prices (
    ticker              TEXT PRIMARY KEY REFERENCES stocks(ticker) ON DELETE CASCADE,
    current_price       NUMERIC,
    market_cap          NUMERIC,
    shares_outstanding  NUMERIC,
    beta                NUMERIC,
    week_52_high        NUMERIC,
    week_52_low         NUMERIC,
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_fundamentals (
    ticker              TEXT REFERENCES stocks(ticker) ON DELETE CASCADE,
    fiscal_year         INT,
    revenue             NUMERIC,
    gross_profit        NUMERIC,
    ebitda              NUMERIC,
    operating_income    NUMERIC,
    net_income          NUMERIC,
    eps                 NUMERIC,
    total_assets        NUMERIC,
    total_debt          NUMERIC,
    total_equity        NUMERIC,
    cash_and_equivalents NUMERIC,
    net_debt            NUMERIC,
    operating_cash_flow NUMERIC,
    capex               NUMERIC,
    free_cash_flow      NUMERIC,
    dividends_paid      NUMERIC,
    buybacks            NUMERIC,
    gross_margin        NUMERIC,
    operating_margin    NUMERIC,
    net_margin          NUMERIC,
    roe                 NUMERIC,
    roic                NUMERIC,
    debt_to_equity      NUMERIC,
    current_ratio       NUMERIC,
    interest_coverage   NUMERIC,
    ev_to_ebitda        NUMERIC,
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (ticker, fiscal_year)
);

CREATE TABLE IF NOT EXISTS stock_scores (
    ticker              TEXT PRIMARY KEY REFERENCES stocks(ticker) ON DELETE CASCADE,
    -- Layer 1: PPM
    ppm_score           NUMERIC,
    ppm_m1_price        NUMERIC,
    ppm_m2_price        NUMERIC,
    ppm_m3_price        NUMERIC,
    ppm_blended_price   NUMERIC,
    ppm_cagr            NUMERIC,
    -- Layer 1: PPM intermediates
    m1_ebitda_current    NUMERIC,
    m1_ebitda_projected  NUMERIC,
    m1_growth_rate       NUMERIC,
    m1_ev_ebitda_multiple NUMERIC,
    m1_net_debt          NUMERIC,
    m1_shares            NUMERIC,
    m2_fcf_current       NUMERIC,
    m2_fcf_projected     NUMERIC,
    m2_growth_rate       NUMERIC,
    m2_fcf_yield         NUMERIC,
    m3_div_yield         NUMERIC,
    m3_buyback_yield     NUMERIC,
    m3_shareholder_yield NUMERIC,
    m3_growth_rate       NUMERIC,
    -- Layer 2: Growth
    growth_score        NUMERIC,
    revenue_cagr_3y     NUMERIC,
    revenue_cagr_5y     NUMERIC,
    net_income_cagr_3y  NUMERIC,
    net_income_cagr_5y  NUMERIC,
    fcf_cagr_3y         NUMERIC,
    fcf_cagr_5y         NUMERIC,
    -- Layer 3: Health
    health_score        NUMERIC,
    health_passes       INT,
    health_details      JSONB,
    -- Layer 4: Final
    final_score         NUMERIC,
    signal              TEXT,
    -- Benchmark
    sp500_cagr          NUMERIC,
    sp500_5y_return     NUMERIC,
    -- Segments
    product_segments    JSONB,
    geo_segments        JSONB,
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id                  BIGSERIAL PRIMARY KEY,
    started_at          TIMESTAMPTZ DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    tickers_processed   TEXT[],
    tickers_failed      TEXT[],
    status              TEXT DEFAULT 'running',
    error_message       TEXT
);
