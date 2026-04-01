"use client";

import ArcScriptBuilderTool from "@/components/ai-tools/ArcScriptBuilderTool";
import ScriptHistoryPanel from "@/components/ai-tools/ScriptHistoryPanel";

export default function MemberArcScriptBuilderPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <ScriptHistoryPanel />
      <ArcScriptBuilderTool basePath="/member/ai-tools" />
    </div>
  );
}
