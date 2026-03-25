# Admin Member Analytics Dashboard — Replit Build Guide

## What We're Building

An admin analytics dashboard at `/admin/analytics` that shows:
- **Summary cards** — Videos this week, active/inactive members, link clicks, top lead performer
- **Recent videos section** — Grid of YouTube videos published in the last 7 days with one-click "Run Audit" buttons
- **Member engagement table** — Sortable/filterable table of all members with activity status, scores, tool usage, clicks
- **Member detail drill-down** (`/admin/analytics/members/[id]`) — Deep dive per member: YouTube stats, video list with audit triggers, tool usage breakdown, campaign performance, score history with charts

Data comes from a daily YouTube API poll (7 AM MT) plus manual "Refresh" buttons.

## Important Codebase Patterns to Follow

- **Pages are client components** using `"use client"` with `useEffect` + `fetch()` for data
- **Auth pattern:** `import { auth } from "@/lib/auth"` then `const session = await auth()` + `isAdminOrEditor(role)` + `editorTierFilter(role)` from `@/lib/auth-utils`
- **Prisma import:** `import prisma from "@/lib/prisma"` (default export) or `import { prisma } from "@/lib/prisma"` (named export) — both work
- **Charts:** Recharts (`LineChart`, `BarChart`, `ResponsiveContainer`) — see existing usage in `src/app/admin/members/[id]/page.tsx`
- **Styling:** Tailwind CSS, dark theme (gray-800/gray-700 backgrounds, cyan/emerald accents)
- **Score colours:** Green (emerald) for ≥7, Yellow for 5–6.9, Red for <5
- **Existing audit trigger:** `POST /api/audits/run` expects `{ memberId, auditType, videoId }` — NOT userId/type
- **YouTube API:** Already in `src/lib/youtube.ts` with `getChannelInfo()` and `getLatestLongFormVideos()`
- **Cron pattern:** See `src/app/api/cron/monthly/route.ts` — uses `x-cron-secret` header, `maxDuration = 60`

---

## Build Order

Complete these tasks in order. Each task builds on the previous one.

---

## Task 1: Prisma Schema — Add New Models

**File to modify:** `prisma/schema.prisma`

### 1a. Add YouTubeVideo model

Add after the existing `Conversion` model:

```prisma
model YouTubeVideo {
  id           String   @id @default(uuid())
  userId       String
  videoId      String
  title        String
  publishedAt  DateTime
  thumbnailUrl String?
  viewCount    Int      @default(0)
  likeCount    Int      @default(0)
  commentCount Int      @default(0)
  duration     String?
  discoveredAt DateTime @default(now())
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  audits Audit[]

  @@unique([userId, videoId])
  @@map("youtube_videos")
}
```

### 1b. Add YouTubeChannelSnapshot model

```prisma
model YouTubeChannelSnapshot {
  id              String   @id @default(uuid())
  userId          String
  subscriberCount Int
  totalVideoCount Int
  totalViewCount  BigInt
  snapshotAt      DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("youtube_channel_snapshots")
}
```

### 1c. Add field to User model

```prisma
lastYoutubeSyncAt DateTime? @map("last_youtube_sync_at")
```

### 1d. Add relations to User model

Add to the User model's relations block:

```prisma
youtubeVideos    YouTubeVideo[]
channelSnapshots YouTubeChannelSnapshot[]
```

### 1e. Add FK on Audit model

Add to the `Audit` model:

```prisma
youtubeVideoId String?       @map("youtube_video_id")
youtubeVideo   YouTubeVideo? @relation(fields: [youtubeVideoId], references: [id])
```

### 1f. Run migration

```bash
npx prisma migrate dev --name add_youtube_tables
npx prisma generate
```

### 1g. Commit

```bash
git add prisma/
git commit -m "feat: add YouTubeVideo and YouTubeChannelSnapshot models"
```

---

## Task 2: YouTube Sync Library

### 2a. Extend getChannelInfo in `src/lib/youtube.ts`

The existing `getChannelInfo` function fetches `snippet,brandingSettings,contentDetails`. Extend it to also return statistics.

**In the `ChannelInfo` interface**, add these fields:

```typescript
subscriberCount: number;
totalVideoCount: number;
totalViewCount: number;
```

**In the `getChannelInfo` function**, change the `part` parameter from `snippet,brandingSettings,contentDetails` to `snippet,brandingSettings,contentDetails,statistics`, then add to the return object:

```typescript
subscriberCount: parseInt(channel.statistics?.subscriberCount || "0"),
totalVideoCount: parseInt(channel.statistics?.videoCount || "0"),
totalViewCount: parseInt(channel.statistics?.viewCount || "0"),
```

### 2b. Create `src/lib/youtube-sync.ts`

```typescript
import prisma from "@/lib/prisma";
import { getChannelInfo, getLatestLongFormVideos } from "@/lib/youtube";

interface SyncResult {
  userId: string;
  fullName: string;
  success: boolean;
  newVideos: number;
  error?: string;
}

interface SyncSummary {
  membersPolled: number;
  membersFailed: number;
  newVideosFound: number;
  results: SyncResult[];
}

export async function syncMemberChannel(userId: string): Promise<SyncResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, youtubeChannelUrl: true, youtubeHandle: true },
  });

  if (!user) {
    return { userId, fullName: "Unknown", success: false, newVideos: 0, error: "User not found" };
  }

  const handle = user.youtubeHandle || user.youtubeChannelUrl;
  if (!handle) {
    return { userId, fullName: user.fullName || "Unknown", success: false, newVideos: 0, error: "No YouTube channel linked" };
  }

  try {
    // 1. Get channel info (now includes statistics)
    const channelInfo = await getChannelInfo(handle);
    if (!channelInfo) {
      return { userId, fullName: user.fullName || "Unknown", success: false, newVideos: 0, error: "Channel not found or API error" };
    }

    // 2. Save channel snapshot
    await prisma.youTubeChannelSnapshot.create({
      data: {
        userId: user.id,
        subscriberCount: channelInfo.subscriberCount,
        totalVideoCount: channelInfo.totalVideoCount,
        totalViewCount: channelInfo.totalViewCount,
      },
    });

    // 3. Get recent videos (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const videos = await getLatestLongFormVideos(channelInfo.uploadsPlaylistId, 10, sevenDaysAgo);

    // 4. Upsert videos (thumbnailUrl constructed from videoId — same pattern as channel-videos route)
    let newCount = 0;
    for (const video of videos) {
      const thumbnailUrl = `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;

      const existing = await prisma.youTubeVideo.findUnique({
        where: { userId_videoId: { userId: user.id, videoId: video.videoId } },
      });

      if (existing) {
        await prisma.youTubeVideo.update({
          where: { id: existing.id },
          data: {
            viewCount: video.viewCount,
            title: video.title,
            thumbnailUrl,
          },
        });
      } else {
        await prisma.youTubeVideo.create({
          data: {
            userId: user.id,
            videoId: video.videoId,
            title: video.title,
            publishedAt: new Date(video.uploadDate),
            viewCount: video.viewCount,
            duration: video.duration,
            thumbnailUrl,
          },
        });
        newCount++;
      }
    }

    // 5. Update user sync timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastYoutubeSyncAt: new Date() },
    });

    return { userId: user.id, fullName: user.fullName || "Unknown", success: true, newVideos: newCount };
  } catch (err: any) {
    return { userId, fullName: user.fullName || "Unknown", success: false, newVideos: 0, error: err.message };
  }
}

export async function syncAllChannels(): Promise<SyncSummary> {
  const members = await prisma.user.findMany({
    where: {
      role: { not: "admin" },
      OR: [
        { youtubeHandle: { not: null } },
        { youtubeChannelUrl: { not: null } },
      ],
    },
    select: { id: true },
  });

  const results: SyncResult[] = [];
  for (const member of members) {
    const result = await syncMemberChannel(member.id);
    results.push(result);
  }

  return {
    membersPolled: results.length,
    membersFailed: results.filter((r) => !r.success).length,
    newVideosFound: results.reduce((sum, r) => sum + r.newVideos, 0),
    results,
  };
}
```

### 2c. Commit

```bash
git add src/lib/youtube-sync.ts src/lib/youtube.ts
git commit -m "feat: add YouTube channel sync library"
```

---

## Task 3: Cron Route for Daily Sync

### 3a. Create `src/app/api/cron/youtube-sync/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { syncAllChannels } from "@/lib/youtube-sync";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await syncAllChannels();
    console.log("[youtube-sync cron]", JSON.stringify(summary));
    return NextResponse.json({ success: true, ...summary });
  } catch (err: any) {
    console.error("[youtube-sync cron] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

### 3b. Create or update `vercel.json` in project root

```json
{
  "crons": [
    {
      "path": "/api/cron/youtube-sync",
      "schedule": "0 14 * * *"
    }
  ]
}
```

If `vercel.json` already exists, merge the `crons` array into it.

### 3c. Commit

```bash
git add src/app/api/cron/youtube-sync/ vercel.json
git commit -m "feat: add daily YouTube sync cron route with Vercel config"
```

---

## Task 4: Manual Sync API Route

### 4a. Create `src/app/api/admin/youtube/sync/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminOrEditor } from "@/lib/auth-utils";
import { syncAllChannels, syncMemberChannel } from "@/lib/youtube-sync";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdminOrEditor(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { userId } = body;

    if (userId) {
      const result = await syncMemberChannel(userId);
      return NextResponse.json(result);
    }

    const summary = await syncAllChannels();
    return NextResponse.json(summary);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

### 4b. Commit

```bash
git add src/app/api/admin/youtube/
git commit -m "feat: add manual YouTube sync API route"
```

---

## Task 5: Analytics Dashboard API Route

### 5a. Create `src/app/api/admin/analytics/route.ts`

This is a large file. It serves all the data for the dashboard: summary cards, recent videos, and the member engagement table.

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminOrEditor, editorTierFilter } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdminOrEditor(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tierFilter = editorTierFilter(role);
  const userWhere = tierFilter ? tierFilter : { role: { not: "admin" as const } };

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  // Get all non-admin members
  const members = await prisma.user.findMany({
    where: userWhere,
    select: {
      id: true,
      fullName: true,
      serviceTier: true,
      lastYoutubeSyncAt: true,
      youtubeVideos: {
        where: { publishedAt: { gte: sevenDaysAgo } },
        select: { id: true },
      },
    },
  });

  // Recent videos (last 7 days) with user info and audits
  const recentVideos = await prisma.youTubeVideo.findMany({
    where: {
      publishedAt: { gte: sevenDaysAgo },
      user: userWhere,
    },
    orderBy: { publishedAt: "desc" },
    take: 20,
    include: {
      user: { select: { id: true, fullName: true } },
      audits: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, overallScore: true },
      },
    },
  });

  // Clicks in last 7 days
  const clicksResult = await prisma.click.aggregate({
    where: {
      timestamp: { gte: sevenDaysAgo },
      link: { user: userWhere },
    },
    _count: true,
  });

  // Top lead performer (most conversions in 7 days)
  let topLead: { userId: string; fullName: string; conversions: number } | null = null;
  const conversions = await prisma.conversion.findMany({
    where: {
      timestamp: { gte: sevenDaysAgo },
      click: { link: { user: userWhere } },
    },
    include: { click: { include: { link: { select: { userId: true } } } } },
  });

  if (conversions.length > 0) {
    const byUser: Record<string, number> = {};
    for (const c of conversions) {
      const uid = c.click.link.userId;
      byUser[uid] = (byUser[uid] || 0) + 1;
    }

    const topUserId = Object.entries(byUser).sort((a, b) => b[1] - a[1])[0];
    if (topUserId) {
      const topUser = await prisma.user.findUnique({
        where: { id: topUserId[0] },
        select: { fullName: true },
      });
      topLead = {
        userId: topUserId[0],
        fullName: topUser?.fullName || "Unknown",
        conversions: topUserId[1],
      };
    }
  }

  // Build member engagement table rows
  const memberRows = await Promise.all(
    members.map(async (member) => {
      // Latest video date
      const latestVideo = await prisma.youTubeVideo.findFirst({
        where: { userId: member.id },
        orderBy: { publishedAt: "desc" },
        select: { publishedAt: true },
      });

      // Current score
      const latestAudit = await prisma.audit.findFirst({
        where: { userId: member.id, overallScore: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { overallScore: true },
      });

      // Tool uses (7d)
      const [scripts, titles, analyses, reviews] = await Promise.all([
        prisma.savedScript.count({ where: { userId: member.id, createdAt: { gte: sevenDaysAgo } } }),
        prisma.savedTitle.count({ where: { userId: member.id, createdAt: { gte: sevenDaysAgo } } }),
        prisma.titleAnalysis.count({ where: { userId: member.id, createdAt: { gte: sevenDaysAgo } } }),
        prisma.scriptReview.count({ where: { userId: member.id, createdAt: { gte: sevenDaysAgo } } }),
      ]);
      const toolUses7d = scripts + titles + analyses + reviews;

      // Clicks and conversions (7d)
      const clicks7d = await prisma.click.count({
        where: { link: { userId: member.id }, timestamp: { gte: sevenDaysAgo } },
      });
      const conversions7d = await prisma.conversion.count({
        where: { click: { link: { userId: member.id } }, timestamp: { gte: sevenDaysAgo } },
      });

      // Activity status — check both 7-day and 8-14 day windows
      const lastVideoDate = latestVideo?.publishedAt;
      const hasRecentVideo = member.youtubeVideos.length > 0;
      const hasRecentTool = toolUses7d > 0;
      const hasRecentClicks = clicks7d > 0;

      // Check 8-14 day window for at_risk detection
      const toolUses14d = await Promise.all([
        prisma.savedScript.count({ where: { userId: member.id, createdAt: { gte: fourteenDaysAgo } } }),
        prisma.savedTitle.count({ where: { userId: member.id, createdAt: { gte: fourteenDaysAgo } } }),
        prisma.titleAnalysis.count({ where: { userId: member.id, createdAt: { gte: fourteenDaysAgo } } }),
        prisma.scriptReview.count({ where: { userId: member.id, createdAt: { gte: fourteenDaysAgo } } }),
      ]).then((counts) => counts.reduce((a, b) => a + b, 0));

      const clicks14d = await prisma.click.count({
        where: { link: { userId: member.id }, timestamp: { gte: fourteenDaysAgo } },
      });

      let status = "inactive";
      if (hasRecentVideo || hasRecentTool || hasRecentClicks) {
        status = "active";
      } else if (
        (lastVideoDate && lastVideoDate >= fourteenDaysAgo) ||
        toolUses14d > 0 ||
        clicks14d > 0
      ) {
        status = "at_risk";
      }

      return {
        id: member.id,
        fullName: member.fullName,
        serviceTier: member.serviceTier,
        lastVideoAt: lastVideoDate?.toISOString() || null,
        videos7d: member.youtubeVideos.length,
        currentScore: latestAudit?.overallScore || null,
        toolUses7d,
        clicks7d,
        conversions7d,
        status,
      };
    })
  );

  // Find latest sync time
  const latestSync = members
    .map((m) => m.lastYoutubeSyncAt)
    .filter(Boolean)
    .sort((a, b) => b!.getTime() - a!.getTime())[0];

  // Count active/inactive
  const activeMembers = memberRows.filter((m) => m.status === "active").length;
  const inactiveMembers = memberRows.filter((m) => m.status === "inactive").length;
  const videosThisWeek = memberRows.filter((m) => m.videos7d > 0).length;

  return NextResponse.json({
    cards: {
      videosThisWeek,
      activeMembers,
      inactiveMembers,
      linkClicks7d: clicksResult._count,
      topLead,
    },
    recentVideos,
    members: memberRows,
    lastSyncedAt: latestSync?.toISOString() || null,
  });
}
```

### 5b. Commit

```bash
git add src/app/api/admin/analytics/route.ts
git commit -m "feat: add analytics dashboard API route"
```

---

## Task 6: Member Analytics Detail API Route

### 6a. Create `src/app/api/admin/analytics/members/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminOrEditor } from "@/lib/auth-utils";
import prisma from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdminOrEditor(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // User info
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      youtubeHandle: true,
      youtubeChannelUrl: true,
      serviceTier: true,
      createdAt: true,
      lastYoutubeSyncAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Latest audit score
  const latestAudit = await prisma.audit.findFirst({
    where: { userId: id, overallScore: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { overallScore: true, scores: true },
  });

  // Channel stats (latest + 30 days ago for deltas)
  const latestSnapshot = await prisma.youTubeChannelSnapshot.findFirst({
    where: { userId: id },
    orderBy: { snapshotAt: "desc" },
  });

  const oldSnapshot = await prisma.youTubeChannelSnapshot.findFirst({
    where: { userId: id, snapshotAt: { lte: thirtyDaysAgo } },
    orderBy: { snapshotAt: "desc" },
  });

  const channelStats = latestSnapshot
    ? {
        subscriberCount: latestSnapshot.subscriberCount,
        subscriberChange30d: oldSnapshot
          ? latestSnapshot.subscriberCount - oldSnapshot.subscriberCount
          : null,
        totalViewCount: Number(latestSnapshot.totalViewCount),
        viewChange30d: oldSnapshot
          ? Number(latestSnapshot.totalViewCount) - Number(oldSnapshot.totalViewCount)
          : null,
        videosPerWeek30d: null as number | null,
      }
    : null;

  // Videos (all stored, newest first)
  const videos = await prisma.youTubeVideo.findMany({
    where: { userId: id },
    orderBy: { publishedAt: "desc" },
    include: {
      audits: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, overallScore: true },
      },
    },
  });

  // Publishing consistency (videos in last 30 days / 4.3)
  const videosLast30d = videos.filter(
    (v) => v.publishedAt >= thirtyDaysAgo
  ).length;
  if (channelStats) {
    channelStats.videosPerWeek30d = Math.round((videosLast30d / 4.3) * 10) / 10;
  }

  // Tool usage
  const [scripts7d, scriptsAll, titles7d, titlesAll, analyses7d, analysesAll, reviews7d, reviewsAll] =
    await Promise.all([
      prisma.savedScript.count({ where: { userId: id, createdAt: { gte: sevenDaysAgo } } }),
      prisma.savedScript.count({ where: { userId: id } }),
      prisma.savedTitle.count({ where: { userId: id, createdAt: { gte: sevenDaysAgo } } }),
      prisma.savedTitle.count({ where: { userId: id } }),
      prisma.titleAnalysis.count({ where: { userId: id, createdAt: { gte: sevenDaysAgo } } }),
      prisma.titleAnalysis.count({ where: { userId: id } }),
      prisma.scriptReview.count({ where: { userId: id, createdAt: { gte: sevenDaysAgo } } }),
      prisma.scriptReview.count({ where: { userId: id } }),
    ]);

  // Last used dates per tool
  const [lastScript, lastTitle, lastAnalysis, lastReview] = await Promise.all([
    prisma.savedScript.findFirst({ where: { userId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.savedTitle.findFirst({ where: { userId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.titleAnalysis.findFirst({ where: { userId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.scriptReview.findFirst({ where: { userId: id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  const toolUsage = [
    { tool: "Script Review", uses7d: reviews7d, usesAllTime: reviewsAll, lastUsed: lastReview?.createdAt?.toISOString() || null },
    { tool: "Title Creator", uses7d: titles7d, usesAllTime: titlesAll, lastUsed: lastTitle?.createdAt?.toISOString() || null },
    { tool: "Title/Thumbnail Analyzer", uses7d: analyses7d, usesAllTime: analysesAll, lastUsed: lastAnalysis?.createdAt?.toISOString() || null },
    { tool: "ARC Script Builder", uses7d: scripts7d, usesAllTime: scriptsAll, lastUsed: lastScript?.createdAt?.toISOString() || null },
  ];

  // Campaigns with links and click/conversion counts
  const campaigns = await prisma.campaign.findMany({
    where: { userId: id },
    include: {
      links: {
        include: {
          _count: { select: { clicks: true } },
        },
      },
    },
  });

  const campaignData = await Promise.all(
    campaigns.map(async (campaign) => {
      const linksWithStats = await Promise.all(
        campaign.links.map(async (link) => {
          const clicks7d = await prisma.click.count({
            where: { linkId: link.id, timestamp: { gte: sevenDaysAgo } },
          });
          const conversions7d = await prisma.conversion.count({
            where: { click: { linkId: link.id }, timestamp: { gte: sevenDaysAgo } },
          });
          const conversionsAll = await prisma.conversion.count({
            where: { click: { linkId: link.id } },
          });
          return {
            id: link.id,
            name: link.name,
            destinationUrl: link.destinationUrl,
            clicks7d,
            clicksAllTime: link._count.clicks,
            conversions7d,
            conversionsAllTime: conversionsAll,
          };
        })
      );
      return { id: campaign.id, name: campaign.name, links: linksWithStats };
    })
  );

  // Click trend (last 30 days, aggregated by day)
  const clicks30d = await prisma.click.findMany({
    where: { link: { userId: id }, timestamp: { gte: thirtyDaysAgo } },
    select: { timestamp: true },
    orderBy: { timestamp: "asc" },
  });

  const clickTrend30d: { date: string; clicks: number }[] = [];
  const clicksByDay: Record<string, number> = {};
  for (const click of clicks30d) {
    const day = click.timestamp.toISOString().split("T")[0];
    clicksByDay[day] = (clicksByDay[day] || 0) + 1;
  }
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().split("T")[0];
    clickTrend30d.push({ date: dayStr, clicks: clicksByDay[dayStr] || 0 });
  }

  // Score history
  const audits = await prisma.audit.findMany({
    where: { userId: id, overallScore: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, overallScore: true },
  });
  const scoreHistory = audits.map((a) => ({
    date: a.createdAt.toISOString().split("T")[0],
    overallScore: a.overallScore,
  }));

  // Dimension scores (from latest audit scores JSON)
  let dimensions = null;
  if (latestAudit?.scores && typeof latestAudit.scores === "object") {
    const s = latestAudit.scores as Record<string, any>;
    const avg = (keys: string[]) => {
      const vals = keys.map((k) => s[k]?.score).filter((v) => v != null);
      return vals.length ? Math.round((vals.reduce((a: number, b: number) => a + b, 0) / vals.length) * 10) / 10 : null;
    };

    dimensions = {
      channelStrategy: avg(["avatar_clarity", "themes_over_topics", "consistency"]),
      contentImpact: avg(["arc_attention", "arc_revelation", "arc_connection", "title_frameworks", "approve_the_click"]),
      viewerConnection: avg(["values_peppering", "connection_language", "story_proof", "grade_5_language"]),
      leadGeneration: avg(["lead_magnet_system", "curiosity_bridges"]),
    };
  }

  return NextResponse.json({
    user: {
      id: user.id,
      fullName: user.fullName,
      youtubeHandle: user.youtubeHandle,
      youtubeChannelUrl: user.youtubeChannelUrl,
      serviceTier: user.serviceTier,
      createdAt: user.createdAt.toISOString(),
      lastYoutubeSyncAt: user.lastYoutubeSyncAt?.toISOString() || null,
    },
    currentScore: latestAudit?.overallScore || null,
    channelStats,
    videos,
    toolUsage,
    campaigns: campaignData,
    clickTrend30d,
    scoreHistory,
    dimensions,
  });
}
```

### 6b. Commit

```bash
git add src/app/api/admin/analytics/members/
git commit -m "feat: add member analytics detail API route"
```

---

## Task 7: Analytics Dashboard Page (UI)

### 7a. Replace `src/app/admin/analytics/page.tsx`

This replaces the current placeholder. It's a large client component with summary cards, recent videos grid, and member engagement table.

**Key features:**
- 5 summary cards (Videos This Week, Active Members, Inactive Members, Link Clicks, Top Leads)
- "Refresh All Channels" button with loading state and toast
- Recent videos grid with thumbnails, "Run Audit" / "View Audit" buttons
- Member engagement table with sorting, status filter, service tier filter, and pagination (20 per page)
- All items clickable — videos link to audit, members link to detail page

**IMPORTANT: The "Run Audit" button must send this exact body to `POST /api/audits/run`:**
```typescript
{ memberId: video.user.id, auditType: "single_video", videoId: video.videoId }
```
Do NOT use `userId` or `type` — the existing route expects `memberId` and `auditType`.

**UI patterns to match:**
- `"use client"` directive at top
- `useEffect` + `fetch()` for data loading
- Dark theme: `bg-gray-800` cards, `border-gray-700`, `text-white` headings
- Cyan accent (`bg-cyan-600`, `text-cyan-400`) for primary actions
- Emerald for good scores (≥7), yellow for medium (5–6.9), red for low (<5)
- HeroIcons for card icons: `VideoCameraIcon`, `UserGroupIcon`, `ExclamationTriangleIcon`, `CursorArrowRaysIcon`, `TrophyIcon`, `ArrowPathIcon`

**Status dots:**
- Green (`bg-emerald-400`): active within 7 days
- Yellow (`bg-yellow-400`): 8–14 days inactive (at_risk)
- Red (`bg-red-400`): 15+ days inactive

**Table columns:** Member, Last Video, Videos (7d), Score, Tools (7d), Clicks (7d), Conv. (7d), Status

**Filters:** Status buttons (All / Active / At Risk / Inactive) + Service tier dropdown (All Tiers / Foundations / Editing 2 / Editing 4 / Mastery 2 / Mastery 4)

**Pagination:** Show 20 members per page with Previous/Next buttons and "Showing X–Y of Z" text. Reset page to 1 when filters change.

See the full implementation plan at `docs/superpowers/plans/2026-03-25-admin-member-analytics.md` for the complete component code.

### 7b. Commit

```bash
git add src/app/admin/analytics/page.tsx
git commit -m "feat: build analytics dashboard page with cards, videos, member table"
```

---

## Task 8: Member Analytics Detail Page (UI)

### 8a. Create `src/app/admin/analytics/members/[id]/page.tsx`

Client component showing a deep dive for one member.

**Sections:**
1. **Header** — Name, YouTube handle (linked), service tier badge, member since date, current score (large, colour-coded), "Refresh Channel" button
2. **YouTube Activity** — Subscriber count (+/- 30d), total views (+/- 30d), publishing rate (videos/week), video list with thumbnails + "Run Audit"/"View Audit" buttons
3. **Tool Usage** — Table: Tool name, Uses (7d), Uses (All Time), Last Used
4. **Campaigns & Leads** — Campaign names with links, per-link clicks/conversions (7d + all time), click trend bar chart (30 days, Recharts BarChart)
5. **Score History** — Line chart (Recharts LineChart, 0–10 y-axis), 4 dimension score cards (Channel Strategy, Content Impact, Viewer Connection, Lead Generation)

**IMPORTANT: Same audit trigger pattern as Task 7:**
```typescript
{ memberId: data.user.id, auditType: "single_video", videoId: video.videoId }
```

**Charts:**
- Score history: `LineChart` with `stroke="#3dc3ff"`, `strokeWidth={2.5}`, domain `[0, 10]`
- Click trend: `BarChart` with `fill="#3dc3ff"`, `radius={[2, 2, 0, 0]}`
- Both use dark tooltip styling: `backgroundColor: "#1f2937"`, `border: "1px solid #374151"`

**Tier badge colours:**
- Foundations: `bg-cyan-600/20 text-cyan-400 border-cyan-600/30`
- Editing: `bg-amber-600/20 text-amber-400 border-amber-600/30`
- Mastery: `bg-purple-600/20 text-purple-400 border-purple-600/30`

See the full implementation plan at `docs/superpowers/plans/2026-03-25-admin-member-analytics.md` for the complete component code.

### 8b. Commit

```bash
git add src/app/admin/analytics/members/
git commit -m "feat: build member analytics detail page with YouTube, tools, campaigns, scores"
```

---

## Task 9: Wire Up Audit → YouTubeVideo Linking

The "Run Audit" buttons work with the existing `/api/audits/run` route. But we need to **link the resulting Audit record back to the YouTubeVideo** so the dashboard can show "View Audit" instead of "Run Audit" after it completes.

### 9a. Modify the audit creation flow

Find where `prisma.audit.create()` is called (likely in `src/lib/process-audit-job.ts` or `src/app/api/audits/run/route.ts`). After the audit is created, link it to the YouTubeVideo:

```typescript
// After the audit record is created, link it to the YouTubeVideo if applicable
if (videoId && memberId) {
  const ytVideo = await prisma.youTubeVideo.findUnique({
    where: { userId_videoId: { userId: memberId, videoId } },
  });
  if (ytVideo) {
    await prisma.audit.update({
      where: { id: audit.id },
      data: { youtubeVideoId: ytVideo.id },
    });
  }
}
```

If the audit is created asynchronously via AuditJob, add this linking step in `process-audit-job.ts` after the audit record is created.

### 9b. Commit

```bash
git add src/app/api/audits/ src/lib/
git commit -m "feat: link audits to YouTubeVideo records"
```

---

## Task 10: Test Everything

### Manual Testing Checklist

1. **Run migration** — `npx prisma migrate status` should show all migrations applied
2. **YouTube sync** — Go to `/admin/analytics`, click "Refresh All Channels." Verify toast appears with results.
3. **Summary cards** — Verify all 5 cards show data after sync
4. **Recent videos** — Verify grid shows videos from last 7 days with thumbnails
5. **Run Audit button** — Click "Run Audit" on a video. Verify it starts and eventually shows "View Audit"
6. **Member table** — Verify sorting, status filter, tier filter, and pagination all work
7. **Member detail** — Click a member row. Verify all sections load: YouTube stats, video list, tool usage, campaigns, score chart, dimension scores
8. **Single member refresh** — On detail page, click "Refresh." Verify it syncs just that member.
9. **Cron route** — Test with: `curl -H "x-cron-secret: YOUR_SECRET" http://localhost:3000/api/cron/youtube-sync`

### Final commit

```bash
git add -A
git commit -m "feat: complete admin member analytics dashboard"
```

---

## Reference Files

If you need to check existing patterns:
- **Admin page pattern:** `src/app/admin/members/page.tsx`
- **Admin detail with charts:** `src/app/admin/members/[id]/page.tsx`
- **API route auth pattern:** `src/app/api/audits/route.ts`
- **YouTube API:** `src/lib/youtube.ts`
- **Cron route:** `src/app/api/cron/monthly/route.ts`
- **Auth utils:** `src/lib/auth-utils.ts`
- **Full design spec:** `docs/superpowers/specs/2026-03-25-admin-member-analytics-design.md`
- **Full implementation plan (with complete code):** `docs/superpowers/plans/2026-03-25-admin-member-analytics.md`
