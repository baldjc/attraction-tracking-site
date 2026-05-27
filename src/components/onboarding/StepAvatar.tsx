"use client";

import { useState } from "react";

type AvatarPath = "existing" | "imported" | "build_later";
type SubState = "existing" | "choice" | "importing" | "confirming";

interface Props {
  existingAvatarName: string | null;
  existingContentThemes: unknown[] | null;
  onNext: (data: { avatarPath: AvatarPath; extractedAvatar?: any }) => void;
}

function getInitialSubState(existingAvatarName: string | null, existingContentThemes: unknown[] | null): SubState {
  if (existingAvatarName && Array.isArray(existingContentThemes) && existingContentThemes.length > 0) return "existing";
  return "choice";
}

export default function StepAvatar({ existingAvatarName, existingContentThemes, onNext }: Props) {
  const [subState, setSubState] = useState<SubState>(getInitialSubState(existingAvatarName, existingContentThemes));
  const [pastedText, setPastedText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<any>(null);

  async function handleExtract() {
    if (!pastedText.trim()) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const taggedContent = `[IMPORTED_AVATAR_DOC]\n${pastedText.trim()}`;
      const res = await fetch("/api/ai-tools/avatar-architect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: taggedContent }] }),
      });

      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }

      // The endpoint streams server-sent events ("data: {...}\n\n").
      // Read the whole stream, then pull the final "done" event's avatarData.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let avatarData: any = null;
      let streamErr: string | null = null;

      const handleLine = (line: string) => {
        if (!line.startsWith("data: ")) return;
        try {
          const event = JSON.parse(line.slice(6)) as {
            type: string;
            message?: string;
            avatarData?: any;
          };
          if (event.type === "done") {
            avatarData = event.avatarData ?? null;
          } else if (event.type === "error") {
            streamErr = event.message ?? "The AI service returned an error.";
          }
        } catch {
          // ignore parse errors on partial lines
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handleLine(line);
      }
      // Flush any trailing event left over after the stream closed without a final newline.
      if (buffer.trim()) handleLine(buffer.trim());

      if (streamErr) {
        setExtractError(streamErr);
      } else if (avatarData) {
        setExtractedData(avatarData);
        setSubState("confirming");
      } else {
        setExtractError("We couldn't extract avatar data from that document. Try pasting more detail, or build one from scratch using the Avatar Architect after setup.");
      }
    } catch (err: any) {
      setExtractError(err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setExtracting(false);
    }
  }

  const themes: any[] = Array.isArray(existingContentThemes) ? existingContentThemes : [];

  // Existing avatar
  if (subState === "existing") {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 rounded-xl">
          <p className="text-sm font-semibold text-green-700 dark:text-green-400">
            We already have your avatar on file — {existingAvatarName}
          </p>
          {themes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {themes.map((t: any, i: number) => (
                <span key={i} className="text-xs bg-[var(--abv-dark)]/10 text-[var(--abv-azure)] border border-[var(--abv-azure)]/20 rounded-full px-2 py-0.5">
                  {t.emoji ? `${t.emoji} ` : ""}{t.name ?? t}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-green-600/70 dark:text-green-400/60 mt-2">
            You can update it anytime in Settings or the Avatar Architect.
          </p>
        </div>
        <button
          onClick={() => onNext({ avatarPath: "existing" })}
          className="w-full bg-[var(--abv-dark)] hover:bg-[#2bb0ec] text-white font-semibold text-sm py-2.5 rounded-lg transition-colors"
        >
          Continue →
        </button>
      </div>
    );
  }

  // Choice
  if (subState === "choice") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setSubState("importing")}
            className="p-4 border-2 border-[var(--abv-text)]/10 dark:border-white/10 rounded-xl hover:border-[var(--abv-azure)]/50 transition-colors text-left"
          >
            <div className="text-2xl mb-2">📄</div>
            <p className="font-semibold text-sm text-[var(--abv-text)] dark:text-white">I have an existing avatar</p>
            <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/40 mt-1">Paste your document and we&apos;ll extract what we need</p>
          </button>
          <button
            onClick={() => onNext({ avatarPath: "build_later" })}
            className="p-4 border-2 border-[var(--abv-text)]/10 dark:border-white/10 rounded-xl hover:border-[var(--abv-azure)]/50 transition-colors text-left"
          >
            <div className="text-2xl mb-2">🛠️</div>
            <p className="font-semibold text-sm text-[var(--abv-text)] dark:text-white">I need to build one</p>
            <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/40 mt-1">The Avatar Architect will guide you through it (~10 min)</p>
          </button>
        </div>
      </div>
    );
  }

  // Importing
  if (subState === "importing") {
    return (
      <div className="space-y-4">
        <textarea
          value={pastedText}
          onChange={(e) => { setPastedText(e.target.value); setExtractError(null); }}
          rows={8}
          placeholder="Paste your ideal client avatar document here..."
          className="w-full border border-[var(--abv-text)]/20 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-[var(--abv-text)] dark:text-white placeholder-[var(--abv-text)]/30 dark:placeholder-white/30 bg-white dark:bg-[#0f1419] focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/40 resize-y"
        />
        {extractError && <p className="text-sm text-red-500">{extractError}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => { setSubState("choice"); setExtractError(null); }}
            className="text-sm text-[var(--abv-text)]/50 dark:text-white/40 hover:text-[var(--abv-text)] dark:hover:text-white transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={handleExtract}
            disabled={extracting || !pastedText.trim()}
            className="flex-1 bg-[var(--abv-dark)] hover:bg-[#2bb0ec] text-white font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-40"
          >
            {extracting ? "Analysing your avatar..." : "Extract & Continue"}
          </button>
        </div>
      </div>
    );
  }

  // Confirming
  return (
    <div className="space-y-4">
      <div className="bg-[var(--abv-bg)] dark:bg-[#0f1419] rounded-lg p-4 space-y-3">
        {extractedData?.avatar_name && (
          <div>
            <p className="text-xs font-semibold text-[var(--abv-text)]/40 dark:text-white/30 uppercase tracking-wide">Avatar Name</p>
            <p className="text-sm text-[var(--abv-text)] dark:text-white mt-0.5">{extractedData.avatar_name}</p>
          </div>
        )}
        {extractedData?.avatar_summary && (
          <div>
            <p className="text-xs font-semibold text-[var(--abv-text)]/40 dark:text-white/30 uppercase tracking-wide">Avatar Description</p>
            <p className="text-sm text-[var(--abv-text)]/70 dark:text-white/60 mt-0.5 line-clamp-3">{extractedData.avatar_summary}</p>
          </div>
        )}
        {extractedData?.content_themes && Array.isArray(extractedData.content_themes) && extractedData.content_themes.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[var(--abv-text)]/40 dark:text-white/30 uppercase tracking-wide mb-1.5">Content Themes</p>
            <div className="flex flex-wrap gap-1.5">
              {extractedData.content_themes.map((t: any, i: number) => (
                <span key={i} className="text-xs bg-[var(--abv-dark)]/10 text-[var(--abv-azure)] rounded-full px-2 py-0.5">
                  {t.emoji ? `${t.emoji} ` : ""}{t.name ?? t}
                </span>
              ))}
            </div>
          </div>
        )}
        <p className="text-xs text-[var(--abv-text)]/40 dark:text-white/30">
          Does this look right? You can refine it later in the Avatar Architect.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => { setSubState("importing"); setExtractedData(null); }}
          className="text-sm text-[var(--abv-text)]/50 dark:text-white/40 hover:text-[var(--abv-text)] dark:hover:text-white transition-colors"
        >
          ← Re-paste
        </button>
        <button
          onClick={() => onNext({ avatarPath: "imported", extractedAvatar: extractedData })}
          className="flex-1 bg-[var(--abv-dark)] hover:bg-[#2bb0ec] text-white font-semibold text-sm py-2.5 rounded-lg transition-colors"
        >
          Looks Good — Continue
        </button>
      </div>
    </div>
  );
}
