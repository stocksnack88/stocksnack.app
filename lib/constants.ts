// Update this when the covered stock universe changes (e.g. S&P 500 -> +400 +600).
// Every "we cover N stocks" claim in copy should read from here instead of a
// hardcoded number, so expanding the universe doesn't require re-auditing
// every page/email that mentions a count.
// 2026-08-07: launched S&P 400 + 600 (Pro-only, see PRO_ONLY_INDEX_TAGS below) —
// this is now the FULL universe count (1,497 scored tickers), not S&P 500 alone.
export const COVERED_STOCK_COUNT = 1497;
export const COVERED_UNIVERSE_LABEL = "S&P 500 + More";

// S&P 400 + 600 are Pro-only: visible in the screener/watchlist only for
// effectively-Pro users (paid or on trial). Free-tier users still only see
// the S&P 500 base universe. Flip by removing tags from this list (or
// deleting it) if the expansion should become free-tier visible too.
const PRO_ONLY_INDEX_TAGS: readonly string[] = ["SP400", "SP600"];

// Fails open on purpose: a stock with no index_tags (or the column missing)
// is treated as free-tier-visible rather than hidden, so this can never
// accidentally blank the screener if tagging is ever incomplete for an
// existing ticker.
export function isFreeTierStock(indexTags: string[] | null | undefined): boolean {
  if (!indexTags || indexTags.length === 0) return true;
  return !indexTags.some((t) => PRO_ONLY_INDEX_TAGS.includes(t));
}

// Free-tier watchlist rules (2026-08-08): a free/logged-in user can search
// and save up to WATCHLIST_FREE_CAP tickers of their own choosing (some room
// for typos/changing their mind), but only the first WATCHLIST_FREE_UNLOCKED
// of those (by when they were added, oldest first) render with full data —
// the rest are saved but locked until upgrade. Unstarring one promotes the
// next-oldest locked pick into the unlocked set. Effectively-Pro users
// (paid or on an active trial) are exempt from both numbers entirely.
export const WATCHLIST_FREE_CAP = 10;
export const WATCHLIST_FREE_UNLOCKED = 5;

// Stripe price IDs for the two Pro plans -- single source of truth so
// app/api/subscribe/route.ts (checkout) and app/pricing/page.tsx (detecting
// which plan a subscriber is actually on) can't silently drift apart.
export const STRIPE_PRICE_ID_MONTHLY = "price_1ThWRB0pDgkC1le4JlCxAMol";
export const STRIPE_PRICE_ID_ANNUAL = "price_1ThWRb0pDgkC1le4heS9eWAd";
