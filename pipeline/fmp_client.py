from __future__ import annotations

import time
import logging
import requests
from config import FMP_BASE_URL, FMP_API_KEY

log = logging.getLogger(__name__)

_RATE_DELAY = 0.35  # seconds between calls to stay inside free-tier limits


class FMPClient:
    def __init__(self):
        self.session = requests.Session()
        self.session.params = {"apikey": FMP_API_KEY}  # type: ignore[assignment]

    def _get(self, endpoint: str, extra: dict | None = None) -> list | dict:
        params = extra or {}
        url = f"{FMP_BASE_URL}/stable{endpoint}"
        try:
            resp = self.session.get(url, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            time.sleep(_RATE_DELAY)
            return data
        except requests.HTTPError as e:
            log.warning("HTTP %s for %s", e.response.status_code, url)
            return []
        except Exception as e:
            log.warning("Request failed for %s: %s", url, e)
            return []

    def get_profile(self, ticker: str) -> dict:
        data = self._get("/profile", {"symbol": ticker})
        return data[0] if isinstance(data, list) and data else {}

    def get_income_statements(self, ticker: str, limit: int = 5) -> list:
        return self._get("/income-statement", {"symbol": ticker, "period": "annual", "limit": limit})  # type: ignore[return-value]

    def get_balance_sheets(self, ticker: str, limit: int = 5) -> list:
        return self._get("/balance-sheet-statement", {"symbol": ticker, "period": "annual", "limit": limit})  # type: ignore[return-value]

    def get_cash_flows(self, ticker: str, limit: int = 5) -> list:
        return self._get("/cash-flow-statement", {"symbol": ticker, "period": "annual", "limit": limit})  # type: ignore[return-value]

    def get_key_metrics(self, ticker: str, limit: int = 5) -> list:
        return self._get("/key-metrics", {"symbol": ticker, "period": "annual", "limit": limit})  # type: ignore[return-value]

    def get_product_segments(self, ticker: str) -> list:
        return self._get("/revenue-product-segmentation", {"symbol": ticker, "period": "annual"})  # type: ignore[return-value]

    def get_geo_segments(self, ticker: str) -> list:
        return self._get("/revenue-geographic-segmentation", {"symbol": ticker, "period": "annual"})  # type: ignore[return-value]

    def get_spy_quote(self) -> dict:
        data = self._get("/quote-short", {"symbol": "SPY"})
        return data[0] if isinstance(data, list) and data else {}

    def get_spy_dividends(self) -> list:
        return self._get("/dividends", {"symbol": "SPY"})  # type: ignore[return-value]

    def fetch_all(self, ticker: str) -> dict:
        log.debug("Fetching FMP data for %s", ticker)
        return {
            "profile":          self.get_profile(ticker),
            "income":           self.get_income_statements(ticker),
            "balance":          self.get_balance_sheets(ticker),
            "cashflow":         self.get_cash_flows(ticker),
            "metrics":          self.get_key_metrics(ticker),
            "product_segments": self.get_product_segments(ticker),
            "geo_segments":     self.get_geo_segments(ticker),
        }
