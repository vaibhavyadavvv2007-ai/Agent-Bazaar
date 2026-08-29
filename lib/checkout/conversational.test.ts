import { describe, it, expect, vi, beforeEach } from "vitest";

const { publishMock, executeMock } = vi.hoisted(() => ({
  publishMock: vi.fn(),
  executeMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: () => ({ execute: executeMock }) }));
vi.mock("@/lib/events/bus", () => ({ publish: publishMock }));
vi.mock("@/lib/campaigns/apply", () => ({
  priceCartWithCampaigns: vi.fn(async () => ({
    items: [{ sku: "M01", title: "Kaju Katli", qty: 2, unit_price_paise: 50000, line_total_paise: 100000 }],
    discount_paise: 500,
    original_total_paise: 100000,
    applicable: [],
  })),
}));

import { publishCheckoutConversational, listOpenCheckouts } from "./conversational";

describe("publishCheckoutConversational", () => {
  beforeEach(() => {
    publishMock.mockReset();
    executeMock.mockReset();
    executeMock.mockImplementation(async ({ sql }: { sql: string }) => {
      if (sql.includes("FROM mandates")) {
        return {
          rows: [
            {
              session_id: "sess_1",
              payload_json: JSON.stringify({ cart_mandate_id: "cart_1", amount_paise: 99500 }),
            },
          ],
        };
      }
      return { rows: [] };
    });
  });

  it("publishes the event the bazaar-floor checkout modal listens for", async () => {
    await publishCheckoutConversational({
      paymentMandateId: "pay_1",
      paymentRowId: "payrow_1",
      rzpOrderId: "order_1",
      amountPaise: 99500,
    });

    expect(publishMock).toHaveBeenCalledTimes(1);
    const evt = publishMock.mock.calls[0][0];
    expect(evt.type).toBe("payment.checkout_conversational");
    expect(evt.session_id).toBe("sess_1");
    expect(evt.payload).toMatchObject({
      payment_row_id: "payrow_1",
      rzp_order_id: "order_1",
      amount_paise: 99500,
      mandate_id: "pay_1",
    });
    // The modal renders these — they must be present, not undefined.
    expect(evt.payload.cart_items).toHaveLength(1);
    expect(evt.payload.agent_message).toContain("Kaju Katli");
    expect(evt.payload.discount_paise).toBe(500);
  });

  it("survives a mandate row it cannot read (publishes with empty cart)", async () => {
    executeMock.mockImplementation(async ({ sql }: { sql: string }) =>
      sql.includes("FROM mandates") ? { rows: [] } : { rows: [] }
    );

    await publishCheckoutConversational({
      paymentMandateId: "pay_x",
      paymentRowId: "row_x",
      rzpOrderId: "order_x",
      amountPaise: 100,
    });

    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock.mock.calls[0][0].payload.cart_items).toEqual([]);
  });
});

describe("listOpenCheckouts", () => {
  beforeEach(() => {
    publishMock.mockReset();
    executeMock.mockReset();
    executeMock.mockImplementation(async ({ sql }: { sql: string }) => {
      if (sql.includes("status = 'checkout_open'")) {
        return {
          rows: [
            { id: "row_1", amount_paise: 249900, created_at: "2026-08-27 14:00:21" },
            { id: "row_2", amount_paise: 104800, created_at: "2026-08-27 13:58:25" },
          ],
        };
      }
      return { rows: [] };
    });
  });

  it("lists issued-but-unpaid payments with a checkout URL built from the request origin", async () => {
    const list = await listOpenCheckouts("https://bazaar.example.com");

    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({
      payment_row_id: "row_1",
      amount_paise: 249900,
      created_at: "2026-08-27 14:00:21",
      checkout_url: "https://bazaar.example.com/checkout/row_1",
    });
  });
});
