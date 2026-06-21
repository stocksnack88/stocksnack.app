"""
StockSnack — Weekly blog post generator.

Run on demand:
    python3 pipeline/generate_blog_post.py

Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and GEMINI_API_KEY
from pipeline/.env (loaded automatically via config.py).

Reads the full scored S&P 500 universe from stock_scores, identifies top BUY+
names and signal flips vs last week, calls Gemini to draft the post, generates
a featured image (Python port of lib/generate-blog-image.ts), and inserts into
blog_posts with status=published.
"""
from __future__ import annotations

import json
import logging
import os
import statistics
import sys
from datetime import date, datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

from google import genai
from google.genai import types
from supabase import create_client, Client

# Allow imports from pipeline/
_PIPELINE_DIR = Path(__file__).parent
sys.path.insert(0, str(_PIPELINE_DIR))
from config import SUPABASE_URL, SUPABASE_KEY

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

_AUTHOR   = "StockSnack Team"
_CATEGORY = "weekly-pulse"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _week_start() -> str:
    """ISO date string for Monday of the current week (pipeline run date)."""
    today = datetime.now(timezone.utc).date()
    return str(today - timedelta(days=today.weekday()))


def _f(v) -> Optional[float]:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


# ── Data fetching ─────────────────────────────────────────────────────────────

def fetch_scores(client: Client) -> list[dict]:
    resp = client.table("stock_scores").select(
        "ticker,signal,ppm_cagr,sp500_cagr,health_passes,growth_score,final_score"
    ).execute()
    return resp.data or []


def fetch_last_week_signals(client: Client, current_week_date: str) -> dict[str, str]:
    """Return {ticker: signal} from the most recent weekly snapshot prior to this week."""
    try:
        resp = client.table("weekly_signal_snapshot") \
            .select("week_date") \
            .neq("week_date", current_week_date) \
            .order("week_date", desc=True) \
            .limit(1) \
            .execute()
        if not resp.data:
            log.info("No prior signal snapshot found — skipping flip detection")
            return {}
        last_date = resp.data[0]["week_date"]
        resp2 = client.table("weekly_signal_snapshot") \
            .select("ticker,signal") \
            .eq("week_date", last_date) \
            .execute()
        signals = {r["ticker"]: r["signal"] for r in (resp2.data or [])}
        log.info("Loaded %d signals from snapshot %s", len(signals), last_date)
        return signals
    except Exception as exc:
        log.warning("Could not fetch last week's signals: %s", exc)
        return {}


def save_signal_snapshot(client: Client, scores: list[dict], week_date: str) -> None:
    rows = [
        {"ticker": r["ticker"], "signal": r["signal"], "week_date": week_date}
        for r in scores
        if r.get("signal") and r.get("ticker")
    ]
    for i in range(0, len(rows), 100):
        try:
            client.table("weekly_signal_snapshot").upsert(
                rows[i:i+100], on_conflict="ticker,week_date"
            ).execute()
        except Exception as exc:
            log.warning("Snapshot upsert failed (batch %d): %s", i, exc)
    log.info("Signal snapshot saved for %s (%d tickers)", week_date, len(rows))


# ── Analysis ──────────────────────────────────────────────────────────────────

def derive_sp500_cagr(scores: list[dict]) -> float:
    vals = [_f(r["sp500_cagr"]) for r in scores if r.get("sp500_cagr") is not None]
    if not vals:
        log.warning("No sp500_cagr in scores — defaulting to 0.12")
        return 0.12
    return statistics.median(vals)


def find_top_buys(scores: list[dict], sp500_cagr: float, n: int = 5) -> list[dict]:
    """Top N BUY+ tickers by (ppm_cagr − sp500_cagr) margin, descending."""
    candidates = [
        r for r in scores
        if r.get("signal") == "BUY+" and _f(r.get("ppm_cagr")) is not None
    ]
    candidates.sort(
        key=lambda r: (_f(r["ppm_cagr"]) or 0.0) - sp500_cagr,
        reverse=True,
    )
    return candidates[:n]


def find_signal_flips(scores: list[dict], last_week: dict[str, str]) -> list[dict]:
    if not last_week:
        return []
    flips = []
    for r in scores:
        ticker     = r.get("ticker")
        new_signal = r.get("signal")
        old_signal = last_week.get(ticker)
        if old_signal and new_signal and old_signal != new_signal:
            flips.append({
                "ticker":      ticker,
                "from_signal": old_signal,
                "to_signal":   new_signal,
                "ppm_cagr":    _f(r.get("ppm_cagr")),
            })
    return flips


# ── Image generation (Python port of lib/generate-blog-image.ts) ──────────────

def _escape_xml(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;").replace("'", "&apos;"))


def _split_title(title: str, max_chars: int = 38) -> tuple[str, str]:
    if len(title) <= max_chars:
        return title, ""
    words = title.split()
    line1: list[str] = []
    for word in words:
        candidate = " ".join(line1 + [word])
        if len(candidate) <= max_chars:
            line1.append(word)
        else:
            break
    return " ".join(line1), " ".join(words[len(line1):])


def build_svg(
    title:      str,
    category:   str,
    stat:       Optional[str]  = None,
    stat_label: Optional[str]  = None,
) -> str:
    line1, line2 = _split_title(title)
    l1 = _escape_xml(line1)
    l2 = _escape_xml(line2)
    cat_w = len(category) * 8 + 24

    stat_box = ""
    if stat and stat_label:
        stat_box = (
            f'  <rect x="80" y="360" width="340" height="90" rx="4"'
            f' fill="rgba(0,255,65,0.05)" stroke="rgba(0,255,65,0.2)" stroke-width="1"/>\n'
            f'  <text x="100" y="400" font-family="monospace" font-size="36" font-weight="700"'
            f' fill="#00ff41">{_escape_xml(stat)}</text>\n'
            f'  <text x="100" y="430" font-family="monospace" font-size="12" letter-spacing="3"'
            f' fill="rgba(0,255,65,0.5)">{_escape_xml(stat_label.upper())}</text>'
        )

    title_y   = "230" if line2 else "270"
    line2_svg = (
        f'  <text x="80" y="295" font-family="monospace" font-size="52" font-weight="700"'
        f' fill="#00ff41" letter-spacing="-1">{l2}</text>'
        if line2 else ""
    )

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#000000"/>
      <stop offset="100%" stop-color="#001400"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="6" height="630" fill="#00ff41"/>
  <line x1="80" y1="0" x2="80" y2="630" stroke="rgba(0,255,65,0.04)" stroke-width="1"/>
  <line x1="0" y1="560" x2="1200" y2="560" stroke="rgba(0,255,65,0.06)" stroke-width="1"/>
  <text x="80" y="70" font-family="monospace" font-size="13" font-weight="700" letter-spacing="6" fill="rgba(0,255,65,0.12)">STOCKSNACK</text>
  <rect x="80" y="100" width="{cat_w}" height="26" rx="3" fill="rgba(0,255,65,0.08)" stroke="rgba(0,255,65,0.25)" stroke-width="1"/>
  <text x="92" y="118" font-family="monospace" font-size="11" font-weight="700" letter-spacing="3" fill="#00ff41">{_escape_xml(category.upper())}</text>
  <text x="80" y="{title_y}" font-family="monospace" font-size="52" font-weight="700" fill="#00ff41" letter-spacing="-1">{l1}</text>
{line2_svg}
{stat_box}
  <text x="80" y="598" font-family="monospace" font-size="12" letter-spacing="4" fill="rgba(0,255,65,0.3)">stocksnack.app · STOCK ANALYSIS</text>
  <text x="1120" y="598" font-family="monospace" font-size="12" letter-spacing="2" fill="rgba(0,255,65,0.2)" text-anchor="end">2026</text>
</svg>"""


def generate_image(
    client:     Client,
    slug:       str,
    title:      str,
    stat:       Optional[str],
    stat_label: Optional[str],
) -> Optional[str]:
    try:
        import cairosvg  # type: ignore
    except ImportError:
        log.warning("cairosvg not installed — skipping featured image")
        return None

    svg = build_svg(title, _CATEGORY, stat, stat_label)
    try:
        png_bytes: bytes = cairosvg.svg2png(bytestring=svg.encode("utf-8"))
    except Exception as exc:
        log.warning("SVG→PNG failed: %s", exc)
        return None

    path = f"{slug}.png"
    try:
        client.storage.from_("blog-images").upload(
            path, png_bytes,
            file_options={"content-type": "image/png", "upsert": "true"},
        )
        url = client.storage.from_("blog-images").get_public_url(path)
        return url if isinstance(url, str) else (url or {}).get("publicUrl")
    except Exception as exc:
        log.warning("Image upload failed: %s", exc)
        return None


# ── Content generation ────────────────────────────────────────────────────────

def _pct(v: Optional[float], decimals: int = 1) -> str:
    return f"{round((v or 0) * 100, decimals)}%" if v is not None else "N/A"


def generate_content(
    top_buys:      list[dict],
    flips:         list[dict],
    sp500_cagr:    float,
    week_label:    str,
    universe_count: int,
) -> dict:
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set")

    gemini = genai.Client(api_key=api_key)

    buys_lines = [
        f"- {r['ticker']}: signal={r['signal']}, ppm_cagr={_pct(_f(r.get('ppm_cagr')))}, "
        f"margin_over_sp500={_pct(_f(r.get('ppm_cagr')) - sp500_cagr if _f(r.get('ppm_cagr')) is not None else None)}, "
        f"health_passes={r.get('health_passes', '?')}/24, "
        f"growth_score={round(_f(r.get('growth_score')) or 0, 1)}"
        for r in top_buys
    ] or ["No BUY+ signals this week."]

    flips_lines = [
        f"- {f['ticker']}: {f['from_signal']} → {f['to_signal']}"
        + (f", ppm_cagr={_pct(f['ppm_cagr'])}" if f.get("ppm_cagr") is not None else "")
        for f in flips[:10]
    ] or ["None this week."]

    prompt = f"""You are writing the weekly stock pulse post for StockSnack, a stock screening app.
Return ONLY valid JSON — no markdown, no preamble, no trailing text.

PIPELINE DATA FOR {week_label}:
S&P 500 5-year CAGR: {_pct(sp500_cagr)}
Universe scored: {universe_count} S&P 500 tickers

TOP BUY+ SIGNALS (by margin over S&P 500):
{chr(10).join(buys_lines)}

SIGNAL FLIPS VS LAST WEEK:
{chr(10).join(flips_lines)}

JSON keys to return:
- "title": string, under 60 characters, includes the week or top mover
- "excerpt": 1-2 sentences, the core factual takeaway, standalone-quotable, no hype
- "content": markdown — open with that same factual takeaway sentence, then a ## section per highlighted ticker showing grade / PPM CAGR / margin over S&P / health passes; plain factual language, no predictions, no superlatives

Rules:
- title must be under 60 characters
- no hype words: "exciting", "strong", "promising", "poised", "skyrocket"
- CAGR values as percentages (e.g. 14.2%)
- grade = signal value (BUY+, BUY, HOLD, SELL)
- if no BUY+ signals, say so plainly and note which signals were most common"""

    response = gemini.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        ),
    )

    raw = response.text.strip()
    # Strip markdown fences if the model wrapped the JSON despite response_mime_type
    if raw.startswith("```"):
        lines = raw.split("\n")
        inner = lines[1:] if lines[0].startswith("```") else lines
        raw = "\n".join(inner[:-1] if inner and inner[-1].strip() == "```" else inner)

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        log.error("Gemini returned non-JSON (%s):\n%s", exc, raw[:500])
        raise


# ── DB write ──────────────────────────────────────────────────────────────────

def insert_blog_post(client: Client, post: dict) -> None:
    client.table("blog_posts").upsert(post, on_conflict="slug").execute()
    log.info("Inserted blog post: slug=%s", post["slug"])


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    week_date  = _week_start()   # e.g. "2026-06-22"
    week_label = datetime.now(timezone.utc).strftime("%B %d, %Y")
    slug       = f"weekly-pulse-{week_date}"

    log.info("Weekly blog post — week of %s (slug=%s)", week_date, slug)

    # 1. Fetch scored universe
    scores = fetch_scores(client)
    log.info("Fetched %d scored tickers from stock_scores", len(scores))
    if not scores:
        log.error("No scores found — aborting")
        sys.exit(1)

    sp500_cagr = derive_sp500_cagr(scores)
    log.info("S&P 500 CAGR benchmark: %.4f (%.1f%%)", sp500_cagr, sp500_cagr * 100)

    # 2. Find highlights
    last_week = fetch_last_week_signals(client, week_date)
    top_buys  = find_top_buys(scores, sp500_cagr, n=5)
    flips     = find_signal_flips(scores, last_week)

    log.info("Top BUY+: %s", [r["ticker"] for r in top_buys] or "none")
    log.info("Signal flips: %d", len(flips))

    # 3. Generate content via Claude
    generated = generate_content(top_buys, flips, sp500_cagr, week_label, len(scores))
    title   = generated["title"]
    excerpt = generated["excerpt"]
    content = generated["content"]
    log.info("Claude title: %r", title)

    # 4. Generate featured image
    stat = stat_label = None
    if top_buys:
        top_cagr = _f(top_buys[0].get("ppm_cagr"))
        if top_cagr is not None:
            stat       = _pct(top_cagr)
            stat_label = f"{top_buys[0]['ticker']} PPM CAGR"

    image_url = generate_image(client, slug, title, stat, stat_label)
    if image_url:
        log.info("Featured image: %s", image_url)
    else:
        log.warning("No featured image — post will publish without one")

    # 5. Insert blog post
    insert_blog_post(client, {
        "slug":               slug,
        "title":              title,
        "excerpt":            excerpt,
        "content":            content,
        "category":           _CATEGORY,
        "status":             "published",
        "published_at":       _now(),
        "author":             _AUTHOR,
        "featured_image_url": image_url,
    })

    # 6. Save signal snapshot for next week's flip detection
    save_signal_snapshot(client, scores, week_date)

    log.info("Done — %s published", slug)


if __name__ == "__main__":
    main()
