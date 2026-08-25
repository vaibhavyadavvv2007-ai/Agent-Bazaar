import Anthropic from "@anthropic-ai/sdk";
import type { AdapterCall, AssistantBlock } from "./harness";

/**
 * Claude adapter for the shopping harness. Temperature 0 + bounded turns keep
 * live demos reproducible enough to rehearse and record.
 *
 * Model guidance: hero video takes use claude-opus-5 (best instruction
 * following on camera); bulk/crowd sessions use claude-haiku-4-5 for cost.
 */
export function claudeAdapter(model: string = "claude-haiku-4-5"): AdapterCall {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY

  return async ({ system, tools, messages }) => {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      temperature: 0,
      system,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool.InputSchema,
      })),
      messages: messages.map((m) => ({
        role: m.role,
        content:
          typeof m.content === "string"
            ? m.content
            : m.content.map((b) =>
                b.kind === "text"
                  ? { type: "text" as const, text: b.text }
                  : b.kind === "tool_use"
                    ? { type: "tool_use" as const, id: b.id, name: b.name, input: b.input }
                    : { type: "tool_result" as const, tool_use_id: b.tool_use_id, content: b.content }
              ),
      })),
    });

    const blocks: AssistantBlock[] = [];
    for (const block of response.content) {
      if (block.type === "text") blocks.push({ kind: "text", text: block.text });
      else if (block.type === "tool_use")
        blocks.push({ kind: "tool_use", id: block.id, name: block.name, input: block.input as Record<string, unknown> });
    }

    // Neutral block shape — the harness feeds these back as history.
    return { blocks, rawAssistantBlocks: blocks };
  };
}
