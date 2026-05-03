import { NextResponse } from "next/server";

import { readApplicationDatabase } from "@/features/applications/server-repository";
import { getReviewAnalysis } from "@/features/applications/selectors";

type ReviewRouteContext = {
  params: Promise<{
    applicationId: string;
  }>;
};

export async function GET(_request: Request, context: ReviewRouteContext) {
  try {
    const { applicationId } = await context.params;
    const analysis = getReviewAnalysis(await readApplicationDatabase(), applicationId);

    if (!analysis) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    return NextResponse.json(analysis);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load review." },
      { status: 500 }
    );
  }
}
