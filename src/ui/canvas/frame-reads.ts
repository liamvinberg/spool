import type { Cover } from "../../cover";

/**
 * The canvas's reads of the frame list, and the covers the event stream
 * brings between them, put in the order they happened.
 *
 * A read is answered as the daemon stood when it was asked, and reads can
 * land in any order. A cover the photo booth writes while one is on its way
 * reaches the canvas as an event first and is then undone by that read's older
 * answer, leaving the canvas asking for a still the store has already let go
 * of: the frame never gets its picture. So a read that lands after a later one
 * is dropped, and a cover heard after a read was asked stands over that read's
 * answer.
 */
export interface FrameReads {
	/** A read is being asked: its ticket, handed back to `settle` with the answer. */
	ask(): number;
	/** The event stream brought a frame's new cover. */
	note(frame: string, cover: Cover): void;
	/** A read answered: the frames to show, or undefined when a later read already landed. */
	settle<F extends { name: string; cover?: Cover }>(ticket: number, frames: readonly F[]): F[] | undefined;
}

export function createFrameReads(): FrameReads {
	let asked = 0;
	let landed = 0;
	/** Covers heard, each with the last read asked before it. */
	const heard = new Map<string, { cover: Cover; after: number }>();
	return {
		ask: () => {
			asked += 1;
			return asked;
		},
		note: (frame, cover) => {
			heard.set(frame, { cover, after: asked });
		},
		settle: (ticket, frames) => {
			if (ticket < landed) return undefined;
			landed = ticket;
			// a cover heard before this read was asked is in its answer already
			for (const [frame, entry] of heard) if (entry.after < ticket) heard.delete(frame);
			return frames.map((frame) => {
				const entry = heard.get(frame.name);
				return entry === undefined || entry.cover.hash === frame.cover?.hash
					? frame
					: { ...frame, cover: entry.cover };
			});
		},
	};
}
