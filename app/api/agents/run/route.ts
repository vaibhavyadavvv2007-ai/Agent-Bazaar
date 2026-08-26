import { NextRequest, NextResponse } from "next/server";
import { runAgentSession } from "@/lib/agents/harness";
import { claudeAdapter } from "@/lib/agents/claude";
import { geminiAdapter } from "@/lib/agents/gemini";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/agents/run
 * { provider: "claude" | "gemini", agent_id, persona, task, user_max_inr,
 *   categories?, model? }
 *
 * Runs ONE full bounded agent shopping session in-process. Long sessions are
 * meant to be driven locally (see docs/LIMITATIONS.md re: serverless).
 * Claude defaults to haiku for cost; pass "claude-opus-5" for hero takes.
 */
type Body = {
  provider?: "claude" | "gemini";
  agent_id?: string;
  persona?: string;
  task?: string;
  user_max_inr?: number;
  categories?: string[];
  model?: string;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.agent_id || !body.task || !body.user_max_inr) {
    return NextResponse.json({ error: "agent_id, task and user_max_inr are required" }, { status: 400 });
  }
  const provider = body.provider ?? "claude";

  const adapter =
    provider === "gemini"
      ? geminiAdapter(body.model ?? "gemini-2.5-flash")
      : claudeAdapter(body.model ?? "claude-haiku-4-5");

  try {
    const result = await runAgentSession(
      {
        provider,
        agentId: body.agent_id,
        persona: body.persona ?? "A curious festival shopper",
        task: body.task,
        userMaxInr: body.user_max_inr,
        userCategories: body.categories,
        model: body.model,
      },
      adapter
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: "agent run failed", detail: String(e) }, { status: 500 });
  }
}
