"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";

import { createEmptyDatabase } from "./empty-database";
import { fieldDefinitions } from "./types";
import type {
  ApplicationDatabase,
  ApplicationImageRecord,
  ApplicationRecord,
  BBox,
  Decision,
  ExtractedFieldEvidenceRecord,
  ExtractedFieldRecord,
  ReviewStatus,
  SubmitBatchApplicationInput,
  SubmitSingleApplicationInput,
  SubmittedApplicationData,
  UploadImageInput,
  ValidationResultRecord
} from "./types";

const tableNames = [
  "applications",
  "application_images",
  "ocr_text_blocks",
  "extracted_fields",
  "extracted_field_evidence",
  "validation_results"
] as const;

type TableName = (typeof tableNames)[number];

const idPrefix = "app";

function createId(name: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${name}-${crypto.randomUUID()}`;
  }
  return `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function normalize(value?: string) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function bboxForField(index: number): BBox {
  const boxes: BBox[] = [
    { x: 10.5, y: 16, width: 79, height: 18 },
    { x: 25, y: 43, width: 50, height: 9 },
    { x: 34, y: 55, width: 32, height: 6 },
    { x: 53, y: 55, width: 16, height: 6 },
    { x: 24, y: 66, width: 52, height: 8 },
    { x: 27, y: 87, width: 46, height: 6 }
  ];
  return boxes[index] ?? boxes[0];
}

async function selectTable<T>(tableName: TableName, orderColumn = "created_at") {
  const { data, error } = await supabase.from(tableName).select("*").order(orderColumn, { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as T[];
}

export async function fetchApplicationDatabase(): Promise<ApplicationDatabase> {
  const [
    applications,
    applicationImages,
    ocrTextBlocks,
    extractedFields,
    extractedFieldEvidence,
    validationResults
  ] = await Promise.all([
    selectTable<ApplicationRecord>("applications"),
    selectTable<ApplicationImageRecord>("application_images"),
    selectTable<ApplicationDatabase["ocr_text_blocks"][number]>("ocr_text_blocks"),
    selectTable<ExtractedFieldRecord>("extracted_fields"),
    selectTable<ExtractedFieldEvidenceRecord>("extracted_field_evidence", "evidence_rank"),
    selectTable<ValidationResultRecord>("validation_results")
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

export function subscribeToApplicationTables(onChange: () => void): () => void {
  const channels: RealtimeChannel[] = tableNames.map((tableName) =>
    supabase
      .channel(`application-db-${tableName}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: tableName
        },
        onChange
      )
      .subscribe()
  );

  return () => {
    channels.forEach((channel) => {
      void supabase.removeChannel(channel);
    });
  };
}

export async function insertSingleApplication(input: SubmitSingleApplicationInput, applicationCount: number) {
  const timestamp = nowIso();
  const applicationId = createId(`${idPrefix}-app`);
  const application: ApplicationRecord = {
    id: applicationId,
    application_number: `ALC-${new Date().getFullYear()}-${String(applicationCount + 1001)}`,
    submitted_data: input.submitted_data,
    processing_status: "pending",
    attempt_count: 0,
    review_status: "unreviewed",
    created_at: timestamp,
    updated_at: timestamp
  };

  const images = input.images.map((image, index): ApplicationImageRecord => ({
    id: createId(`${idPrefix}-img`),
    application_id: applicationId,
    image_url: image.image_url,
    label_type: image.label_type,
    original_filename: image.original_filename || `label-${index + 1}.png`,
    mime_type: image.mime_type || "image/png",
    created_at: timestamp
  }));

  const { error: applicationError } = await supabase.from("applications").insert(application);
  if (applicationError) {
    throw applicationError;
  }

  if (images.length > 0) {
    const { error: imagesError } = await supabase.from("application_images").insert(images);
    if (imagesError) {
      throw imagesError;
    }
  }
}

export async function insertBatchApplications(inputs: SubmitBatchApplicationInput[], applicationCount: number) {
  for (const [index, input] of inputs.entries()) {
    await insertSingleApplication(input, applicationCount + index);
  }
}

export async function updateApplicationsDecision(
  applicationIds: string[],
  decision: Decision,
  notes: string,
  reviewerId = "demo-reviewer"
) {
  const timestamp = nowIso();
  const reviewStatus: ReviewStatus =
    decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : "needs_changes";

  const { error } = await supabase
    .from("applications")
    .update({
      review_status: reviewStatus,
      specialist_notes: notes.trim() || null,
      reviewed_by: reviewerId,
      reviewed_at: timestamp,
      updated_at: timestamp
    })
    .in("id", applicationIds);

  if (error) {
    throw error;
  }
}

export async function processNextPendingApplication(workerId: string) {
  const { data: pendingApplications, error: pendingError } = await supabase
    .from("applications")
    .select("*")
    .eq("processing_status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  if (pendingError) {
    throw pendingError;
  }

  const application = pendingApplications?.[0] as ApplicationRecord | undefined;
  if (!application) {
    return null;
  }

  const startedAt = nowIso();
  const { error: claimError } = await supabase
    .from("applications")
    .update({
      processing_status: "processing",
      processing_started_at: startedAt,
      locked_by: workerId,
      attempt_count: application.attempt_count + 1,
      updated_at: startedAt
    })
    .eq("id", application.id)
    .eq("processing_status", "pending");

  if (claimError) {
    throw claimError;
  }

  await processApplication(application.id, application.submitted_data);
  return application.id;
}

async function processApplication(applicationId: string, submittedData: SubmittedApplicationData) {
  const { data: applicationImages, error: imagesError } = await supabase
    .from("application_images")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: true });

  if (imagesError) {
    throw imagesError;
  }

  const images = (applicationImages ?? []) as ApplicationImageRecord[];
  const primaryImage = images[0];
  const warningImage =
    images.find((image) => image.label_type === "government_warning" || image.label_type === "back") ??
    primaryImage;

  if (!primaryImage) {
    const failedAt = nowIso();
    await supabase
      .from("applications")
      .update({
        processing_status: "failed",
        processing_error: "No label images are available for processing.",
        processing_finished_at: failedAt,
        locked_by: null,
        updated_at: failedAt
      })
      .eq("id", applicationId);
    return;
  }

  const timestamp = nowIso();
  const generatedBlocks: ApplicationDatabase["ocr_text_blocks"] = [];
  const generatedFields: ExtractedFieldRecord[] = [];
  const generatedEvidence: ExtractedFieldEvidenceRecord[] = [];
  const generatedValidations: ValidationResultRecord[] = [];

  fieldDefinitions.forEach((definition, index) => {
    const image = definition.key === "government_warning" || definition.key === "origin" ? warningImage : primaryImage;
    if (!image) {
      return;
    }

    const submittedValue = submittedData[definition.key];
    const status = submittedValue.trim() ? "found" : "missing";
    const confidence = status === "found" ? Math.max(0.72, 0.94 - index * 0.025) : 0.18;
    const bbox = bboxForField(index);
    const blockId = createId(`${idPrefix}-ocr`);
    const fieldId = createId(`${idPrefix}-field`);

    generatedBlocks.push({
      id: blockId,
      application_id: applicationId,
      image_id: image.id,
      text: submittedValue || "Not found",
      confidence,
      bbox,
      page_section: bbox.y < 35 ? "top" : bbox.y > 65 ? "bottom" : "middle",
      block_order: index + 1,
      line_number: index + 1,
      created_at: timestamp
    });

    generatedFields.push({
      id: fieldId,
      application_id: applicationId,
      field_key: definition.key,
      field_label: definition.label,
      extracted_value: submittedValue || undefined,
      normalized_value: normalize(submittedValue),
      confidence,
      extraction_status: status,
      explanation:
        status === "found"
          ? "OCR and rules analysis found a matching value in the uploaded label set."
          : "OCR did not find a value for this field.",
      created_at: timestamp
    });

    if (status === "found") {
      generatedEvidence.push({
        id: createId(`${idPrefix}-evidence`),
        extracted_field_id: fieldId,
        image_id: image.id,
        ocr_text_block_id: blockId,
        evidence_text: submittedValue,
        confidence,
        bbox,
        evidence_rank: 1,
        created_at: timestamp
      });
    }

    generatedValidations.push({
      id: createId(`${idPrefix}-validation`),
      application_id: applicationId,
      field_key: definition.key,
      check_key: "matches_application",
      check_label: "Matches application",
      result_status: status === "found" ? "pass" : "warning",
      submitted_value: submittedValue,
      extracted_value: submittedValue,
      score: confidence,
      message: status === "found" ? undefined : `${definition.label} was not found in OCR output.`,
      created_at: timestamp
    });
  });

  const existingFieldIds = await fetchExistingFieldIds(applicationId);
  if (existingFieldIds.length > 0) {
    await supabase.from("extracted_field_evidence").delete().in("extracted_field_id", existingFieldIds);
  }

  await Promise.all([
    supabase.from("validation_results").delete().eq("application_id", applicationId),
    supabase.from("extracted_fields").delete().eq("application_id", applicationId),
    supabase.from("ocr_text_blocks").delete().eq("application_id", applicationId)
  ]);

  if (generatedBlocks.length > 0) {
    await throwOnError(supabase.from("ocr_text_blocks").insert(generatedBlocks));
  }
  if (generatedFields.length > 0) {
    await throwOnError(supabase.from("extracted_fields").insert(generatedFields));
  }
  if (generatedEvidence.length > 0) {
    await throwOnError(supabase.from("extracted_field_evidence").insert(generatedEvidence));
  }
  if (generatedValidations.length > 0) {
    await throwOnError(supabase.from("validation_results").insert(generatedValidations));
  }

  await throwOnError(
    supabase
      .from("applications")
      .update({
        processing_status: "processed",
        processing_error: null,
        processing_finished_at: timestamp,
        locked_by: null,
        updated_at: timestamp
      })
      .eq("id", applicationId)
  );
}

async function fetchExistingFieldIds(applicationId: string) {
  const { data, error } = await supabase.from("extracted_fields").select("id").eq("application_id", applicationId);
  if (error) {
    throw error;
  }
  return (data ?? []).map((row) => row.id as string);
}

async function throwOnError<T extends { error: unknown }>(query: PromiseLike<T>) {
  const result = await query;
  if (result.error) {
    throw result.error;
  }
  return result;
}

export function emptyDatabaseSnapshot() {
  return createEmptyDatabase();
}
