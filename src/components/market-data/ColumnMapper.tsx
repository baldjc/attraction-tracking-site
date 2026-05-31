"use client";

import { useMemo, useState } from "react";
import {
  REQUIRED_MAPPING_FIELDS,
  MAPPER_OPTIONAL_FIELDS,
  FIELD_LABELS,
  suggestMappingFromHeaders,
  type ColumnMapping,
  type AnyMappedField,
  type FieldSuggestion,
} from "@/lib/market-config";
import { Button } from "@/components/ui/Button";

interface Props {
  /** All column headers from the member's actual CSV. */
  headers: string[];
  /** The member's saved/effective mapping to pre-fill from. */
  initialMapping: ColumnMapping | null;
  onSave: (mapping: ColumnMapping) => void;
  onCancel: () => void;
  /** Disables the controls while a save/upload round-trip is in flight. */
  saving?: boolean;
  title?: string;
  intro?: string;
  saveLabel?: string;
  /** Optional contextual banner (e.g. the specific preflight error). */
  banner?: React.ReactNode;
}

/** Build the initial selection: a saved header that exists in THIS file wins;
 *  otherwise a high-confidence auto-suggestion is selected. Low-confidence
 *  suggestions are left unselected (surfaced as a "verify" hint instead). */
function buildInitialSelection(
  headers: string[],
  initialMapping: ColumnMapping | null,
  suggestions: Partial<Record<AnyMappedField, FieldSuggestion>>,
): ColumnMapping {
  const headerSet = new Set(headers);
  const out: ColumnMapping = {};
  const fields: AnyMappedField[] = [
    ...REQUIRED_MAPPING_FIELDS,
    ...MAPPER_OPTIONAL_FIELDS,
  ];
  for (const f of fields) {
    const saved = initialMapping?.[f];
    if (saved && headerSet.has(saved)) {
      out[f] = saved;
      continue;
    }
    const sug = suggestions[f];
    if (sug && sug.confidence === "high") out[f] = sug.header;
  }
  return out;
}

export default function ColumnMapper({
  headers,
  initialMapping,
  onSave,
  onCancel,
  saving = false,
  title = "Map your columns",
  intro = "We couldn't auto-detect some required fields. Tell us which of your columns corresponds to each.",
  saveLabel = "Save this mapping and continue",
  banner,
}: Props) {
  const suggestions = useMemo(
    () => suggestMappingFromHeaders(headers),
    [headers],
  );
  const [mapping, setMapping] = useState<ColumnMapping>(() =>
    buildInitialSelection(headers, initialMapping, suggestions),
  );

  const headerSet = useMemo(() => new Set(headers), [headers]);

  const missingRequired = useMemo(
    () =>
      REQUIRED_MAPPING_FIELDS.filter((f) => {
        const v = mapping[f];
        return !v || !headerSet.has(v);
      }),
    [mapping, headerSet],
  );

  const canSave = missingRequired.length === 0 && !saving;

  function setField(field: AnyMappedField, header: string) {
    setMapping((m) => {
      const next = { ...m };
      if (header === "") delete next[field];
      else next[field] = header;
      return next;
    });
  }

  function renderRow(field: AnyMappedField, required: boolean) {
    const value = mapping[field] ?? "";
    const sug = suggestions[field];
    const savedHeader = initialMapping?.[field];
    const savedMissing = !!savedHeader && !headerSet.has(savedHeader);

    // Status note to the right of the dropdown.
    let note: { text: string; tone: "ok" | "warn" } | null = null;
    if (value) {
      if (sug && sug.header === value && sug.confidence === "high") {
        note = { text: "✓ looks right", tone: "ok" };
      } else if (sug && sug.header === value && sug.confidence === "low") {
        note = { text: "⚠ not sure — verify", tone: "warn" };
      }
    } else if (savedMissing) {
      note = {
        text: `⚠ "${savedHeader}" isn't in this file — pick again`,
        tone: "warn",
      };
    } else if (sug && sug.confidence === "low") {
      note = { text: "⚠ not sure — pick a column", tone: "warn" };
    } else if (required) {
      note = { text: "Pick a column", tone: "warn" };
    }

    return (
      <div
        key={field}
        className="grid grid-cols-12 items-center gap-2 py-1.5 text-sm"
      >
        <span className="col-span-4 text-gray-700 dark:text-gray-300">
          {FIELD_LABELS[field]}
          {required && <span className="text-red-500"> *</span>}
        </span>
        <span className="col-span-1 text-center text-gray-400">←</span>
        <select
          value={value}
          disabled={saving}
          onChange={(e) => setField(field, e.target.value)}
          className="col-span-4 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 disabled:opacity-60"
        >
          <option value="">
            {required ? "Pick a column…" : "— none —"}
          </option>
          {headers.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span
          className={`col-span-3 text-xs ${
            note?.tone === "ok"
              ? "text-green-600 dark:text-green-400"
              : note?.tone === "warn"
                ? "text-amber-600 dark:text-amber-400"
                : "text-transparent"
          }`}
        >
          {note?.text ?? ""}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-md border-2 border-blue-400 bg-white p-4 dark:border-blue-500 dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="text-lg">
          📋
        </span>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
      </div>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{intro}</p>

      {banner && <div className="mt-3">{banner}</div>}

      <div className="mt-4 divide-y divide-gray-100 dark:divide-gray-800">
        {REQUIRED_MAPPING_FIELDS.map((f) => renderRow(f, true))}
      </div>

      <div className="mt-4">
        <div className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Optional fields
        </div>
        <div className="mt-1 divide-y divide-gray-100 dark:divide-gray-800">
          {MAPPER_OPTIONAL_FIELDS.map((f) => renderRow(f, false))}
        </div>
        {!mapping.saleToListRatio && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            No sale-to-list ratio column mapped. If your MLS export includes one
            (e.g. &ldquo;Close-List Price Ratio&rdquo;, &ldquo;SoldVsList%&rdquo;,
            &ldquo;SP/LP&rdquo;), map it above to unlock bidding-intensity videos
            (where buyers are competing / homes selling over asking). If your
            export doesn&rsquo;t include one, those videos won&rsquo;t be
            available.
          </p>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-sm text-gray-500 hover:underline disabled:opacity-60"
        >
          Cancel
        </button>
        <div className="flex items-center gap-3">
          {!canSave && missingRequired.length > 0 && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Still needed:{" "}
              {missingRequired.map((f) => FIELD_LABELS[f]).join(", ")}
            </span>
          )}
          <Button onClick={() => onSave(mapping)} disabled={!canSave}>
            {saving ? "Saving…" : saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
