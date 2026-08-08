"""Write pipeline results to Supabase via the REST client."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from supabase import create_client, Client
from scoring.utils import safe_float

log = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _or_null(raw) -> float | None:
    """safe_float(), but preserves a genuine 0 instead of collapsing it to None.

    The old `safe_float(x) or None` pattern is a real bug: 0.0 is falsy in
    Python, so `0.0 or None` evaluates to None regardless of whether the 0
    came from safe_float's own "missing" default or a value SEC actually
    reported as zero. Any field that's legitimately zero for a given year
    (a debt-free company's total_debt, a non-dividend stock's dividends_paid,
    a year with no buybacks, etc.) was silently written as NULL instead of 0
    -- one of the causes behind the "interior data gaps" audit finding
    (found via AFG's FY2024 buybacks, 2026-08-08: SEC reports $0 explicitly,
    DB had NULL). Checks the RAW value's None-ness, not safe_float's output.
    """
    return safe_float(raw) if raw is not None else None


def _first_or_null(*raws) -> float | None:
    """Like _or_null, but tries each raw value in order and uses the first
    one that's actually present (not None) -- for fields with a primary +
    fallback source (e.g. totalEquity vs totalStockholdersEquity). A
    genuine 0 in the primary source is used as-is, not treated as "try the
    next source" (same bug class as _or_null)."""
    for r in raws:
        if r is not None:
            return safe_float(r)
    return None


def _pref(raw, fallback: float | None) -> float | None:
    """Prefer `raw` (e.g. an API-provided metric) over `fallback` (e.g. our
    own computed value) whenever raw is actually present -- including when
    raw is genuinely 0, which the old `safe_float(raw) or fallback` pattern
    would have incorrectly treated as "raw is missing, use fallback"."""
    return safe_float(raw) if raw is not None else fallback


def _fiscal_year(row: dict) -> int | None:
    # Prefer the explicit fiscalYear field — date can be the filing date, which
    # may fall in a different calendar year (e.g. JNJ FY2022 filed in 2023).
    date_str = row.get("fiscalYear") or row.get("date") or row.get("calendarYear") or ""
    try:
        return int(str(date_str)[:4])
    except (ValueError, TypeError):
        return None


def _build_fundamentals(ticker: str, data: dict) -> list[dict]:
    income_list   = data.get("income",   [])
    balance_list  = data.get("balance",  [])
    cashflow_list = data.get("cashflow", [])
    metrics_list  = data.get("metrics",  [])
    hist_mktcap   = data.get("hist_mktcap", {})

    balance_by_year  = {_fiscal_year(r): r for r in balance_list  if _fiscal_year(r)}
    cashflow_by_year = {_fiscal_year(r): r for r in cashflow_list if _fiscal_year(r)}
    metrics_by_year  = {_fiscal_year(r): r for r in metrics_list  if _fiscal_year(r)}

    rows = []
    for inc in income_list:
        year = _fiscal_year(inc)
        if not year:
            continue
        bal = balance_by_year.get(year, {})
        cf  = cashflow_by_year.get(year, {})
        m   = metrics_by_year.get(year, {})

        revenue    = _or_null(inc.get("revenue"))
        net_income = _or_null(inc.get("netIncome"))
        ebitda     = _or_null(inc.get("ebitda"))
        total_debt = _or_null(bal.get("totalDebt"))
        total_eq   = _first_or_null(bal.get("totalEquity"), bal.get("totalStockholdersEquity"))
        op_income  = _or_null(inc.get("operatingIncome"))
        int_exp    = _or_null(inc.get("interestExpense"))

        def pct(num, denom):
            n, d = safe_float(num), safe_float(denom)
            return round(n / d, 6) if d else None

        # debtToEquity and interestCoverage computed from raw fields (not in stable key-metrics).
        # Numerators check "is not None" (a genuine 0, e.g. a debt-free company's
        # total_debt, must still compute a real 0 ratio) -- only the denominator
        # needs a truthy check, to guard against division by zero.
        debt_to_equity    = round(total_debt / total_eq, 6) if (total_debt is not None and total_eq) else None
        interest_coverage = round(op_income / abs(int_exp), 6) if (op_income is not None and int_exp and abs(int_exp) > 0) else None

        # Ratios computed from raw fields — used when the metrics API returns nothing (SEC path)
        _ni       = safe_float(inc.get("netIncome"))
        _eq       = safe_float(bal.get("totalEquity")) or safe_float(bal.get("totalStockholdersEquity"))
        _oi       = safe_float(inc.get("operatingIncome"))
        _cash     = safe_float(bal.get("cashAndCashEquivalents")) or safe_float(bal.get("cashAndShortTermInvestments"))
        _debt     = safe_float(bal.get("totalDebt"))
        _tax      = pct(inc.get("incomeTaxExpense"), inc.get("incomeBeforeTax"))
        _tax_fac  = 1 - (_tax if _tax is not None else 0.21)
        _invested = _eq + _debt - _cash

        roe_computed  = round(_ni / _eq, 6)                             if _eq                                  else None
        roic_computed = round(_oi * _tax_fac / _invested, 6)           if (_oi and _invested and _invested > 0) else None
        _cur_assets   = safe_float(bal.get("currentAssets"))
        _cur_liab     = safe_float(bal.get("currentLiabilities"))
        cr_computed   = round(_cur_assets / _cur_liab, 6)              if _cur_liab                             else None

        rows.append({
            "ticker":               ticker,
            "fiscal_year":          year,
            "revenue":              revenue,
            "gross_profit":         _or_null(inc.get("grossProfit")),
            "ebitda":               ebitda,
            "operating_income":     op_income,
            "net_income":           net_income,
            "eps":                  _or_null(inc.get("eps")),
            "total_assets":         _or_null(bal.get("totalAssets")),
            "total_debt":           total_debt,
            "total_equity":         total_eq,
            "cash_and_equivalents": _first_or_null(bal.get("cashAndCashEquivalents"), bal.get("cashAndShortTermInvestments")),
            "net_debt":             _or_null(bal.get("netDebt")),
            "operating_cash_flow":  _or_null(cf.get("operatingCashFlow")),
            "capex":                _or_null(cf.get("capitalExpenditure")),
            "free_cash_flow":       _or_null(cf.get("freeCashFlow")),
            "dividends_paid":       _or_null(cf.get("netDividendsPaid")),
            "buybacks":             _or_null(cf.get("commonStockRepurchased")),
            "gross_margin":         pct(inc.get("grossProfit"),    revenue),
            "operating_margin":     pct(inc.get("operatingIncome"), revenue),
            "net_margin":           pct(net_income,                 revenue),
            "roe":                  _pref(m.get("returnOnEquity"), roe_computed),
            "roic":                 _pref(m.get("returnOnInvestedCapital"), roic_computed),
            "debt_to_equity":       debt_to_equity,
            "current_ratio":        _pref(m.get("currentRatio"), cr_computed),
            "interest_coverage":    interest_coverage,
            "ev_to_ebitda":         _or_null(m.get("evToEBITDA")),
            "market_cap_at_year":   hist_mktcap.get(year),
            # Extended columns for health check detail panels
            "sga":                  _or_null(inc.get("sellingGeneralAndAdministrativeExpenses")),
            "rd_expense":           _or_null(inc.get("researchAndDevelopmentExpenses")),
            "tax_rate":             pct(inc.get("incomeTaxExpense"), inc.get("incomeBeforeTax")),
            "sbc":                  _or_null(cf.get("stockBasedCompensation")),
            "shares_outstanding":   _or_null(bal.get("weightedAverageShsOutDil")),
            "intangibles":          _first_or_null(bal.get("intangibleAssets"), bal.get("goodwillAndIntangibleAssets")),
            "preferred_stock":      _or_null(bal.get("preferredStock")),
            "retained_earnings":    _or_null(bal.get("retainedEarnings")),
            "current_assets":       _or_null(bal.get("currentAssets")),
            "current_liabilities":  _or_null(bal.get("currentLiabilities")),
            "updated_at":           _now(),
        })
    return rows


class SupabaseWriter:
    def __init__(self, url: str, key: str):
        self.client: Client = create_client(url, key)

    def upsert_stock(self, ticker: str, data: dict) -> None:
        profile = data.get("profile", {})

        # Parse 52-week range ("low-high")
        low52 = high52 = None
        range_str = profile.get("range", "")
        if range_str and "-" in range_str:
            try:
                parts = range_str.rsplit("-", 1)
                low52  = float(parts[0])
                high52 = float(parts[1])
            except (ValueError, IndexError):
                pass

        price  = _or_null(profile.get("price"))
        mkt    = _or_null(profile.get("marketCap"))
        shares = mkt / price if (price and mkt is not None) else None

        self.client.table("stocks").upsert({
            "ticker":      ticker,
            "name":        profile.get("companyName"),
            "sector":      profile.get("sector"),
            "industry":    profile.get("industry"),
            "exchange":    profile.get("exchange"),
            "description": profile.get("description"),
            "website":     profile.get("website"),
            "country":     profile.get("country"),
            "updated_at":  _now(),
        }).execute()

        self.client.table("stock_prices").upsert({
            "ticker":             ticker,
            "current_price":      price,
            "market_cap":         mkt,
            "shares_outstanding": shares,
            "beta":               _or_null(profile.get("beta")),
            "week_52_high":       high52,
            "week_52_low":        low52,
            "updated_at":         _now(),
        }).execute()

        fundamentals = _build_fundamentals(ticker, data)
        if fundamentals:
            self.client.table("stock_fundamentals").upsert(fundamentals).execute()

    def upsert_scores(
        self,
        ticker: str,
        ppm: dict,
        growth: dict,
        health: dict,
        final: dict,
        spy: dict,
        segments: dict,
        hazard: dict | None = None,
        sector_override: str | None = None,
    ) -> None:
        self.client.table("stock_scores").upsert({
            "ticker":             ticker,
            # Layer 1
            "ppm_score":          ppm.get("score"),
            "ppm_m1_price":       ppm.get("m1_price"),
            "ppm_m2_price":       ppm.get("m2_price"),
            "ppm_m3_price":       ppm.get("m3_price"),
            "ppm_blended_price":  ppm.get("blended_price"),
            "ppm_cagr":           ppm.get("cagr"),
            # Layer 1: PPM intermediates
            "m1_ebitda_current":    ppm.get("m1_ebitda_current"),
            "m1_ebitda_projected":  ppm.get("m1_ebitda_projected"),
            "m1_growth_rate":       ppm.get("m1_growth_rate"),
            "m1_ev_ebitda_multiple": ppm.get("m1_ev_ebitda_multiple"),
            "m1_net_debt":          ppm.get("m1_net_debt"),
            "m1_shares":            ppm.get("m1_shares"),
            "m2_fcf_current":       ppm.get("m2_fcf_current"),
            "m2_fcf_projected":     ppm.get("m2_fcf_projected"),
            "m2_growth_rate":       ppm.get("m2_growth_rate"),
            "m2_fcf_yield":         ppm.get("m2_fcf_yield"),
            "m3_applicable":        ppm.get("m3_applicable"),
            "m3_div_yield":         ppm.get("m3_div_yield"),
            "m3_buyback_yield":     ppm.get("m3_buyback_yield"),
            "m3_shareholder_yield": ppm.get("m3_shareholder_yield"),
            "m3_growth_rate":       ppm.get("m3_growth_rate"),
            "m_cumulative_div_ps":  ppm.get("m_cumulative_div_ps"),
            # Layer 2
            "growth_score":       growth.get("score"),
            "revenue_cagr_3y":    growth.get("revenue_cagr_3y"),
            "revenue_cagr_5y":    growth.get("revenue_cagr_5y"),
            "net_income_cagr_3y": growth.get("net_income_cagr_3y"),
            "net_income_cagr_5y": growth.get("net_income_cagr_5y"),
            "fcf_cagr_3y":           growth.get("fcf_cagr_3y"),
            "fcf_cagr_5y":           growth.get("fcf_cagr_5y"),
            "revenue_yoy_rates":     growth.get("revenue_yoy_rates"),
            "net_income_yoy_rates":  growth.get("net_income_yoy_rates"),
            "fcf_yoy_rates":         growth.get("fcf_yoy_rates"),
            "growth_years":          growth.get("growth_years"),
            "gq_signal_revenue":     growth.get("gq_signal_revenue"),
            "gq_signal_net_income":  growth.get("gq_signal_net_income"),
            "gq_signal_fcf":         growth.get("gq_signal_fcf"),
            "gq_master":             growth.get("gq_master"),
            # Layer 3
            "health_score":       health.get("score"),
            "health_passes":      health.get("passes"),
            "health_details":     health.get("details"),
            # Layer 4
            "final_score":        final.get("score"),
            "signal":             final.get("signal"),
            # Benchmark
            "sp500_cagr":         spy.get("sp500_cagr"),
            "sp500_5y_return":    spy.get("sp500_5y_return"),
            # Segments
            "product_segments":   segments.get("product_segments"),
            "geo_segments":       segments.get("geo_segments"),
            # Hazard flags
            "has_anomaly":        (hazard or {}).get("has_anomaly", False),
            "anomaly_reasons":    ", ".join((hazard or {}).get("reasons", [])) or None,
            "sector_override":    sector_override,
            "updated_at":         _now(),
        }).execute()

    def start_pipeline_run(self, tickers: list[str]) -> int:
        result = self.client.table("pipeline_runs").insert({
            "tickers_processed": [],
            "tickers_failed":    [],
            "status":            "running",
        }).execute()
        return result.data[0]["id"]

    def complete_pipeline_run(
        self, run_id: int, processed: list[str], failed: list[str]
    ) -> None:
        status = "completed" if not failed or len(processed) >= len(failed) else "partial"
        self.client.table("pipeline_runs").update({
            "completed_at":      _now(),
            "tickers_processed": processed,
            "tickers_failed":    failed,
            "status":            status,
        }).eq("id", run_id).execute()
