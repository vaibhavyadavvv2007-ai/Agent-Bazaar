import { randomUUID } from "node:crypto";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { db } from "@/lib/db";
import { storeTools } from "@/lib/tools/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * OUR MCP server — the protocol-level front door.
 *
 * Any MCP-capable client (Claude Desktop, Gemini CLI, ChatGPT dev-mode,
 * Cursor, …) can point at `/api/mcp` and shop the bazaar with the SAME
 * StoreTools the harnesses use — same mandates, same policy gate, same
 * ledger. Stateless transport: every call is self-contained, sessions are
 * explicit via `start_shopping_session`.
 */

function buildServer(): McpServer {
  const server = new McpServer(
    { name: "agent-bazaar", version: "0.1.0" },
    {
      instructions:
        "The Agent Bazaar: an Indian street-market store that AI agents can transact with. " +
        "Flow: start_shopping_session → search_catalog → create_intent_mandate (user's spend bound) → " +
        "propose_cart → request_checkout. Checkout may ALLOW instantly, park for HUMAN APPROVAL, or DENY with reasons. " +
        "All amounts ending in _paise are ₹×100. Never try to bypass the policy engine.",
    }
  );

  const toolsFor = (sessionId: string, agentId: string) =>
    storeTools({ sessionId, agentId, provider: "mcp-client", persona: "mcp-client" });

  async function assertSession(sessionId: string): Promise<string> {
    const res = await db().execute({ sql: "SELECT id FROM sessions WHERE id = ?", args: [sessionId] });
    if (!res.rows[0]) throw new Error(`unknown session ${sessionId} — call start_shopping_session first`);
    return sessionId;
  }

  server.registerTool(
    "start_shopping_session",
    {
      title: "Start a shopping session",
      description: "Open a session at the bazaar. Returns the session_id every purchase tool requires.",
      inputSchema: {
        agent_id: z.string().describe("who is shopping, e.g. 'claude-desktop/gift-buyer'"),
        persona: z.string().optional().describe("short persona/purpose note"),
      },
    },
    async ({ agent_id, persona }) => {
      const id = randomUUID();
      await db().execute({
        sql: "INSERT INTO sessions (id, agent_id, provider, persona) VALUES (?, ?, 'mcp-client', ?)",
        args: [id, agent_id, persona ?? ""],
      });
      return { content: [{ type: "text", text: JSON.stringify({ session_id: id, next: "search_catalog" }) }] };
    }
  );

  server.registerTool(
    "search_catalog",
    {
      title: "Search the catalog",
      description: "Search bazaar products by free text and/or category.",
      inputSchema: {
        session_id: z.string(),
        query: z.string().optional(),
        category: z.string().optional(),
      },
    },
    async ({ session_id, query, category }) => {
      await assertSession(session_id);
      const result = await toolsFor(session_id, "mcp-client").search_catalog({ query, category });
      return { content: [{ type: "text", text: JSON.stringify(result.items) }] };
    }
  );

  server.registerTool(
    "quote_cart",
    {
      title: "Quote a cart",
      description: "Check prices/stock for a candidate cart WITHOUT committing.",
      inputSchema: {
        session_id: z.string(),
        items: z.array(z.object({ sku: z.string(), qty: z.number().int().positive() })),
      },
    },
    async ({ session_id, items }) => {
      await assertSession(session_id);
      return { content: [{ type: "text", text: JSON.stringify(await toolsFor(session_id, "mcp-client").quote_cart({ items })) }] };
    }
  );

  server.registerTool(
    "create_intent_mandate",
    {
      title: "Record the user's authorization bounds",
      description: "Signed INTENT: max spend (paise) and optional category restriction. Required before any cart.",
      inputSchema: {
        session_id: z.string(),
        max_amount_paise: z.number().int().positive(),
        categories: z.array(z.string()).optional(),
        note: z.string().optional(),
      },
    },
    async ({ session_id, max_amount_paise, categories, note }) => {
      await assertSession(session_id);
      const r = await toolsFor(session_id, "mcp-client").create_intent_mandate({ max_amount_paise, categories, note });
      return { content: [{ type: "text", text: JSON.stringify(r) }] };
    }
  );

  server.registerTool(
    "propose_cart",
    {
      title: "Commit to an exact cart",
      description: "Signs the cart under the intent. Structured errors if stock/price/bounds are violated.",
      inputSchema: {
        session_id: z.string(),
        intent_mandate_id: z.string(),
        items: z.array(z.object({ sku: z.string(), qty: z.number().int().positive() })),
      },
    },
    async ({ session_id, intent_mandate_id, items }) => {
      await assertSession(session_id);
      const r = await toolsFor(session_id, "mcp-client").propose_cart({ intent_mandate_id, items });
      return { content: [{ type: "text", text: JSON.stringify(r) }] };
    }
  );

  server.registerTool(
    "request_checkout",
    {
      title: "Attempt payment (the ONLY money path)",
      description:
        "Runs the policy engine on a signed cart: ALLOW → real test-mode rails; GATE → human approval; DENY → named reasons.",
      inputSchema: {
        session_id: z.string(),
        cart_mandate_id: z.string(),
      },
    },
    async ({ session_id, cart_mandate_id }) => {
      await assertSession(session_id);
      const r = await toolsFor(session_id, "mcp-client").request_checkout({ cart_mandate_id });
      return { content: [{ type: "text", text: JSON.stringify(r) }] };
    }
  );

  server.registerTool(
    "get_payment_status",
    {
      title: "Payment ground truth",
      description: "Ledger status for a payment row or cart, including whether a human approval is pending.",
      inputSchema: {
        session_id: z.string(),
        payment_row_id: z.string().optional(),
        cart_mandate_id: z.string().optional(),
      },
    },
    async ({ session_id, payment_row_id, cart_mandate_id }) => {
      await assertSession(session_id);
      const r = await toolsFor(session_id, "mcp-client").get_payment_status({ payment_row_id, cart_mandate_id });
      return { content: [{ type: "text", text: JSON.stringify(r) }] };
    }
  );

  server.registerTool(
    "accept_suggestion",
    {
      title: "Accept a merchant suggestion",
      description: "Record acceptance of an upsell suggestion (measured as attach rate).",
      inputSchema: { session_id: z.string(), suggestion_id: z.string() },
    },
    async ({ session_id, suggestion_id }) => {
      await assertSession(session_id);
      const r = await toolsFor(session_id, "mcp-client").accept_suggestion({ suggestion_id });
      return { content: [{ type: "text", text: JSON.stringify(r) }] };
    }
  );

  return server;
}

function transport(): WebStandardStreamableHTTPServerTransport {
  // Stateless + JSON: every request self-contained, plain JSON responses.
  return new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
}

async function handle(req: Request): Promise<Response> {
  const t = transport();
  const server = buildServer();
  await server.connect(t);
  try {
    return await t.handleRequest(req);
  } finally {
    await t.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

export { handle as POST, handle as GET, handle as DELETE };
