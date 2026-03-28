# Hire a Human — Intro Section Update

## What This Does

Replace the short one-liner intro on the Hire a Human page (`/member/hire`) with a more compelling intro paragraph that gives members context on why this exists and what's in it for them.

**File:** `src/app/member/hire/page.tsx`

---

## Change

Find the current intro text inside the Hero section (around line 334):

```
You film, we handle the rest. Add editing, coaching, or full implementation support based on how fast you want to grow.
```

Replace it with:

```
You didn't get to where you are only to spend your weekends and evenings editing videos.

The biggest thing holding most agents back from consistent content isn't strategy — it's everything that comes after you hit record. The editing, the thumbnails, the SEO, the publishing. That's where the procrastination creeps in, and that's where your content calendar dies.

The most successful agents we work with figured out the same thing: you don't need to do it all yourself — you need the right people doing the things they're better at than you are.

That's what Hire a Human is. You keep doing what only you can do — showing up on camera with your expertise and your personality. We handle everything else.
```

## Styling Notes

- The first line ("You didn't get to where you are...") should be slightly larger or bolder than the rest — it's the hook. Consider making it a `text-base font-semibold` or `text-lg font-medium` while keeping the remaining paragraphs at the current `text-sm` muted style.
- The bold sentence ("you don't need to do it all yourself...") should use `<strong>` or `font-semibold` to stand out.
- Keep the `max-w-2xl` constraint so it doesn't stretch too wide on desktop.
- Add appropriate paragraph spacing between the 4 paragraphs (e.g., `space-y-3` or margin between `<p>` tags).
- Dark mode support should match existing patterns on the page.

## What NOT to Change

- The icon + "Hire a Human" heading — stays as-is
- The info banner ("All packages are added to your existing Foundations membership") — stays as-is
- Everything below the intro (categories, package cards, etc.) — untouched
