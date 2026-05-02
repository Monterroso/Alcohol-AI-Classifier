import { NextResponse } from "next/server";

import { processNextPendingApplication } from "@/features/applications/mock-repository";
import { readServerDatabase, writeServerDatabase } from "@/features/applications/server-database";

export async function POST() {
  const result = processNextPendingApplication(readServerDatabase(), "next-route-worker");
  writeServerDatabase(result.database);

  return NextResponse.json({
    processedApplicationId: result.applicationId,
    idle: result.applicationId === null
  });
}
