# Hire a Human — Design Spec

**Date:** 2026-03-27
**Status:** Draft

## Overview

A new member-facing page in the Attraction Tracking Site where Foundations members can browse and purchase editing, coaching, and full implementation services. The page links directly to Stripe payment links for self-serve checkout. Styled as clean category cards — consistent with the existing platform UI.

## Page Location

- **Route:** `/member/hire`
- **Sidebar item:** "Hire a Human" — visible to all members (no feature flag)
- **Sidebar position:** Below Generate Leads, above Settings
- **Icon:** `UserGroupIcon` from Heroicons

## Page Structure

Single scrolling page with four sections. No tabs needed.

### Section 1 — Hero Intro

Short header block matching existing page patterns (like Academy or Generate Leads).

- **Title:** "Hire a Human"
- **Subtitle:** "You film, we handle the rest. Add editing, coaching, or full implementation support based on how fast you want to grow."

### Section 2 — Editing Packages

Header: "Attraction Editing" with a film/editing icon and short description: "Stop spending 4-6 hours editing every video. Hand us the raw footage and get back a polished, publish-ready video."

**4 cards in a 2x2 responsive grid** (stacks to 1 column on mobile):

#### Card 1: 2 Video Package
- **Price:** $500/mo USD
- **Includes:**
  - 2 long-form video edits per month
  - Professional editing by ABV team
  - Music and asset licensing
  - Graphics, titles, and b-roll
  - Upload to Frame.io for review
  - 2-3 revisions per video
  - Onboarding call to customise to your brand
- **CTA:** "Get Started" → `https://buy.stripe.com/9B67sLcWv9ojf4RcLp0Ny0k` (opens new tab)

#### Card 2: 2 Video + Jared
- **Price:** $800/mo USD
- **Badge:** "Includes Jared's Feedback" (accent badge)
- **Includes:** Everything in 2 Video Package, plus:
  - Comprehensive review of shooting, setup, and on-camera delivery
  - Editing suggestions delivered directly in Frame.io
  - Ideas for future content improvements
  - 15-minute coaching call
- **CTA:** "Get Started" → `https://buy.stripe.com/bJeeVd4pZdEzcWJbHl0Ny0l` (opens new tab)

#### Card 3: 4 Video Package
- **Price:** $1,000/mo USD
- **Includes:** Same as 2 Video Package but 4 long-form video edits per month
- **CTA:** "Get Started" → `https://buy.stripe.com/14AaEXe0zfMHaOB26L0Ny0m` (opens new tab)

#### Card 4: 4 Video + Jared
- **Price:** $1,600/mo USD
- **Badge:** "Includes Jared's Feedback" (accent badge)
- **Includes:** Same as 4 Video Package plus Jared's feedback package (same items as 2 Video + Jared)
- **CTA:** "Get Started" → `https://buy.stripe.com/28EfZh8Gf2ZVf4ReTx0Ny0n` (opens new tab)

### Section 3 — Mastery Packages

Header: "Attraction Mastery" with a rocket/star icon and short description: "The full system built with you. Everything in Editing plus strategy, funnels, coaching, and implementation — all under one monthly investment."

**2 cards side by side** (stacks on mobile). Premium accent colour (gold/amber or distinct from editing cards) to signal top tier.

Each card has a note at the top: "Includes everything in Editing, plus:"

#### Card 1: Mastery 2
- **Price:** $1,995/mo USD
- **Includes:**
  - Foundational Membership Benefits — Included
  - 2 long-form video edits per month
  - 1 full funnel built at launch (lead magnet provided by client)
  - 1 new funnel every 90 days
  - Custom thumbnails per video
  - GoHighLevel account (lead capture, follow-up, pipeline management)
  - Title & thumbnail review via Slack (1-1 with Jared)
  - Priority Slack responses
  - Every video scored & reviewed
  - Strategy call with Jared (30 min) — 1/month
- **CTA:** "Get Started" → `https://buy.stripe.com/aFa8wP7Cb9ojf4R5iX0Ny0q` (opens new tab)

#### Card 2: Mastery 4
- **Price:** $2,995/mo USD
- **Badge:** "Most Comprehensive" or similar
- **Includes:** Same as Mastery 2 but:
  - 4 long-form video edits per month
  - 2 full funnels built at launch
  - Everything else the same
- **CTA:** "Get Started" → `https://buy.stripe.com/fZu7sLg8HcAvg8VbHl0Ny0r` (opens new tab)

### Section 4 — Add-Ons

Header: "Add-Ons" with a small description: "Available extras to complement your package."

**3 small cards in a row** (or simple list-style items):

#### Custom Thumbnails
- $100/thumbnail (with an Editing or Mastery package)
- $150/thumbnail (standalone, without Editing)
- **CTA:** "Message Us" (link to Slack or email)

#### Lead Magnet Creation
- ~$1,000 USD per lead magnet
- Buyer guides, relocation guides, market reports, or any PDF built for your market
- **CTA:** "Message Us"

#### Rush Funnel
- $950 per extra funnel (faster than 90-day cadence)
- Available to Mastery members only
- **CTA:** "Message Us"

## Card Design

Each card follows the existing platform design language:
- White background, subtle border (`border-[#eaeaea]`), rounded corners
- Dark mode support (`dark:bg-[#1a2433]`, `dark:border-white/10`)
- Price displayed prominently (large font, bold)
- Bullet points with checkmark icons (green `CheckCircleIcon` or similar)
- "Get Started" button uses the primary CTA style (`bg-[#6ba3c7]` hover state)
- "Includes Jared's Feedback" badge uses a warm accent (amber/orange pill)
- Mastery cards use a distinct accent border or header colour to differentiate from Editing

## Technical Implementation

### No database needed

All content is hardcoded in the component. Stripe links are static URLs. No API routes, no Prisma models. This is a pure frontend page.

### Files to create/modify

1. **New page:** `src/app/member/hire/page.tsx` — the full page component
2. **Sidebar update:** `src/components/Sidebar.tsx` — add "Hire a Human" to `memberLinks`

### No feature flag

Visible to all members. Foundations is the entry point for everyone, so all members should see upgrade options.

## Out of Scope

- Payment processing (handled entirely by Stripe hosted checkout)
- Tracking which members have purchased which tier (could be added later via Stripe webhooks)
- Admin management of packages/pricing (hardcoded for now, easy to change)
- "Currently subscribed" state detection
