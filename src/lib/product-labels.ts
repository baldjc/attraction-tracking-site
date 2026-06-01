/**
 * Member-facing product labels — centralized so future renames don't need a
 * global find-replace. Components import from here rather than hardcoding.
 *
 * Note: "AI" remains in technically-accurate contexts (AI-generated content
 * disclosures, the "AI Thinking" loader, internal code/file/API names). This
 * constant only governs the member-facing PRODUCT surface label for the tools
 * hub, which is now "Content Tools".
 */
export const PRODUCT_LABELS = {
  /** The member-facing tools hub label (was "AI Tools"). */
  contentToolsHub: "Content Tools",
  /** User-visible route slug for the hub. */
  contentToolsHubSlug: "content-tools",
  /** The monthly Anthropic allowance, member-facing. */
  monthlyAllowance: "monthly Content Tools",
} as const;

/** Canonical member-facing path for the Content Tools hub. */
export const CONTENT_TOOLS_PATH = "/member/content-tools";
/** Legacy path kept alive via a 301 redirect. */
export const LEGACY_AI_TOOLS_PATH = "/member/ai-tools";
