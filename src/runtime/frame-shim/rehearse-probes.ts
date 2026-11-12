import type { Box, LaidOut, LateFile, MoveRecord, NamedElement, RestLook, WordsAtEdge } from "../../deck/rehearsal";
import { type Census, census } from "./census";

/**
 * What a rehearsal (spool#322, `daemon/deck/rehearse.ts`) puts into the talk's two documents, built to one expression
 * (src/frame-shim-build.ts). `record` runs before anything else in each: in the host, the black page that holds the
 * stage and hands it the keys, it hears every key and everything the stage says over its port; in the stage document
 * it keeps the frames drawn, each move between slides the stage makes, the WebGL contexts and faces slides make, and a
 * census of each slide as it comes on. The rest are asked of the stage document once a step comes to rest: what the
 * slide on screen looks like, and a move held still to picture it.
 *
 * Everything lives under one symbol on the window, and every global it uses is taken before a slide runs.
 */

const KEY = Symbol.for("spool.rehearse");

interface Said {
	readonly at: number;
	readonly data: unknown;
}

interface HostTap {
	readonly said: Said[];
	readonly keys: { readonly key: string; readonly at: number }[];
	/** stage documents that connected: more than one is a new build taking over */
	documents: number;
}

type Move = { -readonly [K in keyof MoveRecord]: MoveRecord[K] };

interface Hold {
	frozen: boolean;
	animations: Animation[];
	/** the longest of them, in ms from their start */
	end: number;
}

interface StageTap {
	readonly frames: number[];
	/** requestAnimationFrame calls the page made, the tap's own aside */
	calls: number;
	readonly moves: Move[];
	readonly webgl: WeakSet<HTMLCanvasElement>;
	readonly faces: { readonly family: string; readonly at: number }[];
	readonly censuses: { readonly at: number; readonly frame: string; readonly census: Census }[];
	/** the faces loaded when the stage last said a slide was on screen: a face it wore then was never late */
	shownFaces: Set<string>;
	hold: Hold | undefined;
	readonly ids: WeakMap<Element, number>;
	next: number;
	readonly raf: (callback: FrameRequestCallback) => number;
}

const now = () => performance.timeOrigin + performance.now();

function isStage(): boolean {
	return new URLSearchParams(location.search).get("shell") === "1";
}

/** Run first in every document of the talk's tab. */
export function record(): void {
	const held = window as unknown as Record<symbol, unknown>;
	if (held[KEY] !== undefined) return;
	if (isStage()) {
		held[KEY] = { tap: recordStage(), since, rest, calls, look, layoutNow, arm, caught, seek, release };
	} else if (window.top === window) {
		held[KEY] = { tap: recordHost(), heard, shown, settled };
	}
}

function recordHost(): HostTap {
	const tap: HostTap = { said: [], keys: [], documents: 0 };
	addEventListener(
		"message",
		(event) => {
			const data: unknown = event.data;
			if (typeof data !== "object" || data === null || (data as { spool?: unknown }).spool !== "stage-connect")
				return;
			const port = event.ports[0];
			if (port === undefined) return;
			tap.documents++;
			port.addEventListener("message", (message) => tap.said.push({ at: now(), data: message.data }));
		},
		true,
	);
	addEventListener(
		"keydown",
		(event) => tap.keys.push({ key: event.key, at: performance.timeOrigin + event.timeStamp }),
		true,
	);
	return tap;
}

function recordStage(): StageTap {
	const raf = window.requestAnimationFrame.bind(window);
	const tap: StageTap = {
		frames: [],
		calls: 0,
		moves: [],
		webgl: new WeakSet(),
		faces: [],
		censuses: [],
		shownFaces: new Set(),
		hold: undefined,
		ids: new WeakMap(),
		next: 1,
		raf,
	};
	try {
		performance.setResourceTimingBufferSize(100_000);
	} catch {}
	const tick = () => {
		tap.frames.push(now());
		raf(tick);
	};
	raf(tick);
	window.requestAnimationFrame = (callback) => {
		tap.calls++;
		return raf(callback);
	};

	const getContext = HTMLCanvasElement.prototype.getContext;
	function counted(this: HTMLCanvasElement, kind: string, options?: unknown): RenderingContext | null {
		const made = (getContext as (kind: string, options?: unknown) => RenderingContext | null).call(
			this,
			kind,
			options,
		);
		if (made !== null && (kind === "webgl" || kind === "webgl2" || kind === "experimental-webgl"))
			tap.webgl.add(this);
		return made;
	}
	HTMLCanvasElement.prototype.getContext = counted as typeof getContext;

	try {
		document.fonts.addEventListener("loadingdone", (event) => {
			for (const face of (event as FontFaceSetLoadEvent).fontfaces)
				tap.faces.push({ family: unquoted(face.family), at: now() });
		});
	} catch {}

	// each slide as it comes on, while its entrance plays: what it is doing then is what a slow step is slowed by
	const post = MessagePort.prototype.postMessage;
	MessagePort.prototype.postMessage = function (this: MessagePort, ...args: unknown[]) {
		const data = args[0] as { spool?: unknown } | null;
		if (typeof data === "object" && data !== null && data.spool === "stage-shown") {
			try {
				tap.shownFaces = new Set(
					[...document.fonts].filter((face) => face.status === "loaded").map((face) => unquoted(face.family)),
				);
			} catch {}
			raf(() => {
				const box = shownBox();
				if (box === null) return;
				try {
					tap.censuses.push({
						at: now(),
						frame: box.getAttribute("data-spool-stage-slide") ?? "",
						census: census(box),
					});
				} catch {}
			});
		}
		return (post as (...args: unknown[]) => void).apply(this, args);
	} as typeof post;

	const start = Document.prototype.startViewTransition;
	if (typeof start === "function") {
		Document.prototype.startViewTransition = function (this: Document, ...args: unknown[]) {
			const move: Move = { at: now(), from: shownFrame(), to: null };
			tap.moves.push(move);
			const transition = (start as (...args: unknown[]) => ViewTransition).apply(this, args);
			transition.updateCallbackDone.then(
				() => {
					move.to = shownFrame();
				},
				() => {},
			);
			transition.ready.then(
				() => {
					move.ready = now();
					const own = document
						.getAnimations()
						.filter((animation) => pseudoOf(animation).startsWith("::view-transition"));
					move.runs = Math.round(Math.max(0, ...own.map(endOf).filter(Number.isFinite)));
					if (tap.hold !== undefined && !tap.hold.frozen) {
						freeze(tap.hold, document.getAnimations());
						move.held = true;
					}
				},
				(error: unknown) => {
					move.failed = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
				},
			);
			transition.finished.then(
				() => {
					move.finished = now();
				},
				() => {
					move.finished = now();
				},
			);
			return transition;
		} as typeof start;
	}
	return tap;
}

const unquoted = (family: string) => family.trim().replace(/^["']|["']$/g, "");

function pseudoOf(animation: Animation): string {
	const effect = animation.effect;
	return effect instanceof KeyframeEffect ? (effect.pseudoElement ?? "") : "";
}

function endOf(animation: Animation): number {
	try {
		const end = animation.effect?.getComputedTiming().endTime;
		return typeof end === "number" ? end : Number.POSITIVE_INFINITY;
	} catch {
		return Number.POSITIVE_INFINITY;
	}
}

function shownBox(): HTMLElement | null {
	return document.querySelector<HTMLElement>("[data-spool-stage-shown]");
}

function shownFrame(): string | null {
	return shownBox()?.getAttribute("data-spool-stage-slide") ?? null;
}

function stageTap(): StageTap {
	const tap = (window as unknown as Record<symbol, { tap: StageTap } | undefined>)[KEY]?.tap;
	if (tap === undefined) throw new Error("the rehearsal's recorder is not in this document");
	return tap;
}

function hostTap(): HostTap {
	const tap = (window as unknown as Record<symbol, { tap: HostTap } | undefined>)[KEY]?.tap;
	if (tap === undefined) throw new Error("the rehearsal's recorder is not in this document");
	return tap;
}

/** Wait here, without a round trip a poll, until `found` says yes of what the host heard, or `ms` went by. */
function waitHeard(found: (tap: HostTap) => boolean, ms: number): Promise<boolean> {
	const tap = hostTap();
	const deadline = performance.now() + ms;
	return new Promise((done) => {
		const look = () => {
			if (found(tap)) done(true);
			else if (performance.now() > deadline) done(false);
			else setTimeout(look, 16);
		};
		look();
	});
}

/** Whether the stage said it showed the beat, from position `from` on, within `ms`. */
function shown(from: number, slide: number, beat: number, ms: number): Promise<boolean> {
	return waitHeard(
		(tap) =>
			tap.said.slice(from).some(({ data }) => {
				const said = data as { spool?: unknown; shown?: { at?: { slide?: unknown; beat?: unknown } } };
				return said.spool === "stage-shown" && said.shown?.at?.slide === slide && said.shown.at.beat === beat;
			}),
		ms,
	);
}

/** Whether the stage last said the slide is anything but loading, within `ms`. */
function settled(frame: string, ms: number): Promise<boolean> {
	return waitHeard((tap) => {
		for (let at = tap.said.length - 1; at >= 0; at--) {
			const said = tap.said[at]?.data as { spool?: unknown; slides?: { frame?: unknown; status?: unknown }[] };
			if (said.spool !== "stage-slides" || !Array.isArray(said.slides)) continue;
			const status = said.slides.find((slide) => slide.frame === frame)?.status;
			return status !== undefined && status !== "loading";
		}
		return false;
	}, ms);
}

/** What the host heard from position `from` on, and how many stage documents connected. */
function heard(from: number): { said: Said[]; keys: HostTap["keys"]; documents: number } {
	const tap = hostTap();
	return { said: tap.said.slice(from), keys: tap.keys.slice(), documents: tap.documents };
}

/** The frames the stage drew, the moves it made and the censuses it took from `since` on, epoch ms. */
function since(at: number): {
	frames: number[];
	moves: MoveRecord[];
	censuses: StageTap["censuses"];
	calls: number;
} {
	const tap = stageTap();
	// what is older than any step still asked about goes, so a long talk does not hold every frame it drew
	const old = tap.frames.findIndex((frame) => frame >= at - 5000);
	if (old > 0) tap.frames.splice(0, old);
	return {
		frames: tap.frames.filter((frame) => frame >= at),
		moves: tap.moves.filter((move) => move.at >= at).map((move) => ({ ...move })),
		censuses: tap.censuses.filter((taken) => taken.at >= at),
		calls: tap.calls,
	};
}

/** The next frame, by the requestAnimationFrame taken before any slide ran. */
function frame(): Promise<number> {
	const { raf } = stageTap();
	return new Promise((done) => raf(() => done(now())));
}

/**
 * Wait, up to `budgetMs`, for the slide on screen to come to rest: no move between slides under way, no animation
 * that ends still running, its faces and its pictures in. Answers when it rested, epoch ms, and whether it did.
 */
async function rest(budgetMs: number): Promise<{ at: number; rested: boolean; calls: number }> {
	const tap = stageTap();
	const deadline = performance.now() + budgetMs;
	let quiet = 0;
	try {
		await Promise.race([document.fonts.ready, new Promise((done) => setTimeout(done, budgetMs))]);
	} catch {}
	while (performance.now() < deadline) {
		await frame();
		if (busy(tap)) quiet = 0;
		else if (++quiet >= 2) return { at: now(), rested: true, calls: tap.calls };
	}
	return { at: now(), rested: false, calls: tap.calls };
}

function busy(tap: StageTap): boolean {
	if (tap.hold !== undefined) return false;
	if (tap.moves.some((move) => move.finished === undefined && move.failed === undefined)) return true;
	let animations: Animation[] = [];
	try {
		animations = document.getAnimations();
	} catch {}
	if (animations.some((animation) => animation.playState === "running" && Number.isFinite(endOf(animation))))
		return true;
	const box = shownBox();
	if (box === null) return true;
	for (const image of box.querySelectorAll("img")) if (!image.complete && image.loading !== "lazy") return true;
	return false;
}

/** How many requestAnimationFrame calls the page has made, for a loop of a slide's own once it rested. */
function calls(): number {
	return stageTap().calls;
}

// --- a look at the slide at rest ---------------------------------------------------------------------------

/** Past an edge by more than this, in the slide's px, counts: less is a rounding of the browser's. */
const EDGE_PX = 1;
/** The most elements a look lays out: a demo screen on a slide can hold thousands, and the first say enough. */
const LAID_OUT_MOST = 3000;
/** A picture or face that came this long after the slide was shown came late. */
const LATE_MS = 100;

/** The slide on screen, read: `shownAt` is when it was shown, epoch ms, for what came after. */
function look(shownAt: number): RestLook | null {
	const tap = stageTap();
	const box = shownBox();
	if (box === null) return null;
	const frame = box.getAttribute("data-spool-stage-slide") ?? "";
	const w = box.offsetWidth;
	const h = box.offsetHeight;
	const outer = box.getBoundingClientRect();
	const scale = w > 0 && outer.width > 0 ? outer.width / w : 1;
	const local = (rect: DOMRect): Box => ({
		left: round((rect.left - outer.left) / scale),
		top: round((rect.top - outer.top) / scale),
		right: round((rect.right - outer.left) / scale),
		bottom: round((rect.bottom - outer.top) / scale),
	});
	const styles = new Map<Element, CSSStyleDeclaration>();
	const style = (element: Element) => {
		let found = styles.get(element);
		if (found === undefined) {
			found = getComputedStyle(element);
			styles.set(element, found);
		}
		return found;
	};
	const moving = movingIn(box);
	return {
		frame,
		size: { w, h },
		words: wordsAtEdge(box, { w, h }, local, style, moving),
		layout: laidOut(tap, box, moving),
		names: named(box, style),
		webgl: [...box.querySelectorAll("canvas")].filter((canvas) => tap.webgl.has(canvas)).length,
		late: lateFiles(tap, box, shownAt, style),
	};
}

const round = (n: number) => Math.round(n * 10) / 10;

/** The slide on screen laid out now, as `look` lays it out; null when no slide of the talk is. */
function layoutNow(): LaidOut[] | null {
	const box = shownBox();
	return box === null ? null : laidOut(stageTap(), box, movingIn(box));
}

function sourceOf(element: Element): string | undefined {
	return element.closest("[data-spool-source]")?.getAttribute("data-spool-source") ?? undefined;
}

function wordsAtEdge(
	box: HTMLElement,
	size: { w: number; h: number },
	local: (rect: DOMRect) => Box,
	style: (element: Element) => CSSStyleDeclaration,
	moving: (element: Element) => boolean,
): WordsAtEdge[] {
	const found = new Map<Element, { text: string; lines: Box[] }>();
	const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
	const range = document.createRange();
	for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
		const text = node.textContent ?? "";
		if (text.trim() === "") continue;
		const parent = node.parentElement;
		if (parent === null || parent.closest("[aria-hidden='true'], [hidden]") !== null) continue;
		range.selectNodeContents(node);
		const lines = [...range.getClientRects()]
			.filter((rect) => rect.width > 0 && rect.height > 0)
			.map(local)
			.filter(
				(line) =>
					line.left < -EDGE_PX ||
					line.top < -EDGE_PX ||
					line.right > size.w + EDGE_PX ||
					line.bottom > size.h + EDGE_PX,
			);
		if (lines.length === 0 || !seen(parent, box, style)) continue;
		const entry = found.get(parent) ?? { text: "", lines: [] };
		entry.text = `${entry.text} ${text.trim()}`.trim();
		entry.lines.push(...lines.slice(0, 6));
		found.set(parent, entry);
	}
	return [...found].map(([element, { text, lines }]) => {
		const source = sourceOf(element);
		return {
			text: text.length > 80 ? `${text.slice(0, 79)}…` : text,
			...(source === undefined ? {} : { source }),
			size: Number.parseFloat(style(element).fontSize) || 0,
			moving: moving(element),
			lines,
			clip: clipOf(element, box, local, style),
		};
	});
}

/** Whether anyone could see it: shown, and not faded to nothing, here or in what holds it. */
function seen(element: Element, box: Element, style: (element: Element) => CSSStyleDeclaration): boolean {
	if (style(element).visibility !== "visible") return false;
	let opacity = 1;
	for (let at: Element | null = element; at !== null && at !== box; at = at.parentElement) {
		opacity *= Number.parseFloat(style(at).opacity);
		if (opacity < 0.05) return false;
	}
	return true;
}

/** The box what holds an element clips it to, inside the slide, or null when nothing in the slide clips it. */
function clipOf(
	element: Element,
	box: Element,
	local: (rect: DOMRect) => Box,
	style: (element: Element) => CSSStyleDeclaration,
): Box | null {
	let clip: Box | null = null;
	for (let at = element.parentElement; at !== null && at !== box; at = at.parentElement) {
		const own = style(at);
		const clips =
			own.overflowX !== "visible" ||
			own.overflowY !== "visible" ||
			own.clipPath !== "none" ||
			/\b(paint|strict|content)\b/.test(own.contain);
		if (!clips) continue;
		const rect = local(at.getBoundingClientRect());
		clip =
			clip === null
				? rect
				: {
						left: Math.max(clip.left, rect.left),
						top: Math.max(clip.top, rect.top),
						right: Math.min(clip.right, rect.right),
						bottom: Math.min(clip.bottom, rect.bottom),
					};
	}
	return clip;
}

/** Whether an element of the slide, or something it is in, runs an animation that never ends. */
function movingIn(box: HTMLElement): (element: Element) => boolean {
	const endless = new Set<Element>();
	try {
		for (const animation of box.getAnimations({ subtree: true })) {
			const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
			if (target !== null && !Number.isFinite(endOf(animation))) endless.add(target);
		}
	} catch {}
	const known = new Map<Element, boolean>();
	const isMoving = (element: Element): boolean => {
		if (element === box || !box.contains(element)) return false;
		const said = known.get(element);
		if (said !== undefined) return said;
		const parent = element.parentElement;
		const answer = endless.has(element) || (parent !== null && isMoving(parent));
		known.set(element, answer);
		return answer;
	};
	return isMoving;
}

function laidOut(tap: StageTap, box: HTMLElement, isMoving: (element: Element) => boolean): LaidOut[] {
	const idOf = (element: Element) => {
		let id = tap.ids.get(element);
		if (id === undefined) {
			id = tap.next++;
			tap.ids.set(element, id);
		}
		return id;
	};
	const laid: LaidOut[] = [];
	for (const element of box.querySelectorAll("*")) {
		if (laid.length >= LAID_OUT_MOST) break;
		if (!(element instanceof HTMLElement) || element.hasAttribute("data-spool-rendered")) continue;
		let x = 0;
		let y = 0;
		for (
			let at: Element | null = element;
			at instanceof HTMLElement && at !== box && box.contains(at);
			at = at.offsetParent
		) {
			x += at.offsetLeft;
			y += at.offsetTop;
		}
		const parent = element.parentElement;
		const source = element.getAttribute("data-spool-source") ?? undefined;
		laid.push({
			id: idOf(element),
			tag: tagOf(element),
			...(source === undefined ? {} : { source }),
			...(parent !== null && parent !== box && box.contains(parent) ? { parent: idOf(parent) } : {}),
			shown: element.getClientRects().length > 0,
			moving: isMoving(element),
			x,
			y,
			w: element.offsetWidth,
			h: element.offsetHeight,
		});
	}
	return laid;
}

function tagOf(element: Element): string {
	const tag = element.tagName.toLowerCase();
	if (element.id !== "") return `${tag}#${element.id}`;
	const first = element.classList[0];
	return first === undefined ? tag : `${tag}.${first}`;
}

function named(box: HTMLElement, style: (element: Element) => CSSStyleDeclaration): NamedElement[] {
	const names: NamedElement[] = [];
	for (const element of box.querySelectorAll("*")) {
		const name = style(element).viewTransitionName;
		if (name === "" || name === "none" || name === undefined) continue;
		if (element.getClientRects().length === 0) continue;
		const source = element.getAttribute("data-spool-source") ?? undefined;
		names.push({ name, tag: tagOf(element), ...(source === undefined ? {} : { source }) });
	}
	return names;
}

const URL_IN_CSS = /url\(\s*(["']?)(.*?)\1\s*\)/g;

function lateFiles(
	tap: StageTap,
	box: HTMLElement,
	shownAt: number,
	style: (element: Element) => CSSStyleDeclaration,
): LateFile[] {
	const pictures = new Set<string>();
	const families = new Set<string>();
	for (const element of box.querySelectorAll("*")) {
		if (element.getClientRects().length === 0) continue;
		if (element instanceof HTMLImageElement && element.currentSrc !== "") pictures.add(element.currentSrc);
		const own = style(element);
		if (own.backgroundImage !== "none")
			for (const match of own.backgroundImage.matchAll(URL_IN_CSS))
				if (match[2] !== undefined && !match[2].startsWith("data:"))
					pictures.add(new URL(match[2], location.href).href);
		if (element.childNodes.length > 0) for (const family of own.fontFamily.split(",")) families.add(unquoted(family));
	}
	const late: LateFile[] = [];
	for (const url of pictures) {
		if (url.startsWith("data:") || url.startsWith("blob:")) continue;
		const entry = performance.getEntriesByName(url, "resource")[0];
		const image = [...box.querySelectorAll("img")].find((img) => img.currentSrc === url);
		const came = entry === undefined ? undefined : performance.timeOrigin + entry.startTime + entry.duration;
		if (came !== undefined && came > shownAt + LATE_MS)
			late.push({ kind: "picture", name: url, after: Math.round(came - shownAt) });
		else if (image !== undefined && !image.complete)
			late.push({ kind: "picture", name: url, after: Math.round(now() - shownAt) });
	}
	for (const face of tap.faces) {
		// a face the slide wore as it came on was there from its first frame, whatever loaded after
		if (!families.has(face.family) || tap.shownFaces.has(face.family) || face.at <= shownAt + LATE_MS) continue;
		if (late.some((file) => file.kind === "font" && file.name === face.family)) continue;
		late.push({ kind: "font", name: face.family, after: Math.round(face.at - shownAt) });
	}
	return late;
}

// --- a move held still --------------------------------------------------------------------------------------

/** The next move between slides is held still the moment it begins, for `seek` to picture it. */
function arm(): void {
	stageTap().hold = { frozen: false, animations: [], end: 0 };
}

function freeze(hold: Hold, animations: readonly Animation[]): void {
	const live = animations.filter((animation) => animation.playState === "running" || animation.playState === "paused");
	for (const animation of live) {
		try {
			animation.pause();
		} catch {}
	}
	hold.animations = live;
	hold.end = Math.round(Math.max(0, ...live.map(endOf).filter(Number.isFinite)));
	hold.frozen = true;
}

/**
 * Hold still what the slide on screen is playing, when no move between slides did: a slide that cuts in plays its
 * own entrance, or nothing. Answers how long what it holds runs, in ms.
 */
function holdNow(): number {
	const tap = stageTap();
	const hold = tap.hold ?? { frozen: false, animations: [], end: 0 };
	tap.hold = hold;
	if (!hold.frozen) {
		const box = shownBox();
		let animations: Animation[] = [];
		try {
			animations = box === null ? [] : box.getAnimations({ subtree: true });
		} catch {}
		freeze(hold, animations);
	}
	return hold.end;
}

/**
 * The armed move caught as it begins, or, when none began within `ms` or one made since `at` (epoch ms) ended or
 * failed first, the slide's own entrance held instead. Answers how long what it holds runs, in ms; 0 is a cut.
 */
async function caught(at: number, ms: number): Promise<number> {
	const tap = stageTap();
	const deadline = performance.now() + ms;
	while (performance.now() < deadline) {
		if (tap.hold?.frozen === true) return tap.hold.end;
		const made = tap.moves.filter((move) => move.at >= at);
		if (made.length === 0 || made.some((move) => move.failed !== undefined || move.finished !== undefined)) break;
		await frame();
	}
	return holdNow();
}

/** Everything held put `at` ms into its run, and drawn. */
async function seek(at: number): Promise<void> {
	const hold = stageTap().hold;
	if (hold === undefined) return;
	for (const animation of hold.animations) {
		const end = endOf(animation);
		try {
			animation.currentTime = Number.isFinite(end) ? Math.min(at, Math.max(0, end - 1)) : at;
		} catch {}
	}
	await frame();
	await frame();
}

/** Let what was held go on to its end. */
function release(): void {
	const tap = stageTap();
	const hold = tap.hold;
	tap.hold = undefined;
	for (const animation of hold?.animations ?? []) {
		try {
			if (Number.isFinite(endOf(animation))) animation.finish();
			else animation.play();
		} catch {}
	}
}

// --- the machine ----------------------------------------------------------------------------------------------

/** The frames an empty page draws over `ms`, epoch ms: what this machine and browser manage with nothing to do. */
export function idle(ms: number): Promise<number[]> {
	const frames: number[] = [];
	const end = performance.now() + ms;
	return new Promise((done) => {
		const tick = () => {
			frames.push(now());
			if (performance.now() < end) requestAnimationFrame(tick);
			else done(frames);
		};
		requestAnimationFrame(tick);
	});
}
