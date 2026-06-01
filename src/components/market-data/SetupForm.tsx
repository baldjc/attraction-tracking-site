"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Button } from "@/components/ui/Button";

interface VoiceGuideInfo {
  charCount: number;
  uploadedAt: string | null;
  sourceFile: string | null;
}

interface Props {
  initial: MarketConfigShape;
  isEdit: boolean;
  voiceGuideEnabled?: boolean;
  voiceGuideInitial?: VoiceGuideInfo | null;
}

export default function SetupForm({
  initial,
  isEdit,
  voiceGuideEnabled = false,
  voiceGuideInitial = null,
}: Props) {
  const router = useRouter();
  const [state, setState] = useState<MarketConfigShape>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ship B — Voice Guide upload state (DWY tier only; section is completely
  // hidden when `voiceGuideEnabled === false`). Lives outside MarketConfigShape
  // on purpose: the voice guide is uploaded through a dedicated endpoint, not
  // through the main config PUT.
  const [voiceGuide, setVoiceGuide] = useState<VoiceGuideInfo | null>(
    voiceGuideInitial,
  );
  const [voicePaste, setVoicePaste] = useState("");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [voiceHelpOpen, setVoiceHelpOpen] = useState(false);

  // Hydration-safe locale formatting. The server renders dates in the
  // container's locale/timezone; the browser renders in the user's locale.
  // Those almost always differ, which yields a "server rendered text didn't
  // match the client" hydration error on this page. Guard locale-sensitive
  // text behind a post-mount flag so the first paint is deterministic.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const voiceUploadedAtLabel = useMemo(() => {
    if (!mounted || !voiceGuide?.uploadedAt) return null;
    try {
      return new Date(voiceGuide.uploadedAt).toLocaleString();
    } catch {
      return null;
    }
  }, [mounted, voiceGuide?.uploadedAt]);

  async function saveVoiceGuide(formData: FormData) {
    setVoiceBusy(true);
    setVoiceError(null);
    setVoiceNotice(null);
    try {
      const res = await fetch("/api/member/voice-guide/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setVoiceError(data.error || "Could not save voice guide.");
        return;
      }
      setVoiceGuide({
        charCount: data.charCount,
        uploadedAt: data.uploadedAt ?? new Date().toISOString(),
        sourceFile: data.sourceFile ?? null,
      });
      setVoicePaste("");
      setVoiceNotice("Voice guide saved.");
    } catch (e) {
      setVoiceError((e as Error).message);
    } finally {
      setVoiceBusy(false);
    }
  }

  async function onSaveVoicePaste() {
    const text = voicePaste.trim();
    if (text.length < 500) {
      setVoiceError(
        "Voice guide must be at least 500 characters to be substantive enough to use.",
      );
      return;
    }
    if (text.length > 50_000) {
      setVoiceError(
        "Voice guide is too long (50,000 character max). Trim to operational rules.",
      );
      return;
    }
    const fd = new FormData();
    fd.set("text", text);
    await saveVoiceGuide(fd);
  }

  async function onUploadVoiceFile(file: File) {
    const fd = new FormData();
    fd.set("file", file);
    await saveVoiceGuide(fd);
  }

  async function onResetVoiceGuide() {
    if (
      !confirm(
        "Remove your uploaded voice guide and revert scripts to the default voice register?",
      )
    ) {
      return;
    }
    setVoiceBusy(true);
    setVoiceError(null);
    setVoiceNotice(null);
    try {
      const res = await fetch("/api/member/voice-guide/upload", {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setVoiceError(data.error || "Could not reset voice guide.");
        return;
      }
      setVoiceGuide(null);
      setVoicePaste("");
      setVoiceNotice("Voice guide cleared. Scripts will use the default voice.");
    } catch (e) {
      setVoiceError((e as Error).message);
    } finally {
      setVoiceBusy(false);
    }
  }

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
          Optional. The AI title generator uses these to write YouTube titles
          your audience actually searches. Add what you want to rank for in
          your local market.
        </p>
        <label className="block">
          <span className="text-xs text-gray-600 dark:text-gray-400">
            Pillar keywords (one per line)
          </span>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Broad topics you want to be known for. 3–5 is plenty. Examples:
            &ldquo;[Your city] real estate market update&rdquo;, &ldquo;[Your
            city] home prices&rdquo;, &ldquo;[Your city] housing market&rdquo;.
          </p>
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
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Specific question-style searches your ideal client types into
            YouTube. Lower volume but higher intent — these convert better.
            Examples: &ldquo;should I buy a home in [your city]&rdquo;,
            &ldquo;[your city] market forecast&rdquo;, &ldquo;best
            neighbourhoods in [your city]&rdquo;.
          </p>
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
            <Button
              size="sm"
              className="mt-3"
              onClick={pullAvatarFromArchitect}
              disabled={pullingAvatar}
            >
              {pullingAvatar ? "Pulling…" : "Pull avatar from Avatar Architect"}
            </Button>
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

      {/* Voice Guide (Ship B) — Done-With-You tier only. The section is
          completely hidden when the feature flag is off, so Foundations
          members never see it. */}
      {voiceGuideEnabled && (
        <section className="space-y-3 rounded-md border border-purple-200 bg-purple-50/40 p-4 dark:border-purple-900/40 dark:bg-purple-950/20">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-300">
              Voice Guide (advanced)
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-gray-700 dark:text-gray-300">
              By default your scripts use the channel&apos;s standard voice
              register — coach-style, plain-language, quality real-estate
              context. If you&apos;ve developed your own voice register and
              want scripts to use it instead, upload a voice guide here. It
              will override the channel default on tone, opener patterns,
              and signature phrases — but data integrity rules (no
              fabrication, no misattribution) always apply.
            </p>
          </div>

          {voiceGuide && (
            <div className="rounded-md border border-purple-200 bg-white p-3 text-xs dark:border-purple-800 dark:bg-gray-950">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                  Active
                </span>
                <span className="text-gray-700 dark:text-gray-300">
                  {voiceGuide.charCount} characters
                </span>
                {voiceGuide.sourceFile && (
                  <span className="text-gray-500 dark:text-gray-500">
                    · {voiceGuide.sourceFile}
                  </span>
                )}
              </div>
              {voiceUploadedAtLabel && (
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-500">
                  Last uploaded {voiceUploadedAtLabel}
                </p>
              )}
            </div>
          )}

          <label className="block">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Paste markdown
            </span>
            <textarea
              value={voicePaste}
              onChange={(e) => setVoicePaste(e.target.value)}
              rows={10}
              placeholder="# Voice guide&#10;&#10;## Tone register&#10;Warm coach, plain-language, occasionally direct.&#10;&#10;## Banned phrases&#10;- 'as a real estate professional'&#10;- 'let's dive in'&#10;&#10;## Signature phrases&#10;- 'here's the thing'&#10;- 'most people don't realize…'&#10;..."
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-mono dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              disabled={voiceBusy}
            />
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-500">
              {voicePaste.length} / 50,000 characters (minimum 500)
            </p>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSaveVoicePaste}
              disabled={voiceBusy || voicePaste.trim().length === 0}
              className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
            >
              {voiceBusy ? "Saving…" : "Save voice guide"}
            </button>

            <label className="cursor-pointer rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900">
              <span>Upload .md / .txt / .docx</span>
              <input
                type="file"
                accept=".md,.txt,.docx,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                disabled={voiceBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    onUploadVoiceFile(f);
                    e.target.value = "";
                  }
                }}
              />
            </label>

            {voiceGuide && (
              <button
                type="button"
                onClick={onResetVoiceGuide}
                disabled={voiceBusy}
                className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20"
              >
                Reset to default
              </button>
            )}
          </div>

          {voiceError && (
            <div className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              {voiceError}
            </div>
          )}
          {voiceNotice && (
            <div className="rounded-md border border-green-300 bg-green-50 p-2 text-xs text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
              {voiceNotice}
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => setVoiceHelpOpen((v) => !v)}
              className="text-xs font-medium text-purple-700 hover:underline dark:text-purple-300"
            >
              {voiceHelpOpen ? "Hide" : "What makes a good voice guide?"}
            </button>
            {voiceHelpOpen && (
              <div className="mt-2 rounded-md border border-purple-200 bg-white p-3 text-xs leading-relaxed text-gray-700 dark:border-purple-900/40 dark:bg-gray-950 dark:text-gray-300">
                <p>
                  A useful voice guide is 2,000-15,000 characters and
                  includes:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    Your <strong>TONE REGISTER</strong> (warm coach? sharp
                    analyst? funny storyteller? professional advisor?)
                  </li>
                  <li>
                    Your <strong>AUDIENCE</strong> in one sentence (who is
                    the single viewer you imagine?)
                  </li>
                  <li>
                    <strong>BANNED PHRASES</strong> specific to your channel
                    (jargon, off-brand language, generic-AI-sounding
                    clichés)
                  </li>
                  <li>
                    <strong>APPROVED PHRASES</strong> you use as signatures
                  </li>
                  <li>
                    <strong>OPENER PATTERNS</strong> you favor (Belief Flip?
                    Story? Question? Direct address?)
                  </li>
                  <li>
                    <strong>CONNECTION LANGUAGE</strong> — how you address
                    the viewer
                  </li>
                  <li>
                    <strong>CLOSING PATTERN</strong> — recap + CTA +
                    sign-off? Just CTA? Cliffhanger to next video?
                  </li>
                </ul>
                <p className="mt-2">
                  You don&apos;t need all of these. The more specific you
                  are, the more your scripts will sound like you. Skip
                  philosophical framing — focus on operational rules and
                  concrete phrases.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

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
                    ? "border-[var(--abv-azure)] bg-[var(--abv-azure-tint)]"
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
        <Button type="submit" disabled={saving || !readyToUpload}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Save & continue"}
        </Button>
      </div>
    </form>
  );
}
