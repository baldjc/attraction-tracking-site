# Hire a Human — Design Spec (v2)

**Date:** 2026-03-27
**Status:** Approved

## Overview

A DB-backed "Hire a Human" section with admin-managed service categories and packages. Members browse and purchase via Stripe payment links. Admin has full CRUD over categories, packages, and add-ons.

## Data Model

### ServiceCategory

| Field | Type | Notes |
|---|---|---|
| id | String (uuid) | PK |
| name | String | e.g. "Attraction Editing" |
| slug | String (unique) | e.g. "editing" |
| description | String? | Subtitle text |
| icon | String | Heroicon name, e.g. "FilmIcon" |
| accentColour | String | Tailwind colour key, e.g. "blue", "amber" |
| sortOrder | Int | Display order |
| published | Boolean | Toggle visibility |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### ServicePackage

| Field | Type | Notes |
|---|---|---|
| id | String (uuid) | PK |
| categoryId | String (FK) | → ServiceCategory |
| name | String | e.g. "2 Video Package" |
| price | String | Display price, e.g. "$500/mo" |
| priceNote | String? | e.g. "USD", "all-in" |
| badge | String? | e.g. "Includes Jared's Feedback", "Most Comprehensive" |
| subtitle | String? | e.g. "2 long-form videos/mo" |
| features | Json | String array of bullet points |
| highlightFeatures | Json? | String array for premium callouts (shown bold, amber checks) |
| stripeUrl | String? | Full Stripe payment link URL, null = "Message Us" CTA |
| sortOrder | Int | Display order within category |
| published | Boolean | Toggle visibility |
| createdAt | DateTime | |
| updatedAt | DateTime | |

No separate add-on table — add-ons are just a category called "Add-Ons" with packages that have `stripeUrl: null` (which renders "Message Us" instead of "Get Started").

## Seed Data

### Category: Attraction Editing (sortOrder: 1)
- icon: "FilmIcon", accentColour: "blue"
- description: "Stop spending 4-6 hours editing every video. Hand us the raw footage and get back a polished, publish-ready video."

**Packages:**

1. **2 Video Package** — $500/mo USD
   - Features: Professional editing by ABV team, Music and asset licensing, Graphics titles and b-roll, Upload to Frame.io for review, 2-3 revisions per video, Onboarding call to customise to your brand
   - stripeUrl: `https://buy.stripe.com/9B67sLcWv9ojf4RcLp0Ny0k`

2. **2 Video + Jared** — $800/mo USD, badge: "+ Jared's Feedback"
   - Features: same as above
   - highlightFeatures: Comprehensive review of shooting setup and delivery, Editing suggestions delivered in Frame.io, Ideas for future content improvements, 15-minute coaching call
   - stripeUrl: `https://buy.stripe.com/bJeeVd4pZdEzcWJbHl0Ny0l`

3. **4 Video Package** — $1,000/mo USD
   - Features: same as 2 Video but "4 long-form video edits per month"
   - stripeUrl: `https://buy.stripe.com/14AaEXe0zfMHaOB26L0Ny0m`

4. **4 Video + Jared** — $1,500/mo USD, badge: "+ Jared's Feedback"
   - Features: same as 4 Video
   - highlightFeatures: same as 2 Video + Jared
   - stripeUrl: `https://buy.stripe.com/28EfZh8Gf2ZVf4ReTx0Ny0n`

### Category: Attraction Mastery (sortOrder: 2)
- icon: "RocketLaunchIcon", accentColour: "amber"
- description: "The full system built with you. Everything in Editing plus strategy, funnels, coaching, and implementation — all under one monthly investment."

**Packages:**

1. **Mastery 2** — $2,495/mo USD, subtitle: "2 long-form video edits/mo"
   - highlightFeatures: 2 long-form video edits per month, 1 full funnel built at launch
   - Features: Foundational Membership Benefits included, 1 new funnel every 90 days, Custom thumbnails per video, GoHighLevel account (lead capture follow-up pipeline), Title & thumbnail review via Slack (1-1 with Jared), Priority Slack responses, Every video scored & reviewed, Strategy call with Jared (30 min) — 1/month
   - stripeUrl: `https://buy.stripe.com/aFa8wP7Cb9ojf4R5iX0Ny0q`

2. **Mastery 4** — $3,495/mo USD, subtitle: "4 long-form video edits/mo", badge: "Most Comprehensive"
   - highlightFeatures: 4 long-form video edits per month, 2 full funnels built at launch
   - Features: same as Mastery 2
   - stripeUrl: `https://buy.stripe.com/fZu7sLg8HcAvg8VbHl0Ny0r`

### Category: Ultimate Mastery (sortOrder: 3)
- icon: "SparklesIcon", accentColour: "purple"
- description: "You show up, film, and close deals. We do literally everything else."

**Packages:**

1. **Ultimate Mastery** — $4,999/mo USD, badge: "Full Service"
   - highlightFeatures: 4 long-form video edits per month, 2 full funnels built at launch, Ready-to-film scripts researched and written for you
   - Features: Everything in Mastery 4 included, Local market research — what's ranking and trending in your city, SEO-optimised descriptions and tags for every video, A/B thumbnail variants per video, Ongoing content calendar management and updates, Strategy session with Jared (60 min) — every 2 weeks, Quarterly 16-principle channel audit with written report, Priority everything — fastest turnaround and same-day responses, Community post and pinned comment strategy written and scheduled
   - stripeUrl: placeholder (Jared to create)

### Category: Add-Ons (sortOrder: 4)
- icon: "PuzzlePieceIcon", accentColour: "gray"
- description: "Available extras to complement your package."

**Packages:**

1. **Custom Thumbnails** — $100 – $150
   - subtitle: "$100 with Editing/Mastery, $150 standalone"
   - Features: Professional click-worthy thumbnails designed for your brand and audience
   - stripeUrl: null (renders "Message Us")

2. **Lead Magnet Creation** — ~$1,000 USD
   - Features: Buyer guides relocation guides market reports or any PDF built for your market, Includes writing design and delivery setup
   - stripeUrl: null

3. **Rush Funnel** — $950
   - subtitle: "Available to Mastery members only"
   - Features: Need a funnel faster than the 90-day cadence? We'll build it on a priority timeline
   - stripeUrl: null

## Member Page (`/member/hire`)

- Sidebar item: "Hire a Human" with UserGroupIcon, no feature flag
- Reads categories + packages from API, renders dynamically
- Hero section at top (hardcoded title/subtitle)
- Each category renders as a section with header + card grid
- Card styling varies by accentColour (blue for editing, amber for mastery, purple for ultimate, gray for add-ons)
- "Get Started" button opens stripeUrl in new tab
- Packages with no stripeUrl show "Message Us" CTA instead
- Badge renders as a pill on the card
- highlightFeatures render with bold text and accent-coloured check icons
- Regular features render with green check icons

## Admin Page (`/admin/hire`)

- Sidebar item: "Hire a Human" with UserGroupIcon in admin links
- Full CRUD for categories and packages
- **Category management:** create, edit name/description/icon/accentColour, reorder (drag or arrows), toggle published, delete (with confirmation if packages exist)
- **Package management:** create within a category, edit all fields, reorder within category, toggle published, delete
- Features edited as a simple textarea (one feature per line) — converted to/from JSON array
- Same UI patterns as Academy Manager (inline editing, modals for create/edit)

## API Routes

### Member
- `GET /api/member/hire/categories` — returns published categories with published packages, ordered by sortOrder

### Admin
- `GET /api/admin/hire/categories` — all categories (including unpublished) with packages
- `POST /api/admin/hire/categories` — create category
- `PUT /api/admin/hire/categories/[id]` — update category
- `DELETE /api/admin/hire/categories/[id]` — delete category (fails if has packages)
- `POST /api/admin/hire/packages` — create package
- `PUT /api/admin/hire/packages/[id]` — update package
- `DELETE /api/admin/hire/packages/[id]` — delete package
- `PUT /api/admin/hire/reorder` — reorder categories or packages

## Out of Scope

- Payment processing (Stripe hosted checkout)
- Tracking member purchases / subscription state
- Icon picker UI (admin types icon name as string for now)
