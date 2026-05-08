"""
Layer 3 — Health Score (0–100)

24 pass/fail checks across four categories matching the n8n workflow exactly.

Categories
──────────
Balance Sheet  (7)  BS_1  – BS_7
Income Stmt    (7)  IS_8  – IS_14
Cash Flow      (5)  CS_15 – CS_19
Buffett Tier   (5)  BT_20 – BT_24

Per-metric score: min(current_pass*60 + years_passed*8, 100)
Overall score  : passes / 24 * 100
"""
from __future__ import annotations
from scoring.utils import safe_float


def _f(d: dict, key: str, default: float = 0.0) -> float:
    return safe_float(d.get(key), default)


def _build_rows(data: dict) -> list[dict]:
    """Merge income + balance + cashflow + marketCap for up to 5 years (newest first)."""
    income   = data.get("income",   [])
    balance  = data.get("balance",  [])
    cashflow = data.get("cashflow", [])
    metrics  = data.get("metrics",  [])
    n = max(len(income), len(balance), len(cashflow), 1)
    n = min(n, 5)
    rows = []
    for i in range(n):
        inc = income[i]   if i < len(income)   else {}
        bal = balance[i]  if i < len(balance)  else {}
        cf  = cashflow[i] if i < len(cashflow) else {}
        m   = metrics[i]  if i < len(metrics)  else {}
        row = {**inc, **bal, **cf}
        # Historical marketCap from key-metrics (needed for BT_24)
        if m.get("marketCap") is not None:
            row["marketCap"] = m["marketCap"]
        rows.append(row)
    return rows


def score_health(data: dict) -> dict:
    rows = _build_rows(data)
    if not rows:
        return {"score": 0.0, "passes": 0, "details": []}

    checks: list[dict] = []

    def _ok(fn, row: dict) -> bool:
        try:
            return bool(fn(row))
        except Exception:
            return False

    def metric(name: str, check_fn) -> None:
        current_pass = _ok(check_fn, rows[0])
        years_passed = sum(1 for r in rows if _ok(check_fn, r))
        total_score  = min((60 if current_pass else 0) + years_passed * 8, 100)
        checks.append({
            "name":         name,
            "pass":         current_pass,
            "score":        total_score,
            "years_passed": years_passed,
        })

    # ── Balance Sheet (7) ─────────────────────────────────────────────────────

    # BS_1: Cash/Debt > 1.0
    metric("Cash/Debt > 1.0",
        lambda d: _f(d,"cashAndCashEquivalents") / _f(d,"totalDebt") > 1
                  if _f(d,"totalDebt") > 0 else False)

    # BS_2: Debt/Equity < 80% (total liabilities / equity, matching n8n)
    metric("Debt/Equity < 80%",
        lambda d: _f(d,"totalLiabilities") / _f(d,"totalEquity") < 0.8
                  if _f(d,"totalEquity") != 0 else False)

    # BS_3: Preferred Stock = 0
    metric("Preferred Stock = 0",
        lambda d: _f(d,"preferredStock") == 0)

    # BS_4: Retained Earnings Growth — compare each row against rows[1] baseline (n8n closure pattern)
    _re1 = _f(rows[1], "retainedEarnings", float("-inf")) if len(rows) > 1 else float("-inf")
    metric("Retained Earnings Growth",
        lambda d: _f(d,"retainedEarnings") > _re1)

    # BS_5: Active Buybacks (commonStockRepurchased < 0 means cash paid out)
    metric("Active Buybacks",
        lambda d: _f(d,"commonStockRepurchased") < 0)

    # BS_6: ROE > 25%
    metric("ROE > 25%",
        lambda d: _f(d,"netIncome") / _f(d,"totalEquity") > 0.25
                  if _f(d,"totalEquity") != 0 else False)

    # BS_7: ROTA > 10%
    metric("ROTA > 10%",
        lambda d: _f(d,"netIncome") / _f(d,"totalAssets") > 0.10
                  if _f(d,"totalAssets") > 0 else False)

    # ── Income Statement (7) ──────────────────────────────────────────────────

    # IS_8: Gross Margin > 40%
    metric("Gross Margin > 40%",
        lambda d: _f(d,"grossProfit") / _f(d,"revenue") > 0.40
                  if _f(d,"revenue") > 0 else False)

    # IS_9: SG&A / GP < 30%
    metric("SG&A / GP < 30%",
        lambda d: _f(d,"sellingGeneralAndAdministrativeExpenses") / _f(d,"grossProfit") < 0.30
                  if _f(d,"grossProfit") > 0 else False)

    # IS_10: R&D / GP < 30%
    metric("R&D / GP < 30%",
        lambda d: _f(d,"researchAndDevelopmentExpenses") / _f(d,"grossProfit") < 0.30
                  if _f(d,"grossProfit") > 0 else False)

    # IS_11: Interest / OpInc < 15%
    metric("Interest / OpInc < 15%",
        lambda d: abs(_f(d,"interestExpense")) / _f(d,"operatingIncome") < 0.15
                  if _f(d,"operatingIncome") > 0 else True)

    # IS_12: Tax Rate 15–25%
    metric("Tax Rate 15-25%",
        lambda d: 0.15 <= _f(d,"incomeTaxExpense") / _f(d,"incomeBeforeTax") <= 0.25
                  if _f(d,"incomeBeforeTax") > 0 else False)

    # IS_13: Net Margin > 20%
    metric("Net Margin > 20%",
        lambda d: _f(d,"netIncome") / _f(d,"revenue") > 0.20
                  if _f(d,"revenue") > 0 else False)

    # IS_14: EPS Growth — compare each row against rows[1] baseline (n8n closure pattern)
    _eps1 = _f(rows[1], "eps", 0.0) if len(rows) > 1 else 0.0
    metric("EPS Growth",
        lambda d: _f(d,"eps") > _eps1)

    # ── Cash Flow (5) ─────────────────────────────────────────────────────────

    # CS_15: SBC / Revenue < 10%
    metric("SBC / Revenue < 10%",
        lambda d: _f(d,"stockBasedCompensation") / _f(d,"revenue") < 0.10
                  if _f(d,"revenue") > 0 else False)

    # CS_16: OCF > Net Income
    metric("OCF > Net Income",
        lambda d: _f(d,"operatingCashFlow") > _f(d,"netIncome"))

    # CS_17: FCF Growth Trend — compare each row against rows[1] baseline
    _fcf1 = _f(rows[1], "freeCashFlow", 0.0) if len(rows) > 1 else 0.0
    metric("FCF Growth Trend",
        lambda d: _f(d,"freeCashFlow") > _fcf1)

    # CS_18: CapEx / NI < 25%
    metric("CapEx / NI < 25%",
        lambda d: abs(_f(d,"capitalExpenditure")) / _f(d,"netIncome") < 0.25
                  if _f(d,"netIncome") > 0 else False)

    # CS_19: Payout Ratio (Div + Buyback) / FCF < 1
    metric("Payout Ratio < 1",
        lambda d: abs(_f(d,"netDividendsPaid") + _f(d,"commonStockRepurchased")) / _f(d,"freeCashFlow") < 1
                  if _f(d,"freeCashFlow") > 0 else True)

    # ── Buffett Tier (5) ──────────────────────────────────────────────────────

    # BT_20: ROIC > 15%  (operatingIncome * 0.79 / invested capital)
    metric("ROIC > 15%",
        lambda d: _f(d,"operatingIncome") * 0.79 / (_f(d,"totalDebt") + _f(d,"totalEquity")) > 0.15
                  if (_f(d,"totalDebt") + _f(d,"totalEquity")) > 0 else False)

    # BT_21: Owner Earnings > 0  (NI + D&A + CapEx, capex is negative so this subtracts)
    metric("Owner Earnings > 0",
        lambda d: _f(d,"netIncome") + _f(d,"depreciationAndAmortization") + _f(d,"capitalExpenditure") > 0)

    # BT_22: Intangibles < 10% of total assets
    metric("Intangibles < 10%",
        lambda d: _f(d,"intangibleAssets") / _f(d,"totalAssets") < 0.10
                  if _f(d,"totalAssets") > 0 else False)

    # BT_23: Debt Payoff < 4 years
    metric("Debt Payoff < 4 Years",
        lambda d: _f(d,"totalDebt") / _f(d,"netIncome") < 4
                  if _f(d,"netIncome") > 0 else False)

    # BT_24: $1 Retained Test — fixed calculation using rows[0] vs rows[4] marketCap
    _r0_mc = rows[0].get("marketCap")
    _r4_mc = rows[4].get("marketCap") if len(rows) > 4 else None
    _tot_retained = sum(_f(r, "retainedEarnings") for r in rows)
    if _r0_mc and _r4_mc and _tot_retained != 0:
        _dollar_pass = ((_r0_mc - _r4_mc) / abs(_tot_retained)) >= 1
    else:
        _dollar_pass = False
    metric("$1 Retained Test",
        lambda d: _dollar_pass)

    passes = sum(1 for c in checks if c["pass"])
    score  = round(passes / len(checks) * 100, 2)

    return {
        "score":   score,
        "passes":  passes,
        "details": checks,
    }
