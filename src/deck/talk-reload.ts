import { stageChange } from "./stage-wire";

/**
 * When a stage takes a saved change to its talk (spool#265), whichever window hosts it: once the folder has been quiet
 * for a moment, a new build for a change to a slide's code, and for a change to the deck (its order, notes or a slide's
 * size) only when the talk the daemon would play now is another. A burst is one reload, and a change to the code in it
 * is never let go for a change to the deck heard after it.
 */

/** How long the folder has to be quiet before a saved change is taken: an editor's save is often several writes. */
export const QUIET_MS = 250;

export interface TalkReloadOptions {
	/** the deck page whose talk is playing */
	readonly page: string;
	/** the talk's frames, as the stage now plays them */
	frames(): readonly string[];
	/** take a new build */
	reload(): void;
	/** whether the talk the daemon would play now is another than the one playing */
	changed(): Promise<boolean>;
}

export interface TalkReloads {
	/** a change to the project, as its event stream says it */
	heard(change: unknown): void;
	stop(): void;
}

export function talkReloads(options: TalkReloadOptions): TalkReloads {
	/** what the burst so far asks for: a new build outranks a second look at the talk */
	let pending: "build" | "talk" | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const act = () => {
		const now = pending;
		pending = undefined;
		if (now === "build") options.reload();
		else if (now === "talk")
			void options.changed().then(
				(changed) => changed && options.reload(),
				() => {},
			);
	};
	return {
		heard(change) {
			const kind = stageChange(change, options.frames(), options.page);
			if (kind === undefined) return;
			pending = pending === "build" ? "build" : kind;
			clearTimeout(timer);
			timer = setTimeout(act, QUIET_MS);
		},
		stop() {
			clearTimeout(timer);
			pending = undefined;
		},
	};
}
