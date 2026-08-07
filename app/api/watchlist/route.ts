import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";

function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
}

export async function GET() {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ tickers: [] });

  const { data, error } = await supabase
    .from("watchlist")
    .select("ticker")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[watchlist] GET error:", error.message);
    return NextResponse.json({ error: "Failed to load watchlist" }, { status: 500 });
  }

  return NextResponse.json({ tickers: (data ?? []).map(r => r.ticker) });
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

  const { error } = await supabase
    .from("watchlist")
    .upsert({ user_id: user.id, ticker }, { onConflict: "user_id,ticker" });

  if (error) {
    console.error("[watchlist] POST error:", error.message);
    return NextResponse.json({ error: "Failed to add to watchlist" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
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
