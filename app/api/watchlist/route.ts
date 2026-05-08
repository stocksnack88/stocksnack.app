import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "watchlist route" });
}

export async function POST() {
  return NextResponse.json({ message: "watchlist route" });
}

export async function DELETE() {
  return NextResponse.json({ message: "watchlist route" });
}
