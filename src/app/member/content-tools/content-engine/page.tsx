"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import NicheSetup from "@/components/ai-tools/content-engine/NicheSetup";
import ThemeDashboard from "@/components/ai-tools/content-engine/ThemeDashboard";
import { LinkButton } from "@/components/ui/Button";

interface AvatarData {
  avatarName?: string | null;
  contentThemes?: unknown[] | null;
  niche?: string | null;
  city?: string | null;
}

type PageState = "loading" | "no-avatar" | "niche-setup" | "dashboard";

export default function ContentEnginePage() {
  const [state, setState] = useState<PageState>("loading");
  const [avatarData, setAvatarData] = useState<AvatarData | null>(null);

  useEffect(() => {
    fetch("/api/member/avatar")
      .then((r) => r.json())
      .catch(() => ({}))
      .then((av) => {
        setAvatarData(av);
        if (!av?.avatarName) {
          setState("no-avatar");
        } else if (!av?.niche) {
          setState("niche-setup");
        } else {
          setState("dashboard");
        }
      });
  }, []);

  if (state === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-[var(--abv-text)]/40 dark:text-white/30 text-sm animate-pulse">Loading Content Engine...</div>
      </div>
    );
  }

  if (state === "no-avatar") {
    return (
      <div className="flex items-center justify-center min-h-[50vh] p-4">
        <div className="bg-white dark:bg-[#1a1a1a] rounded-lg border border-[var(--abv-text)]/10 dark:border-white/10 p-8 max-w-sm w-full text-center">
          <p className="text-3xl mb-4">🎯</p>
          <h2 className="font-bold text-[var(--abv-text)] text-lg mb-2">Build your avatar first</h2>
          <p className="text-sm text-[var(--abv-text)]/60 mb-6">
            Your Content Engine needs an avatar to work. Build yours now — it only takes a few minutes and powers every AI tool.
          </p>
          <LinkButton href="/member/content-tools/avatar-architect" variant="aiTools">
            Build your avatar →
          </LinkButton>
        </div>
      </div>
    );
  }

  if (state === "niche-setup") {
    return (
      <div className="flex items-center justify-center min-h-[50vh] p-4">
        <div className="w-full max-w-md">
          <NicheSetup
            onSaved={(niche, city) => {
              setAvatarData((prev) => ({ ...prev, niche, city }));
              setState("dashboard");
            }}
          />
        </div>
      </div>
    );
  }

  const themes = (avatarData?.contentThemes ?? []) as Array<unknown>;
  const nicheValue = Array.isArray(avatarData?.niche)
    ? ((avatarData?.niche as string[])[0] ?? null)
    : (avatarData?.niche ?? null);

  return (
    <div className="max-w-4xl mx-auto">
      <ThemeDashboard
        themes={themes as never}
        niche={nicheValue}
        city={avatarData?.city ?? null}
      />
    </div>
  );
}
