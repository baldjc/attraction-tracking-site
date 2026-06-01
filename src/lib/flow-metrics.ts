import prisma from "@/lib/prisma";

const PRODUCTION_TIERS = ["production", "growth", "done_with_you"];
const REPURPOSE_TYPES = [
  "repurpose_newsletter",
  "repurpose_linkedin",
  "repurpose_facebook",
  "repurpose_blog",
  "repurpose_postcard",
];
const STATUS_BUCKETS = [
  "Idea",
  "Future Idea",
  "Not Started",
  "Needs Research",
  "Scripted",
  "Ready to Shoot",
  "Filmed",
  "Shooting",
  "Shot - In Post",
  "Editing",
  "Edited",
  "Scheduled",
  "Scheduled on YT",
  "Published",
  "Live on YT",
  "On Hold",
];

export interface MemberFunnelRow {
  userId: string;
  name: string;
  email: string;
  planCount: number;
  scriptedCount: number;
  publishedCount: number;
  repurposedCount: number;
}

export interface WeeklyPoint {
  weekStart: string;
  plansCreated: number;
  plansPublished: number;
  repurposesGenerated: number;
}

export interface FlowMetrics {
  startDate: string;
  endDate: string;
  scriptingVelocityHours: number | null;
  productionVelocityHours: number | null;
  plansByStatus: Array<{ status: string; count: number }>;
  reviewStickinessPct: number;
  repurposeCompletionPct: number;
  campaignAttachmentPct: number;
  totalPlans: number;
  memberFunnel: MemberFunnelRow[];
  weekly: WeeklyPoint[];
  generatedAt: string;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function hoursBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 3_600_000;
}

function startOfWeek(d: Date): Date {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // Monday-start week
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  out.setUTCDate(out.getUTCDate() - diff);
  return out;
}

interface CacheEntry {
  key: string;
  data: FlowMetrics;
  expiresAt: number;
}
const CACHE_TTL_MS = 15 * 60 * 1000;
let cache: CacheEntry | null = null;

export function clearFlowMetricsCache() {
  cache = null;
}

export async function computeFlowMetrics(
  startDate: Date,
  endDate: Date
): Promise<FlowMetrics> {
  const cacheKey = `${startDate.toISOString()}|${endDate.toISOString()}`;
  if (cache && cache.key === cacheKey && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  const plans = await prisma.contentPlan.findMany({
    where: {
      deletedAt: null,
      createdAt: { gte: startDate, lte: endDate },
      user: { serviceTier: { in: PRODUCTION_TIERS as any } },
    },
    select: {
      id: true,
      userId: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      linkedCampaignId: true,
      user: { select: { id: true, fullName: true, email: true } },
    },
  });

  const planIds = plans.map((p) => p.id);

  const artifacts = planIds.length
    ? await prisma.planArtifact.findMany({
        where: {
          planId: { in: planIds },
          type: { in: ["script", "script_review", ...REPURPOSE_TYPES] },
        },
        select: {
          planId: true,
          type: true,
          generatedAt: true,
        },
        orderBy: { generatedAt: "asc" },
      })
    : [];

  const firstScriptByPlan = new Map<string, Date>();
  const planHasReview = new Set<string>();
  const planHasRepurpose = new Set<string>();
  const repurposeCountByPlan = new Map<string, number>();
  let totalRepurposesInRange = 0;

  for (const a of artifacts) {
    if (a.type === "script") {
      if (!firstScriptByPlan.has(a.planId)) firstScriptByPlan.set(a.planId, a.generatedAt);
    } else if (a.type === "script_review") {
      planHasReview.add(a.planId);
    } else if (REPURPOSE_TYPES.includes(a.type)) {
      planHasRepurpose.add(a.planId);
      repurposeCountByPlan.set(a.planId, (repurposeCountByPlan.get(a.planId) ?? 0) + 1);
      if (a.generatedAt >= startDate && a.generatedAt <= endDate) {
        totalRepurposesInRange += 1;
      }
    }
  }

  const scriptingHours: number[] = [];
  const productionHours: number[] = [];
  for (const p of plans) {
    const firstScript = firstScriptByPlan.get(p.id);
    if (firstScript) {
      scriptingHours.push(hoursBetween(p.createdAt, firstScript));
      if (p.status === "Published" || p.status === "Live on YT") {
        productionHours.push(hoursBetween(firstScript, p.updatedAt));
      }
    }
  }

  const statusCounts = new Map<string, number>();
  for (const p of plans) statusCounts.set(p.status, (statusCounts.get(p.status) ?? 0) + 1);
  const plansByStatus = STATUS_BUCKETS
    .map((s) => ({ status: s, count: statusCounts.get(s) ?? 0 }))
    .filter((row) => row.count > 0);
  for (const [status, count] of statusCounts.entries()) {
    if (!STATUS_BUCKETS.includes(status)) plansByStatus.push({ status, count });
  }

  const totalPlans = plans.length;
  const reviewStickinessPct = totalPlans
    ? Math.round((planHasReview.size / totalPlans) * 1000) / 10
    : 0;
  const repurposeCompletionPct = totalPlans
    ? Math.round((planHasRepurpose.size / totalPlans) * 1000) / 10
    : 0;
  const campaignAttachmentPct = totalPlans
    ? Math.round((plans.filter((p) => p.linkedCampaignId).length / totalPlans) * 1000) / 10
    : 0;

  const funnelMap = new Map<string, MemberFunnelRow>();
  for (const p of plans) {
    const u = p.user;
    let row = funnelMap.get(p.userId);
    if (!row) {
      row = {
        userId: p.userId,
        name: u?.fullName ?? u?.email ?? "—",
        email: u?.email ?? "—",
        planCount: 0,
        scriptedCount: 0,
        publishedCount: 0,
        repurposedCount: 0,
      };
      funnelMap.set(p.userId, row);
    }
    row.planCount += 1;
    if (firstScriptByPlan.has(p.id)) row.scriptedCount += 1;
    if (p.status === "Published" || p.status === "Live on YT") row.publishedCount += 1;
    row.repurposedCount += repurposeCountByPlan.get(p.id) ?? 0;
  }
  const memberFunnel = Array.from(funnelMap.values())
    .sort((a, b) => b.planCount - a.planCount)
    .slice(0, 10);

  const weeklyMap = new Map<string, WeeklyPoint>();
  function getBucket(d: Date): WeeklyPoint {
    const key = startOfWeek(d).toISOString().slice(0, 10);
    let b = weeklyMap.get(key);
    if (!b) {
      b = { weekStart: key, plansCreated: 0, plansPublished: 0, repurposesGenerated: 0 };
      weeklyMap.set(key, b);
    }
    return b;
  }
  for (const p of plans) {
    getBucket(p.createdAt).plansCreated += 1;
    if ((p.status === "Published" || p.status === "Live on YT") && p.updatedAt >= startDate && p.updatedAt <= endDate) {
      getBucket(p.updatedAt).plansPublished += 1;
    }
  }
  for (const a of artifacts) {
    if (REPURPOSE_TYPES.includes(a.type) && a.generatedAt >= startDate && a.generatedAt <= endDate) {
      getBucket(a.generatedAt).repurposesGenerated += 1;
    }
  }
  const weekly = Array.from(weeklyMap.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  void totalRepurposesInRange;

  const data: FlowMetrics = {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    scriptingVelocityHours: median(scriptingHours),
    productionVelocityHours: median(productionHours),
    plansByStatus,
    reviewStickinessPct,
    repurposeCompletionPct,
    campaignAttachmentPct,
    totalPlans,
    memberFunnel,
    weekly,
    generatedAt: new Date().toISOString(),
  };

  cache = { key: cacheKey, data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}
