/** The first wait's ceiling: a first try comes back between half of it and all of it, about a second. */
export const RECONNECT_FIRST_MS = 2_000;
/** The longest any wait gets: a try that keeps failing comes back between half of it and all of it. */
export const RECONNECT_MAX_MS = 30_000;
/** How long a connection must hold before the next drop starts the waits over from the first. */
export const RECONNECT_HELD_MS = 60_000;

/**
 * How long a dropped connection to spool.page waits before it tries again. Each wait is random across the top half
 * of a ceiling that doubles with every try, up to `RECONNECT_MAX_MS`, so everyone a deploy or an overload drops at
 * once comes back spread out, and further apart each time it fails again. Only a connection that held for
 * `RECONNECT_HELD_MS` starts over: one dropped again soon after it came back was dropped by the same trouble.
 */
export interface ReconnectBackoff {
	/** The connection is up: the clock on whether it held starts now. */
	connected(): void;
	/** The connection dropped or a try failed: how long to wait before the next try. */
	next(): number;
}

export function reconnectBackoff(options: { random?: () => number; now?: () => number } = {}): ReconnectBackoff {
	const random = options.random ?? Math.random;
	const now = options.now ?? Date.now;
	let tries = 0;
	let since: number | undefined;
	return {
		connected: () => {
			since = now();
		},
		next: () => {
			if (since !== undefined && now() - since >= RECONNECT_HELD_MS) tries = 0;
			since = undefined;
			const ceiling = Math.min(RECONNECT_MAX_MS, RECONNECT_FIRST_MS * 2 ** tries);
			tries = Math.min(tries + 1, 30);
			return ceiling / 2 + random() * (ceiling / 2);
		},
	};
}
