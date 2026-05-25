# StockSnack — Session Handoff Document
> Last updated: May 25, 2026. Carry this into every new chat alongside stocksnack-working-style.md.

---

## 1. PROJECT OVERVIEW
**Product:** StockSnack Screener — Buffett-style fundamental stock screener
**URL:** https://www.stocksnack.app
**Tagline:** "Which stock to pick? We got you!"
**Model:** Freemium — Free (5 stocks visible, blurred) / Pro $20/mo (all 20 stocks)

---

## 2. TECH STACK
| Layer | Tool |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (PKCE flow) |
| Payments | Stripe (test mode — webhook partially fixed, needs live mode) |
| Hosting | Vercel (Hobby plan) |
| Domain | stocksnack.app via Cloudflare (www redirects to non-www) |
| Email | Resend (hello@stocksnack.app) |
| Scoring Pipeline | Python — runs weekly via GitHub Actions |
| Data Sources | SEC EDGAR (fundamentals) + yfinance (prices, market cap) |
| Error Monitoring | Sentry |
| Analytics | PostHog |
| Uptime | UptimeRobot |
| Repo | github.com/stocksnack88/stocksnack.app |

---

## 3. CURRENT DATA STATUS
- SEC EDGAR pipeline live as of 2026-05-18
- Pipeline runs every Monday via GitHub Actions (parallel jobs — matrix strategy)
- 501 tickers (full S&P 500; TSM excluded — foreign filer)
- Last full pipeline run: 2026-05-19
- FMP dependency completely removed
- run.py kept as rollback backup only
- Segment data live in Supabase for most tickers
- Hazard flags live in Supabase for all tickers
- sp500_5y_return computed from Yahoo Finance directly
- verify.py: 470/501 clean, 44 FAIL, 59 WARN (as of 2026-05-25; next pipeline run expected to reach 490+)

---

## 4. HAZARD FLAG SYSTEM

Detection runs in `run_sec.py` after `normalise()`.

**Thresholds:**
- Revenue: >+50% or <-50% YoY → flag
- EBITDA: >+100% or <-50% YoY → flag
- Total assets: <-30% YoY → flag

Consecutive year anomalies consolidated:
`"Revenue spiked 3 consecutive years (FY2024-2026)"` instead of 3 separate reason strings.

**5/19 tickers flagged:**
- NVDA: AI boom — revenue tripled, EBITDA 6×
- TSLA: FY2022 delivery ramp +51% revenue
- XOM: Russia-Ukraine oil price spike FY2022
- CVX: Same oil price spike FY2022
- AMD: EBITDA collapsed -57% FY2022 then rebounded +114% FY2023

**Supabase columns added:**
- `has_anomaly BOOLEAN` default false
- `anomaly_reasons TEXT`

**UI:** ⚠️ amber icon next to ticker on:
- Screener table (next to ticker symbol)
- Stock detail page header (next to signal badge)
- Tooltip on hover shows consolidated reasons

**Files added:**
- `HazardTooltip.tsx` — amber tooltip component
- Migration: `20260519000000_add_hazard_flags.sql`

---

## 5. SCORING ENGINE (4 Layers)

### Layer 1 — PPM (Price Projection Model) — 40% weight
- M1: EBITDA × trimmed median EV/EBITDA multiple → projected price
- M2: FCF × trimmed median P/FCF multiple → projected price (skipped for financial sector)
- M3: Dividend growth → projected price (only if yield ≥ 4.5% AND 5Y consecutive dividend history)
- Growth rate: n8n recency-weighted YoY (weights 0.5→3.0), dynamic clamp: floor=-S&P CAGR, ceiling=4×S&P CAGR
- Multiple: trimmed historical median (drops highest/lowest years)
- P/FCF fallback: 25× when FMP returns null (KNOWN BUG — should compute market_cap/fcf instead)

### Layer 2 — Growth Quality — 30% weight
- Metrics: Revenue, Net Income, FCF (5Y each)
- Method: n8n recency-weighted YoY → cagr_to_score(sp500_cagr)
- Signal multipliers: Solid(×1.0) / Slowing(×0.90) / Decelerating(×0.75) / Deteriorating(×0.50) / Freefall(×0.40)
- FCF viability gate: 5Y sum must be positive, else score=0
- Banks excluded from FCF scoring (JPM, BAC)
- Benchmark: dynamic S&P CAGR (fetched live from Yahoo Finance)

**Layer 2 — 3 independent scoring steps:**
1. CAGR — recency-weighted (recent years weight 3.0, oldest weight 0.5). Measures growth magnitude.
2. Benchmark — CAGR vs S&P 500. Converts to 0-100 score. 1.5× S&P = 100%, 1.0× S&P = 50%, 0% = 30%
3. Trend penalty — early vs recent half comparison. Detects if momentum is improving or worsening. Applied as multiplier to final score.
   Signal labels: Solid(×1.0) Slowing(×0.90) Decelerating(×0.75) Deteriorating(×0.50) Freefall(×0.40)

Master signal = worst of Revenue, EBITDA, FCF.

### Layer 3 — Financial Health — 30% weight
- 24 Buffett-style pass/fail checks across 4 categories
- BS (7): Cash/Debt, Debt/Equity, Preferred Stock, Retained Earnings, Buybacks, ROE, ROTA
- IS (7): Gross Margin, SG&A, R&D, Interest, Tax Rate, Net Margin, EPS Growth
- CF (5): SBC, OCF>NI, FCF Growth, CapEx, Payout Ratio
- BT (5): Consistent Earnings, No Dilution, Intangibles, Debt Payoff, $1 Retained
- Banks: Cash/Debt, Debt/Equity, FCF Growth marked NOT SCORED (excluded from denominator)

### Layer 4 — Final Score
- weighted average: PPM(40%) + Growth(30%) + Health(30%)
- Signal thresholds (vs sp500_cagr):
  - BUY+: ≥ 1.5× S&P AND health≥16 AND growth≥40
  - BUY:  ≥ 1.2× S&P AND health≥16 AND growth≥40
  - HOLD: ≥ 1.0× S&P
  - SELL: < 1.0× S&P

---

## 6. STOCK UNIVERSE
19 stocks (TSM removed permanently):
NVDA, META, JPM, NFLX, GOOGL, MSFT, JNJ, AMD, V, AMZN, BAC, COST, AAPL, WMT, KO, CVX, ABBV, XOM, TSLA

**Special handling:**
- TSM: removed — foreign filer, no US SEC EDGAR filing
- JPM/BAC: P/E used instead of EV/EBITDA, netDebt=0 in M1 — bank methodology
- V: shares_outstanding permanent XBRL gap, yfinance fallback active
- JNJ: pre-tax income used as operating_income proxy — Kenvue spinoff broke standard tag
- BAC: no product segments — banking taxonomy uses different revenue structure

---

## 7. SEGMENT DATA COVERAGE
17/19 tickers have segment data in Supabase.
Source: XBRL instance XML from SEC 10-K filings.

Coverage:
```
NVDA  — 7 product / 4 geo
GOOGL — 3 product / 4 geo
AAPL  — 5 product / 3 geo
MSFT  — 12 product / 2 geo
AMZN  — 7 product / 5 geo
META  — 2 product / 5 geo
TSLA  — 9 product / 3 geo
WMT   — 3 product / 2 geo
JPM   — 3 product / 5 geo
XOM   — 3 product / — geo
V     — 5 product / 2 geo
AMD   — 3 product / 5 geo
JNJ   — 2 product / 5 geo
COST  — 5 product / 3 geo
CVX   — 2 product / — geo
BAC   — — product / 5 geo
NFLX  — 1 product / 1 geo
ABBV  — 1 product / 12 geo
KO    — 2 product / 2 geo
```

Axes used:
- srt:ProductOrServiceAxis (product lines)
- us-gaap:StatementBusinessSegmentsAxis (business divisions — GOOGL, META, JPM, WMT)
- srt:StatementGeographicalAxis (geographic)

---

## 8. STOCK DETAIL PAGE STRUCTURE
File: `/Users/tzq/stocksnack.app/app/(dashboard)/screener/[ticker]/page.tsx`

Top to bottom:
1. Breadcrumb ← SCREENER
2. Company header — Ticker + BUY+/BUY/HOLD/SELL badge + name + sector/industry/exchange
3. WHAT YOU ARE BUYING card — 5Y Return vs S&P / CAGR vs S&P / Growth Quality % / Financial Health X/24 (all colored by performance)
4. TSM Price In 5 Years card — CURRENT → CAGR + multiple → PROJECTED (5Y) + S&P comparison row (colored winner/loser)
5. ABOUT THE BUSINESS — company description [+/-] toggle / PRODUCT BREAKDOWN collapsible / GEOGRAPHIC BREAKDOWN collapsible
6. LAYER 1 — HOW WE PROJECT THE PRICE
   - Summary bar: ~X% PER YEAR · ~Xx RETURN
   - CSS grid (flat, 39 direct children = 13 rows × 3 cols) with items-start
   - M1: EARNINGS GROWTH / M2: FREE CASH FLOW / M3: DIVIDEND GROWTH
   - Each method: Step[1] Current Price → Step[2] Current metric → Growing at X% → Step[3] Projected 5Y → At Xx multiple → Step[4] Est Future Price → +dividends → Step[5] Total Return Price
   - NOT APPLICABLE state collapses M2/M3 to header only
   - Bottom: PROJECTED RETURN SCORE section with big % + formula line (TICKER CAGR ÷ S&P CAGR = ratio → score%) + 5-zone benchmark bar
7. LAYER 2 — GROWTH QUALITY
   - HISTORICAL GROWTH TREND section with 3 bar charts (Revenue, EBITDA, FCF)
   - Each chart: metric label + CAGR badge left + benchmark label right (Exceptional/Strong/Solid/Moderate/Declining) + regression trend line
   - FCF: slope badge instead of CAGR badge
   - Bottom: GROWTH QUALITY SCORE section with mini scorecard (3 bars + trend penalty)
8. LAYER 3 — FINANCIAL HEALTH
   - Header: 16/24 big + 66.7% big + progress bar (all colored by score)
   - 4 collapsible categories with [DATA] [INFO] buttons
   - Each check: metric name + years + PASS/FAIL badge + explanation line (colored green/red)
   - Banks: NOT SCORED badge + muted explanation
9. LAYER 4 — FINAL SCORE
   - 3 component boxes (Projected Return / Growth Quality / Financial Health) with weights + scores
   - Converging arrows → FINAL SCORE X.X% → BUY+/BUY/HOLD/SELL badge

---

## 9. PIPELINE STATUS

New pipeline files (pipeline/sec/):
- `sec_client.py` — SEC EDGAR HTTP client, CIK cache auto-downloads if missing
- `tag_mapping.csv` — hand-curated XBRL tag config, priority ordering, confirmed dates
- `field_mapper.py` — extracts fields with staleness check, value dedup, D&A component summing, computed fields (FCF, EBITDA, gross_profit, total_liabilities)
- `normalizer.py` — converts SEC data to scoring layer format, per-field independent year selection
- `yf_client.py` — yfinance wrapper, fiscal year price alignment, stock split detection and adjustment, get_shares_per_year() with 3-source fallback
- `run_sec.py` — new pipeline conductor, bank overrides (P/E + netDebt=0), --dry-run flag, exits code 1 only if >2 tickers fail
- `segment_extractor.py` — extracts product and geographic segment data from XBRL instance XML files in 10-K filings. Pure Python, no AI, no third-party library.

Generated files (local only, not in GitHub):
- pipeline/sec/extracted_data.csv
- pipeline/sec/missing_log.csv
- pipeline/sec/cik_cache.json

Kept files (do not touch):
- pipeline/run.py — FMP backup, rollback only
- pipeline/fmp_client.py — FMP backup
- pipeline/scoring/ — all scoring layers completely unchanged

---

## 10. KNOWN DATA GAPS

Signal match vs FMP baseline: 14/19
Remaining methodology differences (not bugs):
- AMD: stock rose 600% since 2021, historical EV cheap → SEC shows BUY+, FMP shows SELL
- NFLX: 10:1 split Nov 2025, historical prices look cheap → SEC shows BUY+, FMP shows HOLD
- COST/AMZN: lower historical multiples in 2021-2022 → SEC PPM higher than FMP
- JNJ: pre-tax income proxy → PPM gap vs FMP

Known permanent field gaps:
- V: shares_outstanding — Visa never filed any share count tag in XBRL since 2010
- Interest expense: stale across many tickers, InterestExpenseNonoperating added as P2
- BAC: no product segments — banking revenue taxonomy different from standard
- XOM/CVX: no geo segments — energy sector uses different geographic taxonomy
- MSFT: 12 product segments may include some granular sub-segments worth reviewing

---

## 10b. KNOWN ISSUES — POST S&P 500 EXPANSION (as of 2026-05-25)

### Data gaps (parked — no fix available)
- **PCG** — no D&A tag with 364-day 10-K data for 2022–2024 in XBRL. Genuine EDGAR gap; no workaround.
- **MRNA** — negative EBITDA (R&D-heavy loss years). M1 correctly returns None. Not a bug.

### Fixes pushed, not yet reprocessed by pipeline
- **PEG** — `CostOfGoodsAndServicesSoldDepreciationAndAmortization` added at P2 (2026-05-25). Dry-run confirmed 5Y D&A ($1.1B–$1.3B) and EBITDA. Will populate on next Monday run.
- **LEN** — `DepreciationAmortizationAndAccretionNet` now correctly reached; fixed `tags[4]` hardcoded index bug → `for p5 in tags[4:]`. Next run will fix.
- **CASY** — `IncomeLossAttributableToParent` added at P5 as operating_income substitute. Next run will fix.
- **AEE / XEL** — D&A gap tag added (P5); staleness fallback path needs pipeline rerun.

### Stale Supabase values (not bugs — will self-heal on next run)
- **25 tickers** (WMT, CVS, CNC, DE, etc.) — `m1_ebitda_current` in stock_scores is 0 or stale. EBITDA is correctly extracted in extracted_data.csv but Supabase was written before EBITDA availability. Next Monday pipeline run will fix all 25.

### Code bug not yet fixed
- **ANET** — misclassified as financial sector in `_resolve_sector_mode()`. M2 and M3 are being skipped; UI shows wrong sector treatment. Fix: check Supabase `sector` column for ANET and ensure it is not matching the financial sector query.

### Pending features not yet built
- **sector_override UI labels** — override data is in Supabase `sector_override` column; frontend display not built
- **GR bar chart** — YoY growth rate as separate chart; concept approved, not built
- **Login page** — show/hide password toggle not built
- **All 4 layers collapsible** — Layer 4 open by default; not built

---

## 11. UI CHANGES SHIPPED

**Layer 1:**
- M3 now shows "At X.X% dividend yield" instead of "At Xx price/dividend multiple"
  Source: m3_div_yield stored in pipeline
- Score bar: ends at 1.5× S&P (BUY+ threshold)
  Four zones — SELL 40% / HOLD 8% / BUY 12% / BUY+ 40%. Needle piecewise linear.
  Labels rotate 45°
- S&P 5Y multiplier: fixed, now computes from Yahoo Finance directly

**Layer 2:**
- Bar charts: first column shows "Growth →" and "YoY %" as right-aligned legend labels
  Year moved to bottom of each column
  Absolute change and YoY % shown below value
  Green if positive, red if negative
- Growth Quality Score: pts → %, CAGR shown left of bar, raw score row added, left-aligned
  formula block with colon-aligned labels

**Layer 2 additional fixes:**
- Bar chart Growth $ and YoY% values: bright green (positive) / bright red (negative)
  instead of muted green
- Signal label on each metric row changed from internal trend signal to S&P benchmark label:
  - ≥1.5× S&P → Exceptional
  - ≥1.2× S&P → Strong
  - ≥1.0× S&P → Solid
  - ≥0        → Moderate
  - <0        → Declining
- Stars removed from metric rows — were causing confusion (showed trend quality not S&P comparison)
- Trend signal still used internally for penalty and shown at bottom:
  "Trend penalty: Decelerating (×0.75 applied to raw score)"

**Hazard flags:**
- ⚠️ amber icon added to screener table (next to ticker symbol)
- ⚠️ amber icon added to stock detail page header (next to signal badge)
- Hover tooltip shows consolidated anomaly reasons
- `HazardTooltip.tsx` component created

---

## 12. AUTH & PAYMENTS STATUS

**Stripe:**
- Test mode keys only (sk_test_, pk_test_)
- Webhook URL updated to https://www.stocksnack.app/api/webhook (was causing 307 redirect)
- Webhook upsert fix deployed (was .update() → .upsert() — was silently failing for new users)
- Supabase trigger added: auto-creates user_profiles row on signup
- NOT YET LIVE — needs business verification on Stripe for live mode

**Known accounts in DB:**
- mrepsiloned@gmail.com — has Stripe customer ID, manually set to active
- allyshakuga@gmail.com — needs to sign up through app to get auth row

**Auth flow:**
- Not signed in → PRICING + SIGN IN
- Signed in free → UPGRADE + ACCOUNT
- Signed in pro → ACCOUNT only (sign out inside account page)
- Account page: /account — shows plan, billing date, cancel option, sign out

**Still pending:**
- Stripe LIVE mode — business verification required
- GDPR delete account endpoint (inside account page)
- Test full purchase flow end-to-end with test card 4242 4242 4242 4242

---

## 13. PENDING UI TASKS
- ⬜ Verify M3 dividend column renders correctly (needs pipeline re-run)
- ⬜ Restore M3 4.5% gate after verification
- ⬜ P/FCF multiple fix (compute market_cap/fcf instead of FMP field)
- ⬜ Login page: show/hide password toggle
- ⬜ Pricing page narrative audit
- ⬜ All 4 layers collapsible/expandable (Layer 4 open by default)

---

## 14. NEXT MAJOR TASKS

**Completed:**
- ✅ SEC EDGAR migration — live 2026-05-18
- ✅ Segment extractor — live 2026-05-18
- ✅ Hazard flag system — live 2026-05-19
- ✅ UI fixes — growth charts, score bar, M3, hazard icons, benchmark labels

**Next tasks in priority order:**
1. verify.py — random 20-stock sample quality checker, internal sanity checks, runs periodically to catch data drift
2. tag_discovery.py — automated missing tag detection at scale, needed before S&P 500
3. S&P 500 expansion — 500 stocks
4. GR bar chart — YoY growth rate as separate bar chart (concept approved, not built)
5. Quarterly anticipation — pull 10-Q data, compare YTD current vs YTD prior year, project full year performance (post-launch)
6. Industry P/E average — better valuation context (post-launch)

---

## 15. HOW TO START NEXT CHAT

Paste both files into new chat:
1. `stocksnack-handoffv6.md` — this file
2. `stocksnack-working-style.md` — collaboration style

Then say: **"Continue from handoff. We are working on [current task]."**
