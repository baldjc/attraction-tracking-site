"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

interface UseAutoSaveArgs<T> {
  /**
   * The value to watch. Whenever React passes a new reference for `value`
   * (i.e. the user changed form state and a fresh object was produced),
   * a save is scheduled `delay` ms later. Re-renders that pass the same
   * reference are no-ops. Pass a memoised object (or the form state object
   * directly) so identity tracking works correctly.
   */
  value: T;
  /** Debounce window in ms. Defaults to 700ms — enough to coalesce typing. */
  delay?: number;
  /**
   * Save callback. Receives the latest tracked value (the most recent one
   * scheduled before the debounce fired). Throw to mark the save as failed.
   * The callback ref is updated on every render so the latest closure
   * (form refs, `onSaved` from props, etc.) is always used at save time
   * without restarting the debounce timer.
   */
  onSave: (value: T) => Promise<void>;
}

/**
 * Auto-save hook with:
 *
 *   1. **Value-identity first-run guard** (Strict-Mode-safe).
 *      React 18+ Strict Mode (which Next.js 16 dev enables) runs every
 *      effect setup→cleanup→setup on mount. A boolean `firstRun` ref
 *      would flip on the first setup, so the second setup would see
 *      `firstRun === false` and treat the initial value as a "real
 *      change", scheduling a phantom save ~600ms after mount. That
 *      phantom save called `onSaved`, which the parent (incorrectly)
 *      used to close the modal — producing the open-then-close bug
 *      that killed commit 97ab9a6.
 *
 *      The fix: lazily capture the initial value (inside the effect,
 *      not at declaration). On Strict Mode's synthetic remount the ref
 *      survives, so the second setup sees `value === lastSeenRef.current`
 *      (same reference) and bails out.
 *
 *   2. **Single-flight save serialisation + coalescing** (no overlapping
 *      writes). Without this, a slow PUT could be overtaken by a faster
 *      one started milliseconds later — and the slow one's response
 *      (older snapshot) would arrive last and overwrite the newer edit.
 *
 *      Design: one in-flight save at a time, tracked in `runningRef`.
 *      Edits arriving during a save are coalesced into `queuedRef` so
 *      only the most-recent value runs next (intermediate snapshots
 *      are discarded — they're already stale).
 *
 *   3. **`flushSave()` awaits in-flight saves** (no data loss on close).
 *      Close/navigation handlers call `await flushSave()` to drain any
 *      pending debounce AND any running save before leaving the modal
 *      context. Re-throws on save failure so the caller can decide
 *      whether to proceed (close anyway) or keep the modal open.
 */
export function useAutoSave<T>({ value, delay = 700, onSave }: UseAutoSaveArgs<T>) {
  const initialRef = useRef<T | null>(null);
  const lastSeenRef = useRef<T | null>(null);
  // Debounced pending value (set when the watched value changes but the
  // delay hasn't elapsed yet).
  const pendingRef = useRef<{ value: T } | null>(null);
  const timerRef = useRef<number | null>(null);
  // Single-flight: the promise for the currently-executing save chain.
  // While set, new schedules accumulate into `queuedRef` instead of
  // starting another concurrent fetch.
  const runningRef = useRef<Promise<void> | null>(null);
  // Coalesced "next value to save once the current chain finishes".
  // Always overwritten with the latest snapshot — intermediate ones
  // are stale by the time we get to them.
  const queuedRef = useRef<{ value: T } | null>(null);
  // Sticky last error so `flushSave()` can re-throw after a chain ends
  // in failure. Cleared whenever a save succeeds.
  const lastErrorRef = useRef<Error | null>(null);
  const onSaveRef = useRef(onSave);

  // Keep the save callback fresh without retriggering the debounce effect.
  useEffect(() => {
    onSaveRef.current = onSave;
  });

  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Run one save iteration. Errors are thrown so the chain loop can
  // capture them in `lastErrorRef` and stop processing the queue.
  const performSave = useCallback(async (val: T) => {
    setStatus("saving");
    try {
      await onSaveRef.current(val);
      setStatus("saved");
      setLastSavedAt(new Date());
      setError(null);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Save failed");
      throw e;
    }
  }, []);

  // Drain loop: run the given value, then keep running whatever the
  // latest coalesced `queuedRef` is until the queue is empty. Bails on
  // the first error and clears the queue (next user edit retries).
  const runSaveChain = useCallback(async (initial: T): Promise<void> => {
    let current: T = initial;
    while (true) {
      try {
        await performSave(current);
        lastErrorRef.current = null;
      } catch (e) {
        lastErrorRef.current = e instanceof Error ? e : new Error(String(e));
        queuedRef.current = null;
        runningRef.current = null;
        return;
      }
      const q = queuedRef.current;
      if (q) {
        current = q.value;
        queuedRef.current = null;
        continue;
      }
      runningRef.current = null;
      return;
    }
  }, [performSave]);

  // Either start a fresh save chain or coalesce into the running one.
  const scheduleSave = useCallback((val: T) => {
    if (runningRef.current) {
      // Single-flight: coalesce. Only the latest value matters.
      queuedRef.current = { value: val };
      return;
    }
    runningRef.current = runSaveChain(val);
  }, [runSaveChain]);

  useEffect(() => {
    // Lazy first-run capture: the ref survives Strict Mode's
    // setup→cleanup→setup so the second setup short-circuits here.
    if (initialRef.current === null) {
      initialRef.current = value;
      lastSeenRef.current = value;
      return;
    }
    // Identity check: bail if React handed us the same reference. Real
    // edits always produce a new object via `setForm((f) => ({...f, ...}))`.
    if (value === lastSeenRef.current) return;
    lastSeenRef.current = value;

    pendingRef.current = { value };
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const p = pendingRef.current;
      pendingRef.current = null;
      if (p) scheduleSave(p.value);
    }, delay);
  }, [value, delay, scheduleSave]);

  // Cancel any pending debounce on unmount. We don't auto-flush — callers
  // are expected to call `flushSave()` from their close handler.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  /**
   * Cancel any pending debounce, schedule the latest pending snapshot
   * (if any) immediately, then await every save currently in the chain
   * (the running save plus any coalesced follow-ups). Re-throws if the
   * final save in the chain failed so callers (close, navigation) can
   * decide whether to proceed.
   */
  const flushSave = useCallback(async (): Promise<void> => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const p = pendingRef.current;
    pendingRef.current = null;
    if (p) scheduleSave(p.value);
    // Drain the chain. Each await yields the current chain; if a save
    // coalesced from `queuedRef` started a follow-up, `runningRef` will
    // still be set when we re-loop, so we keep awaiting.
    while (runningRef.current) {
      try {
        await runningRef.current;
      } catch {
        // runSaveChain itself never rejects (it catches and stores in
        // lastErrorRef), but be defensive.
        break;
      }
    }
    if (lastErrorRef.current) {
      const err = lastErrorRef.current;
      // Don't clear the sticky error here — the status indicator should
      // keep showing "Save failed" until the next successful save.
      throw err;
    }
  }, [scheduleSave]);

  return { status, lastSavedAt, error, flushSave };
}
