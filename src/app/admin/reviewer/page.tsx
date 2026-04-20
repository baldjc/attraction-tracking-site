import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";
import { isReviewerEnabled } from "@/lib/reviewer-flag";
import { getChannelInfo } from "@/lib/youtube";
import OverviewSyncAllButton from "./OverviewSyncAllButton";

export const dynamic = "force-dynamic";

interface ChannelCard {
  id: string;
  name: string;
  channelRef: string;
  thumbnailUrl: string | null;
  views28d: number;
  watchTime28d: number;
  cohorts: { newV: number; casual: number; regular: number };
  activePulses: number;
  hasUnderperformingPulse: boolean;
  missingDramaThisMonth: boolean;
  avgGlanceScore: number | null;
}

const MARKET_UPDATE_THEME = "Market Updates";

async function gatherChannels(): Promise<ChannelCard[]> {
  // Source 1: Clients with ownChannelId
  const clients = await prisma.client.findMany({
    where: { ownChannelId: { not: null } },
    select: { id: true, name: true, ownChannelId: true },
  });
  const cards: Array<Omit<ChannelCard, "thumbnailUrl"> & { thumbnailUrl: string | null }> =
    [];
  for (const c of clients) {
    if (!c.ownChannelId) continue;
    cards.push(await buildCard(c.id, c.name, c.ownChannelId));
  }

  // Source 2: Admin users with handles → resolve once
  const admins = await prisma.user.findMany({
    where: {
      role: "admin",
      OR: [
        { youtubeHandle: { not: null } },
        { youtubeChannelUrl: { not: null } },
      ],
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      youtubeHandle: true,
      youtubeChannelUrl: true,
    },
  });
  for (const a of admins) {
    const handle = a.youtubeHandle || a.youtubeChannelUrl;
    if (!handle) continue;
    try {
      const info = await getChannelInfo(handle);
      if (info?.channelId && !cards.some((c) => c.channelRef === info.channelId)) {
        cards.push(
          await buildCard(
            a.id,
            a.fullName || a.email || "Channel",
            info.channelId,
            info.thumbnailUrl ?? null,
          ),
        );
      }
    } catch {
      // ignore
    }
  }

  return cards;
}

async function buildCard(
  id: string,
  name: string,
  channelRef: string,
  thumbnailUrl: string | null = null,
): Promise<ChannelCard> {
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const monthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  const pulseCutoff = new Date(Date.now() - 24 * 3600000);

  const [latestSnap, pulses, latestGlance, planCount] = await Promise.all([
    prisma.channelAnalyticsSnapshot.findFirst({
      where: { channelRef },
      orderBy: { date: "desc" },
    }),
    prisma.pulseSnapshot.findMany({
      where: {
        channelRef,
        OR: [
          { pulseWindowEndsAt: { gte: new Date() } },
          { pulseWindowEndsAt: { gte: pulseCutoff } },
        ],
      },
      select: { performanceRatio: true, baseline: true },
    }),
    prisma.glanceTestResult.findMany({
      where: { channelRef },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { overallScore: true },
    }),
    (async () => {
      const { resolveUsersForChannel } = await import(
        "@/lib/reviewer-channel-resolver"
      );
      const userIds = await resolveUsersForChannel(channelRef);
      if (userIds.length === 0) return { drama: 0 };
      const plans = await prisma.contentPlan.findMany({
        where: {
          userId: { in: userIds },
          publishDate: { gte: monthStart, lt: monthEnd },
        },
        select: { theme: true, dramaMode: true },
      });
      let drama = 0;
      for (const p of plans) {
        if (p.dramaMode && p.theme !== MARKET_UPDATE_THEME) drama += 1;
      }
      return { drama };
    })(),
  ]);

  const newV = latestSnap?.newViewers28d ?? 0;
  const casual = latestSnap?.casualViewers28d ?? 0;
  const regular = latestSnap?.regularViewers28d ?? 0;

  const hasUnderperforming = pulses.some((p) => {
    const sample =
      p.baseline && typeof p.baseline === "object" && "sampleSize" in p.baseline
        ? Number((p.baseline as { sampleSize: number }).sampleSize)
        : 0;
    return p.performanceRatio < 0.75 && !(p.performanceRatio === 0 && sample < 3);
  });

  const avgGlance =
    latestGlance.length === 0
      ? null
      : Math.round(
          latestGlance.reduce((a, g) => a + g.overallScore, 0) /
            latestGlance.length,
        );

  return {
    id,
    name,
    channelRef,
    thumbnailUrl,
    views28d: latestSnap?.views28d ?? 0,
    watchTime28d: latestSnap?.watchTimeMin28d ?? 0,
    cohorts: { newV, casual, regular },
    activePulses: pulses.length,
    hasUnderperformingPulse: hasUnderperforming,
    missingDramaThisMonth: planCount.drama === 0,
    avgGlanceScore: avgGlance,
  };
}

function CohortBar({
  newV,
  casual,
  regular,
}: {
  newV: number;
  casual: number;
  regular: number;
}) {
  const total = newV + casual + regular;
  if (total === 0) {
    return (
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#eaeaea]" />
    );
  }
  const n = (newV / total) * 100;
  const c = (casual / total) * 100;
  const r = (regular / total) * 100;
  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full bg-[#eaeaea]"
      title={`new ${newV} · casual ${casual} · regular ${regular}`}
    >
      <div style={{ width: `${n}%`, backgroundColor: "var(--atbv-warning)" }} />
      <div style={{ width: `${c}%`, backgroundColor: "var(--atbv-primary, #6ba3c7)" }} />
      <div style={{ width: `${r}%`, backgroundColor: "var(--atbv-success)" }} />
    </div>
  );
}

export default async function ReviewerOverviewPage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user || !isAdmin(role ?? "")) {
    redirect("/login");
  }
  if (!(await isReviewerEnabled())) {
    notFound();
  }

  const cards = await gatherChannels();

  const missingDrama = cards.filter((c) => c.missingDramaThisMonth);
  const underperforming = cards.filter((c) => c.hasUnderperformingPulse);
  const lowGlance = cards.filter(
    (c) => c.avgGlanceScore !== null && c.avgGlanceScore < 60,
  );

  return (
    <div className="mx-auto max-w-6xl px-2 py-2">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-[#2f3437] dark:text-white">
            Analytics Reviewer
          </h1>
          <p className="mt-1 text-sm text-[#787774]">
            {cards.length} channel{cards.length === 1 ? "" : "s"} tracked
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/reviewer/settings"
            className="rounded-md border border-[#eaeaea] px-3 py-2 text-sm font-medium text-[#2f3437] hover:bg-[#f7f6f3] dark:border-[#2a2a2a] dark:text-white dark:hover:bg-[#222]"
          >
            Settings
          </Link>
          <OverviewSyncAllButton />
        </div>
      </div>

      {cards.length === 0 ? (
        <p className="rounded-xl border border-[#eaeaea] bg-white p-8 text-center text-sm text-[#787774]">
          No channels tracked yet. Connect YouTube Analytics in Settings, then
          set <code className="font-data">ownChannelId</code> on a Client or add
          a YouTube handle to an admin user.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link
              key={c.channelRef}
              href={`/admin/intelligence/clients/${c.id}/reviewer`}
              className="block rounded-xl border border-[#eaeaea] bg-white p-5 transition-shadow hover:shadow-md dark:border-[#2a2a2a] dark:bg-[#1a1a1a]"
              style={{
                borderRadius: "var(--atbv-radius-lg)",
                boxShadow: "var(--atbv-shadow-sm)",
              }}
            >
              <div className="flex items-center gap-3">
                {c.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.thumbnailUrl}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-[#eaeaea]" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#2f3437] dark:text-white">
                    {c.name}
                  </p>
                  <p className="truncate font-data text-[10px] text-[#787774]">
                    {c.channelRef}
                  </p>
                </div>
                {c.activePulses > 0 && c.hasUnderperformingPulse && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: "var(--atbv-danger)" }}
                    title="Underperforming pulse"
                  />
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[#787774]">28d views</p>
                  <p className="font-semibold text-[#2f3437] dark:text-white">
                    {c.views28d.toLocaleString("en-CA")}
                  </p>
                </div>
                <div>
                  <p className="text-[#787774]">28d watch (min)</p>
                  <p className="font-semibold text-[#2f3437] dark:text-white">
                    {c.watchTime28d.toLocaleString("en-CA")}
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <p className="mb-1 text-[10px] uppercase tracking-wider text-[#787774]">
                  Viewer cohorts
                </p>
                <CohortBar {...c.cohorts} />
              </div>

              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-[#787774]">
                  Active 48h pulses: {c.activePulses}
                </span>
                {c.avgGlanceScore !== null && (
                  <span
                    style={{
                      color:
                        c.avgGlanceScore < 60
                          ? "var(--atbv-danger)"
                          : c.avgGlanceScore < 80
                            ? "var(--atbv-warning)"
                            : "var(--atbv-success)",
                    }}
                    className="font-semibold"
                  >
                    Glance {c.avgGlanceScore}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {(missingDrama.length > 0 ||
        underperforming.length > 0 ||
        lowGlance.length > 0) && (
        <section
          className="mt-8 rounded-xl border border-[#eaeaea] bg-white p-6 dark:border-[#2a2a2a] dark:bg-[#1a1a1a]"
          style={{
            borderRadius: "var(--atbv-radius-lg)",
            boxShadow: "var(--atbv-shadow-sm)",
          }}
        >
          <h2 className="font-display text-lg text-[#2f3437] dark:text-white">
            Issues across all channels
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <IssueGroup
              label="Missing Drama this month"
              channels={missingDrama}
              colourVar="--atbv-danger"
            />
            <IssueGroup
              label="Underperforming pulses"
              channels={underperforming}
              colourVar="--atbv-warning"
            />
            <IssueGroup
              label="Avg glance score < 60"
              channels={lowGlance}
              colourVar="--atbv-warning"
            />
          </div>
        </section>
      )}
    </div>
  );
}

function IssueGroup({
  label,
  channels,
  colourVar,
}: {
  label: string;
  channels: ChannelCard[];
  colourVar: string;
}) {
  return (
    <div>
      <p
        className="mb-2 text-xs font-semibold uppercase tracking-wider"
        style={{ color: `var(${colourVar})` }}
      >
        {label} ({channels.length})
      </p>
      {channels.length === 0 ? (
        <p className="text-xs text-[#787774]">None.</p>
      ) : (
        <ul className="space-y-1">
          {channels.map((c) => (
            <li key={c.channelRef}>
              <Link
                href={`/admin/intelligence/clients/${c.id}/reviewer`}
                className="text-sm text-[#2f3437] hover:underline dark:text-white"
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
