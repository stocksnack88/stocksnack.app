import os
from pathlib import Path


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


_load_env_file(Path(__file__).parent.parent / ".env.local")

SUPABASE_URL: str = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY: str = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
FMP_API_KEY: str = os.environ.get("FMP_API_KEY", "")  # unused by SEC pipeline
FMP_BASE_URL: str = "https://financialmodelingprep.com"

TICKERS = [
    "NVDA", "GOOGL", "AAPL", "MSFT", "AMZN",
    "TSM",  "META",  "TSLA", "WMT",  "JPM",
    "XOM",  "V",     "AMD",  "JNJ",  "COST",
    "CVX",  "BAC",   "NFLX", "ABBV", "KO",
]

PPM_WEIGHT    = 0.40
GROWTH_WEIGHT = 0.30
HEALTH_WEIGHT = 0.30

BUY_THRESHOLD  = 65
HOLD_THRESHOLD = 40
