"use client";

import { useEffect, useState } from "react";
import { PencilIcon, TrashIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface Call {
  id: string;
  fathomUrl: string | null;
  loomUrl: string | null;
  callDate: string;
  topic: string | null;
  notes: string | null;
}

interface Props {
  memberId: string;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function callTitle(call: Call) {
  if (call.topic) return call.topic;
  return `Strategy Call — ${formatDate(call.callDate)}`;
}

function loomEmbedUrl(url: string): string {
  const match = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  if (match) return `https://www.loom.com/embed/${match[1]}`;
  return url;
}

const EMPTY_FORM = { fathomUrl: "", loomUrl: "", callDate: "", topic: "", notes: "" };

export default function AdminCallsTab({ memberId }: Props) {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Call | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Call | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/admin/members/${memberId}/calls`)
      .then((r) => r.json())
      .then((d) => setCalls(d.calls ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [memberId]);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError("");
    setShowModal(true);
  }

  function openEdit(call: Call) {
    setEditing(call);
    setForm({
      fathomUrl: call.fathomUrl ?? "",
      loomUrl: call.loomUrl ?? "",
      callDate: call.callDate.slice(0, 10),
      topic: call.topic ?? "",
      notes: call.notes ?? "",
    });
    setError("");
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.callDate) {
      setError("Call date is required.");
      return;
    }
    if (!form.fathomUrl && !form.loomUrl) {
      setError("Please provide at least a Fathom URL or Loom URL.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const url = editing
        ? `/api/admin/members/${memberId}/calls/${editing.id}`
        : `/api/admin/members/${memberId}/calls`;
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fathomUrl: form.fathomUrl || null,
          loomUrl: form.loomUrl || null,
          callDate: form.callDate,
          topic: form.topic || null,
          notes: form.notes || null,
        }),
      });
      let data: Record<string, any> = {};
      try { data = await res.json(); } catch { /* non-JSON error body */ }
      if (!res.ok) throw new Error(data.error ?? "Failed to save call. Please try again.");
      if (editing) {
        setCalls((prev) => prev.map((c) => c.id === editing.id ? data.call : c));
      } else {
        setCalls((prev) => [data.call, ...prev]);
      }
      setShowModal(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/admin/members/${memberId}/calls/${deleteTarget.id}`, { method: "DELETE" });
      setCalls((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <div className="animate-pulse h-32 bg-gray-50 rounded-lg" />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-semibold text-[#2f3437]">Call Recordings</h2>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 text-sm bg-[#2f3437] text-white px-3 py-2 rounded-lg hover:bg-[#1a1f22] transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Add Call
        </button>
      </div>

      {calls.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-10 text-center text-sm text-[#2f3437]/40">
          No call recordings for this member yet.
        </div>
      ) : (
        <div className="space-y-5">
          {calls.map((call) => (
            <CallCard
              key={call.id}
              call={call}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-[#2f3437]">
                {editing ? "Edit Call" : "Add Call Recording"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-[#2f3437]/40 hover:text-[#2f3437]">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Call Date *</label>
                <input
                  type="date"
                  value={form.callDate}
                  onChange={(e) => setForm((f) => ({ ...f, callDate: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Topic (optional)</label>
                <input
                  type="text"
                  value={form.topic}
                  onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
                  placeholder="e.g., Monthly Strategy Review"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30"
                />
              </div>
              <div className="border border-gray-100 rounded-lg p-3 space-y-3 bg-gray-50/50">
                <p className="text-xs font-medium text-[#2f3437]/50">Video — add at least one</p>
                <div>
                  <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Fathom URL</label>
                  <input
                    type="text"
                    value={form.fathomUrl}
                    onChange={(e) => setForm((f) => ({ ...f, fathomUrl: e.target.value }))}
                    placeholder="https://fathom.video/share/..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Loom URL</label>
                  <input
                    type="text"
                    value={form.loomUrl}
                    onChange={(e) => setForm((f) => ({ ...f, loomUrl: e.target.value }))}
                    placeholder="https://www.loom.com/share/..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30 bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Key discussion points, action items..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30 resize-none"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-[#2f3437]/60 hover:text-[#2f3437] border border-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-[#2f3437] text-white rounded-lg hover:bg-[#1a1f22] disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving…" : editing ? "Save Changes" : "Add Call"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-[#2f3437] mb-2">Delete call recording?</h3>
            <p className="text-sm text-[#2f3437]/60 mb-6">
              The video recordings themselves won&apos;t be affected.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-[#2f3437]/60 hover:text-[#2f3437] border border-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FathomLinkCard({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3.5 hover:border-[#6ba3c7]/40 hover:bg-[#6ba3c7]/3 transition-colors group"
    >
      <div className="w-8 h-8 rounded-full bg-[#6ba3c7]/10 flex items-center justify-center shrink-0 text-sm">
        🎥
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#2f3437] group-hover:text-[#6ba3c7] transition-colors">Open in Fathom</p>
        <p className="text-xs text-[#2f3437]/40 truncate">{url}</p>
      </div>
      <svg className="w-4 h-4 text-[#2f3437]/30 group-hover:text-[#6ba3c7] shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  );
}

function CallCard({
  call,
  onEdit,
  onDelete,
}: {
  call: Call;
  onEdit: (call: Call) => void;
  onDelete: (call: Call) => void;
}) {
  const hasLoom = !!call.loomUrl;
  const hasFathom = !!call.fathomUrl;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-start justify-between px-5 pt-5 pb-3">
        <div>
          <p className="text-xs font-medium text-[#6ba3c7] mb-0.5 uppercase tracking-wide">
            {formatDate(call.callDate)}
          </p>
          <h3 className="text-sm font-semibold text-[#2f3437]">{callTitle(call)}</h3>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-3">
          <button
            onClick={() => onEdit(call)}
            className="p-1.5 text-[#2f3437]/40 hover:text-[#2f3437] rounded-md hover:bg-gray-200 transition-colors"
            title="Edit"
          >
            <PencilIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(call)}
            className="p-1.5 text-[#2f3437]/40 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
            title="Delete"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="px-5 space-y-3">
        {hasFathom && <FathomLinkCard url={call.fathomUrl!} />}
        {hasLoom && (
          <iframe
            src={loomEmbedUrl(call.loomUrl!)}
            width="100%"
            height="360"
            frameBorder="0"
            allowFullScreen
            className="rounded-lg border border-gray-200 bg-white block"
          />
        )}
      </div>

      {call.notes && (
        <div className="px-5 py-4">
          <p className="text-sm text-[#2f3437]/60 whitespace-pre-line">{call.notes}</p>
        </div>
      )}
      {!call.notes && <div className="pb-4" />}
    </div>
  );
}
