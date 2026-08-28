# Agent Bazaar - 5-Minute Demo Video Script

## 0:00 - 0:45 | Introduction & The Problem
**Visuals:** Start on the main Gazette page (the Notice Board and the Street).
**Narration:**
"Welcome to the Agent Bazaar. As AI agents move from chat interfaces to performing actions on our behalf, a critical problem emerges in e-commerce: How do we let AI spend our money without giving it a blank check?
Today, if you give an AI your credit card, it's all or nothing. But in the physical world, we use mandates—we give someone cash for a specific purpose, and they bring back the receipt.
Agent Bazaar is a Razorpay AI Buildathon project that solves this. It's a test-mode storefront where every transaction is securely bound by cryptographic mandates, and humans stay in the loop for policy gates."

## 0:45 - 1:45 | The Mandate Pipeline (Dispatching an Agent)
**Visuals:** Click the "Dispatch Agent" button. Select "Claude" and hit dispatch. Watch the agent dot appear on the street and move between stalls.
**Narration:**
"Let's see this in action. I'm dispatching an autonomous AI agent to shop the bazaar.
Notice the first thing that happens on the Notice Board on the right: **INTENT • user-signed**. Before the agent can buy anything, the system cryptographically signs my intent. It sets a hard limit on what the agent can spend and what categories it can buy.
Now, watch the agent. It's browsing the stalls—using the `search_catalog` tool. 
When it decides what to buy, it doesn't just charge my card. It commits to a cart, generating a **CART mandate** that is mathematically hash-linked to my original intent. If the cart exceeds the bounds I set, the mandate fails cryptographically."

## 1:45 - 2:45 | The Policy Gate (Summons)
**Visuals:** Wait for the agent to trigger the "Summons" toast (the bell ringing). Open the gate dialog.
**Narration:**
"Our agent just finished shopping and attempted to check out, which generated the third step: the **PAYMENT mandate**. But wait—the bell just rang.
This is the Policy Gate. Merchants can configure rules that pause AI transactions for human review. Here, the system detected a policy violation (e.g., spending over a certain limit or buying a restricted item). 
As the shopkeeper, I am summoned to review the exact details of the transaction. I can see the reason for the flag, and I have the power to either 'Allow' or 'Refuse'. 
I'll click 'Allow entry'. The gate opens, the policy is recorded immutably on the ledger, and the Razorpay test rails are instantly issued."

## 2:45 - 3:45 | Razorpay Integration & Settlement
**Visuals:** Click the "Pay Now" toast on the bottom right. The Razorpay checkout page opens in a new tab. Complete a test UPI transaction.
**Narration:**
"With the policy cleared, the AI's job is done. But crucially, the AI *does not* hold my payment details.
Instead, it generated a secure Razorpay checkout link for me, the human, to complete. This is the ultimate safety net. 
I simply click 'Pay Now', select UPI, and complete the test transaction using Razorpay's authentic Checkout Standard.
*<Complete the payment on screen>*
As soon as the payment succeeds, the webhook fires. Look at the Notifications board: **PAYMENT CAPTURED**. The state reconciliation is fully automated, and the loop is closed."

## 3:45 - 5:00 | Audit Trail & MCP Integration
**Visuals:** Navigate to the "Audit Trail Receipts" tab. Show the immutable ledger. Then, quickly show the Terminal/MCP config.
**Narration:**
"Because every step was a signed mandate (Intent → Cart → Payment), we have a perfect, immutable Audit Trail. If an AI ever goes rogue, we have cryptographic proof of exactly what it authorized and why it was blocked.
And here's the best part: this isn't just a web app. The Agent Bazaar exposes a standard **Model Context Protocol (MCP)** Server. Any MCP-compatible AI client—like Claude Desktop or an AI IDE—can connect directly to this bazaar and shop using the exact same tools and safety guarantees.
Thank you for watching. The Agent Bazaar proves that autonomous commerce doesn't mean giving up control—it means building better, mathematically verifiable boundaries."
