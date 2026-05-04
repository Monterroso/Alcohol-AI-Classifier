import { NextResponse } from "next/server";

import {
  createSingleApplication,
  deleteApplications,
  readApplicationDatabase
} from "@/features/applications/server-repository";
import type { LabelType, SubmittedApplicationData } from "@/features/applications/types";

export async function GET() {
  try {
    return NextResponse.json({ database: await readApplicationDatabase() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load applications." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const submittedData = JSON.parse(String(formData.get("submitted_data") ?? "{}")) as SubmittedApplicationData;
    const labels = JSON.parse(String(formData.get("image_labels") ?? "[]")) as Array<{ label_type: LabelType }>;
    const files = formData.getAll("images").filter((file): file is File => file instanceof File);
    const result = await createSingleApplication({
      submittedData,
      images: files.map((file, index) => ({
        file,
        labelType: labels[index]?.label_type ?? "other"
      }))
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to submit application." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { applicationIds?: string[] };
    const result = await deleteApplications(body.applicationIds ?? []);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete applications." },
      { status: 500 }
    );
  }
}
