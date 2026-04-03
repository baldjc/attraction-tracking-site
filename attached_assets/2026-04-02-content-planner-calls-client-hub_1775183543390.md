# Content Planner, My Calls & Client Hub — Implementation Plan

> **Execution method:** Phased Replit Agent prompts. Paste each prompt into Replit Agent in order. Each prompt is self-contained with full context. Review via GitHub after each phase before moving to the next.

**Goal:** Add a Notion-style Content Planner (all members), My Calls page (all members), and Client Hub dashboard (Production/Growth/DWY) to the Attraction by Video member platform.

**Design spec:** `docs/superpowers/specs/2026-04-02-content-planner-calls-client-hub-design.md`

**Architecture:** Three new sidebar pages backed by new Prisma models. Content Planner has 5 views (3 calendars, table, board) with drag-and-drop. Google Drive API integration for auto folder creation. ICS calendar subscription feed. All routes use `resolveUserFromSession()` for data isolation.

---

## Phase Order

| Phase | Feature | Depends On |
|---|---|---|
| 1 | Database models + migrations | Nothing |
| 2 | Content Planner — Table view + CRUD | Phase 1 |
| 3 | Content Planner — Calendar views + drag & drop | Phase 2 |
| 4 | Content Planner — Board view + drag & drop | Phase 2 |
| 5 | My Calls | Phase 1 |
| 6 | Client Hub | Phase 1 + 2 |
| 7 | Google Drive API integration | Phase 2 + 6 |
| 8 | ICS calendar subscription feed | Phase 2 |
| 9 | AI Tool integration (Content Engine + ARC Script Builder → Planner) | Phase 2 |
| 10 | YouTube sync auto-linking | Phase 2 |

---

## Phase 1: Database Models & Migrations

### Replit Prompt

```
I need you to add 3 new Prisma models and 2 new fields on the User model. This is the database foundation for a Content Planner, Call Recordings, and Client Hub feature set.

## 1. Add to schema.prisma — new models:

### ContentPlan
model ContentPlan {
  id              String    @id @default(uuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  title           String
  status          String    @default("Idea")
  theme           String?
  shootDate       DateTime?
  publishDate     DateTime?
  editDueDate     DateTime?
  priority        String?
  notes           String?   @db.Text
  thumbnailWords  String?
  footageLink     String?
  driveFolderLink String?

  linkedIdeaId    String?
  linkedScriptId  String?
  youtubeVideoId  String?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([userId])
  @@index([userId, status])
  @@index([userId, publishDate])
}

### ClientCall
model ClientCall {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation("ClientCalls", fields: [userId], references: [id], onDelete: Cascade)

  fathomUrl   String
  callDate    DateTime
  topic       String?
  notes       String?  @db.Text

  createdById String
  createdBy   User     @relation("CallCreator", fields: [createdById], references: [id])

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId])
  @@index([userId, callDate])
}

### ClientQuickLink
model ClientQuickLink {
  id        String @id @default(uuid())
  userId    String
  user      User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  label     String
  url       String
  sortOrder Int    @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
}

## 2. Add to the existing User model — two new fields:

assetsDriveLink  String?
calendarToken    String?  @unique

## 3. Add the reverse relations on User:

contentPlans     ContentPlan[]
clientCalls      ClientCall[]  @relation("ClientCalls")
createdCalls     ClientCall[]  @relation("CallCreator")
quickLinks       ClientQuickLink[]

## 4. Run the migration:

npx prisma migrate dev --name add-content-planner-calls-client-hub

## 5. Important notes:
- Do NOT add relations to SavedIdea, SavedScript, or YouTubeVideo yet — those are just stored as String IDs for now and will be linked later.
- The ContentPlan.status field is a String (not an enum) because different membership tiers use different status options. The valid values are enforced in the API, not the database.
- Make sure all the relation names are unique and don't conflict with existing relations on User.
```

### Review checklist
- [ ] Migration runs clean
- [ ] `npx prisma generate` succeeds
- [ ] No relation name conflicts on User model
- [ ] All indexes created

---

## Phase 2: Content Planner — Table View + CRUD

### Replit Prompt

```
I need you to build the Content Planner feature — starting with the Table view and full CRUD. This is a Notion-style database where members plan their YouTube video pipeline.

## Sidebar

Add "Content Planner" to the member sidebar between "AI Tools" and "Generate Leads". Use a calendar icon (CalendarDays from lucide-react). Visible to ALL membership tiers.

## Page: /member/content-planner

This page has a toolbar at the top with:
1. View switcher tabs: "Publish Calendar", "Shoot Calendar", "Edit Due", "Table", "By Theme"
   - "Edit Due" tab is only visible if the member's serviceTier is mastery_2, mastery_4, or done_with_you
   - Default to "Table" view for now (we'll build the calendar and board views in the next phases)
2. "+ Add Video" button (opens a creation modal)
3. "Subscribe to Calendar" button (we'll wire this up later — for now just show the button disabled with tooltip "Coming soon")

### Table View

A sortable, filterable table with these columns:

| Column | Type | All Tiers | Notes |
|---|---|---|---|
| Title | Text (clickable to edit) | Yes | Required field |
| Status | Dropdown select | Yes | Options depend on tier (see below) |
| Theme | Dropdown select | Yes | Options pulled from member's avatar contentThemes. If no avatar saved, show a free-text input |
| Shoot Date | Date picker | Yes | |
| Publish Date | Date picker | Yes | |
| Edit Due Date | Date picker | Growth/DWY only | Hidden for foundations, editing_2, editing_4 |
| Priority | Dropdown (High/Medium/Low) | Yes | |
| Thumbnail Words | Text | Yes | |
| Drive Folder | Link icon (opens in new tab) | Production/Growth/DWY only | Only shown if driveFolderLink is not null |
| Notes | Expandable text | Yes | |
| Actions | Edit/Delete buttons | Yes | |

### Status options by tier

Foundations and Production tiers (editing_2, editing_4, foundations):
- Idea, Scripted, Ready to Shoot, Filmed, Editing, Scheduled, Published

Growth and Done-With-You tiers (mastery_2, mastery_4, done_with_you):
- Future Idea, Not Started, Needs Research, Ready to Shoot, Shooting, Shot - In Post, Edited, Scheduled on YT, Live on YT

### Status colours

Use these background/text colour pairs for status badges:
- Idea / Future Idea: grey bg (#2a2a3e), grey text (#888)
- Scripted / Not Started: blue bg (#1a2a4a), blue text (#5b9bf5)
- Needs Research: red bg (#3a1a1a), red text (#f55b5b)
- Ready to Shoot: purple bg (#2a1a3a), purple text (#b57cfc)
- Filmed / Shooting: pink bg (#3a1a2a), pink text (#f57cb5)
- Editing / Shot - In Post: yellow bg (#3a3a1a), yellow text (#f5d55b)
- Edited: green bg (#1a3a1a), green text (#5bf57c)
- Scheduled / Scheduled on YT: orange bg (#3a2a1a), orange text (#f5a55b)
- Published / Live on YT: green bg (#1a3a2a), green text (#5bf5a5)

### "+ Add Video" Modal

A modal form with fields: Title (required), Status (dropdown), Theme (dropdown), Shoot Date, Publish Date, Edit Due Date (Growth/DWY only), Priority, Thumbnail Words, Notes, Footage Link (URL).

On save, POST to the API and add the row to the table.

### Inline editing

Users should be able to click on any cell in the table to edit it inline (especially Status dropdown and date pickers). Save on blur/change via PUT to the API.

### Empty state

If no content plans exist: "No videos planned yet. Start building your content calendar by clicking '+ Add Video' above."

## API Routes

CRITICAL: All member-facing routes MUST use resolveUserFromSession() from src/lib/session-utils.ts for data isolation. This checks the abv-impersonate-id cookie so admin impersonation works correctly. Never use a raw session userId — always go through resolveUserFromSession().

### GET /api/member/content-plans
- Returns all ContentPlan records for the current user (via resolveUserFromSession())
- Supports query params: ?status=X, ?theme=X for filtering
- Sort by publishDate desc by default
- Response: { plans: ContentPlan[] }

### POST /api/member/content-plans
- Creates a new ContentPlan for the current user
- Body: { title, status?, theme?, shootDate?, publishDate?, editDueDate?, priority?, notes?, thumbnailWords?, footageLink? }
- Validate: title is required, status must be valid for the user's tier
- Response: { plan: ContentPlan }

### GET /api/member/content-plans/[id]
- Returns a single ContentPlan (must belong to current user)
- 404 if not found or not owned by user

### PUT /api/member/content-plans/[id]
- Updates a ContentPlan (must belong to current user)
- Body: any subset of fields
- Validate: if status is provided, must be valid for user's tier
- Response: { plan: ContentPlan }

### DELETE /api/member/content-plans/[id]
- Deletes a ContentPlan (must belong to current user)
- Hard delete (no soft delete needed — these are planning records, not tracking data)
- Response: { success: true }

### GET /api/member/content-plans/themes
- Returns the member's available themes
- Pull from user.contentThemes (JSON array saved by Avatar Architect)
- If null/empty, return a default set: ["Theme 1", "Theme 2", "Theme 3", "Theme 4"]
- Response: { themes: string[] }

## Admin — Member Detail Page

Add a "Content Planner" tab to the admin member detail page (the page at /admin/members/[id]).

This tab shows the exact same table view as the member sees, but for that specific member. Admin can:
- Add, edit, and delete content plans for any member
- See all columns including Edit Due Date regardless of tier
- The admin routes should scope data to the member being viewed (the [id] in the URL), NOT the admin's own userId

### Admin API routes:

### GET /api/admin/members/[id]/content-plans
- Returns all ContentPlan records for the specified member
- Admin auth required

### POST /api/admin/members/[id]/content-plans
- Creates a ContentPlan for the specified member
- Admin auth required

### PUT /api/admin/members/[id]/content-plans/[planId]
- Updates a ContentPlan for the specified member
- Admin auth required

### DELETE /api/admin/members/[id]/content-plans/[planId]
- Deletes a ContentPlan
- Admin auth required

## Styling

Match the existing site design language — dark theme, same card styles, same form inputs, same modal pattern used elsewhere on the site. The table should feel like a Notion database table: clean rows, inline editing, minimal chrome.
```

### Review checklist
- [ ] Table renders with all columns
- [ ] Status dropdown shows correct options per tier
- [ ] Edit Due Date column hidden for Foundations/Production
- [ ] Inline editing works (click cell → edit → save on blur)
- [ ] Add/edit/delete all work
- [ ] Admin tab on member detail page works
- [ ] Data isolation: member A cannot see member B's plans
- [ ] Admin impersonation (View as Member) shows correct member's plans

---

## Phase 3: Content Planner — Calendar Views + Drag & Drop

### Replit Prompt

```
I need you to add Calendar views to the existing Content Planner page at /member/content-planner. The Table view and API are already built from the previous phase.

## What exists

The Content Planner page already has:
- A view switcher toolbar with tabs: "Publish Calendar", "Shoot Calendar", "Edit Due", "Table", "By Theme"
- Table view is working with full CRUD
- API routes at /api/member/content-plans (GET, POST, PUT, DELETE)

## What to build

Implement the three Calendar views. When the user clicks "Publish Calendar", "Shoot Calendar", or "Edit Due" in the view switcher, show a monthly calendar grid.

### Calendar Layout

Standard 7-column monthly calendar (Sun–Sat):
- Header row with day abbreviations (Sun, Mon, Tue, Wed, Thu, Fri, Sat) in uppercase, small text, muted colour
- Day cells: minimum height 100px, dark background (#12121e), 1px border (#2a2a3e)
- Days from previous/next month shown with reduced opacity (0.5)
- Today's date number highlighted in purple (#7c5cfc) and bold
- Month/year title centred in the toolbar with left/right arrow buttons to navigate months

### Video Pills in Calendar Cells

Each ContentPlan that has a date set for the relevant field appears as a pill in the corresponding day cell:
- "Publish Calendar" → uses publishDate
- "Shoot Calendar" → uses shootDate
- "Edit Due" → uses editDueDate

Pill styling:
- Small rounded rectangle inside the day cell
- Background and text colour matching the status colours from the Table view (same colour scheme)
- Show the video title, truncated with ellipsis if too long
- Multiple videos on the same day stack vertically
- Click a pill to open the edit modal for that content plan

### Navigation

- Left arrow (←) and right arrow (→) buttons in the toolbar to navigate months
- The month/year label between them (e.g., "April 2026")
- Today button to jump back to current month

### Drag and Drop

This is the key interaction. Members can drag video pills between day cells to reschedule:

1. User grabs a video pill (cursor changes to "grabbing")
2. The pill becomes semi-transparent (opacity 0.4) with a dashed purple outline
3. As they drag over day cells, the target cell gets a subtle purple highlight (dashed border + faint purple background)
4. When they drop the pill on a new day:
   - Call PUT /api/member/content-plans/[id] to update the relevant date field
   - Publish Calendar drag → updates publishDate
   - Shoot Calendar drag → updates shootDate
   - Edit Due drag → updates editDueDate
   - The pill animates into its new position
5. If the API call fails, snap the pill back to its original position and show a toast error

Use the HTML5 Drag and Drop API or a React drag library (react-beautiful-dnd or @dnd-kit/core — whichever is already in the project, or @dnd-kit if adding new). @dnd-kit is preferred as react-beautiful-dnd is no longer maintained.

### Empty days

Day cells with no videos just show the day number. No placeholder text needed.

### Responsive

On mobile (< 768px), the calendar should switch to a list view for that month — each day that has videos listed vertically with date headers. Drag and drop is disabled on mobile (too fiddly). Instead, tapping a pill opens the edit modal where they can change the date via date picker.

### "Edit Due" visibility

Remember: the "Edit Due" tab in the view switcher is only visible for Growth and DWY tiers (mastery_2, mastery_4, done_with_you). This was already set up in the previous phase but make sure it applies to the calendar view as well.
```

### Review checklist
- [ ] All 3 calendar views render correctly
- [ ] Pills show in correct day cells based on the right date field
- [ ] Status colour coding matches table view
- [ ] Month navigation (arrows + today button) works
- [ ] Drag and drop moves pills between days
- [ ] Dropping updates the correct date field via API
- [ ] Failed API calls snap pill back to original position
- [ ] Mobile shows list view instead of grid
- [ ] Edit Due calendar only visible for Growth/DWY

---

## Phase 4: Content Planner — Board View + Drag & Drop

### Replit Prompt

```
I need you to add the Board view to the Content Planner page at /member/content-planner. The Table and Calendar views are already built.

## What to build

When the user clicks "By Theme" in the view switcher, show a Kanban-style board where columns represent the member's avatar stress phases/themes.

### Board Layout

Horizontal scrolling container with one column per theme:

**Column structure:**
- Colour accent bar at the top (3px, unique colour per theme — cycle through: pink #f57cb5, purple #b57cfc, orange #f5a55b, green #5bf57c, blue #5b9bf5, then repeat)
- Column header with:
  - Theme name (bold, white, 13px)
  - Count badge (number of videos in that column, grey background pill)
- Card list below the header, with a gap of 8px between cards

**Columns are generated from the member's avatar themes:**
- Fetch from GET /api/member/content-plans/themes
- If the member has no avatar themes saved, show a message: "Set up your avatar in the Avatar Architect to see your content themes here. For now, you can assign themes manually in the Table view."
- Also include a column for videos with no theme assigned, labelled "Unassigned" (only shown if there are unassigned videos)

### Cards

Each ContentPlan appears as a card in the column matching its theme:

Card layout:
- Dark background (#12121e), 1px border (#2a2a3e), 6px border radius
- Hover: purple border (#7c5cfc), slight lift (translateY -1px), subtle purple shadow
- Title: 12px, white, medium weight, 1.4 line height
- Below title, a row of metadata:
  - Status badge (same colour coding as everywhere else)
  - Publish date (10px, grey, e.g., "Apr 10")
  - "Open Folder" link in purple (only shown if driveFolderLink exists) — opens the Google Drive folder in a new tab
- Click the card (not the folder link) to open the edit modal

### Drag and Drop

Users can drag cards between columns to reassign the video's theme:

1. User grabs a card (same drag behaviour as calendar — opacity, purple outline)
2. Target column gets a subtle highlight
3. Drop → call PUT /api/member/content-plans/[id] with the new theme value
4. Card animates into the new column, count badges update
5. Failed API call → snap back + toast error

Use the same drag library as the Calendar views (@dnd-kit).

### Responsive

On mobile (< 768px), columns stack vertically instead of scrolling horizontally. Each theme becomes a collapsible section. Drag and drop disabled on mobile — tap card to edit theme via the edit modal.

### No "add card" in columns

Don't add an inline "add card" button inside each column. The "+ Add Video" button in the toolbar is the only way to create new plans. Keep it simple.
```

### Review checklist
- [ ] Columns generated from member's avatar themes
- [ ] Unassigned column appears only when needed
- [ ] Cards show in correct theme columns
- [ ] Count badges accurate
- [ ] Drag between columns updates theme via API
- [ ] Drive folder link shows for Production/Growth/DWY only
- [ ] Graceful handling when no avatar themes exist
- [ ] Mobile stacks vertically

---

## Phase 5: My Calls

### Replit Prompt

```
I need you to build the "My Calls" feature — a page where members can see their 1-on-1 call recordings (Fathom videos), and an admin interface for adding them.

## Sidebar

Add "My Calls" to the member sidebar between "Content Planner" and "Generate Leads". Use a phone/video icon (Video from lucide-react). Visible to ALL membership tiers.

## Page: /member/my-calls

### Member View

A chronological list of call recordings, newest first. Each call is displayed as a card:

**Card layout:**
- Date displayed prominently (formatted: "March 15, 2026")
- Topic as the card title. If no topic was set, show "Strategy Call — March 15, 2026"
- Fathom video embed: Fathom recording URLs (like https://fathom.video/share/XXXXX) can be embedded as iframes. Render the Fathom URL as: <iframe src="{fathomUrl}" width="100%" height="400" frameborder="0" allowfullscreen></iframe>
- Notes text below the embed (if notes exist), in muted colour
- Cards have the standard dark background, border, and rounded corners matching the site design

**Empty state:**
"No call recordings yet. After your next 1-on-1 call, the recording will appear here."

### API Routes

CRITICAL: Use resolveUserFromSession() for all member routes.

### GET /api/member/calls
- Returns all ClientCall records for the current user
- Sorted by callDate DESC
- Response: { calls: ClientCall[] }

## Admin — Member Detail Page

Add a "Calls" tab to the admin member detail page (/admin/members/[id]).

### Admin View

Same card layout as the member view, but with additional controls:

**"Add Call" button** at the top — opens a modal form:
- Fathom URL (required) — text input, placeholder: "https://fathom.video/share/..."
- Call Date (required) — date picker
- Topic (optional) — text input, placeholder: "e.g., Monthly Strategy Review"
- Notes (optional) — text area, placeholder: "Key discussion points, action items..."

Each existing call card has **Edit** (pencil icon) and **Delete** (trash icon) buttons in the top-right corner:
- Edit opens the same form pre-filled with current values
- Delete shows a confirmation dialog: "Delete this call recording? The Fathom recording itself won't be affected." with Cancel and Delete buttons

### Admin API Routes

### POST /api/admin/members/[id]/calls
- Creates a ClientCall for the specified member
- Body: { fathomUrl, callDate, topic?, notes? }
- Set createdById to the admin's user ID (from session, not impersonation)
- Admin auth required
- Response: { call: ClientCall }

### PUT /api/admin/members/[id]/calls/[callId]
- Updates a ClientCall
- Verify the call belongs to the specified member
- Admin auth required
- Response: { call: ClientCall }

### DELETE /api/admin/members/[id]/calls/[callId]
- Deletes a ClientCall
- Verify the call belongs to the specified member
- Admin auth required
- Response: { success: true }
```

### Review checklist
- [ ] My Calls page renders for all tiers
- [ ] Fathom embeds load correctly
- [ ] Empty state shows when no calls
- [ ] Admin can add/edit/delete calls from member detail page
- [ ] Call appears on member's My Calls page after admin adds it
- [ ] Data isolation: members only see their own calls
- [ ] createdById correctly tracks which admin added the call

---

## Phase 6: Client Hub

### Replit Prompt

```
I need you to build the "Client Hub" page — a production dashboard for Production, Growth, and Done-With-You members. It centralises their Google Drive assets, production pipeline status, and quick links.

## Sidebar

Add "Client Hub" to the member sidebar below "My Calls". Use a briefcase or layout-dashboard icon (LayoutDashboard from lucide-react). Only visible to Production, Growth, and DWY tiers (editing_2, editing_4, mastery_2, mastery_4, done_with_you). Hidden for Foundations.

## Page: /member/client-hub

Single page with up to 3 sections. The page should feel like a dashboard — clean cards, good spacing, not a form.

### Section 1: Assets Folder

A prominent card at the top:
- If assetsDriveLink is set on the user: show a large button/card that says "Open Assets Folder" with a folder icon and an external link icon. Clicking opens the Google Drive folder in a new tab. Below the button, smaller muted text: "All video-specific folders are created automatically when videos are added to your Content Planner."
- If assetsDriveLink is NOT set: show a card with muted text: "Your assets folder is being set up. We'll have this ready for you shortly." with a folder icon in a muted colour.

### Section 2: Production Status

A filtered, read-only view of the member's Content Planner showing only videos currently in the production pipeline.

Which statuses to show depends on tier:
- Production tiers (editing_2, editing_4): show videos with status in ["Filmed", "Editing", "Scheduled"]
- Growth/DWY (mastery_2, mastery_4, done_with_you): show videos with status in ["Shot - In Post", "Edited", "Scheduled on YT"]

Display as a compact table or card list:
- Title
- Status badge (same colour coding as Content Planner)
- Edit Due Date (Growth/DWY only)
- Drive Folder link (if exists) — folder icon that opens in new tab

Below the list: a "View Full Planner →" link that navigates to /member/content-planner

Empty state: "No videos currently in production." in muted text.

### Section 3: Quick Links (Growth/DWY only)

This section is ONLY visible for mastery_2, mastery_4, and done_with_you tiers. Hidden entirely for Production.

Display as a grid of link cards (2-3 columns on desktop, 1 column mobile):
- Each card shows: label text + external link icon
- Click opens the URL in a new tab
- Cards have the standard dark background and border

If the admin hasn't added any quick links for this member, hide the entire Quick Links section (don't show an empty state — it would just be confusing).

### API Route

### GET /api/member/client-hub
- Use resolveUserFromSession()
- Check tier: if foundations, return 403
- Return:
  - assetsDriveLink (from user record)
  - productionPlans: ContentPlan[] filtered to production statuses (based on tier)
  - quickLinks: ClientQuickLink[] sorted by sortOrder (empty array for Production tier)
- Response: { assetsDriveLink: string | null, productionPlans: ContentPlan[], quickLinks: ClientQuickLink[] }

## Admin — Member Detail Page

Add a "Client Hub" tab to the admin member detail page. Only shown for Production, Growth, and DWY members (check the member's serviceTier, not the admin's).

### Admin View — Assets Folder

- Text input for "Assets Drive Folder URL" with the current value (or empty)
- Save button
- This updates the user.assetsDriveLink field via:

### PUT /api/admin/members/[id]/assets-drive-link
- Body: { assetsDriveLink: string }
- Admin auth required

### Admin View — Quick Links (Growth/DWY only)

- List of existing quick links with Edit (pencil) and Delete (trash) buttons
- "Add Link" button opens a form: Label (required) + URL (required)
- Up/down arrows or drag to reorder links
- Only show this section if the member is Growth or DWY

### Admin Quick Link API Routes

### GET /api/admin/members/[id]/quick-links
- Returns ClientQuickLink[] for the member, sorted by sortOrder
- Admin auth required

### POST /api/admin/members/[id]/quick-links
- Body: { label, url }
- Set sortOrder to max(existing) + 1
- Admin auth required
- Response: { quickLink: ClientQuickLink }

### PUT /api/admin/members/[id]/quick-links/[linkId]
- Body: { label?, url? }
- Admin auth required

### DELETE /api/admin/members/[id]/quick-links/[linkId]
- Admin auth required

### PUT /api/admin/members/[id]/quick-links/reorder
- Body: { orderedIds: string[] }
- Updates sortOrder for each link based on array position
- Admin auth required
```

### Review checklist
- [ ] Client Hub only visible for Production/Growth/DWY in sidebar
- [ ] Assets Folder section shows button or "being set up" message correctly
- [ ] Production Status shows only in-pipeline videos with correct status filter per tier
- [ ] Quick Links section only visible for Growth/DWY, hidden for Production
- [ ] Quick Links hidden entirely when none exist (no empty state)
- [ ] Admin can set Drive link, manage quick links
- [ ] Admin Client Hub tab only appears for Production/Growth/DWY members
- [ ] Data isolation via resolveUserFromSession()

---

## Phase 7: Google Drive API Integration

### Replit Prompt

```
I need you to integrate the Google Drive API so that when a ContentPlan is created for a Production, Growth, or DWY member, a subfolder is automatically created in their shared Google Drive folder.

## Prerequisites

We need a Google service account. The credentials are stored as an environment variable.

Add these to Replit Secrets:
- GOOGLE_SERVICE_ACCOUNT_KEY — the full JSON content of the service account key file (I'll paste this in)

## Setup: src/lib/google-drive.ts

Create a new utility file that handles Google Drive operations:

1. Parse the service account credentials from GOOGLE_SERVICE_ACCOUNT_KEY env var
2. Use the googleapis npm package (add it: npm install googleapis)
3. Authenticate using google.auth.GoogleAuth with scope: https://www.googleapis.com/auth/drive.file
4. Export a function:

async function createVideoFolder(parentFolderUrl: string, videoTitle: string): Promise<string | null>

This function:
- Extracts the folder ID from the Google Drive URL (the part after /folders/ or the d/ parameter)
- Sanitises the video title for use as a folder name: strip characters not allowed in Drive folder names (/ \ : * ? " < > |), truncate to 100 characters
- Creates a subfolder with that name inside the parent folder using drive.files.create with mimeType 'application/vnd.google-apps.folder'
- Returns the URL of the new folder (https://drive.google.com/drive/folders/{newFolderId})
- If anything fails (bad URL, permissions error, API error), log the error and return null — never throw

## Modify: POST /api/member/content-plans

After creating the ContentPlan record, check:
1. Is the member's serviceTier one of: editing_2, editing_4, mastery_2, mastery_4, done_with_you?
2. Does the member have an assetsDriveLink set?

If both true:
- Call createVideoFolder(user.assetsDriveLink, contentPlan.title)
- If it returns a URL, update the ContentPlan record with driveFolderLink = the returned URL
- If it returns null, leave driveFolderLink as null (don't block the content plan creation)

Do the same for POST /api/admin/members/[id]/content-plans — check the MEMBER's tier and assetsDriveLink (not the admin's).

## Important
- The Drive folder creation should NOT block the content plan creation. Use a try/catch — if Drive fails, the plan still saves.
- Log all Drive API errors with the member userId and video title so we can debug.
- The Google service account needs to be given Editor access to each member's shared folder. This is done manually by Jared when setting up a new member — the service account email will be shared with the member's folder.
```

### Review checklist
- [ ] googleapis package installed
- [ ] google-drive.ts creates folders correctly
- [ ] Folder URL saved to driveFolderLink on ContentPlan
- [ ] Drive failure doesn't block content plan creation
- [ ] Only runs for Production/Growth/DWY with assetsDriveLink set
- [ ] Folder name sanitised (no special characters, truncated)
- [ ] Works from both member and admin content plan creation routes

---

## Phase 8: ICS Calendar Subscription Feed

### Replit Prompt

```
I need you to build an ICS calendar subscription endpoint so members can subscribe to their Content Planner from Google Calendar or Apple Calendar.

## How it works

Each member gets a unique calendar token (UUID). They can paste a URL into Google Calendar or Apple Calendar to subscribe, and their planned shoot/publish/edit dates show up as events on their phone.

## Generate calendar token

Modify the GET /api/member/content-plans route (or create a new dedicated route):

### GET /api/member/content-planner/calendar-token
- Use resolveUserFromSession()
- If the user doesn't have a calendarToken yet, generate one (randomUUID()) and save it to the user record
- Return: { token: string, url: string } where url is the full subscription URL

The subscription URL format: https://members.attractionbyvideo.com/api/calendar/{calendarToken}.ics

## ICS Feed Endpoint

### GET /api/calendar/[calendarToken].ics

This is a PUBLIC route — no auth required. The calendarToken in the URL is the access credential.

1. Look up the User by calendarToken. If not found, return 404.
2. Fetch all ContentPlan records for that user
3. Generate an ICS file with the following structure:

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Attraction by Video//Content Planner//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:ABV Content Planner
X-WR-TIMEZONE:America/Edmonton
```

For each ContentPlan that has a publishDate:
```
BEGIN:VEVENT
UID:publish-{contentPlan.id}@attractionbyvideo.com
DTSTART;VALUE=DATE:{publishDate formatted as YYYYMMDD}
SUMMARY:PUBLISH: {title}
DESCRIPTION:Status: {status}\nTheme: {theme or "None"}\nPriority: {priority or "None"}
END:VEVENT
```

For each ContentPlan that has a shootDate:
```
BEGIN:VEVENT
UID:shoot-{contentPlan.id}@attractionbyvideo.com
DTSTART;VALUE=DATE:{shootDate formatted as YYYYMMDD}
SUMMARY:SHOOT: {title}
DESCRIPTION:Status: {status}\nTheme: {theme or "None"}
END:VEVENT
```

For each ContentPlan that has an editDueDate AND the user's tier is mastery_2, mastery_4, or done_with_you:
```
BEGIN:VEVENT
UID:editdue-{contentPlan.id}@attractionbyvideo.com
DTSTART;VALUE=DATE:{editDueDate formatted as YYYYMMDD}
SUMMARY:EDIT DUE: {title}
DESCRIPTION:Status: {status}
END:VEVENT
```

End the file with:
```
END:VCALENDAR
```

4. Return with headers:
   - Content-Type: text/calendar; charset=utf-8
   - Content-Disposition: attachment; filename="abv-content-planner.ics"
   - Cache-Control: no-cache (so calendar apps always get the latest)

## Subscribe to Calendar UI

Update the "Subscribe to Calendar" button in the Content Planner toolbar (currently disabled from Phase 2):

1. Make the button active
2. On click, open a small modal/popover showing:
   - The subscription URL (in a copyable text field with a copy button)
   - Brief instructions:
     - **Google Calendar:** Settings → Add calendar → From URL → paste the link
     - **Apple Calendar:** File → New Calendar Subscription → paste the link
   - Note: "Your calendar will automatically update when you make changes to your Content Planner. Google Calendar refreshes every 12-24 hours. Apple Calendar refreshes every 15-60 minutes."

## Important
- The ICS file must be valid. Use proper line endings (\r\n as per RFC 5545).
- Dates must be formatted as YYYYMMDD (no dashes, no time component — these are all-day events).
- Each event needs a globally unique UID that stays the same when the feed is regenerated — this is how calendar apps know to update existing events rather than create duplicates. The format {type}-{planId}@attractionbyvideo.com ensures this.
- Do NOT use any ICS library — the format is simple enough to generate as a string template.
```

### Review checklist
- [ ] Calendar token generated and saved on first request
- [ ] ICS endpoint returns valid .ics file
- [ ] PUBLISH, SHOOT, and EDIT DUE events generated correctly
- [ ] Edit Due events only included for Growth/DWY members
- [ ] Dates formatted as YYYYMMDD (all-day events)
- [ ] UIDs are stable (same plan always gets same UID)
- [ ] Subscribe button shows copyable URL with instructions
- [ ] Feed works when pasted into Google Calendar (test manually)
- [ ] 404 returned for invalid tokens

---

## Phase 9: AI Tool Integration — Content Engine + ARC Script Builder → Planner

### Replit Prompt

```
I need you to add "Add to Planner" buttons on the Content Engine and ARC Script Builder so members can push their saved ideas and scripts directly into the Content Planner.

## Content Engine — Saved Ideas

In the Content Engine, when a member has saved ideas (the saved ideas section), add an "Add to Planner" button on each saved idea card.

When clicked:
1. POST /api/member/content-plans with:
   - title: the idea's title
   - status: "Idea" (for foundations/editing_2/editing_4) or "Future Idea" (for mastery_2/mastery_4/done_with_you)
   - theme: the theme the idea was generated under
   - linkedIdeaId: the SavedIdea's ID
2. Show a success toast: "Added to Content Planner"
3. Change the button to "In Planner ✓" (disabled state) so they know it's been added
4. If a content plan already exists with that linkedIdeaId, show the disabled "In Planner ✓" state by default

### API change needed

Modify GET /api/member/content-plans to accept an optional ?linkedIdeaId=X query param. This lets the Content Engine check which ideas are already in the planner.

## ARC Script Builder — Saved Scripts

In the ARC Script Builder, when a member saves a script, add an "Add to Planner" button on each saved script card.

When clicked:
1. Check if a ContentPlan already exists with the same title (fuzzy match not needed — exact title match is fine for now)
   - If yes: update that plan's linkedScriptId to this script's ID. Show toast: "Script linked to existing plan"
   - If no: POST /api/member/content-plans with:
     - title: the script's title
     - status: "Scripted" (for foundations/editing_2/editing_4) or "Not Started" (for mastery_2/mastery_4/done_with_you)
     - linkedScriptId: the SavedScript's ID
     - Show toast: "Added to Content Planner"
2. Change button to "In Planner ✓" (disabled state)

### API change needed

Modify GET /api/member/content-plans to also accept ?linkedScriptId=X query param.

## Content Planner — Show linked items

In the Content Planner table view and edit modal, if a content plan has a linkedIdeaId or linkedScriptId, show small badges:
- "From Content Engine" badge (clickable — navigates to /member/ai-tools/content-engine)
- "Script Linked" badge (clickable — navigates to /member/ai-tools/arc-script-builder)

These are informational only — you can't unlink from the planner side.
```

### Review checklist
- [ ] "Add to Planner" button appears on saved ideas in Content Engine
- [ ] "Add to Planner" button appears on saved scripts in ARC Script Builder
- [ ] Correct status set based on tier
- [ ] Ideas already in planner show "In Planner ✓" disabled state
- [ ] Script links to existing plan if title matches
- [ ] Badges show in Content Planner for linked items
- [ ] Badges navigate to correct AI tool pages

---

## Phase 10: YouTube Sync Auto-Linking

### Replit Prompt

```
I need you to modify the YouTube sync process so that when a new video is detected for a member, it automatically tries to match it to an existing Content Plan and mark it as published.

## Existing YouTube sync

The cron job at /api/cron/youtube-sync pulls new videos for all members and saves them as YouTubeVideo records. This already runs on a schedule.

## What to add

After the sync saves/updates YouTubeVideo records for a member, add this step:

For each newly detected video (a YouTubeVideo that was just created, not updated):
1. Fetch all ContentPlan records for that member where youtubeVideoId IS NULL
2. Compare the YouTube video title to each plan's title using a simple similarity check:
   - Normalise both: lowercase, trim, remove punctuation
   - Check if one contains the other, or if they share >80% of their words
   - This doesn't need to be perfect — it's a convenience feature
3. If a match is found:
   - Update the ContentPlan: set youtubeVideoId to the YouTubeVideo's ID
   - Update the ContentPlan status:
     - For foundations/editing_2/editing_4: set to "Published"
     - For mastery_2/mastery_4/done_with_you: set to "Live on YT"
   - If the plan's publishDate is null, set it to the YouTube video's published date
4. If no match is found, do nothing (don't auto-create planner entries from YouTube)

## Important
- This runs inside the existing cron job — don't create a new endpoint
- Only match against ContentPlans that don't already have a youtubeVideoId
- Log matches: "Auto-linked video '{videoTitle}' to content plan '{planTitle}' for member {userId}"
- If multiple plans match (unlikely but possible), pick the one with the closest publishDate to the video's publish date. If none have publishDates, pick the most recently created plan.
```

### Review checklist
- [ ] YouTube sync auto-links videos to plans
- [ ] Status updated to Published/Live on YT
- [ ] publishDate backfilled if not set
- [ ] Only matches plans without existing youtubeVideoId
- [ ] No auto-creation of plans from YouTube
- [ ] Matching logged for debugging

---

## Execution Notes

**Paste prompts in order.** Each phase builds on the previous. After each phase:
1. Have Replit push to GitHub
2. Claude Code reviews via GitHub pull
3. Verify the review checklist
4. Move to next phase

**Google Drive setup (needed before Phase 7):**
1. Create a Google Cloud project (or use existing)
2. Enable the Google Drive API
3. Create a service account
4. Download the JSON key
5. Paste the JSON into Replit Secret: GOOGLE_SERVICE_ACCOUNT_KEY
6. Share each member's assets folder with the service account email

**Testing the ICS feed (Phase 8):**
After deploying, test by:
1. Visiting the .ics URL directly in a browser — should download a file
2. Open the file in a text editor — verify it's valid ICS
3. Subscribe in Google Calendar — verify events appear within 24 hours
