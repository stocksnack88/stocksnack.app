import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// One-shot endpoint to confirm Sentry DSN is wired and events reach the dashboard.
// Requires ?token=sentry-ping to prevent accidental triggers from crawlers.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("token") !== "sentry-ping") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const err = new Error("StockSnack Sentry connectivity test — safe to ignore");
  (err as Error & { testRun: boolean }).testRun = true;

  const eventId = Sentry.captureException(err, {
    tags: { trigger: "manual-test", env: process.env.VERCEL_ENV ?? "unknown" },
  });

  // Flush ensures the event is sent before the serverless function exits.
  await Sentry.flush(3000);

  return NextResponse.json({
    ok: true,
    eventId,
    dsnConfigured: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
    env: process.env.VERCEL_ENV ?? "local",
  });
}
