import { NextResponse } from "next/server";

import { getReviewAnalysis } from "@/features/applications/mock-repository";
import { readServerDatabase } from "@/features/applications/server-database";

type ReviewRouteContext = {
  params: Promise<{
    applicationId: string;
  }>;
};

export async function GET(_request: Request, context: ReviewRouteContext) {
  const { applicationId } = await context.params;
  const analysis = getReviewAnalysis(readServerDatabase(), applicationId);

  if (!analysis) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  return NextResponse.json(analysis);
}
