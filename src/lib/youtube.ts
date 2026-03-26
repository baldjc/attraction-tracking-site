const YT_API_KEY = process.env.YOUTUBE_API_KEY!;
const YT_BASE = "https://www.googleapis.com/youtube/v3";

export interface VideoInfo {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  duration: string; // ISO 8601
  durationSeconds: number;
  uploadDate: string;
  viewCount: number;
}

export interface ChannelInfo {
  channelId: string;
  title: string;
  handle: string;
  bannerUrl: string | null;
  thumbnailUrl: string | null;
  uploadsPlaylistId: string;
  subscriberCount: number;
  totalVideoCount: number;
  totalViewCount: number;
}

export interface VideoWithTranscript extends VideoInfo {
  transcript: string | null;
}

// Parse ISO 8601 duration to seconds
export function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] ?? "0");
  const m = parseInt(match[2] ?? "0");
  const s = parseInt(match[3] ?? "0");
  return h * 3600 + m * 60 + s;
}

// Detect if a string looks like a YouTube channel ID (UC followed by 22 base64 chars)
function isChannelId(handle: string): boolean {
  const stripped = handle.startsWith("@") ? handle.slice(1) : handle;
  return /^UC[\w-]{22}$/.test(stripped);
}

export async function getChannelInfo(handle: string): Promise<ChannelInfo> {
  const stripped = handle.startsWith("@") ? handle.slice(1) : handle;

  // Choose the right lookup parameter
  const param = isChannelId(handle)
    ? `id=${encodeURIComponent(stripped)}`
    : `forHandle=${encodeURIComponent(handle.startsWith("@") ? handle : `@${handle}`)}`;

  const url = `${YT_BASE}/channels?part=snippet,brandingSettings,contentDetails,statistics&${param}&key=${YT_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube channels API error: ${res.status}`);
  const data = await res.json();
  const ch = data.items?.[0];
  if (!ch) throw new Error(`Channel not found for: ${handle}`);

  const thumbs = ch.snippet?.thumbnails ?? {};
  const thumbnailUrl = thumbs.medium?.url ?? thumbs.high?.url ?? thumbs.default?.url ?? null;

  return {
    channelId: ch.id,
    title: ch.snippet.title,
    handle: handle.startsWith("@") ? handle : `@${handle}`,
    bannerUrl: ch.brandingSettings?.image?.bannerExternalUrl ?? null,
    thumbnailUrl,
    uploadsPlaylistId: ch.contentDetails.relatedPlaylists.uploads,
    subscriberCount: parseInt(ch.statistics?.subscriberCount || "0"),
    totalVideoCount: parseInt(ch.statistics?.videoCount || "0"),
    totalViewCount: parseInt(ch.statistics?.viewCount || "0"),
  };
}

export async function getTopVideosByViewCount(
  uploadsPlaylistId: string,
  fetchCount = 50,
  returnCount = 5,
  sinceDate?: Date
): Promise<VideoInfo[]> {
  const plUrl = `${YT_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${Math.min(fetchCount, 50)}&key=${YT_API_KEY}`;
  const plRes = await fetch(plUrl);
  if (!plRes.ok) throw new Error(`YouTube playlistItems API error: ${plRes.status}`);
  const plData = await plRes.json();

  const videoIds: string[] = (plData.items ?? [])
    .map((item: any) => item.snippet?.resourceId?.videoId)
    .filter(Boolean);

  if (videoIds.length === 0) return [];

  const vidUrl = `${YT_BASE}/videos?part=snippet,contentDetails,statistics&id=${videoIds.join(",")}&key=${YT_API_KEY}`;
  const vidRes = await fetch(vidUrl);
  if (!vidRes.ok) throw new Error(`YouTube videos API error: ${vidRes.status}`);
  const vidData = await vidRes.json();

  const videos: VideoInfo[] = (vidData.items ?? [])
    .map((v: any) => {
      const durationSec = parseDuration(v.contentDetails?.duration ?? "PT0S");
      const thumbs = v.snippet?.thumbnails ?? {};
      const thumbnailUrl = thumbs.medium?.url ?? thumbs.high?.url ?? thumbs.default?.url ?? null;
      return {
        videoId: v.id,
        title: v.snippet?.title ?? "",
        thumbnailUrl,
        duration: v.contentDetails?.duration ?? "",
        durationSeconds: durationSec,
        uploadDate: v.snippet?.publishedAt ?? "",
        viewCount: parseInt(v.statistics?.viewCount ?? "0"),
      };
    })
    .filter((v: VideoInfo) => v.durationSeconds >= 60)
    .filter((v: VideoInfo) => !sinceDate || new Date(v.uploadDate) >= sinceDate)
    .sort((a: VideoInfo, b: VideoInfo) => b.viewCount - a.viewCount);

  return videos.slice(0, returnCount);
}

export async function getLatestLongFormVideos(
  uploadsPlaylistId: string,
  count = 5,
  sinceDate?: Date
): Promise<VideoInfo[]> {
  // Fetch playlist items
  const plUrl = `${YT_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=15&key=${YT_API_KEY}`;
  const plRes = await fetch(plUrl);
  if (!plRes.ok) throw new Error(`YouTube playlistItems API error: ${plRes.status}`);
  const plData = await plRes.json();

  const videoIds: string[] = (plData.items ?? [])
    .map((item: any) => item.snippet?.resourceId?.videoId)
    .filter(Boolean);

  if (videoIds.length === 0) return [];

  // Fetch full video details
  const vidUrl = `${YT_BASE}/videos?part=snippet,contentDetails,statistics&id=${videoIds.join(",")}&key=${YT_API_KEY}`;
  const vidRes = await fetch(vidUrl);
  if (!vidRes.ok) throw new Error(`YouTube videos API error: ${vidRes.status}`);
  const vidData = await vidRes.json();

  const longForm: VideoInfo[] = (vidData.items ?? [])
    .map((v: any) => {
      const durationSec = parseDuration(v.contentDetails?.duration ?? "PT0S");
      const thumbs = v.snippet?.thumbnails ?? {};
      const thumbnailUrl =
        thumbs.medium?.url ?? thumbs.high?.url ?? thumbs.default?.url ?? null;
      return {
        videoId: v.id,
        title: v.snippet?.title ?? "",
        thumbnailUrl,
        duration: v.contentDetails?.duration ?? "",
        durationSeconds: durationSec,
        uploadDate: v.snippet?.publishedAt ?? "",
        viewCount: parseInt(v.statistics?.viewCount ?? "0"),
      };
    })
    .filter((v: VideoInfo) => v.durationSeconds >= 60) // exclude Shorts
    .filter((v: VideoInfo) => {
      if (!sinceDate) return true;
      return new Date(v.uploadDate) > sinceDate;
    });

  return longForm.slice(0, count);
}

export async function getTranscript(videoId: string): Promise<string | null> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    console.warn("[transcript] SUPADATA_API_KEY not set");
    return null;
  }

  try {
    const res = await fetch(
      `https://api.supadata.ai/v1/youtube/transcript?videoId=${encodeURIComponent(videoId)}&lang=en`,
      { headers: { "x-api-key": apiKey } }
    );

    if (res.status === 206) {
      console.warn(`[transcript] No transcript available for ${videoId} (206 — video may have auto-generated captions disabled)`);
      return null;
    }
    if (res.status === 401) {
      const body = await res.text().catch(() => "");
      console.error(`[transcript] ⛔ SUPADATA_API_KEY is INVALID or EXPIRED — all audits will score 0.5 until fixed. Details: ${body}`);
      return null;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[transcript] Supadata API error ${res.status} for ${videoId}: ${body}`);
      return null;
    }

    const data = await res.json();
    const segments = data.content;
    if (!Array.isArray(segments) || segments.length === 0) return null;

    return segments
      .map((seg: any) => {
        const mins = Math.floor(seg.offset / 60000);
        const secs = Math.floor((seg.offset % 60000) / 1000);
        return `[${mins}:${secs.toString().padStart(2, "0")}] ${seg.text}`;
      })
      .join(" ");
  } catch (err) {
    console.warn(`[transcript] Failed for ${videoId}:`, err);
    return null;
  }
}

export async function getVideoById(videoId: string): Promise<VideoWithTranscript | null> {
  const url = `${YT_BASE}/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${YT_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const v = data.items?.[0];
  if (!v) return null;

  const durationSec = parseDuration(v.contentDetails?.duration ?? "PT0S");
  const transcript = await getTranscript(videoId);
  const thumbs = v.snippet?.thumbnails ?? {};
  const thumbnailUrl = thumbs.medium?.url ?? thumbs.high?.url ?? thumbs.default?.url ?? null;

  return {
    videoId: v.id,
    title: v.snippet?.title ?? "",
    thumbnailUrl,
    duration: v.contentDetails?.duration ?? "",
    durationSeconds: durationSec,
    uploadDate: v.snippet?.publishedAt ?? "",
    viewCount: parseInt(v.statistics?.viewCount ?? "0"),
    transcript,
  };
}

export async function getVideosWithTranscripts(
  uploadsPlaylistId: string,
  count = 5,
  sinceDate?: Date
): Promise<VideoWithTranscript[]> {
  const videos = await getLatestLongFormVideos(uploadsPlaylistId, count, sinceDate);
  const results: VideoWithTranscript[] = [];
  for (const video of videos) {
    const transcript = await getTranscript(video.videoId);
    results.push({ ...video, transcript });
  }
  return results;
}

// ─── Tracking View Count Utilities ───────────────────────────────────────────

export interface TrackingVideoInfo {
  viewCount: number;
  title: string;
  thumbnailUrl: string;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function fetchVideoBatchRaw(
  ids: string[],
  apiKey: string,
  retried = false
): Promise<VideoInfo[]> {
  const url = `${YT_BASE}/videos?part=statistics,snippet&id=${ids.join(",")}&key=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });

  if (res.status === 429) {
    if (retried) throw new Error("YouTube API rate limited after retry");
    console.warn("[youtube] Rate limited (429) — backing off 60s and retrying...");
    await sleep(60_000);
    return fetchVideoBatchRaw(ids, apiKey, true);
  }

  if (!res.ok) throw new Error(`YouTube API error: ${res.status} ${res.statusText}`);
  const data = await res.json();

  return (data.items ?? []).map((v: any) => {
    const thumbs = v.snippet?.thumbnails ?? {};
    const thumbnailUrl = thumbs.medium?.url ?? thumbs.high?.url ?? thumbs.default?.url ?? `https://img.youtube.com/vi/${v.id}/mqdefault.jpg`;
    return {
      videoId: v.id,
      title: v.snippet?.title ?? "",
      thumbnailUrl,
      duration: "",
      durationSeconds: 0,
      uploadDate: "",
      viewCount: parseInt(v.statistics?.viewCount ?? "0", 10),
    };
  });
}

export async function fetchTrackingVideoInfoBatch(
  videoIds: string[]
): Promise<Map<string, TrackingVideoInfo>> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.warn("[youtube] YOUTUBE_API_KEY is not set — skipping view count fetch");
    return new Map();
  }

  const result = new Map<string, TrackingVideoInfo>();
  const BATCH = 50;

  for (let i = 0; i < videoIds.length; i += BATCH) {
    const chunk = videoIds.slice(i, i + BATCH);
    let items: VideoInfo[] = [];
    try {
      items = await fetchVideoBatchRaw(chunk, apiKey);
    } catch (err) {
      console.error("[youtube] Batch fetch failed:", err);
      continue;
    }

    for (const v of items) {
      result.set(v.videoId, {
        viewCount: v.viewCount,
        title: v.title,
        thumbnailUrl: v.thumbnailUrl ?? "",
      });
    }

    // Mark missing IDs
    for (const vid of chunk) {
      if (!result.has(vid)) {
        result.set(vid, { viewCount: 0, title: "", thumbnailUrl: "" });
      }
    }
  }

  return result;
}

export async function fetchSingleTrackingVideoInfo(
  videoId: string
): Promise<TrackingVideoInfo | null> {
  const map = await fetchTrackingVideoInfoBatch([videoId]);
  const info = map.get(videoId);
  if (!info || (!info.title && info.viewCount === 0 && !info.thumbnailUrl)) return null;
  return info;
}
