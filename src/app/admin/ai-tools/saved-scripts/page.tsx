"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeftIcon, DocumentTextIcon, ClockIcon, ChevronDownIcon, ChevronUpIcon, UserIcon } from "@heroicons/react/24/outline";

interface SavedScript {
  id: string;
  videoTitle: string;
  arcScores: unknown;
  createdAt: string;
  scriptOpening: string;
}

interface MemberOption {
  id: string;
  fullName: string | null;
  email: string;
  youtubeChannelName: string | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

function ScriptCard({ script }: { script: SavedScript }) {
  const [expanded, setExpanded] = useState(false);
  const hasPreview = script.scriptOpening.trim().length > 0;

  return (
    <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl overflow-hidden transition-shadow hover:shadow-sm">
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[var(--abv-dark)]/10 flex items-center justify-center shrink-0 mt-0.5">
              <DocumentTextIcon className="w-5 h-5 text-[var(--abv-azure)]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[var(--abv-text)] leading-snug">{script.videoTitle}</h3>
              <div className="flex items-center gap-1.5 mt-1">
                <ClockIcon className="w-3.5 h-3.5 text-[var(--abv-text)]/35 shrink-0" />
                <span className="text-xs text-[var(--abv-text)]/45">{formatDate(script.createdAt)}</span>
              </div>
            </div>
          </div>

          {hasPreview && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="shrink-0 flex items-center gap-1 text-xs text-[var(--abv-azure)] hover:text-[var(--abv-azure)] font-medium transition-colors mt-1"
            >
              {expanded ? (
                <>Hide preview <ChevronUpIcon className="w-3.5 h-3.5" /></>
              ) : (
                <>View script <ChevronDownIcon className="w-3.5 h-3.5" /></>
              )}
            </button>
          )}
        </div>
      </div>

      {expanded && hasPreview && (
        <div className="px-5 pb-5 pt-0">
          <div className="bg-[var(--abv-bg)] rounded-lg p-4 border border-[var(--abv-text)]/8">
            <p className="text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wider mb-2">Script Preview</p>
            <pre className="text-sm text-[var(--abv-text)]/75 whitespace-pre-wrap font-sans leading-relaxed">
              {script.scriptOpening}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminSavedScriptsPage() {
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [scripts, setScripts] = useState<SavedScript[]>([]);
  const [loading, setLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/members")
      .then((r) => r.json())
      .then((d) => setMembers(d.members ?? []))
      .catch(() => {})
      .finally(() => setMembersLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedMemberId) {
      setScripts([]);
      return;
    }
    setLoading(true);
    setError("");
    fetch(`/api/ai-tools/saved-scripts?userId=${selectedMemberId}`)
      .then((r) => r.json())
      .then((d) => setScripts(d.scripts ?? []))
      .catch(() => setError("Failed to load saved scripts."))
      .finally(() => setLoading(false));
  }, [selectedMemberId]);

  const selectedMember = members.find((m) => m.id === selectedMemberId);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <Link
          href="/admin/ai-tools"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--abv-text)]/50 hover:text-[var(--abv-azure)] transition-colors mb-4"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          AI Tools
        </Link>
        <h1 className="text-2xl font-bold text-[var(--abv-text)]">Saved Scripts</h1>
        <p className="text-sm text-[var(--abv-text)]/60 mt-1">View saved ARC scripts for any member.</p>
      </div>

      <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl px-5 py-4 mb-5">
        <label className="block text-sm font-semibold text-[var(--abv-text)] mb-2 flex items-center gap-2">
          <UserIcon className="w-4 h-4 text-[var(--abv-azure)]" />
          Select a member
        </label>
        {membersLoading ? (
          <div className="h-10 bg-[var(--abv-bg)] rounded-lg animate-pulse" />
        ) : (
          <select
            value={selectedMemberId}
            onChange={(e) => setSelectedMemberId(e.target.value)}
            className="w-full bg-[var(--abv-bg)] border border-[var(--abv-text)]/15 rounded-lg px-3 py-2.5 text-sm text-[var(--abv-text)] focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/30"
          >
            <option value="">— Choose a member —</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName || m.email}
                {m.youtubeChannelName ? ` (${m.youtubeChannelName})` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {!selectedMemberId && (
        <div className="text-center py-12 text-[var(--abv-text)]/40 text-sm">
          Select a member above to view their saved scripts.
        </div>
      )}

      {selectedMemberId && loading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-white border border-[var(--abv-text)]/10 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {selectedMemberId && !loading && error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {selectedMemberId && !loading && !error && scripts.length === 0 && (
        <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl px-6 py-10 text-center">
          <DocumentTextIcon className="w-9 h-9 text-[var(--abv-text)]/20 mx-auto mb-2" />
          <p className="text-sm font-semibold text-[var(--abv-text)] mb-1">No scripts saved yet</p>
          <p className="text-xs text-[var(--abv-text)]/50">
            {selectedMember?.fullName || selectedMember?.email} hasn&apos;t saved any ARC scripts.
          </p>
        </div>
      )}

      {selectedMemberId && !loading && !error && scripts.length > 0 && (
        <>
          <p className="text-xs text-[var(--abv-text)]/50 mb-3">
            Showing {scripts.length} script{scripts.length !== 1 ? "s" : ""} for{" "}
            <span className="font-medium">{selectedMember?.fullName || selectedMember?.email}</span>
          </p>
          <div className="space-y-3">
            {scripts.map((s) => (
              <ScriptCard key={s.id} script={s} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
