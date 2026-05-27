"use client";

import { useState, useRef, useCallback, ChangeEvent, DragEvent } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { DocumentArrowUpIcon, XMarkIcon } from "@heroicons/react/24/outline";
import MarkdownTextarea from "@/components/MarkdownTextarea";
import { AiThinking } from "@/components/ai/AiThinking";

interface Props {
  onSubmit: (data: {
    propertyAddress: string;
    price: string;
    propertyType: string;
    keyFeatures: string;
    neighbourhoodHighlights: string;
    mlsRemarks: string;
    creatorOpinion: string;
    extractedFileText: string;
  }) => void;
  loading: boolean;
}

interface UploadedFile {
  file: File;
  extractedText?: string;
  error?: string;
}

const PROPERTY_TYPES = ["Detached", "Semi-Detached", "Townhome", "Condo", "Duplex", "Acreage", "Other"];
const ALLOWED_EXTENSIONS = ["pdf", "docx", "txt", "md", "csv", "xlsx", "xls"];
const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ListingInputPhase({ onSubmit, loading }: Props) {
  const [propertyAddress, setPropertyAddress] = useState("");
  const [price, setPrice] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [keyFeatures, setKeyFeatures] = useState("");
  const [neighbourhoodHighlights, setNeighbourhoodHighlights] = useState("");
  const [mlsRemarks, setMlsRemarks] = useState("");
  const [creatorOpinion, setCreatorOpinion] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ext = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    setFileError("");
    const next = [...files];
    for (const file of Array.from(incoming)) {
      if (next.length >= MAX_FILES) { setFileError(`Maximum ${MAX_FILES} files allowed.`); break; }
      if (!ALLOWED_EXTENSIONS.includes(ext(file.name))) {
        setFileError(`Unsupported file type: .${ext(file.name)}. Use PDF, DOCX, XLSX, CSV, TXT, or MD.`);
        continue;
      }
      if (file.size > MAX_BYTES) { setFileError(`"${file.name}" exceeds the 10 MB limit.`); continue; }
      if (!next.find((f) => f.file.name === file.name)) next.push({ file });
    }
    setFiles(next);
  }, [files]);

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.file.name !== name));
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }

  const canSubmit = propertyAddress.trim() && price.trim() && propertyType && !loading && !uploading;

  async function handleSubmit() {
    if (!canSubmit) return;

    let extractedFileText = "";
    if (files.length > 0) {
      setUploading(true);
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f.file));
      try {
        const res = await fetch("/api/ai-tools/arc-script-builder/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.results) {
          for (const r of data.results) {
            if (r.text) extractedFileText += `\n\n--- ${r.filename} ---\n${r.text}`;
          }
        }
      } catch {
        setFileError("Failed to read files. Try pasting the text directly instead.");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    onSubmit({
      propertyAddress: propertyAddress.trim(),
      price: price.trim(),
      propertyType,
      keyFeatures: keyFeatures.trim(),
      neighbourhoodHighlights: neighbourhoodHighlights.trim(),
      mlsRemarks: mlsRemarks.trim(),
      creatorOpinion: creatorOpinion.trim(),
      extractedFileText,
    });
  }

  const inputClass = "w-full bg-white dark:bg-[#0f1419] border border-[var(--abv-text)]/20 dark:border-white/20 rounded-lg px-4 py-3 text-sm text-[var(--abv-text)] dark:text-white placeholder-[var(--abv-text)]/30 dark:placeholder-white/30 focus:outline-none focus:border-[var(--abv-ai-tools)] transition-colors";
  const labelClass = "block text-sm font-semibold text-[var(--abv-text)] dark:text-white mb-1.5";

  return (
    <div className="space-y-5">
      {/* Required fields */}
      <div>
        <label className={labelClass}>
          Property Address or Area <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={propertyAddress}
          onChange={(e) => setPropertyAddress(e.target.value)}
          placeholder="e.g. 123 Mahogany Blvd SE, Calgary — or just: Mahogany, Calgary"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>
            Price <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. $875,000"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>
            Property Type <span className="text-red-500">*</span>
          </label>
          <select
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
            className={inputClass}
          >
            <option value="">— Select type —</option>
            {PROPERTY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Optional expandable details */}
      <div className="border border-[var(--abv-text)]/10 dark:border-white/10 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDetails((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--abv-text)] dark:text-white hover:bg-[var(--abv-ai-tools)]/5 transition-colors"
        >
          <span>Add More Details <span className="text-[var(--abv-text)]/40 dark:text-white/40 font-normal">(optional — improves results)</span></span>
          {showDetails
            ? <ChevronUpIcon className="w-4 h-4 text-[var(--abv-text)]/40" />
            : <ChevronDownIcon className="w-4 h-4 text-[var(--abv-text)]/40" />}
        </button>

        {showDetails && (
          <div className="px-4 pb-4 space-y-4 border-t border-[var(--abv-text)]/8 dark:border-white/8">
            <div className="pt-3">
              <label className={labelClass}>Key Features</label>
              <MarkdownTextarea
                value={keyFeatures}
                onChange={setKeyFeatures}
                placeholder="e.g. 4 bed, 3 bath, finished basement, pie lot, walkout, built 2019"
                rows={2}
                ariaLabel="Key Features"
              />
            </div>

            <div>
              <label className={labelClass}>Neighbourhood Highlights</label>
              <MarkdownTextarea
                value={neighbourhoodHighlights}
                onChange={setNeighbourhoodHighlights}
                placeholder="e.g. Close to 3 top-rated schools, lake access, 10 min to Deerfoot"
                rows={2}
                ariaLabel="Neighbourhood Highlights"
              />
            </div>

            <div>
              <label className={labelClass}>MLS Remarks / Listing Description</label>
              <MarkdownTextarea
                value={mlsRemarks}
                onChange={setMlsRemarks}
                placeholder="Paste from MLS — the AI will extract what it needs"
                rows={4}
                ariaLabel="MLS Remarks"
              />
            </div>

            <div>
              <label className={labelClass}>Why This Property Stands Out</label>
              <MarkdownTextarea
                value={creatorOpinion}
                onChange={setCreatorOpinion}
                placeholder="Your opinion on what makes it special — this adds your unique voice"
                rows={2}
                ariaLabel="Why This Property Stands Out"
              />
            </div>

            {/* File upload */}
            <div>
              <label className={labelClass}>
                Upload Files <span className="text-[var(--abv-text)]/40 dark:text-white/40 font-normal">(PDF, DOCX, XLSX, CSV, TXT — max 3 files)</span>
              </label>
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? "border-[var(--abv-ai-tools)] bg-[var(--abv-ai-tools)]/5"
                    : "border-[var(--abv-text)]/15 dark:border-white/15 hover:border-[var(--abv-ai-tools)]/50"
                }`}
              >
                <DocumentArrowUpIcon className="w-7 h-7 text-[var(--abv-text)]/30 dark:text-white/30 mx-auto mb-1.5" />
                <p className="text-sm text-[var(--abv-text)]/50 dark:text-white/50">
                  Drag files here or <span className="text-[var(--abv-ai-tools)] font-medium">click to browse</span>
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => addFiles(e.target.files)}
                />
              </div>
              {fileError && <p className="text-xs text-red-600 mt-1">{fileError}</p>}
              {files.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {files.map((f) => (
                    <li key={f.file.name} className="flex items-center gap-2 bg-white dark:bg-[#1a1a1a] border border-[var(--abv-text)]/10 dark:border-white/10 rounded-lg px-3 py-2">
                      <DocumentArrowUpIcon className="w-4 h-4 text-[var(--abv-ai-tools)] shrink-0" />
                      <span className="text-sm text-[var(--abv-text)] dark:text-white flex-1 truncate">{f.file.name}</span>
                      <span className="text-xs text-[var(--abv-text)]/40 dark:text-white/40">{formatBytes(f.file.size)}</span>
                      <button onClick={() => removeFile(f.file.name)} className="text-[var(--abv-text)]/30 hover:text-red-500 transition-colors">
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full py-3 px-4 bg-[var(--abv-ai-tools)] hover:bg-[#5a8fb3] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-sm"
      >
        {uploading ? "Reading files…" : loading ? "Building your video concepts…" : "Build My Video Concept"}
      </button>
      {loading && (
        <div className="mt-3">
          <AiThinking mode="phase" phaseLabel="Building your video concepts…" />
        </div>
      )}
    </div>
  );
}
