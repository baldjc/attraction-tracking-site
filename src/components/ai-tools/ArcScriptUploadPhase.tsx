"use client";

import { useState, useRef, useCallback, useEffect, DragEvent, ChangeEvent } from "react";
import { ChevronDownIcon, FilmIcon } from "@heroicons/react/24/outline";
import { DocumentArrowUpIcon, XMarkIcon, ClipboardDocumentIcon, CheckIcon } from "@heroicons/react/24/outline";
import MarkdownTextarea from "@/components/MarkdownTextarea";
import { AiThinking } from "@/components/ai/AiThinking";

interface UploadedFile {
  file: File;
  extractedText?: string;
  error?: string;
}

interface ContentTheme {
  name: string;
  emoji?: string | null;
  colour?: string | null;
  content_engine_prompt?: string | null;
}

interface StartBuildingData {
  title: string;
  talkingPoints: string;
  researchSummary: string;
  clientStory: string;
  leadMagnet: string;
  nextVideoPush: string;
  themeName?: string;
  themeContext?: string;
}

interface PrefillData {
  title: string;
  talkingPoints: string[];
  themeName?: string;
  dataToFind?: string;
}

interface YouTubeVideoOption {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  uploadDate: string;
  viewCount: number;
}

interface MemberOption {
  id: string;
  fullName: string | null;
  email: string;
  youtubeChannelName: string | null;
  youtubeChannelUrl: string | null;
}

interface Props {
  onStartBuilding: (data: StartBuildingData) => void;
  cap?: number;
  prefillData?: PrefillData;
  onSkip?: () => void;
  isAdmin?: boolean;
  contentThemes?: ContentTheme[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ALLOWED_EXTENSIONS = ["pdf", "docx", "txt", "md", "csv", "xlsx", "xls"];
const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;

export default function ArcScriptUploadPhase({ onStartBuilding, prefillData, onSkip, isAdmin, contentThemes = [] }: Props) {
  const [title, setTitle] = useState("");
  const [talkingPoints, setTalkingPoints] = useState("");
  const [selectedThemeName, setSelectedThemeName] = useState<string>("");
  const [pastedNotes, setPastedNotes] = useState("");
  const [clientStory, setClientStory] = useState("");
  const [leadMagnet, setLeadMagnet] = useState("");
  const [nextVideoPush, setNextVideoPush] = useState("");
  const [ytVideos, setYtVideos] = useState<YouTubeVideoOption[]>([]);
  const [ytError, setYtError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerStep, setPickerStep] = useState<"members" | "videos">("videos");
  const [memberList, setMemberList] = useState<MemberOption[]>([]);
  const [memberListLoading, setMemberListLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  type AnalysisStageKey = "read" | "analyse";
  const [activeStage, setActiveStage] = useState<AnalysisStageKey | null>(null);
  const [completedStages, setCompletedStages] = useState<AnalysisStageKey[]>([]);
  const hasFiles = files.length > 0;
  const analysisStages = (
    [
      { key: "read" as const, label: "Read research files" },
      { key: "analyse" as const, label: "Summarise research" },
    ] as const
  )
    .filter((s) => (s.key === "read" ? hasFiles : true))
    .map((s) => ({
      key: s.key,
      label: s.label,
      status: completedStages.includes(s.key)
        ? ("complete" as const)
        : activeStage === s.key
        ? ("active" as const)
        : ("pending" as const),
    }));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarData, setAvatarData] = useState<any>(null);
  const [researchPrompt, setResearchPrompt] = useState("");
  const [researchPromptCopied, setResearchPromptCopied] = useState(false);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    fetch("/api/member/avatar").then((r) => r.json()).then(setAvatarData).catch(() => {});
  }, []);

  useEffect(() => {
    if (prefillData?.dataToFind) {
      setPastedNotes(`--- Data to Find ---\n${prefillData.dataToFind}`);
    }
  }, [prefillData?.dataToFind]);

  function generateResearchPrompt() {
    const t = effectiveTitle.trim();
    const tp = effectiveTalkingPoints.trim();
    if (!t) return;

    const avatarSection = avatarData?.avatarName
      ? `=== TARGET AVATAR ===\nName: ${avatarData.avatarName}\n${avatarData.full_document || avatarData.avatarSummary || JSON.stringify(avatarData, null, 2)}`
      : "(No avatar saved — write for a general real estate audience)";

    const prompt = `I'm creating a YouTube video titled: "${t}"

${tp ? `My key talking points:\n${tp}\n` : ""}
${avatarSection}

=== WHAT I NEED ===

Research this topic and provide a structured research document I can use to build my script. For each talking point above, find:

1. **REAL STATS & DATA** — Specific numbers, percentages, dollar amounts, year-over-year comparisons. Local data for the member's market preferred where available. Include the source (e.g., CREA 2025, local MLS board stats, StatsCan).

2. **MAIN ARGUMENTS & UNIQUE ANGLES** — What point of view does the data support? What contrarian or surprising take could I make that's backed by evidence?

3. **CLIENT PAIN POINTS & EMOTIONAL TRIGGERS** — Based on the avatar above, what fears, frustrations, or hopes does this topic speak to? What's the internal monologue of someone dealing with this?

4. **MYTH OR MISCONCEPTION** — What does the average person believe about this topic that's wrong or incomplete? What's the counter-truth?

5. **CONTENT IDEAS** — Specific angles, framings, or metaphors that could make each point land harder on camera.

6. **CONVENTIONAL WISDOM** — What do competing sources, other agents, or mainstream advice say about this? (So I can position against it.)

7. **NOTABLE QUOTES OR PHRASINGS** — Any standout language worth preserving or referencing.

Format each talking point as its own section with all 7 categories. Preserve specific numbers and sources exactly. Be concise but complete.`;

    setResearchPrompt(prompt);
  }

  async function copyResearchPrompt() {
    await navigator.clipboard.writeText(researchPrompt);
    setResearchPromptCopied(true);
    setTimeout(() => setResearchPromptCopied(false), 2000);
  }

  async function fetchYtVideos(userId?: string) {
    setYtError("");
    setPickerLoading(true);
    setYtVideos([]);
    try {
      const url = userId
        ? `/api/ai-tools/youtube-videos?userId=${userId}`
        : "/api/ai-tools/youtube-videos";
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setYtError(data.error ?? "Could not load videos");
      } else {
        setYtVideos(data.videos ?? []);
      }
    } catch {
      setYtError("Could not load videos");
    } finally {
      setPickerLoading(false);
    }
  }

  async function openPicker() {
    const opening = !pickerOpen;
    setPickerOpen(opening);
    if (!opening) return;

    if (isAdmin) {
      setPickerStep("members");
      if (memberList.length > 0) return;
      setMemberListLoading(true);
      try {
        const res = await fetch("/api/admin/members");
        const data = await res.json();
        setMemberList(data.members ?? []);
      } catch {
        setMemberList([]);
      } finally {
        setMemberListLoading(false);
      }
    } else {
      setPickerStep("videos");
      if (ytVideos.length > 0) return;
      fetchYtVideos();
    }
  }

  async function pickMember(m: MemberOption) {
    setSelectedMember(m);
    setPickerStep("videos");
    fetchYtVideos(m.id);
  }

  function pickVideo(v: YouTubeVideoOption) {
    setNextVideoPush(v.title);
    setPickerOpen(false);
  }

  // Pre-fill research notes with dataToFind from Content Engine
  useEffect(() => {
    if (prefillData?.dataToFind && !pastedNotes) {
      setPastedNotes("--- Data to Find ---\n" + prefillData.dataToFind);
    }
  }, [prefillData]); // eslint-disable-line react-hooks/exhaustive-deps

  const isPrefilled = !!prefillData;
  const effectiveTitle = isPrefilled ? prefillData!.title : title;
  const effectiveTalkingPoints = isPrefilled ? prefillData!.talkingPoints.join("\n") : talkingPoints;

  const activeThemeName = isPrefilled
    ? (prefillData!.themeName ?? selectedThemeName)
    : selectedThemeName;
  const activeTheme = contentThemes.find((t) => t.name === activeThemeName) ?? null;
  const activeThemeContext = activeTheme?.content_engine_prompt ?? null;

  const ext = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    setError("");
    const next = [...files];
    for (const file of Array.from(incoming)) {
      if (next.length >= MAX_FILES) {
        setError(`Maximum ${MAX_FILES} files allowed.`);
        break;
      }
      if (!ALLOWED_EXTENSIONS.includes(ext(file.name))) {
        setError(`Unsupported file type: .${ext(file.name)}. Use PDF, DOCX, XLSX, CSV, TXT, or MD.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError(`"${file.name}" exceeds the 10 MB limit.`);
        continue;
      }
      if (!next.find((f) => f.file.name === file.name)) {
        next.push({ file });
      }
    }
    setFiles(next);
  }, [files]);

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.file.name !== name));
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }

  const hasResearch = files.length > 0 || pastedNotes.trim().length > 0 || effectiveTalkingPoints.trim().length > 0;
  const canStart = effectiveTitle.trim().length > 0 && hasResearch;

  async function handleStart() {
    if (!canStart || loading) return;
    setError("");
    setLoading(true);
    setCompletedStages([]);
    setActiveStage(hasFiles ? "read" : "analyse");

    let researchText = pastedNotes.trim();

    if (files.length > 0) {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f.file));
      try {
        const uploadRes = await fetch("/api/ai-tools/arc-script-builder/upload", {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (uploadData.results) {
          for (const r of uploadData.results) {
            if (r.text) researchText += `\n\n--- ${r.filename} ---\n${r.text}`;
            else if (r.error) setError(`${r.filename}: ${r.error}`);
          }
        }
      } catch {
        setError("Failed to read files. Try pasting the text directly instead.");
        setLoading(false);
        setActiveStage(null);
        return;
      }
      setCompletedStages((prev) => (prev.includes("read") ? prev : [...prev, "read"]));
    }

    setActiveStage("analyse");
    try {
      const summaryRes = await fetch("/api/ai-tools/arc-script-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "summarize",
          researchText: researchText || effectiveTalkingPoints,
          title: effectiveTitle.trim(),
          talkingPoints: effectiveTalkingPoints.trim(),
        }),
      });

      if (summaryRes.status === 429) {
        const data = await summaryRes.json();
        setError(
          data.error === "monthly_cap_reached"
            ? `You've reached your monthly AI usage limit. It resets on ${data.resetsAt}.`
            : "Monthly limit reached."
        );
        setLoading(false);
        setActiveStage(null);
        return;
      }

      if (!summaryRes.ok) {
        setError("Failed to summarise research. Please try again.");
        setLoading(false);
        setActiveStage(null);
        return;
      }

      const summaryData = await summaryRes.json();
      setCompletedStages((prev) => (prev.includes("analyse") ? prev : [...prev, "analyse"]));
      setActiveStage(null);
      onStartBuilding({
        title: effectiveTitle.trim(),
        talkingPoints: effectiveTalkingPoints.trim(),
        researchSummary: summaryData.summary || researchText,
        clientStory: clientStory.trim(),
        leadMagnet: leadMagnet.trim(),
        nextVideoPush: nextVideoPush.trim(),
        themeName: activeThemeName || undefined,
        themeContext: activeThemeContext || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
      setActiveStage(null);
    }
  }

  // Warn before leaving the tab while the analysis is in flight — the request
  // is cancelled on unload and the work is lost. Mirrors the guard the old
  // AnalysisProgress component installed before the AiThinking rollout.
  useEffect(() => {
    if (!loading) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [loading]);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {loading && (
        <AiThinking
          mode="pipeline"
          stages={analysisStages}
          detailLine="ARC Script Builder"
          timeRemaining="20–60 sec"
        />
      )}
      {loading && (
        <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/45 -mt-2">
          Please keep this tab open — leaving now will cancel the analysis.
        </p>
      )}
      {isPrefilled && (
        <div className="bg-[var(--abv-ai-tools)]/8 border border-[var(--abv-ai-tools)]/25 rounded-lg px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs font-semibold text-[var(--abv-ai-tools)] uppercase tracking-wider">Building script for</p>
            {activeThemeName && (
              <span
                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: activeTheme?.colour ? `${activeTheme.colour}22` : "var(--abv-ai-tools)22",
                  color: activeTheme?.colour ?? "var(--abv-ai-tools)",
                  border: `1px solid ${activeTheme?.colour ? `${activeTheme.colour}55` : "var(--abv-ai-tools)55"}`,
                }}
              >
                {activeTheme?.emoji && <span>{activeTheme.emoji}</span>}
                {activeThemeName}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-[var(--abv-text)] dark:text-white leading-snug">{prefillData!.title}</p>
          {prefillData!.talkingPoints.length > 0 && (
            <ol className="space-y-0.5 mt-1">
              {prefillData!.talkingPoints.map((pt, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--abv-text)]/60 dark:text-white/60">
                  <span className="text-[var(--abv-ai-tools)] font-bold flex-shrink-0">{i + 1}.</span>
                  <span>{pt}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {!isPrefilled && (
        <div>
          <label className="block text-sm font-semibold text-[var(--abv-text)] dark:text-white mb-1.5">
            What&apos;s your video title? <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Why 90% of Real Estate Agents Fail in Year 2"
            className="w-full bg-white dark:bg-[#0f1419] border border-[var(--abv-text)]/20 dark:border-white/20 rounded-lg px-4 py-3 text-sm text-[var(--abv-text)] dark:text-white placeholder-[var(--abv-text)]/30 dark:placeholder-white/30 focus:outline-none focus:border-[var(--abv-ai-tools)] transition-colors"
          />
        </div>
      )}

      {!isPrefilled && contentThemes.length > 0 && (
        <div>
          <label className="block text-sm font-semibold text-[var(--abv-text)] dark:text-white mb-1.5">
            Content theme{" "}
            <span className="text-[var(--abv-text)]/40 dark:text-white/40 font-normal">(optional)</span>
          </label>
          <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/50 mb-2">
            Selecting a theme tells the AI the content angle and buyer psychology context to write to.
          </p>
          <select
            value={selectedThemeName}
            onChange={(e) => setSelectedThemeName(e.target.value)}
            className="w-full bg-white dark:bg-[#0f1419] border border-[var(--abv-text)]/20 dark:border-white/20 rounded-lg px-4 py-3 text-sm text-[var(--abv-text)] dark:text-white focus:outline-none focus:border-[var(--abv-ai-tools)] transition-colors"
          >
            <option value="">— No specific theme —</option>
            {contentThemes.map((t) => (
              <option key={t.name} value={t.name}>
                {t.emoji ? `${t.emoji} ${t.name}` : t.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {!isPrefilled && (
        <div>
          <label className="block text-sm font-semibold text-[var(--abv-text)] dark:text-white mb-1.5">
            Key talking points{" "}
            <span className="text-[var(--abv-text)]/40 dark:text-white/40 font-normal">(optional but encouraged)</span>
          </label>
          <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/50 mb-2">
            List the main points you want to cover. Don&apos;t worry about order — the AI will propose the best structure.
          </p>
          <MarkdownTextarea
            value={talkingPoints}
            onChange={setTalkingPoints}
            placeholder="What insights, tips, or points do you want to cover? One per line is fine."
            rows={3}
            ariaLabel="Key Talking Points"
          />
        </div>
      )}

      {effectiveTitle.trim() && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--abv-text)] dark:text-white">
                Research your topic
              </p>
              <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/50">
                Generate a prompt to paste into ChatGPT, Perplexity, or any AI — then bring the research back here.
              </p>
            </div>
            <button
              type="button"
              onClick={generateResearchPrompt}
              className="flex-shrink-0 px-4 py-2 text-sm font-medium bg-[var(--abv-text)] dark:bg-white text-white dark:text-[var(--abv-text)] rounded-lg hover:opacity-90 transition-opacity"
            >
              Generate Research Prompt
            </button>
          </div>
          {researchPrompt && (
            <div className="bg-[var(--abv-bg)] dark:bg-[#0f1419] border border-[var(--abv-text)]/10 dark:border-white/10 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--abv-text)]/10 dark:border-white/10">
                <span className="text-xs font-semibold text-[var(--abv-text)]/50 dark:text-white/50 uppercase tracking-wide">
                  Copy this prompt → paste into your research tool → paste results below
                </span>
                <button
                  type="button"
                  onClick={copyResearchPrompt}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--abv-ai-tools)] text-white rounded-md hover:bg-[var(--abv-ai-tools)]/90 transition-colors"
                >
                  {researchPromptCopied ? <CheckIcon className="w-3.5 h-3.5" /> : <ClipboardDocumentIcon className="w-3.5 h-3.5" />}
                  {researchPromptCopied ? "Copied!" : "Copy Prompt"}
                </button>
              </div>
              <pre className="px-4 py-3 text-xs text-[var(--abv-text)]/70 dark:text-white/70 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                {researchPrompt}
              </pre>
            </div>
          )}
        </div>
      )}

      {isPrefilled && (
        <div>
          <p className="text-sm font-semibold text-[var(--abv-text)] dark:text-white mb-1">
            Add research{" "}
            <span className="font-normal text-[var(--abv-text)]/40 dark:text-white/40">(optional — upload files or paste notes below)</span>
          </p>
          <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/50">
            Supporting research helps the AI generate more specific, credible script content. You can skip this step if you don&apos;t have anything to add.
          </p>
        </div>
      )}

      <div>
        {!isPrefilled && (
          <label className="block text-sm font-semibold text-[var(--abv-text)] dark:text-white mb-1.5">
            Upload research files{" "}
            <span className="text-[var(--abv-text)]/40 dark:text-white/40 font-normal">(PDF, DOCX, XLSX, CSV, TXT, MD — max 3 files, 10 MB each)</span>
          </label>
        )}
        {isPrefilled && (
          <label className="block text-xs font-medium text-[var(--abv-text)]/50 dark:text-white/50 mb-1.5">
            PDF, DOCX, XLSX, CSV, TXT, or MD — max 3 files, 10 MB each
          </label>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragging
              ? "border-[var(--abv-ai-tools)] bg-[var(--abv-ai-tools)]/5"
              : "border-[var(--abv-text)]/15 dark:border-white/15 hover:border-[var(--abv-ai-tools)]/50 hover:bg-[var(--abv-ai-tools)]/3"
          }`}
        >
          <DocumentArrowUpIcon className="w-8 h-8 text-[var(--abv-text)]/30 dark:text-white/30 mx-auto mb-2" />
          <p className="text-sm text-[var(--abv-text)]/50 dark:text-white/50">
            Drag and drop files here, or{" "}
            <span className="text-[var(--abv-ai-tools)] font-medium">click to browse</span>
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.xls"
            className="hidden"
            onChange={(e: ChangeEvent<HTMLInputElement>) => addFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <ul className="mt-3 space-y-2">
            {files.map((f) => (
              <li
                key={f.file.name}
                className="flex items-center gap-3 bg-white dark:bg-[#1a1a1a] border border-[var(--abv-text)]/10 dark:border-white/10 rounded-lg px-4 py-2.5"
              >
                <DocumentArrowUpIcon className="w-4 h-4 text-[var(--abv-ai-tools)] flex-shrink-0" />
                <span className="text-sm text-[var(--abv-text)] dark:text-white flex-1 truncate">{f.file.name}</span>
                <span className="text-xs text-[var(--abv-text)]/40 dark:text-white/40 flex-shrink-0">{formatBytes(f.file.size)}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(f.file.name); }}
                  className="text-[var(--abv-text)]/30 dark:text-white/30 hover:text-red-500 transition-colors"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-[var(--abv-text)] dark:text-white mb-1.5">
          Paste your research notes{" "}
          <span className="text-[var(--abv-text)]/40 dark:text-white/40 font-normal">(or paste content from scanned PDFs)</span>
        </label>
        <MarkdownTextarea
          value={pastedNotes}
          onChange={setPastedNotes}
          placeholder="Paste any research, notes, stats, quotes, or article content here…"
          rows={8}
          ariaLabel="Research notes"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-[var(--abv-text)] dark:text-white mb-1.5">
          Client story or personal experience{" "}
          <span className="text-[var(--abv-text)]/40 dark:text-white/40 font-normal">(optional but recommended)</span>
        </label>
        <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/50 mb-2">
          This gets woven through the whole script as a single threaded story. The more specific, the better — real name, real situation, real outcome.
        </p>
        <MarkdownTextarea
          value={clientStory}
          onChange={setClientStory}
          placeholder="e.g. I had a client named Sarah who came to me after her listing had already expired twice. She'd dropped the price $40k and still had zero offers. Here's what we found…"
          rows={4}
          ariaLabel="Client story"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-[var(--abv-text)] dark:text-white mb-1.5">
          What&apos;s your lead magnet for this video?{" "}
          <span className="text-[var(--abv-text)]/40 dark:text-white/40 font-normal">(optional)</span>
        </label>
        <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/50 mb-2">
          The free resource you&apos;ll mention 3 times (e.g. &ldquo;First-Time Buyer&apos;s Reality Check&rdquo;, &ldquo;Neighbourhood Matchmaker GPT&rdquo;). If you don&apos;t have one yet, leave blank and the AI will brainstorm options.
        </p>
        <input
          type="text"
          value={leadMagnet}
          onChange={(e) => setLeadMagnet(e.target.value)}
          placeholder="e.g. Home Seller's Readiness Checklist"
          className="w-full bg-white dark:bg-[#0f1419] border border-[var(--abv-text)]/20 dark:border-white/20 rounded-lg px-4 py-3 text-sm text-[var(--abv-text)] dark:text-white placeholder-[var(--abv-text)]/30 dark:placeholder-white/30 focus:outline-none focus:border-[var(--abv-ai-tools)] transition-colors"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-sm font-semibold text-[var(--abv-text)] dark:text-white">
            What video are you pushing viewers to next?{" "}
            <span className="text-[var(--abv-text)]/40 dark:text-white/40 font-normal">(optional)</span>
          </label>
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={openPicker}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--abv-ai-tools)] hover:text-[var(--abv-ai-tools)]/80 transition-colors"
            >
              <FilmIcon className="w-3.5 h-3.5" />
              Pick from your videos
              <ChevronDownIcon className={`w-3 h-3 transition-transform ${pickerOpen ? "rotate-180" : ""}`} />
            </button>

            {pickerOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-80 bg-white dark:bg-[#1a1a1a] border border-[var(--abv-text)]/15 dark:border-white/15 rounded-lg shadow-lg z-20 overflow-hidden">

                {pickerStep === "members" && (
                  <>
                    <div className="px-4 py-2.5 border-b border-[var(--abv-text)]/10 dark:border-white/10 bg-[var(--abv-bg)] dark:bg-[#0f1419]">
                      <p className="text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/60 uppercase tracking-wide">Select a member</p>
                    </div>
                    {memberListLoading ? (
                      <div className="px-4 py-5 text-sm text-[var(--abv-text)]/50 dark:text-white/50 text-center">Loading members…</div>
                    ) : memberList.length === 0 ? (
                      <div className="px-4 py-5 text-sm text-[var(--abv-text)]/50 dark:text-white/50 text-center">No members found</div>
                    ) : (
                      <ul className="max-h-64 overflow-y-auto divide-y divide-[var(--abv-text)]/8 dark:divide-white/10">
                        {memberList.map((m) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => pickMember(m)}
                              className="w-full text-left px-4 py-3 hover:bg-[var(--abv-ai-tools)]/5 transition-colors"
                            >
                              <p className="text-sm font-medium text-[var(--abv-text)] dark:text-white">{m.fullName || m.email}</p>
                              {m.youtubeChannelName && (
                                <p className="text-xs text-[var(--abv-text)]/40 dark:text-white/40 mt-0.5">{m.youtubeChannelName}</p>
                              )}
                              {!m.youtubeChannelName && (
                                <p className="text-xs text-[var(--abv-text)]/35 dark:text-white/35 mt-0.5">{m.email}</p>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}

                {pickerStep === "videos" && (
                  <>
                    {selectedMember && (
                      <div className="px-4 py-2.5 border-b border-[var(--abv-text)]/10 dark:border-white/10 bg-[var(--abv-bg)] dark:bg-[#0f1419] flex items-center justify-between">
                        <p className="text-xs font-semibold text-[var(--abv-text)]/70 dark:text-white/70 truncate">
                          {selectedMember.fullName || selectedMember.email}
                        </p>
                        <button
                          type="button"
                          onClick={() => setPickerStep("members")}
                          className="text-xs text-[var(--abv-ai-tools)] hover:underline shrink-0 ml-2"
                        >
                          Change
                        </button>
                      </div>
                    )}
                    {pickerLoading ? (
                      <div className="px-4 py-5 text-sm text-[var(--abv-text)]/50 dark:text-white/50 text-center">Loading videos…</div>
                    ) : ytError ? (
                      <div className="px-4 py-5 text-sm text-[var(--abv-text)]/50 dark:text-white/50 text-center">{ytError}</div>
                    ) : ytVideos.length === 0 ? (
                      <div className="px-4 py-5 text-sm text-[var(--abv-text)]/50 dark:text-white/50 text-center">No videos found</div>
                    ) : (
                      <ul className="max-h-72 overflow-y-auto divide-y divide-[var(--abv-text)]/8 dark:divide-white/10">
                        {ytVideos.map((v) => (
                          <li key={v.videoId}>
                            <button
                              type="button"
                              onClick={() => pickVideo(v)}
                              className="w-full text-left px-3 py-2.5 hover:bg-[var(--abv-ai-tools)]/5 transition-colors flex items-center gap-3"
                            >
                              {v.thumbnailUrl ? (
                                <img
                                  src={v.thumbnailUrl}
                                  alt=""
                                  className="w-16 h-9 rounded object-cover shrink-0 bg-[#111]/10 dark:bg-white/10"
                                />
                              ) : (
                                <div className="w-16 h-9 rounded bg-[#111]/10 dark:bg-white/10 shrink-0" />
                              )}
                              <p className="text-sm font-medium text-[var(--abv-text)] dark:text-white leading-snug line-clamp-2 text-left">{v.title}</p>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}

              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/50 mb-2">
          Pick from your recent YouTube videos or type a title for an upcoming one. The AI uses this to write a specific open loop ending.
        </p>
        <MarkdownTextarea
          value={nextVideoPush}
          onChange={setNextVideoPush}
          rows={nextVideoPush.length > 80 ? 5 : 2}
          placeholder="e.g. Why Buyers Are Regret-Proofing Their Offer Strategy in 2026"
          ariaLabel="Next Video Push"
        />
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {isPrefilled ? (
        <div className="flex gap-3">
          <button
            onClick={onSkip}
            className="flex-1 py-3 text-sm font-semibold border border-[var(--abv-text)]/15 dark:border-white/15 text-[var(--abv-text)]/60 dark:text-white/60 rounded-lg hover:bg-[#111]/5 dark:hover:bg-white/5 transition-colors"
          >
            Skip — no research
          </button>
          <button
            onClick={handleStart}
            disabled={!canStart || loading}
            className="flex-1 bg-[var(--abv-ai-tools)] text-white font-semibold py-3 rounded-lg hover:bg-[var(--abv-ai-tools)]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/70 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </span>
                {activeStage === "read"
                  ? "Reading files…"
                  : activeStage === "analyse"
                  ? "Analysing research…"
                  : "Working…"}
              </>
            ) : (
              <>Continue with research →</>
            )}
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={handleStart}
            disabled={!canStart || loading}
            className="w-full bg-[var(--abv-ai-tools)] text-white font-semibold py-3.5 rounded-lg hover:bg-[var(--abv-ai-tools)]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/70 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </span>
                {activeStage === "read"
                  ? "Reading files…"
                  : activeStage === "analyse"
                  ? "Analysing research…"
                  : "Working…"}
              </>
            ) : (
              <>Start Building →</>
            )}
          </button>

          {!canStart && !loading && (
            <p className="text-center text-xs text-[var(--abv-text)]/35 dark:text-white/35">
              Add a video title and at least one file, some research notes, or talking points to continue.
            </p>
          )}
        </>
      )}
    </div>
  );
}
