"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Eye,
  Minimize2,
  RotateCw,
  XCircle,
  ZoomIn
} from "lucide-react";

import { getReviewAnalysis } from "@/features/applications/selectors";
import { useApplicationStore } from "@/features/applications/store";
import {
  fieldDefinitions,
  type ApplicationImageRecord,
  type EvidenceView,
  type OcrImageSummary,
  type ReviewFieldRow,
  type ReviewStatus
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

function isFinalReviewStatus(status?: ReviewStatus): status is "approved" | "rejected" {
  return status === "approved" || status === "rejected";
}

function finalDecisionLabel(decision: "approved" | "rejected") {
  return decision === "approved" ? "Approved" : "Rejected";
}

export function ReviewWorkspace({ applicationId }: { applicationId: string }) {
  const database = useApplicationStore((state) => state.database);
  const isDatabaseLoading = useApplicationStore((state) => state.isDatabaseLoading);
  const databaseError = useApplicationStore((state) => state.databaseError);
  const activeFieldByApplicationId = useApplicationStore((state) => state.activeFieldByApplicationId);
  const evidenceIndexByApplicationId = useApplicationStore((state) => state.evidenceIndexByApplicationId);
  const helpFieldKey = useApplicationStore((state) => state.helpFieldKey);
  const zoomed = useApplicationStore((state) => state.zoomed);
  const rotation = useApplicationStore((state) => state.rotation);
  const reviewNotes = useApplicationStore((state) => state.reviewNotesByApplicationId[applicationId] ?? "");
  const setReviewNotes = useApplicationStore((state) => state.setReviewNotes);
  const setActiveField = useApplicationStore((state) => state.setActiveField);
  const setEvidenceIndex = useApplicationStore((state) => state.setEvidenceIndex);
  const setHelpFieldKey = useApplicationStore((state) => state.setHelpFieldKey);
  const setZoomed = useApplicationStore((state) => state.setZoomed);
  const rotateViewer = useApplicationStore((state) => state.rotateViewer);
  const openDecisionModal = useApplicationStore((state) => state.openDecisionModal);

  const analysis = getReviewAnalysis(database, applicationId);
  const [requestedImageIndex, setRequestedImageIndex] = useState(0);

  const selectedFieldKey = activeFieldByApplicationId[applicationId];
  const selectedRow =
    analysis?.review_rows.find((row) => row.field_key === selectedFieldKey) ??
    analysis?.review_rows.find((row) => row.evidence.length > 0) ??
    analysis?.review_rows[0] ??
    null;
  const evidenceCount = selectedRow?.evidence.length ?? 0;
  const requestedEvidenceIndex = evidenceIndexByApplicationId[applicationId] ?? 0;
  const activeEvidenceIndex = evidenceCount > 0 ? Math.min(requestedEvidenceIndex, evidenceCount - 1) : 0;
  const activeEvidence = selectedRow?.evidence[activeEvidenceIndex] ?? null;
  const activeEvidenceImageIndex = activeEvidence
    ? analysis?.images.findIndex((image) => image.id === activeEvidence.image_id) ?? -1
    : -1;
  const imageCount = analysis?.images.length ?? 0;
  const activeImageIndex = imageCount > 0 ? Math.min(requestedImageIndex, imageCount - 1) : 0;
  const activeImage = analysis?.images[activeImageIndex] ?? null;
  const activeEvidenceForImage = activeEvidence?.image_id === activeImage?.id ? activeEvidence : null;
  const helpDefinition = helpFieldKey
    ? fieldDefinitions.find((definition) => definition.key === helpFieldKey)
    : null;
  const hasDocumentIntelligence = analysis?.application.processing_status === "processed";
  const finalDecision = analysis && isFinalReviewStatus(analysis.application.review_status)
    ? analysis.application.review_status
    : null;
  const isFinalized = Boolean(finalDecision);

  useEffect(() => {
    if (activeEvidenceImageIndex >= 0) {
      setRequestedImageIndex(activeEvidenceImageIndex);
    }
  }, [activeEvidenceImageIndex]);

  useEffect(() => {
    if (requestedImageIndex >= imageCount) {
      setRequestedImageIndex(Math.max(imageCount - 1, 0));
    }
  }, [imageCount, requestedImageIndex]);

  function selectImage(index: number) {
    if (!analysis) {
      return;
    }

    const targetImage = analysis.images[index];
    if (!targetImage) {
      return;
    }

    setRequestedImageIndex(index);

    const matchingEvidenceIndex =
      selectedRow?.evidence.findIndex((evidence) => evidence.image_id === targetImage.id) ?? -1;
    if (matchingEvidenceIndex >= 0) {
      setEvidenceIndex(applicationId, matchingEvidenceIndex);
    }
  }

  if (!analysis) {
    return (
      <main className="page-shell">
        {databaseError ? (
          <div className="inline-error">{databaseError}</div>
        ) : (
          <div className="loading-panel">
            {isDatabaseLoading ? "Loading application from Supabase." : "Review unavailable."}
          </div>
        )}
        <Link className="secondary-link" href="/applications">
          Back to queue
        </Link>
      </main>
    );
  }

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
            {hasDocumentIntelligence
              ? `${analysis.status_message} ${
                  typeof analysis.average_confidence === "number"
                    ? `${analysis.average_confidence}% average confidence.`
                    : ""
                }`
              : "Review the submitted application data and uploaded label images."}
          </p>
        </div>
        <div className="header-meta">
          <span>{analysis.application.submitted_data.applicant_name}</span>
          <span>{analysis.application.submitted_data.application_type}</span>
          <span>{analysis.application.application_number}</span>
        </div>
      </header>

      {finalDecision ? (
        <FinalDecisionBanner decision={finalDecision} />
      ) : null}

      {hasDocumentIntelligence && analysis.issues.length > 0 ? (
        <section className="issue-strip" aria-label="Review issues">
          {analysis.issues.slice(0, 3).map((issue) => (
            <div key={issue}>
              <AlertTriangle aria-hidden="true" size={18} />
              {issue}
            </div>
          ))}
        </section>
      ) : null}

      {hasDocumentIntelligence ? <OcrSummaryPanel summaries={analysis.ocr_summaries} /> : null}

      <section className="review-grid">
        <LabelViewer
          activeImage={activeImage}
          activeEvidence={hasDocumentIntelligence ? activeEvidenceForImage : null}
          imageCount={analysis.images.length}
          imageIndex={activeImageIndex}
          setImageIndex={selectImage}
          selectedRow={selectedRow}
          evidenceIndex={activeEvidenceIndex}
          setEvidenceIndex={(index) => setEvidenceIndex(applicationId, index)}
          zoomed={zoomed}
          setZoomed={setZoomed}
          rotation={rotation}
          rotateViewer={rotateViewer}
          showEvidence={hasDocumentIntelligence}
        />

        <section className="review-list" aria-label="Review fields">
          <div className="section-heading">
            <h2>Application Fields</h2>
            <span>{analysis.review_rows.length} fields</span>
          </div>
          {analysis.review_rows.map((row) => (
            <article
              className={`review-row ${row.field_key === selectedRow?.field_key ? "selected" : ""} ${
                hasDocumentIntelligence && (row.issues.length > 0 || row.extraction_status !== "found")
                  ? "needs-attention"
                  : ""
              }`}
              key={row.field_key}
            >
              <div className="review-row-header">
                <div>
                  <h3>{row.field_label}</h3>
                  {hasDocumentIntelligence ? <span>{extractionLabel(row)}</span> : null}
                </div>
                {hasDocumentIntelligence ? (
                  <span className={confidenceClass(row)}>
                    {typeof row.confidence === "number" ? `${row.confidence}%` : "No OCR"}
                  </span>
                ) : null}
              </div>
              <dl className="row-values">
                <div>
                  <dt>Application</dt>
                  <dd>{row.submitted_value || "Not provided"}</dd>
                </div>
                {hasDocumentIntelligence ? (
                  <div>
                    <dt>AI found</dt>
                    <dd>{row.extracted_value || "Not found"}</dd>
                  </div>
                ) : null}
              </dl>
              {hasDocumentIntelligence ? <p className="row-explanation">{row.explanation}</p> : null}
              {hasDocumentIntelligence && row.issues.length > 0 ? (
                <div className="row-message">
                  <AlertTriangle aria-hidden="true" size={16} />
                  {row.issues[0]}
                </div>
              ) : null}
              {hasDocumentIntelligence && row.evidence.length > 1 ? (
                <p className="multi-evidence-note">
                  Found on {row.evidence.length} images. Use Back / Next on the image panel.
                </p>
              ) : null}
              <div className="row-actions">
                {hasDocumentIntelligence ? (
                  <button
                    className="secondary-button compact"
                    disabled={row.evidence.length === 0}
                    onClick={() => setActiveField(applicationId, row.field_key)}
                  >
                    <Eye aria-hidden="true" size={17} />
                    Show on label
                  </button>
                ) : null}
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

      <section className="bottom-review">
        <ReadOnlyNotes
          title="Specialist Notes"
          items={analysis.application.specialist_notes ? [analysis.application.specialist_notes] : []}
        />
        {hasDocumentIntelligence ? (
          <ReadOnlyNotes
            title="Validation Notes"
            items={
              analysis.validation_results.length
                ? analysis.validation_results.map(
                    (result) =>
                      `${result.check_label}: ${result.result_status}${result.message ? ` - ${result.message}` : ""}`
                  )
                : []
            }
          />
        ) : null}
        <ReadOnlyNotes
          title="Submitted Data"
          items={Object.entries(analysis.application.submitted_data).map(([key, value]) => `${key}: ${value}`)}
        />
        <section className="reviewer-notes-panel">
          <h2>Reviewer Notes</h2>
          <textarea
            value={reviewNotes}
            onChange={(event) => setReviewNotes(applicationId, event.target.value)}
            disabled={isFinalized}
            rows={6}
            placeholder={isFinalized ? "Decision is locked" : "Add reviewer notes"}
          />
        </section>
      </section>

      <section className={`decision-bar ${isFinalized ? "decision-bar-locked" : ""}`} aria-label="Final decision">
        <div>
          <strong>{isFinalized ? "Decision Locked" : "Final Decision"}</strong>
          <span>
            {isFinalized && finalDecision
              ? `This application was ${finalDecisionLabel(finalDecision).toLowerCase()} and can no longer be modified.`
              : "The reviewer has final discretion."}
          </span>
        </div>
        <div className="decision-actions">
          <button
            className="primary-button"
            disabled={isFinalized}
            onClick={() => openDecisionModal("single", [applicationId], "approved")}
          >
            <CheckCircle2 aria-hidden="true" size={18} />
            {isFinalized ? "Approval Locked" : "Approve Application"}
          </button>
          <button
            className="danger-button"
            disabled={isFinalized}
            onClick={() => openDecisionModal("single", [applicationId], "rejected")}
          >
            <XCircle aria-hidden="true" size={18} />
            {isFinalized ? "Rejection Locked" : "Reject Application"}
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

function FinalDecisionBanner({
  decision
}: {
  decision: "approved" | "rejected";
}) {
  const isApproved = decision === "approved";

  return (
    <section className={`decision-status-strip decision-status-${decision}`} aria-label="Final review status">
      {isApproved ? (
        <CheckCircle2 aria-hidden="true" size={24} />
      ) : (
        <XCircle aria-hidden="true" size={24} />
      )}
      <strong>{isApproved ? "Approved" : "Rejected"}</strong>
    </section>
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
  imageCount,
  imageIndex,
  setImageIndex,
  selectedRow,
  evidenceIndex,
  setEvidenceIndex,
  zoomed,
  setZoomed,
  rotation,
  rotateViewer,
  showEvidence
}: {
  activeImage: ApplicationImageRecord | null;
  activeEvidence: EvidenceView | null;
  imageCount: number;
  imageIndex: number;
  setImageIndex: (index: number) => void;
  selectedRow: ReviewFieldRow | null;
  evidenceIndex: number;
  setEvidenceIndex: (index: number) => void;
  zoomed: boolean;
  setZoomed: (value: boolean) => void;
  rotation: number;
  rotateViewer: () => void;
  showEvidence: boolean;
}) {
  const evidenceCount = selectedRow?.evidence.length ?? 0;
  const canGoToPreviousImage = imageIndex > 0;
  const canGoToNextImage = imageIndex < imageCount - 1;
  const canGoBack = showEvidence && evidenceIndex > 0;
  const canGoNext = showEvidence && evidenceIndex < evidenceCount - 1;

  return (
    <section className="label-viewer" aria-label="Label image viewer">
      <div className="section-heading">
        <div>
          <h2>{activeImage?.original_filename ?? "Label unavailable"}</h2>
          <span>
            {imageCount > 0
              ? `Image ${imageIndex + 1} of ${imageCount}${activeImage?.label_type ? ` - ${activeImage.label_type}` : ""}`
              : "No images"}
          </span>
        </div>
        <div className="viewer-tools">
          <button
            className="icon-button"
            disabled={!canGoToPreviousImage}
            onClick={() => setImageIndex(imageIndex - 1)}
            aria-label="Previous image"
            title="Previous image"
          >
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
          <button
            className="icon-button"
            disabled={!canGoToNextImage}
            onClick={() => setImageIndex(imageIndex + 1)}
            aria-label="Next image"
            title="Next image"
          >
            <ChevronRight aria-hidden="true" size={18} />
          </button>
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

      {showEvidence ? (
        <>
          <div className="evidence-controls">
            <button className="secondary-button compact" disabled={!canGoBack} onClick={() => setEvidenceIndex(evidenceIndex - 1)}>
              <ChevronLeft aria-hidden="true" size={18} />
              Previous evidence
            </button>
            <button className="secondary-button compact" disabled={!canGoNext} onClick={() => setEvidenceIndex(evidenceIndex + 1)}>
              Next evidence
              <ChevronRight aria-hidden="true" size={18} />
            </button>
          </div>

          <div className="highlighted-text">
            <strong>Highlighted text</strong>
            <p>
              {activeEvidence?.text ??
                (evidenceCount > 0 ? "No highlighted evidence on this image." : "No OCR evidence selected.")}
            </p>
          </div>
        </>
      ) : null}
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
