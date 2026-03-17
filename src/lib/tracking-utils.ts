import prisma from "@/lib/prisma";

const BOT_PATTERNS = [
  "bot", "crawler", "spider", "googlebot", "bingbot", "slurp",
  "duckduckbot", "facebookexternalhit", "twitterbot", "linkedinbot",
  "whatsapp", "telegram",
];

export function isBot(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some((p) => ua.includes(p));
}

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function generateRefCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

export async function generateUniqueRefCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateRefCode();
    const existing = await prisma.trackingLink.findUnique({ where: { refCode: code } });
    if (!existing) return code;
  }
  throw new Error("Failed to generate unique ref code after 10 attempts");
}

const SESSION_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export function generateSessionId(): string {
  let id = "s_";
  for (let i = 0; i < 16; i++) {
    id += SESSION_CHARS[Math.floor(Math.random() * SESSION_CHARS.length)];
  }
  return id;
}

export function extractYoutubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1).split("?")[0] || null;
    }
    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v");
    }
  } catch {
    // ignore
  }
  return null;
}

export function buildTrackedUrl(destinationUrl: string, refCode: string): string {
  const sep = destinationUrl.includes("?") ? "&" : "?";
  return `${destinationUrl}${sep}ref=${refCode}`;
}

export async function geolocateIp(ip: string): Promise<{ city: string | null; province: string | null; country: string | null }> {
  if (!ip || ip === "::1" || ip === "127.0.0.1") {
    return { city: null, province: null, country: null };
  }
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=city,regionName,country,status`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { city: null, province: null, country: null };
    const data = await res.json();
    if (data.status !== "success") return { city: null, province: null, country: null };
    return {
      city: data.city ?? null,
      province: data.regionName ?? null,
      country: data.country ?? null,
    };
  } catch {
    return { city: null, province: null, country: null };
  }
}

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
