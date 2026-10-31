/**
 * The canvas's side of Fast Refresh (the fast-refresh experiment,
 * `daemon/fast-refresh.ts`): each frame's update in flight, by id. The latest
 * offer alone is answered; an answer to an older one is stale. A refusal, or
 * no answer within the bound, is owed a reload, which `fallBack` pays; a reload
 * by any other path cancels the update in flight, so it pays nothing.
 */
export interface HotUpdates {
	/** Send the frame an update and start its bound. */
	offer(frame: string, post: (id: number) => void): void;
	/** The document's answer: what became of the update it names. */
	answer(frame: string, id: number, ok: boolean): "applied" | "refused" | "stale";
	/** Forget the frame's update in flight, its bound with it. */
	cancel(frame: string): void;
	/** The id of the frame's update in flight, if any. */
	pending(frame: string): number | undefined;
}

export function hotUpdates(
	boundMs: number,
	fallBack: (frame: string) => void,
	timers: {
		set: (run: () => void, ms: number) => unknown;
		clear: (timer: unknown) => void;
	} = {
		set: (run, ms) => setTimeout(run, ms),
		clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
	},
): HotUpdates {
	const inFlight = new Map<string, { id: number; timer: unknown }>();
	let seq = 0;
	const cancel = (frame: string) => {
		const was = inFlight.get(frame);
		if (was === undefined) return;
		timers.clear(was.timer);
		inFlight.delete(frame);
	};
	return {
		offer(frame, post) {
			cancel(frame);
			const id = ++seq;
			const timer = timers.set(() => {
				if (inFlight.get(frame)?.id !== id) return;
				inFlight.delete(frame);
				fallBack(frame);
			}, boundMs);
			inFlight.set(frame, { id, timer });
			post(id);
		},
		answer(frame, id, ok) {
			if (inFlight.get(frame)?.id !== id) return "stale";
			cancel(frame);
			return ok ? "applied" : "refused";
		},
		cancel,
		pending: (frame) => inFlight.get(frame)?.id,
	};
}
