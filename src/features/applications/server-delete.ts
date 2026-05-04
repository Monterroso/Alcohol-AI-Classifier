import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const imageBucketName = "application-images";
const storageRemoveBatchSize = 100;

export async function deleteApplications(applicationIds: string[]) {
  if (applicationIds.length === 0) {
    return { deletedCount: 0, removedImageCount: 0 };
  }

  const supabase = createServerSupabaseClient();
  const uniqueApplicationIds = Array.from(new Set(applicationIds));
  const storagePaths = await loadStoragePathsForApplications(supabase, uniqueApplicationIds);

  await removeImageObjects(supabase, storagePaths);

  const { error } = await supabase.from("applications").delete().in("id", uniqueApplicationIds);
  if (error) {
    throw new Error(error.message);
  }

  return {
    deletedCount: uniqueApplicationIds.length,
    removedImageCount: storagePaths.length
  };
}

export async function deleteAllApplications(supabase = createServerSupabaseClient()) {
  const storagePaths = await loadAllStoragePaths(supabase);

  await removeImageObjects(supabase, storagePaths);

  const { error } = await supabase.from("applications").delete().not("id", "is", null);
  if (error) {
    throw new Error(`Failed to clear applications: ${error.message}`);
  }

  return {
    deletedApplicationRows: true,
    removedImageCount: storagePaths.length
  };
}

export async function removeImageObjects(supabase: SupabaseClient, storagePaths: string[]) {
  const uniquePaths = Array.from(new Set(storagePaths.filter(Boolean)));

  for (let index = 0; index < uniquePaths.length; index += storageRemoveBatchSize) {
    const batch = uniquePaths.slice(index, index + storageRemoveBatchSize);
    const { error } = await supabase.storage.from(imageBucketName).remove(batch);
    if (error) {
      throw new Error(`Failed to remove application images: ${error.message}`);
    }
  }
}

async function loadStoragePathsForApplications(supabase: SupabaseClient, applicationIds: string[]) {
  const { data, error } = await supabase
    .from("application_images")
    .select("storage_path")
    .in("application_id", applicationIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => row.storage_path).filter((path): path is string => Boolean(path));
}

async function loadAllStoragePaths(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("application_images").select("storage_path");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => row.storage_path).filter((path): path is string => Boolean(path));
}
