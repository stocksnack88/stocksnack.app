# StockSnack — System Overview

> **Living document.** Update this file whenever pipeline logic, scoring weights, thresholds, special-case tickers, table schema, or frontend access rules change. The authoritative check is always the source code; this file is the human-readable map to it.

---

## Table of Contents

1. [Architecture at a Glance](#1-architecture-at-a-glance)
2. [Data Flow](#2-data-flow)
3. [Database Tables](#3-database-tables)
4. [Pipeline Files](#4-pipeline-files)
5. [Scoring Pipeline](#5-scoring-pipeline)
6. [Key Business Logic Decisions](#6-key-business-logic-decisions)
7. [GitHub Actions Schedule](#7-github-actions-schedule)
8. [Frontend](#8-frontend)
9. [Constants & Thresholds Reference](#9-constants--thresholds-reference)

---

## 1. Architecture at a Glance

StockSnack scores every S&P 500 stock across three weighted layers — **PPM (Price Projection Model)**, **Growth Trend**, and **Financial Health** — and surfaces results through a Next.js screener with a freemium subscription model.

```
SEC EDGAR XBRL  ──►  field_mapper.py  ──►  normalizer.py  ──►
                                                                  build_data_dict()  ──►  score_ppm / score_growth / score_health / score_final
yfinance (price, shares)  ─────────────────────────────────►
                                                                                         ──►  supabase_writer.py  ──►  Supabase DB
FMP API (legacy fallback, run.py only)  ──────────────────►                             ──►  pe_ratios.py (sector averages, post-loop)

Supabase DB  ──►  Next.js (App Router)  ──►  User browser
```

**Scoring weights:** PPM 40% · Growth 30% · Health 30%

**Signal gates (primary path, requires sp500_cagr):**

| PPM CAGR vs S&P 500 | Quality gate | Signal |
|---------------------|--------------|--------|
| < 1.0× S&P | — | **SELL** |
| 1.0–1.2× S&P | — | **HOLD** |
| ≥ 1.2× S&P | health_passes < 16 AND growth_score < 40 | **SELL** |
| ≥ 1.2× S&P | exactly one of health/growth passes | **HOLD** |
| ≥ 1.2× S&P | both pass, CAGR < 1.5× S&P | **BUY** |
| ≥ 1.5× S&P | both pass | **BUY+** |

---

## 2. Data Flow

### Primary path: SEC EDGAR + yfinance (`run_sec.py`)

This is the live production path that runs weekly for all S&P 500 tickers.

```
1.  S&P 500 ticker list
      └─ Wikipedia scrape → cached to pipeline/sec/sp500_tickers.csv (7-day TTL)

2.  Per ticker — SEC EDGAR fetch
      └─ sec_client.py: CIK lookup (cik_cache.json, 7-day TTL)
                        → download company_facts JSON from data.sec.gov
      └─ field_mapper.py: read tag_mapping.csv (priority-ordered GAAP tags)
                          → extract annual 10-K/FY data from us-gaap namespace
                          → write to extracted_data.csv (audit trail)
                          → log missing fields to missing_log.csv
      └─ normalizer.py:  map SEC internal names → FMP-shaped field names
                         → apply sign conventions (capex, dividends, buybacks negated)
                         → deduplicate by fiscal year (max preferred; min for eps_diluted)
                         → return newest-first list of dicts

3.  Per ticker — yfinance fetch
      └─ yf_client.get_profile()              → current price, market cap, sector, industry
      └─ yf_client.get_historical_market_cap()→ avg_price × split-adjusted shares per fiscal year
      └─ yf_client.get_shares_per_year()      → tries: SEC extracted_data → yf fast_info → mktcap/price

4.  build_data_dict()
      └─ Assemble data dict (same shape as FMP fetch_all() output):
           {profile, income[], balance[], cashflow[], metrics[], hist_mktcap}
      └─ Apply currency conversion for TWD tickers (TSM ÷ 31.5)
      └─ Apply sector-mode overrides (bank/REIT/financial): adjust ebitda proxy, zero net_debt
      └─ Sanity checks: EBITDA unit mismatch (÷1000), EPS split mismatch (log to fix_log)
      └─ EBITDA zero-fill: if XBRL D&A missing → pull prior value from stock_fundamentals

5.  Hazard check
      └─ YoY revenue > ±50% → anomaly flag
      └─ YoY EBITDA > +100% or < -50% → anomaly flag
      └─ YoY total assets < -30% → anomaly flag
      └─ Consecutive runs consolidated ("Revenue spiked 3 consecutive years")

6.  Score (4 layers)
      └─ score_ppm()    → projected price via 3 valuation methods, blended CAGR, 0–100
      └─ score_growth() → revenue/NI/FCF growth quality, 0–100
      └─ score_health() → 24 binary checks, 0–100
      └─ score_final()  → weighted average + two-gate signal

7.  Segment fetch
      └─ segment_extractor.py: parse XBRL dimensional revenue contexts
         → product_segments, geo_segments (JSONB)

8.  Supabase write (unless --dry-run)
      └─ upsert: stocks, stock_prices, stock_fundamentals, stock_scores

9.  Post-loop (all tickers done)
      └─ pe_ratios.py: compute pe_ratio, pe_5y_avg, fcf_yield, div_yield per ticker
                       + market-cap-weighted sector averages
                       → update stock_scores
```

### Legacy path: FMP API (`run.py`)

Runs only for the 19-ticker watchlist defined in `config.py`. No longer the primary execution path. Uses Financial Modeling Prep API (rate-limited to 0.35s per call). Produces the same data shape as the SEC pipeline, so all downstream scoring is shared.

### How often it runs

| Trigger | Coverage | Command |
|---------|----------|---------|
| Monday 00:00 UTC (cron) | Full S&P 500 (~500 tickers) | `run_sec.py --offset N --limit 25` (20 parallel workers) |
| Manual `workflow_dispatch` | Any tickers listed | `run_sec.py --tickers AAPL MSFT ...` |
| Developer local | Any ticker, no DB write | `python3 sec/run_sec.py --tickers TICKER --dry-run` |

---

## 3. Database Tables

All tables live in Supabase (Postgres). Schema defined in `pipeline/create_tables.sql`.

### `stocks`

One row per ticker. Static company metadata.

| Column | Type | Description |
|--------|------|-------------|
| `ticker` | TEXT PK | e.g. "AAPL" |
| `name` | TEXT | Company display name |
| `sector` | TEXT | yfinance sector string |
| `industry` | TEXT | yfinance industry string |
| `exchange` | TEXT | NYSE / NASDAQ / etc. |
| `description` | TEXT | Company description blurb |
| `website` | TEXT | Company URL |
| `country` | TEXT | Non-null for foreign ADRs (used to exclude from sector P/E) |
| `updated_at` | TIMESTAMPTZ | Last pipeline write |

### `stock_prices`

One row per ticker. Current market data, refreshed each pipeline run.

| Column | Type | Description |
|--------|------|-------------|
| `ticker` | TEXT PK FK→stocks | |
| `current_price` | NUMERIC | Latest price from yfinance |
| `market_cap` | NUMERIC | Latest market cap |
| `shares_outstanding` | NUMERIC | From yfinance profile |
| `beta` | NUMERIC | 5Y monthly beta |
| `week_52_high` | NUMERIC | |
| `week_52_low` | NUMERIC | |
| `updated_at` | TIMESTAMPTZ | |

### `stock_fundamentals`

One row per (ticker, fiscal_year). Five years of annual financials.

| Column | Type | Description |
|--------|------|-------------|
| `ticker` | TEXT FK→stocks | |
| `fiscal_year` | INT | e.g. 2024 |
| `revenue` | NUMERIC | Total revenue |
| `gross_profit` | NUMERIC | |
| `ebitda` | NUMERIC | Operating income + D&A; bank/REIT/financial overridden |
| `operating_income` | NUMERIC | |
| `net_income` | NUMERIC | |
| `eps` | NUMERIC | Diluted EPS (split-corrected if needed) |
| `total_assets` | NUMERIC | |
| `total_debt` | NUMERIC | Long-term debt (or 0 for bank mode) |
| `total_equity` | NUMERIC | Stockholders' equity |
| `cash_and_equivalents` | NUMERIC | |
| `net_debt` | NUMERIC | total_debt − cash (0 for bank/REIT/financial mode) |
| `operating_cash_flow` | NUMERIC | |
| `capex` | NUMERIC | **Negative** (cash outflow) |
| `free_cash_flow` | NUMERIC | op_cash_flow + capex (capex already negative) |
| `dividends_paid` | NUMERIC | **Negative** (cash outflow); null if non-payer |
| `buybacks` | NUMERIC | **Negative** (cash outflow) |
| `gross_margin` | NUMERIC | gross_profit / revenue |
| `operating_margin` | NUMERIC | operating_income / revenue |
| `net_margin` | NUMERIC | net_income / revenue |
| `roe` | NUMERIC | net_income / total_equity |
| `roic` | NUMERIC | operating_income × (1 − tax_rate) / invested_capital |
| `debt_to_equity` | NUMERIC | total_liabilities / total_equity |
| `current_ratio` | NUMERIC | current_assets / current_liabilities |
| `interest_coverage` | NUMERIC | operating_income / interest_expense |
| `ev_to_ebitda` | NUMERIC | (market_cap + net_debt) / ebitda |
| `market_cap_at_year` | NUMERIC | Avg annual price × split-adjusted shares (from yfinance) |
| `updated_at` | TIMESTAMPTZ | |

> **Note:** Several columns added via migration scripts: `sga`, `rd_expense`, `depreciationAndAmortization`, `sbc`, `shares_outstanding`, `intangibles`, `preferred_stock`, `retained_earnings`, `current_assets`, `current_liabilities`, `tax_rate`, `m_cumulative_div_ps`. Check `pipeline/migrate_*.sql` for the full current schema.

### `stock_scores`

One row per ticker. All scoring outputs and intermediates from the current pipeline run.

**Layer 1 — PPM**

| Column | Description |
|--------|-------------|
| `ppm_score` | 0–100 score |
| `ppm_m1_price` | M1 projected price (EV/EBITDA method, or P/E for float-distorted) |
| `ppm_m2_price` | M2 projected price (P/FCF method; null for financials) |
| `ppm_m3_price` | M3 projected price (dividend/buyback; null if gate not met) |
| `ppm_blended_price` | Average of valid (non-null, positive) M1/M2/M3 prices |
| `ppm_cagr` | (blended_price/current_price)^(1/5) − 1 |
| `m1_ebitda_current` | Most recent year EBITDA used in M1 |
| `m1_ebitda_projected` | EBITDA projected 5 years forward |
| `m1_growth_rate` | Recency-weighted CAGR applied to EBITDA |
| `m1_ev_ebitda_multiple` | Trimmed-median historical EV/EBITDA applied |
| `m1_net_debt` | Net debt subtracted from projected enterprise value |
| `m1_shares` | Shares used for price conversion (from mktcap/price at score time) |
| `m2_fcf_current` | Most recent FCF |
| `m2_fcf_projected` | FCF projected 5 years forward |
| `m2_growth_rate` | Recency-weighted CAGR applied to FCF |
| `m2_fcf_yield` | 1 / P_FCF multiple |
| `m3_applicable` | BOOLEAN — whether M3 dividend gate was met |
| `m3_div_yield` | Historical average dividend yield used |
| `m3_buyback_yield` | Most recent buyback / market cap |
| `m3_shareholder_yield` | div_yield + buyback_yield |
| `m3_growth_rate` | Weighted dividend growth rate used |
| `m_cumulative_div_ps` | annual_div_per_share × 5 (informational) |

**Layer 2 — Growth**

| Column | Description |
|--------|-------------|
| `growth_score` | 0–100 score |
| `revenue_cagr_3y` / `revenue_cagr_5y` | Revenue CAGR (3-year and 5-year) |
| `net_income_cagr_3y` / `net_income_cagr_5y` | Net income CAGR |
| `fcf_cagr_3y` / `fcf_cagr_5y` | FCF CAGR (null for financial companies) |
| `revenue_yoy_rates` | Comma-separated YoY rates, newest→oldest |
| `net_income_yoy_rates` | Same for net income |
| `fcf_yoy_rates` | Same for FCF |
| `growth_years` | Comma-separated fiscal years covered |
| `gq_signal_revenue` | "Solid Growth" / "Slowing Growth" / "Decelerating" / "Deteriorating" / "Freefall" |
| `gq_signal_net_income` | Same for net income |
| `gq_signal_fcf` | Same for FCF (null for financials) |
| `gq_master` | Worst of the three signals |

**Layer 3 — Health**

| Column | Description |
|--------|-------------|
| `health_score` | 0–100 score |
| `health_passes` | Integer count of passing checks (out of 24) |
| `health_details` | JSONB array: `[{name, pass, score, years_passed, not_scored?}]` |

**Layer 4 — Final**

| Column | Description |
|--------|-------------|
| `final_score` | PPM×0.4 + Growth×0.3 + Health×0.3 |
| `signal` | "BUY+" / "BUY" / "HOLD" / "SELL" |

**Benchmark & Extras**

| Column | Description |
|--------|-------------|
| `sp500_cagr` | Blended S&P 500 CAGR used as benchmark |
| `sp500_5y_return` | Projected 5-year S&P return multiplier |
| `product_segments` | JSONB: product revenue breakdown |
| `geo_segments` | JSONB: geographic revenue breakdown |
| `has_anomaly` | BOOLEAN — hazard flag |
| `anomaly_reasons` | TEXT — human-readable reason(s) |
| `sector_override` | "Bank" / "REIT" / "Financial" / null |
| `pe_ratio` | market_cap / most_recent_net_income |
| `pe_5y_avg` | avg(market_cap_at_year / net_income) over 5 years |
| `industry_pe` / `industry_pe_5y_avg` | Market-cap-weighted sector averages |
| `fcf_yield` | most_recent_fcf / current_market_cap |
| `fcf_5y_avg` | avg(fcf / market_cap_at_year) |
| `industry_fcf_yield` / `industry_fcf_5y_avg` | Sector averages |
| `div_yield` | dividends_paid / market_cap (null if non-payer) |
| `div_yield_5y_avg` | avg(dividends_paid / market_cap_at_year) |
| `industry_div_yield` / `industry_div_yield_5y_avg` | Dividend-payer-only sector averages |
| `updated_at` | TIMESTAMPTZ |

### `pipeline_runs`

Audit log of pipeline executions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | BIGSERIAL PK | |
| `started_at` | TIMESTAMPTZ | |
| `completed_at` | TIMESTAMPTZ | Null while running |
| `tickers_processed` | TEXT[] | Succeeded tickers |
| `tickers_failed` | TEXT[] | Failed tickers |
| `status` | TEXT | 'running' / 'completed' / 'partial' |
| `error_message` | TEXT | Top-level error if any |

### `fix_log` (implicit)

Created inline when the EPS split-mismatch auto-corrector fires. Columns: `ticker`, `issue`, `fix_description`. Check migration files for full DDL.

---

## 4. Pipeline Files

### `pipeline/config.py`

Loads `.env.local` into environment variables and exports shared constants.

- **TICKERS** — 19-stock watchlist used only by the legacy FMP path (`run.py`). The SEC pipeline ignores this and loads S&P 500 from Wikipedia.
- **PPM_WEIGHT** = 0.40, **GROWTH_WEIGHT** = 0.30, **HEALTH_WEIGHT** = 0.30
- **BUY_THRESHOLD** = 65, **HOLD_THRESHOLD** = 40 (fallback thresholds when no sp500_cagr available)

---

### `pipeline/run.py`

Legacy FMP pipeline. Runs the same 4 scoring layers as the SEC pipeline but fetches data from the Financial Modeling Prep API instead of SEC EDGAR. Rate-limited to 0.35 s/call. Processes only the 19-ticker watchlist from `config.py`. Not scheduled via GitHub Actions; the SEC pipeline is the production path.

---

### `pipeline/fmp_client.py`

HTTP client for the FMP API. Methods: `fetch_all(ticker)` returns a dict with keys `profile`, `income`, `balance`, `cashflow`, `metrics`, `product_segments`, `geo_segments`, `reported_currency`. This dict shape is the canonical format all scoring layers expect, and the SEC pipeline's `build_data_dict()` mirrors it exactly.

---

### `pipeline/supabase_writer.py`

Translates the scored data dict into Supabase upserts. Key method `upsert_stock(ticker, data)` writes to `stocks`, `stock_prices`, and `stock_fundamentals`. A separate call `upsert_scores(...)` writes the full `stock_scores` row including all layer outputs, intermediates, hazard flags, and sector overrides.

---

### `pipeline/sec/run_sec.py`

The primary production pipeline conductor. One invocation per batch of tickers. Responsibilities:

1. Load S&P 500 ticker list (Wikipedia scrape, cached 7 days).
2. Per ticker: resolve sector mode → `build_data_dict()` → hazard check → score (4 layers) → fetch segments → Supabase write.
3. After all tickers: compute SPY benchmark, compute P/E / FCF / dividend ratios, write sector averages.
4. `--dry-run` flag scores without writing to Supabase.
5. **Anomaly detection** flags sudden revenue/EBITDA/asset swings and stores reasons in `anomaly_reasons`.

**`_resolve_sector_mode(ticker)`** — queries Supabase `stocks` table for sector/industry, returns `{bank_mode, reit_mode, financial_mode, sector_override}` flags that drive downstream overrides.

**`build_data_dict(ticker, years=5, sector_mode, client)`** — the central assembly function. Runs normalizer, fetches yfinance profile + historical market caps, builds `income[]`, `balance[]`, `cashflow[]`, `metrics[]` lists, applies mode overrides, runs EBITDA/EPS sanity checks.

---

### `pipeline/sec/sec_client.py`

Fetches raw XBRL JSON from `https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json`. Maintains `cik_cache.json` (ticker → CIK, 7-day TTL). 100 ms pause between requests per SEC fair-use policy.

---

### `pipeline/sec/field_mapper.py`

Reads `tag_mapping.csv` and extracts annual financial data from the XBRL company-facts blob. For each standardised field (e.g. `capital_expenditure`) it tries tags in priority order and takes the first tag with recent annual 10-K data.

Key behaviours:
- **Staleness:** a tag is skipped if its most-recent year is ≥ 2 years before today.
- **Depreciation/amortization special case:** tries the aggregate tag first; if absent, sums sub-components (PPE depreciation + intangible amortization) with value-based deduplication to avoid double-counting.
- **Computed fields:** `free_cash_flow` = operating_cash_flow + capex (capex stored negative); `ebitda` = operating_income + D&A; `total_liabilities` = total_assets − total_equity.
- Writes every extracted row to `extracted_data.csv` (columns: ticker, fiscal_year, standardised_name, original_tag, value, unit, pulled_at, period_of_report).
- Logs missing fields to `missing_log.csv`.

---

### `pipeline/sec/tag_mapping.csv`

Priority-ordered mapping of standardised field names → SEC GAAP XBRL tags. Format: `original_tag, standardised_name, priority, confirmed_date, notes`.

Current `capital_expenditure` priorities (highest = tried first):
1. `PaymentsToAcquirePropertyPlantAndEquipment` (confirmed AAPL)
2. `CapitalExpendituresIncurredButNotYetPaid`
3. `PaymentsForCapitalImprovements`
4. `PaymentsToAcquireOilAndGasPropertyAndEquipment` (CVX)
5. `PaymentsToAcquireProductiveAssets` (ANET/DAL)
6. `PaymentsForFlightEquipment` (DAL primary)
7. `PaymentsToExploreAndDevelopOilAndGasProperties` (APA)
8. `PaymentsToAcquireOtherPropertyPlantAndEquipment` (pharma/industrials)
9. `PaymentsForSoftware` (asset-light platforms, e.g. ABNB)
10. `PaymentsToAcquireInternalUseSoftware`
11. `PaymentsToDevelopSoftware` (fintech/software companies, e.g. HOOD)

---

### `pipeline/sec/normalizer.py`

Maps extracted_data.csv rows for a ticker into a list of FMP-shaped dicts (one per fiscal year, newest first). Field name mapping lives in `_FIELD_MAP`. Sign conventions: `capitalExpenditure`, `netDividendsPaid`, `commonStockRepurchased` are stored positive in SEC XBRL → negated here to match FMP convention (outflows are negative).

Special deduplication: if multiple XBRL tags map to the same standardised field for the same year, takes the max value except for `eps_diluted` (takes min, since diluted ≤ basic by definition).

---

### `pipeline/sec/yf_client.py`

Yahoo Finance wrapper. All functions return `None`/empty on failure — never raises.

- **`get_profile(symbol)`** → `{price, marketCap, sector, industry, exchange, companyName, currency, lastDividend}`
- **`get_historical_market_cap(symbol, fiscal_year_dates, shares_by_year)`** → `{year: market_cap_float}`
  - Downloads full price history once, then slices 12-month windows ending on each fiscal year's `period_of_report` date.
  - **Split adjustment:** fetches split history; if `most_recent_shares / historical_shares ≥ 1.8×`, multiplies historical shares by cumulative post-period split ratios.
  - Sanity bounds: $1B–$10T; retries with +5 day window offset if violated.
- **`get_shares_per_year(ticker, fiscal_years, csv_path)`** → tries SEC extracted_data → yfinance `fast_info.shares` → `marketCap/price` (last resort).
- **`get_dividends(symbol, years=5)`** → annual per-share totals, oldest→newest.

---

### `pipeline/scoring/utils.py`

Shared utility functions used across all scoring layers.

**`safe_float(value, default=0.0)`** — type-safe float conversion, returns default on None/NaN.

**`compute_cagr(start, end, years)`** → `(end/start)^(1/years) − 1`, or None if start/end ≤ 0.

**`cagr_to_score(cagr, sp500_cagr)`** → 0–100 score on a piecewise linear scale:
- −sp500_cagr (or below) → 0
- 0% → 35
- sp500_cagr → 50
- 2× sp500_cagr (ceiling) → 100

**`compute_gq(values, sp500_cagr)`** — recency-weighted YoY growth quality. `values` is **oldest-first**.
- Computes YoY rates: `(curr − prev) / abs(prev)` for each consecutive pair.
- Applies weights `[0.5, 1.0, 1.5, 2.0, 3.0]` (newest years weighted up to 6× more).
- Clamps weighted CAGR to `[−sp500_cagr, sp500_cagr × 4]`.
- Assigns quality signal: recent avg = last 2 YoY rates; early avg = first 2.
  - All 3 recent rates < 0 → **Freefall**
  - Recent avg < 0 → **Deteriorating**
  - Recent avg − early avg < −8pp → **Decelerating**
  - Recent avg > early avg → **Solid Growth**
  - Else → **Slowing Growth**

**`trimmed_median(values)`** — median of positive values; drops highest + lowest if 4+ data points.

**`is_financial(profile)`** — returns True for banks, insurers, and other financials. False for payment networks (carve-out).
- Carve-out list (`_PAYMENT_NETWORKS`): `{"credit services", "payment processing"}` — these match V, MA, Amex, PYPL.
- Financial if: sector in `{"Financials", "Financial Services"}` OR `"bank"` in industry (and not in carve-out).

**`clamp(v, lo, hi)`** — clamps to range.

**`list_cagr(values, n_years)`** — CAGR from newest-first list, skipping non-positive start values.

---

### `pipeline/scoring/layer1_ppm.py`

**Price Projection Model.** Three independent 5-year valuation methods produce a projected stock price each. Valid prices are averaged; the resulting blended CAGR vs today is scored 0–100.

#### M1 — EV/EBITDA (for most tickers)

1. Project EBITDA 5 years forward using `compute_gq` growth rate (recency-weighted, clamped).
2. Compute trimmed-median of historical EV/EBITDA multiples (clamped 8–50×; fallback 16×).
3. Future enterprise value = projected_EBITDA × multiple.
4. Equity value = enterprise_value − net_debt.
5. Price = equity_value / shares.

#### M1 substitute — P/E Intrinsic (for FLOAT_DISTORTED_TICKERS: PYPL, HOOD)

Customer float or custodied assets appear as XBRL liabilities, inflating net_debt and making EV meaningless. For these tickers:
1. Skip EV/EBITDA entirely.
2. Project net_income 5 years forward via `compute_gq`.
3. Compute trimmed-median of historical P/E multiples from year-end market caps (clamped 8–60×; fallback 20×).
4. Use **SEC diluted shares** (`data["balance"][0]["weightedAverageShsOutDil"]`), not `mktcap/price`. This prevents pe_price from being circular (anchored to today's depressed stock price).
5. Price = (projected_net_income × P/E multiple) / shares.

#### M2 — P/FCF Multiple (excluded for financial companies)

Same structure as M1 but uses FCF instead of EBITDA. Trimmed-median P/FCF (clamped 8–60×; fallback 25×). Excluded when `is_financial()` returns True (banks, insurers, HOOD — but not V/MA/PYPL which are in the payment-network carve-out).

#### M3 — Dividend + FCF Ceiling (high-yield payers only)

**Gate:** spot dividend yield ≥ 4.5% AND dividends paid in all 5 years. Historical avg yield ≥ 4% (blocks special-dividend contamination).

1. Project **total** dividends (not per-share) via `compute_gq` on total annual dividends paid.
2. FCF ceiling: projected FCF × 90%.
3. Each of 5 years: `projected_div = min(target_div_growth, fcf_ceiling)`.
4. Convert final total back to per-share; apply trimmed-median P/giveback multiple (clamped 5–100×; fallback 22×).

**Blending:** average of valid (positive) M1/M2/M3 prices. If only one valid, that is the blended price.

---

### `pipeline/scoring/layer2_growth.py`

**Growth Trend.** Scores the quality and momentum of revenue, net income, and FCF growth.

For each metric:
1. Compute recency-weighted CAGR via `compute_gq(oldest_first_values[:5])`.
2. Score via `cagr_to_score()` (0–100).
3. Assign quality signal (Solid Growth → Freefall).

**Signal multiplier** (worst signal across all metrics):

| Signal | Multiplier |
|--------|-----------|
| Solid Growth | 1.00 |
| Slowing Growth | 0.90 |
| Decelerating | 0.75 |
| Deteriorating | 0.50 |
| Freefall | 0.25 |

Final growth score = average of component scores × worst-signal multiplier.

FCF excluded from the average (but not the multiplier) for financial companies.

---

### `pipeline/scoring/layer3_health.py`

**Financial Health.** 24 binary pass/fail checks across 4 categories. Each check looks at all 5 available fiscal years. Per-check score = `min(current_pass × 60 + years_passed × 8, 100)`. Health score = `passes / total_scored × 100`.

#### Category 1 — Balance Sheet (7 checks)

| # | Check | Criterion |
|---|-------|-----------|
| 1 | Cash/Debt Ratio | cash_and_equivalents / total_debt > 1.0, or no debt |
| 2 | Debt/Equity | total_liabilities / total_equity < 0.80 |
| 3 | No Preferred Stock | preferred_stock = 0 |
| 4 | Retained Earnings Growth | retained_earnings[year0] > retained_earnings[year1] |
| 5 | Active Buybacks | common_stock_repurchased < 0 (cash paid out) |
| 6 | ROE > 25% | net_income / total_equity > 0.25 |
| 7 | ROTA > 10% | net_income / total_assets > 0.10 |

#### Category 2 — Income Statement (7 checks)

| # | Check | Criterion |
|---|-------|-----------|
| 8 | Gross Margin > 40% | gross_profit / revenue > 0.40 |
| 9 | SG&A / Gross Profit < 30% | sga_expense / gross_profit < 0.30 |
| 10 | R&D / Gross Profit < 30% | rd_expense / gross_profit < 0.30 |
| 11 | Interest / Op Income < 15% | interest_expense / operating_income < 0.15 |
| 12 | Tax Rate 15–25% | 0.15 ≤ income_tax / income_before_tax ≤ 0.25 |
| 13 | Net Margin > 20% | net_income / revenue > 0.20 |
| 14 | EPS Growth | eps[year0] > eps[year1] |

#### Category 3 — Cash Flow (5 checks)

| # | Check | Criterion |
|---|-------|-----------|
| 15 | SBC / Revenue < 10% | stock_based_compensation / revenue < 0.10 |
| 16 | OCF > Net Income | operating_cash_flow > net_income |
| 17 | FCF Growth | free_cash_flow[year0] > free_cash_flow[year1] — **excluded for banks** |
| 18 | CapEx / Net Income < 25% | abs(capex) / net_income < 0.25 |
| 19 | Payout < FCF | abs(dividends + buybacks) / free_cash_flow < 1.0 |

#### Category 4 — Business Traits / "Buffett Tier" (5 checks)

| # | Check | Criterion |
|---|-------|-----------|
| 20 | ROIC > 15% | op_income × 0.79 / (total_debt + total_equity) > 0.15 |
| 21 | Owner Earnings > 0 | net_income + D&A + capex > 0 |
| 22 | Intangibles < 10% | intangible_assets / total_assets < 0.10 |
| 23 | Debt Payoff < 4 Years | total_debt / net_income < 4.0 |
| 24 | $1 Retained Test | (mktcap[year0] − mktcap[year4]) / abs(sum_retained_earnings) ≥ 1.0 |

**Bank exclusions:** checks 1 (Cash/Debt), 2 (Debt/Equity), and 17 (FCF Growth) are skipped when `financial=True`. Health score denominator adjusts accordingly so score isn't penalised for skipped checks.

---

### `pipeline/scoring/layer4_final.py`

Combines the three layer scores into a final score and signal (see signal gate table in §1).

```
final_score = ppm_score × 0.40 + growth_score × 0.30 + health_score × 0.30
```

Signal determination is described in full in §1 Architecture at a Glance.

---

### `pipeline/scoring/pe_ratios.py`

Runs **once after all tickers are scored**, not per ticker. Reads `stock_fundamentals` and `stock_prices` from Supabase, computes per-ticker ratios and market-cap-weighted sector averages, then writes back to `stock_scores`.

- **pe_ratio:** current `market_cap / net_income` (split-neutral; avoids price-per-share issues).
- **pe_5y_avg:** mean of `market_cap_at_year / net_income` over up to 5 years (excludes years where NI ≤ 0).
- **fcf_yield** / **fcf_5y_avg:** FCF / market_cap equivalents.
- **div_yield** / **div_5y_avg:** dividends / market_cap; null for non-payers.
- **Sector averages:** market-cap weighted, domestic tickers only (foreign ADRs excluded unless in `_CURRENCY_NORMALIZED_ADRS`).

---

### `pipeline/scoring/spy_benchmark.py`

Fetches S&P 500 total-return index (`^SP500TR`) price history from yfinance and computes a blended CAGR:

```
blended_cagr = 5Y_CAGR × 0.25 + 10Y_CAGR × 0.50 + 20Y_CAGR × 0.25
```

This single number is passed to all four scoring layers and stored in every `stock_scores` row as `sp500_cagr`. When unavailable (yfinance failure or no FMP data), the signal gate falls back to fixed score thresholds (BUY ≥ 65, HOLD ≥ 40).

---

## 5. Scoring Pipeline

### How the layers connect

```
build_data_dict(ticker) → data_dict
    │
    ├─ score_ppm(data_dict, ticker, sp500_cagr) → ppm
    │       │
    │       └─ {score, m1_price, m2_price, m3_price, blended_price, cagr, ...intermediates}
    │
    ├─ score_growth(data_dict, sp500_cagr, ticker) → growth
    │       │
    │       └─ {score, revenue_cagr_3y/5y, net_income_cagr, fcf_cagr, yoy_rates, signals}
    │
    ├─ score_health(data_dict) → health
    │       │
    │       └─ {score, passes, details[]}
    │
    └─ score_final(ppm, growth, health, sp500_cagr) → final
            │
            └─ {score, signal}
```

### What each score number means

| Score range | Meaning |
|-------------|---------|
| 0–39 | Poor — well below S&P 500 trajectory |
| 40–64 | Below average — roughly in line with or slightly behind market |
| 65–79 | Good — outpaces S&P 500, quality gate partially met |
| 80–100 | Excellent — strong outperformance with quality fundamentals |

The **final score** is not the signal. The signal is determined by the two-gate logic using the actual PPM CAGR and sp500_cagr, not the score. A stock can have final_score = 90 and signal HOLD if the PPM CAGR is between 1.0–1.2× S&P 500 with strong growth and health.

---

## 6. Key Business Logic Decisions

### 6.1 Financial sector exclusions

**Why:** Banks, insurers, and brokerage/custodial firms have balance sheets where traditional metrics break down. A bank's "debt" is depositors' money; its "FCF" includes loan originations. These numbers don't measure the same things as for an industrial company.

**How implemented (`is_financial()` in `scoring/utils.py`):**

```python
_PAYMENT_NETWORKS = frozenset({"credit services", "payment processing"})

def is_financial(profile):
    sector   = profile.get("sector", "").strip()
    industry = profile.get("industry", "").lower().strip()
    if any(kw in industry for kw in _PAYMENT_NETWORKS):
        return False      # carve-out: V, MA, PYPL, Amex
    return sector in ("Financials", "Financial Services") or "bank" in industry
```

**What the flag suppresses:**
- **M2 (P/FCF):** excluded — FCF dominated by float movements, not business earnings.
- **Health checks 1, 2, 17** (Cash/Debt, Debt/Equity, FCF Growth): excluded — these would always fail due to deposit-funded balance sheets.

**Payment network carve-out (`_PAYMENT_NETWORKS`):** V, MA, PYPL (via "credit services" / "payment processing" industry match) are classified as financial services but have **clean, capital-light FCF** — no customer float in OCF. They receive M2 scoring normally.

**Bank mode (`bank_mode=True` in run_sec.py):** sets `ebitda = net_income` and `net_debt = 0` inside the data dict. This makes M1 use P/E (market_cap / net_income) as the multiple instead of EV/EBITDA, which is the standard method for bank valuation. Bank tickers: JPM, BAC (detected via `"bank"` in industry string).

**REIT mode:** sets `ebitda = net_income + D&A` (FFO proxy) and `net_debt = 0`.

**Financial mode** (non-bank financial services): sets `ebitda = pretax_income` and `net_debt = 0`.

### 6.2 Float-distorted ticker handling

**Why:** PYPL and HOOD hold billions in customer funds (PYPL: payment settlement float; HOOD: custodied brokerage assets, securities lending collateral) that appear as liabilities on their XBRL balance sheets. This inflates computed `net_debt`, making EV calculations meaningless and M1 valuations wildly wrong.

**Tickers:** `FLOAT_DISTORTED_TICKERS = frozenset({"PYPL", "HOOD"})` in `layer1_ppm.py`.

**How implemented:**
1. M1 EV/EBITDA is skipped entirely; `r1 = None`.
2. `_pe_intrinsic()` runs instead: project net_income forward, apply trimmed-median historical P/E from year-end market caps.
3. **Shares:** pulled from `data["balance"][0]["weightedAverageShsOutDil"]` (SEC XBRL FY-end diluted shares), not `mktcap/price`. The `mktcap/price` derivation would make pe_price circular — a depressed stock would imply fewer shares and thus a higher pe_price regardless of fundamentals.

**Why PYPL is not `is_financial()`:** PYPL's industry in yfinance is "Credit Services", which is in `_PAYMENT_NETWORKS`. Its FCF is clean (payment float is stable; OCF closely tracks NI). The float distortion only affects the *balance sheet net_debt*, not the operating cash flows. So PYPL stays in the payment-network carve-out (M2 runs) but gets the P/E substitute for M1.

**Why HOOD's M2 is still excluded:** HOOD's industry per yfinance is "Capital Markets", which is not in `_PAYMENT_NETWORKS`, so `is_financial()` returns True. Beyond the classification, HOOD's OCF is genuinely contaminated by custodial float: securities lending transactions, customer payables, and settlement receivables each swing by $1–4B/year, dwarfing HOOD's operating earnings. The skip is correct on the merits.

### 6.3 REIT and bank mode overrides

Detected per-ticker by `_resolve_sector_mode()` in `run_sec.py`, which queries the `stocks` table for sector/industry strings.

| Sector / Industry contains | Mode set | EBITDA proxy | Net debt |
|---------------------------|----------|--------------|----------|
| "REIT" or "Real Estate" | `reit_mode` | NI + D&A (FFO) | 0 |
| "bank" in industry | `bank_mode` | net_income | 0 |
| Other Financial Services (not payment network) | `financial_mode` | pretax_income | 0 |

Zeroing net_debt prevents the EV subtraction from producing nonsensical equity values for firms where "debt" is structurally part of the business model (deposits, loan funding, lease structures).

### 6.4 Currency conversion for foreign tickers

**TSM (Taiwan Semiconductor):** Reports financials in TWD. All monetary fields in the normalised `flat_years` dict are divided by the hardcoded rate **31.5** before any scoring. Shares and EPS are excluded from conversion. TSM is in `_CURRENCY_NORMALIZED_ADRS`, so it participates in sector P/E averages despite having a non-null `country`.

Other foreign ADRs (non-null `country` in `stocks` table, not in `_CURRENCY_NORMALIZED_ADRS`) are excluded from sector P/E / FCF / dividend averages because their financials are in non-USD currencies.

The FMP pipeline uses `_fx_to_usd(currency)` (live exchangerate-api.com lookup) for any non-USD reported currency at scoring time.

### 6.5 Anomaly (hazard) detection

Flags sudden one-year or multi-year movements that may indicate a corporate event (merger, spinoff, restatement) rather than genuine operational trend:

| Metric | Spike threshold | Drop threshold |
|--------|----------------|----------------|
| Revenue | > +50% YoY | < −50% YoY |
| EBITDA | > +100% YoY | < −50% YoY |
| Total Assets | n/a | < −30% YoY |

Prior year must be ≥ $100M to trigger (avoids noise for tiny bases). Consecutive years of the same direction are collapsed into a single message. Result stored in `has_anomaly` (BOOLEAN) and `anomaly_reasons` (TEXT) on `stock_scores`.

### 6.6 EBITDA and EPS sanity corrections

**EBITDA unit mismatch:** SEC filings sometimes report D&A in thousands while operating_income is in dollars. `build_data_dict()` checks if `ebitda > revenue × 5` (impossible margin) and divides by 1000. Logged as WARNING.

**EPS post-split mismatch:** If a stock split occurred after the fiscal year end but before the 10-K filing, the XBRL EPS reflects pre-split shares. Detected by comparing raw EPS against `net_income / implied_shares` — if ratio > 5×, EPS is recalculated from NI and current implied shares. Logged to the `fix_log` table.

**EBITDA zero-fill:** If the D&A tag is missing for a year, EBITDA comes out as zero from the field_mapper. `build_data_dict()` checks each year and fills in the stored `stock_fundamentals` value (from a prior pipeline run) when available.

---

## 7. GitHub Actions Schedule

File: `.github/workflows/run-pipeline.yml`

### Weekly full run (cron, Mondays 00:00 UTC)

20 parallel jobs, each processing 25 tickers:

```yaml
offsets: [0, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300, 325, 350, 375, 400, 425, 450, 475]
command: python3 sec/run_sec.py --offset N --limit 25
```

- Python 3.11 on ubuntu-latest
- 30-minute timeout per job
- `fail-fast: false` — all workers run even if some fail
- Secrets: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

### Manual single-ticker dispatch

```yaml
workflow_dispatch:
  inputs:
    tickers: "AAPL MSFT"  # space-separated
```

Runs `run_sec.py --tickers AAPL MSFT` in a single job.

---

## 8. Frontend

Built with **Next.js 14 App Router**, **Supabase Auth**, **Stripe**, **Tailwind CSS**. Terminal-green aesthetic (monospace font, black background, `#00ff41` green).

### Routes

| Path | Description |
|------|-------------|
| `/` | Redirects to `/screener` |
| `/screener` | Main stock screener table |
| `/screener/[ticker]` | Stock detail page (all 4 layers) |
| `/compare` | Side-by-side ticker comparison |
| `/market` | Sector-level trends and breadth |
| `/pricing` | Freemium tier options |
| `/login`, `/signup` | Auth pages |
| `/account` | Profile and subscription management |
| `/watchlist` | Saved tickers |
| `/admin/health` | Pipeline health dashboard (admin only) |
| `/api/trial/*` | Trial start/extend/expire/verify-phone endpoints |

### Access tiers

| Tier | Screener rows | Detail pages |
|------|---------------|--------------|
| Free | 5 stocks/day (deterministic daily shuffle) | Paywalled |
| Trial | All stocks (5 min window, +15 min extension) | Unlocked during trial |
| Pro | All stocks | Unlocked |

**Free stock selection (`lib/free-stocks.ts`):** Seed based on UTC date (`year × 10000 + month × 100 + day`). Linear-congruential PRNG. Selects 2 BUY+/BUY stocks + 3 others = 5 total. Same set all day; changes each day. Randomizes display order per request (force-dynamic SSR).

### Screener table (`components/ui/ScreenerTable.tsx`)

8 columns with per-column filter controls, persisted to localStorage:

| Column | Filters available |
|--------|-----------------|
| SIGNAL | is: BUY+, BUY, HOLD, SELL |
| CAGR | ≥ / ≤ threshold, ↑ / ↓ sort |
| RETURN (blended/current price ratio) | ≥ / ≤, ↑ / ↓ |
| GROWTH (0–100) | ≥ / ≤, ↑ / ↓ |
| HEALTH (passes/24) | ≥ / ≤, ↑ / ↓ |
| TICKER | A→Z, Z→A |
| COMPANY | A→Z, Z→A |
| HAZARD | Show only anomalies / Exclude anomalies |

Signal colours: BUY+ bright green, BUY dimmer green, HOLD amber, SELL red. Growth scored as 1–5 stars (≥80, ≥60, ≥40, ≥20, <20). Health passes colour-coded (≥18 green, ≥12 amber, <12 red).

### Stock detail page (`app/(dashboard)/screener/[ticker]/page.tsx`)

Server-side rendered. Fetches: `stocks`, `stock_prices`, `stock_scores`, `stock_fundamentals` (5 years). Checks access (pro / trial / daily-free). Shows paywall if locked.

If unlocked, renders four collapsible sections:

**Layer 1 — Valuation Methods:**
- M1, M2, M3 projected prices (or "N/A" if excluded)
- Which method was used (EV/EBITDA or P/E intrinsic for float-distorted)
- Blended price, 5-year CAGR, return multiple
- Intermediates: growth rate, multiple applied, current/projected metric

**Layer 2 — Growth Trend:**
- Revenue, NI, FCF CAGRs (3Y and 5Y)
- YoY rates table (newest→oldest)
- Quality signals per metric and master signal
- Growth multiplier applied

**Layer 3 — Health (4 collapsible sub-sections):**
- 5Y Balance Sheet (7 checks)
- 5Y Income Statement (7 checks)
- 5Y Cash Flow (5 checks)
- Business Traits (5 checks)
- Per-check score, pass/fail, how many of 5 years passed

**Layer 4 — Final:**
- Weighted average breakdown
- Signal vs S&P 500 benchmark

**Below the folds:**
- Fundamentals table (5 years: revenue, GP, EBITDA, OI, NI, EPS, margins, ratios)
- P/E, FCF yield, dividend yield vs sector average
- Segment breakdown (product/geo, if available, with 5Y CAGR per segment)

### 8.x Design System Conventions

**Terminal-green aesthetic.** Black background (`#000`), monospace font throughout. `#00ff41` is the primary accent color. Labels and headers use small-caps (`font-variant: small-caps`). Avoid introducing secondary color schemes — the aesthetic is intentional and consistent across all pages.

**Uniform box sizing for value cells.** Any table or grid of value cells must use a fixed width sized to the longest value in the column — never let cells auto-size to their own content. This prevents the layout from reflowing as data changes and keeps columns visually stable.

**Divider hierarchy.** Keep only intentional, clearly-visible structural dividers (full-width `border-t` or `<hr>`). Do not add low-opacity row-separator lines between rows that are already visually separated by spacing or arrow glyphs — they add visual noise without structural meaning.

**Signal colors are reserved.** The signal color mapping is:

| Signal | Color |
|--------|-------|
| BUY+ / BUY | Green family (`#00ff41` or dimmer greens) |
| HOLD | Amber |
| SELL | Red |

Never reuse these specific colors for an unrelated UI state — e.g. an active toggle, a mode indicator, or a selected tab. Use a distinct accent color (e.g. blue or a custom tint) so the signal semantic isn't diluted.

**No internal jargon in user-facing copy.** Pipeline-internal model names must be translated before reaching the UI:

| Pipeline term | Display as |
|---------------|------------|
| M1 | EBITDA |
| M2 | FCF |
| M3 | Dividends |

The column headers, tooltips, labels, and any visible copy on detail or screener pages must use the display names. The pipeline-internal names (M1/M2/M3) are code-level identifiers only.

---

## 9. Constants & Thresholds Reference

| Location | Constant | Value | Purpose |
|----------|----------|-------|---------|
| `config.py` | `PPM_WEIGHT` | 0.40 | Layer 1 weight in final score |
| `config.py` | `GROWTH_WEIGHT` | 0.30 | Layer 2 weight |
| `config.py` | `HEALTH_WEIGHT` | 0.30 | Layer 3 weight |
| `config.py` | `BUY_THRESHOLD` | 65 | Signal fallback (no benchmark) |
| `config.py` | `HOLD_THRESHOLD` | 40 | Signal fallback |
| `layer1_ppm.py` | `_YEARS` | 5 | Projection horizon (years) |
| `layer1_ppm.py` | `_EV_EBITDA_FALLBACK` | 16.0× | M1 multiple when no history |
| `layer1_ppm.py` | `_P_FCF_FALLBACK` | 25.0× | M2 multiple when no history |
| `layer1_ppm.py` | `_P_GIVEBACK_FALLBACK` | 22.0× | M3 multiple when no history |
| `layer1_ppm.py` | `_PE_MULTIPLE_FALLBACK` | 20.0× | P/E fallback for float-distorted |
| `layer1_ppm.py` | M1 EV/EBITDA clamp | 8–50× | Sanity bounds on multiple |
| `layer1_ppm.py` | M2 P/FCF clamp | 8–60× | Sanity bounds |
| `layer1_ppm.py` | M3 P/giveback clamp | 5–100× | Sanity bounds |
| `layer1_ppm.py` | P/E intrinsic clamp | 8–60× | Sanity bounds |
| `layer1_ppm.py` | M3 div yield gate | ≥ 4.5% | Minimum spot yield to activate M3 |
| `layer1_ppm.py` | M3 hist yield gate | ≥ 4.0% | Avg historical yield gate |
| `layer1_ppm.py` | M3 FCF ceiling | 90% of FCF | Cap on dividend growth |
| `layer1_ppm.py` | `FLOAT_DISTORTED_TICKERS` | {PYPL, HOOD} | Skip M1 EV/EBITDA |
| `layer4_final.py` | Price gate lower | 1.0× S&P CAGR | Below → SELL |
| `layer4_final.py` | Price gate upper | 1.2× S&P CAGR | Below → HOLD |
| `layer4_final.py` | BUY+ gate | 1.5× S&P CAGR | Premium signal |
| `layer4_final.py` | Quality: health | ≥ 16 passes | Required for BUY/BUY+ |
| `layer4_final.py` | Quality: growth | ≥ 40 score | Required for BUY/BUY+ |
| `utils.py` | `compute_gq` weights | [0.5, 1.0, 1.5, 2.0, 3.0] | Oldest→newest recency weights |
| `utils.py` | `compute_gq` CAGR floor | −sp500_cagr | Lower clamp |
| `utils.py` | `compute_gq` CAGR ceiling | sp500_cagr × 4 | Upper clamp |
| `utils.py` | `cagr_to_score` ceiling | 2.0× sp500_cagr | Score = 100 at this CAGR |
| `utils.py` | `_PAYMENT_NETWORKS` | {"credit services", "payment processing"} | FCF carve-out |
| `utils.py` | `trimmed_median` trim | drop highest+lowest if ≥ 4 values | Outlier resistance |
| `run_sec.py` | `_ANOMALY_MIN_BASE` | $100M | Min prior year to trigger anomaly check |
| `run_sec.py` | Revenue anomaly | ±50% YoY | Hazard flag threshold |
| `run_sec.py` | EBITDA anomaly | +100% / −50% YoY | Hazard flag threshold |
| `run_sec.py` | Asset drop anomaly | −30% YoY | Hazard flag threshold |
| `run_sec.py` | `_TWD_TICKERS` | {TSM} | Apply TWD → USD conversion |
| `run_sec.py` | `_TWD_RATE` | 31.5 | TWD per USD (hardcoded) |
| `pe_ratios.py` | `_CURRENCY_NORMALIZED_ADRS` | {TSM} | Include in sector P/E averages |
| `yf_client.py` | Split detection ratio | ≥ 1.8× | recent/historical shares → apply split adjustment |
| `yf_client.py` | Market cap sanity | $1B–$10T | Outside range → retry with +5d |
| Screener (frontend) | Free tier limit | 5 stocks/day | |
| Screener (frontend) | Trial duration | 5 min (300 s) | |
| Screener (frontend) | Trial extension | 15 min (900 s) | |

---

*Last updated: 2026-06-17. Update this file whenever any of the above values, file responsibilities, or schema columns change.*
