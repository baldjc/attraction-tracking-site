"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/**
 * Reusable hook that gives any table Notion-style column resizing with
 * per-device persistence in localStorage.
 *
 * Pair with a `<colgroup>` (so the widths actually take effect) and place a
 * <ColumnResizeHandle /> on the right edge of every resizable `<th>` (the
 * `<th>` must be `position: relative`). Each table needs a stable, unique
 * `tableId`; widths are stored under `resizable-cols:v1:{tableId}`.
 *
 * Robustness notes:
 *  - Uses Pointer Events so mouse / touch / pen all work and `pointercancel`
 *    correctly tears down the drag if the OS interrupts the gesture.
 *  - Tracks a `cleanupRef` so listeners and body styles are restored even if
 *    the component unmounts mid-drag.
 *  - Hydrates saved widths via `useLayoutEffect` (gracefully degraded to
 *    `useEffect` on the server) so users with a custom layout don't see a
 *    visible jump from defaults to saved widths on first paint.
 *
 * Accessibility:
 *  - The handle is a focusable `<button role="separator">`. Arrow keys nudge
 *    the column width by 8px (or 24px with Shift). This means keyboard-only
 *    users can adjust columns too.
 */
export interface UseResizableColumnsOptions {
  tableId: string;
  defaults: Record<string, number>;
  minWidth?: number;
  maxWidth?: number;
  /** Step size for arrow-key resize. Defaults to 8px. */
  keyboardStep?: number;
  /** Step size with Shift held. Defaults to 24px. */
  keyboardLargeStep?: number;
}

const STORAGE_PREFIX = "resizable-cols:v1:";

// useLayoutEffect logs a warning during SSR; fall back to useEffect there.
const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useResizableColumns({
  tableId,
  defaults,
  minWidth = 50,
  maxWidth = 800,
  keyboardStep = 8,
  keyboardLargeStep = 24,
}: UseResizableColumnsOptions) {
  const storageKey = `${STORAGE_PREFIX}${tableId}`;
  const [widths, setWidths] = useState<Record<string, number>>(defaults);
  const [hydrated, setHydrated] = useState(false);

  // Drag state + a single cleanup function so we can always tear down listeners
  // (on pointerup, pointercancel, OR unmount) without leaking globals.
  const dragRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Synchronously hydrate from localStorage before the first paint when
  // possible, so saved layouts don't visibly snap from defaults.
  useIsoLayoutEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const cleaned: Record<string, number> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "number" && Number.isFinite(v) && v > 0) cleaned[k] = v;
        }
        setWidths({ ...defaults, ...cleaned });
      }
    } catch {
      // ignore corrupt storage
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Persist after hydration only — never overwrite saved widths with the
  // defaults during the initial render.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(widths));
    } catch {
      // ignore quota errors
    }
  }, [widths, hydrated, storageKey]);

  // Always clean up on unmount, even if mid-drag.
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const startResize = useCallback(
    (key: string, e: React.PointerEvent) => {
      // Only respond to primary button / primary pointer.
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault();
      e.stopPropagation();

      // Tear down any previous in-flight drag (defensive — should never happen).
      cleanupRef.current?.();

      const startWidth = widths[key] ?? defaults[key] ?? 100;
      dragRef.current = { key, startX: e.clientX, startWidth };

      const onMove = (mv: PointerEvent) => {
        if (!dragRef.current) return;
        const dx = mv.clientX - dragRef.current.startX;
        const next = Math.max(
          minWidth,
          Math.min(maxWidth, dragRef.current.startWidth + dx),
        );
        setWidths((prev) => ({ ...prev, [dragRef.current!.key]: next }));
      };

      const cleanup = () => {
        dragRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", cleanup);
        window.removeEventListener("pointercancel", cleanup);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        cleanupRef.current = null;
      };
      cleanupRef.current = cleanup;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", cleanup);
      window.addEventListener("pointercancel", cleanup);
    },
    [widths, defaults, minWidth, maxWidth],
  );

  const adjustWidth = useCallback(
    (key: string, delta: number) => {
      setWidths((prev) => {
        const cur = prev[key] ?? defaults[key] ?? 100;
        const next = Math.max(minWidth, Math.min(maxWidth, cur + delta));
        return { ...prev, [key]: next };
      });
    },
    [defaults, minWidth, maxWidth],
  );

  /** Returns the props bag for a single resize handle bound to a column key. */
  const getHandleProps = useCallback(
    (key: string) => ({
      onPointerDown: (e: React.PointerEvent) => startResize(key, e),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          adjustWidth(key, e.shiftKey ? -keyboardLargeStep : -keyboardStep);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          adjustWidth(key, e.shiftKey ? keyboardLargeStep : keyboardStep);
        }
      },
      // Resize handle sits on top of the sortable header button — swallow
      // click so dragging doesn't accidentally toggle the sort.
      onClick: (e: React.MouseEvent) => e.stopPropagation(),
    }),
    [startResize, adjustWidth, keyboardStep, keyboardLargeStep],
  );

  const reset = useCallback(() => {
    setWidths(defaults);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults, storageKey]);

  return { widths, startResize, adjustWidth, getHandleProps, reset, hydrated };
}

/**
 * Tiny presentational drag-handle. Renders as a focusable button on the right
 * edge of a `<th>` (the `<th>` must be `position: relative`). On hover or
 * focus it tints with the brand colour so users discover the affordance.
 *
 * Pass the props bag from `getHandleProps(colKey)` plus the column's display
 * label for the `aria-label`. Keyboard users can press Tab to focus and
 * Left/Right arrow (or Shift+Arrow for larger steps) to resize.
 */
export function ColumnResizeHandle({
  label,
  handleProps,
}: {
  label?: string;
  handleProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onClick: (e: React.MouseEvent) => void;
  };
}) {
  return (
    <button
      type="button"
      role="separator"
      aria-orientation="vertical"
      aria-label={label ? `Resize ${label} column` : "Resize column"}
      tabIndex={0}
      {...handleProps}
      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none bg-transparent group-hover:bg-[var(--abv-dark)]/20 hover:!bg-[var(--abv-dark)]/60 active:!bg-[var(--abv-dark)] focus-visible:!bg-[var(--abv-dark)]/70 focus-visible:outline-none transition-colors"
    />
  );
}
