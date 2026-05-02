"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import { useApplicationStore } from "@/features/applications/store";

export function DecisionModal() {
  const decisionModal = useApplicationStore((state) => state.decisionModal);
  const decisionNotes = useApplicationStore((state) => state.decisionNotes);
  const closeDecisionModal = useApplicationStore((state) => state.closeDecisionModal);
  const setDecisionNotes = useApplicationStore((state) => state.setDecisionNotes);
  const submitDecision = useApplicationStore((state) => state.submitDecision);

  if (!decisionModal) {
    return null;
  }

  const isApproval = decisionModal.decision === "approved";
  const verb = isApproval ? "Approve" : decisionModal.decision === "rejected" ? "Reject" : "Needs changes";
  const count = decisionModal.applicationIds.length;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="decision-title">
        <h2 id="decision-title">Confirm decision</h2>
        <p>
          {verb} {count} application{count === 1 ? "" : "s"}. Reviewer notes are optional.
        </p>
        {decisionNotes.trim().length === 0 ? (
          <div className="warning-strip">
            <AlertTriangle aria-hidden="true" size={18} />
            No reviewer note added.
          </div>
        ) : null}
        <label className="notes-field">
          Reviewer notes
          <textarea
            value={decisionNotes}
            onChange={(event) => setDecisionNotes(event.target.value)}
            rows={4}
          />
        </label>
        <div className="modal-actions">
          <button className="secondary-button" onClick={closeDecisionModal}>
            Cancel
          </button>
          <button className={isApproval ? "primary-button" : "danger-button"} onClick={submitDecision}>
            {isApproval ? (
              <CheckCircle2 aria-hidden="true" size={18} />
            ) : (
              <XCircle aria-hidden="true" size={18} />
            )}
            {verb}
          </button>
        </div>
      </section>
    </div>
  );
}
