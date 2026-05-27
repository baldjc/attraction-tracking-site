"use client";

import { useEffect, useState } from "react";

interface OrphanScript {
  id: string;
  videoTitle: string;
  createdAt: string;
  scriptOpening: string;
}

interface PlanOption {
  id: string;
  title: string;
  status: string;
}

type Decision =
  | { kind: "create"; title: string }
  | { kind: "attach"; planId: string }
  | { kind: "skip" }
  | { kind: "delete" };

interface Props {
  scripts: OrphanScript[];
  onClose: (linkedAny: boolean) => void;
}

export default function OrphanScriptsModal({ scripts, onClose }: Props) {
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [index, setIndex] = useState(0);
  const [linkedCount, setLinkedCount] = useState(0);
  const [working, setWorking] = useState(false);
  const [decision, setDecision] = useState<Decision>({ kind: "create", title: "" });
  const [titleInput, setTitleInput] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const total = scripts.length;
  const current = scripts[index];

  useEffect(() => {
    fetch("/api/member/content-plans")
      .then((r) => r.json())
      .then((d) => {
        const list: PlanOption[] = (d?.plans ?? []).map((p: { id: string; title: string; status: string }) => ({
          id: p.id,
          title: p.title,
          status: p.status,
        }));
        setPlans(list);
        if (list.length > 0) setSelectedPlanId(list[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!current) return;
    const defaultTitle = current.videoTitle?.trim() || current.scriptOpening.split("\n")[0]?.slice(0, 80) || "Untitled script";
    setTitleInput(defaultTitle);
    setDecision({ kind: "create", title: defaultTitle });
  }, [current]);

  if (!current) {
    onClose(linkedCount > 0);
    return null;
  }

  function advance(linked: boolean) {
    if (linked) setLinkedCount((c) => c + 1);
    if (index + 1 >= total) {
      onClose(linked || linkedCount > 0);
    } else {
      setIndex((i) => i + 1);
    }
  }

  async function handleApply() {
    if (working) return;
    setWorking(true);
    try {
      if (decision.kind === "create") {
        const res = await fetch("/api/member/content-plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: titleInput.trim() || "Untitled script",
            status: "Scripted",
            linkedScriptId: current.id,
          }),
        });
        if (res.ok) advance(true);
        else advance(false);
      } else if (decision.kind === "attach") {
        if (!selectedPlanId) {
          setWorking(false);
          return;
        }
        const res = await fetch(`/api/member/content-plans/${selectedPlanId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkedScriptId: current.id }),
        });
        if (res.ok) advance(true);
        else advance(false);
      } else if (decision.kind === "skip") {
        advance(false);
      } else if (decision.kind === "delete") {
        // No DELETE endpoint for SavedScript exists — treat as skip with a console hint.
        // Future enhancement: add DELETE endpoint for SavedScript.
        advance(false);
      }
    } finally {
      setWorking(false);
    }
  }

  const previewTitle = current.videoTitle?.slice(0, 80) || current.scriptOpening.split("\n")[0]?.slice(0, 80);
  const dateStr = new Date(current.createdAt).toLocaleDateString();
  const length = current.scriptOpening.length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[var(--abv-dark)]/60" onClick={() => onClose(linkedCount > 0)}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 relative max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onClose(linkedCount > 0)}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-[var(--abv-text)]/40 hover:text-[var(--abv-text)] hover:bg-[var(--abv-text)]/5 transition-colors"
        >
          ✕
        </button>

        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--abv-azure)] mb-1">
          Linked {linkedCount} of {total} scripts
        </p>
        <h2 className="text-lg font-bold text-[var(--abv-text)] leading-tight mb-3">Link this script to a plan</h2>

        <div className="bg-[var(--abv-bg)] rounded-lg p-3 mb-4">
          <p className="text-sm font-semibold text-[var(--abv-text)] leading-snug">{previewTitle}</p>
          <p className="text-[11px] text-[var(--abv-text)]/50 mt-1">
            Saved {dateStr} · ~{length} chars
          </p>
        </div>

        <div className="space-y-3 mb-4">
          {/* Create new plan */}
          <label className="block border border-[var(--abv-text)]/15 rounded-lg p-3 cursor-pointer hover:border-[var(--abv-azure)] transition-colors">
            <div className="flex items-start gap-2">
              <input
                type="radio"
                checked={decision.kind === "create"}
                onChange={() => setDecision({ kind: "create", title: titleInput })}
                className="mt-1"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-[var(--abv-text)]">Create a new plan</p>
                <p className="text-xs text-[var(--abv-text)]/55 mb-2">A new ContentPlan with status &quot;Scripted&quot; linked to this script.</p>
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => {
                    setTitleInput(e.target.value);
                    if (decision.kind === "create") setDecision({ kind: "create", title: e.target.value });
                  }}
                  className="w-full text-sm border border-[var(--abv-text)]/15 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[var(--abv-azure)]"
                  placeholder="Plan title"
                />
              </div>
            </div>
          </label>

          {/* Attach to existing */}
          <label className="block border border-[var(--abv-text)]/15 rounded-lg p-3 cursor-pointer hover:border-[var(--abv-azure)] transition-colors">
            <div className="flex items-start gap-2">
              <input
                type="radio"
                checked={decision.kind === "attach"}
                onChange={() => setDecision({ kind: "attach", planId: selectedPlanId })}
                className="mt-1"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-[var(--abv-text)]">Attach to existing plan</p>
                <p className="text-xs text-[var(--abv-text)]/55 mb-2">Set the script as the linked script on a plan you already have.</p>
                <select
                  value={selectedPlanId}
                  onChange={(e) => {
                    setSelectedPlanId(e.target.value);
                    if (decision.kind === "attach") setDecision({ kind: "attach", planId: e.target.value });
                  }}
                  disabled={plans.length === 0}
                  className="w-full text-sm border border-[var(--abv-text)]/15 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[var(--abv-azure)]"
                >
                  {plans.length === 0 && <option value="">No plans yet — use &quot;Create new plan&quot; above</option>}
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} ({p.status})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </label>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-[var(--abv-text)]/5">
          <button
            onClick={handleApply}
            disabled={working || (decision.kind === "attach" && !selectedPlanId)}
            className="flex-1 $1var(--abv-dark)$2 hover:bg-black/85 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors"
          >
            {working ? "Linking…" : "Link script →"}
          </button>
          <button
            onClick={() => advance(false)}
            disabled={working}
            className="text-sm font-medium text-[var(--abv-text)]/60 hover:text-[var(--abv-text)] px-4 py-2.5 rounded-lg transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
