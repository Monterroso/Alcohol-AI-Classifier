import type {
  ApplicationDatabase,
  ApplicationImageRecord,
  ApplicationRecord,
  ExtractedFieldEvidenceRecord,
  ExtractedFieldRecord,
  OcrTextBlockRecord,
  SubmittedApplicationData,
  ValidationResultRecord
} from "./types";

const now = new Date("2026-05-02T14:30:00.000Z");

function minutesAgo(minutes: number) {
  return new Date(now.getTime() - minutes * 60_000).toISOString();
}

function labelSvgDataUrl(title: string, subtitle: string, accent: string, warning?: string) {
  const warningText =
    warning ??
    "GOVERNMENT WARNING: According to the Surgeon General, women should not drink alcoholic beverages during pregnancy.";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600">
      <rect width="900" height="600" fill="#f8faf7"/>
      <rect x="54" y="48" width="792" height="504" rx="26" fill="#ffffff" stroke="#1b2725" stroke-width="12"/>
      <rect x="94" y="92" width="712" height="118" rx="12" fill="${accent}"/>
      <text x="450" y="158" text-anchor="middle" font-family="Arial, sans-serif" font-size="54" font-weight="700" fill="#ffffff">${title}</text>
      <text x="450" y="282" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="700" fill="#17413d">${subtitle}</text>
      <text x="450" y="346" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="#1b2725">40% ALC/VOL - 750 ML</text>
      <rect x="106" y="396" width="688" height="92" rx="10" fill="#eef4f2" stroke="#d8e1de" stroke-width="4"/>
      <text x="450" y="434" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#1b2725">GOVERNMENT WARNING</text>
      <text x="450" y="468" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#62716e">${warningText.slice(0, 92)}</text>
      <text x="450" y="530" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#62716e">Bottled in Louisville, Kentucky</text>
    </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const appA: ApplicationRecord = {
  id: "app-1001",
  application_number: "ALC-2026-1001",
  submitted_data: {
    brand_name: "Northline",
    product_name: "Northline Reserve Bourbon",
    alcohol_content: "40% ALC/VOL",
    net_contents: "750 ML",
    origin: "Louisville, Kentucky",
    government_warning: "Government warning present",
    applicant_name: "Northline Spirits LLC",
    application_type: "Distilled spirits label"
  },
  processing_status: "processed",
  attempt_count: 1,
  review_status: "unreviewed",
  created_at: minutesAgo(22),
  updated_at: minutesAgo(19),
  processing_started_at: minutesAgo(21),
  processing_finished_at: minutesAgo(19)
};

const appB: ApplicationRecord = {
  id: "app-1002",
  application_number: "ALC-2026-1002",
  submitted_data: {
    brand_name: "Cascadia",
    product_name: "Cascadia Pinot Gris",
    alcohol_content: "13.5% ABV",
    net_contents: "750 mL",
    origin: "Willamette Valley, Oregon",
    government_warning: "Government warning present",
    applicant_name: "Cascadia Cellars",
    application_type: "Wine label"
  },
  processing_status: "processed",
  attempt_count: 1,
  review_status: "needs_changes",
  specialist_notes: "Origin text needs a second look before final approval.",
  created_at: minutesAgo(75),
  updated_at: minutesAgo(51),
  processing_started_at: minutesAgo(73),
  processing_finished_at: minutesAgo(71)
};

const appC: ApplicationRecord = {
  id: "app-1003",
  application_number: "ALC-2026-1003",
  submitted_data: {
    brand_name: "Harbor Light",
    product_name: "Harbor Light Lager",
    alcohol_content: "5.0% ABV",
    net_contents: "12 FL OZ",
    origin: "Milwaukee, Wisconsin",
    government_warning: "Government warning present",
    applicant_name: "Harbor Light Brewing",
    application_type: "Malt beverage label"
  },
  processing_status: "pending",
  attempt_count: 0,
  review_status: "unreviewed",
  created_at: minutesAgo(8),
  updated_at: minutesAgo(8)
};

const images: ApplicationImageRecord[] = [
  {
    id: "img-1001-front",
    application_id: appA.id,
    image_url: labelSvgDataUrl("NORTHLINE", "Reserve Bourbon", "#0f766e"),
    label_type: "front",
    original_filename: "northline-front.png",
    mime_type: "image/png",
    width_px: 1800,
    height_px: 1200,
    created_at: minutesAgo(22)
  },
  {
    id: "img-1001-back",
    application_id: appA.id,
    image_url: labelSvgDataUrl("NORTHLINE", "Back Label", "#17413d"),
    label_type: "government_warning",
    original_filename: "northline-back.png",
    mime_type: "image/png",
    width_px: 1800,
    height_px: 1200,
    created_at: minutesAgo(22)
  },
  {
    id: "img-1002-front",
    application_id: appB.id,
    image_url: labelSvgDataUrl("CASCADIA", "Pinot Gris", "#2563eb"),
    label_type: "front",
    original_filename: "cascadia-front.png",
    mime_type: "image/png",
    width_px: 1800,
    height_px: 1200,
    created_at: minutesAgo(75)
  },
  {
    id: "img-1002-back",
    application_id: appB.id,
    image_url: labelSvgDataUrl("CASCADIA", "Imported Wine", "#b45309"),
    label_type: "back",
    original_filename: "cascadia-back.png",
    mime_type: "image/png",
    width_px: 1800,
    height_px: 1200,
    created_at: minutesAgo(75)
  },
  {
    id: "img-1003-front",
    application_id: appC.id,
    image_url: labelSvgDataUrl("HARBOR LIGHT", "Lager", "#15803d"),
    label_type: "front",
    original_filename: "harbor-light-front.png",
    mime_type: "image/png",
    width_px: 1800,
    height_px: 1200,
    created_at: minutesAgo(8)
  }
];

const ocrBlocks: OcrTextBlockRecord[] = [
  block("ocr-1001-brand", appA.id, "img-1001-front", "NORTHLINE", 0.98, 10.5, 16, 79, 18, 1),
  block("ocr-1001-product", appA.id, "img-1001-front", "Reserve Bourbon", 0.96, 25, 43, 50, 9, 2),
  block("ocr-1001-abv", appA.id, "img-1001-front", "40% ALC/VOL", 0.94, 34, 55, 32, 6, 3),
  block("ocr-1001-net", appA.id, "img-1001-front", "750 ML", 0.91, 53, 55, 16, 6, 4),
  block(
    "ocr-1001-warning",
    appA.id,
    "img-1001-back",
    "GOVERNMENT WARNING",
    0.93,
    24,
    66,
    52,
    8,
    5
  ),
  block("ocr-1001-origin", appA.id, "img-1001-back", "Louisville, Kentucky", 0.9, 27, 87, 46, 6, 6),
  block("ocr-1002-brand", appB.id, "img-1002-front", "CASCADIA", 0.97, 10.5, 16, 79, 18, 1),
  block("ocr-1002-product", appB.id, "img-1002-front", "Pinot Gris", 0.94, 31, 43, 38, 9, 2),
  block("ocr-1002-abv", appB.id, "img-1002-front", "13.5% ABV", 0.86, 34, 55, 32, 6, 3),
  block("ocr-1002-net", appB.id, "img-1002-front", "750 mL", 0.88, 53, 55, 16, 6, 4),
  block("ocr-1002-warning", appB.id, "img-1002-back", "GOVERNMENT WARNING", 0.84, 24, 66, 52, 8, 5),
  block("ocr-1002-origin", appB.id, "img-1002-back", "Imported Wine", 0.62, 31, 43, 38, 9, 6)
];

function block(
  id: string,
  applicationId: string,
  imageId: string,
  text: string,
  confidence: number,
  x: number,
  y: number,
  width: number,
  height: number,
  blockOrder: number
): OcrTextBlockRecord {
  return {
    id,
    application_id: applicationId,
    image_id: imageId,
    text,
    confidence,
    bbox: { x, y, width, height },
    page_section: y < 35 ? "top" : y > 65 ? "bottom" : "middle",
    block_order: blockOrder,
    line_number: blockOrder,
    created_at: minutesAgo(18)
  };
}

function field(
  id: string,
  app: ApplicationRecord,
  fieldKey: keyof SubmittedApplicationData,
  label: string,
  value: string,
  confidence: number,
  status: ExtractedFieldRecord["extraction_status"],
  explanation: string
): ExtractedFieldRecord {
  return {
    id,
    application_id: app.id,
    field_key: fieldKey,
    field_label: label,
    extracted_value: value,
    normalized_value: value.toLowerCase(),
    confidence,
    extraction_status: status,
    explanation,
    created_at: minutesAgo(18)
  };
}

const fields: ExtractedFieldRecord[] = [
  field("field-1001-brand", appA, "brand_name", "Brand name", "Northline", 0.98, "found", "High confidence match on the front label."),
  field("field-1001-product", appA, "product_name", "Product name", "Northline Reserve Bourbon", 0.96, "found", "Product identity appears on the front label."),
  field("field-1001-abv", appA, "alcohol_content", "Alcohol content", "40% ALC/VOL", 0.94, "found", "Alcohol content is legible."),
  field("field-1001-net", appA, "net_contents", "Net contents", "750 ML", 0.91, "found", "Net contents found near the alcohol content line."),
  field("field-1001-warning", appA, "government_warning", "Government warning", "GOVERNMENT WARNING", 0.93, "found", "Required warning heading is visible."),
  field("field-1001-origin", appA, "origin", "Origin", "Louisville, Kentucky", 0.9, "found", "Origin text appears on the back label."),
  field("field-1002-brand", appB, "brand_name", "Brand name", "Cascadia", 0.97, "found", "High confidence match on the front label."),
  field("field-1002-product", appB, "product_name", "Product name", "Cascadia Pinot Gris", 0.94, "found", "Product identity appears on the front label."),
  field("field-1002-abv", appB, "alcohol_content", "Alcohol content", "13.5% ABV", 0.86, "found", "Alcohol content is readable but slightly low confidence."),
  field("field-1002-net", appB, "net_contents", "Net contents", "750 mL", 0.88, "found", "Net contents found near the alcohol content line."),
  field("field-1002-warning", appB, "government_warning", "Government warning", "GOVERNMENT WARNING", 0.84, "found", "Warning heading is present."),
  field("field-1002-origin", appB, "origin", "Origin", "Imported Wine", 0.62, "conflict", "Origin text conflicts with the submitted origin.")
];

const evidence: ExtractedFieldEvidenceRecord[] = [
  evidenceFor("ev-1001-brand", "field-1001-brand", "img-1001-front", "ocr-1001-brand", "NORTHLINE", 0.98, 10.5, 16, 79, 18),
  evidenceFor("ev-1001-product", "field-1001-product", "img-1001-front", "ocr-1001-product", "Reserve Bourbon", 0.96, 25, 43, 50, 9),
  evidenceFor("ev-1001-abv", "field-1001-abv", "img-1001-front", "ocr-1001-abv", "40% ALC/VOL", 0.94, 34, 55, 32, 6),
  evidenceFor("ev-1001-net", "field-1001-net", "img-1001-front", "ocr-1001-net", "750 ML", 0.91, 53, 55, 16, 6),
  evidenceFor("ev-1001-warning", "field-1001-warning", "img-1001-back", "ocr-1001-warning", "GOVERNMENT WARNING", 0.93, 24, 66, 52, 8),
  evidenceFor("ev-1001-origin", "field-1001-origin", "img-1001-back", "ocr-1001-origin", "Louisville, Kentucky", 0.9, 27, 87, 46, 6),
  evidenceFor("ev-1002-brand", "field-1002-brand", "img-1002-front", "ocr-1002-brand", "CASCADIA", 0.97, 10.5, 16, 79, 18),
  evidenceFor("ev-1002-product", "field-1002-product", "img-1002-front", "ocr-1002-product", "Pinot Gris", 0.94, 31, 43, 38, 9),
  evidenceFor("ev-1002-abv", "field-1002-abv", "img-1002-front", "ocr-1002-abv", "13.5% ABV", 0.86, 34, 55, 32, 6),
  evidenceFor("ev-1002-net", "field-1002-net", "img-1002-front", "ocr-1002-net", "750 mL", 0.88, 53, 55, 16, 6),
  evidenceFor("ev-1002-warning", "field-1002-warning", "img-1002-back", "ocr-1002-warning", "GOVERNMENT WARNING", 0.84, 24, 66, 52, 8),
  evidenceFor("ev-1002-origin", "field-1002-origin", "img-1002-back", "ocr-1002-origin", "Imported Wine", 0.62, 31, 43, 38, 9)
];

function evidenceFor(
  id: string,
  fieldId: string,
  imageId: string,
  ocrId: string,
  text: string,
  confidence: number,
  x: number,
  y: number,
  width: number,
  height: number
): ExtractedFieldEvidenceRecord {
  return {
    id,
    extracted_field_id: fieldId,
    image_id: imageId,
    ocr_text_block_id: ocrId,
    evidence_text: text,
    confidence,
    bbox: { x, y, width, height },
    evidence_rank: 1,
    created_at: minutesAgo(18)
  };
}

const validations: ValidationResultRecord[] = [
  validation("val-1001-brand", appA.id, "brand_name", "matches_application", "Matches application", "pass", "Northline", "Northline", 0.98),
  validation("val-1001-product", appA.id, "product_name", "matches_application", "Matches application", "pass", "Northline Reserve Bourbon", "Northline Reserve Bourbon", 0.96),
  validation("val-1001-warning", appA.id, "government_warning", "required_field_present", "Required field present", "pass", "Government warning present", "GOVERNMENT WARNING", 0.93),
  validation("val-1002-brand", appB.id, "brand_name", "matches_application", "Matches application", "pass", "Cascadia", "Cascadia", 0.97),
  validation("val-1002-origin", appB.id, "origin", "matches_application", "Matches application", "warning", "Willamette Valley, Oregon", "Imported Wine", 0.42, "Origin evidence may conflict with submitted data.")
];

function validation(
  id: string,
  applicationId: string,
  fieldKey: ValidationResultRecord["field_key"],
  checkKey: string,
  checkLabel: string,
  result: ValidationResultRecord["result_status"],
  submitted: string,
  extracted: string,
  score: number,
  message?: string
): ValidationResultRecord {
  return {
    id,
    application_id: applicationId,
    field_key: fieldKey,
    check_key: checkKey,
    check_label: checkLabel,
    result_status: result,
    submitted_value: submitted,
    extracted_value: extracted,
    score,
    message,
    created_at: minutesAgo(18)
  };
}

export function createMockDatabase(): ApplicationDatabase {
  return {
    applications: [appA, appB, appC].map((application) => ({ ...application })),
    application_images: images.map((image) => ({ ...image })),
    ocr_text_blocks: ocrBlocks.map((ocr) => ({ ...ocr, bbox: { ...ocr.bbox } })),
    extracted_fields: fields.map((item) => ({ ...item })),
    extracted_field_evidence: evidence.map((item) => ({ ...item, bbox: { ...item.bbox } })),
    validation_results: validations.map((item) => ({ ...item }))
  };
}

export function createPlaceholderLabel(title: string, subtitle: string) {
  return labelSvgDataUrl(title || "PENDING", subtitle || "Uploaded label", "#62716e");
}
