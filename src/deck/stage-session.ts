/**
 * Where a talk is while it plays (spool#265), and how every command moves it: one pure reducer the stage runs wherever
 * it is hosted (the canvas, the presenter view, the room's window, an exported file). Beats come before slides: next
 * plays the slide's next beat, then the next slide's first; back steps beats, and across a slide boundary lands on the
 * previous slide's last beat.
 */

/** A place in the talk: a slide by its place from 0, and a beat of it from 0. */
export interface At {
	readonly slide: number;
	readonly beat: number;
}

/** One slide as stepping needs it: its frame, how many beats it plays (at least one), and whether it is live. */
export interface TalkSlide {
	readonly frame: string;
	readonly beats: number;
	readonly live: boolean;
}

export type StageState = Readonly<Record<string, unknown>>;

/** What the room's screen holds while it is frozen: the picture at the moment it froze. */
export interface RoomPicture {
	readonly at: At;
	readonly state: StageState;
	readonly takes: Readonly<Record<string, number>>;
}

/**
 * A talk being played, whole: every window showing it applies the newest of these and nothing else, so it is
 * absolute and numbered.
 */
export interface StageSession {
	/** counts every change, so a window holding two keeps the newer */
	readonly revision: number;
	readonly at: At;
	/** the talk's `ui.state`, which every window showing it shares */
	readonly state: StageState;
	/** `ui.state` as it stood when the talk arrived on this slide: what a restart puts back */
	readonly arrival: StageState;
	/** how many times each slide was restarted, by frame: a slide plays in again on each */
	readonly takes: Readonly<Record<string, number>>;
	/** the live slide on screen holds the whole keyboard */
	readonly keys: boolean;
	/** the room's screen is black */
	readonly black: boolean;
	/** the room's screen holds this picture while the talk moves on; null while it follows */
	readonly frozen: RoomPicture | null;
}

export type StageCommand =
	| { readonly kind: "next" }
	| { readonly kind: "back" }
	/** the next slide, its beats skipped */
	| { readonly kind: "next-slide" }
	| { readonly kind: "previous-slide" }
	| { readonly kind: "first" }
	| { readonly kind: "last" }
	/** a slide by place, at its first beat unless a beat is named */
	| { readonly kind: "go"; readonly slide: number; readonly beat?: number }
	/** this slide again from its first beat, its state as the talk found it */
	| { readonly kind: "restart" }
	| { readonly kind: "black"; readonly on: boolean }
	/** the room holds its picture, or catches up */
	| { readonly kind: "freeze"; readonly on: boolean }
	/** a live slide takes the whole keyboard, or gives it back */
	| { readonly kind: "keys"; readonly on: boolean }
	/** what the slide on screen wrote to `ui.state` */
	| { readonly kind: "state"; readonly state: StageState };

/** A talk opening on `at` (clamped into it) with `state` as its `ui.state`. */
export function openSession(talk: readonly TalkSlide[], at: At, state: StageState): StageSession {
	return {
		revision: 0,
		at: clampAt(talk, at),
		state,
		arrival: state,
		takes: {},
		keys: false,
		black: false,
		frozen: null,
	};
}

/** `session` after `command`; the very same object when the command changes nothing. */
export function stepSession(session: StageSession, command: StageCommand, talk: readonly TalkSlide[]): StageSession {
	const next = apply(session, command, talk);
	return next === session ? session : { ...next, revision: session.revision + 1 };
}

function apply(session: StageSession, command: StageCommand, talk: readonly TalkSlide[]): StageSession {
	switch (command.kind) {
		case "next":
			return move(session, nextAt(talk, session.at));
		case "back":
			return move(session, backAt(talk, session.at));
		case "next-slide":
			return move(session, clampAt(talk, { slide: session.at.slide + 1, beat: 0 }));
		case "previous-slide":
			return move(session, clampAt(talk, { slide: session.at.slide - 1, beat: 0 }));
		case "first":
			return move(session, clampAt(talk, { slide: 0, beat: 0 }));
		case "last":
			return move(session, clampAt(talk, { slide: talk.length - 1, beat: 0 }));
		case "go":
			if (!Number.isInteger(command.slide) || command.slide < 0 || command.slide >= talk.length) return session;
			return move(session, clampAt(talk, { slide: command.slide, beat: command.beat ?? 0 }));
		case "restart": {
			const frame = talk[session.at.slide]?.frame;
			if (frame === undefined) return session;
			return {
				...session,
				at: { slide: session.at.slide, beat: 0 },
				state: session.arrival,
				takes: { ...session.takes, [frame]: (session.takes[frame] ?? 0) + 1 },
				keys: false,
			};
		}
		case "black":
			return session.black === command.on ? session : { ...session, black: command.on };
		case "freeze":
			if (command.on === (session.frozen !== null)) return session;
			return { ...session, frozen: command.on ? roomPicture(session) : null };
		case "keys": {
			const live = talk[session.at.slide]?.live === true;
			const on = command.on && live;
			return session.keys === on ? session : { ...session, keys: on };
		}
		case "state":
			return sameState(session.state, command.state) ? session : { ...session, state: command.state };
	}
}

/** The talk moved: a new slide is arrived at with the state as it stands, and the keyboard comes back to the talk. */
function move(session: StageSession, at: At): StageSession {
	if (at.slide === session.at.slide && at.beat === session.at.beat) return session;
	if (at.slide === session.at.slide) return { ...session, at };
	return { ...session, at, arrival: session.state, keys: false };
}

/** What the room's screen shows of `session`: the frozen picture while it is frozen, the talk as it is otherwise. */
export function roomPicture(session: StageSession): RoomPicture {
	return session.frozen ?? { at: session.at, state: session.state, takes: session.takes };
}

/** The next beat, else the next slide's first, else where it is. */
export function nextAt(talk: readonly TalkSlide[], at: At): At {
	const slide = talk[at.slide];
	if (slide !== undefined && at.beat < slide.beats - 1) return { slide: at.slide, beat: at.beat + 1 };
	if (at.slide >= talk.length - 1) return at;
	return { slide: at.slide + 1, beat: 0 };
}

/** The beat before, else the previous slide's last, else where it is. */
export function backAt(talk: readonly TalkSlide[], at: At): At {
	if (at.beat > 0) return { slide: at.slide, beat: at.beat - 1 };
	if (at.slide <= 0) return at;
	const before = talk[at.slide - 1];
	return { slide: at.slide - 1, beat: Math.max(0, (before?.beats ?? 1) - 1) };
}

/** `at` moved into the talk: a slide past either end is the end, a beat past the slide's is its last. */
export function clampAt(talk: readonly TalkSlide[], at: At): At {
	if (talk.length === 0) return { slide: 0, beat: 0 };
	const slide = Math.min(Math.max(0, Math.trunc(at.slide)), talk.length - 1);
	const beats = Math.max(1, talk[slide]?.beats ?? 1);
	return { slide, beat: Math.min(Math.max(0, Math.trunc(at.beat)), beats - 1) };
}

function sameState(a: StageState, b: StageState): boolean {
	return a === b || JSON.stringify(a) === JSON.stringify(b);
}
