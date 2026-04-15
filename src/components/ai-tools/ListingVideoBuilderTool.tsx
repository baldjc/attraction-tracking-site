"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import ListingInputPhase from "@/components/ai-tools/ListingInputPhase";
import ListingVideoChat from "@/components/ai-tools/ListingVideoChat";

interface Props {
  basePath: string;
  isAdmin?: boolean;
  calendarEnabled?: boolean;
}

interface PropertyData {
  propertyAddress: string;
  price: string;
  propertyType: string;
  keyFeatures: string;
  neighbourhoodHighlights: string;
  mlsRemarks: string;
  creatorOpinion: string;
  extractedFileText: string;
}

export default function ListingVideoBuilderTool({ basePath, isAdmin, calendarEnabled }: Props) {
  const [phase, setPhase] = useState<"input" | "results">("input");
  const [propertyData, setPropertyData] = useState<PropertyData | null>(null);
  const [aiResponse, setAiResponse] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(data: PropertyData) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai-tools/listing-video-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.status === 429) {
        const d = await res.json();
        setError(
          d.error === "monthly_cap_reached"
            ? `You've reached your monthly AI usage limit. It resets on ${d.resetsAt}.`
            : "Monthly limit reached."
        );
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      const d = await res.json();
      setPropertyData(data);
      setAiResponse(d.message);
      setPhase("results");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setPhase("input");
    setPropertyData(null);
    setAiResponse("");
    setError("");
  }

  const subtitle =
    phase === "input"
      ? "Enter your listing details — the AI will generate 3 avatar-driven video concepts"
      : "Choose a concept to develop or send straight to the Script Builder";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <Link
          href={basePath}
          className="inline-flex items-center gap-1.5 text-sm text-[#2f3437]/50 hover:text-[#6ba3c7] transition-colors mb-4"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          AI Tools
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[#2f3437] dark:text-white">🏠 Listing Video Builder</h1>
          <p className="text-sm text-[#2f3437]/60 dark:text-white/60 mt-1">{subtitle}</p>
        </div>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <span className="text-lg">🚫</span>
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <div className="bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-white/10 rounded-xl p-6">
        {phase === "input" ? (
          <ListingInputPhase onSubmit={handleSubmit} loading={loading} />
        ) : propertyData ? (
          <ListingVideoChat
            initialResponse={aiResponse}
            propertyData={propertyData}
            onReset={handleReset}
            calendarEnabled={calendarEnabled}
          />
        ) : null}
      </div>
    </div>
  );
}
