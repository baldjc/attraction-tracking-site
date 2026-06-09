// Research Reader (Jarvis) — Step 1 INGEST.
//
// Accepts 1–5 research items a member attached in chat (PDF, pasted text, a
// URL, or a chart/image), extracts the readable text (reusing
// extractTextFromUpload for files; a best-effort fetch+strip for URLs; Claude
// vision for images), and pulls the central thesis + key claims + key stats
// from each. Successful items are persisted as ResearchSource rows and used
// downstream as EXTERNAL cited sources — never as the member's own market data.
//
// Hard rule: an item that can't be read is REPORTED as a failure, never
// silently dropped.

import net from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { extractTextFromUpload } from "@/lib/knowledge-base-parser";

const RESEARCH_MODEL = "claude-sonnet-4-6";

// Caps. Each source's raw text is truncated to PER_SOURCE before extraction;
// once the combined raw text crosses COMBINED, remaining items are reported as
// skipped failures (never silently dropped).
export const MAX_RESEARCH_ITEMS = 5;
const PER_SOURCE_CHAR_CAP = 40_000;
const COMBINED_CHAR_CAP = 120_000;
const URL_FETCH_TIMEOUT_MS = 15_000;
const URL_MAX_BYTES = 5_000_000;

export type ResearchInputType = "pdf" | "text" | "url" | "image";

/** One raw item the member attached, before extraction. */
export interface ResearchInputItem {
  type: ResearchInputType;
  /** For pdf/image inputs. */
  file?: File;
  /** For url inputs. */
  url?: string;
  /** For pasted-text inputs. */
  text?: string;
  /** Optional caller-provided title hint (e.g. the original filename). */
  title?: string;
}

/** The structured payload stored in ResearchSource.extractedClaims. */
export interface ExtractedClaims {
  thesis: string;
  claims: string[];
  stats: string[];
}

/** A successfully ingested + persisted research source. */
export interface IngestedSource {
  id: string;
  title: string;
  type: ResearchInputType;
  sourceRef: string;
  extracted: ExtractedClaims;
}

/** An item that could not be read — surfaced to the member, never dropped. */
export interface IngestFailure {
  type: ResearchInputType;
  sourceRef: string;
  reason: string;
}

export interface IngestResult {
  sources: IngestedSource[];
  failures: IngestFailure[];
}

// ─── Pure helpers (unit-testable, no network) ──────────────────────────────

/**
 * Best-effort HTML → readable text. Drops script/style/noscript/head, strips
 * tags, decodes a handful of common entities, and collapses whitespace. Not a
 * full readability engine — good enough to extract an article's prose, and we
 * report honestly when the result is empty.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|head|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|section|article|h[1-6]|li|br|tr)>/gi, "\n")
    .replace(/<br\s*\/?>(?=)/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, d) => {
      const code = Number(d);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

/** Parsed shape returned by the extraction model. */
export type ExtractionParse =
  | { ok: true; title: string; extracted: ExtractedClaims }
  | { ok: false; reason: string };

/**
 * Parse the strict-JSON extraction response. Tolerates ```json fences and an
 * `{ "unreadable": true }` self-report. Pure — no network — so it can be unit
 * tested against fixed model output.
 */
export function parseExtractionJson(raw: string): ExtractionParse {
  const cleaned = (raw || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { ok: false, reason: "model did not return readable structured output" };
  }

  if (parsed.unreadable === true) {
    const reason =
      typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim()
        : "content could not be read";
    return { ok: false, reason };
  }

  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  const thesis = typeof parsed.thesis === "string" ? parsed.thesis.trim() : "";
  const claims = Array.isArray(parsed.claims)
    ? parsed.claims.filter((c): c is string => typeof c === "string" && c.trim().length > 0).map((c) => c.trim())
    : [];
  const stats = Array.isArray(parsed.stats)
    ? parsed.stats.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim())
    : [];

  if (!thesis && claims.length === 0 && stats.length === 0) {
    return { ok: false, reason: "no claims, statistics, or thesis could be extracted" };
  }

  return {
    ok: true,
    title: title || "Untitled research",
    extracted: { thesis, claims, stats },
  };
}

/**
 * Safely coerce a persisted `ResearchSource.extractedClaims` JSON value back
 * into the `ExtractedClaims` shape. Tolerates rows written before a field
 * existed and any non-conforming JSON (missing/typed-wrong fields → empties).
 */
export function coerceExtractedClaims(raw: unknown): ExtractedClaims {
  const o = (raw ?? {}) as Record<string, unknown>;
  const thesis = typeof o.thesis === "string" ? o.thesis : "";
  const claims = Array.isArray(o.claims)
    ? o.claims.filter((c): c is string => typeof c === "string")
    : [];
  const stats = Array.isArray(o.stats)
    ? o.stats.filter((s): s is string => typeof s === "string")
    : [];
  return { thesis, claims, stats };
}

const EXTRACTION_INSTRUCTIONS = `You are reading ONE external research item (an article, report, press release, or chart) that a real-estate content creator wants to reference in a video. It is third-party / national / external material — NOT the creator's own local market data.

Extract:
- "title": a short title for this source. Use the document's real headline if present; otherwise summarize the topic in <= 10 words.
- "thesis": the central argument in one sentence.
- "claims": the key qualitative claims, each a standalone sentence (max 8).
- "stats": the key statistics, each a standalone sentence that PRESERVES the exact figure and its units/scope (e.g. "U.S. existing-home inventory rose 22% year-over-year in April 2026."). Max 12. Keep numbers exactly as stated; do not invent or round.

Return STRICT JSON only, no prose, no markdown fences:
{"title":"...","thesis":"...","claims":["..."],"stats":["..."]}

If the content is empty, unreadable, or clearly not substantive research, return:
{"unreadable": true, "reason": "<short reason>"}`;

// ─── Model-backed extraction ───────────────────────────────────────────────

function anthropic(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function modelText(resp: Anthropic.Message): string {
  return resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}

async function extractFromText(text: string, titleHint?: string): Promise<ExtractionParse> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "no readable text found" };

  const userMsg =
    (titleHint ? `Source title hint: ${titleHint}\n\n` : "") +
    `Research content:\n\n${trimmed.slice(0, PER_SOURCE_CHAR_CAP)}`;

  const resp = await anthropic().messages.create({
    model: RESEARCH_MODEL,
    max_tokens: 2000,
    system: EXTRACTION_INSTRUCTIONS,
    messages: [{ role: "user", content: userMsg }],
  });
  return parseExtractionJson(modelText(resp));
}

const IMAGE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function imageMediaType(file: File): string | null {
  const t = (file.type || "").toLowerCase();
  if (IMAGE_MEDIA_TYPES.has(t)) return t;
  const name = file.name.toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  return null;
}

async function extractFromImage(file: File, titleHint?: string): Promise<ExtractionParse> {
  const mediaType = imageMediaType(file);
  if (!mediaType) return { ok: false, reason: "unsupported image format (use JPEG, PNG, WebP, or GIF)" };

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const resp = await anthropic().messages.create({
    model: RESEARCH_MODEL,
    max_tokens: 2000,
    system: EXTRACTION_INSTRUCTIONS,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType as "image/jpeg", data: base64 },
          },
          {
            type: "text",
            text:
              (titleHint ? `Source title hint: ${titleHint}\n\n` : "") +
              "Read this chart/image and extract the research as instructed.",
          },
        ],
      },
    ],
  });
  return parseExtractionJson(modelText(resp));
}

const MAX_URL_REDIRECTS = 4;

/**
 * SSRF guard: true when an IP literal belongs to a private/loopback/link-local/
 * reserved range that a member-supplied URL must never be able to reach (cloud
 * metadata at 169.254.169.254, internal services on RFC1918, etc.). Unknown /
 * unparseable addresses are treated as blocked (fail closed).
 */
function isBlockedIp(ip: string): boolean {
  let addr = ip;
  // Unwrap IPv4-mapped IPv6 (e.g. ::ffff:169.254.169.254).
  if (net.isIP(addr) === 6 && addr.toLowerCase().includes("::ffff:")) {
    const tail = addr.slice(addr.lastIndexOf(":") + 1);
    if (net.isIP(tail) === 4) addr = tail;
  }
  const fam = net.isIP(addr);
  if (fam === 4) {
    const [a, b] = addr.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (fam === 6) {
    const lower = addr.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
    return false;
  }
  return true; // unparseable → fail closed
}

/** Resolve a hostname and throw if it (or any of its A/AAAA records) is internal. */
async function assertPublicHost(hostname: string): Promise<void> {
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new Error("the link points to a private or internal address");
    }
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await dnsLookup(hostname, { all: true });
  } catch {
    throw new Error("the link's host could not be resolved");
  }
  if (addrs.length === 0) throw new Error("the link's host could not be resolved");
  for (const a of addrs) {
    if (isBlockedIp(a.address)) {
      throw new Error("the link points to a private or internal address");
    }
  }
}

/**
 * Best-effort fetch + strip of an article URL. Throws on network/HTTP/empty so
 * the caller records a reported failure (never a silent drop). Redirects are
 * followed manually so each hop's resolved IP is re-validated against the SSRF
 * guard (a public URL can otherwise 30x into an internal address).
 */
export async function fetchArticleText(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("not a valid URL");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);
  try {
    let current = parsed;
    let res: Response;
    for (let hop = 0; ; hop++) {
      if (current.protocol !== "http:" && current.protocol !== "https:") {
        throw new Error("only http(s) links are supported");
      }
      await assertPublicHost(current.hostname);
      res = await fetch(current.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: { "user-agent": "Mozilla/5.0 (compatible; AttractionByVideo Research Reader)" },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) throw new Error(`the link returned HTTP ${res.status}`);
        if (hop >= MAX_URL_REDIRECTS) throw new Error("the link redirected too many times");
        current = new URL(loc, current);
        continue;
      }
      break;
    }
    if (!res.ok) throw new Error(`the link returned HTTP ${res.status}`);

    const ctype = (res.headers.get("content-type") || "").toLowerCase();
    const buf = Buffer.from((await res.arrayBuffer()).slice(0, URL_MAX_BYTES));

    if (ctype.includes("application/pdf")) {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      const result = await parser.getText();
      const text = (result?.text ?? "").trim();
      if (!text) {
        throw new Error(
          "the linked PDF has no selectable text — it looks scanned or image-only",
        );
      }
      return text;
    }

    const text = htmlToText(buf.toString("utf8"));
    if (!text) throw new Error("no readable text found at the link");
    return text;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("the link timed out while loading");
    }
    throw err instanceof Error ? err : new Error("failed to load the link");
  } finally {
    clearTimeout(timer);
  }
}

// ─── Top-level ingest ───────────────────────────────────────────────────────

function sourceRefOf(item: ResearchInputItem): string {
  if (item.type === "url") return item.url ?? "(missing url)";
  if (item.file) return item.file.name;
  return item.title ?? "Pasted text";
}

/**
 * Ingest and persist research items for a member. Returns the persisted
 * sources plus a failures list for anything that couldn't be read. Caps the
 * number of items and the combined raw size; over-cap items are reported as
 * failures, not dropped.
 */
export async function ingestResearchItems(args: {
  userId: string;
  threadId: string | null;
  items: ResearchInputItem[];
}): Promise<IngestResult> {
  const { userId, threadId, items } = args;
  const sources: IngestedSource[] = [];
  const failures: IngestFailure[] = [];

  const accepted = items.slice(0, MAX_RESEARCH_ITEMS);
  for (const over of items.slice(MAX_RESEARCH_ITEMS)) {
    failures.push({
      type: over.type,
      sourceRef: sourceRefOf(over),
      reason: `only ${MAX_RESEARCH_ITEMS} research items can be read at once`,
    });
  }

  let combinedChars = 0;

  for (const item of accepted) {
    const sourceRef = sourceRefOf(item);
    try {
      let parse: ExtractionParse;

      if (item.type === "image") {
        if (!item.file) throw new Error("no image file provided");
        parse = await extractFromImage(item.file, item.title);
      } else {
        // Resolve raw text for pdf / text / url.
        let raw: string;
        if (item.type === "url") {
          if (!item.url) throw new Error("no URL provided");
          raw = await fetchArticleText(item.url);
        } else if (item.type === "text") {
          raw = (item.text ?? "").trim();
          if (!raw) throw new Error("pasted text was empty");
        } else {
          if (!item.file) throw new Error("no file provided");
          raw = (await extractTextFromUpload(item.file)).trim();
          if (!raw) {
            const isPdf = item.file.name.toLowerCase().endsWith(".pdf");
            throw new Error(
              isPdf
                ? "this PDF has no selectable text — it looks scanned or image-only. Paste the text, or attach it as an image instead."
                : "no readable text found in the file",
            );
          }
        }

        if (combinedChars >= COMBINED_CHAR_CAP) {
          failures.push({
            type: item.type,
            sourceRef,
            reason: "skipped — combined research size limit reached for this batch",
          });
          continue;
        }
        combinedChars += Math.min(raw.length, PER_SOURCE_CHAR_CAP);
        parse = await extractFromText(raw, item.title);
      }

      if (!parse.ok) {
        failures.push({ type: item.type, sourceRef, reason: parse.reason });
        continue;
      }

      const row = await prisma.researchSource.create({
        data: {
          userId,
          threadId: threadId ?? null,
          title: parse.title,
          type: item.type,
          sourceRef,
          extractedClaims: parse.extracted as unknown as object,
        },
        select: { id: true },
      });

      sources.push({
        id: row.id,
        title: parse.title,
        type: item.type,
        sourceRef,
        extracted: parse.extracted,
      });
    } catch (err) {
      failures.push({
        type: item.type,
        sourceRef,
        reason: err instanceof Error ? err.message : "could not be read",
      });
    }
  }

  return { sources, failures };
}
