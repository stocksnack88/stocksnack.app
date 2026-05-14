"""
Layer 2 — Growth Trend Score (0–100)

Computes 3-year and 5-year CAGRs for Revenue, Net Income, and Free Cash Flow.
Score = average of all available CAGR scores (each mapped via cagr_to_score).
"""
from __future__ import annotations
from scoring.utils import safe_float, list_cagr, cagr_to_score


_SIGNAL_RANK = {
    "Freefall":      0,
    "Deteriorating": 1,
    "Decelerating":  2,
    "Slowing Growth": 3,
    "Solid Growth":  4,
}


def _yoy_rates(values: list, n: int = 4) -> list[float | None]:
    """Year-on-year growth rates for the n most recent periods (newest-first input)."""
    rates = []
    for i in range(n):
        if i + 1 < len(values):
            curr, prev = values[i], values[i + 1]
            if prev and prev != 0:
                rates.append((curr - prev) / abs(prev))
            else:
                rates.append(None)
        else:
            rates.append(None)
    return rates


def _fmt_rates(rates: list[float | None]) -> str:
    parts = []
    for r in rates:
        if r is None:
            parts.append("—")
        else:
            sign = "+" if r >= 0 else ""
            parts.append(f"{sign}{r * 100:.1f}%")
    return ",".join(parts)


def _growth_signal(rates: list[float | None]) -> str:
    valid = [r for r in rates if r is not None]
    if len(valid) < 2:
        return "Slowing Growth"

    recent_avg = sum(valid[:2]) / 2
    early      = valid[2:4]
    early_avg  = sum(early) / len(early) if early else recent_avg

    if len(valid) >= 3 and all(r < 0 for r in valid[:3]):
        return "Freefall"

    if recent_avg < 0:
        return "Deteriorating"

    if (recent_avg - early_avg) < -0.08:
        return "Decelerating"

    if recent_avg > early_avg:
        return "Solid Growth"

    return "Slowing Growth"


def _worst_signal(*signals: str) -> str:
    return min(signals, key=lambda s: _SIGNAL_RANK.get(s, 3))


def _extract_years(rows: list, n: int = 4) -> list[str]:
    years = []
    for r in rows[:n]:
        date_str = r.get("fiscalYear") or r.get("date") or r.get("calendarYear") or ""
        try:
            years.append(str(int(str(date_str)[:4])))
        except (ValueError, TypeError):
            years.append("?")
    return years


def score_growth(data: dict) -> dict:
    income   = data.get("income", [])
    cashflow = data.get("cashflow", [])

    # CAGRs are scale-invariant — no currency conversion needed
    rev_vals = [safe_float(r.get("revenue"))      for r in income]
    ni_vals  = [safe_float(r.get("netIncome"))    for r in income]
    fcf_vals = [safe_float(r.get("freeCashFlow")) for r in cashflow]

    # Positive-only series for CAGR (negatives break the power formula)
    ni_pos  = [v for v in ni_vals  if v > 0]
    fcf_pos = [v for v in fcf_vals if v > 0]

    metrics: dict[str, float | None] = {
        "revenue_cagr_3y":    list_cagr(rev_vals, 3),
        "revenue_cagr_5y":    list_cagr(rev_vals, 5),
        "net_income_cagr_3y": list_cagr(ni_pos,  3),
        "net_income_cagr_5y": list_cagr(ni_pos,  5),
        "fcf_cagr_3y":        list_cagr(fcf_pos, 3),
        "fcf_cagr_5y":        list_cagr(fcf_pos, 5),
    }

    scores = [cagr_to_score(v) for v in metrics.values() if v is not None]
    avg_score = sum(scores) / len(scores) if scores else 50.0

    # YoY rates (newest first, raw series — negatives included)
    rev_yoy = _yoy_rates(rev_vals)
    ni_yoy  = _yoy_rates(ni_vals)
    fcf_yoy = _yoy_rates(fcf_vals)

    sig_rev = _growth_signal(rev_yoy)
    sig_ni  = _growth_signal(ni_yoy)
    sig_fcf = _growth_signal(fcf_yoy)

    income_years = _extract_years(income)
    growth_years = ",".join(income_years) if income_years else None

    return {
        "score": round(avg_score, 2),
        **{k: (round(v, 4) if v is not None else None) for k, v in metrics.items()},
        # YoY rates (comma-separated strings, newest first)
        "revenue_yoy_rates":    _fmt_rates(rev_yoy),
        "net_income_yoy_rates": _fmt_rates(ni_yoy),
        "fcf_yoy_rates":        _fmt_rates(fcf_yoy),
        "growth_years":         growth_years,
        # Growth quality signals
        "gq_signal_revenue":    sig_rev,
        "gq_signal_net_income": sig_ni,
        "gq_signal_fcf":        sig_fcf,
        "gq_master":            _worst_signal(sig_rev, sig_ni, sig_fcf),
    }
