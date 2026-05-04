"use client";

import type { LabelType, SubmittedApplicationData } from "./types";

export type DemoImageDraft = {
  id: string;
  file: File;
  label_type: LabelType;
  preview_url: string;
  original_filename: string;
  mime_type: string;
};

export type SingleDemoPreset = {
  id: string;
  name: string;
  description: string;
  submittedData: SubmittedApplicationData;
  images: DemoLabelImage[];
};

export type BatchDemoPreset = {
  id: string;
  name: string;
  description: string;
};

type DemoLabelImage = {
  fileName: string;
  labelType: LabelType;
  title: string;
  subtitle: string;
  details: string[];
  accent: string;
  background: string;
  variant?: "clean" | "fuzzy" | "hard-read" | "mismatch" | "warning" | "detail";
};

type BatchDemoRow = {
  submittedData: SubmittedApplicationData;
  images: DemoLabelImage[];
};

type BatchDemoPresetDefinition = BatchDemoPreset & {
  rows: BatchDemoRow[];
};

const standardWarning =
  "GOVERNMENT WARNING: According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects.";

export const singleDemoPresets: SingleDemoPreset[] = [
  {
    id: "exact-bourbon",
    name: "Exact match bourbon",
    description: "All submitted fields appear cleanly on a front and back label.",
    submittedData: {
      applicant_name: "Old Tom Distillery LLC",
      application_type: "Distilled spirits label",
      brand_name: "OLD TOM DISTILLERY",
      product_name: "Kentucky Straight Bourbon Whiskey",
      alcohol_content: "45% Alc./Vol. (90 Proof)",
      net_contents: "750 mL",
      origin: "Frankfort, Kentucky",
      government_warning: "Government warning present"
    },
    images: [
      label("old-tom-front.png", "front", "OLD TOM DISTILLERY", "Kentucky Straight Bourbon Whiskey", [
        "45% Alc./Vol. (90 Proof)",
        "750 mL",
        "Frankfort, Kentucky"
      ], "#9f5f20", "#fbf5e8"),
      label("old-tom-back-warning.png", "government_warning", "OLD TOM DISTILLERY", "Back Label", [
        standardWarning,
        "Bottled by Old Tom Distillery LLC, Frankfort, KY"
      ], "#355d4c", "#f2f7f3", "warning")
    ]
  },
  {
    id: "fuzzy-brand",
    name: "Fuzzy brand match",
    description: "Application uses title case while the label uses all caps and punctuation.",
    submittedData: {
      applicant_name: "Stone's Throw Cellars",
      application_type: "Wine label",
      brand_name: "Stone's Throw",
      product_name: "Dry Riesling",
      alcohol_content: "12.8% ABV",
      net_contents: "750 mL",
      origin: "Finger Lakes, New York",
      government_warning: "Government warning present"
    },
    images: [
      label("stones-throw-front.png", "front", "STONE'S THROW", "Dry Riesling", [
        "12.8% ABV",
        "750 mL",
        "Finger Lakes, New York"
      ], "#2867a0", "#eef6ff", "fuzzy"),
      label("stones-throw-back.png", "back", "STONE'S THROW", "Estate Bottled Wine", [
        standardWarning,
        "Produced and bottled in Finger Lakes, NY"
      ], "#48623f", "#f3f7ed", "warning")
    ]
  },
  {
    id: "hard-to-read",
    name: "Hard-to-read photo",
    description: "Glare, angle, and blur make ABV and origin evidence lower confidence.",
    submittedData: {
      applicant_name: "Fogline Imports",
      application_type: "Wine label",
      brand_name: "Fogline",
      product_name: "Pinot Gris",
      alcohol_content: "13.5% ABV",
      net_contents: "750 mL",
      origin: "Willamette Valley, Oregon",
      government_warning: "Government warning present"
    },
    images: [
      label("fogline-glare-front.png", "front", "FOGLINE", "Pinot Gris", [
        "13.5% ABV",
        "750 mL",
        "Willamette Valley, Oregon"
      ], "#7b5aa6", "#f5f3ff", "hard-read")
    ]
  },
  {
    id: "mismatch",
    name: "Application mismatch",
    description: "The label evidence conflicts with the submitted brand and alcohol content.",
    submittedData: {
      applicant_name: "Blue Mesa Brewing Co.",
      application_type: "Malt beverage label",
      brand_name: "Blue Mesa",
      product_name: "Desert Lager",
      alcohol_content: "5.2% ABV",
      net_contents: "12 FL OZ",
      origin: "Austin, Texas",
      government_warning: "Government warning present"
    },
    images: [
      label("mesa-azul-front.png", "front", "MESA AZUL", "Desert Lager", [
        "6.1% ABV",
        "12 FL OZ",
        "Santa Fe, New Mexico"
      ], "#c96b32", "#fff4e8", "mismatch")
    ]
  },
  {
    id: "multi-image-label",
    name: "Multiple images per label",
    description: "Front, neck, and two back-label photos cover different required fields.",
    submittedData: {
      applicant_name: "Northline Spirits LLC",
      application_type: "Distilled spirits label",
      brand_name: "Northline",
      product_name: "Reserve Bourbon",
      alcohol_content: "40% ALC/VOL",
      net_contents: "750 mL",
      origin: "Louisville, Kentucky",
      government_warning: "Government warning present"
    },
    images: [
      label("northline-front.png", "front", "NORTHLINE", "Reserve Bourbon", [
        "40% ALC/VOL",
        "750 mL"
      ], "#17413d", "#eef4f2"),
      label("northline-neck.png", "neck", "NORTHLINE", "Small Batch", ["Batch NL-27"], "#5f4a2f", "#f7f0df", "detail"),
      label("northline-back-1.png", "back", "NORTHLINE", "Back Label", [
        "Louisville, Kentucky",
        "Bottled by Northline Spirits LLC"
      ], "#56606b", "#f4f5f7", "detail"),
      label("northline-back-2-warning.png", "government_warning", "NORTHLINE", "Government Warning", [
        standardWarning
      ], "#355d4c", "#f2f7f3", "warning")
    ]
  }
];

const extraBatchDemoRows: Record<string, BatchDemoRow> = {
  crownHarbor: {
    submittedData: {
      applicant_name: "Crown Harbor Imports",
      application_type: "Distilled spirits label",
      brand_name: "Crown Harbor Gin",
      product_name: "London Dry Gin",
      alcohol_content: "43% Alc./Vol.",
      net_contents: "750 mL",
      origin: "United Kingdom",
      government_warning: "Government warning present"
    },
    images: [
      label("crown-harbor-front.png", "front", "CROWN HARBOR", "London Dry Gin", [
        "43% Alc./Vol.",
        "750 mL",
        "Imported from Scotland"
      ], "#245a73", "#eff8fb", "mismatch")
    ]
  },
  sunbreak: {
    submittedData: {
      applicant_name: "Sunbreak Fermentation",
      application_type: "Malt beverage label",
      brand_name: "Sunbreak",
      product_name: "Hazy IPA",
      alcohol_content: "6.4% ABV",
      net_contents: "16 FL OZ",
      origin: "San Diego, California",
      government_warning: "Government warning present"
    },
    images: [
      label("sunbreak-front-hero.png", "front", "SUNBREAK", "Hazy IPA", [
        "6.4% ABV",
        "16 FL OZ",
        "San Diego, California"
      ], "#d39f24", "#fff8dc"),
      label("sunbreak-front-can-side.png", "front", "SUNBREAK", "Can Side Panel", [
        "Hazy IPA",
        "Brewed and canned by Sunbreak Fermentation"
      ], "#3a7b63", "#eef8f2", "detail"),
      label("sunbreak-warning.png", "government_warning", "Sunbreak", "Government Warning", [
        "Government Warning: According to the Surgeon General, women should not drink alcoholic beverages during pregnancy."
      ], "#9b3b2f", "#fff1f0", "warning")
    ]
  }
};

const batchDemoPresetDefinitions: BatchDemoPresetDefinition[] = [
  {
    id: "balanced-batch",
    name: "Balanced batch",
    description: "A broad batch with clean, fuzzy, hard-to-read, mismatch, and multi-image examples.",
    rows: [
      singleDemoPresets[0],
      singleDemoPresets[1],
      singleDemoPresets[2],
      singleDemoPresets[3],
      extraBatchDemoRows.crownHarbor,
      extraBatchDemoRows.sunbreak
    ]
  },
  {
    id: "clean-review-batch",
    name: "Clean review batch",
    description: "Mostly clean applications for quickly filling the queue with likely approvals.",
    rows: [singleDemoPresets[0], singleDemoPresets[1], singleDemoPresets[4]]
  },
  {
    id: "issue-review-batch",
    name: "Issue review batch",
    description: "Applications with conflicts, missing evidence, or harder label photos.",
    rows: [singleDemoPresets[2], singleDemoPresets[3], extraBatchDemoRows.crownHarbor]
  },
  {
    id: "multi-image-batch",
    name: "Multi-image batch",
    description: "Applications that include multiple photos for one label or split evidence across labels.",
    rows: [singleDemoPresets[4], extraBatchDemoRows.sunbreak]
  }
];

export const batchDemoPresets: BatchDemoPreset[] = batchDemoPresetDefinitions.map(
  ({ id, name, description }) => ({ id, name, description })
);

export async function createSingleDemoDraft(preset: SingleDemoPreset) {
  return {
    submittedData: preset.submittedData,
    images: await Promise.all(preset.images.map(createDemoImageDraft))
  };
}

export async function createBatchDemoFiles(preset: BatchDemoPreset = batchDemoPresets[0]) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const selectedPreset =
    batchDemoPresetDefinitions.find((definition) => definition.id === preset.id) ?? batchDemoPresetDefinitions[0];
  const rows = selectedPreset.rows;
  const csvRows: string[][] = [
    [
      "applicant_name",
      "application_type",
      "brand_name",
      "product_name",
      "alcohol_content",
      "net_contents",
      "origin",
      "government_warning",
      "front_image_1",
      "front_image_2",
      "back_image_1",
      "neck_image_1",
      "government_warning_image_1"
    ]
  ];

  for (const row of rows) {
    const imageNamesByLabel = new Map<LabelType, string[]>();
    for (const image of row.images) {
      const draft = await createDemoImageDraft(image);
      zip.file(draft.original_filename, draft.file);
      imageNamesByLabel.set(image.labelType, [
        ...(imageNamesByLabel.get(image.labelType) ?? []),
        draft.original_filename
      ]);
    }

    csvRows.push([
      row.submittedData.applicant_name,
      row.submittedData.application_type,
      row.submittedData.brand_name,
      row.submittedData.product_name,
      row.submittedData.alcohol_content,
      row.submittedData.net_contents,
      row.submittedData.origin,
      row.submittedData.government_warning,
      imageNamesByLabel.get("front")?.[0] ?? "",
      imageNamesByLabel.get("front")?.[1] ?? "",
      imageNamesByLabel.get("back")?.[0] ?? "",
      imageNamesByLabel.get("neck")?.[0] ?? "",
      imageNamesByLabel.get("government_warning")?.[0] ?? ""
    ]);
  }

  const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const csvBlob = new Blob([csvRows.map(toCsvRow).join("\n")], { type: "text/csv" });

  return {
    zipFile: new File([zipBlob], `${selectedPreset.id}-images.zip`, { type: "application/zip" }),
    csvFile: new File([csvBlob], `${selectedPreset.id}-applications.csv`, { type: "text/csv" }),
    presetName: selectedPreset.name,
    applicationCount: rows.length,
    imageCount: rows.reduce((total, row) => total + row.images.length, 0)
  };
}

async function createDemoImageDraft(image: DemoLabelImage): Promise<DemoImageDraft> {
  const file = await svgToPngFile(renderLabelSvg(image), image.fileName);
  return {
    id: createDraftId("demo-image"),
    file,
    label_type: image.labelType,
    preview_url: URL.createObjectURL(file),
    original_filename: file.name,
    mime_type: file.type
  };
}

function createDraftId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function label(
  fileName: string,
  labelType: LabelType,
  title: string,
  subtitle: string,
  details: string[],
  accent: string,
  background: string,
  variant: DemoLabelImage["variant"] = "clean"
): DemoLabelImage {
  return { fileName, labelType, title, subtitle, details, accent, background, variant };
}

function renderLabelSvg(image: DemoLabelImage) {
  const rotation = image.variant === "hard-read" ? -5 : 0;
  const filter = image.variant === "hard-read" ? "filter=\"url(#blurred)\"" : "";
  const warningCase = image.variant === "warning";
  const detailLines = image.details.flatMap((detail) => wrapText(detail, 44));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
    <defs>
      <filter id="blurred"><feGaussianBlur stdDeviation="1.7"/></filter>
      <linearGradient id="paper" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="${image.background}"/>
        <stop offset="1" stop-color="#ffffff"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="900" fill="#dfe7e5"/>
    <g transform="translate(600 450) rotate(${rotation}) translate(-600 -450)">
      <rect x="170" y="85" width="860" height="730" rx="28" fill="url(#paper)" stroke="${image.accent}" stroke-width="16"/>
      <rect x="230" y="145" width="740" height="610" rx="14" fill="none" stroke="${image.accent}" stroke-width="3" opacity="0.38"/>
      <text x="600" y="280" text-anchor="middle" font-family="Georgia, serif" font-size="${fitTitleSize(image.title)}" font-weight="700" fill="${image.accent}" ${filter}>${escapeXml(image.title)}</text>
      <text x="600" y="365" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#1b2725" ${filter}>${escapeXml(image.subtitle)}</text>
      ${detailLines
        .map(
          (line, index) =>
            `<text x="600" y="${460 + index * 42}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${warningCase ? 28 : 34}" font-weight="${warningCase ? 700 : 600}" fill="#263331" ${filter}>${escapeXml(line)}</text>`
        )
        .join("")}
      <text x="600" y="720" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#62716e">AI-generated demo label artwork</text>
    </g>
    ${
      image.variant === "hard-read"
        ? `<path d="M230 170 C470 230 710 310 990 250 L930 450 C700 395 485 360 255 390 Z" fill="#ffffff" opacity="0.55"/>
           <rect x="120" y="80" width="960" height="790" fill="#1b2725" opacity="0.06"/>`
        : ""
    }
    ${
      image.variant === "mismatch"
        ? `<circle cx="1010" cy="170" r="58" fill="#fff" stroke="${image.accent}" stroke-width="8"/><text x="1010" y="182" text-anchor="middle" font-family="Arial" font-size="30" font-weight="800" fill="${image.accent}">VERIFY</text>`
        : ""
    }
  </svg>`;
}

function fitTitleSize(title: string) {
  if (title.length > 18) {
    return 48;
  }
  if (title.length > 13) {
    return 58;
  }
  return 72;
}

function wrapText(text: string, maxChars: number) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }

  if (line) {
    lines.push(line);
  }
  return lines;
}

function svgToPngFile(svg: string, fileName: string) {
  return new Promise<File>((resolve, reject) => {
    const image = new Image();
    const svgBlob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 900;
      const context = canvas.getContext("2d");

      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not create demo label canvas."));
        return;
      }

      context.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (!blob) {
          reject(new Error("Could not render demo label image."));
          return;
        }
        resolve(new File([blob], fileName, { type: "image/png" }));
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load demo label SVG."));
    };
    image.src = url;
  });
}

function toCsvRow(values: string[]) {
  return values.map((value) => `"${value.replace(/"/g, '""')}"`).join(",");
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
