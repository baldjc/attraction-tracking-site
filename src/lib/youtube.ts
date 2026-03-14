const YT_API_KEY = process.env.YOUTUBE_API_KEY!;
const YT_BASE = "https://www.googleapis.com/youtube/v3";

export interface VideoInfo {
  videoId: string;
  title: string;
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
  uploadsPlaylistId: string;
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

  const url = `${YT_BASE}/channels?part=snippet,brandingSettings,contentDetails&${param}&key=${YT_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube channels API error: ${res.status}`);
  const data = await res.json();
  const ch = data.items?.[0];
  if (!ch) throw new Error(`Channel not found for: ${handle}`);

  return {
    channelId: ch.id,
    title: ch.snippet.title,
    handle: handle.startsWith("@") ? handle : `@${handle}`,
    bannerUrl: ch.brandingSettings?.image?.bannerExternalUrl ?? null,
    uploadsPlaylistId: ch.contentDetails.relatedPlaylists.uploads,
  };
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
      return {
        videoId: v.id,
        title: v.snippet?.title ?? "",
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
  try {
    const { YoutubeTranscript } = await import("youtube-transcript");
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
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

  return {
    videoId: v.id,
    title: v.snippet?.title ?? "",
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
