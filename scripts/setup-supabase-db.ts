import { readFileSync } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { Client } from "pg";
import { resetSeedData } from "../src/features/applications/server-seed";

const rootDir = process.cwd();
const shouldResetData = process.argv.includes("--reset-data") || process.argv.includes("--seed");

function readSql(relativePath: string) {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

async function main() {
  loadEnvConfig(rootDir);

  const databaseUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!databaseUrl) {
    throw new Error(
      [
        "A direct Postgres connection string is required to create Supabase tables.",
        "Add SUPABASE_DB_URL to .env.local, or use DATABASE_URL/POSTGRES_URL.",
        "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY cannot run create table SQL."
      ].join("\n")
    );
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  try {
    await client.query(readSql("supabase/schema.sql"));
    console.log("Created or verified Supabase tables.");

    if (shouldResetData) {
      const result = await resetSeedData();
      console.log(
        `Reset application data (${result.applicationCount} applications, ${result.imageCount} images).`
      );
    }
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
