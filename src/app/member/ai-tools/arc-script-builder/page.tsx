"use client";

import ArcScriptBuilderTool from "@/components/ai-tools/ArcScriptBuilderTool";

export default function MemberArcScriptBuilderPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <ArcScriptBuilderTool basePath="/member/ai-tools" />
    </div>
  );
}
