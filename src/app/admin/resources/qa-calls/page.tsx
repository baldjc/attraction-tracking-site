"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDownIcon, ChevronUpIcon, ArrowPathIcon, CheckIcon, XMarkIcon, PencilIcon } from "@heroicons/react/24/outline";

const PRINCIPLES = [
  "Avatar Clarity", "Themes Over Topics", "Binge Architecture", "Lead Magnet System",
  "Values Peppering", "Connection Language", "Grade 5 Language", "Consistency",
  "ARC Attention", "ARC Revelation", "ARC Connection", "Curiosity Bridges",
  "Story Proof", "Show Don't Tell", "Title Frameworks", "Approve the Click",
];

const PRINCIPLE_COLORS: Record<string, string> = {
  "Avatar Clarity": "bg-purple-100 text-purple-700",
  "Themes Over Topics": "bg-blue-100 text-blue-700",
  "Binge Architecture": "bg-indigo-100 text-indigo-700",
  "Lead Magnet System": "bg-green-100 text-green-700",
  "Values Peppering": "bg-pink-100 text-pink-700",
  "Connection Language": "bg-yellow-100 text-yellow-700",
  "Grade 5 Language": "bg-orange-100 text-orange-700",
  "Consistency": "bg-teal-100 text-teal-700",
  "ARC Attention": "bg-red-100 text-red-700",
  "ARC Revelation": "bg-violet-100 text-violet-700",
  "ARC Connection": "bg-sky-100 text-sky-700",
  "Curiosity Bridges": "bg-amber-100 text-amber-700",
  "Story Proof": "bg-lime-100 text-lime-700",
  "Show Don't Tell": "bg-cyan-100 text-cyan-700",
  "Title Frameworks": "bg-emerald-100 text-emerald-700",
  "Approve the Click": "bg-rose-100 text-rose-700",
};

interface QACall {
  id: string;
  fathomId: string;
  title: string;
  callDate: string;
  status: string;
  errorMessage?: string;
  momentCount: number;
  pendingCount: number;
}

interface FathomCall {
  fathomId: string;
  title: string;
  callDate: string;
  duration?: number;
  fathomShareUrl: string;
  transcript: string;
  alreadyImported: boolean;
  existingId?: string;
}

interface KBEntry {
  id: string;
  sourceId: string;
  subTopic: string;
  summary: string;
  principles: string[];
  timestampStart?: number;
  timestampEnd?: number;
  isGeneralTeaching: boolean;
  memberId?: string;
  member?: { id: string; fullName: string | null; email: string } | null;
  status: string;
  sourceTitle: string;
  callDate?: string;
}

interface MemberOption { id: string; fullName: string | null; email: string; }

const INPUT = "w-full border border-[#1e2a38]/20 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#3dc3ff]";
const CARD = "bg-white rounded-2xl border border-[#1e2a38]/10 shadow-sm";

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(s?: number | null) {
  if (!s) return "";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function QACallsPage() {
  const [calls, setCalls] = useState<QACall[]>([]);
  const [loading, setLoading] = useState(true);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({ fathomApiKey: "", fathomRecordingEmail: "", fathomTitleFilter: "Q&A", fathomWebhookSecret: "", apiKeySet: false, webhookSecretSet: false });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [lastPullDate, setLastPullDate] = useState<string | null>(null);
  const [lastPullStatus, setLastPullStatus] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");

  // Pull modal
  const [pulling, setPulling] = useState(false);
  const [pullResult, setPullResult] = useState<FathomCall[] | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  // Review queue
  const [queueEntries, setQueueEntries] = useState<KBEntry[]>([]);
  const [queueMembers, setQueueMembers] = useState<MemberOption[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [editingEntry, setEditingEntry] = useState<KBEntry | null>(null);
  const [editForm, setEditForm] = useState({ subTopic: "", summary: "", principles: [] as string[], memberId: "" });
  const [savingEntry, setSavingEntry] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);

  // Expanded call
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  useEffect(() => {
    loadCalls();
    loadSettings();
    loadQueue();
  }, []);

  async function loadCalls() {
    setLoading(true);
    const res = await fetch("/api/admin/resources/qa-calls");
    if (res.ok) setCalls(await res.json());
    setLoading(false);
  }

  async function loadSettings() {
    const res = await fetch("/api/admin/resources/fathom/settings");
    if (res.ok) {
      const d = await res.json();
      setSettings({
        fathomApiKey: d.fathomApiKeySet ? "••••••••" : "",
        fathomRecordingEmail: d.fathomRecordingEmail,
        fathomTitleFilter: d.fathomTitleFilter,
        fathomWebhookSecret: d.fathomWebhookSecretSet ? "••••••••" : "",
        apiKeySet: d.fathomApiKeySet,
        webhookSecretSet: d.fathomWebhookSecretSet,
      });
      setLastPullDate(d.lastPullDate);
      setLastPullStatus(d.lastPullStatus);
    }
    setWebhookUrl(`${window.location.origin}/api/webhooks/fathom`);
  }

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    const res = await fetch("/api/admin/resources/review-queue?status=pending");
    if (res.ok) {
      const d = await res.json();
      setQueueEntries(d.entries ?? []);
      setQueueMembers(d.members ?? []);
    }
    setQueueLoading(false);
  }, []);

  async function saveSettings() {
    setSavingSettings(true);
    await fetch("/api/admin/resources/fathom/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fathomApiKey: settings.fathomApiKey,
        fathomRecordingEmail: settings.fathomRecordingEmail,
        fathomTitleFilter: settings.fathomTitleFilter,
        fathomWebhookSecret: settings.fathomWebhookSecret,
      }),
    });
    setSavingSettings(false);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
    loadSettings();
  }

  async function pullFromFathom() {
    setPulling(true);
    setPullError(null);
    setPullResult(null);
    setSelectedIds(new Set());
    setImportResult(null);
    const res = await fetch("/api/admin/resources/fathom/pull", { method: "POST" });
    const d = await res.json();
    if (res.ok) {
      setPullResult(d.calls ?? []);
    } else {
      setPullError(d.error ?? "Failed to connect to Fathom");
    }
    setPulling(false);
  }

  function toggleSelect(fathomId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fathomId)) next.delete(fathomId);
      else next.add(fathomId);
      return next;
    });
  }

  async function importSelected() {
    if (!pullResult) return;
    const toImport = pullResult.filter((c) => selectedIds.has(c.fathomId) && !c.alreadyImported);
    if (!toImport.length) return;
    setImporting(true);
    setImportResult(null);
    const res = await fetch("/api/admin/resources/fathom/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calls: toImport }),
    });
    const d = await res.json();
    if (res.ok) {
      const results = d.results as Array<{ status: string; momentCount?: number }>;
      const processed = results.filter((r) => r.status === "processed").length;
      const failed = results.filter((r) => r.status === "failed").length;
      const moments = results.reduce((s, r) => s + (r.momentCount ?? 0), 0);
      setImportResult(`Imported ${processed} call${processed !== 1 ? "s" : ""}${failed > 0 ? `, ${failed} failed` : ""}. ${moments} coaching moments added to the review queue.`);
      setPullResult(null);
      setSelectedIds(new Set());
      loadCalls();
      loadQueue();
    } else {
      setImportResult(`Error: ${d.error ?? "Import failed"}`);
    }
    setImporting(false);
  }

  async function entryAction(id: string, action: "approve" | "reject") {
    await fetch(`/api/admin/resources/review-queue/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setQueueEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function openEdit(entry: KBEntry) {
    setEditingEntry(entry);
    setEditForm({ subTopic: entry.subTopic, summary: entry.summary, principles: entry.principles, memberId: entry.memberId ?? "" });
  }

  async function saveEdit() {
    if (!editingEntry) return;
    setSavingEntry(true);
    await fetch(`/api/admin/resources/review-queue/${editingEntry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editForm, memberId: editForm.memberId || null }),
    });
    setSavingEntry(false);
    setEditingEntry(null);
    loadQueue();
  }

  async function approveAll() {
    const ids = queueEntries.map((e) => e.id);
    if (!ids.length) return;
    setApprovingAll(true);
    await fetch("/api/admin/resources/review-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve_all", ids }),
    });
    setApprovingAll(false);
    setQueueEntries([]);
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      processed: "bg-green-100 text-green-700",
      pending_review: "bg-amber-100 text-amber-700",
      failed: "bg-red-100 text-red-700",
    };
    const labels: Record<string, string> = { processed: "Processed", pending_review: "Pending", failed: "Failed" };
    return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status] ?? "bg-gray-100 text-gray-600"}`}>{labels[status] ?? status}</span>;
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1e2a38]">Q&A Calls</h1>
          <p className="text-sm text-[#1e2a38]/50 mt-1">Import Q&A coaching calls from Fathom and review extracted moments</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowSettings((s) => !s)} className="flex items-center gap-2 px-4 py-2.5 border border-[#1e2a38]/20 rounded-xl text-sm text-[#1e2a38]/60 hover:bg-gray-50 transition-colors">
            Settings {showSettings ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
          </button>
          <button
            onClick={pullFromFathom}
            disabled={pulling || !settings.apiKeySet}
            title={!settings.apiKeySet ? "Configure Fathom API key in Settings first" : ""}
            className="flex items-center gap-2 bg-[#3dc3ff] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
          >
            <ArrowPathIcon className={`w-4 h-4 ${pulling ? "animate-spin" : ""}`} />
            {pulling ? "Pulling..." : "Pull from Fathom"}
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className={CARD + " p-6 space-y-5"}>
          <h3 className="font-semibold text-[#1e2a38]">Fathom Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">API Key</label>
              <input
                type="password"
                value={settings.fathomApiKey}
                onChange={(e) => setSettings({ ...settings, fathomApiKey: e.target.value })}
                placeholder={settings.apiKeySet ? "Key saved — enter new key to update" : "Paste Fathom API key..."}
                className={INPUT}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">Recording Email</label>
              <input
                type="email"
                value={settings.fathomRecordingEmail}
                onChange={(e) => setSettings({ ...settings, fathomRecordingEmail: e.target.value })}
                placeholder="jared@..."
                className={INPUT}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">Title Filter</label>
              <input
                type="text"
                value={settings.fathomTitleFilter}
                onChange={(e) => setSettings({ ...settings, fathomTitleFilter: e.target.value })}
                placeholder="Q&A"
                className={INPUT}
              />
            </div>
          </div>

          {/* Webhook setup */}
          <div className="border border-[#3dc3ff]/25 rounded-xl bg-[#3dc3ff]/5 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-[#1e2a38] mb-0.5">Webhook (auto-import on call end)</p>
              <p className="text-xs text-[#1e2a38]/50">
                In Fathom → Developers → Add Webhook, paste the URL below. Set triggers to <strong>my_recordings</strong> and enable <strong>include_transcript</strong>. Copy the Webhook Secret and paste it here.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#1e2a38]/60 mb-1">Your Webhook URL</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={webhookUrl}
                    className="flex-1 border border-[#1e2a38]/15 rounded-lg px-3 py-2 text-xs bg-white text-[#1e2a38]/70 font-mono select-all"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(webhookUrl)}
                    className="px-2.5 py-2 border border-[#1e2a38]/20 rounded-lg text-xs text-[#1e2a38]/50 hover:text-[#3dc3ff] hover:border-[#3dc3ff] transition-colors whitespace-nowrap"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1e2a38]/60 mb-1">
                  Webhook Secret <span className="font-normal text-[#1e2a38]/40">(from Fathom)</span>
                </label>
                <input
                  type="password"
                  value={settings.fathomWebhookSecret}
                  onChange={(e) => setSettings({ ...settings, fathomWebhookSecret: e.target.value })}
                  placeholder={settings.webhookSecretSet ? "Secret saved — enter new to update" : "Paste webhook secret..."}
                  className={INPUT}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-[#1e2a38]/40">
              {lastPullDate && <>Last pull: {fmt(lastPullDate)} — <span className={lastPullStatus === "success" ? "text-green-600" : "text-red-500"}>{lastPullStatus}</span></>}
              {!lastPullDate && "No auto-pull has run yet"}
              <span className="ml-2">• Auto-pull runs every Thursday at 8:00 PM</span>
            </div>
            <button onClick={saveSettings} disabled={savingSettings} className="flex items-center gap-2 bg-[#1e2a38] text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-[#1e2a38]/80 transition-colors">
              {settingsSaved ? <><CheckIcon className="w-4 h-4" /> Saved</> : savingSettings ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      )}

      {/* Pull result / import modal */}
      {pullError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{pullError}</div>
      )}
      {importResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">{importResult}</div>
      )}

      {pullResult && (
        <div className={CARD}>
          <div className="px-6 py-4 border-b border-[#1e2a38]/10 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-[#1e2a38]">Fathom Calls Found</h3>
              <p className="text-xs text-[#1e2a38]/40 mt-0.5">{pullResult.length} matching call{pullResult.length !== 1 ? "s" : ""} — select new ones to import</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setPullResult(null)} className="text-sm text-[#1e2a38]/40 hover:text-[#1e2a38]">✕ Close</button>
              <button
                onClick={importSelected}
                disabled={importing || selectedIds.size === 0}
                className="bg-[#3dc3ff] text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-[#3dc3ff]/90 transition-colors"
              >
                {importing ? "Importing..." : `Import ${selectedIds.size > 0 ? selectedIds.size : ""} Selected`}
              </button>
            </div>
          </div>
          <div className="divide-y divide-[#1e2a38]/5">
            {pullResult.map((call) => (
              <div key={call.fathomId} className={`px-6 py-4 flex items-start gap-4 ${call.alreadyImported ? "opacity-50" : ""}`}>
                {!call.alreadyImported && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(call.fathomId)}
                    onChange={() => toggleSelect(call.fathomId)}
                    className="mt-1 w-4 h-4 rounded border-[#1e2a38]/30 cursor-pointer"
                  />
                )}
                {call.alreadyImported && <div className="w-4 h-4 mt-1" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1e2a38]">{call.title}</p>
                  <p className="text-xs text-[#1e2a38]/50 mt-0.5">
                    {fmt(call.callDate)}
                    {call.duration && ` • ${Math.round(call.duration / 60)} min`}
                    {call.transcript ? ` • Transcript available` : " • No transcript"}
                  </p>
                </div>
                {call.alreadyImported && <span className="text-xs text-[#1e2a38]/40 bg-[#1e2a38]/5 px-2 py-0.5 rounded-full flex-shrink-0">Already imported</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review Queue */}
      <div className={CARD}>
        <div className="px-6 py-4 border-b border-[#1e2a38]/10 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-[#1e2a38]">Review Queue</h3>
            <p className="text-xs text-[#1e2a38]/40 mt-0.5">
              {queueLoading ? "Loading..." : `${queueEntries.length} moment${queueEntries.length !== 1 ? "s" : ""} awaiting review`}
            </p>
          </div>
          {queueEntries.length > 0 && (
            <button
              onClick={approveAll}
              disabled={approvingAll}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-green-700 transition-colors"
            >
              <CheckIcon className="w-4 h-4" />
              {approvingAll ? "Approving..." : "Approve All"}
            </button>
          )}
        </div>

        {queueLoading ? (
          <div className="px-6 py-12 text-center text-sm text-[#1e2a38]/40">Loading queue...</div>
        ) : queueEntries.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-[#1e2a38]/40">All caught up — no moments pending review</div>
        ) : (
          <div className="divide-y divide-[#1e2a38]/5">
            {queueEntries.map((entry) => (
              <div key={entry.id} className="px-6 py-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-[#1e2a38]/40">{entry.sourceTitle}</span>
                      {entry.callDate && <span className="text-xs text-[#1e2a38]/30">{fmt(entry.callDate)}</span>}
                      {entry.timestampStart != null && (
                        <span className="text-xs text-[#3dc3ff]">@ {fmtTime(entry.timestampStart)}</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-[#1e2a38] mb-0.5">{entry.subTopic}</p>
                    <p className="text-xs text-[#1e2a38]/60 mb-2">{entry.summary}</p>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {entry.principles.map((p) => (
                        <span key={p} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PRINCIPLE_COLORS[p] ?? "bg-gray-100 text-gray-600"}`}>{p}</span>
                      ))}
                    </div>
                    {entry.member && (
                      <p className="text-xs text-indigo-600">
                        Tagged: {entry.member.fullName ?? entry.member.email}
                      </p>
                    )}
                    {!entry.isGeneralTeaching && !entry.member && (
                      <p className="text-xs text-amber-500">Member not matched — assign below</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(entry)} className="p-2 rounded-lg text-[#1e2a38]/30 hover:text-[#3dc3ff] hover:bg-[#3dc3ff]/5 transition-colors" title="Edit">
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => entryAction(entry.id, "approve")} className="p-2 rounded-lg text-[#1e2a38]/30 hover:text-green-600 hover:bg-green-50 transition-colors" title="Approve">
                      <CheckIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => entryAction(entry.id, "reject")} className="p-2 rounded-lg text-[#1e2a38]/30 hover:text-red-500 hover:bg-red-50 transition-colors" title="Reject">
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Q&A Calls List */}
      <div className={CARD}>
        <div className="px-6 py-4 border-b border-[#1e2a38]/10">
          <h3 className="font-semibold text-[#1e2a38]">Imported Calls</h3>
          <p className="text-xs text-[#1e2a38]/40 mt-0.5">{calls.length} call{calls.length !== 1 ? "s" : ""} imported</p>
        </div>
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-[#1e2a38]/40">Loading...</div>
        ) : calls.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-[#1e2a38]/40">No calls imported yet. Pull from Fathom to get started.</div>
        ) : (
          <div className="divide-y divide-[#1e2a38]/5">
            {calls.map((call) => (
              <div key={call.id}>
                <div className="px-6 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-[#1e2a38]">{call.title}</span>
                      {statusBadge(call.status)}
                      {call.pendingCount > 0 && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{call.pendingCount} pending</span>
                      )}
                    </div>
                    <p className="text-xs text-[#1e2a38]/40">
                      {fmt(call.callDate)} • {call.momentCount} moment{call.momentCount !== 1 ? "s" : ""}
                    </p>
                    {call.status === "failed" && call.errorMessage && (
                      <p className="text-xs text-red-600 mt-1">{call.errorMessage}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setExpandedCallId(expandedCallId === call.id ? null : call.id)}
                    className="p-2 rounded-lg text-[#1e2a38]/30 hover:text-[#1e2a38] transition-colors"
                  >
                    {expandedCallId === call.id ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                  </button>
                </div>
                {expandedCallId === call.id && <CallMoments callId={call.id} members={queueMembers} onUpdate={loadQueue} />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Entry Modal */}
      {editingEntry && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-[#1e2a38]/10 shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-[#1e2a38]">Edit Moment</h2>
              <button onClick={() => setEditingEntry(null)} className="text-[#1e2a38]/40 hover:text-[#1e2a38] text-xl">✕</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">Sub-topic</label>
                <input type="text" value={editForm.subTopic} onChange={(e) => setEditForm({ ...editForm, subTopic: e.target.value })} className={INPUT} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">Summary</label>
                <textarea value={editForm.summary} onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })} rows={3} className={`${INPUT} resize-none`} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-2">Principles</label>
                <div className="flex flex-wrap gap-1.5">
                  {PRINCIPLES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setEditForm((f) => ({ ...f, principles: f.principles.includes(p) ? f.principles.filter((x) => x !== p) : [...f.principles, p] }))}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-all ${
                        editForm.principles.includes(p)
                          ? `${PRINCIPLE_COLORS[p] ?? "bg-gray-100 text-gray-600"} border-transparent`
                          : "bg-white text-[#1e2a38]/50 border-[#1e2a38]/20"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">Member Assignment</label>
                <select value={editForm.memberId} onChange={(e) => setEditForm({ ...editForm, memberId: e.target.value })} className={`${INPUT} bg-white`}>
                  <option value="">General teaching (no specific member)</option>
                  {queueMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.fullName ?? m.email}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={saveEdit} disabled={savingEntry} className="flex-1 bg-[#3dc3ff] text-white py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-[#3dc3ff]/90 transition-colors">
                  {savingEntry ? "Saving..." : "Save Changes"}
                </button>
                <button onClick={() => setEditingEntry(null)} className="px-4 py-2.5 border border-[#1e2a38]/20 rounded-xl text-sm text-[#1e2a38]/60 hover:bg-gray-50 transition-colors">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CallMoments({ callId, members, onUpdate }: { callId: string; members: MemberOption[]; onUpdate: () => void }) {
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/resources/review-queue?callId=${callId}&status=all`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.entries) setEntries(d.entries); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [callId]);

  if (loading) return <div className="px-6 py-3 text-xs text-[#1e2a38]/40 bg-[#f9f9f8]">Loading moments...</div>;
  if (!entries.length) return <div className="px-6 py-3 text-xs text-[#1e2a38]/40 bg-[#f9f9f8]">No moments extracted</div>;

  return (
    <div className="bg-[#f9f9f8] border-t border-[#1e2a38]/5 divide-y divide-[#1e2a38]/5">
      {entries.map((e) => (
        <div key={e.id} className="px-6 py-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-semibold text-[#1e2a38]">{e.subTopic}</span>
              {e.timestampStart != null && <span className="text-[10px] text-[#3dc3ff]">@ {fmtTime(e.timestampStart)}</span>}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${e.status === "approved" ? "bg-green-100 text-green-700" : e.status === "rejected" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"}`}>
                {e.status}
              </span>
            </div>
            <p className="text-xs text-[#1e2a38]/60 mb-1">{e.summary}</p>
            <div className="flex flex-wrap gap-1">
              {e.principles.map((p) => (
                <span key={p} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PRINCIPLE_COLORS[p] ?? "bg-gray-100 text-gray-500"}`}>{p}</span>
              ))}
            </div>
            {e.member && <p className="text-[10px] text-indigo-600 mt-1">{e.member.fullName ?? e.member.email}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
