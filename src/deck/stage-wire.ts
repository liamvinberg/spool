import type { Size } from "./deck-file";
import type { KeyCommand } from "./stage-keys";
import type { At, RoomPicture, StageCommand, StageSession, TalkSlide } from "./stage-session";

/**
 * What a stage and its host say to each other (spool#265). The stage is the talk playing in a render document; its
 * host is whatever window embeds that document (the room's, the presenter view, the canvas) and speaks to it over the
 * player's private port. A host either leaves the session to the stage and sends it commands (`own`), or holds the
 * session itself and gives the stage each new one to show (`follow`).
 */

/** One slide of the talk as the render document is told it. */
export interface StageSlideConfig extends TalkSlide {
	/** the frame's own size; a slide of another shape than the talk is fitted and centred on it */
	readonly w: number;
	readonly h: number;
}

/** The talk a deck's render document plays, in its play config. */
export interface StageConfig {
	readonly page: string;
	/** the talk's size: the document's viewport, which no slide ever changes */
	readonly size: Size;
	readonly slides: readonly StageSlideConfig[];
}

/**
 * How ready a slide is to be shown. `ready`: showing it needs nothing more from the network, the compiler or a decoder.
 * `loading`: not yet. `broken`: it will not show, or broke while it showed, and `why` says how.
 */
export interface SlideReadiness {
	readonly frame: string;
	readonly status: "ready" | "loading" | "broken";
	/** what went wrong, as the compiler or the slide said it */
	readonly why?: string;
	/**
	 * When it broke: its code does not compile, its module would not load, it threw as it mounted (it never reached the
	 * room's screen), or it threw later, on screen.
	 */
	readonly when?: "compile" | "load" | "mount" | "later";
	/**
	 * What the room kept of a slide that broke on screen: its last picture as a still copy, or that copy without what
	 * its WebGL canvases drew, which a copy cannot read back once a frame has shown.
	 */
	readonly kept?: "picture" | "picture-without-webgl";
	/** the most WebGL contexts it was seen to draw with, once it drew with any: what readying it ahead costs (spool#320) */
	readonly webgl?: number;
}

/** What the stage put on screen, after a command or a session asked for it. */
export interface StageShown {
	readonly at: At;
	readonly frame: string;
	/** how many times the slide was restarted */
	readonly take: number;
	/** the slide was ready when the command arrived */
	readonly ready: boolean;
	/** the slide is broken, and the room kept the picture it had */
	readonly held: boolean;
	/** animation frames between the command arriving and the slide committed; within a frame is 0 or 1 */
	readonly frames: number;
	/** how long it was held waiting for the slide, in ms */
	readonly waited: number;
}

export type StageMode = "own" | "follow";

/**
 * The WebGL contexts each stage of a talk presented from the presenter view may hold (spool#320), the slide on screen's
 * among them: shares of the sixteen Chrome keeps alive in one process, where the room's stage, the presenter's slide
 * and the next pane all play. The room's screen comes first; the next pane keeps nothing but the slide it shows. With
 * slides of up to five contexts the three stay within sixteen: the room six or its slide's own, the presenter's slide
 * two or its own, the next pane its slide's.
 */
export const PRESENTED_WEBGL = { room: 6, slide: 2, next: 0 } as const;

/**
 * The same, once the room's stage plays in a process of its own, on the room's host: there it may hold fifteen, and
 * the presenter's slide what the next pane's slide leaves of the sixteen in theirs.
 */
export const PRESENTED_WEBGL_APART = { room: 15, slide: 10, next: 0 } as const;

/**
 * The slides a stage holding `share` WebGL contexts cannot ready ahead beside the one before them, by the contexts each
 * draws with: such a slide makes them, and compiles its shaders, as it goes on, as late as its own cost makes it.
 */
export function tooHeavyAhead(slides: readonly SlideReadiness[], share: number): Map<string, number> {
	const heavy = new Map<string, number>();
	slides.forEach((slide, index) => {
		const own = slide.webgl ?? 0;
		if (own > 0 && own + (slides[index - 1]?.webgl ?? 0) > share) heavy.set(slide.frame, own);
	});
	return heavy;
}

/** Where the pointer stands over a live slide, on the talk's screen: from 0 to 1 across and down. */
export interface StagePointer {
	readonly x: number;
	readonly y: number;
}

/** host → stage */
export type HostMessage =
	/**
	 * The first word, once the stage's port is connected. `room`: the stage draws the room's states (black, frozen),
	 * as the room's screen does and a presenter's own slide does not. `session` opens it where a talk already is;
	 * `frame` names the slide its `at` was on, so a talk changed since finds the slide again.
	 */
	| {
			readonly spool: "stage-open";
			readonly mode: StageMode;
			readonly room: boolean;
			/** no room watches the talk: it plays in place, where B, the period and F are nobody's keys */
			readonly alone?: true;
			/** the slides fill the host's screen, which is the room's (spool#298): B and the period black it, F is nobody's */
			readonly filling?: true;
			/**
			 * its first slide goes on at rest, its entrances played: the host shows the slide's picture, at rest, until the
			 * stage has drawn it, and takes the picture away in the frame it has (spool#316)
			 */
			readonly rest?: true;
			/**
			 * the WebGL contexts the stage may hold, the slide on screen's among them: its share of what the browser keeps
			 * alive in the process it shares with other documents. A slide whose contexts would not fit is not put on ahead.
			 */
			readonly webgl?: number;
			readonly session?: StageSession;
			readonly frame?: string;
	  }
	/** a command for a stage that owns its session */
	| { readonly spool: "stage-command"; readonly command: StageCommand }
	/**
	 * the session a following stage shows, or that an owning one takes over, with the mode it plays in from now.
	 * `cut`: the slide it names goes on in one frame, at rest, with no dissolve from the one showing, for a stage nobody
	 * was watching until now (the canvas's, as a slide is gone into)
	 */
	| {
			readonly spool: "stage-apply";
			readonly session: StageSession;
			readonly mode?: StageMode;
			readonly cut?: true;
	  }
	/** the pointer hidden over the stage's document, or shown again: the slides fill the screen and nobody's hand moves */
	| { readonly spool: "stage-cursor"; readonly hidden: boolean }
	/** the WebGL contexts the stage may hold from now, its process shared otherwise than it was (spool#320) */
	| { readonly spool: "stage-webgl"; readonly webgl: number };

/** stage → host */
export type StageMessage =
	/** the talk as this stage plays it, once it boots */
	| { readonly spool: "stage-talk"; readonly slides: readonly TalkSlide[] }
	/** every change to the session a stage owns */
	| { readonly spool: "stage-session"; readonly session: StageSession }
	/** every slide's readiness, whenever one changes */
	| { readonly spool: "stage-slides"; readonly slides: readonly SlideReadiness[] }
	| { readonly spool: "stage-shown"; readonly shown: StageShown }
	/** the session of that revision the host applied is on the screen, whether or not anything moved */
	| { readonly spool: "stage-applied"; readonly revision: number }
	/** a command the stage does not carry out itself: a host's own, and every command while it follows */
	| { readonly spool: "stage-command"; readonly command: KeyCommand }
	/** the pointer over the live slide on screen, for the room's soft dot; null once it leaves, or the slide is not live */
	| { readonly spool: "stage-pointer"; readonly at: StagePointer | null };

type Loose = Record<string, unknown>;

const isRecord = (value: unknown): value is Loose =>
	typeof value === "object" && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

function parseAt(value: unknown): At | undefined {
	if (!isRecord(value) || !isCount(value.slide) || !isCount(value.beat)) return undefined;
	return { slide: value.slide, beat: value.beat };
}

function parseTakes(value: unknown): Record<string, number> | undefined {
	if (!isRecord(value)) return undefined;
	return Object.values(value).every(isCount) ? (value as Record<string, number>) : undefined;
}

function parsePicture(value: unknown): RoomPicture | null | undefined {
	if (value === null) return null;
	if (!isRecord(value)) return undefined;
	const at = parseAt(value.at);
	const takes = parseTakes(value.takes);
	if (at === undefined || takes === undefined || !isRecord(value.state)) return undefined;
	return { at, state: value.state, takes };
}

export function parseSession(value: unknown): StageSession | undefined {
	if (!isRecord(value) || !isCount(value.revision)) return undefined;
	const at = parseAt(value.at);
	const takes = parseTakes(value.takes);
	const frozen = parsePicture(value.frozen);
	if (at === undefined || takes === undefined || frozen === undefined) return undefined;
	if (!isRecord(value.state) || !isRecord(value.arrival)) return undefined;
	if (typeof value.keys !== "boolean" || typeof value.black !== "boolean") return undefined;
	return {
		revision: value.revision,
		at,
		state: value.state,
		arrival: value.arrival,
		takes,
		keys: value.keys,
		black: value.black,
		frozen,
	};
}

const MOVES = new Set(["next", "back", "next-slide", "previous-slide", "first", "last", "restart"]);
const TOGGLES = new Set(["black", "freeze", "keys"]);
const HOSTS = new Set(["escape", "swap", "help", "show-pointer", "blur"]);

export function parseCommand(value: unknown): StageCommand | undefined {
	if (!isRecord(value) || typeof value.kind !== "string") return undefined;
	if (MOVES.has(value.kind)) return { kind: value.kind } as StageCommand;
	if (TOGGLES.has(value.kind)) {
		return typeof value.on === "boolean" ? ({ kind: value.kind, on: value.on } as StageCommand) : undefined;
	}
	if (value.kind === "go") {
		if (typeof value.slide !== "number" || !Number.isInteger(value.slide)) return undefined;
		if (value.beat !== undefined && !isCount(value.beat)) return undefined;
		return value.beat === undefined
			? { kind: "go", slide: value.slide }
			: { kind: "go", slide: value.slide, beat: value.beat };
	}
	if (value.kind === "state") return isRecord(value.state) ? { kind: "state", state: value.state } : undefined;
	return undefined;
}

export function parseKeyCommand(value: unknown): KeyCommand | undefined {
	if (isRecord(value) && typeof value.kind === "string" && HOSTS.has(value.kind))
		return { kind: value.kind } as KeyCommand;
	return parseCommand(value);
}

const isMode = (value: unknown): value is StageMode => value === "own" || value === "follow";

/** A host's word to a stage, checked. */
export function parseHostMessage(value: unknown): HostMessage | undefined {
	if (!isRecord(value)) return undefined;
	if (value.spool === "stage-open") {
		if (!isMode(value.mode) || typeof value.room !== "boolean") return undefined;
		const session = value.session === undefined ? undefined : parseSession(value.session);
		if (value.session !== undefined && session === undefined) return undefined;
		if (value.frame !== undefined && typeof value.frame !== "string") return undefined;
		return {
			spool: "stage-open",
			mode: value.mode,
			room: value.room,
			...(value.alone === true ? { alone: true } : {}),
			...(value.filling === true ? { filling: true } : {}),
			...(value.rest === true ? { rest: true } : {}),
			...(isCount(value.webgl) ? { webgl: value.webgl } : {}),
			...(session === undefined ? {} : { session }),
			...(typeof value.frame === "string" ? { frame: value.frame } : {}),
		};
	}
	if (value.spool === "stage-command") {
		const command = parseCommand(value.command);
		return command === undefined ? undefined : { spool: "stage-command", command };
	}
	if (value.spool === "stage-apply") {
		const session = parseSession(value.session);
		if (session === undefined || (value.mode !== undefined && !isMode(value.mode))) return undefined;
		return {
			spool: "stage-apply",
			session,
			...(isMode(value.mode) ? { mode: value.mode } : {}),
			...(value.cut === true ? { cut: true } : {}),
		};
	}
	if (value.spool === "stage-cursor") {
		return typeof value.hidden === "boolean" ? { spool: "stage-cursor", hidden: value.hidden } : undefined;
	}
	if (value.spool === "stage-webgl")
		return isCount(value.webgl) ? { spool: "stage-webgl", webgl: value.webgl } : undefined;
	return undefined;
}

function parseTalk(value: unknown): TalkSlide[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const slides: TalkSlide[] = [];
	for (const slide of value) {
		if (
			!isRecord(slide) ||
			typeof slide.frame !== "string" ||
			!isCount(slide.beats) ||
			typeof slide.live !== "boolean"
		) {
			return undefined;
		}
		slides.push({ frame: slide.frame, beats: slide.beats, live: slide.live });
	}
	return slides;
}

const STATUSES = new Set(["ready", "loading", "broken"]);
const WHENS = new Set(["compile", "load", "mount", "later"]);
const KEPT = new Set(["picture", "picture-without-webgl"]);

function parseReadiness(value: unknown): SlideReadiness[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const slides: SlideReadiness[] = [];
	for (const slide of value) {
		if (!isRecord(slide) || typeof slide.frame !== "string" || !STATUSES.has(String(slide.status))) return undefined;
		slides.push({
			frame: slide.frame,
			status: slide.status as SlideReadiness["status"],
			...(typeof slide.why === "string" ? { why: slide.why } : {}),
			...(WHENS.has(String(slide.when)) ? { when: slide.when as NonNullable<SlideReadiness["when"]> } : {}),
			...(KEPT.has(String(slide.kept)) ? { kept: slide.kept as NonNullable<SlideReadiness["kept"]> } : {}),
			...(isCount(slide.webgl) ? { webgl: slide.webgl } : {}),
		});
	}
	return slides;
}

function parseShown(value: unknown): StageShown | undefined {
	if (!isRecord(value)) return undefined;
	const at = parseAt(value.at);
	if (at === undefined || typeof value.frame !== "string" || !isCount(value.take)) return undefined;
	if (typeof value.ready !== "boolean" || typeof value.held !== "boolean") return undefined;
	if (!isCount(value.frames) || typeof value.waited !== "number") return undefined;
	const { frame, take, ready, held, frames, waited } = value;
	return { at, frame, take, ready, held, frames, waited };
}

/** A stage's word to its host, checked. */
export function parseStageMessage(value: unknown): StageMessage | undefined {
	if (!isRecord(value)) return undefined;
	switch (value.spool) {
		case "stage-talk": {
			const slides = parseTalk(value.slides);
			return slides === undefined ? undefined : { spool: "stage-talk", slides };
		}
		case "stage-session": {
			const session = parseSession(value.session);
			return session === undefined ? undefined : { spool: "stage-session", session };
		}
		case "stage-slides": {
			const slides = parseReadiness(value.slides);
			return slides === undefined ? undefined : { spool: "stage-slides", slides };
		}
		case "stage-shown": {
			const shown = parseShown(value.shown);
			return shown === undefined ? undefined : { spool: "stage-shown", shown };
		}
		case "stage-applied":
			return isCount(value.revision) ? { spool: "stage-applied", revision: value.revision } : undefined;
		case "stage-command": {
			const command = parseKeyCommand(value.command);
			return command === undefined ? undefined : { spool: "stage-command", command };
		}
		case "stage-pointer": {
			const at = parsePointer(value.at);
			return at === undefined ? undefined : { spool: "stage-pointer", at };
		}
		default:
			return undefined;
	}
}

const isShare = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

/** A pointer's place on the talk's screen, or null for none; undefined when it is neither. */
export function parsePointer(value: unknown): StagePointer | null | undefined {
	if (value === null) return null;
	if (!isRecord(value) || !isShare(value.x) || !isShare(value.y)) return undefined;
	return { x: value.x, y: value.y };
}

/**
 * What a change the daemon published (an event of `/api/p/:project/events`) means for a stage playing `talk` on `page`:
 * `build` when the talk's code changed (a slide's source, or a file its source reaches) and the stage takes a new
 * build; `talk` when the deck or a slide's sidecar changed, which may or may not change the talk (its order, a slide's
 * size) and is read again to know; nothing otherwise.
 */
export function stageChange(change: unknown, talk: readonly string[], page: string): "build" | "talk" | undefined {
	if (!isRecord(change)) return undefined;
	switch (change.kind) {
		case "frame":
			return typeof change.frame === "string" && talk.includes(change.frame) ? "build" : undefined;
		case "shared":
			return !Array.isArray(change.frames) || change.frames.some((frame) => talk.includes(String(frame)))
				? "build"
				: undefined;
		case "geometry":
			return typeof change.frame === "string" && talk.includes(change.frame) ? "talk" : undefined;
		case "deck":
			return change.page === page ? "talk" : undefined;
		default:
			return undefined;
	}
}
