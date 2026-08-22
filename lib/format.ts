// Shared formatters. Copied verbatim from the ticker detail page
// (app/(dashboard)/screener/[ticker]/TickerPageContent.tsx) so new consumers
// (Compare) agree with it exactly. The ticker page's own local copies are
// intentionally left untouched — only new code should import from here.

export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—"
  const abs = Math.abs(n)
  const decimals = abs < 10 ? 2 : abs < 100 ? 1 : 0
  return `${n.toFixed(decimals)}%`
}

export function fmtDollar(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—"
  const abs = Math.abs(n)
  if (abs < 10) return `$${n.toFixed(2)}`
  if (abs < 100) return `$${n.toFixed(1)}`
  return `$${Math.round(n).toLocaleString("en-US")}`
}

export function fmtCagr(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—"
  return fmtPct(n * 100)
}

export function fmtBn(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—"
  const bn = n / 1_000_000_000
  if (Math.abs(bn) >= 100) return `$${Math.round(bn).toLocaleString("en-US")}bn`
  if (Math.abs(bn) >= 10) return `$${bn.toFixed(1)}bn`
  return `$${bn.toFixed(2)}bn`
}

export function fmtPe(n: number | null | undefined): string {
  return n != null ? `${n.toFixed(1)}x` : "—"
}

export function fmtYld(n: number | null | undefined): string {
  return n != null ? `${(n * 100).toFixed(2)}%` : "—"
}
