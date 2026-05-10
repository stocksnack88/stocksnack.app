import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .limit(1);

  if (error) {
    return NextResponse.json(
      { status: "degraded", error: error.message },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { status: "ok", timestamp: new Date().toISOString() },
    { status: 200 }
  );
}
