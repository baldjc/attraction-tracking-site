"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  CheckIcon,
  SparklesIcon,
} from "@heroicons/react/24/solid";
import { ArrowLeftIcon as ArrowLeftOutline } from "@heroicons/react/24/outline";
import { PRINCIPLE_NAMES, PRINCIPLE_COLORS } from "@/lib/academy-constants";

interface WorkbookField {
  id: string;
  fieldType: string;
  label: string;
  placeholderText: string | null;
  sortOrder: number;
  config: any;
  response: any;
}

interface LessonData {
  id: string;
  title: string;
  slug: string;
  youtubeUrl: string | null;
  description: string | null;
  keyTakeaways: string | null;
  actionItems: string | null;
  principleTags: string[];
  aiToolLink: string | null;
  aiToolLabel: string | null;
  section: { id: string; title: string; slug: string; sortOrder: number };
  workbookFields: WorkbookField[];
  homework: { homeworkItems: { label: string; completed: boolean }[] } | null;
  completed: boolean;
  completedAt: string | null;
  prevLesson: { id: string; slug: string; sectionSlug: string } | null;
  nextLesson: { id: string; slug: string; sectionSlug: string } | null;
}

interface RelatedMoment {
  callId: string;
  callTitle: string;
  callDate: string;
  fathomShareUrl: string;
  entries: {
    id: string;
    summary: string;
    subTopic: string;
    principles: string[];
    timestampStart: number | null;
    timestampEnd: number | null;
    isGeneralTeaching: boolean;
  }[];
}

function getYouTubeEmbedUrl(url: string): string | null {
  const m1 = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
  if (m1) return `https://www.youtube.com/embed/${m1[1]}`;
  const m2 = url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
  if (m2) return `https://www.youtube.com/embed/${m2[1]}`;
  return null;
}

function parseActionItems(markdown: string | null): string[] {
  if (!markdown) return [];
  return markdown
    .split("\n")
    .map((l) => l.replace(/^-\s*/, "").trim())
    .filter(Boolean);
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

function useDebounce(fn: (value: any) => void, delay: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (value: any) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fn(value), delay);
    },
    [fn, delay]
  );
}

function ShortTextField({ field, onSave }: { field: WorkbookField; onSave: (fieldId: string, response: any) => void }) {
  const [value, setValue] = useState<string>((field.response as any)?.value ?? "");
  const debouncedSave = useDebounce((v: string) => onSave(field.id, { value: v }), 1000);
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--abv-text)] dark:text-white mb-1.5">{field.label}</label>
      <input
        type="text"
        value={value}
        placeholder={field.placeholderText ?? ""}
        onChange={(e) => { setValue(e.target.value); debouncedSave(e.target.value); }}
        className="w-full px-3 py-2 text-sm border border-[var(--abv-border-strong)] dark:border-white/20 rounded-lg bg-white dark:bg-white/5 text-[var(--abv-text)] dark:text-white focus:ring-2 focus:ring-[var(--abv-azure)] focus:border-transparent outline-none"
      />
    </div>
  );
}

function LongTextField({ field, onSave }: { field: WorkbookField; onSave: (fieldId: string, response: any) => void }) {
  const rows = field.config?.rows ?? 4;
  const [value, setValue] = useState<string>((field.response as any)?.value ?? "");
  const debouncedSave = useDebounce((v: string) => onSave(field.id, { value: v }), 1000);
  return (
    <div>
      <label className="block text-sm font-medium text-[var(--abv-text)] dark:text-white mb-1.5">{field.label}</label>
      <textarea
        value={value}
        rows={rows}
        placeholder={field.placeholderText ?? ""}
        onChange={(e) => { setValue(e.target.value); debouncedSave(e.target.value); }}
        className="w-full px-3 py-2 text-sm border border-[var(--abv-border-strong)] dark:border-white/20 rounded-lg bg-white dark:bg-white/5 text-[var(--abv-text)] dark:text-white focus:ring-2 focus:ring-[var(--abv-azure)] focus:border-transparent outline-none resize-y"
      />
    </div>
  );
}

function ChecklistField({ field, onSave }: { field: WorkbookField; onSave: (fieldId: string, response: any) => void }) {
  const items: string[] = field.config?.items ?? [];
  const savedChecked: boolean[] = (field.response as any)?.checked ?? items.map(() => false);
  const [checked, setChecked] = useState<boolean[]>(savedChecked);

  function toggle(i: number) {
    const next = [...checked];
    next[i] = !next[i];
    setChecked(next);
    onSave(field.id, { checked: next });
  }

  return (
    <div>
      <label className="block text-sm font-medium text-[var(--abv-text)] dark:text-white mb-2">{field.label}</label>
      <div className="space-y-2">
        {items.map((item, i) => (
          <label key={i} className="flex items-start gap-2.5 cursor-pointer group">
            <div
              onClick={() => toggle(i)}
              className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                checked[i] ? "bg-[var(--abv-dark)] border-[var(--abv-azure)]" : "border-[var(--abv-border-strong)] dark:border-white/30 group-hover:border-[var(--abv-azure)]"
              }`}
            >
              {checked[i] && <CheckIcon className="w-2.5 h-2.5 text-white" />}
            </div>
            <span
              onClick={() => toggle(i)}
              className={`text-sm leading-relaxed ${checked[i] ? "line-through text-[var(--abv-text)]/40 dark:text-white/40" : "text-[var(--abv-text)] dark:text-white"}`}
            >
              {item}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function TableField({ field, onSave }: { field: WorkbookField; onSave: (fieldId: string, response: any) => void }) {
  const columns: { key: string; label: string; type: string }[] = field.config?.columns ?? [];
  const rowCount: number = field.config?.rowCount ?? 3;
  const prefillRows: Record<string, string>[] = field.config?.prefillRows ?? [];

  function initRows(): Record<string, string>[] {
    const saved: Record<string, string>[] | undefined = (field.response as any)?.rows;
    if (saved && saved.length > 0) return saved;
    if (prefillRows.length > 0) return [...prefillRows];
    return Array.from({ length: rowCount }, () => Object.fromEntries(columns.map((c) => [c.key, ""])));
  }

  const [rows, setRows] = useState<Record<string, string>[]>(initRows);
  const debouncedSave = useDebounce((r: any) => onSave(field.id, { rows: r }), 1000);

  function update(rowIdx: number, colKey: string, value: string) {
    const next = rows.map((r, i) => (i === rowIdx ? { ...r, [colKey]: value } : r));
    setRows(next);
    debouncedSave(next);
  }

  return (
    <div>
      <label className="block text-sm font-medium text-[var(--abv-text)] dark:text-white mb-2">{field.label}</label>
      <div className="overflow-x-auto rounded-lg border border-[var(--abv-border-strong)] dark:border-white/20">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--abv-bg)] dark:bg-white/5 border-b border-[var(--abv-border-strong)] dark:border-white/20">
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-2 text-left text-xs font-semibold text-[var(--abv-text)]/60 dark:text-white/60 uppercase tracking-wider">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b border-[var(--abv-border-strong)] dark:border-white/10 last:border-0">
                {columns.map((col) => (
                  <td key={col.key} className="px-2 py-1.5">
                    {col.type === "checkbox" ? (
                      <input
                        type="checkbox"
                        checked={row[col.key] === "true"}
                        onChange={(e) => update(rowIdx, col.key, e.target.checked ? "true" : "false")}
                        className="w-4 h-4 accent-[var(--abv-azure)]"
                      />
                    ) : (
                      <input
                        type="text"
                        value={row[col.key] ?? ""}
                        onChange={(e) => update(rowIdx, col.key, e.target.value)}
                        className="w-full px-2 py-1 text-sm bg-transparent text-[var(--abv-text)] dark:text-white outline-none focus:bg-[var(--abv-bg)] dark:focus:bg-white/5 rounded transition-colors"
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RelatedMomentsSection({ principles }: { principles: string[] }) {
  const [moments, setMoments] = useState<RelatedMoment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (principles.length === 0) { setLoading(false); return; }
    const qs = principles.map((p) => `principle=${encodeURIComponent(p)}`).join("&");
    fetch(`/api/member/generate-leads/training/related-moments?${qs}`)
      .then((r) => r.json())
      .then((d) => setMoments(d.moments ?? []))
      .finally(() => setLoading(false));
  }, [principles.join(",")]);

  if (loading) return <div className="text-sm text-[var(--abv-text)]/40 dark:text-white/40 animate-pulse py-4">Loading related moments…</div>;
  if (moments.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="text-sm font-bold text-[var(--abv-text)] dark:text-white uppercase tracking-wider mb-4">
        Related Q&A Moments
      </h3>
      <div className="space-y-4">
        {moments.map((m) => (
          <div key={m.callId} className="bg-white dark:bg-[#1a2433] rounded-lg border border-[var(--abv-border-strong)] dark:border-white/10 overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--abv-border-strong)] dark:border-white/10 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--abv-text)] dark:text-white">{m.callTitle}</p>
                <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/50 mt-0.5">
                  {new Date(m.callDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>
              </div>
              {m.fathomShareUrl && (
                <a
                  href={m.fathomShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--abv-azure)] hover:text-[var(--abv-azure)] font-medium shrink-0 transition-colors"
                >
                  Watch call →
                </a>
              )}
            </div>
            <div className="divide-y divide-[var(--abv-border-strong)] dark:divide-white/10">
              {m.entries.map((e) => (
                <div key={e.id} className="px-5 py-4">
                  {e.subTopic && (
                    <p className="text-xs font-semibold text-[var(--abv-azure)] uppercase tracking-wider mb-1.5">{e.subTopic}</p>
                  )}
                  <p className="text-sm text-[var(--abv-text)] dark:text-white/90 leading-relaxed">{e.summary}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {e.principles.map((tag) => (
                      <span key={tag} className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRINCIPLE_COLORS[tag] ?? "bg-gray-100 text-gray-600"}`}>
                        {PRINCIPLE_NAMES[tag] ?? tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const PRINCIPLE_TO_TOOL: Record<string, { emoji: string; title: string; desc: string; href: string; button: string }> = {
  avatar_clarity: {
    emoji: "🎯",
    title: "Refine Your Avatar",
    desc: "Apply what you just learned to sharpen your ideal viewer profile.",
    href: "/member/ai-tools/avatar-architect",
    button: "Open Avatar Architect",
  },
  themes_over_topics: {
    emoji: "💡",
    title: "Generate Content Ideas",
    desc: "Use the Content Engine to brainstorm themes based on this lesson.",
    href: "/member/ai-tools/content-engine",
    button: "Open Content Engine",
  },
  arc_attention: {
    emoji: "🎬",
    title: "Write a Script Hook",
    desc: "Practice writing attention-grabbing hooks using the Script Builder.",
    href: "/member/ai-tools/arc-script-builder",
    button: "Open Script Builder",
  },
  arc_revelation: {
    emoji: "🎬",
    title: "Build Your Script's Revelation",
    desc: "Practice the revelation arc in a script using the Script Builder.",
    href: "/member/ai-tools/arc-script-builder",
    button: "Open Script Builder",
  },
  arc_connection: {
    emoji: "🎬",
    title: "Strengthen Your Script's Connection",
    desc: "Practice connection techniques in a script.",
    href: "/member/ai-tools/arc-script-builder",
    button: "Open Script Builder",
  },
  title_frameworks: {
    emoji: "🔍",
    title: "Test a Title",
    desc: "Run a title through the analyser to see how it scores.",
    href: "/member/ai-tools/title-thumbnail-analyzer",
    button: "Open Title Analyser",
  },
  approve_the_click: {
    emoji: "🔍",
    title: "Analyse Your Thumbnail",
    desc: "Test a title + thumbnail combo against the Attraction framework.",
    href: "/member/ai-tools/title-thumbnail-analyzer",
    button: "Open Title Analyser",
  },
};

const DEFAULT_PRACTICE = {
  emoji: "📋",
  title: "Review a Script",
  desc: "Score any script against the 14 Attraction principles.",
  href: "/member/ai-tools/script-review",
  button: "Open Script Review",
};

export default function GenerateLeadsLessonClient({
  sectionSlug,
  lessonSlug,
}: {
  sectionSlug: string;
  lessonSlug: string;
}) {
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "workbook">("overview");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [homeworkItems, setHomeworkItems] = useState<{ label: string; completed: boolean }[]>([]);
  const [completed, setCompleted] = useState(false);
  const [markingComplete, setMarkingComplete] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  useEffect(() => {
    fetch(`/api/member/generate-leads/training/lessons/${lessonSlug}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.lesson) {
          setLesson(d.lesson);
          setCompleted(d.lesson.completed);
          const actionItems = parseActionItems(d.lesson.actionItems);
          if (d.lesson.homework?.homeworkItems?.length) {
            setHomeworkItems(d.lesson.homework.homeworkItems);
          } else {
            setHomeworkItems(actionItems.map((label) => ({ label, completed: false })));
          }
        }
      })
      .finally(() => setLoading(false));
  }, [lessonSlug]);

  const saveWorkbookField = useCallback(async (fieldId: string, response: any) => {
    setSaveStatus("saving");
    try {
      const res = await fetch(`/api/member/generate-leads/training/workbook/${fieldId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      if (res.ok) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2500);
      } else {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 5000);
      }
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 5000);
    }
  }, []);

  async function toggleHomework(i: number) {
    if (!lesson) return;
    const next = homeworkItems.map((item, idx) =>
      idx === i ? { ...item, completed: !item.completed } : item
    );
    setHomeworkItems(next);
    await fetch(`/api/member/generate-leads/training/lessons/${lesson.id}/homework`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeworkItems: next }),
    });
  }

  async function toggleComplete() {
    if (!lesson || markingComplete) return;
    setMarkingComplete(true);
    const next = !completed;
    try {
      await fetch(`/api/member/generate-leads/training/lessons/${lesson.id}/progress`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: next }),
      });
      setCompleted(next);
      if (next) {
        setJustCompleted(true);
        setTimeout(() => setJustCompleted(false), 700);
      }
    } finally {
      setMarkingComplete(false);
    }
  }

  const embedUrl = lesson?.youtubeUrl ? getYouTubeEmbedUrl(lesson.youtubeUrl) : null;

  if (loading) {
    return (
      <div className="max-w-3xl">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-[var(--abv-border-strong)] dark:bg-white/10 rounded w-2/3" />
          <div className="h-8 bg-[var(--abv-border-strong)] dark:bg-white/10 rounded w-full" />
          <div className="aspect-video bg-[var(--abv-border-strong)] dark:bg-white/10 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-[var(--abv-text)]/50 dark:text-white/50">Lesson not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5 flex-wrap text-sm">
        <Link href="/member/generate-leads" className="flex items-center gap-1 text-[var(--abv-text)]/50 dark:text-white/50 hover:text-[var(--abv-text)] dark:hover:text-white transition-colors">
          <ArrowLeftOutline className="w-4 h-4" />
          Generate Leads
        </Link>
        <span className="text-[var(--abv-text)]/30 dark:text-white/30">/</span>
        <Link href={`/member/generate-leads/training/${sectionSlug}`} className="text-[var(--abv-text)]/50 dark:text-white/50 hover:text-[var(--abv-text)] dark:hover:text-white transition-colors truncate">
          {lesson.section.title}
        </Link>
        <span className="text-[var(--abv-text)]/30 dark:text-white/30">/</span>
        <span className="text-[var(--abv-text)] dark:text-white font-medium truncate">{lesson.title}</span>
      </div>

      {/* Title + tags */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-[var(--abv-text)] dark:text-white mb-2">{lesson.title}</h1>
        <div className="flex flex-wrap gap-1.5">
          {(lesson.principleTags as string[]).map((tag) => (
            <span key={tag} className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRINCIPLE_COLORS[tag] ?? "bg-gray-100 text-gray-600"}`}>
              {PRINCIPLE_NAMES[tag] ?? tag}
            </span>
          ))}
        </div>
      </div>

      {/* YouTube embed */}
      {embedUrl && (
        <div className="relative pb-[56.25%] h-0 rounded-lg overflow-hidden mb-6 bg-black">
          <iframe
            src={embedUrl}
            title={lesson.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute top-0 left-0 w-full h-full"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-[var(--abv-border-strong)] dark:border-white/10 mb-6">
        <div className="flex gap-0">
          {(["overview", "workbook"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
                tab === t
                  ? "border-[var(--abv-azure)] text-[var(--abv-azure)]"
                  : "border-transparent text-[var(--abv-text)]/50 dark:text-white/50 hover:text-[var(--abv-text)] dark:hover:text-white"
              }`}
            >
              {t}
              {t === "workbook" && lesson.workbookFields.length > 0 && (
                <span className="ml-1.5 text-xs bg-[var(--abv-dark)]/10 text-[var(--abv-azure)] px-1.5 py-0.5 rounded-full">
                  {lesson.workbookFields.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Overview tab */}
      {tab === "overview" && (
        <div className="space-y-6">
          {lesson.description && (
            <div className="bg-white dark:bg-[#1a2433] rounded-lg border border-[var(--abv-border-strong)] dark:border-white/10 p-6">
              <p className="text-sm text-[var(--abv-text)] dark:text-white leading-relaxed">{lesson.description}</p>
            </div>
          )}

          {lesson.keyTakeaways && (
            <div className="bg-white dark:bg-[#1a2433] rounded-lg border border-[var(--abv-border-strong)] dark:border-white/10 p-6">
              <h3 className="text-sm font-bold text-[var(--abv-text)] dark:text-white uppercase tracking-wider mb-3">
                Key Takeaways
              </h3>
              <div className="prose prose-sm max-w-none text-[var(--abv-text)] dark:text-white [&_ul]:space-y-2 [&_li]:leading-relaxed [&_p]:leading-relaxed">
                <ReactMarkdown>{lesson.keyTakeaways}</ReactMarkdown>
              </div>
            </div>
          )}

          {lesson.actionItems && (
            <div className="bg-white dark:bg-[#1a2433] rounded-lg border border-[var(--abv-border-strong)] dark:border-white/10 p-6">
              <h3 className="text-sm font-bold text-[var(--abv-text)] dark:text-white uppercase tracking-wider mb-3">
                Action Items
              </h3>
              <div className="prose prose-sm max-w-none text-[var(--abv-text)] dark:text-white [&_ul]:space-y-2 [&_li]:leading-relaxed">
                <ReactMarkdown>{lesson.actionItems}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Related Q&A Moments */}
          {lesson.principleTags.length > 0 && (
            <RelatedMomentsSection principles={lesson.principleTags} />
          )}
        </div>
      )}

      {/* Workbook tab */}
      {tab === "workbook" && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-[var(--abv-text)]/60 dark:text-white/60 uppercase tracking-wider">
              Your Workbook
            </h3>
            <span className={`text-xs font-medium ${
              saveStatus === "saving" ? "text-[var(--abv-text)]/40 dark:text-white/40" :
              saveStatus === "saved" ? "text-green-600 dark:text-green-400" :
              saveStatus === "error" ? "text-[var(--abv-crimson)]" :
              "text-[var(--abv-text)]/20 dark:text-white/20"
            }`}>
              {saveStatus === "saving" && "Saving…"}
              {saveStatus === "saved" && "✓ All changes saved"}
              {saveStatus === "error" && "⚠ Save failed — your changes may not have been saved"}
              {saveStatus === "idle" && "Auto-saves as you type"}
            </span>
          </div>

          {lesson.workbookFields.length === 0 ? (
            <div className="bg-white dark:bg-[#1a2433] rounded-lg border border-[var(--abv-border-strong)] dark:border-white/10 p-8 text-center text-sm text-[var(--abv-text)]/40 dark:text-white/40">
              No workbook fields for this lesson.
            </div>
          ) : (
            <div className="space-y-5">
              {lesson.workbookFields.map((field) => (
                <div key={field.id} className="bg-white dark:bg-[#1a2433] rounded-lg border border-[var(--abv-border-strong)] dark:border-white/10 p-5">
                  {field.fieldType === "short_text" && <ShortTextField field={field} onSave={saveWorkbookField} />}
                  {field.fieldType === "long_text" && <LongTextField field={field} onSave={saveWorkbookField} />}
                  {field.fieldType === "checklist" && <ChecklistField field={field} onSave={saveWorkbookField} />}
                  {field.fieldType === "table" && <TableField field={field} onSave={saveWorkbookField} />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Homework section */}
      {homeworkItems.length > 0 && (
        <div className="mt-8 bg-white dark:bg-[#1a2433] rounded-lg border border-[var(--abv-border-strong)] dark:border-white/10 p-6">
          <h3 className="text-sm font-bold text-[var(--abv-text)] dark:text-white uppercase tracking-wider mb-4">
            Homework
          </h3>
          <div className="space-y-3">
            {homeworkItems.map((item, i) => (
              <label key={i} className="flex items-start gap-3 cursor-pointer group">
                <div
                  onClick={() => toggleHomework(i)}
                  className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                    item.completed ? "bg-[var(--abv-dark)] border-[var(--abv-azure)]" : "border-[var(--abv-border-strong)] dark:border-white/30 group-hover:border-[var(--abv-azure)]"
                  }`}
                >
                  {item.completed && <CheckIcon className="w-3 h-3 text-white" />}
                </div>
                <span
                  onClick={() => toggleHomework(i)}
                  className={`text-sm leading-relaxed ${item.completed ? "line-through text-[var(--abv-text)]/40 dark:text-white/40" : "text-[var(--abv-text)] dark:text-white"}`}
                >
                  {item.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* AI Tool CTA */}
      {lesson.aiToolLink && lesson.aiToolLabel && (
        <div className="mt-6 bg-[var(--abv-dark)]/8 dark:bg-[var(--abv-dark)]/10 border border-[var(--abv-azure)]/20 rounded-lg p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--abv-dark)]/15 rounded-lg shrink-0">
              <SparklesIcon className="w-5 h-5 text-[var(--abv-azure)]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--abv-text)] dark:text-white">Ready to put this into practice?</p>
              <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/50 mt-0.5">
                Use the {lesson.aiToolLabel} tool to apply what you've learned.
              </p>
            </div>
          </div>
          <Link
            href={lesson.aiToolLink}
            className="shrink-0 flex items-center gap-1.5 $1var(--abv-dark)$2 hover:bg-black/85 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            {lesson.aiToolLabel}
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Mark as Complete + Navigation */}
      <div className="mt-8 pt-6 border-t border-[var(--abv-border-strong)] dark:border-white/10 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {lesson.prevLesson ? (
            <Link
              href={`/member/generate-leads/training/${lesson.prevLesson.sectionSlug}/${lesson.prevLesson.slug}`}
              className="flex items-center gap-1.5 text-sm text-[var(--abv-text)]/60 dark:text-white/60 hover:text-[var(--abv-text)] dark:hover:text-white transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              Previous
            </Link>
          ) : (
            <span />
          )}
        </div>

        <button
          onClick={toggleComplete}
          disabled={markingComplete}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 ${
            completed
              ? "bg-green-500 hover:bg-green-600 text-white"
              : "border border-[var(--abv-border-strong)] dark:border-white/20 text-[var(--abv-text)] dark:text-white hover:border-green-500 hover:text-green-600 dark:hover:text-green-400"
          } ${justCompleted ? "scale-105 ring-2 ring-green-400 ring-offset-2" : ""}`}
        >
          <CheckCircleIcon className={`w-5 h-5 ${justCompleted ? "animate-bounce" : ""}`} />
          {markingComplete ? "Saving…" : completed ? "Completed!" : "Mark as Complete"}
        </button>

        {lesson.nextLesson ? (
          <Link
            href={`/member/generate-leads/training/${lesson.nextLesson.sectionSlug}/${lesson.nextLesson.slug}`}
            className="flex items-center gap-1.5 text-sm text-[var(--abv-text)]/60 dark:text-white/60 hover:text-[var(--abv-azure)] transition-colors"
          >
            Next Lesson
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
        ) : (
          <Link
            href="/member/generate-leads"
            className="flex items-center gap-1.5 text-sm text-[var(--abv-azure)] hover:text-[var(--abv-azure)] transition-colors"
          >
            All Sections
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
        )}
      </div>

      {/* Practice CTA — shows after lesson is marked complete */}
      {completed && lesson && (
        <div className="mt-4">
          {lesson.aiToolLink && lesson.aiToolLabel ? (
            <div className="bg-[var(--abv-dark)]/5 dark:bg-[var(--abv-dark)]/10 border border-[var(--abv-azure)]/20 rounded-xl p-5">
              <div className="flex items-start gap-4">
                <span className="text-2xl shrink-0 mt-0.5">🚀</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--abv-text)] dark:text-[#e2e8f0]">
                    Practice: {lesson.aiToolLabel}
                  </p>
                  <p className="text-xs text-[var(--abv-text)]/60 dark:text-[#94a3b8] mt-1">
                    Put what you just learned into action.
                  </p>
                  <a
                    href={lesson.aiToolLink}
                    className="inline-flex items-center gap-1.5 bg-[var(--abv-dark)] text-white text-sm font-semibold rounded-lg px-4 py-2 mt-3 hover:bg-black/85 transition-colors"
                  >
                    {lesson.aiToolLabel} →
                  </a>
                </div>
              </div>
            </div>
          ) : (
            (() => {
              const match = (lesson.principleTags || [])
                .map((tag: string) => PRINCIPLE_TO_TOOL[tag])
                .find(Boolean) || DEFAULT_PRACTICE;
              return (
                <div className="bg-[var(--abv-dark)]/5 dark:bg-[var(--abv-dark)]/10 border border-[var(--abv-azure)]/20 rounded-xl p-5">
                  <div className="flex items-start gap-4">
                    <span className="text-2xl shrink-0 mt-0.5">{match.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--abv-text)] dark:text-[#e2e8f0]">
                        Practice: {match.title}
                      </p>
                      <p className="text-xs text-[var(--abv-text)]/60 dark:text-[#94a3b8] mt-1">
                        {match.desc}
                      </p>
                      <a
                        href={match.href}
                        className="inline-flex items-center gap-1.5 bg-[var(--abv-dark)] text-white text-sm font-semibold rounded-lg px-4 py-2 mt-3 hover:bg-black/85 transition-colors"
                      >
                        {match.button} →
                      </a>
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
}
