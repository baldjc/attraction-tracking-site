"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AiThinking } from "@/components/ai/AiThinking";
import { useAiThinking } from "@/lib/use-ai-thinking";
import {
  CANONICAL_FIELDS,
  OPTIONAL_FIELDS,
  FIELD_LABELS,
  type ColumnMapping,
  type AnyMappedField,
} from "@/lib/market-config";

interface Props {
  existingMapping: ColumnMapping | null;
  hasColumnMapping: boolean;
}

interface SelectedFile {
  file: File;
  monthYear: string; // YYYY-MM or "" if undetected
  label: string;
  detectedConfidence: "filename" | "guessed";
}

function detectMonthYear(name: string): {
  monthYear: string;
  confidence: "filename" | "guessed";
} {
  const base = name.replace(/\.[^.]+$/, "").toLowerCase();
  const iso = base.match(/(20\d{2})[-_./]?(0[1-9]|1[0-2])/);
  if (iso) return { monthYear: `${iso[1]}-${iso[2]}`, confidence: "filename" };

  // Month-first long year: 04-2026, 04_2026, 04.2026, 04/2026
  const mmYyyy = base.match(/(?<![0-9])(0[1-9]|1[0-2])[-_./](20\d{2})(?![0-9])/);
  if (mmYyyy) {
    return { monthYear: `${mmYyyy[2]}-${mmYyyy[1]}`, confidence: "filename" };
  }

  // Month-first short year: 04-26, 04_26, 04.26, 04/26 — assume 20YY
  const mmYy = base.match(/(?<![0-9])(0[1-9]|1[0-2])[-_./](\d{2})(?![0-9])/);
  if (mmYy) {
    return { monthYear: `20${mmYy[2]}-${mmYy[1]}`, confidence: "filename" };
  }

  const months: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4,
    april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
    dec: 12, december: 12,
  };
  const wordMatch = base.match(
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s\-_]?(20\d{2})/,
  );
  if (wordMatch) {
    const m = months[wordMatch[1]];
    if (m) {
      return {
        monthYear: `${wordMatch[2]}-${String(m).padStart(2, "0")}`,
        confidence: "filename",
      };
    }
  }
  return { monthYear: "", confidence: "guessed" };
}

function compareMonthYear(a: string, b: string): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

export default function UploadPanel({
  existingMapping,
  hasColumnMapping,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<SelectedFile[]>([]);
  const [stage, setStage] = useState<"picking" | "mapping" | "uploading">(
    "picking",
  );
  const [error, setError] = useState<string | null>(null);
  const [proposedHeaders, setProposedHeaders] = useState<string[]>([]);
  const [proposedMapping, setProposedMapping] = useState<ColumnMapping>({});

  const thinking = useAiThinking({
    mode: "phase",
    fallbackPhases: [
      "Reading your CSV headers…",
      "Asking Claude to match columns…",
      "Reviewing the proposed mapping…",
    ],
  });

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (files.length > 24) {
      setError("Up to 24 files at once.");
      return;
    }
    setError(null);
    const next: SelectedFile[] = files.map((f) => {
      const det = detectMonthYear(f.name);
      return {
        file: f,
        monthYear: det.monthYear,
        label: det.monthYear || f.name.replace(/\.[^.]+$/, ""),
        detectedConfidence: det.confidence,
      };
    });
    next.sort((a, b) => compareMonthYear(a.monthYear, b.monthYear));
    setSelected(next);
  }

  const oldestFile = useMemo<SelectedFile | null>(() => {
    if (selected.length === 0) return null;
    return selected[0]; // already sorted ascending
  }, [selected]);

  function updateFile(i: number, patch: Partial<SelectedFile>) {
    const next = [...selected];
    const merged = { ...next[i], ...patch };
    // If the user just provided a monthYear that we couldn't detect, upgrade
    // confidence so downstream consumers don't see a stale "guessed" flag.
    if (
      patch.monthYear &&
      !next[i].monthYear &&
      next[i].detectedConfidence === "guessed"
    ) {
      merged.detectedConfidence = "filename";
    }
    next[i] = merged;
    setSelected(next);
  }

  function removeFile(i: number) {
    const next = selected.filter((_, idx) => idx !== i);
    setSelected(next);
  }

  async function onContinue() {
    setError(null);
    if (selected.length === 0) return;

    if (hasColumnMapping) {
      // Skip mapping — go straight to upload.
      await doFinalUpload(null);
      return;
    }

    // Need a mapping. Send the oldest file to suggest-mapping.
    if (!oldestFile) return;
    thinking.start();
    setStage("mapping");
    try {
      const fd = new FormData();
      fd.append("file", oldestFile.file);
      const res = await fetch("/api/member/market-data/suggest-mapping", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not analyze the CSV.");
      }
      const data = (await res.json()) as {
        headers: string[];
        suggestedMapping: ColumnMapping;
      };
      setProposedHeaders(data.headers);
      setProposedMapping(data.suggestedMapping);
    } catch (e) {
      setError((e as Error).message);
      setStage("picking");
    } finally {
      thinking.stop();
    }
  }

  function setMappingField(field: AnyMappedField, header: string) {
    setProposedMapping({
      ...proposedMapping,
      [field]: header === "" ? undefined : header,
    });
  }

  async function doFinalUpload(mapping: ColumnMapping | null) {
    setStage("uploading");
    try {
      const fd = new FormData();
      for (const s of selected) fd.append("files", s.file);
      fd.append("labels", JSON.stringify(selected.map((s) => s.label)));
      fd.append(
        "monthYears",
        JSON.stringify(selected.map((s) => s.monthYear)),
      );
      if (mapping) fd.append("columnMapping", JSON.stringify(mapping));
      const res = await fetch("/api/member/market-data/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Upload failed.");
      }
      // Reset + refresh history
      setSelected([]);
      setStage("picking");
      setProposedHeaders([]);
      setProposedMapping({});
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setStage(hasColumnMapping ? "picking" : "mapping");
    }
  }

  async function onConfirmMapping() {
    setError(null);
    const missing = CANONICAL_FIELDS.filter((f) => !proposedMapping[f]);
    if (missing.length > 0) {
      setError(
        `Map all required fields: ${missing.map((f) => FIELD_LABELS[f]).join(", ")}`,
      );
      return;
    }
    await doFinalUpload(proposedMapping);
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
        Upload market data
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
        Drop your latest monthly CSV — or up to 24 months at once for a
        historical backfill.
      </p>

      {stage === "picking" && (
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="sr-only">Choose CSV files</span>
            <input
              type="file"
              accept=".csv,text/csv"
              multiple
              onChange={onPickFiles}
              className="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-blue-700"
            />
          </label>

          {selected.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {selected.length} file{selected.length === 1 ? "" : "s"} ready —
                oldest first
              </div>
              <ul className="divide-y divide-gray-200 dark:divide-gray-800 rounded-md border border-gray-200 dark:border-gray-800">
                {selected.map((s, i) => (
                  <li
                    key={i}
                    className="grid grid-cols-12 gap-2 items-center px-3 py-2 text-sm"
                  >
                    <span className="col-span-5 truncate text-gray-800 dark:text-gray-200">
                      {s.file.name}
                    </span>
                    <input
                      type="month"
                      value={s.monthYear}
                      onChange={(e) =>
                        updateFile(i, { monthYear: e.target.value })
                      }
                      className="col-span-3 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                    />
                    <input
                      type="text"
                      value={s.label}
                      onChange={(e) => updateFile(i, { label: e.target.value })}
                      className="col-span-3 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                      placeholder="Label"
                    />
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="col-span-1 text-xs text-gray-400 hover:text-red-500"
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                    {s.detectedConfidence === "guessed" && !s.monthYear && (
                      <span className="col-span-12 text-[11px] text-amber-600 dark:text-amber-400">
                        ⚠ Couldn't detect month from filename — please confirm.
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={onContinue}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
                >
                  {hasColumnMapping
                    ? `Upload ${selected.length} file${selected.length === 1 ? "" : "s"}`
                    : "Continue"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {stage === "mapping" && (
        <div className="mt-4 space-y-3">
          {thinking.isThinking ? (
            <AiThinking mode="phase" phaseLabel={thinking.phaseLabel} />
          ) : (
            <>
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Confirm how your CSV columns map to our canonical fields. We'll
                save this so you don't see this step again.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[...CANONICAL_FIELDS, ...OPTIONAL_FIELDS].map((f) => {
                  const required = (CANONICAL_FIELDS as readonly string[]).includes(
                    f,
                  );
                  return (
                    <label key={f} className="block text-sm">
                      <span className="text-gray-700 dark:text-gray-300">
                        {FIELD_LABELS[f]}
                        {required && (
                          <span className="text-red-500"> *</span>
                        )}
                      </span>
                      <select
                        value={proposedMapping[f] ?? ""}
                        onChange={(e) =>
                          setMappingField(f, e.target.value)
                        }
                        className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                      >
                        <option value="">— not in this CSV —</option>
                        {proposedHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStage("picking")}
                  className="text-sm text-gray-500 hover:underline"
                >
                  ← Back to files
                </button>
                <button
                  type="button"
                  onClick={onConfirmMapping}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
                >
                  Save mapping & upload {selected.length} file
                  {selected.length === 1 ? "" : "s"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {stage === "uploading" && (
        <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
          Uploading {selected.length} file{selected.length === 1 ? "" : "s"}…
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}
    </section>
  );
}
