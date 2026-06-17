"""
Compute P/E, FCF yield, and dividend yield metrics for all tickers and write
to stock_scores.

Called once after the main per-ticker scoring loop so that sector averages
can be computed across the full dataset.

Columns written to stock_scores:
  pe_ratio          -- current_price / most_recent_eps  (null if EPS <= 0)
  pe_5y_avg         -- avg(market_cap_at_year / net_income) over last 5 fiscal years
                       true historical P/E; excludes years where net_income <= 0
  industry_pe           -- market-cap-weighted avg of pe_ratio, per sector
  industry_pe_5y_avg    -- market-cap-weighted avg of pe_5y_avg, per sector
  fcf_yield             -- most_recent_fcf / current_market_cap
  fcf_5y_avg            -- avg(free_cash_flow / market_cap_at_year) over last 5 fiscal years
  industry_fcf_yield    -- market-cap-weighted avg of fcf_yield, per sector
  industry_fcf_5y_avg   -- market-cap-weighted avg of fcf_5y_avg, per sector
  div_yield             -- most_recent_dividends_paid / current_market_cap (null if no dividends)
  div_yield_5y_avg      -- avg(dividends_paid / market_cap_at_year) over last 5 years (null if no dividends)
  industry_div_yield    -- market-cap-weighted avg of div_yield, dividend payers only
  industry_div_yield_5y_avg -- market-cap-weighted avg of div_yield_5y_avg, dividend payers only
"""
from __future__ import annotations

import logging
from collections import defaultdict

log = logging.getLogger(__name__)


def compute_pe_ratios(client) -> None:
    """Read prices + fundamentals from Supabase, compute P/E + FCF + div metrics, write back."""

    # ── Bulk fetches ──────────────────────────────────────────────────────────
    fund_rows = (
        client.table("stock_fundamentals")
        .select("ticker, fiscal_year, eps, net_income, free_cash_flow, dividends_paid, market_cap_at_year")
        .execute()
        .data or []
    )
    price_rows = (
        client.table("stock_prices")
        .select("ticker, current_price, market_cap")
        .execute()
        .data or []
    )
    sector_rows = (
        client.table("stocks")
        .select("ticker, sector, country")
        .execute()
        .data or []
    )
    scores_rows = (
        client.table("stock_scores")
        .select("ticker")
        .execute()
        .data or []
    )

    # ── Lookup maps ───────────────────────────────────────────────────────────
    price_map  = {r["ticker"]: r["current_price"] for r in price_rows if r.get("current_price")}
    mktcap_map = {r["ticker"]: r["market_cap"]    for r in price_rows if r.get("market_cap")}
    # Exclude foreign-listed ADRs (country IS NOT NULL) from sector averages
    # AND from per-ticker ratios: their financials are in foreign currencies and
    # produce currency-mismatched P/E values (e.g. TSM EPS in TWD vs price in USD).
    foreign_tickers = {r["ticker"] for r in sector_rows if r.get("country") is not None}
    sector_map = {
        r["ticker"]: r["sector"]
        for r in sector_rows
        if r.get("sector") and r.get("country") is None
    }

    # Group fundamentals by ticker, sorted newest fiscal year first
    fund_by_ticker: dict[str, list[dict]] = defaultdict(list)
    for row in fund_rows:
        if row.get("fiscal_year") is not None:
            fund_by_ticker[row["ticker"]].append(row)
    for rows in fund_by_ticker.values():
        rows.sort(key=lambda r: r["fiscal_year"], reverse=True)

    # ── Per-ticker metrics ────────────────────────────────────────────────────
    ticker_metrics: dict[str, dict] = {}

    for row in scores_rows:
        ticker = row["ticker"]
        price  = price_map.get(ticker)
        mktcap = mktcap_map.get(ticker)
        rows   = fund_by_ticker.get(ticker, [])

        result: dict = {
            "pe_ratio":        None,
            "pe_5y_avg":       None,
            "fcf_yield":       None,
            "fcf_5y_avg":      None,
            "div_yield":       None,
            "div_yield_5y_avg": None,
        }

        # Foreign ADRs report financials in non-USD currencies — skip all ratios.
        if ticker in foreign_tickers:
            ticker_metrics[ticker] = result
            continue

        # pe_ratio: current market cap / most recent positive net income.
        # Using absolute values (not price/EPS) makes this split-neutral: stock
        # splits change price and EPS by the same factor but leave mktcap and
        # net_income unchanged, so the ratio stays correct across splits.
        if mktcap and mktcap > 0:
            most_recent_ni = next(
                (r["net_income"] for r in rows if r.get("net_income") and float(r["net_income"]) > 0),
                None,
            )
            if most_recent_ni:
                result["pe_ratio"] = round(mktcap / float(most_recent_ni), 2)

        # pe_5y_avg: true historical P/E = avg(market_cap_at_year / net_income)
        # over last 5 fiscal years where both values are positive
        historical_pe = [
            float(r["market_cap_at_year"]) / float(r["net_income"])
            for r in rows[:5]
            if r.get("market_cap_at_year") and r.get("net_income")
            and float(r["market_cap_at_year"]) > 0
            and float(r["net_income"]) > 0
        ]
        if historical_pe:
            result["pe_5y_avg"] = round(sum(historical_pe) / len(historical_pe), 2)

        # fcf_yield: most recent free_cash_flow / current market_cap
        if mktcap and mktcap > 0:
            most_recent_fcf = next(
                (r["free_cash_flow"] for r in rows if r.get("free_cash_flow") is not None),
                None,
            )
            if most_recent_fcf is not None and float(most_recent_fcf) > 0:
                result["fcf_yield"] = round(float(most_recent_fcf) / float(mktcap), 6)

        # fcf_5y_avg: avg(free_cash_flow / market_cap_at_year) over last 5 years
        historical_fcf_yield = [
            float(r["free_cash_flow"]) / float(r["market_cap_at_year"])
            for r in rows[:5]
            if r.get("free_cash_flow") and r.get("market_cap_at_year")
            and float(r["free_cash_flow"]) > 0
            and float(r["market_cap_at_year"]) > 0
        ]
        if historical_fcf_yield:
            result["fcf_5y_avg"] = round(sum(historical_fcf_yield) / len(historical_fcf_yield), 6)

        # div_yield: most recent dividends_paid / current market_cap
        # null for non-dividend payers (dividends_paid absent or zero)
        # dividends_paid is stored as a negative outflow — use abs()
        if mktcap and mktcap > 0:
            most_recent_div = next(
                (r["dividends_paid"] for r in rows if r.get("dividends_paid") and abs(float(r["dividends_paid"])) > 0),
                None,
            )
            if most_recent_div is not None:
                result["div_yield"] = round(abs(float(most_recent_div)) / float(mktcap), 6)

        # div_yield_5y_avg: avg(dividends_paid / market_cap_at_year) over last 5 years
        # only years where dividends were actually paid; null if none
        # dividends_paid is stored as a negative outflow — use abs()
        historical_div_yield = [
            abs(float(r["dividends_paid"])) / float(r["market_cap_at_year"])
            for r in rows[:5]
            if r.get("dividends_paid") and r.get("market_cap_at_year")
            and abs(float(r["dividends_paid"])) > 0
            and float(r["market_cap_at_year"]) > 0
        ]
        if historical_div_yield:
            result["div_yield_5y_avg"] = round(sum(historical_div_yield) / len(historical_div_yield), 6)

        ticker_metrics[ticker] = result

    # ── Sector averages (market-cap weighted) ────────────────────────────────
    # Each bucket stores (metric_value, market_cap) pairs.
    Pair = tuple[float, float]
    sector_pe_pairs:     dict[str, list[Pair]] = defaultdict(list)
    sector_pe_5y_pairs:  dict[str, list[Pair]] = defaultdict(list)
    sector_fcf_pairs:    dict[str, list[Pair]] = defaultdict(list)
    sector_fcf_5y_pairs: dict[str, list[Pair]] = defaultdict(list)
    sector_div_pairs:    dict[str, list[Pair]] = defaultdict(list)
    sector_div_5y_pairs: dict[str, list[Pair]] = defaultdict(list)

    for ticker, m in ticker_metrics.items():
        sector = sector_map.get(ticker)
        mktcap = mktcap_map.get(ticker)
        if not sector or not mktcap or mktcap <= 0:
            continue
        if m["pe_ratio"] is not None and m["pe_ratio"] > 0:
            sector_pe_pairs[sector].append((m["pe_ratio"], mktcap))
        if m["pe_5y_avg"] is not None and m["pe_5y_avg"] > 0:
            sector_pe_5y_pairs[sector].append((m["pe_5y_avg"], mktcap))
        if m["fcf_yield"] is not None and m["fcf_yield"] > 0:
            sector_fcf_pairs[sector].append((m["fcf_yield"], mktcap))
        if m["fcf_5y_avg"] is not None and m["fcf_5y_avg"] > 0:
            sector_fcf_5y_pairs[sector].append((m["fcf_5y_avg"], mktcap))
        # Only include dividend payers so non-payers don't drag down the average
        if m["div_yield"] is not None and m["div_yield"] > 0:
            sector_div_pairs[sector].append((m["div_yield"], mktcap))
        if m["div_yield_5y_avg"] is not None and m["div_yield_5y_avg"] > 0:
            sector_div_5y_pairs[sector].append((m["div_yield_5y_avg"], mktcap))

    def _wavg(pairs: list[Pair], decimals: int) -> float | None:
        if not pairs:
            return None
        total_w = sum(w for _, w in pairs)
        if total_w == 0:
            return None
        return round(sum(v * w for v, w in pairs) / total_w, decimals)

    industry_pe_map          = {s: _wavg(p, 2) for s, p in sector_pe_pairs.items()}
    industry_pe_5y_map       = {s: _wavg(p, 2) for s, p in sector_pe_5y_pairs.items()}
    industry_fcf_map         = {s: _wavg(p, 6) for s, p in sector_fcf_pairs.items()}
    industry_fcf_5y_map      = {s: _wavg(p, 6) for s, p in sector_fcf_5y_pairs.items()}
    industry_div_map         = {s: _wavg(p, 6) for s, p in sector_div_pairs.items()}
    industry_div_5y_map      = {s: _wavg(p, 6) for s, p in sector_div_5y_pairs.items()}

    # ── Write back to stock_scores ────────────────────────────────────────────
    updates = []
    for row in scores_rows:
        ticker = row["ticker"]
        sector = sector_map.get(ticker)
        m      = ticker_metrics.get(ticker, {})
        updates.append({
            "ticker":                    ticker,
            "pe_ratio":                  m.get("pe_ratio"),
            "pe_5y_avg":                 m.get("pe_5y_avg"),
            "industry_pe":               industry_pe_map.get(sector)     if sector else None,
            "industry_pe_5y_avg":        industry_pe_5y_map.get(sector)  if sector else None,
            "fcf_yield":                 m.get("fcf_yield"),
            "fcf_5y_avg":                m.get("fcf_5y_avg"),
            "industry_fcf_yield":        industry_fcf_map.get(sector)    if sector else None,
            "industry_fcf_5y_avg":       industry_fcf_5y_map.get(sector) if sector else None,
            "div_yield":                 m.get("div_yield"),
            "div_yield_5y_avg":          m.get("div_yield_5y_avg"),
            "industry_div_yield":        industry_div_map.get(sector)    if sector else None,
            "industry_div_yield_5y_avg": industry_div_5y_map.get(sector) if sector else None,
        })

    if updates:
        client.table("stock_scores").upsert(updates).execute()
        log.info("P/E + FCF + dividend metrics written for %d tickers", len(updates))
    else:
        log.warning("No tickers in stock_scores — metric computation skipped")
