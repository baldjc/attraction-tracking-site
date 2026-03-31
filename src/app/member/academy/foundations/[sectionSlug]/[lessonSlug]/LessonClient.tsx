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
import {
  ArrowLeftIcon as ArrowLeftOutline,
  PlayCircleIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
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
  sectionLessons: { id: string; slug: string; title: string; completed: boolean }[];
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

// ── Workbook field components ─────────────────────────────────────────────────

function ShortTextField({
  field,
  onSave,
}: {
  field: WorkbookField;
  onSave: (fieldId: string, response: any) => void;
}) {
  const [value, setValue] = useState<string>((field.response as any)?.value ?? "");
  const debouncedSave = useDebounce((v: string) => onSave(field.id, { value: v }), 1000);
  return (
    <div>
      <label className="block text-sm font-medium text-[#2f3437] dark:text-white mb-1.5">
        {field.label}
      </label>
      <input
        type="text"
        value={value}
        placeholder={field.placeholderText ?? ""}
        onChange={(e) => { setValue(e.target.value); debouncedSave(e.target.value); }}
        className="w-full px-3 py-2 text-sm border border-[#eaeaea] dark:border-white/20 rounded-lg bg-white dark:bg-white/5 text-[#2f3437] dark:text-white focus:ring-2 focus:ring-[#6ba3c7] focus:border-transparent outline-none"
      />
    </div>
  );
}

function LongTextField({
  field,
  onSave,
}: {
  field: WorkbookField;
  onSave: (fieldId: string, response: any) => void;
}) {
  const rows = field.config?.rows ?? 4;
  const [value, setValue] = useState<string>((field.response as any)?.value ?? "");
  const debouncedSave = useDebounce((v: string) => onSave(field.id, { value: v }), 1000);
  return (
    <div>
      <label className="block text-sm font-medium text-[#2f3437] dark:text-white mb-1.5">
        {field.label}
      </label>
      <textarea
        value={value}
        rows={rows}
        placeholder={field.placeholderText ?? ""}
        onChange={(e) => { setValue(e.target.value); debouncedSave(e.target.value); }}
        className="w-full px-3 py-2 text-sm border border-[#eaeaea] dark:border-white/20 rounded-lg bg-white dark:bg-white/5 text-[#2f3437] dark:text-white focus:ring-2 focus:ring-[#6ba3c7] focus:border-transparent outline-none resize-y"
      />
    </div>
  );
}

function ChecklistField({
  field,
  onSave,
}: {
  field: WorkbookField;
  onSave: (fieldId: string, response: any) => void;
}) {
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
      <label className="block text-sm font-medium text-[#2f3437] dark:text-white mb-2">
        {field.label}
      </label>
      <div className="space-y-2">
        {items.map((item, i) => (
          <label key={i} className="flex items-start gap-2.5 cursor-pointer group">
            <div
              onClick={() => toggle(i)}
              className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                checked[i]
                  ? "bg-[#6ba3c7] border-[#6ba3c7]"
                  : "border-[#eaeaea] dark:border-white/30 group-hover:border-[#6ba3c7]"
              }`}
            >
              {checked[i] && <CheckIcon className="w-2.5 h-2.5 text-white" />}
            </div>
            <span
              onClick={() => toggle(i)}
              className={`text-sm leading-relaxed ${
                checked[i]
                  ? "line-through text-[#2f3437]/40 dark:text-white/40"
                  : "text-[#2f3437] dark:text-white"
              }`}
            >
              {item}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function TableField({
  field,
  onSave,
}: {
  field: WorkbookField;
  onSave: (fieldId: string, response: any) => void;
}) {
  const columns: { key: string; label: string; type: string }[] = field.config?.columns ?? [];
  const rowCount: number = field.config?.rowCount ?? 3;
  const prefillRows: Record<string, string>[] = field.config?.prefillRows ?? [];

  function initRows(): Record<string, string>[] {
    const saved: Record<string, string>[] | undefined = (field.response as any)?.rows;
    if (saved && saved.length > 0) return saved;
    if (prefillRows.length > 0) return [...prefillRows];
    return Array.from({ length: rowCount }, () =>
      Object.fromEntries(columns.map((c) => [c.key, ""]))
    );
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
      <label className="block text-sm font-medium text-[#2f3437] dark:text-white mb-2">
        {field.label}
      </label>
      <div className="overflow-x-auto rounded-lg border border-[#eaeaea] dark:border-white/20">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#f7f6f3] dark:bg-white/5 border-b border-[#eaeaea] dark:border-white/20">
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-2 text-left text-xs font-semibold text-[#2f3437]/60 dark:text-white/60 uppercase tracking-wider">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className="border-b border-[#eaeaea] dark:border-white/10 last:border-0">
                {columns.map((col) => (
                  <td key={col.key} className="px-2 py-1.5">
                    {col.type === "checkbox" ? (
                      <input
                        type="checkbox"
                        checked={row[col.key] === "true"}
                        onChange={(e) => update(rowIdx, col.key, e.target.checked ? "true" : "false")}
                        className="w-4 h-4 accent-[#6ba3c7]"
                      />
                    ) : (
                      <input
                        type="text"
                        value={row[col.key] ?? ""}
                        onChange={(e) => update(rowIdx, col.key, e.target.value)}
                        className="w-full px-2 py-1 text-sm bg-transparent text-[#2f3437] dark:text-white outline-none focus:bg-[#f7f6f3] dark:focus:bg-white/5 rounded transition-colors"
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

// ── Lesson sidebar component ─────────────────────────────────────────────────

function LessonSidebar({
  sectionTitle,
  sectionSlug,
  sectionSortOrder,
  lessons,
  currentLessonId,
}: {
  sectionTitle: string;
  sectionSlug: string;
  sectionSortOrder: number;
  lessons: { id: string; slug: string; title: string; completed: boolean }[];
  currentLessonId: string;
}) {
  const completedCount = lessons.filter((l) => l.completed).length;
  return (
    <nav className="space-y-1">
      <div className="mb-3">
        <Link
          href={`/member/academy/foundations/${sectionSlug}`}
          className="text-xs font-semibold text-[#2f3437]/40 dark:text-white/40 uppercase tracking-wider hover:text-[#6ba3c7] transition-colors"
        >
          Section {sectionSortOrder}
        </Link>
        <p className="text-sm font-bold text-[#2f3437] dark:text-white mt-0.5 leading-snug">{sectionTitle}</p>
      </div>
      {lessons.map((l, i) => {
        const isCurrent = l.id === currentLessonId;
        return (
          <Link
            key={l.id}
            href={`/member/academy/foundations/${sectionSlug}/${l.slug}`}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              isCurrent
                ? "bg-[#6ba3c7]/10 text-[#6ba3c7] font-medium"
                : "text-[#2f3437]/70 dark:text-white/60 hover:bg-[#f7f6f3] dark:hover:bg-white/5"
            }`}
          >
            <div className="shrink-0">
              {l.completed ? (
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
              ) : isCurrent ? (
                <PlayCircleIcon className="w-4 h-4 text-[#6ba3c7]" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-[#d0d0d0] dark:border-white/20" />
              )}
            </div>
            <span className="truncate">
              <span className="text-[#2f3437]/30 dark:text-white/30 mr-1">{i + 1}.</span>
              {l.title}
            </span>
          </Link>
        );
      })}
      <div className="pt-3 mt-2 border-t border-[#eaeaea] dark:border-white/10">
        <div className="flex items-center justify-between text-xs text-[#2f3437]/40 dark:text-white/40 mb-1">
          <span>Progress</span>
          <span>{completedCount}/{lessons.length}</span>
        </div>
        <div className="h-1.5 bg-[#eaeaea] dark:bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#6ba3c7] rounded-full transition-all"
            style={{ width: `${lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0}%` }}
          />
        </div>
      </div>
    </nav>
  );
}

// ── Main lesson client component ──────────────────────────────────────────────

export default function LessonClient({
  sectionSlug,
  lessonSlug,
}: {
  sectionSlug: string;
  lessonSlug: string;
}) {
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [homeworkItems, setHomeworkItems] = useState<{ label: string; completed: boolean }[]>([]);
  const [completed, setCompleted] = useState(false);
  const [markingComplete, setMarkingComplete] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  useEffect(() => {
    fetch(`/api/member/academy/lessons/${lessonSlug}`)
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
      const res = await fetch(`/api/member/academy/workbook/${fieldId}`, {
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
    await fetch(`/api/member/academy/lessons/${lesson.id}/homework`, {
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
      await fetch(`/api/member/academy/lessons/${lesson.id}/progress`, {
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
      <div className="max-w-5xl">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-[#eaeaea] dark:bg-white/10 rounded w-2/3" />
          <div className="h-8 bg-[#eaeaea] dark:bg-white/10 rounded w-full" />
          <div className="aspect-video bg-[#eaeaea] dark:bg-white/10 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="max-w-5xl">
        <p className="text-sm text-[#2f3437]/50 dark:text-white/50">Lesson not found.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-8 max-w-5xl">
      {/* Sidebar — hidden on mobile */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-6 self-start">
        <LessonSidebar
          sectionTitle={lesson.section.title}
          sectionSlug={sectionSlug}
          sectionSortOrder={lesson.section.sortOrder}
          lessons={lesson.sectionLessons ?? []}
          currentLessonId={lesson.id}
        />
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Mobile section dropdown */}
        <details className="lg:hidden mb-4 bg-white dark:bg-[#1a2433] border border-[#eaeaea] dark:border-white/10 rounded-lg">
          <summary className="px-4 py-3 text-sm font-medium text-[#2f3437] dark:text-white cursor-pointer flex items-center justify-between">
            <span>Section {lesson.section.sortOrder}: {lesson.section.title}</span>
            <ChevronDownIcon className="w-4 h-4 text-[#2f3437]/40 dark:text-white/40" />
          </summary>
          <div className="px-2 pb-2">
            <LessonSidebar
              sectionTitle={lesson.section.title}
              sectionSlug={sectionSlug}
              sectionSortOrder={lesson.section.sortOrder}
              lessons={lesson.sectionLessons ?? []}
              currentLessonId={lesson.id}
            />
          </div>
        </details>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-5 flex-wrap text-sm">
          <Link href="/member/academy" className="flex items-center gap-1 text-[#2f3437]/50 dark:text-white/50 hover:text-[#2f3437] dark:hover:text-white transition-colors">
            <ArrowLeftOutline className="w-4 h-4" />
            Academy
          </Link>
          <span className="text-[#2f3437]/30 dark:text-white/30">/</span>
          <Link href="/member/academy/foundations" className="text-[#2f3437]/50 dark:text-white/50 hover:text-[#2f3437] dark:hover:text-white transition-colors">
            Foundations
          </Link>
          <span className="text-[#2f3437]/30 dark:text-white/30">/</span>
          <Link href={`/member/academy/foundations/${sectionSlug}`} className="text-[#2f3437]/50 dark:text-white/50 hover:text-[#2f3437] dark:hover:text-white transition-colors truncate">
            {lesson.section.title}
          </Link>
          <span className="text-[#2f3437]/30 dark:text-white/30">/</span>
          <span className="text-[#2f3437] dark:text-white font-medium truncate">{lesson.title}</span>
        </div>

        {/* Title + tags */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-[#2f3437] dark:text-white mb-2">{lesson.title}</h1>
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

        {/* Merged content — single scroll (description, takeaways, workbook, action items) */}
        <div className="space-y-6">
          {lesson.description && (
            <div className="bg-white dark:bg-[#1a2433] rounded-lg border border-[#eaeaea] dark:border-white/10 p-6">
              <p className="text-sm text-[#2f3437] dark:text-white leading-relaxed">{lesson.description}</p>
            </div>
          )}

          {lesson.keyTakeaways && (
            <div className="bg-white dark:bg-[#1a2433] rounded-lg border border-[#eaeaea] dark:border-white/10 p-6">
              <h3 className="text-sm font-bold text-[#2f3437] dark:text-white uppercase tracking-wider mb-3">
                Key Takeaways
              </h3>
              <div className="prose prose-sm max-w-none text-[#2f3437] dark:text-white [&_ul]:space-y-2 [&_li]:leading-relaxed [&_p]:leading-relaxed">
                <ReactMarkdown>{lesson.keyTakeaways}</ReactMarkdown>
              </div>
            </div>
          )}

          {lesson.workbookFields.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[#2f3437] dark:text-white uppercase tracking-wider">
                  Workbook
                </h3>
                <span className={`text-xs font-medium ${
                  saveStatus === "saving" ? "text-[#2f3437]/40 dark:text-white/40" :
                  saveStatus === "saved" ? "text-green-600 dark:text-green-400" :
                  saveStatus === "error" ? "text-[#e63946]" :
                  "text-[#2f3437]/20 dark:text-white/20"
                }`}>
                  {saveStatus === "saving" && "Saving\u2026"}
                  {saveStatus === "saved" && "\u2713 All changes saved"}
                  {saveStatus === "error" && "\u26A0 Save failed"}
                  {saveStatus === "idle" && "Auto-saves as you type"}
                </span>
              </div>
              <div className="space-y-5">
                {lesson.workbookFields.map((field) => (
                  <div key={field.id} className="bg-white dark:bg-[#1a2433] rounded-lg border border-[#eaeaea] dark:border-white/10 p-5">
                    {field.fieldType === "short_text" && <ShortTextField field={field} onSave={saveWorkbookField} />}
                    {field.fieldType === "long_text" && <LongTextField field={field} onSave={saveWorkbookField} />}
                    {field.fieldType === "checklist" && <ChecklistField field={field} onSave={saveWorkbookField} />}
                    {field.fieldType === "table" && <TableField field={field} onSave={saveWorkbookField} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {lesson.actionItems && (
            <div className="bg-white dark:bg-[#1a2433] rounded-lg border border-[#eaeaea] dark:border-white/10 p-6">
              <h3 className="text-sm font-bold text-[#2f3437] dark:text-white uppercase tracking-wider mb-3">
                Action Items
              </h3>
              <div className="prose prose-sm max-w-none text-[#2f3437] dark:text-white [&_ul]:space-y-2 [&_li]:leading-relaxed">
                <ReactMarkdown>{lesson.actionItems}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>

        {/* Homework section */}
        {homeworkItems.length > 0 && (
          <div className="mt-8 bg-white dark:bg-[#1a2433] rounded-lg border border-[#eaeaea] dark:border-white/10 p-6">
            <h3 className="text-sm font-bold text-[#2f3437] dark:text-white uppercase tracking-wider mb-4">
              Homework
            </h3>
            <div className="space-y-3">
              {homeworkItems.map((item, i) => (
                <label key={i} className="flex items-start gap-3 cursor-pointer group">
                  <div
                    onClick={() => toggleHomework(i)}
                    className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                      item.completed
                        ? "bg-[#6ba3c7] border-[#6ba3c7]"
                        : "border-[#eaeaea] dark:border-white/30 group-hover:border-[#6ba3c7]"
                    }`}
                  >
                    {item.completed && <CheckIcon className="w-3 h-3 text-white" />}
                  </div>
                  <span
                    onClick={() => toggleHomework(i)}
                    className={`text-sm leading-relaxed ${
                      item.completed
                        ? "line-through text-[#2f3437]/40 dark:text-white/40"
                        : "text-[#2f3437] dark:text-white"
                    }`}
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
          <div className="mt-6 bg-[#6ba3c7]/8 dark:bg-[#6ba3c7]/10 border border-[#6ba3c7]/20 rounded-lg p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#6ba3c7]/15 rounded-lg shrink-0">
                <SparklesIcon className="w-5 h-5 text-[#6ba3c7]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#2f3437] dark:text-white">
                  Ready to put this into practice?
                </p>
                <p className="text-xs text-[#2f3437]/50 dark:text-white/50 mt-0.5">
                  Use the {lesson.aiToolLabel} tool to apply what you've learned.
                </p>
              </div>
            </div>
            <Link
              href={lesson.aiToolLink}
              className="shrink-0 flex items-center gap-1.5 bg-[#6ba3c7] hover:bg-[#5490b5] text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              {lesson.aiToolLabel}
              <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* Mark as Complete + Navigation */}
        <div className="mt-8 pt-6 border-t border-[#eaeaea] dark:border-white/10 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {lesson.prevLesson ? (
              <Link
                href={`/member/academy/foundations/${lesson.prevLesson.sectionSlug}/${lesson.prevLesson.slug}`}
                className="flex items-center gap-1.5 text-sm text-[#2f3437]/60 dark:text-white/60 hover:text-[#2f3437] dark:hover:text-white transition-colors"
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
                : "border border-[#eaeaea] dark:border-white/20 text-[#2f3437] dark:text-white hover:border-green-500 hover:text-green-600 dark:hover:text-green-400"
            } ${justCompleted ? "scale-105 ring-2 ring-green-400 ring-offset-2" : ""}`}
          >
            <CheckCircleIcon className={`w-5 h-5 ${justCompleted ? "animate-bounce" : ""}`} />
            {markingComplete ? "Saving\u2026" : completed ? "Completed!" : "Mark as Complete"}
          </button>

          {lesson.nextLesson ? (
            <Link
              href={`/member/academy/foundations/${lesson.nextLesson.sectionSlug}/${lesson.nextLesson.slug}`}
              className="flex items-center gap-1.5 text-sm text-[#2f3437]/60 dark:text-white/60 hover:text-[#6ba3c7] transition-colors"
            >
              Next Lesson
              <ArrowRightIcon className="w-4 h-4" />
            </Link>
          ) : (
            <Link
              href="/member/academy/foundations"
              className="flex items-center gap-1.5 text-sm text-[#6ba3c7] hover:text-[#5490b5] transition-colors"
            >
              All Sections
              <ArrowRightIcon className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
