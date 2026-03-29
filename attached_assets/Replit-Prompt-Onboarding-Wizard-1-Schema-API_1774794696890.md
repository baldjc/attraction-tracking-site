# Onboarding Wizard & Help Assistant (1/3): Schema + API Routes

> **Date:** 2026-03-29
> **What this covers:** Database schema changes (onboarding fields, help conversation models, niche type change), onboarding API route, channel resolve endpoint, niche API update for array support.
> **Branch:** Build everything on a new branch called `feature/onboarding-wizard`. Do NOT merge to main.

---

## Context

We're building a guided onboarding wizard that appears when a member first signs in. It collects the data that AI tools need to function (YouTube channel, niche, city, credentials, avatar) plus coaching context (income goal, posting rhythm, biggest challenge). We're also adding a floating help assistant chat widget.

This prompt handles the database changes and backend API routes. Prompts 2 and 3 handle the frontend.

---

## Paste this into Replit Agent:

```
IMPORTANT: Create and switch to a new git branch called "feature/onboarding-wizard" before making ANY changes. All work for this feature goes on this branch. Do NOT merge to main.

We're building an onboarding wizard + help assistant. This is Part 1 of 3 — schema changes and API routes.

=== CHANGE 1: PRISMA SCHEMA — ADD ONBOARDING FIELDS TO USER ===

Add these fields to the User model in prisma/schema.prisma, after the "repurposeVoice" field:

  // Onboarding
  onboardingComplete     Boolean   @default(false)
  onboardingDismissedAt  DateTime?
  incomeGoal             String?
  postingRhythm          Int?
  biggestChallenge       String?

=== CHANGE 2: PRISMA SCHEMA — CHANGE NICHE TYPE ===

In the User model, change the "niche" field from:

  niche           String?

to:

  niche           Json?

This allows storing an array of niche strings like ["residential_resale", "luxury", "first_time_buyers"].

=== CHANGE 3: PRISMA SCHEMA — ADD HELP CONVERSATION MODELS ===

Add these two new models after the last model in the schema:

model HelpConversation {
  id        String        @id @default(uuid())
  userId    String
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages  HelpMessage[]
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  @@index([userId])
  @@map("help_conversations")
}

model HelpMessage {
  id             String           @id @default(uuid())
  conversationId String
  conversation   HelpConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           String
  content        String           @db.Text
  createdAt      DateTime         @default(now())

  @@index([conversationId])
  @@map("help_messages")
}

Also add this relation to the User model's relations section:

  helpConversations    HelpConversation[]

Run: npx prisma generate && npx prisma db push

=== CHANGE 4: ONBOARDING API ROUTE ===

Create: src/app/api/member/onboarding/route.ts

This route returns all onboarding-relevant fields and allows saving them.

GET handler:
- Use resolveUserFromSession() for auth (same pattern as other member API routes)
- Return 401 if no user
- Query prisma.user.findUnique with these select fields:
  onboardingComplete, onboardingDismissedAt, youtubeChannelUrl, youtubeHandle, youtubeChannelName, youtubeChannelThumbnail, city, niche, creatorCredentials, incomeGoal, postingRhythm, biggestChallenge, avatarProfile, avatarName, avatarSummary, contentThemes
- Return the data as JSON

PUT handler:
- Use resolveUserFromSession() for auth
- Parse request body, destructure: youtubeChannelUrl, city, niche, creatorCredentials, incomeGoal, postingRhythm, biggestChallenge, onboardingComplete, onboardingDismissedAt
- Build an updateData object — only include fields that were explicitly sent (check !== undefined)
- For postingRhythm, parse as integer if provided
- For onboardingComplete, cast to boolean
- For onboardingDismissedAt, create new Date() if provided
- prisma.user.update with the updateData
- Return { onboardingComplete: updated.onboardingComplete }

=== CHANGE 5: CHANNEL RESOLVE ENDPOINT (FOR ONBOARDING) ===

Create: src/app/api/member/onboarding/resolve-channel/route.ts

This is a lightweight endpoint that resolves a YouTube URL WITHOUT saving or locking it. The existing /api/member/channel route locks the channel on PUT — we need a way to preview/validate during onboarding before committing.

POST handler:
- Use resolveUserFromSession() for auth
- Parse { youtubeChannelUrl } from request body
- Extract handle from URL using the same regex pattern as /api/member/channel (match /@[\w-]+/ first, fallback to last path segment)
- If no handle extracted, return 400
- Call getChannelInfo(youtubeHandle) from @/lib/youtube (same import as existing channel route)
- Return { youtubeHandle, youtubeChannelName, youtubeChannelThumbnail }
- If channel not found, return 404

=== CHANGE 6: UPDATE NICHE API FOR ARRAY SUPPORT ===

Modify: src/app/api/member/niche/route.ts

The niche field is now Json? (array of strings) instead of String?. Update the PUT handler:

- When receiving the niche value, accept either a string (legacy) or array (new)
- If it's a string, wrap it in an array: [niche]
- If it's an array, use as-is
- If null/empty, save as null
- City should always be saved regardless of niche value (remove the old conditional that only saved city for real_estate niche — since all members are real estate agents, city is always relevant)

Also update the GET handler (if there is one) to return niche as-is (it's now an array).

=== CHANGE 7: UPDATE CONTENT ENGINE PROMPTS FOR ARRAY NICHE ===

Modify: src/lib/content-engine-prompts.ts

Find where the niche value is used in prompt building. Update to handle array:
- If niche is an array, join with ", " (e.g., "residential resale, luxury")
- If niche is a string (legacy), use as-is
- If null, default to "real estate"

Also check src/components/ai-tools/content-engine/NicheSetup.tsx:
- When loading initialNiche, handle both array and string: const nicheArr = Array.isArray(initialNiche) ? initialNiche : initialNiche ? [initialNiche] : [];
- Use the first element for the dropdown: useState(nicheArr[0] ?? "")
- When saving, wrap in array: body: JSON.stringify({ niche: niche ? [niche] : null, city: city || null })

This keeps the Content Engine's NicheSetup working as single-select while the onboarding wizard uses multi-select.

=== VERIFICATION ===

After all changes:
1. Run npx prisma generate — should succeed
2. Run npx prisma db push — should succeed
3. Verify the app builds: npm run build
4. Test GET /api/member/onboarding returns all fields
5. Test PUT /api/member/onboarding saves correctly
6. Test POST /api/member/onboarding/resolve-channel with a real YouTube URL
```
