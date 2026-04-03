import prisma from "@/lib/prisma";

export const FEATURE_SETTING_KEY = "feature_visibility";

export interface FeatureFlags {
  campaigns: boolean;
  ai_tools: boolean;
  resources: boolean;
  content_calendar: boolean;
  tool_avatar_architect: boolean;
  tool_content_engine: boolean;
  tool_arc_script_builder: boolean;
  tool_title_analyzer: boolean;
  tool_script_review: boolean;
  tool_repurpose_content: boolean;
  tool_repurpose_newsletter: boolean;
  tool_repurpose_linkedin: boolean;
  tool_repurpose_facebook: boolean;
  tool_repurpose_blog: boolean;
  tool_repurpose_postcard: boolean;
  [key: string]: boolean;
}

export type FeatureKey = keyof FeatureFlags;

export const DEFAULT_FLAGS: FeatureFlags = {
  campaigns: true,
  ai_tools: true,
  resources: true,
  content_calendar: true,
  tool_avatar_architect: true,
  tool_content_engine: true,
  tool_arc_script_builder: true,
  tool_title_analyzer: true,
  tool_script_review: true,
  tool_repurpose_content: true,
  tool_repurpose_newsletter: true,
  tool_repurpose_linkedin: true,
  tool_repurpose_facebook: true,
  tool_repurpose_blog: true,
  tool_repurpose_postcard: true,
};

export async function getFeatureFlags(): Promise<FeatureFlags> {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: FEATURE_SETTING_KEY },
    });
    if (!setting) return { ...DEFAULT_FLAGS };
    const parsed = JSON.parse(setting.value);
    return { ...DEFAULT_FLAGS, ...parsed };
  } catch {
    return { ...DEFAULT_FLAGS };
  }
}
