"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { XMarkIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import {
  STATUS_STYLES,
  PRIORITY_OPTIONS,
  getStatusOptions,
  hasEditDueDate,
  hasDriveFolder,
} from "@/lib/content-plan-utils";

export interface ContentPlan {
  id: string;
  title: string;
  status: string;
  theme: string | null;
  shootDate: string | null;
  publishDate: string | null;
  editDueDate: string | null;
  priority: string | null;
  notes: string | null;
  script: string | null;
  researchNotes: string | null;
  thumbnailWords: string | null;
  footageLink: string | null;
  driveFolderLink: string | null;
}

interface ThemeOption {
  name: string;
  emoji?: string | null;
  colour?: string | null;
}

interface Props {
  plan: ContentPlan;
  serviceTier: string;
  apiBase: string;
  isAdmin?: boolean;
  memberId?: string;
  themes?: ThemeOption[];
  onClose: () => void;
  onSaved: (updated: ContentPlan) => void;
  onDeleted?: (id: string) => void;
}

function toDateInput(val: string | null) {
  if (!val) return "";
  return new Date(val).toISOString().slice(0, 10);
}

export default function ContentPlanEditModal({ plan, serviceTier, apiBase, isAdmin, memberId, themes = [], onClose, onSaved, onDeleted }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: plan.title,
    status: plan.status,
    theme: plan.theme ?? "",
    publishDate: toDateInput(plan.publishDate),
    shootDate: toDateInput(plan.shootDate),
    editDueDate: toDateInput(plan.editDueDate),
    priority: plan.priority ?? "",
    notes: plan.notes ?? "",
    script: plan.script ?? "",
    researchNotes: plan.researchNotes ?? "",
    thumbnailWords: plan.thumbnailWords ?? "",
    footageLink: plan.footageLink ?? "",
  });
  const [driveFolderLink, setDriveFolderLink] = useState(plan.driveFolderLink);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderError, setFolderError] = useState("");
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  const showEditDue = hasEditDueDate(serviceTier);
  const useDrive = hasDriveFolder(serviceTier);
  const statusOptions = getStatusOptions(serviceTier);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSave() {
    if (!form.title.trim()) { setError("Title is required."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          status: form.status,
          theme: form.theme || null,
          publishDate: form.publishDate || null,
          shootDate: form.shootDate || null,
          editDueDate: form.editDueDate || null,
          priority: form.priority || null,
          notes: form.notes || null,
          script: form.script || null,
          researchNotes: form.researchNotes || null,
          thumbnailWords: form.thumbnailWords || null,
          footageLink: form.footageLink || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      if (data.plan?.driveFolderLink) setDriveFolderLink(data.plan.driveFolderLink);
      onSaved(data.plan);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`${apiBase}/${plan.id}`, { method: "DELETE" });
      onDeleted?.(plan.id);
      onClose();
    } catch { setError("Failed to delete"); } finally {
      setDeleting(false);
    }
  }

  async function handleCreateFolder() {
    setCreatingFolder(true);
    setFolderError("");
    try {
      const mid = memberId ?? apiBase.match(/members\/([^/]+)/)?.[1];
      if (!mid) throw new Error("Cannot determine member ID");
      const res = await fetch(`/api/admin/members/${mid}/content-plans/${plan.id}/drive-folder`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create folder");
      setDriveFolderLink(data.driveFolderLink);
    } catch (e: unknown) {
      setFolderError(e instanceof Error ? e.message : "Failed to create folder");
    } finally {
      setCreatingFolder(false);
    }
  }

  const field = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30";

  function pushToAITool(tool: "title" | "script-builder" | "script-review") {
    if (tool === "title") {
      sessionStorage.setItem("title_prefill", JSON.stringify({ title: form.title }));
      router.push("/member/ai-tools/title-thumbnail-analyzer");
    } else if (tool === "script-builder") {
      const talkingPoints = form.notes.split("\n").map((l) => l.trim()).filter(Boolean);
      sessionStorage.setItem("arc_prefill", JSON.stringify({ planId: plan.id, title: form.title, talkingPoints }));
      router.push("/member/ai-tools/arc-script-builder");
    } else {
      sessionStorage.setItem("script_review_prefill", JSON.stringify({ title: form.title, script: form.script }));
      router.push("/member/ai-tools/script-review");
    }
  }

  function downloadScript(format: "md" | "txt" | "pdf") {
    setShowDownloadMenu(false);
    const title = form.title || "script";
    const script = form.script || "";
    const safeName = title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

    if (format === "md") {
      const content = `# ${title}\n\n${script}`;
      const blob = new Blob([content], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${safeName}.md`; a.click();
      URL.revokeObjectURL(url);
    } else if (format === "txt") {
      const content = `${title}\n${"=".repeat(title.length)}\n\n${script}`;
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${safeName}.txt`; a.click();
      URL.revokeObjectURL(url);
    } else {
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>
        body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.7; }
        h1 { font-size: 1.6rem; margin-bottom: 1.5rem; border-bottom: 2px solid #eee; padding-bottom: 0.5rem; }
        pre { white-space: pre-wrap; word-break: break-word; font-family: inherit; font-size: 1rem; margin: 0; }
        @media print { body { margin: 20px; } }
      </style></head><body><h1>${title}</h1><pre>${script.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre></body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); }, 300);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-8">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-[#2f3437]">Edit Video</h3>
          <button onClick={onClose} className="text-[#2f3437]/40 hover:text-[#2f3437]">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-[#2f3437]/60">Title</label>
              <button type="button" onClick={() => pushToAITool("title")} className="text-xs text-[#6ba3c7] hover:underline">Analyse Title →</button>
            </div>
            <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={field} />
            <p className={`text-xs mt-1 text-right ${form.title.length > 80 ? "text-red-500" : form.title.length > 60 ? "text-amber-500" : "text-[#2f3437]/40"}`}>
              {form.title.length} / 60
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={field}>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Priority</label>
              <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className={field}>
                <option value="">—</option>
                {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Theme</label>
            {themes.length > 0 ? (
              <select value={form.theme} onChange={(e) => setForm((f) => ({ ...f, theme: e.target.value }))} className={field}>
                <option value="">— none —</option>
                {themes.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.emoji ? `${t.emoji} ${t.name}` : t.name}
                  </option>
                ))}
              </select>
            ) : (
              <input type="text" value={form.theme} onChange={(e) => setForm((f) => ({ ...f, theme: e.target.value }))} className={field} placeholder="e.g., Neighbourhood Expertise" />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Shoot Date</label>
              <input type="date" value={form.shootDate} onChange={(e) => setForm((f) => ({ ...f, shootDate: e.target.value }))} className={field} />
            </div>
            {showEditDue ? (
              <div>
                <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Edit Due Date</label>
                <input type="date" value={form.editDueDate} onChange={(e) => setForm((f) => ({ ...f, editDueDate: e.target.value }))} className={field} />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Publish Date</label>
                <input type="date" value={form.publishDate} onChange={(e) => setForm((f) => ({ ...f, publishDate: e.target.value }))} className={field} />
              </div>
            )}
          </div>

          {showEditDue && (
            <div>
              <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Publish Date</label>
              <input type="date" value={form.publishDate} onChange={(e) => setForm((f) => ({ ...f, publishDate: e.target.value }))} className={field} />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-[#2f3437]/60">Talking Points / Outline of Video</label>
              <button type="button" onClick={() => pushToAITool("script-builder")} className="text-xs text-[#6ba3c7] hover:underline">Build Script →</button>
            </div>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} className={`${field} resize-y`} placeholder="Key details, action items…" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-[#2f3437]/60">Script</label>
              <button type="button" onClick={() => pushToAITool("script-review")} className="text-xs text-[#6ba3c7] hover:underline">Script Review →</button>
            </div>
            <textarea value={form.script} onChange={(e) => setForm((f) => ({ ...f, script: e.target.value }))} rows={6} className={`${field} resize-y`} placeholder="Write your video script here…" />
            {form.script.trim() && (
              <div className="relative mt-1.5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowDownloadMenu((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-[#2f3437]/50 hover:text-[#6ba3c7] transition-colors"
                >
                  <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                  Download Script
                </button>
                {showDownloadMenu && (
                  <div className="absolute right-0 top-6 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[130px]">
                    {(["md", "txt", "pdf"] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => downloadScript(fmt)}
                        className="w-full text-left px-3 py-1.5 text-xs text-[#2f3437] hover:bg-gray-50 transition-colors"
                      >
                        .{fmt}{fmt === "pdf" ? " (print)" : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">
              Research Notes
              <span className="ml-1 font-normal text-[#2f3437]/40">(paste notes, stats, talking points)</span>
            </label>
            <textarea value={form.researchNotes} onChange={(e) => setForm((f) => ({ ...f, researchNotes: e.target.value }))} rows={5} className={`${field} resize-y`} placeholder="Paste your research here — statistics, sources, talking points, Manus/Perplexity output…" />
          </div>

          <div className={`grid gap-3 ${useDrive ? "grid-cols-1" : "grid-cols-2"}`}>
            <div>
              <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Thumbnail Words</label>
              <input type="text" value={form.thumbnailWords} onChange={(e) => setForm((f) => ({ ...f, thumbnailWords: e.target.value }))} className={field} placeholder="3–5 words" />
            </div>
            {!useDrive && (
              <div>
                <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Footage Link</label>
                <input type="text" value={form.footageLink} onChange={(e) => setForm((f) => ({ ...f, footageLink: e.target.value }))} className={field} placeholder="https://…" />
              </div>
            )}
          </div>

          {useDrive && (
            <div>
              <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Google Drive Folder</label>
              {driveFolderLink ? (
                <a
                  href={driveFolderLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 text-sm text-[#6ba3c7] bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors w-full truncate"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                  </svg>
                  Open Drive Folder
                </a>
              ) : isAdmin ? (
                <div>
                  <button
                    type="button"
                    onClick={handleCreateFolder}
                    disabled={creatingFolder}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-[#2f3437]/70 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                    </svg>
                    {creatingFolder ? "Creating folder…" : "Create Drive Folder"}
                  </button>
                  {folderError && <p className="text-xs text-red-600 mt-1">{folderError}</p>}
                </div>
              ) : (
                <p className="text-xs text-[#2f3437]/50 italic">Your folder will be created automatically when the status is set to Ready to Shoot, Shooting, or Shot - In Post.</p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-between px-6 pb-5 pt-2 border-t border-gray-100">
          {onDeleted ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600">Are you sure?</span>
                <button onClick={handleDelete} disabled={deleting} className="text-xs text-red-600 font-medium hover:underline disabled:opacity-50">
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-[#2f3437]/50 hover:text-[#2f3437]">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-xs text-[#2f3437]/40 hover:text-red-600 transition-colors">Delete video</button>
            )
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-[#2f3437]/60 hover:text-[#2f3437] border border-gray-200 rounded-lg">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-[#2f3437] text-white rounded-lg hover:bg-[#1a1f22] disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
