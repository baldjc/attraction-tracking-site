"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

interface SwipeEntry {
  id: string;
  videoId: string | null;
  title: string;
  thumbnailUrl: string | null;
  notes: string | null;
  tags: string[];
  audience: string | null;
  theme: string | null;
  angle: string | null;
  createdBy: string;
  createdAt: string;
}

export default function SwipeFilePage() {
  const [entries, setEntries] = useState<SwipeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  async function load() {
    const res = await fetch("/api/intelligence/swipe-file");
    if (res.ok) setEntries(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    await fetch("/api/intelligence/swipe-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        notes: notes.trim() || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      }),
    });
    setTitle(""); setNotes(""); setTags("");
    setShowAdd(false);
    setSaving(false);
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove from swipe file?")) return;
    await fetch(`/api/intelligence/swipe-file?id=${id}`, { method: "DELETE" });
    await load();
  }

  const filtered = entries.filter((e) =>
    !search ||
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.notes?.toLowerCase().includes(search.toLowerCase()) ||
    e.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  const allTags = [...new Set(entries.flatMap((e) => e.tags))];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/admin/intelligence" className="text-sm text-[#2f3437]/50 hover:text-[#2f3437]">← Intelligence</Link>
          <h1 className="text-xl font-bold text-[#2f3437] mt-1">Swipe File</h1>
          <p className="text-sm text-[#2f3437]/60 mt-1">Saved videos, titles, and thumbnails for reference</p>
        </div>
        <button onClick={() => setShowAdd((v) => !v)} className="px-4 py-2 bg-[#6ba3c7] text-white text-sm font-semibold rounded-lg hover:bg-[#5490b5] transition-colors">
          + Add Entry
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white border border-[#6ba3c7]/30 rounded-xl p-5 mb-5 space-y-3">
          <p className="text-sm font-semibold text-[#2f3437]">Add to Swipe File</p>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title / description *" required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40" />
          <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags (comma-separated)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40 resize-none" />
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-[#6ba3c7] text-white text-sm font-semibold rounded-lg disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-[#2f3437]/50">Cancel</button>
          </div>
        </form>
      )}

      <div className="flex gap-2 mb-4">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search swipe file…"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40 bg-white" />
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {allTags.map((tag) => (
            <button key={tag} onClick={() => setSearch(tag === search ? "" : tag)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${tag === search ? "bg-[#2f3437] text-white border-[#2f3437]" : "bg-white text-[#2f3437]/60 border-[#2f3437]/15 hover:border-[#2f3437]/30"}`}>
              {tag}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="h-48 bg-white border border-[#2f3437]/10 rounded-xl animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-[#2f3437]/10 rounded-xl p-10 text-center">
          <p className="text-3xl mb-3">🗂️</p>
          <p className="font-semibold text-[#2f3437]">{entries.length === 0 ? "Swipe file is empty" : "No matching entries"}</p>
          <p className="text-sm text-[#2f3437]/50 mt-1">Save interesting videos from the Outlier Feed and Run Reports here.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#2f3437]/10 rounded-xl divide-y divide-[#2f3437]/6">
          {filtered.map((e) => (
            <div key={e.id} className="p-4 flex items-start gap-4 hover:bg-[#f7f6f3]/40 transition-colors">
              {e.thumbnailUrl && (
                <img src={e.thumbnailUrl} alt={e.title} className="w-28 h-16 object-cover rounded-md shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#2f3437] line-clamp-1">{e.title}</p>
                {e.notes && <p className="text-xs text-[#2f3437]/50 mt-0.5">{e.notes}</p>}
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {e.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 bg-[#f7f6f3] text-xs text-[#2f3437]/60 rounded-full border border-[#2f3437]/8">{tag}</span>
                  ))}
                  {e.audience && <span className="px-2 py-0.5 bg-blue-50 text-xs text-blue-700 rounded-full">{e.audience}</span>}
                  {e.theme && <span className="px-2 py-0.5 bg-amber-50 text-xs text-amber-700 rounded-full">{e.theme}</span>}
                  <span className="text-xs text-[#2f3437]/30">{new Date(e.createdAt).toLocaleDateString("en-CA")}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                {e.videoId && (
                  <a href={`https://youtube.com/watch?v=${e.videoId}`} target="_blank" rel="noreferrer"
                    className="px-3 py-1.5 text-xs font-semibold bg-[#f7f6f3] text-[#2f3437]/60 hover:text-[#2f3437] rounded-lg border border-[#2f3437]/10">
                    YT ↗
                  </a>
                )}
                <button onClick={() => handleDelete(e.id)} className="px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-red-600 rounded-lg border border-red-200/50 hover:bg-red-50">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
