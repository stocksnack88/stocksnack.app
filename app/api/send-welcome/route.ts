import { NextRequest, NextResponse } from "next/server";
import { sendWelcomeEmail } from "@/lib/emails/welcome";

export async function POST(request: NextRequest) {
  let email: string;

  try {
    const body = await request.json();
    email = body?.email;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  try {
    await sendWelcomeEmail(email);
    console.log("[send-welcome] Sent to:", email);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[send-welcome] Failed for", email, ":", message, JSON.stringify(err));
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
