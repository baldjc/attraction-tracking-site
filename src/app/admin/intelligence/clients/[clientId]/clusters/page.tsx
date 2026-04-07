"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";

interface SeoKeyword {
  id: string;
  keyword: string;
  volume: number | null;
  difficulty: number | null;
}

interface SeoCluster {
  id: string;
  name: string;
  theme: string | null;
  notes: string | null;
  createdAt: string;
  keywords: SeoKeyword[];
}

export default function ClustersPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  const [clusters, setClusters] = useState<SeoCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [theme, setTheme] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [generatingIdeas, setGeneratingIdeas] = useState(false);
  const [ideaMsg, setIdeaMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/intelligence/clients/${clientId}/clusters`);
    if (res.ok) setClusters(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, [clientId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await fetch(`/api/intelligence/clients/${clientId}/clusters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), theme: theme.trim() || null, notes: notes.trim() || null }),
    });
    setName("");
    setTheme("");
    setNotes("");
    setShowAdd(false);
    setSubmitting(false);
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this cluster?")) return;
    await fetch(`/api/intelligence/clients/${clientId}/clusters?id=${id}`, { method: "DELETE" });
    await load();
  }

  async function generateIdeas() {
    setGeneratingIdeas(true);
    setIdeaMsg(null);
    const res = await fetch(`/api/intelligence/clients/${clientId}/ideas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const ideas = await res.json();
      setIdeaMsg(`Generated ${ideas.length} content ideas from your clusters.`);
    } else {
      const d = await res.json();
      setIdeaMsg(`Error: ${d.error}`);
    }
    setGeneratingIdeas(false);
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href={`/admin/intelligence/clients/${clientId}`} className="text-sm text-[#2f3437]/50 hover:text-[#2f3437]">← Client Overview</Link>
          <h1 className="text-xl font-bold text-[#2f3437] mt-1">Topic Clusters</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={generateIdeas}
            disabled={generatingIdeas || clusters.length === 0}
            className="px-4 py-2 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {generatingIdeas ? "Generating…" : "✨ Generate Ideas"}
          </button>
          <button onClick={() => setShowAdd((v) => !v)} className="px-4 py-2 bg-[#6ba3c7] text-white text-sm font-semibold rounded-lg hover:bg-[#5490b5] transition-colors">
            + New Cluster
          </button>
        </div>
      </div>

      {ideaMsg && (
        <div className="mb-4 bg-[#6ba3c7]/10 border border-[#6ba3c7]/30 rounded-lg px-4 py-3 text-sm text-[#2f3437]">
          {ideaMsg} <Link href={`/admin/intelligence/clients/${clientId}/ideas`} className="text-[#6ba3c7] underline ml-1">View Ideas →</Link>
        </div>
      )}

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white border border-[#6ba3c7]/30 rounded-xl p-5 mb-5 space-y-3">
          <p className="text-sm font-semibold text-[#2f3437]">New Topic Cluster</p>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cluster name *" required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40" />
          <input type="text" value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Theme (optional)"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40 resize-none" />
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#6ba3c7] text-white text-sm font-semibold rounded-lg disabled:opacity-50">
              {submitting ? "Creating…" : "Create Cluster"}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-[#2f3437]/50">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="h-48 bg-white border border-[#2f3437]/10 rounded-xl animate-pulse" />
      ) : clusters.length === 0 ? (
        <div className="bg-white border border-[#2f3437]/10 rounded-xl p-10 text-center">
          <p className="text-3xl mb-3">🗂️</p>
          <p className="font-semibold text-[#2f3437]">No clusters yet</p>
          <p className="text-sm text-[#2f3437]/50 mt-1">Group keywords into topic clusters, then generate content ideas from them.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {clusters.map((cluster) => (
            <div key={cluster.id} className="bg-white border border-[#2f3437]/10 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-[#f7f6f3] border-b border-[#2f3437]/8">
                <div>
                  <p className="text-sm font-semibold text-[#2f3437]">{cluster.name}</p>
                  {cluster.theme && <p className="text-xs text-[#2f3437]/50">{cluster.theme}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#2f3437]/40">{cluster.keywords.length} keywords</span>
                  <button onClick={() => handleDelete(cluster.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                </div>
              </div>
              {cluster.keywords.length > 0 && (
                <div className="px-5 py-3 flex flex-wrap gap-1.5">
                  {cluster.keywords.map((kw) => (
                    <span key={kw.id} className="px-2.5 py-1 bg-[#f7f6f3] text-xs text-[#2f3437]/70 rounded-full border border-[#2f3437]/8">
                      {kw.keyword}
                      {kw.volume != null && <span className="ml-1 text-[#2f3437]/40">{kw.volume.toLocaleString()}</span>}
                    </span>
                  ))}
                </div>
              )}
              {cluster.notes && <p className="px-5 pb-3 text-xs text-[#2f3437]/50">{cluster.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
