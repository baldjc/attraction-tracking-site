"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowPathIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";

interface LeadRow {
  id: string;
  fullName: string | null;
  email: string;
  phone: string | null;
  youtubeChannelUrl: string | null;
  youtubeChannelName: string | null;
  youtubeHandle: string | null;
  youtubeChannelThumbnail: string | null;
  leadStatus: string;
  createdAt: string;
  audits: Array<{ id: string; overallScore: number | null; createdAt: string }>;
}

const STATUSES = ["New", "Audited", "Pitched", "Converted", "Lost"] as const;

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

function statusCls(s: string) {
  switch (s) {
    case "New": return "bg-blue-100 text-blue-700";
    case "Audited": return "bg-amber-100 text-amber-800";
    case "Pitched": return "bg-purple-100 text-purple-700";
    case "Converted": return "bg-green-100 text-green-700";
    case "Lost": return "bg-gray-200 text-gray-600";
    default: return "bg-gray-100 text-gray-600";
  }
}

function scoreBg(score: number | null) {
  if (score == null) return "bg-gray-100 text-gray-500";
  if (score >= 7) return "bg-green-100 text-green-700";
  if (score >= 5) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-[var(--abv-crimson)]";
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/leads");
      const data = await res.json();
      setLeads(data.leads ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function updateStatus(id: string, leadStatus: string) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "You don't have permission to change lead status.");
        return;
      }
      setLeads((rows) => rows.map((r) => (r.id === id ? { ...r, leadStatus } : r)));
    } finally {
      setSavingId(null);
    }
  }

  const filtered = leads
    .filter((l) => !statusFilter || l.leadStatus === statusFilter)
    .filter((l) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (l.fullName ?? "").toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        (l.youtubeHandle ?? "").toLowerCase().includes(q) ||
        (l.youtubeChannelName ?? "").toLowerCase().includes(q)
      );
    });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-[var(--abv-text)]">Leads</h1>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-xs text-[var(--abv-text)]/60 hover:text-[var(--abv-text)]"
        >
          <ArrowPathIcon className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name, email, or YouTube handle…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--abv-azure)] focus:border-transparent outline-none text-[var(--abv-text)] bg-white text-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 border border-gray-300 rounded-lg outline-none text-[var(--abv-text)] bg-white text-sm"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Created", "Lead", "YouTube", "Score", "Status", "Actions"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-[var(--abv-text)]/60 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-[var(--abv-text)]/40">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-[var(--abv-text)]/40">No leads found.</td></tr>
              ) : filtered.map((l) => {
                const audit = l.audits[0];
                return (
                  <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-[var(--abv-text)]/60 whitespace-nowrap text-xs">{fmt(l.createdAt)}</td>
                    <td className="px-5 py-3">
                      <Link href={`/admin/members/${l.id}`} className="font-medium text-[var(--abv-text)] hover:underline">
                        {l.fullName ?? l.email}
                      </Link>
                      <p className="text-xs text-[var(--abv-text)]/50">{l.email}</p>
                      {l.phone && <p className="text-xs text-[var(--abv-text)]/40">{l.phone}</p>}
                    </td>
                    <td className="px-5 py-3 max-w-[220px]">
                      {l.youtubeChannelUrl ? (
                        <a
                          href={l.youtubeChannelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--abv-azure)] hover:underline text-xs inline-flex items-center gap-1 truncate"
                        >
                          {l.youtubeChannelName ?? l.youtubeHandle ?? l.youtubeChannelUrl}
                          <ArrowTopRightOnSquareIcon className="w-3 h-3 shrink-0" />
                        </a>
                      ) : <span className="text-xs text-[var(--abv-text)]/40">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      {audit?.overallScore != null ? (
                        <Link
                          href={`/admin/audits/${audit.id}`}
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold hover:underline ${scoreBg(Number(audit.overallScore))}`}
                          title="View Lead Audit Report"
                        >
                          {Number(audit.overallScore).toFixed(1)}
                        </Link>
                      ) : <span className="text-xs text-[var(--abv-text)]/40">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={l.leadStatus}
                        onChange={(e) => updateStatus(l.id, e.target.value)}
                        disabled={savingId === l.id}
                        className={`text-xs font-semibold px-2 py-1 rounded-full border-0 outline-none cursor-pointer disabled:opacity-50 ${statusCls(l.leadStatus)}`}
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {audit ? (
                          <Link href={`/admin/audits/${audit.id}`} className="text-xs text-[var(--abv-azure)] hover:underline whitespace-nowrap">
                            View Report
                          </Link>
                        ) : (
                          <span className="text-xs text-[var(--abv-text)]/40 whitespace-nowrap">No audit yet</span>
                        )}
                        <Link
                          href={`/admin/members/${l.id}?convert=1`}
                          className="text-xs px-2.5 py-1 rounded bg-[var(--abv-text)] hover:bg-[#3a4145] text-white font-semibold whitespace-nowrap"
                        >
                          Convert to Member
                        </Link>
                        {l.leadStatus !== "Lost" && (
                          <button
                            onClick={() => updateStatus(l.id, "Lost")}
                            disabled={savingId === l.id}
                            className="text-xs text-[var(--abv-text)]/50 hover:text-[var(--abv-crimson)] disabled:opacity-50 whitespace-nowrap"
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
