import { NextResponse } from "next/server";

import { decideApplications, getReviewAnalysis } from "@/features/applications/mock-repository";
import { readServerDatabase, writeServerDatabase } from "@/features/applications/server-database";
import type { Decision } from "@/features/applications/types";

type DecisionRouteContext = {
  params: Promise<{
    applicationId: string;
  }>;
};

type DecisionRequest = {
  decision: Decision;
  reviewerNotes?: string;
  reviewerId?: string;
};

export async function POST(request: Request, context: DecisionRouteContext) {
  const { applicationId } = await context.params;
  const body = (await request.json()) as DecisionRequest;
  const nextDatabase = decideApplications(
    readServerDatabase(),
    [applicationId],
    body.decision,
    body.reviewerNotes ?? "",
    body.reviewerId
  );
  writeServerDatabase(nextDatabase);
  const analysis = getReviewAnalysis(nextDatabase, applicationId);

  return NextResponse.json({
    application: analysis?.application ?? null
  });
}
