"""
Layer 2 — Growth Trend Score (0–100)

Revenue and Net Income: 3Y and 5Y CAGRs via cagr_to_score.
FCF: linear regression on 5-year series, normalised slope → cagr_to_score.
Score = average of all component scores × worst-signal multiplier.
"""
from __future__ import annotations
import logging
import numpy as np
from scoring.utils import safe_float, list_cagr, cagr_to_score

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


def _fcf_regression_score(
    fcf_vals: list[float],
    sp500_cagr: float,
    ticker: str = "",
) -> tuple[float, float | None, float | None, float]:
    """
    Score FCF trend via OLS regression on the 5-year series.

    fcf_vals: newest-first (FMP order). Reversed internally to oldest-first.
    Returns (score, normalised_growth, slope, sum_5y).
    """
    series = list(reversed(fcf_vals[:5]))
    sum_5y = sum(series)

    if sum_5y < 0:
        if ticker:
            log.info("[%s] FCF: 5Y sum negative → score 0", ticker)
        return 0.0, None, None, sum_5y

    if len(series) < 2:
        return 35.0, 0.0, 0.0, sum_5y

    x = np.arange(len(series), dtype=float)
    y = np.array(series, dtype=float)
    slope, _ = np.polyfit(x, y, 1)

    avg_abs = float(np.mean(np.abs(y)))
    if avg_abs == 0.0:
        return 35.0, 0.0, float(slope), sum_5y

    normalised_growth = float(slope) / avg_abs
    score = cagr_to_score(normalised_growth, sp500_cagr)
    return score, normalised_growth, float(slope), sum_5y


def _is_financial(profile: dict) -> bool:
    """FCF is structurally noisy for banks/insurers — exclude it from scoring."""
    sector   = (profile.get("sector")   or "").strip()
    industry = (profile.get("industry") or "").strip().lower()
    return sector in ("Financials", "Financial Services") or "bank" in industry


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

    # Revenue and Net Income: 3Y + 5Y CAGRs (positive-only series for NI)
    ni_pos = [v for v in ni_vals if v > 0]
    rev_cagr_3y = list_cagr(rev_vals, 3)
    rev_cagr_5y = list_cagr(rev_vals, 5)
    ni_cagr_3y  = list_cagr(ni_pos,  3)
    ni_cagr_5y  = list_cagr(ni_pos,  5)

    rev_ni_scores = [
        cagr_to_score(v, _base)
        for v in (rev_cagr_3y, rev_cagr_5y, ni_cagr_3y, ni_cagr_5y)
        if v is not None
    ]

    # FCF: linear regression on 5-year series.
    # Excluded for financial-sector companies (banks/insurers) where FCF is
    # structurally dominated by loan originations and not a growth signal.
    financial = _is_financial(profile)
    if financial:
        if ticker:
            log.info("[%s] Financial sector — FCF excluded from growth scoring", ticker)
        fcf_ng = None
        all_scores = rev_ni_scores
    else:
        fcf_score, fcf_ng, _fcf_slope, _fcf_sum = _fcf_regression_score(fcf_vals, _base, ticker)
        all_scores = rev_ni_scores + [fcf_score]

    avg_score = sum(all_scores) / len(all_scores) if all_scores else 50.0

    # YoY rates (newest first, raw series — negatives included)
    rev_yoy = _yoy_rates(rev_vals)
    ni_yoy  = _yoy_rates(ni_vals)
    fcf_yoy = _yoy_rates(fcf_vals)

    sig_rev = _growth_signal(rev_yoy)
    sig_ni  = _growth_signal(ni_yoy)
    sig_fcf = _growth_signal(fcf_yoy)

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
        "revenue_cagr_3y":    round(rev_cagr_3y, 4) if rev_cagr_3y is not None else None,
        "revenue_cagr_5y":    round(rev_cagr_5y, 4) if rev_cagr_5y is not None else None,
        "net_income_cagr_3y": round(ni_cagr_3y,  4) if ni_cagr_3y  is not None else None,
        "net_income_cagr_5y": round(ni_cagr_5y,  4) if ni_cagr_5y  is not None else None,
        # FCF stored as normalised regression growth rate; None for financial companies
        "fcf_cagr_3y":        None,
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
