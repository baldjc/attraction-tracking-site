/**
 * Wave 0 — Data-First Rebuild
 *
 * Idempotently appends the v2 feature flags to the `feature_visibility`
 * AppSetting. Existing flags are left untouched. New flags default to closed
 * with an empty allowlist so they're invisible to everyone except admin/editor
 * (who bypass all flags via NextAuth role).
 *
 * Run with: `npx tsx scripts/seed-wave-0-flags.ts`
 */
import prisma from "../src/lib/prisma";
import { FEATURE_SETTING_KEY } from "../src/lib/feature-flags";

type FlagValue = boolean | { enabled?: boolean; allowedUserIds?: string[] };

const WAVE_0_FLAGS: Record<string, { enabled: boolean; allowedUserIds: string[] }> = {
  tool_market_data: { enabled: false, allowedUserIds: [] },
  tool_fact_validator: { enabled: false, allowedUserIds: [] },
  tool_content_engine_v2: { enabled: false, allowedUserIds: [] },
  tool_idea_validation: { enabled: false, allowedUserIds: [] },
  tool_script_builder_v2: { enabled: false, allowedUserIds: [] },
  tool_home_tour_mode: { enabled: false, allowedUserIds: [] },
  nav_v2_hub: { enabled: false, allowedUserIds: [] },
};

async function main() {
  const existing = await prisma.appSetting.findUnique({
    where: { key: FEATURE_SETTING_KEY },
  });

  let current: Record<string, FlagValue> = {};
  if (existing?.value) {
    try {
      current = JSON.parse(existing.value);
    } catch {
      current = {};
    }
  }

  const added: string[] = [];
  const skipped: string[] = [];
  const updated: Record<string, FlagValue> = { ...current };

  for (const [key, value] of Object.entries(WAVE_0_FLAGS)) {
    if (key in updated) {
      skipped.push(key);
    } else {
      updated[key] = value;
      added.push(key);
    }
  }

  await prisma.appSetting.upsert({
    where: { key: FEATURE_SETTING_KEY },
    create: { key: FEATURE_SETTING_KEY, value: JSON.stringify(updated) },
    update: { value: JSON.stringify(updated) },
  });

  console.log("Wave 0 flag seed complete.");
  if (added.length) console.log("  Added:", added.join(", "));
  if (skipped.length) console.log("  Already present (unchanged):", skipped.join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
