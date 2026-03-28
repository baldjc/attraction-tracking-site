"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PencilSquareIcon,
  PlusIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  BookOpenIcon,
  AcademicCapIcon,
  TrashIcon,
  ArrowPathIcon,
  CheckIcon,
  XMarkIcon,
  PencilIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { PRINCIPLE_NAMES, PRINCIPLE_COLORS } from "@/lib/academy-constants";

// ── Foundations Library (Course Manager) ────────────────────────────────────

interface Lesson {
  id: string;
  title: string;
  slug: string;
  youtubeUrl: string | null;
  sortOrder: number;
  published: boolean;
  principleTags: string[];
}

interface Section {
  id: string;
  title: string;
  slug: string;
  sortOrder: number;
  published: boolean;
  lessonCount: number;
  lessons?: Lesson[];
}

function FoundationsLibraryTab() {
  const router = useRouter();
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingLessons, setLoadingLessons] = useState<Set<string>>(new Set());
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [creatingSection, setCreatingSection] = useState(false);
  const [addingLessonTo, setAddingLessonTo] = useState<string | null>(null);
  const [newLessonTitle, setNewLessonTitle] = useState("");
  const [creatingLesson, setCreatingLesson] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSections = useCallback(async () => {
    const res = await fetch("/api/admin/academy/sections");
    const data = await res.json();
    setSections(data.sections ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadSections(); }, [loadSections]);

  async function loadLessons(sectionId: string) {
    if (loadingLessons.has(sectionId)) return;
    setLoadingLessons((p) => new Set([...p, sectionId]));
    const res = await fetch(`/api/admin/academy/sections/${sectionId}/lessons`);
    const data = await res.json();
    setSections((prev) =>
      prev.map((s) => s.id === sectionId ? { ...s, lessons: data.lessons ?? [] } : s)
    );
    setLoadingLessons((p) => { const n = new Set(p); n.delete(sectionId); return n; });
  }

  function toggleExpand(sectionId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
        const section = sections.find((s) => s.id === sectionId);
        if (!section?.lessons) loadLessons(sectionId);
      }
      return next;
    });
  }

  async function toggleSectionPublished(section: Section) {
    setTogglingId(section.id);
    await fetch(`/api/admin/academy/sections/${section.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !section.published }),
    });
    setSections((prev) =>
      prev.map((s) => s.id === section.id ? { ...s, published: !s.published } : s)
    );
    setTogglingId(null);
  }

  async function toggleLessonPublished(sectionId: string, lesson: Lesson) {
    setTogglingId(lesson.id);
    await fetch(`/api/admin/academy/lessons/${lesson.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: !lesson.published }),
    });
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, lessons: s.lessons?.map((l) => l.id === lesson.id ? { ...l, published: !l.published } : l) }
          : s
      )
    );
    setTogglingId(null);
  }

  async function moveSection(idx: number, dir: "up" | "down") {
    const newSections = [...sections];
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newSections.length) return;
    [newSections[idx], newSections[swapIdx]] = [newSections[swapIdx], newSections[idx]];
    const updated = newSections.map((s, i) => ({ ...s, sortOrder: i + 1 }));
    setSections(updated);
    await fetch("/api/admin/academy/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections: updated.map((s) => ({ id: s.id, sortOrder: s.sortOrder })) }),
    });
  }

  async function moveLesson(sectionId: string, idx: number, dir: "up" | "down") {
    const section = sections.find((s) => s.id === sectionId);
    if (!section?.lessons) return;
    const newLessons = [...section.lessons];
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newLessons.length) return;
    [newLessons[idx], newLessons[swapIdx]] = [newLessons[swapIdx], newLessons[idx]];
    const updated = newLessons.map((l, i) => ({ ...l, sortOrder: i + 1 }));
    setSections((prev) =>
      prev.map((s) => s.id === sectionId ? { ...s, lessons: updated } : s)
    );
    await fetch("/api/admin/academy/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessons: updated.map((l) => ({ id: l.id, sortOrder: l.sortOrder })) }),
    });
  }

  async function createSection() {
    if (!newSectionTitle.trim()) return;
    setCreatingSection(true);
    const res = await fetch("/api/admin/academy/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newSectionTitle.trim(), sortOrder: sections.length + 1 }),
    });
    const data = await res.json();
    setCreatingSection(false);
    setAddingSection(false);
    setNewSectionTitle("");
    if (data.section) router.push(`/admin/academy-manager/sections/${data.section.id}`);
  }

  async function createLesson(sectionId: string) {
    if (!newLessonTitle.trim()) return;
    setCreatingLesson(true);
    const section = sections.find((s) => s.id === sectionId);
    const sortOrder = (section?.lessons?.length ?? 0) + 1;
    const res = await fetch("/api/admin/academy/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionId, title: newLessonTitle.trim(), sortOrder }),
    });
    const data = await res.json();
    setCreatingLesson(false);
    setAddingLessonTo(null);
    setNewLessonTitle("");
    if (data.lesson) router.push(`/admin/academy-manager/lessons/${data.lesson.id}`);
  }

  if (loading) {
    return (
      <div className="max-w-4xl">
        <div className="animate-pulse space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-[#2f3437]/50 mt-0.5">
            {sections.length} sections · {sections.reduce((a, s) => a + s.lessonCount, 0)} total lessons
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      <div className="space-y-2">
        {sections.map((section, sectionIdx) => (
          <div key={section.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <button
                onClick={() => toggleExpand(section.id)}
                className="shrink-0 text-[#2f3437]/50 hover:text-[#2f3437] transition-colors"
              >
                {expanded.has(section.id) ? (
                  <ChevronDownIcon className="w-5 h-5" />
                ) : (
                  <ChevronRightIcon className="w-5 h-5" />
                )}
              </button>

              <div className="flex-1 min-w-0" onClick={() => toggleExpand(section.id)} style={{ cursor: "pointer" }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#2f3437]/40 font-mono w-5 shrink-0">{section.sortOrder}</span>
                  <span className="text-sm font-semibold text-[#2f3437] truncate">{section.title}</span>
                  <span className="text-xs text-[#2f3437]/40 shrink-0">({section.lessonCount} lessons)</span>
                </div>
              </div>

              <div className="flex gap-0.5 shrink-0">
                <button
                  onClick={() => moveSection(sectionIdx, "up")}
                  disabled={sectionIdx === 0}
                  className="p-1 text-[#2f3437]/30 hover:text-[#2f3437] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowUpIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => moveSection(sectionIdx, "down")}
                  disabled={sectionIdx === sections.length - 1}
                  className="p-1 text-[#2f3437]/30 hover:text-[#2f3437] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowDownIcon className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={() => toggleSectionPublished(section)}
                disabled={togglingId === section.id}
                className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                  section.published
                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {section.published ? "Published" : "Draft"}
              </button>

              <Link
                href={`/admin/academy-manager/sections/${section.id}`}
                className="shrink-0 p-1.5 text-[#2f3437]/50 hover:text-[#6ba3c7] hover:bg-[#6ba3c7]/10 rounded-lg transition-colors"
              >
                <PencilSquareIcon className="w-4 h-4" />
              </Link>
            </div>

            {expanded.has(section.id) && (
              <div className="border-t border-gray-100">
                {loadingLessons.has(section.id) ? (
                  <div className="px-10 py-4 text-sm text-[#2f3437]/40 animate-pulse">Loading lessons…</div>
                ) : (
                  <>
                    {(section.lessons ?? []).length === 0 && !addingLessonTo && (
                      <p className="px-12 py-3 text-sm text-[#2f3437]/30 italic">No lessons yet.</p>
                    )}

                    {(section.lessons ?? []).map((lesson, lessonIdx) => (
                      <div
                        key={lesson.id}
                        className="flex items-center gap-3 px-4 py-2.5 pl-12 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors"
                      >
                        <AcademicCapIcon className="w-4 h-4 text-[#2f3437]/20 shrink-0" />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-[#2f3437]/40 font-mono w-4 shrink-0">{lesson.sortOrder}</span>
                            <span className="text-sm font-medium text-[#2f3437] truncate">{lesson.title}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 pl-6 flex-wrap">
                            {lesson.youtubeUrl && (
                              <span className="text-[10px] text-[#2f3437]/30">▶ Video</span>
                            )}
                            {(lesson.principleTags as string[]).slice(0, 2).map((tag) => (
                              <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PRINCIPLE_COLORS[tag] ?? "bg-gray-100 text-gray-600"}`}>
                                {PRINCIPLE_NAMES[tag] ?? tag}
                              </span>
                            ))}
                            {(lesson.principleTags as string[]).length > 2 && (
                              <span className="text-[10px] text-[#2f3437]/30">+{(lesson.principleTags as string[]).length - 2}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-0.5 shrink-0">
                          <button
                            onClick={() => moveLesson(section.id, lessonIdx, "up")}
                            disabled={lessonIdx === 0}
                            className="p-1 text-[#2f3437]/30 hover:text-[#2f3437] disabled:opacity-20 disabled:cursor-not-allowed"
                          >
                            <ArrowUpIcon className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => moveLesson(section.id, lessonIdx, "down")}
                            disabled={lessonIdx === (section.lessons?.length ?? 0) - 1}
                            className="p-1 text-[#2f3437]/30 hover:text-[#2f3437] disabled:opacity-20 disabled:cursor-not-allowed"
                          >
                            <ArrowDownIcon className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          onClick={() => toggleLessonPublished(section.id, lesson)}
                          disabled={togglingId === lesson.id}
                          className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                            lesson.published
                              ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          {lesson.published ? "Published" : "Draft"}
                        </button>

                        <Link
                          href={`/admin/academy-manager/lessons/${lesson.id}`}
                          className="shrink-0 p-1.5 text-[#2f3437]/40 hover:text-[#6ba3c7] hover:bg-[#6ba3c7]/10 rounded-lg transition-colors"
                        >
                          <PencilSquareIcon className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    ))}

                    {addingLessonTo === section.id ? (
                      <div className="flex items-center gap-2 px-12 py-3 border-t border-gray-50 bg-gray-50/50">
                        <input
                          autoFocus
                          type="text"
                          value={newLessonTitle}
                          onChange={(e) => setNewLessonTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") createLesson(section.id);
                            if (e.key === "Escape") { setAddingLessonTo(null); setNewLessonTitle(""); }
                          }}
                          placeholder="Lesson title…"
                          className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#6ba3c7] focus:border-transparent outline-none"
                        />
                        <button
                          onClick={() => createLesson(section.id)}
                          disabled={creatingLesson || !newLessonTitle.trim()}
                          className="px-3 py-1.5 bg-[#6ba3c7] text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-[#5490b5] transition-colors"
                        >
                          {creatingLesson ? "…" : "Create & Edit"}
                        </button>
                        <button
                          onClick={() => { setAddingLessonTo(null); setNewLessonTitle(""); }}
                          className="px-3 py-1.5 text-sm text-[#2f3437]/50 hover:text-[#2f3437] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="px-12 py-2.5 border-t border-gray-50">
                        <button
                          onClick={() => { setAddingLessonTo(section.id); setNewLessonTitle(""); }}
                          className="flex items-center gap-1.5 text-sm text-[#6ba3c7] hover:text-[#5490b5] font-medium transition-colors"
                        >
                          <PlusIcon className="w-4 h-4" />
                          Add Lesson
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}

        {addingSection ? (
          <div className="bg-white rounded-lg border border-[#6ba3c7]/30 p-4 flex items-center gap-3">
            <BookOpenIcon className="w-5 h-5 text-[#6ba3c7] shrink-0" />
            <input
              autoFocus
              type="text"
              value={newSectionTitle}
              onChange={(e) => setNewSectionTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createSection();
                if (e.key === "Escape") { setAddingSection(false); setNewSectionTitle(""); }
              }}
              placeholder="Section title…"
              className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#6ba3c7] focus:border-transparent outline-none"
            />
            <button
              onClick={createSection}
              disabled={creatingSection || !newSectionTitle.trim()}
              className="px-4 py-1.5 bg-[#6ba3c7] text-white text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-[#5490b5] transition-colors"
            >
              {creatingSection ? "Creating…" : "Create & Edit"}
            </button>
            <button
              onClick={() => { setAddingSection(false); setNewSectionTitle(""); }}
              className="px-3 py-1.5 text-sm text-[#2f3437]/50 hover:text-[#2f3437] transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingSection(true)}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 text-[#2f3437]/40 hover:border-[#6ba3c7] hover:text-[#6ba3c7] rounded-lg text-sm font-medium transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            Add Section
          </button>
        )}
      </div>
    </div>
  );
}

// ── Q&A Calls tab ────────────────────────────────────────────────────────────

const QA_PRINCIPLE_COLORS: Record<string, string> = {
  "Avatar Clarity": "bg-purple-100 text-purple-700",
  "Themes Over Topics": "bg-blue-100 text-blue-700",
  "Binge Architecture": "bg-indigo-100 text-indigo-700",
  "Lead Magnet System": "bg-green-100 text-green-700",
  "Values Peppering": "bg-pink-100 text-pink-700",
  "Connection Language": "bg-yellow-100 text-yellow-700",
  "Grade 5 Language": "bg-orange-100 text-orange-700",
  "Consistency": "bg-teal-100 text-teal-700",
  "ARC Attention": "bg-red-100 text-red-700",
  "ARC Revelation": "bg-violet-100 text-violet-700",
  "ARC Connection": "bg-sky-100 text-sky-700",
  "Curiosity Bridges": "bg-amber-100 text-amber-700",
  "Story Proof": "bg-lime-100 text-lime-700",
  "Show Don't Tell": "bg-cyan-100 text-cyan-700",
  "Title Frameworks": "bg-emerald-100 text-emerald-700",
  "Approve the Click": "bg-rose-100 text-rose-700",
};

interface QACall {
  id: string;
  fathomId: string;
  title: string;
  callDate: string;
  status: string;
  errorMessage?: string;
  momentCount: number;
  pendingCount: number;
}

interface FathomCall {
  fathomId: string;
  title: string;
  callDate: string;
  duration?: number;
  fathomShareUrl: string;
  transcript: string;
  alreadyImported: boolean;
  existingId?: string;
}

interface KBEntry {
  id: string;
  sourceId: string;
  subTopic: string;
  summary: string;
  principles: string[];
  timestampStart?: number;
  timestampEnd?: number;
  isGeneralTeaching: boolean;
  memberId?: string;
  member?: { id: string; fullName: string | null; email: string } | null;
  status: string;
  sourceTitle: string;
  callDate?: string;
}

interface MemberOption { id: string; fullName: string | null; email: string; }

const INPUT = "w-full border border-[#2f3437]/20 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#6ba3c7]";
const CARD = "bg-white rounded-lg border border-[#2f3437]/10";

function fmtQA(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtQATime(s?: number | null) {
  if (!s) return "";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function QACallsTab() {
  const [calls, setCalls] = useState<QACall[]>([]);
  const [loading, setLoading] = useState(true);

  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({ fathomApiKey: "", fathomRecordingEmail: "", fathomTitleFilter: "Q&A", fathomWebhookSecret: "", apiKeySet: false, webhookSecretSet: false });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [lastPullDate, setLastPullDate] = useState<string | null>(null);
  const [lastPullStatus, setLastPullStatus] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");

  const [pulling, setPulling] = useState(false);
  const [pullResult, setPullResult] = useState<FathomCall[] | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const [queueEntries, setQueueEntries] = useState<KBEntry[]>([]);
  const [queueMembers, setQueueMembers] = useState<MemberOption[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [editingEntry, setEditingEntry] = useState<KBEntry | null>(null);
  const [editForm, setEditForm] = useState({ subTopic: "", summary: "", principles: [] as string[], memberId: "" });
  const [savingEntry, setSavingEntry] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);

  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  const [refreshingUrls, setRefreshingUrls] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);

  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function refreshShareUrls() {
    setRefreshingUrls(true);
    setRefreshResult(null);
    const res = await fetch("/api/admin/resources/fathom/refresh-urls", { method: "POST" });
    const d = await res.json();
    if (res.ok) {
      setRefreshResult(`Updated ${d.updated} of ${d.total} call URL${d.total !== 1 ? "s" : ""} to share_url format.`);
    } else {
      setRefreshResult(`Error: ${d.error ?? "Failed"}`);
    }
    setRefreshingUrls(false);
  }

  async function removeCall(id: string) {
    setRemovingId(id);
    const res = await fetch(`/api/admin/resources/qa-calls/${id}`, { method: "DELETE" });
    if (res.ok) {
      setCalls((prev) => prev.filter((c) => c.id !== id));
      if (expandedCallId === id) setExpandedCallId(null);
    }
    setRemovingId(null);
    setConfirmRemoveId(null);
  }

  useEffect(() => {
    loadCalls();
    loadSettings();
    loadQueue();
  }, []);

  async function loadCalls() {
    setLoading(true);
    const res = await fetch("/api/admin/resources/qa-calls");
    if (res.ok) setCalls(await res.json());
    setLoading(false);
  }

  async function loadSettings() {
    const res = await fetch("/api/admin/resources/fathom/settings");
    if (res.ok) {
      const d = await res.json();
      setSettings({
        fathomApiKey: d.fathomApiKeySet ? "••••••••" : "",
        fathomRecordingEmail: d.fathomRecordingEmail,
        fathomTitleFilter: d.fathomTitleFilter,
        fathomWebhookSecret: d.fathomWebhookSecretSet ? "••••••••" : "",
        apiKeySet: d.fathomApiKeySet,
        webhookSecretSet: d.fathomWebhookSecretSet,
      });
      setLastPullDate(d.lastPullDate);
      setLastPullStatus(d.lastPullStatus);
    }
    setWebhookUrl(`${window.location.origin}/api/webhooks/fathom`);
  }

  const loadQueue = useCallback(async () => {
    setQueueLoading(true);
    const res = await fetch("/api/admin/resources/review-queue?status=pending");
    if (res.ok) {
      const d = await res.json();
      setQueueEntries(d.entries ?? []);
      setQueueMembers(d.members ?? []);
    }
    setQueueLoading(false);
  }, []);

  async function saveSettings() {
    setSavingSettings(true);
    await fetch("/api/admin/resources/fathom/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fathomApiKey: settings.fathomApiKey,
        fathomRecordingEmail: settings.fathomRecordingEmail,
        fathomTitleFilter: settings.fathomTitleFilter,
        fathomWebhookSecret: settings.fathomWebhookSecret,
      }),
    });
    setSavingSettings(false);
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
    loadSettings();
  }

  async function pullFromFathom() {
    setPulling(true);
    setPullError(null);
    setPullResult(null);
    setSelectedIds(new Set());
    setImportResult(null);
    const res = await fetch("/api/admin/resources/fathom/pull", { method: "POST" });
    const d = await res.json();
    if (res.ok) {
      setPullResult(d.calls ?? []);
    } else {
      setPullError(d.error ?? "Failed to connect to Fathom");
    }
    setPulling(false);
  }

  function toggleSelect(fathomId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fathomId)) next.delete(fathomId);
      else next.add(fathomId);
      return next;
    });
  }

  async function importSelected() {
    if (!pullResult) return;
    const toImport = pullResult.filter((c) => selectedIds.has(c.fathomId) && !c.alreadyImported);
    if (!toImport.length) return;
    setImporting(true);
    setImportResult(null);
    const res = await fetch("/api/admin/resources/fathom/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calls: toImport }),
    });
    const d = await res.json();
    if (res.ok) {
      const results = d.results as Array<{ status: string; momentCount?: number }>;
      const processed = results.filter((r) => r.status === "processed").length;
      const failed = results.filter((r) => r.status === "failed").length;
      const moments = results.reduce((s, r) => s + (r.momentCount ?? 0), 0);
      setImportResult(`Imported ${processed} call${processed !== 1 ? "s" : ""}${failed > 0 ? `, ${failed} failed` : ""}. ${moments} coaching moments added to the review queue.`);
      setPullResult(null);
      setSelectedIds(new Set());
      loadCalls();
      loadQueue();
    } else {
      setImportResult(`Error: ${d.error ?? "Import failed"}`);
    }
    setImporting(false);
  }

  async function entryAction(id: string, action: "approve" | "reject") {
    await fetch(`/api/admin/resources/review-queue/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setQueueEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function openEdit(entry: KBEntry) {
    setEditingEntry(entry);
    setEditForm({ subTopic: entry.subTopic, summary: entry.summary, principles: entry.principles, memberId: entry.memberId ?? "" });
  }

  async function saveEdit() {
    if (!editingEntry) return;
    setSavingEntry(true);
    await fetch(`/api/admin/resources/review-queue/${editingEntry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editForm, memberId: editForm.memberId || null }),
    });
    setSavingEntry(false);
    setEditingEntry(null);
    loadQueue();
  }

  async function approveAll() {
    const ids = queueEntries.map((e) => e.id);
    if (!ids.length) return;
    setApprovingAll(true);
    await fetch("/api/admin/resources/review-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve_all", ids }),
    });
    setApprovingAll(false);
    setQueueEntries([]);
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      processed: "bg-green-100 text-green-700",
      pending_review: "bg-amber-100 text-amber-700",
      failed: "bg-red-100 text-red-700",
    };
    const labels: Record<string, string> = { processed: "Processed", pending_review: "Pending", failed: "Failed" };
    return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status] ?? "bg-gray-100 text-gray-600"}`}>{labels[status] ?? status}</span>;
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#2f3437]/50">Import Q&A coaching calls from Fathom and review extracted moments</p>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowSettings((s) => !s)} className="flex items-center gap-2 px-4 py-2.5 border border-[#2f3437]/20 rounded-lg text-sm text-[#2f3437]/60 hover:bg-gray-50 transition-colors">
            Settings {showSettings ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
          </button>
          <button
            onClick={pullFromFathom}
            disabled={pulling || !settings.apiKeySet}
            title={!settings.apiKeySet ? "Configure Fathom API key in Settings first" : ""}
            className="flex items-center gap-2 bg-[#6ba3c7] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#6ba3c7]/90 disabled:opacity-50 transition-colors"
          >
            <ArrowPathIcon className={`w-4 h-4 ${pulling ? "animate-spin" : ""}`} />
            {pulling ? "Pulling..." : "Pull from Fathom"}
          </button>
        </div>
      </div>

      {showSettings && (
        <div className={CARD + " p-6 space-y-5"}>
          <h3 className="font-semibold text-[#2f3437]">Fathom Settings</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-[#2f3437] mb-1.5">API Key</label>
              <input
                type="password"
                value={settings.fathomApiKey}
                onChange={(e) => setSettings({ ...settings, fathomApiKey: e.target.value })}
                placeholder={settings.apiKeySet ? "Key saved — enter new key to update" : "Paste Fathom API key..."}
                className={INPUT}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#2f3437] mb-1.5">Recording Email</label>
              <input
                type="email"
                value={settings.fathomRecordingEmail}
                onChange={(e) => setSettings({ ...settings, fathomRecordingEmail: e.target.value })}
                placeholder="jared@..."
                className={INPUT}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#2f3437] mb-1.5">Title Filter</label>
              <input
                type="text"
                value={settings.fathomTitleFilter}
                onChange={(e) => setSettings({ ...settings, fathomTitleFilter: e.target.value })}
                placeholder="Q&A"
                className={INPUT}
              />
            </div>
          </div>

          <div className="border border-[#6ba3c7]/25 rounded-lg bg-[#6ba3c7]/5 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-[#2f3437] mb-0.5">Webhook (auto-import on call end)</p>
              <p className="text-xs text-[#2f3437]/50">
                In Fathom → Developers → Add Webhook, paste the URL below. Set triggers to <strong>my_recordings</strong> and enable <strong>include_transcript</strong>. Copy the Webhook Secret and paste it here.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#2f3437]/60 mb-1">Your Webhook URL</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={webhookUrl}
                    className="flex-1 border border-[#2f3437]/15 rounded-lg px-3 py-2 text-xs bg-white text-[#2f3437]/70 font-mono select-all"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(webhookUrl)}
                    className="px-2.5 py-2 border border-[#2f3437]/20 rounded-lg text-xs text-[#2f3437]/50 hover:text-[#6ba3c7] hover:border-[#6ba3c7] transition-colors whitespace-nowrap"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#2f3437]/60 mb-1">
                  Webhook Secret <span className="font-normal text-[#2f3437]/40">(from Fathom)</span>
                </label>
                <input
                  type="password"
                  value={settings.fathomWebhookSecret}
                  onChange={(e) => setSettings({ ...settings, fathomWebhookSecret: e.target.value })}
                  placeholder={settings.webhookSecretSet ? "Secret saved — enter new to update" : "Paste webhook secret..."}
                  className={INPUT}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-[#2f3437]/40">
              {lastPullDate && <>Last pull: {fmtQA(lastPullDate)} — <span className={lastPullStatus === "success" ? "text-green-600" : "text-red-500"}>{lastPullStatus}</span></>}
              {!lastPullDate && "No auto-pull has run yet"}
              <span className="ml-2">• Auto-pull runs every Thursday at 8:00 PM</span>
            </div>
            <button onClick={saveSettings} disabled={savingSettings} className="flex items-center gap-2 bg-[#111] text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-[#111]/80 transition-colors">
              {settingsSaved ? <><CheckIcon className="w-4 h-4" /> Saved</> : savingSettings ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      )}

      {pullError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{pullError}</div>
      )}
      {importResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">{importResult}</div>
      )}

      {pullResult && (
        <div className={CARD}>
          <div className="px-6 py-4 border-b border-[#2f3437]/10 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-[#2f3437]">Fathom Calls Found</h3>
              <p className="text-xs text-[#2f3437]/40 mt-0.5">{pullResult.length} matching call{pullResult.length !== 1 ? "s" : ""} — select new ones to import</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setPullResult(null)} className="text-sm text-[#2f3437]/40 hover:text-[#2f3437]">✕ Close</button>
              <button
                onClick={importSelected}
                disabled={importing || selectedIds.size === 0}
                className="bg-[#6ba3c7] text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-[#6ba3c7]/90 transition-colors"
              >
                {importing ? "Importing..." : `Import ${selectedIds.size > 0 ? selectedIds.size : ""} Selected`}
              </button>
            </div>
          </div>
          <div className="divide-y divide-[#2f3437]/5">
            {pullResult.map((call) => (
              <div key={call.fathomId} className={`px-6 py-4 flex items-start gap-4 ${call.alreadyImported ? "opacity-50" : ""}`}>
                {!call.alreadyImported && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(call.fathomId)}
                    onChange={() => toggleSelect(call.fathomId)}
                    className="mt-1 w-4 h-4 rounded border-[#2f3437]/30 cursor-pointer"
                  />
                )}
                {call.alreadyImported && <div className="w-4 h-4 mt-1" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#2f3437]">{call.title}</p>
                  <p className="text-xs text-[#2f3437]/50 mt-0.5">
                    {fmtQA(call.callDate)}
                    {call.duration && ` • ${Math.round(call.duration / 60)} min`}
                    {call.transcript ? ` • Transcript available` : " • No transcript"}
                  </p>
                </div>
                {call.alreadyImported && <span className="text-xs text-[#2f3437]/40 bg-[#111]/5 px-2 py-0.5 rounded-full flex-shrink-0">Already imported</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={CARD}>
        <div className="px-6 py-4 border-b border-[#2f3437]/10 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-[#2f3437]">Review Queue</h3>
            <p className="text-xs text-[#2f3437]/40 mt-0.5">
              {queueLoading ? "Loading..." : `${queueEntries.length} moment${queueEntries.length !== 1 ? "s" : ""} awaiting review`}
            </p>
          </div>
          {queueEntries.length > 0 && (
            <button
              onClick={approveAll}
              disabled={approvingAll}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-green-700 transition-colors"
            >
              <CheckIcon className="w-4 h-4" />
              {approvingAll ? "Approving..." : "Approve All"}
            </button>
          )}
        </div>

        {queueLoading ? (
          <div className="px-6 py-12 text-center text-sm text-[#2f3437]/40">Loading queue...</div>
        ) : queueEntries.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-[#2f3437]/40">All caught up — no moments pending review</div>
        ) : (
          <div className="divide-y divide-[#2f3437]/5">
            {queueEntries.map((entry) => (
              <div key={entry.id} className="px-6 py-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-[#2f3437]/40">{entry.sourceTitle}</span>
                      {entry.callDate && <span className="text-xs text-[#2f3437]/30">{fmtQA(entry.callDate)}</span>}
                      {entry.timestampStart != null && (
                        <span className="text-xs text-[#6ba3c7]">@ {fmtQATime(entry.timestampStart)}</span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-[#2f3437] mb-0.5">{entry.subTopic}</p>
                    <p className="text-xs text-[#2f3437]/60 mb-2">{entry.summary}</p>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {entry.principles.map((p) => (
                        <span key={p} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${QA_PRINCIPLE_COLORS[p] ?? "bg-gray-100 text-gray-600"}`}>{p}</span>
                      ))}
                    </div>
                    {entry.member && (
                      <p className="text-xs text-indigo-600">
                        Tagged: {entry.member.fullName ?? entry.member.email}
                      </p>
                    )}
                    {!entry.isGeneralTeaching && !entry.member && (
                      <p className="text-xs text-amber-500">Member not matched — assign below</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(entry)} className="p-2 rounded-lg text-[#2f3437]/30 hover:text-[#6ba3c7] hover:bg-[#6ba3c7]/5 transition-colors" title="Edit">
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => entryAction(entry.id, "approve")} className="p-2 rounded-lg text-[#2f3437]/30 hover:text-green-600 hover:bg-green-50 transition-colors" title="Approve">
                      <CheckIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => entryAction(entry.id, "reject")} className="p-2 rounded-lg text-[#2f3437]/30 hover:text-red-500 hover:bg-red-50 transition-colors" title="Reject">
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={CARD}>
        <div className="px-6 py-4 border-b border-[#2f3437]/10 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-[#2f3437]">Imported Calls</h3>
            <p className="text-xs text-[#2f3437]/40 mt-0.5">{calls.length} call{calls.length !== 1 ? "s" : ""} imported</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={refreshShareUrls}
              disabled={refreshingUrls}
              title="Re-fetches share_url from Fathom for all imported calls so timestamps work correctly"
              className="flex items-center gap-1.5 text-xs text-[#2f3437]/50 hover:text-[#6ba3c7] border border-[#2f3437]/15 hover:border-[#6ba3c7]/40 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-3.5 h-3.5 ${refreshingUrls ? "animate-spin" : ""}`} />
              {refreshingUrls ? "Refreshing…" : "Refresh Share URLs"}
            </button>
            {refreshResult && (
              <p className={`text-[11px] ${refreshResult.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{refreshResult}</p>
            )}
          </div>
        </div>
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-[#2f3437]/40">Loading...</div>
        ) : calls.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-[#2f3437]/40">No calls imported yet. Pull from Fathom to get started.</div>
        ) : (
          <div className="divide-y divide-[#2f3437]/5">
            {calls.map((call) => (
              <div key={call.id}>
                <div className="px-6 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-[#2f3437]">{call.title}</span>
                      {statusBadge(call.status)}
                      {call.pendingCount > 0 && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">{call.pendingCount} pending</span>
                      )}
                    </div>
                    <p className="text-xs text-[#2f3437]/40">
                      {fmtQA(call.callDate)} • {call.momentCount} moment{call.momentCount !== 1 ? "s" : ""}
                    </p>
                    {call.status === "failed" && call.errorMessage && (
                      <p className="text-xs text-red-600 mt-1">{call.errorMessage}</p>
                    )}
                  </div>
                  {confirmRemoveId === call.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-600 font-medium">Remove call + all moments?</span>
                      <button
                        onClick={() => removeCall(call.id)}
                        disabled={removingId === call.id}
                        className="px-3 py-1.5 bg-[#e63946] text-white text-xs font-semibold rounded-lg disabled:opacity-50 hover:bg-red-700 transition-colors"
                      >
                        {removingId === call.id ? "Removing…" : "Remove"}
                      </button>
                      <button onClick={() => setConfirmRemoveId(null)} className="px-3 py-1.5 text-xs text-[#2f3437]/60 hover:text-[#2f3437] transition-colors">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRemoveId(call.id)}
                      className="flex items-center gap-1.5 text-xs text-[#2f3437]/40 hover:text-[#e63946] hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

type ManagerTab = "foundations" | "qa-calls";

const MANAGER_TABS: { id: ManagerTab; label: string }[] = [
  { id: "foundations", label: "Foundations Library" },
  { id: "qa-calls", label: "Q&A Calls" },
];

function AcademyManagerInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get("tab") as ManagerTab) ?? "foundations";
  const [tab, setTab] = useState<ManagerTab>(initialTab);

  function setActiveTab(t: ManagerTab) {
    setTab(t);
    router.replace(`/admin/academy-manager?tab=${t}`, { scroll: false });
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-[#2f3437]">Academy Manager</h1>
        <p className="text-sm text-[#2f3437]/50 mt-1">Manage Foundations Library content and Q&A coaching calls.</p>
      </div>

      <div className="flex gap-1 bg-[#111]/5 rounded-lg p-1 w-fit">
        {MANAGER_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? "bg-white text-[#2f3437] shadow-sm"
                : "text-[#2f3437]/50 hover:text-[#2f3437]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "foundations" && <FoundationsLibraryTab />}
      {tab === "qa-calls" && <QACallsTab />}
    </div>
  );
}

export default function AcademyManagerPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#2f3437]">Academy Manager</h1>
          <p className="text-sm text-[#2f3437]/50 mt-1">Manage Foundations Library content and Q&A coaching calls.</p>
        </div>
        <div className="h-12 bg-[#111]/5 rounded-lg animate-pulse w-64" />
      </div>
    }>
      <AcademyManagerInner />
    </Suspense>
  );
}
