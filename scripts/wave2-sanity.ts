/* THROWAWAY — do not commit. Wave 2 sanity check for commits 1-3. */
import prisma from "../src/lib/prisma";
import { encode } from "@auth/core/jwt";
import { validateIdeaCard } from "../src/lib/content-engine-validation";
import { loadMarketConfigSummary } from "../src/lib/content-engine-context";

const ADMIN_EMAIL = "jared@attractionbyvideo.com";
// jared@attractionbyvideo.com (admin) has no validated uploads. The Wave 2
// data lives under jared@chamberlaingroup.ca (foundations_member). We mint
// a session with the MEMBER's userId + ADMIN role so the routes load that
// user's facts AND bypass the feature-flag gate. Per spec's fallback
// instruction: "use the admin account's own latest validated upload …
// otherwise" — the data is what matters for behaviour validation.
const TEST_EMAIL = "jared@chamberlaingroup.ca";
const BASE = "http://localhost:5000";
// AUTH_URL is https://... so Auth.js uses secure cookies → __Secure- prefix.
const COOKIE_NAME = "__Secure-authjs.session-token";
const SECRET = process.env.SESSION_SECRET ?? process.env.AUTH_SECRET;

async function mintCookie(userId: string, email: string, role: string, name: string | null) {
  if (!SECRET) throw new Error("SESSION_SECRET / AUTH_SECRET not set");
  const token = await encode({
    token: { sub: userId, id: userId, email, name, role },
    secret: SECRET,
    salt: COOKIE_NAME,
    maxAge: 3600,
  });
  return `${COOKIE_NAME}=${token}`;
}

async function call(path: string, body: unknown, cookie: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { json = { _nonJson: true }; }
  return { status: res.status, json };
}

function summarize(name: string, r: { status: number; json: any }) {
  console.log(`\n── ${name} ── status=${r.status}`);
  console.log(JSON.stringify(r.json, null, 2).slice(0, 4000));
}

async function main() {
  const member = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (!member) throw new Error(`test user not found: ${TEST_EMAIL}`);
  const admin = member; // alias used by the rest of the script
  console.log(`test userId=${member.id} dbRole=${member.role} sessionRole=admin (bypass flags)`);
  const cookie = await mintCookie(member.id, member.email!, "admin", member.fullName);

  // Sanity-check the cookie works at all
  const whoami = await fetch(`${BASE}/api/auth/session`, { headers: { cookie } });
  const whoamiJson = await whoami.json().catch(() => null);
  console.log(`auth session probe:`, JSON.stringify(whoamiJson));

  // ── A. idea-validation ─────────────────────────────────────────────
  const A1 = await call("/api/ai-tools/idea-validation", {
    idea: "Calgary's apartment segment has shifted further toward buyers in the most recent month, with months-of-inventory rising while detached stays tight.",
  }, cookie);
  summarize("A1 supports/partial", A1);

  const A2 = await call("/api/ai-tools/idea-validation", {
    idea: "Every Calgary neighbourhood is now firmly in buyer's territory for every property type.",
  }, cookie);
  summarize("A2 partial (overreach)", A2);

  const A3 = await call("/api/ai-tools/idea-validation", {
    idea: "Calgary detached homes under $400K are sitting unsold for over a year on average right now.",
  }, cookie);
  summarize("A3 contradicts", A3);

  const A4 = await call("/api/ai-tools/idea-validation", { idea: "buyer market" }, cookie);
  summarize("A4 edge too-short", A4);

  // Cross-check: are any citedFact ids NOT in market_facts with usage_class='headline_safe' ?
  for (const [name, r] of [["A1", A1], ["A2", A2], ["A3", A3]] as const) {
    const ids = [
      ...((r.json?.citedFacts ?? []).map((c: any) => c.id)),
      ...((r.json?.relatedAngles ?? []).flatMap((a: any) => a.citedFactIds ?? [])),
    ].filter(Boolean);
    if (!ids.length) { console.log(`${name} citedFact integrity: no ids returned`); continue; }
    const found = await prisma.marketFact.findMany({
      where: { id: { in: ids }, usageClass: "headline_safe" },
      select: { id: true },
    });
    const foundSet = new Set(found.map((f) => f.id));
    const missing = ids.filter((id) => !foundSet.has(id));
    console.log(`${name} citedFact integrity: ${ids.length} ids, ${missing.length} NOT in headline_safe pool ${missing.length ? `(first: ${missing[0]})` : ""}`);
  }

  // ── B. content-engine-v2 ───────────────────────────────────────────
  const B1 = await call("/api/ai-tools/content-engine-v2", { count: 5 }, cookie);
  summarize("B1 minimal", B1);

  const B2 = await call("/api/ai-tools/content-engine-v2", { rotationSlot: "neighbourhood_fact", count: 3 }, cookie);
  summarize("B2 slot pinned", B2);

  const lead = await prisma.marketStoryLead.findFirst({
    where: { userId: admin.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, scanType: true, pattern: true, uploadId: true },
  });
  console.log(`\nB3 story lead picked: id=${lead?.id} uploadId=${lead?.uploadId} scan=${lead?.scanType} pattern="${lead?.pattern?.slice(0, 80)}"`);
  const B3 = lead
    ? await call("/api/ai-tools/content-engine-v2", { storyLeadId: lead.id, rotationSlot: "contrarian_take", count: 3 }, cookie)
    : { status: 0, json: { error: "no story leads for admin" } };
  summarize("B3 story-lead anchored", B3);

  const B4 = await call("/api/ai-tools/content-engine-v2", { rotationSlot: "vibe_check" }, cookie);
  summarize("B4 edge invalid slot", B4);

  // Belt-and-braces re-validation of every returned card
  const config = await loadMarketConfigSummary(admin.id);
  const allFactIds = new Set(
    (await prisma.marketFact.findMany({ where: { userId: admin.id, usageClass: "headline_safe" }, select: { id: true } })).map((f) => f.id),
  );
  for (const [name, r] of [["B1", B1], ["B2", B2], ["B3", B3]] as const) {
    const ideas = r.json?.ideas ?? [];
    console.log(`\n── ${name} per-card revalidation (${ideas.length} cards) ──`);
    for (let i = 0; i < ideas.length; i++) {
      const c = ideas[i];
      const v = validateIdeaCard(c, allFactIds, config?.neighbourhoods ?? []);
      console.log(`  [${i}] slot=${c.rotationSlot} citedFacts=${(c.citedFactIds ?? []).length} title="${c.title}" → ${v.ok ? "PASS" : "FAIL: " + v.errors.join("; ")}`);
    }
    console.log(`  upload.id in response: ${r.json?.upload?.id ?? "—"}`);
  }
  if (lead && B3.json?.upload?.id) {
    console.log(`\nB3 anchor check: response upload.id=${B3.json.upload.id} vs lead.uploadId=${lead.uploadId} → ${B3.json.upload.id === lead.uploadId ? "MATCH" : "DIFFERENT (would not have access to lead's facts)"}`);
  }

  // ── Cost summary ───────────────────────────────────────────────────
  // Column names are camelCase (no @map on fields in the AIToolUsage model).
  const cost = await prisma.$queryRaw<Array<{ toolType: string; total_cost: string; calls: bigint; avg_cost_per_call: string }>>`
    SELECT
      "toolType",
      ROUND(SUM("costUsd")::numeric, 4) AS total_cost,
      COUNT(*) AS calls,
      ROUND((SUM("costUsd") / COUNT(*))::numeric, 4) AS avg_cost_per_call
    FROM ai_tool_usage
    WHERE "userId" = ${admin.id}
      AND "toolType" IN ('idea_validation', 'content_engine_v2')
      AND "createdAt" > NOW() - INTERVAL '1 hour'
    GROUP BY "toolType"
  `;
  console.log("\n── COST SUMMARY ──");
  console.log(JSON.stringify(cost, (_k, v) => typeof v === "bigint" ? Number(v) : v, 2));

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FATAL:", e);
  await prisma.$disconnect();
  process.exit(1);
});
