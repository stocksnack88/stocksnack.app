# Claude Code — Operational Notes for StockSnack

This file is for Claude Code agents. Read before working on anything n8n or deployment related.

**START HERE:** Read `stocksnack-handoffv17.md` first. It contains the current session handover — CTA work, TTS experiment, Remotion template status, solved decisions, and priority order for the next session.

---

## Universe Expansion — Data Quality Status — 2026-07-17

S&P Composite 1500 (500+400+600) fully pulled. Backend can freely ingest new tickers ahead of launch — `stocks.index_tags` + `isLaunchedStock()` in `lib/constants.ts` keep anything tagged `SP400`/`SP600` hidden from the live site until the tag is removed from the gate list. See `pipeline/migrate_add_stock_tags.sql`, `pipeline/sec/run_sec.py --index-tag`, `.github/workflows/backfill-new-universe.yml`.

**Pull status:**

| | S&P 500 | S&P 400 | S&P 600 |
|---|---:|---:|---:|
| Attempted | 500 | 400 | 603 |
| Pulled successfully | 502 | 398 | 598 |
| Failed | — | 2 (JHG, OZK) | 5 (PFBC, MBGL, MFP, VGNT, CWEN-A) |

**QC status** (`pipeline/sec/health_report.py --ticker-file <file>`, ported from `app/admin/health/page.tsx`'s methodology; 🟢/🟡/🔴 = good/warn/bad):

| | S&P 500 | S&P 400 | S&P 600 |
|---|---:|---:|---:|
| Fully clean (zero QC flags) | 🟢 90% | 🟡 82% | 🔴 74% |
| sga null despite revenue | 🔴 30% | 🔴 32% | 🔴 30% |
| geo_segments null | 🔴 34% | 🔴 43% | 🔴 51% |
| EBITDA null w/ positive net income | 🟢 0 | 🟡 16 | 🟡 23 |
| Interior data gaps | 🟢 2 | 🔴 49 | 🟢 2 |
| Scale/magnitude spike errors | 🟡 7 | 🟡 7 | 🟡 14 |

**Important calibration finding**: a sample audit of 50 null-`geo_segments` tickers found **38% (19/50) were real bugs, not legitimate gaps** — don't assume a null field is fine just because it "could" be legitimate. Always sample-check against the raw filing before trusting a null rate as acceptable.

### Fix checklist

**✅ Fixed & verified this session** (all in `pipeline/sec/segment_extractor.py` unless noted):
- [x] Insurers (AFG) — revenue tag `RevenuesBeforeRealizedGainsLosses` lives in a company-extension namespace, not `us-gaap` — broadened namespace search to the whole document
- [x] Regional banks (WAL, EWBC) — revenue tagged as `InterestIncomeExpenseNet`, not any `Revenues`-family tag — added as candidate
- [x] SG&A (`pipeline/sec/tag_mapping.csv`) — added `GeneralAndAdministrativeExpense` as a 3rd candidate tag (verified via CMG)
- [x] Geo-segment 2-entry threshold bug — segments correctly identified as geo-named (e.g. TRU's "U.S. Markets"/"International") were being discarded because promotion required ≥3 segments; lowered to ≥2 (same bar used everywhere else)
- [x] Geo-keyword regex — was missing "U.S."/"United States"/"domestic"/"canada" entirely, so any 2-region US/International split silently fell through

**🟡 Found, partially fixed, needs more work:**
- [ ] REITs (AMH) — custom `CoreRevenues` tag added, now finds 3 revenue facts (up from 0), but a downstream dedup/rollup filter still blocks a final segment result from being produced. Root cause not yet found.
- [ ] RYN discrepancy — flagged as a "bug candidate" by the sample-audit script, but a direct `get_segments()` call shows it working correctly. Unresolved: either stale Supabase data (needs re-extraction) or a bug in the sample-audit script's own classification logic.

**⬜ Found, not yet investigated:**
- [ ] `rd_expense` null rate — same "sample the raw filing, don't assume" check as geo_segments hasn't been run yet; the 55-62% null rate might have the same ~38%-are-bugs pattern hiding in it
- [ ] `product_segments` null rate — same check, not yet run
- [ ] Scale/magnitude spike errors (7-14 across universes) — suspicious round placeholder-looking values (e.g. `-$1M`, `$200K` next to real multi-hundred-million figures) found but root cause not investigated
- [ ] Interior data gaps — 49 in S&P 400 vs only 2 in S&P 500/600 each; why so much higher specifically for S&P 400 is unexplained
- [ ] Balance sheet sanity failures (7 total across universes)
- [ ] Split mismatch detector hits (~14+ total — APG, RYN, BILL, ARWR flagged in S&P 400 alone)
- [ ] Peer outliers >3σ (~40+ across universes) — admin page's own note says banks are expected outliers, but non-bank cases haven't been individually verified
- [ ] ~1,000+ "all-null unconfirmed" fields per universe — need per-field/per-sector triage into `confirmed_exceptions` (legitimate business-model gaps) vs real bugs

**🔧 Operational — re-run needed:**
- [ ] Full re-extraction pass across all 1,498 pulled tickers to pick up every fix above (all fixes so far only apply to newly-processed tickers going forward)
- [ ] Retry/investigate the 7 failed tickers (JHG, OZK, PFBC, MBGL, MFP, VGNT, CWEN-A)

### International expansion roadmap (agreed 2026-07-17)

Once S&P 1500 is clean: **UK → Japan → Korea → EU** (ranked by ease of data extraction, not business priority — see conversation for the full market-by-market research). Reused infra: Supabase schema (`country`, `fx_rates.py`) and `ifrs_field_mapper.py`'s pattern are already proven via TSM and directly relevant to UK/EU/Korea (all IFRS-taxonomy). Japan (JP-GAAP) and each market's own API (EDINET, DART, FCA/NSM, ESMA OAMs) need dedicated new integration work — this is not a "swap the ticker list" expansion like S&P 400/600 was.

---

## Current Remotion / Video Pipeline Status — 2026-07-15

The Remotion visual-template build is complete.

Current source of truth:

- Active approved visual states: **45/45**
- `Valuation Method` is **removed as a standalone template**
- Do **not** build a separate `ValuationMethodScene`
- The old 46-template plan is closed
- `Valuation Method` is covered by the Price Projection overview + method breakdown states:
  - `/Users/tzq/n8n-worker/remotion/PriceProjOverviewScene.tsx`
  - `/Users/tzq/n8n-worker/remotion/EbitdaMethodScene.tsx`
  - `/Users/tzq/n8n-worker/remotion/FcfMethodScene.tsx`
  - `/Users/tzq/n8n-worker/remotion/DividendMethodScene.tsx`

Approved scene-family count:

| Scene family | Active states | Status |
|---|---:|---|
| Verdict Scorecard | 1 | Approved |
| Price Projection | 4 | Approved |
| Growth Quality | 4 | Approved |
| Segment Breakdown | 2 | Approved |
| Financial Health | 29 | Approved |
| Valuation Comparison | 4 | Approved |
| What You Are Buying | 1 | Approved |
| Valuation Method | 0 | Removed / merged |
| **Total** | **45** | **Complete** |

New long-video pipeline scaffold:

- Contract / scene recipe:
  - `/Users/tzq/n8n-worker/remotion/longVideoContract.ts`
- New master preview composition:
  - `/Users/tzq/n8n-worker/remotion/StockSnackLongVideoV1.tsx`
- Registered Remotion composition:
  - `StockSnackLongVideoV1`
- Implementation notes:
  - `/Users/tzq/n8n-worker/remotion/LONG_VIDEO_PIPELINE_V1.md`
- Visual grammar prototype:
  - `/Users/tzq/n8n-worker/remotion/visualGrammar.ts`
- Block A+B prototype builder:
  - `/Users/tzq/n8n-worker/remotion/blockABPrototype.ts`
- Prototype composition:
  - `StockSnackLongVideoBlockAB`
- Actual-output block wrappers now added:
  - `/Users/tzq/n8n-worker/remotion/StockSnackBlockD.tsx`
  - `/Users/tzq/n8n-worker/remotion/StockSnackBlockE.tsx`
  - `/Users/tzq/n8n-worker/remotion/StockSnackBlockF.tsx`
- Existing workflows are reference only for the new V1 pipeline scaffold:
  - Do not edit `KOuUTUBAyETWYrUT`
  - `aIYLq0PFvnzE9vOq` — **this restriction was lifted 2026-07-11** for the legacy short-form pipeline (unrelated to the new V1 prototype work above). It is the live production long-form workflow (`Stocksnack Short new voicing — single long TTS test`) and was actively debugged/fixed that session (TTS voicing, audio stitching). See `stocksnack-handoffv17.md` §4 and §14 for details. Treat it as production, not reference — still confirm scope with Tong before large structural changes, but routine fixes are fair game.

### Critical correction from July 11 prototype review

The Block A+B prototype rendered successfully, including Gemini/Iapetus VO, but Tong rejected the workflow logic because it was still too template-first.

Do **not** proceed as:

```text
template → script fitted into template → keyword timing → render
```

Correct order:

```text
script → VO → STT → structure extraction → keyword extraction → scene/template suggestion → render
```

Meaning:

- The script is the source of truth.
- VO/STT provides real timing.
- Structure extraction decides how the current spoken content should be shaped.
- Keyword extraction happens after structure is known.
- Templates are containers only; templates must render the extracted content, not decide the content.
- Before rendering, produce a table/JSON review artifact with:
  - script meaning
  - structure type
  - template suggestion
  - actual visible content
  - keywords
  - highlight sequence

Permanent rule:

> The content decides the structure. The structure chooses the template. The template renders the extracted content.

Prototype outputs created:

- `/private/tmp/ss-prototype-a-motion-preview.mp4`
- `/private/tmp/ss-block-ab-preview.mp4`
- `/private/tmp/ss-block-ab-vo-preview.mp4`
- `/private/tmp/ss-block-ab-v2-semantic-vo-preview.mp4`
- `/private/tmp/ss-block-ab-vo.wav`
- `/private/tmp/ss-block-ab-vo-v2.wav`

### July 12 Block A+B Layer 2 price projection learnings

Latest prototype file:

- `/Users/tzq/n8n-worker/remotion/StockSnackBlockABV2.tsx`

Latest preview output:

- `/private/tmp/ss-block-ab-v22-complete-focus-sharper-table.mp4`

What was learned:

- The bottom `Price Projection Overview` should stay visible after it appears. Do not remove it when the detailed method table starts; it acts as the user's anchor while the table explains the mechanics.
- During the bottom overview intro, the full table at the top should not appear at all. A faint ghost table was distracting; hide the table fully until the walkthrough starts.
- The detailed price projection table must not pre-fill columns before narration reaches them. Example: FCF current price should remain empty until the FCF section starts.
- Focus animation must be cell-to-cell, not whole-table. If cell A hands off to cell B, A should dim down while B brightens up at the same time. Do not interpolate the whole table against a global focus strength, or the entire table flashes brighter during handoff.
- Every spoken/revealed row needs a focus anchor. The missing anchors caused values to appear without any highlight movement. Include anchors for `DIV INCOME`, `PRICE + DIV`, `FUTURE RETURN`, `RETURN CAGR`, `VS S&P 500`, plus the equivalent FCF rows.
- For dense vertical tables, "non-HD" often is not export resolution. The composition is 1080×1920, but small low-opacity text plus glow creates a mushy look. Reduce table-wide glow, remove base glow from value chips, and reserve glow mainly for the active cell.
- Bottom overview looks sharper because it uses fewer elements, larger text, higher contrast, and less competing glow. Use it as the quality benchmark.

Current focus hierarchy for dense method tables:

| Layer | Meaning | Treatment |
|---|---|---|
| 1 | Exact active cell | 100% opacity, strongest brightness, controlled inner glow |
| 2 | Same row / same method column | Medium-low context opacity |
| 3 | Metric labels + method headers | Readable structure, lower emphasis |
| 4 | Non-presented / unrelated columns | Very dim but still present |

Permanent implementation rule:

> In a busy Layer 2 table, only the active/focus cell should change strongly. The table, labels, headers, and unrelated cells must keep stable layer settings so the user's eye does not get pulled away by accidental global brightness changes.

### July 15 Blocks D/E/F actual-output status and rules

The new long-video work is now evaluated by actual block outputs, not visual-only mockups.

Required chain:

```text
script → VO → STT → structure/focus extraction → Layer 1 keyword cards → Layer 2 approved scenes → MP4 review
```

Latest outputs:

| Block | Content | Latest output | Status |
|---|---|---|---|
| D | Growth quality | `/private/tmp/ss-block-d-v13-text-only-number-shine.mp4` | Passed |
| E | Business segments | `/private/tmp/ss-block-e-v5-text-only-number-shine.mp4` | Passed |
| F | Financial health | `/private/tmp/ss-block-f-v1-actual-output.mp4` | Rendered for review |

Block-level visual rules learned:

- Layer 1 keyword cards must be short, large, premium, and placed in safe blank space.
- Exact spoken values should use text-only shine-through. Do not add another overlay/pill if the value already exists in the visual.
- Do not glow a whole card when the narration only emphasizes one number.
- Gradual focus is mandatory: outgoing element dims while incoming element brightens.
- `HealthScorecardScene` now supports `focusWeights` because hard on/off focus caused sudden glow jumps.
- Block F currently demonstrates one health metric detail (`Cash / Debt`). Future strong-health automation should select 3 strongest metrics from the shortlist once all detail paths are wired.

### Review-output delivery rule — do not use web preview by default

Tong expects the same direct local-file Markdown link format used for the approved Block D/E outputs.

Correct:

```md
Block F: [ss-block-f-v1-actual-output.mp4](/private/tmp/ss-block-f-v1-actual-output.mp4)
```

Wrong unless explicitly requested:

```md
Block F: [ss-block-f-v1-actual-output.mp4](http://127.0.0.1:8123/ss-block-f-v1-actual-output.mp4)
```

Do not start a localhost server to show review videos unless Tong asks for it. `http://127.0.0.1` opens as browser/web view and breaks the expected local-file review workflow. If the file link seems non-clickable, do not guess a new delivery method; keep the known `/private/tmp/...mp4` format and investigate separately.

Next milestone:

Move from scaffold into a new n8n workflow:

1. Supabase-only data fetch + assembler for `StockSnackLongVideoData`
2. Structured script JSON generator + validator
3. TTS using current StockSnack v9 VO style (`/Users/tzq/n8n-worker/VO_STYLE_CHANGES.md`: short style prompt + inline vocal tags/disfluencies)
4. STT word timestamps
5. Structure extractor: script + transcript → content structures
6. Keyword extractor: structures → visible keywords
7. Scene/template suggestion artifact for Tong to review before render
8. Timing map for anchors, focus actions, and Layer 1 keyword cards
9. Render call into `StockSnackLongVideoV1`
10. CTA stitch: StockSnack after price projection, StockAnalysis.com at true end
11. One playable 10–12 minute preview using MSFT or NVDA, only after structure/keyword plan passes review

Updated status docs:

- `/Users/tzq/stocksnack.app/stocksnack-handoffv17.md`
- `/Users/tzq/stocksnack.app/VIDEO_TRIGGER_MAP.md`
- `/Users/tzq/stocksnack.app/DESIGN_SYSTEM.md`
- `/Users/tzq/n8n-worker/remotion/TEMPLATES_SUCCESS.md`
- `/Users/tzq/n8n-worker/remotion/TEMPLATES_FAILED.md`
- `/Users/tzq/n8n-worker/remotion/LONG_VIDEO_PIPELINE_V1.md`

---

## Working with Tong — Communication Rules

**If feedback is not specific enough, push back and ask for specifics before acting.**

Do NOT guess what the user means. If a bug report says "X is not working" or "Y looks wrong" without describing *what* the expected behaviour is or *what step* triggers it, respond with: "Can you describe what you expected to see vs what you actually saw?" or "Can you walk me through the exact steps to reproduce this?"

For tour / UI bugs specifically — always ask:
- Which step number is broken?
- What did it look like vs what did you expect?
- Is it consistent or intermittent?

**Alternatively, offer to investigate first.** If the user says something is broken but the root cause is unclear, ask: "Do you want me to investigate and report back before making changes?" Do not dive into code changes without a clear diagnosis confirmed with the user.

**When the user says "investigate", produce a written report first. No code changes until the user says to proceed.**

**When explaining a UI or animation fix, always use this structure:**

1. **Parts first** — list every moving piece in plain English before explaining anything (e.g. "Highlighted box — the green glowing box", "Callout box — the white popup with the Next button")
2. **What you saw** — describe the symptom from the user's perspective, not from the code's perspective
3. **Why it happened** — use an analogy or describe the motion, not code terms (e.g. "like trying to hide a piece of paper behind a book but the bottom half hangs out")
4. **What I changed** — one plain English sentence
5. **What motion to expect now** — numbered steps describing what the user will SEE on screen

Do NOT explain with variable names, function names, or pixel offsets. The user needs to picture the motion to verify the fix is correct.

**When reporting on a problem (investigate mode), use a structured table:**

- One table per problem
- Columns: (i) Status, (ii) Key blocker, (iii) Next step proposal
- Keep each cell short and layman — no jargon
- Do not mix problems into one table

**When the user asks to align on a problem before fixing:**

1. List the parts involved (what is each piece called, what does it do)
2. Describe what is happening step by step — like a scene playing out, not a code trace
3. Identify exactly which part is misbehaving and why
4. Propose the fix in plain English — user approves before any code is touched

---

## Tour Bug Rules — Read Before Touching GuidedTour.tsx

These rules exist because past fixes to one step broke all other steps. Follow them strictly.

**Scope rule:** Every tour fix must be scoped to the exact steps the user named. If the fix requires touching shared logic (scrollToTarget, doReveal, updateRect, stableCallout), stop and flag it to the user — do not proceed without explicit approval.

**Regression rule:** After any change, mentally trace through what happens on steps 1, 5, 10, 15, 20, 24 to check for side effects. If unsure, flag it.

**Revert rule:** If a deployed fix causes regression on ANY step outside the intended scope, revert ALL changes immediately and report back. Do not try to patch around it.

**scrollToTarget / doReveal are global:** Any change to these functions affects every single-target step (steps 1–24 excluding multi-target). Do not modify them without user approval and a full regression check.

**skipUfo sliver rule:** For steps that use `skipUfo`, the sliver (collapsed box) must end up fully INSIDE the callout box — not at the edge, not below it. The formula:
- Callout above → `collapseTop = prev.top - 8` (sliver bottom aligns with callout bottom)
- Callout below → `collapseTop = prevCallout.top + 8` (sliver top aligns with callout top)

**doReveal scroll rule:** Do NOT call `scrollToTarget()` inside `doReveal()`. By the time scroll-idle fires (150ms), the element is already at its final position. A second scroll causes the callout to chase the moving element and appear at the wrong position.

---

## Pending Tasks (as of 2026-06-29)

### ✅ Onboarding Tour — COMPLETE (signed off 2026-06-29)

All tour issues resolved. Do not revisit unless Tong raises a specific new issue.

**Callout height rule (new):** Never hardcode callout height. Always read the actual rendered height from the DOM. Use a reactive effect to re-anchor after text renders if needed.

### ✅ Segment Extractor — All Known Bugs Fixed (2026-06-29)

All previously-flagged bugs resolved and DB updated. Verified via Supabase:
- ✅ HON, GE, BA, HD, CAT, TGT, XOM, AMZN, NKE, MRK — all clean
- ✅ **BIIB geo** — US now appears (53.0%), Europe ex-Germany 28.0%, Germany 12.7%, Asia 6.3%. Root cause was a `next()` vs `max()` bug in the geo dedup that used the first (possibly tiny per-drug) country:US value as the representative, making every US fact appear subsumed by EuropeExGermany. Fixed in `_build_segments`.
- ✅ **PEP** — geo business units (PBNA, EMEA, LatAm, AsiaPacific) moved from product axis to geo axis. product_segments=None. Root cause: PEP's BizSegments are all geo-named; new `_is_all_geo_named` check detects this and routes them to geo. Fixed in `parse_segments`.

**Known limitation (not a bug):** BIIB US value ($3.5B) is the MAX of per-drug US revenues, not the true total (which would be higher if summed across all drugs). Fixing this would require SUM vs MAX logic in 2dim_geo aggregation when no product hierarchy exists — deferred.

### ✅ LLY Pipeline — Fixed (verified 2026-06-29)
DB now has correct individual drug data: Mounjaro 33.8%, Zepbound 19.9%, Verzenio 8.4%, Trulicity 6.3%, etc. Old 3-segment data is gone. Geo segments also look correct (US 71.2%, Europe 18.9%, Rest of World 9.9%).
- **Next step**: retrigger LLY blog to get drug-level breakdown in the article (old draft used stale segment data)

### 🟡 Blog — LLY Draft Is Stale
- LLY segments now correct in DB — a fresh LLY blog trigger is needed to get drug names (Mounjaro, Zepbound, etc.) into the article
- Old execution 1738 should be ignored; trigger a new one

### 🟡 Blog Insights Quality
- User confirmed insights sections are not good — root cause identified: no per-drug time-series data in the Gemini prompt
- Result: generic pharma language instead of drug-specific insights (e.g. "Mounjaro grew 118% YoY")
- **No action yet** — user said investigate only. Fix requires passing individual drug revenue time-series into the Gemini prompt.

### 🟢 SEC Pipeline — Long-term Architecture
- `pipeline/sec/` is the target architecture to replace all FMP calls
- Still needs: `verify.py`, hazard flag detection, go-live switch
- When live: remove FMP calls from `pipeline/run.py`, do not supplement

---

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
| Stocksnack Short new voicing — single long TTS test (long-form pipeline, active production) | `aIYLq0PFvnzE9vOq` |

Form trigger webhookId: `f8d0fb82-b58e-466d-8d18-c9492d638cc0`

### Pushing changes to `aIYLq0PFvnzE9vOq`

This workflow has no local JSON file to edit — it lives only in n8n's SQLite DB inside the `n8n-docker` container. Use the n8n CLI (not the REST API — no API key is configured for it):

```bash
docker exec n8n-docker n8n export:workflow --id=aIYLq0PFvnzE9vOq --output=/tmp/wf.json
docker cp n8n-docker:/tmp/wf.json ./wf.json
# edit wf.json (python3 -c "..." with json.load/dump is reliable for targeted node/connection edits)
docker cp ./wf.json n8n-docker:/tmp/wf.json
docker exec n8n-docker n8n import:workflow --input=/tmp/wf.json
```

Always re-export and diff node count / connections after import to confirm nothing else was disturbed. **Refresh the n8n editor browser tab after importing** — the editor holds its own in-memory copy and will silently clobber the CLI import if the user saves from a stale tab.

To inspect past executions (e.g. to pull the actual generated TTS audio out of a run, or check exact node inputs/outputs) — the REST API often returns empty `resultData` for this workflow. Instead copy the live DB out and query it directly:

```bash
docker cp n8n-docker:/home/node/.n8n/database.sqlite /tmp/n8n.sqlite   # ~3.4GB — copy to scratch, not the repo
sqlite3 /tmp/n8n.sqlite "SELECT id, status, startedAt FROM execution_entity WHERE workflowId='aIYLq0PFvnzE9vOq' ORDER BY id DESC LIMIT 10;"
sqlite3 /tmp/n8n.sqlite "SELECT data FROM execution_data WHERE executionId=<id>;"   # flattened array format, dereference string-index refs
```

Delete the copied `.sqlite` file when done — it's large and shouldn't linger.

---

## n8n-worker (render/chart/stitch server)

Runs `node /Users/tzq/n8n-worker/server.js` on port 3000, **managed by PM2** as `render-server` (not a bare background process). n8n Docker container calls it at `http://host.docker.internal:3000/...`.

Restart after any edit: `pm2 restart render-server` (do not `pkill`/manually background it — PM2 will just respawn it anyway, but doing it manually leaves a duplicate/orphaned process).

Key endpoints:

| Endpoint | Purpose |
|---|---|
| `POST /render` | Renders the long-form video (ffmpeg drawtext overlays over `background_long.mp4`) |
| `POST /upload-charts` | Blog engine chart image upload |
| `POST /stitch` | Appends `Affiliate MP4.mp4` to the end of a render, in place. **Re-encodes** (fixed 2026-07-11 — was `-c copy`, which silently corrupted the tail because the render's audio (mono/24kHz) doesn't match the affiliate clip's (stereo/48kHz)) |
| `POST /stitch-mid` | Inserts `Affiliate MP4 mid converted.mp4` at `gqStart`, in place. Always re-encoded via `filter_complex` concat |
| `GET /file/:filename` | Added 2026-07-11. Serves a rendered video by filename, searching `renders/` recursively (files live in per-runId subfolders). Used by the `Long Fetch Video File` node for the approval → YouTube-upload step |

`/stitch` and `/stitch-mid` both overwrite the input file in place (rename temp → original), so a video can safely go through both in sequence.

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
| `/Users/tzq/n8n-worker/remotion/TEMPLATES_SUCCESS.md` | Source of truth for approved Remotion visual states — currently 45/45 |
| `/Users/tzq/n8n-worker/remotion/TEMPLATES_FAILED.md` | Confirms no active visual states pending; Valuation Method removed |
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

---

## Remotion long-video visual QA rules

The current long-video Remotion work lives in `/Users/tzq/n8n-worker/remotion/`.

Important Block F financial-health reference:

- Latest passed render: `/private/tmp/ss-block-f-v22-stt-global-retime.mp4`
- Plan: `/Users/tzq/n8n-worker/remotion/BLOCK_F_FINANCIAL_HEALTH_PLAN.md`
- Workflow notes: `/Users/tzq/n8n-worker/remotion/ACTUAL_OUTPUT_WORKFLOW.md`

Rules learned from the Block F review:

- Script/VO meaning drives visual emphasis. Do not animate important values before the narration reaches them.
- Separate quiet scene presence from active focus shine.
- Merge semantically connected comparison items into one stable focus state.
- Avoid hard visual thresholds such as `shine > 0.05` / `activeWeight > 0.25`; these cause sudden shine or dim.
- Avoid accidental `shine → dim → shine again`.
- Keep benchmarks visible during comparison.
- Use text-only shine-through for existing numbers/labels instead of extra overlay pills.
- Before showing a Remotion review render, run the 3-round director QA: brightness/scene scan, contact-sheet review, and timing/code validation against the spoken anchors.
