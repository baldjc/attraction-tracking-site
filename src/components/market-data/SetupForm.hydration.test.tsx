/**
 * Hydration-safety regression test for the market-data setup form.
 *
 * Run: `npx tsx --test src/components/market-data/SetupForm.hydration.test.tsx`
 *
 * Why this exists: `/member/market-data/setup` has crashed TWICE from the same
 * root cause — a locale/timezone-sensitive date (`toLocaleString()`) rendered
 * inline during the server render, which mismatches the browser on hydration and
 * takes the whole page down. First the voice-guide "Last uploaded" date, then the
 * primary-avatar snapshot date. Each new date added to this form is a fresh
 * landmine, so the fix is the mounted-guard pattern: the first (pre-mount) render
 * must emit a deterministic placeholder ("—") and the localized label only
 * appears after the component mounts in the browser.
 *
 * This test renders `SetupForm` with BOTH a voice-guide date and an avatar
 * snapshot date present and asserts:
 *   1. The first (pre-mount / SSR) render contains NO locale-formatted date and
 *      uses the "—" placeholder for both dates.
 *   2. After mount, the localized labels appear.
 *
 * It fails if any future date is rendered inline without the mounted guard.
 */
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import SetupForm, { localeDateLabel } from "@/components/market-data/SetupForm";
import { emptyMarketConfig, type MarketConfigShape } from "@/lib/market-config";

// Fixed ISO timestamps for the two dates the form renders. We compare the SSR
// markup against every locale-formatted variant of these instants below.
const AVATAR_SNAPPED_AT = "2026-01-15T12:34:56.000Z";
const VOICE_UPLOADED_AT = "2026-01-10T08:09:10.000Z";

function buildConfig(): MarketConfigShape {
  return {
    ...emptyMarketConfig(),
    marketName: "Calgary",
    mlsSource: "CREB",
    primaryAvatar: {
      source: "avatar-architect",
      snappedAt: AVATAR_SNAPPED_AT,
      name: "First-time buyer",
      summary: "A cautious first-time buyer in the suburbs.",
      profile: null,
    },
  };
}

// Minimal Next router stub so `useRouter()` doesn't throw outside the App Router.
const routerStub = {
  push() {},
  replace() {},
  refresh() {},
  back() {},
  forward() {},
  prefetch() {},
} as unknown as React.ContextType<typeof AppRouterContext>;

function renderSetupForm(): string {
  return renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      { value: routerStub },
      React.createElement(SetupForm, {
        initial: buildConfig(),
        isEdit: true,
        voiceGuideEnabled: true,
        voiceGuideInitial: {
          charCount: 1234,
          uploadedAt: VOICE_UPLOADED_AT,
          sourceFile: "voice.md",
        },
      }),
    ),
  );
}

// All the locale/timezone-sensitive strings a naive inline render could emit for
// the two instants. If any of these show up in the pre-mount markup, a date was
// rendered without the mounted guard.
function localeVariants(iso: string): string[] {
  const d = new Date(iso);
  const variants = new Set<string>();
  for (const locale of ["en-US", "en-GB", "en-CA"]) {
    for (const tz of ["UTC", "America/New_York", "America/Toronto", "America/Los_Angeles"]) {
      const opts = { timeZone: tz } as Intl.DateTimeFormatOptions;
      variants.add(d.toLocaleString(locale, opts));
      variants.add(d.toLocaleDateString(locale, opts));
      variants.add(d.toLocaleTimeString(locale, opts));
    }
  }
  // Also the bare runtime-default formats (no locale/tz args).
  variants.add(d.toLocaleString());
  variants.add(d.toLocaleDateString());
  variants.add(d.toLocaleTimeString());
  return [...variants];
}

test("pre-mount (SSR) render emits no locale-formatted date and uses the '—' placeholder", () => {
  const html = renderSetupForm();

  // Both date sections must render the deterministic placeholder before mount.
  // The avatar snapshot line is always present when an avatar snapshot exists.
  assert.match(
    html,
    /Snapshot taken\s*—/,
    "avatar snapshot date should fall back to the '—' placeholder before mount",
  );

  for (const iso of [AVATAR_SNAPPED_AT, VOICE_UPLOADED_AT]) {
    for (const variant of localeVariants(iso)) {
      assert.ok(
        !html.includes(variant),
        `pre-mount markup must not contain locale-formatted date "${variant}" — render it behind the mounted guard`,
      );
    }
  }
});

test("the mounted guard suppresses the label before mount and releases it after", () => {
  // This exercises the exact helper both date <useMemo>s in SetupForm call.
  for (const iso of [AVATAR_SNAPPED_AT, VOICE_UPLOADED_AT]) {
    // Pre-mount: null → the component renders the deterministic "—" placeholder.
    assert.equal(
      localeDateLabel(false, iso),
      null,
      "pre-mount the guard must suppress the locale label (renders as '—')",
    );

    // After mount: a non-empty localized string the component now renders.
    const mountedLabel = localeDateLabel(true, iso);
    assert.equal(mountedLabel, new Date(iso).toLocaleString());
    assert.ok(
      typeof mountedLabel === "string" && mountedLabel.length > 0,
      "after mount the localized label should be a non-empty string",
    );
  }

  // A missing date is always the placeholder, mounted or not.
  assert.equal(localeDateLabel(true, null), null);
  assert.equal(localeDateLabel(true, undefined), null);
});
