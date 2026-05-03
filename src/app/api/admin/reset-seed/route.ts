import { NextResponse } from "next/server";

import { resetSeedData } from "@/features/applications/server-repository";

export async function POST() {
  try {
    const result = await resetSeedData();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to reset seed data." },
      { status: 500 }
    );
  }
}
