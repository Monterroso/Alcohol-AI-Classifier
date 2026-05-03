"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownUp,
  Ban,
  CheckCircle2,
  CircleDot,
  FileSearch,
  Loader2,
  ShieldCheck,
  Upload
} from "lucide-react";

import { listQueueItems } from "@/features/applications/selectors";
import { useApplicationStore } from "@/features/applications/store";
import type { ProcessingStatus, QueueFilterKey, QueueItem, QueueSortKey, ReviewStatus } from "@/features/applications/types";

import { DecisionModal } from "./DecisionModal";

const sortOptions: Array<{ value: QueueSortKey; label: string }> = [
  { value: "created_at", label: "Newest first" },
  { value: "confidence", label: "Confidence" },
  { value: "processing_status", label: "Processing status" },
  { value: "review_status", label: "Review status" },
  { value: "product_name", label: "Product name" }
];

const filterOptions: Array<{ value: QueueFilterKey; label: string }> = [
  { value: "all", label: "All applications" },
  { value: "pending", label: "Pending processing" },
  { value: "processing", label: "Processing" },
  { value: "processed", label: "Processed" },
  { value: "failed", label: "Failed" },
  { value: "unreviewed", label: "Unreviewed" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "needs_changes", label: "Needs changes" }
];

function processingLabel(status: ProcessingStatus) {
  switch (status) {
    case "pending":
      return "Pending";
    case "processing":
      return "Processing";
    case "processed":
      return "Processed";
    case "failed":
      return "Failed";
  }
}

function reviewLabel(status: ReviewStatus) {
  switch (status) {
    case "unreviewed":
      return "Unreviewed";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "needs_changes":
      return "Needs changes";
  }
}

function isFinalReviewStatus(status: ReviewStatus) {
  return status === "approved" || status === "rejected";
}

function confidenceTone(application: QueueItem) {
  if (application.processing_status !== "processed") {
    return "awaiting";
  }
  if ((application.average_confidence ?? 0) >= 90 && application.issue_count === 0) {
    return "high";
  }
  if ((application.average_confidence ?? 0) >= 72) {
    return "medium";
  }
  return "low";
}

function statusIcon(application: QueueItem) {
  if (application.processing_status === "pending" || application.processing_status === "processing") {
    return <Loader2 aria-hidden="true" size={18} className="spin-slow" />;
  }
  if (application.processing_status === "failed" || application.issue_count > 0) {
    return <AlertTriangle aria-hidden="true" size={18} />;
  }
  if ((application.average_confidence ?? 0) >= 90) {
    return <ShieldCheck aria-hidden="true" size={18} />;
  }
  return <CheckCircle2 aria-hidden="true" size={18} />;
}

export function ApplicationQueue() {
  const database = useApplicationStore((state) => state.database);
  const isDatabaseLoading = useApplicationStore((state) => state.isDatabaseLoading);
  const databaseError = useApplicationStore((state) => state.databaseError);
  const queueSort = useApplicationStore((state) => state.queueSort);
  const queueFilter = useApplicationStore((state) => state.queueFilter);
  const selectedApplicationIds = useApplicationStore((state) => state.selectedApplicationIds);
  const setQueueSort = useApplicationStore((state) => state.setQueueSort);
  const setQueueFilter = useApplicationStore((state) => state.setQueueFilter);
  const toggleSelectedApplication = useApplicationStore((state) => state.toggleSelectedApplication);
  const toggleVisibleApplications = useApplicationStore((state) => state.toggleVisibleApplications);
  const openDecisionModal = useApplicationStore((state) => state.openDecisionModal);

  const applications = listQueueItems(database, queueSort, queueFilter);
  const visibleActionableIds = applications
    .filter((application) => !isFinalReviewStatus(application.review_status))
    .map((application) => application.id);
  const selectedVisibleCount = visibleActionableIds.filter((id) => selectedApplicationIds.includes(id)).length;
  const selectedActionableIds = selectedApplicationIds.filter((id) => visibleActionableIds.includes(id));
  const highConfidenceCount = applications.filter(
    (application) => confidenceTone(application) === "high"
  ).length;
  const needsAttentionCount = applications.filter(
    (application) => application.issue_count > 0 || application.processing_status === "failed"
  ).length;

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Compliance Division</p>
          <h1>Incoming Applications</h1>
          <p>Sort by processing state, confidence, review status, or apply a selected decision.</p>
        </div>
        <div className="header-actions">
          <Link className="secondary-button" href="/applications/upload">
            <Upload aria-hidden="true" size={18} />
            Upload
          </Link>
        </div>
      </header>

      <section className="queue-toolbar" aria-label="Queue controls">
        <div className="queue-stat">
          <span>{applications.length}</span>
          Applications
        </div>
        <div className="queue-stat verified">
          <span>{highConfidenceCount}</span>
          High confidence
        </div>
        <div className="queue-stat attention">
          <span>{needsAttentionCount}</span>
          Needs review
        </div>
        <label className="select-label">
          Filter
          <select value={queueFilter} onChange={(event) => setQueueFilter(event.target.value as QueueFilterKey)}>
            {filterOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="select-label">
          Sort
          <select value={queueSort} onChange={(event) => setQueueSort(event.target.value as QueueSortKey)}>
            {sortOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="queue-actions">
          <button
            className="primary-button"
            disabled={selectedActionableIds.length === 0}
            onClick={() => openDecisionModal("batch", selectedActionableIds, "approved")}
          >
            <CheckCircle2 aria-hidden="true" size={18} />
            Approve Selected ({selectedActionableIds.length})
          </button>
          <button
            className="danger-button"
            disabled={selectedActionableIds.length === 0}
            onClick={() => openDecisionModal("batch", selectedActionableIds, "rejected")}
          >
            <Ban aria-hidden="true" size={18} />
            Reject Selected ({selectedActionableIds.length})
          </button>
        </div>
      </section>

      <section className="queue-list" aria-label="Application queue">
        <div className="queue-row queue-heading">
          <label className="checkbox-cell">
            <input
              type="checkbox"
              checked={visibleActionableIds.length > 0 && selectedVisibleCount === visibleActionableIds.length}
              disabled={visibleActionableIds.length === 0}
              onChange={() => toggleVisibleApplications(visibleActionableIds)}
              aria-label="Select all visible applications"
            />
          </label>
          <span>Application</span>
          <span>Processing</span>
          <span>Confidence</span>
          <span>Labels</span>
          <span>
            <ArrowDownUp aria-hidden="true" size={16} />
            Received
          </span>
          <span>Action</span>
        </div>

        {databaseError ? <div className="inline-error">{databaseError}</div> : null}

        {isDatabaseLoading && applications.length === 0 ? (
          <div className="loading-panel">Loading applications from Supabase.</div>
        ) : null}

        {!isDatabaseLoading && !databaseError && applications.length === 0 ? (
          <div className="loading-panel">No applications match this filter.</div>
        ) : null}

        {applications.map((application) => {
          const isFinalized = isFinalReviewStatus(application.review_status);

          return (
            <article className="queue-row" key={application.id}>
              <label className="checkbox-cell">
                <input
                  type="checkbox"
                  checked={!isFinalized && selectedApplicationIds.includes(application.id)}
                  disabled={isFinalized}
                  onChange={() => toggleSelectedApplication(application.id)}
                  aria-label={`Select ${application.product_name}`}
                />
              </label>
              <div>
                <strong>{application.product_name}</strong>
                <span>{application.applicant_name}</span>
                <span>{application.application_type}</span>
                {application.review_status !== "unreviewed" ? (
                  <span className={`decision-chip decision-${application.review_status}`}>
                    Decision: {reviewLabel(application.review_status)}
                  </span>
                ) : null}
              </div>
              <div>
                <div className={`verification-pill verification-${confidenceTone(application)}`}>
                  {statusIcon(application)}
                  {processingLabel(application.processing_status)}
                </div>
                <span>{application.status_message}</span>
              </div>
              <span>
                {application.verified_fields}/{application.total_fields} verified
                {typeof application.average_confidence === "number"
                  ? ` - ${application.average_confidence}% avg`
                  : " - awaiting OCR"}
              </span>
              <span>
                <CircleDot aria-hidden="true" size={16} />
                {application.label_count}
              </span>
              <span>
                {new Intl.DateTimeFormat("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short"
                }).format(new Date(application.received_at))}
              </span>
              <div>
                <Link className="primary-link-button" href={`/applications/${application.id}/review`}>
                  <FileSearch aria-hidden="true" size={18} />
                  Review
                </Link>
              </div>
            </article>
          );
        })}
      </section>

      <DecisionModal />
    </main>
  );
}
