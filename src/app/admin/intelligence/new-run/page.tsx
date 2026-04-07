"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewRunPage() {
  const router = useRouter();
  const [channelUrl, setChannelUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/intelligence/clients")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setClients(data);
      })
      .catch(() => {})
      .finally(() => setClientsLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!channelUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/intelligence/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelUrl: channelUrl.trim(), clientId: clientId || null }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to create run");
      }
      const run = await res.json();
      await fetch(`/api/intelligence/runs/${run.id}/execute`, { method: "POST" });
      router.push(`/admin/intelligence/runs/${run.id}`);
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/intelligence" className="text-sm text-[#2f3437]/50 hover:text-[#2f3437]">← Intelligence</Link>
        <h1 className="text-xl font-bold text-[#2f3437] mt-1">New Intelligence Run</h1>
        <p className="text-sm text-[#2f3437]/60 mt-1">
          Paste a YouTube channel URL or handle to run a full channel intelligence report — outlier detection, Claude analysis, and pattern extraction.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-[#2f3437]/10 rounded-xl p-6 space-y-5">
        <div>
          <label className="block text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider mb-1.5">
            YouTube Channel URL or Handle *
          </label>
          <input
            type="text"
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            placeholder="e.g. @CalgaryrealestateTV or https://youtube.com/@..."
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-[#2f3437] focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40"
          />
          <p className="text-xs text-[#2f3437]/40 mt-1">Accepts a @handle, channel URL, or channel ID</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#2f3437]/50 uppercase tracking-wider mb-1.5">
            Link to Client (optional)
          </label>
          {clientsLoading ? (
            <div className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-[#2f3437]/40 bg-gray-50">
              Loading clients…
            </div>
          ) : (
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-[#2f3437] focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40 bg-white"
            >
              <option value="">— No client —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          {!clientsLoading && clients.length === 0 && (
            <p className="text-xs text-[#2f3437]/40 mt-1">
              No clients yet.{" "}
              <Link href="/admin/intelligence/clients/new" className="text-[#6ba3c7] hover:underline">
                Create a client
              </Link>{" "}
              to link this run.
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="bg-[#f7f6f3] rounded-lg px-4 py-3 text-xs text-[#2f3437]/60 space-y-1">
          <p className="font-semibold text-[#2f3437]/70">What this run does:</p>
          <p>1. Resolves the channel via YouTube API and syncs up to 200 videos</p>
          <p>2. Computes outlier multiples (views ÷ median) for every video</p>
          <p>3. Analyses the top 5 outliers with Claude — hook type, title framework, why it worked</p>
          <p>4. Generates a full intelligence report with pattern summary</p>
          <p className="text-amber-600 font-medium">Requires YOUTUBE_API_KEY to be configured.</p>
        </div>

        <button
          type="submit"
          disabled={loading || !channelUrl.trim()}
          className="w-full bg-[#6ba3c7] text-white font-semibold py-3 rounded-lg hover:bg-[#5490b5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        >
          {loading ? "Starting run…" : "Start Intelligence Run"}
        </button>
      </form>
    </div>
  );
}
