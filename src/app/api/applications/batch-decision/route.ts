import { NextResponse } from "next/server";

import { decideApplications, listQueueItems } from "@/features/applications/mock-repository";
import { readServerDatabase, writeServerDatabase } from "@/features/applications/server-database";
import type { Decision } from "@/features/applications/types";

type BatchDecisionRequest = {
  applicationIds: string[];
  decision: Decision;
  reviewerNotes?: string;
  reviewerId?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as BatchDecisionRequest;
  const nextDatabase = decideApplications(
    readServerDatabase(),
    body.applicationIds,
    body.decision,
    body.reviewerNotes ?? "",
    body.reviewerId
  );
  writeServerDatabase(nextDatabase);

  return NextResponse.json({
    applications: listQueueItems(nextDatabase, "created_at", "all")
  });
}
