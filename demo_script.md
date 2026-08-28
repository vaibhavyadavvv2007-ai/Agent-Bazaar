# Agent Bazaar - 5-Minute Demo Video Script

## 0:00 - 0:30 | The Hook
**Visuals:** Open on the bazaar floor — stalls, flash sale banner ticking down, an agent already walking.
**Narration:**
"This is the Agent Bazaar. AI agents spend real money here — but every rupee is cryptographically bounded by a mandate, and a human rings the bell before any payment goes through.
Built for the Razorpay AI Buildathon, Track 01: Agentic Commerce."

---

## 0:30 - 1:15 | Dispatching an Agent + The Mandate Pipeline
**Visuals:** Open the Dispatch Drawer. Pick the "🍬 Diwali Sweets" preset, ensure Claude is selected, and dispatch.
**Narration:**
"I'm dispatching an autonomous AI agent to shop the bazaar. We are using Claude to navigate the stalls and reason about the products.
Watch the Notice Board: the first thing that happens is **INTENT — user-signed**. Before the agent can buy anything, the system cryptographically signs my intent — setting a hard budget and category limits.
Now the agent is browsing stalls using the `search_catalog` tool. When it decides what to buy, it commits to a cart — generating a **CART mandate** that is hash-linked to my original intent. If the cart exceeds my bounds, the mandate fails cryptographically."

---

## 1:15 - 1:45 | The Flash Sale Banner
**Visuals:** Point to the flash sale banner at the top of the bazaar floor. Show the countdown ticking.
**Narration:**
"See this? The Chai Flash Sale — Masala Chai Kit at 299, down from 349. The banner counts down in real time. When it hits red, urgency kicks in. When it expires, the discount is gone.
This isn't just UI — the campaign engine actually modifies the price at checkout. Real-time, time-bounded promotions that agents can discover and apply automatically."

---

## 1:45 - 2:15 | Campaign Auto-Apply + Policy Gate
**Visuals:** Agent completes shopping. Show the audit trail log a "campaign.applied" event. Then the bell rings — approval queue appears.
**Narration:**
"The agent bought two mithai items — and the **Mithai Bundle Bonanza** auto-applied. Buy 2+ mithai, get 15% off. The campaign engine evaluated the cart, found it qualified, and recorded the discount immutably.
But wait — the bell just rang. This is the Policy Gate. The transaction is flagged for human review. As the shopkeeper, I can see exactly what the agent wants to buy, the total, and the reason for the flag.
I'll click 'Approve'. The gate opens, the decision is recorded on the ledger, and the payment mandate is issued."

---

## 2:15 - 3:00 | Conversational In-App Checkout
**Visuals:** The Conversational Checkout modal appears on the bazaar floor. Show the agent's proposal, itemized cart, discounted total. Click "Confirm & Pay". Razorpay opens inside the modal.
**Narration:**
"This is the conversational checkout — no redirect, no hosted page. The agent's order proposal appears right here on the bazaar floor. I can see exactly what it wants to buy, line by line, with the campaign discount applied.
I click 'Confirm & Pay' — and Razorpay's checkout opens inside the modal. I select UPI, complete the test transaction.
*<Complete the payment on screen>*

The webhook fires. Look at the Notice Board: **PAYMENT CAPTURED**. The entire flow — from agent browsing to human approval to in-app payment — took under two minutes."

---

## 3:00 - 3:45 | Dashboard + Campaign Management
**Visuals:** Navigate to `/dashboard`. Show the metrics — money captured, policy decisions, campaign stats. Then navigate to `/campaigns`. Show the campaign list with create/edit/toggle.
**Narration:**
"The dashboard shows honest, real-time metrics. Money captured, policy decisions broken down by type, approval latency, and campaign performance — two campaigns applied, 314 rupees in discounts given.
And here's the Campaign Control Room. Merchants can create bundle deals, flash sales, and cross-sell promotions — all with time windows, category filters, and SKU targeting. Toggle them on and off live. The engine evaluates every cart against every active campaign automatically."

---

## 3:45 - 4:30 | Audit Trail & Immutable Ledger
**Visuals:** Navigate to `/receipts`. Show the append-only ledger with chain verification.
**Narration:**
"Every transaction is recorded in an append-only ledger with Ed25519 signatures and hash-linking. Mandate rows can never be updated — not even status. Rewriting history requires deleting rows, and the database forbids exactly that.

This is the power of the architecture: one StoreTools implementation behind the front door, strictly enforcing the rules no matter what the agent tries to do."

---

## 4:30 - 5:00 | MCP Endpoint + Closing
**Visuals:** Show the MCP endpoint in the terminal or a quick config screen. Point at `/api/mcp`. End on the Gazette masthead.
**Narration:**
"And here's the mic drop: this isn't just a web app. The Agent Bazaar exposes a standard **Model Context Protocol** server. Any MCP-compatible AI client — Claude Desktop, Cursor, ChatGPT — can point at our URL and shop the bazaar natively. Same mandates, same policy gate, same ledger.
The Agent Bazaar proves that autonomous commerce doesn't mean giving up control. It means building better, mathematically verifiable boundaries — and letting the shopkeeper ring the bell.
Thank you."

---

## Key Moments to Linger On (for editing)

| Timestamp | Moment | Why It Matters |
|---|---|---|
| **0:05** | Flash sale banner ticking | Immediate visual hook — this isn't a static page |
| **1:30** | Campaign discount auto-applies | Shows the campaign engine works live |
| **1:50** | Bell rings, approval queue appears | The "governance in action" moment — linger 3-5s |
| **2:20** | Conversational checkout modal | The biggest differentiator — agent proposes, human decides |
| **3:10** | Dashboard metrics | Proof it's real money, not narrative |
| **3:30** | Campaign management page | Merchant control — this is a product, not a demo |
| **4:15** | MCP endpoint | "Any AI can shop here" — the growth story |

## Test UPI Credentials
- **Success:** `success@razorpay`
- **Failure:** `failure@razorpay`

## Before Recording Checklist
- [ ] `npm run setup && npm run dev` — dev server running
- [ ] `npx tsx scripts/seed.ts` — campaigns + products seeded
- [ ] Flash sale has time remaining (re-seed if expired: `npx tsx scripts/seed.ts`)
- [ ] API key set in `.env.local` (CLAUDE_API_KEY)
- [ ] Browser open on `localhost:3000`
- [ ] Recording software ready (OBS, QuickTime, etc.)
