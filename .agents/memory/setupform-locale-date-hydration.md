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
`useEffect(()=>setMounted(true),[])`, then compute the label via the exported
`localeDateLabel(mounted, iso)` helper (returns `null` until `mounted`) inside a
`useMemo`, and render `label ?? "—"`. When adding ANY new date/locale text to
this component, route it through `localeDateLabel` — never call
`toLocaleString()` inline in JSX.

**Regression test:** `SetupForm.hydration.test.tsx` SSR-renders the form (with a
voice-guide date AND an avatar snapshot date) via `renderToStaticMarkup` wrapped
in an `AppRouterContext.Provider` stub, and asserts the pre-mount markup contains
NONE of the locale variants of either instant and uses the `—` placeholder. This
is the real guard — it fails if any future date is rendered inline without the
mount gate (proven by temporarily inlining a date). Run:
`npx tsx --test src/components/market-data/SetupForm.hydration.test.tsx`.
