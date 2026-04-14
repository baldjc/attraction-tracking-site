"use client";

import { useState, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface Announcement {
  id: string;
  title: string;
  body: string;
  emoji: string;
  createdAt: string;
}

export default function AnnouncementModal() {
  const [queue, setQueue] = useState<Announcement[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    fetch("/api/member/announcements")
      .then((r) => r.json())
      .then((d) => {
        if (d.announcements?.length) {
          setQueue(d.announcements);
          setVisible(true);
        }
      })
      .catch(() => {});
  }, []);

  async function dismiss() {
    const current = queue[0];
    if (!current) return;

    setVisible(false);

    await fetch("/api/member/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: current.id }),
    }).catch(() => {});

    setTimeout(() => {
      const remaining = queue.slice(1);
      setQueue(remaining);
      if (remaining.length > 0) setVisible(true);
    }, 300);
  }

  const current = queue[0];
  if (!current) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={dismiss} />

      {/* Modal */}
      <div
        className={`relative z-10 bg-white dark:bg-[#1a2433] rounded-2xl shadow-2xl max-w-md w-full p-6 transition-all duration-300 ${
          visible ? "scale-100 translate-y-0" : "scale-95 translate-y-2"
        }`}
      >
        {/* Close */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 text-[#2f3437]/30 dark:text-white/30 hover:text-[#2f3437] dark:hover:text-white transition-colors"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>

        {/* Queue indicator */}
        {queue.length > 1 && (
          <div className="flex gap-1 mb-4">
            {queue.map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full flex-1 transition-colors ${
                  i === 0 ? "bg-[#6ba3c7]" : "bg-[#2f3437]/10 dark:bg-white/10"
                }`}
              />
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex items-start gap-4">
          <span className="text-4xl shrink-0 leading-none mt-0.5">{current.emoji}</span>
          <div className="flex-1 min-w-0 pr-4">
            <p className="text-xs font-semibold text-[#6ba3c7] uppercase tracking-wider mb-1">
              {queue.length > 1 ? `Message ${queue.length - queue.length + 1} of ${queue.length}` : "From Jared"}
            </p>
            <h2 className="text-lg font-bold text-[#2f3437] dark:text-[#e2e8f0] mb-2 leading-snug">
              {current.title}
            </h2>
            <p className="text-sm text-[#2f3437]/70 dark:text-[#94a3b8] leading-relaxed whitespace-pre-wrap">
              {current.body}
            </p>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={dismiss}
          className="mt-5 w-full bg-[#6ba3c7] hover:bg-[#5490b5] text-white font-semibold text-sm py-2.5 rounded-xl transition-colors"
        >
          {queue.length > 1 ? "Next →" : "Got it"}
        </button>
      </div>
    </div>
  );
}
