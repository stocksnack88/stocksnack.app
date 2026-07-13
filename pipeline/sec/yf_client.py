"""
Yahoo Finance client — price, market cap, profile, and dividend history.

What this does:
  - get_price(): current stock price
  - get_market_cap(): current market cap
  - get_profile(): profile dict matching FMP shape expected by scoring layers
  - get_dividends(): annual per-share dividend totals
  - get_shares_per_year(): shares outstanding per fiscal year (SEC → yf → mktcap/price)
  - get_historical_market_cap(): avg price × split-adjusted shares per year

What this does NOT do:
  - Touch SEC EDGAR or FMP APIs
  - Raise exceptions — all functions return None/[] on failure
"""
from __future__ import annotations

import csv
import logging
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger(__name__)

_RETRY_ATTEMPTS = 3
_RETRY_BASE_DELAY = 1.0  # seconds, doubles each attempt


def _retry_yf(label: str, fn, *args, **kwargs):
    """
    Call fn(*args, **kwargs) with exponential-backoff retry.
    Raises the last exception if every attempt fails — callers already wrap
    their yfinance access in a broad try/except, so this just makes a single
    flaky call less likely to be the thing that trips it.
    """
    last_exc: Exception | None = None
    for attempt in range(_RETRY_ATTEMPTS):
        try:
            return fn(*args, **kwargs)
        except Exception as exc:
            last_exc = exc
            if attempt < _RETRY_ATTEMPTS - 1:
                delay = _RETRY_BASE_DELAY * (2 ** attempt)
                log.warning(
                    "[yfinance] %s failed (attempt %d/%d): %s — retrying in %.1fs",
                    label, attempt + 1, _RETRY_ATTEMPTS, exc, delay,
                )
                time.sleep(delay)
    raise last_exc  # noqa: RSE102 — re-raise the last real exception

# Explicit override for edge cases where auto-detection snaps incorrectly.
# Auto-detection via detect_adr_ratio() is tried first for all tickers.
_ADR_SHARE_RATIO: dict[str, int] = {}

_ADR_VALID_RATIOS: tuple[int, ...] = (1, 2, 4, 5, 8, 10, 20)


def detect_adr_ratio(symbol: str, most_recent_edgar_shares: float) -> int:
    """
    Infer ADR ratio by comparing SEC EDGAR ordinary share count against
    yfinance's share count (which reflects ADR shares for foreign tickers).
    Snaps to nearest value in _ADR_VALID_RATIOS. Returns 1 on any failure.
    """
    try:
        yf_shares = None
        try:
            yf_shares = getattr(_ticker(symbol).fast_info, "shares", None)
        except Exception:
            pass
        if not yf_shares:
            info = _info(symbol)
            yf_shares = info.get("sharesOutstanding") or info.get("impliedSharesOutstanding")
        if not yf_shares or float(yf_shares) <= 0:
            return 1

        implied = most_recent_edgar_shares / float(yf_shares)
        ratio   = min(_ADR_VALID_RATIOS, key=lambda r: abs(r - implied))
        if ratio > 1:
            log.info(
                "[%s] ADR auto-detected: edgar=%.0f / yf=%.0f → implied=%.2fx → ratio=%d",
                symbol, most_recent_edgar_shares, float(yf_shares), implied, ratio,
            )
        return ratio
    except Exception as exc:
        log.warning("[%s] detect_adr_ratio failed: %s", symbol, exc)
        return 1


def _ticker(symbol: str):
    import yfinance as yf
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return yf.Ticker(symbol.upper())


def _info(symbol: str) -> dict:
    try:
        return _retry_yf(f"{symbol} .info", lambda: _ticker(symbol).info) or {}
    except Exception as exc:
        log.warning("[%s] yfinance info failed after retries: %s", symbol, exc)
        return {}


def get_price(symbol: str) -> float | None:
    info = _info(symbol)
    v = info.get("currentPrice") or info.get("regularMarketPrice")
    return float(v) if v is not None else None


def get_market_cap(symbol: str) -> float | None:
    v = _info(symbol).get("marketCap")
    return float(v) if v is not None else None


def get_profile(symbol: str) -> dict:
    """
    Returns a profile dict matching the shape scoring layers expect from FMP:
      price, marketCap, sector, industry, exchange, companyName,
      currency, lastDividend
    All fields default to None if unavailable. Never raises.
    """
    try:
        info = _info(symbol)
        price  = info.get("currentPrice") or info.get("regularMarketPrice")
        mktcap = info.get("marketCap")
        # dividendRate is forward annualized $/share — matches FMP lastDividend behaviour
        last_div = info.get("dividendRate") or info.get("lastDividendValue")
        return {
            "symbol":      symbol.upper(),
            "price":       float(price)    if price    is not None else None,
            "marketCap":   float(mktcap)   if mktcap   is not None else None,
            "sector":      info.get("sector"),
            "industry":    info.get("industry"),
            "exchange":    info.get("exchange"),
            "companyName": info.get("longName") or info.get("shortName"),
            "currency":    info.get("currency", "USD"),
            "lastDividend": float(last_div) if last_div is not None else 0.0,
        }
    except Exception as exc:
        log.warning("[%s] get_profile failed: %s", symbol, exc)
        return {
            "symbol": symbol.upper(), "price": None, "marketCap": None,
            "sector": None, "industry": None, "exchange": None,
            "companyName": None, "currency": "USD", "lastDividend": 0.0,
        }


def get_dividends(symbol: str, years: int = 5) -> list[dict]:
    """
    Annual per-share dividend totals, sorted oldest to newest.
    Returns [{"year": 2023, "dividendsPaid": 0.96}, ...]
    """
    try:
        t   = _ticker(symbol)
        div = _retry_yf(f"{symbol} .dividends", lambda: t.dividends)
        if div.empty:
            return []

        now      = datetime.now(timezone.utc)
        cutoff   = now.year - years
        by_year: dict[int, float] = {}

        for ts, amount in div.items():
            try:
                yr = ts.year if hasattr(ts, "year") else int(str(ts)[:4])
            except Exception:
                continue
            if yr >= cutoff:
                by_year[yr] = by_year.get(yr, 0.0) + float(amount)

        return [
            {"year": yr, "dividendsPaid": round(total, 4)}
            for yr, total in sorted(by_year.items())
        ]
    except Exception as exc:
        log.warning("[%s] get_dividends failed: %s", symbol, exc)
        return []


def get_shares_per_year(
    ticker: str,
    fiscal_years: list[int],
    extracted_data_path,
) -> dict[int, float]:
    """
    Returns shares outstanding per fiscal year.
    Tries four sources in order:

    Source 1 — SEC extracted_data.csv
      Read shares_outstanding rows for this ticker. If all requested years
      are found, return them (highest value per year when multiple tags exist).

    Source 2 — yfinance current share count (fast_info.shares)
      Used when SEC data is missing or incomplete. Same value for all years;
      small error expected for buyback-heavy companies.

    Source 3 — Compute from market cap / current price
      Used when yfinance fast_info also fails.

    Source 4 — Complete failure
      Returns {} — caller handles gracefully.

    Returns {fiscal_year: share_count}. Never raises.
    """
    ticker  = ticker.upper()
    target  = set(fiscal_years)
    csv_path = Path(extracted_data_path)

    # ── Source 1: SEC extracted_data.csv ──────────────────────────────────────
    try:
        by_yr: dict[int, float] = {}
        if csv_path.exists():
            with csv_path.open(newline="") as f:
                for row in csv.DictReader(f):
                    if row.get("ticker", "").upper() != ticker:
                        continue
                    if row.get("standardised_name") != "shares_outstanding":
                        continue
                    try:
                        yr  = int(row["fiscal_year"])
                        val = float(row["value"])
                    except (KeyError, ValueError):
                        continue
                    if yr in target:
                        if yr not in by_yr or val > by_yr[yr]:
                            by_yr[yr] = val

        if len(by_yr) >= len(fiscal_years):
            log.info("[shares] %s: using SEC data (%d years)", ticker, len(by_yr))
            return by_yr
    except Exception as exc:
        log.warning("[shares] %s: SEC read failed: %s", ticker, exc)

    # ── Source 2: yfinance current share count ────────────────────────────────
    try:
        t      = _ticker(ticker)
        shares = None
        try:
            shares = getattr(t.fast_info, "shares", None)
        except Exception:
            pass
        if not shares:
            info   = _info(ticker)
            shares = info.get("sharesOutstanding") or info.get("impliedSharesOutstanding")
        if shares and float(shares) > 0:
            s = float(shares)
            log.warning(
                "[shares] %s: SEC missing/incomplete, using yfinance current shares %.0f "
                "for all years — small error expected for buyback-heavy companies", ticker, s,
            )
            return {yr: s for yr in fiscal_years}
    except Exception as exc:
        log.warning("[shares] %s: yfinance shares failed: %s", ticker, exc)

    # ── Source 3: compute from market cap / price ─────────────────────────────
    try:
        info   = _info(ticker)
        mktcap = info.get("marketCap")
        price  = info.get("currentPrice") or info.get("regularMarketPrice")
        if mktcap and price and float(price) > 0:
            s = float(mktcap) / float(price)
            log.warning("[shares] %s: computed from market_cap/price = %.0f", ticker, s)
            return {yr: s for yr in fiscal_years}
    except Exception as exc:
        log.warning("[shares] %s: market_cap/price computation failed: %s", ticker, exc)

    # ── Source 4: complete failure ─────────────────────────────────────────────
    log.error("[shares] %s: MISSING — all share count sources failed", ticker)
    return {}


def get_historical_market_cap(
    symbol: str,
    fiscal_year_dates: dict[int, str],
    shares_by_year: dict[int, float] | None = None,
) -> dict[int, float]:
    """
    For each fiscal year, compute average market cap = avg_price × shares.
    Window: 12 months ending on the actual fiscal year end date (period_of_report).

    fiscal_year_dates: {year: "YYYY-MM-DD"} — the 10-K period_of_report dates.
    shares_by_year: {year: shares_outstanding} from SEC extracted_data.csv.
    Returns {year: market_cap_float}. Never raises; skips years with no data.
    """
    if not fiscal_year_dates:
        return {}

    _MIN_MKTCAP = 1e9    # $1B  — below this is suspect
    _MAX_MKTCAP = 10e12  # $10T — above this is suspect

    try:
        from datetime import timedelta

        t    = _ticker(symbol)
        hist = _retry_yf(f"{symbol} .history", lambda: t.history(period="max", auto_adjust=True))
        if hist.empty:
            log.warning("[%s] yfinance history empty", symbol)
            return {}

        # Strip timezone so we can compare against naive datetime objects
        if getattr(hist.index, "tz", None) is not None:
            hist.index = hist.index.tz_localize(None)

        # ── Step 1: Fetch split history ────────────────────────────────────────
        # Build list of (naive_date, ratio) sorted ascending so we can
        # compute cumulative ratio for any fiscal year end.
        raw_splits = _retry_yf(f"{symbol} .splits", lambda: t.splits)
        split_list: list[tuple[datetime, float]] = []
        if not raw_splits.empty:
            for split_date, ratio in raw_splits.items():
                naive = split_date.replace(tzinfo=None) if getattr(split_date, "tzinfo", None) else split_date
                split_list.append((naive, float(ratio)))
            split_list.sort(key=lambda x: x[0])

        def _cumulative_ratio(fy_end: datetime) -> float:
            """Product of all split ratios that occurred AFTER fy_end."""
            r = 1.0
            for split_date, ratio in split_list:
                if split_date > fy_end:
                    r *= ratio
            return r

        # ── Step 2 & 3: Identify most-recent shares as post-split baseline ─────
        # get_shares_per_year() is the single authoritative source; shares_by_year
        # parameter is kept for backward compatibility but is superseded here.
        shares_map     = get_shares_per_year(
            symbol,
            list(fiscal_year_dates.keys()),
            Path(__file__).parent / "extracted_data.csv",
        )
        most_recent_yr = max(shares_map.keys()) if shares_map else None

        # Explicit override wins; otherwise auto-detect from EDGAR vs yfinance share counts.
        if symbol.upper() in _ADR_SHARE_RATIO:
            _adr_ratio = _ADR_SHARE_RATIO[symbol.upper()]
        elif most_recent_yr:
            _adr_ratio = detect_adr_ratio(symbol, shares_map[most_recent_yr])
        else:
            _adr_ratio = 1

        most_recent_shares = float(shares_map[most_recent_yr]) / _adr_ratio if most_recent_yr else None

        result: dict[int, float] = {}

        for yr, date_str in fiscal_year_dates.items():
            try:
                period_end   = datetime.strptime(date_str, "%Y-%m-%d")
                period_start = period_end - timedelta(days=365)

                mask      = (hist.index >= period_start) & (hist.index <= period_end)
                yr_prices = hist[mask]["Close"]

                if yr_prices.empty:
                    log.warning("[%s] no price data in window %s–%s",
                                symbol, period_start.date(), period_end.date())
                    continue

                avg_price  = float(yr_prices.mean())
                raw_shares = float(shares_map.get(yr) or 0) / _adr_ratio
                if not raw_shares:
                    continue

                # ── Step 3: Check whether this year's shares need adjustment ──
                cum_ratio = _cumulative_ratio(period_end)

                if most_recent_shares and raw_shares:
                    detect_ratio = most_recent_shares / raw_shares
                else:
                    detect_ratio = 1.0

                if detect_ratio >= 1.8:
                    # Shares are pre-split — scale up by cumulative ratio so
                    # they are consistent with yfinance's split-adjusted prices.
                    adjusted_shares = raw_shares * cum_ratio
                    log.info(
                        "[yf_client] %s FY%d: shares %.0f → %.0f (ratio %.1fx) "
                        "market_cap = $%.1fB",
                        symbol, yr, raw_shares, adjusted_shares, cum_ratio,
                        avg_price * adjusted_shares / 1e9,
                    )
                else:
                    # Already post-split adjusted (e.g. SEC restated comparative
                    # period in most-recent 10-K filing).
                    adjusted_shares = raw_shares
                    if cum_ratio > 1.0:
                        log.info(
                            "[yf_client] %s FY%d: shares already split-adjusted, "
                            "skipping ratio (detect_ratio=%.2f)",
                            symbol, yr, detect_ratio,
                        )

                mktcap = avg_price * adjusted_shares

                if not (_MIN_MKTCAP <= mktcap <= _MAX_MKTCAP):
                    log.warning(
                        "[%s] suspicious market cap FY%d: $%.1fB — retrying with +5d offset",
                        symbol, yr, mktcap / 1e9,
                    )
                    period_end_adj   = period_end + timedelta(days=5)
                    period_start_adj = period_end_adj - timedelta(days=365)
                    mask_adj         = (hist.index >= period_start_adj) & (hist.index <= period_end_adj)
                    yr_prices_adj    = hist[mask_adj]["Close"]
                    if not yr_prices_adj.empty:
                        mktcap = float(yr_prices_adj.mean()) * adjusted_shares
                        if not (_MIN_MKTCAP <= mktcap <= _MAX_MKTCAP):
                            log.warning(
                                "[%s] still suspicious after retry FY%d: $%.1fB — using anyway",
                                symbol, yr, mktcap / 1e9,
                            )

                result[yr] = mktcap

            except Exception as exc:
                log.warning("[%s] historical mktcap for FY%d failed: %s", symbol, yr, exc)

        return result
    except Exception as exc:
        log.warning("[%s] get_historical_market_cap failed: %s", symbol, exc)
        return {}


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python yf_client.py <TICKER>")
        sys.exit(1)
    _sym = sys.argv[1].upper()
    print(f"\nProfile for {_sym}:")
    for k, v in get_profile(_sym).items():
        print(f"  {k:<16} {v}")
    print(f"\nDividends (last 5y):")
    for d in get_dividends(_sym):
        print(f"  {d['year']}: ${d['dividendsPaid']:.4f}/share")
