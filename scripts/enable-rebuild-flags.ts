/**
 * Local-dev helper: turn ON every Sprint 1–8 rebuild flag at once so all of the
 * new content-flow features become visible in the UI.
 *
 * Run with:  npx tsx scripts/enable-rebuild-flags.ts
 *
 * Pass `--off` to flip them all back to the default OFF state.
 */
import prisma from "@/lib/prisma";
import { FEATURE_SETTING_KEY, getFeatureFlags } from "@/lib/feature-flags";

const REBUILD_FLAGS = [
  "plan_artifacts_v1",
  "progress_track_v1",
  "tool_planner_linkage",
  "saved_ideas_page",
  "upgrade_moments",
  "team_pipeline",
  "drive_auto_upload",
  "planner_pipeline_view",
  "flow_metrics",
] as const;

async function main() {
  const off = process.argv.includes("--off");
  const target = !off;

  const current = await getFeatureFlags();
  const next = { ...current };
  for (const k of REBUILD_FLAGS) next[k] = target;

  await prisma.appSetting.upsert({
    where: { key: FEATURE_SETTING_KEY },
    update: { value: JSON.stringify(next) },
    create: { key: FEATURE_SETTING_KEY, value: JSON.stringify(next) },
  });

  console.log(`Rebuild flags set to ${target ? "ON" : "OFF"}:`);
  for (const k of REBUILD_FLAGS) console.log(`  ${k} = ${target}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
