# StockSnack Handover — Session 2026-06-29

This document is written for the next Claude agent picking up this project. Read it fully before touching anything.

---

## 1. How To Talk With Tong (Read This First)

Tong communicates visually. He describes what he SEES on screen, not what the code is doing. When he says something is broken, he tells you where his eyes were and what they expected to see. Your job is to translate that into a code-level diagnosis, then explain the fix back in the same visual language — not in variable names.

### The vocabulary we've settled on

| What Tong calls it | What it actually is |
|---|---|
| **Highlighted box** | The green glowing rectangle that appears around the element being pointed to. This is the "spotlight" in code |
| **Callout box** | The green popup card that floats near the highlighted box with the instruction text |
| **Sliver / silver** | The tiny collapsed version of the highlighted box during transitions |
| **Black canvas** | The dark semi-transparent overlay covering the whole screen during the tour |
| **Shining dot** | The pulsing green dot that shows where to tap |
| **Top / bottom** (of callout) | Whether the callout box appears ABOVE or BELOW the highlighted box |
| **Skip tour** | The red button fixed at the top-left of the screen |

### Critical communication rules

- **Never use code words** like variable names, function names, selector strings. Say "column header" not "`headerEls[0]`". Say "the shining dot" not "dotTarget".
- **When Tong says "investigate only"** — write a report. No code changes until he says go.
- **When Tong says "discuss first"** — align on the problem and proposed fix. No code until he says "ok" or "proceed".
- **Always wait for deployment confirmation** before asking Tong to check. Run `npx vercel ls` and wait for `● Ready` before telling him to refresh.
- **When Tong says the position is wrong** — ask for the exact y positions he sees on screen, or measure from the screenshot. Never assume pixel values.
- **Do not make assumptions about callout height** — it varies per step based on text length. Always measure the actual rendered height.

### How to explain a fix to Tong

1. **Parts first** — name every piece involved before explaining anything
2. **What you saw** — describe what was wrong from HIS view (not the code's view)
3. **Why it happened** — use an analogy or motion description, never say variable names
4. **What I changed** — one sentence in plain English
5. **What to expect now** — numbered steps describing what he will SEE on screen

---

## 2. The Onboarding Tour — Architecture Overview

**File:** `/Users/tzq/stocksnack.app/components/ui/GuidedTour.tsx`

24 steps. Step N/24 = `STEPS[N-1]` (0-indexed).

### Key step fields
- `target`: CSS selector for element to highlight
- `skipUfo`: in-place collapse instead of invisible travel
- `multiple`: multiple elements highlighted together (method columns)
- `openLayerIds`: layer numbers to open before locating
- `optional`: auto-advance if element not found after 6 retries
- `dotTarget`: separate selector for where the pulsing dot sits
- `scrollFraction`: how far down the viewport to place the element (default 0.25)

### Two transition types

**Regular UFO** (most steps): highlighted box hides → page scrolls → sliver appears → expands → callout moves.

**skipUfo** (steps 10, 11, 12 — method columns): highlighted box collapses in-place → hides → reappears at new column → expands. No page travel.

**continuingSkipUfo** (steps 11→12, 12→13 when both are skipUfo+multiple): skips the collapse entirely, jumps straight to locate. No animation.

---

## 3. Problems Solved This Session

### 3.1 Step 5/24 scroll position (Issue 5) ✅ DONE

Growth layer section was scrolling too low. Fixed by setting `scrollFraction: 0.0` on step 14 so it lands at the very top of the usable viewport.

---

### 3.2 Shining dot during spotlight collapse (Issue 2) ✅ DONE

Dot was staying visible while the highlighted box was collapsing. Fixed by hiding the dot whenever `spotlightHidden` is true OR the displayed box height is ≤ 2px.

---

### 3.3 Step 1/24 shining dot position ✅ DONE

Dot was at the horizontal centre of the "Start Tour" button. Moved it to the right side of the button (`b.right - 24` instead of centre).

---

### 3.4 Steps 10/11/12 — No resize between steps (Issue 3) ✅ PARTIALLY DONE

**What Tong wanted:** callout box should not shrink/expand when moving between steps 10, 11, 12. All 3 should look the same size.

**Fix applied:** For consecutive method steps (11→12), skip the collapse animation entirely. Also kept `stableCallout` alive through expandTimer for `multiple` steps so it doesn't reset.

**Status:** The no-resize part works. The callout position (see section 3.5) is still in progress.

---

### 3.5 Steps 10/11/12 — Callout position ⚠️ IN PROGRESS — NOT YET RESOLVED

This is the main blocker going into the next session. Full history below.

**What Tong wants:**
- Callout box top: same level as SKIP TOUR button (y ≈ 24)
- Callout box bottom: y ≈ 24 + callout height
- Column header ("EBITDA" / "FREE CASH FLOW" / "DIVIDENDS"): visible just below the callout box
- Highlighted box: starts from the column header downward
- All 3 steps should look identical in terms of callout position

**Why this is hard — root cause:**

The CSS selector `[data-tour-id="method-1"]` matches MANY elements on the page — not just the column header, but every single data row in the table (arrow rows, header rows, price rows, etc.). When the code asks "show me all method-1 elements", it gets ~10+ elements spanning the full height of the table from top to bottom.

This caused two cascading problems:
1. The scroll logic was trying to center the entire column (top to bottom), which pushed the column header off-screen above
2. The callout position was computed from the union of all those elements, giving a huge bounding box — so "above the box" meant above the screen

**What was tried and why it didn't work:**

| Attempt | What changed | Result | Why it failed |
|---|---|---|---|
| Middle element anchor | Used middle column element for callout position | Callout landed mid-screen | On narrow phones, columns wrap vertically so "middle" is halfway down the screen |
| thead-only anchor | Only used `<thead>` header rows for callout position | Better but still wrong y | Scroll still centering full column, so header not at expected position |
| Fixed y=139 scroll | Scrolled header to y=139 always | Column header visible but callout at y=139-calloutH which varied | Callout height not measured accurately |
| Measure calloutH before scroll | Read actual callout height at scroll time | Callout top ≈ y=24, close but "METHOD 1" label cut off | Anchor was `headerEls[0]` = "METHOD 1" row. Scrolling it to y=24+calloutH+8 puts it right below callout bottom but it gets covered |
| Current state | Same as above | Almost correct — scroll position good, callout at ~y=24, but "METHOD 1" label slightly hidden | Need to use `headerEls[1]` (EBITDA row) as anchor instead of `headerEls[0]` (METHOD 1 row) |

**The fix that is needed (agreed with Tong, not yet implemented):**

The column header has TWO rows stacked:
- Row 1 (top): faint small "METHOD 1" label (~20px tall)
- Row 2 (bottom): bold "EBITDA" label (~18px tall)
- Total header height: ~38px

Currently the scroll anchor is Row 1 ("METHOD 1"). This places Row 1 at `y = 24 + calloutH + 8`, which means Row 1 is just barely below the callout bottom. But the callout box itself may slightly cover it.

**The fix:** Change anchor to Row 2 ("EBITDA" = `headerEls[1]`). This places the EBITDA row at `y = 24 + calloutH + 8`, which means the full header (both rows) sits naturally below the callout with room to spare.

**Current code location:** In the `locate()` function, multiple-targets branch, `skipUfo && multiple` block. The scroll formula is:
```
anchorAbsoluteTop - 24 - calloutH - 8
```
Change `headerEls[0]` to `headerEls[1]` as the anchor.

**Steps 11/12 consistency:** Steps 11 and 12 are `continuingSkipUfo` — they skip the re-scroll and reuse the saved callout top (`methodCalloutTopRef.current = 24`) from step 10. This is correct — once step 10 positions everything, steps 11/12 just update the callout left/width for the new column. This part works.

---

### 3.6 Step 13/24 (blended-projection) callout bounce ⚠️ PENDING — NOT YET STARTED

**What Tong reported:** When moving from step 12 to step 13, the callout box bounces — it goes down then back up.

**Why it happens:** Step 12 is a skipUfo+multiple step (callout above at top of screen). Step 13 is a regular step. During the transition from 12→13, the callout first inherits step 12's position (top of screen), then travels to step 13's position. If step 13's element is mid-screen, the callout appears to jump down. If step 13's callout then also ends up above the element but the element is near the top, it might appear to jump back up. The exact behaviour depends on scroll position.

**Fix direction (not yet investigated deeply):** At the revealTimer for non-skipUfo steps, instead of clearing stableCallout and letting derivedCallout take over instantly, pre-position the callout to its final resting place before the expand animation. This avoids the bounce.

**Status:** Not started. Do NOT touch until step 10/11/12 callout position is resolved first.

---

## 4. Current Deployed State

Latest commit: `f4d92f6`

| What | Status |
|---|---|
| Step 14 scroll position | ✅ Signed off |
| Shining dot hidden during collapse | ✅ Signed off |
| Step 1 dot position | ✅ Done |
| Steps 11/12 no-resize | ✅ Working |
| Steps 10/11/12 callout position | ⚠️ Almost — anchor needs to change from Row 1 to Row 2 of header |
| Step 13 callout bounce | ❌ Not started |

---

## 5. Exact Component Positions (from Tong's phone screenshots)

These are the agreed target positions for steps 10/11/12:

| Component | Top y | Bottom y | Notes |
|---|---|---|---|
| SKIP TOUR button | 24 | 80 | Fixed, does not change |
| Callout box | 24 | 24 + calloutH | calloutH varies ~100–120px per step |
| Column header (both rows) | 24 + calloutH + 8 | 24 + calloutH + 8 + 38 | Must show "METHOD 1" AND "EBITDA" |
| Highlighted box top | 24 + calloutH + 8 | bottom of column data | Wraps entire column |

Screen height on Tong's phone: approximately 1056px.

---

## 6. Table Header DOM Structure (Important)

In `TickerPageContent.tsx`, the methodology table `<thead>` contains **two rows** per method column:

Row 1 (`th`, padding 6px top / 0px bottom, font 8px):
```
"METHOD 1"  |  "METHOD 2"  |  "METHOD 3"
```

Row 2 (`th`, padding 2px top / 6px bottom, font 10px bold):
```
"EBITDA"  |  "FREE CASH FLOW"  |  "DIVIDENDS"
```

`querySelectorAll('thead [data-tour-id="method-1"]')` returns both rows. `headerEls[0]` = Row 1 ("METHOD 1"), `headerEls[1]` = Row 2 ("EBITDA").

The scroll anchor should be `headerEls[1]` (the EBITDA row) so the scroll places EBITDA at the target y, and "METHOD 1" sits naturally above it — both fully visible below the callout.

---

## 7. Pending Tasks — Priority Order

1. **Fix steps 10/11/12 anchor** — change from `headerEls[0]` to `headerEls[1]`. One line change. Confirm with Tong.
2. **Fix step 13/24 callout bounce** — investigate, discuss with Tong, then fix.
3. **Full 24-step tour QA** — walk through all steps end to end.
4. **Segment extractor bugs** — see section 8.
5. **LLY pipeline rerun** — after extractor fixed.
6. **Blog insights quality** — after pipeline clean.

---

## 8. Pending Blog & Pipeline Tasks

### 8.1 Segment Extractor Bugs

**File:** `/Users/tzq/stocksnack.app/pipeline/sec/segment_extractor.py`

- HON, GE, BA, HD: generic `us-gaap` member names leaking into results
- CAT: rollup label appearing instead of real segment name
- TGT: "Disclosures relate…" label appearing
- XOM: Revenue line items treated as product segments
- AMZN: Non-US complement not being dropped
- BIIB, NKE: Geo segment showing only US
- MRK: Geo segment overlap
- PEP: Geo mixing into product axis

After fixing: run `python3 pipeline/sec/run_sec.py` for each affected ticker.

### 8.2 LLY Pipeline

Current DB has old 3-segment data. Do NOT publish LLY article until extractor is fixed and pipeline rerun.

### 8.3 Blog Insights Quality

Generic language in insights sections. Fix: pass per-product time-series data into the Gemini prompt. Not started — blocked on extractor fixes.

---

## 9. Tour Bug Rules — Read Before Touching GuidedTour.tsx

**Scope rule:** Every fix must be scoped to exact steps named. If fix touches shared logic (`scrollToTarget`, `doReveal`, `updateRect`, `derivedCallout`), STOP and tell Tong before changing.

**Regression rule:** After any change, mentally trace steps 1, 5, 10, 15, 20, 24.

**Revert rule:** If deployed fix causes regression anywhere outside scope, revert ALL changes immediately.

**Shared logic map:**
- `scrollToTarget()` — every single-target step
- `doReveal()` — every single-target step
- `updateRect()` — every step
- `derivedCallout` — every step
- skipUfo block — only steps 10, 11, 12
- regular UFO block — all other steps

**doReveal scroll rule:** Do NOT call `scrollToTarget()` inside `doReveal()`. Element is already at final position when scroll-idle fires.

**revealBoxes rule:** `doReveal()` captures bounding boxes into `revealBoxes`. The `expandTimer` uses `revealBoxes` not live measurements. Do not remove this.

**Callout height rule:** Never hardcode callout height. Always read `calloutElRef.current?.offsetHeight`. The height varies per step based on text length.

---

## 10. Key Files

| File | Purpose |
|---|---|
| `/Users/tzq/stocksnack.app/components/ui/GuidedTour.tsx` | Entire tour — all 24 steps, spotlight, callout, animations |
| `/Users/tzq/stocksnack.app/app/(dashboard)/screener/[ticker]/TickerPageContent.tsx` | Ticker page — methodology table |
| `/Users/tzq/stocksnack.app/components/ui/LayersAccordion.tsx` | Accordion layers (tour opens these via `tour-open-layer` event) |
| `/Users/tzq/n8n-worker/Stocksnack_Blog_Engine_v1.json` | Blog engine workflow |
| `/Users/tzq/stocksnack.app/pipeline/sec/segment_extractor.py` | SEC EDGAR segment extractor |
| `/Users/tzq/stocksnack.app/CLAUDE.md` | Operational rules — always read first |

---

## 11. How to Deploy

```bash
git add <file> && git commit -m "message" && git push
```

Then wait for Vercel to build:
```bash
until npx vercel ls 2>&1 | head -8 | grep -q "● Ready\|● Error"; do sleep 10; done && npx vercel ls 2>&1 | head -8
```

Only tell Tong to check AFTER you see `● Ready`.

---

*Handover written 2026-06-29. Session commits: 540d8d1, 2e91fd0, 063f12c, b8f9f40, d856010, 8117ba2, 9009163, 38751f5, c2e4ef4, 1f5b2fe, f4d92f6.*
