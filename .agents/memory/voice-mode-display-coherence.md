---
name: Voice-mode display/selection coherence
description: The Jarvis voice chip + Default/My-voice selector must agree with the Script Builder's actual override gate, or members see a "custom" voice that never applies.
---

# Voice-mode display/selection coherence

The member's active voice is a `MarketConfig.voiceMode` flag: `"custom"`/null →
apply the uploaded `voiceGuide`; `"default"` → keep the guide on file but write in
the built-in register. Three surfaces must stay in lockstep:

1. Script Builder gate — pushes the voice override only when
   `voiceMode !== "default"` **AND** `voiceGuide.trim().length >= 500`.
2. Jarvis page (server-rendered initial chip/selector state).
3. JarvisChat live state + ContextPanel selector.

**Rule:** "has a custom voice" for *display/selection* must use the SAME
`>= 500` substantive-guide threshold the generation gate uses — not just
`!!voiceGuide`. A shorter "guide" produces no override, so treating it as custom
makes the chip show "My voice" / the selector mark custom-active while the actual
script keeps using the default register.

**Why:** the architect caught that `hasCustomGuide = !!voiceGuide` (any length)
combined with `voiceMode=null→"custom"` left the selector in an invalid state
(neither option active) and let the chip claim a custom voice that the Script
Builder silently ignored.

**How to apply:** when computing the initial mode, normalize to `"default"`
whenever there's no substantive guide (`customVoiceActive ? "custom" : "default"`),
and disable the "My voice" selector option until a guide is on file. The
`voice-guide/upload` PATCH route reports `hasCustomGuide` using the same `>= 500`
check — reuse that, don't reinvent a looser test.
