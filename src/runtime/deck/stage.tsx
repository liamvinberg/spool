import {
	Activity,
	Component,
	type ComponentType,
	type ReactNode,
	useLayoutEffect,
	useRef,
	useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { fitIn } from "../../deck/stage-fit";
import { DIGITS_FORGET_MS, type KeyCommand, pressedKey, readKey, typingIn } from "../../deck/stage-keys";
import {
	type At,
	clampAt,
	openSession,
	type RoomPicture,
	roomPicture,
	type StageCommand,
	type StageSession,
	type StageState,
	stepSession,
	type TalkSlide,
} from "../../deck/stage-session";
import {
	type HostMessage,
	parseHostMessage,
	type SlideReadiness,
	type StageConfig,
	type StageMessage,
	type StageMode,
	type StagePointer,
	type StageSlideConfig,
} from "../../deck/stage-wire";
import { SlideScope, setSlideBeat } from "../slide-beats";
import { type KeptPicture, keepPicture, keepWebglPictures } from "./stage-keep";
import { type Warmed, warmSlide, wear } from "./stage-warm";

/**
 * The stage (spool#265): a deck's talk played in one render document, the room's screen, the presenter's slide and an
 * entered slide on the canvas alike. One slide shows at the talk's size, on black; the slides around it are rendered
 * out of sight beside it, their fonts loaded and images decoded in this document, so a step to one of them is the
 * same-document swap a walk is, committed in the next frame, its shared `view-transition-name`s carried and the rest
 * dissolved. A step to a slide that is not ready holds the picture on screen until it is. A slide that will not
 * compile, load or mount is never swapped in; one that throws on screen leaves a still copy of its last picture. Nothing
 * of spool's own error drawing is ever drawn here.
 *
 * The document is its host's: whatever embeds it (the room's window, the presenter view, the canvas) speaks to it over
 * a private port, either sending it commands while it owns the session, or handing it each session to show.
 */

/** What the stage needs from the frame runtime it runs in. */
export interface StageRuntime {
	/** a slide's component once its module is in, or why it will not be */
	load(frame: string): Promise<{ component: ComponentType } | { broken: string; when: "compile" | "load" }>;
	/** its stylesheet fetched and in the document, switched off */
	loadStyle(frame: string): Promise<void>;
	/** its stylesheet the one switched on */
	activateStyle(frame: string): void;
	/** the element holding its stylesheet, once loaded */
	styleOf(frame: string): HTMLStyleElement | undefined;
	/** `ui.state`: read whole, replaced whole, and heard on every write */
	state: {
		read(): StageState;
		seed(state: StageState): void;
		subscribe(listener: () => void): () => void;
	};
}

const deck = window.__SPOOL_PLAY__?.deck;
const embedded = window.parent !== window;
/**
 * The talk exported as one file (spool#275): nobody hosts it, and there is no room to freeze, no screen to swap and no
 * presenter to tell. F is full screen there, and Esc leaves it.
 */
const inFile = deck !== undefined && window.__SPOOL_PLAY__?.exported !== undefined;

/** A key a file carries out itself: true when it was one. */
function fileKey(next: KeyCommand): boolean {
	if (next.kind === "freeze") {
		if (document.fullscreenElement === null) void document.documentElement.requestFullscreen?.().catch(() => {});
		else void document.exitFullscreen().catch(() => {});
		return true;
	}
	if (next.kind === "escape") {
		if (document.fullscreenElement !== null) void document.exitFullscreen().catch(() => {});
		return true;
	}
	return next.kind === "swap" || next.kind === "help";
}

let sendToHost: ((message: StageMessage) => void) | undefined;
let hostListener: ((data: unknown) => void) | undefined;
const heldFromHost: unknown[] = [];
let windowError: ((error: unknown) => void) | undefined;

/**
 * Before any slide's module runs: the private port to the host, made and handed over once with its methods bound, so
 * no slide can listen in by patching the prototype; WebGL canvases that keep their pictures; and every error the window
 * hears kept for the stage to name, never drawn.
 */
if (deck !== undefined) {
	keepWebglPictures();
	if (embedded) {
		const channel = new MessageChannel();
		const port = channel.port1;
		const post = port.postMessage.bind(port);
		const listen = port.addEventListener.bind(port);
		const start = port.start.bind(port);
		sendToHost = (message) => post(message);
		listen("message", (event) => {
			if (hostListener !== undefined) hostListener(event.data);
			else if (heldFromHost.length < 64) heldFromHost.push(event.data);
		});
		start();
		window.parent.postMessage({ spool: "stage-connect" }, "*", [channel.port2]);
	}
	addEventListener("error", (event) => windowError?.(event.error ?? event.message));
	addEventListener("unhandledrejection", (event) => windowError?.(event.reason));
}

/** A walk is the player's, not the talk's: a slide that calls `ui.go` or `ui.back` stays where the talk put it. */
export function stageRefusesWalk(): boolean {
	if (deck === undefined) return false;
	if (!walkRefused) console.warn("spool: a slide in a talk does not walk; ui.go and ui.back do nothing here");
	walkRefused = true;
	return true;
}
let walkRefused = false;

const describe = (error: unknown): string =>
	(error instanceof Error ? error.stack || error.message : typeof error === "string" ? error : String(error)).slice(
		0,
		100_000,
	);

/** One slide of the talk, as this document holds it. */
interface SlideHeld {
	readonly config: StageSlideConfig;
	component?: ComponentType;
	module: "waiting" | "loading" | "in" | "broken";
	style: "waiting" | "loading" | "in" | "failed";
	broken?: { why: string; when: "compile" | "load" | "mount" | "later"; kept?: "picture" | "picture-without-webgl" };
	/** it was ready once in this document: its module, stylesheet, fonts and images are in */
	wasReady: boolean;
	/** its fonts and pictures, held for the whole talk so the browser keeps them */
	warmed?: Warmed;
}

/** One rendering of a slide: a take of it, out of sight or on screen. */
interface Copy {
	readonly key: string;
	readonly index: number;
	readonly take: number;
	/** the box it rendered into, once it has */
	box?: HTMLElement;
	warm: boolean;
	warming: boolean;
	broken: boolean;
	/** what it threw from a handler or a timer while on screen, for its boundary to stop it with */
	thrown?: { error: unknown };
}

/**
 * The slides kept rendered out of sight around the one on screen: the next two and the one before. Beyond them the rest of the
 * talk is readied one slide at a time, nearest first, and let go once it has been.
 */
const AHEAD = 2;
const BEHIND = 1;
/** Slides fetched at once, nearest first. */
const LOADS_AT_ONCE = 3;

export function bootStage(runtime: StageRuntime): void {
	const config = deck;
	if (config === undefined) throw new Error("spool: a stage needs a deck to play");
	const size = config.size;
	const talk: TalkSlide[] = config.slides.map(({ frame, beats, live }) => ({
		frame,
		beats: Math.max(1, beats),
		live,
	}));
	const slides: SlideHeld[] = config.slides.map((slide) => ({
		config: slide,
		module: "waiting",
		style: "waiting",
		wasReady: false,
	}));
	const startAt = Math.max(
		0,
		talk.findIndex((slide) => slide.frame === window.__SPOOL_PLAY__?.start),
	);

	let mode: StageMode = "own";
	let room = true;
	let opened = !embedded;
	let session: StageSession = openSession(talk, { slide: startAt, beat: 0 }, runtime.state.read());
	const copies = new Map<string, Copy>();
	let shown: string | null = null;
	let version = 0;
	const listeners = new Set<() => void>();
	const redraw = () => {
		version++;
		for (const listener of listeners) listener();
	};
	const motion = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	const post = (message: StageMessage) => sendToHost?.(message);

	// --- what the room's screen should show --------------------------------------------------------------

	const picture = (): RoomPicture =>
		room ? roomPicture(session) : { at: session.at, state: session.state, takes: session.takes };
	const takeOf = (index: number, takes: RoomPicture["takes"]) => takes[talk[index]?.frame ?? ""] ?? 0;
	const keyOf = (index: number, take: number) => `${talk[index]?.frame ?? ""}#${take}`;

	/** The beat a slide rests at out of sight: where the talk would land on it from here. */
	const restingBeat = (index: number, target: number) =>
		index < target ? Math.max(0, (talk[index]?.beats ?? 1) - 1) : 0;

	function copyFor(index: number, take: number): Copy {
		const key = keyOf(index, take);
		let copy = copies.get(key);
		if (copy === undefined) {
			copy = { key, index, take, warm: false, warming: false, broken: false };
			copies.set(key, copy);
		}
		return copy;
	}

	/** Its stylesheet is in the document, or will never be. */
	const styled = (slide: SlideHeld | undefined) => slide?.style === "in" || slide?.style === "failed";

	/** A copy that can go on screen in the next frame: rendered, its styles in, its fonts and pictures warmed. */
	const ready = (copy: Copy | undefined): boolean => {
		if (copy === undefined || copy.broken || copy.box === undefined || !copy.warm) return false;
		const slide = slides[copy.index];
		return slide?.module === "in" && styled(slide);
	};

	// --- readying ----------------------------------------------------------------------------------------

	/** Nearest first: the slide wanted, the next, the one before, then onward and back. */
	function order(target: number): number[] {
		const out = [target, target + 1, target - 1];
		for (let step = 2; step < talk.length; step++) out.push(target + step, target - step);
		return out.filter((index, at) => index >= 0 && index < talk.length && out.indexOf(index) === at);
	}

	let loading = 0;
	function fetchAhead(): void {
		for (const index of order(picture().at.slide)) {
			if (loading >= LOADS_AT_ONCE) return;
			const slide = slides[index];
			if (slide === undefined) continue;
			if (slide.module === "waiting") {
				slide.module = "loading";
				loading++;
				void runtime
					.load(slide.config.frame)
					.then((loaded) => {
						if ("component" in loaded) {
							slide.component = loaded.component;
							slide.module = "in";
						} else {
							slide.module = "broken";
							slide.broken = { why: loaded.broken, when: loaded.when };
						}
					})
					.finally(() => {
						loading--;
						settle();
					});
			}
			if (slide.style === "waiting" && loading < LOADS_AT_ONCE) {
				slide.style = "loading";
				loading++;
				void runtime
					.loadStyle(slide.config.frame)
					.then(
						() => {
							slide.style = "in";
						},
						() => {
							// a stylesheet that will not come is the slide's own look; nothing would bring it later
							slide.style = "failed";
						},
					)
					.finally(() => {
						loading--;
						settle();
					});
			}
		}
	}

	/**
	 * The copies to keep rendered: the window around the slide wanted, at the takes the talk is on, and once all of
	 * those are ready, the nearest slide of the rest that has never been, for as long as it takes to ready it.
	 */
	function wantedCopies(): Copy[] {
		const at = picture();
		const target = at.at.slide;
		const out: Copy[] = [];
		for (let index = target - BEHIND; index <= target + AHEAD; index++) {
			const slide = slides[index];
			if (slide === undefined || slide.module !== "in") continue;
			out.push(copyFor(index, takeOf(index, at.takes)));
		}
		if (out.some((copy) => !copy.broken && !ready(copy))) return out;
		for (const index of order(target)) {
			if (index >= target - BEHIND && index <= target + AHEAD) continue;
			const slide = slides[index];
			if (slide === undefined || slide.wasReady || slide.broken !== undefined) continue;
			if (slide.module !== "in" || !styled(slide)) continue;
			out.push(copyFor(index, takeOf(index, at.takes)));
			break;
		}
		return out;
	}

	function renderedCopy(key: string, box: HTMLElement): void {
		const copy = copies.get(key);
		if (copy === undefined || copy.box !== undefined) return;
		copy.box = box;
		settle();
	}

	/** A rendered copy's fonts and pictures fetched and decoded here, once its stylesheet says which fonts it uses. */
	function warm(copy: Copy): void {
		const slide = slides[copy.index];
		if (copy.box === undefined || copy.warm || copy.warming || copy.broken || !styled(slide)) return;
		copy.warming = true;
		const style = runtime.styleOf(slide?.config.frame ?? "");
		void warmSlide(copy.box, style?.sheet ?? null, style?.textContent ?? "").then((warmed) => {
			copy.warming = false;
			copy.warm = true;
			if (slide !== undefined && !copy.broken) {
				slide.wasReady = true;
				slide.warmed = warmed;
			}
			settle();
		});
	}

	function brokeCopy(key: string, error: unknown, kept: KeptPicture | undefined): void {
		const copy = copies.get(key);
		if (copy === undefined || copy.broken) return;
		copy.broken = true;
		const slide = slides[copy.index];
		if (slide === undefined) return;
		const onScreen = shown === key && !unswap(key);
		slide.broken = {
			why: describe(error),
			when: onScreen ? "later" : "mount",
			...(onScreen && kept !== undefined
				? { kept: kept.canvases === "all" ? ("picture" as const) : ("picture-without-webgl" as const) }
				: {}),
		};
		settle();
	}

	// an error a slide threw from a handler or a timer stops the slide on screen where it stands, as a throw while it
	// renders does: its last picture kept, its rendering and its effects let go, and the keys still moving the talk on
	windowError = (error) => {
		const copy = shown === null ? undefined : copies.get(shown);
		const slide = copy === undefined ? undefined : slides[copy.index];
		if (copy === undefined || slide === undefined || copy.broken || copy.thrown !== undefined) return;
		copy.thrown = { error };
		redraw();
	};

	// --- showing -----------------------------------------------------------------------------------------

	let pending: { at: At; arrived: number; ready: boolean; frames: number } | undefined;
	let framesCounting = false;
	function countFrames(): void {
		if (framesCounting) return;
		framesCounting = true;
		const tick = () => {
			if (pending === undefined) {
				framesCounting = false;
				return;
			}
			pending.frames++;
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	}

	/** A command or a session arrived: the stage now owes the room the picture it names. */
	function arrived(): void {
		// a slide that mounted threw by the end of the swap that put it on: one that throws on a key after it, however
		// soon, threw on screen, and keeps its picture rather than taking the room back to a slide let go
		revealed = undefined;
		const at = picture().at;
		const copy = copies.get(keyOf(at.slide, takeOf(at.slide, picture().takes)));
		pending = { at, arrived: performance.now(), ready: ready(copy), frames: 0 };
		countFrames();
		settle();
	}

	let swapping = false;
	let settling = false;
	/** The copy a swap just put on screen, and the one it took off, while a throw as it mounts can still undo it. */
	let revealed: { key: string; from: string | null } | undefined;

	/** Bring the screen to the picture the talk wants, as far as what is ready allows, and ready what comes next. */
	function settle(): void {
		if (settling) return;
		settling = true;
		try {
			fetchAhead();
			const want = picture();
			const target = want.at.slide;
			const keep = new Set(wantedCopies().map((copy) => copy.key));
			if (shown !== null) keep.add(shown);
			for (const key of copies.keys()) if (!keep.has(key)) copies.delete(key);
			for (const copy of copies.values()) {
				warm(copy);
				if (copy.key === shown) continue;
				setSlideBeat(copy.key, copy.index === target ? want.at.beat : restingBeat(copy.index, target));
			}
			const wanted = copies.get(keyOf(target, takeOf(target, want.takes)));
			if (wanted !== undefined && wanted.key === shown) {
				setSlideBeat(wanted.key, want.at.beat);
				done(want.at, false, wanted);
			} else if (slides[target]?.module === "broken" || wanted?.broken === true) {
				// the room keeps what it has, and the next key still moves on
				done(want.at, true);
			} else if (opened && wanted !== undefined && ready(wanted) && !swapping) {
				swap(wanted, want.at);
			}
			redraw();
			reportSlides();
		} finally {
			settling = false;
		}
	}

	/** The talk was under way when this document opened: its first picture is the slide at rest, its entrances played. */
	let underWay = false;

	/**
	 * The pending command is carried out, or can never be: say what came of it, in the frame that shows it. By then a
	 * slide that threw as it mounted or on its new beat has been caught, and undone or kept still, and the command is
	 * said to have been held. A picture put where there was none (`first`) is said once it has been painted, so a host
	 * that reveals this document on hearing it never reveals the frame before it.
	 */
	function done(at: At, held: boolean, copy?: Copy, first = false): void {
		const was = pending;
		if (was === undefined || was.at.slide !== at.slide || was.at.beat !== at.beat) return;
		pending = undefined;
		const waited = Math.round(performance.now() - was.arrived);
		unsaid++;
		const say = (message: StageMessage) => {
			post(message);
			unsaid--;
			sayApplied();
		};
		requestAnimationFrame(() => {
			const message: StageMessage = {
				spool: "stage-shown",
				shown: {
					at,
					frame: talk[at.slide]?.frame ?? "",
					take: takeOf(at.slide, picture().takes),
					ready: was.ready,
					held: held || copy?.broken === true,
					frames: was.frames,
					waited,
				},
			};
			if (first) requestAnimationFrame(() => say(message));
			else say(message);
		});
	}

	/** The revision of the session the host applied last, said back once the screen shows it. */
	let owed: number | undefined;
	/** what was carried out and is still to be said, in the frame that shows it */
	let unsaid = 0;
	function acknowledge(revision: number): void {
		owed = revision;
		requestAnimationFrame(sayApplied);
	}
	function sayApplied(): void {
		if (owed === undefined || pending !== undefined || unsaid > 0) return;
		post({ spool: "stage-applied", revision: owed });
		owed = undefined;
	}

	function show(key: string | null): void {
		const copy = key === null ? undefined : copies.get(key);
		const frame = copy === undefined ? undefined : talk[copy.index]?.frame;
		// its styles and faces first, so what the slide measures as it mounts is what it will look like
		if (frame !== undefined) runtime.activateStyle(frame);
		wear(copy === undefined ? [] : (slides[copy.index]?.warmed?.fonts ?? []));
		flushSync(() => {
			shown = key;
			redraw();
		});
	}

	/**
	 * The host asked for the slide it named to go on with no dissolve and at rest, its entrances played: nobody was
	 * watching this stage until now, and the slide was seen as it stands (on the canvas, gone into).
	 */
	let cut = false;

	function swap(copy: Copy, at: At): void {
		const from = shown;
		const instant = cut;
		cut = false;
		const update = () => {
			setSlideBeat(copy.key, at.beat);
			revealed = { key: copy.key, from };
			show(copy.key);
			// a talk under way, or a cut to a slide that was already showing elsewhere: it stands as it was seen, not playing in
			if (((from === null && underWay) || instant) && copy.box !== undefined) atRest(copy.box);
			requestAnimationFrame(() => {
				if (revealed?.key === copy.key) revealed = undefined;
			});
			done(at, false, copy, from === null);
		};
		if (!motion || instant || from === null || typeof document.startViewTransition !== "function") {
			update();
			settle();
			return;
		}
		swapping = true;
		const transition = document.startViewTransition(update);
		const after = () => {
			swapping = false;
			settle();
		};
		transition.updateCallbackDone.then(after, after);
	}

	/** A slide that threw as it was swapped in never stays: the copy it replaced comes back, as if nothing moved. */
	function unswap(key: string): boolean {
		if (revealed?.key !== key) return false;
		const { from } = revealed;
		revealed = undefined;
		show(from !== null && copies.has(from) ? from : null);
		return true;
	}

	// --- sessions ----------------------------------------------------------------------------------------

	function take(next: StageSession): void {
		if (next === session) return;
		const before = room ? roomPicture(session) : session;
		session = next;
		const after = picture();
		if (JSON.stringify(after.state) !== JSON.stringify(runtime.state.read())) seed(after.state);
		if (mode === "own") post({ spool: "stage-session", session });
		const moved =
			before.at.slide !== after.at.slide ||
			before.at.beat !== after.at.beat ||
			JSON.stringify(before.takes) !== JSON.stringify(after.takes);
		if (moved) arrived();
		else settle();
	}

	function command(next: StageCommand): void {
		// a key moves the talk on from what the host cut to: that is a step, and dissolves like any other
		cut = false;
		take(stepSession(session, next, talk));
	}

	/** `ui.state` put in place by the stage itself, which is no slide writing it. */
	let seeding = false;
	function seed(state: StageState): void {
		seeding = true;
		try {
			runtime.state.seed(state);
		} finally {
			seeding = false;
		}
	}

	// what a slide writes to `ui.state` is the talk's: kept here when this stage owns the session, sent to the host
	// that does otherwise, and heard back with the next session it hands over. A room holding its picture is a still.
	runtime.state.subscribe(() => {
		if (!opened || seeding || (room && session.frozen !== null)) return;
		const state = runtime.state.read();
		if (mode === "own") take(stepSession(session, { kind: "state", state }, talk));
		else if (JSON.stringify(state) !== JSON.stringify(session.state)) {
			post({ spool: "stage-command", command: { kind: "state", state } });
		}
	});

	function fromHost(data: unknown): void {
		const message: HostMessage | undefined = parseHostMessage(data);
		if (message === undefined) return;
		if (message.spool === "stage-open") {
			mode = message.mode;
			room = message.room;
			opened = true;
			let next = message.session;
			if (next !== undefined && message.frame !== undefined && talk[next.at.slide]?.frame !== message.frame) {
				const found = talk.findIndex((slide) => slide.frame === message.frame);
				if (found >= 0) next = { ...next, at: { slide: found, beat: next.at.beat } };
			}
			if (next !== undefined) next = { ...next, at: clampAt(talk, next.at) };
			underWay = next !== undefined;
			// a talk opened from a slide, with no session yet, starts on that slide's first beat
			const from = talk.findIndex((slide) => slide.frame === message.frame);
			const at = next === undefined && from >= 0 ? { slide: from, beat: 0 } : session.at;
			session = next ?? openSession(talk, at, runtime.state.read());
			seed(picture().state);
			if (mode === "own") post({ spool: "stage-session", session });
			arrived();
			return;
		}
		if (message.spool === "stage-command") {
			if (mode === "own") command(message.command);
			return;
		}
		if (message.spool === "stage-apply") {
			if (message.mode !== undefined) mode = message.mode;
			if (message.session.revision >= session.revision || message.mode !== undefined) {
				cut = message.cut === true;
				take({ ...message.session, at: clampAt(talk, message.session.at) });
			}
			// said whether or not anything moved: a host waiting for this document to show the newest session hears it
			acknowledge(message.session.revision);
		}
	}

	// --- keys and clicks ---------------------------------------------------------------------------------

	let digits = "";
	let forget: ReturnType<typeof setTimeout> | undefined;

	function carry(next: KeyCommand): void {
		if (next.kind === "blur") {
			if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
			return;
		}
		if (inFile && fileKey(next)) return;
		const forHost = next.kind === "escape" || next.kind === "swap" || next.kind === "help";
		if (forHost || mode === "follow") {
			post({ spool: "stage-command", command: next });
			return;
		}
		command(next);
	}

	const shownSlide = () => {
		const copy = shown === null ? undefined : copies.get(shown);
		return copy === undefined ? undefined : talk[copy.index];
	};

	addEventListener("keydown", (event) => {
		if (!opened) return;
		const read = readKey(
			pressedKey(event),
			{
				typing: typingIn(event.target),
				live: talk[session.at.slide]?.live === true,
				keys: session.keys,
				// black is the room's, whichever window the key is pressed in: any key brings it back
				black: session.black,
				frozen: session.frozen !== null,
			},
			digits,
		);
		digits = read.digits;
		if (forget !== undefined) clearTimeout(forget);
		if (digits !== "") forget = setTimeout(() => (digits = ""), DIGITS_FORGET_MS);
		if (!read.taken) return;
		event.preventDefault();
		if (read.command !== undefined) carry(read.command);
	});

	addEventListener("click", (event) => {
		if (!opened || event.defaultPrevented || event.button !== 0) return;
		if (room && session.black) carry({ kind: "black", on: false });
		else if (shownSlide()?.live !== true && !session.keys) carry({ kind: "next" });
	});

	// the pointer over a live slide, for a host that shows the room where it is as a soft dot: where it stands on the
	// talk's screen, at most once a frame, and null once it leaves or stands over a slide that is not live
	let pointer: StagePointer | null = null;
	let pointerSaid = "null";
	let pointerFrame = 0;
	const tellPointer = (next: StagePointer | null) => {
		pointer = next;
		if (pointerFrame !== 0) return;
		pointerFrame = requestAnimationFrame(() => {
			pointerFrame = 0;
			const text = JSON.stringify(pointer);
			if (text === pointerSaid) return;
			pointerSaid = text;
			post({ spool: "stage-pointer", at: pointer });
		});
	};
	const share = (value: number) => Math.min(1, Math.max(0, value));
	addEventListener("pointermove", (event) => {
		if (!opened) return;
		const live = shownSlide()?.live === true;
		tellPointer(live ? { x: share(event.clientX / innerWidth), y: share(event.clientY / innerHeight) } : null);
	});
	document.documentElement.addEventListener("pointerleave", () => tellPointer(null));

	// --- reports -----------------------------------------------------------------------------------------

	let said = "";
	function reportSlides(): void {
		const at = picture();
		const report: SlideReadiness[] = slides.map((slide, index) => {
			const frame = slide.config.frame;
			if (slide.broken !== undefined) {
				const { why, when, kept } = slide.broken;
				return { frame, status: "broken", why, when, ...(kept === undefined ? {} : { kept }) };
			}
			const copy = copies.get(keyOf(index, takeOf(index, at.takes)));
			return { frame, status: ready(copy) || (copy === undefined && slide.wasReady) ? "ready" : "loading" };
		});
		const text = JSON.stringify(report);
		if (text === said) return;
		said = text;
		post({ spool: "stage-slides", slides: report });
	}

	// --- drawing -----------------------------------------------------------------------------------------

	const subscribe = (listener: () => void) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	};

	function StageView() {
		useSyncExternalStore(subscribe, () => version);
		const black = room && session.black;
		return (
			<>
				{[...copies.values()].map((copy) => {
					const slide = slides[copy.index];
					if (slide?.component === undefined) return null;
					return (
						<Slot
							key={copy.key}
							copy={copy}
							slide={slide.config}
							screen={slide.component}
							visible={copy.key === shown}
							size={size}
						/>
					);
				})}
				{black ? <div className="spool-stage-black" /> : null}
			</>
		);
	}

	function Slot({
		copy,
		slide,
		screen: Screen,
		visible,
		size,
	}: {
		copy: Copy;
		slide: StageSlideConfig;
		screen: ComponentType;
		visible: boolean;
		size: { w: number; h: number };
	}) {
		const box = useRef<HTMLDivElement>(null);
		// the slide's content commits out of sight at its own pace: the box hears it arrive
		useLayoutEffect(() => {
			const element = box.current;
			if (element === null) return;
			const check = () => {
				if (element.querySelector(":scope > [data-spool-rendered]") !== null) renderedCopy(copy.key, element);
			};
			check();
			const observer = new MutationObserver(check);
			observer.observe(element, { childList: true });
			return () => observer.disconnect();
		}, [copy.key]);
		const same = slide.w === size.w && slide.h === size.h;
		const fit = same ? undefined : fitIn(slide, size);
		return (
			<div
				ref={box}
				className="spool-stage-slide"
				data-spool-stage-slide={slide.frame}
				data-spool-stage-shown={visible ? "" : undefined}
				style={{
					width: slide.w,
					height: slide.h,
					...(fit === undefined ? {} : { transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.s})` }),
				}}
			>
				<SlideScope.Provider value={copy.key}>
					<Activity mode={visible ? "visible" : "hidden"}>
						<SlideBoundary
							box={box}
							thrown={copy.thrown}
							onBroken={(error, kept) => brokeCopy(copy.key, error, kept)}
						>
							<Screen />
						</SlideBoundary>
						<span data-spool-rendered="" hidden />
					</Activity>
				</SlideScope.Provider>
			</div>
		);
	}

	// --- the document ------------------------------------------------------------------------------------

	const root = document.getElementById("root");
	if (root === null) throw new Error("spool: the stage document has no #root");
	fitBody(size);
	addEventListener("resize", () => fitBody(size));
	createRoot(root, {
		// a slide's error is the stage's to name, and the room's never to see
		onCaughtError: () => {},
	}).render(<StageView />);
	hostListener = fromHost;
	post({ spool: "stage-talk", slides: talk });
	for (const held of heldFromHost.splice(0)) fromHost(held);
	if (!embedded) arrived();
	else settle();
}

/**
 * The page is the talk's screen: the body is the stage, the talk's size, fitted into whatever viewport the document
 * has and centred on black. A host that lays the document out at the talk's size leaves it unscaled. A slide's styles
 * that size the body give way to it.
 */
function fitBody(size: StageConfig["size"]): void {
	const fit = fitIn(size, { w: window.innerWidth || size.w, h: window.innerHeight || size.h });
	const body = document.body.style;
	const set = (property: string, value: string) => body.setProperty(property, value, "important");
	set("position", "absolute");
	set("left", "0");
	set("top", "0");
	set("margin", "0");
	set("width", `${size.w}px`);
	set("height", `${size.h}px`);
	set("overflow", "hidden");
	set("transform-origin", "0 0");
	set("transform", `translate(${fit.x}px, ${fit.y}px) scale(${fit.s})`);
}

/**
 * A slide shown as it stands once its entrances have played: every CSS animation and transition in it that ends,
 * finished before the frame is painted. A document opened on a talk already under way (a new build taking over, a room
 * joining) shows the slide as the room last saw it, not playing in again. Motion a slide drives from script plays.
 */
function atRest(box: HTMLElement): void {
	for (const animation of box.getAnimations({ subtree: true })) {
		const end = animation.effect?.getComputedTiming().endTime;
		if (typeof end === "number" && Number.isFinite(end)) animation.finish();
	}
}

/**
 * One slide's error stops at the slide. While React gives up on it the document still shows its last picture, so that
 * is the moment a still copy is made; the copy then stands in its place. A slide that breaks out of sight copies
 * nothing, and is never swapped in.
 */
class SlideBoundary extends Component<
	{
		box: { readonly current: HTMLElement | null };
		/** an error the slide threw outside React (a handler, a timer), which stops it here all the same */
		thrown: { error: unknown } | undefined;
		onBroken: (error: unknown, kept: KeptPicture | undefined) => void;
		children: ReactNode;
	},
	{ error: unknown; failed: boolean }
> {
	override state = { error: undefined as unknown, failed: false };
	private kept: KeptPicture | undefined;
	private told = false;

	static getDerivedStateFromError(error: unknown) {
		return { error, failed: true };
	}

	static getDerivedStateFromProps(props: { thrown: { error: unknown } | undefined }, state: { failed: boolean }) {
		return props.thrown !== undefined && !state.failed ? { error: props.thrown.error, failed: true } : null;
	}

	override render() {
		if (!this.state.failed) return this.props.children;
		if (this.kept === undefined && this.props.box.current !== null) {
			const visible = this.props.box.current.hasAttribute("data-spool-stage-shown");
			this.kept = visible ? keepPicture(this.props.box.current) : { nodes: [], canvases: "all", placed: () => {} };
		}
		if (!this.told) {
			this.told = true;
			const { error } = this.state;
			const kept = this.kept;
			// heard after this render, which may not be the one React keeps, but the error is real either way
			queueMicrotask(() => this.props.onBroken(error, kept));
		}
		return <Kept picture={this.kept} />;
	}
}

function Kept({ picture }: { picture: KeptPicture | undefined }) {
	const holder = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const element = holder.current;
		if (element === null || picture === undefined) return;
		element.replaceChildren(...picture.nodes);
		picture.placed();
	}, [picture]);
	return <div ref={holder} className="spool-stage-kept" />;
}
