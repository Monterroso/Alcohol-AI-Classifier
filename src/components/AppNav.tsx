"use client";

import Link from "next/link";
import { Database, FileUp, ListChecks, RotateCcw } from "lucide-react";

import { useApplicationStore } from "@/features/applications/store";

export function AppNav() {
  const resetSeedData = useApplicationStore((state) => state.resetSeedData);

  return (
    <nav className="app-nav" aria-label="Primary navigation">
      <Link href="/applications" className="nav-brand">
        <Database aria-hidden="true" size={18} />
        Label Review
      </Link>
      <div className="nav-links">
        <Link href="/applications/upload">
          <FileUp aria-hidden="true" size={17} />
          Upload
        </Link>
        <Link href="/applications">
          <ListChecks aria-hidden="true" size={17} />
          Queue
        </Link>
        <button className="nav-button" onClick={resetSeedData}>
          <RotateCcw aria-hidden="true" size={17} />
          Reset seed
        </button>
      </div>
    </nav>
  );
}
