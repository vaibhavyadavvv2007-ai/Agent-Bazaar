import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { publish } from "@/lib/events/bus";
import { storeTools, TOOL_SCHEMAS, type StoreToolName } from "@/lib/tools/store";

/**
 * Provider-agnostic shopping-agent harness.
 *
 * Design principles (these are what make live demos safe):
 *   BOUNDED   — hard cap on turns; a runaway agent ends, it doesn't wander.
 *   CONTAINED — the LLM proposes; StoreTools disposes. A hallucinated SKU or
 *               an overspending whim comes back as structured data, never
 *               corrupts state. Money moves ONLY through request_checkout.
 *   LEGIBLE   — every turn is recorded as an event, so transcripts are
 *               inspectable and the best video take is selectable.
 */

export const MAX_TURNS = 12;

export type HarnessConfig = {
  provider: "claude" | "gemini" | "mcp-client";
  agentId: string;
  persona: string;
  /** What the user asked this agent to do, e.g. "Buy Diwali sweets under ₹1500". */
  task: string;
  /** Declared consent surface: what the simulated "user" authorized up front. */
  userMaxInr: number;
  userCategories?: string[];
  model?: string;
};

export type TurnRecord = {
  turn: number;
  role: "assistant" | "tool";
  text?: string;
  tool_name?: string;
  tool_args?: unknown;
  tool_result?: unknown;
};

export type HarnessResult = {
  session_id: string;
  ok: boolean;
  turns_used: number;
  summary: string;
  transcript: TurnRecord[];
};

export function systemPrompt(cfg: HarnessConfig): string {
  return `You are an autonomous shopping agent at THE AGENT BAZAAR, an Indian street-market store.

YOUR PERSONA: ${cfg.persona}
YOUR TASK: ${cfg.task}
YOUR PRINCIPAL (the human you buy for) has authorized up to ₹${cfg.userMaxInr}${cfg.userCategories?.length ? `, restricted to categories: ${cfg.userCategories.join(", ")}` : ""}.

HOW BUYING WORKS HERE (follow exactly, in order):
1. search_catalog to find products.
2. create_intent_mandate — records your principal's authorization bounds. Do this ONCE, before proposing any cart.
3. quote_cart (optional) to sanity-check prices/stock without committing.
4. propose_cart — commits you to an exact cart under your signed intent.
5. request_checkout — the ONLY way money can move. The merchant's policy engine may ALLOW instantly, park it for HUMAN APPROVAL, or DENY with reasons.
6. get_payment_status — ground truth after checkout. If waiting_for_human is true, report that gracefully and stop. If failed, you may retry ONCE via request_checkout on the same cart.

RULES OF THE HOUSE:
- Never exceed your principal's stated maximum. If a desired cart doesn't fit, choose less.
- If denied by policy, do NOT try to sneak around the rule. Report it honestly.
- Prices are in INR; tool amounts ending in _paise are ₹ × 100.
- When done (bought or blocked), summarize what happened and why.`;
}

/** Runs one full agent shopping session using the given provider adapter. */
export async function runAgentSession(
  cfg: HarnessConfig,
  callModel: AdapterCall
): Promise<HarnessResult> {
  const sessionId = randomUUID();
  await db().execute({
    sql: "INSERT INTO sessions (id, agent_id, provider, persona, budget_paise) VALUES (?, ?, ?, ?, ?)",
    args: [sessionId, cfg.agentId, cfg.provider, cfg.persona, cfg.userMaxInr * 100],
  });
  await publish({ type: "agent.arrived", session_id: sessionId, payload: { agent_id: cfg.agentId, provider: cfg.provider, persona: cfg.persona, task: cfg.task } });

  const tools = storeTools({ sessionId, agentId: cfg.agentId, provider: cfg.provider, persona: cfg.persona });
  const transcript: TurnRecord[] = [];
  const messages: AdapterMessage[] = [{ role: "user", content: cfg.task }];

  let turn = 0;
  for (; turn < MAX_TURNS; turn++) {
    const response = await callModel({
      system: systemPrompt(cfg),
      tools: Object.entries(TOOL_SCHEMAS).map(([name, spec]) => ({
        name,
        description: spec.description,
        parameters: spec.parameters,
      })),
      messages,
    });

    // Record assistant text/tool intents.
    for (const block of response.blocks) {
      if (block.kind === "text" && block.text.trim()) {
        transcript.push({ turn, role: "assistant", text: block.text });
        await publish({ type: "agent.spoke", session_id: sessionId, payload: { turn, text: block.text.slice(0, 500) } });
      }
      if (block.kind === "tool_use") {
        transcript.push({ turn, role: "assistant", tool_name: block.name, tool_args: block.input });
      }
    }

    const toolUses = response.blocks.filter((b): b is ToolUseBlock => b.kind === "tool_use");
    if (toolUses.length === 0) {
      break; // final answer delivered
    }

    // Execute tools against the ONE implementation; feed results back.
    const results: ToolResultBlock[] = [];
    for (const use of toolUses) {
      let result: unknown;
      try {
        const table = tools as unknown as Record<string, (input: Record<string, unknown>) => Promise<unknown>>;
        const fn = table[use.name];
        if (!fn) result = { error: `unknown tool ${use.name}` };
        else result = await fn(use.input);
      } catch (e) {
        result = { error: String(e) };
      }
      transcript.push({ turn, role: "tool", tool_name: use.name, tool_result: compact(result) });
      await publish({
        type: `agent.tool.${use.name}`,
        session_id: sessionId,
        payload: { turn, args: compact(use.input), result: compact(result) },
      });
      results.push({ kind: "tool_result", tool_use_id: use.id, content: JSON.stringify(compact(result)) });
    }

    messages.push({ role: "assistant", content: response.rawAssistantBlocks });
    messages.push({ role: "user", content: results });
  }

  const summary = [...transcript].reverse().find((t) => t.role === "assistant" && t.text)?.text ?? "(no summary)";
  await db().execute({ sql: "UPDATE sessions SET status='done' WHERE id=?", args: [sessionId] });
  await publish({ type: "agent.left", session_id: sessionId, payload: { turns: turn + 1 } });

  return { session_id: sessionId, ok: true, turns_used: turn + 1, summary, transcript };
}

function compact(v: unknown): unknown {
  const s = JSON.stringify(v);
  return s && s.length > 2000 ? { truncated: true, head: s.slice(0, 2000) } : v;
}

/* ── Provider-neutral shapes each adapter maps to/from ──────────────── */

export type TextBlock = { kind: "text"; text: string };
export type ToolUseBlock = { kind: "tool_use"; id: string; name: string; input: Record<string, unknown> };
export type ToolResultBlock = { kind: "tool_result"; tool_use_id: string; content: string };
export type AssistantBlock = TextBlock | ToolUseBlock;

export type AdapterMessage =
  | { role: "user" | "assistant"; content: string | (ToolResultBlock | unknown)[] };

export type AdapterCall = (req: {
  system: string;
  tools: { name: string; description: string; parameters: object }[];
  messages: AdapterMessage[];
}) => Promise<{ blocks: AssistantBlock[]; rawAssistantBlocks: unknown[] }>;
