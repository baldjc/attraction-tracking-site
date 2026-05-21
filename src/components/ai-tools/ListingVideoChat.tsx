"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { AiThinking } from "@/components/ai/AiThinking";

interface TitleOption {
  title: string;
  framework: string;
}

interface ListingOption {
  frameworkName: string;
  frameworkNumber: number;
  canonicalTheme: string;
  workingTitle: string;
  titleOptions: TitleOption[];
  angle: string;
  talkingPoints: string[];
  leadMagnetHook: string;
  shelfLifeNote: string;
  dataToFind: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  initialResponse: string;
  propertyData: {
    propertyAddress: string;
    price: string;
    propertyType: string;
    keyFeatures: string;
    neighbourhoodHighlights: string;
    mlsRemarks: string;
    creatorOpinion: string;
    extractedFileText: string;
  };
  onReset: () => void;
  calendarEnabled?: boolean;
}

function parseOptions(text: string): ListingOption[] | null {
  const match = text.match(/<LISTING_VIDEO_OPTIONS>([\s\S]*?)<\/LISTING_VIDEO_OPTIONS>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

function getTextOutside(text: string): { before: string; after: string } {
  const match = text.match(/<LISTING_VIDEO_OPTIONS>[\s\S]*?<\/LISTING_VIDEO_OPTIONS>/);
  if (!match || match.index === undefined) return { before: text, after: "" };
  const before = text.slice(0, match.index).trim();
  const after = text.slice(match.index + match[0].length).trim();
  return { before, after };
}

const THEME_EMOJI: Record<string, string> = {
  "The Numbers": "📊",
  "The Purchase": "🏠",
  "The Strategy": "🎯",
  "The Neighbourhood": "🗺️",
  "The Transition": "🔄",
  "The Equity": "📈",
  "The Aftermath": "🌅",
  "The Decision": "⚖️",
};

function OptionCard({
  option,
  onDevelop,
  onSendToScript,
  onSaveToPlanner,
  onSaveToCalendar,
  calendarEnabled,
}: {
  option: ListingOption;
  onDevelop: (opt: ListingOption) => void;
  onSendToScript: (opt: ListingOption) => void;
  onSaveToPlanner: (opt: ListingOption) => void;
  onSaveToCalendar: (opt: ListingOption) => Promise<void>;
  calendarEnabled?: boolean;
}) {
  const [showPoints, setShowPoints] = useState(false);
  const [showData, setShowData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [calSaving, setCalSaving] = useState(false);
  const [calSaved, setCalSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSaveToPlanner(option);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleCalendarSave() {
    setCalSaving(true);
    try {
      await onSaveToCalendar(option);
      setCalSaved(true);
    } finally {
      setCalSaving(false);
    }
  }

  return (
    <div className="bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-9 h-9 rounded-full bg-[#6ba3c7]/10 flex items-center justify-center text-lg">
          {THEME_EMOJI[option.canonicalTheme] ?? "🏠"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-xs font-bold uppercase tracking-wider text-[#6ba3c7]">{option.frameworkName}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#2f3437]/8 dark:bg-white/8 text-[#2f3437]/50 dark:text-white/50 font-medium">
              {option.canonicalTheme}
            </span>
          </div>
          <h3 className="text-sm font-bold text-[#2f3437] dark:text-white leading-snug">{option.workingTitle}</h3>
        </div>
      </div>

      {/* Angle */}
      <p className="text-sm text-[#2f3437]/70 dark:text-white/70 leading-relaxed">{option.angle}</p>

      {/* Shelf life note */}
      <div className="flex items-start gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-lg px-3 py-2">
        <span className="text-sm">♻️</span>
        <p className="text-xs text-emerald-700 dark:text-emerald-300">{option.shelfLifeNote}</p>
      </div>

      {/* Talking points toggle */}
      <div>
        <button
          onClick={() => setShowPoints((o) => !o)}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#2f3437]/60 dark:text-white/60 hover:text-[#6ba3c7] transition-colors"
        >
          {showPoints ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
          {showPoints ? "Hide" : "Show"} Talking Points ({option.talkingPoints.length})
        </button>
        {showPoints && (
          <ol className="mt-2 space-y-1.5">
            {option.talkingPoints.map((pt, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[#2f3437]/70 dark:text-white/70">
                <span className="text-[#6ba3c7] font-bold shrink-0">{i + 1}.</span>
                <span>{pt}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Data to find toggle */}
      <div>
        <button
          onClick={() => setShowData((o) => !o)}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#2f3437]/60 dark:text-white/60 hover:text-[#6ba3c7] transition-colors"
        >
          {showData ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
          {showData ? "Hide" : "Show"} Data to Find
        </button>
        {showData && (
          <div className="mt-2 bg-[#f7f6f3] dark:bg-[#0f1419] border border-[#2f3437]/8 dark:border-white/8 rounded-lg px-3 py-2">
            <p className="text-xs text-[#2f3437]/70 dark:text-white/70 leading-relaxed">{option.dataToFind}</p>
          </div>
        )}
      </div>

      {/* Lead magnet hook */}
      {option.leadMagnetHook && (
        <div className="flex items-start gap-2 bg-[#6ba3c7]/8 border border-[#6ba3c7]/20 rounded-lg px-3 py-2">
          <span className="text-sm">🎁</span>
          <p className="text-xs text-[#2f3437]/70 dark:text-white/70">{option.leadMagnetHook}</p>
        </div>
      )}

      {/* Alt titles */}
      {option.titleOptions && option.titleOptions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[#2f3437]/40 dark:text-white/40 uppercase tracking-wider mb-1.5">Alt Titles</p>
          <div className="space-y-1">
            {option.titleOptions.map((t, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2f3437]/6 dark:bg-white/6 text-[#2f3437]/50 dark:text-white/40 font-medium shrink-0 mt-0.5">{t.framework}</span>
                <p className="text-xs text-[#2f3437]/70 dark:text-white/70">{t.title}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={() => onDevelop(option)}
          className="flex-1 min-w-[120px] py-2 px-3 bg-[#6ba3c7] hover:bg-[#5a8fb3] text-white text-xs font-semibold rounded-lg transition-colors"
        >
          Develop This One
        </button>
        <button
          onClick={() => onSendToScript(option)}
          className="flex-1 min-w-[120px] py-2 px-3 border border-[#2f3437]/15 dark:border-white/15 text-[#2f3437] dark:text-white text-xs font-semibold rounded-lg hover:bg-[#2f3437]/5 dark:hover:bg-white/5 transition-colors"
        >
          Send to Script Builder
        </button>
        {calendarEnabled && (
          <button
            onClick={handleCalendarSave}
            disabled={calSaving || calSaved}
            className="py-2 px-3 border border-[#6ba3c7]/30 text-[#6ba3c7] text-xs font-semibold rounded-lg hover:bg-[#6ba3c7]/5 disabled:opacity-50 transition-colors"
          >
            {calSaved ? "Added to Calendar ✓" : calSaving ? "Adding…" : "📅 Add to Calendar"}
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving || saved}
          className="py-2 px-3 border border-[#2f3437]/15 dark:border-white/15 text-[#2f3437]/60 dark:text-white/60 text-xs font-semibold rounded-lg hover:bg-[#2f3437]/5 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
        >
          {saved ? "Saved ✓" : saving ? "Saving…" : "Save to Planner"}
        </button>
      </div>
    </div>
  );
}

export default function ListingVideoChat({ initialResponse, propertyData, onReset, calendarEnabled }: Props) {
  const options = parseOptions(initialResponse);
  const { before, after } = getTextOutside(initialResponse);

  const [selectedOption, setSelectedOption] = useState<ListingOption | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regeneratedResponse, setRegeneratedResponse] = useState<string | null>(null);

  const displayResponse = regeneratedResponse ?? initialResponse;
  const displayOptions = parseOptions(displayResponse);
  const { before: displayBefore, after: displayAfter } = getTextOutside(displayResponse);

  function handleSendToScript(opt: ListingOption) {
    try {
      sessionStorage.setItem("arc_prefill", JSON.stringify({
        title: opt.workingTitle,
        talkingPoints: opt.talkingPoints,
        themeName: opt.canonicalTheme,
        dataToFind: opt.dataToFind,
      }));
    } catch {}
    window.location.href = window.location.pathname.includes("/admin/") 
      ? "/admin/ai-tools/arc-script-builder" 
      : "/member/ai-tools/arc-script-builder";
  }

  async function handleSaveToPlanner(opt: ListingOption) {
    await fetch("/api/ai-tools/content-engine/save-idea", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme: opt.canonicalTheme,
        title: opt.workingTitle,
        talkingPoints: opt.talkingPoints,
        framework: opt.frameworkName,
        whyItWorks: opt.angle,
        dataToFind: opt.dataToFind,
        source: "listing_video_builder",
      }),
    });
  }

  async function handleSaveToCalendar(opt: ListingOption) {
    const notes = [
      opt.angle,
      opt.talkingPoints.length > 0 ? `\nTalking points:\n${opt.talkingPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}` : "",
      opt.dataToFind ? `\nData to find:\n${opt.dataToFind}` : "",
      opt.leadMagnetHook ? `\nLead magnet hook:\n${opt.leadMagnetHook}` : "",
    ].filter(Boolean).join("\n");

    await fetch("/api/member/content-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: opt.workingTitle,
        status: "Idea",
        theme: opt.canonicalTheme,
        notes,
      }),
    });
  }

  async function handleDevelop(opt: ListingOption) {
    setSelectedOption(opt);
    setMessages([
      { role: "user", content: `I'd like to develop option "${opt.frameworkName}" — "${opt.workingTitle}". Let's refine this concept further.` },
    ]);
    setChatLoading(true);
    try {
      const res = await fetch("/api/ai-tools/listing-video-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...propertyData,
          messages: [
            { role: "user", content: `I've reviewed your 3 options. I'd like to develop: "${opt.frameworkName}" — "${opt.workingTitle}". Please give me more detail on how to structure this video, what to say in each section, and how to make it feel natural on camera.` },
          ],
        }),
      });
      const data = await res.json();
      setMessages([
        { role: "user", content: `Let's develop "${opt.frameworkName}" — "${opt.workingTitle}".` },
        { role: "assistant", content: data.message },
      ]);
    } catch {
      setMessages([
        { role: "user", content: `Let's develop "${opt.frameworkName}" — "${opt.workingTitle}".` },
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  async function handleSendChat() {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: Message = { role: "user", content: chatInput.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await fetch("/api/ai-tools/listing-video-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...propertyData,
          messages: newMessages,
        }),
      });
      const data = await res.json();
      setMessages([...newMessages, { role: "assistant", content: data.message }]);
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setChatLoading(false);
    }
  }

  async function handleRegenerate() {
    setRegenLoading(true);
    setRegeneratedResponse(null);
    setSelectedOption(null);
    setMessages([]);
    try {
      const res = await fetch("/api/ai-tools/listing-video-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...propertyData,
          messages: [
            { role: "user", content: `Please generate 3 completely different video concept angles for this listing. Avoid the frameworks you suggested last time and try fresh approaches.` },
          ],
        }),
      });
      const data = await res.json();
      setRegeneratedResponse(data.message);
    } catch {
      // silent
    } finally {
      setRegenLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Intro text */}
      {displayBefore && (
        <p className="text-sm text-[#2f3437]/70 dark:text-white/70 leading-relaxed whitespace-pre-wrap">{displayBefore}</p>
      )}

      {/* Options */}
      {!selectedOption && displayOptions && (
        <>
          <div className="space-y-4">
            {displayOptions.map((opt, i) => (
              <OptionCard
                key={i}
                option={opt}
                onDevelop={handleDevelop}
                onSendToScript={handleSendToScript}
                onSaveToPlanner={handleSaveToPlanner}
                onSaveToCalendar={handleSaveToCalendar}
                calendarEnabled={calendarEnabled}
              />
            ))}
          </div>

          {displayAfter && (
            <p className="text-sm text-[#2f3437]/60 dark:text-white/60 leading-relaxed whitespace-pre-wrap">{displayAfter}</p>
          )}

          {/* Regenerate + Reset */}
          <div className="flex gap-3">
            <button
              onClick={handleRegenerate}
              disabled={regenLoading}
              className="flex-1 py-2.5 px-4 border border-[#2f3437]/15 dark:border-white/15 text-[#2f3437]/60 dark:text-white/60 text-sm font-medium rounded-lg hover:bg-[#2f3437]/5 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
            >
              {regenLoading ? "Generating…" : "Try Different Angles"}
            </button>
            <button
              onClick={onReset}
              className="py-2.5 px-4 border border-[#2f3437]/15 dark:border-white/15 text-[#2f3437]/40 dark:text-white/40 text-sm rounded-lg hover:bg-[#2f3437]/5 dark:hover:bg-white/5 transition-colors"
            >
              Start Over
            </button>
          </div>
        </>
      )}

      {/* Chat refinement */}
      {selectedOption && (
        <>
          <div className="bg-[#6ba3c7]/8 border border-[#6ba3c7]/20 rounded-lg px-4 py-3">
            <p className="text-xs font-semibold text-[#6ba3c7] mb-0.5">Developing</p>
            <p className="text-sm font-bold text-[#2f3437] dark:text-white">{selectedOption.workingTitle}</p>
          </div>

          {/* Message thread */}
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`${
                  m.role === "user"
                    ? "flex justify-end"
                    : ""
                }`}
              >
                {m.role === "user" ? (
                  <div className="max-w-sm bg-[#6ba3c7] text-white rounded-xl px-4 py-2.5 text-sm">
                    {m.content}
                  </div>
                ) : (
                  <div className="bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-[#2f3437] dark:text-white whitespace-pre-wrap leading-relaxed">
                    {m.content}
                  </div>
                )}
              </div>
            ))}
            {chatLoading && (
              <AiThinking mode="quick" />
            )}
          </div>

          {/* Chat input */}
          <div className="flex gap-2">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat(); }
              }}
              placeholder="Ask for adjustments, alternative titles, more data ideas…"
              rows={2}
              className="flex-1 bg-white dark:bg-[#0f1419] border border-[#2f3437]/20 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-[#2f3437] dark:text-white placeholder-[#2f3437]/30 dark:placeholder-white/30 resize-none focus:outline-none focus:border-[#6ba3c7] transition-colors"
            />
            <button
              onClick={handleSendChat}
              disabled={!chatInput.trim() || chatLoading}
              className="px-4 py-2 bg-[#6ba3c7] hover:bg-[#5a8fb3] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors self-end"
            >
              Send
            </button>
          </div>

          {/* Action row */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => handleSendToScript(selectedOption)}
              className="flex-1 min-w-[140px] py-2 px-3 border border-[#2f3437]/15 dark:border-white/15 text-[#2f3437] dark:text-white text-xs font-semibold rounded-lg hover:bg-[#2f3437]/5 dark:hover:bg-white/5 transition-colors"
            >
              Send to Script Builder
            </button>
            <button
              onClick={() => { setSelectedOption(null); setMessages([]); }}
              className="py-2 px-3 border border-[#2f3437]/15 dark:border-white/15 text-[#2f3437]/50 dark:text-white/50 text-xs rounded-lg hover:bg-[#2f3437]/5 dark:hover:bg-white/5 transition-colors"
            >
              ← Back to Options
            </button>
            <button
              onClick={onReset}
              className="py-2 px-3 border border-[#2f3437]/15 dark:border-white/15 text-[#2f3437]/40 dark:text-white/40 text-xs rounded-lg hover:bg-[#2f3437]/5 dark:hover:bg-white/5 transition-colors"
            >
              Start Over
            </button>
          </div>
        </>
      )}

      {/* Fallback if no options parsed */}
      {!options && !displayOptions && (
        <div className="bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-xl px-4 py-4 text-sm text-[#2f3437] dark:text-white whitespace-pre-wrap leading-relaxed">
          {displayResponse}
        </div>
      )}
    </div>
  );
}
