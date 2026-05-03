import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import type {
  ApplicationDatabase,
  ApplicationImageRecord,
  ApplicationRecord,
  ExtractedFieldEvidenceRecord,
  ExtractedFieldRecord,
  OcrTextBlockRecord,
  ValidationResultRecord
} from "./types";

export async function readApplicationDatabase(): Promise<ApplicationDatabase> {
  const supabase = createServerSupabaseClient();
  const [
    applications,
    applicationImages,
    ocrTextBlocks,
    extractedFields,
    extractedFieldEvidence,
    validationResults
  ] = await Promise.all([
    selectTable<ApplicationRecord>(supabase, "applications", "created_at", false),
    selectTable<ApplicationImageRecord>(supabase, "application_images"),
    selectTable<OcrTextBlockRecord>(supabase, "ocr_text_blocks"),
    selectTable<ExtractedFieldRecord>(supabase, "extracted_fields"),
    selectTable<ExtractedFieldEvidenceRecord>(supabase, "extracted_field_evidence", "evidence_rank"),
    selectTable<ValidationResultRecord>(supabase, "validation_results")
  ]);

  return {
    applications,
    application_images: applicationImages,
    ocr_text_blocks: ocrTextBlocks,
    extracted_fields: extractedFields,
    extracted_field_evidence: extractedFieldEvidence,
    validation_results: validationResults
  };
}

export async function selectTable<T>(
  supabase: SupabaseClient,
  tableName: string,
  orderColumn = "created_at",
  ascending = true
) {
  const { data, error } = await supabase.from(tableName).select("*").order(orderColumn, { ascending });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as T[];
}
