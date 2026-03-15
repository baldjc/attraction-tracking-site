"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface AvatarData {
  avatarName?: string | null;
  updatedAt?: string | null;
}

interface SavedScript {
  id: string;
  videoTitle: string;
  createdAt: string;
}

interface Props {
  basePath: string;
}

export default function AIToolsHub({ basePath }: Props) {
  const [avatar, setAvatar] = useState<AvatarData | null>(null);
  const [lastScript, setLastScript] = useState<SavedScript | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/member/avatar").then((r) => r.json()).catch(() => ({})),
      fetch("/api/ai-tools/saved-scripts").then((r) => r.json()).catch(() => ({ scripts: [] })),
    ]).then(([av, sc]) => {
      setAvatar(av);
      setLastScript(sc.scripts?.[0] ?? null);
      setLoading(false);
    });
  }, []);

  const avatarStatus = loading
    ? "Loading..."
    : avatar?.avatarName
    ? `Using avatar: ${avatar.avatarName}`
    : "No avatar — build one first for best results";

  const tools = [
    {
      href: `${basePath}/avatar-architect`,
      icon: "🎯",
      title: "Avatar Architect",
      description: "Build your ideal client avatar through a guided coaching conversation",
      extra: avatar?.avatarName
        ? `Avatar: ${avatar.avatarName} — Last updated ${avatar.updatedAt ? new Date(avatar.updatedAt).toLocaleDateString() : "—"}`
        : "No avatar yet — start here",
      badge: avatar?.avatarName ? "green" : "amber",
    },
    {
      href: `${basePath}/title-creator`,
      icon: "✍️",
      title: "Title Creator",
      description: "Generate proven, high-converting title options for your next video",
      extra: avatarStatus,
      badge: avatar?.avatarName ? "green" : "amber",
    },
    {
      href: `${basePath}/title-thumbnail-analyzer`,
      icon: "🔍",
      title: "Title & Thumbnail Analyzer",
      description: "Score your title and thumbnail combination before you publish",
      extra: avatarStatus,
      badge: avatar?.avatarName ? "green" : "amber",
    },
    {
      href: `${basePath}/arc-script-builder`,
      icon: "🎬",
      title: "ARC Script Builder",
      description: "Build a complete video script outline using the ARC Method",
      extra: lastScript
        ? `Last script: ${new Date(lastScript.createdAt).toLocaleDateString()}`
        : avatarStatus,
      badge: avatar?.avatarName ? "green" : "amber",
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1e2a38]">AI Tools</h1>
        <p className="text-[#1e2a38]/60 mt-1">
          AI-powered tools built around the Attraction by Video framework. {!avatar?.avatarName && "Build your avatar first for personalised results."}
        </p>
      </div>

      {!loading && !avatar?.avatarName && (
        <div className="mb-6 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <span className="text-xl">💡</span>
          <div>
            <p className="font-semibold text-amber-800 text-sm">Start with the Avatar Architect</p>
            <p className="text-amber-700 text-sm mt-0.5">
              All tools work best when they know who you're speaking to. Build your avatar once and every tool uses it automatically.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="group bg-white rounded-2xl border border-[#1e2a38]/10 p-6 hover:border-[#3dc3ff]/50 hover:shadow-lg transition-all duration-200"
          >
            <div className="flex items-start gap-4">
              <span className="text-3xl">{tool.icon}</span>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-[#1e2a38] group-hover:text-[#3dc3ff] transition-colors">
                  {tool.title}
                </h2>
                <p className="text-sm text-[#1e2a38]/60 mt-1">{tool.description}</p>
                <p className={`text-xs mt-3 font-medium ${tool.badge === "green" ? "text-[#3dc3ff]" : "text-amber-600"}`}>
                  {tool.extra}
                </p>
              </div>
              <span className="text-[#1e2a38]/20 group-hover:text-[#3dc3ff]/50 transition-colors text-lg">→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
