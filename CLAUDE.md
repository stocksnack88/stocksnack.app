# Claude Code — Operational Notes for StockSnack

This file is for Claude Code agents. Read before working on anything n8n or deployment related.

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
