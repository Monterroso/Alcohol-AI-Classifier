"use client";

import { create } from "zustand";

import {
  fetchApplicationDatabase,
  resetApplicationSeedData,
  submitApplicationDecision,
  submitBatchApplication,
  submitSingleApplication
} from "./api-client";
import {
  subscribeToApplicationTables
} from "./supabase-database";
import { createEmptyDatabase } from "./empty-database";
import {
  emptySubmittedData,
  type ApplicationDatabase,
  type Decision,
  type LabelType,
  type QueueFilterKey,
  type QueueSortKey,
  type SubmittedApplicationData
} from "./types";

export type UploadMode = "single" | "batch";

export type UploadImageDraft = {
  id: string;
  file: File;
  label_type: LabelType;
  preview_url: string;
  original_filename: string;
  mime_type: string;
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
  isDatabaseLoading: boolean;
  databaseError: string | null;
  uploadMode: UploadMode;
  singleForm: SubmittedApplicationData;
  singleImages: UploadImageDraft[];
  batchZipFile?: File;
  batchCsvFile?: File;
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
  initializeDatabase: () => Promise<void>;
  subscribeToDatabase: () => () => void;
  setUploadMode: (mode: UploadMode) => void;
  updateSingleField: (field: keyof SubmittedApplicationData, value: string) => void;
  addSingleFiles: (files: FileList | File[]) => void;
  updateSingleImageLabel: (imageId: string, labelType: LabelType) => void;
  removeSingleImage: (imageId: string) => void;
  submitSingleUpload: () => Promise<void>;
  setBatchZipFile: (file?: File) => void;
  setBatchCsvFile: (file?: File) => void;
  submitBatchUpload: () => Promise<void>;
  setQueueSort: (sort: QueueSortKey) => void;
  setQueueFilter: (filter: QueueFilterKey) => void;
  toggleSelectedApplication: (applicationId: string) => void;
  toggleVisibleApplications: (applicationIds: string[]) => void;
  openDecisionModal: (scope: "single" | "batch", applicationIds: string[], decision: Decision) => void;
  closeDecisionModal: () => void;
  setDecisionNotes: (notes: string) => void;
  submitDecision: () => Promise<void>;
  setReviewNotes: (applicationId: string, notes: string) => void;
  setActiveField: (applicationId: string, fieldKey: keyof SubmittedApplicationData) => void;
  setEvidenceIndex: (applicationId: string, index: number) => void;
  setHelpFieldKey: (fieldKey: keyof SubmittedApplicationData | null) => void;
  setZoomed: (zoomed: boolean) => void;
  rotateViewer: () => void;
  resetSeedData: () => Promise<void>;
};

let refreshTimer: ReturnType<typeof setTimeout> | undefined;

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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The application database request failed.";
}

export const useApplicationStore = create<ApplicationStore>((set, get) => ({
  database: createEmptyDatabase(),
  isDatabaseLoading: false,
  databaseError: null,
  uploadMode: "single",
  singleForm: { ...emptySubmittedData },
  singleImages: [],
  batchZipFile: undefined,
  batchCsvFile: undefined,
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
  initializeDatabase: async () => {
    set({ isDatabaseLoading: true, databaseError: null });
    try {
      const database = await fetchApplicationDatabase();
      set({ database, isDatabaseLoading: false });
    } catch (error) {
      set({ isDatabaseLoading: false, databaseError: errorMessage(error) });
    }
  },
  subscribeToDatabase: () =>
    subscribeToApplicationTables(() => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      refreshTimer = setTimeout(() => {
        void get().initializeDatabase();
      }, 100);
    }),
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
          file,
          label_type: "front" as const,
          preview_url: URL.createObjectURL(file),
          original_filename: file.name,
          mime_type: file.type || "image/*"
        }))
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
  submitSingleUpload: async () => {
    const state = get();
    const submittedData = sanitizeSubmittedData(state.singleForm);

    if (state.singleImages.length === 0) {
      return;
    }

    try {
      await submitSingleApplication({
        submittedData,
        images: state.singleImages.map((image) => ({
          file: image.file,
          labelType: image.label_type
        }))
      });
      set({
        singleForm: { ...emptySubmittedData },
        singleImages: [],
        queueFilter: "all",
        queueSort: "created_at",
        databaseError: null
      });
      await get().initializeDatabase();
    } catch (error) {
      set({ databaseError: errorMessage(error) });
    }
  },
  setBatchZipFile: (file) => set({ batchZipFile: file }),
  setBatchCsvFile: (file) => set({ batchCsvFile: file }),
  submitBatchUpload: async () => {
    const state = get();

    if (!state.batchZipFile || !state.batchCsvFile) {
      return;
    }

    try {
      await submitBatchApplication({ zipFile: state.batchZipFile, csvFile: state.batchCsvFile });
      set({
        batchZipFile: undefined,
        batchCsvFile: undefined,
        queueFilter: "all",
        queueSort: "created_at",
        databaseError: null
      });
      await get().initializeDatabase();
    } catch (error) {
      set({ databaseError: errorMessage(error) });
    }
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
  submitDecision: async () => {
    const state = get();
    if (!state.decisionModal) {
      return;
    }

    const { applicationIds, decision } = state.decisionModal;
    try {
      await submitApplicationDecision(applicationIds, decision, state.decisionNotes);
      set({
        decisionModal: null,
        decisionNotes: "",
        selectedApplicationIds: state.selectedApplicationIds.filter((id) => !applicationIds.includes(id)),
        submittedDecisionByApplicationId: applicationIds.reduce(
          (decisions, applicationId) => ({ ...decisions, [applicationId]: decision }),
          state.submittedDecisionByApplicationId
        ),
        databaseError: null
      });
      await get().initializeDatabase();
    } catch (error) {
      set({ databaseError: errorMessage(error) });
    }
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
  resetSeedData: async () => {
    try {
      await resetApplicationSeedData();
      set({ databaseError: null });
      await get().initializeDatabase();
    } catch (error) {
      set({ databaseError: errorMessage(error) });
    }
  }
}));
