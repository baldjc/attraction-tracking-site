"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
} from "@heroicons/react/24/outline";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { PRINCIPLE_NAMES, PRINCIPLE_COLORS } from "@/lib/academy-constants";

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

export default function CourseManagerPage() {
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
    if (data.section) router.push(`/admin/course-manager/sections/${data.section.id}`);
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
    if (data.lesson) router.push(`/admin/course-manager/lessons/${data.lesson.id}`);
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
          <h1 className="text-2xl font-bold text-[#2f3437]">Course Manager</h1>
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
            {/* Section row */}
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

              {/* Reorder arrows */}
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

              {/* Published toggle */}
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
                href={`/admin/course-manager/sections/${section.id}`}
                className="shrink-0 p-1.5 text-[#2f3437]/50 hover:text-[#6ba3c7] hover:bg-[#6ba3c7]/10 rounded-lg transition-colors"
              >
                <PencilSquareIcon className="w-4 h-4" />
              </Link>
            </div>

            {/* Lessons list */}
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

                        {/* Lesson reorder */}
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

                        {/* Lesson published */}
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
                          href={`/admin/course-manager/lessons/${lesson.id}`}
                          className="shrink-0 p-1.5 text-[#2f3437]/40 hover:text-[#6ba3c7] hover:bg-[#6ba3c7]/10 rounded-lg transition-colors"
                        >
                          <PencilSquareIcon className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    ))}

                    {/* Add lesson inline */}
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

        {/* Add Section */}
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
