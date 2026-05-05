import type { ProgressStep } from "@/components/content-planner/ProgressTrack";

export type ArtifactEntry = {
  id: string;
  content: string | null;
  metadata: unknown;
  updatedAt: Date | string;
};

export type StepKey = ProgressStep["key"];

export type PlanArtifactsByType = Record<string, ArtifactEntry[]>;

const LABELS: Record<string, string> = {
  idea: "Idea",
  script: "Script",
  review: "Review",
  title: "Title",
  description: "Description",
  repurpose: "Repurpose",
  ready: "Ready",
};

const READY_STATUSES = new Set([
  "Ready to Shoot",
  "Shooting",
  "Shot - In Post",
  "Editing",
  "Scheduled",
  "Published",
]);

const REPURPOSE_TYPES = [
  "repurpose_newsletter",
  "repurpose_linkedin",
  "repurpose_facebook",
  "repurpose_blog",
  "repurpose_postcard",
];

function firstActive(artifacts: PlanArtifactsByType, type: string): ArtifactEntry | null {
  const list = artifacts[type];
  if (!list || list.length === 0) return null;
  return list[0];
}

function hasContent(artifacts: PlanArtifactsByType, type: string): boolean {
  const a = firstActive(artifacts, type);
  return !!a && !!(a.content?.trim());
}

export function resolveProgressSteps(
  plan: {
    id: string;
    status: string;
    script?: string | null;
    youtubeDescription?: string | null;
    thumbnailWords?: string | null;
  },
  artifacts: PlanArtifactsByType,
  onStepClick: (key: string) => void,
  // Optional: keys the user has manually ticked, plus a toggle callback. When
  // either is omitted the track behaves exactly as before (auto-only).
  manualDoneKeys?: ReadonlySet<string>,
  onToggleManual?: (key: string) => void
): ProgressStep[] {
  const hasRepurpose = REPURPOSE_TYPES.some((t) => hasContent(artifacts, t));

  // Each step also falls back to the plan's own column where one exists, so a
  // step still marks done even if the artifact write was skipped (e.g. legacy
  // plans saved before the artifact endpoint was wired up).
  const checks: Array<{ key: ProgressStep["key"]; autoDone: boolean; artifactType?: string }> = [
    { key: "idea", autoDone: true },
    { key: "script", autoDone: hasContent(artifacts, "script") || !!(plan.script?.trim()), artifactType: "script" },
    { key: "review", autoDone: hasContent(artifacts, "script_review"), artifactType: "script_review" },
    { key: "title", autoDone: hasContent(artifacts, "title"), artifactType: "title" },
    {
      key: "description",
      autoDone: hasContent(artifacts, "description") || !!(plan.youtubeDescription?.trim()),
      artifactType: "description",
    },
    { key: "repurpose", autoDone: hasRepurpose },
    { key: "ready", autoDone: READY_STATUSES.has(plan.status) },
  ];

  let currentAssigned = false;

  return checks.map(({ key, autoDone, artifactType }) => {
    const manualDone = manualDoneKeys?.has(key) ?? false;
    const done = autoDone || manualDone;

    let status: ProgressStep["status"];
    if (done) {
      status = "done";
    } else if (!currentAssigned) {
      status = "current";
      currentAssigned = true;
    } else {
      status = "upcoming";
    }

    const art = artifactType ? firstActive(artifacts, artifactType) : null;
    const lastEditedAt = art?.updatedAt ? new Date(art.updatedAt as string) : undefined;

    return {
      key,
      label: LABELS[key],
      status,
      lastEditedAt,
      onClick: () => onStepClick(key),
      autoDone,
      manualDone,
      onToggleManual: onToggleManual ? () => onToggleManual(key) : undefined,
    };
  });
}

export function getSuggestedNextStep(steps: ProgressStep[]): ProgressStep | null {
  return steps.find((s) => s.status === "current") ?? null;
}
