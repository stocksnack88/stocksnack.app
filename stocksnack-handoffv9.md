# StockSnack Handover — Session 2026-06-28

This document is written for the next Claude agent picking up this project. Read it fully before touching anything. It covers the vocabulary Tong uses, the problems we solved today, what's still pending, and how to work with Tong effectively.

---

## 1. How To Talk With Tong (Read This First)

Tong communicates visually. He describes what he SEES on screen, not what the code is doing. When he says something is broken, he tells you where his eyes were and what they expected to see. Your job is to translate that into a code-level diagnosis, then explain the fix back in the same visual language — not in variable names.

### The vocabulary we've settled on

| What Tong calls it | What it actually is |
|---|---|
| **Highlighted box** | The green glowing rectangle that appears around the element being pointed to. This is the "spotlight" in code — a cutout in the dark overlay with a green border |
| **Callout box** | The white popup card that floats near the highlighted box. It has the instruction text and the Next button |
| **Silver / sliver** | The tiny collapsed version of the highlighted box during transitions. When the tour moves from one element to another, the highlighted box collapses to a thin strip before travelling to the next element |
| **Black canvas** | The dark semi-transparent overlay that covers the whole screen during the tour, with the highlighted box cut out of it |
| **Top / bottom** (of callout) | Whether the callout box appears ABOVE or BELOW the highlighted box — not top/bottom of the screen |
| **Collapse** | When the highlighted box shrinks down to a sliver as the user taps and the tour moves on |
| **Expand / expanded** | When the sliver grows back out to full size at the new element |
| **Travel** | The UFO animation where the sliver moves invisibly between two elements before expanding at the destination |

### How to explain a fix to Tong

Always use this structure. He needs to picture the motion to verify the fix is correct.

1. **Parts first** — name every piece involved before explaining anything
2. **What you saw** — describe what was wrong from HIS view (not from the code's view)
3. **Why it happened** — use an analogy or describe the motion, never say variable names or pixel offsets
4. **What I changed** — one sentence in plain English
5. **What to expect now** — numbered steps describing exactly what he will SEE happen on screen

Bad: "The `expandBoxes` was captured at t+320ms causing `above` to flip from true to false."
Good: "The green box was measuring its own position 320ms too late — by then the accordion had shifted it, so the callout thought it was near the top of the screen and moved below. I told it to measure the position when the callout first appears instead."

### When Tong says something doesn't look right

If the feedback is vague ("it's at the wrong position"), PUSH BACK and ask:
- Which step number?
- What did you expect to see, vs what did you see?
- Did it always happen or only sometimes?

Do not guess. Do not dive into code without a clear diagnosis. Offer to investigate first and report back.

### When Tong says "investigate only"

Write a structured report. No code changes until he says go. Use tables. One problem per table. Keep cells short — no jargon.

---

## 2. The Onboarding Tour — Architecture Overview

The tour is a 24-step walkthrough of the app. It lives entirely in:

**`/Users/tzq/stocksnack.app/components/ui/GuidedTour.tsx`**

### What the tour looks like

- A dark overlay covers the whole screen (the "black canvas")
- A cutout ("highlighted box") shows the current element at full brightness
- A green border rings the cutout
- A white callout box floats above or below the highlighted box
- A pulsing dot appears on the nav bar to show where the tour button is

### The STEPS array

There are 24 steps defined at the top of GuidedTour.tsx. Step N/24 = `STEPS[N-1]` (0-indexed).

Key fields on each step:
- `page`: which page the element is on (`'any'`, `'screener'`, `'ticker'`)
- `target`: CSS selector for the element to highlight
- `action`: `'tap'` (tap anywhere / callout button) or `'click'` (tap the highlighted element itself)
- `skipUfo`: if true, this step uses an in-place collapse animation instead of invisible travel
- `multiple`: if true, multiple elements are highlighted together (method-1/2/3 cards)
- `openLayerIds`: layer numbers to open before locating this step's element
- `optional`: if true and element not found after 6 retries, auto-advance

### The two transition types

**Regular UFO** (most steps):
1. Highlighted box HIDES instantly (black canvas becomes solid)
2. Page scrolls to new element
3. After scroll settles: highlighted box reappears as a tiny 2px sliver
4. Sliver grows out to full element size
5. Callout slides from old position to new position

**skipUfo** (steps 9, 10, 11 only — the three method cards):
1. Highlighted box VISIBLY collapses downward to a tiny sliver behind the callout box
2. Sliver HIDES
3. Highlighted box reappears as sliver at the new element
4. Sliver grows out to full element size
5. Callout slides to new position

### The callout position rule (as of today)

**Callout is ALWAYS above the highlighted element.** It only goes below if the element is so close to the navigation bar that there is literally no room for the callout above it.

Formula in code (derivedCallout):
```
canBeAbove = spotlight.top - navBottom >= calloutH + 4
mustBeAbove = spotlight.top + spotlight.height + calloutH + 12 > window.innerHeight
above = canBeAbove || mustBeAbove
```

The callout sits FLUSH against the element — `top = displayRect.top - calloutH`. No gap between callout bottom and element top.

---

## 3. Problems Solved This Session

### 3.1 Blog word count gate was too narrow

**What broke:** Blog execution 1757 errored with "Article length outside range: 1878 words"

**Why:** The `Validate Draft1` node in the n8n workflow had a ceiling of 1700 words. After improving the Gemini prompt, it started generating richer output that exceeded this.

**Fix:** Raised ceiling from 1700 → 2500 words in the `Validate Draft1` jsCode node.

**File:** `/Users/tzq/n8n-worker/Stocksnack_Blog_Engine_v1.json`

---

### 3.2 iPhone segment missing from blog output

**What broke:** Execution 1759 — Gemini returned an empty description for the iPhone segment in `segment_descriptions`.

**Why:** The Gemini prompt instruction was vague — it said "return descriptions for the segments" but didn't enforce that ALL segments from `allProdSegs` must appear.

**Fix:** Rewrote the instruction to explicitly say "IMPORTANT: You MUST include every single segment from allProdSegs — do not skip any."

**File:** `Write Single-Stock Article1` node in the n8n workflow.

---

### 3.3 Small gap between callout and highlighted box (steps 3, 4, 8, 23)

**What Tong saw:** A thin dark strip between the bottom of the callout and the top of the green glowing box.

**Why:** The callout was positioned using `spotlight.top - calloutH`. The spotlight adds 8px of breathing room ("pad") around the element. So the callout bottom was 8px ABOVE the element — leaving an 8px dark gap.

**Fix:** Changed callout positioning to use `displayRect.top - calloutH` instead of `spotlight.top - calloutH`. Callout bottom now sits flush against the element's actual top edge.

**Scope:** This change affects ALL steps (derivedCallout is shared). All steps now have zero gap.

---

### 3.4 Callout appearing above OR below inconsistently (steps 10, 11, 12)

**What Tong saw:** Sometimes the callout appeared above the method card, sometimes below. Inconsistent on repeat visits.

**Why:** The old rule was "go above if there's ≥52px of space above the element." Depending on scroll position, the same element could pass or fail this threshold.

**Fix:** Changed to "PREFER above whenever the callout fits. Only fall below if element is too close to the nav bar." The new threshold adapts to the actual callout height.

**Scope:** Shared logic — affects all steps. All steps now prefer above consistently.

---

### 3.5 Accidental ticker click breaking the tour on startup

**What Tong saw:** When tapping the tour button and then accidentally tapping a stock ticker before the black canvas appeared, the app navigated to that ticker instead of starting the tour. The tour was broken.

**Why:** There's a brief ~100ms window between the tour activating and the dark overlay appearing. During that window, the page was fully interactive.

**Fix:** Added an invisible transparent blocker that covers the whole screen the instant the tour becomes active. It blocks all taps until the overlay is ready, then disappears automatically.

**Note:** The blocker is zero-opacity (transparent) and invisible. The user just can't accidentally tap through it.

---

### 3.6 Step 24/24 callout jumping from top to bottom mid-step

**What Tong saw:** When landing on step 24, the callout appeared correctly above the Final Score header. Then it jumped down below it.

**Why:** A timer fires 320ms after the callout appears to expand the green spotlight from its initial 2px sliver to full element size. This timer was re-measuring the element's screen position at that moment (320ms later). Between the callout appearing and the timer firing, the accordion opening caused a small page scroll, which moved the element's position. The recomputed position was now too close to the nav bar, so `canBeAbove` failed, and the callout flipped to below.

**Fix:** Capture the element's screen position at the exact moment the callout appears (in `doReveal()`). Store it in `revealBoxes`. The expansion timer uses `revealBoxes` instead of re-measuring live. The spotlight expands to where the callout was already shown — no drift possible.

**Scope:** This change applies to ALL steps that use regular UFO animation. It makes every expansion use the reveal-time position, which is always correct.

---

## 4. Current State — What's Deployed

All tour changes from this session are live at stocksnack.app.

| Commit | What it fixed |
|---|---|
| `3042b84` | Step 24 callout flip (revealBoxes fix) |
| `69857f4` | Callout above standard, gap removed, accidental click blocker |
| `5bf3764` | Steps 14/24 and 24/24 targets changed to header elements |
| `ff49fa7` | SkipUfo sliver collapse + doReveal scroll fix |

**Tong has NOT yet tested and signed off on:**
- Steps 9→10, 10→11 skipUfo collapse (the sliver animation during method card transitions)
- Steps 14/24 and 24/24 new header targets
- Callout gap removal (all steps)
- Callout always-above behaviour
- Step 24 no longer jumping to bottom

---

## 5. Pending Tour Tasks

### 5.1 CRITICAL — Sliver out of range during skipUfo collapse (steps 9, 10, 11)

**This is the next thing to fix.**

**What Tong saw:** When tapping to advance from step 8→9, 9→10, or 10→11, the sliver (collapsed highlighted box) sweeps visibly BELOW the callout box during the 300ms collapse animation. The user sees the element content appearing at full brightness below the callout while it shrinks.

**Why it happens:** The CSS transition animates the spotlight from full element size to the final sliver position. The BOTTOM of the spotlight travels from `element.bottom + 8` all the way up to `element.top − 8` over 300ms. For most of that journey, the bottom is below the callout bottom (`element.top`). So the element content is visible below the callout for nearly the entire animation.

For the method cards (~200px tall), this is very noticeable — the cards are revealed below the callout before collapsing away.

**What the correct behaviour should be:** The sliver must NEVER be visible outside the callout box at any point during the collapse. Two ways to fix:

Option A (instant jump): Don't animate the collapse at all. Just teleport the sliver to its final position inside the callout, then proceed. No sweeping motion visible.

Option B (clip animation): Clip the initial spotlight to the callout boundaries before starting the animation. Only the part above `callout.bottom = element.top` is visible. The spotlight collapses only within that zone (16px of travel, not 200px).

Option A is simpler to implement. Option B preserves the "collapsing" visual but requires changing the initial displayRect calculation for skipUfo.

**Key reference in code:**
```javascript
// GuidedTour.tsx — skipUfo branch
const collapseTop = prevCallout.above ? prev.top - 8 : prevCallout.top + 8
setDisplayRect({ top: collapseTop, left: prev.left + 8, width: prev.width - 16, height: 0 })
```

The `setDisplayRect` here is correct (final position is inside callout). The problem is that CSS transitions animate from the PREVIOUS state (full element size) to this new state. During that transition, the bottom sweeps below the callout.

---

### 5.2 Full 24-step tour QA

No full walkthrough has been done end-to-end with all the current fixes deployed. Need to walk through all 24 steps and verify:
- Each step's callout appears above the highlighted element
- No callout gap between callout and highlighted box
- No sliver outside callout box
- Tap to advance works on each step
- Completion flow (step 24 → STOCKSNACK loader → screener) works

Step 7/24 (business section): check that segment chart is visible after tap — may be a data issue for some tickers that have no segment data.

---

### 5.3 Tour step targeting reference

| Step | Target element | Notes |
|---|---|---|
| 1/24 | `nav-menu-panel` | On any page |
| 2/24 | Primary stock card | User clicks to navigate to ticker |
| 3/24 | `ticker-header` | Ticker page loads |
| 4/24 | `overview` | |
| 5/24 | `price-projection` | Opens layer 0 |
| 6/24 | `scorecard` | Opens layer 0 |
| 7/24 | `business` | Opens layers 0, 8, 12 |
| 8/24 | `price-methods` | |
| 9/24 | `methodology-toggle` | Opens layer 2 |
| 10/24 | `method-1` + 2 + 3 | multiple=true, skipUfo, opens layer 2 |
| 11/24 | `method-2` + 1 + 3 | multiple=true, skipUfo, opens layer 2 |
| 12/24 | `method-3` + 1 + 2 | multiple=true, skipUfo, opens layer 2 |
| 13/24 | `blended-projection` | Opens layer 2 |
| 14/24 | `growth-layer-header` | Small header row — avoids large accordion |
| 15/24 | `growth-yoy` | Opens layer 3 |
| 16/24 | `growth-sp500` | Opens layer 3, optional |
| 17/24 | `growth-metrics` | Opens layer 3 |
| 18/24 | `growth-score` | Opens layer 3 |
| 19/24 | `health-summary` | Opens layer 4 |
| 20/24 | `health-balance-sheet` | Opens layer 4 |
| 21/24 | `health-income-statement` | Opens layer 4 |
| 22/24 | `health-cash-flow` | Opens layer 4 |
| 23/24 | `health-metric` | Opens layer 4, optional, click |
| 24/24 | `final-layer-header` | Opens layer 5, small header row |

**Why steps 14 and 24 use `-header` targets:** The full accordion sections are very tall. `scrollToTarget()` places every element at 25% from the top of the viewport. Two adjacent large sections would both land at the same y position, making the callout appear frozen (no visual movement). The small header rows are at distinct positions, giving clear visual movement between steps.

---

## 6. Pending Blog & Pipeline Tasks

### 6.1 n8n Blog Visuals — What Was Planned

The blog engine currently generates 6 SVG charts (buildChart0–5) baked inline into the article. The plan discussed was to evolve the visual output. Key context:

**Current chart inventory:**
| Chart | Name | What it shows |
|---|---|---|
| 0 | Price projection arrow | Current price → projected price with return % |
| 1 | 5-year price targets (bar) | S&P 500 baseline vs stock target |
| 2 | Historical growth trend | 3 stacked sparklines (Revenue, EBITDA, FCF) |
| 3 | Valuation | EV/EBITDA or P/E vs S&P 500 / 5Y average |
| 4 | Product segments | Horizontal bar chart of revenue breakdown |
| 5 | Verdict scorecard | Layer-by-layer score summary |

**What Tong wants next (n8n visuals direction):**
- The insights section is currently weak — it generates generic language ("the company showed strong growth") instead of specific data-driven sentences ("Mounjaro revenue grew 118% YoY to $4.6B")
- Root cause: the Gemini prompt doesn't receive per-product time-series data, only summary numbers
- Fix direction: pass individual segment revenue time-series (per year) into the `Write Single-Stock Article1` Gemini prompt alongside the existing `allProdSegs` data
- The chart for product segments (buildChart4) only shows current mix — adding trend data would enable a time-series segment chart

**No action was taken on visuals this session.** It was discussed as the next big iteration after tour QA is done.

---

### 6.2 Segment Extractor — Multiple Known Bugs

**File:** `/Users/tzq/stocksnack.app/pipeline/sec/segment_extractor.py`

Known issues, not yet fixed:
- HON, GE, BA, HD: generic `us-gaap` member names leaking into segment results
- CAT: "Represents the agg/ent…" rollup label showing instead of actual segment name
- TGT: "Disclosures relate…" label appearing
- XOM: Revenue line items being treated as product segments
- AMZN: Non-US complement not being dropped
- BIIB, NKE: Geo segment showing only US with no international breakdown
- MRK: Geo segment overlap
- PEP: Geo segments mixing into product axis

After fixing these: run `python3 pipeline/sec/run_sec.py` for each affected ticker, then retrigger the blog for any that have articles.

---

### 6.3 LLY — Needs Full Pipeline Rerun

- Current DB entry for LLY shows old 3-segment data (Product 88.8% / Collaboration / Jardiance)
- Segment extractor locally returns correct drug-level data (Mounjaro, Zepbound, Trulicity, etc.) but not yet pushed to DB
- Do NOT publish any LLY article until segment extractor bugs are fixed and pipeline is rerun
- After rerun: trigger a fresh LLY blog execution to get drug-level breakdown in the article

---

### 6.4 Blog Insights Quality

The "Key Insights" and "Risks to Watch" sections in the blog currently produce generic language. Not a data bug — it's a prompt design issue.

What Tong confirmed: the sections don't mention specific product names or YoY growth numbers. Everything reads like it was written for a generic company.

Root cause: the Gemini prompt receives aggregate numbers but no per-product, per-year revenue series.

Fix approach (not yet implemented): add a time-series breakdown per product to the `Write Single-Stock Article1` context. Format it like:
```
Mounjaro: 2022 $482M, 2023 $5.2B, 2024 $13.0B (YoY: +980%, +150%)
```

This would let Gemini write specific sentences like "Mounjaro grew 150% year-over-year to $13B."

**Do not implement this until segment extractor bugs are fixed** — otherwise the drug names in the prompt will be wrong.

---

### 6.5 SEC Pipeline — Long-Term Architecture

The target state: replace all FMP (Financial Modeling Prep) data calls with SEC EDGAR data.

**CRITICAL RULE: FMP is not available for commercial use.** Do not suggest FMP as a data source for ANY feature. The entire SEC pipeline exists to replace FMP. When live, remove FMP calls from `pipeline/run.py` — do not supplement.

Still missing before SEC pipeline goes live:
- `verify.py` (data quality check)
- Hazard flag detection
- Go-live switch

---

## 7. Tour Bug Rules — Read Before Touching GuidedTour.tsx

These rules exist because past fixes to one step broke all other steps.

**Scope rule:** Every fix must be scoped to the exact steps named. If the fix touches shared logic (`scrollToTarget`, `doReveal`, `updateRect`, `derivedCallout`), STOP and explicitly tell Tong what shared logic is involved before changing anything.

**Regression rule:** After any change, mentally trace through steps 1, 5, 10, 15, 20, 24 to verify no side effects.

**Revert rule:** If a deployed fix causes regression on ANY step outside scope, revert ALL changes immediately. Do not patch around it.

**Shared logic map:**
- `scrollToTarget()` — affects every single-target step
- `doReveal()` — affects every single-target step
- `updateRect()` — affects every step
- `derivedCallout` computation — affects every step (callout position for all)
- skipUfo collapse block — affects only steps 10, 11, 12 (method-1/2/3)
- regular UFO block — affects all other steps

**skipUfo sliver rule (current formula):**
```
above: collapseTop = prev.top - 8
below: collapseTop = prevCallout.top + 8
```
This places the final sliver inside the callout. The problem is the animation SWEEP, not the endpoint.

**doReveal scroll rule:** Do NOT call `scrollToTarget()` inside `doReveal()`. Element is already at final position when scroll-idle fires. A second scroll causes the callout to chase a moving element.

**revealBoxes rule (new, from this session):** `doReveal()` captures element bounding boxes into `revealBoxes`. The `expandTimer` uses `revealBoxes` instead of live `getBoundingClientRect()`. Do not remove this — it prevents callout flipping on steps where accordion opens during the 320ms expand window.

---

## 8. Key Files Reference

| File | What it is |
|---|---|
| `/Users/tzq/stocksnack.app/components/ui/GuidedTour.tsx` | The entire tour — all 24 steps, spotlight, callout, animations |
| `/Users/tzq/stocksnack.app/components/ui/LayersAccordion.tsx` | The accordion that opens per layer (tour uses `tour-open-layer` event) |
| `/Users/tzq/n8n-worker/Stocksnack_Blog_Engine_v1.json` | Blog engine workflow — edit here, push via n8n API |
| `/Users/tzq/stocksnack.app/pipeline/sec/segment_extractor.py` | SEC EDGAR segment data extractor |
| `/Users/tzq/stocksnack.app/pipeline/sec/run_sec.py` | Runs pipeline for a ticker, writes to Supabase `stock_scores` |
| `/Users/tzq/stocksnack.app/CLAUDE.md` | Operational rules file — always read before n8n or deployment work |

---

## 9. How to Push n8n Workflow Changes

Edit the JSON, then push via the REST API (NOT the UI — the UI can corrupt the workflow):

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

Only `name`, `nodes`, `connections`, `settings` go in the PUT body. Any extra fields (id, versionId, etc.) cause a 400 error.

---

## 10. How to Deploy

```bash
vercel --prod --yes
```

Vercel CLI needs to be installed: `npm install -g vercel`

The project is linked at `/Users/tzq/stocksnack.app/.vercel/project.json`. No manual linking needed.

---

## 11. Priority Order for Next Session

1. **Test the deployed tour** — Tong needs to walk through all 24 steps and sign off. This is blocking everything else related to tour.
2. **Fix skipUfo sliver out of range (steps 9, 10, 11)** — once Tong confirms step 1 above has other issues, fix this.
3. **Segment extractor bugs** — required before any new blog articles make sense.
4. **LLY pipeline rerun** — after extractor is fixed.
5. **Blog insights quality / n8n visuals** — after pipeline is clean.

---

*Handover written 2026-06-28. Session commits: ff49fa7, 5bf3764, 69857f4, 6f37000, 3042b84.*
