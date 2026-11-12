// Where a play's time goes (spool#301).
//
// Four marks per play, named as the page names them (src/runtime/play-marks.ts)
// so a browser tab's can be read the same way: the press this process received,
// the window on screen, the played document's shell painted, and its frame
// revealed. The first two are taken here, the last two by the page and handed
// over its bridge as wall-clock times. A play's line goes to the log once, when
// the frame is revealed, or with what it had when the window closes first.

export type PlayMark = "press" | "window-shown" | "shell-painted" | "frame-revealed";

const ORDER: readonly PlayMark[] = ["press", "window-shown", "shell-painted", "frame-revealed"];

export function isPlayMark(value: unknown): value is PlayMark {
	return typeof value === "string" && (ORDER as readonly string[]).includes(value);
}

export interface PlayTiming {
	/** How the window came: adopted from the warm spare, or made for the press. */
	readonly how: string;
	/** Take a mark; the first of each name counts. True once the play is complete. */
	mark(mark: PlayMark, at: number): boolean;
	/** The marks as milliseconds after the press, for the log; once only. */
	line(): string | undefined;
}

export function playTiming(how: string, pressedAt: number): PlayTiming {
	const marks = new Map<PlayMark, number>([["press", pressedAt]]);
	let logged = false;
	return {
		how,
		mark(mark, at) {
			if (!marks.has(mark) && Number.isFinite(at)) marks.set(mark, at);
			return marks.has("frame-revealed");
		},
		line() {
			if (logged) return undefined;
			logged = true;
			const parts = ORDER.slice(1).map((mark) => {
				const at = marks.get(mark);
				return `${mark}=${at === undefined ? "-" : `${Math.round(at - pressedAt)}ms`}`;
			});
			return [how, ...parts].join(" ");
		},
	};
}

/** Now, as a wall-clock time with the precision a page's marks have. */
export function wallClock(): number {
	return performance.timeOrigin + performance.now();
}
