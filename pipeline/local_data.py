"""
Assemble a scoring-layer data dict from already-stored Supabase rows.

build_data_dict_from_supabase() is the local-data equivalent of:
  - fmp.fetch_all()          (run.py)
  - build_data_dict()        (sec/run_sec.py)

It reads stock_fundamentals + stocks + stock_prices and returns the same
dict structure that score_ppm(), score_growth(), and score_health() expect.
No FMP call. No SEC EDGAR fetch. No yfinance call.

Known limitations vs a live-fetch run:
  - profile.lastDividend is always 0 → M3 (dividend model) gate won't fire.
    Dividend-payer PPM scores rely on M1+M2 only. Fix: persist lastDividend.
  - interestExpense is not stored → IS-11 health check (Interest/OpInc < 15%)
    treats expense as 0 (automatic pass).  Immaterial for most tickers.
  - depreciationAndAmortization is not stored → BT-21 (Owner Earnings > 0)
    omits D&A from the sum.  Often still correct; conservative for capital-heavy
    firms with large D&A.
  - totalLiabilities is reconstructed as totalAssets - totalEquity (accounting
    identity), so BS-2 (Debt/Equity < 80%) is an approximation.
"""
from __future__ import annotations

import logging

log = logging.getLogger(__name__)


def _f(d: dict, key: str, default: float = 0.0) -> float:
    v = d.get(key)
    if v is None:
        return default
    try:
        f = float(v)
        return f if f == f else default  # NaN guard
    except (TypeError, ValueError):
        return default


def build_data_dict_from_supabase(ticker: str, client, years: int = 5) -> dict:
    """
    Read up to `years` rows from stock_fundamentals (newest first) plus profile
    data from stocks + stock_prices, and return the exact data dict the scoring
    layers expect.

    Args:
        ticker: upper-case ticker symbol
        client: supabase.Client instance
        years:  number of fiscal years to fetch (default 5)

    Returns:
        dict with keys: profile, income, balance, cashflow, metrics,
                        hist_mktcap, product_segments, geo_segments,
                        reported_currency

    Raises:
        ValueError: if no stock_fundamentals rows exist for the ticker
    """
    # ── 1. Financial data from stock_fundamentals ─────────────────────────────
    resp = (
        client.table("stock_fundamentals")
        .select("*")
        .eq("ticker", ticker)
        .order("fiscal_year", desc=True)
        .limit(years)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        raise ValueError(f"[{ticker}] No stock_fundamentals rows found — skipping")

    # ── 2. Profile from stocks + stock_prices ─────────────────────────────────
    stock_resp = (
        client.table("stocks")
        .select("name, sector, industry, exchange, description, website, country")
        .eq("ticker", ticker)
        .maybe_single()
        .execute()
    )
    stock_row = stock_resp.data or {}

    price_resp = (
        client.table("stock_prices")
        .select("current_price, market_cap, shares_outstanding, beta, week_52_high, week_52_low")
        .eq("ticker", ticker)
        .maybe_single()
        .execute()
    )
    price_row = price_resp.data or {}

    profile = {
        "companyName":  stock_row.get("name"),
        "sector":       stock_row.get("sector"),
        "industry":     stock_row.get("industry"),
        "exchange":     stock_row.get("exchange"),
        "description":  stock_row.get("description"),
        "website":      stock_row.get("website"),
        "country":      stock_row.get("country"),
        "price":        price_row.get("current_price"),
        "marketCap":    price_row.get("market_cap"),
        "beta":         price_row.get("beta"),
        # lastDividend is not persisted anywhere — M3 gate (div_yield >= 4.5%)
        # uses this to compute spot yield; 0 means M3 is always skipped.
        "lastDividend": 0.0,
    }

    # ── 3. Build per-year sub-dicts ───────────────────────────────────────────
    income_list:   list[dict] = []
    balance_list:  list[dict] = []
    cashflow_list: list[dict] = []
    metrics_list:  list[dict] = []

    for row in rows:
        fy       = row.get("fiscal_year") or 0
        date_str = f"{fy}-12-31"

        ni       = _f(row, "net_income")
        tax_rate = _f(row, "tax_rate")

        # Reconstruct incomeBeforeTax from net_income and stored tax_rate.
        # tax_rate = incomeTaxExpense / incomeBeforeTax
        # netIncome = incomeBeforeTax * (1 - tax_rate)
        # → incomeBeforeTax = netIncome / (1 - tax_rate)
        if 0.0 < tax_rate < 1.0:
            income_before_tax = ni / (1.0 - tax_rate)
        else:
            income_before_tax = ni
        income_tax = income_before_tax - ni

        income_list.append({
            "symbol":                                       ticker,
            "date":                                         date_str,
            "revenue":                                      row.get("revenue"),
            "grossProfit":                                  row.get("gross_profit"),
            "operatingIncome":                              row.get("operating_income"),
            "netIncome":                                    ni,
            "ebitda":                                       row.get("ebitda"),
            "eps":                                          row.get("eps"),
            "epsdiluted":                                   row.get("eps"),
            "sellingGeneralAndAdministrativeExpenses":      row.get("sga"),
            "researchAndDevelopmentExpenses":               row.get("rd_expense"),
            "stockBasedCompensation":                       row.get("sbc"),
            "interestExpense":                              0.0,   # not stored
            "incomeTaxExpense":                             income_tax,
            "incomeBeforeTax":                              income_before_tax,
            "depreciationAndAmortization":                  0.0,   # not stored
        })

        cash  = _f(row, "cash_and_equivalents")
        debt  = _f(row, "total_debt")
        eq    = _f(row, "total_equity")
        assets = _f(row, "total_assets")

        # totalLiabilities reconstructed from accounting identity: A = L + E
        total_liabilities = assets - eq if assets > 0 else 0.0

        net_debt_stored = row.get("net_debt")
        net_debt = float(net_debt_stored) if net_debt_stored is not None else (debt - cash)

        balance_list.append({
            "symbol":                    ticker,
            "date":                      date_str,
            "cashAndCashEquivalents":    cash,
            "totalDebt":                 debt,
            "totalEquity":               eq,
            "totalStockholdersEquity":   eq,
            "totalAssets":               assets,
            "totalLiabilities":          total_liabilities,
            "netDebt":                   net_debt,
            "weightedAverageShsOutDil":  row.get("shares_outstanding"),
            "goodwillAndIntangibleAssets": row.get("intangibles"),
            "intangibleAssets":          row.get("intangibles"),
            "preferredStock":            row.get("preferred_stock"),
            "retainedEarnings":          row.get("retained_earnings"),
            "currentAssets":             row.get("current_assets"),
            "currentLiabilities":        row.get("current_liabilities"),
        })

        div_paid = _f(row, "dividends_paid")
        fcf      = _f(row, "free_cash_flow")

        cashflow_list.append({
            "symbol":                    ticker,
            "date":                      date_str,
            "operatingCashFlow":         row.get("operating_cash_flow"),
            "capitalExpenditure":        row.get("capex"),
            "freeCashFlow":              fcf,
            "stockBasedCompensation":    row.get("sbc"),
            "netDividendsPaid":          div_paid,
            "dividendsPaid":             div_paid,   # FMP name alias (M3 reads this)
            "commonStockRepurchased":    row.get("buybacks"),
        })

        mktcap  = _f(row, "market_cap_at_year")
        # dividendYield and P/FCF computed from stored base values
        div_yield = (abs(div_paid) / mktcap) if (mktcap > 0 and div_paid < 0) else None
        p_fcf     = (mktcap / fcf)           if (mktcap > 0 and fcf  > 0) else None

        metrics_list.append({
            "evToEBITDA":                  row.get("ev_to_ebitda"),
            "priceToFreeCashFlowsRatio":   p_fcf,
            "dividendYield":               div_yield,
            "marketCap":                   mktcap if mktcap > 0 else None,
            "returnOnEquity":              row.get("roe"),
            "returnOnInvestedCapital":     row.get("roic"),
            "currentRatio":                row.get("current_ratio"),
        })

    log.info("[%s] Assembled data dict from Supabase (%d year(s))", ticker, len(rows))

    return {
        "profile":           profile,
        "income":            income_list,
        "balance":           balance_list,
        "cashflow":          cashflow_list,
        "metrics":           metrics_list,
        "hist_mktcap":       {},   # not needed; per-year marketCap lives in metrics[]
        "product_segments":  [],
        "geo_segments":      [],
        "reported_currency": "USD",
    }
