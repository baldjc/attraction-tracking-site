"use client";

import { useState, useEffect } from "react";
import { ClockIcon } from "@heroicons/react/24/outline";

const ACTION_LABELS: Record<string, { emoji: string; label: string }> = {
  "member.tier_changed": { emoji: "⬆️", label: "Tier Changed" },
  "member.deleted": { emoji: "🗑️", label: "Member Deleted" },
  "payment_reminder.sent": { emoji: "💳", label: "Payment Reminder Sent" },
  "audit.deleted": { emoji: "📊", label: "Audit Deleted" },
  "feature_flag.changed": { emoji: "🔧", label: "Feature Flag Changed" },
  "stripe.unlinked": { emoji: "🔗", label: "Stripe Unlinked" },
  "stripe.synced": { emoji: "🔄", label: "Stripe Synced" },
};

interface AdminAction {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: Record<string, any>;
  createdAt: string;
}

export default function ActivityLogPage() {
  const [actions, setActions] = useState<AdminAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/activity-log?days=${days}`)
      .then((r) => r.json())
      .then((d) => setActions(d.actions ?? []))
      .finally(() => setLoading(false));
  }, [days]);

  function formatDetails(action: AdminAction): string {
    if (!action.details) return "";
    const d = action.details;
    if (action.action === "member.tier_changed") {
      return `${String(d.from ?? "").replace(/_/g, " ")} → ${String(d.to ?? "").replace(/_/g, " ")}`;
    }
    if (action.action === "feature_flag.changed") {
      return `${d.flag}: ${d.value ? "enabled" : "disabled"}`;
    }
    if (action.action === "member.deleted") {
      return `${d.name ?? ""} (${d.email ?? ""})`;
    }
    return JSON.stringify(d);
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[var(--abv-text)] dark:text-[#e2e8f0]">Activity Log</h1>
        <p className="text-sm text-[var(--abv-text)]/50 dark:text-white/40 mt-0.5">Track admin actions across the platform.</p>
      </div>

      <div className="flex gap-2">
        {[
          { label: "7 days", value: 7 },
          { label: "30 days", value: 30 },
          { label: "90 days", value: 90 },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setDays(opt.value)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
              days === opt.value
                ? "bg-[var(--abv-dark)] text-white"
                : "bg-gray-100 dark:bg-white/10 text-[var(--abv-text)]/60 dark:text-white/40 hover:bg-gray-200 dark:hover:bg-white/20"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 bg-gray-100 dark:bg-white/5 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : actions.length === 0 ? (
        <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#2a2a2a] p-12 text-center">
          <ClockIcon className="w-10 h-10 text-[var(--abv-text)]/15 dark:text-white/10 mx-auto mb-3" />
          <p className="text-sm text-[var(--abv-text)]/40 dark:text-white/30">No activity recorded in this period.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-gray-200 dark:border-[#2a2a2a] divide-y divide-gray-100 dark:divide-[#2a2a2a] overflow-hidden">
          {actions.map((a) => {
            const meta = ACTION_LABELS[a.action] || { emoji: "📌", label: a.action };
            const details = formatDetails(a);
            return (
              <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                <span className="text-lg shrink-0">{meta.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[var(--abv-text)] dark:text-[#e2e8f0]">
                    <span className="font-medium">{a.actorEmail}</span>
                    <span className="text-[var(--abv-text)]/50 dark:text-white/40"> — {meta.label}</span>
                  </p>
                  {details && (
                    <p className="text-xs text-[var(--abv-text)]/40 dark:text-white/30 mt-0.5 truncate">{details}</p>
                  )}
                </div>
                <span className="text-xs text-[var(--abv-text)]/30 dark:text-white/20 shrink-0">
                  {new Date(a.createdAt).toLocaleString("en-CA", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
