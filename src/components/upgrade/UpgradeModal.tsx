"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export type UpgradeTrigger =
  | "add_to_planner"
  | "build_script"
  | "review_script"
  | "repurpose"
  | "team_support";

interface CopyBlock {
  title: string;
  body: string;
  bullets: string[];
  ctaLabel: string;
  ctaHref: string;
  price: string;
}

const COPY: Record<UpgradeTrigger, CopyBlock> = {
  add_to_planner: {
    title: "Saving ideas into a planner is part of Production",
    body:
      "You've been generating ideas — that's the hard part. The Content Planner is where ideas become videos with shoot dates, scripts, and a real pipeline. It's a Production feature.",
    bullets: [
      "Plan & track every video from idea → published",
      "Script Builder + Script Review write back into your plans",
      "Repurpose results save next to the original plan",
      "Lead Magnet Campaigns auto-link to descriptions",
    ],
    ctaLabel: "See Production →",
    ctaHref: "/member/profile",
    price: "Production starts at the Editing tier.",
  },
  build_script: {
    title: "Script Builder + Content Planner work together on Production",
    body:
      "You're on Foundations. You can still try the Script Builder, but the real workflow — saved scripts that link back to your plan — is on Production. Way less friction once your ideas, scripts, and shoot dates live in one place.",
    bullets: [
      "ARC Script Builder saves drafts back to your plan",
      "Scripts auto-link from idea → planner → review",
      "No more lost scripts in tabs or Google Docs",
      "Pair with Script Review for an end-to-end writing flow",
    ],
    ctaLabel: "See Production →",
    ctaHref: "/member/profile",
    price: "Production starts at the Editing tier.",
  },
  review_script: {
    title: "Script Review pairs with the rest of Production",
    body:
      "Script Review on its own gives you a 14-principle score. On Production, that score saves back to your plan, and you can run Script Builder + Review as one continuous writing workflow.",
    bullets: [
      "Reviews save to the plan with a score badge",
      "Ride alongside Script Builder for a real writing workflow",
      "Track which videos still need a review pass",
      "Score history per plan so you see improvement",
    ],
    ctaLabel: "See Production →",
    ctaHref: "/member/profile",
    price: "Production starts at the Editing tier.",
  },
  repurpose: {
    title: "Repurpose results save back to the plan on Production",
    body:
      "You can repurpose your transcript on Foundations — but on Production each format (newsletter, LinkedIn, Facebook, blog, postcard) saves alongside the original plan so you and your team can grab it later.",
    bullets: [
      "All 5 formats saved to the plan automatically",
      "Re-open them later from Content Planner",
      "Editor + member share the same source of truth",
      "Pair with Description Generator for SEO-ready output",
    ],
    ctaLabel: "See Production →",
    ctaHref: "/member/profile",
    price: "Production starts at the Editing tier.",
  },
  team_support: {
    title: "Add an editor to your pipeline",
    body:
      "Production tiers come with editor support — they pick up your shoots, deliver edits, and update the plan as videos move from Ready to Shoot → Published.",
    bullets: [
      "Editor sees shoot dates and footage links",
      "Plans auto-progress as the editor delivers",
      "You get notified at every status change",
      "Less DM-tag-management between you and your editor",
    ],
    ctaLabel: "See Production →",
    ctaHref: "/member/profile",
    price: "Production starts at the Editing tier.",
  },
};

interface Props {
  trigger: UpgradeTrigger;
  open: boolean;
  onClose: () => void;
}

export default function UpgradeModal({ trigger, open, onClose }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const copy = COPY[trigger];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  async function handleDismiss() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/member/upgrade-modal-dismissal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger }),
      });
    } catch {
      /* fail silently — user can still close */
    } finally {
      setSubmitting(false);
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#1e2a38]/60"
      onClick={handleDismiss}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-[#2f3437]/40 hover:text-[#2f3437] hover:bg-[#2f3437]/5 transition-colors"
        >
          ✕
        </button>

        <div className="space-y-4">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider bg-[#6ba3c7]/10 text-[#6ba3c7] px-2.5 py-1 rounded-full">
            <span>⬆</span> Production feature
          </div>
          <h2 className="text-xl font-bold text-[#2f3437] leading-tight">{copy.title}</h2>
          <p className="text-sm text-[#2f3437]/70 leading-relaxed">{copy.body}</p>

          <ul className="space-y-2 pt-1">
            {copy.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[#2f3437]/80">
                <span className="text-[#10B981] font-bold mt-0.5">✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-[#2f3437]/50 italic">{copy.price}</p>

          <div className="flex items-center gap-2 pt-2">
            <Link
              href={copy.ctaHref}
              onClick={handleDismiss}
              className="flex-1 text-center bg-[#6ba3c7] hover:bg-[#5490b5] text-white font-semibold text-sm py-2.5 rounded-lg transition-colors"
            >
              {copy.ctaLabel}
            </Link>
            <button
              onClick={handleDismiss}
              className="text-sm font-medium text-[#2f3437]/50 hover:text-[#2f3437] px-4 py-2.5 rounded-lg transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
