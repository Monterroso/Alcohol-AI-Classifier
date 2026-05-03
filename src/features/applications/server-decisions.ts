import { createServerSupabaseClient } from "@/lib/supabase/server";

import type { Decision } from "./types";

export async function decideApplications(input: {
  applicationIds: string[];
  decision: Decision;
  notes: string;
  reviewerId?: string;
}) {
  if (input.applicationIds.length === 0) {
    return { updatedCount: 0 };
  }

  const supabase = createServerSupabaseClient();
  const { data: existingApplications, error: existingError } = await supabase
    .from("applications")
    .select("id, review_status")
    .in("id", input.applicationIds);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingIds = new Set((existingApplications ?? []).map((application) => application.id as string));
  const missingIds = input.applicationIds.filter((applicationId) => !existingIds.has(applicationId));
  if (missingIds.length > 0) {
    throw new Error(`Application ${missingIds[0]} was not found.`);
  }

  const finalizedApplication = (existingApplications ?? []).find((application) =>
    ["approved", "rejected"].includes(String(application.review_status))
  );
  if (finalizedApplication) {
    throw new Error(`Application ${finalizedApplication.id} already has a final decision.`);
  }

  const reviewStatus = input.decision === "approved" ? "approved" : input.decision;
  const timestamp = new Date().toISOString();
  const { error } = await supabase
    .from("applications")
    .update({
      review_status: reviewStatus,
      specialist_notes: input.notes.trim() || null,
      reviewed_by: input.reviewerId ?? "prototype-reviewer",
      reviewed_at: timestamp,
      updated_at: timestamp
    })
    .in("id", input.applicationIds);

  if (error) {
    throw new Error(error.message);
  }

  return { updatedCount: input.applicationIds.length };
}
