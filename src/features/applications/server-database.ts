import { createMockDatabase } from "./mock-data";
import type { ApplicationDatabase } from "./types";

let database = createMockDatabase();

export function readServerDatabase() {
  return database;
}

export function writeServerDatabase(nextDatabase: ApplicationDatabase) {
  database = nextDatabase;
}

export function resetServerDatabase() {
  database = createMockDatabase();
  return database;
}
