import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase";
import { sendFeedbackResolvedEmail } from "@/lib/emails/feedback-resolved";

const ADMIN_EMAIL = "stocksnack88@gmail.com";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  // Admin-only
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { fix_summary?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fixSummary = body.fix_summary?.trim();
  if (!fixSummary) {
    return NextResponse.json({ error: "fix_summary is required" }, { status: 400 });
  }

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  // Fetch the row first to get the email
  const { data: row, error: fetchErr } = await supabaseAdmin
    .from("feedback")
    .select("id, email, status")
    .eq("id", id)
    .single();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
  }

  // Update
  const { error: updateErr } = await supabaseAdmin
    .from("feedback")
    .update({
      status:      "resolved",
      fix_summary: fixSummary,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateErr) {
    console.error("[feedback] update error:", updateErr.message);
    return NextResponse.json({ error: "Failed to update feedback" }, { status: 500 });
  }

  // Send email if we have one
  if (row.email) {
    try {
      await sendFeedbackResolvedEmail(row.email, fixSummary);
      console.log("[feedback] resolved email sent to", row.email);
    } catch (err) {
      // Non-fatal — row is already resolved; log and continue
      console.error("[feedback] email send failed:", err);
    }
  }

  return NextResponse.json({ success: true });
}
