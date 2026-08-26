# Stockly — Phase 3 notes (Single Runs + Recurring Runs + Business Profile → real Supabase persistence)

## What changed
- Added `src/lib/stocklyData.js`: all reads/writes for single runs, recurring runs, and profile updates now go through Supabase (`single_runs`, `recurring_runs`, `run_items`, `profiles`), respecting your existing RLS policies.
- `Booking` (the single-run wizard) now inserts a real row into `single_runs` + `run_items` on submit, instead of only updating in-memory/localStorage state.
- "Repeat Order" on the dashboard now actually carries the previous run's items into the booking form (it previously claimed to but didn't).
- `CustomerDashboard` fetches the logged-in customer's real single runs and recurring runs from Supabase on load, instead of showing shared mock/demo data.
- `AccountTab` is now a real Business Profile editor, saving directly to `profiles` (business name, type, contact person, delivery/billing address, VAT, delivery instructions, notes) — plus a Login Word display with a "Change" button.
- Recurring Runs tab: pause/resume now writes to `recurring_runs.active`; added a real "Create recurring run" form (name, frequency, day of week, cash & carry, products) that inserts into `recurring_runs` + `run_items`.
- Substitution approve/reject now writes back to `single_runs.substitution` instead of only updating local state.

## Files changed
- `src/App.jsx`
- `src/lib/stocklyData.js` (new)

## Database
No schema changes — your existing `supabase/schema.sql` already had everything this phase needed.

## What's now functional
- A logged-in customer's single runs and recurring runs persist for real: survive refresh, logout/login, new device.
- Business profile edits persist to `profiles`.

## What still needs your input / setup
- **Admin/Shopper/Driver dashboards are still mock/local data**, disconnected from what customers actually submit — that's Phase 11 in your priority order. The admin passcode is also hardcoded client-side (`ADMIN_PASSCODE` in `App.jsx`) and visible in the shipped JS bundle; real fix is moving admin auth onto `profiles.is_admin` + Supabase RLS in that phase.
- **Photo product recognition calls `api.anthropic.com` directly from the browser with no API key** — this only works inside a Claude.ai artifact sandbox, not on your live Netlify deploy. It needs a small serverless function (e.g. a Netlify Function) that holds a real Anthropic API key server-side and proxies the request. I haven't touched this yet — flagging per your Stage 19 rule rather than leaving it silently broken.
- Referral credit tracking (percentage off next bill) isn't automated — flagged honestly in the UI now instead of faking a number.
- Login Word is currently just a profile field you can view/change in Settings — the full "new device → enter Login Word → verification code" alternate-login flow isn't built yet. That needs either Supabase's built-in email OTP (works out of the box) or an SMS OTP provider like Twilio if you want phone verification too.

## What to test
1. Sign up / log in, submit a single run from the booking wizard, confirm it appears in "My Runs" and "Receipts" after a refresh.
2. Use "Repeat Order" and confirm the items are actually pre-filled in the new booking form.
3. Create a recurring run, pause/resume it, refresh and confirm it persists.
4. Edit your Business Profile, refresh, confirm the values persisted.
5. Log in on a second browser/device and confirm the same data shows up.

## Known issues / risk areas
- Orders created before this phase (if any live customer data exists) live only in the old localStorage layer and won't appear in the new Supabase-backed views — there's no migration path for that pre-existing local data since it was never centrally accessible.
