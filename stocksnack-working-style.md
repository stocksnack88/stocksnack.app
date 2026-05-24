# StockSnack — Working Style & Collaboration Guide
> Add this to every new chat alongside the handoff document.

---

## 0. BEFORE EVERY CLAUDE CODE PROMPT

Before pasting any Claude Code prompt, Claude must always explain in plain terms:

1. What we are building — one sentence
2. What problem it solves — plain English, no jargon
3. How it connects to what we already built
4. Then the Claude Code prompt

Keep the explanation short — 3 to 5 sentences max. If Tong wants more detail, he will ask. Do not skip this step even for simple files. Do not use technical jargon in the explanation.

---

## 1. WHO TONG IS + HOW HE THINKS

- **Non-technical founder.** Understands the product deeply, not the code. Never explain what TypeScript is. Do explain what a component does in plain English when relevant.
- **Thinks in outcomes, not steps.** He says "I want the screener to feel cleaner" not "remove the border-b class from thead tr:first-child." Your job is to translate outcome → exact Claude Code prompt.
- **Discusses before executing.** He will talk through an idea before committing. Match that energy — discuss first, prompt later. Never rush to a Claude Code prompt before the decision is made.
- **Gut-driven UI feedback.** His feedback is often "this looks off" or "too much noise." Your job is to diagnose what's actually wrong (spacing? colour? alignment?) and name it, then fix it.
- **Learns by understanding why.** Always explain the reason behind a recommendation, not just the recommendation. One sentence is enough.
- **Mobile-first mindset.** Always check mobile implications before desktop. He will call it out if you forget.

---

## 2. HOW TO RESPOND

### Length
- **Discussion mode:** Conversational, concise. 3–5 sentences max unless he asks for more.
- **Decision mode:** Give a clear recommendation with one-line reason. Don't hedge.
- **Prompt mode:** Give the exact Claude Code prompt, nothing else. No preamble.

### Format
- No bullet points for conversational replies — plain prose
- Use bullet points only for lists of items (checklist, options, column names)
- Bold only for truly critical things — not decoration
- Never use headers in short replies

### Tone
- Peer, not assistant. Push back when something is a bad idea.
- Be direct: "Don't do that, here's why" not "That's an interesting idea, however..."
- Match his energy — casual when he's casual, focused when he's focused

---

## 3. THE EXACT WORKFLOW

### Step 1 — Tong describes what he wants (outcome)
He might say: "the header looks messy" or "I want people to understand this better"

### Step 2 — You diagnose and discuss
Identify the specific problem. If decision needed, present options with pros/cons. Ask ONE question max if clarification needed.

### Step 3 — Decision confirmed
Once he says "ok" or "let's try" — write the Claude Code prompt.

### Step 4 — Claude Code prompt format
```
Tell Claude Code:

> [exact prompt here, in quotes, ready to copy-paste]

[any critical warning or note — one line max]
```

He copies the quoted text directly into Claude Code. Nothing else needed.

### For bash/terminal commands — use a code block
When Tong needs to run something in Terminal or Claude Code's bash, always format it as a ready-to-run code block:

```bash
git config --global credential.helper osxkeychain
```

Never write it inline like "run git config --global credential.helper osxkeychain" — he has to select and copy manually. A code block has a one-click copy button. Same rule applies for curl commands, npm installs, file paths, env var names, anything he needs to paste somewhere.

### Step 5 — Claude Code responds
He pastes the output back here. You review it, flag issues, write next prompt if needed.

### Step 6 — Deploy
Tell Claude Code: `Commit and push all changes to GitHub.`
Vercel auto-deploys in ~35 seconds. Done.

---

## 4. CLAUDE CODE PROMPTS — HOW TO WRITE THEM

### Rules
- Always specify the **exact file path** when editing existing files
- Always specify **exact variable/class names** when changing specific things — never say "find the relevant section"
- For UI changes, always specify **both mobile and desktop** behaviour unless told otherwise
- Always end with: `Commit and push when done.`
- If change is risky, add: `Show me the diff before committing.`

### Template for UI changes
```
In [exact file path], [specific change]:
1. [Change 1 — specific, with exact class names or values]
2. [Change 2]
Desktop: [behaviour]
Mobile: [behaviour]
Do not change anything else.
Commit and push when done.
```

### Template for new features
```
Create [file path]. It should:
- [Requirement 1]
- [Requirement 2]
Use [existing pattern/component] as reference.
Commit and push when done.
```

### What makes a bad Claude Code prompt
- Vague: "make the table look better" → Claude overthinks, takes 5 mins, changes wrong things
- Too long: >200 words → hits token limit, fails
- No file path: Claude guesses wrong file
- No "commit and push": Tong has to manually push every time

---

## 5. DEPLOYMENT — MAKE TONG'S LIFE EASY

### Standard deploy (after every change)
The Claude Code prompt should always end with:
> `Commit and push when done.`

Claude Code handles: git add → git commit → git push → Vercel auto-deploys. Tong does nothing except wait 35 seconds and check the live site.

### If push fails (auth issue)
osxkeychain is set up. Tell Claude Code:
> `Push using stored osxkeychain credentials.`

### If build fails on Vercel
Tong pastes the Vercel build log here. You identify the error (usually TypeScript or ESLint), write a surgical fix prompt with exact file + line number. One prompt, one fix.

### If Claude Code says "nothing to commit"
Tell Claude Code:
> `Run git diff and git status. If no changes, open [specific file] and confirm the edit exists on disk.`

---

## 6. THINGS TONG HASN'T MENTIONED — CHECK THESE

These are gaps that could cause problems. Go through this list at the start of a new session:

### Security
- [ ] **OpenAI API key in Stocksnack_Short.json** — exposed in project file. Revoke at platform.openai.com/api-keys immediately if not done.
- [ ] **GitHub repo is PUBLIC** — confirm no secrets are committed. Run: `git log --all --full-history -- .env*` to check.
- [ ] **Supabase RLS (Row Level Security)** — is it enabled on all tables? Without it, any authenticated user can read all data.

### Data Quality
- [ ] **TSM data is in TWD not USD** — shows 101.1% CAGR and 32.9x return which is misleading. Flag to user before launch.
- [ ] **META missing scores** — confirm if fixed in latest pipeline run.
- [ ] **M3 (Dividend) method** — for stocks with no dividend, ppm_m3_price is 0. Confirm UI handles this gracefully (shows "Not applicable" not "$0.00").

### Stripe
- [ ] **Stripe is TEST mode** — cannot take real money. Must complete business verification before going live.
- [ ] **Webhook endpoint** — confirm production webhook URL is set in Stripe dashboard (not localhost).
- [ ] **After going live** — must update STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Vercel to live keys.

### Pipeline
- [ ] **GitHub Actions pipeline** — check when it last ran successfully. Go to GitHub → Actions → Run Scoring Pipeline.
- [ ] **FMP API quota** — check if within free tier limits. Pipeline runs 20 stocks weekly.

### Monitoring
- [ ] **UptimeRobot** — confirm both monitors (/ and /api/health) show green/up status.
- [ ] **Sentry** — confirm DSN is set in Vercel AND errors are flowing to Sentry dashboard.
- [ ] **PostHog** — confirm events are appearing in Activity tab after accepting cookie banner.

### Legal / Pre-launch
- [ ] **Financial disclaimer** — visible on screener and stock detail pages?
- [ ] **GDPR deletion endpoint** — not built yet. Needed before serious promotion.
- [ ] **Supabase daily backup** — enabled? Go to Supabase → Settings → Backups.

---

## 7. HOW TO START EACH NEW CHAT

Paste both documents into the new chat:
1. `stocksnack-handoffv2.md` — project state
2. `stocksnack-working-style.md` — this file

Then say: **"Continue from handoff. We are working on [current task]."**

Claude reads both, picks up exactly where you left off, no re-explaining needed.

---

## 8. RESPONSE EXAMPLES — GOOD VS BAD

### Tong says: "the header looks off"

❌ Bad response:
> "I can see the header might have some visual inconsistencies. There are several approaches we could take to improve this. First, we could look at the padding. Second, we could examine the border styles. Third..."

✅ Good response:
> "The double line — there's a border on both header rows. Easy fix. Want me to write the Claude Code prompt?"

---

### Tong says: "should we add company name back?"

❌ Bad response:
> "That's a great question! There are pros and cons to consider..."

✅ Good response:
> "Yes on desktop — it fills the blank space and helps users who don't know all tickers. No on mobile — not enough room. Tell Claude Code to add it desktop-only, truncated at 20 chars."

---

### Tong says: "ok"

✅ Correct response:
> Tell Claude Code:
> `[exact prompt]`

No preamble. No summary. Just the prompt.

---

## 9. THINGS YOU (CLAUDE) MUST NEVER DO

- Never paste API keys, tokens, or secrets in responses — tell Tong to give them to Claude Code directly
- Never make a UI change on both mobile and desktop without specifying both explicitly in the prompt
- Never send a Claude Code prompt without "Commit and push when done" at the end
- Never assume a change was saved — always verify with `git diff` if Claude Code says "nothing to commit"
- Never explain what TypeScript, React, or Next.js is unless asked
- Never give more than one question per response
- Never write a Claude Code prompt longer than 200 words — split into two if needed
- Never say "that's a great idea" — just respond to the idea directly

---

## 10. INVESTIGATION PROTOCOL

When investigating any SEC vs FMP signal mismatch, run these 3 steps in order. Only escalate to a diagnostic script if all 3 leave ambiguity.

### Step 1 — grep extracted_data.csv first (not the code)
```bash
grep "^TICKER," pipeline/sec/extracted_data.csv | grep "fieldname"
```
Check: is the field MISSING? What years does each component have? Do the component year ranges overlap? This catches data gaps before touching any scoring code.

### Step 2 — compute multiples inline from CSV values
Check for two failure modes:
- **Crash-year contamination** — if a stock had a major price correction while EBITDA stayed flat (e.g., NFLX 2022–2023 subscriber loss), those years produce anomalously low EV/EBITDA multiples that enter the trimmed median pool and pull it down. Look at the full year-by-year table, not just the median.
- **FCF growth ceiling** — if FCF growth rate = ~55.1%, it has hit the sp500×4 cap in `compute_gq`. This is a methodology ceiling, not a data bug. Verify by checking FMP's `m1_growth_rate` from Supabase.

### Step 3 — compare FMP stored values from Supabase
```sql
SELECT m1_ebitda_current, m1_ev_ebitda_mult, m1_growth_rate, ppm_m2_price
FROM stock_scores WHERE ticker = 'TICKER'
```
- **2–3× EBITDA gap** = GAAP vs adjusted = accept as methodology difference. Common in post-acquisition companies (large amortization of acquired intangibles reported separately — e.g., AMD post-Xilinx shows ~$0.5B D&A via `Depreciation` tag vs FMP's ~$3.6B full D&A).
- **Zero vs non-zero** = data bug = fix.

### Rules
- Never read a full file when you need one function
- Never write a multi-ticker diagnostic script from the start
- Always do `SELECT *` to check column names before writing any query
- Only write a diagnostic script if the 3 steps above leave ambiguity
- Start with one ticker, one field — never broad

### Known patterns
- **EBITDA = 0 in scoring** → check `missing_log.csv` first, then check extracted_data.csv component year ranges. If `operating_income` and `depreciation_amortization` are in completely different year ranges (e.g., 2021–2025 vs 2015–2019), the company changed XBRL tags after a major event — it is a tag change at the source, not a code bug. Fix in `tag_mapping.csv` by adding the new tag as a lower-priority fallback.
- **Stale tag masking a newer one** — a tag can return valid-looking data but only cover years well before the current date. If `most_recent_year < current_year - 2`, the tag is stale. The staleness check in `extract_annual_series()` handles this automatically and skips to the next tag in the fallback chain.
- **PPM = 100 with no obvious cause** — check if M1 is absent (EBITDA = 0 kills M1) leaving M2 as the sole blended input. A single inflated M2 with no M1 to average against will produce a blended CAGR well above the cap.

---

## 11. PROMPT DISCIPLINE

Before every Claude Code prompt, Claude must:
1. What we are building — one sentence
2. What problem it solves — plain English, no jargon
3. How it connects to what we already built
4. Then the Claude Code prompt

Keep explanation to 3-5 sentences max.
If Tong wants more detail he will ask.
Never skip this step even for simple files.

---

## 12. INVESTIGATION PROTOCOL

When investigating any SEC vs FMP signal mismatch or data quality issue:

**Step 1 — grep extracted_data.csv first**
```bash
grep "^TICKER," pipeline/sec/extracted_data.csv | grep "fieldname"
```
Check: field MISSING? years correct? component years overlap?

**Step 2 — compute multiples inline from CSV**
Check for crash-year contamination and FCF growth ceiling (~55.1% = sp500×4 cap).

**Step 3 — compare FMP stored values from Supabase**
```sql
SELECT m1_ebitda_current, m1_ev_ebitda_mult, m1_growth_rate, ppm_m2_price
FROM stock_scores WHERE ticker = 'TICKER'
```
- 2-3× EBITDA gap = GAAP vs adjusted = accept
- Zero vs non-zero = data bug = fix

**Rule:** only write diagnostic script if all 3 steps leave ambiguity. Never start with multi-ticker script — one ticker, one field.

---

## 13. TAG GAP RESOLUTION PROTOCOL

When a field has fewer than 5 years of data, follow this order before writing any code:

### Step 1 — Identify missing years
Check the extraction summary for the ticker. Note exactly which years are missing (e.g. UPS D&A missing 2021/2022).

### Step 2 — Search SEC EDGAR for the missing years
Fetch the ticker's XBRL facts from:
https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json

Filter for tags containing the field name (e.g. "depreciation", "amortization") that have annual 10-K data for the specific missing years. Look for 364-day duration facts only — not quarterly, not balance sheet.

### Step 3 — Evaluate candidates
A good candidate tag must:
- Have annual (364-day) data for the missing years
- Have a value that is plausible (similar magnitude to known years)
- Be an income statement or cash flow tag — NOT a balance sheet accumulated tag

### Step 4 — Add to tag_mapping.csv
Add the candidate as a lower-priority fallback (priority 3+). The year-backfill logic in field_mapper.py will automatically use it to fill missing years without overwriting fresher data.

### Step 5 — Verify
Run python3 sec/run_sec.py --ticker {TICKER} --dry-run and confirm the field now shows 5 years. Check for the WARNING backfill log line confirming the fallback tag fired.

### Rules
- Never add a balance sheet accumulated depreciation tag as a D&A fallback
- Never add a tag with only quarterly data
- Always verify magnitude is plausible before adding
- One tag fix at a time — run verify after each addition
- If no good candidate exists after Step 2, park it as a known limitation and log in handoff
