"use client";

import { useEffect, useState } from "react";
import { PencilIcon, TrashIcon, PlusIcon, XMarkIcon, ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import MarkdownTextarea from "@/components/MarkdownTextarea";

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
  const [loomOpen, setLoomOpen] = useState(false);

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
      {/* Compact header row */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        {/* Date badge */}
        <div className="shrink-0 text-center bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 min-w-[48px]">
          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--abv-azure)]">
            {new Date(call.callDate).toLocaleDateString("en-CA", { month: "short", timeZone: "UTC" })}
          </p>
          <p className="text-base font-bold text-[var(--abv-text)] leading-none">
            {new Date(call.callDate).toLocaleDateString("en-CA", { day: "numeric", timeZone: "UTC" })}
          </p>
          <p className="text-[9px] text-[var(--abv-text)]/40">
            {new Date(call.callDate).getUTCFullYear()}
          </p>
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--abv-text)] truncate">{callTitle(call)}</p>
          {call.notes && (
            <p className="text-xs text-[var(--abv-text)]/40 truncate mt-0.5">{call.notes}</p>
          )}
        </div>

        {/* Video buttons + actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {hasFathom && (
            <a
              href={call.fathomUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-[var(--abv-text)] text-white rounded-lg hover:bg-[#1a1f22] transition-colors"
            >
              <span>🎥</span> Fathom
            </a>
          )}
          {hasLoom && (
            <button
              onClick={() => setLoomOpen((o) => !o)}
              className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 border border-gray-200 text-[var(--abv-text)] rounded-lg hover:border-[var(--abv-azure)]/40 hover:text-[var(--abv-azure)] transition-colors"
            >
              {loomOpen ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
              Loom
            </button>
          )}
          <div className="w-px h-4 bg-gray-200 mx-0.5" />
          <button
            onClick={() => onEdit(call)}
            className="p-1.5 text-[var(--abv-text)]/30 hover:text-[var(--abv-text)] rounded-md hover:bg-gray-200 transition-colors"
            title="Edit"
          >
            <PencilIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(call)}
            className="p-1.5 text-[var(--abv-text)]/30 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors"
            title="Delete"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Loom embed — collapsible */}
      {hasLoom && loomOpen && (
        <div className="px-4 pb-4 border-t border-gray-200 pt-3">
          <iframe
            src={loomEmbedUrl(call.loomUrl!)}
            width="100%"
            height="320"
            frameBorder="0"
            allowFullScreen
            className="rounded-lg border border-gray-200 bg-white block"
          />
        </div>
      )}

      {/* Full notes */}
      {call.notes && call.notes.length > 60 && (
        <div className="px-4 pb-3 border-t border-gray-100 pt-2.5">
          <p className="text-xs text-[var(--abv-text)]/60 whitespace-pre-line">{call.notes}</p>
        </div>
      )}
    </div>
  );
}

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
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="animate-pulse h-16 bg-gray-50 border border-gray-200 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[var(--abv-text)]">Call Recordings</h2>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 text-xs bg-[var(--abv-text)] text-white px-3 py-1.5 rounded-lg hover:bg-[#1a1f22] transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Add Call
        </button>
      </div>

      {calls.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-sm text-[var(--abv-text)]/40">
          No call recordings for this member yet.
        </div>
      ) : (
        <div className="space-y-2.5">
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
              <h3 className="text-base font-semibold text-[var(--abv-text)]">
                {editing ? "Edit Call" : "Add Call Recording"}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-[var(--abv-text)]/40 hover:text-[var(--abv-text)]">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Call Date *</label>
                <input
                  type="date"
                  value={form.callDate}
                  onChange={(e) => setForm((f) => ({ ...f, callDate: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Topic (optional)</label>
                <input
                  type="text"
                  value={form.topic}
                  onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
                  placeholder="e.g., Monthly Strategy Review"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/30"
                />
              </div>
              <div className="border border-gray-100 rounded-lg p-3 space-y-3 bg-gray-50/50">
                <p className="text-xs font-medium text-[var(--abv-text)]/50">Video — add at least one</p>
                <div>
                  <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Fathom URL</label>
                  <input
                    type="text"
                    value={form.fathomUrl}
                    onChange={(e) => setForm((f) => ({ ...f, fathomUrl: e.target.value }))}
                    placeholder="https://fathom.video/share/..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/30 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Loom URL</label>
                  <input
                    type="text"
                    value={form.loomUrl}
                    onChange={(e) => setForm((f) => ({ ...f, loomUrl: e.target.value }))}
                    placeholder="https://www.loom.com/share/..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/30 bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--abv-text)]/60 mb-1">Notes (optional)</label>
                <MarkdownTextarea
                  value={form.notes}
                  onChange={(next) => setForm((f) => ({ ...f, notes: next }))}
                  placeholder="Key discussion points, action items..."
                  rows={4}
                  ariaLabel="Notes"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-[var(--abv-text)]/60 hover:text-[var(--abv-text)] border border-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-[var(--abv-text)] text-white rounded-lg hover:bg-[#1a1f22] disabled:opacity-50 transition-colors"
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
            <h3 className="text-base font-semibold text-[var(--abv-text)] mb-2">Delete call recording?</h3>
            <p className="text-sm text-[var(--abv-text)]/60 mb-6">
              The video recordings themselves won&apos;t be affected.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-[var(--abv-text)]/60 hover:text-[var(--abv-text)] border border-gray-200 rounded-lg"
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
