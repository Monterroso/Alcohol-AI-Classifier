import JSZip from "jszip";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import { emptySubmittedData } from "./types";
import { normalizeApplicationImage } from "./image-normalization";
import type { ApplicationImageRecord, LabelType, SubmittedApplicationData } from "./types";

const imageBucketName = "application-images";
const labelTypes: LabelType[] = ["front", "back", "neck", "brand", "government_warning", "other"];

export async function createSingleApplication(input: {
  submittedData: SubmittedApplicationData;
  images: Array<{
    file: File;
    labelType: LabelType;
  }>;
}) {
  if (input.images.length === 0) {
    throw new Error("At least one label image is required.");
  }

  return insertApplicationWithImages({
    submittedData: input.submittedData,
    images: input.images.map((image) => ({
      bytes: image.file,
      fileName: image.file.name,
      mimeType: image.file.type || "application/octet-stream",
      labelType: image.labelType
    }))
  });
}

export async function createBatchApplications(input: { zipFile: File; csvFile: File }) {
  const csvText = await input.csvFile.text();
  const rows = parseCsv(csvText);
  const zip = await JSZip.loadAsync(await input.zipFile.arrayBuffer());
  const createdApplicationIds: string[] = [];

  for (const row of rows) {
    const imageRefs = collectImageReferences(row);
    if (imageRefs.length === 0) {
      throw new Error(`Batch row for ${row.product_name || row.brand_name || "unknown product"} has no image references.`);
    }

    const images = [];
    for (const ref of imageRefs) {
      const zipEntry = findZipEntry(zip, ref.path);
      if (!zipEntry) {
        throw new Error(`Image "${ref.path}" was listed in the CSV but not found in the ZIP.`);
      }

      images.push({
        bytes: new Blob([await zipEntry.async("arraybuffer")], { type: mimeTypeForName(ref.path) }),
        fileName: basename(ref.path),
        mimeType: mimeTypeForName(ref.path),
        labelType: ref.labelType
      });
    }

    const result = await insertApplicationWithImages({
      submittedData: submittedDataFromRow(row),
      images
    });
    createdApplicationIds.push(result.applicationId);
  }

  return { applicationIds: createdApplicationIds };
}

async function insertApplicationWithImages(input: {
  submittedData: SubmittedApplicationData;
  images: Array<{
    bytes: Blob;
    fileName: string;
    mimeType: string;
    labelType: LabelType;
  }>;
}) {
  const supabase = createServerSupabaseClient();

  const timestamp = new Date().toISOString();
  const applicationId = `app-${crypto.randomUUID()}`;
  const applicationNumber = `ALC-${new Date().getFullYear()}-${Date.now().toString().slice(-8)}`;
  const submittedData = { ...emptySubmittedData, ...input.submittedData };

  const normalizedImages = [];
  for (const [index, image] of input.images.entries()) {
    const normalizedImage = await normalizeApplicationImage({
      bytes: image.bytes,
      fileName: image.fileName || `label-${index + 1}.jpg`,
      declaredMimeType: image.mimeType,
      outputFormat: "jpeg"
    });
    normalizedImages.push({ source: image, normalized: normalizedImage });
  }

  await ensureImageBucket(supabase);

  const { error: applicationError } = await supabase.from("applications").insert({
    id: applicationId,
    application_number: applicationNumber,
    submitted_data: submittedData,
    processing_status: "pending",
    attempt_count: 0,
    review_status: "unreviewed",
    created_at: timestamp,
    updated_at: timestamp
  });

  if (applicationError) {
    throw new Error(applicationError.message);
  }

  const imageRows: Omit<ApplicationImageRecord, "id">[] = [];

  for (const { source: image, normalized: normalizedImage } of normalizedImages) {
    const storagePath = `${applicationId}/${crypto.randomUUID()}-${sanitizeFileName(normalizedImage.fileName)}`;
    const { error: uploadError } = await supabase.storage.from(imageBucketName).upload(storagePath, normalizedImage.bytes, {
      contentType: normalizedImage.mimeType,
      upsert: false
    });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const imageUrl = supabase.storage.from(imageBucketName).getPublicUrl(storagePath).data.publicUrl;
    imageRows.push({
      application_id: applicationId,
      image_url: imageUrl,
      storage_path: storagePath,
      label_type: image.labelType,
      original_filename: normalizedImage.fileName,
      mime_type: normalizedImage.mimeType,
      width_px: normalizedImage.widthPx,
      height_px: normalizedImage.heightPx,
      created_at: timestamp
    });
  }

  const rowsWithIds = imageRows.map((row) => ({ id: `img-${crypto.randomUUID()}`, ...row }));
  const { error: imageError } = await supabase.from("application_images").insert(rowsWithIds);
  if (imageError) {
    throw new Error(imageError.message);
  }

  return { applicationId };
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

function submittedDataFromRow(row: Record<string, string>): SubmittedApplicationData {
  return {
    brand_name: row.brand_name ?? "",
    product_name: row.product_name ?? "",
    alcohol_content: row.alcohol_content ?? "",
    net_contents: row.net_contents ?? "",
    origin: row.origin ?? "",
    government_warning: row.government_warning ?? "",
    applicant_name: row.applicant_name ?? "",
    application_type: row.application_type ?? ""
  };
}

function collectImageReferences(row: Record<string, string>) {
  const refs: Array<{ labelType: LabelType; path: string }> = [];

  for (const [column, value] of Object.entries(row)) {
    if (!value.trim()) {
      continue;
    }

    if (column === "images") {
      for (const item of value.split(";")) {
        const [label, path] = item.split(":").map((part) => part.trim());
        if (isLabelType(label) && path) {
          refs.push({ labelType: label, path });
        }
      }
      continue;
    }

    const labelType = labelTypes.find(
      (label) => (label !== "government_warning" && column === label) || column.startsWith(`${label}_image`)
    );
    if (labelType) {
      refs.push({ labelType, path: value.trim() });
    }
  }

  return refs;
}

function parseCsv(csvText: string) {
  const records = parseCsvRows(csvText).filter((row) => row.some((cell) => cell.trim().length > 0));
  const [headers, ...rows] = records;
  if (!headers || rows.length === 0) {
    return [];
  }

  return rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), row[index]?.trim() ?? ""]))
  );
}

function parseCsvRows(csvText: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function findZipEntry(zip: JSZip, path: string) {
  const normalizedPath = path.replace(/\\/g, "/");
  const exactMatch = zip.file(normalizedPath);
  if (exactMatch) {
    return exactMatch;
  }

  return (
    zip.filter((relativePath, file) =>
      !file.dir && basename(relativePath).toLowerCase() === basename(normalizedPath).toLowerCase()
    )[0] ?? null
  );
}

function basename(path: string) {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? path;
}

function mimeTypeForName(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "png") {
    return "image/png";
  }
  if (extension === "webp") {
    return "image/webp";
  }
  if (extension === "gif") {
    return "image/gif";
  }
  return "image/jpeg";
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

function isLabelType(value: string): value is LabelType {
  return labelTypes.includes(value as LabelType);
}
