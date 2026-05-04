import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

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

  if (!isSvg && (!detectedType || !supportedDetectedMimeTypes.has(detectedType.mime))) {
    throw new Error(`${input.fileName || "Uploaded file"} is not a supported image file.`);
  }

  const outputFormat = input.outputFormat ?? "jpeg";
  const pipeline = sharp(source, isSvg ? { density: 180 } : undefined).rotate();
  const normalized =
    outputFormat === "png"
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
      : await pipeline
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 92, mozjpeg: true })
          .toBuffer({ resolveWithObject: true });

  const widthPx = normalized.info.width;
  const heightPx = normalized.info.height;

  if (!widthPx || !heightPx) {
    throw new Error(`${input.fileName || "Uploaded file"} could not be decoded as an image.`);
  }

  return {
    bytes: normalized.data,
    fileName: withImageExtension(input.fileName || "label-image", outputFormat),
    mimeType: outputFormat === "png" ? "image/png" : "image/jpeg",
    widthPx,
    heightPx
  };
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
