# Editor Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `editor` role that can view admin pages but only sees members on editing or mastery service tiers.

**Architecture:** Reuse the existing `/admin` route group — no page duplication. Add `editor` to the `UserRole` enum. Create a shared auth helper (`src/lib/auth-utils.ts`) that centralises role checks and tier filtering. API routes use the helper to allow editor access with automatic tier scoping. Client components check `useSession()` role to hide edit controls.

**Tech Stack:** Next.js 16, Prisma (PostgreSQL), NextAuth v5, TypeScript, Tailwind CSS

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `prisma/schema.prisma` | Modify | Add `editor` to `UserRole` enum |
| `src/lib/auth-utils.ts` | **Create** | Shared helpers: `isAdminOrEditor()`, `isAdmin()`, `editorTierFilter()` |
| `src/app/page.tsx` | Modify | Route `editor` role to `/admin` on login |
| `src/app/admin/layout.tsx` | Modify | Allow `editor` role, pass role to Sidebar |
| `src/components/Sidebar.tsx` | Modify | Add `editorLinks` nav array (subset of admin), show role label |
| `src/app/api/members/route.ts` | Modify | Allow editor, filter to editing/mastery tiers |
| `src/app/api/members/[id]/route.ts` | Modify | Allow editor GET (with tier guard), block editor PATCH |
| `src/app/api/members/[id]/notes/route.ts` | Modify | Allow editor GET, block editor POST/PATCH |
| `src/app/api/members/[id]/videos/route.ts` | Modify | Allow editor access |
| `src/app/api/audits/route.ts` | Modify | Allow editor, filter to editing/mastery members |
| `src/app/api/audits/[auditId]/route.ts` | Modify | Allow editor (with tier guard on audit owner) |
| `src/app/api/admin/impersonate/route.ts` | Modify | Allow editor, restrict to editing/mastery members |
| `src/app/api/admin/member-scores/[userId]/route.ts` | Modify | Allow editor (with tier guard) |
| `src/app/api/admin/member-tools-usage/[userId]/route.ts` | Modify | Allow editor (with tier guard) |
| `src/app/api/qa-prep/route.ts` | Modify | Allow editor, filter to editing/mastery members |
| `src/app/admin/page.tsx` | Modify | Hide GHL sync for editor, filter stats |
| `src/app/admin/members/page.tsx` | Modify | Hide GHL sync button for editor |
| `src/app/admin/members/[id]/page.tsx` | Modify | Hide all edit controls for editor (read-only view) |
| `src/lib/session-utils.ts` | Modify | Allow editor role for impersonation |
| `src/app/admin/settings/page.tsx` | Modify | Redirect editor to `/admin` |
| `src/app/admin/campaigns/page.tsx` | Modify | Redirect editor to `/admin` |
| `src/app/admin/analytics/page.tsx` | Modify | Redirect editor to `/admin` |
| `src/app/admin/script-review/page.tsx` | Modify | Redirect editor to `/admin` |
| `src/app/admin/ai-tools/page.tsx` | Modify | Redirect editor to `/admin` |

---

## Task 1: Prisma Schema — Add `editor` Role

**Files:**
- Modify: `prisma/schema.prisma:10-13`

- [ ] **Step 1: Add `editor` to UserRole enum**

In `prisma/schema.prisma`, update the `UserRole` enum:

```prisma
enum UserRole {
  admin
  editor
  foundations_member
}
```

- [ ] **Step 2: Generate Prisma client**

Run: `npx prisma generate`
Expected: Prisma client regenerates with new enum value.

- [ ] **Step 3: Create and run migration**

Run: `npx prisma migrate dev --name add-editor-role`
Expected: Migration creates successfully. No data changes needed (just adds an enum value).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/generated/
git commit -m "feat: add editor role to UserRole enum"
```

---

## Task 2: Auth Utilities — Shared Role Helpers

**Files:**
- Create: `src/lib/auth-utils.ts`

- [ ] **Step 1: Create auth-utils.ts**

```typescript
// src/lib/auth-utils.ts
import { auth } from "@/lib/auth";
import { ServiceTier } from "@/generated/prisma";

// The service tiers that the editor role can see
const EDITOR_VISIBLE_TIERS: ServiceTier[] = [
  ServiceTier.editing_2,
  ServiceTier.editing_4,
  ServiceTier.mastery_2,
  ServiceTier.mastery_4,
];

/**
 * Get the current session and extract the role.
 * Returns null if not authenticated.
 */
export async function getSessionRole(): Promise<{ id: string; role: string } | null> {
  const session = await auth();
  if (!session?.user) return null;
  return {
    id: (session.user as any).id as string,
    role: (session.user as any).role as string,
  };
}

/** True if the user is a full admin */
export function isAdmin(role: string): boolean {
  return role === "admin";
}

/** True if the user is admin or editor */
export function isAdminOrEditor(role: string): boolean {
  return role === "admin" || role === "editor";
}

/** True if the user is an editor (not full admin) */
export function isEditor(role: string): boolean {
  return role === "editor";
}

/**
 * Returns the Prisma `where` filter for the editor's visible service tiers.
 * For admin, returns undefined (no filter).
 * For editor, returns { serviceTier: { in: [...] } }.
 */
export function editorTierFilter(role: string): { serviceTier: { in: ServiceTier[] } } | undefined {
  if (role === "editor") {
    return { serviceTier: { in: EDITOR_VISIBLE_TIERS } };
  }
  return undefined;
}

/**
 * Check if a given service tier is visible to the editor.
 * Admin can see all tiers. Editor can only see editing/mastery.
 */
export function canAccessTier(role: string, serviceTier: ServiceTier | string): boolean {
  if (role === "admin") return true;
  return (EDITOR_VISIBLE_TIERS as string[]).includes(serviceTier);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth-utils.ts
git commit -m "feat: add shared auth utility helpers for editor role"
```

---

## Task 3: Login Routing — Route Editor to Admin Pages

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update root page to handle editor role**

Replace the entire file:

```typescript
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as any).role;

  if (role === "admin" || role === "editor") {
    redirect("/admin");
  }

  redirect("/member/scores");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: route editor role to admin pages on login"
```

---

## Task 4: Admin Layout — Allow Editor Access

**Files:**
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: Update admin layout to accept editor role and pass role to Sidebar**

Replace the entire file:

```typescript
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as any).role;

  if (role !== "admin" && role !== "editor") {
    redirect("/member/scores");
  }

  return (
    <div className="min-h-screen bg-[#f1f1ef]">
      <div className="print:hidden">
        <Sidebar
          role={role}
          userName={session.user.name || session.user.email || "Admin"}
        />
      </div>
      <main className="lg:pl-[260px] print:pl-0">
        <div className="pt-14 lg:pt-0 print:pt-0">
          <div className="p-6 lg:p-8 print:p-0">{children}</div>
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/layout.tsx
git commit -m "feat: allow editor role in admin layout"
```

---

## Task 5: Sidebar — Editor Navigation Links

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Add editorLinks array and update link/label selection logic**

After the existing `adminLinks` array (line 36), add the editor links array:

```typescript
const editorLinks = [
  { href: "/admin", label: "Dashboard", icon: HomeIcon },
  { href: "/admin/members", label: "Members", icon: UsersIcon },
  { href: "/admin/audits", label: "Audits", icon: ClipboardDocumentListIcon },
  { href: "/admin/qa-prep", label: "Q&A Prep", icon: ChatBubbleLeftRightIcon },
];
```

- [ ] **Step 2: Update the link selection logic in the component body**

Find this line (~line 177):
```typescript
const links = isAdminOnMemberView ? memberLinks : role === "admin" ? adminLinks : memberLinks;
```

Replace with:
```typescript
const links = isAdminOnMemberView
  ? memberLinks
  : role === "admin"
  ? adminLinks
  : role === "editor"
  ? editorLinks
  : memberLinks;
```

- [ ] **Step 3: Update the role label in the sidebar footer**

Find this line (~line 285):
```typescript
{isAdminOnMemberView ? "Foundations Member" : role === "admin" ? "Admin" : "Foundations Member"}
```

Replace with:
```typescript
{isAdminOnMemberView ? "Foundations Member" : role === "admin" ? "Admin" : role === "editor" ? "Editor" : "Foundations Member"}
```

- [ ] **Step 4: Update impersonation check to include editor**

Find this line (~line 174):
```typescript
const isAdminOnMemberView =
  role === "admin" && !!impersonate && !pathname.startsWith("/admin");
```

Replace with:
```typescript
const isAdminOnMemberView =
  (role === "admin" || role === "editor") && !!impersonate && !pathname.startsWith("/admin");
```

- [ ] **Step 5: Update the logo link to handle editor**

Find (~line 249):
```typescript
<Link href={isAdminOnMemberView ? "/member/scores" : role === "admin" ? "/admin" : "/member/scores"} className="flex items-center gap-3">
```

Replace with:
```typescript
<Link href={isAdminOnMemberView ? "/member/scores" : (role === "admin" || role === "editor") ? "/admin" : "/member/scores"} className="flex items-center gap-3">
```

- [ ] **Step 6: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: add editor navigation links to sidebar"
```

---

## Task 6: Session Utils — Allow Editor Impersonation

**Files:**
- Modify: `src/lib/session-utils.ts`

- [ ] **Step 1: Update resolveUserFromSession to allow editor impersonation**

Find this line (~line 16):
```typescript
if (role === "admin") {
```

Replace with:
```typescript
if (role === "admin" || role === "editor") {
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/session-utils.ts
git commit -m "feat: allow editor role to use impersonation"
```

---

## Task 7: API — Members List (Tier Filtering)

**Files:**
- Modify: `src/app/api/members/route.ts`

- [ ] **Step 1: Update to allow editor and filter by tier**

Replace the entire file:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminOrEditor, editorTierFilter } from "@/lib/auth-utils";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdminOrEditor(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tierFilter = editorTierFilter(role);

  const members = await prisma.user.findMany({
    where: {
      role: "foundations_member",
      ...tierFilter,
    },
    orderBy: { fullName: "asc" },
    include: {
      _count: { select: { audits: true } },
      audits: {
        where: { auditType: { in: ["baseline", "monthly"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { overallScore: true, createdAt: true },
      },
    },
  });

  const formatted = members.map((m) => ({
    id: m.id,
    email: m.email,
    fullName: m.fullName,
    youtubeHandle: m.youtubeHandle,
    youtubeChannelUrl: m.youtubeChannelUrl,
    serviceTier: m.serviceTier,
    slackUserId: m.slackUserId,
    skoolProfile: m.skoolProfile,
    ghlContactId: m.ghlContactId,
    createdAt: m.createdAt.toISOString(),
    _count: m._count,
    latestAuditScore: m.audits[0]?.overallScore ?? null,
    latestAuditDate: m.audits[0]?.createdAt?.toISOString() ?? null,
  }));

  return NextResponse.json({ members: formatted });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/members/route.ts
git commit -m "feat: filter members API by tier for editor role"
```

---

## Task 8: API — Member Detail (Read-Only for Editor)

**Files:**
- Modify: `src/app/api/members/[id]/route.ts`

- [ ] **Step 1: Allow editor GET with tier guard, block editor PATCH**

Replace the entire file:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminOrEditor, isAdmin, canAccessTier } from "@/lib/auth-utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdminOrEditor(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const member = await prisma.user.findUnique({
    where: { id },
    include: {
      audits: {
        orderBy: { createdAt: "desc" },
      },
      links: {
        include: {
          clicks: {
            include: { conversion: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Editor can only view editing/mastery tier members
  if (!canAccessTier(role, member.serviceTier)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ member });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  // Only full admin can edit members
  if (!session?.user || !isAdmin(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const allowed = [
    "fullName",
    "email",
    "phone",
    "youtubeChannelUrl",
    "youtubeHandle",
    "youtubeChannelName",
    "serviceTier",
    "ghlContactId",
    "avatarProfile",
    "avatarName",
    "avatarSummary",
    "contentThemes",
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const member = await prisma.user.update({
    where: { id },
    data: updates,
  });

  return NextResponse.json({ member });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/members/[id]/route.ts
git commit -m "feat: allow editor read access to member detail, block editing"
```

---

## Task 9: API — Member Notes & Videos

**Files:**
- Modify: `src/app/api/members/[id]/notes/route.ts`
- Modify: `src/app/api/members/[id]/videos/route.ts`

- [ ] **Step 1: Read current notes route**

Read `src/app/api/members/[id]/notes/route.ts` and update the auth check.

For the GET handler, change:
```typescript
if (!session?.user || (session.user as any).role !== "admin") {
```
to:
```typescript
import { isAdminOrEditor, isAdmin, canAccessTier } from "@/lib/auth-utils";
// ...
const role = (session?.user as any)?.role;
if (!session?.user || !isAdminOrEditor(role)) {
```

For any POST/PATCH/PUT handler in notes, restrict to admin only:
```typescript
if (!session?.user || !isAdmin((session?.user as any)?.role)) {
```

Add a tier guard after fetching the member: if editor, verify the member's `serviceTier` is editing/mastery using `canAccessTier(role, member.serviceTier)`.

- [ ] **Step 2: Update videos route similarly**

Read `src/app/api/members/[id]/videos/route.ts` and change the auth check from `role !== "admin"` to `!isAdminOrEditor(role)`.

Add the same tier guard for editor access.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/members/[id]/notes/route.ts src/app/api/members/[id]/videos/route.ts
git commit -m "feat: allow editor read access to member notes and videos"
```

---

## Task 10: API — Audits (Tier Filtering)

**Files:**
- Modify: `src/app/api/audits/route.ts`
- Modify: `src/app/api/audits/[auditId]/route.ts`

- [ ] **Step 1: Update audits list route**

Replace `src/app/api/audits/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminOrEditor, editorTierFilter } from "@/lib/auth-utils";

export async function GET() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || !isAdminOrEditor(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tierFilter = editorTierFilter(role);

  const audits = await prisma.audit.findMany({
    where: tierFilter ? { user: tierFilter } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, fullName: true, email: true, serviceTier: true } },
    },
  });

  return NextResponse.json({ audits });
}
```

- [ ] **Step 2: Update single audit route**

Read `src/app/api/audits/[auditId]/route.ts`. Update auth check to `isAdminOrEditor(role)`. After fetching the audit, add a tier guard:

```typescript
if (audit.user && !canAccessTier(role, audit.user.serviceTier)) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

Make sure the query includes `user: { select: { serviceTier: true } }` if not already.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/audits/route.ts src/app/api/audits/[auditId]/route.ts
git commit -m "feat: filter audits by tier for editor role"
```

---

## Task 11: API — Impersonate, Member Scores, Tools Usage

**Files:**
- Modify: `src/app/api/admin/impersonate/route.ts`
- Modify: `src/app/api/admin/member-scores/[userId]/route.ts`
- Modify: `src/app/api/admin/member-tools-usage/[userId]/route.ts`

- [ ] **Step 1: Update impersonate route**

In `src/app/api/admin/impersonate/route.ts`:

For both POST and DELETE handlers, change:
```typescript
if (!session?.user || (session.user as any).role !== "admin") {
```
to:
```typescript
const role = (session?.user as any)?.role;
if (!session?.user || !isAdminOrEditor(role)) {
```

In the POST handler, after fetching the member, add a tier guard:
```typescript
// Also fetch serviceTier in the select
const member = await prisma.user.findUnique({
  where: { id: memberId },
  select: { id: true, fullName: true, email: true, serviceTier: true },
});

if (!member) {
  return NextResponse.json({ error: "Member not found" }, { status: 404 });
}

// Editor can only impersonate editing/mastery members
if (!canAccessTier(role, member.serviceTier)) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

Add imports:
```typescript
import { isAdminOrEditor, canAccessTier } from "@/lib/auth-utils";
```

- [ ] **Step 2: Update member-scores route**

Read `src/app/api/admin/member-scores/[userId]/route.ts`. Change auth check to `isAdminOrEditor(role)`. After fetching the user, add `canAccessTier()` guard.

- [ ] **Step 3: Update member-tools-usage route**

Read `src/app/api/admin/member-tools-usage/[userId]/route.ts`. Same pattern: `isAdminOrEditor(role)` + `canAccessTier()` guard.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/impersonate/route.ts src/app/api/admin/member-scores/[userId]/route.ts src/app/api/admin/member-tools-usage/[userId]/route.ts
git commit -m "feat: allow editor access to impersonate, scores, and tools usage APIs"
```

---

## Task 12: API — Q&A Prep (Tier Filtering)

**Files:**
- Modify: `src/app/api/qa-prep/route.ts`

- [ ] **Step 1: Update qa-prep route**

In `src/app/api/qa-prep/route.ts`:

Change auth check (~line 52):
```typescript
if (!session || (session.user as any)?.role !== "admin") {
```
to:
```typescript
const role = (session?.user as any)?.role;
if (!session || !isAdminOrEditor(role)) {
```

Update the user query (~line 59) to include tier filtering for editor:
```typescript
import { isAdminOrEditor, editorTierFilter } from "@/lib/auth-utils";

// In the GET handler, update the where clause:
const tierFilter = editorTierFilter(role);
const users = await prisma.user.findMany({
  where: {
    role: "foundations_member",
    ...tierFilter,
  },
  // ... rest of the query stays the same
});
```

Note: Changed from `{ not: UserRole.admin }` to `"foundations_member"` to exclude both admin and editor users from the member list.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/qa-prep/route.ts
git commit -m "feat: filter Q&A prep by tier for editor role"
```

---

## Task 13: Admin Dashboard — Editor View

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Add role awareness to admin dashboard**

The dashboard is a client component. Add `useSession()` to detect the editor role and hide GHL sync + adjust labels.

At the top of the component function, add:
```typescript
import { useSession } from "next-auth/react";

// Inside AdminDashboard():
const { data: session } = useSession();
const role = (session?.user as any)?.role ?? "admin";
const isEditorRole = role === "editor";
```

Wrap the GHL sync section in a conditional:
```typescript
{!isEditorRole && (
  <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
    {/* existing GHL sync content */}
  </div>
)}
```

Update the dashboard title for editor:
```typescript
<p className="text-[#1e2a38]/50 mt-1 text-sm">
  {isEditorRole
    ? "Overview of your editing and mastery clients."
    : "Welcome back. Here\u0027s an overview of your program."}
</p>
```

Hide the Analytics KPI card for editor by filtering `kpiCards`:
```typescript
const visibleCards = isEditorRole
  ? kpiCards.filter((c) => c.label !== "Analytics")
  : kpiCards;
```

Then use `visibleCards` in the grid instead of `kpiCards`.

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: customize admin dashboard for editor role"
```

---

## Task 14: Members List Page — Hide GHL Sync for Editor

**Files:**
- Modify: `src/app/admin/members/page.tsx`

- [ ] **Step 1: Add role awareness and hide sync button**

Add at the top of the component:
```typescript
import { useSession } from "next-auth/react";

// Inside MembersPage():
const { data: session } = useSession();
const role = (session?.user as any)?.role ?? "admin";
const isEditorRole = role === "editor";
```

Wrap the GHL sync button in a conditional:
```typescript
{!isEditorRole && (
  <button
    onClick={handleSync}
    disabled={syncing}
    className="flex items-center gap-2 bg-[#3dc3ff] hover:bg-[#2bb3ef] text-white px-4 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50"
  >
    <ArrowPathIcon className={`w-5 h-5 ${syncing ? "animate-spin" : ""}`} />
    {syncing ? "Syncing from GHL..." : "Sync from GHL"}
  </button>
)}
```

Also wrap `syncResult` and `flaggedInactive` displays in `{!isEditorRole && (...)}`.

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/members/page.tsx
git commit -m "feat: hide GHL sync controls for editor role"
```

---

## Task 15: Member Detail Page — Read-Only for Editor

**Files:**
- Modify: `src/app/admin/members/[id]/page.tsx`

This is the largest change. The member detail page has inline editing for service tier, coaching notes, member fields (name, email, YouTube URL), and GHL links. All edit controls must be hidden for the editor role.

- [ ] **Step 1: Add role detection**

Add at the top of the component:
```typescript
import { useSession } from "next-auth/react";

// Inside MemberDetailPage():
const { data: session } = useSession();
const role = (session?.user as any)?.role ?? "admin";
const isEditorRole = role === "editor";
```

- [ ] **Step 2: Hide edit controls throughout the page**

Search the file for all edit-related UI elements and wrap them in `{!isEditorRole && (...)}`. Specifically:

1. **Service tier dropdown/edit button** — any `PencilIcon` or edit toggle for tier
2. **Coaching notes edit** — the textarea and save button for coaching notes
3. **Member field edit buttons** — any inline edit for name, email, phone, YouTube URL
4. **GHL contact link/edit** — the GHL contact ID link and any edit controls

The pattern for each edit control:
- Find the edit toggle state (e.g., `editingTier`, `editingNotes`)
- Wrap the edit button (pencil icon) in `{!isEditorRole && (...)}`
- The save/cancel buttons should also be wrapped

All read-only display (member info, audit history, score chart, avatar profile) should remain visible.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/members/[id]/page.tsx
git commit -m "feat: make member detail page read-only for editor role"
```

---

## Task 16: Page-Level Guards — Block Editor from Restricted Pages

**Files:**
- Modify: `src/app/admin/settings/page.tsx`
- Modify: `src/app/admin/campaigns/page.tsx`
- Modify: `src/app/admin/analytics/page.tsx`
- Modify: `src/app/admin/script-review/page.tsx`
- Modify: `src/app/admin/ai-tools/page.tsx`

These pages have no nav links for the editor, but an editor could manually navigate to them. Add a client-side redirect to `/admin` for each.

- [ ] **Step 1: Add editor redirect to each restricted page**

For each of the five page files above, add the following at the top of the component function:

```typescript
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Inside the component function, before existing logic:
const { data: session } = useSession();
const router = useRouter();
const role = (session?.user as any)?.role;

useEffect(() => {
  if (session && role === "editor") {
    router.replace("/admin");
  }
}, [session, role, router]);

if (role === "editor") return null; // Don't flash content while redirecting
```

**Important:** These are all `"use client"` components, so `useSession` and `useRouter` are available. If any of these pages are server components, use the server-side pattern instead:

```typescript
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

// At the top of the default export:
const session = await auth();
if ((session?.user as any)?.role === "editor") redirect("/admin");
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/settings/page.tsx src/app/admin/campaigns/page.tsx src/app/admin/analytics/page.tsx src/app/admin/script-review/page.tsx src/app/admin/ai-tools/page.tsx
git commit -m "feat: block editor from restricted admin pages"
```

---

## Task 17: API — Block Editor from Audit Run & AI Tools Routes

**Files:**
- Modify: `src/app/api/audits/run/route.ts` (verify admin-only — no change if already guarded)
- Modify: `src/app/api/audits/run-all-baseline/route.ts` (same)
- Modify: `src/app/api/audits/run-all-monthly/route.ts` (same)
- Modify: `src/app/api/audits/active-jobs/route.ts` (add admin-only check)
- Modify: `src/app/api/audits/jobs/[jobId]/route.ts` (add admin-only check)
- Modify: `src/app/api/audits/jobs/[jobId]/cancel/route.ts` (add admin-only check)

The audit run and job management routes trigger Anthropic API calls or manage running jobs. These must stay admin-only.

- [ ] **Step 1: Check and fix audit job routes**

Read each of these files. If the auth check is `session?.user` only (no role check), update to:

```typescript
const role = (session?.user as any)?.role;
if (!session?.user || role !== "admin") {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

The `active-jobs` route currently only checks `session?.user` with no role check — it needs the admin-only guard added.

The `jobs/[jobId]` and `jobs/[jobId]/cancel` routes likely have the same issue — read and fix.

The `run`, `run-all-baseline`, and `run-all-monthly` routes likely already check for admin — verify.

- [ ] **Step 2: Commit**

```bash
git add src/app/api/audits/active-jobs/route.ts src/app/api/audits/jobs/ src/app/api/audits/run/ src/app/api/audits/run-all-baseline/ src/app/api/audits/run-all-monthly/
git commit -m "fix: ensure audit job routes are admin-only"
```

---

## Task 18: Create Editor Account

- [ ] **Step 1: Create the editor user via Prisma seed or direct SQL**

Option A — Use existing seed script pattern:

Create a one-time script or add to `src/lib/seed-admin.ts`:

```typescript
// Run this once to create the editor account
import prisma from "./prisma";
import bcrypt from "bcryptjs";

async function seedEditor() {
  const passwordHash = await bcrypt.hash("EDITOR_PASSWORD_HERE", 10);
  await prisma.user.upsert({
    where: { email: "EDITOR_EMAIL_HERE" },
    update: { role: "editor", passwordHash },
    create: {
      email: "EDITOR_EMAIL_HERE",
      fullName: "EDITOR_NAME_HERE",
      role: "editor",
      passwordHash,
    },
  });
  console.log("Editor account created");
}

seedEditor();
```

Option B — Use Prisma Studio on Replit:

Run `npx prisma studio`, create a new user with `role: editor`, and set a password hash.

**Note:** Jared will need to provide the editor's email and desired password before this step.

- [ ] **Step 2: Commit (if using script)**

```bash
git add src/lib/seed-editor.ts
git commit -m "feat: add editor account seed script"
```

---

## Task 19: Smoke Test

- [ ] **Step 1: Test editor login**

1. Log in with the editor account
2. Verify redirect to `/admin` dashboard
3. Verify sidebar shows only: Dashboard, Members, Audits, Q&A Prep
4. Verify sidebar footer shows "Editor" role label

- [ ] **Step 2: Test member filtering**

1. Navigate to `/admin/members`
2. Verify only editing_2, editing_4, mastery_2, mastery_4 tier members appear
3. Verify no GHL sync button is visible
4. Verify tier filter buttons still work (but only show editing/mastery results)

- [ ] **Step 3: Test read-only member detail**

1. Click into a member's detail page
2. Verify all info displays (name, email, YouTube, tier, scores, audit history)
3. Verify no edit buttons (pencil icons) appear
4. Verify coaching notes display but cannot be edited

- [ ] **Step 4: Test impersonation**

1. From dashboard, use "View as Member" picker
2. Verify only editing/mastery members appear in the picker
3. Verify impersonation works correctly
4. Verify exit returns to admin dashboard

- [ ] **Step 5: Test URL guarding**

1. While logged in as editor, manually navigate to `/admin/settings` — should redirect to `/admin`
2. Try `/admin/campaigns` — should redirect to `/admin`
3. Try `/admin/analytics` — should redirect to `/admin`
4. Try `/admin/script-review` — should redirect to `/admin`
5. Try `/admin/ai-tools` — should redirect to `/admin`

- [ ] **Step 6: Test admin still works**

1. Log out, log back in as admin
2. Verify full admin experience is unchanged
3. Verify all members (including foundations tier) still appear

---

## Summary of Auth Check Changes

| Route | Current Check | New Check | Editor Behaviour |
|-------|--------------|-----------|-----------------|
| `GET /api/members` | `admin` only | `admin \| editor` | Filtered to editing/mastery |
| `GET /api/members/[id]` | `admin` only | `admin \| editor` | Tier guard on member |
| `PATCH /api/members/[id]` | `admin` only | `admin` only | **Blocked** |
| `GET /api/audits` | `admin` only | `admin \| editor` | Filtered to editing/mastery members |
| `GET /api/audits/[auditId]` | `admin` only | `admin \| editor` | Tier guard on audit owner |
| `POST /api/admin/impersonate` | `admin` only | `admin \| editor` | Tier guard on target member |
| `DELETE /api/admin/impersonate` | `admin` only | `admin \| editor` | Allowed |
| `GET /api/admin/member-scores/[userId]` | `admin` only | `admin \| editor` | Tier guard |
| `GET /api/admin/member-tools-usage/[userId]` | `admin` only | `admin \| editor` | Tier guard |
| `GET /api/qa-prep` | `admin` only | `admin \| editor` | Filtered to editing/mastery |
| `POST /api/ghl-sync` | `admin` only | `admin` only | **Blocked** |
| `GET/POST /api/settings` | `admin` only | `admin` only | **Blocked** |
| `POST /api/audits/run` | `admin` only | `admin` only | **Blocked** |
| `POST /api/audits/run-all-*` | `admin` only | `admin` only | **Blocked** |
| `GET /api/audits/active-jobs` | session only | `admin` only | **Blocked** |
| `GET /api/audits/jobs/[jobId]` | session only | `admin` only | **Blocked** |
| `POST /api/audits/jobs/[jobId]/cancel` | session only | `admin` only | **Blocked** |
| `POST /api/script-review` | session only | no change | Session-only (page blocked) |
| `POST /api/ai-tools/*` | session only | no change | Session-only (page blocked) |
| `GET /api/youtube/*` | session only | no change | Session-only (no direct exposure) |
