import { NextResponse } from "next/server";

// GET /api/health — monitoring probe.
export async function GET() {
  return NextResponse.json({ status: "healthy" });
}
