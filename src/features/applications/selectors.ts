import {
  fieldDefinitions,
  type ApplicationDatabase,
  type ApplicationImageRecord,
  type ApplicationRecord,
  type EvidenceView,
  type ExtractedFieldRecord,
  type OcrImageSummary,
  type QueueFilterKey,
  type QueueItem,
  type QueueSortKey,
  type ReviewAnalysis,
  type ReviewFieldRow,
  type ReviewStatus
} from "./types";

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
    return (b.average_confidence ?? -1) - (a.average_confidence ?? -1);
  });
}

function buildQueueItem(database: ApplicationDatabase, application: ApplicationRecord): QueueItem {
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
      application.submitted_data.class_type ||
      application.submitted_data.brand_name ||
      "Untitled application",
    applicant_name: application.submitted_data.applicant_name || "Applicant unavailable",
    application_type: application.submitted_data.application_type || application.submitted_data.alcohol_type || "Application type unavailable",
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
