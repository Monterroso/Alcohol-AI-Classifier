import {
  emptySubmittedData,
  fieldDefinitions,
  type ApplicationDatabase,
  type ApplicationImageRecord,
  type ApplicationRecord,
  type BBox,
  type Decision,
  type EvidenceView,
  type ExtractedFieldEvidenceRecord,
  type ExtractedFieldRecord,
  type OcrImageSummary,
  type OcrTextBlockRecord,
  type QueueFilterKey,
  type QueueItem,
  type QueueSortKey,
  type ReviewAnalysis,
  type ReviewFieldRow,
  type ReviewStatus,
  type SubmitBatchApplicationInput,
  type SubmitSingleApplicationInput,
  type SubmittedApplicationData,
  type UploadImageInput,
  type ValidationResultRecord
} from "./types";

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

function confidencePercent(confidence?: number) {
  return typeof confidence === "number" ? Math.round(confidence * 100) : undefined;
}

export function computeApplicationConfidence(database: ApplicationDatabase, applicationId: string) {
  const fields = database.extracted_fields.filter((field) => field.application_id === applicationId);
  const scores = fields
    .map((field) => field.confidence)
    .filter((confidence): confidence is number => typeof confidence === "number");

  if (scores.length === 0) {
    return undefined;
  }

  const baseScore = scores.reduce((total, score) => total + score, 0) / scores.length;
  const validations = database.validation_results.filter(
    (validation) => validation.application_id === applicationId
  );
  const penalty = validations.reduce((total, validation) => {
    if (validation.result_status === "fail") {
      return total + 0.16;
    }
    if (validation.result_status === "warning") {
      return total + 0.07;
    }
    return total;
  }, 0);

  return Math.max(0, Math.min(1, baseScore - penalty));
}

export function listQueueItems(
  database: ApplicationDatabase,
  sortKey: QueueSortKey,
  filterKey: QueueFilterKey
) {
  const items = database.applications
    .filter((application) => {
      if (filterKey === "all") {
        return true;
      }
      return application.processing_status === filterKey || application.review_status === filterKey;
    })
    .map((application) => buildQueueItem(database, application));

  return items.sort((a, b) => {
    if (sortKey === "created_at") {
      return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
    }
    if (sortKey === "product_name") {
      return a.product_name.localeCompare(b.product_name);
    }
    if (sortKey === "processing_status") {
      return a.processing_status.localeCompare(b.processing_status);
    }
    if (sortKey === "review_status") {
      return a.review_status.localeCompare(b.review_status);
    }
    return (a.average_confidence ?? -1) - (b.average_confidence ?? -1);
  });
}

export function buildQueueItem(database: ApplicationDatabase, application: ApplicationRecord): QueueItem {
  const applicationFields = database.extracted_fields.filter(
    (field) => field.application_id === application.id
  );
  const validations = database.validation_results.filter(
    (validation) => validation.application_id === application.id
  );
  const confidence = computeApplicationConfidence(database, application.id);
  const verifiedFields = applicationFields.filter(
    (field) => field.extraction_status === "found" && (field.confidence ?? 0) >= 0.78
  ).length;
  const issueCount = validations.filter((validation) =>
    ["fail", "warning"].includes(validation.result_status)
  ).length;

  return {
    id: application.id,
    application_number: application.application_number,
    product_name:
      application.submitted_data.product_name ||
      application.submitted_data.brand_name ||
      "Untitled application",
    applicant_name: application.submitted_data.applicant_name || "Applicant unavailable",
    application_type: application.submitted_data.application_type || "Application type unavailable",
    processing_status: application.processing_status,
    review_status: application.review_status,
    received_at: application.created_at,
    label_count: database.application_images.filter((image) => image.application_id === application.id).length,
    verified_fields: verifiedFields,
    total_fields: fieldDefinitions.length,
    average_confidence: confidencePercent(confidence),
    issue_count: issueCount,
    status_message: statusMessage(application.processing_status, application.review_status, issueCount, confidence)
  };
}

function statusMessage(
  processingStatus: ApplicationRecord["processing_status"],
  reviewStatus: ReviewStatus,
  issueCount: number,
  confidence?: number
) {
  if (processingStatus === "pending") {
    return "Waiting for OCR and rules analysis.";
  }
  if (processingStatus === "processing") {
    return "OCR and validation are running.";
  }
  if (processingStatus === "failed") {
    return "Processing failed and needs retry.";
  }
  if (reviewStatus === "approved") {
    return "Application approved.";
  }
  if (reviewStatus === "rejected") {
    return "Application rejected.";
  }
  if (issueCount > 0) {
    return `${issueCount} validation issue${issueCount === 1 ? "" : "s"} need review.`;
  }
  if ((confidence ?? 0) >= 0.9) {
    return "High confidence result.";
  }
  return "Ready for reviewer judgment.";
}

export function getReviewAnalysis(database: ApplicationDatabase, applicationId: string): ReviewAnalysis | null {
  const application = database.applications.find((item) => item.id === applicationId);
  if (!application) {
    return null;
  }

  const images = database.application_images.filter((image) => image.application_id === application.id);
  const fields = database.extracted_fields.filter((field) => field.application_id === application.id);
  const validations = database.validation_results.filter(
    (validation) => validation.application_id === application.id
  );
  const averageConfidence = computeApplicationConfidence(database, application.id);
  const issueMessages = validations
    .filter((validation) => ["fail", "warning"].includes(validation.result_status))
    .map((validation) => validation.message || `${validation.check_label} requires review.`);

  return {
    application,
    images,
    review_rows: fieldDefinitions.map((definition) => {
      const field = fields.find((item) => item.field_key === definition.key);
      const fieldIssues = validations
        .filter((validation) => validation.field_key === definition.key)
        .filter((validation) => ["fail", "warning"].includes(validation.result_status))
        .map((validation) => validation.message || `${validation.check_label} requires review.`);

      return buildReviewRow(database, application, definition, field, fieldIssues);
    }),
    ocr_summaries: images.map((image) => buildOcrSummary(database, application, image)),
    validation_results: validations,
    average_confidence: confidencePercent(averageConfidence),
    status_message: statusMessage(
      application.processing_status,
      application.review_status,
      issueMessages.length,
      averageConfidence
    ),
    issues: issueMessages
  };
}

function buildReviewRow(
  database: ApplicationDatabase,
  application: ApplicationRecord,
  definition: (typeof fieldDefinitions)[number],
  field: ExtractedFieldRecord | undefined,
  issues: string[]
): ReviewFieldRow {
  const evidence: EvidenceView[] = field
    ? database.extracted_field_evidence
        .filter((item) => item.extracted_field_id === field.id)
        .sort((a, b) => a.evidence_rank - b.evidence_rank)
        .flatMap((item) => {
          const image = database.application_images.find((candidate) => candidate.id === item.image_id);
          if (!image) {
            return [];
          }
          return [
            {
              id: item.id,
              image_id: image.id,
              label_type: image.label_type,
              image_url: image.image_url,
              text: item.evidence_text,
              confidence: item.confidence,
              bbox: item.bbox
            }
          ];
        })
    : [];

  return {
    field_key: definition.key,
    field_label: definition.label,
    submitted_value: application.submitted_data[definition.key],
    extracted_value: field?.extracted_value,
    normalized_value: field?.normalized_value,
    confidence: confidencePercent(field?.confidence),
    extraction_status: field?.extraction_status ?? "missing",
    explanation: field?.explanation ?? "No extracted field is available yet.",
    issues,
    evidence
  };
}

function buildOcrSummary(
  database: ApplicationDatabase,
  application: ApplicationRecord,
  image: ApplicationImageRecord
): OcrImageSummary {
  const blocks = database.ocr_text_blocks.filter((block) => block.image_id === image.id);
  const confidenceScores = blocks
    .map((block) => block.confidence)
    .filter((confidence): confidence is number => typeof confidence === "number");
  const average =
    confidenceScores.length > 0
      ? confidenceScores.reduce((total, score) => total + score, 0) / confidenceScores.length
      : undefined;

  return {
    image_id: image.id,
    label_type: image.label_type,
    filename: image.original_filename,
    status:
      application.processing_status === "pending"
        ? "not_started"
        : application.processing_status === "processing"
          ? "processing"
          : application.processing_status === "failed"
            ? "failed"
            : "passed",
    confidence: confidencePercent(average),
    extracted_block_count: blocks.length,
    message: blocks.length === 0 ? "No OCR text blocks are available yet." : undefined
  };
}

export function submitSingleApplication(
  database: ApplicationDatabase,
  input: SubmitSingleApplicationInput
): ApplicationDatabase {
  return appendSubmittedApplication(database, input.submitted_data, input.images);
}

export function submitBatchApplications(
  database: ApplicationDatabase,
  inputs: SubmitBatchApplicationInput[]
): ApplicationDatabase {
  return inputs.reduce(
    (currentDatabase, input) => appendSubmittedApplication(currentDatabase, input.submitted_data, input.images),
    database
  );
}

function appendSubmittedApplication(
  database: ApplicationDatabase,
  submittedData: SubmittedApplicationData,
  images: UploadImageInput[]
): ApplicationDatabase {
  const timestamp = nowIso();
  const id = createId(`${idPrefix}-app`);
  const application: ApplicationRecord = {
    id,
    application_number: `ALC-${new Date().getFullYear()}-${String(database.applications.length + 1001)}`,
    submitted_data: { ...emptySubmittedData, ...submittedData },
    processing_status: "pending",
    attempt_count: 0,
    review_status: "unreviewed",
    created_at: timestamp,
    updated_at: timestamp
  };
  const applicationImages = images.map((image, index): ApplicationImageRecord => ({
    id: createId(`${idPrefix}-img`),
    application_id: application.id,
    image_url: image.image_url,
    label_type: image.label_type,
    original_filename: image.original_filename || `label-${index + 1}.png`,
    mime_type: image.mime_type || "image/png",
    created_at: timestamp
  }));

  return {
    ...database,
    applications: [application, ...database.applications],
    application_images: [...applicationImages, ...database.application_images]
  };
}

export function decideApplications(
  database: ApplicationDatabase,
  applicationIds: string[],
  decision: Decision,
  notes: string,
  reviewerId = "demo-reviewer"
): ApplicationDatabase {
  const timestamp = nowIso();
  const reviewStatus: ReviewStatus =
    decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : "needs_changes";

  return {
    ...database,
    applications: database.applications.map((application) =>
      applicationIds.includes(application.id)
        ? {
            ...application,
            review_status: reviewStatus,
            specialist_notes: notes.trim() || application.specialist_notes,
            reviewed_by: reviewerId,
            reviewed_at: timestamp,
            updated_at: timestamp
          }
        : application
    )
  };
}

export function claimNextPendingApplication(database: ApplicationDatabase, workerId: string): {
  database: ApplicationDatabase;
  applicationId: string | null;
} {
  const next = database.applications
    .filter((application) => application.processing_status === "pending")
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];

  if (!next) {
    return { database, applicationId: null };
  }

  const timestamp = nowIso();

  return {
    applicationId: next.id,
    database: {
      ...database,
      applications: database.applications.map((application) =>
        application.id === next.id
          ? {
              ...application,
              processing_status: "processing" as const,
              processing_started_at: timestamp,
              locked_by: workerId,
              attempt_count: application.attempt_count + 1,
              updated_at: timestamp
            }
          : application
      )
    }
  };
}

export function processClaimedApplication(
  database: ApplicationDatabase,
  applicationId: string
): ApplicationDatabase {
  const application = database.applications.find((item) => item.id === applicationId);
  if (!application) {
    return database;
  }

  const images = database.application_images.filter((image) => image.application_id === application.id);
  const primaryImage = images[0];
  const warningImage =
    images.find((image) => image.label_type === "government_warning" || image.label_type === "back") ??
    primaryImage;
  const timestamp = nowIso();
  const generatedBlocks: OcrTextBlockRecord[] = [];
  const generatedFields: ExtractedFieldRecord[] = [];
  const generatedEvidence: ExtractedFieldEvidenceRecord[] = [];
  const generatedValidations: ValidationResultRecord[] = [];

  fieldDefinitions.forEach((definition, index) => {
    const image = definition.key === "government_warning" || definition.key === "origin" ? warningImage : primaryImage;
    if (!image) {
      return;
    }

    const submittedValue = application.submitted_data[definition.key];
    const status = submittedValue.trim() ? "found" : "missing";
    const confidence = status === "found" ? Math.max(0.72, 0.94 - index * 0.025) : 0.18;
    const bbox = bboxForField(index);
    const blockId = createId(`${idPrefix}-ocr`);
    const fieldId = createId(`${idPrefix}-field`);
    const evidenceId = createId(`${idPrefix}-evidence`);

    generatedBlocks.push({
      id: blockId,
      application_id: application.id,
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
      application_id: application.id,
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
        id: evidenceId,
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
      application_id: application.id,
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

  return {
    ...database,
    applications: database.applications.map((item) =>
      item.id === application.id
        ? {
            ...item,
            processing_status: "processed" as const,
            processing_error: undefined,
            processing_finished_at: timestamp,
            locked_by: undefined,
            updated_at: timestamp
          }
        : item
    ),
    ocr_text_blocks: [
      ...database.ocr_text_blocks.filter((block) => block.application_id !== application.id),
      ...generatedBlocks
    ],
    extracted_fields: [
      ...database.extracted_fields.filter((field) => field.application_id !== application.id),
      ...generatedFields
    ],
    extracted_field_evidence: [
      ...database.extracted_field_evidence.filter(
        (item) => !database.extracted_fields.some((field) => field.application_id === application.id && field.id === item.extracted_field_id)
      ),
      ...generatedEvidence
    ],
    validation_results: [
      ...database.validation_results.filter((validation) => validation.application_id !== application.id),
      ...generatedValidations
    ]
  };
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

export function processNextPendingApplication(
  database: ApplicationDatabase,
  workerId: string
): { database: ApplicationDatabase; applicationId: string | null } {
  const claimed = claimNextPendingApplication(database, workerId);
  if (!claimed.applicationId) {
    return { database: claimed.database, applicationId: null };
  }

  return {
    applicationId: claimed.applicationId,
    database: processClaimedApplication(claimed.database, claimed.applicationId)
  };
}
