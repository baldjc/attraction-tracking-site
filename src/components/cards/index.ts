/**
 * Shared card module — six canonical variants matching the brand mockup
 * (`attached_assets/cards-and-thinking-mockup_1779984545606.html`).
 *
 * Drop-in replacements for the inline per-surface card markup that used
 * to live across Step3IdeaCards, PipelineView, AIToolsHub, BetaCohort,
 * and the Scores page. All six variants share the same hover/active
 * spec: 1px lift, shadow-md, border darken, ink-fill press at 0.98.
 */
export { IdeaCard, type IdeaCardProps, type IntentChip } from "./IdeaCard";
export { PipelineCard, type PipelineCardProps } from "./PipelineCard";
export { ToolCard, type ToolCardProps } from "./ToolCard";
export {
  MemberCard,
  type MemberCardProps,
  type MemberStatusRow,
  type MemberActionButton,
} from "./MemberCard";
export { LessonCard, type LessonCardProps } from "./LessonCard";
export { AuditCard, type AuditCardProps } from "./AuditCard";
export {
  IDEA_THEME_CLASSES,
  PIPELINE_STATUS_CLASSES,
  MEMBER_TIER_AVATAR,
  MEMBER_TIER_PILL,
  AUDIT_TIER_TEXT,
  rotationSlotToThemeKey,
  type IdeaThemeKey,
  type PipelineStatusKey,
  type MemberTierKey,
  type AuditTier,
} from "./types";
