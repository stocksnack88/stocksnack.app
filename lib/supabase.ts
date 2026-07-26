import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export const supabase = createClient(
  supabaseUrl,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const supabaseAdmin = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PAGE_SIZE = 1000;

// Supabase/PostgREST enforces a hard 1000-row cap per request (db-max-rows) —
// a single .range(0, 9999) call is capped identically to no range at all.
// This pages through in PAGE_SIZE chunks so large tables (stock_scores,
// stock_fundamentals, stock_prices post S&P 400/600) return in full.
export async function fetchAllRows<T>(
  buildQuery: (rangeStart: number, rangeEnd: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<{ data: T[]; error: unknown }> {
  const rows: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await buildQuery(offset, offset + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { data: rows, error: null };
    offset += PAGE_SIZE;
  }
}
