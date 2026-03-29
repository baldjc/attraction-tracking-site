"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import WizardShell from "@/components/onboarding/WizardShell";
import StepYouTube from "@/components/onboarding/StepYouTube";
import StepAboutYou from "@/components/onboarding/StepAboutYou";
import StepGoals from "@/components/onboarding/StepGoals";
import StepAvatar from "@/components/onboarding/StepAvatar";
import StepTour from "@/components/onboarding/StepTour";

const TOTAL_STEPS = 5;

const STEP_CONFIG = [
  {
    heading: "Welcome to Attraction by Video",
    subheading: "Let's get you set up — this takes about 3 minutes and makes everything on the platform work better for you.",
  },
  { heading: "Tell us about your real estate business", subheading: undefined },
  { heading: "What does success look like for your channel?", subheading: undefined },
  {
    heading: "Your ideal client avatar powers everything on this platform",
    subheading: "Your avatar tells the AI tools who you're creating content for — your niche, your audience's fears, motivations, and the themes you should be talking about.",
  },
  { heading: "You're all set — here's the quick tour", subheading: undefined },
];

interface WizardData {
  youtubeChannelUrl: string | null;
  noChannel: boolean;
  channelLocked: boolean;
  youtubeHandle: string | null;
  youtubeChannelName: string | null;
  youtubeChannelThumbnail: string | null;
  city: string;
  niche: string[];
  creatorCredentials: string;
  incomeGoal: string;
  postingRhythm: number | null;
  biggestChallenge: string;
  avatarPath: "existing" | "imported" | "build_later";
  extractedAvatar: any;
  existingAvatarName: string | null;
  existingContentThemes: unknown[] | null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<WizardData>({
    youtubeChannelUrl: null,
    noChannel: false,
    channelLocked: false,
    youtubeHandle: null,
    youtubeChannelName: null,
    youtubeChannelThumbnail: null,
    city: "",
    niche: [],
    creatorCredentials: "",
    incomeGoal: "",
    postingRhythm: null,
    biggestChallenge: "",
    avatarPath: "build_later",
    extractedAvatar: null,
    existingAvatarName: null,
    existingContentThemes: null,
  });

  useEffect(() => {
    fetch("/api/member/onboarding")
      .then((r) => r.json())
      .then((d) => {
        const niche = Array.isArray(d.niche) ? d.niche : d.niche ? [d.niche] : [];
        const themes = Array.isArray(d.contentThemes) ? d.contentThemes : null;
        setData((prev) => ({
          ...prev,
          youtubeChannelUrl: d.youtubeChannelUrl ?? null,
          channelLocked: !!d.youtubeChannelUrl,
          youtubeHandle: d.youtubeHandle ?? null,
          youtubeChannelName: d.youtubeChannelName ?? null,
          youtubeChannelThumbnail: d.youtubeChannelThumbnail ?? null,
          city: d.city ?? "",
          niche,
          creatorCredentials: d.creatorCredentials ?? "",
          incomeGoal: d.incomeGoal ?? "",
          postingRhythm: d.postingRhythm ?? null,
          biggestChallenge: d.biggestChallenge ?? "",
          existingAvatarName: d.avatarName ?? null,
          existingContentThemes: themes,
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function mergeAndAdvance(stepData: Partial<WizardData>) {
    setData((prev) => ({ ...prev, ...stepData }));
    setStep((s) => s + 1);
  }

  async function handleSkip() {
    await fetch("/api/member/onboarding", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboardingDismissedAt: new Date().toISOString() }),
    });
    router.push("/member/dashboard");
  }

  async function handleFinish() {
    setSaving(true);
    try {
      // 1. Save YouTube channel if not locked and URL provided
      if (!data.channelLocked && data.youtubeChannelUrl) {
        await fetch("/api/member/channel", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ youtubeChannelUrl: data.youtubeChannelUrl }),
        });
      }

      // 2. Save avatar if imported
      if (data.avatarPath === "imported" && data.extractedAvatar) {
        await fetch("/api/member/avatar", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            avatarProfile: data.extractedAvatar,
            avatarName: data.extractedAvatar.avatar_name ?? null,
            avatarSummary: data.extractedAvatar.avatar_summary ?? null,
            contentThemes: data.extractedAvatar.content_themes ?? null,
          }),
        });
      }

      // 3. Save niche
      if (data.niche.length > 0) {
        await fetch("/api/member/niche", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ niche: data.niche, city: data.city || null }),
        });
      }

      // 4. Save everything else + mark complete
      await fetch("/api/member/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: data.city || null,
          niche: data.niche.length > 0 ? data.niche : undefined,
          creatorCredentials: data.creatorCredentials || null,
          incomeGoal: data.incomeGoal || null,
          postingRhythm: data.postingRhythm,
          biggestChallenge: data.biggestChallenge || null,
          onboardingComplete: true,
        }),
      });

      // 5. Redirect
      if (data.avatarPath === "build_later") {
        router.push("/member/ai-tools/avatar-architect");
      } else {
        router.push("/member/dashboard");
      }
    } catch {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f6f3] dark:bg-[#0f1419] flex items-center justify-center">
        <div className="text-sm text-[#2f3437]/40 dark:text-white/30 animate-pulse">Loading...</div>
      </div>
    );
  }

  const config = STEP_CONFIG[step];

  return (
    <WizardShell
      currentStep={step}
      totalSteps={TOTAL_STEPS}
      heading={config.heading}
      subheading={config.subheading}
      onBack={step > 0 ? () => setStep((s) => s - 1) : undefined}
      onSkip={step < TOTAL_STEPS - 1 ? handleSkip : undefined}
    >
      {step === 0 && (
        <StepYouTube
          initialUrl={data.youtubeChannelUrl ?? ""}
          initialHandle={data.youtubeHandle}
          initialName={data.youtubeChannelName}
          initialThumbnail={data.youtubeChannelThumbnail}
          channelLocked={data.channelLocked}
          onNext={(d) => mergeAndAdvance(d)}
        />
      )}
      {step === 1 && (
        <StepAboutYou
          initialCity={data.city}
          initialNiche={data.niche}
          initialCredentials={data.creatorCredentials}
          onNext={(d) => mergeAndAdvance(d)}
        />
      )}
      {step === 2 && (
        <StepGoals
          initialIncomeGoal={data.incomeGoal}
          initialPostingRhythm={data.postingRhythm}
          initialChallenge={data.biggestChallenge}
          onNext={(d) => mergeAndAdvance(d)}
        />
      )}
      {step === 3 && (
        <StepAvatar
          existingAvatarName={data.existingAvatarName}
          existingContentThemes={data.existingContentThemes}
          onNext={(d) => mergeAndAdvance({ avatarPath: d.avatarPath, extractedAvatar: d.extractedAvatar ?? null })}
        />
      )}
      {step === 4 && (
        <StepTour
          avatarPath={data.avatarPath}
          onFinish={saving ? () => {} : handleFinish}
        />
      )}
    </WizardShell>
  );
}
