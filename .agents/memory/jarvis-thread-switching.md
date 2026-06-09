---
name: Jarvis conversation thread switching
description: How the Content Manager (Jarvis) chat starts fresh conversations and switches threads without stale client state.
---

# Jarvis thread switching & "new conversation"

The member Jarvis chat (`/member/jarvis`) rebuilds the model context **per-thread**
from DB on every `POST /api/jarvis` turn, so a thread with `threadId=null` (no rows
yet) already yields a clean context — the app just needs to *start* one. There is no
context-window trimming to worry about; thread = context boundary.

## The two-navigation gotcha
`page.tsx` defaults to rehydrating the **most-recent** thread (orderBy updatedAt desc)
on a bare `/member/jarvis` URL. This makes "new conversation" tricky:

- **Bare URL reloads the latest thread**, so navigating "new conversation" to
  `/member/jarvis` would reopen the latest thread, not an empty one. Use the explicit
  sentinel `?thread=new` → `page.tsx` treats it as no-thread / empty context and never
  falls back to a past thread.
- **Client state does not re-sync on query-param navigation.** `JarvisChat` initializes
  `threadId/messages/threads` via `useState(props)`. App Router soft-navigation
  (`router.push('?thread=X')`) re-renders the server component with new props but does
  NOT reset those `useState`s. Fix: `page.tsx` passes `key={activeKey}` (the active
  thread id, or `"new"`, or `"empty"`) so the component **remounts** on thread switch
  and picks up the selected thread's `initialMessages`.

**Why:** without the key, history-switching shows/sends on the previous thread; without
the sentinel, "new conversation" silently reopens the latest thread.

## Resolver rules in page.tsx
`?thread=new` → empty. Owned `?thread=<id>` → that thread. Unknown/unowned `?thread=`
→ fall back to latest (don't leave it blank). No param → latest.

## Per-month scoping (light, never forced)
`ContentManagerThread.dataMonth` is stamped at thread **creation** in both
`/api/jarvis` and `/api/jarvis/research` from `loadLatestValidatedUpload(userId).monthYear`.
The chat shows a dismissible banner offering (never forcing) a fresh thread when the
active thread's `dataMonth` differs from the current latest validated upload's month.
Past threads are never deleted.
