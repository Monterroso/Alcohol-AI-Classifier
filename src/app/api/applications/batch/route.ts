import { NextResponse } from "next/server";

import { createBatchApplications } from "@/features/applications/server-repository";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const zipFile = formData.get("zip");
    const csvFile = formData.get("csv");

    if (!(zipFile instanceof File) || !(csvFile instanceof File)) {
      return NextResponse.json({ ok: false, error: "A ZIP file and CSV file are required." }, { status: 400 });
    }

    const result = await createBatchApplications({ zipFile, csvFile });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to submit batch." },
      { status: 500 }
    );
  }
}
