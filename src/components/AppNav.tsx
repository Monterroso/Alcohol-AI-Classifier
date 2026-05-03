"use client";

import Link from "next/link";
import { Database, FileUp, ListChecks, ScanLine } from "lucide-react";

import { useApplicationStore } from "@/features/applications/store";

export function AppNav() {
  const runProcessingCycle = useApplicationStore((state) => state.runProcessingCycle);

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
        <button className="nav-button" onClick={runProcessingCycle}>
          <ScanLine aria-hidden="true" size={17} />
          Process next
        </button>
      </div>
    </nav>
  );
}
