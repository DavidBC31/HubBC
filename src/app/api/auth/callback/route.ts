import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Le callback OAuth est géré par le hub. Cette route n'est plus utilisée.
export async function GET() {
  return NextResponse.json({ error: "not found" }, { status: 404 });
}
