"use client";

import { useState, useEffect } from "react";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import ArcScriptUploadPhase from "@/components/ai-tools/ArcScriptUploadPhase";
import ArcScriptChatPhase from "@/components/ai-tools/ArcScriptChatPhase";

interface Props {
  basePath: string;
}

interface UsageData {
  percentUsed: number;
  cap: string;
  totalCost: string;
  resetsAt: string;
}

interface UploadData {
  title: string;
  talkingPoints: string;
  researchSummary: string;
}

function UsageBanner({ percentUsed, resetsAt }: { percentUsed: number; resetsAt: string }) {
  if (percentUsed < 50) return null;

  const isLocked = percentUsed >= 100;
  const isRed = percentUsed >= 90;
  const isAmber = percentUsed >= 75;

  const bg = isLocked || isRed ? "bg-red-50 border-red-200" : isAmber ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200";
  const text = isLocked || isRed ? "text-red-800" : isAmber ? "text-amber-800" : "text-blue-800";
  const sub = isLocked || isRed ? "text-red-600" : isAmber ? "text-amber-600" : "text-blue-600";

  const message = isLocked
    ? "You've reached your monthly AI usage limit. Scripting is locked until the cap resets."
    : isRed
    ? `You've used ${Math.round(percentUsed)}% of your monthly AI budget. Resets ${resetsAt}.`
    : isAmber
    ? `You've used ${Math.round(percentUsed)}% of your monthly AI budget. Consider spacing out your sessions.`
    : `You've used ${Math.round(percentUsed)}% of your monthly AI budget.`;

  return (
    <div className={`mb-5 flex items-start gap-3 border rounded-xl p-4 ${bg}`}>
      <span className="text-lg">{isLocked || isRed ? "🚫" : isAmber ? "⚠️" : "ℹ️"}</span>
      <p className={`text-sm ${sub}`}>{message}</p>
    </div>
  );
}

export default function ArcScriptBuilderTool({ basePath }: Props) {
  const [phase, setPhase] = useState<"upload" | "chat">("upload");
  const [uploadData, setUploadData] = useState<UploadData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);

  useEffect(() => {
    fetch("/api/ai-tools/usage/me")
      .then((r) => r.json())
      .then(setUsage)
      .catch(() => {});
  }, []);

  const isLocked = (usage?.percentUsed ?? 0) >= 100;

  const subtitle =
    phase === "upload"
      ? "Upload your research and set up your video details"
      : "Work through each section with your AI script coach";

  function handleStartBuilding(data: UploadData) {
    setUploadData(data);
    setPhase("chat");
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href={basePath} className="p-1.5 rounded-lg hover:bg-[#1e2a38]/10 transition-colors">
          <ArrowLeftIcon className="w-5 h-5 text-[#1e2a38]/50" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[#1e2a38]">ARC Script Builder</h1>
          <p className="text-sm text-[#1e2a38]/50">{subtitle}</p>
        </div>
      </div>

      {usage && (
        <UsageBanner percentUsed={usage.percentUsed} resetsAt={usage.resetsAt} />
      )}

      {phase === "upload" && (
        <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
          {isLocked ? (
            <div className="text-center py-10 space-y-3">
              <p className="text-4xl">🔒</p>
              <p className="font-semibold text-[#1e2a38]">Monthly limit reached</p>
              <p className="text-sm text-[#1e2a38]/60">
                Your AI usage cap resets on{" "}
                <span className="font-medium">{usage?.resetsAt}</span>.
                Contact support if you need an extension.
              </p>
            </div>
          ) : (
            <ArcScriptUploadPhase onStartBuilding={handleStartBuilding} cap={usage?.cap ? parseFloat(usage.cap) : 15} />
          )}
        </div>
      )}

      {phase === "chat" && uploadData && (
        <ArcScriptChatPhase
          initialData={{
            title: uploadData.title,
            talkingPoints: uploadData.talkingPoints,
            researchSummary: uploadData.researchSummary,
          }}
          onReset={() => {
            setPhase("upload");
            setUploadData(null);
          }}
        />
      )}
    </div>
  );
}
