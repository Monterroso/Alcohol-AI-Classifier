export type ProcessingStatus = "pending" | "processing" | "processed" | "failed";

export type ReviewStatus = "unreviewed" | "approved" | "rejected" | "needs_changes";

export type LabelType =
  | "front"
  | "back"
  | "neck"
  | "brand"
  | "government_warning"
  | "other";

export type AlcoholType = "distilled_spirits" | "wine" | "malt_beverage";

export type ExtractionStatus = "found" | "missing" | "ambiguous" | "conflict";

export type ValidationStatus = "pass" | "fail" | "warning" | "unknown";

export type BBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SubmittedApplicationData = {
  brand_name: string;
  class_type: string;
  product_name: string;
  alcohol_content: string;
  net_contents: string;
  origin: string;
  government_warning: string;
  applicant_name: string;
  alcohol_type: AlcoholType | "";
  application_type: string;
};

export type ApplicationRecord = {
  id: string;
  application_number: string;
  submitted_data: SubmittedApplicationData;
  processing_status: ProcessingStatus;
  processing_error?: string;
  processing_started_at?: string;
  processing_finished_at?: string;
  locked_by?: string;
  attempt_count: number;
  review_status: ReviewStatus;
  specialist_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
};

export type ApplicationImageRecord = {
  id: string;
  application_id: string;
  image_url: string;
  storage_path?: string;
  label_type: LabelType;
  original_filename?: string;
  mime_type?: string;
  width_px?: number;
  height_px?: number;
  created_at: string;
};

export type OcrTextBlockRecord = {
  id: string;
  application_id: string;
  image_id: string;
  text: string;
  confidence?: number;
  bbox: BBox;
  page_section?: "top" | "middle" | "bottom" | "left" | "right" | "unknown";
  block_order?: number;
  line_number?: number;
  created_at: string;
};

export type ExtractedFieldRecord = {
  id: string;
  application_id: string;
  field_key: keyof SubmittedApplicationData;
  field_label: string;
  extracted_value?: string;
  normalized_value?: string;
  confidence?: number;
  extraction_status: ExtractionStatus;
  explanation?: string;
  created_at: string;
};

export type ExtractedFieldEvidenceRecord = {
  id: string;
  extracted_field_id: string;
  image_id: string;
  ocr_text_block_id?: string;
  evidence_text: string;
  confidence?: number;
  bbox: BBox;
  evidence_rank: number;
  created_at: string;
};

export type ValidationResultRecord = {
  id: string;
  application_id: string;
  field_key?: keyof SubmittedApplicationData;
  check_key: string;
  check_label: string;
  result_status: ValidationStatus;
  submitted_value?: string;
  extracted_value?: string;
  score?: number;
  message?: string;
  created_at: string;
};

export type ApplicationDatabase = {
  applications: ApplicationRecord[];
  application_images: ApplicationImageRecord[];
  ocr_text_blocks: OcrTextBlockRecord[];
  extracted_fields: ExtractedFieldRecord[];
  extracted_field_evidence: ExtractedFieldEvidenceRecord[];
  validation_results: ValidationResultRecord[];
};

export type QueueSortKey =
  | "created_at"
  | "product_name"
  | "processing_status"
  | "review_status"
  | "confidence";

export type QueueFilterKey = "all" | ProcessingStatus | ReviewStatus;

export type QueueItem = {
  id: string;
  application_number: string;
  product_name: string;
  applicant_name: string;
  application_type: string;
  processing_status: ProcessingStatus;
  review_status: ReviewStatus;
  received_at: string;
  label_count: number;
  verified_fields: number;
  total_fields: number;
  average_confidence?: number;
  issue_count: number;
  status_message: string;
};

export type EvidenceView = {
  id: string;
  image_id: string;
  label_type: LabelType;
  image_url: string;
  text: string;
  confidence?: number;
  bbox: BBox;
};

export type ReviewFieldRow = {
  field_key: keyof SubmittedApplicationData;
  field_label: string;
  submitted_value: string;
  extracted_value?: string;
  normalized_value?: string;
  confidence?: number;
  extraction_status: ExtractionStatus;
  explanation: string;
  issues: string[];
  evidence: EvidenceView[];
};

export type OcrImageSummary = {
  image_id: string;
  label_type: LabelType;
  filename?: string;
  status: "not_started" | "processing" | "passed" | "failed";
  confidence?: number;
  extracted_block_count: number;
  message?: string;
};

export type ReviewAnalysis = {
  application: ApplicationRecord;
  images: ApplicationImageRecord[];
  review_rows: ReviewFieldRow[];
  ocr_summaries: OcrImageSummary[];
  validation_results: ValidationResultRecord[];
  average_confidence?: number;
  status_message: string;
  issues: string[];
};

export type UploadImageInput = {
  label_type: LabelType;
  image_url: string;
  original_filename?: string;
  mime_type?: string;
};

export type SubmitSingleApplicationInput = {
  submitted_data: SubmittedApplicationData;
  images: UploadImageInput[];
};

export type SubmitBatchApplicationInput = {
  submitted_data: SubmittedApplicationData;
  images: UploadImageInput[];
};

export type Decision = "approved" | "rejected" | "needs_changes";

export const fieldDefinitions: Array<{
  key: keyof SubmittedApplicationData;
  label: string;
  requirement: string;
  optional?: boolean;
}> = [
  {
    key: "brand_name",
    label: "Brand name",
    requirement: "The brand name on the application should match the label text closely."
  },
  {
    key: "class_type",
    label: "Class/Type",
    requirement: "The class or type designation should be present and match the beverage category, such as bourbon whiskey, table wine, or lager."
  },
  {
    key: "product_name",
    label: "Product/fanciful name",
    requirement: "Any product or fanciful name should be present and consistent across submitted data and label evidence when provided.",
    optional: true
  },
  {
    key: "alcohol_content",
    label: "Alcohol content",
    requirement: "Alcohol content should be legible and use an accepted ABV or proof format."
  },
  {
    key: "net_contents",
    label: "Net contents",
    requirement: "Net contents should appear on the label and be formatted as a volume."
  },
  {
    key: "government_warning",
    label: "Government warning",
    requirement: "Required warning text should be present and readable where applicable."
  },
  {
    key: "origin",
    label: "Origin",
    requirement: "Origin or producer location should not conflict with application data."
  }
];

export const labelTypeOptions: Array<{ value: LabelType; label: string }> = [
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
  { value: "neck", label: "Neck" },
  { value: "brand", label: "Brand" },
  { value: "government_warning", label: "Government warning" },
  { value: "other", label: "Other" }
];

export const alcoholTypeOptions: Array<{ value: AlcoholType; label: string; applicationType: string }> = [
  {
    value: "distilled_spirits",
    label: "Distilled spirits",
    applicationType: "Distilled spirits label"
  },
  {
    value: "wine",
    label: "Wine",
    applicationType: "Wine label"
  },
  {
    value: "malt_beverage",
    label: "Malt beverage",
    applicationType: "Malt beverage label"
  }
];

export const emptySubmittedData: SubmittedApplicationData = {
  brand_name: "",
  class_type: "",
  product_name: "",
  alcohol_content: "",
  net_contents: "",
  origin: "",
  government_warning: "",
  applicant_name: "",
  alcohol_type: "",
  application_type: ""
};
