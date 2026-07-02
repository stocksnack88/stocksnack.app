"""
Layer 4 — Final Score & Signal

Weighted average (unchanged):
    PPM    40%
    Growth 30%
    Health 30%

Signal logic — two-gate approach:
    PRICE GATE (ppm_cagr vs sp500_cagr):
        < 1.0× S&P 500 CAGR          → SELL
        1.0×–1.2× S&P 500 CAGR       → HOLD
        ≥ 1.2× S&P 500 CAGR          → SECOND GATE

    SECOND GATE (quality check):
        health_passes ≥ 16 AND growth_score ≥ 40  → BUY+ (if ≥ 1.5×) or BUY
        exactly one passes                          → HOLD
        both fail                                   → SELL

    Fallback (sp500_cagr unavailable): score-based thresholds.
"""
from __future__ import annotations
from config import PPM_WEIGHT, GROWTH_WEIGHT, HEALTH_WEIGHT, BUY_THRESHOLD, HOLD_THRESHOLD


def score_final(
    ppm: dict,
    growth: dict,
    health: dict,
    sp500_cagr: float | None = None,
) -> dict:
    final = round(
        ppm["score"]    * PPM_WEIGHT
        + growth["score"] * GROWTH_WEIGHT
        + health["score"] * HEALTH_WEIGHT,
        2,
    )

    ppm_cagr      = ppm.get("cagr")
    health_passes = health.get("passes", 0) or 0
    health_total  = health.get("scored_total", 24) or 24   # varies: 24, 21, 18 depending on N/A checks
    health_ratio  = health_passes / health_total
    growth_score  = growth.get("score", 0) or 0

    if sp500_cagr and ppm_cagr is not None:
        if ppm_cagr < sp500_cagr:
            signal = "SELL"
        elif ppm_cagr < sp500_cagr * 1.2:
            signal = "HOLD"
        else:
            h_ok = health_ratio >= 0.667   # ≈ 16/24 — consistent regardless of how many checks are N/A
            g_ok = growth_score >= 40
            if h_ok and g_ok:
                signal = "BUY+" if ppm_cagr >= sp500_cagr * 1.5 else "BUY"
            elif h_ok or g_ok:
                signal = "HOLD"
            else:
                signal = "SELL"
    else:
        if final >= BUY_THRESHOLD:
            signal = "BUY"
        elif final >= HOLD_THRESHOLD:
            signal = "HOLD"
        else:
            signal = "SELL"

    return {"score": final, "signal": signal}
