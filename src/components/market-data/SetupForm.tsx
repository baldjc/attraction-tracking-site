"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  KEYWORD_KIT_TEMPLATE,
  hasAvatarSnapshot,
  isPresetSubPersonaId,
  type MarketConfigShape,
  type PriceTier,
  type PrimaryAvatar,
  type SubPersona,
} from "@/lib/market-config";

interface Props {
  initial: MarketConfigShape;
  isEdit: boolean;
}

export default function SetupForm({ initial, isEdit }: Props) {
  const router = useRouter();
  const [state, setState] = useState<MarketConfigShape>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [avatarSource, setAvatarSource] = useState<{
    hasAvatar: boolean;
    name?: string | null;
    summary?: string | null;
    profile?: Record<string, unknown> | null;
    lastUpdatedAt?: string;
  } | null>(null);
  const [pullingAvatar, setPullingAvatar] = useState(false);
  const [avatarPullError, setAvatarPullError] = useState<string | null>(null);
  const pullRequestIdRef = useState({ current: 0 })[0];

  const readyToUpload =
    state.marketName.trim().length > 0 && state.mlsSource.trim().length > 0;
  const hasAvatarOrKit =
    hasAvatarSnapshot(state.primaryAvatar) ||
    (state.keywordKit?.pillars?.length ?? 0) > 0;

  // Probe Avatar Architect once on mount so the empty state can choose the
  // right CTA ("Pull avatar" vs "Run Avatar Architect").
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/member/market-data/config/avatar-source");
        const data = res.ok ? await res.json() : { hasAvatar: false };
        if (!cancelled) setAvatarSource(data);
      } catch {
        if (!cancelled) setAvatarSource({ hasAvatar: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function pullAvatarFromArchitect() {
    // Guard against rapid double-clicks: only the latest request may mutate state.
    const myId = ++pullRequestIdRef.current;
    setAvatarPullError(null);
    setPullingAvatar(true);
    try {
      const res = await fetch("/api/member/market-data/config/avatar-source");
      const data = await res.json().catch(() => ({}));
      if (myId !== pullRequestIdRef.current) return; // stale
      if (!res.ok) {
        throw new Error(data.error || "Could not load avatar.");
      }
      setAvatarSource(data);
      if (!data.hasAvatar) {
        setAvatarPullError(
          "No Avatar Architect data found yet. Build your avatar first.",
        );
        return;
      }
      const snapshot: PrimaryAvatar = {
        source: "avatar-architect",
        snappedAt: new Date().toISOString(),
        name: data.name ?? null,
        summary: data.summary ?? null,
        profile: data.profile ?? null,
      };
      setState({ ...state, primaryAvatar: snapshot });
    } catch (e) {
      if (myId !== pullRequestIdRef.current) return;
      setAvatarPullError((e as Error).message);
    } finally {
      if (myId === pullRequestIdRef.current) setPullingAvatar(false);
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!readyToUpload) {
      setError("Market name and MLS source are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/member/market-data/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(state),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not save configuration.");
      }
      router.push("/member/market-data");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function setTier(i: number, patch: Partial<PriceTier>) {
    const next = [...state.priceTiers];
    next[i] = { ...next[i], ...patch };
    setState({ ...state, priceTiers: next });
  }

  function toggleSubPersona(id: string) {
    const next: SubPersona[] = state.subPersonas.map((p) =>
      p.id === id ? { ...p, enabled: !p.enabled } : p,
    );
    setState({ ...state, subPersonas: next });
  }

  const [customPersonaLabel, setCustomPersonaLabel] = useState("");

  function slugifyPersonaLabel(label: string): string {
    return (
      label
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "persona"
    );
  }

  function addCustomSubPersona() {
    const label = customPersonaLabel.trim();
    if (!label) return;
    // Prevent duplicate labels (case-insensitive) against existing personas.
    const dupe = state.subPersonas.some(
      (p) => p.label.toLowerCase() === label.toLowerCase(),
    );
    if (dupe) {
      setCustomPersonaLabel("");
      return;
    }
    const id = `${slugifyPersonaLabel(label)}_custom_${Date.now()}`;
    setState({
      ...state,
      subPersonas: [...state.subPersonas, { id, label, enabled: true }],
    });
    setCustomPersonaLabel("");
  }

  function removeCustomSubPersona(id: string) {
    if (isPresetSubPersonaId(id)) return; // presets cannot be removed
    setState({
      ...state,
      subPersonas: state.subPersonas.filter((p) => p.id !== id),
    });
  }

  function pasteKeywordTemplate() {
    const marketName = state.marketName || "your market";
    const tpl = {
      pillars: (KEYWORD_KIT_TEMPLATE.pillars ?? []).map((s) =>
        s.replaceAll("{{marketName}}", marketName),
      ),
      longTail: (KEYWORD_KIT_TEMPLATE.longTail ?? []).map((s) =>
        s.replaceAll("{{marketName}}", marketName),
      ),
      notes: KEYWORD_KIT_TEMPLATE.notes,
    };
    setState({ ...state, keywordKit: tpl });
  }

  return (
    <form onSubmit={onSave} className="space-y-8">
      {/* Status banner */}
      <div
        className={`rounded-lg border p-3 text-sm ${
          readyToUpload
            ? "border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200"
            : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
        }`}
      >
        {readyToUpload
          ? "Ready to upload data."
          : "Add a market name and MLS source to enable uploads."}
        {readyToUpload && !hasAvatarOrKit && (
          <span className="block text-xs mt-1 opacity-80">
            Add avatar + keyword kit before generating content (optional for
            now).
          </span>
        )}
      </div>

      {/* Required */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Required
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Market name *
            </span>
            <input
              type="text"
              required
              value={state.marketName}
              onChange={(e) =>
                setState({ ...state, marketName: e.target.value })
              }
              placeholder="Calgary"
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              MLS source *
            </span>
            <input
              type="text"
              required
              value={state.mlsSource}
              onChange={(e) =>
                setState({ ...state, mlsSource: e.target.value })
              }
              placeholder="CREB"
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
        </div>
      </section>

      {/* Price tiers */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Price tiers
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Used to group sales by tier in your facts library. Leave the top tier
          max blank for an open-ended luxury bucket.
        </p>
        <div className="space-y-2">
          {state.priceTiers.map((t, i) => (
            <div key={i} className="grid grid-cols-5 gap-2 items-center">
              <input
                value={t.name}
                onChange={(e) => setTier(i, { name: e.target.value })}
                className="col-span-2 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
              <div className="col-span-3 flex items-center gap-2">
                <span className="text-xs text-gray-500">max $</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={t.maxPrice ?? ""}
                  onChange={(e) =>
                    setTier(i, {
                      maxPrice:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  placeholder="(open-ended)"
                  className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* MOI */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Months-of-inventory thresholds
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs text-gray-600 dark:text-gray-400">
              Sellers' market below
            </span>
            <input
              type="number"
              step="0.1"
              value={state.moiThresholds.sellers}
              onChange={(e) =>
                setState({
                  ...state,
                  moiThresholds: {
                    ...state.moiThresholds,
                    sellers: Number(e.target.value),
                  },
                })
              }
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-600 dark:text-gray-400">
              Buyers' market above
            </span>
            <input
              type="number"
              step="0.1"
              value={state.moiThresholds.buyers}
              onChange={(e) =>
                setState({
                  ...state,
                  moiThresholds: {
                    ...state.moiThresholds,
                    buyers: Number(e.target.value),
                  },
                })
              }
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </label>
        </div>
      </section>

      {/* High-end exception */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          High-end exception
        </h2>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={state.highEndException.enabled}
            onChange={(e) =>
              setState({
                ...state,
                highEndException: {
                  ...state.highEndException,
                  enabled: e.target.checked,
                },
              })
            }
          />
          Use a separate MOI rule for high-end sales
        </label>
        {state.highEndException.enabled && (
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs text-gray-600 dark:text-gray-400">
                Price threshold ($)
              </span>
              <input
                type="number"
                value={state.highEndException.priceThreshold}
                onChange={(e) =>
                  setState({
                    ...state,
                    highEndException: {
                      ...state.highEndException,
                      priceThreshold: Number(e.target.value),
                    },
                  })
                }
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-600 dark:text-gray-400">
                Property types (comma-separated)
              </span>
              <input
                type="text"
                value={state.highEndException.propertyTypes.join(", ")}
                onChange={(e) =>
                  setState({
                    ...state,
                    highEndException: {
                      ...state.highEndException,
                      propertyTypes: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                  })
                }
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </label>
          </div>
        )}
      </section>

      {/* Neighbourhood vocab */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Neighbourhood vocabulary
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          We'll auto-detect neighbourhoods from your first CSV upload. You can
          paste a starter list here (comma- or newline-separated).
        </p>
        <textarea
          rows={3}
          value={state.neighbourhoodVocab.join(", ")}
          onChange={(e) =>
            setState({
              ...state,
              neighbourhoodVocab: e.target.value
                .split(/[,\n]/)
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="Beltline, Bridgeland, Inglewood, …"
          className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
      </section>

      {/* Keyword kit */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Keyword kit
          </h2>
          <button
            type="button"
            onClick={pasteKeywordTemplate}
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            Paste from template
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Optional. Helps title generation when the wizard ships in Wave 2.
        </p>
        <label className="block">
          <span className="text-xs text-gray-600 dark:text-gray-400">
            Pillar keywords (one per line)
          </span>
          <textarea
            rows={3}
            value={(state.keywordKit.pillars ?? []).join("\n")}
            onChange={(e) =>
              setState({
                ...state,
                keywordKit: {
                  ...state.keywordKit,
                  pillars: e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                },
              })
            }
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-600 dark:text-gray-400">
            Long-tail keywords (one per line)
          </span>
          <textarea
            rows={3}
            value={(state.keywordKit.longTail ?? []).join("\n")}
            onChange={(e) =>
              setState({
                ...state,
                keywordKit: {
                  ...state.keywordKit,
                  longTail: e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                },
              })
            }
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
        </label>
      </section>

      {/* Primary avatar — snapshot of Avatar Architect output (canonical lives on User) */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Primary avatar
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Optional for now — required before you generate ideas or scripts.
        </p>

        {hasAvatarSnapshot(state.primaryAvatar) ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {state.primaryAvatar.name ?? "(unnamed avatar)"}
                  </span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-500">
                    {state.primaryAvatar.source === "avatar-architect"
                      ? "from Avatar Architect"
                      : "manual entry (legacy)"}
                  </span>
                </div>
                {state.primaryAvatar.summary ? (
                  <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">
                    {state.primaryAvatar.summary.length > 200
                      ? state.primaryAvatar.summary.slice(0, 200) + "…"
                      : state.primaryAvatar.summary}
                  </p>
                ) : (
                  <p className="mt-1 text-xs italic text-gray-400 dark:text-gray-600">
                    No summary saved on this snapshot.
                  </p>
                )}
                <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-500">
                  Snapshot taken{" "}
                  {state.primaryAvatar.snappedAt
                    ? new Date(state.primaryAvatar.snappedAt).toLocaleString()
                    : "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={pullAvatarFromArchitect}
                disabled={pullingAvatar}
                className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
              >
                {pullingAvatar ? "Pulling…" : "Re-pull from Avatar Architect"}
              </button>
            </div>
            <div className="mt-2">
              <a
                href="/member/ai-tools/avatar-architect"
                className="text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                Edit avatar in Avatar Architect →
              </a>
            </div>
          </div>
        ) : avatarSource?.hasAvatar ? (
          <div className="rounded-md border border-dashed border-gray-300 p-4 text-sm dark:border-gray-700">
            <p className="text-gray-700 dark:text-gray-300">
              You have an Avatar Architect avatar
              {avatarSource.name ? ` (${avatarSource.name})` : ""} — snapshot it
              into your market config so the upload pipelines can read it.
            </p>
            <button
              type="button"
              onClick={pullAvatarFromArchitect}
              disabled={pullingAvatar}
              className="mt-3 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {pullingAvatar ? "Pulling…" : "Pull avatar from Avatar Architect"}
            </button>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-gray-300 p-4 text-sm dark:border-gray-700">
            <p className="text-gray-700 dark:text-gray-300">
              You haven't built an avatar yet.
            </p>
            <a
              href="/member/ai-tools/avatar-architect"
              className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Run Avatar Architect →
            </a>
          </div>
        )}

        {avatarPullError && (
          <div className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {avatarPullError}
          </div>
        )}
      </section>

      {/* Sub-personas */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Sub-personas
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {state.subPersonas.map((p) => {
            const isCustom = !isPresetSubPersonaId(p.id);
            return (
              <div
                key={p.id}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                  p.enabled
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : isCustom
                      ? "border-dashed border-gray-400 dark:border-gray-600"
                      : "border-gray-300 dark:border-gray-700"
                }`}
              >
                <label className="flex flex-1 items-center gap-2 cursor-pointer min-w-0">
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onChange={() => toggleSubPersona(p.id)}
                  />
                  <span className="truncate text-gray-800 dark:text-gray-200">
                    {p.label}
                  </span>
                  {isCustom && (
                    <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                      Custom
                    </span>
                  )}
                </label>
                {isCustom && (
                  <button
                    type="button"
                    onClick={() => removeCustomSubPersona(p.id)}
                    aria-label={`Remove ${p.label}`}
                    className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customPersonaLabel}
            onChange={(e) => setCustomPersonaLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomSubPersona();
              }
            }}
            placeholder="Add a custom persona (e.g. Snowbird)"
            maxLength={60}
            className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <button
            type="button"
            onClick={addCustomSubPersona}
            disabled={customPersonaLabel.trim().length === 0}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
          >
            Add
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-800">
        <button
          type="submit"
          disabled={saving || !readyToUpload}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : isEdit ? "Save changes" : "Save & continue"}
        </button>
      </div>
    </form>
  );
}
