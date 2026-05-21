"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AiThinkingMode, PipelineStep } from "@/components/ai/AiThinking";

interface UseAiThinkingOpts {
  mode: AiThinkingMode;
  /** Pre-defined fallback phases for non-streaming endpoints; rotates on a timer. */
  fallbackPhases?: string[];
  /** Steps for pipeline mode. */
  initialSteps?: PipelineStep[];
  /** Interval (ms) between fallback phase rotations. Defaults to 4000ms. */
  fallbackIntervalMs?: number;
}

export function useAiThinking({
  mode,
  fallbackPhases,
  initialSteps,
  fallbackIntervalMs = 4000,
}: UseAiThinkingOpts) {
  const [isThinking, setIsThinking] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState<string | undefined>(undefined);
  const [steps, setSteps] = useState<PipelineStep[]>(initialSteps ?? []);
  const fallbackIndex = useRef(0);
  const fallbackTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearFallback = useCallback(() => {
    if (fallbackTimer.current) {
      clearInterval(fallbackTimer.current);
      fallbackTimer.current = null;
    }
  }, []);

  const start = useCallback(() => {
    setIsThinking(true);
    fallbackIndex.current = 0;
    if (mode === "phase" && fallbackPhases && fallbackPhases.length > 0) {
      setPhaseLabel(fallbackPhases[0]);
      clearFallback();
      if (fallbackPhases.length > 1) {
        fallbackTimer.current = setInterval(() => {
          fallbackIndex.current = Math.min(
            fallbackIndex.current + 1,
            fallbackPhases.length - 1,
          );
          setPhaseLabel(fallbackPhases[fallbackIndex.current]);
        }, fallbackIntervalMs);
      }
    }
  }, [mode, fallbackPhases, fallbackIntervalMs, clearFallback]);

  const updatePhase = useCallback(
    (label: string) => {
      // Server-driven phase update — take over from fallback rotation.
      clearFallback();
      setPhaseLabel(label);
      setIsThinking(true);
    },
    [clearFallback],
  );

  const updateStep = useCallback(
    (key: string, status: PipelineStep["status"]) => {
      setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, status } : s)));
    },
    [],
  );

  const resetSteps = useCallback(
    (next: PipelineStep[]) => {
      setSteps(next);
    },
    [],
  );

  const stop = useCallback(() => {
    clearFallback();
    setIsThinking(false);
    setPhaseLabel(undefined);
  }, [clearFallback]);

  useEffect(
    () => () => {
      if (fallbackTimer.current) clearInterval(fallbackTimer.current);
    },
    [],
  );

  return {
    isThinking,
    phaseLabel,
    steps,
    start,
    updatePhase,
    updateStep,
    resetSteps,
    stop,
  };
}
