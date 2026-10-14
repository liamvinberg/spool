import type { SSEStreamingApi } from "hono/streaming";

/**
 * How often a long-lived stream says something while nothing is happening.
 *
 * A comment rather than an event: it is bytes on the wire and nothing more, so
 * every parser drops it and no handler has to know it exists. What it buys is
 * the one thing a quiet stream cannot tell you by itself — that it is still
 * there. A connection the network dropped under a sleeping laptop reads exactly
 * like a project nobody is editing, and a browser waits on that forever.
 */
const SSE_HEARTBEAT_MS = 15_000;

/**
 * Keep one stream audible. The returned stop is for a handler that ends of its
 * own accord; a client that hangs up is covered by the abort.
 */
export function beatWhileOpen(stream: SSEStreamingApi): () => void {
	const timer = setInterval(() => {
		// a write to a stream that has already gone is nothing to report
		void stream.write(": beat\n\n").catch(() => {});
	}, SSE_HEARTBEAT_MS);
	timer.unref?.();
	const stop = () => clearInterval(timer);
	stream.onAbort(stop);
	return stop;
}
