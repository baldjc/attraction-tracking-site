"use client";

import { useEffect, useState } from "react";
import { PencilIcon, TrashIcon, PlusIcon, XMarkIcon, ArrowUpIcon, ArrowDownIcon } from "@heroicons/react/24/outline";

interface QuickLink {
  id: string;
  label: string;
  url: string;
  sortOrder: number;
}

interface Props {
  memberId: string;
  serviceTier: string;
}

const GROWTH_DWY = ["mastery_2", "mastery_4", "done_with_you"];

export default function AdminClientHubTab({ memberId, serviceTier }: Props) {
  const [assetsDriveLink, setAssetsDriveLink] = useState("");
  const [assetsSaving, setAssetsSaving] = useState(false);
  const [assetsSaved, setAssetsSaved] = useState(false);

  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(true);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [editingLink, setEditingLink] = useState<QuickLink | null>(null);
  const [linkForm, setLinkForm] = useState({ label: "", url: "" });
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<QuickLink | null>(null);
  const [deleting, setDeleting] = useState(false);

  const showQuickLinks = GROWTH_DWY.includes(serviceTier);

  useEffect(() => {
    fetch(`/api/members/${memberId}`)
      .then((r) => r.json())
      .then((d) => setAssetsDriveLink(d.member?.assetsDriveLink ?? ""))
      .catch(() => {});
  }, [memberId]);

  useEffect(() => {
    if (!showQuickLinks) { setLinksLoading(false); return; }
    fetch(`/api/admin/members/${memberId}/quick-links`)
      .then((r) => r.json())
      .then((d) => setQuickLinks(d.quickLinks ?? []))
      .catch(() => {})
      .finally(() => setLinksLoading(false));
  }, [memberId, showQuickLinks]);

  async function saveAssetsLink() {
    setAssetsSaving(true);
    try {
      await fetch(`/api/admin/members/${memberId}/assets-drive-link`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetsDriveLink: assetsDriveLink || null }),
      });
      setAssetsSaved(true);
      setTimeout(() => setAssetsSaved(false), 2000);
    } catch { /* silent */ } finally {
      setAssetsSaving(false);
    }
  }

  function openAddLink() {
    setEditingLink(null);
    setLinkForm({ label: "", url: "" });
    setLinkError("");
    setShowLinkModal(true);
  }

  function openEditLink(link: QuickLink) {
    setEditingLink(link);
    setLinkForm({ label: link.label, url: link.url });
    setLinkError("");
    setShowLinkModal(true);
  }

  async function handleSaveLink() {
    if (!linkForm.label || !linkForm.url) {
      setLinkError("Label and URL are required.");
      return;
    }
    setLinkSaving(true);
    setLinkError("");
    try {
      const url = editingLink
        ? `/api/admin/members/${memberId}/quick-links/${editingLink.id}`
        : `/api/admin/members/${memberId}/quick-links`;
      const method = editingLink ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(linkForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      if (editingLink) {
        setQuickLinks((prev) => prev.map((l) => l.id === editingLink.id ? data.quickLink : l));
      } else {
        setQuickLinks((prev) => [...prev, data.quickLink]);
      }
      setShowLinkModal(false);
    } catch (e: unknown) {
      setLinkError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setLinkSaving(false);
    }
  }

  async function handleDeleteLink() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/admin/members/${memberId}/quick-links/${deleteTarget.id}`, { method: "DELETE" });
      setQuickLinks((prev) => prev.filter((l) => l.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch { /* silent */ } finally {
      setDeleting(false);
    }
  }

  async function moveLink(link: QuickLink, direction: "up" | "down") {
    const idx = quickLinks.findIndex((l) => l.id === link.id);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === quickLinks.length - 1) return;

    const newLinks = [...quickLinks];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [newLinks[idx], newLinks[swapIdx]] = [newLinks[swapIdx], newLinks[idx]];
    setQuickLinks(newLinks);

    await fetch(`/api/admin/members/${memberId}/quick-links/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds: newLinks.map((l) => l.id) }),
    }).catch(() => {});
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[#2f3437] mb-3">Assets Drive Folder URL</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={assetsDriveLink}
            onChange={(e) => setAssetsDriveLink(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30 bg-white"
          />
          <button
            onClick={saveAssetsLink}
            disabled={assetsSaving}
            className="px-4 py-2 text-sm bg-[#2f3437] text-white rounded-lg hover:bg-[#1a1f22] disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {assetsSaved ? "Saved ✓" : assetsSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {showQuickLinks && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#2f3437]">Quick Links</h3>
            <button
              onClick={openAddLink}
              className="flex items-center gap-1.5 text-xs bg-[#2f3437] text-white px-3 py-1.5 rounded-lg hover:bg-[#1a1f22] transition-colors"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Add Link
            </button>
          </div>

          {linksLoading ? (
            <div className="animate-pulse h-16 bg-gray-200 rounded-lg" />
          ) : quickLinks.length === 0 ? (
            <p className="text-sm text-[#2f3437]/40">No quick links yet.</p>
          ) : (
            <div className="space-y-2">
              {quickLinks.map((link, idx) => (
                <div
                  key={link.id}
                  className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2"
                >
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveLink(link, "up")}
                      disabled={idx === 0}
                      className="text-[#2f3437]/30 hover:text-[#2f3437] disabled:opacity-20"
                    >
                      <ArrowUpIcon className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => moveLink(link, "down")}
                      disabled={idx === quickLinks.length - 1}
                      className="text-[#2f3437]/30 hover:text-[#2f3437] disabled:opacity-20"
                    >
                      <ArrowDownIcon className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#2f3437] truncate">{link.label}</p>
                    <p className="text-xs text-[#2f3437]/40 truncate">{link.url}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEditLink(link)}
                      className="p-1.5 text-[#2f3437]/40 hover:text-[#2f3437] rounded hover:bg-gray-100 transition-colors"
                    >
                      <PencilIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(link)}
                      className="p-1.5 text-[#2f3437]/40 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showLinkModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-[#2f3437]">
                {editingLink ? "Edit Link" : "Add Quick Link"}
              </h3>
              <button onClick={() => setShowLinkModal(false)} className="text-[#2f3437]/40 hover:text-[#2f3437]">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">Label *</label>
                <input
                  type="text"
                  value={linkForm.label}
                  onChange={(e) => setLinkForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="e.g., Shared Drive"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#2f3437]/60 mb-1">URL *</label>
                <input
                  type="url"
                  value={linkForm.url}
                  onChange={(e) => setLinkForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6ba3c7]/30"
                />
              </div>
              {linkError && <p className="text-sm text-red-600">{linkError}</p>}
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button
                onClick={() => setShowLinkModal(false)}
                className="px-4 py-2 text-sm text-[#2f3437]/60 hover:text-[#2f3437] border border-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveLink}
                disabled={linkSaving}
                className="px-4 py-2 text-sm bg-[#2f3437] text-white rounded-lg hover:bg-[#1a1f22] disabled:opacity-50 transition-colors"
              >
                {linkSaving ? "Saving…" : editingLink ? "Save Changes" : "Add Link"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-[#2f3437] mb-2">Delete quick link?</h3>
            <p className="text-sm text-[#2f3437]/60 mb-6">This will remove &ldquo;{deleteTarget.label}&rdquo; from the member's Client Hub.</p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm text-[#2f3437]/60 hover:text-[#2f3437] border border-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteLink}
                disabled={deleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
