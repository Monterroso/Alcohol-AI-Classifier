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
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";
const governmentWarningExtractionInstruction =
  `For government_warning, search specifically for this full required text: "${canonicalGovernmentWarning}". ` +
  "Do not treat GOVERNMENT WARNING, partial text, paraphrases, or general warning evidence as a found government_warning field. " +
  "Return the full required text as extracted_value only when that full text is present; otherwise return the observed partial warning text with extraction_status \"ambiguous\" or an empty value with extraction_status \"missing\".";

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
    return extractFieldsWithProvider("openai", application, images, ocrBlocks, allFieldKeys(), ocrBlocks);
  }

  if (mode === "gemini") {
    return extractFieldsWithProvider("gemini", application, images, ocrBlocks, allFieldKeys(), ocrBlocks);
  }

  const extracted = extractFieldsDeterministically(application, ocrBlocks);
  const unresolvedFieldKeys = findUnresolvedFieldKeys(extracted.fields);
  if (mode !== "hybrid" || unresolvedFieldKeys.length === 0) {
    return extracted;
  }

  const provider = fallbackExtractionProvider();
  const fallbackOcrBlocks = selectFallbackOcrBlocks(application, ocrBlocks, unresolvedFieldKeys, extracted);
  const fallback = await extractFieldsWithProvider(provider, application, images, fallbackOcrBlocks, unresolvedFieldKeys, ocrBlocks);
  return mergeExtractionResults(extracted, fallback, unresolvedFieldKeys);
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
  const hasExactWarning = fullText.includes(canonicalGovernmentWarning);
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
  const extractedValue = hasExactWarning
    ? canonicalGovernmentWarning
    : evidenceBlocks.length > 0
      ? evidenceBlocks.map((block) => block.text).join(" ")
      : fullText;
  const confidence = hasExactWarning ? 1 : clampConfidence(Math.max(fullScore, scoredBlocks[0]?.score ?? 0));
  return {
    extractedValue,
    normalizedValue: normalizeExtractedValue("government_warning", extractedValue),
    confidence,
    status: hasExactWarning ? "found" : "ambiguous",
    explanation:
      hasExactWarning
        ? "The full required government warning text was found in OCR text."
        : "Government warning evidence is present, but the full required text was not found.",
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

type FieldExtractionResult = ReturnType<typeof extractFieldsDeterministically>;
type ExtractionProvider = "openai" | "gemini";

function allFieldKeys() {
  return fieldDefinitions.map((field) => field.key);
}

function findUnresolvedFieldKeys(fields: ExtractedFieldRecord[]) {
  return fields
    .filter((field) => field.extraction_status !== "found" || (field.confidence ?? 0) < 0.72)
    .map((field) => field.field_key);
}

function fallbackExtractionProvider(): ExtractionProvider {
  const defaultProvider = process.env.GEMINI_API_KEY ? "gemini" : "openai";
  const provider = (process.env.EXTRACTION_PROVIDER ?? process.env.LLM_PROVIDER ?? defaultProvider).toLowerCase();
  if (provider === "openai" || provider === "llm") {
    return "openai";
  }
  if (provider === "gemini" || provider === "google") {
    return "gemini";
  }

  throw new Error(`Unsupported extraction provider: ${provider}`);
}

async function extractFieldsWithProvider(
  provider: ExtractionProvider,
  application: ApplicationRecord,
  images: ApplicationImageRecord[],
  providerOcrBlocks: OcrTextBlockRecord[],
  requestedFieldKeys: Array<keyof SubmittedApplicationData>,
  evidenceOcrBlocks: OcrTextBlockRecord[]
) {
  if (provider === "gemini") {
    return extractFieldsWithGemini(application, images, providerOcrBlocks, requestedFieldKeys, evidenceOcrBlocks);
  }

  return extractFieldsWithOpenAi(application, images, providerOcrBlocks, requestedFieldKeys, evidenceOcrBlocks);
}

async function extractFieldsWithOpenAi(
  application: ApplicationRecord,
  images: ApplicationImageRecord[],
  ocrBlocks: OcrTextBlockRecord[],
  requestedFieldKeys: Array<keyof SubmittedApplicationData>,
  evidenceOcrBlocks: OcrTextBlockRecord[]
) {
  const apiKey = requiredEnv("OPENAI_API_KEY");
  const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";
  const requestedDefinitions = fieldDefinitions.filter((field) => requestedFieldKeys.includes(field.key));
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
          content: [
            "You extract alcohol label fields from OCR text. Return only the requested JSON schema. Use evidence_block_ids from the supplied OCR blocks when evidence supports a field.",
            governmentWarningExtractionInstruction
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({
            submitted_data: application.submitted_data,
            required_government_warning_text: canonicalGovernmentWarning,
            field_definitions: requestedDefinitions,
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
          schema: extractionSchemaFor(requestedFieldKeys)
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
  return mapExtractionResponse(application.id, parsed, evidenceOcrBlocks, requestedFieldKeys, "OpenAI");
}

async function extractFieldsWithGemini(
  application: ApplicationRecord,
  images: ApplicationImageRecord[],
  ocrBlocks: OcrTextBlockRecord[],
  requestedFieldKeys: Array<keyof SubmittedApplicationData>,
  evidenceOcrBlocks: OcrTextBlockRecord[]
) {
  const apiKey = requiredEnv("GEMINI_API_KEY");
  const model = normalizeGeminiModel(process.env.GEMINI_MODEL ?? "gemini-2.0-flash");
  const requestedDefinitions = fieldDefinitions.filter((field) => requestedFieldKeys.includes(field.key));
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                "You extract alcohol label fields from Azure OCR text.",
                "Return only valid JSON that matches this shape: {\"fields\":[{\"field_key\":\"brand_name\",\"extracted_value\":\"\",\"normalized_value\":\"\",\"confidence\":0,\"extraction_status\":\"found\",\"explanation\":\"\",\"evidence_block_ids\":[]}]}",
                "Only include the requested field_definitions. Use evidence_block_ids from the supplied OCR blocks when the text supports a field. If a field is not supported by OCR text, return an empty value with extraction_status \"missing\".",
                governmentWarningExtractionInstruction,
                JSON.stringify({
                  submitted_data: application.submitted_data,
                  required_government_warning_text: canonicalGovernmentWarning,
                  field_definitions: requestedDefinitions,
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
              ].join("\n\n")
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: geminiExtractionSchemaFor(requestedFieldKeys),
        temperature: 0
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini extraction failed: ${response.status} ${await response.text()}`);
  }

  const json = (await response.json()) as GeminiResponse;
  const outputText = extractGeminiText(json);
  const parsed = JSON.parse(outputText) as ExtractionResponse;
  return mapExtractionResponse(application.id, parsed, evidenceOcrBlocks, requestedFieldKeys, "Gemini");
}

function normalizeGeminiModel(model: string) {
  return model.replace(/^models\//, "");
}

async function extractFieldsWithGeminiVisionForBenchmark(
  application: ApplicationRecord,
  images: BenchmarkImageRecord[],
  ocrBlocks: OcrTextBlockRecord[]
) {
  const apiKey = requiredEnv("GEMINI_API_KEY");
  const model = normalizeGeminiModel(process.env.GEMINI_VISION_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-2.0-flash");
  const imageParts = images
    .filter((image) => image.base64)
    .map((image) => ({
      inlineData: {
        mimeType: image.media_type ?? image.mime_type ?? "image/jpeg",
        data: image.base64
      }
    }));

  if (imageParts.length === 0) {
    throw new Error("Gemini vision benchmark requires images with base64 data.");
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            ...imageParts,
            {
              text: [
                "You extract alcohol label fields directly from the provided label image or images.",
                "Extract exactly what appears on the label. Return only valid JSON matching the requested schema.",
                governmentWarningExtractionInstruction,
                "Use an empty evidence_block_ids array because this direct vision benchmark does not receive OCR block ids.",
                JSON.stringify({
                  submitted_data: application.submitted_data,
                  required_government_warning_text: canonicalGovernmentWarning,
                  field_definitions: fieldDefinitions,
                  images: images.map((image) => ({
                    id: image.id,
                    label_type: image.label_type,
                    filename: image.original_filename
                  }))
                })
              ].join("\n\n")
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: geminiExtractionSchemaFor(allFieldKeys()),
        temperature: 0
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini vision extraction failed: ${response.status} ${await response.text()}`);
  }

  const json = (await response.json()) as GeminiResponse;
  const outputText = extractGeminiText(json);
  const parsed = JSON.parse(outputText) as ExtractionResponse;
  return mapExtractionResponse(application.id, parsed, ocrBlocks, allFieldKeys(), "Gemini vision");
}

function mapExtractionResponse(
  applicationId: string,
  response: ExtractionResponse,
  ocrBlocks: OcrTextBlockRecord[],
  requestedFieldKeys: Array<keyof SubmittedApplicationData>,
  providerName: string
) {
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
  const requested = new Set(requestedFieldKeys);
  const returnedFieldKeys = new Set<keyof SubmittedApplicationData>();

  for (const item of response.fields) {
    if (!requested.has(item.field_key)) {
      continue;
    }

    returnedFieldKeys.add(item.field_key);
    const definition = fieldDefinitions.find((field) => field.key === item.field_key);
    const fieldId = `field-${crypto.randomUUID()}`;
    const evidenceBlocks = evidenceBlocksForExtractionItem(item, ocrBlocks, blocksById);
    fields.push({
      id: fieldId,
      application_id: applicationId,
      field_key: item.field_key,
      field_label: definition?.label ?? item.field_key,
      extracted_value: item.extracted_value,
      normalized_value: item.normalized_value,
      confidence: clampConfidence(item.confidence),
      extraction_status: item.extraction_status,
      explanation: `${providerName}: ${item.explanation}`,
      created_at: new Date().toISOString()
    });

    for (const [index, block] of evidenceBlocks.entries()) {
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

  for (const fieldKey of requestedFieldKeys) {
    if (returnedFieldKeys.has(fieldKey)) {
      continue;
    }

    fields.push({
      id: `field-${crypto.randomUUID()}`,
      application_id: applicationId,
      field_key: fieldKey,
      field_label: fieldLabel(fieldKey),
      extracted_value: "",
      normalized_value: "",
      confidence: 0,
      extraction_status: "missing",
      explanation: `${providerName}: No extraction result was returned for this requested field.`,
      created_at: new Date().toISOString()
    });
  }

  return { fields, evidence };
}

function evidenceBlocksForExtractionItem(
  item: ExtractionResponse["fields"][number],
  ocrBlocks: OcrTextBlockRecord[],
  blocksById: Map<string, OcrTextBlockRecord>
) {
  const explicitBlocks = item.evidence_block_ids
    .map((blockId) => blocksById.get(blockId))
    .filter((block): block is OcrTextBlockRecord => Boolean(block));

  if (explicitBlocks.length > 0) {
    return explicitBlocks.slice(0, 4);
  }

  return findEvidenceBlocksForExtractedValue(item.field_key, item.extracted_value, ocrBlocks);
}

function mergeExtractionResults(
  deterministic: FieldExtractionResult,
  fallback: FieldExtractionResult,
  fallbackFieldKeys: Array<keyof SubmittedApplicationData>
): FieldExtractionResult {
  const fallbackKeys = new Set(fallbackFieldKeys);
  const fallbackFieldsByKey = new Map(fallback.fields.map((field) => [field.field_key, field]));
  const fallbackFieldIds = new Set([...fallbackFieldsByKey.values()].map((field) => field.id));
  const keptFieldIds = new Set(
    deterministic.fields.filter((field) => !fallbackKeys.has(field.field_key) || !fallbackFieldsByKey.has(field.field_key)).map((field) => field.id)
  );

  const fields = deterministic.fields.map((field) => fallbackFieldsByKey.get(field.field_key) ?? field);
  const evidence = [
    ...deterministic.evidence.filter((item) => keptFieldIds.has(item.extracted_field_id)),
    ...fallback.evidence.filter((item) => fallbackFieldIds.has(item.extracted_field_id))
  ];

  return { fields, evidence };
}

function selectFallbackOcrBlocks(
  application: ApplicationRecord,
  ocrBlocks: OcrTextBlockRecord[],
  fieldKeys: Array<keyof SubmittedApplicationData>,
  extracted: FieldExtractionResult
) {
  const selected = new Map<string, OcrTextBlockRecord>();
  const blocksById = new Map(ocrBlocks.map((block) => [block.id, block]));
  const maxBlocks = numberEnv("FALLBACK_OCR_BLOCK_LIMIT", 80);

  function addBlock(block: OcrTextBlockRecord | undefined) {
    if (block) {
      selected.set(block.id, block);
    }
  }

  function addWithNeighbors(block: OcrTextBlockRecord | undefined) {
    addBlock(block);
    for (const neighbor of neighborOcrBlocks(block, ocrBlocks)) {
      addBlock(neighbor);
    }
  }

  for (const evidence of extracted.evidence) {
    if (evidence.ocr_text_block_id) {
      addWithNeighbors(blocksById.get(evidence.ocr_text_block_id));
    }
  }

  for (const fieldKey of fieldKeys) {
    const submittedValue = application.submitted_data[fieldKey];
    if (fieldKey === "alcohol_content") {
      addPatternBlocks(ocrBlocks, alcoholContentPattern(), addWithNeighbors);
      continue;
    }
    if (fieldKey === "net_contents") {
      addPatternBlocks(ocrBlocks, netContentsPattern(), addWithNeighbors);
      continue;
    }
    if (fieldKey === "government_warning") {
      for (const block of ocrBlocks.filter((candidate) => warningKeywordScore(candidate.text) >= 0.15 || governmentWarningScore(candidate.text) >= 0.15)) {
        addWithNeighbors(block);
      }
      continue;
    }

    for (const candidate of topScoredBlocks(ocrBlocks, (block) => weightedTextScore(submittedValue, block.text, block.confidence), 8, 0.25)) {
      addWithNeighbors(candidate.block);
    }
  }

  for (const candidate of topScoredBlocks(ocrBlocks, (block) => block.confidence ?? 0, maxBlocks, 0.75)) {
    addBlock(candidate.block);
  }

  return sortOcrBlocksInReadingOrder([...selected.values()]).slice(0, maxBlocks);
}

function addPatternBlocks(ocrBlocks: OcrTextBlockRecord[], pattern: RegExp, addBlock: (block: OcrTextBlockRecord) => void) {
  for (const block of ocrBlocks) {
    pattern.lastIndex = 0;
    if (pattern.test(block.text)) {
      addBlock(block);
    }
  }
}

function neighborOcrBlocks(block: OcrTextBlockRecord | undefined, ocrBlocks: OcrTextBlockRecord[]) {
  if (!block || typeof block.block_order !== "number") {
    return [];
  }

  return ocrBlocks.filter((candidate) => candidate.image_id === block.image_id && Math.abs((candidate.block_order ?? 0) - block.block_order!) <= 1);
}

function findEvidenceBlocksForExtractedValue(
  fieldKey: keyof SubmittedApplicationData,
  extractedValue: string,
  ocrBlocks: OcrTextBlockRecord[]
) {
  const normalized = normalizeText(extractedValue);
  if (!normalized) {
    return [];
  }

  if (fieldKey === "alcohol_content") {
    const patternMatches = ocrBlocks.filter((block) => {
      const pattern = alcoholContentPattern();
      return pattern.test(block.text) && similarityScore(extractedValue, block.text) >= 0.2;
    });
    if (patternMatches.length > 0) {
      return sortOcrBlocksInReadingOrder(patternMatches).slice(0, 2);
    }
  }

  if (fieldKey === "net_contents") {
    const patternMatches = ocrBlocks.filter((block) => {
      const pattern = netContentsPattern();
      return pattern.test(block.text) && similarityScore(extractedValue, block.text) >= 0.2;
    });
    if (patternMatches.length > 0) {
      return sortOcrBlocksInReadingOrder(patternMatches).slice(0, 2);
    }
  }

  if (fieldKey === "government_warning") {
    const warningMatches = topScoredBlocks(
      ocrBlocks,
      (block) => Math.max(governmentWarningScore(block.text), warningKeywordScore(block.text)),
      4,
      0.15
    ).map((candidate) => candidate.block);
    if (warningMatches.length > 0) {
      return sortOcrBlocksInReadingOrder(warningMatches);
    }
  }

  return topScoredBlocks(ocrBlocks, (block) => weightedTextScore(extractedValue, block.text, block.confidence), 4, 0.25).map((candidate) => candidate.block);
}

function topScoredBlocks(
  ocrBlocks: OcrTextBlockRecord[],
  scoreBlock: (block: OcrTextBlockRecord) => number,
  limit: number,
  minimumScore: number
) {
  return ocrBlocks
    .map((block) => ({ block, score: scoreBlock(block) }))
    .filter((candidate) => candidate.score >= minimumScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function sortOcrBlocksInReadingOrder(ocrBlocks: OcrTextBlockRecord[]) {
  return [...ocrBlocks].sort((a, b) => {
    if (a.image_id !== b.image_id) {
      return a.image_id.localeCompare(b.image_id);
    }

    return (a.block_order ?? a.line_number ?? 0) - (b.block_order ?? b.line_number ?? 0);
  });
}

function runValidators(application: ApplicationRecord, fields: ExtractedFieldRecord[]) {
  const byKey = new Map(fields.map((field) => [field.field_key, field]));
  const results: ValidationResultRecord[] = [];

  for (const definition of fieldDefinitions) {
    const field = byKey.get(definition.key);
    const submittedValue = application.submitted_data[definition.key];
    const extractedValue = field?.extracted_value ?? "";
    const optionalAndBlank = definition.optional && !submittedValue.trim();

    results.push(
      validationResult(application.id, definition.key, `${definition.key}_required`, `${definition.label} is present`, {
        result_status: optionalAndBlank || (field && field.extraction_status !== "missing" && extractedValue.trim()) ? "pass" : "fail",
        submitted_value: submittedValue,
        extracted_value: extractedValue,
        score: field?.confidence,
        message: optionalAndBlank
          ? `${definition.label} was not submitted and is optional.`
          : extractedValue.trim() ? `${definition.label} was found on label evidence.` : `${definition.label} was not found.`
      })
    );
  }

  results.push(validateGovernmentWarning(application.id, byKey.get("government_warning")));
  results.push(validateFormat(application.id, "alcohol_content", "Alcohol content format", byKey.get("alcohol_content"), /\b\d{1,2}(\.\d+)?\s*%|\b\d{1,3}(\.\d+)?\s*proof\b/i));
  results.push(validateFormat(application.id, "net_contents", "Net contents format", byKey.get("net_contents"), /\b\d+(\.\d+)?\s*(ml|mL|l|L|oz|fl\.?\s*oz)\b/));

  for (const key of ["brand_name", "class_type", "product_name", "origin"] as const) {
    if (key === "product_name" && !application.submitted_data[key].trim()) {
      continue;
    }

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
  const exactMatch = extracted.trim() === canonicalGovernmentWarning;
  return validationResult(applicationId, "government_warning", "government_warning_exact_text", "Government warning exact text", {
    result_status: exactMatch ? "pass" : "fail",
    submitted_value: canonicalGovernmentWarning,
    extracted_value: extracted,
    score: exactMatch ? 1 : 0,
    message: exactMatch
      ? "The government warning text exactly matches the required text."
      : "The government warning text must match the required text exactly."
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

async function runExtractionBenchmark(inputPath: string | undefined) {
  if (!inputPath) {
    throw new Error("Pass a benchmark JSON file after --benchmark-extraction.");
  }

  const input = JSON.parse(readFileSync(inputPath, "utf8")) as ExtractionBenchmarkInput;
  const application = benchmarkApplication(input);
  const images = benchmarkImages(input);
  const ocrBlocks = input.ocr_blocks ?? input.ocrBlocks ?? [];
  if (ocrBlocks.length === 0) {
    throw new Error("Benchmark input must include ocr_blocks.");
  }

  const results: ExtractionBenchmarkResult[] = [];
  const deterministic = await timeBenchmark("deterministic", async () => extractFieldsDeterministically(application, ocrBlocks));
  results.push(deterministic);

  if (process.env.OPENAI_API_KEY) {
    results.push(await timeBenchmark("hybrid-openai", async () => runBenchmarkHybridProvider("openai", application, images, ocrBlocks, deterministic.result)));
  }

  if (process.env.GEMINI_API_KEY) {
    results.push(await timeBenchmark("hybrid-gemini-text", async () => runBenchmarkHybridProvider("gemini", application, images, ocrBlocks, deterministic.result)));

    if (images.some((image) => image.base64)) {
      results.push(await timeBenchmark("gemini-vision", async () => extractFieldsWithGeminiVisionForBenchmark(application, images, ocrBlocks)));
    }
  }

  console.log(
    JSON.stringify(
      results.map((result) => ({
        name: result.name,
        duration_ms: result.durationMs,
        fields: result.result.fields.map((field) => ({
          field_key: field.field_key,
          status: field.extraction_status,
          confidence: field.confidence,
          extracted_value: field.extracted_value
        })),
        evidence_count: result.result.evidence.length
      })),
      null,
      2
    )
  );
}

async function runBenchmarkHybridProvider(
  provider: ExtractionProvider,
  application: ApplicationRecord,
  images: BenchmarkImageRecord[],
  ocrBlocks: OcrTextBlockRecord[],
  deterministic: FieldExtractionResult
) {
  const unresolvedFieldKeys = findUnresolvedFieldKeys(deterministic.fields);
  if (unresolvedFieldKeys.length === 0) {
    return deterministic;
  }

  const fallbackOcrBlocks = selectFallbackOcrBlocks(application, ocrBlocks, unresolvedFieldKeys, deterministic);
  const fallback = await extractFieldsWithProvider(provider, application, images, fallbackOcrBlocks, unresolvedFieldKeys, ocrBlocks);
  return mergeExtractionResults(deterministic, fallback, unresolvedFieldKeys);
}

async function timeBenchmark(name: string, run: () => Promise<FieldExtractionResult> | FieldExtractionResult): Promise<ExtractionBenchmarkResult> {
  const start = performance.now();
  const result = await run();
  return {
    name,
    durationMs: Math.round(performance.now() - start),
    result
  };
}

function benchmarkApplication(input: ExtractionBenchmarkInput): ApplicationRecord {
  const application = input.application;
  if (application) {
    return application;
  }

  if (!input.submitted_data) {
    throw new Error("Benchmark input must include application or submitted_data.");
  }

  return {
    id: input.application_id ?? "benchmark-application",
    application_number: input.application_number ?? "BENCHMARK",
    submitted_data: input.submitted_data,
    processing_status: "pending",
    attempt_count: 0,
    review_status: "unreviewed",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function benchmarkImages(input: ExtractionBenchmarkInput): BenchmarkImageRecord[] {
  return (input.images ?? []).map((image, index) => ({
    id: image.id ?? `benchmark-image-${index + 1}`,
    application_id: image.application_id ?? input.application_id ?? "benchmark-application",
    image_url: image.image_url ?? "",
    storage_path: image.storage_path,
    label_type: image.label_type ?? "other",
    original_filename: image.original_filename,
    mime_type: image.mime_type ?? image.media_type,
    width_px: image.width_px,
    height_px: image.height_px,
    created_at: image.created_at ?? new Date().toISOString(),
    base64: image.base64 ?? image.image_base64,
    media_type: image.media_type ?? image.mime_type
  }));
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
  if (extractionMode === "openai" || extractionMode === "llm") {
    requiredEnv("OPENAI_API_KEY");
    return;
  }

  if (extractionMode === "gemini") {
    requiredEnv("GEMINI_API_KEY");
    return;
  }

  if (extractionMode === "hybrid") {
    const provider = fallbackExtractionProvider();
    requiredEnv(provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY");
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

function extractGeminiText(response: GeminiResponse) {
  for (const candidate of response.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (typeof part.text === "string") {
        return part.text;
      }
    }
  }

  throw new Error("Gemini response did not include output text.");
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

function extractionSchemaFor(fieldKeys: Array<keyof SubmittedApplicationData>) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["fields"],
    properties: {
      fields: {
        type: "array",
        items: extractionFieldSchema(fieldKeys)
      }
    }
  };
}

function extractionFieldSchema(fieldKeys: Array<keyof SubmittedApplicationData>) {
  return {
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
        enum: fieldKeys
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
  };
}

function geminiExtractionSchemaFor(fieldKeys: Array<keyof SubmittedApplicationData>) {
  const fieldSchema = extractionFieldSchema(fieldKeys);
  return {
    type: "object",
    properties: {
      fields: {
        type: "array",
        items: {
          ...fieldSchema,
          additionalProperties: undefined,
          properties: {
            ...fieldSchema.properties,
            confidence: {
              type: "number"
            }
          }
        }
      }
    },
    required: ["fields"]
  };
}

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

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

type ExtractionBenchmarkInput = {
  application?: ApplicationRecord;
  application_id?: string;
  application_number?: string;
  submitted_data?: SubmittedApplicationData;
  images?: BenchmarkImageInput[];
  ocr_blocks?: OcrTextBlockRecord[];
  ocrBlocks?: OcrTextBlockRecord[];
};

type BenchmarkImageInput = Partial<ApplicationImageRecord> & {
  base64?: string;
  image_base64?: string;
  media_type?: string;
};

type BenchmarkImageRecord = ApplicationImageRecord & {
  base64?: string;
  media_type?: string;
};

type ExtractionBenchmarkResult = {
  name: string;
  durationMs: number;
  result: FieldExtractionResult;
};

const benchmarkArgIndex = process.argv.indexOf("--benchmark-extraction");
const entrypoint = benchmarkArgIndex === -1 ? main() : runExtractionBenchmark(process.argv[benchmarkArgIndex + 1]);

entrypoint.catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
