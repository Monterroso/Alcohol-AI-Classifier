"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";

const tableNames = [
  "applications",
  "application_images",
  "ocr_text_blocks",
  "extracted_fields",
  "extracted_field_evidence",
  "validation_results"
] as const;

export function subscribeToApplicationTables(onChange: () => void): () => void {
  const channels: RealtimeChannel[] = tableNames.map((tableName) =>
    supabase
      .channel(`application-db-${tableName}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: tableName
        },
        onChange
      )
      .subscribe()
  );

  return () => {
    channels.forEach((channel) => {
      void supabase.removeChannel(channel);
    });
  };
}
