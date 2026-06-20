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


# Payment processors / card networks are classified as "Financial Services" by data
# providers but have clean, bank-like FCF from pure fee income — not balance-sheet
# lending/insurance noise.  Exempt them so M2 (FCF yield) runs normally.
_PAYMENT_NETWORKS = frozenset({"credit services", "payment processing"})


def is_financial(profile: dict) -> bool:
    """FCF is structurally noisy for banks/insurers — exclude it from scoring."""
    sector   = (profile.get("sector")   or "").strip()
    industry = (profile.get("industry") or "").strip().lower()
    if any(kw in industry for kw in _PAYMENT_NETWORKS):
        return False   # V, MA, PYPL: capital-light networks, FCF is clean
    return sector in ("Financials", "Financial Services") or "bank" in industry


def compute_gq(values: list, sp500_cagr: float = 0.10) -> dict:
    """
    Recency-weighted YoY growth quality score.

    values: oldest-first list of financials (FMP data must be reversed before calling).
    Returns dict with keys: weightedCAGR, avg_dollar_change, signal, rates, rank.

    Two paths depending on the sign of the input series:
    - ALL non-negative → percentage-based weightedCAGR (existing behaviour, unchanged).
      avg_dollar_change is None.
    - ANY negative → dollar-based average YoY change.
      avg_dollar_change is the mean annual dollar delta; weightedCAGR is 0.0 (unused).
      Callers must switch to additive projection: projected = current + avg_dollar_change * N.
    """
    _RANK = {"Freefall": 0, "Deteriorating": 1, "Decelerating": 2, "Slowing Growth": 3, "Solid Growth": 4}

    # ── Dollar-based path: any negative value makes percentage growth meaningless ──
    if any(v is not None and v < 0 for v in values):
        deltas: list[float] = []
        for i in range(1, len(values)):
            prev, curr = values[i - 1], values[i]
            if prev is not None and curr is not None:
                deltas.append(curr - prev)

        avg_delta = sum(deltas) / len(deltas) if deltas else 0.0

        if not deltas:
            signal = "Insufficient Data"
        else:
            recent_delta = sum(deltas[-2:]) / len(deltas[-2:])
            early_deltas = deltas[:2]
            early_delta  = sum(early_deltas) / len(early_deltas) if early_deltas else recent_delta
            if len(deltas) >= 3 and all(d < 0 for d in deltas[-3:]):
                signal = "Freefall"
            elif recent_delta < 0:
                signal = "Deteriorating"
            elif early_delta != 0 and (recent_delta - early_delta) < -0.08 * abs(early_delta):
                signal = "Decelerating"
            elif recent_delta > early_delta:
                signal = "Solid Growth"
            else:
                signal = "Slowing Growth"

        return {
            "weightedCAGR":    0.0,
            "avg_dollar_change": avg_delta,
            "signal":          signal,
            "rates":           [None] * (len(values) - 1),
            "rank":            _RANK.get(signal, -1),
        }

    # ── Percentage-based path: all values non-negative (existing behaviour) ───────
    rates: list[float | None] = []
    for i in range(1, len(values)):
        prev, curr = values[i - 1], values[i]
        if prev is None or curr is None or prev == 0:
            rates.append(None)
            continue
        rates.append((curr - prev) / abs(prev))

    valid = [r for r in rates if r is not None]
    if len(valid) < 2:
        return {"weightedCAGR": 0.05, "avg_dollar_change": None, "signal": "Insufficient Data", "rates": rates, "rank": -1}

    weights = [0.5, 1.0, 1.5, 2.0, 3.0][-len(rates):]
    w_sum   = sum(r * w for r, w in zip(rates, weights) if r is not None)
    w_total = sum(w     for r, w in zip(rates, weights) if r is not None)
    floor         = -sp500_cagr
    ceiling       =  sp500_cagr * 4
    weighted_cagr = clamp(w_sum / w_total, floor, ceiling) if w_total > 0 else 0.05

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

    return {"weightedCAGR": weighted_cagr, "avg_dollar_change": None, "signal": signal, "rates": rates, "rank": _RANK.get(signal, -1)}


def _dollar_signal(deltas: list[float]) -> str:
    """Signal classification for dollar-based growth paths."""
    if not deltas:
        return "Insufficient Data"
    recent = sum(deltas[-2:]) / len(deltas[-2:])
    early  = sum(deltas[:2]) / len(deltas[:2]) if len(deltas) >= 2 else recent
    if len(deltas) >= 3 and all(d < 0 for d in deltas[-3:]):
        return "Freefall"
    if recent < 0:
        return "Deteriorating"
    if early != 0 and (recent - early) < -0.08 * abs(early):
        return "Decelerating"
    if recent > early:
        return "Solid Growth"
    return "Slowing Growth"


def _is_steep_drop(prev: float, curr: float) -> bool:
    """True if the transition prev→curr is a steep drop: goes negative, or falls >25% positive."""
    if curr < 0:
        return True
    if prev > 0 and (curr - prev) / prev < -0.25:
        return True
    return False


def tapered_project(
    current: float,
    weighted_cagr: float | None,
    avg_dollar_change: float | None,
    years: int = 5,
    taper: float = 0.04,
) -> float:
    """
    Project a metric forward with annual taper on growth rate / dollar-add.
    Each year's growth or delta = base × (1 − taper)^(year − 1).
    Year 1 uses the full base; each subsequent year shrinks by taper.
    """
    v = current
    if avg_dollar_change is not None:
        for yr in range(years):
            v += avg_dollar_change * (1.0 - taper) ** yr
    elif weighted_cagr is not None:
        for yr in range(years):
            v *= 1.0 + weighted_cagr * (1.0 - taper) ** yr
    return v


def project_series(values: list[float], sp500_cagr: float = 0.10) -> dict:
    """
    Classify a financial series into a growth bucket and return projection parameters.
    values: oldest-first list.

    Steep drop: a YoY move where the destination goes negative,
    OR the value falls >25% while remaining positive.

    Buckets
    ───────
    A   zero steep drops, oldest year positive   → standard recency-weighted % CAGR
    B0  zero steep drops within window, but oldest year is negative
          (the drop predates our window — no prior year to quantify or test recovery)
          → plain dollar avg (same calculation as C)
    B1  one steep drop, a future year exists
          recovery ≥90%  → smooth dropped year (avg of neighbors), % CAGR
          recovery <90%  → plain dollar avg
    B2  one steep drop IS the most-recent year
          → project via prior avg delta, % CAGR on adjusted series
          (fallback to dollar avg if projected ≤ 0)
    C   two or more steep drops                  → plain dollar avg

    Callers apply unified final steps:
      tapered_project(projection_base, weighted_cagr, avg_dollar_change)
      dual gate: cumulative_sum > 0 AND tapered proj_5y > 0

    Returns: bucket, method, weighted_cagr, avg_dollar_change, signal,
             cumulative_sum, [smoothed_values], [projection_base (B2 only)]
    """
    n      = len(values)
    cumsum = sum(values)

    if n < 2:
        return {
            "bucket": "A", "method": "insufficient data — fallback",
            "weighted_cagr": 0.05, "avg_dollar_change": None,
            "signal": "Insufficient Data", "cumulative_sum": cumsum,
        }

    steep_drops = [i for i in range(1, n) if _is_steep_drop(values[i - 1], values[i])]

    def _dollar_result(bucket: str, method: str) -> dict:
        deltas = [values[i] - values[i - 1] for i in range(1, n)]
        return {
            "bucket": bucket, "method": method,
            "weighted_cagr": None,
            "avg_dollar_change": sum(deltas) / len(deltas) if deltas else 0.0,
            "signal": _dollar_signal(deltas),
            "cumulative_sum": cumsum,
        }

    def _pct_result(bucket: str, method: str, series: list[float],
                    smoothed: list[float] | None = None,
                    projection_base: float | None = None) -> dict:
        gq = compute_gq(series, sp500_cagr)
        r  = {
            "bucket": bucket, "method": method,
            "weighted_cagr": gq["weightedCAGR"],
            "avg_dollar_change": None,
            "signal": gq["signal"],
            "cumulative_sum": cumsum,
        }
        if smoothed        is not None: r["smoothed_values"] = smoothed
        if projection_base is not None: r["projection_base"] = projection_base
        return r

    # ── Bucket A / B0 ─────────────────────────────────────────────────────────
    if not steep_drops:
        if values[0] < 0:
            # The steep drop that produced this negative value lies before our
            # window — no prior year exists to measure or test recovery against.
            return _dollar_result("B0", "dollar avg (steep drop predates window; oldest year negative)")
        return _pct_result("A", "standard % growth (no steep drops)", values)

    d = steep_drops[0]

    if len(steep_drops) == 1:
        if d < n - 1:
            # ── Bucket B1: one steep drop with a successor year ────────────────
            before, after = values[d - 1], values[d + 1]
            recovery = before > 0 and after >= 0.90 * before
            if recovery:
                smoothed    = list(values)
                smoothed[d] = (before + after) / 2.0
                pct = f"{after / before * 100:.1f}%"
                return _pct_result(
                    "B1",
                    f"% growth, steep-drop smoothed (recovery {pct} ≥ 90%)",
                    smoothed, smoothed,
                )
            pct_str = (f"{after / before * 100:.1f}%" if before > 0 else "n/a")
            return _dollar_result(
                "B1",
                f"dollar avg (steep drop, recovery {pct_str} < 90%)",
            )

        else:
            # ── Bucket B2: steep drop IS the most-recent year ──────────────────
            prior_deltas = [values[i] - values[i - 1] for i in range(1, d)]
            avg_prior    = sum(prior_deltas) / len(prior_deltas) if prior_deltas else 0.0
            projected    = values[d - 1] + avg_prior
            if projected > 0:
                smoothed    = list(values)
                smoothed[d] = projected
                return _pct_result(
                    "B2",
                    "% growth, most-recent steep-drop projected via prior avg delta",
                    smoothed, smoothed, projected,
                )
            return _dollar_result(
                "B2", "dollar avg (most-recent steep drop, projected ≤ 0)"
            )

    # ── Bucket C: two or more steep drops ─────────────────────────────────────
    return _dollar_result("C", f"dollar avg ({len(steep_drops)} steep drops)")


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
