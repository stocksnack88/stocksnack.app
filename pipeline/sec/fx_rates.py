"""
Historical FX rate lookup with Supabase caching.

Rates are stored as units of foreign currency per 1 USD (e.g. TWD/USD = 31.5
means 1 USD = 31.5 TWD). To convert foreign-currency financial statement values
to USD, divide by the rate.

Source: yfinance ``{CURRENCY}=X`` tickers — already a project dependency,
supports TWD and most other reporting currencies.
Annual average = mean of all daily Close prices for the calendar year.
"""
from __future__ import annotations

import logging
from statistics import mean

log = logging.getLogger(__name__)

# In-process cache: (currency_pair, year) -> rate.
# Avoids redundant Supabase/API calls across tickers in a single pipeline run.
_runtime_cache: dict[tuple[str, int], float] = {}


def get_historical_fx_rate(
    currency: str,
    year: int,
    client=None,
    fallback: float | None = None,
) -> float:
    """
    Return the annual-average FX rate: units of ``currency`` per 1 USD.

    Lookup order:
      1. In-process runtime cache
      2. Supabase ``fx_rates`` table   (if ``client`` is provided)
      3. yfinance ``{CURRENCY}=X``     (cached back to Supabase when available)
      4. ``fallback`` value            (logged as a warning)

    Raises ``ValueError`` if no rate can be determined and ``fallback`` is None.

    Example
    -------
    rate = get_historical_fx_rate("TWD", 2023, client)
    usd_revenue = twd_revenue / rate   # 1 USD = rate TWD
    """
    pair = f"{currency}/USD"
    cache_key = (pair, year)

    # ── 1. Runtime cache ─────────────────────────────────────────────────────
    if cache_key in _runtime_cache:
        return _runtime_cache[cache_key]

    # ── 2. Supabase lookup ───────────────────────────────────────────────────
    if client is not None:
        try:
            rows = (
                client.table("fx_rates")
                .select("rate")
                .eq("currency_pair", pair)
                .eq("year", year)
                .execute()
                .data or []
            )
            if rows:
                rate = float(rows[0]["rate"])
                _runtime_cache[cache_key] = rate
                log.debug("FX %s %d: %.4f (Supabase cache)", pair, year, rate)
                return rate
        except Exception as exc:
            log.warning("fx_rates Supabase lookup failed (%s %d): %s", pair, year, exc)

    # ── 3. yfinance ──────────────────────────────────────────────────────────
    try:
        rate = _fetch_annual_average_yf(currency, year)
        _runtime_cache[cache_key] = rate
        if client is not None:
            try:
                client.table("fx_rates").upsert({
                    "currency_pair": pair,
                    "year": year,
                    "rate": rate,
                }).execute()
            except Exception as exc:
                log.warning("fx_rates Supabase write failed (%s %d): %s", pair, year, exc)
        log.info("FX %s %d: %.4f (yfinance annual avg)", pair, year, rate)
        return rate
    except Exception as exc:
        log.warning("yfinance FX fetch failed for %s %d: %s", currency, year, exc)

    # ── 4. Fallback ──────────────────────────────────────────────────────────
    if fallback is not None:
        log.warning("FX %s %d: using hardcoded fallback %.4f", pair, year, fallback)
        _runtime_cache[cache_key] = fallback
        return fallback

    raise ValueError(f"Could not determine FX rate for {pair} year {year}")


def _fetch_annual_average_yf(currency: str, year: int) -> float:
    """
    Fetch annual-average rate via yfinance ``{CURRENCY}=X`` ticker.
    Returns units of ``currency`` per 1 USD (e.g. ~31.5 for TWD).
    """
    import yfinance as yf

    hist = yf.Ticker(f"{currency}=X").history(
        start=f"{year}-01-01",
        end=f"{year}-12-31",
    )
    if hist.empty:
        raise ValueError(f"yfinance returned no data for {currency}=X in {year}")

    daily_rates = hist["Close"].tolist()
    if not daily_rates:
        raise ValueError(f"No Close prices for {currency}=X in {year}")

    return round(mean(daily_rates), 4)
