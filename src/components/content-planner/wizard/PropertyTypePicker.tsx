"use client";

/**
 * Wave 4 — radio-style property-type focus picker. Used in:
 *   - Step 2B (Idea Validation) — inside the "describe your idea" form, default Any
 *   - Step 2C (Theme picker) — shown after a theme is selected as an
 *     optional "Narrow to property type?" step.
 *
 * Story Lead mode (Step 2A) uses `inferFocusFromStoryLeadText` instead of
 * this picker — the lock auto-locks from the picked lead.
 */
import {
  PROPERTY_TYPE_FOCUS_VALUES,
  PROPERTY_TYPE_FOCUS_LABEL,
  type PropertyTypeFocus,
} from "@/lib/property-type-focus";
import { SegmentedPill } from "@/components/ui/SegmentedPill";

interface Props {
  value: PropertyTypeFocus;
  onChange: (v: PropertyTypeFocus) => void;
  label?: string;
  helper?: string;
  disabled?: boolean;
}

export function PropertyTypePicker({
  value,
  onChange,
  label = "Property type focus",
  helper = "Locks every idea, validation, and downstream script to this property type. Pick Any to leave it open.",
  disabled,
}: Props) {
  const options = PROPERTY_TYPE_FOCUS_VALUES.map((v) => ({
    value: v,
    label: PROPERTY_TYPE_FOCUS_LABEL[v],
    disabled,
  }));
  return (
    <fieldset className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
        {label}
      </legend>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{helper}</p>
      <SegmentedPill
        ariaLabel={label}
        options={options}
        value={value}
        onChange={onChange}
        size="sm"
      />
    </fieldset>
  );
}
