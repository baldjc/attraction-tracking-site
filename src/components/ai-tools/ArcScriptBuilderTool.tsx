"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import ArcScriptUploadPhase from "@/components/ai-tools/ArcScriptUploadPhase";
import ArcScriptChatPhase from "@/components/ai-tools/ArcScriptChatPhase";

interface Props {
  basePath: string;
  isAdmin?: boolean;
}

interface UploadData {
  title: string;
  talkingPoints: string;
  researchSummary: string;
  clientStory: string;
  leadMagnet: string;
  nextVideoPush: string;
}

interface UsageData {
  percentUsed: number;
  cap: string;
  resetsAt: string;
}

export default function ArcScriptBuilderTool({ basePath, isAdmin }: Props) {
  const [phase, setPhase] = useState<"upload" | "chat">("upload");
  const [uploadData, setUploadData] = useState<UploadData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);

  useEffect(() => {
    fetch("/api/ai-tools/usage/me")
      .then((r) => r.json())
      .then((d) => { if (d?.percentUsed != null) setUsage(d); })
      .catch(() => {});
  }, []);

  const pct = usage?.percentUsed ?? 0;
  const isLocked = pct >= 100;

  function handleStartBuilding(data: UploadData) {
    setUploadData(data);
    setPhase("chat");
  }

  function handleReset() {
    setUploadData(null);
    setPhase("upload");
  }

  const subtitle =
    phase === "upload"
      ? "Upload your research and set up your video details"
      : "Building your script — work through each section with the AI";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <Link
          href={basePath}
          className="inline-flex items-center gap-1.5 text-sm text-[#2f3437]/50 hover:text-[#6ba3c7] transition-colors mb-4"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          AI Tools
        </Link>
        <h1 className="text-2xl font-bold text-[#2f3437]">ARC Script Builder</h1>
        <p className="text-sm text-[#2f3437]/60 mt-1">{subtitle}</p>
      </div>

      {usage && pct >= 50 && (
        <div className={`mb-5 flex items-start gap-3 border rounded-lg p-4 ${
          pct >= 90 ? "bg-red-50 border-red-200" : pct >= 75 ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200"
        }`}>
          <span className="text-lg">{pct >= 90 ? "🚫" : pct >= 75 ? "⚠️" : "ℹ️"}</span>
          <p className={`text-sm ${pct >= 90 ? "text-red-700" : pct >= 75 ? "text-amber-700" : "text-blue-700"}`}>
            {pct >= 100
              ? `You've reached your monthly AI usage limit. Resets ${usage.resetsAt}.`
              : `You've used ${Math.round(pct)}% of your monthly AI budget. Resets ${usage.resetsAt}.`}
          </p>
        </div>
      )}

      {isLocked && phase === "upload" ? (
        <div className="bg-white border border-[#2f3437]/10 rounded-lg p-8 text-center">
          <p className="text-2xl mb-3">🚫</p>
          <p className="font-semibold text-[#2f3437] mb-1">Monthly limit reached</p>
          <p className="text-sm text-[#2f3437]/60">
            Your AI usage resets on {usage?.resetsAt}. Come back then to build your next script.
          </p>
        </div>
      ) : phase === "upload" ? (
        <div className="bg-white border border-[#2f3437]/10 rounded-lg p-6">
          <ArcScriptUploadPhase onStartBuilding={handleStartBuilding} isAdmin={isAdmin} />
        </div>
      ) : uploadData ? (
        <div className="bg-white border border-[#2f3437]/10 rounded-lg p-6" style={{ minHeight: "70vh" }}>
          <ArcScriptChatPhase initialData={uploadData} onReset={handleReset} />
        </div>
      ) : null}
    </div>
  );
}
