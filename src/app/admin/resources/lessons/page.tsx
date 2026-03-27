"use client";

import { useState, useEffect } from "react";
import { PencilIcon, TrashIcon, ArrowPathIcon, PlusIcon, CheckCircleIcon, XCircleIcon, ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";

const PRINCIPLES = [
  "Avatar Clarity", "Themes Over Topics", "Binge Architecture", "Lead Magnet System",
  "Values Peppering", "Connection Language", "Grade 5 Language", "Consistency",
  "ARC Attention", "ARC Revelation", "ARC Connection", "Curiosity Bridges",
  "Story Proof", "Show Don't Tell", "Title Frameworks", "Approve the Click",
];

const PRINCIPLE_COLORS: Record<string, string> = {
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

interface Lesson {
  id: string;
  title: string;
  lessonNumber: string;
  sessionNumber: number;
  skoolUrl: string;
  fullTranscript: string;
  principles: string[];
  createdAt: string;
  segmentCount: number;
}

interface FormState {
  title: string;
  lessonNumber: string;
  sessionNumber: string;
  skoolUrl: string;
  principles: string[];
  fullTranscript: string;
}

const emptyForm: FormState = {
  title: "", lessonNumber: "", sessionNumber: "1", skoolUrl: "", principles: [], fullTranscript: "",
};

const INPUT = "w-full border border-[#2f3437]/20 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#6ba3c7]";
const CARD = "bg-white rounded-lg border border-[#2f3437]/10";

export default function AdminLessonsPage() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processResult, setProcessResult] = useState<{ id: string; count: number } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => { loadLessons(); }, []);

  async function loadLessons() {
    setLoading(true);
    const res = await fetch("/api/admin/resources/lessons");
    if (res.ok) setLessons(await res.json());
    setLoading(false);
  }

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setShowModal(true);
  }

  function openEdit(lesson: Lesson) {
    setEditingId(lesson.id);
    setForm({
      title: lesson.title,
      lessonNumber: lesson.lessonNumber,
      sessionNumber: String(lesson.sessionNumber),
      skoolUrl: lesson.skoolUrl,
      principles: lesson.principles,
      fullTranscript: lesson.fullTranscript,
    });
    setError(null);
    setShowModal(true);
  }

  function togglePrinciple(p: string) {
    setForm((f) => ({
      ...f,
      principles: f.principles.includes(p) ? f.principles.filter((x) => x !== p) : [...f.principles, p],
    }));
  }

  async function saveLesson() {
    if (!form.title || !form.lessonNumber || !form.sessionNumber) {
      setError("Title, lesson number, and session number are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: form.title,
        lessonNumber: form.lessonNumber,
        sessionNumber: parseInt(form.sessionNumber),
        skoolUrl: form.skoolUrl,
        principles: form.principles,
        fullTranscript: form.fullTranscript,
        autoProcess: !editingId && !!form.fullTranscript,
      };

      const url = editingId ? `/api/admin/resources/lessons/${editingId}` : "/api/admin/resources/lessons";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Save failed");
        return;
      }
      setShowModal(false);
      loadLessons();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function processTranscript(lesson: Lesson) {
    setProcessingId(lesson.id);
    setProcessResult(null);
    try {
      const res = await fetch(`/api/admin/resources/lessons/${lesson.id}/process`, { method: "POST" });
      const d = await res.json();
      if (res.ok) {
        setProcessResult({ id: lesson.id, count: d.segmentCount });
        loadLessons();
      } else {
        alert(d.error ?? "Processing failed");
      }
    } catch {
      alert("Network error during processing");
    } finally {
      setProcessingId(null);
    }
  }

  async function deleteLesson(id: string) {
    const res = await fetch(`/api/admin/resources/lessons/${id}`, { method: "DELETE" });
    if (res.ok) { setDeleteConfirm(null); loadLessons(); }
  }

  async function reprocessFromModal() {
    if (!editingId) return;
    const lesson = lessons.find((l) => l.id === editingId);
    if (!lesson) return;
    setSaving(true);
    setError(null);
    try {
      // Save changes first, then reprocess
      const body = {
        title: form.title, lessonNumber: form.lessonNumber, sessionNumber: parseInt(form.sessionNumber),
        skoolUrl: form.skoolUrl, principles: form.principles, fullTranscript: form.fullTranscript, reprocess: true,
      };
      const res = await fetch(`/api/admin/resources/lessons/${editingId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (res.ok) { setShowModal(false); loadLessons(); }
      else { const d = await res.json().catch(() => ({})); setError(d.error ?? "Save failed"); }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  const sessionGroups = [1, 2, 3, 4].map((s) => ({
    session: s,
    lessons: lessons.filter((l) => l.sessionNumber === s),
  }));

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#2f3437]">Course Lessons</h1>
          <p className="text-sm text-[#2f3437]/50 mt-1">Manage the Attraction by Video course content and transcripts</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-[#6ba3c7] text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#6ba3c7]/90 transition-colors">
          <PlusIcon className="w-4 h-4" /> Add Lesson
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-[#2f3437]/40">Loading lessons...</div>
      ) : (
        <div className="space-y-6">
          {sessionGroups.map(({ session, lessons: sLessons }) => (
            <div key={session} className={CARD}>
              <div className="px-6 py-4 border-b border-[#2f3437]/10">
                <h2 className="font-semibold text-[#2f3437]">Session {session}</h2>
                <p className="text-xs text-[#2f3437]/40 mt-0.5">{sLessons.length} lesson{sLessons.length !== 1 ? "s" : ""}</p>
              </div>
              {sLessons.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-[#2f3437]/30">No lessons in this session</div>
              ) : (
                <div className="divide-y divide-[#2f3437]/5">
                  {sLessons.map((lesson) => (
                    <div key={lesson.id}>
                      <div className="px-6 py-4 flex items-start gap-4">
                        <div className="flex-shrink-0 w-10 h-10 bg-[#111]/5 rounded-lg flex items-center justify-center">
                          <span className="text-xs font-bold text-[#2f3437]/60">{lesson.lessonNumber}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="font-semibold text-[#2f3437] text-sm">{lesson.title}</span>
                            {lesson.skoolUrl && (
                              <a href={lesson.skoolUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#6ba3c7] hover:underline">Skool ↗</a>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1 mb-2">
                            {lesson.principles.map((p) => (
                              <span key={p} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PRINCIPLE_COLORS[p] ?? "bg-gray-100 text-gray-600"}`}>{p}</span>
                            ))}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-[#2f3437]/40">
                            <span>{lesson.segmentCount} segment{lesson.segmentCount !== 1 ? "s" : ""}</span>
                            {lesson.fullTranscript ? <span className="text-green-600">Transcript uploaded</span> : <span className="text-amber-500">No transcript</span>}
                            {processResult?.id === lesson.id && (
                              <span className="text-[#6ba3c7] flex items-center gap-1">
                                <CheckCircleIcon className="w-3.5 h-3.5" /> {processResult.count} segments created
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {lesson.fullTranscript && (
                            <button
                              onClick={() => processTranscript(lesson)}
                              disabled={processingId === lesson.id}
                              title="Re-process transcript with Claude"
                              className="p-2 rounded-lg text-[#2f3437]/30 hover:text-[#6ba3c7] hover:bg-[#6ba3c7]/5 transition-colors disabled:opacity-40"
                            >
                              <ArrowPathIcon className={`w-4 h-4 ${processingId === lesson.id ? "animate-spin" : ""}`} />
                            </button>
                          )}
                          <button onClick={() => openEdit(lesson)} className="p-2 rounded-lg text-[#2f3437]/30 hover:text-[#6ba3c7] hover:bg-[#6ba3c7]/5 transition-colors">
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button onClick={() => setDeleteConfirm(lesson.id)} className="p-2 rounded-lg text-[#2f3437]/30 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <TrashIcon className="w-4 h-4" />
                          </button>
                          {lesson.segmentCount > 0 && (
                            <button
                              onClick={() => setExpandedId(expandedId === lesson.id ? null : lesson.id)}
                              className="p-2 rounded-lg text-[#2f3437]/30 hover:text-[#2f3437] transition-colors"
                            >
                              {expandedId === lesson.id ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      </div>
                      {expandedId === lesson.id && (
                        <SegmentList lessonId={lesson.id} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg border border-[#2f3437]/10 shadow-xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#2f3437]/10">
              <h2 className="font-bold text-[#2f3437] text-lg">{editingId ? "Edit Lesson" : "Add Lesson"}</h2>
              <button onClick={() => setShowModal(false)} className="text-[#2f3437]/40 hover:text-[#2f3437] text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-[#2f3437] mb-1.5">Lesson Number</label>
                  <input type="text" value={form.lessonNumber} onChange={(e) => setForm({ ...form, lessonNumber: e.target.value })} placeholder="e.g. 2.2" className={INPUT} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#2f3437] mb-1.5">Session</label>
                  <select value={form.sessionNumber} onChange={(e) => setForm({ ...form, sessionNumber: e.target.value })} className={`${INPUT} bg-white`}>
                    {[1, 2, 3, 4].map((s) => <option key={s} value={s}>Session {s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#2f3437] mb-1.5">Lesson Title</label>
                <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Connection Language" className={INPUT} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#2f3437] mb-1.5">Skool URL <span className="font-normal text-[#2f3437]/40">(optional)</span></label>
                <input type="text" value={form.skoolUrl} onChange={(e) => setForm({ ...form, skoolUrl: e.target.value })} placeholder="https://skool.com/..." className={INPUT} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#2f3437] mb-2">Attraction Principles</label>
                <div className="flex flex-wrap gap-1.5">
                  {PRINCIPLES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePrinciple(p)}
                      className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-all ${
                        form.principles.includes(p)
                          ? `${PRINCIPLE_COLORS[p] ?? "bg-gray-100 text-gray-600"} border-transparent`
                          : "bg-white text-[#2f3437]/50 border-[#2f3437]/20 hover:border-[#2f3437]/40"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#2f3437] mb-1.5">
                  Transcript <span className="font-normal text-[#2f3437]/40">(paste full transcript — Claude will segment it)</span>
                </label>
                <textarea
                  value={form.fullTranscript}
                  onChange={(e) => setForm({ ...form, fullTranscript: e.target.value })}
                  placeholder="Paste the lesson transcript here..."
                  rows={10}
                  className={`${INPUT} resize-y`}
                />
                <p className="text-xs text-[#2f3437]/40 mt-1">
                  {form.fullTranscript ? `${form.fullTranscript.length.toLocaleString()} characters` : "No transcript yet"}
                </p>
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button onClick={saveLesson} disabled={saving} className="flex-1 bg-[#6ba3c7] text-white py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50 hover:bg-[#6ba3c7]/90 transition-colors">
                  {saving ? "Saving..." : editingId ? "Save Changes" : "Create Lesson"}
                </button>
                {editingId && form.fullTranscript && (
                  <button onClick={reprocessFromModal} disabled={saving} className="flex items-center gap-2 px-4 py-2.5 border border-[#2f3437]/20 rounded-lg text-sm text-[#2f3437]/60 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                    <ArrowPathIcon className="w-4 h-4" /> Re-process
                  </button>
                )}
                <button onClick={() => setShowModal(false)} className="px-4 py-2.5 border border-[#2f3437]/20 rounded-lg text-sm text-[#2f3437]/60 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="font-bold text-[#2f3437] mb-2">Delete Lesson?</h3>
            <p className="text-sm text-[#2f3437]/60 mb-5">This will also delete all knowledge base segments for this lesson. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => deleteLesson(deleteConfirm)} className="flex-1 bg-red-500 text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-red-600 transition-colors">Delete</button>
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 border border-[#2f3437]/20 rounded-lg text-sm text-[#2f3437]/60 hover:bg-gray-50 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SegmentList({ lessonId }: { lessonId: string }) {
  const [segments, setSegments] = useState<Array<{ id: string; subTopic: string; summary: string; principles: string[]; timestampStart: number | null; timestampEnd: number | null }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/resources/lessons/${lessonId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.segments) setSegments(d.segments); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [lessonId]);

  if (loading) return <div className="px-6 py-3 text-xs text-[#2f3437]/40">Loading segments...</div>;
  if (!segments.length) return <div className="px-6 py-3 text-xs text-[#2f3437]/40">No segments yet</div>;

  function fmtTime(s: number | null) {
    if (!s) return "";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  return (
    <div className="bg-[#111]/2 border-t border-[#2f3437]/5 divide-y divide-[#2f3437]/5">
      {segments.map((seg, i) => (
        <div key={seg.id} className="px-6 py-3 flex gap-3">
          <span className="text-xs text-[#2f3437]/30 w-5 flex-shrink-0 mt-0.5">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-[#2f3437]">{seg.subTopic}</span>
              {(seg.timestampStart != null) && (
                <span className="text-[10px] text-[#2f3437]/30">{fmtTime(seg.timestampStart)}–{fmtTime(seg.timestampEnd)}</span>
              )}
            </div>
            <p className="text-xs text-[#2f3437]/60 mb-1">{seg.summary}</p>
            <div className="flex flex-wrap gap-1">
              {seg.principles.map((p) => (
                <span key={p} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PRINCIPLE_COLORS[p] ?? "bg-gray-100 text-gray-500"}`}>{p}</span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
