import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  let body: { message?: string; email?: string; page_url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message, email, page_url } = body;
  if (!message || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Try to pull user_id and email from the session (optional — works for anon too)
  let userId: string | null = null;
  let sessionEmail: string | null = null;
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    sessionEmail = user?.email ?? null;
  } catch {
    // non-fatal — submit without user context
  }

  const { error } = await supabaseAdmin.from("feedback").insert({
    user_id:  userId,
    email:    email?.trim() || sessionEmail || null,
    message:  message.trim(),
    page_url: page_url ?? null,
    status:   "new",
  });

  if (error) {
    console.error("[feedback] insert error:", error.message);
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
