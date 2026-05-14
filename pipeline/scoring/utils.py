"""Shared helpers used across all scoring layers."""
from __future__ import annotations


def safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def compute_cagr(start: float, end: float, years: float) -> float | None:
    """Return annualised growth rate, or None if inputs are invalid."""
    if not years or years <= 0 or start <= 0 or end <= 0:
        return None
    return (end / start) ** (1.0 / years) - 1.0


def list_cagr(values: list, n_years: int) -> float | None:
    """
    CAGR from a list of values ordered newest-first.
    Uses up to n_years periods; skips non-positive values.
    """
    clean = [v for v in values if v and v > 0]
    if len(clean) < 2:
        return None
    actual_years = min(len(clean) - 1, n_years)
    if actual_years <= 0:
        return None
    return compute_cagr(clean[actual_years], clean[0], actual_years)


def cagr_to_score(cagr_value: float | None, sp500_cagr: float = 0.10) -> float:
    """
    Map a CAGR (decimal) to a 0–100 score, benchmarked to S&P 500.

    Breakpoints (example at sp500_cagr=13.9%):
        cap      = sp500_cagr × 2  (27.8%) → 100
        midpoint = sp500_cagr × 1  (13.9%) →  50
        0%                         →  35
        floor    = −sp500_cagr    (−13.9%) →   0
        < floor                    →   0
    """
    if cagr_value is None:
        return 50.0
    base = max(sp500_cagr, 0.01)   # guard against zero/negative sp500_cagr
    cap      =  base * 2.0
    midpoint =  base
    floor    = -base
    c = cagr_value
    if c >= cap:
        return 100.0
    if c >= midpoint:
        return 50.0 + (c - midpoint) / (cap - midpoint) * 50.0
    if c >= 0.0:
        return 35.0 + (c / midpoint) * 15.0
    if c >= floor:
        return max(0.0, (c - floor) / (0.0 - floor) * 35.0)
    return 0.0


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _fiscal_year(row: dict) -> int | None:
    date_str = row.get("date") or row.get("calendarYear") or ""
    try:
        return int(str(date_str)[:4])
    except (ValueError, TypeError):
        return None
