import { GoogleGenAI, type FunctionDeclaration, type Content } from "@google/genai";
import type { AdapterCall, AssistantBlock } from "./harness";

/**
 * Gemini adapter for the shopping harness — proves the guarantees live in
 * the TOOLS (mandates + policy + ledger), not in any one model. Same six
 * store verbs, same bounds; a second provider spending through them.
 */
export function geminiAdapter(model: string = "gemini-2.5-flash"): AdapterCall {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  return async ({ system, tools, messages }) => {
    const contents: Content[] = messages.map((m) => {
      if (typeof m.content === "string") {
        return { role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] };
      }
      // Structured history: assistant tool calls + user tool results.
      const parts = (m.content as Array<Record<string, unknown>>).map((block) => {
        if (block.kind === "tool_use") {
          return { functionCall: { name: block.name as string, args: block.input as Record<string, unknown> } };
        }
        if (block.kind === "tool_result") {
          return {
            functionResponse: {
              name: (block.tool_name as string) ?? "tool",
              response: { result: block.content as string },
            },
          };
        }
        return { text: String(block) };
      });
      return { role: m.role === "assistant" ? "model" : "user", parts };
    });

    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: system,
        temperature: 0,
        tools: [
          {
            functionDeclarations: tools.map((t) => ({
              name: t.name,
              description: t.description,
              parameters: t.parameters as FunctionDeclaration["parameters"],
            })) as FunctionDeclaration[],
          },
        ],
      },
    });

    const blocks: AssistantBlock[] = [];
    const rawParts: Record<string, unknown>[] = [];
    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.text) {
        blocks.push({ kind: "text", text: part.text });
        rawParts.push({ text: part.text });
      }
      if (part.functionCall) {
        blocks.push({
          kind: "tool_use",
          id: `${part.functionCall.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: part.functionCall.name ?? "unknown",
          input: (part.functionCall.args ?? {}) as Record<string, unknown>,
        });
        rawParts.push({ functionCall: part.functionCall });
      }
    }

    return { blocks, rawAssistantBlocks: rawParts };
  };
}
