"""
Layer 4 — Final Score & Signal

Weighted average:
    PPM    40%
    Growth 30%
    Health 30%

Signal thresholds:
    BUY   ≥ 65
    HOLD  40–64
    SELL  < 40
"""
from config import PPM_WEIGHT, GROWTH_WEIGHT, HEALTH_WEIGHT, BUY_THRESHOLD, HOLD_THRESHOLD


def score_final(ppm: dict, growth: dict, health: dict) -> dict:
    final = (
        ppm["score"]    * PPM_WEIGHT
        + growth["score"] * GROWTH_WEIGHT
        + health["score"] * HEALTH_WEIGHT
    )
    final = round(final, 2)

    if final >= BUY_THRESHOLD:
        signal = "BUY"
    elif final >= HOLD_THRESHOLD:
        signal = "HOLD"
    else:
        signal = "SELL"

    return {"score": final, "signal": signal}
