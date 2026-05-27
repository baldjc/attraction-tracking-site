"use client";

/**
 * Wave 2 wizard — Step 4: Review picked idea, then save as ContentPlan.
 *
 * Reads the picked card from sessionStorage (keyed by ?picked=). If the key
 * is missing or stale, redirects to Step 1 rather than blowing up.
 *
 * On save: POST /api/member/content-planner/wizard/save-idea, then follow
 * the redirectUrl (which lands on the planner with ?plan=<id> so the
 * existing edit modal pops open).
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface IdeaCard {
  title: string;
  rotationSlot: string;
  titlePromise: string;
  thumbnailCallouts: string[];
  clarityPremise: string;
  citedFactIds: string[];
  visualPeak: string;
  subPersonas: string[];
  framework: string;
  tactileType: string;
  estimatedRuntime?: string;
  whyItWorks?: string;
}

interface Picked {
  idea: IdeaCard;
  sourceUploadId: string;
  storyLeadId: string | null;
}

const PROPERTY_TYPE_OPTIONS = [
  { value: "", label: "Auto (infer from cited facts)" },
  { value: "Detached", label: "Detached" },
  { value: "Row/Townhouse", label: "Row/Townhouse" },
  { value: "Semi-Detached", label: "Semi-Detached" },
  { value: "Apartment", label: "Apartment" },
  { value: "All", label: "All property types" },
];

interface SaveResponse {
  id?: string;
  redirectUrl?: string;
  error?: string;
  message?: string;
  errors?: string[];
}

export function Step4Review({ pickedKey }: { pickedKey?: string }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [propertyTypeFocus, setPropertyTypeFocus] = useState<string>("");

  useEffect(() => {
    if (!pickedKey) {
      setMissing(true);
      return;
    }
    try {
      const raw = sessionStorage.getItem(pickedKey);
      if (!raw) {
        setMissing(true);
        return;
      }
      setPicked(JSON.parse(raw) as Picked);
    } catch {
      setMissing(true);
    }
  }, [pickedKey]);

  useEffect(() => {
    if (missing) {
      router.replace("/member/content-planner/wizard?step=1");
    }
  }, [missing, router]);

  async function save() {
    if (!picked) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/member/content-planner/wizard/save-idea", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...picked.idea,
          storyLeadId: picked.storyLeadId,
          sourceUploadId: picked.sourceUploadId,
          propertyTypeFocus: propertyTypeFocus || null,
        }),
      });
      const j = (await r.json()) as SaveResponse;
      if (!r.ok || !j.redirectUrl) {
        const msg = j.message ?? j.error ?? `Save failed (${r.status})`;
        const detail = j.errors?.length ? ` — ${j.errors.join("; ")}` : "";
        setError(msg + detail);
        setSaving(false);
        return;
      }
      // Clean up the sessionStorage entry on success — it's a one-shot key.
      if (pickedKey) sessionStorage.removeItem(pickedKey);
      router.push(j.redirectUrl);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  if (missing) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
        We lost track of your picked idea — redirecting to the start…
      </div>
    );
  }

  if (!picked) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
        Loading…
      </div>
    );
  }

  const c = picked.idea;
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {c.title}
          </h2>
          <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            {c.rotationSlot}
          </span>
        </div>
        <p className="mt-2 text-sm italic text-gray-600 dark:text-gray-400">
          {c.titlePromise}
        </p>

        <Field label="Clarity premise">{c.clarityPremise}</Field>
        <Field label="Visual peak">{c.visualPeak}</Field>
        <Field label="Framework">{c.framework}</Field>
        <Field label="Tactile type">{c.tactileType}</Field>
        {c.estimatedRuntime && <Field label="Estimated runtime">{c.estimatedRuntime}</Field>}
        {c.whyItWorks && <Field label="Why it works">{c.whyItWorks}</Field>}
        <Field label="Sub-personas">{c.subPersonas.join(", ") || "—"}</Field>

        <p className="mt-4 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Thumbnail callouts
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {c.thumbnailCallouts.map((t, i) => (
            <span
              key={i}
              className="rounded bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200"
            >
              {t}
            </span>
          ))}
        </div>

        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          {c.citedFactIds.length} cited fact(s) will be linked to this content plan.
        </p>

        {/* Wave 4 — propertyType lock. Member picks one type to anchor
            Script Builder v2 on; "Auto" defers to the citedFacts' caveat
            (if any) and otherwise falls through to no-lock. */}
        <div className="mt-5 border-t border-gray-200 pt-4 dark:border-gray-700">
          <label
            htmlFor="propertyTypeFocus"
            className="block text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Property type focus
          </label>
          <select
            id="propertyTypeFocus"
            value={propertyTypeFocus}
            onChange={(e) => setPropertyTypeFocus(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          >
            {PROPERTY_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            Locks Script Builder to this property type per neighbourhood so the script can&apos;t pivot to a different type. Leave on Auto if the cited facts already name one.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Link
          href="/member/content-planner/wizard?step=1"
          className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
        >
          ← Start over
        </Link>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save as Content Plan →"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="text-sm text-gray-700 dark:text-gray-300">{children}</p>
    </div>
  );
}
