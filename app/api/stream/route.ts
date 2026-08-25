import { subscribe, type BazaarEvent } from "@/lib/events/bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/stream — Server-Sent Events feed of the whole bazaar.
 * The visualization floor and dashboard are passive consumers: every state
 * they render arrives here first. Read-only by construction.
 */
export async function GET(req: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      // Greet immediately — headers alone leave EventSource in CONNECTING
      // until the first byte arrives.
      controller.enqueue(encoder.encode(`: bazaar\n\n`));
      const send = (event: BazaarEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          cleanup();
        }
      };

      const unsubscribe = subscribe(send);
      const heartbeat = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch {
            cleanup();
          }
        }
      }, 15_000);

      function cleanup() {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      }

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
