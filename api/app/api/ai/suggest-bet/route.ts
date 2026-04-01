import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { one, all } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/mobile-auth";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (isAuthError(auth)) return auth;

  const { circleId, context } = await req.json();

  const circle = await one<any>("SELECT * FROM Circle WHERE id = ?", [circleId]);
  if (!circle) return NextResponse.json({ error: "Circle not found" }, { status: 404 });

  const members = await all<any>(
    "SELECT u.name FROM CircleMember cm JOIN User u ON u.id = cm.userId WHERE cm.circleId = ?",
    [circleId]
  );
  const recentBets = await all<any>(
    "SELECT title, type FROM Bet WHERE circleId = ? ORDER BY createdAt DESC LIMIT 5",
    [circleId]
  );

  const memberNames = members.map((m: any) => m.name ?? "Unknown").join(", ");
  const recentBetTitles = recentBets.map((b: any) => b.title).join("; ");

  const prompt = `You are a fun, witty bet-idea generator for a social betting app called Tilt.
Generate 5 creative, funny, and specific bet ideas for a friend group called "${circle.name}".

Group members: ${memberNames || "unknown"}
Recent bets: ${recentBetTitles || "None yet"}
${context ? `Context: ${context}` : ""}

Generate bets that are specific, resolvable, and fun. Mix of types.

Return ONLY a JSON array:
[
  {
    "title": "short catchy title (max 60 chars)",
    "description": "clear description with win condition (max 150 chars)",
    "type": "yes_no" | "over_under" | "multiple_choice" | "custom",
    "options": ["option1", "option2"]
  }
]`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("No text");

    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON");

    return NextResponse.json({ suggestions: JSON.parse(jsonMatch[0]) });
  } catch (error) {
    console.error("AI suggest error:", error);
    return NextResponse.json({
      suggestions: [
        { title: "Who shows up late?", description: "Who will be last to arrive at the next hangout?", type: "multiple_choice", options: members.map((m: any) => m.name ?? "Unknown") },
        { title: "Rain tomorrow?", description: "Will it rain at any point tomorrow?", type: "yes_no", options: ["Yes", "No"] },
        { title: "First to reply", description: "Who responds to the group chat first after this is posted?", type: "multiple_choice", options: members.map((m: any) => m.name ?? "Unknown") },
      ],
    });
  }
}
