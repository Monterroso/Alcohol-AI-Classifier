import { createEmptyDatabase } from "./empty-database";
import type { ApplicationDatabase } from "./types";

let database = createEmptyDatabase();

export function readServerDatabase() {
  return database;
}

export function writeServerDatabase(nextDatabase: ApplicationDatabase) {
  database = nextDatabase;
}

export function resetServerDatabase() {
  database = createEmptyDatabase();
  return database;
}
