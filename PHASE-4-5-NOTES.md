# Stockly — Phase 4/5 notes (Navigation, My Runs, Buy Again, Saved Lists) + photo-recognition backend fix

## 1. Photo-recognition backend fix
- Added `netlify/functions/recognize-items.js`: a serverless function that holds a real Anthropic API key **server-side** and does the vision call. The browser now calls `/.netlify/functions/recognize-items` instead of `api.anthropic.com` directly.
- `netlify.toml` now points at `netlify/functions` as the functions directory.
- **Action needed from you:** add an environment variable `ANTHROPIC_API_KEY` in Netlify (Site configuration → Environment variables). This is a separate secret from your Supabase keys — get it from console.anthropic.com. Do **not** prefix it with `VITE_`, or it would ship to the browser and defeat the point.
- Until that variable is set, the photo-upload feature will show a clear error ("Photo recognition isn't configured yet…") instead of silently failing or faking a result.

## 2. Navigation (Stage 3)
- Replaced the horizontal tab strip with a proper hamburger menu (three-line icon, top-left of the dashboard), matching your requested structure:
  Dashboard · New Single Run · Recurring Runs · My Runs · Buy Again · Saved Lists · Documents · Business Profile · Settings · Help · Log Out
- Analytics and Referrals (both already built) are kept, but tucked into a secondary "More" section below the main list so the primary menu doesn't overcrowd.
- "New Single Run" jumps straight to the booking wizard; everything else switches the dashboard tab.

## 3. My Runs (Stage 11)
- New tab with a Single Runs / Recurring Runs sub-toggle.
- Single run cards now expand on click to show full detail: supplier total, service fee, total, shopper/driver, notes — previously this info only lived in the separate Receipts tab.
- Recurring Runs sub-view shows the standing schedules. I added an honest note here: **automatic creation of a new single run each time a recurring run is due isn't built yet** — there's no scheduler/cron running. Building that properly needs either a Supabase Edge Function on a schedule or an external cron service; flagging rather than faking it.

## 4. Buy Again (Stage 7)
- New tab. Product history is derived from your existing single-run data (no new table) — aggregates by product+brand, shows how many times each was ordered.
- "Add all to Single Run", "Add N selected", and per-product "Add to Single Run" — all route into the booking wizard pre-filled via the same mechanism as Repeat Order.

## 5. Saved Lists (Stage 8)
- New tab, fully wired to the `saved_lists` table (already existed in your schema, was unused). Create a named list of products, delete it, or "Order this list" — which pre-fills a new Single Run. Lists are not automatically recurring, per your spec.

## 6. Settings (new) + Business Profile (renamed from Account)
- Login Word display/regenerate moved out of Business Profile into its own Settings tab.
- Added substitution preference controls (Stage 12) — Always ask / Similar OK / Never / Don't exceed £X — wired to `profiles.substitution_preference` and `substitution_max_extra`, columns that already existed in your schema but had no UI.
- Business Profile tab keeps all the fields from Phase 3 (name, type, contact, addresses, VAT, delivery instructions, notes).

## 7. Documents (renamed from Receipts)
- Same functionality as before (download/email/print), renamed to match Stage 3/14 naming. Added an honest note that downloads are currently a printable HTML file, not a true PDF invoice — real PDF generation is a future enhancement.

## 8. Help (new)
- Simple static FAQ + contact tab.

## Bug fix carried over
- "Repeat Order" now genuinely pre-fills the booking form with the previous run's items (previously it navigated to the booking form with nothing loaded, despite a message claiming otherwise).

## Files changed
- `src/App.jsx` (nav, My Runs, Buy Again, Saved Lists, Settings, Help, photo-recognition client call)
- `src/lib/stocklyData.js` (added saved-lists CRUD + product-history aggregation)
- `netlify/functions/recognize-items.js` (new)
- `netlify.toml`

## Database
No schema changes — `saved_lists`, `profiles.substitution_preference`, and `profiles.substitution_max_extra` already existed and were simply unused until now.

## What to test
1. Set `ANTHROPIC_API_KEY` in Netlify, redeploy, then try "Take or upload a photo" in the booking wizard — confirm it now returns real recognized items instead of failing.
2. Open the hamburger menu on mobile and desktop widths — confirm all items are reachable and the active tab highlights correctly.
3. Complete a run, then go to My Runs → Single Runs, click a card to expand/collapse detail.
4. Go to Buy Again after you have at least one completed run with items — confirm products and counts show up, and "Add to Single Run" pre-fills the booking form.
5. Create a Saved List, then "Order this list" — confirm the booking form is pre-filled.
6. In Settings, change your substitution preference and refresh — confirm it persisted. Also try "Change" on the Login Word.
7. Use "Repeat Order" from My Runs and confirm the booking form now actually has the previous items in it.

## Known gaps still flagged, not fixed
- Admin/Shopper/Driver dashboards: still mock/local data (Phase 11).
- Admin passcode still hardcoded client-side (Phase 11/16).
- No automated recurring-run execution/scheduler (needs a cron or Supabase Edge Function on a schedule — happy to scope this whenever you want it).
- Barcode scanning (Stage 6) not started yet.
- PDF invoices (Stage 14) — currently HTML receipts only.
