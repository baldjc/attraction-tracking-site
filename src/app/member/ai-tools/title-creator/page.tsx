"use client";

import { useState, useEffect } from "react";
import { StarIcon as StarOutline } from "@heroicons/react/24/outline";
import { StarIcon as StarSolid, CheckIcon } from "@heroicons/react/24/solid";

interface TitleItem {
  title: string;
  framework: string;
  trigger: string;
  note: string;
  starred?: boolean;
  saved?: boolean;
}

interface Category {
  name: string;
  titles: TitleItem[];
}

interface AvatarData {
  avatarName?: string;
  contentThemes?: string[];
}

const TRIGGER_COLORS: Record<string, string> = {
  curiosity: "bg-blue-100 text-blue-700",
  negativity: "bg-red-100 text-red-700",
  desire: "bg-green-100 text-green-700",
  urgency: "bg-amber-100 text-amber-700",
};

export default function TitleCreatorPage() {
  const [topic, setTopic] = useState("");
  const [selectedTheme, setSelectedTheme] = useState("");
  const [avatar, setAvatar] = useState<AvatarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [followUp, setFollowUp] = useState("");
  const [refineTarget, setRefineTarget] = useState<TitleItem | null>(null);
  const [refineResult, setRefineResult] = useState<string[]>([]);
  const [refining, setRefining] = useState(false);
  const [savedTitles, setSavedTitles] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/member/avatar").then((r) => r.json()).then(setAvatar).catch(() => {});
  }, []);

  const themes: string[] = Array.isArray(avatar?.contentThemes) ? (avatar!.contentThemes as string[]) : [];

  async function generate() {
    if (!topic.trim()) return;
    setLoading(true);
    setCategories([]);
    setRefineTarget(null);
    setRefineResult([]);
    const res = await fetch("/api/ai-tools/title-creator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, selectedTheme }),
    });
    const data = await res.json();
    if (data.result?.categories) {
      setCategories(data.result.categories.map((c: Category) => ({
        ...c,
        titles: c.titles.map((t) => ({ ...t, starred: false, saved: false })),
      })));
      setFollowUp(data.result.follow_up || "");
    }
    setLoading(false);
  }

  function toggleStar(catIndex: number, titleIndex: number) {
    setCategories((prev) =>
      prev.map((c, ci) =>
        ci === catIndex
          ? { ...c, titles: c.titles.map((t, ti) => ti === titleIndex ? { ...t, starred: !t.starred } : t) }
          : c
      )
    );
  }

  async function saveTitle(title: TitleItem, catIndex: number, titleIndex: number) {
    await fetch("/api/ai-tools/save-title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.title, framework: title.framework, topic }),
    });
    setSavedTitles((prev) => new Set([...prev, title.title]));
    setCategories((prev) =>
      prev.map((c, ci) =>
        ci === catIndex
          ? { ...c, titles: c.titles.map((t, ti) => ti === titleIndex ? { ...t, saved: true } : t) }
          : c
      )
    );
  }

  async function refineTitle(title: TitleItem) {
    setRefineTarget(title);
    setRefining(true);
    setRefineResult([]);
    const res = await fetch("/api/ai-tools/title-creator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        messages: [
          { role: "user", content: `Generate titles for: ${topic}` },
          { role: "assistant", content: "Here are some title options for you." },
          { role: "user", content: `Give me 4 variations of this specific title: "${title.title}". Use the same framework (${title.framework}) but try different angles. Return them as a JSON array of strings, nothing else.` },
        ],
      }),
    });
    const data = await res.json();
    try {
      const raw = data.raw || "";
      const match = raw.match(/\[[\s\S]*?\]/);
      if (match) setRefineResult(JSON.parse(match[0]));
    } catch {
      setRefineResult(["Could not parse variations. Please try again."]);
    }
    setRefining(false);
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1e2a38]">Title Creator</h1>
        <p className="text-[#1e2a38]/60 mt-1">
          {avatar?.avatarName
            ? `Generating titles tailored to your avatar: ${avatar.avatarName}`
            : "No avatar saved — titles will be general real estate audience"}
        </p>
      </div>

      {/* Form */}
      <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6 mb-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[#1e2a38] mb-2">What's this video about?</label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={3}
              placeholder="Describe the topic, the main insight, or the challenge your viewer faces..."
              className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] resize-none transition-colors"
            />
          </div>

          {themes.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] mb-2">Content theme (optional)</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedTheme("")}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    selectedTheme === ""
                      ? "bg-[#1e2a38] text-white border-[#1e2a38]"
                      : "border-[#1e2a38]/20 text-[#1e2a38]/60 hover:border-[#1e2a38]/40"
                  }`}
                >
                  No theme
                </button>
                {themes.map((theme) => (
                  <button
                    key={theme}
                    onClick={() => setSelectedTheme(theme)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      selectedTheme === theme
                        ? "bg-[#3dc3ff] text-white border-[#3dc3ff]"
                        : "border-[#1e2a38]/20 text-[#1e2a38]/60 hover:border-[#3dc3ff]/40"
                    }`}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={generate}
            disabled={loading || !topic.trim()}
            className="w-full bg-[#3dc3ff] text-white py-3 rounded-xl font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors"
          >
            {loading ? "Generating titles..." : "Generate Titles"}
          </button>
        </div>
      </div>

      {/* Results */}
      {categories.length > 0 && (
        <div className="space-y-5">
          {categories.map((cat, ci) => (
            <div key={ci} className="bg-white border border-[#1e2a38]/10 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 bg-[#1e2a38]/5 border-b border-[#1e2a38]/10">
                <h3 className="font-semibold text-[#1e2a38] text-sm">{cat.name}</h3>
              </div>
              <div className="divide-y divide-[#1e2a38]/5">
                {cat.titles.map((title, ti) => (
                  <div key={ti} className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="font-medium text-[#1e2a38]">{title.title}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className="text-xs text-[#1e2a38]/50">{title.framework}</span>
                          {title.trigger && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TRIGGER_COLORS[title.trigger] ?? "bg-gray-100 text-gray-600"}`}>
                              {title.trigger}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#1e2a38]/50 mt-1.5 italic">{title.note}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => toggleStar(ci, ti)} className="p-1.5 rounded-lg hover:bg-amber-50 transition-colors">
                          {title.starred
                            ? <StarSolid className="w-4 h-4 text-amber-400" />
                            : <StarOutline className="w-4 h-4 text-[#1e2a38]/30 hover:text-amber-400" />}
                        </button>
                        <button
                          onClick={() => refineTitle(title)}
                          className="text-xs px-2.5 py-1 border border-[#1e2a38]/20 rounded-lg text-[#1e2a38]/60 hover:border-[#3dc3ff] hover:text-[#3dc3ff] transition-colors"
                        >
                          Refine
                        </button>
                        <button
                          onClick={() => saveTitle(title, ci, ti)}
                          disabled={title.saved || savedTitles.has(title.title)}
                          className="text-xs px-2.5 py-1 border rounded-lg transition-colors disabled:opacity-50 border-green-300 text-green-700 hover:bg-green-50"
                        >
                          {title.saved || savedTitles.has(title.title) ? <CheckIcon className="w-3.5 h-3.5" /> : "Save"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {followUp && (
            <p className="text-sm text-[#1e2a38]/60 italic text-center py-2">{followUp}</p>
          )}
        </div>
      )}

      {/* Refine panel */}
      {refineTarget && (
        <div className="mt-5 bg-[#3dc3ff]/5 border border-[#3dc3ff]/30 rounded-2xl p-5">
          <p className="font-semibold text-[#1e2a38] text-sm mb-1">Variations of:</p>
          <p className="text-[#1e2a38]/60 text-sm mb-4 italic">"{refineTarget.title}"</p>
          {refining ? (
            <p className="text-sm text-[#1e2a38]/50 animate-pulse">Generating variations...</p>
          ) : (
            <ul className="space-y-2">
              {refineResult.map((v, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-[#3dc3ff] font-bold text-sm mt-0.5">{i + 1}.</span>
                  <span className="text-sm text-[#1e2a38]">{v}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
