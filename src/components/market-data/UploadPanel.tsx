"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AiThinking } from "@/components/ai/AiThinking";
import { useAiThinking } from "@/lib/use-ai-thinking";
import { type ColumnMapping } from "@/lib/market-config";
import { Button } from "@/components/ui/Button";
import Notice, { NOTICE_PILL_CLASS } from "@/components/ui/Notice";
import ColumnMapper from "@/components/market-data/ColumnMapper";
import StatusMapper, {
  type UnknownStatusValue,
} from "@/components/market-data/StatusMapper";
import UploadPreview, {
  type PreviewCounts,
  type SampleRowField,
} from "@/components/market-data/UploadPreview";
import {
  mergeConfirmationsIntoMapping,
  type StatusMapping,
  type MappableBucket,
} from "@/lib/market-status-buckets";
import { formatActionImpactPercent } from "@/lib/cost-display";

/** Shape of POST /api/member/market-data/analyze. */
interface AnalyzeResult {
  filename: string;
  rowCount: number;
  headers: string[];
  columnMapping: ColumnMapping;
  suggestedColumnMapping: ColumnMapping;
  columnMappingComplete: boolean;
  missingRequiredFields: string[];
  statusColumnFound: boolean;
  resolvedStatusMapping: StatusMapping;
  statusValues: Array<{
    value: string;
    count: number;
    bucket: string;
    alreadyMapped: boolean;
    proposed: MappableBucket | null;
  }>;
  unknownCount: number;
  previewCounts: PreviewCounts & { unknown: number };
  sampleRow: SampleRowField[];
}

interface Props {
  existingMapping: ColumnMapping | null;
  hasColumnMapping: boolean;
  /** Per-tier batch limit, supplied by the server (page.tsx). */
  maxUploadBatch: number;
}

interface SelectedFile {
  file: File;
  monthYear: string; // YYYY-MM or "" if undetected
  label: string;
  detectedConfidence: "filename" | "guessed";
  /** Approximate row count (newline scan, async). undefined while computing,
   *  null if computation failed. */
  rowCount?: number | null;
}

/** Member-facing soft cap. Above this we surface a "filter your territory"
 *  warning before submit — but we never block, because the back-end retry
 *  with adaptive thresholds can still get unusually wide markets through. */
const LARGE_FILE_ROW_THRESHOLD = 12_000;

async function approximateRowCount(file: File): Promise<number | null> {
  try {
    // Stream the file and count newlines without decoding to text — fast
    // even for the 30MB+ MLS exports we get from big-metro brokerages.
    const reader = file.stream().getReader();
    let count = 0;
    let lastByte = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      for (let i = 0; i < value.length; i++) {
        if (value[i] === 0x0a /* \n */) count++;
        lastByte = value[i];
      }
    }
    // If the last byte wasn't a newline, the final record is unterminated.
    if (lastByte !== 0x0a && file.size > 0) count++;
    // Subtract the header row (every MLS export has one).
    return Math.max(0, count - 1);
  } catch {
    return null;
  }
}

interface ConflictRow {
  id: string;
  monthYear: string;
  status: string;
  label: string;
  factCount: number;
  storyLeadCount: number;
}

/** Default per-month estimate used when the server hasn't told us a member-
 *  specific average yet (e.g. very first replace before any history). Matches
 *  the server-side fallback in averageRecentValidationCostUsd(). */
const DEFAULT_AVG_COST_USD = 2.75;

/** Bulk-treatment threshold — at or above this many conflicts, the dialog
 *  switches to the louder "this is unrecoverable" framing per spec. */
const BULK_REPLACE_THRESHOLD = 3;

interface ReplaceDialogState {
  targets: ConflictRow[];
  totalFacts: number;
  totalLeads: number;
  estimatedCost: number;
  capUsd: number;
  isBulk: boolean;
}

/** Drives the interactive column-mapper. `context` distinguishes the three
 *  entry points so the mapper can word its copy + Save action appropriately:
 *   - "initial":   first upload, no saved mapping yet (seeded by AI suggestion)
 *   - "preflight": an upload failed because columns couldn't be matched
 *   - "proactive": member is editing the saved mapping from the panel, no upload
 */
interface MapperState {
  headers: string[];
  initialMapping: ColumnMapping | null;
  context: "initial" | "preflight" | "proactive";
  filename?: string;
  banner?: {
    message: string;
    detail?: string;
    suggestion?: string;
    // Confirmable warnings (e.g. neighbourhood column looks numeric) render an
    // explicit "upload anyway" action so the member can knowingly proceed.
    confirm?: { label: string; onConfirm: () => void };
  };
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
  maxUploadBatch,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<SelectedFile[]>([]);
  const [stage, setStage] = useState<"picking" | "uploading">("picking");
  const [error, setError] = useState<string | null>(null);
  const [mapper, setMapper] = useState<MapperState | null>(null);
  const [mapperSaving, setMapperSaving] = useState(false);
  const proactiveInputRef = useRef<HTMLInputElement>(null);
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [preflightError, setPreflightError] = useState<{
    code: string;
    filename: string;
    message: string;
    detail: string;
    suggestion?: string;
  } | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  /** Member's recent per-month validator cost, captured from the 409 payload
   *  on a duplicate-month conflict. Drives the dialog's $ estimate. */
  const [recentAvgCostUsd, setRecentAvgCostUsd] =
    useState<number>(DEFAULT_AVG_COST_USD);
  const [costCapUsd, setCostCapUsd] = useState<number>(0);
  const [replaceDialog, setReplaceDialog] = useState<ReplaceDialogState | null>(
    null,
  );
  /** True while the bulk-delete loop is mid-flight — every Replace button is
   *  disabled so a user can't double-fire while we're churning DELETEs. */
  const [bulkReplacing, setBulkReplacing] = useState(false);
  // Mapping last sent to doFinalUpload — captured so the Replace UX can
  // auto-retry the same POST after the conflicting upload is deleted.
  const [lastMapping, setLastMapping] = useState<ColumnMapping | null>(null);
  // After a successful async upload we surface a calm note: once validation
  // finishes, fragmented area names are auto-detected and can be collapsed on
  // the Knowledge Base page (the only KB mutation path — no hand-editing).
  const [justUploadedCount, setJustUploadedCount] = useState(0);
  // Non-blocking preflight warnings (dirty-but-uploadable cells: ambiguous
  // dates, suspect units, thin samples) returned by the upload route. Surfaced
  // as a calm note so nothing passes silently, but never blocks the upload.
  const [uploadWarnings, setUploadWarnings] = useState<
    Array<{ filename: string; code: string; message: string }>
  >([]);
  // Task #66 — status-mapping step. Shown only when analyze finds raw status
  // values that don't resolve under the member's mapping.
  const [statusStep, setStatusStep] = useState<{
    values: UnknownStatusValue[];
    baseMapping: StatusMapping;
    uploadMapping: ColumnMapping | null;
    filename: string;
  } | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  // Task #66 — preview/confirm gate. Always shown right before the full upload.
  const [previewStep, setPreviewStep] = useState<{
    filename: string;
    rowCount: number;
    counts: PreviewCounts & { unknown: number };
    sampleRow: SampleRowField[];
    unmappedStatusCount: number;
    uploadMapping: ColumnMapping | null;
  } | null>(null);

  const thinking = useAiThinking({
    mode: "phase",
    fallbackPhases: [
      "Reading your CSV headers…",
      "Asking Claude to match columns…",
      "Reviewing the proposed mapping…",
    ],
  });

  // Separate thinking instance for the upload stage so the rotating phase
  // labels stay distinct from the mapping stage's labels. Both surface via
  // AiThinking mode="phase" but with different content. The fallback rotation
  // is the entire signal here — the POST is a single round-trip, so we don't
  // have streaming phase events to drive it from the server.
  const uploadThinking = useAiThinking({
    mode: "phase",
    fallbackPhases: [
      "Reading your CSV files…",
      "Uploading to the server…",
      "Queueing for AI validation…",
      "Almost there — finishing up…",
    ],
    fallbackIntervalMs: 2_500,
  });

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (files.length > maxUploadBatch) {
      setError(`Your plan allows up to ${maxUploadBatch} files at once.`);
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
        rowCount: undefined,
      };
    });
    next.sort((a, b) => compareMonthYear(a.monthYear, b.monthYear));
    setSelected(next);
    // Kick off async row counts in the background — purely advisory, so we
    // don't block the picker or the Continue button on them.
    void Promise.all(
      next.map(async (s, idx) => {
        const n = await approximateRowCount(s.file);
        setSelected((curr) => {
          // Reconcile by file identity, not index — the user may have
          // removed a file before the count resolves.
          const matchIdx = curr.findIndex((c) => c.file === s.file);
          if (matchIdx === -1) return curr;
          const copy = [...curr];
          copy[matchIdx] = { ...copy[matchIdx], rowCount: n };
          return copy;
        });
        void idx;
      }),
    );
  }

  const oldestFile = useMemo<SelectedFile | null>(() => {
    if (selected.length === 0) return null;
    return selected[0]; // already sorted ascending
  }, [selected]);

  // Block submit until every file has a confirmed month. The server now
  // rejects the request without a fallback, so disabling here gives the
  // member a clearer signal than letting the POST round-trip to a 400.
  const missingMonth = useMemo(
    () => selected.some((s) => !s.monthYear),
    [selected],
  );

  /** Files whose async row-count came back above the soft cap. */
  const oversizedFiles = useMemo(
    () =>
      selected.filter(
        (s) => typeof s.rowCount === "number" && s.rowCount > LARGE_FILE_ROW_THRESHOLD,
      ),
    [selected],
  );

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
      // Mapping already saved — analyze the representative file (zero AI) to
      // surface any NEW status values + a preview before we pay for validation.
      await runAnalyze(null);
      return;
    }

    // Need a mapping. Send the oldest file to suggest-mapping for a head start,
    // then open the interactive mapper so the member can confirm/adjust.
    if (!oldestFile) return;
    thinking.start();
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
      setMapper({
        headers: data.headers,
        initialMapping: data.suggestedMapping ?? existingMapping ?? {},
        context: "initial",
        filename: oldestFile.file.name,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      thinking.stop();
    }
  }

  /**
   * Task #66 pre-upload step. Analyze the representative (oldest) file with the
   * given column mapping (null = use the member's saved mapping), then route to
   * the right next screen:
   *   - column mapping incomplete  → ColumnMapper (preflight context)
   *   - NEW (unknown) status values → StatusMapper
   *   - otherwise                   → preview/confirm gate
   * `mapping` is the explicit member mapping (from the ColumnMapper); it's
   * threaded through to doFinalUpload only when the member actually chose one,
   * so saved-mapping members never overwrite their saved mapping on upload.
   */
  async function runAnalyze(
    mapping: ColumnMapping | null,
    opts?: { skipStatusGate?: boolean },
  ) {
    if (!oldestFile) return;
    setError(null);
    setStatusStep(null);
    setPreviewStep(null);
    setMapper(null);
    thinking.start();
    try {
      const fd = new FormData();
      fd.append("file", oldestFile.file);
      if (mapping) fd.append("columnMapping", JSON.stringify(mapping));
      const res = await fetch("/api/member/market-data/analyze", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not analyze this file.");
      }
      const data = (await res.json()) as AnalyzeResult;

      // 1) Columns incomplete → open the mapper seeded with the deterministic
      //    suggestion so the member can finish routing required fields.
      if (!data.columnMappingComplete) {
        setMapper({
          headers: data.headers,
          initialMapping: data.suggestedColumnMapping ?? mapping ?? existingMapping ?? {},
          context: "preflight",
          filename: data.filename,
          banner: {
            message: "We couldn't match some required columns in this file.",
            detail:
              "Route each required field to the matching column, then we'll re-check it.",
          },
        });
        return;
      }

      // 2) NEW status values → ask the member to bucket them (only the unknowns).
      //    After a status save we skip this gate: any values the member chose to
      //    leave unmapped are acknowledged for this upload, so they flow straight
      //    to the preview gate (which surfaces the unmapped count) instead of
      //    re-opening the mapper in a loop.
      const unknowns: UnknownStatusValue[] = data.statusValues
        .filter((s) => !s.alreadyMapped)
        .map((s) => ({ value: s.value, count: s.count, proposed: s.proposed }));
      if (unknowns.length > 0 && !opts?.skipStatusGate) {
        setStatusStep({
          values: unknowns,
          baseMapping: data.resolvedStatusMapping,
          uploadMapping: mapping,
          filename: data.filename,
        });
        return;
      }

      // 3) Everything resolves → preview/confirm gate.
      const unmappedStatusCount = data.statusValues.filter(
        (s) => !s.alreadyMapped,
      ).length;
      setPreviewStep({
        filename: data.filename,
        rowCount: data.rowCount,
        counts: data.previewCounts,
        sampleRow: data.sampleRow,
        unmappedStatusCount,
        uploadMapping: mapping,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      thinking.stop();
    }
  }

  /** StatusMapper "Save" — persist the member's confirmations as a 4-bucket
   *  statusMapping override (resolved ∪ confirmations) on their MarketConfig,
   *  then re-analyze so the now-resolved values flow into the preview gate. */
  async function onStatusSave(confirmations: Record<string, MappableBucket>) {
    if (!statusStep) return;
    setStatusSaving(true);
    setError(null);
    try {
      const merged = mergeConfirmationsIntoMapping(
        statusStep.baseMapping,
        confirmations,
      );
      const res = await fetch("/api/member/market-data/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusMapping: merged }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not save your status mapping.");
      }
      const uploadMapping = statusStep.uploadMapping;
      setStatusStep(null);
      // Re-analyze with the same column mapping; the saved statusMapping now
      // resolves the confirmed values. skipStatusGate carries the member's
      // "leave unmapped" choices forward so we land on the preview gate instead
      // of re-opening the mapper for the values they intentionally skipped.
      await runAnalyze(uploadMapping, { skipStatusGate: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStatusSaving(false);
    }
  }

  async function doFinalUpload(
    mapping: ColumnMapping | null,
    opts?: { acknowledgeNumericNeighbourhood?: boolean },
  ) {
    setStage("uploading");
    setError(null);
    setConflicts([]);
    setPreflightError(null);
    setLastMapping(mapping);
    setMapperSaving(true);
    uploadThinking.start();
    try {
      const fd = new FormData();
      for (const s of selected) fd.append("files", s.file);
      fd.append("labels", JSON.stringify(selected.map((s) => s.label)));
      fd.append(
        "monthYears",
        JSON.stringify(selected.map((s) => s.monthYear)),
      );
      if (mapping) fd.append("columnMapping", JSON.stringify(mapping));
      if (opts?.acknowledgeNumericNeighbourhood) {
        fd.append("acknowledgeNumericNeighbourhood", "true");
      }
      const res = await fetch("/api/member/market-data/upload", {
        method: "POST",
        body: fd,
      });
      if (res.status === 400) {
        const j = await res.json().catch(() => ({}));
        if (j?.error === "preflight_failed" && j.code && j.message) {
          // Confirmable warnings (e.g. neighbourhood column looks numeric) are
          // not data failures — the member can remap to a names column OR
          // knowingly upload anyway. Reopen the mapper with a banner that
          // carries an explicit "upload anyway" action which re-submits with the
          // acknowledgement flag set.
          if (
            j.code === "NEIGHBOURHOOD_MOSTLY_NUMERIC" &&
            j.confirmable &&
            Array.isArray(j.headers) &&
            j.headers.length > 0
          ) {
            setPreflightError(null);
            setMapper({
              headers: j.headers as string[],
              initialMapping: mapping ?? existingMapping ?? {},
              context: "preflight",
              filename: j.filename || oldestFile?.file.name,
              banner: {
                message: j.message,
                detail: j.detail || undefined,
                suggestion: j.suggestion,
                confirm: {
                  label: "Upload anyway",
                  onConfirm: () =>
                    doFinalUpload(mapping, {
                      acknowledgeNumericNeighbourhood: true,
                    }),
                },
              },
            });
            setStage("picking");
            return;
          }
          // Column-identity failures are recoverable through the mapper — open
          // it (seeded with the effective mapping) instead of dead-ending. Data
          // problems (empty file / all-unknown statuses) can't be fixed by
          // remapping, so those keep the red error card.
          const mappable =
            j.code === "MISSING_COLUMNS" ||
            j.code === "STATUS_VALUES_UNRECOGNIZED";
          if (mappable && Array.isArray(j.headers) && j.headers.length > 0) {
            setPreflightError(null);
            setMapper({
              headers: j.headers as string[],
              initialMapping: mapping ?? existingMapping ?? {},
              context: "preflight",
              filename: j.filename || oldestFile?.file.name,
              banner: {
                message: j.message,
                detail: j.detail || undefined,
                suggestion: j.suggestion,
              },
            });
            setStage("picking");
            return;
          }
          setMapper(null);
          setPreflightError({
            code: j.code,
            filename: j.filename || "your CSV",
            message: j.message,
            detail: j.detail || "",
            suggestion: j.suggestion,
          });
          setStage("picking");
          return;
        }
        throw new Error(j.message || j.error || "Upload failed.");
      }
      if (res.status === 409) {
        const j = await res.json().catch(() => ({}));
        if (j?.error === "duplicate_month" && Array.isArray(j.conflicts)) {
          // Mapping was fine (preflight passed) — close the mapper so the
          // conflict/replace banner is visible; the Replace flow re-sends the
          // same files + mapping via lastMapping.
          setMapper(null);
          setConflicts(j.conflicts as ConflictRow[]);
          if (typeof j.recentAvgCostUsd === "number" && j.recentAvgCostUsd > 0) {
            setRecentAvgCostUsd(j.recentAvgCostUsd);
          }
          if (typeof j.capUsd === "number" && j.capUsd > 0) {
            setCostCapUsd(j.capUsd);
          }
          setStage("picking");
          return;
        }
        throw new Error(j.message || j.error || "Upload failed.");
      }
      if (res.status === 402) {
        // Server-side cost cap kicked in (member would exceed monthly AI
        // budget). Surface the friendly message verbatim — it already
        // includes the dollar amounts the user needs to act on.
        const j = await res.json().catch(() => ({}));
        throw new Error(
          j.message ||
            "This upload would exceed your monthly AI budget. Try fewer files or wait until your budget resets.",
        );
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Upload failed.");
      }
      // Surface any non-blocking preflight warnings the route returned so the
      // member sees dirty-but-uploadable cells instead of them passing silently.
      const okBody = (await res.json().catch(() => ({}))) as {
        warnings?: Array<{ filename: string; code: string; message: string }>;
      };
      setUploadWarnings(
        Array.isArray(okBody.warnings) ? okBody.warnings : [],
      );
      // Reset + refresh history
      setJustUploadedCount(selected.length);
      setSelected([]);
      setStage("picking");
      setMapper(null);
      setLastMapping(null);
      // Notify UploadHistoryTable so it refetches without a full RSC reload.
      // We don't know the new upload IDs from the POST response (it returns
      // 202 with no body for the async path), so the listener does a GET of
      // /api/member/market-data/uploads and diffs against its current rows
      // — any IDs it didn't have get the azure-flash shimmer treatment.
      // router.refresh() stays as a safety net for any other server-rendered
      // bits on the page (e.g. the progress banner).
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("market-data:uploaded"));
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setStage("picking");
    } finally {
      uploadThinking.stop();
      setMapperSaving(false);
    }
  }

  /** Open the cost-aware confirmation dialog for one or many conflicts. The
   *  caller passes the exact targets so a single "Replace" click on row N
   *  shows a single-month dialog, while "Replace all" shows the bulk view. */
  function openReplaceDialog(targets: ConflictRow[]) {
    if (targets.length === 0) return;
    const totalFacts = targets.reduce((s, c) => s + c.factCount, 0);
    const totalLeads = targets.reduce((s, c) => s + c.storyLeadCount, 0);
    const estimatedCost = recentAvgCostUsd * targets.length;
    setReplaceDialog({
      targets,
      totalFacts,
      totalLeads,
      estimatedCost,
      capUsd: costCapUsd,
      isBulk: targets.length >= BULK_REPLACE_THRESHOLD,
    });
  }

  /** Confirmed handler — runs the original deletion + re-upload flow over
   *  every target in sequence. Sequential (not parallel) so the user sees
   *  individual failures land on the right row rather than a fan-out crash. */
  async function confirmReplaceDialog() {
    if (!replaceDialog) return;
    const targets = replaceDialog.targets;
    setReplaceDialog(null);
    setError(null);
    setBulkReplacing(true);
    try {
      for (const c of targets) {
        setReplacingId(c.id);
        const res = await fetch(`/api/member/market-data/upload/${c.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(
            j.error || `Couldn't delete the existing upload for ${c.label}.`,
          );
        }
        // Optimistically drop this row from the conflicts list as soon as
        // its DELETE returns 2xx so the UI shrinks visibly between targets.
        setConflicts((curr) => curr.filter((x) => x.id !== c.id));
      }
      // After every target is cleared, re-fire the original upload with the
      // same files + mapping the member already confirmed.
      await doFinalUpload(lastMapping);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReplacingId(null);
      setBulkReplacing(false);
    }
  }

  /** Mapper "Save" — persists only (proactive) or advances the upload flow by
   *  re-analyzing with the chosen mapping (initial/preflight). The analyze pass
   *  routes on to the status step / preview gate before any AI cost. */
  async function onMapperSave(mapping: ColumnMapping) {
    if (mapper?.context === "proactive") {
      await saveProactiveMapping(mapping);
      return;
    }
    await runAnalyze(mapping);
  }

  /** Preview gate "Upload" — commit the validated upload. */
  async function onPreviewConfirm() {
    if (!previewStep) return;
    const mapping = previewStep.uploadMapping;
    setPreviewStep(null);
    await doFinalUpload(mapping);
  }

  function onMapperCancel() {
    setMapper(null);
    setError(null);
  }

  /** Proactive entry: member picks a recent export so we can read its real
   *  column names (no AI cost), then edits the saved mapping. */
  async function onPickMappingSampleFile(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setError(null);
    thinking.start();
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/member/market-data/preview-headers", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not read columns from that file.");
      }
      const data = (await res.json()) as { headers: string[] };
      setMapper({
        headers: data.headers,
        initialMapping: existingMapping ?? {},
        context: "proactive",
        filename: file.name,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      thinking.stop();
    }
  }

  async function saveProactiveMapping(mapping: ColumnMapping) {
    setMapperSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/member/market-data/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnMapping: mapping }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not save the mapping.");
      }
      setMapper(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setMapperSaving(false);
    }
  }

  const mapperIntro =
    mapper?.context === "proactive"
      ? "Update which of your CSV columns maps to each field. Changes are saved to your market and reused on every upload."
      : mapper?.context === "preflight"
        ? "We couldn't match some required columns in your file. Route each required field to the matching column from your CSV, then we'll re-check it."
        : "Confirm how your CSV columns map to our required fields. We'll save this so you don't have to do it again.";

  const mapperBanner = mapper?.banner ? (
    <Notice
      variant="warning"
      title={mapper.banner.message}
      action={
        mapper.banner.confirm ? (
          <button
            type="button"
            onClick={mapper.banner.confirm.onConfirm}
            disabled={mapperSaving}
            className={`${NOTICE_PILL_CLASS} disabled:opacity-60`}
          >
            {mapper.banner.confirm.label}
          </button>
        ) : undefined
      }
    >
      {mapper.banner.detail && <p>{mapper.banner.detail}</p>}
      {mapper.banner.suggestion && (
        <p className={mapper.banner.detail ? "mt-1" : ""}>
          <span className="font-medium">Tip:</span> {mapper.banner.suggestion}
        </p>
      )}
      {mapper.filename && (
        <p className="mt-1 text-[11px] opacity-80">File: {mapper.filename}</p>
      )}
    </Notice>
  ) : mapper?.filename ? (
    <p className="text-xs text-gray-500 dark:text-gray-400">
      Columns read from <span className="font-medium">{mapper.filename}</span>
    </p>
  ) : undefined;

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
        Upload market data
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
        Drop your latest monthly CSV — or up to {maxUploadBatch} months
        at once for a historical backfill.
      </p>

      {/* Proactive column-mapping control — lets members review/fix the saved
          mapping without having to trigger a failed upload first. */}
      {!mapper &&
        !thinking.isThinking &&
        stage === "picking" &&
        !statusStep &&
        !previewStep && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-500 dark:text-gray-400">
            {hasColumnMapping
              ? "✓ Column mapping saved"
              : "No column mapping saved yet"}
          </span>
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <button
            type="button"
            onClick={() => proactiveInputRef.current?.click()}
            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Edit column mapping
          </button>
          <input
            ref={proactiveInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onPickMappingSampleFile}
            className="hidden"
          />
        </div>
      )}

      {thinking.isThinking && (
        <div className="mt-4">
          <AiThinking
            mode="phase"
            toolName="Market Data"
            currentPhase={thinking.phaseLabel}
          />
        </div>
      )}

      {mapper && !thinking.isThinking && (
        <div className="mt-4">
          <ColumnMapper
            headers={mapper.headers}
            initialMapping={mapper.initialMapping}
            saving={mapperSaving}
            onSave={onMapperSave}
            onCancel={onMapperCancel}
            title={
              mapper.context === "proactive"
                ? "Edit column mapping"
                : "Map your columns"
            }
            intro={mapperIntro}
            saveLabel={
              mapper.context === "proactive"
                ? "Save mapping"
                : `Save mapping & upload ${selected.length} file${selected.length === 1 ? "" : "s"}`
            }
            banner={mapperBanner}
          />
        </div>
      )}

      {/* Task #66 — status-mapping step (only NEW unknown values). */}
      {statusStep && !thinking.isThinking && stage === "picking" && (
        <div className="mt-4">
          <StatusMapper
            values={statusStep.values}
            saving={statusSaving}
            onSave={onStatusSave}
            onCancel={() => {
              setStatusStep(null);
              setError(null);
            }}
          />
        </div>
      )}

      {/* Task #66 — preview/confirm gate before validation. */}
      {previewStep && !thinking.isThinking && stage === "picking" && (
        <div className="mt-4">
          <UploadPreview
            filename={previewStep.filename}
            rowCount={previewStep.rowCount}
            counts={previewStep.counts}
            sampleRow={previewStep.sampleRow}
            unmappedStatusCount={previewStep.unmappedStatusCount}
            saving={mapperSaving}
            onConfirm={onPreviewConfirm}
            onCancel={() => {
              setPreviewStep(null);
              setError(null);
            }}
            confirmLabel={`Looks right — upload ${selected.length} file${selected.length === 1 ? "" : "s"}`}
          />
        </div>
      )}

      {!mapper &&
        !thinking.isThinking &&
        stage === "picking" &&
        !statusStep &&
        !previewStep && (
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="sr-only">Choose CSV files</span>
            <input
              type="file"
              accept=".csv,text/csv"
              multiple
              onChange={onPickFiles}
              className="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-3 file:rounded-full file:border-0 file:bg-[var(--abv-ink)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#2a2a2a]"
            />
          </label>

          {preflightError && (
            <div
              role="alert"
              className="rounded-md border-2 border-red-500 bg-white px-4 py-3 dark:bg-gray-900"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                    />
                  </svg>
                </span>
                <div className="flex-1 text-sm">
                  <div className="font-semibold text-red-800 dark:text-red-200">
                    {preflightError.message}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {preflightError.filename}
                  </div>
                  {preflightError.detail && (
                    <p className="mt-2 text-gray-700 dark:text-gray-300">
                      {preflightError.detail}
                    </p>
                  )}
                  {preflightError.suggestion && (
                    <p className="mt-2 text-gray-700 dark:text-gray-300">
                      <span className="font-medium">Tip:</span>{" "}
                      {preflightError.suggestion}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setPreflightError(null);
                      setSelected([]);
                    }}
                    className="mt-3 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    Try a different file
                  </button>
                </div>
              </div>
            </div>
          )}

          {oversizedFiles.length > 0 && (
            <Notice variant="warning">
              <span className="font-medium">Heads up:</span>{" "}
              {oversizedFiles.length === 1 ? (
                <>
                  this file has ~
                  {(oversizedFiles[0].rowCount ?? 0).toLocaleString()} rows,
                </>
              ) : (
                <>
                  {oversizedFiles.length} of these files are larger than ~
                  {LARGE_FILE_ROW_THRESHOLD.toLocaleString()} rows,
                </>
              )}{" "}
              which is larger than most markets. We&apos;ll do our best, but if
              it doesn&apos;t process you may need to filter your MLS export to
              your specific territory (your suburbs, zip codes, or
              neighbourhoods) before uploading.
            </Notice>
          )}

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
                    {!s.monthYear && (
                      <span className="col-span-12 text-[11px] text-red-600 dark:text-red-400">
                        ⚠ Pick a month before uploading — we won&apos;t guess for you.
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex justify-end pt-2">
                <Button onClick={onContinue} disabled={missingMonth}>
                  {missingMonth
                    ? "Pick a month for every file"
                    : hasColumnMapping
                      ? `Upload ${selected.length} file${selected.length === 1 ? "" : "s"}`
                      : "Continue"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {!mapper && stage === "uploading" && (
        <div className="mt-4 space-y-2">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {selected.length} file{selected.length === 1 ? "" : "s"} in flight
          </div>
          <AiThinking
            mode="phase"
            toolName="Market Data"
            currentPhase={uploadThinking.phaseLabel}
          />
        </div>
      )}

      {justUploadedCount > 0 &&
        uploadWarnings.length > 0 &&
        conflicts.length === 0 &&
        stage === "picking" && (
          <Notice variant="warning" className="mt-4">
            <div className="font-medium">
              {uploadWarnings.length} data warning
              {uploadWarnings.length === 1 ? "" : "s"} — uploaded anyway, but
              double-check these.
            </div>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
              {uploadWarnings.map((w, i) => (
                <li key={`${w.filename}-${w.code}-${i}`}>
                  <span className="font-medium">{w.filename}:</span> {w.message}
                </li>
              ))}
            </ul>
          </Notice>
        )}

      {justUploadedCount > 0 && conflicts.length === 0 && stage === "picking" && (
        <Notice
          variant="success"
          className="mt-4"
          onDismiss={() => setJustUploadedCount(0)}
        >
          <div className="font-medium">
            Uploaded {justUploadedCount} file
            {justUploadedCount === 1 ? "" : "s"} — validating now.
          </div>
          <p className="mt-1 text-xs">
            MLS exports often shatter one neighbourhood across dozens of
            subdivision names. Once validation finishes, we automatically flag
            fragmented areas so you can collapse them into single areas — that&apos;s
            what lifts more areas over the sample floor for scripts. Review and
            confirm any cleanup on your{" "}
            <Link
              href="/member/knowledge-base"
              className="font-medium underline hover:no-underline"
            >
              Knowledge Base
            </Link>{" "}
            page (nothing changes until you confirm).
          </p>
        </Notice>
      )}

      {conflicts.length > 0 && (
        <Notice variant="warning" className="mt-4">
          <div className="w-full">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium">
                  Already uploaded for{" "}
                  {conflicts.length === 1 ? "this month" : "these months"}
                </div>
                <p className="mt-1 text-xs">
                  Replace to delete the existing facts and re-validate — or
                  remove the file from the batch.
                </p>
              </div>
              {conflicts.length >= 2 && (
                <button
                  type="button"
                  onClick={() => openReplaceDialog(conflicts)}
                  disabled={bulkReplacing}
                  className="shrink-0 rounded-full bg-[var(--abv-ink)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-[var(--abv-dark)]"
                >
                  Replace all {conflicts.length} months
                </button>
              )}
            </div>
            <ul className="mt-2 space-y-1">
              {conflicts.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded bg-white/60 px-2 py-1.5 text-xs dark:bg-gray-900/40"
                >
                  <span className="text-gray-800 dark:text-gray-200">
                    <span className="font-medium">{c.label}</span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {" "}
                      · {c.status} · {c.factCount.toLocaleString()} facts,{" "}
                      {c.storyLeadCount.toLocaleString()} leads
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => openReplaceDialog([c])}
                    disabled={bulkReplacing || replacingId === c.id}
                    className="shrink-0 rounded-full bg-[var(--abv-ink)] px-3 py-1 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-[var(--abv-dark)]"
                  >
                    {replacingId === c.id ? "Replacing…" : "Replace"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Notice>
      )}

      {replaceDialog && (
        <ReplaceConfirmDialog
          state={replaceDialog}
          onCancel={() => setReplaceDialog(null)}
          onConfirm={confirmReplaceDialog}
        />
      )}

      {error && (
        <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}
    </section>
  );
}

/** Cost-aware confirmation dialog for the Replace flow. Two visual modes:
 *  the single-month case keeps the amber palette already used by the
 *  conflicts banner, while the bulk case (>=3 months) escalates to a red
 *  header + warning icon to signal that the operation is unrecoverable. */
function ReplaceConfirmDialog({
  state,
  onCancel,
  onConfirm,
}: {
  state: ReplaceDialogState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { targets, totalFacts, totalLeads, estimatedCost, capUsd, isBulk } =
    state;
  const single = targets[0];

  // Esc-to-cancel — keeps the dialog reachable by keyboard users without
  // pulling in a full focus-trap library. The destructive action lives
  // behind an explicit "Yes, replace" click either way.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const costStr =
    capUsd > 0
      ? `~${formatActionImpactPercent(estimatedCost, capUsd)} of your monthly Content Tools allowance`
      : "a portion of your monthly Content Tools allowance";
  const title = isBulk
    ? `Replace ${targets.length} months?`
    : `Replace ${single.label}?`;
  const body = isBulk
    ? `This will delete ${totalFacts.toLocaleString()} facts and ${totalLeads.toLocaleString()} story leads across ${targets.length} months, then re-validate. Estimated cost: ${costStr}. This is unrecoverable.`
    : `This will delete the existing ${single.factCount.toLocaleString()} facts and ${single.storyLeadCount.toLocaleString()} story leads for ${single.label}, then re-validate the new file. Estimated cost: ${costStr}.`;
  const confirmLabel = isBulk
    ? `Yes, replace ${targets.length} months`
    : "Yes, replace";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="replace-dialog-title"
    >
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-gray-900">
        <div
          className={`flex items-center gap-2 rounded-t-lg px-5 py-3 ${
            isBulk
              ? "bg-red-600 text-white"
              : "bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
          }`}
        >
          {isBulk && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5 shrink-0"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
          )}
          <h3
            id="replace-dialog-title"
            className="text-sm font-semibold tracking-tight"
          >
            {title}
          </h3>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
            {body}
          </p>
          {isBulk && (
            <ul className="mt-3 max-h-32 space-y-0.5 overflow-y-auto rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">
              {targets.map((t) => (
                <li key={t.id} className="truncate">
                  {t.label} · {t.factCount.toLocaleString()} facts,{" "}
                  {t.storyLeadCount.toLocaleString()} leads
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 rounded-b-lg border-t border-gray-200 bg-gray-50 px-5 py-3 dark:border-gray-800 dark:bg-gray-950">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white ${
              isBulk
                ? "bg-red-600 hover:bg-red-700"
                : "bg-amber-600 hover:bg-amber-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
