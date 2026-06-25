# Claude Code — Operational Notes for StockSnack

This file is for Claude Code agents. Read before working on anything n8n or deployment related.

---

## Data Sources — Critical

**FMP (Financial Modeling Prep) is NOT available for commercial use.** No subscription. Quota is very limited. Do NOT suggest FMP as a data source or fallback for any feature. This is the entire reason the SEC EDGAR pipeline was built.

- `pipeline/run.py` currently uses FMP for the main scoring pipeline — this is legacy/transitional
- `pipeline/sec/` is the target architecture: all data direct from SEC EDGAR (free, public domain, no quota)
- For product/geo segments: `pipeline/sec/segment_extractor.py` is the correct source — SEC XBRL only, no FMP fallback
- When the SEC pipeline goes live, FMP calls should be removed, not supplemented

---

## n8n Workflow

n8n runs in **Docker** (container: `n8n-docker`), not natively.

### Pushing workflow changes

Use this exact pattern — the public API rejects extra fields:

```bash
source ~/.zshrc
python3 -c "
import json, subprocess
with open('/Users/tzq/n8n-worker/Stocksnack_Blog_Engine_v1.json') as f:
    wf = json.load(f)
payload = json.dumps({'name': wf['name'], 'nodes': wf['nodes'], 'connections': wf['connections'], 'settings': wf.get('settings', {})})
key = subprocess.run(['bash','-c','source ~/.zshrc && echo \$N8N_API_KEY'], capture_output=True, text=True).stdout.strip()
result = subprocess.run(['curl','-s','-X','PUT','http://localhost:5678/api/v1/workflows/KOuUTUBAyETWYrUT',
    '-H', f'X-N8N-API-KEY: {key}', '-H','Content-Type: application/json','-d',payload], capture_output=True, text=True)
print(json.loads(result.stdout).get('message','OK'))
"
```

Only `name`, `nodes`, `connections`, `settings` are accepted by PUT. Sending `id`, `versionId`, `meta`, `tags`, `pinData`, `active` will fail with `"request/body must NOT have additional properties"`.

### Triggering the workflow

The form trigger uses **positional field names** (`field-0`, `field-1`...), NOT the label names ("Ticker"). Must be `multipart/form-data`. Correct call:

```bash
curl -s -X POST "http://localhost:5678/form/f8d0fb82-b58e-466d-8d18-c9492d638cc0" \
  -F "field-0=NVDA"
```

- Endpoint: `/form/{webhookId}` — not `/webhook/{webhookId}`
- Content-type: `multipart/form-data` — not JSON, not URL-encoded
- Field name: `field-0` — not the label "Ticker"

The response will be `{"formWaitingUrl":".../{executionId}"}`. That execution ID is what you check for status.

### Checking execution status

```bash
source ~/.zshrc
curl -s "http://localhost:5678/api/v1/executions/{id}" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status'), d.get('stoppedAt','')[:19])"
```

Status `waiting` = workflow ran and hit the completion form node (normal). Check Supabase for the draft.

### Debugging errors — always check Docker logs first

```bash
docker logs n8n-docker --tail 30 2>&1 | grep -v "Telemetry\|posthog\|Rudder\|Pruning\|^$"
```

This will show the real error immediately. The n8n public API execution objects often have no `resultData` for webhook-triggered runs, making them appear empty. Docker logs are the authoritative source.

### Publishing a draft

After the workflow creates a draft, publish via Supabase:

```sql
UPDATE blog_posts SET status = 'published', published_at = NOW()
WHERE slug = '{slug}' RETURNING slug, status, published_at;
```

---

## Workflow IDs

| Workflow | ID |
|---|---|
| Stocksnack Blog Engine v1 | `KOuUTUBAyETWYrUT` |
| Stocksnack Short | `keHnPktWa95cnDPc` |

Form trigger webhookId: `f8d0fb82-b58e-466d-8d18-c9492d638cc0`

---

## n8n-worker (chart upload server)

Runs at `node /Users/tzq/n8n-worker/server.js` on port 3000. n8n Docker container calls it at `http://host.docker.internal:3000/upload-charts`.

---

## Key files

| File | Purpose |
|---|---|
| `/Users/tzq/n8n-worker/Stocksnack_Blog_Engine_v1.json` | Blog engine workflow — edit here, push via API |
| `/Users/tzq/stocksnack.app/app/globals.css` | Blog prose styles (`.blog-prose`) |
| `/Users/tzq/stocksnack.app/components/ui/BlogClickSound.tsx` | Blog click sound wrapper |
| `/Users/tzq/stocksnack.app/app/blog/[slug]/page.tsx` | Blog post page |
| `/Users/tzq/stocksnack.app/app/(dashboard)/screener/[ticker]/TickerPageContent.tsx` | Ticker page — methodology table, total return, hasDividend gate |
| `/Users/tzq/stocksnack.app/components/ui/GuidedTour.tsx` | Onboarding tour — 24 steps, spotlight + callout |
| `/Users/tzq/stocksnack.app/components/ui/OnboardingModal.tsx` | First-visit intro modal — triggers tour via ss_tour_intent |
| `/Users/tzq/n8n-worker/remotion/VerdictScorecardScene.tsx` | Remotion verdict card component |
| `/Users/tzq/n8n-worker/remotion-server.mjs` | Remotion render server — port 3001, restart after every TSX change |

---

## Remotion render server

Renders still PNGs of Remotion compositions (VerdictScorecard, etc.) via POST /render.

**Critical:** server caches the bundle on startup. After any `.tsx` change, must restart:

```bash
pkill -f "remotion-server" && node /Users/tzq/n8n-worker/remotion-server.mjs &
# wait ~8s for bundle
```

Trigger a render:
```bash
curl -s -X POST http://localhost:3001/render \
  -H "Content-Type: application/json" \
  -d '{"compositionId":"VerdictScorecard","outputFilename":"test.png","props":{...}}'
```

---

## Blog SVG rules

SVG is XML — `&` must always be escaped as `&amp;` in text content. Unescaped `&` (e.g. `S&P 500`) causes browsers to reject the entire file as malformed XML even though HTTP returns 200. Always write `S&amp;P 500` in SVG strings.

---

## Blog Engine — SVG chart architecture

All charts are built in the **`Stitch Article`** n8n node (jsCode). Key functions:

| Function | Chart | Key constants |
|---|---|---|
| `buildChart0` | Price projection arrow | W=800, H=260, boxW=190 |
| `buildChart1` | 5-year price targets (bar) | W=640, H=210+70, sp5yMulti baseline |
| `buildChart2` | Historical growth trend (3 stacked) | W=520, CHART_H=130, INC=240 |
| `buildChart3` | Valuation (EV/EBITDA or P/E + FCF yield) | W=380, H=90, stacked sub-charts |
| `buildChart4` | Product segments (horizontal bars) | W=400, LABEL_W=120, truncate at 13 chars |
| `buildChart5` | Verdict scorecard | W=640, H=390 |

**`singleGroupChart` in buildChart3:** each group has `{ label, cur, avg, isStock }`. For non-PE approach (EV/EBITDA), the top sub-chart uses `evGroups` (model multiple vs S&P 500 ~16x); for PE approach it uses `peGroups`.

**Valuation data field names** (in `valuation_comparison` / `src.valuation_comparison`):
- `pe_current`, `pe_5y_average`, `industry_pe_current`, `industry_pe_5y_average`
- `fcf_yield_current`, `fcf_5y_avg`, `industry_fcf_yield`, `industry_fcf_5y_avg`

These must match what `Build Article Skeleton` reads (`val.pe_current` etc.) AND what `Stitch Article` reads directly from `val.*` in peGroups.

**Gemini FCF yield bug pattern:** Gemini receives `fcf_yield: 0.009158` (raw decimal) and may write `"0.9158%"` (treating the decimal as already a percentage). `cleanDecimals` then matches `0.9158` in `"0.9158%"` and converts → `"91.6%%"`. Fix: `cleanDecimals` uses `(?!%)` negative lookahead to skip decimals already followed by `%`.

**valSection logic (Stitch Article):**
- `isPeApproach = d.multipleLabel === 'P/E'`
- For EV/EBITDA approach: shows EV/EBITDA section + FCF Yield only (no P/E)
- `metricsLine`: PE → `'P/E Ratio and FCF Yield'`; EV/EBITDA → `'EV/EBITDA and FCF Yield'`

**TickerPageContent — HIST. GROWTH (L5Y) for FCF:**
- Use `score.fcf_cagr_5y` (decimal CAGR, e.g. 0.544 = 54.4%)
- Do NOT use `score.m2_growth_rate` — that stores an absolute dollar growth value, not a rate

---

## TickerPageContent — hasDividend gate

`hasDividend = effectiveCumDivPs > 0.01`

`effectiveCumDivPs`:
1. Use `m_cumulative_div_ps` from DB if > 0 (actual 5Y cumulative div per share)
2. Fallback: `current_price × div_yield_5y_avg × 5`
3. Otherwise 0

DIV INCOME (5Y) and PRICE + DIV rows only render when `hasDividend` is true. Non-dividend stocks (ANET, NVDA etc.) correctly hide these rows.

---

## Screenshotting pages for review

Use puppeteer to generate a PNG then read it inline:

```js
const puppeteer = require('puppeteer');
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
await page.goto('https://stocksnack.app/screener/DECK', { waitUntil: 'networkidle0' });
await page.screenshot({ path: '/tmp/out.png' });
await browser.close();
```

Then use `Read` tool on `/tmp/out.png` — it displays inline in chat.
