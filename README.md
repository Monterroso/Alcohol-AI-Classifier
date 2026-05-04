# TTB Made Easy

TTB Made Easy is our solution for AI-assisted alcohol label verification. It is designed to help reviewers compare submitted application data against label images, surface likely compliance issues, and make final approval decisions with a faster, clearer workflow.

## Live Demo

[View the live demo](https://alcohol-ai-classifier.vercel.app/)

## Overview

The application is built as a collaborative review system. Users can upload single applications or batch submissions, label images are stored in Supabase, and a background worker processes pending applications with Azure Document Intelligence OCR plus deterministic or LLM-assisted field extraction. Reviewers see updates in real time as application status, OCR output, extracted fields, validation results, and final decisions change.

## Focus Areas

The highest-priority problems we focused on were:

1. **Dead-simple usability**
   The tool has to work for reviewers with very different levels of technical comfort. The interface emphasizes a clear queue, obvious upload actions, readable review results, and direct approve/reject controls.

2. **Reducing repetitive manual review**
   Reviewers currently spend significant time comparing application fields against label artwork. The app brings the application data, label images, OCR evidence, validation results, and reviewer decision flow into one workspace.

3. **Intelligent label interpretation**
   Label review is not always a rigid exact-match problem. The system uses OCR, fuzzy matching, confidence scores, and evidence highlights to flag likely matches, mismatches, missing fields, and ambiguous results while keeping the reviewer in control.

4. **Fast, asynchronous processing**
   The worker processes pending applications asynchronously, so reviewers can continue using the queue while OCR and validation results are generated. Deterministic extraction is optimized for speed, while hybrid/LLM extraction is available for harder cases.

5. **Team-scale review**
   Supabase Realtime keeps the queue and review screens synchronized across users, so multiple reviewers can see processing progress and final decisions without manually coordinating status changes.

## Key Features

- **Single application upload**
  Reviewers can enter application data, upload one or more label images, assign label types, and submit the application for processing.

- **Batch application upload**
  Reviewers can upload a CSV plus an image ZIP. The backend parses each CSV row, matches image filenames inside the ZIP, uploads images to storage, and creates pending applications for the worker to process.

- **Automatic demo data**
  The upload screen includes generated single-application and batch demo presets, making it easy to show the workflow without manually preparing files.

- **Background processing worker**
  The worker claims pending applications, runs OCR through Azure Document Intelligence, extracts fields, stores evidence, runs validations, and marks applications as processed or failed.

- **OCR evidence and field highlighting**
  Reviewers can inspect extracted fields, see confidence scores, and jump directly to highlighted OCR evidence on the original label image.

- **Automatic traceability**
  Label images remain visible and accessible during review. When a reviewer selects a field, the app highlights the supporting label evidence so the reviewer can see where the confidence score came from and make their own determination when needed.

- **Validation results**
  The app validates required fields, compares extracted values against submitted data, checks alcohol-content and net-contents formats, and requires an exact match for the canonical government warning text.

- **Human-in-the-loop decisions**
  The system provides recommendations and evidence, but the reviewer makes the final decision. Applications can be approved, rejected, or marked as needing changes.

- **Real-time collaboration**
  Application tables are subscribed through Supabase Realtime, so queue updates, OCR output, validation results, and review decisions propagate automatically.

## Local Setup

1. Install dependencies.

   ```bash
   npm install
   ```

2. Copy the example environment file.

   ```bash
   cp .env.local.example .env.local
   ```

3. Fill in the required environment variables in `.env.local`.

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   SUPABASE_DB_URL=

   AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=
   AZURE_DOCUMENT_INTELLIGENCE_KEY=
   AZURE_DOCUMENT_INTELLIGENCE_MODEL=prebuilt-read
   AZURE_DOCUMENT_INTELLIGENCE_API_VERSION=2024-11-30

   EXTRACTION_MODE=deterministic
   EXTRACTION_PROVIDER=gemini
   ```

   Optional LLM-assisted extraction can be enabled with OpenAI or Gemini:

   ```bash
   OPENAI_API_KEY=
   OPENAI_MODEL=gpt-5-mini

   GEMINI_API_KEY=
   GEMINI_MODEL=gemini-2.5-flash
   GEMINI_VISION_MODEL=gemini-2.5-flash
   ```

4. Create or verify Supabase tables.

   ```bash
   npm run db:setup
   ```

5. Optionally reset and load seed data.

   ```bash
   npm run db:setup:reset
   ```

6. Start the Next.js app.

   ```bash
   npm run dev
   ```

7. In a separate terminal, start the worker.

   ```bash
   npm run worker
   ```

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the local Next.js development server. |
| `npm run build` | Build the production Next.js app. |
| `npm run start` | Start the built production app. |
| `npm run typecheck` | Run TypeScript type checking. |
| `npm run db:setup` | Create or verify Supabase tables from `supabase/schema.sql`. |
| `npm run db:setup:reset` | Recreate/verify tables and reset seed application data. |
| `npm run storage:cleanup-orphaned-images` | Remove Supabase storage images that no longer belong to an application. |
| `npm run worker` | Start the background document-processing worker. |
| `npm run worker:once` | Run the worker once, then exit. |
| `npm run benchmark:extraction` | Benchmark deterministic, hybrid, OpenAI, and Gemini extraction paths against a JSON input. |

## Stack

- **Next.js and React** for the application UI, routing, upload flows, review workspace, and API routes.
- **Supabase** for Postgres storage, image storage, service-role server operations, and real-time review updates.
- **Azure Document Intelligence** for OCR over uploaded label images.
- **Deterministic extraction** for fast fuzzy matching and format checks.
- **Gemini or OpenAI** as optional extraction providers for ambiguous or incomplete OCR cases.
- **Zustand** for client-side review state and UI coordination.
- **Sharp** for normalizing uploaded images before storage and OCR.

## Tradeoffs and Limitations

This project is a proof of concept built under time constraints, so we prioritized a clear end-to-end workflow over a full production compliance engine.

- The app supports batch intake, but the worker processes applications according to configured batch and concurrency settings to avoid provider rate-limit issues during the prototype.
- Deterministic extraction can run quickly, but LLM-assisted review may take longer depending on provider latency and OCR complexity.
- The validation engine intentionally simplifies the review flow around core fields, format checks, and exact canonical government warning text. It is not a complete automated government compliance engine.
- The validation engine does not yet encode every TTB rule variation by beverage type, label placement, product category, or exception path.
- We did not build a full automated accuracy test suite or statistical benchmark dataset in this prototype.
- Production deployment would need deeper security, retention, audit logging, access control, and compliance hardening.
- The prototype database is not fully locked down with production-grade row-level security. For a production deployment, Supabase RLS policies would be added so users can only access the applications and review data they are authorized to see. Because this prototype does not use classified or sensitive production data, we prioritized the end-to-end review workflow over a full access-control model.
- The worker currently polls the database every second for pending applications. This keeps the prototype simple and reliable, but a production system would move to an event-driven architecture so new submissions trigger processing without constant polling.
- Real-time updates are implemented through Supabase subscriptions. If a client misses an update, refreshing the page reloads the current database state.

## Project Structure

```text
.
|-- package.json
|-- supabase/
|   `-- schema.sql
|-- scripts/
|   |-- setup-supabase-db.ts
|   `-- cleanup-orphaned-application-images.ts
|-- worker/
|   `-- processor.ts
`-- src/
    |-- app/
    |   |-- api/
    |   |   |-- admin/reset-seed/route.ts
    |   |   `-- applications/
    |   |       |-- route.ts
    |   |       |-- batch/route.ts
    |   |       |-- batch-decision/route.ts
    |   |       |-- process-next/route.ts
    |   |       `-- [applicationId]/review/route.ts
    |   |-- applications/
    |   |   |-- page.tsx
    |   |   |-- upload/page.tsx
    |   |   `-- [applicationId]/review/page.tsx
    |   |-- globals.css
    |   |-- layout.tsx
    |   `-- page.tsx
    |-- components/
    |   |-- AppNav.tsx
    |   |-- ApplicationDataBridge.tsx
    |   |-- ApplicationQueue.tsx
    |   |-- ApplicationUpload.tsx
    |   |-- DecisionModal.tsx
    |   |-- ReviewWorkspace.tsx
    |   `-- ToastProvider.tsx
    |-- features/applications/
    |   |-- api-client.ts
    |   |-- demo-data.ts
    |   |-- image-normalization.ts
    |   |-- selectors.ts
    |   |-- server-decisions.ts
    |   |-- server-delete.ts
    |   |-- server-read.ts
    |   |-- server-repository.ts
    |   |-- server-seed.ts
    |   |-- server-upload.ts
    |   |-- store.ts
    |   |-- supabase-database.ts
    |   `-- types.ts
    `-- lib/supabase/
        |-- client.ts
        `-- server.ts
```

## How This Meets the Evaluation Criteria

- **Correctness and completeness:** Implements upload, queue, OCR processing, extracted-field review, validation, evidence display, and final decisions.
- **Code quality and organization:** Separates UI components, application feature logic, Supabase access, schema setup, and worker processing.
- **Appropriate technical choices:** Uses managed OCR, Supabase Realtime, and a standalone worker to match the prototype scope without requiring COLA integration.
- **User experience:** Keeps the review workflow focused on queue triage, evidence inspection, and final reviewer action.
- **Error handling:** Upload, batch parsing, worker processing, OCR failures, and decision updates return visible failure states or stored processing errors.
- **Attention to requirements:** Prioritizes speed, simple usability, batch intake, government warning checks, fuzzy matching, and human reviewer judgment.
- **Creative problem-solving:** Includes generated demo data, evidence highlighting, hybrid extraction options, and real-time collaborative review updates.
