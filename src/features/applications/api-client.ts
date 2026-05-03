"use client";

import type { ApplicationDatabase, Decision, LabelType, SubmittedApplicationData } from "./types";

export async function fetchApplicationDatabase() {
  const payload = await requestJson<{ database: ApplicationDatabase }>("/api/applications");
  return payload.database;
}

export async function submitSingleApplication(input: {
  submittedData: SubmittedApplicationData;
  images: Array<{
    file: File;
    labelType: LabelType;
  }>;
}) {
  const body = new FormData();
  body.set("submitted_data", JSON.stringify(input.submittedData));
  body.set("image_labels", JSON.stringify(input.images.map((image) => ({ label_type: image.labelType }))));

  for (const image of input.images) {
    body.append("images", image.file);
  }

  return requestJson("/api/applications", {
    method: "POST",
    body
  });
}

export async function submitBatchApplication(input: { zipFile: File; csvFile: File }) {
  const body = new FormData();
  body.set("zip", input.zipFile);
  body.set("csv", input.csvFile);

  return requestJson("/api/applications/batch", {
    method: "POST",
    body
  });
}

export async function submitApplicationDecision(applicationIds: string[], decision: Decision, notes: string) {
  return requestJson("/api/applications/batch-decision", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ applicationIds, decision, notes })
  });
}

export async function resetApplicationSeedData() {
  return requestJson("/api/admin/reset-seed", {
    method: "POST"
  });
}

async function requestJson<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload = (await response.json().catch(() => null)) as ({ error?: string } & T) | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed with ${response.status}.`);
  }

  return payload as T;
}
