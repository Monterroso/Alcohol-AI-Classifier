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
