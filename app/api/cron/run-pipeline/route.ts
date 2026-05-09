import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";

// Vercel injects CRON_SECRET automatically and sends it as a Bearer token on
// every cron invocation. Add CRON_SECRET to your Vercel env vars so manual
// triggers from outside Vercel can also authenticate.
//
// NOTE: Vercel's Node.js serverless environment does not include Python.
// This endpoint works on any server where `python3` is installed alongside
// the app (e.g. a VPS, Railway, Render). On Vercel, run the pipeline via
// GitHub Actions on a schedule instead — call /api/cron/run-pipeline with
// the CRON_SECRET Bearer token from the Actions workflow.

// Request a longer timeout on Vercel Pro/Enterprise (seconds).
// Hobby plan caps at 10s — too short for the pipeline.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pipelineDir = path.join(process.cwd(), "pipeline");

  return new Promise<NextResponse>((resolve) => {
    const child = exec(
      "python3 run.py",
      {
        cwd: pipelineDir,
        timeout: 290_000, // 290s — stay under maxDuration
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error("[cron] Pipeline error:", error.message);
          console.error("[cron] stderr:", stderr);
          resolve(
            NextResponse.json(
              {
                success: false,
                error: error.message,
                stderr: stderr.slice(-2000), // last 2 KB
              },
              { status: 500 }
            )
          );
          return;
        }

        console.log("[cron] Pipeline completed");
        resolve(
          NextResponse.json({
            success: true,
            stdout: stdout.slice(-2000),
          })
        );
      }
    );

    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
  });
}
