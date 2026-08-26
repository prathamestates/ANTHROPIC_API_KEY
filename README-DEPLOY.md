# Stockly — deploy to Netlify

This is your full project, up to date through Phase 6 (Single Runs, Recurring
Runs, Business Profile, Navigation, My Runs, Buy Again, Saved Lists, and
Barcode Scanning — all wired to your real Supabase project). See
PHASE-3-NOTES.md, PHASE-4-5-NOTES.md, and PHASE-6-NOTES.md for the detailed
history of what changed and why.

## How to deploy this

Since your site is already connected to Netlify (deployed, per our earlier
conversation), the normal path is:

1. Copy these files into your existing project repo, overwriting what's
   there (or unzip over the top of your local clone).
2. Commit and push. Netlify will pick up the push and rebuild automatically
   (your `netlify.toml` already has `command = "npm run build"` /
   `publish = "dist"`).
3. If you don't use git and instead drag-and-drop deploys to Netlify: this
   zip is the **source** project, not a built site — Netlify's drag-and-drop
   expects an already-built `dist/` folder. In that case, run `npm install`
   then `npm run build` locally first, and drag the resulting `dist/`
   folder in. (I can't run `npm install` from my side — my environment
   doesn't have access to the npm registry — so I haven't produced a built
   `dist/` folder for you.)

## Environment variables required in Netlify

Site configuration → Environment variables:

| Variable | Required for | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Everything (auth, runs, profile) | You said this is already set. |
| `VITE_SUPABASE_ANON_KEY` | Everything | Already set — this is the public anon key, safe to ship to the browser; your RLS policies in `supabase/schema.sql` do the real access control. |
| `ANTHROPIC_API_KEY` | Photo product recognition only | **New — not set yet.** Get it from console.anthropic.com. Do **not** prefix with `VITE_`, or it would ship to the browser and defeat the purpose — this one is read server-side only, inside `netlify/functions/recognize-items.js`. |

Everything else (barcode lookup via Open Food Facts) needs no credentials.

## Database

No new schema changes since you last ran `supabase/schema.sql` — everything
built in Phases 3–6 uses tables/columns that were already in it.

## Quick smoke test after deploying
1. Sign up / log in, submit a Single Run, confirm it shows up in My Runs after a refresh.
2. Open the hamburger menu — check every item loads.
3. Try Buy Again and Saved Lists after you have at least one run.
4. Try the barcode scanner (Chrome/Android or desktop) and the photo upload — once `ANTHROPIC_API_KEY` is set, photo recognition should return real results instead of an error.

## What's still mock / not built yet (unchanged from before)
- Admin/Shopper/Driver dashboards — still local/mock data, disconnected from real customer runs (Phase 11).
- Admin passcode hardcoded client-side — real fix needs Phase 11's role-based rework.
- No automatic recurring-run execution (scheduler/cron) yet.
- Live barcode scanning doesn't work on Safari/iPhone (native browser API isn't supported there) — manual entry works everywhere.
- Receipts are printable HTML, not true PDF invoices, yet.
- First-run discount and referral credit automation aren't built yet (Stage 9).
