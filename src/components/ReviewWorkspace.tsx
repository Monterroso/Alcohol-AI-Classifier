"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Eye,
  Loader2,
  Minimize2,
  RotateCw,
  XCircle,
  ZoomIn
} from "lucide-react";

import { getReviewAnalysis } from "@/features/applications/mock-repository";
import { useApplicationStore } from "@/features/applications/store";
import {
  fieldDefinitions,
  type ApplicationImageRecord,
  type EvidenceView,
  type OcrImageSummary,
  type ReviewFieldRow
} from "@/features/applications/types";

import { DecisionModal } from "./DecisionModal";

function confidenceClass(row: ReviewFieldRow) {
  if (typeof row.confidence !== "number") {
    return "confidence confidence-low";
  }
  if (row.confidence >= 90) {
    return "confidence confidence-high";
  }
  if (row.confidence >= 72) {
    return "confidence confidence-medium";
  }
  return "confidence confidence-low";
}

function extractionLabel(row: ReviewFieldRow) {
  switch (row.extraction_status) {
    case "found":
      return row.issues.length > 0 ? "Found with warning" : "Found";
    case "missing":
      return "Not found";
    case "ambiguous":
      return "Ambiguous";
    case "conflict":
      return "Potential mismatch";
  }
}

function formatOcrConfidence(confidence?: number) {
  if (typeof confidence !== "number") {
    return "No confidence";
  }
  return `${confidence}% confidence`;
}

export function ReviewWorkspace({ applicationId }: { applicationId: string }) {
  const database = useApplicationStore((state) => state.database);
  const activeFieldByApplicationId = useApplicationStore((state) => state.activeFieldByApplicationId);
  const evidenceIndexByApplicationId = useApplicationStore((state) => state.evidenceIndexByApplicationId);
  const helpFieldKey = useApplicationStore((state) => state.helpFieldKey);
  const zoomed = useApplicationStore((state) => state.zoomed);
  const rotation = useApplicationStore((state) => state.rotation);
  const reviewNotes = useApplicationStore((state) => state.reviewNotesByApplicationId[applicationId] ?? "");
  const submittedDecision = useApplicationStore(
    (state) => state.submittedDecisionByApplicationId[applicationId]
  );
  const setReviewNotes = useApplicationStore((state) => state.setReviewNotes);
  const setActiveField = useApplicationStore((state) => state.setActiveField);
  const setEvidenceIndex = useApplicationStore((state) => state.setEvidenceIndex);
  const setHelpFieldKey = useApplicationStore((state) => state.setHelpFieldKey);
  const setZoomed = useApplicationStore((state) => state.setZoomed);
  const rotateViewer = useApplicationStore((state) => state.rotateViewer);
  const openDecisionModal = useApplicationStore((state) => state.openDecisionModal);

  const analysis = getReviewAnalysis(database, applicationId);

  if (!analysis) {
    return (
      <main className="page-shell">
        <div className="inline-error">Review unavailable.</div>
        <Link className="secondary-link" href="/applications">
          Back to queue
        </Link>
      </main>
    );
  }

  const selectedFieldKey = activeFieldByApplicationId[applicationId];
  const selectedRow =
    analysis.review_rows.find((row) => row.field_key === selectedFieldKey) ??
    analysis.review_rows.find((row) => row.evidence.length > 0) ??
    analysis.review_rows[0] ??
    null;
  const evidenceCount = selectedRow?.evidence.length ?? 0;
  const requestedEvidenceIndex = evidenceIndexByApplicationId[applicationId] ?? 0;
  const activeEvidenceIndex = evidenceCount > 0 ? Math.min(requestedEvidenceIndex, evidenceCount - 1) : 0;
  const activeEvidence = selectedRow?.evidence[activeEvidenceIndex] ?? null;
  const activeImage =
    (activeEvidence
      ? analysis.images.find((image) => image.id === activeEvidence.image_id)
      : analysis.images[0]) ?? null;
  const helpDefinition = helpFieldKey
    ? fieldDefinitions.find((definition) => definition.key === helpFieldKey)
    : null;
  const isAwaitingProcessing = analysis.application.processing_status !== "processed";

  return (
    <main className="page-shell">
      <header className="page-header review-header">
        <div>
          <Link className="secondary-link" href="/applications">
            Back to queue
          </Link>
          <p className="eyebrow">Application Review</p>
          <h1>{analysis.application.submitted_data.product_name || "Untitled application"}</h1>
          <p>
            {analysis.status_message}{" "}
            {typeof analysis.average_confidence === "number"
              ? `${analysis.average_confidence}% average confidence.`
              : "Confidence will be available after processing."}
          </p>
        </div>
        <div className="header-meta">
          <span>{analysis.application.submitted_data.applicant_name}</span>
          <span>{analysis.application.submitted_data.application_type}</span>
          <span>{analysis.application.application_number}</span>
        </div>
      </header>

      {submittedDecision ? (
        <div className="success-strip">
          <CheckCircle2 aria-hidden="true" size={18} />
          Decision submitted: {submittedDecision === "approved" ? "Approved" : "Rejected"}
        </div>
      ) : null}

      {analysis.issues.length > 0 ? (
        <section className="issue-strip" aria-label="Review issues">
          {analysis.issues.slice(0, 3).map((issue) => (
            <div key={issue}>
              <AlertTriangle aria-hidden="true" size={18} />
              {issue}
            </div>
          ))}
        </section>
      ) : null}

      <OcrSummaryPanel summaries={analysis.ocr_summaries} />

      {isAwaitingProcessing ? (
        <section className="awaiting-panel">
          <Loader2 aria-hidden="true" size={24} className="spin-slow" />
          <div>
            <h2>Awaiting Processing Data</h2>
            <p>OCR extraction and rules analysis have not finished for this application.</p>
          </div>
        </section>
      ) : (
        <section className="review-grid">
          <LabelViewer
            activeImage={activeImage}
            activeEvidence={activeEvidence}
            selectedRow={selectedRow}
            evidenceIndex={activeEvidenceIndex}
            setEvidenceIndex={(index) => setEvidenceIndex(applicationId, index)}
            zoomed={zoomed}
            setZoomed={setZoomed}
            rotation={rotation}
            rotateViewer={rotateViewer}
          />

          <section className="review-list" aria-label="Review fields">
            <div className="section-heading">
              <h2>Review Fields</h2>
              <span>{analysis.review_rows.length} fields</span>
            </div>
            {analysis.review_rows.map((row) => (
              <article
                className={`review-row ${row.field_key === selectedRow?.field_key ? "selected" : ""} ${
                  row.issues.length > 0 || row.extraction_status !== "found" ? "needs-attention" : ""
                }`}
                key={row.field_key}
              >
                <div className="review-row-header">
                  <div>
                    <h3>{row.field_label}</h3>
                    <span>{extractionLabel(row)}</span>
                  </div>
                  <span className={confidenceClass(row)}>
                    {typeof row.confidence === "number" ? `${row.confidence}%` : "No OCR"}
                  </span>
                </div>
                <dl className="row-values">
                  <div>
                    <dt>Application</dt>
                    <dd>{row.submitted_value || "Not provided"}</dd>
                  </div>
                  <div>
                    <dt>AI found</dt>
                    <dd>{row.extracted_value || "Not found"}</dd>
                  </div>
                </dl>
                <p className="row-explanation">{row.explanation}</p>
                {row.issues.length > 0 ? (
                  <div className="row-message">
                    <AlertTriangle aria-hidden="true" size={16} />
                    {row.issues[0]}
                  </div>
                ) : null}
                {row.evidence.length > 1 ? (
                  <p className="multi-evidence-note">
                    Found on {row.evidence.length} images. Use Back / Next on the image panel.
                  </p>
                ) : null}
                <div className="row-actions">
                  <button
                    className="secondary-button compact"
                    disabled={row.evidence.length === 0}
                    onClick={() => setActiveField(applicationId, row.field_key)}
                  >
                    <Eye aria-hidden="true" size={17} />
                    Show on label
                  </button>
                  <button
                    className="icon-text-button"
                    onClick={() => setHelpFieldKey(row.field_key)}
                    aria-label={`Requirement help for ${row.field_label}`}
                  >
                    <CircleHelp aria-hidden="true" size={18} />
                    Requirement
                  </button>
                </div>
              </article>
            ))}
          </section>
        </section>
      )}

      <section className="bottom-review">
        <ReadOnlyNotes
          title="Specialist Notes"
          items={analysis.application.specialist_notes ? [analysis.application.specialist_notes] : []}
        />
        <ReadOnlyNotes
          title="Validation Notes"
          items={
            analysis.validation_results.length
              ? analysis.validation_results.map(
                  (result) =>
                    `${result.check_label}: ${result.result_status}${result.message ? ` - ${result.message}` : ""}`
                )
              : ["No validation output is available yet."]
          }
        />
        <ReadOnlyNotes
          title="Submitted Data"
          items={Object.entries(analysis.application.submitted_data).map(([key, value]) => `${key}: ${value}`)}
        />
        <section className="reviewer-notes-panel">
          <h2>Reviewer Notes</h2>
          <textarea
            value={reviewNotes}
            onChange={(event) => setReviewNotes(applicationId, event.target.value)}
            rows={6}
            placeholder="Add reviewer notes"
          />
        </section>
      </section>

      <section className="decision-bar" aria-label="Final decision">
        <div>
          <strong>Final Decision</strong>
          <span>The reviewer has final discretion.</span>
        </div>
        <div className="decision-actions">
          <button className="primary-button" onClick={() => openDecisionModal("single", [applicationId], "approved")}>
            <CheckCircle2 aria-hidden="true" size={18} />
            Approve Application
          </button>
          <button className="danger-button" onClick={() => openDecisionModal("single", [applicationId], "rejected")}>
            <XCircle aria-hidden="true" size={18} />
            Reject Application
          </button>
        </div>
      </section>

      {helpDefinition ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="requirement-title">
            <h2 id="requirement-title">Requirement: {helpDefinition.label}</h2>
            <p>{helpDefinition.requirement}</p>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setHelpFieldKey(null)}>
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <DecisionModal />
    </main>
  );
}

function OcrSummaryPanel({ summaries }: { summaries: OcrImageSummary[] }) {
  return (
    <section className="ocr-summary-panel" aria-label="OCR label results">
      <div className="section-heading">
        <h2>Label OCR Results</h2>
        <span>{summaries.length || "No"} labels</span>
      </div>
      {summaries.length > 0 ? (
        <div className="label-ocr-list">
          {summaries.map((summary) => (
            <article className={`label-ocr-card label-ocr-${summary.status}`} key={summary.image_id}>
              <strong>{summary.filename ?? summary.label_type}</strong>
              <span>{summary.status.replace("_", " ")}</span>
              <span>{formatOcrConfidence(summary.confidence)}</span>
              <span>{summary.extracted_block_count} text blocks</span>
              {summary.message ? <p>{summary.message}</p> : null}
            </article>
          ))}
        </div>
      ) : (
        <p>No label OCR output is available yet.</p>
      )}
    </section>
  );
}

function LabelViewer({
  activeImage,
  activeEvidence,
  selectedRow,
  evidenceIndex,
  setEvidenceIndex,
  zoomed,
  setZoomed,
  rotation,
  rotateViewer
}: {
  activeImage: ApplicationImageRecord | null;
  activeEvidence: EvidenceView | null;
  selectedRow: ReviewFieldRow | null;
  evidenceIndex: number;
  setEvidenceIndex: (index: number) => void;
  zoomed: boolean;
  setZoomed: (value: boolean) => void;
  rotation: number;
  rotateViewer: () => void;
}) {
  const evidenceCount = selectedRow?.evidence.length ?? 0;
  const canGoBack = evidenceIndex > 0;
  const canGoNext = evidenceIndex < evidenceCount - 1;

  return (
    <section className="label-viewer" aria-label="Label image viewer">
      <div className="section-heading">
        <div>
          <h2>{activeImage?.original_filename ?? "Label unavailable"}</h2>
          <span>
            {evidenceCount > 0 ? `Image ${evidenceIndex + 1} of ${evidenceCount}` : "No evidence"}
          </span>
        </div>
        <div className="viewer-tools">
          <button
            className="icon-button"
            onClick={() => setZoomed(!zoomed)}
            aria-label={zoomed ? "Fit to screen" : "Zoom in"}
            title={zoomed ? "Fit to screen" : "Zoom in"}
          >
            {zoomed ? <Minimize2 aria-hidden="true" size={18} /> : <ZoomIn aria-hidden="true" size={18} />}
          </button>
          <button className="icon-button" onClick={rotateViewer} aria-label="Rotate label" title="Rotate label">
            <RotateCw aria-hidden="true" size={18} />
          </button>
        </div>
      </div>

      <div className={`image-stage ${zoomed ? "zoomed" : ""}`}>
        {activeImage ? (
          <div className="image-frame" style={{ transform: `rotate(${rotation}deg)` }}>
            <img src={activeImage.image_url} alt={activeImage.original_filename ?? activeImage.label_type} />
            {activeEvidence ? (
              <div
                className="ocr-highlight"
                style={{
                  left: `${activeEvidence.bbox.x}%`,
                  top: `${activeEvidence.bbox.y}%`,
                  width: `${activeEvidence.bbox.width}%`,
                  height: `${activeEvidence.bbox.height}%`
                }}
              />
            ) : null}
          </div>
        ) : (
          <div className="missing-image">Image unavailable</div>
        )}
      </div>

      <div className="evidence-controls">
        <button className="secondary-button compact" disabled={!canGoBack} onClick={() => setEvidenceIndex(evidenceIndex - 1)}>
          <ChevronLeft aria-hidden="true" size={18} />
          Back
        </button>
        <button className="secondary-button compact" disabled={!canGoNext} onClick={() => setEvidenceIndex(evidenceIndex + 1)}>
          Next
          <ChevronRight aria-hidden="true" size={18} />
        </button>
      </div>

      <div className="highlighted-text">
        <strong>Highlighted text</strong>
        <p>{activeEvidence?.text ?? "No OCR evidence selected."}</p>
      </div>
    </section>
  );
}

function ReadOnlyNotes({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="notes-panel">
      <h2>{title}</h2>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>No notes added.</p>
      )}
    </section>
  );
}
