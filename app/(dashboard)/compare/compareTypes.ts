// Pure types + logic only -- NO supabase import here. CompareMetricTable.tsx
// is a 'use client' component that needs rowWinner/types; if it imported
// them from compareData.ts instead, webpack would pull that file's
// module-level `supabaseAdmin = createClient(url, SUPABASE_SERVICE_ROLE_KEY)`
// into the client bundle too (side-effecting singleton, not tree-shakeable
// just by only using one named export from the file). In the browser
// SUPABASE_SERVICE_ROLE_KEY is undefined (not NEXT_PUBLIC_-prefixed), so
// that call throws "supabaseKey is required" on page load. Keeping this
// file free of any @/lib/supabase import is what actually prevents that --
// don't add one here.

export type Mode = "STOCK_VS_STOCK" | "STOCK_VS_SP500" | "STOCK_VS_INDUSTRY"

export type Direction = "higher" | "lower" | "pass-fail" | "none"

export type CompareMetricRow = {
  label: string
  valueA: number | boolean | string | null
  valueB: number | boolean | string | null
  direction: Direction
  format?: (v: number | boolean | string | null) => string
  band?: number
  // Short explainer shown behind a click-to-expand (i) next to the label --
  // for metrics that aren't self-explanatory from the name alone (PPM Score).
  info?: string
}

export type CompareSection = {
  title: string
  rows: CompareMetricRow[]
}

export type CompareResult =
  | {
      ok: true
      labelA: string
      labelB: string
      sections: CompareSection[]
      tally: { aWins: number; bWins: number; ties: number }
    }
  | { ok: false; error: "not_found"; ticker: string }

export function rowWinner(row: CompareMetricRow): "A" | "B" | "TIE" | null {
  const { valueA, valueB, direction } = row
  if (direction === "none") return null
  if (direction === "pass-fail") {
    if (typeof valueA !== "boolean" || typeof valueB !== "boolean") return null
    if (valueA === valueB) return "TIE"
    return valueA ? "A" : "B"
  }
  if (typeof valueA !== "number" || typeof valueB !== "number") return null
  const band = row.band ?? 0.1
  if (direction === "higher") {
    if (valueA > valueB * (1 + band)) return "A"
    if (valueB > valueA * (1 + band)) return "B"
    return "TIE"
  }
  // 'lower'
  if (valueA < valueB * (1 - band)) return "A"
  if (valueB < valueA * (1 - band)) return "B"
  return "TIE"
}

export function tallyWins(sections: CompareSection[]): { aWins: number; bWins: number; ties: number } {
  let aWins = 0
  let bWins = 0
  let ties = 0
  for (const section of sections) {
    for (const row of section.rows) {
      const winner = rowWinner(row)
      if (winner === "A") aWins++
      else if (winner === "B") bWins++
      else if (winner === "TIE") ties++
      // 'none' rows are not counted
    }
  }
  return { aWins, bWins, ties }
}
