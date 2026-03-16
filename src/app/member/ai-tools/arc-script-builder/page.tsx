"use client";

import { useState } from "react";
import ArcScriptUploadPhase from "@/components/ai-tools/ArcScriptUploadPhase";
import ArcScriptChatPhase from "@/components/ai-tools/ArcScriptChatPhase";

interface BuildData {
  title: string;
  talkingPoints: string;
  researchSummary: string;
}

export default function ArcScriptBuilderPage() {
  const [phase, setPhase] = useState<"upload" | "building">("upload");
  const [buildData, setBuildData] = useState<BuildData | null>(null);

  function handleStartBuilding(data: BuildData) {
    setBuildData(data);
    setPhase("building");
  }

  function handleReset() {
    setBuildData(null);
    setPhase("upload");
  }

  return (
    <div className="min-h-screen bg-[#f1f1ef]">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1e2a38]">ARC Script Builder</h1>
          <p className="text-sm text-[#1e2a38]/50 mt-1">
            {phase === "upload"
              ? "Add your research and we'll build your script together."
              : `Building: ${buildData?.title}`}
          </p>
        </div>

        {phase === "upload" ? (
          <div className="bg-white rounded-2xl border border-[#1e2a38]/10 p-6 shadow-sm">
            <ArcScriptUploadPhase onStartBuilding={handleStartBuilding} />
          </div>
        ) : buildData ? (
          <div className="bg-white rounded-2xl border border-[#1e2a38]/10 p-6 shadow-sm" style={{ height: "calc(100vh - 200px)", display: "flex", flexDirection: "column" }}>
            <ArcScriptChatPhase initialData={buildData} onReset={handleReset} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
