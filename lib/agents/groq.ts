import Groq from "groq-sdk";
import type { AdapterCall, AssistantBlock, ToolResultBlock } from "./harness";
import type { ChatCompletionTool, ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";

/**
 * Groq adapter for the shopping harness.
 *
 * Model guidance: openai/gpt-oss-120b is the only reliable model with tool support
 * available on Buildathon keys that follows strict JSON schema.
 */
export function groqAdapter(model: string = "openai/gpt-oss-120b"): AdapterCall {
  // Free-tier Groq caps at ~8k tokens/min; one agent turn resends the full
  // system prompt + history, so 429s mid-session are routine. The SDK backs
  // off on Groq's Retry-After — give it room to wait the window out instead
  // of failing the whole session.
  const client = new Groq({ maxRetries: 4 }); // reads GROQ_API_KEY

  return async ({ system, tools, messages }) => {
    // Map tool schemas to Groq's OpenAI-compatible tool format
    const groqTools: ChatCompletionTool[] = tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters as Record<string, unknown>,
      },
    }));

    // Build the conversation in proper OpenAI tool-calling format.
    // The harness stores messages as:
    //   { role: "user", content: "string" }                    — initial task
    //   { role: "assistant", content: AssistantBlock[] }        — model response
    //   { role: "user", content: ToolResultBlock[] }            — tool results
    //
    // Groq (OpenAI-compat) expects:
    //   { role: "user", content: "string" }
    //   { role: "assistant", content: "...", tool_calls: [...] }
    //   { role: "tool", tool_call_id: "...", content: "..." }   — one per tool result

    const groqMessages: ChatCompletionMessageParam[] = [];

    for (const m of messages) {
      if (m.role === "user") {
        if (typeof m.content === "string") {
          groqMessages.push({ role: "user", content: m.content });
        } else if (Array.isArray(m.content)) {
          // These are ToolResultBlocks — emit as individual "tool" role messages
          for (const block of m.content) {
            if (block.kind === "tool_result") {
              const trb = block as ToolResultBlock;
              groqMessages.push({
                role: "tool",
                tool_call_id: trb.tool_use_id,
                content: typeof trb.content === "string" ? trb.content : JSON.stringify(trb.content),
              });
            }
          }
        }
      } else if (m.role === "assistant") {
        if (typeof m.content === "string") {
          groqMessages.push({ role: "assistant", content: m.content });
        } else if (Array.isArray(m.content)) {
          // Build proper assistant message with tool_calls
          const textParts = m.content.filter((b) => b.kind === "text");
          const toolParts = m.content.filter((b) => b.kind === "tool_use");

          const toolCalls = toolParts.map((b) => ({
            id: (b as any).id as string,
            type: "function" as const,
            function: {
              name: (b as any).name as string,
              arguments: JSON.stringify((b as any).input),
            },
          }));

          groqMessages.push({
            role: "assistant",
            content: textParts.map((b) => (b as any).text).join("\n") || null,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          });
        }
      }
    }

    // Prepend system message
    const finalMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: system },
      ...groqMessages,
    ];

    const response = await client.chat.completions.create({
      model,
      messages: finalMessages,
      tools: groqTools.length > 0 ? groqTools : undefined,
      temperature: 0,
      max_tokens: 2048,
    });

    const msg = response.choices[0].message;
    const blocks: AssistantBlock[] = [];

    if (msg.content) {
      blocks.push({ kind: "text", text: msg.content });
    }

    if (msg.tool_calls) {
      for (const call of msg.tool_calls) {
        if (call.type === "function") {
          let parsedArgs: Record<string, unknown>;
          try {
            parsedArgs = JSON.parse(call.function.arguments);
          } catch {
            parsedArgs = { _raw: call.function.arguments };
          }
          blocks.push({
            kind: "tool_use",
            id: call.id,
            name: call.function.name,
            input: parsedArgs,
          });
        }
      }
    }

    return { blocks, rawAssistantBlocks: blocks };
  };
}
