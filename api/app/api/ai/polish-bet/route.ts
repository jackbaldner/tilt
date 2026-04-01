import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { rawTitle, rawDescription, type } = await req.json();
  if (!rawTitle) return NextResponse.json({ error: "Title required" }, { status: 400 });

  const prompt = `You are helping polish a social bet description for a friend group betting app called Tilt.

The user typed: "${rawTitle}"
${rawDescription ? `With description: "${rawDescription}"` : ""}
Bet type: ${type ?? "yes_no"}

Make it:
1. More fun and engaging (add some personality)
2. Crystal clear on what the winning condition is
3. Concise (title max 60 chars, description max 150 chars)

Return ONLY JSON, no explanation:
{
  "title": "polished title",
  "description": "clear, fun description with explicit win condition"
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("No text");

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON");

    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Polish bet error:", error);
    return NextResponse.json({ title: rawTitle, description: rawDescription ?? "" });
  }
}
