import { describe, it, expect, vi } from "vitest";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("groq-sdk", () => ({
  default: class MockGroq {
    chat = { completions: { create: createMock } };
  },
}));

import { groqAdapter, unknownToolName, closestToolName } from "./groq";

const REAL_ERROR = new Error(
  `400 {"error":{"message":"Tool call validation failed: tool call validation failed: attempted to call tool 'list_campaign' which was not in request.tools","type":"invalid_request_error","code":"tool_call_validation_failed"}}`
);

const TOOL_NAMES = [
  "search_catalog",
  "quote_cart",
  "create_intent_mandate",
  "propose_cart",
  "request_checkout",
  "get_payment_status",
  "accept_suggestion",
  "list_campaigns",
  "apply_campaign",
];

describe("unknownToolName", () => {
  it("extracts the hallucinated tool name from Groq's 400 message", () => {
    expect(unknownToolName(REAL_ERROR)).toBe("list_campaign");
  });

  it("returns undefined for unrelated errors", () => {
    expect(unknownToolName(new Error("429 rate limit"))).toBeUndefined();
    expect(unknownToolName("not an error")).toBeUndefined();
  });
});

describe("closestToolName", () => {
  it("maps a singular hallucination to the plural real tool", () => {
    expect(closestToolName("list_campaign", TOOL_NAMES)).toBe("list_campaigns");
  });

  it("maps separator variants", () => {
    expect(closestToolName("search catalog", TOOL_NAMES)).toBe("search_catalog");
    expect(closestToolName("get-payment-status", TOOL_NAMES)).toBe("get_payment_status");
  });

  it("returns undefined when nothing matches", () => {
    expect(closestToolName("book_flight", TOOL_NAMES)).toBeUndefined();
  });
});

describe("groqAdapter tool-name validation retry", () => {
  it("retries once with a corrective notice when the model hallucinates a tool name", async () => {
    const adapter = groqAdapter();
    createMock
      .mockRejectedValueOnce(REAL_ERROR)
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: "call_1", type: "function", function: { name: "list_campaigns", arguments: "{}" } },
              ],
            },
          },
        ],
      });

    const result = await adapter({
      system: "sys",
      tools: TOOL_NAMES.map((name) => ({ name, description: name, parameters: { type: "object", properties: {} } })),
      messages: [{ role: "user", content: "find deals" }],
    });

    expect(createMock).toHaveBeenCalledTimes(2);
    const retryBody = createMock.mock.calls[1][0];
    const lastMsg = retryBody.messages[retryBody.messages.length - 1];
    expect(lastMsg.content).toContain("list_campaigns");
    expect(result.blocks).toEqual([
      { kind: "tool_use", id: "call_1", name: "list_campaigns", input: {} },
    ]);
  });

  it("rethrows errors that are not tool-name validation failures", async () => {
    const adapter = groqAdapter();
    createMock.mockReset().mockRejectedValueOnce(new Error("429 rate limit"));

    await expect(
      adapter({
        system: "sys",
        tools: [],
        messages: [{ role: "user", content: "hi" }],
      })
    ).rejects.toThrow("429");
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
