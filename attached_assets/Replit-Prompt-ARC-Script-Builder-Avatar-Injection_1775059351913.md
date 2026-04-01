# Replit Prompt — ARC Script Builder: Full Avatar Data Injection

## IMPORTANT: Do NOT change the model string. It must remain exactly as-is.

## What to change

The ARC Script Builder currently only pulls three shallow fields from the database when building avatar context: `avatarName`, `avatarSummary`, and `contentThemes`. This gives the AI a surface-level understanding of the member's ideal client, which makes scripts feel generic.

Update the ARC Script Builder to pull and inject the FULL avatar data into the AI prompt context:

### 1. Update the database query

Wherever the Script Builder fetches avatar data for the current member, update the query to also fetch:
- `avatarProfile` (the full JSON document from the Avatar Architect)
- `creatorCredentials`

### 2. Update the avatar context builder function

Update the function that builds the avatar context string for the AI prompt to inject the full `avatarProfile` JSON document. This should include ALL of the following fields from the avatar profile:

- Anxiety phases and emotional triggers
- Internal monologue examples
- Fears and objections
- Life stage details
- Income profile
- Detailed content theme breakdowns (not just the theme names — the full descriptions and angles)
- Any other fields present in the avatarProfile JSON

### 3. Keep backward compatibility

If a member hasn't built an avatar yet (avatarProfile is null/empty), the Script Builder should still work using whatever shallow fields are available — don't break the existing flow for members who haven't completed the Avatar Architect yet.

## Why this matters

The AI needs to know the avatar's actual emotional language, fears, and internal monologue to write scripts that feel personally calibrated. Without the full profile, the script sounds generic even if it's technically correct. This change unlocks the quality of every other script-building step.
