"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { FileArchive, FileSpreadsheet, FileUp, Images, Send, Sparkles, Trash2 } from "lucide-react";

import {
  batchDemoPresets,
  createBatchDemoFiles,
  createSingleDemoDraft,
  singleDemoPresets
} from "@/features/applications/demo-data";
import { useApplicationStore } from "@/features/applications/store";
import {
  emptySubmittedData,
  labelTypeOptions,
  type LabelType,
  type SubmittedApplicationData
} from "@/features/applications/types";

const uploadFields: Array<{
  key: keyof SubmittedApplicationData;
  label: string;
  placeholder: string;
}> = [
  { key: "applicant_name", label: "Applicant", placeholder: "Applicant legal name" },
  { key: "application_type", label: "Application type", placeholder: "Label application type" },
  { key: "brand_name", label: "Brand name", placeholder: "Brand shown on label" },
  { key: "product_name", label: "Product name", placeholder: "Product identity" },
  { key: "alcohol_content", label: "Alcohol content", placeholder: "ABV or proof statement" },
  { key: "net_contents", label: "Net contents", placeholder: "Container volume" },
  { key: "origin", label: "Origin", placeholder: "Producer or origin location" },
  { key: "government_warning", label: "Government warning", placeholder: "Warning statement status" }
];

export function ApplicationUpload() {
  const singleImageInputRef = useRef<HTMLInputElement>(null);
  const [singleDemoPresetId, setSingleDemoPresetId] = useState(singleDemoPresets[0].id);
  const [batchDemoPresetId, setBatchDemoPresetId] = useState(batchDemoPresets[0].id);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [demoSummary, setDemoSummary] = useState<string | null>(null);
  const uploadMode = useApplicationStore((state) => state.uploadMode);
  const singleForm = useApplicationStore((state) => state.singleForm);
  const singleImages = useApplicationStore((state) => state.singleImages);
  const batchZipFile = useApplicationStore((state) => state.batchZipFile);
  const batchCsvFile = useApplicationStore((state) => state.batchCsvFile);
  const setUploadMode = useApplicationStore((state) => state.setUploadMode);
  const updateSingleField = useApplicationStore((state) => state.updateSingleField);
  const addSingleFiles = useApplicationStore((state) => state.addSingleFiles);
  const loadSingleDemoDraft = useApplicationStore((state) => state.loadSingleDemoDraft);
  const updateSingleImageLabel = useApplicationStore((state) => state.updateSingleImageLabel);
  const removeSingleImage = useApplicationStore((state) => state.removeSingleImage);
  const submitSingleUpload = useApplicationStore((state) => state.submitSingleUpload);
  const setBatchZipFile = useApplicationStore((state) => state.setBatchZipFile);
  const setBatchCsvFile = useApplicationStore((state) => state.setBatchCsvFile);
  const submitBatchUpload = useApplicationStore((state) => state.submitBatchUpload);

  const hasSingleData = Object.keys(emptySubmittedData).some(
    (key) => singleForm[key as keyof SubmittedApplicationData].trim().length > 0
  );
  const canSubmitSingle =
    singleForm.applicant_name.trim().length > 0 &&
    singleForm.product_name.trim().length > 0 &&
    singleForm.brand_name.trim().length > 0 &&
    singleImages.length > 0;
  const canSubmitBatch = Boolean(batchZipFile && batchCsvFile);
  const selectedSingleDemo =
    singleDemoPresets.find((preset) => preset.id === singleDemoPresetId) ?? singleDemoPresets[0];
  const selectedBatchDemo =
    batchDemoPresets.find((preset) => preset.id === batchDemoPresetId) ?? batchDemoPresets[0];

  async function handleLoadSingleDemo() {
    setIsDemoLoading(true);
    setDemoSummary(null);
    try {
      const demo = await createSingleDemoDraft(selectedSingleDemo);
      loadSingleDemoDraft(demo.submittedData, demo.images);
      setDemoSummary(
        `Loaded ${selectedSingleDemo.name} with ${demo.images.length} generated image${
          demo.images.length === 1 ? "" : "s"
        }.`
      );
    } catch (error) {
      setDemoSummary(error instanceof Error ? error.message : "Could not load the single demo preset.");
    } finally {
      setIsDemoLoading(false);
    }
  }

  async function handleLoadBatchDemo() {
    setIsDemoLoading(true);
    setDemoSummary(null);
    try {
      const demo = await createBatchDemoFiles(selectedBatchDemo);
      setBatchZipFile(demo.zipFile);
      setBatchCsvFile(demo.csvFile);
      setDemoSummary(
        `Loaded ${demo.presetName}: ${demo.applicationCount} applications with ${demo.imageCount} generated images.`
      );
    } catch (error) {
      setDemoSummary(error instanceof Error ? error.message : "Could not load the batch demo files.");
    } finally {
      setIsDemoLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Application Intake</p>
          <h1>Upload Applications</h1>
          <p>Submit a single application with labeled images, or stage a batch from a ZIP and CSV.</p>
        </div>
        <Link className="secondary-link" href="/applications">
          View queue
        </Link>
      </header>

      <section className="upload-tabs" aria-label="Upload mode">
        <button
          className={uploadMode === "single" ? "tab-button active" : "tab-button"}
          onClick={() => setUploadMode("single")}
        >
          <Images aria-hidden="true" size={18} />
          Single upload
        </button>
        <button
          className={uploadMode === "batch" ? "tab-button active" : "tab-button"}
          onClick={() => setUploadMode("batch")}
        >
          <FileArchive aria-hidden="true" size={18} />
          Batch upload
        </button>
      </section>

      <aside className="demo-float" aria-label="Demo presets">
        {uploadMode === "single" ? (
          <>
            <select
              value={singleDemoPresetId}
              onChange={(event) => setSingleDemoPresetId(event.target.value)}
              title="Single upload demo preset"
              aria-label="Single upload demo preset"
            >
              {singleDemoPresets.map((preset) => (
                <option value={preset.id} key={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <button
              className="demo-float-button"
              type="button"
              onClick={handleLoadSingleDemo}
              disabled={isDemoLoading}
              title={`Load single demo: ${selectedSingleDemo.name}`}
              aria-label={`Load single demo: ${selectedSingleDemo.name}`}
            >
              <Sparkles aria-hidden="true" size={18} />
              Add Data for Demo
            </button>
          </>
        ) : (
          <>
            <select
              value={batchDemoPresetId}
              onChange={(event) => setBatchDemoPresetId(event.target.value)}
              title="Batch upload demo preset"
              aria-label="Batch upload demo preset"
            >
              {batchDemoPresets.map((preset) => (
                <option value={preset.id} key={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <button
              className="demo-float-button"
              type="button"
              onClick={handleLoadBatchDemo}
              disabled={isDemoLoading}
              title={`Load batch demo: ${selectedBatchDemo.name}`}
              aria-label={`Load batch demo: ${selectedBatchDemo.name}`}
            >
              <FileArchive aria-hidden="true" size={18} />
              Add Batch Demo Data
            </button>
          </>
        )}
      </aside>

      {demoSummary ? <div className="success-strip">{demoSummary}</div> : null}

      {uploadMode === "single" ? (
        <section className="upload-grid">
          <section className="upload-panel">
            <div className="section-heading">
              <h2>Application Information</h2>
              <span>{hasSingleData ? "Draft" : "Empty"}</span>
            </div>
            <div className="form-grid">
              {uploadFields.map((field) => (
                <label className="field-label" key={field.key}>
                  {field.label}
                  <input
                    value={singleForm[field.key]}
                    onChange={(event) => updateSingleField(field.key, event.target.value)}
                    placeholder={field.placeholder}
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="upload-panel">
            <div className="section-heading">
              <h2>Label Images</h2>
              <span>{singleImages.length || "No"} images</span>
            </div>
            <div className="drop-panel">
              <FileUp aria-hidden="true" size={26} />
              <span>Upload label images</span>
              <button
                className="secondary-button"
                type="button"
                onClick={() => singleImageInputRef.current?.click()}
              >
                Choose images
              </button>
              <input
                ref={singleImageInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  if (event.currentTarget.files) {
                    addSingleFiles(event.currentTarget.files);
                  }
                }}
              />
            </div>

            <div className="image-draft-list">
              {singleImages.map((image) => (
                <article className="image-draft-row" key={image.id}>
                  <img src={image.preview_url} alt={image.original_filename} />
                  <div>
                    <strong>{image.original_filename}</strong>
                    <label className="select-label">
                      Label
                      <select
                        value={image.label_type}
                        onChange={(event) =>
                          updateSingleImageLabel(image.id, event.target.value as LabelType)
                        }
                      >
                        {labelTypeOptions.map((option) => (
                          <option value={option.value} key={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button
                    className="icon-button"
                    onClick={() => removeSingleImage(image.id)}
                    aria-label={`Remove ${image.original_filename}`}
                    title="Remove image"
                  >
                    <Trash2 aria-hidden="true" size={18} />
                  </button>
                </article>
              ))}
            </div>

            <div className="upload-actions">
              <button className="primary-button" disabled={!canSubmitSingle} onClick={submitSingleUpload}>
                <Send aria-hidden="true" size={18} />
                Submit Application
              </button>
            </div>
          </section>
        </section>
      ) : (
        <section className="upload-grid batch-grid">
          <section className="upload-panel">
            <div className="section-heading">
              <h2>Batch Files</h2>
              <span>{canSubmitBatch ? "Ready" : "Waiting for files"}</span>
            </div>
            <div className="batch-file-grid">
              <label className="file-picker">
                <FileArchive aria-hidden="true" size={24} />
                <span>Images ZIP</span>
                <strong>{batchZipFile?.name || "Choose ZIP file"}</strong>
                <input
                  type="file"
                  accept=".zip"
                  onChange={(event) => setBatchZipFile(event.currentTarget.files?.[0])}
                />
              </label>
              <label className="file-picker">
                <FileSpreadsheet aria-hidden="true" size={24} />
                <span>Application CSV</span>
                <strong>{batchCsvFile?.name || "Choose CSV file"}</strong>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setBatchCsvFile(event.currentTarget.files?.[0])}
                />
              </label>
            </div>
            <div className="csv-format">
              <strong>CSV columns</strong>
              <p>
                One row per application. Image columns can repeat by label, such as front_image_1,
                front_image_2, back_image_1, neck_image_1, and government_warning_image_1.
              </p>
            </div>
            <div className="upload-actions">
              <button className="primary-button" disabled={!canSubmitBatch} onClick={submitBatchUpload}>
                <Send aria-hidden="true" size={18} />
                Submit Batch
              </button>
            </div>
          </section>

          <section className="upload-panel">
            <div className="section-heading">
              <h2>Batch Mapping</h2>
              <span>Parsed on submit</span>
            </div>
            <div className="batch-preview-list">
              <div className="empty-panel">
                The backend parses the CSV, matches listed image filenames inside the ZIP, uploads those images to
                storage, and creates pending applications in Supabase.
              </div>
              {batchZipFile ? (
                <span className="label-chip">ZIP: {batchZipFile.name}</span>
              ) : null}
              {batchCsvFile ? (
                <span className="label-chip">CSV: {batchCsvFile.name}</span>
              ) : null}
            </div>
          </section>
        </section>
      )}
    </main>
  );
}
