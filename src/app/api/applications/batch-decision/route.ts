import { NextResponse } from "next/server";

import { decideApplications } from "@/features/applications/server-repository";
import type { Decision } from "@/features/applications/types";

type BatchDecisionRequest = {
  applicationIds: string[];
  decision: Decision;
  notes?: string;
  reviewerNotes?: string;
  reviewerId?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BatchDecisionRequest;
    const result = await decideApplications({
      applicationIds: body.applicationIds ?? [],
      decision: body.decision,
      notes: body.notes ?? body.reviewerNotes ?? "",
      reviewerId: body.reviewerId
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to save decision." },
      { status: 500 }
    );
  }
}
