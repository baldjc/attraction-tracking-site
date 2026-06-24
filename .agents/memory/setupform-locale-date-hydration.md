---
name: SetupForm locale-date hydration crash
description: Locale/timezone-sensitive date text rendered during SSR in client components crashes the market-data setup page on hydration.
---

Any `new Date(x).toLocaleString()` (or other locale/timezone-sensitive formatting)
rendered directly in JSX of a client component will differ between the server
(container locale/TZ) and the browser, producing a "server rendered text didn't
match the client" hydration error that takes down `/member/market-data/setup`.

**Why:** This exact crash class has hit `SetupForm.tsx` twice — first the
voice-guide "Last uploaded" date, then the primary-avatar snapshot date. Each
locale date is an independent landmine; fixing one does not protect the others.

**How to apply:** Gate every locale-sensitive label behind the existing
post-mount pattern: a `const [mounted,setMounted]=useState(false)` +
`useEffect(()=>setMounted(true),[])`, then compute the label in a `useMemo` that
returns `null` until `mounted`, and render `label ?? "—"`. When adding ANY new
date/locale text to this component, wire it through this pattern — never call
`toLocaleString()` inline in JSX.
