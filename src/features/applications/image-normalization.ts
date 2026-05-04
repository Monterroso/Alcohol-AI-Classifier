import { fileTypeFromBuffer } from "file-type";
import sharp, { type SharpOptions } from "sharp";

export type NormalizedImageFormat = "jpeg" | "png";

export type NormalizedApplicationImage = {
  bytes: Buffer;
  fileName: string;
  mimeType: "image/jpeg" | "image/png";
  widthPx: number;
  heightPx: number;
};

const supportedDetectedMimeTypes = new Set([
  "image/avif",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp"
]);
const supportedImageDescription = "AVIF, GIF, HEIC/HEIF, JPEG, PNG, TIFF, WebP, or SVG";

export async function normalizeApplicationImage(input: {
  bytes: Blob | ArrayBuffer | Uint8Array | Buffer | string;
  fileName: string;
  declaredMimeType?: string;
  outputFormat?: NormalizedImageFormat;
}): Promise<NormalizedApplicationImage> {
  const source = await toBuffer(input.bytes);
  const declaredMimeType = input.declaredMimeType?.toLowerCase() ?? "";
  const detectedType = await fileTypeFromBuffer(source);
  const isSvg = isSvgInput(source, input.fileName, declaredMimeType);

  const fileName = input.fileName || "Uploaded file";

  if (!isSvg && (!detectedType || !supportedDetectedMimeTypes.has(detectedType.mime))) {
    throw new Error(`${fileName} is not a supported image file. Please upload ${supportedImageDescription}.`);
  }

  const outputFormat = input.outputFormat ?? "jpeg";
  const sharpOptions: SharpOptions = isSvg ? { density: 180, failOn: "none" } : { failOn: "none" };
  const pipeline = sharp(source, sharpOptions).rotate();
  const normalized = await tryNormalizeImage(fileName, pipeline, outputFormat);

  const widthPx = normalized.info.width;
  const heightPx = normalized.info.height;

  if (!widthPx || !heightPx) {
    throw new Error(`${fileName} could not be decoded as an image.`);
  }

  return {
    bytes: normalized.data,
    fileName: withImageExtension(input.fileName || "label-image", outputFormat),
    mimeType: outputFormat === "png" ? "image/png" : "image/jpeg",
    widthPx,
    heightPx
  };
}

async function tryNormalizeImage(fileName: string, pipeline: sharp.Sharp, outputFormat: NormalizedImageFormat) {
  try {
    return outputFormat === "png"
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
      : await pipeline
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 92, mozjpeg: true })
          .toBuffer({ resolveWithObject: true });
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    throw new Error(`${fileName} could not be decoded as an image. The file may be corrupt or incomplete.${detail}`);
  }
}

async function toBuffer(bytes: Blob | ArrayBuffer | Uint8Array | Buffer | string) {
  if (typeof bytes === "string") {
    return Buffer.from(bytes, "utf8");
  }
  if (Buffer.isBuffer(bytes)) {
    return bytes;
  }
  if (bytes instanceof ArrayBuffer) {
    return Buffer.from(bytes);
  }
  if (bytes instanceof Uint8Array) {
    return Buffer.from(bytes);
  }
  return Buffer.from(await bytes.arrayBuffer());
}

function isSvgInput(source: Buffer, fileName: string, declaredMimeType: string) {
  if (declaredMimeType === "image/svg+xml" || fileName.toLowerCase().endsWith(".svg")) {
    return true;
  }

  const prefix = source.subarray(0, 4096).toString("utf8").trimStart();
  return prefix.startsWith("<svg") || prefix.startsWith("<?xml") && prefix.includes("<svg");
}

function withImageExtension(fileName: string, format: NormalizedImageFormat) {
  const extension = format === "png" ? "png" : "jpg";
  const baseName = fileName.replace(/\.[a-zA-Z0-9]+$/, "") || "label-image";
  return `${baseName}.${extension}`;
}
