"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

interface AuditRow {
  id: string;
  auditType: string;
  overallScore: number | null;
  createdAt: string;
  user: { id: string; fullName: string | null; email: string } | null;
}

function scoreBg(score: number | null) {
  if (score == null) return "bg-gray-100 text-gray-500";
  if (score >= 7) return "bg-green-100 text-green-700";
  if (score >= 5) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-[#ff0033]";
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

export default function AuditsPage() {
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => { fetchAudits(); }, []);

  async function fetchAudits() {
    setLoading(true);
    const res = await fetch("/api/audits");
    const data = await res.json();
    setAudits(data.audits ?? []);
    setLoading(false);
  }

  const filtered = audits
    .filter((a) => !typeFilter || a.auditType === typeFilter)
    .filter((a) => {
      if (!search) return true;
      const name = (a.user?.fullName ?? a.user?.email ?? "").toLowerCase();
      return name.includes(search.toLowerCase());
    });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e2a38]">Audits</h1>
          <p className="text-[#1e2a38]/60 mt-1">{audits.length} total audit{audits.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by member name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3dc3ff] focus:border-transparent outline-none text-[#1e2a38] bg-white text-sm"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3dc3ff] outline-none text-[#1e2a38] bg-white text-sm"
        >
          <option value="">All Types</option>
          <option value="baseline">Baseline</option>
          <option value="monthly">Monthly</option>
          <option value="single_video">Single Video</option>
        </select>
        <button onClick={fetchAudits} className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-[#1e2a38] hover:bg-gray-50">
          <ArrowPathIcon className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Date", "Member", "Type", "Score", "Action"].map((h) => (
                  <th key={h} className="text-left px-6 py-3 text-xs font-semibold text-[#1e2a38]/60 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-[#1e2a38]/40">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-[#1e2a38]/40">No audits found.</td></tr>
              ) : filtered.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-[#1e2a38]/70">{fmt(a.createdAt)}</td>
                  <td className="px-6 py-4">
                    {a.user ? (
                      <Link href={`/admin/members/${a.user.id}`} className="text-[#3dc3ff] hover:underline font-medium">
                        {a.user.fullName ?? a.user.email}
                      </Link>
                    ) : "—"}
                  </td>
                  <td className="px-6 py-4 capitalize text-[#1e2a38]">{a.auditType.replace("_", " ")}</td>
                  <td className="px-6 py-4">
                    {a.overallScore != null ? (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(a.overallScore)}`}>
                        {a.overallScore.toFixed(1)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-6 py-4">
                    <Link href={`/admin/audits/${a.id}`} className="text-[#3dc3ff] hover:underline text-xs font-medium">
                      View Report →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
