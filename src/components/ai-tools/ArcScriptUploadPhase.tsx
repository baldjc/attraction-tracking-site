"use client";

import { useState, useRef, useCallback, useEffect, DragEvent, ChangeEvent } from "react";
import { ChevronDownIcon, FilmIcon } from "@heroicons/react/24/outline";
import { DocumentArrowUpIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface UploadedFile {
  file: File;
  extractedText?: string;
  error?: string;
}

interface StartBuildingData {
  title: string;
  talkingPoints: string;
  researchSummary: string;
  clientStory: string;
  leadMagnet: string;
  nextVideoPush: string;
}

interface PrefillData {
  title: string;
  talkingPoints: string[];
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
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ALLOWED_EXTENSIONS = ["pdf", "docx", "txt", "md"];
const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;

export default function ArcScriptUploadPhase({ onStartBuilding, prefillData, onSkip, isAdmin }: Props) {
  const [title, setTitle] = useState("");
  const [talkingPoints, setTalkingPoints] = useState("");
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
  const [loadingStep, setLoadingStep] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

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

  const isPrefilled = !!prefillData;
  const effectiveTitle = isPrefilled ? prefillData!.title : title;
  const effectiveTalkingPoints = isPrefilled ? prefillData!.talkingPoints.join("\n") : talkingPoints;

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
        setError(`Unsupported file type: .${ext(file.name)}. Use PDF, DOCX, TXT, or MD.`);
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

    let researchText = pastedNotes.trim();

    if (files.length > 0) {
      setLoadingStep("Reading files…");
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
        return;
      }
    }

    setLoadingStep("Analysing research…");
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
        return;
      }

      if (!summaryRes.ok) {
        setError("Failed to summarise research. Please try again.");
        setLoading(false);
        return;
      }

      const summaryData = await summaryRes.json();
      onStartBuilding({
        title: effectiveTitle.trim(),
        talkingPoints: effectiveTalkingPoints.trim(),
        researchSummary: summaryData.summary ?? researchText,
        clientStory: clientStory.trim(),
        leadMagnet: leadMagnet.trim(),
        nextVideoPush: nextVideoPush.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {isPrefilled && (
        <div className="bg-[#3dc3ff]/8 border border-[#3dc3ff]/25 rounded-xl px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-[#3dc3ff] uppercase tracking-wider">Building script for</p>
          <p className="text-sm font-semibold text-[#1e2a38] leading-snug">{prefillData!.title}</p>
          {prefillData!.talkingPoints.length > 0 && (
            <ol className="space-y-0.5 mt-1">
              {prefillData!.talkingPoints.map((pt, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-[#1e2a38]/60">
                  <span className="text-[#3dc3ff] font-bold flex-shrink-0">{i + 1}.</span>
                  <span>{pt}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {!isPrefilled && (
        <div>
          <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">
            What&apos;s your video title? <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Why 90% of Real Estate Agents Fail in Year 2"
            className="w-full bg-white border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] transition-colors"
          />
        </div>
      )}

      {!isPrefilled && (
        <div>
          <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">
            Key talking points{" "}
            <span className="text-[#1e2a38]/40 font-normal">(optional but encouraged)</span>
          </label>
          <p className="text-xs text-[#1e2a38]/50 mb-2">
            List the main points you want to cover. Don&apos;t worry about order — the AI will propose the best structure.
          </p>
          <textarea
            value={talkingPoints}
            onChange={(e) => setTalkingPoints(e.target.value)}
            placeholder="What insights, tips, or points do you want to cover? One per line is fine."
            rows={3}
            className="w-full bg-white border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 resize-none focus:outline-none focus:border-[#3dc3ff] transition-colors"
          />
        </div>
      )}

      {isPrefilled && (
        <div>
          <p className="text-sm font-semibold text-[#1e2a38] mb-1">
            Add research{" "}
            <span className="font-normal text-[#1e2a38]/40">(optional — upload files or paste notes below)</span>
          </p>
          <p className="text-xs text-[#1e2a38]/50">
            Supporting research helps the AI generate more specific, credible script content. You can skip this step if you don&apos;t have anything to add.
          </p>
        </div>
      )}

      <div>
        {!isPrefilled && (
          <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">
            Upload research files{" "}
            <span className="text-[#1e2a38]/40 font-normal">(PDF, DOCX, TXT, MD — max 3 files, 10 MB each)</span>
          </label>
        )}
        {isPrefilled && (
          <label className="block text-xs font-medium text-[#1e2a38]/50 mb-1.5">
            PDF, DOCX, TXT, or MD — max 3 files, 10 MB each
          </label>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
            isDragging
              ? "border-[#3dc3ff] bg-[#3dc3ff]/5"
              : "border-[#1e2a38]/15 hover:border-[#3dc3ff]/50 hover:bg-[#3dc3ff]/3"
          }`}
        >
          <DocumentArrowUpIcon className="w-8 h-8 text-[#1e2a38]/30 mx-auto mb-2" />
          <p className="text-sm text-[#1e2a38]/50">
            Drag and drop files here, or{" "}
            <span className="text-[#3dc3ff] font-medium">click to browse</span>
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md"
            className="hidden"
            onChange={(e: ChangeEvent<HTMLInputElement>) => addFiles(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <ul className="mt-3 space-y-2">
            {files.map((f) => (
              <li
                key={f.file.name}
                className="flex items-center gap-3 bg-white border border-[#1e2a38]/10 rounded-xl px-4 py-2.5"
              >
                <DocumentArrowUpIcon className="w-4 h-4 text-[#3dc3ff] flex-shrink-0" />
                <span className="text-sm text-[#1e2a38] flex-1 truncate">{f.file.name}</span>
                <span className="text-xs text-[#1e2a38]/40 flex-shrink-0">{formatBytes(f.file.size)}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(f.file.name); }}
                  className="text-[#1e2a38]/30 hover:text-red-500 transition-colors"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">
          {isPrefilled ? "Paste research notes" : "Paste your research notes"}{" "}
          <span className="text-[#1e2a38]/40 font-normal">(or paste content from scanned PDFs)</span>
        </label>
        <textarea
          value={pastedNotes}
          onChange={(e) => setPastedNotes(e.target.value)}
          placeholder="Paste any research, notes, stats, quotes, or article content here…"
          rows={8}
          className="w-full bg-white border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 resize-none focus:outline-none focus:border-[#3dc3ff] transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">
          Client story or personal experience{" "}
          <span className="text-[#1e2a38]/40 font-normal">(optional but recommended)</span>
        </label>
        <p className="text-xs text-[#1e2a38]/50 mb-2">
          This gets woven through the whole script as a single threaded story. The more specific, the better — real name, real situation, real outcome.
        </p>
        <textarea
          value={clientStory}
          onChange={(e) => setClientStory(e.target.value)}
          placeholder="e.g. I had a client named Sarah who came to me after her listing had already expired twice. She'd dropped the price $40k and still had zero offers. Here's what we found…"
          rows={4}
          className="w-full bg-white border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 resize-none focus:outline-none focus:border-[#3dc3ff] transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-[#1e2a38] mb-1.5">
          What&apos;s your lead magnet for this video?{" "}
          <span className="text-[#1e2a38]/40 font-normal">(optional)</span>
        </label>
        <p className="text-xs text-[#1e2a38]/50 mb-2">
          The free resource you&apos;ll mention 3 times (e.g. &ldquo;Calgary Buyer&apos;s Reality Check&rdquo;, &ldquo;Neighbourhood Matchmaker GPT&rdquo;). If you don&apos;t have one yet, leave blank and the AI will brainstorm options.
        </p>
        <input
          type="text"
          value={leadMagnet}
          onChange={(e) => setLeadMagnet(e.target.value)}
          placeholder="e.g. Calgary Home Seller's Readiness Checklist"
          className="w-full bg-white border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] transition-colors"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-sm font-semibold text-[#1e2a38]">
            What video are you pushing viewers to next?{" "}
            <span className="text-[#1e2a38]/40 font-normal">(optional)</span>
          </label>
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={openPicker}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#3dc3ff] hover:text-[#3dc3ff]/80 transition-colors"
            >
              <FilmIcon className="w-3.5 h-3.5" />
              Pick from your videos
              <ChevronDownIcon className={`w-3 h-3 transition-transform ${pickerOpen ? "rotate-180" : ""}`} />
            </button>

            {pickerOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-80 bg-white border border-[#1e2a38]/15 rounded-xl shadow-lg z-20 overflow-hidden">

                {pickerStep === "members" && (
                  <>
                    <div className="px-4 py-2.5 border-b border-[#1e2a38]/8 bg-[#f1f1ef]">
                      <p className="text-xs font-semibold text-[#1e2a38]/60 uppercase tracking-wide">Select a member</p>
                    </div>
                    {memberListLoading ? (
                      <div className="px-4 py-5 text-sm text-[#1e2a38]/50 text-center">Loading members…</div>
                    ) : memberList.length === 0 ? (
                      <div className="px-4 py-5 text-sm text-[#1e2a38]/50 text-center">No members found</div>
                    ) : (
                      <ul className="max-h-64 overflow-y-auto divide-y divide-[#1e2a38]/8">
                        {memberList.map((m) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => pickMember(m)}
                              className="w-full text-left px-4 py-3 hover:bg-[#3dc3ff]/5 transition-colors"
                            >
                              <p className="text-sm font-medium text-[#1e2a38]">{m.fullName || m.email}</p>
                              {m.youtubeChannelName && (
                                <p className="text-xs text-[#1e2a38]/40 mt-0.5">{m.youtubeChannelName}</p>
                              )}
                              {!m.youtubeChannelName && (
                                <p className="text-xs text-[#1e2a38]/35 mt-0.5">{m.email}</p>
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
                      <div className="px-4 py-2.5 border-b border-[#1e2a38]/8 bg-[#f1f1ef] flex items-center justify-between">
                        <p className="text-xs font-semibold text-[#1e2a38]/70 truncate">
                          {selectedMember.fullName || selectedMember.email}
                        </p>
                        <button
                          type="button"
                          onClick={() => setPickerStep("members")}
                          className="text-xs text-[#3dc3ff] hover:underline shrink-0 ml-2"
                        >
                          Change
                        </button>
                      </div>
                    )}
                    {pickerLoading ? (
                      <div className="px-4 py-5 text-sm text-[#1e2a38]/50 text-center">Loading videos…</div>
                    ) : ytError ? (
                      <div className="px-4 py-5 text-sm text-[#1e2a38]/50 text-center">{ytError}</div>
                    ) : ytVideos.length === 0 ? (
                      <div className="px-4 py-5 text-sm text-[#1e2a38]/50 text-center">No videos found</div>
                    ) : (
                      <ul className="max-h-72 overflow-y-auto divide-y divide-[#1e2a38]/8">
                        {ytVideos.map((v) => (
                          <li key={v.videoId}>
                            <button
                              type="button"
                              onClick={() => pickVideo(v)}
                              className="w-full text-left px-3 py-2.5 hover:bg-[#3dc3ff]/5 transition-colors flex items-center gap-3"
                            >
                              {v.thumbnailUrl ? (
                                <img
                                  src={v.thumbnailUrl}
                                  alt=""
                                  className="w-16 h-9 rounded object-cover shrink-0 bg-[#1e2a38]/10"
                                />
                              ) : (
                                <div className="w-16 h-9 rounded bg-[#1e2a38]/10 shrink-0" />
                              )}
                              <p className="text-sm font-medium text-[#1e2a38] leading-snug line-clamp-2 text-left">{v.title}</p>
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
        <p className="text-xs text-[#1e2a38]/50 mb-2">
          Pick from your recent YouTube videos or type a title for an upcoming one. The AI uses this to write a specific open loop ending.
        </p>
        <textarea
          value={nextVideoPush}
          onChange={(e) => setNextVideoPush(e.target.value)}
          rows={nextVideoPush.length > 80 ? 5 : 2}
          placeholder="e.g. Why Calgary Buyers Are Regret-Proofing Their Offer Strategy in 2026"
          className="w-full bg-white border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 resize-none focus:outline-none focus:border-[#3dc3ff] transition-colors"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {isPrefilled ? (
        <div className="flex gap-3">
          <button
            onClick={onSkip}
            className="flex-1 py-3 text-sm font-semibold border border-[#1e2a38]/15 text-[#1e2a38]/60 rounded-xl hover:bg-[#1e2a38]/5 transition-colors"
          >
            Skip — no research
          </button>
          <button
            onClick={handleStart}
            disabled={!canStart || loading}
            className="flex-1 bg-[#3dc3ff] text-white font-semibold py-3 rounded-xl hover:bg-[#3dc3ff]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/70 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </span>
                {loadingStep || "Working…"}
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
            className="w-full bg-[#3dc3ff] text-white font-semibold py-3.5 rounded-xl hover:bg-[#3dc3ff]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/70 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </span>
                {loadingStep || "Working…"}
              </>
            ) : (
              <>Start Building →</>
            )}
          </button>

          {!canStart && !loading && (
            <p className="text-center text-xs text-[#1e2a38]/35">
              Add a video title and at least one file, some research notes, or talking points to continue.
            </p>
          )}
        </>
      )}
    </div>
  );
}
