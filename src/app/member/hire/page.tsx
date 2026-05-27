"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import PageHeader from "@/components/PageHeader";
import TierCard, { type TierCategory } from "@/components/hire/TierCard";
import AddOnsSection from "@/components/hire/AddOnsSection";

// ── Toast ─────────────────────────────────────────────────────

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[var(--abv-dark)] text-white text-sm font-medium px-5 py-3.5 rounded-xl shadow-2xl max-w-md w-[calc(100vw-2rem)] animate-slide-up">
      <CheckCircleIcon className="w-5 h-5 text-green-400 shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
        <XMarkIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function HireAHumanPage() {
  const [tierCategories, setTierCategories] = useState<TierCategory[]>([]);
  const [addOnsCategory, setAddOnsCategory] = useState<TierCategory | null>(null);
  const [interestedIds, setInterestedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    Promise.all([
      fetch("/api/member/hire/categories").then((r) => r.ok ? r.json() : { categories: [] }),
      fetch("/api/member/hire/waitlist").then((r) => r.ok ? r.json() : { packageIds: [] }),
    ])
      .then(([catData, wlData]) => {
        const all = (catData.categories ?? [] as TierCategory[])
          .filter((c: TierCategory) => c.published)
          .sort((a: TierCategory, b: TierCategory) => (a as any).sortOrder - (b as any).sortOrder);
        setTierCategories(all.filter((c: TierCategory) => c.slug !== "add-ons"));
        setAddOnsCategory(all.find((c: TierCategory) => c.slug === "add-ons") ?? null);
        setInterestedIds(new Set(wlData.packageIds ?? []));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleInterested = useCallback(async (packageId: string, packageName: string) => {
    const res = await fetch("/api/member/hire/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId }),
    });
    if (res.ok) {
      setInterestedIds((prev) => new Set([...prev, packageId]));
      setToast(`Thanks for your interest in ${packageName}! Jared will reach out shortly.`);
    }
  }, []);

  return (
    <>
      <div className="space-y-8 max-w-7xl pb-12">

        {/* Header */}
        <div>
          <PageHeader emoji="🤝" title="Hire a Human" />

          <p className="text-2xl font-bold text-[var(--abv-text)] dark:text-white leading-snug max-w-2xl mb-6">
            You didn&apos;t get to where you are only to spend your weekends and evenings editing videos.
          </p>

          <div className="pl-5 max-w-2xl" style={{ borderLeft: "3px solid rgba(139,92,246,0.30)" }}>
            <p className="text-sm text-[var(--abv-text)]/60 dark:text-white/60 leading-relaxed">
              <span className="font-semibold text-[var(--abv-text)] dark:text-white">You know what to say on camera.</span>{" "}
              It&apos;s everything after you hit stop that kills your momentum.
            </p>
            <p className="text-sm text-[var(--abv-text)]/60 dark:text-white/60 leading-relaxed mt-4">
              <span className="font-semibold text-[var(--abv-text)] dark:text-white">One skipped week becomes two.</span>{" "}
              Then a month. Then you&apos;re starting over.
            </p>
            <p className="text-sm text-[var(--abv-text)]/60 dark:text-white/60 leading-relaxed mt-4">
              The agents who grow fastest aren&apos;t better on camera —{" "}
              <span className="font-semibold text-[var(--abv-text)] dark:text-white">they just never stop publishing.</span>
            </p>
          </div>
        </div>

        {/* Tier cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-96 bg-[var(--abv-border-strong)] dark:bg-white/10 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
            {tierCategories.map((cat) => (
              <TierCard
                key={cat.id}
                category={cat}
                interested={interestedIds}
                onInterested={handleInterested}
              />
            ))}
          </div>
        )}

        {/* Add-Ons */}
        {!loading && addOnsCategory && (
          <AddOnsSection
            category={addOnsCategory}
            interested={interestedIds}
            onInterested={handleInterested}
          />
        )}

      </div>

      {toast && <Toast message={toast} onDismiss={dismissToast} />}

      <style>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translate(-50%, 1rem); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        .animate-slide-up { animation: slide-up 0.25s ease-out both; }
      `}</style>
    </>
  );
}
