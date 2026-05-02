import { NextResponse } from "next/server";

import { listQueueItems, submitSingleApplication } from "@/features/applications/mock-repository";
import { readServerDatabase, writeServerDatabase } from "@/features/applications/server-database";
import type { SubmitSingleApplicationInput } from "@/features/applications/types";

export async function GET() {
  const database = readServerDatabase();

  return NextResponse.json({
    applications: listQueueItems(database, "created_at", "all")
  });
}

export async function POST(request: Request) {
  const input = (await request.json()) as SubmitSingleApplicationInput;
  const nextDatabase = submitSingleApplication(readServerDatabase(), input);
  writeServerDatabase(nextDatabase);

  return NextResponse.json({
    applications: listQueueItems(nextDatabase, "created_at", "all")
  });
}
