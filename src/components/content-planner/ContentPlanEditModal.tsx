"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { XMarkIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import {
  STATUS_STYLES,
  PRIORITY_OPTIONS,
  getStatusOptions,
  hasEditDueDate,
  hasDriveFolder,
} from "@/lib/content-plan-utils";
import ProgressTrack from "@/components/content-planner/ProgressTrack";
import { resolveProgressSteps, getSuggestedNextStep, type PlanArtifactsByType } from "@/lib/plan-state";
import { buildToolUrl } from "@/lib/tool-handoff";
import MarkdownTextarea from "@/components/MarkdownTextarea";
import { getScoreBadgeClasses } from "@/lib/score-badge";

export interface ContentPlan {
  id: string;
  title: string;
  status: string;
  theme: string | null;
  shootDate: string | null;
  publishDate: string | null;
  editDueDate: string | null;
  priority: string | null;
  notes: string | null;
  script: string | null;
  researchNotes: string | null;
  thumbnailWords: string | null;
  footageLink: string | null;
  driveFolderLink: string | null;
  linkedCampaignId?: string | null;
}

interface ThemeOption {
  name: string;
  emoji?: string | null;
  colour?: string | null;
}

interface Props {
  plan: ContentPlan;
  serviceTier: string;
  apiBase: string;
  isAdmin?: boolean;
  memberId?: string;
  themes?: ThemeOption[];
  showProgressTrack?: boolean;
  onClose: () => void;
  onSaved: (updated: ContentPlan) => void;
  onDeleted?: (id: string) => void;
}

function toDateInput(val: string | null) {
  if (!val) return "";
  return new Date(val).toISOString().slice(0, 10);
}

const TOOL_ROUTES: Partial<Record<string, string>> = {
  script: "/member/ai-tools/arc-script-builder",
  review: "/member/ai-tools/script-review",
  title: "/member/ai-tools/title-thumbnail-analyzer",
  description: "/member/ai-tools/description-generator",
  repurpose: "/member/ai-tools/repurpose-content",
};

const ALL_TOOLS = [
  { key: "script", label: "Build Script", icon: "📝" },
  { key: "review", label: "Script Review", icon: "📋" },
  { key: "title", label: "Title & Thumbnail", icon: "🎯" },
  { key: "description", label: "Description Generator", icon: "✍️" },
  { key: "repurpose", label: "Repurpose Content", icon: "♻️" },
];

export default function ContentPlanEditModal({ plan, serviceTier, apiBase, isAdmin, memberId, themes: themesProp = [], showProgressTrack: showProgressTrackProp = false, onClose, onSaved, onDeleted }: Props) {
  // Self-fetch themes when caller didn't supply any (e.g. opened from Pipeline,
  // auto-open URL link, or other entry points). Falls back to caller-supplied list.
  const [fetchedThemes, setFetchedThemes] = useState<ThemeOption[]>([]);
  const themes = themesProp.length > 0 ? themesProp : fetchedThemes;
  useEffect(() => {
    if (themesProp.length > 0 || isAdmin) return;
    fetch("/api/member/content-plans/themes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.themes) setFetchedThemes(d.themes); })
      .catch(() => {});
  }, [themesProp.length, isAdmin]);

  // Self-fetch the progress-track flag if the caller didn't pass it explicitly
  // so the milestone dots appear regardless of which view opened the modal.
  const [flagShowProgress, setFlagShowProgress] = useState(false);
  const showProgressTrack = showProgressTrackProp || flagShowProgress;
  useEffect(() => {
    if (showProgressTrackProp) return;
    fetch("/api/member/feature-flags")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.flags?.progress_track_v1) setFlagShowProgress(true); })
      .catch(() => {});
  }, [showProgressTrackProp]);

  const router = useRouter();
  const [form, setForm] = useState({
    title: plan.title,
    status: plan.status,
    theme: plan.theme ?? "",
    publishDate: toDateInput(plan.publishDate),
    shootDate: toDateInput(plan.shootDate),
    editDueDate: toDateInput(plan.editDueDate),
    priority: plan.priority ?? "",
    notes: plan.notes ?? "",
    script: plan.script ?? "",
    youtubeDescription: (plan as any).youtubeDescription ?? "",
    researchNotes: plan.researchNotes ?? "",
    thumbnailWords: plan.thumbnailWords ?? "",
    footageLink: plan.footageLink ?? "",
    linkedCampaignId: plan.linkedCampaignId ?? "",
  });
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    // Sprint 3 Part D: load user's campaigns for the lead-magnet linker dropdown.
    // Skipped in admin context (admins use a different campaigns scope).
    if (isAdmin) return;
    fetch("/api/campaigns")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => Array.isArray(d) && setCampaigns(d.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
  }, [isAdmin]);
  const [driveFolderLink, setDriveFolderLink] = useState(plan.driveFolderLink);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderError, setFolderError] = useState("");
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [artifacts, setArtifacts] = useState<PlanArtifactsByType>({});
  const [showAllTools, setShowAllTools] = useState(false);
  const [teamNotes, setTeamNotes] = useState<Array<{ id: string; note: string; createdAt: string; author: { name: string } }>>([]);
  const [driveFiles, setDriveFiles] = useState<Array<{ id: string; name: string; webViewLink: string | null; modifiedTime: string | null; mimeType: string | null }> | null>(null);
  const [driveFilesLoading, setDriveFilesLoading] = useState(false);
  const [avatarData, setAvatarData] = useState<any>(null);
  const [researchPromptCopied, setResearchPromptCopied] = useState(false);
  const [researchPromptError, setResearchPromptError] = useState("");

  useEffect(() => {
    if (isAdmin) return;
    fetch("/api/member/avatar")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setAvatarData(d); })
      .catch(() => {});
  }, [isAdmin]);

  async function generateResearchPrompt() {
    setResearchPromptError("");
    const t = form.title.trim();
    const tp = form.notes.trim();
    if (!t) {
      setResearchPromptError("Add a title first");
      setTimeout(() => setResearchPromptError(""), 2500);
      return;
    }

    const avatarSection = avatarData?.avatarName
      ? `Name: ${avatarData.avatarName}\n${avatarData.full_document || avatarData.avatarSummary || JSON.stringify(avatarData, null, 2)}`
      : "(No avatar saved — write for a general real estate audience.)";

    const themeLine = form.theme ? `Theme / Series: ${form.theme}` : "";
    const publishLine = form.publishDate ? `Planned publish date: ${form.publishDate}` : "";
    const todayLine = `Today's date (for recency of stats): ${new Date().toISOString().slice(0, 10)}`;

    const prompt = `You are a senior real-estate research analyst preparing a deep research brief for a YouTube video. Your job is to gather **specific, verifiable, recent, sourced data** that I can confidently say on camera. Generic advice or vague summaries are not acceptable.

=== VIDEO CONTEXT ===
Title: "${t}"
${themeLine}
${publishLine}
${todayLine}

${tp ? `=== TALKING POINTS / OUTLINE (the spine of the video) ===\n${tp}\n` : "=== TALKING POINTS ===\n(None provided — infer the most important angles from the title and avatar.)\n"}
=== TARGET AVATAR (who is watching) ===
${avatarSection}

=== WHAT I NEED FROM YOU ===
Produce a research brief I can hand to a script writer. For **each talking point above** (or, if none, for the 5–7 strongest sub-topics implied by the title), deliver every section below. Do not skip sections. If a section has no good data, say "no reliable data found" — do not invent.

1. **HARD STATS & DATA (must be sourced)**
   - Specific numbers, percentages, dollar/local-currency amounts, year-over-year deltas, transaction volumes, days-on-market, price-to-income ratios, mortgage/interest rates, inventory counts, absorption rates, etc.
   - Prefer **local market data** for the avatar's city/metro/region; fall back to state/province, then national. Detect the country and region from the avatar and title — this video could be for any realtor in any city in North America (US, Canada, or Mexico).
   - For every figure: include the **source name, date, and a working URL**. Use the most authoritative source for that geography, for example:
     • **Local market** — the local MLS, association of REALTORS®, or real estate board (e.g. CAR/NAR local chapters in the US; CREB, TRREB, REBGV, QPAREB in Canada; AMPI in Mexico).
     • **National market** — NAR, Redfin, Zillow, Realtor.com, FRED, U.S. Census, HUD (US); CREA, CMHC, Statistics Canada (Canada); INEGI, SHF (Mexico).
     • **Rates / macro** — Federal Reserve / Freddie Mac PMMS (US); Bank of Canada (Canada); Banco de México (Mexico).
     • **Policy / regulatory** — state real estate commissions, CFPB, IRS (US); provincial regulators like RECO/RECA/BCFSA, CRA (Canada); CONDUSEF, CNBV (Mexico).
   - Distinguish "as of [date]" from older data. Flag anything older than 12 months as "dated — use with caution."

2. **MARKET CONTEXT & RECENT NEWS (last 6–12 months)**
   - What has changed recently in this specific market that makes this video timely? Central bank rate moves, policy or tax changes (e.g. NAR commission settlement, state/provincial transfer-tax updates, first-time buyer programs, zoning reform, rent control, foreign buyer rules), new lending products, headline transactions or local development news.
   - Each item with date + source URL, and note whether it is local, regional, or national.

3. **MAIN ARGUMENT & UNIQUE ANGLE**
   - The single sharpest thesis the data supports. What contrarian, counter-intuitive, or under-told point can I credibly make?
   - Why this angle wins for *this* avatar specifically.

4. **AVATAR PAIN POINTS, FEARS & DESIRES**
   - The internal monologue of the avatar on this topic — fears, frustrations, secret hopes, money worries, status concerns, family pressure.
   - Tie each pain point to a specific stat or quote above so it lands with proof.

5. **MYTHS & MISCONCEPTIONS TO BUST**
   - What "common knowledge" is wrong or incomplete on this topic? State the myth, then the counter-truth with a source.

6. **CONVENTIONAL WISDOM (what other agents / mainstream media are saying)**
   - 3–5 representative takes from competing voices (other Realtors on YouTube, big brokerages, news outlets, banks). Quote or paraphrase + link.
   - This is so I can position *against* the noise, not repeat it.

7. **CONCRETE EXAMPLES, CASE STUDIES & MICRO-STORIES**
   - Real (or realistic, clearly hypothetical) buyer/seller scenarios with numbers — list price vs sold price, carrying costs, bidding-war outcomes, rent vs buy math, mortgage stress-test pass/fail examples.
   - Anonymised is fine; specificity is the point.

8. **VISUAL / B-ROLL & ON-SCREEN DATA SUGGESTIONS**
   - Charts, graphs, screenshots, headlines, neighbourhood shots, or props that would visualise the strongest points. Note which stat each visual supports.

9. **NOTABLE QUOTES & PHRASINGS**
   - Standout lines from analysts, economists, agents, or buyers/sellers worth quoting verbatim. Include attribution + source.

10. **OPEN QUESTIONS / GAPS**
    - What couldn't you find? What should the agent verify locally before recording (e.g., this week's local board stats, current rate sheets)?

=== OUTPUT FORMAT ===
- Markdown, with one ## H2 per talking point and the 10 numbered sections above as ### H3s under each.
- Every stat on its own bullet with: \`figure — short context — Source Name, Date — URL\`.
- Be concise, but complete. No fluff, no filler intros, no closing summary. Just the brief.
- If something is uncertain, say so explicitly. Never fabricate sources or numbers.`;

    try {
      await navigator.clipboard.writeText(prompt);
      setResearchPromptCopied(true);
      setTimeout(() => setResearchPromptCopied(false), 2500);
    } catch {
      setResearchPromptError("Could not copy");
      setTimeout(() => setResearchPromptError(""), 2500);
    }
  }

  useEffect(() => {
    if (!showProgressTrack) return;
    fetch(`/api/member/content-plans/${plan.id}/artifacts`)
      .then((r) => r.json())
      .then((d) => { if (d?.artifacts) setArtifacts(d.artifacts); })
      .catch(() => {});
  }, [plan.id, showProgressTrack]);

  useEffect(() => {
    if (isAdmin) return;
    fetch(`/api/member/content-plans/${plan.id}/team-notes`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.notes) setTeamNotes(d.notes); })
      .catch(() => {});
  }, [plan.id, isAdmin]);

  // Sprint 6 — fetch Drive folder contents when a folder exists. API returns
  // an empty list when the drive_auto_upload flag is off, which transparently
  // collapses the section.
  useEffect(() => {
    if (!driveFolderLink) { setDriveFiles(null); return; }
    setDriveFilesLoading(true);
    fetch(`/api/member/content-plans/${plan.id}/drive-files`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setDriveFiles(d.files ?? []); })
      .catch(() => {})
      .finally(() => setDriveFilesLoading(false));
  }, [plan.id, driveFolderLink]);

  // Sprint 3 Part A: extract latest script_review score for badge display
  const latestReviewScore = (() => {
    const review = artifacts?.script_review?.[0];
    if (!review) return null;
    const meta = (review.metadata ?? {}) as { overallScore?: number | null };
    const score = typeof meta.overallScore === "number" ? meta.overallScore : null;
    return score;
  })();

  // Seed the appropriate sessionStorage prefill for a given tool key so the
  // destination tool can pick up title / notes / script as expected. Used by
  // every launch point in the modal — inline field buttons, the progress
  // track's "Suggested next" link, and the "All tools for this plan" grid —
  // so the hand-off works no matter which entry the user clicks.
  function seedToolPrefill(key: string) {
    if (typeof window === "undefined") return;
    if (key === "script") {
      const talkingPoints = form.notes.split("\n").map((l) => l.trim()).filter(Boolean);
      sessionStorage.setItem(
        "arc_prefill",
        JSON.stringify({ planId: plan.id, title: form.title, talkingPoints })
      );
    } else if (key === "title") {
      sessionStorage.setItem(
        "title_prefill",
        JSON.stringify({ planId: plan.id, title: form.title })
      );
    } else if (key === "review") {
      sessionStorage.setItem(
        "script_review_prefill",
        JSON.stringify({ planId: plan.id, title: form.title, script: form.script })
      );
    } else if (key === "description") {
      sessionStorage.setItem(
        "description_prefill",
        JSON.stringify({ title: form.title, transcript: form.script, contentPlanId: plan.id })
      );
    }
  }

  function launchTool(key: string) {
    const route = TOOL_ROUTES[key];
    if (!route) return;
    seedToolPrefill(key);
    router.push(buildToolUrl(route, { planId: plan.id, returnTo: "/member/content-planner" }));
  }

  function handleStepClick(key: string) {
    launchTool(key);
  }

  const progressSteps = showProgressTrack
    ? resolveProgressSteps({ id: plan.id, status: form.status, script: form.script }, artifacts, handleStepClick)
    : [];
  const suggestedNext = showProgressTrack ? getSuggestedNextStep(progressSteps) : null;

  const showEditDue = hasEditDueDate(serviceTier);
  const useDrive = hasDriveFolder(serviceTier);
  const statusOptions = getStatusOptions(serviceTier);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSave(): Promise<boolean> {
    if (!form.title.trim()) { setError("Title is required."); return false; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          status: form.status,
          theme: form.theme || null,
          publishDate: form.publishDate || null,
          shootDate: form.shootDate || null,
          editDueDate: form.editDueDate || null,
          priority: form.priority || null,
          notes: form.notes || null,
          script: form.script || null,
          youtubeDescription: form.youtubeDescription || null,
          researchNotes: form.researchNotes || null,
          thumbnailWords: form.thumbnailWords || null,
          footageLink: form.footageLink || null,
          linkedCampaignId: form.linkedCampaignId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      if (data.plan?.driveFolderLink) setDriveFolderLink(data.plan.driveFolderLink);
      onSaved(data.plan);
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Backdrop click → auto-save then close. If the save fails (e.g. missing
  // required title), keep the modal open and surface the error instead of
  // silently discarding the user's edits.
  async function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return; // ignore clicks bubbling from the panel
    if (saving) return;
    const ok = await handleSave();
    if (ok) onClose();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`${apiBase}/${plan.id}`, { method: "DELETE" });
      onDeleted?.(plan.id);
      onClose();
    } catch { setError("Failed to delete"); } finally {
      setDeleting(false);
    }
  }

  async function handleCreateFolder() {
    setCreatingFolder(true);
    setFolderError("");
    try {
      const mid = memberId ?? apiBase.match(/members\/([^/]+)/)?.[1];
      if (!mid) throw new Error("Cannot determine member ID");
      const res = await fetch(`/api/admin/members/${mid}/content-plans/${plan.id}/drive-folder`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create folder");
      setDriveFolderLink(data.driveFolderLink);
    } catch (e: unknown) {
      setFolderError(e instanceof Error ? e.message : "Failed to create folder");
    } finally {
      setCreatingFolder(false);
    }
  }

  const field = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30";

  function pushToAITool(tool: "title" | "script-builder" | "script-review") {
    // Delegate to the unified launcher so prefill seeding stays in one place.
    if (tool === "title") launchTool("title");
    else if (tool === "script-builder") launchTool("script");
    else launchTool("review");
  }

  function downloadScript(format: "md" | "txt" | "pdf") {
    setShowDownloadMenu(false);
    const title = form.title || "script";
    const script = form.script || "";
    const safeName = title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

    if (format === "md") {
      const content = `# ${title}\n\n${script}`;
      const blob = new Blob([content], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${safeName}.md`; a.click();
      URL.revokeObjectURL(url);
    } else if (format === "txt") {
      const content = `${title}\n${"=".repeat(title.length)}\n\n${script}`;
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${safeName}.txt`; a.click();
      URL.revokeObjectURL(url);
    } else {
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>
        body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.7; }
        h1 { font-size: 1.6rem; margin-bottom: 1.5rem; border-bottom: 2px solid #eee; padding-bottom: 0.5rem; }
        pre { white-space: pre-wrap; word-break: break-word; font-family: inherit; font-size: 1rem; margin: 0; }
        @media print { body { margin: 20px; } }
      </style></head><body><h1>${title}</h1><pre>${script.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre></body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); }, 300);
    }
  }

  return (
    <div onClick={handleBackdropClick} className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto lg:pl-[260px]">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg lg:max-w-3xl xl:max-w-4xl my-8">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-[#2f3437]">Edit Video</h3>
          <button onClick={onClose} className="text-[#2f3437]/40 hover:text-[#2f3437]">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {driveFolderLink && driveFiles && driveFiles.length > 0 && (
            <div className="rounded-xl border border-[#10B981]/25 bg-[#10B981]/5 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-[#10B981]">📁 Project Folder</p>
                <a href={driveFolderLink} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-[#10B981] hover:underline">Open in Drive →</a>
              </div>
              <ul className="space-y-1">
                {driveFiles.map((f) => (
                  <li key={f.id} className="text-xs text-[#2f3437]/80 flex items-center justify-between gap-2">
                    <a
                      href={f.webViewLink ?? driveFolderLink}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate hover:text-[#10B981] hover:underline"
                      title={f.name}
                    >📄 {f.name}</a>
                    {f.modifiedTime && (
                      <span className="text-[10px] text-[#2f3437]/40 shrink-0">{new Date(f.modifiedTime).toLocaleDateString()}</span>
                    )}
                  </li>
                ))}
              </ul>
              {driveFilesLoading && <p className="text-[10px] text-[#2f3437]/40 italic">Refreshing…</p>}
            </div>
          )}

          {!isAdmin && teamNotes.length > 0 && (
            <div className="rounded-xl border border-[#6ba3c7]/25 bg-[#6ba3c7]/5 px-4 py-3 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-[#6ba3c7]">📝 Notes from your team</p>
              <ul className="space-y-2">
                {teamNotes.map((n) => (
                  <li key={n.id} className="text-sm text-[#2f3437]">
                    <p className="whitespace-pre-wrap leading-relaxed">{n.note}</p>
                    <p className="text-[11px] text-[#2f3437]/50 mt-0.5">
                      {n.author.name} · {new Date(n.createdAt).toLocaleDateString()}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showProgressTrack && progressSteps.length > 0 && (
            <div className="rounded-xl border border-gray-100 bg-[#f7f6f3] px-4 pt-4 pb-3 space-y-3">
              <ProgressTrack steps={progressSteps} />

              {suggestedNext && TOOL_ROUTES[suggestedNext.key] && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#2f3437]/50">Suggested next:</span>
                  <button
                    type="button"
                    onClick={() => launchTool(suggestedNext.key)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#6ba3c7] hover:bg-[#5a92b6] px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {ALL_TOOLS.find((t) => t.key === suggestedNext.key)?.icon}{" "}
                    {ALL_TOOLS.find((t) => t.key === suggestedNext.key)?.label} →
                  </button>
                </div>
              )}

              <div>
                <button
                  type="button"
                  onClick={() => setShowAllTools((v) => !v)}
                  className="text-[10px] text-[#2f3437]/40 hover:text-[#6ba3c7] transition-colors"
                >
                  {showAllTools ? "Hide tools ▲" : "All tools for this plan ▼"}
                </button>
                {showAllTools && (
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {ALL_TOOLS.map((tool) => (
                      <button
                        key={tool.key}
                        type="button"
                        onClick={() => launchTool(tool.key)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[#2f3437]/70 bg-white border border-gray-200 rounded-lg hover:border-[#6ba3c7] hover:text-[#6ba3c7] transition-colors"
                      >
                        <span>{tool.icon}</span>
                        <span>{tool.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
            {/* LEFT COLUMN: metadata, dates, notes */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-[#2f3437]/60 flex items-center gap-2">
                    Title
                    {latestReviewScore !== null && (
                      <span
                        title="Latest Script Review score"
                        className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded ${getScoreBadgeClasses(latestReviewScore)}`}
                      >
                        Review {latestReviewScore.toFixed(1)}/10
                      </span>
                    )}
                  </label>
                  {!showProgressTrack && (
                    <button type="button" onClick={() => pushToAITool("title")} className="text-xs text-[#6ba3c7] hover:underline">Analyse Title →</button>
                  )}
                </div>
                <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={field} />
                <p className={`text-xs mt-1 text-right ${form.title.length > 80 ? "text-red-500" : form.title.length > 60 ? "text-amber-500" : "text-[#2f3437]/40"}`}>
                  {form.title.length} / 60
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={field}>
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Priority</label>
                  <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className={field}>
                    <option value="">—</option>
                    {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div className={`grid gap-3 ${showEditDue ? "grid-cols-3" : "grid-cols-2"}`}>
                <div>
                  <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Shoot Date</label>
                  <input type="date" value={form.shootDate} onChange={(e) => setForm((f) => ({ ...f, shootDate: e.target.value }))} className={field} />
                </div>
                {showEditDue && (
                  <div>
                    <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Edit Due Date</label>
                    <input type="date" value={form.editDueDate} onChange={(e) => setForm((f) => ({ ...f, editDueDate: e.target.value }))} className={field} />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Publish Date</label>
                  <input type="date" value={form.publishDate} onChange={(e) => setForm((f) => ({ ...f, publishDate: e.target.value }))} className={field} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-[#2f3437]/60">Talking Points / Outline of Video</label>
                  {!showProgressTrack && (
                    <button type="button" onClick={() => pushToAITool("script-builder")} className="text-xs text-[#6ba3c7] hover:underline">Build Script →</button>
                  )}
                </div>
                <MarkdownTextarea
                  value={form.notes}
                  onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
                  rows={5}
                  className={field}
                  placeholder="Key details, action items…"
                  ariaLabel="Talking Points"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-[#2f3437]/60">
                    Research Notes
                    <span className="ml-1 font-normal text-[#2f3437]/40">(paste notes, stats, talking points)</span>
                  </label>
                  <button
                    type="button"
                    onClick={generateResearchPrompt}
                    className="text-xs text-[#6ba3c7] hover:underline disabled:opacity-50"
                    title="Build a deep-research prompt from this video's title, talking points, and your avatar — copies to clipboard so you can paste into Manus / Perplexity / ChatGPT"
                  >
                    {researchPromptCopied
                      ? "Copied — paste into Manus / Perplexity"
                      : researchPromptError
                      ? researchPromptError
                      : "Generate Research Prompt →"}
                  </button>
                </div>
                <MarkdownTextarea
                  value={form.researchNotes}
                  onChange={(v) => setForm((f) => ({ ...f, researchNotes: v }))}
                  rows={5}
                  className={field}
                  placeholder="Paste your research here — statistics, sources, talking points, Manus/Perplexity output…"
                  ariaLabel="Research Notes"
                />
              </div>

              {!isAdmin && (
                <div>
                  <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">
                    Lead Magnet Campaign
                    <span className="ml-1 font-normal text-[#2f3437]/40">(preselects this campaign in the Description Generator)</span>
                  </label>
                  <select
                    value={form.linkedCampaignId}
                    onChange={(e) => setForm((f) => ({ ...f, linkedCampaignId: e.target.value }))}
                    className={field}
                  >
                    <option value="">— None —</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {!useDrive && (
                <div>
                  <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Footage Link</label>
                  <input type="text" value={form.footageLink} onChange={(e) => setForm((f) => ({ ...f, footageLink: e.target.value }))} className={field} placeholder="https://…" />
                </div>
              )}

              {useDrive && (
                <div>
                  <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Google Drive Folder</label>
              {driveFolderLink ? (
                <a
                  href={driveFolderLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-[#6ba3c7] bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors w-full truncate"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                  </svg>
                  Open Drive Folder
                </a>
              ) : isAdmin ? (
                <div>
                  <button
                    type="button"
                    onClick={handleCreateFolder}
                    disabled={creatingFolder}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-[#2f3437]/70 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                    </svg>
                    {creatingFolder ? "Creating folder…" : "Create Drive Folder"}
                  </button>
                  {folderError && <p className="text-xs text-red-600 mt-1">{folderError}</p>}
                </div>
              ) : (
                <p className="text-xs text-[#2f3437]/50 italic">Your folder will be created automatically when the status is set to Ready to Shoot, Shooting, or Shot - In Post.</p>
              )}
            </div>
          )}

            </div>

            {/* RIGHT COLUMN: theme, script, description, thumbnail */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Theme</label>
                {themes.length > 0 ? (
                  <select value={form.theme} onChange={(e) => setForm((f) => ({ ...f, theme: e.target.value }))} className={field}>
                    <option value="">— none —</option>
                    {themes.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.emoji ? `${t.emoji} ${t.name}` : t.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input type="text" value={form.theme} onChange={(e) => setForm((f) => ({ ...f, theme: e.target.value }))} className={field} placeholder="e.g., Neighbourhood Expertise" />
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-[#2f3437]/60">Script</label>
                  {!showProgressTrack && (
                    <button type="button" onClick={() => pushToAITool("script-review")} className="text-xs text-[#6ba3c7] hover:underline">Script Review →</button>
                  )}
                </div>
                <MarkdownTextarea
                  value={form.script}
                  onChange={(v) => setForm((f) => ({ ...f, script: v }))}
                  rows={18}
                  className={field}
                  placeholder="Write your video script here…"
                  ariaLabel="Script"
                />
                {form.script.trim() && (
                  <div className="relative mt-1.5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowDownloadMenu((v) => !v)}
                      className="flex items-center gap-1.5 text-xs text-[#2f3437]/50 hover:text-[#6ba3c7] transition-colors"
                    >
                      <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                      Download Script
                    </button>
                    {showDownloadMenu && (
                      <div className="absolute right-0 top-6 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[130px]">
                        {(["md", "txt", "pdf"] as const).map((fmt) => (
                          <button
                            key={fmt}
                            type="button"
                            onClick={() => downloadScript(fmt)}
                            className="w-full text-left px-3 py-1.5 text-xs text-[#2f3437] hover:bg-gray-50 transition-colors"
                          >
                            .{fmt}{fmt === "pdf" ? " (print)" : ""}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-[#2f3437]/60">YouTube Description</label>
                  {!form.youtubeDescription && form.script && (
                    <button
                      type="button"
                      onClick={() => {
                        sessionStorage.setItem("description_prefill", JSON.stringify({
                          title: form.title || "",
                          transcript: form.script || "",
                          contentPlanId: plan.id,
                        }));
                        window.location.href = "/member/ai-tools/description-generator";
                      }}
                      className="text-[10px] text-[#6ba3c7] hover:underline"
                    >
                      Generate with AI →
                    </button>
                  )}
                </div>
                <MarkdownTextarea
                  value={form.youtubeDescription}
                  onChange={(v) => setForm((f) => ({ ...f, youtubeDescription: v }))}
                  rows={4}
                  className={field}
                  placeholder="YouTube video description…"
                  ariaLabel="YouTube Description"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Thumbnail Words</label>
                <input type="text" value={form.thumbnailWords} onChange={(e) => setForm((f) => ({ ...f, thumbnailWords: e.target.value }))} className={field} placeholder="3–5 words" />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-between px-6 pb-5 pt-2 border-t border-gray-100">
          {onDeleted ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600">Are you sure?</span>
                <button onClick={handleDelete} disabled={deleting} className="text-xs text-red-600 font-medium hover:underline disabled:opacity-50">
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-[#2f3437]/50 hover:text-[#2f3437]">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-xs text-[#2f3437]/40 hover:text-red-600 transition-colors">Delete video</button>
            )
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-[#2f3437]/60 hover:text-[#2f3437] border border-gray-200 rounded-lg">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-[#2f3437] text-white rounded-lg hover:bg-[#1a1f22] disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
