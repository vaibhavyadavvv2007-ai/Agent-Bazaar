/**
 * Server-side barrel. Importing this module guarantees the Razorpay rail is
 * registered into the mandate pipeline before any request runs.
 */
import "@/lib/razorpay/rail";

export * from "@/lib/mandates/pipeline";
export { issueRailForMandate } from "@/lib/razorpay/rail";
