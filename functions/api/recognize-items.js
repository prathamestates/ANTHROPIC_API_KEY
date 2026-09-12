// Cloudflare Pages Function: the "photo recognition" backend for the
// booking wizard's "Take or upload a photo" mode.
//
// WHY THIS FILE EXISTS:
// The app is deployed on Cloudflare Pages (stockly-a96.pages.dev), but the
// old recognize-items function lived in netlify/functions/ and was called
// at /.netlify/functions/recognize-items — a path that 404s on Cloudflare,
// so photo recognition has been silently broken on the live site.
// Cloudflare Pages Functions serve files under functions/ at matching URL
// paths: this file is reachable at POST /api/recognize-items.
//
// The Anthropic API key stays server-side (context.env.ANTHROPIC_API_KEY —
// set it in Cloudflare Pages > Settings > Environment variables). It is
// never exposed to the browser. Do NOT prefix it with VITE_.
//
// CONTRACT (kept compatible with the existing client in App.jsx):
//   Request:  { image: "data:image/jpeg;base64,...." }
//             (also accepts { imageBase64, mediaType } if you prefer)
//   Response: { items: [{ product, brand, qty, unit, notes }], note }
//             unit is one of: "Cases","Boxes","Packs","Bottles","kg","L","Units"
//   Errors:   { error: "human-readable message" } with a 4xx/5xx status —
//             the client already surfaces these honestly.

const ALLOWED_UNITS = ["Cases", "Boxes", "Packs", "Bottles", "kg", "L", "Units"];

function sanitizeItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(it => it && typeof it.product === "string" && it.product.trim())
    .slice(0, 60) // a photo realistically holds a shelf's worth, not 500 lines
    .map(it => ({
      product: String(it.product).trim().slice(0, 140),
      brand: typeof it.brand === "string" ? it.brand.trim().slice(0, 80) : "",
      qty: Math.max(1, Math.min(999, Number(it.qty) || 1)),
      unit: ALLOWED_UNITS.includes(it.unit) ? it.unit : "Units",
      notes: typeof it.notes === "string" ? it.notes.trim().slice(0, 200) : "",
    }));
}

export async function onRequestPost(context) {
  const apiKey = context.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Photo recognition isn't configured yet — ANTHROPIC_API_KEY is missing from this project's environment variables." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // --- Parse + validate the request body -------------------------------
  let imageBase64, mediaType;
  try {
    const body = await context.request.json();
    if (typeof body.image === "string" && body.image.startsWith("data:")) {
      // data URL form: "data:image/jpeg;base64,/9j/4AAQ..."
      const match = body.image.match(/^data:([^;]+);base64,(.+)$/s);
      if (!match) throw new Error("bad data URL");
      mediaType = match[1];
      imageBase64 = match[2];
    } else if (typeof body.imageBase64 === "string") {
      imageBase64 = body.imageBase64;
      mediaType = typeof body.mediaType === "string" ? body.mediaType : "image/jpeg";
    } else {
      throw new Error("no image");
    }
  } catch {
    return new Response(
      JSON.stringify({ error: "No readable image was sent — try taking the photo again." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const safeMediaType = /^image\/(jpeg|png|gif|webp)$/.test(mediaType) ? mediaType : "image/jpeg";
  if (imageBase64.length > 8_000_000) {
    return new Response(
      JSON.stringify({ error: "That photo is too large — try a smaller or more cropped shot." }),
      { status: 413, headers: { "Content-Type": "application/json" } }
    );
  }

  // --- Call Claude (vision) --------------------------------------------
  const systemPrompt = `You read photos of stock/shopping items (shelves, handwritten lists, delivery notes, cash & carry tickets) for a B2B stock-ordering service used by shops, cafes, takeaways and salons.

Extract EVERY distinct product you can actually see or read in the image. For each: the product name, brand if visible, the most likely purchase quantity (default 1), the purchase unit (one of: "Cases","Boxes","Packs","Bottles","kg","L","Units"), and any visible variant notes (e.g. "diet", "2-ply", "1L").

Rules:
- Only include items you can genuinely identify in THIS image. Never invent products to fill gaps.
- If the image is unreadable, blurry, or contains no identifiable products, return an empty items array and explain in "note".
- Handwriting: transcribe as faithfully as possible; mark uncertain words in the item's "notes".

Respond with ONLY valid JSON (no markdown fences, no preamble) in this exact shape:
{"items": [{"product": string, "brand": string, "qty": number, "unit": one of "Cases","Boxes","Packs","Bottles","kg","L","Units", "notes": string}], "note": string}

"note" is one short honest sentence, e.g. "Read 8 items from the shelf photo" or "The photo was too blurry to read any labels".`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: safeMediaType, data: imageBase64 },
            },
            { type: "text", text: "Extract the stock items from this photo." },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return new Response(
        JSON.stringify({ error: "The photo couldn't be read right now — try again in a moment, or add the items by typing." }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const json = await response.json();
    const text = (json.content || []).map(b => b.text || "").join("\n");
    const clean = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.error("Couldn't parse vision output as JSON:", clean);
      return new Response(
        JSON.stringify({ error: "Couldn't read a clear item list from that photo — try a sharper, well-lit shot, or add items manually." }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const items = sanitizeItems(parsed.items);
    const note = typeof parsed.note === "string" ? parsed.note.slice(0, 300) : "";
    return new Response(JSON.stringify({ items, note }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("recognize-items function error:", err);
    return new Response(
      JSON.stringify({ error: "Something went wrong reading that photo — please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
