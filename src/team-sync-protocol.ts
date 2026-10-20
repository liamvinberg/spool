/**
 * The sync protocol between a team project's sync object and each editor's daemon: the contract, versioned.
 * This is its one copy: spool-cloud's sync object imports it as `spool.page/sync-protocol`.
 *
 * A daemon opens one WebSocket per local copy, says `hello` with the last team version it has applied, and is
 * sent every path the team changed since. After that each side sends what happens as it happens: the daemon
 * every local save, whole, and the object every teammate's save, in the order the object gave them.
 *
 * Control messages are JSON text frames. A message carrying a file's bytes is a binary frame: a 4-byte
 * big-endian length, that many bytes of JSON header, then the file's bytes exactly as they are on disk.
 */
export const PROTOCOL_VERSION = 2;

/** A team version: the number the object gave the save that made it. Versions only grow. */
export type Version = number;

/** Daemon → object: the first message on a connection. */
export interface Hello {
	type: "hello";
	protocol: number;
	/** The design/ format the daemon writes (core's FORMAT_VERSION). */
	format: number;
	/** The newest team version this local copy has applied; 0 for none. */
	since: Version;
	/**
	 * This connection moves a project in (DEV-232): its saves count against neither the minute's bucket nor the
	 * month while the team project holds nothing but the move's files. An object that doesn't know it counts them.
	 */
	moving?: true;
	/** The daemon reads `files`: what a teammate sent as one bundle comes down as one. */
	bundles?: true;
}

/**
 * How full the team project's minute bucket is, on a welcome and on every answer to a save, so a daemon holds its
 * next save until it fits rather than uploading a file to be refused. Absent for a move, and from an older object.
 */
export interface Pace {
	/** Whole saves the bucket holds now. */
	room: number;
	/** Saves it refills a minute. */
	refill: number;
}

/**
 * Daemon → object: one saved file, whole, or its deletion. `base` is the team version the save was built on, null
 * for a path the local copy never had from the team. The bytes ride the binary frame; a delete is a text frame.
 */
export interface Save {
	type: "save";
	/** The daemon's own reference, echoed in the answer. */
	ref: string;
	path: string;
	base: Version | null;
	deleted: boolean;
}

/** Object → daemon: the answer to `hello`, before any catch-up. */
export interface Welcome {
	type: "welcome";
	protocol: number;
	/** The format the team project was started in. */
	format: number;
	/** The newest team version. */
	head: Version;
	pace?: Pace;
	/** The object takes `saves`. An older one doesn't say, and its daemons send each save alone. */
	bundles?: true;
}

/**
 * Daemon → object: saves made together, as a cleanup or an agent's turn makes them, sent as one message and
 * answered with one `answers`. Each is ordered, checked against its own base and applied or set aside on its own, as
 * a lone `save` is; together they take one save from the minute's bucket and count as one of the month's. Their
 * bytes ride the binary frame one after another, each `size` long; a bundle of deletes alone is a text frame.
 */
export interface Saves {
	type: "saves";
	saves: BundledSave[];
}

export interface BundledSave {
	ref: string;
	path: string;
	base: Version | null;
	deleted: boolean;
	/** Its bytes in the frame; 0 for a delete. */
	size: number;
}

/** The most saves one bundle carries. */
export const BUNDLE_SAVES = 1_000;
/** The most bytes one bundle carries, well under the 32 MiB a message to spool.page may be; a bigger file goes alone. */
export const BUNDLE_BYTES = 16_000_000;

/** Object → the saving daemon: the answer to each save in a bundle, in its order, and how full the bucket is now. */
export interface Answers {
	type: "answers";
	answers: (Omit<Saved, "pace"> | Omit<SetAside, "pace"> | Omit<Refused, "pace">)[];
	pace?: Pace;
}

/**
 * Object → a daemon whose hello said `bundles`: a teammate's bundle, every applied save in it, in order. Their
 * bytes ride the binary frame as a bundle's do.
 */
export interface TeamFiles {
	type: "files";
	files: (Omit<TeamFile, "type"> & { size: number })[];
}

/**
 * The bytes of each entry of a bundle, cut from its frame's bytes in order: undefined for a delete. Null when the
 * sizes don't account for the bytes exactly, which no well-formed bundle does.
 */
export function bundleParts(
	entries: readonly { deleted: boolean; size: number }[],
	bytes: Uint8Array | undefined,
): (Uint8Array | undefined)[] | null {
	const parts: (Uint8Array | undefined)[] = [];
	let at = 0;
	for (const { deleted, size } of entries) {
		if (!Number.isSafeInteger(size) || size < 0 || (deleted && size !== 0)) return null;
		if (deleted) {
			parts.push(undefined);
			continue;
		}
		if (bytes === undefined || at + size > bytes.byteLength) return null;
		parts.push(bytes.subarray(at, at + size));
		at += size;
	}
	return at === (bytes?.byteLength ?? 0) ? parts : null;
}

/** A bundle's bytes, each file's after the last: undefined when every entry is a delete. */
export function joinParts(parts: readonly (Uint8Array | undefined)[]): Uint8Array | undefined {
	const files = parts.filter((part): part is Uint8Array => part !== undefined);
	if (files.length === 0) return undefined;
	const joined = new Uint8Array(files.reduce((sum, part) => sum + part.byteLength, 0));
	let at = 0;
	for (const part of files) {
		joined.set(part, at);
		at += part.byteLength;
	}
	return joined;
}

/** Object → daemon: one path as the team has it now, bytes in the binary frame unless it was deleted. */
export interface TeamFile {
	type: "file";
	path: string;
	version: Version;
	deleted: boolean;
	/** Whose save it was, and from which machine. Absent in a catch-up. */
	by?: { accountId: string; device: string };
}

/** Object → daemon: every change since `hello`'s version has been sent. */
export interface CaughtUp {
	type: "caught-up";
	head: Version;
}

/** Object → the saving daemon: its save is the team's version now. */
export interface Saved {
	type: "saved";
	ref: string;
	path: string;
	version: Version;
	pace?: Pace;
}

/**
 * Object → the saving daemon: the save was built on a version the team has moved past, so it was kept in history
 * and not applied. The team's version of the path follows as a `file` message.
 */
export interface SetAside {
	type: "set-aside";
	ref: string;
	path: string;
	/** The team's version, which stands. */
	version: Version;
	/** Whose save stands, and from which machine. */
	by: { accountId: string; device: string };
	pace?: Pace;
}

/** Object → daemon: a save that can't be taken at all, such as a path outside the layout. */
export interface Refused {
	type: "refused";
	ref: string;
	path: string;
	reason: "outside_layout" | "invalid_save" | "too_large" | Unauthorized | Limited;
	/** For a limit: seconds until it may lift, when the object can say. */
	retryAfter?: number;
	pace?: Pace;
}

/** Object → the saving daemon: its editor has made `made` of the month's `limit` saves to the project. Said once, at 80%. */
export interface MonthCount {
	type: "month";
	made: number;
	limit: number;
}

/**
 * Daemon → object: send the team's version of these paths again. A local copy asks when git wrote over them (a
 * checkout, pull, reset or merge), so it can put the team's version back instead of sending git's. Answered with a
 * `file` for each path the team has; a path it never had is left out.
 */
export interface Resend {
	type: "resend";
	paths: string[];
}

/** The most paths one `resend` may name; a local copy asks for more in several. */
export const RESEND_PATHS = 500;

/**
 * Daemon → object: the agent this daemon runs on the project finished its turn. The pages its person saved to
 * settle for outsiders (unless someone else is saving to them too); an agent the daemon did not start never says
 * this, and its pages settle after a quiet spell instead.
 */
export interface TurnEnded {
	type: "turn-ended";
}

export type DaemonMessage = Hello | Save | Saves | Resend | TurnEnded | CommentPost | CommentReplyPost;
export type ObjectMessage =
	| Welcome
	| TeamFile
	| TeamFiles
	| CaughtUp
	| Saved
	| SetAside
	| Refused
	| Answers
	| MonthCount
	| CommentsMessage;

/** A message and the bytes riding with it, if any. */
export interface Framed<T> {
	message: T;
	bytes?: Uint8Array;
}

/** Text for a control message, a binary frame for one with bytes. */
export function encodeFrame(message: object, bytes?: Uint8Array): string | Uint8Array {
	const header = JSON.stringify(message);
	if (bytes === undefined) return header;
	const head = new TextEncoder().encode(header);
	const frame = new Uint8Array(4 + head.byteLength + bytes.byteLength);
	new DataView(frame.buffer).setUint32(0, head.byteLength);
	frame.set(head, 4);
	frame.set(bytes, 4 + head.byteLength);
	return frame;
}

/** The message in a frame and its bytes; null for anything that isn't a well-formed frame. */
export function decodeFrame(data: string | ArrayBuffer | Uint8Array): Framed<Record<string, unknown>> | null {
	try {
		if (typeof data === "string") {
			const message: unknown = JSON.parse(data);
			return isRecord(message) ? { message } : null;
		}
		const frame = data instanceof Uint8Array ? data : new Uint8Array(data);
		if (frame.byteLength < 4) return null;
		const length = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(0);
		if (4 + length > frame.byteLength) return null;
		const message: unknown = JSON.parse(new TextDecoder().decode(frame.subarray(4, 4 + length)));
		return isRecord(message) ? { message, bytes: frame.slice(4 + length) } : null;
	} catch {
		return null;
	}
}

/**
 * Whether a design/-relative path is Spool's own layout, the only files a sync carries: `canvas.json`,
 * `AGENTS.md`, `CLAUDE.md`, and anything under `frames/` or `shared/` that passes through no dot-folder.
 * `design/.gitignore`, `.spool/` and every foreign dot-folder stay on the machine that wrote them.
 */
export function travels(path: string): boolean {
	if (path === "canvas.json" || path === "AGENTS.md" || path === "CLAUDE.md") return true;
	const segments = path.split("/");
	if (segments.length < 2 || (segments[0] !== "frames" && segments[0] !== "shared")) return false;
	return segments.every((segment) => segment !== "" && !segment.startsWith(".") && !/[\\\0]/u.test(segment));
}

// Guarded sync: who may write, and the fair-use limits. The object enforces them; the daemon says why.

/**
 * Why a save from this connection is refused before anything else is looked at. `signed_out`: its device
 * session was revoked or has expired. `not_editor`: its account is no longer an editor or admin of the team,
 * or the team or the project is gone. The object closes the connection after either.
 */
export type Unauthorized = "signed_out" | "not_editor";

/**
 * A fair-use limit the save would pass, or the object couldn't check the save at all. `rate_limited` is a wait: the
 * daemon sends the save again after `retryAfter`. On the others sync pauses until it lifts, and the file stays where
 * it was written.
 */
export type Limited = "project_full" | "rate_limited" | "monthly_limit" | "unavailable";

/** The largest file that travels; a bigger one is refused as `too_large` and stays on its machine. */
export const FILE_LIMIT_BYTES = 25_000_000;
/** The most a team project's design/ may hold. */
export const PROJECT_LIMIT_BYTES = 1_000_000_000;
/** Saves a team project's minute bucket refills a minute, from everyone together, unless a maintainer raised it. */
export const SAVES_PER_MINUTE = 120;
/** Saves the bucket holds: a burst this big goes through at once, and it starts full. */
export const SAVE_BUCKET = 2_000;
/** Saves one editor makes to a team project in a calendar month (UTC). */
export const SAVES_PER_MONTH = 30_000;

/*
 * Why the object closed a connection, every code it closes with. A daemon answers each as it says.
 */

/** A message the object can't take: outside the layout, malformed, or before `hello`. A broken peer; no retry helps. */
export const CLOSE_INVALID = 4400;
/** Its device session was revoked or has expired. */
export const CLOSE_SIGNED_OUT = 4401;
/**
 * The team has no paid time left and has gone local: its copies stop without ending, keep their link, and ask again
 * later. A new connection to such a team is refused before it opens, with 402.
 */
export const CLOSE_UNPAID = 4402;
/** The account no longer edits this team project, or it is gone. A browser watching a canvas: no longer a member. */
export const CLOSE_NOT_EDITOR = 4403;
/** The daemon speaks another `PROTOCOL_VERSION`. */
export const CLOSE_PROTOCOL = 4406;
/** The object couldn't check who may sync just now: the daemon reconnects, as after any dropped line. */
export const CLOSE_UNAVAILABLE = 1011;

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/*
 * Collisions. First to reach the team stands and a later save built on an older version is set aside, with two
 * exceptions: an edit beats a delete, and canvas.json is merged key by key instead of colliding.
 */

/**
 * Object → the daemons of the machine whose delete was undone: a teammate's edit, built on a version from before
 * the delete, reached the team after it, and an edit beats a delete. The file itself comes back to everyone as an
 * ordinary `file`; this tells the machine that deleted it why. A machine that was away is told when it catches up.
 */
export interface Restored {
	type: "restored";
	path: string;
	/** The team version the edit made. */
	version: Version;
	by: { accountId: string; device: string };
}

/** The one file that never collides. */
export const CANVAS_PATH = "canvas.json";

/** canvas.json's keys whose own keys are merged one at a time: each page's place. */
const MERGED_PER_ENTRY = new Set(["places"]);

/**
 * canvas.json as it is once a save built on `base` meets the team's version: each top-level key, and each page's
 * place, is taken from the save where the save changed it from `base` and from the team's version otherwise, so
 * the last write to each key wins. Null when the team's version or the save isn't a JSON object, which then
 * collides like any other file. A base the team no longer has, or never had, counts as empty.
 */
export function mergeCanvas(base: Uint8Array | null, team: Uint8Array, mine: Uint8Array): Uint8Array | null {
	const theirs = canvasObject(team);
	const ours = canvasObject(mine);
	if (theirs === null || ours === null) return null;
	const was = (base === null ? null : canvasObject(base)) ?? {};
	const merged = mergeKeys(was, theirs, ours, (key, before, after, now) =>
		MERGED_PER_ENTRY.has(key) ? mergeEntries(before, after, now) : after,
	);
	return new TextEncoder().encode(`${JSON.stringify(merged, null, "\t")}\n`);
}

type Entries = Record<string, unknown>;

/** Every key the save changed from its base, taken onto the team's version; `take` says what a changed key becomes. */
function mergeKeys(
	was: Entries,
	theirs: Entries,
	ours: Entries,
	take: (key: string, before: unknown, after: unknown, now: unknown) => unknown,
): Entries {
	const merged: Entries = { ...theirs };
	for (const key of new Set([...Object.keys(was), ...Object.keys(ours)])) {
		if (JSON.stringify(ours[key]) === JSON.stringify(was[key])) continue;
		const value = take(key, was[key], ours[key], theirs[key]);
		if (value === undefined) delete merged[key];
		else merged[key] = value;
	}
	return merged;
}

/** One map of entries merged entry by entry; a map left empty is no key at all, as canvas.json writes it. */
function mergeEntries(before: unknown, after: unknown, now: unknown): unknown {
	if (after !== undefined && !isRecord(after)) return after;
	const merged = mergeKeys(entries(before), entries(now), entries(after), (_key, _before, value) => value);
	return Object.keys(merged).length === 0 ? undefined : merged;
}

function entries(value: unknown): Entries {
	return isRecord(value) ? value : {};
}

function canvasObject(bytes: Uint8Array): Entries | null {
	try {
		const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

/*
 * Presence: where each person is on the team canvas, as it happens. It rides the same connection as ephemeral
 * messages that are relayed to the other people connected and never stored, never in history, never on disk.
 * One person is one account, however many local copies they hold open.
 */

/** Where one person is on a team canvas, and what they're doing there. */
export interface PresenceState {
	/** The page they're on. */
	page: string;
	/** Their pointer in the page's world coordinates, or null while it's off the canvas. */
	pointer: { x: number; y: number } | null;
	/** Pressing, so their name shows. */
	pressed: boolean;
	/** The frames they're moving now. */
	dragging: string[];
	/** The frame they're inside live. */
	inside: string | null;
	/** The world rectangle their canvas shows: what following them shows. */
	view: { x: number; y: number; w: number; h: number } | null;
	/** How many clicks they've made inside live frames, a click being a press let go about where it began. */
	clicks?: number;
	/**
	 * How far they've scrolled inside the frame they're in, every scroller in it added up, in the frame's own
	 * pixels: a change is a scroll the others see, and which way it went. Only its changes mean anything.
	 */
	scrolled?: { x: number; y: number } | null;
	/**
	 * Their agent, while a turn of it runs on this project (#378): absent otherwise, and absent from anyone whose
	 * spool is older. Set by their daemon, never by their canvas.
	 */
	agent?: PresenceAgent;
}

/** What a person's agent is doing, small enough to ride every presence message. */
export interface PresenceAgent {
	/** At work; false while it waits on its person to answer it. */
	running: boolean;
	/** The turn's one line, `3 designers working`; null when it has none yet. */
	status: string | null;
	/** Each of its agents at a frame or at its placeholder frame, at most `PRESENCE_AGENT_WORK`. */
	work: PresenceAgentWork[];
}

/** One agent at work on the canvas: where, and what it is doing there. */
export interface PresenceAgentWork {
	/** The frame it is at, or the placeholder frame it holds, by path under frames/. */
	frame: string;
	/**
	 * What it is doing, in a word: in its placeholder `reading` or `drawing`; at a frame that stands `new`,
	 * `landed`, `read`, `edit`, `shot`, `delete`, `ask` or `idle`. A word a reader doesn't know is `idle`.
	 */
	act: string;
	/** The step it says it is on, in its own words; null for none. */
	detail: string | null;
	/** Lines of the frame's source it has written so far, or the file holds. */
	lines: number;
}

/** Daemon → object: this local copy's person is here, or has left (null). Sent only once caught up. */
export interface PresenceUpdate {
	type: "presence";
	state: PresenceState | null;
}

/** Who a person is to the team canvas: their account, the name their pill says, and their colour in the team. */
export interface PresencePerson {
	accountId: string;
	name: string;
	color: string;
}

/**
 * Object → daemon: where another person is now, or that they've left (null). `still` is how many milliseconds
 * ago that changed: 0 as it happens, more in the catch-up a newcomer is sent.
 */
export interface Presence {
	type: "presence";
	person: PresencePerson;
	state: PresenceState | null;
	still: number;
}

/**
 * How long a person has to change nothing of their own to be idle: an agent of theirs at work doesn't count. Long
 * enough that reading a frame or thinking isn't idle, short enough that someone who walked away reads as gone soon.
 */
export const PRESENCE_IDLE_MS = 60_000;

/**
 * Daemon → window: who else is in one team project, for its tab while another is focused. `quiet` is how many
 * milliseconds ago they last did anything of their own, counted to the moment it was said.
 */
export interface TabPresence {
	person: PresencePerson;
	quiet: number;
}

/** What a name in a presence message may be: a page or a frame. Small, so a person's whole state stays small. */
export const PRESENCE_NAME = 160;
/** The frames a dragging pointer names, at most. */
export const PRESENCE_DRAGGING = 4;
/** The agents at work a presence names, at most. */
export const PRESENCE_AGENT_WORK = 6;
/** How long an agent's status line or a work's detail may be. */
export const PRESENCE_AGENT_WORDS = 80;
/** How long an act's word may be. */
const PRESENCE_ACT = 16;

/** A well-formed presence message, as a daemon or a browser hears it; undefined for anything else. */
export function readPresence(message: Record<string, unknown>): Presence | undefined {
	const { person, still } = message;
	const state = readPresenceState(message.state);
	if (message.type !== "presence" || state === undefined || typeof still !== "number" || !isRecord(person))
		return undefined;
	const { accountId, name, color } = person;
	if (typeof accountId !== "string" || typeof name !== "string" || typeof color !== "string") return undefined;
	return { type: "presence", person: { accountId, name, color }, state, still };
}

/** A well-formed presence state, copied field by field; null for "left"; undefined for anything else. */
export function readPresenceState(value: unknown): PresenceState | null | undefined {
	if (value === null) return null;
	if (!isRecord(value)) return undefined;
	const { page, pointer, pressed, dragging, inside, view, clicks, scrolled, agent } = value;
	if (!isPresenceName(page) || typeof pressed !== "boolean" || !(inside === null || isPresenceName(inside)))
		return undefined;
	if (!Array.isArray(dragging) || dragging.length > PRESENCE_DRAGGING || !dragging.every(isPresenceName))
		return undefined;
	if (!(pointer === null || (isRecord(pointer) && finite(pointer.x) && finite(pointer.y)))) return undefined;
	if (!(view === null || (isRecord(view) && finite(view.x) && finite(view.y) && finite(view.w) && finite(view.h))))
		return undefined;
	if (!(clicks === undefined || (typeof clicks === "number" && Number.isSafeInteger(clicks) && clicks >= 0)))
		return undefined;
	if (
		!(scrolled === undefined || scrolled === null || (isRecord(scrolled) && finite(scrolled.x) && finite(scrolled.y)))
	)
		return undefined;
	return {
		...(clicks === undefined ? {} : { clicks }),
		...(scrolled === undefined
			? {}
			: { scrolled: scrolled === null ? null : { x: scrolled.x as number, y: scrolled.y as number } }),
		page,
		pointer: pointer === null ? null : { x: pointer.x as number, y: pointer.y as number },
		pressed,
		dragging: [...dragging],
		inside,
		view:
			view === null ? null : { x: view.x as number, y: view.y as number, w: view.w as number, h: view.h as number },
		...withAgent(readPresenceAgent(agent)),
	};
}

function withAgent(agent: PresenceAgent | undefined): { agent?: PresenceAgent } {
	return agent === undefined ? {} : { agent };
}

/**
 * A person's agent, copied field by field; undefined for none, and for anything not well formed or past its
 * bounds, which leaves the rest of where they are standing: an agent is never worth losing their pointer over.
 */
export function readPresenceAgent(value: unknown): PresenceAgent | undefined {
	if (!isRecord(value)) return undefined;
	const { running, status, work } = value;
	if (typeof running !== "boolean" || !(status === null || isAgentWords(status))) return undefined;
	if (!Array.isArray(work) || work.length > PRESENCE_AGENT_WORK) return undefined;
	const read: PresenceAgentWork[] = [];
	for (const one of work) {
		if (!isRecord(one)) return undefined;
		const { frame, act, detail, lines } = one;
		if (!isPresenceName(frame) || typeof act !== "string" || act.length > PRESENCE_ACT) return undefined;
		if (!(detail === null || isAgentWords(detail))) return undefined;
		if (!(typeof lines === "number" && Number.isInteger(lines) && lines >= 0)) return undefined;
		read.push({ frame, act, detail, lines });
	}
	return { running, status, work: read };
}

function isAgentWords(value: unknown): value is string {
	return typeof value === "string" && value.length <= PRESENCE_AGENT_WORDS;
}

function isPresenceName(value: unknown): value is string {
	return typeof value === "string" && value.length <= PRESENCE_NAME;
}

function finite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/*
 * Comments (ADR 0011): what people leave on a team project's canvas for each other. They live in the project's sync
 * object, in tables of their own outside the save path, and ride the sockets that are already open: a daemon that
 * has caught up, and a member's browser looking at the canvas, is sent a snapshot of every comment it may read, then
 * each change as it happens. Nothing here is a save: a comment takes nothing from the bucket or the month, makes no
 * history and wakes no compile. A daemon writes on its socket; the object answers the writer by its `ref`.
 */

/** Who reads a comment: the team, or one share of the page it stands on, by the share's id. Replies keep it. */
export type CommentAudience = "team" | { share: string };

/**
 * Where a comment stands now. `placed`: where it was put, on its frame or on its page's field. `deleted-frame`: its
 * frame was deleted, so it dropped onto the field at the frame's last place. `deleted-page`: its page was deleted,
 * so it is off the canvas.
 */
export type CommentStanding = "placed" | "deleted-frame" | "deleted-page";

/** A person as comments name them: the same as presence does, resolved by Cloud from the account when it is read. */
export type CommentPerson = PresencePerson;

/** A pin's point: in its frame's own pixels from the frame's top-left, or a world point on the page's field. */
export interface CommentPoint {
	x: number;
	y: number;
}

/**
 * The element under the pin when it was placed, as the selection names one: its four handles (the frame is the
 * comment's own, then the source path and lines, the selector, the excerpt) and what spool calls it. Context for
 * agents only: the pin never follows the element.
 */
export interface CommentElement {
	name: string;
	path: string;
	lines: [number, number];
	selector: string;
	excerpt: string;
	/** The stamp is an ancestor's: JS-created DOM. */
	generated?: true;
}

/** One reply under a comment, one level deep, in the order they were made. */
export interface CommentReply {
	id: string;
	author: CommentPerson;
	/** Written by the author's agent through `spool comments`. */
	agent: boolean;
	body: string;
	/** Milliseconds since the epoch. */
	created: number;
	edited: number | null;
	/** An agent's reply on a share's comment waits for this account to send it; null for a reply that went out. */
	draftFor: string | null;
}

/** One comment as a reader gets it: its first message, where it stands, and every reply. */
export interface Comment {
	/** Short and printable, so a person and an agent can name it in a terminal. */
	id: string;
	audience: CommentAudience;
	/** The page it stands on, by its path; "" for the root page. */
	page: string;
	/** The frame it is pinned to, by its path under frames/; null for the page's empty field. */
	frame: string | null;
	at: CommentPoint;
	element: CommentElement | null;
	/** The frame's source revision when the comment was made (core's `CompiledFrameDocument.source`); null on the field. */
	revision: string | null;
	/** Cloud keeps the frame's still from when the comment was made. */
	still: boolean;
	author: CommentPerson;
	agent: boolean;
	body: string;
	created: number;
	edited: number | null;
	resolved: { by: CommentPerson; at: number } | null;
	standing: CommentStanding;
	replies: CommentReply[];
}

/**
 * Daemon → object: a new comment, made by the person whose connection it is. The frame's still from the moment it
 * was made rides the binary frame, when the daemon has one.
 */
export interface CommentPost {
	type: "comment-post";
	/** The daemon's own reference, echoed in the answer. */
	ref: string;
	page: string;
	frame: string | null;
	at: CommentPoint;
	element: CommentElement | null;
	revision: string | null;
	body: string;
	/** Written by the person's agent rather than by them. */
	agent?: true;
}

/** Daemon → object: a reply to a comment, by the person whose connection it is. */
export interface CommentReplyPost {
	type: "comment-reply";
	ref: string;
	comment: string;
	body: string;
	agent?: true;
}

/**
 * Object → reader: every comment it may read, in the order they were made, in parts. The part that is `first`
 * replaces whatever the reader held; the one that is `last` ends it.
 */
export interface CommentsSnapshot {
	type: "comments";
	comments: Comment[];
	first: boolean;
	last: boolean;
}

/** Object → every reader of its audience: a comment was made. */
export interface CommentAdded {
	type: "comment-added";
	comment: Comment;
}

/** Object → every reader of its comment's audience: a reply was made. */
export interface CommentReplied {
	type: "comment-replied";
	comment: string;
	reply: CommentReply;
}

/** Object → the writer: its comment or reply was taken, under this id. Readers hear it as `comment-added` first. */
export interface CommentPosted {
	type: "comment-posted";
	ref: string;
	id: string;
}

/**
 * Why a comment or reply was not taken. `invalid_comment`: malformed, or its words empty or past
 * `COMMENT_BODY_LIMIT`. `still_too_large`: its still is past `COMMENT_STILL_BYTES`, or no image.
 * `comment_not_found`: a reply to a comment that isn't there, or that this person can't read.
 */
export type CommentRefusal =
	| "invalid_comment"
	| "still_too_large"
	| "comment_not_found"
	| Unauthorized
	| "unpaid"
	| "unavailable";

/** Object → the writer: its comment or reply was not taken. */
export interface CommentRefused {
	type: "comment-refused";
	ref: string;
	reason: CommentRefusal;
}

export type CommentsMessage = CommentsSnapshot | CommentAdded | CommentReplied | CommentPosted | CommentRefused;

/** The most a comment's or a reply's words may be; they are never empty. */
export const COMMENT_BODY_LIMIT = 4_000;
/** The largest still a comment keeps of its frame: a booth's cover is far smaller. */
export const COMMENT_STILL_BYTES = 4 * 1024 * 1024;
/** How many comments one part of a snapshot carries. */
export const COMMENTS_PER_PART = 200;
/** The most a page's, a frame's or an element handle's name or path may be. */
const COMMENT_NAME = 512;
/** The most an element's selector or excerpt may be. */
const COMMENT_HANDLE = 4_000;
/** An id or a ref. */
const COMMENT_ID = 64;
/** A source revision: core's source hash, hex. */
const REVISION = /^[0-9a-f]{64}$/u;

/** Whether words may be a comment's or a reply's: not blank, and within the limit. */
export function isCommentBody(value: unknown): value is string {
	return typeof value === "string" && value.trim() !== "" && value.length <= COMMENT_BODY_LIMIT;
}

/** A well-formed `comment-post`, copied field by field; undefined for anything else. */
export function readCommentPost(message: Record<string, unknown>): CommentPost | undefined {
	const { type, ref, page, frame, at, element, revision, body, agent } = message;
	if (type !== "comment-post" || !isId(ref) || !isCommentName(page) || !(frame === null || isFrameName(frame)))
		return undefined;
	const point = readPoint(at);
	const handles = element === null ? null : readCommentElement(element);
	if (point === undefined || handles === undefined || !isCommentBody(body)) return undefined;
	if (!(revision === null || (typeof revision === "string" && REVISION.test(revision)))) return undefined;
	// a pin on the field stands on no frame, so takes no element and no revision
	if (frame === null && (handles !== null || revision !== null)) return undefined;
	if (!(agent === undefined || agent === true)) return undefined;
	return {
		type,
		ref,
		page,
		frame,
		at: point,
		element: handles,
		revision,
		body,
		...(agent === true ? { agent } : {}),
	};
}

/** A well-formed `comment-reply`, copied field by field; undefined for anything else. */
export function readCommentReplyPost(message: Record<string, unknown>): CommentReplyPost | undefined {
	const { type, ref, comment, body, agent } = message;
	if (type !== "comment-reply" || !isId(ref) || !isId(comment) || !isCommentBody(body)) return undefined;
	if (!(agent === undefined || agent === true)) return undefined;
	return { type, ref, comment, body, ...(agent === true ? { agent } : {}) };
}

/**
 * A well-formed comments message from the object, as a daemon or a browser hears it, copied field by field;
 * undefined for anything else, and for a message that isn't about comments.
 */
export function readCommentsMessage(message: Record<string, unknown>): CommentsMessage | undefined {
	switch (message.type) {
		case "comments": {
			const { comments, first, last } = message;
			if (!Array.isArray(comments) || typeof first !== "boolean" || typeof last !== "boolean") return undefined;
			const read = comments.map(readComment);
			if (!read.every((comment): comment is Comment => comment !== undefined)) return undefined;
			return { type: "comments", comments: read, first, last };
		}
		case "comment-added": {
			const comment = readComment(message.comment);
			return comment === undefined ? undefined : { type: "comment-added", comment };
		}
		case "comment-replied": {
			const reply = readCommentReply(message.reply);
			if (!isId(message.comment) || reply === undefined) return undefined;
			return { type: "comment-replied", comment: message.comment, reply };
		}
		case "comment-posted": {
			const { ref, id } = message;
			return isId(ref) && isId(id) ? { type: "comment-posted", ref, id } : undefined;
		}
		case "comment-refused": {
			const { ref, reason } = message;
			return isId(ref) && typeof reason === "string" && COMMENT_REFUSALS.has(reason)
				? { type: "comment-refused", ref, reason: reason as CommentRefusal }
				: undefined;
		}
		default:
			return undefined;
	}
}

const COMMENT_REFUSALS: ReadonlySet<string> = new Set<CommentRefusal>([
	"invalid_comment",
	"still_too_large",
	"comment_not_found",
	"signed_out",
	"not_editor",
	"unpaid",
	"unavailable",
]);

/** A well-formed comment, copied field by field; undefined for anything else. */
export function readComment(value: unknown): Comment | undefined {
	if (!isRecord(value)) return undefined;
	const { id, audience, page, frame, at, element, revision, still, author, agent, body, created, edited } = value;
	const { resolved, standing, replies } = value;
	if (!isId(id) || !isCommentName(page) || !(frame === null || isFrameName(frame))) return undefined;
	const who = readCommentPerson(author);
	const point = readPoint(at);
	const handles = element === null ? null : readCommentElement(element);
	const heard = readAudience(audience);
	if (who === undefined || point === undefined || handles === undefined || heard === undefined) return undefined;
	if (!(revision === null || (typeof revision === "string" && REVISION.test(revision)))) return undefined;
	if (typeof still !== "boolean" || typeof agent !== "boolean" || typeof body !== "string") return undefined;
	if (!isTime(created) || !(edited === null || isTime(edited))) return undefined;
	if (standing !== "placed" && standing !== "deleted-frame" && standing !== "deleted-page") return undefined;
	let closed: Comment["resolved"] = null;
	if (resolved !== null) {
		if (!isRecord(resolved) || !isTime(resolved.at)) return undefined;
		const by = readCommentPerson(resolved.by);
		if (by === undefined) return undefined;
		closed = { by, at: resolved.at };
	}
	if (!Array.isArray(replies)) return undefined;
	const read = replies.map(readCommentReply);
	if (!read.every((reply): reply is CommentReply => reply !== undefined)) return undefined;
	return {
		id,
		audience: heard,
		page,
		frame,
		at: point,
		element: handles,
		revision,
		still,
		author: who,
		agent,
		body,
		created,
		edited,
		resolved: closed,
		standing,
		replies: read,
	};
}

/** A well-formed reply, copied field by field; undefined for anything else. */
export function readCommentReply(value: unknown): CommentReply | undefined {
	if (!isRecord(value)) return undefined;
	const { id, author, agent, body, created, edited, draftFor } = value;
	const who = readCommentPerson(author);
	if (!isId(id) || who === undefined || typeof agent !== "boolean" || typeof body !== "string") return undefined;
	if (!isTime(created) || !(edited === null || isTime(edited))) return undefined;
	if (!(draftFor === null || isId(draftFor))) return undefined;
	return { id, author: who, agent, body, created, edited, draftFor };
}

/** An element's handles, copied field by field; undefined for anything not well formed or past its bounds. */
export function readCommentElement(value: unknown): CommentElement | undefined {
	if (!isRecord(value)) return undefined;
	const { name, path, lines, selector, excerpt, generated } = value;
	if (!isCommentName(name) || !isCommentName(path) || !isHandle(selector) || !isHandle(excerpt)) return undefined;
	if (!Array.isArray(lines) || lines.length !== 2) return undefined;
	const [from, to] = lines;
	if (!isLine(from) || !isLine(to)) return undefined;
	if (!(generated === undefined || generated === true)) return undefined;
	return { name, path, lines: [from, to], selector, excerpt, ...(generated === true ? { generated } : {}) };
}

function readCommentPerson(value: unknown): CommentPerson | undefined {
	if (!isRecord(value)) return undefined;
	const { accountId, name, color } = value;
	if (typeof accountId !== "string" || typeof name !== "string" || typeof color !== "string") return undefined;
	return { accountId, name, color };
}

function readAudience(value: unknown): CommentAudience | undefined {
	if (value === "team") return "team";
	return isRecord(value) && isId(value.share) ? { share: value.share } : undefined;
}

function readPoint(value: unknown): CommentPoint | undefined {
	return isRecord(value) && finite(value.x) && finite(value.y) ? { x: value.x, y: value.y } : undefined;
}

function isId(value: unknown): value is string {
	return typeof value === "string" && value !== "" && value.length <= COMMENT_ID;
}

/** A page's path: "" is the root page. */
function isCommentName(value: unknown): value is string {
	return typeof value === "string" && value.length <= COMMENT_NAME;
}

function isFrameName(value: unknown): value is string {
	return isCommentName(value) && value !== "";
}

function isHandle(value: unknown): value is string {
	return typeof value === "string" && value.length <= COMMENT_HANDLE;
}

function isLine(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isTime(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
