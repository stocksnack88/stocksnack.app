# StockSnack — North Star Goal Document

> This file exists to give every agent, contributor, and AI a crystal-clear understanding of what StockSnack is building and where it is going. Read this before touching any code.

---

## What Is StockSnack?

StockSnack is an automated stock analysis content engine. It takes financial data, processes it through a scoring engine, and turns it into content — blog posts, videos, carousels, and social posts — all automatically, without human production work.

The current live product is at: https://www.stocksnack.app

---

## Current Focus

- S&P 500 stock screener with a 4-layer scoring engine
- Automated blog post generation (Single Stock Deep Dive format)
- Automated video generation pipeline (YouTube Short, YouTube Long)
- Freemium app with Stripe subscription (pending live mode)

---

## Revenue Goals

Target: RM20,000 MRR (~350 mixed paying users)

Revenue streams in priority order:

1. **StockSnack.app subscriptions**
   - Free tier: 5 random stocks daily, top picks blurred
   - Paid tier: Full access, $20/mo promo (life-locked), $40/mo regular, $120/yr promo, $240/yr regular

2. **Affiliate commissions**
   - stockanalysis.com affiliate (active, link in bio)
   - Broker affiliates (planned)
   - Investment platform affiliates (planned)

3. **Google AdSense on blog**
   - Passive income from blog traffic
   - Requires content volume first before applying

---

## Content Engine — Phase Roadmap

### Phase 1 — Blog First (Current)
- Single Stock Deep Dive blog post, fully automated via n8n
- Published to /blog on stocksnack.app (Next.js + Markdown + GitHub + Vercel)
- Cross-posted to Seeking Alpha, Medium
- Submitted to Google Search Console and Google News

### Phase 2 — Video + Social (Next)
- YouTube Long (1 per day, auto-post)
- YouTube Short (1-2 per day, auto-post)
- TikTok Short (3-5 variations per day, auto-post)
- Instagram Reel + Carousel (1 each per day, auto-post)
- Facebook Reel + Carousel (1 each per day, auto-post)
- LinkedIn Carousel + Short (1 per day, auto-post)
- Threads text + image (2-3 per day, auto-post)
- All distributed via PostFast API from n8n

### Phase 3 — Lifestyle Content
- AI-generated lifestyle-style videos (cooking, jogging, driving, gym)
- Voiceover discusses stock/finance content over lifestyle B-roll
- No human filming required — fully AI generated

### Phase 4 — Talk Show / Face-to-Camera Content
- AI avatar talks directly to camera, TikTok/IG reel style
- Minimal editing, conversational tone
- Avatar built from real person image + voice clone
- No human on camera required

### Phase 5 — Affiliate Avatar Program
- Subscribed members provide their own photo and voice sample
- StockSnack generates personalised affiliate videos for them
- Members share videos on their own social media
- Members earn affiliate commissions
- StockSnack earns from subscription + affiliate referrals

---

## Product Expansion Roadmap

### Market Expansion
- Current: S&P 500 (500 stocks)
- Next: Other major stock markets (same scoring engine, new data source, add market filter for users)
- Eventually: Global coverage

### Education Pivot — "Duolingo for Finance"
- Teach users: what is investing, trading, fundamental analysis, technical analysis, quantitative analysis
- Interactive Q&A, quiz format, gamified learning
- Once users are educated, provide affiliate links for:
  - Trading platforms
  - Investment platforms
  - Brokers
- Goal: build financially literate audience that trusts StockSnack enough to act on recommendations

---

## Content Distribution Strategy

- Start with 1 automated stock per day
- If traction grows, scale to more stocks per day
- Once revenue is stable, add paid ads spend to accelerate
- All content floods social media — high volume, consistent, automated

---

## Tech Stack (Current)

| Layer | Tool |
|---|---|
| App | Next.js + Vercel |
| Database | Supabase |
| Automation | n8n (self-hosted) |
| Video render | Remotion (self-hosted on Railway) |
| TTS | Gemini TTS |
| STT/Captions | Whisper |
| AI/Script | Gemini 2.5 Flash |
| Social posting | PostFast API (planned) |
| Payments | Stripe |
| Financial data | Public filings + market data |

---

## Agent Instructions

If you are an AI agent reading this file:

1. Read this file completely before doing anything else
2. Understand the current phase (Phase 1 — Blog First)
3. Do not break existing working workflows
4. Every build decision should serve the north star: automated content engine that generates income
5. When in doubt about direction, refer back to this file
6. One change at a time. Confirm before proceeding. Never restart services unless instructed.
7. Backup files with timestamps before editing
8. The three-party protocol: Claude.ai = Brain (strategy), Claude Code = Hands (execution), n8n = Orchestration

---

## Definition of Success

StockSnack is successful when:
- Content publishes itself daily across all platforms with zero human intervention
- Revenue from subscriptions + affiliates + ads covers costs and grows month on month
- The audience trusts StockSnack as their go-to financial content source
- The affiliate avatar program lets members earn passively using StockSnack content
- The education layer turns curious viewers into financially literate investors

---

*Last updated: June 2026*
*Maintained by: Tong (Founder, Waddle)*
