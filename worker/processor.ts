import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { fieldDefinitions } from "../src/features/applications/types";
import type {
  ApplicationImageRecord,
  ApplicationRecord,
  BBox,
  ExtractedFieldRecord,
  OcrTextBlockRecord,
  SubmittedApplicationData,
  ValidationResultRecord
} from "../src/features/applications/types";

loadLocalEnv();

const imageBucketName = "application-images";
const runOnce = process.argv.includes("--once");
const pollMs = numberEnv("POLL_MS", 1000);
const workerId = process.env.WORKER_ID ?? `local-orchestrator-${process.pid}`;
const batchSize = numberEnv("WORKER_BATCH_SIZE", 1);
const applicationConcurrency = numberEnv("APPLICATION_CONCURRENCY", 1);
const imageConcurrency = numberEnv("IMAGE_CONCURRENCY", 2);
const canonicalGovernmentWarning =
  "GOVERNMENT WARNING: According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects.";

async function main() {
  const supabase = createWorkerSupabaseClient();
  validateProviderEnv();
  console.log(`Document orchestrator ${workerId} started. Polling every ${pollMs}ms.`);

  do {
    await processNextBatch(supabase);

    if (!runOnce) {
      await sleep(pollMs);
    }
  } while (!runOnce);
}

async function processNextBatch(supabase: ReturnType<typeof createWorkerSupabaseClient>) {
  const batchTimer = createTimer("batch");
  const applications = await claimPendingApplications(supabase);
  batchTimer.mark(`claim ${applications.length} application(s)`);
  if (applications.length === 0) {
    console.log("No pending applications found.");
    return;
  }

  await mapWithConcurrency(applications, applicationConcurrency, async (application) => {
    await processApplication(supabase, application);
  });
  batchTimer.end();
}

async function claimPendingApplications(supabase: ReturnType<typeof createWorkerSupabaseClient>) {
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("processing_status", "pending")
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (error) {
    throw new Error(error.message);
  }

  const claimed: ApplicationRecord[] = [];
  for (const application of (data ?? []) as ApplicationRecord[]) {
    const { data: updated, error: updateError } = await supabase
      .from("applications")
      .update({
        processing_status: "processing",
        processing_error: null,
        processing_started_at: new Date().toISOString(),
        processing_finished_at: null,
        locked_by: workerId,
        attempt_count: application.attempt_count + 1
      })
      .eq("id", application.id)
      .eq("processing_status", "pending")
      .select("*")
      .maybeSingle();

    if (updateError) {
      throw new Error(updateError.message);
    }

    if (updated) {
      claimed.push(updated as ApplicationRecord);
    }
  }

  return claimed;
}

async function processApplication(
  supabase: ReturnType<typeof createWorkerSupabaseClient>,
  application: ApplicationRecord
) {
  console.log(`Processing ${application.application_number} (${application.id}).`);
  const timer = createTimer(application.application_number);

  try {
    await clearGeneratedData(supabase, application.id);
    timer.mark("clear generated data");

    const images = await loadApplicationImages(supabase, application.id);
    timer.mark(`load ${images.length} image row(s)`);
    if (images.length === 0) {
      throw new Error("Application has no label images to process.");
    }

    const ocrBlocksByImage = await mapWithConcurrency(images, imageConcurrency, async (image) => {
      const imageTimer = createTimer(`${application.application_number}:${image.id}`);
      const source = await loadImageSource(supabase, image);
      imageTimer.mark("load image bytes");

      const blocks = await analyzeImageWithAzure(application.id, image, source);
      imageTimer.mark(`azure ocr ${blocks.length} block(s)`);
      imageTimer.end();
      return blocks;
    });
    const ocrBlocks = ocrBlocksByImage.flat();
    timer.mark(`ocr all images ${ocrBlocks.length} block(s)`);

    if (ocrBlocks.length > 0) {
      const { error } = await supabase.from("ocr_text_blocks").insert(ocrBlocks);
      if (error) {
        throw new Error(error.message);
      }
    }
    timer.mark("insert ocr blocks");

    const extracted = await extractFields(application, images, ocrBlocks);
    timer.mark(`field extraction ${extracted.fields.length} field(s)`);
    if (extracted.fields.length > 0) {
      const { error } = await supabase.from("extracted_fields").insert(extracted.fields);
      if (error) {
        throw new Error(error.message);
      }
    }

    if (extracted.evidence.length > 0) {
      const { error } = await supabase.from("extracted_field_evidence").insert(extracted.evidence);
      if (error) {
        throw new Error(error.message);
      }
    }
    timer.mark("insert extracted fields/evidence");

    const validations = runValidators(application, extracted.fields);
    timer.mark(`run validators ${validations.length} result(s)`);
    if (validations.length > 0) {
      const { error } = await supabase.from("validation_results").insert(validations);
      if (error) {
        throw new Error(error.message);
      }
    }

    await updateApplicationStatus(supabase, application.id, "processed");
    timer.mark("mark processed");
    timer.end();
    console.log(`Processed ${application.application_number}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateApplicationStatus(supabase, application.id, "failed", message);
    timer.mark("mark failed");
    timer.end();
    console.error(`Failed ${application.application_number}: ${message}`);
  }
}

async function loadApplicationImages(supabase: ReturnType<typeof createWorkerSupabaseClient>, applicationId: string) {
  const { data, error } = await supabase
    .from("application_images")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ApplicationImageRecord[];
}

async function clearGeneratedData(supabase: ReturnType<typeof createWorkerSupabaseClient>, applicationId: string) {
  const { data: existingFields, error: fieldsReadError } = await supabase
    .from("extracted_fields")
    .select("id")
    .eq("application_id", applicationId);

  if (fieldsReadError) {
    throw new Error(fieldsReadError.message);
  }

  const fieldIds = (existingFields ?? []).map((field) => field.id);
  if (fieldIds.length > 0) {
    const { error } = await supabase.from("extracted_field_evidence").delete().in("extracted_field_id", fieldIds);
    if (error) {
      throw new Error(error.message);
    }
  }

  for (const tableName of ["validation_results", "extracted_fields", "ocr_text_blocks"] as const) {
    const { error } = await supabase.from(tableName).delete().eq("application_id", applicationId);
    if (error) {
      throw new Error(error.message);
    }
  }
}

async function loadImageSource(
  supabase: ReturnType<typeof createWorkerSupabaseClient>,
  image: ApplicationImageRecord
) {
  if (image.storage_path) {
    const { data, error } = await supabase.storage.from(imageBucketName).download(image.storage_path);
    if (error) {
      throw new Error(error.message);
    }

    const bytes = await data.arrayBuffer();
    const contentType = normalizeContentType(data.type || image.mime_type || "application/octet-stream");
    assertAzureSupportedImage(image, contentType);
    return {
      bytes,
      contentType
    };
  }

  const response = await fetch(image.image_url);
  if (!response.ok) {
    throw new Error(`Could not download image ${image.id}: ${response.status} ${response.statusText}`);
  }

  const bytes = await response.arrayBuffer();
  const contentType = normalizeContentType(response.headers.get("content-type") || image.mime_type || "application/octet-stream");
  assertAzureSupportedImage(image, contentType);
  return {
    bytes,
    contentType
  };
}

function normalizeContentType(contentType: string) {
  return contentType.split(";")[0].trim().toLowerCase();
}

function assertAzureSupportedImage(image: ApplicationImageRecord, contentType: string) {
  const supportedTypes = new Set(["image/jpeg", "image/jpg", "image/png", "image/bmp", "image/tiff", "application/pdf"]);
  if (supportedTypes.has(contentType)) {
    return;
  }

  const seedHint = image.image_url.startsWith("data:image/svg+xml")
    ? " The seeded demo rows use SVG data URLs for display only; upload a new application image as PNG/JPEG for real OCR."
    : "";
  throw new Error(`Azure OCR does not support ${contentType || "unknown content"} for image ${image.id}.${seedHint}`);
}

async function analyzeImageWithAzure(
  applicationId: string,
  image: ApplicationImageRecord,
  source: { bytes: ArrayBuffer; contentType: string }
) {
  const endpoint = requiredEnv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT").replace(/\/+$/, "");
  const key = requiredEnv("AZURE_DOCUMENT_INTELLIGENCE_KEY");
  const model = process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL ?? "prebuilt-read";
  const apiVersion = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION ?? "2024-11-30";
  const analyzeUrl = `${endpoint}/documentintelligence/documentModels/${model}:analyze?api-version=${apiVersion}`;

  const response = await fetch(analyzeUrl, {
    method: "POST",
    headers: {
      "Content-Type": source.contentType,
      "Ocp-Apim-Subscription-Key": key
    },
    body: source.bytes
  });

  if (!response.ok || response.status !== 202) {
    throw new Error(`Azure OCR request failed for ${image.id}: ${response.status} ${await response.text()}`);
  }

  const operationLocation = response.headers.get("operation-location");
  if (!operationLocation) {
    throw new Error("Azure OCR response did not include an operation-location header.");
  }

  const result = await pollAzureOperation(operationLocation, key);
  return azureResultToOcrBlocks(applicationId, image, result);
}

async function pollAzureOperation(operationLocation: string, key: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(1000);
    const response = await fetch(operationLocation, {
      headers: {
        "Ocp-Apim-Subscription-Key": key
      }
    });

    if (!response.ok) {
      throw new Error(`Azure OCR polling failed: ${response.status} ${await response.text()}`);
    }

    const result = await response.json();
    if (result.status === "succeeded") {
      return result;
    }

    if (result.status === "failed") {
      throw new Error(`Azure OCR failed: ${JSON.stringify(result.error ?? result)}`);
    }
  }

  throw new Error("Azure OCR timed out while waiting for analysis to finish.");
}

function azureResultToOcrBlocks(applicationId: string, image: ApplicationImageRecord, result: AzureAnalyzeResult) {
  const blocks: OcrTextBlockRecord[] = [];
  const pages = result.analyzeResult?.pages ?? [];

  for (const page of pages) {
    const pageWidth = Number(page.width ?? image.width_px ?? 1);
    const pageHeight = Number(page.height ?? image.height_px ?? 1);

    for (const [index, line] of (page.lines ?? []).entries()) {
      const text = line.content?.trim();
      if (!text) {
        continue;
      }

      const bbox = polygonToPercentBBox(line.polygon, pageWidth, pageHeight);
      blocks.push({
        id: `ocr-${crypto.randomUUID()}`,
        application_id: applicationId,
        image_id: image.id,
        text,
        confidence: averageLineConfidence(text, page.words ?? []),
        bbox,
        page_section: sectionForBBox(bbox),
        block_order: blocks.length + 1,
        line_number: index + 1,
        created_at: new Date().toISOString()
      });
    }
  }

  return blocks;
}

async function extractFields(
  application: ApplicationRecord,
  images: ApplicationImageRecord[],
  ocrBlocks: OcrTextBlockRecord[]
) {
  const mode = (process.env.EXTRACTION_MODE ?? "deterministic").toLowerCase();
  if (mode === "openai" || mode === "llm") {
    return extractFieldsWithOpenAi(application, images, ocrBlocks);
  }

  const extracted = extractFieldsDeterministically(application, ocrBlocks);
  if (mode !== "hybrid" || extracted.fields.every((field) => field.extraction_status === "found" && (field.confidence ?? 0) >= 0.72)) {
    return extracted;
  }

  return extractFieldsWithOpenAi(application, images, ocrBlocks);
}

function extractFieldsDeterministically(application: ApplicationRecord, ocrBlocks: OcrTextBlockRecord[]) {
  const fields: ExtractedFieldRecord[] = [];
  const evidence: Array<{
    id: string;
    extracted_field_id: string;
    image_id: string;
    ocr_text_block_id?: string;
    evidence_text: string;
    confidence?: number;
    bbox: BBox;
    evidence_rank: number;
    created_at: string;
  }> = [];
  const now = new Date().toISOString();

  for (const definition of fieldDefinitions) {
    const result = findFieldCandidate(definition.key, application.submitted_data[definition.key], ocrBlocks);
    const fieldId = `field-${crypto.randomUUID()}`;
    fields.push({
      id: fieldId,
      application_id: application.id,
      field_key: definition.key,
      field_label: definition.label,
      extracted_value: result.extractedValue,
      normalized_value: result.normalizedValue,
      confidence: result.confidence,
      extraction_status: result.status,
      explanation: result.explanation,
      created_at: now
    });

    result.evidenceBlocks.forEach((block, index) => {
      evidence.push({
        id: `evidence-${crypto.randomUUID()}`,
        extracted_field_id: fieldId,
        image_id: block.image_id,
        ocr_text_block_id: block.id,
        evidence_text: block.text,
        confidence: block.confidence,
        bbox: block.bbox,
        evidence_rank: index + 1,
        created_at: now
      });
    });
  }

  return { fields, evidence };
}

function findFieldCandidate(
  fieldKey: keyof SubmittedApplicationData,
  submittedValue: string,
  ocrBlocks: OcrTextBlockRecord[]
): DeterministicFieldCandidate {
  if (fieldKey === "alcohol_content") {
    return findPatternCandidate(fieldKey, submittedValue, ocrBlocks, alcoholContentPattern(), "Alcohol content was matched from OCR text.");
  }

  if (fieldKey === "net_contents") {
    return findPatternCandidate(fieldKey, submittedValue, ocrBlocks, netContentsPattern(), "Net contents were matched from OCR text.");
  }

  if (fieldKey === "government_warning") {
    return findGovernmentWarningCandidate(ocrBlocks);
  }

  return findFuzzyTextCandidate(fieldKey, submittedValue, ocrBlocks);
}

type DeterministicFieldCandidate = {
  extractedValue: string;
  normalizedValue: string;
  confidence?: number;
  status: ExtractedFieldRecord["extraction_status"];
  explanation: string;
  evidenceBlocks: OcrTextBlockRecord[];
};

function findPatternCandidate(
  fieldKey: keyof SubmittedApplicationData,
  submittedValue: string,
  ocrBlocks: OcrTextBlockRecord[],
  pattern: RegExp,
  foundExplanation: string
): DeterministicFieldCandidate {
  const submittedNormalized = normalizeText(submittedValue);
  const candidates = ocrBlocks
    .map((block) => {
      const matches = [...block.text.matchAll(pattern)];
      const matchedText = matches[0]?.[0]?.trim() ?? "";
      if (!matchedText) {
        return null;
      }

      const matchScore = submittedNormalized ? Math.max(similarityScore(submittedValue, matchedText), similarityScore(submittedValue, block.text)) : 0.8;
      return {
        block,
        matchedText,
        score: Math.max(matchScore, block.confidence ?? 0)
      };
    })
    .filter((candidate): candidate is { block: OcrTextBlockRecord; matchedText: string; score: number } => Boolean(candidate))
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best) {
    return missingCandidate(fieldKey, "No matching OCR text was found.");
  }

  const confidence = clampConfidence(Math.max(0.72, best.score));
  return {
    extractedValue: best.matchedText,
    normalizedValue: normalizeExtractedValue(fieldKey, best.matchedText),
    confidence,
    status: confidence && confidence >= 0.72 ? "found" : "ambiguous",
    explanation: foundExplanation,
    evidenceBlocks: [best.block]
  };
}

function findFuzzyTextCandidate(
  fieldKey: keyof SubmittedApplicationData,
  submittedValue: string,
  ocrBlocks: OcrTextBlockRecord[]
): DeterministicFieldCandidate {
  const submittedNormalized = normalizeText(submittedValue);
  if (!submittedNormalized) {
    return missingCandidate(fieldKey, "No submitted value was available for comparison.");
  }

  const candidates = ocrBlocks
    .map((block) => {
      const score = weightedTextScore(submittedValue, block.text, block.confidence);
      return { block, score };
    })
    .filter((candidate) => candidate.score >= 0.35)
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best) {
    return missingCandidate(fieldKey, "No close OCR match was found for the submitted value.");
  }

  const confidence = clampConfidence(best.score);
  return {
    extractedValue: best.block.text,
    normalizedValue: normalizeExtractedValue(fieldKey, best.block.text),
    confidence,
    status: best.score >= 0.62 ? "found" : "ambiguous",
    explanation: best.score >= 0.62 ? "Submitted value was matched against OCR text." : "OCR text partially matches the submitted value.",
    evidenceBlocks: candidates.slice(0, 2).map((candidate) => candidate.block)
  };
}

function findGovernmentWarningCandidate(ocrBlocks: OcrTextBlockRecord[]): DeterministicFieldCandidate {
  const fullText = ocrBlocks.map((block) => block.text).join(" ");
  const fullScore = governmentWarningScore(fullText);
  const scoredBlocks = ocrBlocks
    .map((block) => ({
      block,
      score: Math.max(governmentWarningScore(block.text), warningKeywordScore(block.text))
    }))
    .filter((candidate) => candidate.score >= 0.2)
    .sort((a, b) => b.score - a.score);

  if (fullScore < 0.35 && scoredBlocks.length === 0) {
    return missingCandidate("government_warning", "The government warning was not found in OCR text.");
  }

  const evidenceBlocks = scoredBlocks.slice(0, 4).map((candidate) => candidate.block);
  const extractedValue = evidenceBlocks.length > 0 ? evidenceBlocks.map((block) => block.text).join(" ") : fullText;
  const confidence = clampConfidence(Math.max(fullScore, scoredBlocks[0]?.score ?? 0));
  return {
    extractedValue,
    normalizedValue: normalizeExtractedValue("government_warning", extractedValue),
    confidence,
    status: confidence && confidence >= 0.72 ? "found" : "ambiguous",
    explanation:
      confidence && confidence >= 0.72
        ? "Government warning text was found in OCR text."
        : "Government warning evidence is present but may be incomplete.",
    evidenceBlocks
  };
}

function missingCandidate(fieldKey: keyof SubmittedApplicationData, explanation: string): DeterministicFieldCandidate {
  return {
    extractedValue: "",
    normalizedValue: "",
    confidence: 0,
    status: "missing" as const,
    explanation,
    evidenceBlocks: [] as OcrTextBlockRecord[]
  };
}

async function extractFieldsWithOpenAi(
  application: ApplicationRecord,
  images: ApplicationImageRecord[],
  ocrBlocks: OcrTextBlockRecord[]
) {
  const apiKey = requiredEnv("OPENAI_API_KEY");
  const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content:
            "You extract alcohol label fields from OCR text. Return only the requested JSON schema. Use evidence_block_ids from the supplied OCR blocks when evidence supports a field."
        },
        {
          role: "user",
          content: JSON.stringify({
            submitted_data: application.submitted_data,
            field_definitions: fieldDefinitions,
            images: images.map((image) => ({
              id: image.id,
              label_type: image.label_type,
              filename: image.original_filename
            })),
            ocr_blocks: ocrBlocks.map((block) => ({
              id: block.id,
              image_id: block.image_id,
              text: block.text,
              confidence: block.confidence,
              bbox: block.bbox
            }))
          })
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "alcohol_label_extraction",
          strict: true,
          schema: extractionSchema
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI extraction failed: ${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  const outputText = extractOpenAiText(json);
  const parsed = JSON.parse(outputText) as ExtractionResponse;
  return mapExtractionResponse(application.id, parsed, ocrBlocks);
}

function mapExtractionResponse(applicationId: string, response: ExtractionResponse, ocrBlocks: OcrTextBlockRecord[]) {
  const fields: ExtractedFieldRecord[] = [];
  const evidence: Array<{
    id: string;
    extracted_field_id: string;
    image_id: string;
    ocr_text_block_id?: string;
    evidence_text: string;
    confidence?: number;
    bbox: BBox;
    evidence_rank: number;
    created_at: string;
  }> = [];
  const blocksById = new Map(ocrBlocks.map((block) => [block.id, block]));

  for (const item of response.fields) {
    const definition = fieldDefinitions.find((field) => field.key === item.field_key);
    const fieldId = `field-${crypto.randomUUID()}`;
    fields.push({
      id: fieldId,
      application_id: applicationId,
      field_key: item.field_key,
      field_label: definition?.label ?? item.field_key,
      extracted_value: item.extracted_value,
      normalized_value: item.normalized_value,
      confidence: clampConfidence(item.confidence),
      extraction_status: item.extraction_status,
      explanation: item.explanation,
      created_at: new Date().toISOString()
    });

    for (const [index, blockId] of item.evidence_block_ids.entries()) {
      const block = blocksById.get(blockId);
      if (!block) {
        continue;
      }

      evidence.push({
        id: `evidence-${crypto.randomUUID()}`,
        extracted_field_id: fieldId,
        image_id: block.image_id,
        ocr_text_block_id: block.id,
        evidence_text: block.text,
        confidence: block.confidence,
        bbox: block.bbox,
        evidence_rank: index + 1,
        created_at: new Date().toISOString()
      });
    }
  }

  return { fields, evidence };
}

function runValidators(application: ApplicationRecord, fields: ExtractedFieldRecord[]) {
  const byKey = new Map(fields.map((field) => [field.field_key, field]));
  const results: ValidationResultRecord[] = [];

  for (const definition of fieldDefinitions) {
    const field = byKey.get(definition.key);
    const submittedValue = application.submitted_data[definition.key];
    const extractedValue = field?.extracted_value ?? "";

    results.push(
      validationResult(application.id, definition.key, `${definition.key}_required`, `${definition.label} is present`, {
        result_status: field && field.extraction_status !== "missing" && extractedValue.trim() ? "pass" : "fail",
        submitted_value: submittedValue,
        extracted_value: extractedValue,
        score: field?.confidence,
        message: extractedValue.trim() ? `${definition.label} was found on label evidence.` : `${definition.label} was not found.`
      })
    );
  }

  results.push(validateGovernmentWarning(application.id, byKey.get("government_warning")));
  results.push(validateFormat(application.id, "alcohol_content", "Alcohol content format", byKey.get("alcohol_content"), /\b\d{1,2}(\.\d+)?\s*%|\b\d{1,3}(\.\d+)?\s*proof\b/i));
  results.push(validateFormat(application.id, "net_contents", "Net contents format", byKey.get("net_contents"), /\b\d+(\.\d+)?\s*(ml|mL|l|L|oz|fl\.?\s*oz)\b/));

  for (const key of ["brand_name", "product_name", "origin"] as const) {
    const score = similarityScore(application.submitted_data[key], byKey.get(key)?.normalized_value || byKey.get(key)?.extracted_value || "");
    results.push(
      validationResult(application.id, key, `${key}_matches_submission`, `${fieldLabel(key)} matches submitted data`, {
        result_status: score >= 0.75 ? "pass" : score >= 0.45 ? "warning" : "fail",
        submitted_value: application.submitted_data[key],
        extracted_value: byKey.get(key)?.extracted_value ?? "",
        score,
        message:
          score >= 0.75
            ? "Extracted label text is consistent with the submitted value."
            : "Extracted label text may not match the submitted value."
      })
    );
  }

  return results;
}

function validateGovernmentWarning(applicationId: string, field?: ExtractedFieldRecord) {
  const extracted = field?.extracted_value ?? "";
  const containsCanonical = normalizeText(extracted).includes(normalizeText(canonicalGovernmentWarning));
  return validationResult(applicationId, "government_warning", "government_warning_exact_text", "Government warning exact text", {
    result_status: containsCanonical ? "pass" : "fail",
    submitted_value: canonicalGovernmentWarning,
    extracted_value: extracted,
    score: containsCanonical ? 1 : 0,
    message: containsCanonical
      ? "The canonical government warning text appears on the label."
      : "The canonical government warning text was not found exactly in label evidence."
  });
}

function validateFormat(
  applicationId: string,
  fieldKey: keyof SubmittedApplicationData,
  label: string,
  field: ExtractedFieldRecord | undefined,
  pattern: RegExp
) {
  const extracted = field?.extracted_value ?? "";
  const passes = pattern.test(extracted);
  return validationResult(applicationId, fieldKey, `${fieldKey}_format`, label, {
    result_status: passes ? "pass" : "fail",
    extracted_value: extracted,
    score: passes ? 1 : 0,
    message: passes ? `${label} looks valid.` : `${label} was missing or did not match the expected format.`
  });
}

function validationResult(
  applicationId: string,
  fieldKey: keyof SubmittedApplicationData,
  checkKey: string,
  checkLabel: string,
  input: Omit<ValidationResultRecord, "id" | "application_id" | "field_key" | "check_key" | "check_label" | "created_at">
): ValidationResultRecord {
  return {
    id: `validation-${crypto.randomUUID()}`,
    application_id: applicationId,
    field_key: fieldKey,
    check_key: checkKey,
    check_label: checkLabel,
    created_at: new Date().toISOString(),
    ...input
  };
}

async function updateApplicationStatus(
  supabase: ReturnType<typeof createWorkerSupabaseClient>,
  applicationId: string,
  status: "processed" | "failed",
  error?: string
) {
  const { error: updateError } = await supabase
    .from("applications")
    .update({
      processing_status: status,
      processing_error: error ?? null,
      processing_finished_at: new Date().toISOString(),
      locked_by: null
    })
    .eq("id", applicationId);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

function createWorkerSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for worker database work.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function loadLocalEnv() {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function numberEnv(key: string, fallback: number) {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function requiredEnv(key: string) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function validateProviderEnv() {
  for (const key of ["AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT", "AZURE_DOCUMENT_INTELLIGENCE_KEY"]) {
    requiredEnv(key);
  }

  const extractionMode = (process.env.EXTRACTION_MODE ?? "deterministic").toLowerCase();
  if (extractionMode === "openai" || extractionMode === "llm" || extractionMode === "hybrid") {
    requiredEnv("OPENAI_API_KEY");
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(limit, 1), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex++;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    })
  );

  return results;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTimer(label: string) {
  const startedAt = performance.now();
  let previousAt = startedAt;

  return {
    mark(step: string) {
      const now = performance.now();
      console.log(`[timing:${label}] ${step}: ${formatDuration(now - previousAt)} elapsed=${formatDuration(now - startedAt)}`);
      previousAt = now;
    },
    end() {
      const now = performance.now();
      console.log(`[timing:${label}] total: ${formatDuration(now - startedAt)}`);
    }
  };
}

function formatDuration(ms: number) {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  return `${(ms / 1000).toFixed(2)}s`;
}

function polygonToPercentBBox(polygon: AzurePolygon | undefined, pageWidth: number, pageHeight: number): BBox {
  const points = normalizePolygon(polygon);
  if (points.length === 0 || pageWidth <= 0 || pageHeight <= 0) {
    return { x: 0, y: 0, width: 100, height: 100 };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  return {
    x: clampPercent((left / pageWidth) * 100),
    y: clampPercent((top / pageHeight) * 100),
    width: clampPercent(((right - left) / pageWidth) * 100),
    height: clampPercent(((bottom - top) / pageHeight) * 100)
  };
}

function normalizePolygon(polygon: AzurePolygon | undefined) {
  if (!polygon) {
    return [];
  }

  if (Array.isArray(polygon) && typeof polygon[0] === "number") {
    const numbers = polygon as number[];
    const points = [];
    for (let index = 0; index < numbers.length; index += 2) {
      points.push({ x: numbers[index], y: numbers[index + 1] });
    }
    return points;
  }

  return polygon as Array<{ x: number; y: number }>;
}

function sectionForBBox(bbox: BBox): OcrTextBlockRecord["page_section"] {
  if (bbox.y < 33) {
    return "top";
  }
  if (bbox.y > 66) {
    return "bottom";
  }
  return "middle";
}

function averageLineConfidence(text: string, words: AzureWord[]) {
  const normalizedLine = normalizeText(text);
  const matchingWords = words.filter((word) => normalizedLine.includes(normalizeText(word.content ?? "")));
  const confidences = matchingWords.map((word) => word.confidence).filter((confidence): confidence is number => typeof confidence === "number");
  if (confidences.length === 0) {
    return undefined;
  }

  return clampConfidence(confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length);
}

function extractOpenAiText(response: OpenAiResponse) {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  throw new Error("OpenAI response did not include output text.");
}

function alcoholContentPattern() {
  return /\b\d{1,3}(?:\.\d+)?\s*(?:%|percent|alc\.?\s*\/?\s*vol\.?|abv)\b|\b\d{1,3}(?:\.\d+)?\s*proof\b/gi;
}

function netContentsPattern() {
  return /\b\d+(?:\.\d+)?\s*(?:ml|mL|l|L|liter|liters|oz|fl\.?\s*oz|fluid\s+ounces|pt|pint|qt|quart|gal|gallon)s?\b/gi;
}

function normalizeExtractedValue(fieldKey: keyof SubmittedApplicationData, value: string) {
  const trimmed = value.trim();
  if (fieldKey === "alcohol_content") {
    return trimmed.replace(/\s+/g, " ").replace(/\balc\.?\s*\/?\s*vol\.?/i, "ABV");
  }

  if (fieldKey === "net_contents") {
    return trimmed.replace(/\s+/g, " ").replace(/\bmilliliters?\b/i, "mL").replace(/\bliters?\b/i, "L");
  }

  return normalizeText(trimmed);
}

function weightedTextScore(submittedValue: string, ocrText: string, ocrConfidence?: number) {
  const fuzzy = similarityScore(submittedValue, ocrText);
  const ordered = orderedTokenScore(submittedValue, ocrText);
  const confidenceBoost = typeof ocrConfidence === "number" ? Math.min(ocrConfidence, 1) * 0.08 : 0;
  return clampConfidence(Math.max(fuzzy, ordered) + confidenceBoost) ?? 0;
}

function orderedTokenScore(left: string, right: string) {
  const leftTokens = normalizeText(left).split(" ").filter(Boolean);
  const rightText = normalizeText(right);
  if (leftTokens.length === 0 || !rightText) {
    return 0;
  }

  let matched = 0;
  let searchFrom = 0;
  for (const token of leftTokens) {
    const index = rightText.indexOf(token, searchFrom);
    if (index === -1) {
      continue;
    }
    matched++;
    searchFrom = index + token.length;
  }

  return matched / leftTokens.length;
}

function governmentWarningScore(value: string) {
  const normalizedValue = normalizeText(value);
  const normalizedWarning = normalizeText(canonicalGovernmentWarning);
  if (!normalizedValue) {
    return 0;
  }
  if (normalizedValue.includes(normalizedWarning)) {
    return 1;
  }

  const warningTokens = new Set(normalizedWarning.split(" ").filter(Boolean));
  const valueTokens = new Set(normalizedValue.split(" ").filter(Boolean));
  const hits = [...warningTokens].filter((token) => valueTokens.has(token)).length;
  return hits / warningTokens.size;
}

function warningKeywordScore(value: string) {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) {
    return 0;
  }

  const keywords = ["government", "warning", "surgeon", "general", "pregnancy", "birth", "defects"];
  const hits = keywords.filter((keyword) => normalizedValue.includes(keyword)).length;
  return hits / keywords.length;
}

function similarityScore(left: string, right: string) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }
  if (normalizedLeft === normalizedRight || normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return 1;
  }

  const leftTokens = new Set(normalizedLeft.split(" ").filter(Boolean));
  const rightTokens = new Set(normalizedRight.split(" ").filter(Boolean));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.% ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fieldLabel(fieldKey: keyof SubmittedApplicationData) {
  return fieldDefinitions.find((field) => field.key === fieldKey)?.label ?? fieldKey;
}

function clampConfidence(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, value));
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["fields"],
  properties: {
    fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "field_key",
          "extracted_value",
          "normalized_value",
          "confidence",
          "extraction_status",
          "explanation",
          "evidence_block_ids"
        ],
        properties: {
          field_key: {
            type: "string",
            enum: fieldDefinitions.map((field) => field.key)
          },
          extracted_value: {
            type: "string"
          },
          normalized_value: {
            type: "string"
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1
          },
          extraction_status: {
            type: "string",
            enum: ["found", "missing", "ambiguous", "conflict"]
          },
          explanation: {
            type: "string"
          },
          evidence_block_ids: {
            type: "array",
            items: {
              type: "string"
            }
          }
        }
      }
    }
  }
};

type ExtractionResponse = {
  fields: Array<{
    field_key: keyof SubmittedApplicationData;
    extracted_value: string;
    normalized_value: string;
    confidence: number;
    extraction_status: ExtractedFieldRecord["extraction_status"];
    explanation: string;
    evidence_block_ids: string[];
  }>;
};

type AzureAnalyzeResult = {
  analyzeResult?: {
    pages?: Array<{
      width?: number;
      height?: number;
      lines?: Array<{
        content?: string;
        polygon?: AzurePolygon;
      }>;
      words?: AzureWord[];
    }>;
  };
};

type AzureWord = {
  content?: string;
  confidence?: number;
};

type AzurePolygon = number[] | Array<{ x: number; y: number }>;

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
