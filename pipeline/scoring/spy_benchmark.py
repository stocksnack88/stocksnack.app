"""
S&P 500 benchmark computation.

Fetches ^SP500TR total-return index from Yahoo Finance to compute a
blended CAGR (20Y×0.25 + 10Y×0.50 + 5Y×0.25).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta

import requests

from scoring.utils import compute_cagr

log = logging.getLogger(__name__)

_YF_URL = "https://query1.finance.yahoo.com/v8/finance/chart/%5ESP500TR"
_YF_HEADERS = {"User-Agent": "Mozilla/5.0"}


def _fetch_sp500tr_prices() -> dict:
    resp = requests.get(
        _YF_URL,
        params={"interval": "1mo", "range": "20y"},
        headers=_YF_HEADERS,
        timeout=30,
    )
    resp.raise_for_status()
    result = resp.json()["chart"]["result"][0]
    timestamps = result["timestamp"]
    closes = result["indicators"]["adjclose"][0]["adjclose"]

    pairs = [(ts, px) for ts, px in zip(timestamps, closes) if px is not None]
    if not pairs:
        raise ValueError("No price data returned for ^SP500TR")

    now = datetime.now(timezone.utc)

    def price_n_years_ago(n: int) -> float | None:
        target_ts = (now - timedelta(days=n * 365)).timestamp()
        return min(pairs, key=lambda p: abs(p[0] - target_ts))[1]

    return {
        "current": pairs[-1][1],
        5:  price_n_years_ago(5),
        10: price_n_years_ago(10),
        20: price_n_years_ago(20),
    }


def _blended_cagr(prices: dict) -> float | None:
    current = prices["current"]
    candidates = [
        (compute_cagr(prices[5],  current, 5),  0.25),
        (compute_cagr(prices[10], current, 10), 0.50),
        (compute_cagr(prices[20], current, 20), 0.25),
    ]
    available = [(c, w) for c, w in candidates if c is not None]
    if not available:
        return None
    total_weight = sum(w for _, w in available)
    return sum(c * w for c, w in available) / total_weight


def compute_spy_benchmark() -> dict:
    """Returns {"sp500_cagr": float | None, "sp500_5y_return": float | None}."""
    try:
        prices = _fetch_sp500tr_prices()
    except Exception as exc:
        log.warning("Failed to fetch ^SP500TR prices: %s", exc)
        return {"sp500_cagr": None, "sp500_5y_return": None}

    blended = _blended_cagr(prices)
    if blended is None:
        log.warning("Could not compute blended S&P 500 CAGR — insufficient price history")
        return {"sp500_cagr": None, "sp500_5y_return": None}

    # 5Y return derived from blended CAGR (excludes ~1.3% dividend yield — immaterial for scoring)
    sp500_5y_return = round((1 + blended) ** 5, 4)
    return {"sp500_cagr": round(blended, 6), "sp500_5y_return": sp500_5y_return}
