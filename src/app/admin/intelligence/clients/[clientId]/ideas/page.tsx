"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";

interface ContentIdea {
  id: string;
  title: string;
  outline: string | null;
  audience: string | null;
  theme: string | null;
  angle: string | null;
  status: string;
  createdAt: string;
}

const STATUS_COLOURS: Record<string, string> = {
  idea: "bg-gray-100 text-gray-600",
  scripting: "bg-blue-100 text-blue-700",
  filming: "bg-amber-100 text-amber-700",
  editing: "bg-purple-100 text-purple-700",
  published: "bg-green-100 text-green-700",
};

export default function IdeasPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualOutline, setManualOutline] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("all");

  async function load() {
    const res = await fetch(`/api/intelligence/clients/${clientId}/ideas`);
    if (res.ok) setIdeas(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, [clientId]);

  async function generateIdeas() {
    setGenerating(true);
    setGenMsg(null);
    const res = await fetch(`/api/intelligence/clients/${clientId}/ideas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const created = await res.json();
      setGenMsg(`Generated ${created.length} new ideas.`);
      await load();
    } else {
      const d = await res.json();
      setGenMsg(`Error: ${d.error}`);
    }
    setGenerating(false);
  }

  async function saveManual(e: React.FormEvent) {
    e.preventDefault();
    if (!manualTitle.trim()) return;
    setSaving(true);
    await fetch(`/api/intelligence/clients/${clientId}/ideas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manual: true, title: manualTitle.trim(), outline: manualOutline.trim() || null }),
    });
    setManualTitle("");
    setManualOutline("");
    setShowManual(false);
    setSaving(false);
    await load();
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/intelligence/clients/${clientId}/ideas`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await load();
  }

  const filtered = filter === "all" ? ideas : ideas.filter((i) => i.status === filter);
  const statusCounts = ideas.reduce((acc, i) => { acc[i.status] = (acc[i.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href={`/admin/intelligence/clients/${clientId}`} className="text-sm text-[#2f3437]/50 hover:text-[#2f3437]">← Client Overview</Link>
          <h1 className="text-xl font-bold text-[#2f3437] mt-1">Content Ideas</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowManual((v) => !v)} className="px-4 py-2 bg-[#f7f6f3] text-[#2f3437]/70 text-sm font-semibold rounded-lg border border-[#2f3437]/10 hover:bg-[#eee] transition-colors">
            + Manual Idea
          </button>
          <button onClick={generateIdeas} disabled={generating} className="px-4 py-2 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors">
            {generating ? "Generating…" : "✨ Generate with AI"}
          </button>
        </div>
      </div>

      {genMsg && (
        <div className="mb-4 bg-[#6ba3c7]/10 border border-[#6ba3c7]/30 rounded-lg px-4 py-3 text-sm text-[#2f3437]">{genMsg}</div>
      )}

      {showManual && (
        <form onSubmit={saveManual} className="bg-white border border-[#6ba3c7]/30 rounded-xl p-5 mb-5 space-y-3">
          <p className="text-sm font-semibold text-[#2f3437]">New Manual Idea</p>
          <input type="text" value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder="Video title *" required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40" />
          <textarea value={manualOutline} onChange={(e) => setManualOutline(e.target.value)} rows={3} placeholder="Brief outline…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40 resize-none" />
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-[#6ba3c7] text-white text-sm font-semibold rounded-lg disabled:opacity-50">{saving ? "Saving…" : "Save Idea"}</button>
            <button type="button" onClick={() => setShowManual(false)} className="px-4 py-2 text-sm text-[#2f3437]/50">Cancel</button>
          </div>
        </form>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {["all", "idea", "scripting", "filming", "editing", "published"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${filter === s ? "bg-[#2f3437] text-white border-[#2f3437]" : "bg-white text-[#2f3437]/60 border-[#2f3437]/15 hover:border-[#2f3437]/30"}`}
          >
            {s === "all" ? `All (${ideas.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${statusCounts[s] ?? 0})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-48 bg-white border border-[#2f3437]/10 rounded-xl animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-[#2f3437]/10 rounded-xl p-10 text-center">
          <p className="text-3xl mb-3">💡</p>
          <p className="font-semibold text-[#2f3437]">{filter === "all" ? "No ideas yet" : `No ideas with status "${filter}"`}</p>
          <p className="text-sm text-[#2f3437]/50 mt-1">Generate ideas from your topic clusters or add them manually.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#2f3437]/10 rounded-xl divide-y divide-[#2f3437]/6">
          {filtered.map((idea) => (
            <div key={idea.id} className="p-4 hover:bg-[#f7f6f3]/40 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#2f3437] text-sm leading-snug">{idea.title}</p>
                  {idea.outline && <p className="text-xs text-[#2f3437]/50 mt-1 line-clamp-2">{idea.outline}</p>}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {idea.theme && <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs rounded-full border border-amber-200/60">{idea.theme}</span>}
                    <span className="text-xs text-[#2f3437]/30">{new Date(idea.createdAt).toLocaleDateString("en-CA")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={idea.status}
                    onChange={(e) => updateStatus(idea.id, e.target.value)}
                    className={`text-xs font-semibold px-2.5 py-1.5 rounded-full border-0 focus:outline-none cursor-pointer ${STATUS_COLOURS[idea.status] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    {["idea", "scripting", "filming", "editing", "published"].map((s) => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
