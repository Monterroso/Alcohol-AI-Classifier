import { createServerSupabaseClient } from "@/lib/supabase/server";

import { normalizeApplicationImage } from "./image-normalization";
import type {
  ApplicationDatabase,
  ApplicationImageRecord,
  ApplicationRecord,
  ExtractedFieldEvidenceRecord,
  ExtractedFieldRecord,
  LabelType,
  OcrTextBlockRecord,
  ValidationResultRecord
} from "./types";

const imageBucketName = "application-images";

export async function resetSeedData() {
  const supabase = createServerSupabaseClient();
  await ensureImageBucket(supabase);
  const seed = await createSeedDatabase(supabase);

  for (const table of [
    "validation_results",
    "extracted_field_evidence",
    "extracted_fields",
    "ocr_text_blocks",
    "application_images",
    "applications"
  ]) {
    const { error } = await supabase.from(table).delete().not("id", "is", null);
    if (error) {
      throw new Error(`Failed to clear ${table}: ${error.message}`);
    }
  }

  await insertRows("applications", seed.applications);
  await insertRows("application_images", seed.application_images);
  await insertRows("ocr_text_blocks", seed.ocr_text_blocks);
  await insertRows("extracted_fields", seed.extracted_fields);
  await insertRows("extracted_field_evidence", seed.extracted_field_evidence);
  await insertRows("validation_results", seed.validation_results);

  return {
    applicationCount: seed.applications.length,
    imageCount: seed.application_images.length,
    fieldCount: seed.extracted_fields.length
  };

  async function insertRows(table: string, rows: unknown[]) {
    if (rows.length === 0) {
      return;
    }

    const { error } = await supabase.from(table).insert(rows);
    if (error) {
      throw new Error(`Failed to seed ${table}: ${error.message}`);
    }
  }
}

async function ensureImageBucket(supabase: ReturnType<typeof createServerSupabaseClient>) {
  const { data } = await supabase.storage.getBucket(imageBucketName);
  if (data) {
    return;
  }

  const { error } = await supabase.storage.createBucket(imageBucketName, {
    public: true,
    fileSizeLimit: 20 * 1024 * 1024,
    allowedMimeTypes: ["image/png", "image/jpeg"]
  });

  if (error && !error.message.toLowerCase().includes("already exists")) {
    throw new Error(error.message);
  }
}

function seedImageSvg(title: string, subtitle: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200" viewBox="0 0 1800 1200"><rect width="1800" height="1200" fill="white"/><text x="900" y="480" text-anchor="middle" font-family="Arial" font-size="128">${escapeXml(title)}</text><text x="900" y="660" text-anchor="middle" font-family="Arial" font-size="88">${escapeXml(subtitle)}</text></svg>`;
}

function bbox(x: number, y: number, width: number, height: number) {
  return { x, y, width, height };
}

async function createSeedDatabase(supabase: ReturnType<typeof createServerSupabaseClient>): Promise<ApplicationDatabase> {
  const applications: ApplicationRecord[] = [
    {
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
      created_at: "2026-05-02T14:08:00.000Z",
      updated_at: "2026-05-02T14:11:00.000Z",
      processing_started_at: "2026-05-02T14:09:00.000Z",
      processing_finished_at: "2026-05-02T14:11:00.000Z"
    },
    {
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
      created_at: "2026-05-02T13:15:00.000Z",
      updated_at: "2026-05-02T13:39:00.000Z",
      processing_started_at: "2026-05-02T13:17:00.000Z",
      processing_finished_at: "2026-05-02T13:19:00.000Z"
    },
    {
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
      created_at: "2026-05-02T14:22:00.000Z",
      updated_at: "2026-05-02T14:22:00.000Z"
    }
  ];

  const application_images: ApplicationImageRecord[] = await Promise.all([
    seedImage(supabase, "img-1001-front", "app-1001", "NORTHLINE", "Reserve Bourbon", "front", "northline-front.png"),
    seedImage(
      supabase,
      "img-1001-back",
      "app-1001",
      "NORTHLINE",
      "Back Label",
      "government_warning",
      "northline-back.png"
    ),
    seedImage(supabase, "img-1002-front", "app-1002", "CASCADIA", "Pinot Gris", "front", "cascadia-front.png"),
    seedImage(supabase, "img-1002-back", "app-1002", "CASCADIA", "Imported Wine", "back", "cascadia-back.png"),
    seedImage(supabase, "img-1003-front", "app-1003", "HARBOR LIGHT", "Lager", "front", "harbor-light-front.png")
  ]);

  const ocr_text_blocks: OcrTextBlockRecord[] = [
    block("ocr-1001-brand", "app-1001", "img-1001-front", "NORTHLINE", 0.98, bbox(10.5, 16, 79, 18), 1),
    block("ocr-1001-product", "app-1001", "img-1001-front", "Reserve Bourbon", 0.96, bbox(25, 43, 50, 9), 2),
    block("ocr-1001-abv", "app-1001", "img-1001-front", "40% ALC/VOL", 0.94, bbox(34, 55, 32, 6), 3),
    block("ocr-1001-net", "app-1001", "img-1001-front", "750 ML", 0.91, bbox(53, 55, 16, 6), 4),
    block("ocr-1001-warning", "app-1001", "img-1001-back", "GOVERNMENT WARNING", 0.93, bbox(24, 66, 52, 8), 5),
    block("ocr-1001-origin", "app-1001", "img-1001-back", "Louisville, Kentucky", 0.9, bbox(27, 87, 46, 6), 6),
    block("ocr-1002-brand", "app-1002", "img-1002-front", "CASCADIA", 0.97, bbox(10.5, 16, 79, 18), 1),
    block("ocr-1002-product", "app-1002", "img-1002-front", "Pinot Gris", 0.94, bbox(31, 43, 38, 9), 2),
    block("ocr-1002-abv", "app-1002", "img-1002-front", "13.5% ABV", 0.86, bbox(34, 55, 32, 6), 3),
    block("ocr-1002-net", "app-1002", "img-1002-front", "750 mL", 0.88, bbox(53, 55, 16, 6), 4),
    block("ocr-1002-warning", "app-1002", "img-1002-back", "GOVERNMENT WARNING", 0.84, bbox(24, 66, 52, 8), 5),
    block("ocr-1002-origin", "app-1002", "img-1002-back", "Imported Wine", 0.62, bbox(31, 43, 38, 9), 6)
  ];

  const extracted_fields: ExtractedFieldRecord[] = [
    field("field-1001-brand", "app-1001", "brand_name", "Brand name", "Northline", 0.98, "found", "High confidence match on the front label."),
    field("field-1001-product", "app-1001", "product_name", "Product name", "Northline Reserve Bourbon", 0.96, "found", "Product identity appears on the front label."),
    field("field-1001-abv", "app-1001", "alcohol_content", "Alcohol content", "40% ALC/VOL", 0.94, "found", "Alcohol content is legible."),
    field("field-1001-net", "app-1001", "net_contents", "Net contents", "750 ML", 0.91, "found", "Net contents found near the alcohol content line."),
    field("field-1001-warning", "app-1001", "government_warning", "Government warning", "GOVERNMENT WARNING", 0.93, "found", "Required warning heading is visible."),
    field("field-1001-origin", "app-1001", "origin", "Origin", "Louisville, Kentucky", 0.9, "found", "Origin text appears on the back label."),
    field("field-1002-brand", "app-1002", "brand_name", "Brand name", "Cascadia", 0.97, "found", "High confidence match on the front label."),
    field("field-1002-product", "app-1002", "product_name", "Product name", "Cascadia Pinot Gris", 0.94, "found", "Product identity appears on the front label."),
    field("field-1002-abv", "app-1002", "alcohol_content", "Alcohol content", "13.5% ABV", 0.86, "found", "Alcohol content is readable but slightly low confidence."),
    field("field-1002-net", "app-1002", "net_contents", "Net contents", "750 mL", 0.88, "found", "Net contents found near the alcohol content line."),
    field("field-1002-warning", "app-1002", "government_warning", "Government warning", "GOVERNMENT WARNING", 0.84, "found", "Warning heading is present."),
    field("field-1002-origin", "app-1002", "origin", "Origin", "Imported Wine", 0.62, "conflict", "Origin text conflicts with the submitted origin.")
  ];

  const extracted_field_evidence = extracted_fields.map((item): ExtractedFieldEvidenceRecord | null => {
    const ocr = ocr_text_blocks.find((candidate) => candidate.id.replace("ocr", "field") === item.id);
    if (!ocr || !item.extracted_value) {
      return null;
    }
    return {
      id: item.id.replace("field", "ev"),
      extracted_field_id: item.id,
      image_id: ocr.image_id,
      ocr_text_block_id: ocr.id,
      evidence_text: ocr.text,
      confidence: item.confidence,
      bbox: ocr.bbox,
      evidence_rank: 1,
      created_at: "2026-05-02T14:12:00.000Z"
    };
  }).filter((item): item is ExtractedFieldEvidenceRecord => Boolean(item));

  const validation_results: ValidationResultRecord[] = [
    validation("val-1001-brand", "app-1001", "brand_name", "pass", "Northline", "Northline", 0.98),
    validation("val-1001-product", "app-1001", "product_name", "pass", "Northline Reserve Bourbon", "Northline Reserve Bourbon", 0.96),
    validation("val-1001-warning", "app-1001", "government_warning", "pass", "Government warning present", "GOVERNMENT WARNING", 0.93),
    validation("val-1002-brand", "app-1002", "brand_name", "pass", "Cascadia", "Cascadia", 0.97),
    validation("val-1002-origin", "app-1002", "origin", "warning", "Willamette Valley, Oregon", "Imported Wine", 0.42, "Origin evidence may conflict with submitted data.")
  ];

  return {
    applications,
    application_images,
    ocr_text_blocks,
    extracted_fields,
    extracted_field_evidence,
    validation_results
  };
}

async function seedImage(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  id: string,
  applicationId: string,
  title: string,
  subtitle: string,
  labelType: LabelType,
  filename: string
) {
  const normalizedImage = await normalizeApplicationImage({
    bytes: seedImageSvg(title, subtitle),
    fileName: filename,
    declaredMimeType: "image/svg+xml",
    outputFormat: "png"
  });
  const storagePath = `seed/${applicationId}/${normalizedImage.fileName}`;
  const { error } = await supabase.storage.from(imageBucketName).upload(storagePath, normalizedImage.bytes, {
    contentType: normalizedImage.mimeType,
    upsert: true
  });

  if (error) {
    throw new Error(`Failed to upload seed image ${filename}: ${error.message}`);
  }

  const imageUrl = supabase.storage.from(imageBucketName).getPublicUrl(storagePath).data.publicUrl;
  return image(
    id,
    applicationId,
    imageUrl,
    storagePath,
    labelType,
    normalizedImage.fileName,
    normalizedImage.mimeType,
    normalizedImage.widthPx,
    normalizedImage.heightPx
  );
}

function image(
  id: string,
  applicationId: string,
  imageUrl: string,
  storagePath: string,
  labelType: LabelType,
  filename: string,
  mimeType: string,
  widthPx: number,
  heightPx: number
): ApplicationImageRecord {
  return {
    id,
    application_id: applicationId,
    image_url: imageUrl,
    storage_path: storagePath,
    label_type: labelType,
    original_filename: filename,
    mime_type: mimeType,
    width_px: widthPx,
    height_px: heightPx,
    created_at: "2026-05-02T14:08:00.000Z"
  };
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function block(
  id: string,
  applicationId: string,
  imageId: string,
  text: string,
  confidence: number,
  box: OcrTextBlockRecord["bbox"],
  order: number
): OcrTextBlockRecord {
  return {
    id,
    application_id: applicationId,
    image_id: imageId,
    text,
    confidence,
    bbox: box,
    page_section: box.y < 35 ? "top" : box.y > 65 ? "bottom" : "middle",
    block_order: order,
    line_number: order,
    created_at: "2026-05-02T14:12:00.000Z"
  };
}

function field(
  id: string,
  applicationId: string,
  fieldKey: ExtractedFieldRecord["field_key"],
  fieldLabel: string,
  value: string,
  confidence: number,
  status: ExtractedFieldRecord["extraction_status"],
  explanation: string
): ExtractedFieldRecord {
  return {
    id,
    application_id: applicationId,
    field_key: fieldKey,
    field_label: fieldLabel,
    extracted_value: value,
    normalized_value: value.toLowerCase(),
    confidence,
    extraction_status: status,
    explanation,
    created_at: "2026-05-02T14:12:00.000Z"
  };
}

function validation(
  id: string,
  applicationId: string,
  fieldKey: ValidationResultRecord["field_key"],
  status: ValidationResultRecord["result_status"],
  submittedValue: string,
  extractedValue: string,
  score: number,
  message?: string
): ValidationResultRecord {
  return {
    id,
    application_id: applicationId,
    field_key: fieldKey,
    check_key: "matches_application",
    check_label: "Matches application",
    result_status: status,
    submitted_value: submittedValue,
    extracted_value: extractedValue,
    score,
    message,
    created_at: "2026-05-02T14:12:00.000Z"
  };
}
