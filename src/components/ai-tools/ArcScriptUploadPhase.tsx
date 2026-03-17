"use client";

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from "react";
import { DocumentArrowUpIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface UploadedFile {
  file: File;
  extractedText?: string;
  error?: string;
}

interface StartBuildingData {
  title: string;
  talkingPoints: string;
  researchSummary: string;
}

interface Props {
  onStartBuilding: (data: StartBuildingData) => void;
  cap?: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function estimatePct(files: File[], pastedText: string, cap: number): string {
  const totalBytes = files.reduce((s, f) => s + f.size, 0) + pastedText.length;
  const estimatedTokens = Math.ceil(totalBytes / 4);
  // summarize call + 8 chat turns avg ~800 tokens each side
  const totalTokens = estimatedTokens + 8 * 800 * 2;
  const cost = (totalTokens / 1_000_000) * 9; // blended rate
  if (cost < 0.005) return "";
  const pct = cap > 0 ? ((cost / cap) * 100).toFixed(1) : null;
  return pct ? `~${pct}% of your monthly allowance (approximate)` : "";
}

const ALLOWED_EXTENSIONS = ["pdf", "docx", "txt", "md"];
const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;

export default function ArcScriptUploadPhase({ onStartBuilding, cap = 15 }: Props) {
  const [title, setTitle] = useState("");
  const [talkingPoints, setTalkingPoints] = useState("");
  const [pastedNotes, setPastedNotes] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const costEstimate = estimatePct(
    files.map((f) => f.file),
    pastedNotes,
    cap
  );

  const ext = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    setError("");
    const next = [...files];
    for (const file of Array.from(incoming)) {
      if (next.length >= MAX_FILES) {
        setError(`Maximum ${MAX_FILES} files allowed.`);
        break;
      }
      if (!ALLOWED_EXTENSIONS.includes(ext(file.name))) {
        setError(`Unsupported file type: .${ext(file.name)}. Use PDF, DOCX, TXT, or MD.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError(`${file.name} exceeds the 10 MB limit.`);
        continue;
      }
      if (next.find((f) => f.file.name === file.name)) continue;
      next.push({ file });
    }
    setFiles(next);
  }, [files]);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.file.name !== name));
  };

  const canStart =
    title.trim().length > 0 && (files.length > 0 || pastedNotes.trim().length > 0);

  async function handleStart() {
    if (!canStart || loading) return;
    setLoading(true);
    setError("");

    try {
      // Step 1: Upload files (if any)
      let extractedParts: string[] = [];

      if (files.length > 0) {
        setLoadingStep("Extracting text from files…");
        const formData = new FormData();
        files.forEach((f) => formData.append("files", f.file));

        const uploadRes = await fetch("/api/ai-tools/arc-script-builder/upload", {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes.json();

        if (!uploadRes.ok) {
          setError(uploadData.error ?? "File upload failed.");
          setLoading(false);
          return;
        }

        for (const result of uploadData.results ?? []) {
          if (result.text) {
            extractedParts.push(`[From ${result.filename}]\n${result.text}`);
          } else if (result.error) {
            setError(`${result.filename}: ${result.error}`);
          }
        }
      }

      // Combine all research text
      if (pastedNotes.trim()) {
        extractedParts.push(`[Pasted Notes]\n${pastedNotes.trim()}`);
      }
      const researchText = extractedParts.join("\n\n---\n\n");

      // Step 2: Summarize
      setLoadingStep("Summarizing research with AI…");
      const summaryRes = await fetch("/api/ai-tools/arc-script-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "summarize", researchText, title: title.trim(), talkingPoints: talkingPoints.trim() }),
      });

      if (summaryRes.status === 429) {
        const data = await summaryRes.json();
        setError(
          data.error === "monthly_cap_reached"
            ? `You've reached your monthly AI usage limit. It resets on ${data.resetsAt}.`
            : "Monthly limit reached."
        );
        setLoading(false);
        return;
      }

      if (!summaryRes.ok) {
        setError("Failed to summarize research. Please try again.");
        setLoading(false);
        return;
      }

      const summaryData = await summaryRes.json();
      onStartBuilding({
        title: title.trim(),
        talkingPoints: talkingPoints.trim(),
        researchSummary: summaryData.summary ?? researchText,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Title */}
      <div>
        <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">
          What&apos;s your video title? <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Why 90% of Real Estate Agents Fail in Year 2"
          className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] transition-colors"
        />
      </div>

      {/* Talking Points */}
      <div>
        <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">
          Key talking points{" "}
          <span className="text-[#1e2a38]/40 font-normal">(optional but encouraged)</span>
        </label>
        <textarea
          value={talkingPoints}
          onChange={(e) => setTalkingPoints(e.target.value)}
          placeholder="What insights, tips, or points do you want to cover? One per line is fine."
          rows={3}
          className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 resize-none focus:outline-none focus:border-[#3dc3ff] transition-colors"
        />
      </div>

      {/* File Upload Zone */}
      <div>
        <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">
          Upload research files{" "}
          <span className="text-[#1e2a38]/40 font-normal">(PDF, DOCX, TXT, MD — max 3 files, 10 MB each)</span>
        </label>

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
            isDragging
              ? "border-[#3dc3ff] bg-[#3dc3ff]/5"
              : "border-[#1e2a38]/15 hover:border-[#3dc3ff]/50 hover:bg-[#3dc3ff]/3"
          }`}
        >
          <DocumentArrowUpIcon className="w-8 h-8 text-[#1e2a38]/30 mx-auto mb-2" />
          <p className="text-sm text-[#1e2a38]/50">
            Drag and drop files here, or{" "}
            <span className="text-[#3dc3ff] font-medium">click to browse</span>
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md"
            className="hidden"
            onChange={(e: ChangeEvent<HTMLInputElement>) => addFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <ul className="mt-3 space-y-2">
            {files.map((f) => (
              <li
                key={f.file.name}
                className="flex items-center gap-3 bg-white border border-[#1e2a38]/10 rounded-xl px-4 py-2.5"
              >
                <DocumentArrowUpIcon className="w-4 h-4 text-[#3dc3ff] flex-shrink-0" />
                <span className="text-sm text-[#1e2a38] flex-1 truncate">{f.file.name}</span>
                <span className="text-xs text-[#1e2a38]/40 flex-shrink-0">{formatBytes(f.file.size)}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(f.file.name); }}
                  className="text-[#1e2a38]/30 hover:text-red-500 transition-colors"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Research Notes */}
      <div>
        <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">
          Paste your research notes{" "}
          <span className="text-[#1e2a38]/40 font-normal">(or paste content from scanned PDFs)</span>
        </label>
        <textarea
          value={pastedNotes}
          onChange={(e) => setPastedNotes(e.target.value)}
          placeholder="Paste any research, notes, stats, quotes, or article content here…"
          rows={8}
          className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 resize-none focus:outline-none focus:border-[#3dc3ff] transition-colors"
        />
      </div>

      {/* Cost Estimate */}
      {costEstimate && (
        <p className="text-xs text-[#1e2a38]/50 text-right">{costEstimate}</p>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* CTA */}
      <button
        onClick={handleStart}
        disabled={!canStart || loading}
        className="w-full bg-[#3dc3ff] text-white font-semibold py-3.5 rounded-xl hover:bg-[#3dc3ff]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-white/70 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </span>
            {loadingStep || "Working…"}
          </>
        ) : (
          <>Start Building →</>
        )}
      </button>

      {!canStart && !loading && (
        <p className="text-center text-xs text-[#1e2a38]/35">
          Add a video title and at least one file or some research notes to continue.
        </p>
      )}
    </div>
  );
}
