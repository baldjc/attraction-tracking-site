"use client";

import type { ReactNode } from "react";
import {
  IDEA_THEME_CLASSES,
  PIPELINE_STATUS_CLASSES,
  type IdeaThemeKey,
  type PipelineStatusKey,
} from "./types";

export interface PipelineCardProps {
  title: string;
  /** Status pill — visible label always; colour comes from `statusKey`. */
  status?: string;
  statusKey?: PipelineStatusKey | null;
  /** Theme pill text. Optional — omitted when the plan has no theme. */
  theme?: string | null;
  themeKey?: IdeaThemeKey | null;
  /** Bottom-left meta line (e.g. "Film Tue May 18" or "Publish May 31"). */
  metaLine?: string | null;
  /** Top-right initials avatar — small, ink-on-azure per mockup. */
  avatarInitials?: string | null;
  /** Optional dragging-state opacity flag (existing PipelineView wires it). */
  dragging?: boolean;
  onClick?: () => void;
  /** Native drag handlers from the existing HTML5 wiring. */
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  draggable?: boolean;
  /** Optional extras (score badge, drive folder link icon) rendered next
   *  to the drag handle. Keeps existing PipelineView data on screen. */
  topRightExtras?: ReactNode;
  /** Optional inline progress track or other body chrome rendered between
   *  the title and the foot. Keeps existing planner affordances on the
   *  card without redesigning them. */
  body?: ReactNode;
  /** Title for the native tooltip — useful when title is truncated. */
  titleAttr?: string;
}

/**
 * Variant 2 — Pipeline / Theme Card. Mirrors the mockup's .pipe-card
 * (12px radius pre-bumped to 10px to keep kanban density). 1px lift on
 * hover, shadow-md, border preserved at base.
 */
export function PipelineCard({
  title,
  status,
  statusKey,
  theme,
  themeKey,
  metaLine,
  avatarInitials,
  dragging,
  onClick,
  onDragStart,
  onDragEnd,
  draggable,
  topRightExtras,
  body,
  titleAttr,
}: PipelineCardProps) {
  const statusStyle =
    statusKey != null ? PIPELINE_STATUS_CLASSES[statusKey] : null;
  const themeStyle = themeKey != null ? IDEA_THEME_CLASSES[themeKey] : null;
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`relative rounded-[10px] border border-[var(--abv-border)] bg-white p-[14px_16px] shadow-[0_1px_3px_rgba(0,0,0,0.04)] cursor-pointer transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-px hover:border-[var(--abv-border-strong)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        {topRightExtras}
        <span
          className="text-xs leading-none text-[var(--abv-text-dim)]/60 cursor-grab"
          aria-hidden
        >
          ⋮⋮
        </span>
      </div>

      {status && (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] font-mono text-[9.5px] font-bold tracking-[0.06em] uppercase ${
            statusStyle?.pill ??
            "bg-[var(--abv-bg-warm)] text-[var(--abv-text-muted)]"
          }`}
        >
          <span
            className={`w-[5px] h-[5px] rounded-full ${
              statusStyle?.dot ?? "bg-[var(--abv-text-dim)]"
            }`}
          />
          {status}
        </span>
      )}

      <p
        className="font-display text-[15px] font-semibold leading-[1.3] text-[var(--abv-text)] my-2 pr-4"
        title={titleAttr ?? title}
      >
        {title}
      </p>

      {theme && (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-[7px] py-[2px] text-[10px] font-semibold max-w-full truncate ${
            themeStyle?.pill ??
            "bg-[var(--abv-bg-warm)] text-[var(--abv-text-muted)]"
          }`}
          title={theme}
        >
          {themeStyle && (
            <span className={`w-[5px] h-[5px] rounded-full ${themeStyle.dot}`} />
          )}
          {theme}
        </span>
      )}

      {body && <div className="mt-2.5">{body}</div>}

      {(metaLine || avatarInitials) && (
        <div className="flex items-center gap-2 pt-2.5 mt-2.5 border-t border-[var(--abv-border)]">
          {metaLine && (
            <span className="flex-1 font-mono text-[10px] tracking-[0.04em] text-[var(--abv-text-muted)] truncate">
              {metaLine}
            </span>
          )}
          {avatarInitials && (
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--abv-azure)] font-display font-extrabold text-[9px] text-[var(--abv-ink)]"
              title={avatarInitials}
            >
              {avatarInitials}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
