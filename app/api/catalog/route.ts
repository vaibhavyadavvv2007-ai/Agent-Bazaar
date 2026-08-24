import { NextRequest, NextResponse } from "next/server";
import { db, rowsToObjects } from "@/lib/db";

export const dynamic = "force-dynamic";

type Product = {
  id: string;
  sku: string;
  title: string;
  description: string;
  category: string;
  price_paise: number;
  stock: number;
  tags: string;
  stall_x: number;
  stall_y: number;
};

/**
 * GET /api/catalog            → JSON array of products
 * GET /api/catalog?format=agent → agent-readable feed: instructions + structured items.
 * This is the first brick of "transactable by AI buyers": a catalog an LLM can
 * read without scraping HTML.
 */
export async function GET(req: NextRequest) {
  let products: Product[];
  try {
    products = rowsToObjects<Product>(
      await db().execute(
        `SELECT id, sku, title, description, category, price_paise, stock, tags, stall_x, stall_y
         FROM products WHERE stock > 0 ORDER BY category, title`
      )
    );
  } catch (e) {
    return NextResponse.json({ error: "catalog unavailable", detail: String(e) }, { status: 503 });
  }

  if (req.nextUrl.searchParams.get("format") !== "agent") {
    return NextResponse.json({ count: products.length, products });
  }

  // Agent-facing view: same truth, shaped for tool-using LLMs.
  const items = products.map((p) => ({
    sku: p.sku,
    title: p.title,
    description: p.description,
    category: p.category,
    price_inr: p.price_paise / 100,
    in_stock: p.stock > 0,
    tags: JSON.parse(p.tags || "[]"),
  }));

  return NextResponse.json(
    {
      store: "The Agent Bazaar",
      currency: "INR",
      note_for_agents:
        "To purchase: create an INTENT mandate, propose a CART, then request checkout. " +
        "All spending is subject to the merchant's policy engine; some requests route to human approval.",
      endpoints: {
        search_catalog: "/api/catalog?format=agent",
        mandates: "POST /api/mandates",
        checkout: "POST /api/checkout",
        mcp: "/api/mcp",
      },
      items,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
