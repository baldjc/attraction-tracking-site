"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";

interface SeoKeyword {
  id: string;
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  intent: string | null;
  isQuestion: boolean;
  clusterId: string | null;
}

interface SeoSearch {
  id: string;
  seedKeyword: string;
  createdAt: string;
  keywords: SeoKeyword[];
}

interface SeoCluster {
  id: string;
  name: string;
  theme: string | null;
}

export default function KeywordsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  const [searches, setSearches] = useState<SeoSearch[]>([]);
  const [clusters, setClusters] = useState<SeoCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [seedKeyword, setSeedKeyword] = useState("");
  const [rawKeywords, setRawKeywords] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const [sRes, cRes] = await Promise.all([
      fetch(`/api/intelligence/clients/${clientId}/keywords`),
      fetch(`/api/intelligence/clients/${clientId}/clusters`),
    ]);
    if (sRes.ok) setSearches(await sRes.json());
    if (cRes.ok) setClusters(await cRes.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, [clientId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!seedKeyword.trim()) return;
    setSubmitting(true);
    const lines = rawKeywords.split("\n").filter((l) => l.trim());
    const keywords = lines.map((line) => {
      const parts = line.split(",").map((p) => p.trim());
      return {
        keyword: parts[0],
        volume: parts[1] ? parseInt(parts[1]) || null : null,
        difficulty: parts[2] ? parseFloat(parts[2]) || null : null,
        intent: parts[3] || null,
      };
    }).filter((k) => k.keyword);

    await fetch(`/api/intelligence/clients/${clientId}/keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seedKeyword: seedKeyword.trim(), keywords }),
    });
    setSeedKeyword("");
    setRawKeywords("");
    setShowAdd(false);
    setSubmitting(false);
    await load();
  }

  const allKeywords = searches.flatMap((s) => s.keywords);
  const unclustered = allKeywords.filter((k) => !k.clusterId);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href={`/admin/intelligence/clients/${clientId}`} className="text-sm text-[var(--abv-text)]/50 hover:text-[var(--abv-text)]">← Client Overview</Link>
          <h1 className="text-xl font-bold text-[var(--abv-text)] mt-1">Keyword Research</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/admin/intelligence/clients/${clientId}/clusters`} className="px-4 py-2 bg-[var(--abv-bg)] text-[var(--abv-text)]/70 text-sm font-semibold rounded-lg border border-[var(--abv-text)]/10 hover:bg-[#eee] transition-colors">
            Manage Clusters
          </Link>
          <button onClick={() => setShowAdd((v) => !v)} className="px-4 py-2 bg-[var(--abv-dark)] text-white text-sm font-semibold rounded-lg hover:bg-black/85 transition-colors">
            + Add Keywords
          </button>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white border border-[var(--abv-azure)]/30 rounded-xl p-5 mb-5 space-y-4">
          <p className="text-sm font-semibold text-[var(--abv-text)]">Add Keyword Research</p>
          <div>
            <label className="block text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wider mb-1">Seed Keyword *</label>
            <input
              type="text"
              value={seedKeyword}
              onChange={(e) => setSeedKeyword(e.target.value)}
              placeholder="e.g. Calgary homes for sale"
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--abv-text)]/50 uppercase tracking-wider mb-1">
              Keywords (one per line: keyword, volume, difficulty, intent)
            </label>
            <textarea
              value={rawKeywords}
              onChange={(e) => setRawKeywords(e.target.value)}
              rows={8}
              placeholder={"buy home Calgary, 1200, 45, buy\nhow to buy a house, 880, 38, informational\nbest neighbourhoods Calgary, 320, 52, informational"}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/40 resize-y"
            />
            <p className="text-xs text-[var(--abv-text)]/40 mt-1">Paste from DataForSEO, Ahrefs, or any keyword tool. Volume, difficulty, and intent are optional.</p>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-[var(--abv-dark)] text-white text-sm font-semibold rounded-lg disabled:opacity-50">
              {submitting ? "Saving…" : "Save Keywords"}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-[var(--abv-text)]/50">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="h-48 bg-white border border-[var(--abv-text)]/10 rounded-xl animate-pulse" />
      ) : searches.length === 0 ? (
        <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl p-10 text-center">
          <p className="text-3xl mb-3">🔍</p>
          <p className="font-semibold text-[var(--abv-text)]">No keyword research yet</p>
          <p className="text-sm text-[var(--abv-text)]/50 mt-1">Add keywords manually, or connect DataForSEO for automated research.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-[var(--abv-text)]">{allKeywords.length}</p>
              <p className="text-xs text-[var(--abv-text)]/50 mt-1">Total Keywords</p>
            </div>
            <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-[var(--abv-text)]">{clusters.length}</p>
              <p className="text-xs text-[var(--abv-text)]/50 mt-1">Topic Clusters</p>
            </div>
            <div className="bg-white border border-[var(--abv-text)]/10 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-[var(--abv-text)]">{unclustered.length}</p>
              <p className="text-xs text-[var(--abv-text)]/50 mt-1">Unclustered</p>
            </div>
          </div>

          {searches.map((search) => (
            <div key={search.id} className="bg-white border border-[var(--abv-text)]/10 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-[var(--abv-bg)] border-b border-[var(--abv-text)]/8">
                <p className="text-sm font-semibold text-[var(--abv-text)]">🔍 {search.seedKeyword}</p>
                <p className="text-xs text-[var(--abv-text)]/40">{new Date(search.createdAt).toLocaleDateString("en-CA")} · {search.keywords.length} keywords</p>
              </div>
              {search.keywords.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--abv-text)]/6 text-left">
                      <th className="px-5 py-2 text-xs font-semibold text-[var(--abv-text)]/40 uppercase tracking-wide">Keyword</th>
                      <th className="px-5 py-2 text-xs font-semibold text-[var(--abv-text)]/40 uppercase tracking-wide">Volume</th>
                      <th className="px-5 py-2 text-xs font-semibold text-[var(--abv-text)]/40 uppercase tracking-wide">Diff</th>
                      <th className="px-5 py-2 text-xs font-semibold text-[var(--abv-text)]/40 uppercase tracking-wide">Intent</th>
                      <th className="px-5 py-2 text-xs font-semibold text-[var(--abv-text)]/40 uppercase tracking-wide">Cluster</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--abv-text)]/6">
                    {search.keywords.slice(0, 30).map((kw) => {
                      const cluster = clusters.find((c) => c.id === kw.clusterId);
                      return (
                        <tr key={kw.id} className="hover:bg-[var(--abv-bg)]/50">
                          <td className="px-5 py-2 text-[var(--abv-text)] font-medium">
                            {kw.keyword}
                            {kw.isQuestion && <span className="ml-1.5 text-xs text-[var(--abv-azure)]">?</span>}
                          </td>
                          <td className="px-5 py-2 text-[var(--abv-text)]/60">{kw.volume?.toLocaleString() ?? "—"}</td>
                          <td className="px-5 py-2 text-[var(--abv-text)]/60">{kw.difficulty != null ? `${kw.difficulty.toFixed(0)}` : "—"}</td>
                          <td className="px-5 py-2 text-[var(--abv-text)]/60 capitalize">{kw.intent ?? "—"}</td>
                          <td className="px-5 py-2">
                            {cluster ? (
                              <span className="px-2 py-0.5 bg-[var(--abv-dark)]/10 text-[var(--abv-azure)] text-xs rounded-full">{cluster.name}</span>
                            ) : (
                              <span className="text-[var(--abv-text)]/30 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
