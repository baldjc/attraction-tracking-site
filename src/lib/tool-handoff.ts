"use client";

import { useSearchParams } from "next/navigation";

export type ToolHandoffParams = {
  planId?: string;
  ideaId?: string;
  returnTo?: string;
};

export function buildToolUrl(basePath: string, params: ToolHandoffParams): string {
  const qs = new URLSearchParams();
  if (params.planId) qs.set("planId", params.planId);
  if (params.ideaId) qs.set("ideaId", params.ideaId);
  if (params.returnTo) qs.set("returnTo", params.returnTo);
  const query = qs.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function useToolHandoff(): ToolHandoffParams {
  const searchParams = useSearchParams();
  return {
    planId: searchParams.get("planId") ?? undefined,
    ideaId: searchParams.get("ideaId") ?? undefined,
    returnTo: searchParams.get("returnTo") ?? undefined,
  };
}
