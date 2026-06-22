# StockSnack — Claude Code Project Instructions

> Auto-read by Claude Code at the start of every session.

---

## 1. Read this first, every session

Before starting any non-trivial task, read:
- `SYSTEM_OVERVIEW.md` — architecture, scoring logic, schema, and frontend/design
  conventions. This is the source of truth for what's true about the project.
- The most recent `stocksnack-handoffvX.md` in the repo — recent decisions, known
  issues, what's already been tried this session.

Don't ask the user to re-explain something that's already written down in these files —
read them first. If they're missing from this repo, ask the user to add them before
proceeding on anything non-trivial.

---

## 2. Working style — when to ask vs. when to just build

**Ask first (present 2–3 concrete options, wait for a decision) when:**
- The task involves a subjective visual/UX call — spacing, color choice, copy wording,
  layout structure, what a button or badge should say.
- A change touches billing/payments logic or shared/global scoring code that other
  features depend on.
- The spec given is genuinely ambiguous and a wrong guess would mean redoing the work.

**Build directly, no need to re-confirm, when:**
- The user has already given a specific, unambiguous spec (exact copy, exact color
  value, exact behavior).
- It's a narrow, well-understood, single-item fix with no ripple effects on other code.

**Always, regardless of which path:**
- After implementing any visual change, use the live dev-server preview to actually
  look at the result before saying it's done.
- Investigate the actual cause of a layout/spacing issue before patching it — find what's
  really producing the effect, don't guess at a padding/margin number.
- Commit and push when done, with a commit message describing what changed and why.

---

## 3. Known shared-code landmines

- `TickerPageContent.tsx` carries the Layer 1 methodology table and the M1-only toggle.
  Shared constants (e.g. border-color tokens) and shared value-rendering helper functions
  are used across multiple rows/columns — a fix to one can silently affect a sibling that
  reads the same constant or helper. Check call sites before changing a shared constant.
- Grid layouts: never conditionally remove an entire grid cell `<div>` to hide content —
  this shifts every subsequent cell in the grid's auto-placement. Always keep the cell
  wrapper and conditionally render only the inner content.

---

## 4. If something here conflicts with what the user says in a session

The user's instructions in the current session always win. If the conflict reflects a
genuine, lasting change, update the relevant doc afterward (`SYSTEM_OVERVIEW.md` for
project facts, this file for working-style changes) — don't let either go stale.
