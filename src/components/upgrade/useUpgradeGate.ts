"use client";

import { useEffect, useState } from "react";
import type { UpgradeTrigger } from "./UpgradeModal";

interface UpgradeGateState {
  loading: boolean;
  serviceTier: string | null;
  flagOn: boolean;
  dismissed: Set<string>;
}

export function useUpgradeGate() {
  const [state, setState] = useState<UpgradeGateState>({
    loading: true,
    serviceTier: null,
    flagOn: false,
    dismissed: new Set(),
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/member/tier").then((r) => r.json()).catch(() => null),
      fetch("/api/member/feature-flags").then((r) => r.json()).catch(() => null),
      fetch("/api/member/upgrade-modal-dismissal").then((r) => r.json()).catch(() => null),
    ]).then(([tier, flags, dismissals]) => {
      setState({
        loading: false,
        serviceTier: tier?.serviceTier ?? "foundations",
        flagOn: !!flags?.flags?.upgrade_moments,
        dismissed: new Set<string>(dismissals?.dismissedTriggers ?? []),
      });
    });
  }, []);

  const isFoundations = state.serviceTier === "foundations";

  function shouldShow(trigger: UpgradeTrigger): boolean {
    if (state.loading) return false;
    if (!state.flagOn) return false;
    if (!isFoundations) return false;
    if (state.dismissed.has(trigger)) return false;
    return true;
  }

  function markDismissed(trigger: UpgradeTrigger) {
    setState((s) => {
      const next = new Set(s.dismissed);
      next.add(trigger);
      return { ...s, dismissed: next };
    });
  }

  return { ...state, isFoundations, shouldShow, markDismissed };
}
