"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowTopRightOnSquareIcon, ClipboardDocumentIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

function getNextThursday(): Date {
  const d = new Date();
  const day = d.getDay();
  const daysUntilThursday = (4 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilThursday);
  d.setHours(13, 30, 0, 0);
  return d;
}

function fmtThursday(d: Date) {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Denver",
  }) + " — 1:30 PM MST";
}

function scoreBg(score: number) {
  if (score >= 7) return "bg-[#e8f7ff] text-[#0ea5d9]";
  if (score >= 5) return "bg-[#fef3c7] text-amber-700";
  return "bg-[#ffe5ea] text-[#cc0029]";
}

function deltaStr(d: number) {
  return (d > 0 ? "+" : "") + d.toFixed(1);
}

export default function QAPrepPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");

  const nextThursday = getNextThursday();

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/qa-prep${selectedDate ? `?weekOf=${selectedDate}` : ""}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => { load(); }, [load]);

  function copyToClipboard() {
    if (!data) return;

    const lines: string[] = [
      `Q&A CALL PREP — ${fmtThursday(nextThursday)}`,
      `Generated: ${new Date(data.generatedAt).toLocaleString()}`,
      "",
      "═══════════════════════════════════",
      "✅  CELEBRATE",
      "═══════════════════════════════════",
    ];

    if (data.celebrate.length === 0) {
      lines.push("No members with significant improvements this cycle.");
    } else {
      for (const m of data.celebrate) {
        lines.push(`\n${m.name} (${m.latestScore.toFixed(1)}/10)`);
        for (const imp of m.improvements) {
          lines.push(`  • ${imp.principle}: ${imp.from.toFixed(1)} → ${imp.to.toFixed(1)} (${deltaStr(imp.delta)})`);
        }
      }
    }

    lines.push("", "═══════════════════════════════════", "⚠️  ADDRESS", "═══════════════════════════════════");

    if (data.address.length === 0) {
      lines.push("No members with declining or stuck scores.");
    } else {
      for (const m of data.address) {
        lines.push(`\n${m.name} (${m.latestScore.toFixed(1)}/10)`);
        for (const issue of m.issues) {
          lines.push(`  • ${issue.principle}: ${issue.score.toFixed(1)} — ${issue.trend} after ${issue.deltaMonths} audit(s)`);
        }
      }
    }

    lines.push("", "═══════════════════════════════════", "🔴  COMMON GAPS (group teaching)", "═══════════════════════════════════");
    for (const gap of data.commonGaps) {
      lines.push(`  • ${gap.principle}: avg ${gap.avgScore.toFixed(1)}/10 across ${gap.memberCount} members`);
    }

    lines.push("", "═══════════════════════════════════", "📋  PER-MEMBER NOTES", "═══════════════════════════════════");
    for (const m of data.perMember) {
      if (m.qaFlags.length === 0 && m.topGaps.length === 0) continue;
      lines.push(`\n${m.name} — ${m.latestScore.toFixed(1)}/10`);
      if (m.topGaps.length > 0) {
        lines.push(`  Gaps: ${m.topGaps.map((g: any) => `${g.principle} (${g.score.toFixed(1)})`).join(", ")}`);
      }
      if (m.qaFlags.length > 0) {
        lines.push("  On call:");
        for (const flag of m.qaFlags) {
          lines.push(`    → ${flag.principle}: ${flag.prompt}`);
        }
      }
    }

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#2f3437]">Q&amp;A Call Prep</h1>
          <p className="text-sm text-[#2f3437]/60 mt-1">{fmtThursday(nextThursday)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-[#2f3437]/70 transition-colors disabled:opacity-40"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Regenerate
          </button>
          <button
            onClick={copyToClipboard}
            disabled={!data || loading}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-[#111] hover:bg-[#111]/90 text-white transition-colors disabled:opacity-40"
          >
            <ClipboardDocumentIcon className="w-4 h-4" />
            {copied ? "Copied!" : "Copy to Clipboard"}
          </button>
        </div>
      </div>

      {/* Date picker */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-[#2f3437]/60">Prep for week of:</label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-[#2f3437] focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/50"
        />
        {selectedDate && (
          <button
            onClick={() => setSelectedDate("")}
            className="text-xs text-[#2f3437]/40 hover:text-[#2f3437]"
          >
            Reset to this week
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-[#2f3437]/40">
          Loading call prep data…
        </div>
      )}

      {!loading && data && (
        <>
          <p className="text-xs text-[#2f3437]/40">
            {data.membersWithAudits} of {data.totalMembers} members have audit data · Generated {new Date(data.generatedAt).toLocaleTimeString()}
          </p>

          {/* Section 1: Celebrate */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h2 className="text-base font-bold text-green-800 mb-1">✅ Celebrate</h2>
            <p className="text-xs text-green-700/70 mb-4">Members who improved since their last audit</p>
            {data.celebrate.length === 0 ? (
              <p className="text-sm text-green-700/60 italic">No members with significant improvements this cycle.</p>
            ) : (
              <div className="space-y-4">
                {data.celebrate.map((m: any) => (
                  <div key={m.userId} className="bg-white rounded-lg p-4 border border-green-200">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Link href={`/admin/members/${m.userId}`} className="font-semibold text-[#2f3437] hover:text-[#6ba3c7] text-sm">
                        {m.name}
                      </Link>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(m.latestScore)}`}>
                        {m.latestScore.toFixed(1)}/10
                      </span>
                    </div>
                    <div className="space-y-1">
                      {m.improvements.map((imp: any, i: number) => (
                        <p key={i} className="text-sm text-green-700">
                          <span className="font-medium">{imp.principle}:</span>{" "}
                          {imp.from.toFixed(1)} → {imp.to.toFixed(1)}{" "}
                          <span className="font-bold text-green-600">({deltaStr(imp.delta)})</span>
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Address */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
            <h2 className="text-base font-bold text-amber-800 mb-1">⚠️ Address</h2>
            <p className="text-xs text-amber-700/70 mb-4">Members who are stuck or declined</p>
            {data.address.length === 0 ? (
              <p className="text-sm text-amber-700/60 italic">No members with declining or stuck scores.</p>
            ) : (
              <div className="space-y-4">
                {data.address.map((m: any) => (
                  <div key={m.userId} className="bg-white rounded-lg p-4 border border-amber-200">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Link href={`/admin/members/${m.userId}`} className="font-semibold text-[#2f3437] hover:text-[#6ba3c7] text-sm">
                        {m.name}
                      </Link>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(m.latestScore)}`}>
                        {m.latestScore.toFixed(1)}/10
                      </span>
                    </div>
                    <div className="space-y-1">
                      {m.issues.map((issue: any, i: number) => (
                        <p key={i} className="text-sm text-amber-700">
                          <span className="font-medium">{issue.principle}:</span>{" "}
                          {issue.score.toFixed(1)}/10 —{" "}
                          <span className="italic">
                            {issue.trend === "declined" ? "declined" : `stuck after ${issue.deltaMonths} audit(s)`}
                          </span>
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Common Gaps */}
          <div className="bg-[#ffe5ea] border border-[#ff0033]/20 rounded-lg p-6">
            <h2 className="text-base font-bold text-[#cc0029] mb-1">🔴 Common Gaps</h2>
            <p className="text-xs text-[#cc0029]/70 mb-4">
              5 weakest principles across all {data.membersWithAudits} members — consider group teaching
            </p>
            <div className="space-y-3">
              {data.commonGaps.map((gap: any, i: number) => (
                <div key={i} className="bg-white rounded-lg p-4 border border-[#ff0033]/10 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#2f3437]">{gap.principle}</p>
                    <p className="text-xs text-[#2f3437]/50 mt-0.5">
                      avg {gap.avgScore.toFixed(1)}/10 across {gap.memberCount} members
                    </p>
                  </div>
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${scoreBg(gap.avgScore)}`}>
                    {gap.avgScore.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Per-Member Notes */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-[#2f3437] mb-4">📋 Per-Member Notes</h2>
            <div className="space-y-2">
              {data.perMember.map((m: any) => {
                const isExpanded = expandedMember === m.userId;
                return (
                  <div key={m.userId} className="border border-gray-100 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedMember(isExpanded ? null : m.userId)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-sm text-[#2f3437]">{m.name}</span>
                        {m.improvements.length > 0 && (
                          <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded-full font-medium">↑ Improving</span>
                        )}
                        {m.topGaps.length > 0 && (
                          <span className="text-xs px-2 py-0.5 bg-[#ffe5ea] text-[#cc0029] rounded-full font-medium">
                            {m.topGaps.length} critical gap{m.topGaps.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${scoreBg(m.latestScore)}`}>
                          {m.latestScore.toFixed(1)}/10
                        </span>
                        <span className="text-[#2f3437]/30 text-xs">{isExpanded ? "▲" : "▼"}</span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3 border-t border-gray-100">
                        <div className="flex items-center gap-3 pt-3">
                          <span className="text-xs text-[#2f3437]/40">
                            Latest: {m.auditType === "baseline" ? "Baseline" : "Monthly"} ·{" "}
                            {new Date(m.auditDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                          <Link
                            href={`/admin/audits/${m.auditId}`}
                            className="inline-flex items-center gap-1 text-xs text-[#6ba3c7] hover:underline"
                          >
                            View report
                            <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                          </Link>
                        </div>

                        {m.improvements.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-green-700 mb-1">↑ Improvements this cycle</p>
                            <div className="space-y-1">
                              {m.improvements.slice(0, 3).map((imp: any, i: number) => (
                                <p key={i} className="text-xs text-[#2f3437]/70">
                                  {imp.principle}: {imp.from.toFixed(1)} → {imp.to.toFixed(1)} ({deltaStr(imp.delta)})
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {m.topGaps.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-[#cc0029] mb-1">Critical gaps</p>
                            <div className="space-y-1">
                              {m.topGaps.map((gap: any, i: number) => (
                                <p key={i} className="text-xs text-[#2f3437]/70">
                                  {gap.principle}:{" "}
                                  <span className={`inline-block px-1.5 py-0.5 rounded-full text-xs font-bold ${scoreBg(gap.score)}`}>
                                    {gap.score.toFixed(1)}
                                  </span>
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {m.qaFlags.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-[#6ba3c7] mb-1">If they're on the call:</p>
                            <div className="space-y-1">
                              {m.qaFlags.map((flag: any, i: number) => (
                                <p key={i} className="text-xs text-[#2f3437]/70">
                                  <span className="font-medium">{flag.principle}:</span> {flag.prompt}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
