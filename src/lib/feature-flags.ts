import prisma from "@/lib/prisma";

export const FEATURE_SETTING_KEY = "feature_visibility";

export interface FeatureFlags {
  campaigns: boolean;
  ai_tools: boolean;
  resources: boolean;
  tool_avatar_architect: boolean;
  tool_content_engine: boolean;
  tool_arc_script_builder: boolean;
  tool_title_analyzer: boolean;
  tool_script_review: boolean;
}

export type FeatureKey = keyof FeatureFlags;

export const DEFAULT_FLAGS: FeatureFlags = {
  campaigns: true,
  ai_tools: true,
  resources: true,
  tool_avatar_architect: true,
  tool_content_engine: true,
  tool_arc_script_builder: true,
  tool_title_analyzer: true,
  tool_script_review: true,
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
