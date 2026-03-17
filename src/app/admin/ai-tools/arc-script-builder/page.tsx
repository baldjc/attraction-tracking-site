"use client";

import ArcScriptBuilderTool from "@/components/ai-tools/ArcScriptBuilderTool";
import PromptEditor from "@/components/ai-tools/PromptEditor";

export default function AdminArcScriptBuilderPage() {
  return (
    <>
      <PromptEditor
        toolKey="prompt_arc_script_builder"
        defaultPrompt=""
        placeholders={[
          { key: "{{MEMBER_AVATAR}}", description: "Member's avatar name, summary and full profile JSON" },
          { key: "{{CONTENT_THEMES}}", description: "Member's saved content themes" },
          { key: "{{BASELINE_SCORES}}", description: "Member's latest baseline audit scores" },
          { key: "{{RESEARCH_SUMMARY}}", description: "Summarised research brief for this video" },
        ]}
      />
      <ArcScriptBuilderTool basePath="/admin/ai-tools" />
    </>
  );
}
