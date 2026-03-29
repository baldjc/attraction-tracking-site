# Onboarding Wizard & Help Assistant (2/3): Wizard Frontend

> **Date:** 2026-03-29
> **What this covers:** All 5 onboarding wizard steps, the wizard orchestrator page, progress bar, wizard shell, onboarding redirect, and dashboard banner.
> **Branch:** Continue on `feature/onboarding-wizard`.
> **Prerequisite:** Prompt 1 must be completed first (schema + API routes).

---

## Paste this into Replit Agent:

```
Continue on the "feature/onboarding-wizard" branch. This is Part 2 of 3 — the onboarding wizard frontend.

We're building a 5-step guided wizard that appears on first login. It collects YouTube channel, niche/city/credentials, goals, and avatar data. The wizard is a full-screen experience with NO sidebar.

=== COMPONENT 1: PROGRESS BAR ===

Create: src/components/onboarding/ProgressBar.tsx

A horizontal step indicator with dots and labels.

Props: { currentStep: number; totalSteps: number }

- Render 5 dots with connecting lines between them
- Labels (hidden on mobile, visible on sm+): "YouTube", "About You", "Goals", "Avatar", "Tour"
- Completed steps (i < currentStep): solid #6ba3c7 dot
- Current step (i === currentStep): solid #6ba3c7 dot with ring-4 ring-[#6ba3c7]/20, label in #6ba3c7
- Future steps: bg-[#2f3437]/10 dark:bg-white/10
- Connecting lines: #6ba3c7 for completed, bg-[#2f3437]/10 for future
- Use "use client" directive

=== COMPONENT 2: WIZARD SHELL ===

Create: src/components/onboarding/WizardShell.tsx

Shared layout wrapper for all wizard steps.

Props: { currentStep: number; totalSteps: number; heading: string; subheading?: string; onBack?: () => void; onSkip?: () => void; children: React.ReactNode }

Layout:
- Full-screen: min-h-screen bg-[#f7f6f3] dark:bg-[#0f1419] flex flex-col items-center justify-center p-4 sm:p-8
- Inner container: w-full max-w-xl
- ProgressBar at top with mb-8
- Card: bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-[#2a2a2a] rounded-2xl p-6 sm:p-8 shadow-sm
- Inside card: heading (text-xl sm:text-2xl font-bold font-display), optional subheading (text-sm text-[#2f3437]/50), then {children}
- Footer below card (mt-4 px-2): flex justify-between with "← Back" button on left (if onBack provided) and "Skip for now" on right (if onSkip provided)
- Back button: text-sm text-[#2f3437]/50 hover:text-[#2f3437]
- Skip button: text-sm text-[#2f3437]/30 hover:text-[#2f3437]/50

=== COMPONENT 3: STEP 1 — YOUTUBE CHANNEL ===

Create: src/components/onboarding/StepYouTube.tsx

Props: { initialUrl: string; initialHandle: string | null; initialName: string | null; initialThumbnail: string | null; channelLocked: boolean; onNext: (data: { youtubeChannelUrl: string | null; noChannel: boolean }) => void }

Three states:

STATE A — Channel already locked (channelLocked && initialUrl):
- Show read-only channel card with thumbnail, name, handle (same card pattern as current Settings YouTube section)
- Note: "Your channel is already linked. Contact your admin to change it."
- "Continue" button calls onNext

STATE B — Channel not set:
- Label "YouTube Channel URL"
- Text input with placeholder "https://www.youtube.com/@YourHandle"
- "Check" button next to input
- On blur or Check click: POST to /api/member/onboarding/resolve-channel with the URL
- If resolved successfully: show green confirmation card with thumbnail + name + handle + checkmark
- If error: show red error text "Couldn't find that channel. Check the URL and try again."
- Checkbox below: "I don't have a YouTube channel yet" — when checked, hides the URL input
- "Continue" button: enabled if URL entered OR noChannel checked. Calls onNext with data.

=== COMPONENT 4: STEP 2 — ABOUT YOU ===

Create: src/components/onboarding/StepAboutYou.tsx

Props: { initialCity: string; initialNiche: string[]; initialCredentials: string; onNext: (data: { city: string; niche: string[]; creatorCredentials: string }) => void }

Three fields:

1. City / Market — text input, placeholder "e.g., Calgary, AB"

2. Niche — multi-select chips (toggle on/off by clicking). Options:
   - residential_resale → "Residential Resale"
   - luxury → "Luxury"
   - first_time_buyers → "First-Time Buyers"
   - investment_properties → "Investment Properties"
   - condos → "Condos"
   - commercial → "Commercial"
   - land_rural → "Land / Rural"
   - relocation → "Relocation"
   - new_construction → "New Construction"
   - Plus an "Other" button that shows a free-text input when toggled on

   Selected chip style: bg-[#6ba3c7] text-white border-[#6ba3c7]
   Unselected: bg-white dark:bg-[#1a1a1a] text-[#2f3437]/70 border-[#2f3437]/15 hover:border-[#6ba3c7]/50
   Chip shape: rounded-full px-3 py-1.5

3. Credentials — textarea, 3 rows. Helper text above: "Years of experience, designations, brokerage, specialities — this powers your AI-generated scripts." Placeholder: "e.g., Licensed for 8 years, helped 150+ families in the Greater Toronto Area. Certified Luxury Home Specialist, Royal LePage."

"Continue" button at bottom, always enabled (all fields optional).

=== COMPONENT 5: STEP 3 — YOUR GOALS ===

Create: src/components/onboarding/StepGoals.tsx

Props: { initialIncomeGoal: string; initialPostingRhythm: number | null; initialChallenge: string; onNext: (data: { incomeGoal: string; postingRhythm: number | null; biggestChallenge: string }) => void }

Three fields:

1. Income goal — pill selector buttons:
   "$25K / year" (value: "$25,000")
   "$50K / year" (value: "$50,000")
   "$100K / year" (value: "$100,000")
   "$250K / year" (value: "$250,000")
   "$500K+ / year" (value: "$500,000+")
   "Custom" — when clicked, shows text input

   Selected: bg-[#6ba3c7] text-white border-[#6ba3c7]
   Unselected: bg-white dark:bg-[#1a1a1a] text-[#2f3437]/70 border-[#2f3437]/15 hover:border-[#6ba3c7]/50
   Pill shape: rounded-lg px-4 py-2

2. Posting rhythm — pill selector buttons:
   "1 video / month" (value: 1)
   "2 videos / month" (value: 2)
   "1 video / week" (value: 4)
   "2 videos / week" (value: 8)
   "Custom" — when clicked, shows number input with placeholder "Videos per month"

3. Biggest challenge — optional. Label: "Biggest challenge right now". Helper text: "Optional — helps your coach understand where you're at."
   Pre-fill chips (clicking one fills the text input): "Getting started", "Being on camera", "Consistency", "Not getting views", "Getting leads from views", "Time"
   Chip style: smaller than niche chips. Selected: bg-[#6ba3c7]/10 text-[#6ba3c7] border-[#6ba3c7]/30. Unselected: text-[#2f3437]/50 border-[#2f3437]/10
   Text input below chips for custom answer.

"Continue" button, always enabled.

=== COMPONENT 6: STEP 4 — YOUR AVATAR ===

Create: src/components/onboarding/StepAvatar.tsx

This is the most complex step with 3 sub-states.

Props: { existingAvatarName: string | null; existingContentThemes: unknown[] | null; onNext: (data: { avatarPath: "existing" | "imported" | "build_later"; extractedAvatar?: any }) => void }

SUB-STATE: EXISTING AVATAR DETECTED
If existingAvatarName is set AND existingContentThemes is a non-empty array:
- Show green box: "We already have your avatar on file — {avatarName}"
- Show content theme chips from existingContentThemes (map each to "{emoji} {name}")
- Note: "You can update it anytime in Settings or the Avatar Architect."
- "Continue" button → onNext({ avatarPath: "existing" })

SUB-STATE: CHOICE (no existing avatar)
Show two cards side by side (grid cols-1 sm:cols-2):

Card A: "I have an existing avatar"
- Icon: 📄
- Subtitle: "Paste your document and we'll extract what we need"
- Click → switch to IMPORTING sub-state

Card B: "I need to build one"
- Icon: 🛠️
- Subtitle: "The Avatar Architect will guide you through it (~10 min)"
- Click → onNext({ avatarPath: "build_later" })

Card style: p-4 border-2 border-[#2f3437]/10 rounded-xl hover:border-[#6ba3c7]/50 transition-colors

SUB-STATE: IMPORTING
- Textarea (8 rows) with placeholder "Paste your ideal client avatar document here..."
- "← Back" button returns to CHOICE
- "Extract & Continue" button (disabled while extracting, shows "Analysing your avatar..." while loading)

On submit:
1. Tag the pasted text: const taggedContent = `[IMPORTED_AVATAR_DOC]\n${pastedText.trim()}`
2. POST to /api/ai-tools/avatar-architect with body: { messages: [{ role: "user", content: taggedContent }] }
3. If response has avatarData → switch to CONFIRMING sub-state
4. If no avatarData → show error: "We couldn't extract avatar data from that document. Try pasting more detail, or build one from scratch using the Avatar Architect after setup."

SUB-STATE: CONFIRMING (after successful extraction)
Show the extracted data in a preview card (bg-[#f7f6f3] dark:bg-[#0f1419] rounded-lg p-4):
- Avatar Name (label + value)
- Summary (label + value, line-clamp-3)
- Content Themes (chips: bg-[#6ba3c7]/10 text-[#6ba3c7] rounded-full)
- Note: "Does this look right? You can refine it later in the Avatar Architect."
- "← Re-paste" button returns to IMPORTING, clears extracted data
- "Looks Good — Continue" button → onNext({ avatarPath: "imported", extractedAvatar: extractedData })

=== COMPONENT 7: STEP 5 — TOUR ===

Create: src/components/onboarding/StepTour.tsx

Props: { avatarPath: "existing" | "imported" | "build_later"; onFinish: () => void }

Four feature cards in a 2-column grid (1 col on mobile):
- 📚 Academy — "Your structured learning path. Start with Foundations and work through at your own pace."
- 🤖 AI Tools — "Build scripts, generate content ideas, review your work — all tailored to your avatar."
- 📈 Generate Leads — "Set up tracking links, run campaigns, and see which videos drive real business."
- 🎯 My Scores — "See how your channel stacks up and where to focus next."

Card style: p-4 border border-[#2f3437]/10 rounded-xl. Icon as text-2xl, title as text-sm font-semibold, description as text-xs text-[#2f3437]/50.

Below the cards, a Jarvis introduction callout box:
- bg-[#6ba3c7]/5 border border-[#6ba3c7]/20 rounded-xl p-4 flex items-start gap-3
- Left: circle (w-10 h-10 rounded-full bg-[#6ba3c7]) with white italic "J" text (font-display font-bold)
- Right: "Meet Jarvis — your platform assistant" (bold) + "Tap the J button in the bottom right corner of any page. Ask Jarvis anything — where to find things, how tools work, or what to do next." (text-xs muted)

CTA button:
- If avatarPath === "build_later": text = "Build My Avatar Now"
- Otherwise: text = "Go to Dashboard"

=== COMPONENT 8: ONBOARDING PAGE (ORCHESTRATOR) ===

Create: src/app/member/onboarding/page.tsx

This is a "use client" page that orchestrates all 5 steps.

IMPORTANT: This page should be a FULL-SCREEN experience with NO sidebar. Since it's under /member/, it inherits the member layout which renders the sidebar. To handle this, the member layout (src/app/member/layout.tsx) needs to detect this path and skip the sidebar. See the layout changes below.

State:
- step (0-4)
- loading (boolean)
- saving (boolean)
- data object with all wizard fields (see below)

On mount (useEffect):
- Fetch GET /api/member/onboarding
- Pre-fill the data object with existing values (YouTube URL, city, niche as array, credentials, goals, avatar info)
- Set loading = false

Step config array with heading/subheading for each step:
- Step 0: "Welcome to Attraction by Video" / "Let's get you set up — this takes about 3 minutes and makes everything on the platform work better for you."
- Step 1: "Tell us about your real estate business" / null
- Step 2: "What does success look like for your channel?" / null
- Step 3: "Your ideal client avatar powers everything on this platform" / "Your avatar tells the AI tools who you're creating content for — your niche, your audience's fears, motivations, and the themes you should be talking about."
- Step 4: "You're all set — here's the quick tour" / null

Each step component receives its slice of data as props and calls onNext(stepData) which:
1. Merges stepData into the data state
2. Advances step by 1

handleSkip function:
- PUT /api/member/onboarding with { onboardingDismissedAt: new Date().toISOString() }
- router.push("/member")

handleFinish function (called by Step 5's onFinish):
1. Save YouTube channel: if not locked and URL provided, PUT /api/member/channel with { youtubeChannelUrl }
2. Save avatar: if avatarPath === "imported" and extractedAvatar exists, PUT /api/member/avatar with { avatarProfile: extractedAvatar, avatarName: extractedAvatar.avatar_name, avatarSummary: extractedAvatar.avatar_summary, contentThemes: extractedAvatar.content_themes }
3. Save niche via /api/member/niche: PUT with { niche: data.niche, city: data.city }
4. Save everything else via /api/member/onboarding: PUT with { city, niche, creatorCredentials, incomeGoal, postingRhythm, biggestChallenge, onboardingComplete: true }
5. Redirect: if avatarPath === "build_later" → router.push("/member/ai-tools/avatar-architect"), otherwise → router.push("/member")

Render: WizardShell with current step config + onBack (if step > 0) + onSkip={handleSkip}. Inside, conditionally render the step component for the current step.

=== COMPONENT 9: ONBOARDING REDIRECT ===

Create: src/components/onboarding/OnboardingRedirect.tsx

A tiny "use client" component that renders nothing visually. On mount:
- Skip if pathname is "/member/onboarding" (usePathname())
- Fetch GET /api/member/onboarding
- If onboardingComplete is false AND onboardingDismissedAt is null → router.push("/member/onboarding")

=== COMPONENT 10: ONBOARDING BANNER ===

Create: src/components/onboarding/OnboardingBanner.tsx

A "use client" component shown on the dashboard when onboarding is incomplete.

On mount:
- Fetch GET /api/member/onboarding
- If onboardingComplete is false, show the banner. Also check if avatarName is missing.

Banner style: bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg p-4 flex items-start gap-3 mb-6

Content:
- 🎯 emoji on left
- If avatar missing: "Finish building your avatar to unlock all AI tools" with link to /member/ai-tools/avatar-architect
- If avatar exists but onboarding incomplete: "Complete your setup to get the most out of the platform" with link to /member/onboarding

=== LAYOUT CHANGES ===

Modify: src/app/member/layout.tsx

The onboarding page needs to render WITHOUT the sidebar. Add a client-side path check.

Approach: Import and render <OnboardingRedirect /> inside the main content area. Then, for the onboarding page itself, skip the sidebar. You can do this by:

1. Creating a small helper that checks pathname
2. OR using a simpler approach: move the onboarding page to its own route group with a separate layout

Simplest approach — use a route group:
- Create src/app/member/(onboarding)/onboarding/layout.tsx — a minimal layout with just auth check (call auth(), redirect if not signed in) but NO sidebar, NO padding. Just return <>{children}</>
- Create src/app/member/(onboarding)/onboarding/page.tsx — move the onboarding page here
- Create src/app/member/(main)/layout.tsx — move the current member layout here (with sidebar, padding, HelpWidget, OnboardingRedirect)
- Move all other member pages into src/app/member/(main)/

If the route group approach is too disruptive (lots of file moves), use the alternative: in the existing member layout, check if the current path is /member/onboarding using headers or a client component, and conditionally render the sidebar.

Use whichever approach is cleanest for this codebase.

=== DASHBOARD CHANGES ===

Modify: src/app/member/page.tsx (the dashboard)

Import OnboardingBanner and render it at the top of the page content, before any existing dashboard content:

<OnboardingBanner />

=== SETTINGS CHANGES ===

Modify: src/app/member/settings/page.tsx

Inside the General Settings tab, after the "Your Credentials" section, add a new card:

"Setup Wizard" section:
- Card: bg-white dark:bg-[#1a1a1a] border rounded-lg
- px-6 py-5, flex items-center justify-between
- Left side: "Setup Wizard" (font-semibold) + "Re-run the onboarding wizard to update your goals and profile." (text-sm muted)
- Right side: Link to /member/onboarding — "Run Again" button (text-xs text-[#6ba3c7] border border-[#6ba3c7]/30 px-3 py-1.5 rounded-lg hover:bg-[#6ba3c7]/10)

=== VERIFICATION ===

After all changes:
1. npm run build — should succeed
2. Navigate to /member/onboarding — wizard should display full-screen, no sidebar
3. Complete all 5 steps — data saves correctly
4. Import an avatar in Step 4 — themes extracted and displayed
5. Choose "I need to build one" — redirected to Avatar Architect after Step 5
6. Click "Skip for now" — sent to dashboard, banner appears
7. Existing member with data — wizard pre-fills their YouTube, city, niche, credentials
8. Settings page — "Run Again" link visible
```
