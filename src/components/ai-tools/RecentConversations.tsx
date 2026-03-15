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
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  toolType: string;
  onLoad?: (conversation: Conversation) => void;
  refreshTrigger?: number;
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

export default function RecentConversations({ toolType, onLoad, refreshTrigger }: Props) {
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

  async function handleDownload(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    window.open(`/api/ai-tools/conversations/${id}/download`, "_blank");
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this conversation?")) return;
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
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-6">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ChatBubbleLeftRightIcon className="w-4 h-4 text-[#1e2a38]/40" />
          <span className="text-xs font-semibold text-[#1e2a38]/60 uppercase tracking-wider">
            Recent Conversations
          </span>
          {conversations.length > 0 && (
            <span className="text-xs bg-[#3dc3ff]/10 text-[#3dc3ff] font-semibold px-1.5 py-0.5 rounded-full">
              {conversations.length}
            </span>
          )}
        </div>
        {open ? (
          <ChevronUpIcon className="w-4 h-4 text-[#1e2a38]/40" />
        ) : (
          <ChevronDownIcon className="w-4 h-4 text-[#1e2a38]/40" />
        )}
      </button>

      {open && (
        <div className="bg-white">
          {loading ? (
            <p className="px-4 py-3 text-xs text-[#1e2a38]/40 animate-pulse">Loading…</p>
          ) : conversations.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[#1e2a38]/40">No saved conversations yet.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {conversations.map((conv) => (
                <li key={conv.id}>
                  <div
                    className={`flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors ${onLoad ? "cursor-pointer" : ""}`}
                    onClick={() => onLoad?.(conv)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1e2a38] truncate">{conv.title}</p>
                      <p className="text-xs text-[#1e2a38]/40 mt-0.5">
                        {fmt(conv.updatedAt)} · {messageCount(conv)} messages
                        {conv.downloadCount > 0 && ` · ${conv.downloadCount} downloads`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <button
                        onClick={(e) => handleDownload(conv.id, e)}
                        title="Download conversation"
                        className="p-1.5 rounded-lg text-[#1e2a38]/30 hover:text-[#3dc3ff] hover:bg-[#3dc3ff]/10 transition-colors"
                      >
                        <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(conv.id, e)}
                        disabled={deletingId === conv.id}
                        title="Delete conversation"
                        className="p-1.5 rounded-lg text-[#1e2a38]/30 hover:text-[#ff0033] hover:bg-[#ff0033]/10 transition-colors disabled:opacity-40"
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
