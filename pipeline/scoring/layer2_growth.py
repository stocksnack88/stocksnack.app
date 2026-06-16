"""
Layer 2 — Growth Trend Score (0–100)

Revenue and Net Income: 3Y and 5Y CAGRs via cagr_to_score.
FCF: recency-weighted YoY via compute_gq on 5-year oldest-first series.
Score = average of all component scores × worst-signal multiplier.
"""
from __future__ import annotations
import logging
from scoring.utils import safe_float, cagr_to_score, compute_gq, is_financial

log = logging.getLogger(__name__)


_SIGNAL_RANK = {
    "Freefall":      0,
    "Deteriorating": 1,
    "Decelerating":  2,
    "Slowing Growth": 3,
    "Solid Growth":  4,
}

_SIGNAL_MULTIPLIER = {
    "Solid Growth":   1.00,
    "Slowing Growth": 0.90,
    "Decelerating":   0.75,
    "Deteriorating":  0.50,
    "Freefall":       0.25,
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


def _fcf_gq_score(
    fcf_vals: list[float],
    sp500_cagr: float,
    ticker: str = "",
) -> tuple[float, float | None, str]:
    """
    Score FCF trend via recency-weighted YoY (compute_gq).

    fcf_vals: newest-first (FMP order). Reversed internally to oldest-first.
    Returns (score, weighted_cagr, signal).
    """
    series = list(reversed(fcf_vals[:5]))
    sum_5y = sum(series)

    if sum_5y < 0:
        if ticker:
            log.info("[%s] FCF: 5Y sum negative → score 0", ticker)
        return 0.0, None, "Freefall"

    gq = compute_gq(series, sp500_cagr)
    score = cagr_to_score(gq["weightedCAGR"], sp500_cagr)
    return score, gq["weightedCAGR"], gq["signal"]




def _extract_years(rows: list, n: int = 4) -> list[str]:
    years = []
    for r in rows[:n]:
        date_str = r.get("fiscalYear") or r.get("date") or r.get("calendarYear") or ""
        try:
            years.append(str(int(str(date_str)[:4])))
        except (ValueError, TypeError):
            years.append("?")
    return years


def score_growth(data: dict, sp500_cagr: float | None = None, ticker: str = "") -> dict:
    profile  = data.get("profile", {})
    income   = data.get("income", [])
    cashflow = data.get("cashflow", [])

    # CAGRs are scale-invariant — no currency conversion needed
    rev_vals = [safe_float(r.get("revenue"))      for r in income]
    ni_vals  = [safe_float(r.get("netIncome"))    for r in income]
    fcf_vals = [safe_float(r.get("freeCashFlow")) for r in cashflow]

    _base = sp500_cagr or 0.10

    # Revenue and Net Income: recency-weighted YoY via compute_gq (oldest-first input)
    gq_rev = compute_gq(list(reversed(rev_vals[:5])), _base)
    gq_ni  = compute_gq(list(reversed(ni_vals[:5])),  _base)
    rev_weighted_cagr = gq_rev["weightedCAGR"]
    ni_weighted_cagr  = gq_ni["weightedCAGR"]

    # 3-year variants (identical logic, shorter window)
    gq_rev_3y = compute_gq(list(reversed(rev_vals[:3])), _base)
    gq_ni_3y  = compute_gq(list(reversed(ni_vals[:3])),  _base)
    rev_weighted_cagr_3y = gq_rev_3y["weightedCAGR"]
    ni_weighted_cagr_3y  = gq_ni_3y["weightedCAGR"]

    rev_ni_scores = [
        cagr_to_score(rev_weighted_cagr, _base),
        cagr_to_score(ni_weighted_cagr,  _base),
    ]

    # FCF: linear regression on 5-year series.
    # Excluded for financial-sector companies (banks/insurers) where FCF is
    # structurally dominated by loan originations and not a growth signal.
    financial = is_financial(profile)
    if financial:
        if ticker:
            log.info("[%s] Financial sector — FCF excluded from growth scoring", ticker)
        fcf_ng  = None
        fcf_ng_3y = None
        sig_fcf_gq = None
        all_scores = rev_ni_scores
    else:
        fcf_score, fcf_ng, sig_fcf_gq = _fcf_gq_score(fcf_vals, _base, ticker)
        all_scores = rev_ni_scores + [fcf_score]
        # FCF 3-year (identical to _fcf_gq_score logic with [:3])
        series_3y = list(reversed(fcf_vals[:3]))
        if sum(series_3y) < 0:
            fcf_ng_3y = None
        else:
            fcf_ng_3y = compute_gq(series_3y, _base)["weightedCAGR"]

    avg_score = sum(all_scores) / len(all_scores) if all_scores else 50.0

    # YoY rates (newest first, raw series — negatives included)
    rev_yoy = _yoy_rates(rev_vals)
    ni_yoy  = _yoy_rates(ni_vals)
    fcf_yoy = _yoy_rates(fcf_vals)

    sig_rev = gq_rev["signal"]
    sig_ni  = gq_ni["signal"]
    # FCF signal comes from compute_gq when available; fall back to _growth_signal for display
    sig_fcf = sig_fcf_gq if sig_fcf_gq is not None else _growth_signal(fcf_yoy)

    # FCF signal excluded from worst-signal for financial companies
    worst_signal = _worst_signal(sig_rev, sig_ni) if financial else _worst_signal(sig_rev, sig_ni, sig_fcf)
    multiplier   = _SIGNAL_MULTIPLIER.get(worst_signal, 1.0)
    final_score  = round(avg_score * multiplier, 1)
    if ticker:
        log.info("[%s] growth_score: %.2f × %.2f (%s) = %.1f",
                 ticker, avg_score, multiplier, worst_signal, final_score)

    income_years = _extract_years(income)
    growth_years = ",".join(income_years) if income_years else None

    return {
        "score":              final_score,
        "revenue_cagr_3y":    round(rev_weighted_cagr_3y, 4),
        "revenue_cagr_5y":    round(rev_weighted_cagr, 4),
        "net_income_cagr_3y": round(ni_weighted_cagr_3y,  4),
        "net_income_cagr_5y": round(ni_weighted_cagr,  4),
        # FCF stored as normalised regression growth rate; None for financial companies
        "fcf_cagr_3y":        round(fcf_ng_3y, 4) if fcf_ng_3y is not None else None,
        "fcf_cagr_5y":        round(fcf_ng, 4) if fcf_ng is not None else None,
        # YoY rates (comma-separated strings, newest first)
        "revenue_yoy_rates":    _fmt_rates(rev_yoy),
        "net_income_yoy_rates": _fmt_rates(ni_yoy),
        "fcf_yoy_rates":        _fmt_rates(fcf_yoy),
        "growth_years":         growth_years,
        # Growth quality signals
        "gq_signal_revenue":    sig_rev,
        "gq_signal_net_income": sig_ni,
        "gq_signal_fcf":        sig_fcf,
        "gq_master":            worst_signal,
    }
