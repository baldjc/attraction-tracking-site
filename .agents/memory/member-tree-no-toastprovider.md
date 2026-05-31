---
name: Member tree has no ToastProvider
description: useToast() throws in /member components because only the admin layout mounts ToastProvider
---

Only the admin layout subtree mounts a `ToastProvider`. The root layout and the
member layout shell do NOT, so calling `useToast()` from any `/member` client
component throws ("must be used within a ToastProvider").

**Why:** Toasts were introduced for admin flows first; the member layout was
never given a provider ancestor.

**How to apply:** When a member-side component needs a toast, either mount a
`ToastProvider` locally around just that subtree (split the component so the
provider wraps an inner component that calls `useToast()`), or add the provider
to the member layout shell if you want it available tree-wide. Local wrapping is
the lower-risk, contained choice; `ToastProvider` renders its own fixed toast
container so it doesn't disturb surrounding layout.
