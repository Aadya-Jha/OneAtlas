import { NextRequest } from "next/server";
import { getJob, subscribe } from "@/store/jobs";
import type { SSEEvent } from "@/types";

export const dynamic = "force-dynamic";

function formatSSE(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const job = getJob(params.jobId);

  if (!job) {
    return new Response(JSON.stringify({ error: "Job not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (event: SSEEvent) => {
        try {
          controller.enqueue(encoder.encode(formatSSE(event)));
        } catch (_) {
          // Client disconnected
        }
      };

      // Replay all prior events on reconnect
      for (const event of job.events) {
        send(event);
      }

      // If job is already done, close immediately
      if (job.status === "complete" || job.status === "failed") {
        controller.close();
        return;
      }

      // Subscribe to future events
      const unsubscribe = subscribe(params.jobId, (event) => {
        send(event);
        if (
          event.type === "generation_complete" ||
          event.type === "generation_failed"
        ) {
          setTimeout(() => {
            try {
              controller.close();
            } catch (_) {}
          }, 100);
          unsubscribe();
        }
      });

      // Heartbeat every 15s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`: heartbeat ${new Date().toISOString()}\n\n`)
          );
        } catch (_) {
          clearInterval(heartbeat);
        }
      }, 15000);

      // Cleanup on close
      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };

      // Timeout after 5 minutes
      setTimeout(() => {
        cleanup();
        try {
          controller.close();
        } catch (_) {}
      }, 5 * 60 * 1000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}