import { NextRequest, NextResponse } from "next/server";
import { runAgentSession } from "@/lib/agents/harness";
import { groqAdapter } from "@/lib/agents/groq";
import { claudeAdapter } from "@/lib/agents/claude";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/agents/run
 * { provider: "groq" | "claude", agent_id, persona, task, user_max_inr,
 *   categories?, model? }
 *
 * Runs ONE full bounded agent shopping session in-process. Long sessions are
 * meant to be driven locally (see docs/LIMITATIONS.md re: serverless).
 * Groq defaults to openai/gpt-oss-120b.
 */
const inputSchema = z.object({
  provider: z.enum(["groq", "claude"]).optional(),
  agent_id: z.string(),
  persona: z.string().optional(),
  task: z.string(),
  user_max_inr: z.number(),
  categories: z.array(z.string()).optional(),
  model: z.string().optional(),
});

// Simple in-memory rate limiter (resets on restart)
const rateLimit = new Map<string, { count: number; windowStart: number }>();
const MAX_REQUESTS = 10;
const WINDOW_MS = 60000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let record = rateLimit.get(ip);
  if (!record || now - record.windowStart > WINDOW_MS) {
    record = { count: 1, windowStart: now };
  } else {
    record.count++;
  }
  rateLimit.set(ip, record);
  return record.count <= MAX_REQUESTS;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "anonymous";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "rate limit exceeded", detail: "too many agent sessions requested" }, { status: 429 });
  }

  let body;
  try {
    body = inputSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "invalid input", detail: String(e) }, { status: 400 });
  }

  const provider = body.provider ?? "groq";

  const adapter = body.provider === "claude"
    ? claudeAdapter(body.model ?? "claude-3-haiku-20240307")
    : groqAdapter(body.model ?? "openai/gpt-oss-120b");

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
