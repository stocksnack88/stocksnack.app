// Update this when the covered stock universe changes (e.g. S&P 500 -> +400 +600).
// Every "we cover N stocks" claim in copy should read from here instead of a
// hardcoded number, so expanding the universe doesn't require re-auditing
// every page/email that mentions a count.
export const COVERED_STOCK_COUNT = 500;
export const COVERED_UNIVERSE_LABEL = "S&P 500";

// Backend ingestion can freely pull/score/tag S&P 400 + 600 tickers ahead of
// launch — this is the one gate that keeps them out of every public listing
// until we're actually ready to show them. Flip by removing tags from this
// list (or deleting it) when the expansion goes live; nothing else to change.
const UNLAUNCHED_INDEX_TAGS: readonly string[] = ["SP400", "SP600"];

// Fails open on purpose: a stock with no index_tags (or the column missing)
// is treated as already-live rather than hidden, so this can never accidentally
// blank the screener if tagging is ever incomplete for an existing ticker.
export function isLaunchedStock(indexTags: string[] | null | undefined): boolean {
  if (!indexTags || indexTags.length === 0) return true;
  return !indexTags.some((t) => UNLAUNCHED_INDEX_TAGS.includes(t));
}
