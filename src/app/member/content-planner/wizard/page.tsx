/**
 * Wave 2 — Content Engine v2 wizard shell. Wave 4 — property type focus +
 * draft persistence wrapper.
 *
 * URL contract:
 *   ?step=1            Mode picker (default)
 *   ?step=2a           Story Lead browser
 *   ?step=2b           Idea Validation Mode
 *   ?step=2c           Theme picker
 *   ?step=3            Generate idea cards
 *      (params: storyLeadId | rotationSlot | validatedIdea, +propertyTypeFocus)
 *   ?step=4            Review picked idea (param: picked=<sessionStorage key>,
 *                                          +propertyTypeFocus)
 *
 * `propertyTypeFocus` is set on Steps 2a/2b/2c and pinned through every
 * downstream URL via the FocusChip. Once locked it cannot be relaxed
 * without going back through the picker (the chip's "change" link).
 *
 * Refresh and back-button must not lose state. Step 1-3 are URL-driven;
 * Step 4 reads from sessionStorage keyed by a UUID in the URL so the
 * picked card survives refresh within the tab.
 */
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { resolveUserFromSession } from "@/lib/session-utils";
import { getFeatureFlags } from "@/lib/feature-flags";
import { loadLatestValidatedUpload } from "@/lib/content-engine-context";
import { Step1ModePicker } from "@/components/content-planner/wizard/Step1ModePicker";
import { Step2AStoryLeads } from "@/components/content-planner/wizard/Step2AStoryLeads";
import { Step2BIdeaValidation } from "@/components/content-planner/wizard/Step2BIdeaValidation";
import { Step2CRotationSlot } from "@/components/content-planner/wizard/Step2CRotationSlot";
import { Step3IdeaCards } from "@/components/content-planner/wizard/Step3IdeaCards";
import { Step4Review } from "@/components/content-planner/wizard/Step4Review";
import { WizardDraftShell } from "@/components/content-planner/wizard/WizardDraftShell";
import { FocusChip } from "@/components/content-planner/wizard/FocusChip";
import { ROTATION_SLOTS, type RotationSlotKey } from "@/lib/content-engine-validation";
import { parsePropertyTypeFocus } from "@/lib/property-type-focus";

export const dynamic = "force-dynamic";

interface SearchParams {
  step?: string;
  storyLeadId?: string;
  rotationSlot?: string;
  validatedIdea?: string;
  picked?: string;
  propertyTypeFocus?: string;
}

export default async function WizardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Impersonation-aware resolution. The wizard's "Upload your market data
  // first" gate keys on the resolved member's latest validated upload, so we
  // MUST honour the admin/editor impersonation cookie here — otherwise an
  // admin viewing a member's wizard reads the admin account (which has no
  // uploads) and wrongly hits the gate. `role` is the actual signed-in
  // account's role, which keeps the feature-flag admin/editor bypass intact.
  const resolved = await resolveUserFromSession();
  if (!resolved) {
    redirect("/login?callbackUrl=/member/content-planner/wizard");
  }
  const userId = resolved.id;
  const userRole = resolved.role;

  const flags = await getFeatureFlags({ userId, userRole });
  if (!flags.tool_content_engine_v2) {
    notFound();
  }

  const params = await searchParams;
  const step = params.step ?? "1";
  const focus = parsePropertyTypeFocus(params.propertyTypeFocus ?? null);

  const upload = await loadLatestValidatedUpload(userId);
  if (!upload) {
    return <NoUploadPanel />;
  }

  const showChip = focus !== "Any" && step !== "1";
  const changeHref = buildChangeHref(step, params);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <WizardHeader step={step} />
        <WizardDraftShell>
          <div className="mt-6">
            {showChip && <FocusChip focus={focus} changeHref={changeHref} />}
            {step === "1" && (
              <Step1ModePicker showIdeaValidation={flags.tool_idea_validation} />
            )}
            {step === "2a" && <Step2AStoryLeads />}
            {step === "2b" && flags.tool_idea_validation && (
              <Step2BIdeaValidation initialFocus={focus} />
            )}
            {step === "2b" && !flags.tool_idea_validation && <NotAvailableForYou />}
            {step === "2c" && (
              <Step2CRotationSlot
                initialFocus={focus}
                preselectedSlot={parseRotationSlot(params.rotationSlot)}
              />
            )}
            {step === "3" && (
              <Step3IdeaCards
                storyLeadId={params.storyLeadId}
                rotationSlot={parseRotationSlot(params.rotationSlot)}
                validatedIdea={params.validatedIdea}
                propertyTypeFocus={focus}
                uploadId={upload.id}
                uploadLabel={upload.label}
                uploadMonthYear={upload.monthYear}
              />
            )}
            {step === "4" && (
              <Step4Review pickedKey={params.picked} propertyTypeFocus={focus} />
            )}
            {!KNOWN_STEPS.has(step) && <UnknownStep />}
          </div>
        </WizardDraftShell>
      </div>
    </div>
  );
}

const KNOWN_STEPS = new Set(["1", "2a", "2b", "2c", "3", "4"]);

function parseRotationSlot(v: string | undefined): RotationSlotKey | undefined {
  if (v && (ROTATION_SLOTS as readonly string[]).includes(v)) {
    return v as RotationSlotKey;
  }
  return undefined;
}

/** Send "change" clicks on the chip back to the picker that owns the
 *  current branch (Story Lead → 2a, Idea Validation → 2b, Theme → 2c). */
function buildChangeHref(step: string, params: SearchParams): string {
  if (params.storyLeadId || step === "2a") {
    return "/member/content-planner/wizard?step=2a";
  }
  if (params.validatedIdea || step === "2b") {
    return "/member/content-planner/wizard?step=2b";
  }
  if (params.rotationSlot || step === "2c") {
    const q = params.rotationSlot
      ? `&rotationSlot=${encodeURIComponent(params.rotationSlot)}`
      : "";
    return `/member/content-planner/wizard?step=2c${q}`;
  }
  return "/member/content-planner/wizard?step=1";
}

function WizardHeader({ step }: { step: string }) {
  const label = STEP_LABELS[step] ?? "Wizard";
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Content Engine
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
          {label}
        </h1>
      </div>
      <Link
        href="/member/content-planner"
        className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
      >
        ← Back to planner
      </Link>
    </div>
  );
}

const STEP_LABELS: Record<string, string> = {
  "1": "Pick how to start",
  "2a": "Browse Story Leads",
  "2b": "Validate an idea",
  "2c": "Pick a theme",
  "3": "Idea cards",
  "4": "Review and save",
};

function NoUploadPanel() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-8 dark:border-amber-700 dark:bg-amber-950/40">
          <h2 className="text-xl font-semibold text-amber-900 dark:text-amber-100">
            Upload your market data first
          </h2>
          <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">
            The Content Engine generates ideas from your validated facts
            library. Once you upload and validate your latest month, come
            back here and the wizard will be ready.
          </p>
          <div className="mt-6 flex gap-3">
            <Link
              href="/member/market-data"
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              Go to Market Data
            </Link>
            <Link
              href="/member/content-planner"
              className="rounded-md border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-50 dark:border-amber-700 dark:bg-transparent dark:text-amber-100 dark:hover:bg-amber-900/30"
            >
              Back to planner
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotAvailableForYou() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-8 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
      Idea Validation isn&apos;t enabled for your account yet.{" "}
      <Link href="/member/content-planner/wizard?step=1" className="text-blue-600 hover:underline">
        Pick another way to start
      </Link>
      .
    </div>
  );
}

function UnknownStep() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-8 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
      Unknown step.{" "}
      <Link href="/member/content-planner/wizard?step=1" className="text-blue-600 hover:underline">
        Start over
      </Link>
      .
    </div>
  );
}
