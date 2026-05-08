"""
Layer 2 — Growth Trend Score (0–100)

Computes 3-year and 5-year CAGRs for Revenue, Net Income, and Free Cash Flow.
Score = average of all available CAGR scores (each mapped via cagr_to_score).
"""
from __future__ import annotations
from scoring.utils import safe_float, list_cagr, cagr_to_score


def score_growth(data: dict) -> dict:
    income   = data.get("income", [])
    cashflow = data.get("cashflow", [])

    rev_vals = [safe_float(r.get("revenue"))     for r in income]
    ni_vals  = [safe_float(r.get("netIncome"))   for r in income]
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

    return {
        "score": round(avg_score, 2),
        **{k: (round(v, 4) if v is not None else None) for k, v in metrics.items()},
    }
