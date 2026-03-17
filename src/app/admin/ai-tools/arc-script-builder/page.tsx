"use client";

import ArcScriptBuilderTool from "@/components/ai-tools/ArcScriptBuilderTool";
import PromptEditor from "@/components/ai-tools/PromptEditor";
import { ARC_MASTER_SYSTEM_PROMPT } from "@/lib/arc-script-builder-prompt";

export default function AdminArcScriptBuilderPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <PromptEditor
        toolKey="prompt_arc_script_builder"
        defaultPrompt={ARC_MASTER_SYSTEM_PROMPT}
        placeholders={[
          { key: "{{MEMBER_CONTEXT}}", description: "Auto-injected block with member avatar, content themes, and baseline scores" },
        ]}
      />
      <ArcScriptBuilderTool basePath="/admin/ai-tools" />
    </div>
  );
}
