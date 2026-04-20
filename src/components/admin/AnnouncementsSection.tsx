"use client";

import { useState, useEffect } from "react";
import MarkdownTextarea from "@/components/MarkdownTextarea";
import {
  MegaphoneIcon,
  PlusIcon,
  TrashIcon,
  EyeIcon,
  XMarkIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

interface Entry {
  id: string;
  title: string;
  body: string;
  emoji: string;
  type: string;
  published: boolean;
  createdAt: string;
  _count: { views: number };
}

interface Viewer {
  userId: string;
  fullName: string | null;
  email: string;
  seenAt: string;
}

const TYPE_OPTS = [
  { id: "announcement", label: "📣 Announcement", desc: "Pops up as a modal the next time each member loads the platform" },
  { id: "changelog", label: "✨ What's New", desc: "Appears in the What's New card on the member dashboard" },
];

function typeBadge(type: string) {
  return type === "announcement"
    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
    : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
}

export default function AnnouncementsSection() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", emoji: "📣", type: "announcement" });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  const [viewersEntryId, setViewersEntryId] = useState<string | null>(null);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [viewersLoading, setViewersLoading] = useState(false);

  useEffect(() => {
    fetchEntries();
  }, []);

  async function fetchEntries() {
    setLoading(true);
    const res = await fetch("/api/admin/changelog");
    const d = await res.json();
    setEntries(d.entries ?? []);
    setLoading(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      setSaveErr("Title and message are required.");
      return;
    }
    setSaving(true);
    setSaveErr("");
    const res = await fetch("/api/admin/changelog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    if (!res.ok) {
      setSaveErr(d.error || "Failed to save.");
    } else {
      setEntries((prev) => [d.entry, ...prev]);
      setForm({ title: "", body: "", emoji: "📣", type: "announcement" });
      setShowForm(false);
    }
    setSaving(false);
  }

  async function togglePublish(entry: Entry) {
    const res = await fetch("/api/admin/changelog", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id, published: !entry.published }),
    });
    const d = await res.json();
    if (res.ok) {
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? d.entry : e)));
    }
  }

  async function deleteEntry(id: string) {
    if (!confirm("Delete this message? Members who haven't seen it won't see it.")) return;
    const res = await fetch("/api/admin/changelog", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  async function openViewers(entryId: string) {
    setViewersEntryId(entryId);
    setViewers([]);
    setViewersLoading(true);
    const res = await fetch(`/api/admin/changelog/${entryId}/viewers`);
    const d = await res.json();
    setViewers(d.viewers ?? []);
    setViewersLoading(false);
  }

  const card = "bg-white dark:bg-[#1a2433] border border-gray-200 dark:border-white/10 rounded-xl";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <MegaphoneIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#6ba3c7] uppercase tracking-widest">Messaging</p>
            <h2 className="text-lg font-bold text-[#2f3437] dark:text-white">Announcements & What's New</h2>
          </div>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setSaveErr(""); }}
          className="flex items-center gap-2 bg-[#6ba3c7] hover:bg-[#5490b5] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          New Message
        </button>
      </div>

      <p className="text-sm text-[#2f3437]/60 dark:text-white/40">
        <strong className="font-medium text-[#2f3437] dark:text-white">Announcements</strong> pop up as a modal the next time a member loads the platform — great for important news or action items.{" "}
        <strong className="font-medium text-[#2f3437] dark:text-white">What's New</strong> entries appear as a quiet card on the member dashboard.
      </p>

      {/* Compose form */}
      {showForm && (
        <div className={`${card} p-5 space-y-4`}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#2f3437] dark:text-white">New Message</h3>
            <button onClick={() => setShowForm(false)} className="text-[#2f3437]/30 dark:text-white/30 hover:text-[#2f3437] dark:hover:text-white">
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Type selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TYPE_OPTS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: opt.id, emoji: opt.id === "announcement" ? "📣" : "✨" }))}
                className={`text-left p-3 rounded-lg border-2 transition-all ${
                  form.type === opt.id
                    ? "border-[#6ba3c7] bg-[#6ba3c7]/5 dark:bg-[#6ba3c7]/10"
                    : "border-gray-200 dark:border-white/10 hover:border-[#6ba3c7]/40"
                }`}
              >
                <p className="text-sm font-semibold text-[#2f3437] dark:text-white">{opt.label}</p>
                <p className="text-xs text-[#2f3437]/50 dark:text-white/40 mt-0.5 leading-snug">{opt.desc}</p>
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div className="flex gap-2">
              <div className="w-16">
                <label className="block text-xs font-medium text-[#2f3437]/60 dark:text-white/40 mb-1">Emoji</label>
                <input
                  type="text"
                  value={form.emoji}
                  onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
                  maxLength={4}
                  className="w-full text-center bg-white dark:bg-[#0f1419] border border-gray-200 dark:border-white/10 rounded-lg px-2 py-2 text-lg focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-[#2f3437]/60 dark:text-white/40 mb-1">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. New feature: My Work Hub"
                  className="w-full bg-white dark:bg-[#0f1419] border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-[#2f3437] dark:text-[#e2e8f0] placeholder:text-[#2f3437]/30 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#2f3437]/60 dark:text-white/40 mb-1">Message</label>
              <MarkdownTextarea
                value={form.body}
                onChange={(next) => setForm((f) => ({ ...f, body: next }))}
                rows={5}
                placeholder="Write your message here. Keep it clear and concise."
                ariaLabel="Message"
              />
            </div>

            {saveErr && <p className="text-sm text-red-600 dark:text-red-400">{saveErr}</p>}

            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-[#2f3437]/60 dark:text-white/40 hover:text-[#2f3437] dark:hover:text-white transition-colors">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 bg-[#6ba3c7] hover:bg-[#5490b5] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {saving ? "Publishing…" : "Publish Now"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Entries list */}
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2].map((i) => <div key={i} className="h-20 bg-gray-100 dark:bg-white/5 rounded-xl" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className={`${card} p-10 text-center`}>
          <MegaphoneIcon className="w-8 h-8 text-[#2f3437]/20 dark:text-white/20 mx-auto mb-2" />
          <p className="text-sm text-[#2f3437]/50 dark:text-white/40">No messages yet. Create your first one above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className={`${card} p-4`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0 leading-none mt-0.5">{entry.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${typeBadge(entry.type)}`}>
                      {entry.type === "announcement" ? "Announcement" : "What's New"}
                    </span>
                    {!entry.published && (
                      <span className="text-[10px] font-medium text-[#2f3437]/40 dark:text-white/30 bg-gray-100 dark:bg-white/10 px-2 py-0.5 rounded-full">
                        Unpublished
                      </span>
                    )}
                    <span className="text-[10px] text-[#2f3437]/30 dark:text-white/20">
                      {new Date(entry.createdAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-[#2f3437] dark:text-[#e2e8f0]">{entry.title}</p>
                  <p className="text-xs text-[#2f3437]/50 dark:text-white/40 mt-0.5 line-clamp-2">{entry.body}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Seen count */}
                  <button
                    onClick={() => openViewers(entry.id)}
                    title="See who viewed this"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#2f3437]/50 dark:text-white/40 hover:text-[#6ba3c7] hover:bg-[#6ba3c7]/5 transition-all"
                  >
                    <EyeIcon className="w-4 h-4" />
                    {entry._count.views}
                  </button>

                  {/* Publish toggle */}
                  <button
                    onClick={() => togglePublish(entry)}
                    title={entry.published ? "Unpublish" : "Publish"}
                    className={`p-1.5 rounded-lg transition-colors ${
                      entry.published
                        ? "text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
                        : "text-[#2f3437]/30 dark:text-white/20 hover:text-[#2f3437] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5"
                    }`}
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => deleteEntry(entry.id)}
                    title="Delete"
                    className="p-1.5 rounded-lg text-[#2f3437]/20 dark:text-white/20 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Viewers modal */}
      {viewersEntryId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#1a2433] rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-[#2f3437] dark:text-white">Who saw this</h3>
                {!viewersLoading && (
                  <p className="text-xs text-[#2f3437]/50 dark:text-white/40 mt-0.5">
                    {viewers.length} member{viewers.length !== 1 ? "s" : ""} saw this message
                  </p>
                )}
              </div>
              <button
                onClick={() => setViewersEntryId(null)}
                className="text-[#2f3437]/30 dark:text-white/30 hover:text-[#2f3437] dark:hover:text-white transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {viewersLoading ? (
                <div className="space-y-3 animate-pulse">
                  {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 dark:bg-white/5 rounded-lg" />)}
                </div>
              ) : viewers.length === 0 ? (
                <div className="text-center py-10">
                  <EyeIcon className="w-8 h-8 text-[#2f3437]/20 dark:text-white/20 mx-auto mb-2" />
                  <p className="text-sm text-[#2f3437]/40 dark:text-white/30">No one has seen this yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {viewers.map((v) => (
                    <div key={v.userId} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 dark:border-white/5 last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#2f3437] dark:text-[#e2e8f0] truncate">
                          {v.fullName || v.email}
                        </p>
                        {v.fullName && (
                          <p className="text-xs text-[#2f3437]/40 dark:text-white/30 truncate">{v.email}</p>
                        )}
                      </div>
                      <span className="text-xs text-[#2f3437]/30 dark:text-white/20 shrink-0">
                        {new Date(v.seenAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
