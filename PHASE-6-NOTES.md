# Stockly — Phase 6 notes (Barcode scanning)

## What changed
- Added a third "Scan barcode" mode to the products step of the booking wizard, alongside "Type it out" and "Take a photo".
- Live camera scanning uses the browser's native `BarcodeDetector` API (`src/App.jsx` — `LiveBarcodeScanner`). No new npm dependency was added for this, to keep this phase low-risk.
- A manual barcode-number entry field is always available as a fallback (and is the only option where live scanning isn't supported — see below).
- Barcode lookups use **Open Food Facts** (`src/lib/barcode.js`) — a free, public, keyless product database. No credentials needed; nothing to add on your end for this specific feature.
- Every scan/lookup result goes through a "Is this the product you want?" confirmation card — product name, brand, category, pack size, and barcode are all shown and editable, with quantity, before anything is added to the order. Nothing is auto-added.
- If a barcode isn't found in Open Food Facts, the customer is told plainly and can fill the details in manually — same confirm step either way.

## Files changed
- `src/App.jsx` — item-mode tabs, `LiveBarcodeScanner` component, barcode confirm flow in `Booking`.
- `src/lib/barcode.js` (new) — the lookup function.

## No credentials needed for this phase
Open Food Facts doesn't require an API key.

## Important honesty flag: browser support
- `BarcodeDetector` is supported in **Chrome/Edge on Android and desktop**.
- It is **not supported in Safari (including iPhone)** as of now. On unsupported browsers, the app shows a clear message and the manual barcode-number entry field — it does not pretend to scan.
- Given a lot of your customers will likely be on iPhones, this is a real gap if live camera scanning specifically on iPhone matters to you. Closing it properly means bundling a JS-based decoding library (e.g. ZXing) that works across all browsers — a small, well-understood addition, but a new dependency I haven't added yet since I couldn't verify the build in my current environment (no live npm registry access here). Happy to add it next if iPhone scanning is a priority — flagging now rather than after you've tested and found it doesn't work on an iPhone.
- Coverage note: Open Food Facts is strongest for food & drink; non-food items (cleaning supplies, napkins, etc.) may come back "not found" more often — that's expected, not a bug, and the manual-entry path handles it.

## What to test
1. On Chrome (Android or desktop with a webcam), open the booking wizard → Products step → Scan barcode → Open camera scanner → point at a real barcode. Confirm it detects and shows a product card.
2. Try a barcode Open Food Facts won't have (e.g. a UK cleaning product) — confirm you get the honest "couldn't find" message with manual entry, not a fabricated result.
3. On the confirm card, edit a field, change quantity, then Confirm & add — check it lands correctly in your item list.
4. Click Cancel on a confirm card — verify nothing was added.
5. Try this same flow on an iPhone in Safari — confirm you get the "not supported, type it instead" message rather than a broken camera view.
6. Submit a run with a barcode-scanned item and check `run_items.barcode`/`category` are populated in Supabase.

## Still outstanding from your original Stage 6 spec
- Barcode/photo product-adding for **Recurring Runs** creation still uses manual entry only — scanning was wired into the Single Run wizard first since that's the primary "walking around a shop" flow. Can extend to the Recurring Runs form next if useful.
- Cross-browser (Safari/iPhone) live scanning — see flag above.
