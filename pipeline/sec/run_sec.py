"""
StockSnack — SEC EDGAR parallel pipeline.

Mirrors pipeline/run.py exactly but sources data from SEC EDGAR + yfinance
instead of FMP. Does NOT touch run.py, fmp_client.py, or any scoring files.

Run:
    python run_sec.py                          # all S&P 500 tickers (cached)
    python run_sec.py --tickers AAPL MSFT      # specific tickers
    python run_sec.py --tickers AAPL --dry-run # score only, no Supabase writes
    python run_sec.py --limit 50               # first 50 tickers (testing)
"""
from __future__ import annotations

import argparse
import csv
import logging
import sys
import time
from pathlib import Path

# Allow imports from pipeline/ (scoring, supabase_writer, config)
_PIPELINE_DIR = Path(__file__).parent.parent
_SEC_DIR      = Path(__file__).parent
for _p in [str(_PIPELINE_DIR), str(_SEC_DIR)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from normalizer        import normalise
from yf_client         import get_profile, get_market_cap, get_historical_market_cap
from sec_client        import ticker_to_cik
from segment_extractor import get_segments

from scoring.layer1_ppm    import score_ppm
from scoring.layer2_growth import score_growth
from scoring.layer3_health import score_health
from scoring.layer4_final  import score_final
from scoring.spy_benchmark import compute_spy_benchmark
from scoring.pe_ratios     import compute_pe_ratios

from supabase_writer import SupabaseWriter
from config import SUPABASE_URL, SUPABASE_KEY

_SP500_CACHE     = _SEC_DIR / "sp500_tickers.csv"
_CACHE_TTL_DAYS  = 7


def _load_sp500_tickers() -> list[str]:
    """
    Return the current S&P 500 constituent ticker list.

    Fetches from Wikipedia on first call (or when cache is older than
    _CACHE_TTL_DAYS) and writes sp500_tickers.csv next to this file.
    Subsequent calls within the TTL window read from the cache file.

    Normalises Wikipedia dot-notation (BRK.B) to hyphen-notation (BRK-B)
    used by SEC EDGAR and yfinance.
    """
    import time as _time

    if _SP500_CACHE.exists():
        age_days = (_time.time() - _SP500_CACHE.stat().st_mtime) / 86400
        if age_days < _CACHE_TTL_DAYS:
            tickers = [
                line.strip() for line in _SP500_CACHE.read_text().splitlines()
                if line.strip()
            ]
            log.info(
                "S&P 500: loaded %d tickers from cache (%.1f days old)",
                len(tickers), age_days,
            )
            return tickers

    log.info("S&P 500: fetching constituent list from Wikipedia…")
    try:
        import pandas as pd
    except ImportError:
        raise RuntimeError(
            "pandas is required to fetch the S&P 500 list: pip install pandas lxml"
        )

    import io
    import requests as _req
    _wiki_url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    _wiki_headers = {"User-Agent": "StockSnack/1.0 hello@stocksnack.app"}
    resp = _req.get(_wiki_url, headers=_wiki_headers, timeout=15)
    resp.raise_for_status()
    tables  = pd.read_html(io.StringIO(resp.text))
    df      = tables[0]
    tickers = (
        df["Symbol"]
        .str.replace(".", "-", regex=False)
        .str.strip()
        .tolist()
    )

    _SP500_CACHE.write_text("\n".join(tickers) + "\n")
    log.info("S&P 500: fetched and cached %d tickers → %s", len(tickers), _SP500_CACHE)
    return tickers

_ANOMALY_MIN_BASE = 1e8   # $100M — skip comparisons where prior year < this


def check_hazard(data: dict) -> dict:
    """
    Detect sudden large movements in key financial metrics year-over-year.

    Returns {"has_anomaly": bool, "reasons": list[str]}
    Checks:
      revenue     — flag if YoY > +50% or < -50%
      ebitda      — flag if YoY > +100% or < -50%
      totalAssets — flag only drops > -30% (spinoffs, divestitures)

    Consecutive-year anomalies for the same metric+direction are consolidated:
      "Revenue spiked 3 consecutive years (FY2024, FY2025, FY2026)"
    Single-year anomalies keep the percentage:
      "EBITDA dropped 61% in FY2023"
    Never raises.
    """
    try:
        income  = data.get("income",  [])
        balance = data.get("balance", [])

        def year_of(row: dict) -> int:
            d = str(row.get("date", ""))
            return int(d[:4]) if len(d) >= 4 and d[:4].isdigit() else 0

        # Collect raw events as (label, direction, year, display_pct)
        raw_events: list[tuple[str, str, int, float]] = []

        def yoy_collect(
            rows: list[dict],
            field: str,
            spike_thr: float | None,
            drop_thr: float,
            label: str,
        ) -> None:
            pairs = [(year_of(r), _safe(r.get(field))) for r in rows if year_of(r) > 0]
            pairs = [(y, v) for y, v in pairs if v != 0.0]
            pairs.sort(key=lambda x: x[0])
            for i in range(1, len(pairs)):
                prev_y, prev_v = pairs[i - 1]
                curr_y, curr_v = pairs[i]
                if prev_v <= 0 or prev_v < _ANOMALY_MIN_BASE:
                    continue
                pct = (curr_v - prev_v) / prev_v
                if spike_thr is not None and pct > spike_thr:
                    raw_events.append((label, "spiked", curr_y, pct * 100))
                elif pct < drop_thr:
                    raw_events.append((label, "dropped", curr_y, abs(pct) * 100))

        yoy_collect(income,  "revenue",     0.50, -0.50, "Revenue")
        yoy_collect(income,  "ebitda",      1.00, -0.50, "EBITDA")
        yoy_collect(balance, "totalAssets", None, -0.30, "Total assets")

        # Group by (label, direction), preserving insertion order of first occurrence
        grouped: dict[tuple[str, str], list[tuple[int, float]]] = {}
        for label, direction, year, pct in raw_events:
            key = (label, direction)
            grouped.setdefault(key, []).append((year, pct))

        reasons: list[str] = []
        for (label, direction), year_pcts in grouped.items():
            year_pcts.sort(key=lambda x: x[0])
            years = [yp[0] for yp in year_pcts]

            # Split into consecutive runs
            runs: list[list[int]] = []
            cur: list[int] = [years[0]]
            for i in range(1, len(years)):
                if years[i] == years[i - 1] + 1:
                    cur.append(years[i])
                else:
                    runs.append(cur)
                    cur = [years[i]]
            runs.append(cur)

            for run in runs:
                if len(run) == 1:
                    y = run[0]
                    pct = next(p for yr, p in year_pcts if yr == y)
                    reasons.append(f"{label} {direction} {pct:.0f}% in FY{y}")
                else:
                    fy_str = ", ".join(f"FY{y}" for y in run)
                    reasons.append(
                        f"{label} {direction} {len(run)} consecutive years ({fy_str})"
                    )

        return {"has_anomaly": bool(reasons), "reasons": reasons}
    except Exception:
        return {"has_anomaly": False, "reasons": []}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_period_of_report(ticker: str) -> dict[int, str]:
    """Read {fiscal_year: period_of_report} from extracted_data.csv."""
    csv_path = _SEC_DIR / "extracted_data.csv"
    result: dict[int, str] = {}
    if not csv_path.exists():
        return result
    with csv_path.open(newline="") as f:
        for row in csv.DictReader(f):
            if row.get("ticker", "").upper() != ticker.upper():
                continue
            por = row.get("period_of_report", "").strip()
            if not por:
                continue
            try:
                fy = int(row["fiscal_year"])
                if fy not in result:
                    result[fy] = por
            except (KeyError, ValueError):
                pass
    return result


def _resolve_sector_mode(ticker: str, client=None) -> dict:
    """Query Supabase stocks table for sector/industry and return override mode flags."""
    _default = {
        "bank_mode":       False,
        "reit_mode":       False,
        "financial_mode":  False,
        "sector_override": None,
    }
    try:
        if client is None:
            from supabase import create_client
            client = create_client(SUPABASE_URL, SUPABASE_KEY)
        resp = (
            client.table("stocks")
            .select("sector, industry")
            .eq("ticker", ticker)
            .maybe_single()
            .execute()
        )
        row      = (resp.data or {})
        industry = (row.get("industry") or "").strip()
        sector   = (row.get("sector")   or "").strip()
    except Exception as exc:
        log.warning("[%s] Sector lookup failed (%s) — using standard mode", ticker, exc)
        return _default

    _industry_lower = industry.lower()
    _is_payment_network = any(kw in _industry_lower for kw in ("credit services", "payment processing"))
    bank_mode      = ("Banks" in industry or "Credit Services" in industry) and not _is_payment_network
    reit_mode      = "REIT" in industry
    financial_mode = sector == "Financial Services" and not bank_mode and not _is_payment_network

    if bank_mode:
        sector_override = "Bank"
    elif reit_mode:
        sector_override = "REIT"
    elif financial_mode:
        sector_override = "Financial"
    else:
        sector_override = None

    log.info(
        "[%s] Sector: %r / Industry: %r → override=%r",
        ticker, sector, industry, sector_override,
    )
    return {
        "bank_mode":       bank_mode,
        "reit_mode":       reit_mode,
        "financial_mode":  financial_mode,
        "sector_override": sector_override,
    }


# ── Data dict builder ─────────────────────────────────────────────────────────

# Tickers whose SEC EDGAR filings are denominated in a non-USD currency.
# All monetary flat_years fields are divided by the rate before list building
# so that scoring layers and stock_fundamentals always see USD values.
# epsdiluted is excluded here — the EPS sanity check handles it separately.
_TWD_TICKERS   = frozenset({"TSM"})
_TWD_RATE      = 31.5
_TWD_SKIP_KEYS = frozenset({"symbol", "date", "weightedAverageShsOutDil", "epsdiluted"})

_INCOME_FIELDS = {
    "symbol", "date",
    "revenue", "grossProfit", "operatingIncome", "netIncome", "epsdiluted",
    "sellingGeneralAndAdministrativeExpenses", "researchAndDevelopmentExpenses",
    "interestExpense", "incomeTaxExpense", "ebitda", "depreciationAndAmortization",
}

_BALANCE_FIELDS = {
    "symbol", "date",
    "cashAndCashEquivalents", "totalDebt", "totalStockholdersEquity",
    "totalAssets", "totalLiabilities", "retainedEarnings",
    "preferredStock", "goodwillAndIntangibleAssets", "weightedAverageShsOutDil",
    "currentAssets", "currentLiabilities",
}

_CASHFLOW_FIELDS = {
    "symbol", "date",
    "operatingCashFlow", "capitalExpenditure", "freeCashFlow",
    "stockBasedCompensation", "netDividendsPaid", "commonStockRepurchased",
}


def _safe(v, default=0.0) -> float:
    try:
        f = float(v)
        return f if f == f else default  # NaN check
    except (TypeError, ValueError):
        return default


def _fetch_supabase_ebitda(ticker: str, client) -> dict[int, float]:
    """Return {fiscal_year: ebitda} from stock_fundamentals for EBITDA zero-fill."""
    try:
        resp = client.table("stock_fundamentals") \
            .select("fiscal_year,ebitda") \
            .eq("ticker", ticker) \
            .execute()
        return {
            int(row["fiscal_year"]): float(row["ebitda"])
            for row in (resp.data or [])
            if row.get("ebitda") is not None and row.get("fiscal_year") is not None
        }
    except Exception as exc:
        log.warning("[%s] Supabase EBITDA lookup failed: %s", ticker, exc)
        return {}


def build_data_dict(ticker: str, years: int = 5, sector_mode: dict | None = None, client=None) -> dict:
    """
    Fetch SEC + yfinance data and assemble the exact data dict the scoring
    layers expect, mirroring the structure that fmp.fetch_all() produces.
    """
    _sm = sector_mode or {}
    log.info("[%s] Fetching SEC data…", ticker)
    flat_years = normalise(ticker, years=years)  # newest first

    if not flat_years:
        raise ValueError(f"No SEC data returned for {ticker}")

    # TWD → USD: divide all monetary fields before any list or metric building
    if ticker in _TWD_TICKERS:
        for yr in flat_years:
            for k in list(yr.keys()):
                if k not in _TWD_SKIP_KEYS:
                    v = yr[k]
                    if isinstance(v, (int, float)) and v != 0:
                        yr[k] = round(v / _TWD_RATE, 4)
        log.info("[%s] TWD→USD: divided all monetary fields by %.1f", ticker, _TWD_RATE)

    log.info("[%s] Fetching profile from yfinance…", ticker)
    profile       = get_profile(ticker)
    market_cap    = _safe(profile.get("marketCap"))
    price_raw     = _safe(profile.get("price"))
    implied_shares = market_cap / price_raw if (market_cap and price_raw and price_raw > 0) else None

    # ── Split flat year dicts into statement sub-lists ────────────────────────
    income_list:   list[dict] = []
    balance_list:  list[dict] = []
    cashflow_list: list[dict] = []

    for yr in flat_years:
        # --- income ---
        inc = {k: yr[k] for k in _INCOME_FIELDS if k in yr}
        # Aliases layer3 needs
        inc["eps"]            = yr.get("epsdiluted", 0.0)
        net_inc               = _safe(yr.get("netIncome"))
        tax                   = _safe(yr.get("incomeTaxExpense"))
        inc["incomeBeforeTax"] = net_inc + tax
        income_list.append(inc)

        # --- balance ---
        bal = {k: yr[k] for k in _BALANCE_FIELDS if k in yr}
        # Aliases layer1/layer3 need
        bal["totalEquity"]     = yr.get("totalStockholdersEquity", 0.0)
        bal["intangibleAssets"] = yr.get("goodwillAndIntangibleAssets", 0.0)
        cash_  = _safe(yr.get("cashAndCashEquivalents"))
        debt_  = _safe(yr.get("totalDebt"))
        bal["netDebt"] = debt_ - cash_
        balance_list.append(bal)

        # --- cashflow ---
        cf = {k: yr[k] for k in _CASHFLOW_FIELDS if k in yr}
        # Layer1 M3 reads "dividendsPaid" (FMP name); our SEC name is "netDividendsPaid"
        cf["dividendsPaid"] = yr.get("netDividendsPaid", 0.0)
        cashflow_list.append(cf)

    # ── Supabase EBITDA zero-fill ─────────────────────────────────────────────
    # When SEC XBRL produces ebitda=0 (e.g. D&A tag missing for a year), fall back
    # to the stored stock_fundamentals value which may come from FMP or a prior run.
    if client is not None:
        sb_ebitda = _fetch_supabase_ebitda(ticker, client)
        if sb_ebitda:
            for yr_dict, inc in zip(flat_years, income_list):
                fy = int(yr_dict["date"][:4])
                if _safe(inc.get("ebitda")) == 0 and fy in sb_ebitda:
                    log.info("[%s] FY%d EBITDA=0 from XBRL → using Supabase value: %g",
                             ticker, fy, sb_ebitda[fy])
                    inc["ebitda"] = sb_ebitda[fy]

    # ── EBITDA sanity check ───────────────────────────────────────────────────
    # SEC XBRL D&A can be reported in thousands while operatingIncome is in
    # dollars; field_mapper computes ebitda = operatingIncome + D&A, inflating
    # the result by ~1000×. Catch it by comparing against revenue (a 500% EBITDA
    # margin is impossible) and divide by 1000 to correct.
    for inc in income_list:
        eb = _safe(inc.get("ebitda"))
        rv = _safe(inc.get("revenue"))
        if rv > 0 and eb > rv * 5:
            corrected = eb / 1000
            log.warning(
                "[%s] EBITDA %.0f >> revenue %.0f — D&A unit mismatch suspected; corrected to %.0f",
                ticker, eb, rv, corrected,
            )
            inc["ebitda"] = corrected

    # ── EPS sanity check ─────────────────────────────────────────────────────
    # SEC EDGAR 10-K EPS values are pre-split: a stock split after fiscal year end
    # leaves the stored epsdiluted far above the market-implied per-share value.
    # Use yfinance's post-split market_cap/price to derive implied shares; if the
    # ratio exceeds 5× recalculate from net_income / implied_shares.
    if implied_shares and implied_shares > 0:
        for inc in income_list:
            raw_eps = _safe(inc.get("epsdiluted"))
            ni      = _safe(inc.get("netIncome"))
            if raw_eps > 0 and ni > 0:
                computed_eps = ni / implied_shares
                if computed_eps > 0 and raw_eps / computed_eps > 5:
                    corrected_eps = round(ni / implied_shares, 4)
                    factor = raw_eps / computed_eps
                    log.warning(
                        "[%s] EPS split mismatch: XBRL=%.2f  NI/implied_shares=%.4f "
                        "(factor %.1f×) — correcting to %.4f",
                        ticker, raw_eps, computed_eps, factor, corrected_eps,
                    )
                    inc["epsdiluted"] = corrected_eps
                    if client is not None:
                        try:
                            client.table("fix_log").insert({
                                "ticker":           ticker,
                                "issue":            "auto-corrected split mismatch",
                                "fix_description":  (
                                    f"EPS XBRL={raw_eps:.2f} → {corrected_eps:.4f} "
                                    f"(factor {factor:.1f}× — likely post-split filing)"
                                ),
                            }).execute()
                        except Exception as _fix_log_exc:
                            log.warning("[%s] fix_log insert failed: %s", ticker, _fix_log_exc)

    # ── Metrics list (one per year, using historical market cap) ─────────────
    fiscal_year_ints = [int(yr["date"][:4]) for yr in flat_years]

    # Per-year shares from SEC extracted_data — fixes buyback distortion
    shares_by_year = {
        int(yr["date"][:4]): _safe(yr.get("weightedAverageShsOutDil"))
        for yr in flat_years
        if _safe(yr.get("weightedAverageShsOutDil")) > 0
    }

    # Build period_of_report-aligned date windows for market cap calculation
    fiscal_year_dates = _load_period_of_report(ticker)
    for fy in fiscal_year_ints:
        if fy not in fiscal_year_dates:
            fiscal_year_dates[fy] = f"{fy}-12-31"
            log.warning("[%s] No period_of_report for FY%d — using %d-12-31", ticker, fy, fy)

    log.info("[%s] Fetching historical market caps for %s…", ticker, fiscal_year_ints)
    hist_mktcap = get_historical_market_cap(ticker, fiscal_year_dates, shares_by_year=shares_by_year)

    metrics_list: list[dict] = []
    for yr, bal, cf in zip(flat_years, balance_list, cashflow_list):
        fy       = int(yr["date"][:4])
        mktcap   = hist_mktcap.get(fy) or market_cap  # fall back to current if missing
        ebitda_  = _safe(yr.get("ebitda"))
        fcf_     = _safe(yr.get("freeCashFlow"))
        net_div_ = abs(_safe(yr.get("netDividendsPaid")))
        cash__   = _safe(yr.get("cashAndCashEquivalents"))
        debt__   = _safe(yr.get("totalDebt"))

        ev = (mktcap + debt__ - cash__) if mktcap and mktcap > 0 else None

        ev_ebitda = (ev / ebitda_)  if ev and ebitda_ != 0 else None
        p_fcf     = (mktcap / fcf_) if mktcap and mktcap > 0 and fcf_ > 0 else None
        div_yield = (net_div_ / mktcap) if mktcap and mktcap > 0 and net_div_ > 0 else None

        # Banks: EV/EBITDA is meaningless; use P/E (market_cap / net_income) instead
        if _sm.get("bank_mode"):
            net_inc_  = _safe(yr.get("netIncome"))
            ev_ebitda = (mktcap / net_inc_) if mktcap and mktcap > 0 and net_inc_ > 0 else None

        metrics_list.append({
            "evToEBITDA":                ev_ebitda,
            "priceToFreeCashFlowsRatio": p_fcf,
            "dividendYield":             div_yield,
            "marketCap":                 mktcap if mktcap and mktcap > 0 else None,
        })

    # Banks: M1 uses net_income as EBITDA proxy and P/E as the multiple.
    # Subtracting net_debt (hundreds of billions in bank liabilities) from the
    # projected equity destroys the calculation — bank "debt" is deposits/funding,
    # not corporate financing. P/E valuation never subtracts debt; zero it out.
    # Override in-memory only — does NOT write back to extracted_data.csv.
    if _sm.get("bank_mode"):
        for inc in income_list:
            inc["ebitda"] = inc.get("netIncome", 0)
        for bal in balance_list:
            bal["netDebt"] = 0.0

    if _sm.get("financial_mode"):
        for inc in income_list:
            inc["ebitda"] = inc.get("pretax_income") or inc.get("netIncome", 0)
        for bal in balance_list:
            bal["netDebt"] = 0.0

    if _sm.get("reit_mode"):
        for inc in income_list:
            da = inc.get("depreciationAndAmortization") or 0
            ni = inc.get("netIncome") or 0
            inc["ebitda"] = ni + da  # FFO proxy
        for bal in balance_list:
            bal["netDebt"] = 0.0

    log.info("[%s] Building data dict…", ticker)
    return {
        "profile":           profile,
        "income":            income_list,
        "balance":           balance_list,
        "cashflow":          cashflow_list,
        "metrics":           metrics_list,
        "hist_mktcap":       hist_mktcap,
        "product_segments":  [],
        "geo_segments":      [],
        "reported_currency": "USD",
    }


# ── Per-ticker processor ──────────────────────────────────────────────────────

def process(ticker: str, writer: SupabaseWriter | None, spy: dict, dry_run: bool) -> bool:
    try:
        sector_mode = _resolve_sector_mode(
            ticker, client=writer.client if writer is not None else None
        )
        data = build_data_dict(
            ticker,
            sector_mode=sector_mode,
            client=writer.client if writer is not None else None,
        )

        if not data["profile"].get("price"):
            log.warning("[%s] No price from yfinance — skipped", ticker)
            return False

        # Hazard check
        hazard = check_hazard(data)
        if hazard["has_anomaly"]:
            for reason in hazard["reasons"]:
                log.warning("[%s] ⚠  Anomaly detected: %s", ticker, reason)
        else:
            log.info("[%s] ✓  No anomalies detected", ticker)

        log.info("[%s] Running scoring layers…", ticker)
        ppm    = score_ppm(data,   ticker=ticker, sp500_cagr=spy.get("sp500_cagr"))
        growth = score_growth(data, sp500_cagr=spy.get("sp500_cagr"), ticker=ticker)
        health = score_health(data)
        final  = score_final(ppm, growth, health, spy.get("sp500_cagr"))

        log.info(
            "[%s] Score: %-5s | PPM: %5.1f | Growth: %5.1f | Health: %d/24",
            ticker,
            final.get("signal", "?"),
            ppm.get("score", 0),
            growth.get("score", 0),
            health.get("passes", 0),
        )

        log.info("[%s] Fetching segments...", ticker)
        cik      = ticker_to_cik(ticker)
        segments = get_segments(ticker, cik) if cik else {"product_segments": None, "geo_segments": None}
        prod     = segments.get("product_segments")
        geo      = segments.get("geo_segments")
        if prod is not None or geo is not None:
            log.info("[%s] Product segments: %d found", ticker, len(prod) if prod else 0)
            log.info("[%s] Geo segments: %d found",     ticker, len(geo)  if geo  else 0)
        else:
            log.info("[%s] Segments: not available", ticker)

        sector_override = sector_mode["sector_override"]

        if dry_run:
            log.info("[%s] --dry-run: skipping Supabase write", ticker)
        else:
            writer.upsert_stock(ticker, data)
            writer.upsert_scores(ticker, ppm, growth, health, final, spy, segments, hazard, sector_override)

        log.info("[%s] ✓ Done", ticker)
        return True, len(prod) if prod else None, len(geo) if geo else None

    except Exception as exc:
        log.error("[%s] FAILED: %s", ticker, exc, exc_info=True)
        return False, None, None


# ── Helpers ───────────────────────────────────────────────────────────────────

def pre_register_tickers(tickers: list[str], writer: "SupabaseWriter") -> None:
    """Ensure every ticker exists in the stocks table before scoring begins."""
    rows = [{"ticker": t} for t in tickers]
    writer.client.table("stocks").upsert(rows, on_conflict="ticker").execute()
    log.info("Pre-registered %d tickers in stocks table", len(rows))


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="StockSnack SEC EDGAR pipeline")
    parser.add_argument(
        "--tickers", nargs="+", default=None,
        metavar="TICKER", help="Run specific tickers instead of the full S&P 500 list",
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        metavar="N", help="Process at most N tickers (useful for testing)",
    )
    parser.add_argument(
        "--offset", type=int, default=0,
        help="Skip the first N tickers from the S&P 500 list before applying --limit",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Run scoring but do NOT write to Supabase",
    )
    args = parser.parse_args()

    if args.tickers:
        tickers: list[str] = [t.upper() for t in args.tickers]
    else:
        tickers = _load_sp500_tickers()

    tickers = tickers[args.offset:]
    if args.limit:
        tickers = tickers[:args.limit]

    dry_run: bool = args.dry_run

    log.info("Starting SEC pipeline — %d tickers%s",
             len(tickers), "  [DRY RUN]" if dry_run else "")

    writer = None if dry_run else SupabaseWriter(SUPABASE_URL, SUPABASE_KEY)

    if writer is not None:
        pre_register_tickers(tickers, writer)

    log.info("Fetching S&P 500 benchmark…")
    spy = compute_spy_benchmark({}, [])
    log.info("SPY benchmark: cagr=%.4f", spy.get("sp500_cagr") or 0)

    processed:       list[str]          = []
    failed:          list[str]          = []
    segment_results: dict[str, tuple]   = {}  # ticker -> (prod_count, geo_count)

    for ticker in tickers:
        ok, prod_cnt, geo_cnt = process(ticker, writer, spy, dry_run)
        (processed if ok else failed).append(ticker)
        segment_results[ticker] = (prod_cnt, geo_cnt)
        if len(tickers) > 1:
            time.sleep(1)

    if writer is not None:
        log.info("Computing P/E ratios across all tickers…")
        compute_pe_ratios(writer.client)

    log.info("Done — processed: %d  failed: %d", len(processed), len(failed))
    if failed:
        log.warning("Failed: %s", ", ".join(failed))

    log.info("─" * 52)
    log.info("SEGMENT COVERAGE SUMMARY")
    log.info("%-8s  %-14s  %-10s", "Ticker", "Product segs", "Geo segs")
    log.info("%-8s  %-14s  %-10s", "──────", "────────────", "────────")
    for t in tickers:
        pc, gc = segment_results.get(t, (None, None))
        log.info("%-8s  %-14s  %-10s",
                 t,
                 str(pc) if pc is not None else "—",
                 str(gc) if gc is not None else "—")

    sys.exit(1 if len(failed) > 2 else 0)


if __name__ == "__main__":
    main()
