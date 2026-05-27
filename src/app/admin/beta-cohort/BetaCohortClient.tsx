"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastProvider";

interface Member {
  id: string;
  email: string;
  name: string | null;
  serviceTier: string | null;
  cohort: "Foundations" | "Production" | "Growth" | "DWY";
  inBeta: boolean;
  onboardingPending: boolean;
}

interface BetaSummary {
  count: number;
  members: { id: string; name: string | null; email: string; serviceTier: string | null }[];
}

interface ApiResponse {
  members: Member[];
  betaSummary: BetaSummary;
}

type PendingAction =
  | { type: "add"; member: Member }
  | { type: "remove"; member: Member }
  | null;

export default function BetaCohortClient() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingAction>(null);
  const [working, setWorking] = useState(false);

  // 300ms debounce on the search input — fewer round-trips while typing.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = debouncedSearch
        ? `?search=${encodeURIComponent(debouncedSearch)}`
        : "";
      const res = await fetch(`/api/admin/beta-cohort${qs}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as ApiResponse;
      setData(json);
    } catch (err) {
      toast.error(`Could not load members: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, toast]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function confirmAction() {
    if (!pending) return;
    setWorking(true);
    try {
      const res = await fetch("/api/admin/beta-cohort", {
        method: pending.type === "add" ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: pending.member.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      toast.success(json?.message ?? "Done.");
      setPending(null);
      await fetchData();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setWorking(false);
    }
  }

  const memberCount = data?.members.length ?? 0;
  const betaSummary = data?.betaSummary;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[#2f3437] dark:text-white">
          Beta Cohort Manager
        </h1>
        <p className="mt-1 text-sm text-[#2f3437]/70 dark:text-white/70 leading-relaxed">
          Add or remove members from the v2 beta. Adding resets their
          onboarding wizard and grants access to all v2 features. Removing
          reverts both.
        </p>
      </header>

      {/* Beta summary card */}
      <section className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a2433] p-5">
        <p className="text-sm font-semibold text-[#2f3437] dark:text-white">
          {betaSummary
            ? `${betaSummary.count} member${betaSummary.count === 1 ? "" : "s"} currently in beta`
            : "Loading beta cohort…"}
        </p>
        {betaSummary && betaSummary.count > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-[#2f3437]/80 dark:text-white/80">
            {betaSummary.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <span>•</span>
                <span>{m.name || "(no name)"}</span>
                <span className="text-xs text-[#2f3437]/50 dark:text-white/50">
                  {m.email} · {m.serviceTier ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {betaSummary && betaSummary.count === 0 && (
          <p className="mt-2 text-sm text-[#2f3437]/60 dark:text-white/60 italic">
            Nobody is in the beta yet. Search for a member below to add them.
          </p>
        )}
      </section>

      {/* Search */}
      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or name…"
          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#0f1825] px-4 py-2.5 text-sm text-[#2f3437] dark:text-white placeholder:text-[#2f3437]/40 dark:placeholder:text-white/40"
        />
      </div>

      {/* Member list */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a2433] overflow-hidden">
        {loading && (
          <div className="p-8 text-center text-sm text-[#2f3437]/60 dark:text-white/60">
            Loading…
          </div>
        )}
        {!loading && memberCount === 0 && (
          <div className="p-8 text-center text-sm text-[#2f3437]/60 dark:text-white/60">
            No members match that search.
          </div>
        )}
        {!loading && memberCount > 0 && (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {data!.members.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                onAdd={() => setPending({ type: "add", member: m })}
                onRemove={() => setPending({ type: "remove", member: m })}
              />
            ))}
          </ul>
        )}
        {!loading && memberCount === 50 && (
          <p className="px-4 py-2 text-xs text-[#2f3437]/50 dark:text-white/50 bg-gray-50 dark:bg-[#0f1825] border-t border-gray-100 dark:border-gray-800">
            Showing 50 — narrow your search to see more.
          </p>
        )}
      </section>

      {/* Confirmation modal */}
      {pending && (
        <ConfirmModal
          action={pending}
          working={working}
          onCancel={() => !working && setPending(null)}
          onConfirm={() => void confirmAction()}
        />
      )}
    </div>
  );
}

function MemberRow({
  member,
  onAdd,
  onRemove,
}: {
  member: Member;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#2f3437] dark:text-white truncate">
          {member.name || "(no name)"}
        </p>
        <p className="text-xs text-[#2f3437]/60 dark:text-white/60 truncate">
          {member.email}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <TierBadge cohort={member.cohort} />
          {member.inBeta ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
              In beta
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              Not in beta
            </span>
          )}
          {member.onboardingPending && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              Onboarding pending
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0">
        {member.inBeta ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full border border-red-300 dark:border-red-700 px-4 py-1.5 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Remove from beta
          </button>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            className="rounded-full bg-[#2f3437] dark:bg-white px-4 py-1.5 text-xs font-semibold text-white dark:text-[#2f3437] hover:opacity-90"
          >
            Add to beta
          </button>
        )}
      </div>
    </li>
  );
}

function TierBadge({ cohort }: { cohort: Member["cohort"] }) {
  const styles = useMemo<Record<Member["cohort"], string>>(
    () => ({
      Foundations: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
      Production: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
      Growth: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
      DWY: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    }),
    [],
  );
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${styles[cohort]}`}
    >
      {cohort}
    </span>
  );
}

function ConfirmModal({
  action,
  working,
  onCancel,
  onConfirm,
}: {
  action: NonNullable<PendingAction>;
  working: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isAdd = action.type === "add";
  const memberLabel = action.member.name || action.member.email;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white dark:bg-[#1a2433] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-[#2f3437] dark:text-white">
          {isAdd ? "Add to beta?" : "Remove from beta?"}
        </h2>
        <p className="mt-3 text-sm text-[#2f3437]/80 dark:text-white/80 leading-relaxed">
          <strong>{memberLabel}</strong>
          {isAdd ? (
            <>
              {" "}will be granted access to every v2 feature and their
              onboarding wizard will be reset. They&rsquo;ll see the wizard on
              their next login.
            </>
          ) : (
            <>
              {" "}will lose access to v2 features and be marked as
              onboarding-complete so the wizard doesn&rsquo;t fire again.
            </>
          )}
        </p>
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={working}
            className="rounded-full px-4 py-2 text-sm font-medium text-[#2f3437]/70 dark:text-white/70 hover:text-[#2f3437] dark:hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={working}
            className={`rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
              isAdd ? "bg-[#2f3437] hover:opacity-90" : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {working ? "Working…" : isAdd ? "Add to beta" : "Remove from beta"}
          </button>
        </div>
      </div>
    </div>
  );
}
