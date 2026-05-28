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
  return (
    <fieldset className="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
        {label}
      </legend>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{helper}</p>
      <div className="flex flex-wrap gap-2">
        {PROPERTY_TYPE_FOCUS_VALUES.map((v) => {
          const selected = v === value;
          return (
            <label
              key={v}
              className={`cursor-pointer select-none rounded-full border px-3 py-1 text-sm transition ${
                selected
                  ? "border-blue-500 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-600"
                  : "border-gray-300 bg-white text-gray-700 hover:border-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <input
                type="radio"
                name="propertyTypeFocus"
                value={v}
                checked={selected}
                onChange={() => onChange(v)}
                disabled={disabled}
                className="sr-only"
              />
              {PROPERTY_TYPE_FOCUS_LABEL[v]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
