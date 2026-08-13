import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";
import { getCachedUserProfile } from "@/lib/server-auth";
import { isFreeTierStock, WATCHLIST_FREE_CAP, WATCHLIST_FREE_UNLOCKED } from "@/lib/constants";

const TRIAL_DURATION_MS = 5 * 60 * 1000;
const EXTENSION_DURATION_MS = 15 * 60 * 1000;

function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
}

// Same isPro/isTrialActive derivation used by screener/page.tsx and
// watchlist/page.tsx — kept in sync manually since it's a tiny bit of logic
// duplicated across a server component and a route handler.
async function getEffectivelyPro(userId: string): Promise<boolean> {
  const profile = await getCachedUserProfile(userId);
  const isPro = profile?.subscription_status === "active" || profile?.subscription_status === "trialing";
  if (isPro) return true;
  const trialStartedAt = profile?.trial_started_at ?? null;
  const trialExtensionStartedAt = profile?.trial_extension_started_at ?? null;
  const trialElapsed = trialStartedAt ? Date.now() - new Date(trialStartedAt).getTime() : Infinity;
  const extensionElapsed = trialExtensionStartedAt ? Date.now() - new Date(trialExtensionStartedAt).getTime() : Infinity;
  const isTrialActive =
    (profile?.trial_used !== true && trialStartedAt !== null && trialElapsed < TRIAL_DURATION_MS) ||
    (trialExtensionStartedAt !== null && extensionElapsed < EXTENSION_DURATION_MS);
  return isTrialActive;
}

export async function GET() {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ tickers: [], unlockedTickers: [] });

  const { data, error } = await supabase
    .from("watchlist")
    .select("ticker")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[watchlist] GET error:", error.message);
    return NextResponse.json({ error: "Failed to load watchlist" }, { status: 500 });
  }

  const tickers = (data ?? []).map(r => r.ticker);
  const effectivelyPro = await getEffectivelyPro(user.id);
  const unlockedTickers = effectivelyPro ? tickers : tickers.slice(0, WATCHLIST_FREE_UNLOCKED);

  return NextResponse.json({ tickers, unlockedTickers });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  let body: { ticker?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ticker = body.ticker?.trim().toUpperCase();
  if (!ticker) return NextResponse.json({ error: "ticker is required" }, { status: 400 });

  const { data: stock } = await supabaseAdmin
    .from("stocks")
    .select("ticker, index_tags")
    .eq("ticker", ticker)
    .maybeSingle();

  if (!stock) {
    return NextResponse.json({ error: "not_found", message: `${ticker} not found` }, { status: 404 });
  }

  const effectivelyPro = await getEffectivelyPro(user.id);

  if (!effectivelyPro && !isFreeTierStock(stock.index_tags)) {
    return NextResponse.json(
      { error: "pro_only", message: `${ticker} is part of the Pro-only universe (S&P 400/600)` },
      { status: 403 },
    );
  }

  if (!effectivelyPro) {
    const { count, error: countError } = await supabase
      .from("watchlist")
      .select("ticker", { count: "exact", head: true })
      .neq("ticker", ticker); // don't count this ticker if it's already saved (upsert, not a new add)
    if (countError) {
      console.error("[watchlist] count error:", countError.message);
      return NextResponse.json({ error: "Failed to add to watchlist" }, { status: 500 });
    }
    if ((count ?? 0) >= WATCHLIST_FREE_CAP) {
      return NextResponse.json(
        { error: "limit_reached", message: `Free watchlist limit is ${WATCHLIST_FREE_CAP} stocks`, limit: WATCHLIST_FREE_CAP },
        { status: 403 },
      );
    }
  }

  const { error } = await supabase
    .from("watchlist")
    .upsert({ user_id: user.id, ticker }, { onConflict: "user_id,ticker" });

  if (error) {
    console.error("[watchlist] POST error:", error.message);
    return NextResponse.json({ error: "Failed to add to watchlist" }, { status: 500 });
  }

  let locked = false;
  if (!effectivelyPro) {
    const { data: ordered } = await supabase
      .from("watchlist")
      .select("ticker")
      .order("created_at", { ascending: true });
    const idx = (ordered ?? []).findIndex(r => r.ticker === ticker);
    locked = idx >= WATCHLIST_FREE_UNLOCKED;
  }

  return NextResponse.json({ success: true, locked });
}

export async function DELETE(request: NextRequest) {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  let body: { ticker?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ticker = body.ticker?.trim().toUpperCase();
  if (!ticker) return NextResponse.json({ error: "ticker is required" }, { status: 400 });

  const { error } = await supabase
    .from("watchlist")
    .delete()
    .eq("ticker", ticker);

  if (error) {
    console.error("[watchlist] DELETE error:", error.message);
    return NextResponse.json({ error: "Failed to remove from watchlist" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
