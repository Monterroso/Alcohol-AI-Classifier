"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "react-toastify";

import { useApplicationStore } from "@/features/applications/store";

export function DecisionModal() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  const noun = `application${count === 1 ? "" : "s"}`;

  async function handleSubmitDecision() {
    setIsSubmitting(true);
    try {
      const result = await submitDecision();
      if (!result) {
        return;
      }

      const resultCount = result.applicationIds.length;
      const resultNoun = `application${resultCount === 1 ? "" : "s"}`;
      if (result.decision === "approved") {
        toast.success(`${resultCount} ${resultNoun} approved.`);
      } else if (result.decision === "rejected") {
        toast.error(`${resultCount} ${resultNoun} rejected.`);
      } else {
        toast.info(`${resultCount} ${resultNoun} marked as needing changes.`);
      }
      router.push("/applications");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Decision could not be saved.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="decision-title">
        <h2 id="decision-title">Confirm decision</h2>
        <p>
          {verb} {count} {noun}. Reviewer notes are optional.
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
            disabled={isSubmitting}
            rows={4}
          />
        </label>
        <div className="modal-actions">
          <button className="secondary-button" disabled={isSubmitting} onClick={closeDecisionModal}>
            Cancel
          </button>
          <button
            className={isApproval ? "primary-button" : "danger-button"}
            disabled={isSubmitting}
            onClick={handleSubmitDecision}
          >
            {isApproval ? (
              <CheckCircle2 aria-hidden="true" size={18} />
            ) : (
              <XCircle aria-hidden="true" size={18} />
            )}
            {isSubmitting ? "Saving" : verb}
          </button>
        </div>
      </section>
    </div>
  );
}
