"use client";

/**
 * Wave 2 wizard — Step 2B: Idea Validation Mode.
 *
 * Textarea → POST /api/ai-tools/idea-validation → render verdict.
 *  - supports / partial: "Develop this into ideas" → Step 3 with validatedIdea
 *  - contradicts:        list relatedAngles, each with "Try this instead"
 *                        which loads that angle back into the textarea
 *
 * <AiThinking mode="phase" /> driven by useAiThinking with fallback phases.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AiThinking } from "@/components/ai/AiThinking";
import { useAiThinking } from "@/lib/use-ai-thinking";

interface CitedFact {
  id: string;
  supports: boolean;
  note: string;
}

interface RelatedAngle {
  angle: string;
  citedFactIds: string[];
}

interface ValidationResponse {
  mode: "supports" | "partial" | "contradicts";
  reasoning: string;
  citedFacts: CitedFact[];
  sharperFraming?: string;
  relatedAngles?: RelatedAngle[];
  upload: { id: string; monthYear: string; label: string };
  factsConsidered: number;
  error?: string;
  message?: string;
}

const MIN_LEN = 10;
const MAX_LEN = 2000;
const PHASES = [
  "Reading your idea…",
  "Cross-referencing your facts library…",
  "Checking for supporting evidence…",
  "Finding sharper angles…",
];

export function Step2BIdeaValidation() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [result, setResult] = useState<ValidationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const thinking = useAiThinking({ mode: "phase", fallbackPhases: PHASES });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (idea.trim().length < MIN_LEN) {
      setError(`Tell me a bit more — at least ${MIN_LEN} characters.`);
      return;
    }
    if (idea.length > MAX_LEN) {
      setError(`Trim to ${MAX_LEN} characters or fewer.`);
      return;
    }
    thinking.start();
    try {
      const r = await fetch("/api/ai-tools/idea-validation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea: idea.trim() }),
      });
      const j = (await r.json()) as ValidationResponse;
      if (!r.ok) {
        setError(j.message ?? j.error ?? `Validation failed (${r.status})`);
      } else {
        setResult(j);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      thinking.stop();
    }
  }

  function develop(text: string) {
    router.push(
      `/member/content-planner/wizard?step=3&validatedIdea=${encodeURIComponent(text)}`,
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <label
          htmlFor="idea"
          className="text-sm font-medium text-gray-900 dark:text-gray-100"
        >
          What&apos;s your video idea?
        </label>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          One or two sentences works best. We&apos;ll check it against your
          latest validated facts.
        </p>
        <textarea
          id="idea"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          rows={4}
          maxLength={MAX_LEN}
          disabled={thinking.isThinking}
          className="mt-3 w-full rounded-md border border-gray-300 bg-white p-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          placeholder="e.g. Calgary apartments are softer than people think — there's actually a 4+ MOI pocket worth flagging."
        />
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{idea.length} / {MAX_LEN}</span>
        </div>
        {error && (
          <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}
        <div className="mt-4 flex items-center gap-4">
          <button
            type="submit"
            disabled={thinking.isThinking || idea.trim().length < MIN_LEN}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Validate idea
          </button>
          {thinking.isThinking && (
            <AiThinking mode="phase" phaseLabel={thinking.phaseLabel} />
          )}
        </div>
      </form>

      {result && <VerdictPanel result={result} onDevelop={develop} onTryAngle={setIdea} />}
    </div>
  );
}

function VerdictPanel({
  result,
  onDevelop,
  onTryAngle,
}: {
  result: ValidationResponse;
  onDevelop: (text: string) => void;
  onTryAngle: (text: string) => void;
}) {
  const tone = {
    supports: { bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-300 dark:border-emerald-700", text: "text-emerald-900 dark:text-emerald-100", label: "Supports" },
    partial: { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-300 dark:border-amber-700", text: "text-amber-900 dark:text-amber-100", label: "Partial — needs sharpening" },
    contradicts: { bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-300 dark:border-red-700", text: "text-red-900 dark:text-red-100", label: "Contradicts the data" },
  }[result.mode];

  return (
    <div className={`rounded-lg border p-6 ${tone.bg} ${tone.border}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${tone.text}`}>
        {tone.label}
      </p>
      <p className={`mt-2 text-sm ${tone.text}`}>{result.reasoning}</p>

      {result.citedFacts.length > 0 && (
        <>
          <p className={`mt-4 text-xs font-semibold uppercase tracking-wide ${tone.text}`}>
            Cited facts ({result.citedFacts.length})
          </p>
          <ul className={`mt-1 list-inside list-disc text-sm ${tone.text}`}>
            {result.citedFacts.slice(0, 6).map((c) => (
              <li key={c.id}>
                <span className={c.supports ? "" : "line-through opacity-70"}>{c.note}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {result.sharperFraming && (
        <div className="mt-4 rounded-md bg-white/60 p-3 text-sm dark:bg-gray-900/40">
          <p className={`text-xs font-semibold uppercase tracking-wide ${tone.text}`}>
            Sharper framing
          </p>
          <p className={`mt-1 ${tone.text}`}>{result.sharperFraming}</p>
        </div>
      )}

      {(result.mode === "supports" || result.mode === "partial") && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => onDevelop(result.sharperFraming ?? "")}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Develop this into ideas →
          </button>
        </div>
      )}

      {result.mode === "contradicts" && result.relatedAngles && result.relatedAngles.length > 0 && (
        <div className="mt-5">
          <p className={`text-xs font-semibold uppercase tracking-wide ${tone.text}`}>
            Try one of these angles instead
          </p>
          <ul className="mt-2 space-y-2">
            {result.relatedAngles.map((a, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-3 rounded-md bg-white/60 p-3 dark:bg-gray-900/40"
              >
                <span className={`text-sm ${tone.text}`}>{a.angle}</span>
                <button
                  type="button"
                  onClick={() => onTryAngle(a.angle)}
                  className="shrink-0 rounded-md border border-current px-3 py-1 text-xs font-medium hover:bg-white/40 dark:hover:bg-gray-800/40"
                >
                  Try this instead
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
