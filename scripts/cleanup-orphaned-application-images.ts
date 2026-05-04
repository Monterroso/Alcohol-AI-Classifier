import { loadEnvConfig } from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const rootDir = process.cwd();
const imageBucketName = "application-images";
const pageSize = 1000;
const removeBatchSize = 100;
const shouldDelete = process.argv.includes("--delete");

type StorageListItem = {
  name: string;
  id?: string | null;
  metadata?: unknown | null;
};

type AppSupabaseClient = SupabaseClient<any, "public", "public", any, any>;

async function main() {
  loadEnvConfig(rootDir);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to clean storage.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const referencedPaths = await loadReferencedStoragePaths(supabase);
  const storagePaths = await listStoragePaths(supabase);
  const orphanedPaths = storagePaths.filter((path) => !referencedPaths.has(path));

  console.log(`Referenced image rows: ${referencedPaths.size}`);
  console.log(`Storage objects found: ${storagePaths.length}`);
  console.log(`Orphaned storage objects: ${orphanedPaths.length}`);

  if (orphanedPaths.length > 0) {
    console.log("Sample orphaned paths:");
    for (const path of orphanedPaths.slice(0, 20)) {
      console.log(`- ${path}`);
    }
  }

  if (!shouldDelete) {
    console.log("Dry run only. Re-run with --delete to remove orphaned storage objects.");
    return;
  }

  for (let index = 0; index < orphanedPaths.length; index += removeBatchSize) {
    const batch = orphanedPaths.slice(index, index + removeBatchSize);
    const { error } = await supabase.storage.from(imageBucketName).remove(batch);
    if (error) {
      throw new Error(`Failed to remove orphaned images: ${error.message}`);
    }
  }

  console.log(`Removed ${orphanedPaths.length} orphaned storage object(s).`);
}

async function loadReferencedStoragePaths(supabase: AppSupabaseClient) {
  const paths = new Set<string>();

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("application_images")
      .select("storage_path")
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    for (const row of (data ?? []) as Array<{ storage_path: string | null }>) {
      if (typeof row.storage_path === "string" && row.storage_path.length > 0) {
        paths.add(row.storage_path);
      }
    }

    if (!data || data.length < pageSize) {
      break;
    }
  }

  return paths;
}

async function listStoragePaths(supabase: AppSupabaseClient, prefix = ""): Promise<string[]> {
  const paths: string[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage.from(imageBucketName).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: {
        column: "name",
        order: "asc"
      }
    });

    if (error) {
      throw new Error(error.message);
    }

    for (const item of (data ?? []) as StorageListItem[]) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (isStorageFolder(item)) {
        paths.push(...(await listStoragePaths(supabase, path)));
      } else {
        paths.push(path);
      }
    }

    if (!data || data.length < pageSize) {
      break;
    }
  }

  return paths;
}

function isStorageFolder(item: StorageListItem) {
  return item.id === null || item.metadata === null;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
