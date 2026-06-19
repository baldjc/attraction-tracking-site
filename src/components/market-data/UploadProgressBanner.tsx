"use client";

// Wave 1 Phase 2A — in-flow batch progress banners for market-data uploads.
//
// Stateful banner driven entirely by polling the existing per-upload
// status endpoint (no new server endpoint needed). Four states:
//
//   1. "queued"   — batch >=3 files just submitted, before polling sees any
//                   transition. Blue: "Got it. ~6 minutes per file."
//   2. "running"  — 1+ rows still pending/validating. Blue: "X of Y done."
//   3. "success"  — everything validated. Green, auto-fades after 30s.
//   4. "partial"  — everything terminal, some failed. Amber, persists.
//
// We don't share state with UploadHistoryTable — both poll the same cheap
// endpoint independently. The duplication is intentional: lifting state
// would require a context or a render-prop refactor for a single member-
// facing surface that gets visited a few times a month per user.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Notice from "@/components/ui/Notice";

interface InitialUpload {
  id: string;
  status: string;
}

interface Props {
  uploads: InitialUpload[];
  /** Smallest batch size that should trigger the queued/running banners.
   *  Single uploads get the row-level shimmer + status badge only. */
  minBatchSize?: number;
}

interface PolledStatus {
  id: string;
  status: string;
  factCount?: number;
  storyLeadCount?: number;
}

const TERMINAL = new Set(["validated", "failed"]);
const POLL_INTERVAL_MS = 4_000;
const SUCCESS_FADE_MS = 30_000;

export default function UploadProgressBanner({
  uploads,
  minBatchSize = 3,
}: Props) {
  // We only ever animate over uploads that were non-terminal at mount —
  // i.e. the ones the member just submitted. An older row finishing
  // validation hours later shouldn't suddenly pop a green banner.
  const trackedIds = useMemo(
    () =>
      uploads
        .filter((u) => !TERMINAL.has(u.status))
        .map((u) => u.id),
    [uploads],
  );

  const [statuses, setStatuses] = useState<Map<string, PolledStatus>>(() => {
    const m = new Map<string, PolledStatus>();
    for (const u of uploads) m.set(u.id, { id: u.id, status: u.status });
    return m;
  });
  const [dismissed, setDismissed] = useState(false);
  const [successFaded, setSuccessFaded] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollOnce = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`/api/member/market-data/upload/${id}`, {
            cache: "no-store",
          });
          if (!res.ok) return null;
          return (await res.json()) as PolledStatus;
        } catch {
          return null;
        }
      }),
    );
    setStatuses((prev) => {
      const next = new Map(prev);
      for (const r of results) if (r) next.set(r.id, r);
      return next;
    });
  }, []);

  useEffect(() => {
    if (trackedIds.length === 0) return;
    pollOnce(trackedIds);
    intervalRef.current = setInterval(() => {
      setStatuses((current) => {
        const stillPending = trackedIds.filter(
          (id) => !TERMINAL.has(current.get(id)?.status ?? "pending"),
        );
        if (stillPending.length === 0) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        } else {
          void pollOnce(stillPending);
        }
        return current;
      });
    }, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [trackedIds, pollOnce]);

  const tracked = trackedIds.map((id) => statuses.get(id)).filter(Boolean) as PolledStatus[];
  const total = tracked.length;
  const validated = tracked.filter((u) => u.status === "validated").length;
  const failed = tracked.filter((u) => u.status === "failed").length;
  const pending = tracked.filter((u) => !TERMINAL.has(u.status)).length;
  const allTerminal = total > 0 && pending === 0;
  const totalFacts = tracked.reduce((a, u) => a + (u.factCount ?? 0), 0);
  const totalLeads = tracked.reduce((a, u) => a + (u.storyLeadCount ?? 0), 0);

  // Auto-fade the success banner after SUCCESS_FADE_MS.
  useEffect(() => {
    if (!allTerminal || failed > 0 || successFaded) return;
    const t = setTimeout(() => setSuccessFaded(true), SUCCESS_FADE_MS);
    return () => clearTimeout(t);
  }, [allTerminal, failed, successFaded]);

  if (total < minBatchSize) return null;
  if (dismissed) return null;

  // State 3 (success) — auto-fades.
  if (allTerminal && failed === 0) {
    if (successFaded) return null;
    return (
      <BannerShell tone="success" onDismiss={() => setDismissed(true)}>
        All {total} files validated successfully.{" "}
        {totalFacts.toLocaleString()} facts and{" "}
        {totalLeads.toLocaleString()} story leads are now available for content
        generation.
      </BannerShell>
    );
  }

  // State 4 (partial / has failures) — persists.
  if (allTerminal && failed > 0) {
    return (
      <BannerShell tone="warning" onDismiss={() => setDismissed(true)}>
        {validated} of {total} files validated, {failed} had errors. Check the
        upload history below to retry.
      </BannerShell>
    );
  }

  // State 1 / 2 — in-flight. Use State 1 copy if nothing has moved off the
  // starting status yet, State 2 once at least one row finishes.
  if (validated + failed === 0) {
    return (
      <BannerShell tone="info" onDismiss={() => setDismissed(true)}>
        Got it. We&apos;re processing {total} file{total === 1 ? "" : "s"}. This
        usually takes ~6 minutes per file. You can close this tab — we&apos;ll
        email you when it&apos;s done.
      </BannerShell>
    );
  }

  return (
    <BannerShell tone="info" onDismiss={() => setDismissed(true)}>
      {validated} of {total} files complete. {pending} still processing — you
      can leave this page anytime.
    </BannerShell>
  );
}

function BannerShell({
  tone,
  onDismiss,
  children,
}: {
  tone: "info" | "success" | "warning";
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  return (
    <Notice variant={tone} onDismiss={onDismiss}>
      {children}
    </Notice>
  );
}
