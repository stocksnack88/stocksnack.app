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


def compute_gq(values: list, sp500_cagr: float = 0.10) -> dict:
    """
    Recency-weighted YoY growth quality score.

    values: oldest-first list of financials (FMP data must be reversed before calling).
    Returns dict with keys: weightedCAGR, signal, rates, rank.
    """
    rates: list[float | None] = []
    for i in range(1, len(values)):
        prev, curr = values[i - 1], values[i]
        if prev is None or curr is None or prev == 0:
            rates.append(None)
            continue
        rates.append((curr - prev) / abs(prev))

    valid = [r for r in rates if r is not None]
    if len(valid) < 2:
        return {"weightedCAGR": 0.05, "signal": "Insufficient Data", "rates": rates, "rank": -1}

    weights = [0.5, 1.0, 1.5, 2.0, 3.0][-len(rates):]
    w_sum   = sum(r * w for r, w in zip(rates, weights) if r is not None)
    w_total = sum(w     for r, w in zip(rates, weights) if r is not None)
    weighted_cagr = clamp(w_sum / w_total, -0.15, 0.25) if w_total > 0 else 0.05

    # Signal: oldest-first → recent = last 2, early = first 2
    recent_avg = sum(valid[-2:]) / 2
    early      = valid[:2]
    early_avg  = sum(early) / len(early) if early else recent_avg

    if len(valid) >= 3 and all(r < 0 for r in valid[-3:]):
        signal = "Freefall"
    elif recent_avg < 0:
        signal = "Deteriorating"
    elif (recent_avg - early_avg) < -0.08:
        signal = "Decelerating"
    elif recent_avg > early_avg:
        signal = "Solid Growth"
    else:
        signal = "Slowing Growth"

    _RANK = {"Freefall": 0, "Deteriorating": 1, "Decelerating": 2, "Slowing Growth": 3, "Solid Growth": 4}
    return {"weightedCAGR": weighted_cagr, "signal": signal, "rates": rates, "rank": _RANK.get(signal, -1)}


def trimmed_median(values: list) -> float:
    """Median of positive values; drops highest+lowest if 4+ data points."""
    vals = sorted(v for v in values if v and v > 0)
    if len(vals) >= 4:
        vals = vals[1:-1]
    if not vals:
        return 0.0
    return vals[len(vals) // 2]


def _fiscal_year(row: dict) -> int | None:
    date_str = row.get("date") or row.get("calendarYear") or ""
    try:
        return int(str(date_str)[:4])
    except (ValueError, TypeError):
        return None
