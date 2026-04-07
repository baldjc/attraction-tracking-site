"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";

interface VocabEntry {
  id: string;
  term: string;
  definition: string | null;
  category: string | null;
  exampleUsage: string | null;
  createdAt: string;
}

export default function VocabularyPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  const [vocab, setVocab] = useState<VocabEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");
  const [category, setCategory] = useState("");
  const [example, setExample] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  async function load() {
    const res = await fetch(`/api/intelligence/clients/${clientId}/vocabulary`);
    if (res.ok) setVocab(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, [clientId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!term.trim()) return;
    setSaving(true);
    await fetch(`/api/intelligence/clients/${clientId}/vocabulary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term: term.trim(), definition: definition.trim() || null, category: category.trim() || null, exampleUsage: example.trim() || null }),
    });
    setTerm(""); setDefinition(""); setCategory(""); setExample("");
    setShowAdd(false);
    setSaving(false);
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this term?")) return;
    await fetch(`/api/intelligence/clients/${clientId}/vocabulary?id=${id}`, { method: "DELETE" });
    await load();
  }

  const filtered = vocab.filter((v) => !search || v.term.toLowerCase().includes(search.toLowerCase()) || v.definition?.toLowerCase().includes(search.toLowerCase()));

  const categories = [...new Set(vocab.map((v) => v.category).filter(Boolean))] as string[];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href={`/admin/intelligence/clients/${clientId}`} className="text-sm text-[#2f3437]/50 hover:text-[#2f3437]">← Client Overview</Link>
          <h1 className="text-xl font-bold text-[#2f3437] mt-1">Vocabulary Profile</h1>
          <p className="text-sm text-[#2f3437]/50 mt-0.5">Terms, phrases, and language patterns specific to this client&apos;s market.</p>
        </div>
        <button onClick={() => setShowAdd((v) => !v)} className="px-4 py-2 bg-[#6ba3c7] text-white text-sm font-semibold rounded-lg hover:bg-[#5490b5] transition-colors">
          + Add Term
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white border border-[#6ba3c7]/30 rounded-xl p-5 mb-5 space-y-3">
          <p className="text-sm font-semibold text-[#2f3437]">New Vocabulary Term</p>
          <div className="grid grid-cols-2 gap-3">
            <input type="text" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Term *" required
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40" />
            <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (e.g. Neighbourhood, Process)"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40" />
          </div>
          <textarea value={definition} onChange={(e) => setDefinition(e.target.value)} rows={2} placeholder="Definition or context…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40 resize-none" />
          <input type="text" value={example} onChange={(e) => setExample(e.target.value)} placeholder="Example usage in a title or script…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40" />
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-[#6ba3c7] text-white text-sm font-semibold rounded-lg disabled:opacity-50">{saving ? "Saving…" : "Save Term"}</button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-[#2f3437]/50">Cancel</button>
          </div>
        </form>
      )}

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search terms…"
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40 bg-white"
        />
      </div>

      {loading ? (
        <div className="h-48 bg-white border border-[#2f3437]/10 rounded-xl animate-pulse" />
      ) : vocab.length === 0 ? (
        <div className="bg-white border border-[#2f3437]/10 rounded-xl p-10 text-center">
          <p className="text-3xl mb-3">📖</p>
          <p className="font-semibold text-[#2f3437]">No vocabulary terms yet</p>
          <p className="text-sm text-[#2f3437]/50 mt-1">Add market-specific terms, neighbourhood names, buyer personas, and phrases that resonate with this client&apos;s audience.</p>
        </div>
      ) : (
        <div>
          {categories.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <span key={cat} className="px-2.5 py-1 bg-[#f7f6f3] text-xs text-[#2f3437]/60 rounded-full border border-[#2f3437]/8">{cat}</span>
              ))}
            </div>
          )}
          <div className="bg-white border border-[#2f3437]/10 rounded-xl divide-y divide-[#2f3437]/6">
            {filtered.map((v) => (
              <div key={v.id} className="p-4 hover:bg-[#f7f6f3]/40 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[#2f3437] text-sm">{v.term}</p>
                      {v.category && <span className="px-2 py-0.5 bg-[#f7f6f3] text-xs text-[#2f3437]/50 rounded-full">{v.category}</span>}
                    </div>
                    {v.definition && <p className="text-sm text-[#2f3437]/60 mt-0.5">{v.definition}</p>}
                    {v.exampleUsage && (
                      <p className="text-xs text-[#2f3437]/40 mt-1 italic">&ldquo;{v.exampleUsage}&rdquo;</p>
                    )}
                  </div>
                  <button onClick={() => handleDelete(v.id)} className="text-xs text-red-400 hover:text-red-600 shrink-0">Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
