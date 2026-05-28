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
    <div
      className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
      style={{
        borderColor: "var(--abv-azure)",
        background: "var(--abv-azure-tint)",
        color: "var(--abv-ink)",
      }}
    >
      <span aria-hidden="true">🔒</span>
      <span>Focus: {PROPERTY_TYPE_FOCUS_LABEL[focus]}</span>
      <span aria-hidden="true" className="opacity-50">·</span>
      <Link
        href={changeHref}
        className="underline-offset-2 hover:underline"
        style={{ color: "var(--abv-ink)" }}
      >
        change
      </Link>
    </div>
  );
}
