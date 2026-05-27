"use client";

import { useState } from "react";
import Image from "next/image";
import { CheckCircleIcon } from "@heroicons/react/24/solid";

interface Props {
  initialUrl: string;
  initialHandle: string | null;
  initialName: string | null;
  initialThumbnail: string | null;
  channelLocked: boolean;
  onNext: (data: { youtubeChannelUrl: string | null; noChannel: boolean }) => void;
}

export default function StepYouTube({ initialUrl, initialHandle, initialName, initialThumbnail, channelLocked, onNext }: Props) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [noChannel, setNoChannel] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<{ handle: string; name: string; thumbnail: string | null } | null>(
    initialUrl && initialHandle && initialName ? { handle: initialHandle, name: initialName, thumbnail: initialThumbnail } : null
  );
  const [error, setError] = useState<string | null>(null);

  async function resolveChannel() {
    if (!url.trim()) return;
    setResolving(true);
    setError(null);
    setResolved(null);
    try {
      const res = await fetch("/api/member/onboarding/resolve-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeChannelUrl: url.trim() }),
      });
      if (!res.ok) throw new Error("not_found");
      const data = await res.json();
      setResolved({ handle: data.youtubeHandle, name: data.youtubeChannelName, thumbnail: data.youtubeChannelThumbnail });
    } catch {
      setError("Couldn't find that channel. Check the URL and try again.");
    } finally {
      setResolving(false);
    }
  }

  function handleContinue() {
    if (channelLocked) {
      onNext({ youtubeChannelUrl: initialUrl, noChannel: false });
      return;
    }
    onNext({ youtubeChannelUrl: resolved ? url : null, noChannel });
  }

  const canContinue = channelLocked || !!resolved || noChannel;

  // STATE A: Channel locked
  if (channelLocked && initialUrl) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-4 bg-[var(--abv-bg)] dark:bg-[#0f1419] rounded-xl border border-[var(--abv-text)]/10 dark:border-white/10">
          {initialThumbnail ? (
            <Image src={initialThumbnail} alt={initialName ?? ""} width={44} height={44} className="rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-11 h-11 rounded-full bg-[var(--abv-dark)]/20 flex items-center justify-center shrink-0">
              <span className="text-[var(--abv-azure)] font-bold text-sm">YT</span>
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-sm text-[var(--abv-text)] dark:text-white truncate">{initialName ?? "Your Channel"}</p>
            <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/40 truncate">{initialHandle ?? initialUrl}</p>
          </div>
          <CheckCircleIcon className="w-5 h-5 text-green-500 shrink-0 ml-auto" />
        </div>
        <p className="text-xs text-[var(--abv-text)]/40 dark:text-white/30">Your channel is already linked. Contact your admin to change it.</p>
        <button
          onClick={handleContinue}
          className="w-full bg-[var(--abv-dark)] hover:bg-[#2bb0ec] text-white font-semibold text-sm py-2.5 rounded-lg transition-colors"
        >
          Continue →
        </button>
      </div>
    );
  }

  // STATE B: Not set
  return (
    <div className="space-y-4">
      {!noChannel && (
        <>
          <div>
            <label className="block text-sm font-medium text-[var(--abv-text)] dark:text-white mb-1.5">YouTube Channel URL</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setResolved(null); setError(null); }}
                onBlur={resolveChannel}
                placeholder="https://www.youtube.com/@YourHandle"
                className="flex-1 border border-[var(--abv-text)]/20 dark:border-white/20 rounded-lg px-3 py-2 text-sm text-[var(--abv-text)] dark:text-white placeholder-[var(--abv-text)]/30 dark:placeholder-white/30 bg-white dark:bg-[#0f1419] focus:outline-none focus:ring-2 focus:ring-[var(--abv-azure)]/40"
              />
              <button
                onClick={resolveChannel}
                disabled={resolving || !url.trim()}
                className="px-4 py-2 text-sm font-semibold bg-[var(--abv-text)]/10 dark:bg-white/10 text-[var(--abv-text)] dark:text-white rounded-lg hover:bg-[var(--abv-text)]/15 disabled:opacity-40 transition-colors"
              >
                {resolving ? "..." : "Check"}
              </button>
            </div>
          </div>

          {resolved && (
            <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 rounded-xl">
              {resolved.thumbnail ? (
                <Image src={resolved.thumbnail} alt={resolved.name} width={36} height={36} className="rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-[var(--abv-dark)]/20 flex items-center justify-center shrink-0">
                  <span className="text-[var(--abv-azure)] font-bold text-xs">YT</span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm text-[var(--abv-text)] dark:text-white truncate">{resolved.name}</p>
                <p className="text-xs text-[var(--abv-text)]/50 dark:text-white/40">{resolved.handle}</p>
              </div>
              <CheckCircleIcon className="w-5 h-5 text-green-500 shrink-0" />
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
        </>
      )}

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={noChannel}
          onChange={(e) => { setNoChannel(e.target.checked); if (e.target.checked) { setResolved(null); setError(null); } }}
          className="rounded border-[var(--abv-text)]/30 text-[var(--abv-azure)] focus:ring-[var(--abv-azure)]/40"
        />
        <span className="text-sm text-[var(--abv-text)]/60 dark:text-white/50">I don&apos;t have a YouTube channel yet</span>
      </label>

      <button
        onClick={handleContinue}
        disabled={!canContinue}
        className="w-full bg-[var(--abv-dark)] hover:bg-[#2bb0ec] text-white font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-40"
      >
        Continue →
      </button>
    </div>
  );
}
