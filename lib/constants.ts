// Update this when the covered stock universe changes (e.g. S&P 500 -> +400 +600).
// Every "we cover N stocks" claim in copy should read from here instead of a
// hardcoded number, so expanding the universe doesn't require re-auditing
// every page/email that mentions a count.
export const COVERED_STOCK_COUNT = 500;
export const COVERED_UNIVERSE_LABEL = "S&P 500";
