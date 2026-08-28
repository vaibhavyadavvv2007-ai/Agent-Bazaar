import { db } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

type ReceiptRow = {
  id: string;
  amount_paise: number;
  updated_at: string;
  rzp_payment_id: string;
  payload_json: string;
  cart_hash: string;
};

export default async function ReceiptsPage() {
  const res = await db().execute({
    sql: `
      SELECT p.id, p.amount_paise, p.updated_at, p.rzp_payment_id, cm.payload_json, cm.hash as cart_hash
      FROM payments p
      JOIN mandates pm ON p.mandate_id = pm.id
      JOIN mandates cm ON json_extract(pm.payload_json, '$.cart_mandate_id') = cm.id
      WHERE p.status = 'captured' OR p.status = 'recovered'
      ORDER BY p.updated_at DESC
    `,
    args: [],
  });

  const receipts = res.rows as unknown as ReceiptRow[];

  return (
    <main className="min-h-screen p-6 font-clause text-(--ink) sm:p-12">
      <header className="mb-6 border-b-2 border-double border-(--ink) pb-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-masthead text-4xl uppercase tracking-widest text-(--ink)">Audit Trail</h1>
            <p className="mt-2 font-clause text-[11px] uppercase tracking-[0.14em] text-(--ink-faint)">
              The Agent Bazaar · Settled Receipts
            </p>
          </div>
          <Link href="/" className="font-clause text-sm underline decoration-(--rule-blue) underline-offset-4 hover:text-(--rule-blue)">
            Return to Floor
          </Link>
        </div>
      </header>
      <div className="security-thread-band mb-8" aria-hidden="true" />

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {receipts.length === 0 ? (
          <p className="text-(--ink-faint) col-span-full">No settled receipts yet.</p>
        ) : (
          receipts.map((r) => {
            let cart: { items: { sku: string; qty: number }[] } = { items: [] };
            try {
              cart = JSON.parse(r.payload_json);
            } catch {}

            return (
              <div key={r.id} className="relative flex flex-col rule-box p-6">
                
                <div className="text-center border-b border-dashed border-(--ink-faint) pb-4 mb-4">
                  <h2 className="font-masthead text-xl tracking-widest text-(--ink)">THE AGENT BAZAAR</h2>
                  <p className="text-[10px] uppercase tracking-widest text-(--ink-faint) mt-1">Official Receipt</p>
                </div>

                <div className="flex-1 space-y-4 text-xs">
                  <div className="flex justify-between">
                    <span className="text-(--ink-faint)">Date</span>
                    <span>{new Date(r.updated_at + "Z").toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-(--ink-faint)">Txn ID</span>
                    <span>{r.rzp_payment_id || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-(--ink-faint)">Cart Hash</span>
                    <span className="font-mono text-[10px]">{r.cart_hash.slice(0, 16)}...</span>
                  </div>

                  <div className="border-t border-dashed border-(--ink-faint) pt-4">
                    <span className="text-(--ink-faint) uppercase mb-2 block">Items</span>
                    <ul className="space-y-1">
                      {cart.items.map((item, i) => (
                        <li key={i} className="flex justify-between">
                          <span>{item.qty}x {item.sku}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="border-t-2 border-(--ink) pt-4 mt-6 flex justify-between items-end relative z-10">
                  <span className="uppercase text-(--ink-faint)">Total Paid</span>
                  <span className="text-lg">₹{(r.amount_paise / 100).toLocaleString("en-IN")}</span>
                </div>
                
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 pointer-events-none opacity-[0.12] z-0">
                   <div className="seal seal-green scale-150">SETTLED</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <footer className="mt-8 pt-3 text-center font-clause text-[11px] text-(--ink-soft)">
        <p className="fig">
          <span className="pointer" aria-hidden="true" />
          Every receipt above is cryptographically linked to a signed mandate chain.
        </p>
      </footer>
    </main>
  );
}
