/**
 * Jarvis (AI Content Manager) — feature-flag rollout seed.
 *
 * Idempotently sets the `tool_jarvis` flag in the `feature_visibility`
 * AppSetting to the object form `{ enabled: false, allowedUserIds: [...] }`,
 * gating the tool to the two pilot members (Chris Proctor and Phil Martin) and
 * nobody else. Existing flags are left untouched. Admin/editor still bypass all
 * flags via their NextAuth role.
 *
 * Each pilot is resolved by BOTH its known account UUID and its full name; the
 * two lookups must agree on a single account or the script throws. A missing id,
 * a missing/ambiguous name, or an id/name disagreement aborts the seed so we can
 * never silently gate the wrong member.
 *
 * Run with: `npx tsx scripts/seed-jarvis-flag.ts`
 */
import prisma from "../src/lib/prisma";
import { FEATURE_SETTING_KEY } from "../src/lib/feature-flags";

type FlagValue = boolean | { enabled?: boolean; allowedUserIds?: string[] };

// Source-of-truth pilot accounts for the Jarvis wave.
const PILOTS: { fullName: string; id: string }[] = [
  { fullName: "Chris Proctor", id: "1d08f47e-af3e-4b1c-a47c-715d69c77b62" },
  { fullName: "Phil Martin", id: "033acb01-58c9-4783-803d-558aae3c45dd" },
];

async function resolvePilotIds(): Promise<string[]> {
  const ids: string[] = [];
  for (const pilot of PILOTS) {
    // Dual verification: the account must resolve the SAME way by id and by
    // full name. If the id is missing, the name is missing/ambiguous, or the two
    // disagree, fail loudly rather than gate the wrong member.
    const byId = await prisma.user.findUnique({
      where: { id: pilot.id },
      select: { id: true, fullName: true },
    });
    if (!byId) {
      throw new Error(
        `Pilot account ${pilot.fullName} (${pilot.id}) not found by id — refusing to seed a stale allowlist.`,
      );
    }

    const byName = await prisma.user.findMany({
      where: { fullName: pilot.fullName },
      select: { id: true },
    });
    if (byName.length === 0) {
      throw new Error(
        `No member found with full name "${pilot.fullName}" — cannot verify the allowlist by name.`,
      );
    }
    if (byName.length > 1) {
      throw new Error(
        `Full name "${pilot.fullName}" is ambiguous (${byName.length} accounts) — refusing to guess which to gate.`,
      );
    }
    if (byName[0].id !== pilot.id) {
      throw new Error(
        `Name/id disagreement for "${pilot.fullName}": name resolves to ${byName[0].id} but expected ${pilot.id}. Aborting.`,
      );
    }

    console.log(`  ✓ ${pilot.fullName} verified by id + name → ${pilot.id}`);
    ids.push(pilot.id);
  }
  return ids;
}

async function main() {
  const allowedUserIds = await resolvePilotIds();

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

  const updated: Record<string, FlagValue> = {
    ...current,
    tool_jarvis: { enabled: false, allowedUserIds },
  };

  await prisma.appSetting.upsert({
    where: { key: FEATURE_SETTING_KEY },
    create: { key: FEATURE_SETTING_KEY, value: JSON.stringify(updated) },
    update: { value: JSON.stringify(updated) },
  });

  console.log("Jarvis flag seed complete.");
  console.log(`  tool_jarvis = { enabled: false, allowedUserIds: [${allowedUserIds.join(", ")}] }`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
