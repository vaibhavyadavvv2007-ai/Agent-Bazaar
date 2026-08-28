import Anthropic from "@anthropic-ai/sdk";
import type { AdapterCall } from "./harness";
import { TOOL_SCHEMAS, type StoreToolName } from "@/lib/tools/store";

export function claudeAdapter(model: string = "claude-haiku-4-5"): AdapterCall {
  // baseURL is pinned so a stray ANTHROPIC_BASE_URL in the host environment
  // (proxies, wrappers) can't silently redirect payments-bound agent traffic.
  const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY,
    baseURL: "https://api.anthropic.com",
  });

  return async ({ system, tools, messages }) => {
    // Map internal tool schemas to Anthropic format
    const anthropicTools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool["input_schema"],
    }));

    // Convert internal adapter messages to Anthropic format
    const anthropicMessages: Anthropic.MessageParam[] = [];

    for (const m of messages) {
      if (m.role === "user") {
        if (typeof m.content === "string") {
          anthropicMessages.push({ role: "user", content: m.content });
        } else if (Array.isArray(m.content)) {
          anthropicMessages.push({
            role: "user",
            content: m.content
              .filter((b) => b.kind === "tool_result")
              .map((b: any) => ({
                type: "tool_result",
                tool_use_id: b.tool_use_id,
                content: typeof b.content === "string" ? b.content : JSON.stringify(b.content),
              })),
          });
        }
      } else if (m.role === "assistant") {
        if (typeof m.content === "string") {
          anthropicMessages.push({ role: "assistant", content: m.content });
        } else if (Array.isArray(m.content)) {
          const content: any[] = [];
          for (const b of m.content) {
            if (b.kind === "text") {
              content.push({ type: "text", text: (b as any).text });
            } else if (b.kind === "tool_use") {
              content.push({
                type: "tool_use",
                id: (b as any).id,
                name: (b as any).name,
                input: (b as any).input,
              });
            }
          }
          anthropicMessages.push({ role: "assistant", content });
        }
      }
    }

    const response = await anthropic.messages.create({
      model,
      system,
      max_tokens: 1024,
      tools: anthropicTools,
      messages: anthropicMessages,
    });

    const blocks: import("./harness").AssistantBlock[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        blocks.push({ kind: "text", text: block.text });
      } else if (block.type === "tool_use") {
        blocks.push({
          kind: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      blocks,
      rawAssistantBlocks: blocks,
    };
  };
}
