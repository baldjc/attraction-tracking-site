---
name: Avatar Stressor vs Theme vocabulary
description: Locked member-facing naming split that does NOT match the DB column names
---
The member-facing vocabulary is deliberately split and must stay this way:

- **"Avatar Stressor"** = one of the **8 canonical stress questions** (`src/lib/canonical-themes.ts`, `CANONICAL_THEMES[8]`, each `{id,name,emoji,colour,coreStress,enforceBuySideTitles?}`). This is the psychology concept the script body acknowledges.
- **"Theme"** = the **5-slot video rotation** only (`rotationSlot`: Market Update · Neighbourhood Fact · Contrarian Take · Do Not · Should You), via `ROTATION_SLOT_LABELS`.

**Why:** the internal field names are intentionally left misleading — the `ContentPlan.theme` / `content_theme` column actually stores an **Avatar Stressor name**, and `User.contentThemes` (JSON) holds the member's chosen Avatar Stressors. Only USER-FACING copy was renamed; identifiers/columns/`rotationSlot` stay. So grepping the code makes "theme" look like the rotation when in the column it means a Stressor.

**How to apply:**
- Never relabel the 8 as "themes" in any member-facing JSX; never call the 5-slot rotation anything but "Theme".
- `getActiveThemeStress(contentThemes, theme)` resolves a Stressor's `coreStress` from the member's chosen list; returns `null` if that Stressor isn't built (members commonly build only a subset — Chris had 2 of 8). Null is correct, not a bug.
- `enforceBuySideTitles` defaults ON only for "The Equity" (canonical). Route default (`content-plans/themes` member + admin twin) must present the full 8, not 4.
- Avatar Architect remap must map every legacy entry to a `CANONICAL_THEMES.name` before clearing the migration banner; the banner predicate must also flag string entries and non-canonical `canonicalName` values.
