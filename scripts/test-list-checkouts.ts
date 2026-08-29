import { db } from "../lib/db";
import { listOpenCheckouts } from "../lib/checkout/conversational";

async function main() {
  const checkouts = await listOpenCheckouts("http://localhost:3000");
  console.log("Checkouts:", checkouts);
}
main().catch(console.error);
