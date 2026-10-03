/**
 * The events door, answered the way the daemon answers it: a body that stays open.
 *
 * `subscribeSse` reads this stream over `fetch`, so a door that hands back a finished
 * body is a connection that dropped the instant it opened. It reconnects on a 250-500ms
 * backoff and, because every connection after the first is a return, tells the canvas to
 * resync each time: it reads the frames again, putting back any geometry a gesture had
 * moved, and reloads every frame document, which drops the picks. Left finished, that is
 * a reconnect storm undoing whatever a test is in the middle of, whenever a slow run
 * outlasts the backoff. A stream nobody ends is one connection and no returns.
 */
export const openEventStream = (): Response =>
	new Response(new ReadableStream<Uint8Array>({ start: () => {} }), {
		headers: { "content-type": "text/event-stream" },
	});
