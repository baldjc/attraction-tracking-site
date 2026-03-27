"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";

interface Conversation {
  id: string;
  toolType: string;
  title: string;
  messages: any[];
  metadata?: { overallScore?: number | null } | null;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  toolType: string;
  onLoad?: (conversation: Conversation) => void;
  refreshTrigger?: number;
  label?: string;
  emptyLabel?: string;
  forceOpen?: number;
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

export default function RecentConversations({
  toolType,
  onLoad,
  refreshTrigger,
  label = "Recent Conversations",
  emptyLabel = "No saved conversations yet.",
  forceOpen,
}: Props) {
  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ai-tools/conversations?toolType=${toolType}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [toolType]);

  useEffect(() => {
    if (open) load();
  }, [open, load, refreshTrigger]);

  useEffect(() => {
    if (forceOpen && forceOpen > 0) {
      setOpen(true);
    }
  }, [forceOpen]);

  async function handleDownload(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    window.open(`/api/ai-tools/conversations/${id}/download`, "_blank");
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this?")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/ai-tools/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  const messageCount = (conv: Conversation) =>
    Array.isArray(conv.messages) ? conv.messages.length : 0;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ChatBubbleLeftRightIcon className="w-4 h-4 text-[#2f3437]/40" />
          <span className="text-xs font-semibold text-[#2f3437]/60 uppercase tracking-wider">
            {label}
          </span>
          {conversations.length > 0 && (
            <span className="text-xs bg-[#0d9488]/10 text-[#0d9488] font-semibold px-1.5 py-0.5 rounded-full">
              {conversations.length}
            </span>
          )}
        </div>
        {open ? (
          <ChevronUpIcon className="w-4 h-4 text-[#2f3437]/40" />
        ) : (
          <ChevronDownIcon className="w-4 h-4 text-[#2f3437]/40" />
        )}
      </button>

      {open && (
        <div className="bg-white">
          {loading ? (
            <p className="px-4 py-3 text-xs text-[#2f3437]/40 animate-pulse">Loading…</p>
          ) : conversations.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[#2f3437]/40">{emptyLabel}</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {conversations.map((conv) => (
                <li key={conv.id}>
                  <div
                    className={`flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors ${onLoad ? "cursor-pointer" : ""}`}
                    onClick={() => onLoad?.(conv)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-[#2f3437] truncate">{conv.title}</p>
                        {conv.metadata?.overallScore != null && (
                          <span className={`shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-md ${
                            conv.metadata.overallScore >= 7
                              ? "bg-green-100 text-green-700"
                              : conv.metadata.overallScore >= 5
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                          }`}>
                            {Number(conv.metadata.overallScore).toFixed(1)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#2f3437]/40 mt-0.5">
                        {fmt(conv.updatedAt)} · {messageCount(conv)} messages
                        {conv.downloadCount > 0 && ` · ${conv.downloadCount} downloads`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        onClick={(e) => handleDownload(conv.id, e)}
                        title="Download"
                        className="p-1.5 rounded-lg text-[#2f3437]/30 hover:text-[#0d9488] hover:bg-[#0d9488]/10 transition-colors"
                      >
                        <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(conv.id, e)}
                        disabled={deletingId === conv.id}
                        title="Delete"
                        className="p-1.5 rounded-lg text-[#2f3437]/30 hover:text-[#ff0033] hover:bg-[#ff0033]/10 transition-colors disabled:opacity-40"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
