// Netlify Function: proxies the "read this photo of stock/products" request
// to Anthropic's API using a server-side API key. This exists because the
// browser can never safely hold an Anthropic API key — see PHASE-3-NOTES.md
// / the photo-recognition flag from Phase 3 for context.
//
// Requires the ANTHROPIC_API_KEY environment variable to be set in your
// Netlify site settings (Site configuration → Environment variables).
// This is NOT the same as the Supabase keys — it's a separate secret from
// https://console.anthropic.com/settings/keys. It must never be prefixed
// with VITE_ (that would ship it to the browser) — set it as plain
// ANTHROPIC_API_KEY, server-side only.

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Photo recognition isn't configured yet — ANTHROPIC_API_KEY is missing from this site's environment variables.",
      }),
    };
  }

  let base64Data, mediaType;
  try {
    const body = JSON.parse(event.body || "{}");
    base64Data = body.base64Data;
    mediaType = body.mediaType;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request body." }) };
  }

  if (!base64Data || !mediaType) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing photo data." }) };
  }

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
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
            {
              type: "text",
              text: "You are helping a shop owner build a stock order from a photo of products, a shelf, a handwritten list, or packaging. Identify each distinct product you can see. Respond with ONLY a JSON array (no markdown, no preamble), where each item is: {\"product\": string, \"brand\": string (can be empty), \"qty\": number (best guess, default 1), \"unit\": one of \"Cases\",\"Boxes\",\"Packs\",\"Bottles\",\"kg\",\"L\",\"Units\"}. If it's a handwritten or printed list, read the text and quantities directly instead of guessing from an image of goods.",
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return { statusCode: 502, body: JSON.stringify({ error: "The photo-recognition service couldn't process that image right now." }) };
    }

    const json = await response.json();
    const text = (json.content || []).map(b => b.text || "").join("\n");
    const clean = text.replace(/```json|```/g, "").trim();
    let items;
    try {
      items = JSON.parse(clean);
    } catch {
      console.error("Couldn't parse model output as JSON:", clean);
      return { statusCode: 502, body: JSON.stringify({ error: "Couldn't understand that photo — try a clearer shot or add items manually." }) };
    }

    return { statusCode: 200, body: JSON.stringify({ items }) };
  } catch (err) {
    console.error("recognize-items function error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Something went wrong reading that photo." }) };
  }
};
