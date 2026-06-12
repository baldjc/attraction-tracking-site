---
name: Content wizard retirement scope
description: The idea wizard and the Script Builder v2 share a /wizard path prefix but have opposite lifecycles; how the browse front door routes into Jarvis.
---

# Content wizard retirement scope

`/member/content-planner/wizard` (the standalone Content Engine **idea** wizard, `?step=N`) is RETIRED — its `page.tsx` is now a pure `redirect()` into the Jarvis browse-ideas chooser. BUT `/member/content-planner/wizard/script?planId=` is a SEPARATE, LIVE route segment (the **Script Builder v2**, its own `page.tsx`, launched from the planner editor — ContentPlanEditModal & ContentEditorClient). They share the `/wizard` prefix but have opposite lifecycles.

**Why:** a blanket `/wizard*` redirect/delete (or middleware matcher) would silently break the live Script Builder. The redirect is correctly placed in `wizard/page.tsx`, which only matches the exact `/wizard` path; the `/script` child segment is untouched.

**How to apply:** never treat `/member/content-planner/wizard*` as one unit. Retire/redirect only the bare `/wizard` route; keep `/wizard/script`. Physical deletion of the orphaned idea-wizard component/API files was deliberately deferred (shared pieces like ScriptFactGate are also used by `/wizard/script`), so purge carefully if/when done.

## Browse-ideas front door = two entry mechanisms

The Jarvis "Browse all content ideas" chooser opens via EITHER:
- **client buttons**: the tested `writeJarvisBrowseSeed(memberId)` sessionStorage seed + `router.push('/member/jarvis?thread=new')` (member-scoped, one-shot). Currently the live buttons use the URL-param form instead, so this seed path sits intact-but-unused.
- **server-side entries** (the wizard redirect, the briefing "Browse all leads" href, and the live buttons): the URL param `/member/jarvis?thread=new&browse=1`. Server code can't write sessionStorage, so the param is the only option there. JarvisChat opens the chooser once on a genuinely empty thread (`!threadId && initialMessages.length===0`), then strips the param via `router.replace` so a reload doesn't re-open it.

**Gotcha:** the browse CTAs still gate on `tool_content_engine_v2` (dashboard also on `totalLeads>0`), NOT `tool_jarvis`. If those flag populations ever diverge, a member could see a CTA and get bounced by the Jarvis `tool_jarvis` gate (graceful redirect to dashboard, not a 404). Couple the flags or re-gate on `tool_jarvis` if that combo ships.
