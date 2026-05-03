import type { ApplicationDatabase } from "./types";

export function createEmptyDatabase(): ApplicationDatabase {
  return {
    applications: [],
    application_images: [],
    ocr_text_blocks: [],
    extracted_fields: [],
    extracted_field_evidence: [],
    validation_results: []
  };
}
