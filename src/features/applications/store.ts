"use client";

import { create } from "zustand";

import { createMockDatabase, createPlaceholderLabel } from "./mock-data";
import {
  decideApplications,
  processNextPendingApplication,
  submitBatchApplications,
  submitSingleApplication
} from "./mock-repository";
import {
  emptySubmittedData,
  type ApplicationDatabase,
  type Decision,
  type LabelType,
  type QueueFilterKey,
  type QueueSortKey,
  type SubmitBatchApplicationInput,
  type SubmittedApplicationData,
  type UploadImageInput
} from "./types";

export type UploadMode = "single" | "batch";

export type UploadImageDraft = {
  id: string;
  label_type: LabelType;
  preview_url: string;
  original_filename: string;
  mime_type: string;
};

export type BatchUploadDraftRow = {
  id: string;
  submitted_data: SubmittedApplicationData;
  images: UploadImageInput[];
};

type DecisionModal =
  | {
      scope: "single";
      applicationIds: string[];
      decision: Decision;
    }
  | {
      scope: "batch";
      applicationIds: string[];
      decision: Decision;
    }
  | null;

type ApplicationStore = {
  database: ApplicationDatabase;
  uploadMode: UploadMode;
  singleForm: SubmittedApplicationData;
  singleImages: UploadImageDraft[];
  batchZipName: string;
  batchCsvName: string;
  batchRows: BatchUploadDraftRow[];
  queueSort: QueueSortKey;
  queueFilter: QueueFilterKey;
  selectedApplicationIds: string[];
  decisionModal: DecisionModal;
  decisionNotes: string;
  reviewNotesByApplicationId: Record<string, string>;
  activeFieldByApplicationId: Record<string, keyof SubmittedApplicationData | undefined>;
  evidenceIndexByApplicationId: Record<string, number>;
  helpFieldKey: keyof SubmittedApplicationData | null;
  zoomed: boolean;
  rotation: number;
  submittedDecisionByApplicationId: Record<string, Decision | undefined>;
  setUploadMode: (mode: UploadMode) => void;
  updateSingleField: (field: keyof SubmittedApplicationData, value: string) => void;
  addSingleFiles: (files: FileList | File[]) => void;
  addPlaceholderImage: () => void;
  updateSingleImageLabel: (imageId: string, labelType: LabelType) => void;
  removeSingleImage: (imageId: string) => void;
  submitSingleUpload: () => void;
  setBatchZipName: (name: string) => void;
  setBatchCsvName: (name: string) => void;
  stageBatchPreview: () => void;
  submitBatchUpload: () => void;
  setQueueSort: (sort: QueueSortKey) => void;
  setQueueFilter: (filter: QueueFilterKey) => void;
  toggleSelectedApplication: (applicationId: string) => void;
  toggleVisibleApplications: (applicationIds: string[]) => void;
  openDecisionModal: (scope: "single" | "batch", applicationIds: string[], decision: Decision) => void;
  closeDecisionModal: () => void;
  setDecisionNotes: (notes: string) => void;
  submitDecision: () => void;
  setReviewNotes: (applicationId: string, notes: string) => void;
  setActiveField: (applicationId: string, fieldKey: keyof SubmittedApplicationData) => void;
  setEvidenceIndex: (applicationId: string, index: number) => void;
  setHelpFieldKey: (fieldKey: keyof SubmittedApplicationData | null) => void;
  setZoomed: (zoomed: boolean) => void;
  rotateViewer: () => void;
  runProcessingCycle: () => void;
  resetMockData: () => void;
};

function createDraftId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sanitizeSubmittedData(data: SubmittedApplicationData): SubmittedApplicationData {
  return {
    brand_name: data.brand_name.trim(),
    product_name: data.product_name.trim(),
    alcohol_content: data.alcohol_content.trim(),
    net_contents: data.net_contents.trim(),
    origin: data.origin.trim(),
    government_warning: data.government_warning.trim(),
    applicant_name: data.applicant_name.trim(),
    application_type: data.application_type.trim()
  };
}

function fileListToArray(files: FileList | File[]) {
  return Array.from(files);
}

function draftToImageInput(image: UploadImageDraft): UploadImageInput {
  return {
    label_type: image.label_type,
    image_url: image.preview_url,
    original_filename: image.original_filename,
    mime_type: image.mime_type
  };
}

function buildBatchRows(zipName: string, csvName: string): BatchUploadDraftRow[] {
  const zipSource = zipName || "batch-labels.zip";
  const csvSource = csvName || "applications.csv";

  const rows: BatchUploadDraftRow[] = [
    {
      id: "batch-row-1",
      submitted_data: {
        brand_name: "Sample Ridge",
        product_name: "Sample Ridge Vodka",
        alcohol_content: "40% ALC/VOL",
        net_contents: "750 ML",
        origin: "Austin, Texas",
        government_warning: "Government warning present",
        applicant_name: "Sample Ridge Distilling",
        application_type: "Distilled spirits label"
      },
      images: [
        {
          label_type: "front",
          image_url: createPlaceholderLabel("SAMPLE RIDGE", "Front label"),
          original_filename: `${zipSource}/sample-ridge/front-1.png`,
          mime_type: "image/png"
        },
        {
          label_type: "front",
          image_url: createPlaceholderLabel("SAMPLE RIDGE", "Alternate front"),
          original_filename: `${zipSource}/sample-ridge/front-2.png`,
          mime_type: "image/png"
        },
        {
          label_type: "government_warning",
          image_url: createPlaceholderLabel("SAMPLE RIDGE", "Warning panel"),
          original_filename: `${zipSource}/sample-ridge/back.png`,
          mime_type: "image/png"
        }
      ]
    },
    {
      id: "batch-row-2",
      submitted_data: {
        brand_name: "Mesa Verde",
        product_name: "Mesa Verde Blanco",
        alcohol_content: "38% ALC/VOL",
        net_contents: "700 ML",
        origin: "Santa Fe, New Mexico",
        government_warning: "Government warning present",
        applicant_name: "Mesa Verde Imports",
        application_type: "Distilled spirits label"
      },
      images: [
        {
          label_type: "front",
          image_url: createPlaceholderLabel("MESA VERDE", "Blanco"),
          original_filename: `${zipSource}/mesa-verde/front.png`,
          mime_type: "image/png"
        },
        {
          label_type: "neck",
          image_url: createPlaceholderLabel("MESA VERDE", "Neck band"),
          original_filename: `${zipSource}/mesa-verde/neck.png`,
          mime_type: "image/png"
        }
      ]
    }
  ];

  return rows.map((row) => ({
    ...row,
    submitted_data: {
      ...row.submitted_data,
      application_type: `${row.submitted_data.application_type} (${csvSource})`
    }
  }));
}

export const useApplicationStore = create<ApplicationStore>((set, get) => ({
  database: createMockDatabase(),
  uploadMode: "single",
  singleForm: { ...emptySubmittedData },
  singleImages: [],
  batchZipName: "",
  batchCsvName: "",
  batchRows: [],
  queueSort: "created_at",
  queueFilter: "all",
  selectedApplicationIds: [],
  decisionModal: null,
  decisionNotes: "",
  reviewNotesByApplicationId: {},
  activeFieldByApplicationId: {},
  evidenceIndexByApplicationId: {},
  helpFieldKey: null,
  zoomed: false,
  rotation: 0,
  submittedDecisionByApplicationId: {},
  setUploadMode: (mode) => set({ uploadMode: mode }),
  updateSingleField: (field, value) =>
    set((state) => ({
      singleForm: {
        ...state.singleForm,
        [field]: value
      }
    })),
  addSingleFiles: (files) =>
    set((state) => ({
      singleImages: [
        ...state.singleImages,
        ...fileListToArray(files).map((file) => ({
          id: createDraftId("draft-image"),
          label_type: "front" as const,
          preview_url: URL.createObjectURL(file),
          original_filename: file.name,
          mime_type: file.type || "image/*"
        }))
      ]
    })),
  addPlaceholderImage: () =>
    set((state) => ({
      singleImages: [
        ...state.singleImages,
        {
          id: createDraftId("draft-image"),
          label_type: "front",
          preview_url: createPlaceholderLabel(state.singleForm.brand_name, state.singleForm.product_name),
          original_filename: "mock-label.png",
          mime_type: "image/png"
        }
      ]
    })),
  updateSingleImageLabel: (imageId, labelType) =>
    set((state) => ({
      singleImages: state.singleImages.map((image) =>
        image.id === imageId ? { ...image, label_type: labelType } : image
      )
    })),
  removeSingleImage: (imageId) =>
    set((state) => ({
      singleImages: state.singleImages.filter((image) => image.id !== imageId)
    })),
  submitSingleUpload: () => {
    const state = get();
    const submittedData = sanitizeSubmittedData(state.singleForm);
    const images = state.singleImages.length
      ? state.singleImages.map(draftToImageInput)
      : [
          {
            label_type: "front" as const,
            image_url: createPlaceholderLabel(submittedData.brand_name, submittedData.product_name),
            original_filename: "mock-label.png",
            mime_type: "image/png"
          }
        ];

    set({
      database: submitSingleApplication(state.database, {
        submitted_data: submittedData,
        images
      }),
      singleForm: { ...emptySubmittedData },
      singleImages: [],
      queueFilter: "all",
      queueSort: "created_at"
    });
  },
  setBatchZipName: (name) => set({ batchZipName: name }),
  setBatchCsvName: (name) => set({ batchCsvName: name }),
  stageBatchPreview: () =>
    set((state) => ({
      batchRows: buildBatchRows(state.batchZipName, state.batchCsvName)
    })),
  submitBatchUpload: () => {
    const state = get();
    const rows = state.batchRows.length ? state.batchRows : buildBatchRows(state.batchZipName, state.batchCsvName);
    const inputs: SubmitBatchApplicationInput[] = rows.map((row) => ({
      submitted_data: sanitizeSubmittedData(row.submitted_data),
      images: row.images
    }));

    set({
      database: submitBatchApplications(state.database, inputs),
      batchRows: [],
      batchZipName: "",
      batchCsvName: "",
      queueFilter: "all",
      queueSort: "created_at"
    });
  },
  setQueueSort: (sort) => set({ queueSort: sort }),
  setQueueFilter: (filter) => set({ queueFilter: filter, selectedApplicationIds: [] }),
  toggleSelectedApplication: (applicationId) =>
    set((state) => ({
      selectedApplicationIds: state.selectedApplicationIds.includes(applicationId)
        ? state.selectedApplicationIds.filter((id) => id !== applicationId)
        : [...state.selectedApplicationIds, applicationId]
    })),
  toggleVisibleApplications: (applicationIds) =>
    set((state) => {
      const allSelected =
        applicationIds.length > 0 && applicationIds.every((id) => state.selectedApplicationIds.includes(id));
      return {
        selectedApplicationIds: allSelected
          ? state.selectedApplicationIds.filter((id) => !applicationIds.includes(id))
          : Array.from(new Set([...state.selectedApplicationIds, ...applicationIds]))
      };
    }),
  openDecisionModal: (scope, applicationIds, decision) =>
    set({
      decisionModal: { scope, applicationIds, decision },
      decisionNotes: applicationIds.length === 1 ? get().reviewNotesByApplicationId[applicationIds[0]] ?? "" : ""
    }),
  closeDecisionModal: () => set({ decisionModal: null, decisionNotes: "" }),
  setDecisionNotes: (notes) => set({ decisionNotes: notes }),
  submitDecision: () => {
    const state = get();
    if (!state.decisionModal) {
      return;
    }

    const { applicationIds, decision } = state.decisionModal;
    set({
      database: decideApplications(state.database, applicationIds, decision, state.decisionNotes),
      decisionModal: null,
      decisionNotes: "",
      selectedApplicationIds: state.selectedApplicationIds.filter((id) => !applicationIds.includes(id)),
      submittedDecisionByApplicationId: applicationIds.reduce(
        (decisions, applicationId) => ({ ...decisions, [applicationId]: decision }),
        state.submittedDecisionByApplicationId
      )
    });
  },
  setReviewNotes: (applicationId, notes) =>
    set((state) => ({
      reviewNotesByApplicationId: {
        ...state.reviewNotesByApplicationId,
        [applicationId]: notes
      }
    })),
  setActiveField: (applicationId, fieldKey) =>
    set((state) => ({
      activeFieldByApplicationId: {
        ...state.activeFieldByApplicationId,
        [applicationId]: fieldKey
      },
      evidenceIndexByApplicationId: {
        ...state.evidenceIndexByApplicationId,
        [applicationId]: 0
      }
    })),
  setEvidenceIndex: (applicationId, index) =>
    set((state) => ({
      evidenceIndexByApplicationId: {
        ...state.evidenceIndexByApplicationId,
        [applicationId]: index
      }
    })),
  setHelpFieldKey: (fieldKey) => set({ helpFieldKey: fieldKey }),
  setZoomed: (zoomed) => set({ zoomed }),
  rotateViewer: () => set((state) => ({ rotation: (state.rotation + 90) % 360 })),
  runProcessingCycle: () =>
    set((state) => ({
      database: processNextPendingApplication(state.database, "client-demo-worker").database
    })),
  resetMockData: () =>
    set({
      database: createMockDatabase(),
      singleForm: { ...emptySubmittedData },
      singleImages: [],
      batchRows: [],
      selectedApplicationIds: [],
      decisionModal: null,
      decisionNotes: "",
      reviewNotesByApplicationId: {},
      activeFieldByApplicationId: {},
      evidenceIndexByApplicationId: {},
      helpFieldKey: null,
      submittedDecisionByApplicationId: {}
    })
}));
