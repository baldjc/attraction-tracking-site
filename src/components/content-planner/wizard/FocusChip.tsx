"use client";

/**
 * Wave 4 — pinned "Focus: X · [change]" chip that sits at the top of every
 * post-pick wizard screen (steps 2a/2b/2c/3/4) once a property-type focus
 * has been chosen. Clicking [change] sends the user back to the picker on
 * the appropriate step.
 */
import Link from "next/link";
import {
  PROPERTY_TYPE_FOCUS_LABEL,
  type PropertyTypeFocus,
} from "@/lib/property-type-focus";

interface Props {
  focus: PropertyTypeFocus;
  changeHref: string;
}

export function FocusChip({ focus, changeHref }: Props) {
  return (
    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-900 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-100">
      <span aria-hidden="true">🔒</span>
      <span>Focus: {PROPERTY_TYPE_FOCUS_LABEL[focus]}</span>
      <span aria-hidden="true" className="text-blue-400">·</span>
      <Link
        href={changeHref}
        className="text-blue-700 underline-offset-2 hover:underline dark:text-blue-200"
      >
        change
      </Link>
    </div>
  );
}
