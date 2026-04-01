import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { one } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { betId } = await req.json();
  if (!betId) return NextResponse.json({ error: "Bet ID required" }, { status: 400 });

  const bet = one<any>("SELECT * FROM Bet WHERE id = ?", [betId]);
  if (!bet) return NextResponse.json({ error: "Bet not found" }, { status: 404 });

  const options = JSON.parse(bet.options) as string[];

  const prompt = `You are an AI bet resolver.

Bet: "${bet.title}"
Description: "${bet.description ?? "None"}"
Options: ${options.join(", ")}
Created: ${bet.createdAt}
${bet.resolveAt ? `Resolve date: ${bet.resolveAt}` : ""}

Attempt to resolve based on your knowledge.

Return ONLY JSON:
{
  "canResolve": true/false,
  "winningOption": "the winning option or null",
  "confidence": "high/medium/low",
  "reasoning": "brief explanation"
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("No text");

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON");

    return NextResponse.json(JSON.parse(jsonMatch[0]));
  } catch (error) {
    return NextResponse.json({ canResolve: false, winningOption: null, confidence: "low", reasoning: "Unable to determine automatically." });
  }
}
