// Cloudflare Pages Function: the "AI Stock Assistant" — interprets a
// natural-language request like "same as last Tuesday but add 5 cases of
// coke" into a real structured item list, using the customer's ACTUAL past
// orders as context. It never invents order history — if none is passed
// in, it can only work from what the person typed in the message itself.
//
// Requires ANTHROPIC_API_KEY (same key already used for photo recognition
// — no separate setup needed if that's already configured).

export async function onRequestPost(context) {
  const apiKey = context.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "The AI assistant isn't configured yet — ANTHROPIC_API_KEY is missing from this project's environment variables." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let message, recentOrders;
  try {
    const body = await context.request.json();
    message = body.message;
    recentOrders = Array.isArray(body.recentOrders) ? body.recentOrders : [];
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  if (!message || !message.trim()) {
    return new Response(JSON.stringify({ error: "Type what you need first." }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  // Give the model only real, actual past orders — capped to a reasonable
  // number so the prompt doesn't balloon, and formatted plainly rather
  // than as raw JSON so the model reads it more reliably.
  const historyText = recentOrders.slice(0, 10).map(o =>
    `${o.date || "unknown date"} (${o.cashAndCarry || "unspecified"}): ${(o.items || []).map(i => `${i.qty} ${i.unit || ""} ${i.product}`.trim()).join(", ")}`
  ).join("\n");

  const systemPrompt = `You help a shop owner turn a request into a stock order. You are given their ACTUAL past orders below (if any) and a new request. Use the past orders only to resolve references like "same as last time" or "my usual" — never invent an order that isn't in the history provided. If the request doesn't match any real past order (e.g. history is empty, or they ask for a date/order that isn't listed), say so honestly in your response rather than guessing.

Past orders:
${historyText || "(none available)"}

Respond with ONLY valid JSON (no markdown, no preamble) in this exact shape:
{"items": [{"product": string, "brand": string, "qty": number, "unit": one of "Cases","Boxes","Packs","Bottles","kg","L","Units"}], "note": string}

"note" should be a short, honest one-sentence explanation of what you did (e.g. "Used your Tuesday Bestway order and added 5 cases of Coke" or "I don't have a record of a previous order to base this on, so I've only added what you typed just now"). If nothing could be understood at all, return {"items": [], "note": "..."} explaining why.`;

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
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: "user", content: message }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return new Response(JSON.stringify({ error: "The assistant couldn't process that right now." }), { status: 502, headers: { "Content-Type": "application/json" } });
    }

    const json = await response.json();
    const text = (json.content || []).map(b => b.text || "").join("\n");
    const clean = text.replace(/```json|```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.error("Couldn't parse assistant output as JSON:", clean);
      return new Response(JSON.stringify({ error: "Couldn't understand that — try rephrasing or add items manually." }), { status: 502, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(parsed), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("ai-assistant function error:", err);
    return new Response(JSON.stringify({ error: "Something went wrong." }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
