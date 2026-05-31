---
name: Script Builder binge-title quote false positives
description: Why the binge_target_match "wrong quoted title" check must anchor on an explicit next-video cue, not any quote near a next-video phrase.
---

# Binge-title quote matching must be next-video-anchored

When validating that a generated script doesn't tease a *different* next-video
title than the configured binge target, only flag a quoted phrase that DIRECTLY
follows an explicit next-video cue (`next video` / `next one` / `video
titled|called|named`).

**Why:** ARC scripts use double quotes constantly for viewer-thought dialogue
and emphasis (e.g. `they think "okay, the zone matters more than the city"`) and
say things like `a strategy called "X"` in normal speech. The first/broad
version of the check (any double-quoted span on a line containing a next-video
phrase, and bare `called|titled|named` cues) false-positived on real saved
scripts — a viewer-thought quote happened to share a line with a next-video
phrase, and got flagged as a fabricated title, which would block a legitimate
save / burn a re-prompt.

**How to apply:** Keep the cue regex next-video-anchored. Untitled teases are
allowed ("if any" — we can't reliably detect an unquoted wrong topic). The
no-target (null) case is the strict one: there, ANY next-video reference is a
fabrication. Validate the change by re-running the check against existing saved
scripts in the DB and confirming zero violations on plans that DO have a usable
binge target.
