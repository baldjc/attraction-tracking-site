import { getValidAccessToken } from "@/lib/youtube-oauth";

export interface AnalyticsWindow {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

interface AnalyticsResponse {
  rows?: Array<Array<string | number>>;
  columnHeaders?: Array<{ name: string; columnType: string; dataType: string }>;
}

const BASE = "https://youtubeanalytics.googleapis.com/v2/reports";

async function callAnalytics(
  params: Record<string, string>,
): Promise<AnalyticsResponse> {
  const token = await getValidAccessToken();
  const url = `${BASE}?${new URLSearchParams(params).toString()}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return (await res.json()) as AnalyticsResponse;
    if (res.status === 404) return { rows: [] };
    if (res.status === 429 || res.status === 503) {
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      continue;
    }
    throw new Error(`Analytics API ${res.status}: ${await res.text()}`);
  }
  throw new Error("Analytics API exhausted retries");
}

export async function getChannelMetrics(
  channelId: string,
  window: AnalyticsWindow,
) {
  const data = await callAnalytics({
    ids: `channel==${channelId}`,
    startDate: window.startDate,
    endDate: window.endDate,
    metrics:
      "views,estimatedMinutesWatched,subscribersGained,subscribersLost,averageViewDuration",
  });
  const row = data.rows?.[0] ?? [0, 0, 0, 0, 0];
  return {
    views: Number(row[0]) || 0,
    watchTimeMinutes: Number(row[1]) || 0,
    subsGained: Number(row[2]) || 0,
    subsLost: Number(row[3]) || 0,
    avgViewDuration: Number(row[4]) || 0,
  };
}

export async function getChannelViewerCohorts(
  channelId: string,
  window: AnalyticsWindow,
) {
  // Uses newReturningFromChannel dimension. RETURNING_VIEWERS is approximated
  // as casualViewers; regular-viewer split is not directly available from this
  // endpoint and is left at 0 for now.
  const data = await callAnalytics({
    ids: `channel==${channelId}`,
    startDate: window.startDate,
    endDate: window.endDate,
    metrics: "views",
    dimensions: "newReturningFromChannel",
  });
  let newViewers = 0;
  let casualViewers = 0;
  const regularViewers = 0;
  for (const row of data.rows ?? []) {
    if (row[0] === "NEW_VIEWERS") newViewers = Number(row[1]) || 0;
    else if (row[0] === "RETURNING_VIEWERS")
      casualViewers = Number(row[1]) || 0;
  }
  return { newViewers, casualViewers, regularViewers };
}

export async function getVideoMetrics(
  videoId: string,
  window: AnalyticsWindow,
) {
  const data = await callAnalytics({
    ids: "channel==MINE",
    startDate: window.startDate,
    endDate: window.endDate,
    metrics:
      "views,impressions,impressionClickThroughRate,averageViewDuration,averageViewPercentage,estimatedMinutesWatched",
    filters: `video==${videoId}`,
  });
  const row = data.rows?.[0] ?? [0, 0, 0, 0, 0, 0];
  return {
    views: Number(row[0]) || 0,
    impressions: Number(row[1]) || 0,
    ctr: Number(row[2]) || 0,
    avgViewDuration: Number(row[3]) || 0,
    avgViewPercentage: Number(row[4]) || 0,
    watchTimeMinutes: Number(row[5]) || 0,
  };
}

export async function getVideoRetentionCurve(videoId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
    .toISOString()
    .slice(0, 10);
  const data = await callAnalytics({
    ids: "channel==MINE",
    startDate: thirtyDaysAgo,
    endDate: today,
    metrics: "audienceWatchRatio",
    dimensions: "elapsedVideoTimeRatio",
    filters: `video==${videoId}`,
  });
  return (data.rows ?? []).map((r) => ({
    elapsedRatio: Number(r[0]) || 0,
    retentionRatio: Number(r[1]) || 0,
  }));
}

export async function getVideoTrafficSources(
  videoId: string,
  window: AnalyticsWindow,
) {
  const data = await callAnalytics({
    ids: "channel==MINE",
    startDate: window.startDate,
    endDate: window.endDate,
    metrics: "views",
    dimensions: "insightTrafficSourceType",
    filters: `video==${videoId}`,
  });
  const result = {
    browse: 0,
    suggested: 0,
    search: 0,
    external: 0,
    direct: 0,
    other: 0,
  };
  for (const row of data.rows ?? []) {
    const source = String(row[0]);
    const v = Number(row[1]) || 0;
    if (source === "YT_OTHER_PAGE" || source === "SUBSCRIBER")
      result.browse += v;
    else if (source === "RELATED_VIDEO") result.suggested += v;
    else if (source === "YT_SEARCH") result.search += v;
    else if (source === "EXT_URL") result.external += v;
    else if (source === "NO_LINK_OTHER" || source === "NO_LINK_EMBEDDED")
      result.direct += v;
    else result.other += v;
  }
  return result;
}

export async function getVideoViewerCohorts(
  videoId: string,
  window: AnalyticsWindow,
) {
  const data = await callAnalytics({
    ids: "channel==MINE",
    startDate: window.startDate,
    endDate: window.endDate,
    metrics: "views",
    dimensions: "newReturningFromChannel",
    filters: `video==${videoId}`,
  });
  let newV = 0;
  let casual = 0;
  const regular = 0;
  for (const row of data.rows ?? []) {
    if (row[0] === "NEW_VIEWERS") newV = Number(row[1]) || 0;
    else if (row[0] === "RETURNING_VIEWERS") casual = Number(row[1]) || 0;
  }
  return { new: newV, casual, regular };
}
