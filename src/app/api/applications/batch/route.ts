import { NextResponse } from "next/server";

import { listQueueItems, submitBatchApplications } from "@/features/applications/mock-repository";
import { readServerDatabase, writeServerDatabase } from "@/features/applications/server-database";
import type { SubmitBatchApplicationInput } from "@/features/applications/types";

type BatchUploadRequest = {
  applications: SubmitBatchApplicationInput[];
};

export async function POST(request: Request) {
  const body = (await request.json()) as BatchUploadRequest;
  const nextDatabase = submitBatchApplications(readServerDatabase(), body.applications ?? []);
  writeServerDatabase(nextDatabase);

  return NextResponse.json({
    applications: listQueueItems(nextDatabase, "created_at", "all")
  });
}
