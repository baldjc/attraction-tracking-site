"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface IntelRun {
  id: string;
  inputChannelUrl: string;
  resolvedChannelId: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  failedReason: string | null;
  createdBy: string;
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  PENDING: { bg: "bg-gray-100", text: "text-gray-600", label: "Pending" },
  RUNNING: { bg: "bg-blue-100", text: "text-blue-700", label: "Running…" },
  COMPLETED: { bg: "bg-green-100", text: "text-green-700", label: "Completed" },
  FAILED: { bg: "bg-red-100", text: "text-red-700", label: "Failed" },
};

export default function ClientRunsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  const router = useRouter();
  const [runs, setRuns] = useState<IntelRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelUrl, setChannelUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/intelligence/runs?clientId=${clientId}`);
    if (res.ok) setRuns(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, [clientId]);

  useEffect(() => {
    const hasRunning = runs.some((r) => r.status === "RUNNING" || r.status === "PENDING");
    if (!hasRunning) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [runs]);

  async function handleNewRun(e: React.FormEvent) {
    e.preventDefault();
    if (!channelUrl.trim()) return;
    setCreating(true);
    setError(null);
    const res = await fetch("/api/intelligence/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelUrl: channelUrl.trim(), clientId }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed to create run");
      setCreating(false);
      return;
    }
    const run = await res.json();
    await fetch(`/api/intelligence/runs/${run.id}/execute`, { method: "POST" });
    setChannelUrl("");
    setCreating(false);
    router.push(`/admin/intelligence/runs/${run.id}`);
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href={`/admin/intelligence/clients/${clientId}`} className="text-sm text-[#2f3437]/50 hover:text-[#2f3437]">← Client Overview</Link>
        <h1 className="text-xl font-bold text-[#2f3437] mt-1">Intelligence Runs</h1>
      </div>

      <form onSubmit={handleNewRun} className="bg-white border border-[#6ba3c7]/30 rounded-xl p-5 mb-5">
        <p className="text-sm font-semibold text-[#2f3437] mb-3">Start a New Run</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            placeholder="@channelHandle or YouTube URL"
            required
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/40"
          />
          <button type="submit" disabled={creating || !channelUrl.trim()} className="px-4 py-2 bg-[#6ba3c7] text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-[#5490b5]">
            {creating ? "Starting…" : "Run"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </form>

      {loading ? (
        <div className="h-48 bg-white border border-[#2f3437]/10 rounded-xl animate-pulse" />
      ) : runs.length === 0 ? (
        <div className="bg-white border border-[#2f3437]/10 rounded-xl p-10 text-center">
          <p className="text-3xl mb-3">📊</p>
          <p className="font-semibold text-[#2f3437]">No runs yet</p>
          <p className="text-sm text-[#2f3437]/50 mt-1">Start an intelligence run to analyse competitor channels and find outlier patterns.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#2f3437]/10 rounded-xl divide-y divide-[#2f3437]/6">
          {runs.map((run) => {
            const s = STATUS_STYLE[run.status] ?? STATUS_STYLE.PENDING;
            return (
              <div key={run.id} className="p-4 hover:bg-[#f7f6f3]/40 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#2f3437] text-sm truncate">{run.inputChannelUrl}</p>
                    <p className="text-xs text-[#2f3437]/40 mt-0.5">
                      {new Date(run.startedAt).toLocaleString("en-CA")}
                      {run.completedAt && ` · Completed ${new Date(run.completedAt).toLocaleString("en-CA")}`}
                      {run.failedReason && <span className="text-red-500 ml-1">— {run.failedReason.slice(0, 80)}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${s.bg} ${s.text}`}>
                      {run.status === "RUNNING" ? "⟳ " : ""}{s.label}
                    </span>
                    <Link href={`/admin/intelligence/runs/${run.id}`} className="px-3 py-1.5 text-xs font-semibold bg-[#f7f6f3] text-[#2f3437]/60 hover:text-[#2f3437] rounded-lg border border-[#2f3437]/10">
                      View →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
