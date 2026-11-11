import { useSyncExternalStore } from "react";
import type { Box } from "../../deck/layout";
import { mintTalk } from "../../deck/present-wire";
import { desktopWindow } from "../desktop-window";
import { experimentOn } from "../experiments";
import { settingNow, writeSetting } from "../settings";
import { type PresentHow, type PresentWay, presentPlan, wayPresentTakes } from "./present-way";
import { presenterLayout } from "./presenter-layout";

/** Where a talk is presented from: a deck page of a project, and the slide it starts on, by its path. */
export interface PresentFrom {
	readonly project: string;
	readonly page: string;
	readonly slide: string;
}

/** A talk asked to be presented, and the room's window opened for it as Present was pressed. */
export interface PresentAsk extends PresentFrom {
	/** its name: the channel its two windows speak over, and the room's address */
	readonly talk: string;
	/** when Present was pressed, which the presenter's clock counts from */
	readonly pressed: number;
	/** the slides filling this screen, or the presenter view here (spool#298) */
	readonly way: PresentWay;
	/** a room's window was asked for: the presenter view's, or the slides' on another display */
	readonly roomAsked: boolean;
	/**
	 * the press asked for this window full screen with the slides. A browser's press opens a window or makes this one
	 * full screen, never both: with the room's window opened, the slides fill the page, and a click makes it full screen.
	 */
	readonly fillAsked: boolean;
	/** the room's window, when the browser let it open and handed it over */
	readonly room: Window | null;
}

/**
 * Present a deck from one of its slides (spool#265, spool#298): what Present on the canvas, a slide's play on its name
 * label, the Present action on a deck's row in Pages, and ⌘↵, ⌥⌘↵ and ⇧⌘↵ on a deck page do. How it plays is
 * `presentPlan`'s: the slides fill this screen, or spool's own window turns into the presenter view (`presenting.tsx`).
 * Whatever needs the press that asked for it happens here, while the press is still the user's: the window made full
 * screen, the room's window opened. One talk at a time: a press while one is on does nothing.
 */
export function presentDeck(from: PresentFrom, how: PresentHow = "present"): void {
	if (!experimentOn("deck")) return;
	if (asked !== null) {
		presentAgain();
		return;
	}
	const plan = presentPlan({ displays: displayCount(), remembered: rememberedWay(), how });
	const talk = mintTalk();
	const room = plan.room ? openRoom(from, talk) : null;
	const fillAsked = plan.way === "slides" && (!plan.room || desktopWindow() !== undefined);
	if (fillAsked) fillScreen(true);
	asked = { ...from, talk, pressed: Date.now(), way: plan.way, roomAsked: plan.room, room, fillAsked };
	if (plan.remember !== undefined) void writeSetting("present.way", plan.remember);
	tell();
}

/** The way Present takes now, on the displays there are: what the caret's menu checks, and ⌘↵ plays. */
export function presentTakes(remembered: PresentWay = rememberedWay()): PresentWay {
	return wayPresentTakes(displayCount(), remembered);
}

/** How many displays there are to present on: two only where the app, or the browser, says so; else one. */
export function displayCount(): 1 | 2 {
	const counted = desktopWindow()?.displays?.();
	if (counted !== undefined) return counted > 1 ? 2 : 1;
	const screen = (typeof window === "undefined" ? undefined : window.screen) as
		| (Screen & { isExtended?: boolean })
		| undefined;
	return screen?.isExtended === true ? 2 : 1;
}

function rememberedWay(): PresentWay {
	return settingNow("present.way") === "presenter" ? "presenter" : "slides";
}

/**
 * Spool's window made full screen for the slides, or let go of again. The Mac app covers the display at once, with no
 * Space of its own to slide to; a browser takes the page full screen, which only a press may ask, and hands Esc to the
 * page while the talk lasts, so Esc can step back from a live slide and Notes before it ends the talk.
 */
export function fillScreen(on: boolean): void {
	const app = desktopWindow();
	if (app?.presentFullScreen !== undefined) {
		void app.presentFullScreen(on).catch(() => {});
		return;
	}
	if (typeof document === "undefined") return;
	const keyboard = (navigator as Navigator & { keyboard?: { lock?(keys: string[]): Promise<void>; unlock?(): void } })
		.keyboard;
	if (on) {
		if (document.fullscreenElement !== null || document.documentElement.requestFullscreen === undefined) return;
		void document.documentElement
			.requestFullscreen({ navigationUI: "hide" })
			.then(() => keyboard?.lock?.(["Escape"]))
			.catch(() => {});
		return;
	}
	keyboard?.unlock?.();
	if (document.fullscreenElement !== null) void document.exitFullscreen().catch(() => {});
}

/** The room's address: the deck page's plain play address, as the room of `talk`. */
export function roomAddress(from: PresentFrom, talk: string): string {
	const query = new URLSearchParams({ deck: from.page, frame: from.slide, room: talk });
	return `/play/${encodeURIComponent(from.project)}?${query}`;
}

/** A window of its own the size of a small screen, which can be moved to the projector's, or shared in a call. */
const ROOM_WINDOW = { w: 960, h: 540 } as const;
/** The narrowest room worth opening beside spool's window rather than over it. */
const BESIDE_LEAST = 480;
/** The smallest the room opens over spool's window, as a share of the small screen. */
const SMALLEST = 1 / 3;

/**
 * Where the room's window opens on the screen spool's window is on (`view`, its page on the screen; `screen`, the
 * screen's usable area): beside spool's window when there is room for it there, and otherwise over the presenter view's
 * own slide, centred on it, the one part of the view that shows what the room shows already, so the clock, what comes next, the
 * notes, End and the bar stay in sight. The presenter moves it to the projector's screen, or shares it in a call.
 */
export function roomWindowAt(view: Box, screen: Box): Box {
	const left = view.x - screen.x;
	const right = screen.x + screen.w - (view.x + view.w);
	const beside = Math.max(left, right);
	if (beside >= BESIDE_LEAST) {
		const w = Math.round(Math.min(ROOM_WINDOW.w, beside, (screen.h * ROOM_WINDOW.w) / ROOM_WINDOW.h));
		const h = Math.round((w * ROOM_WINDOW.h) / ROOM_WINDOW.w);
		const y = Math.round(Math.min(Math.max(view.y + (view.h - h) / 2, screen.y), screen.y + screen.h - h));
		return { x: right >= left ? view.x + view.w : view.x - w, y, w, h };
	}
	const slide = presenterLayout(view, ROOM_WINDOW).slide;
	const s = Math.max(SMALLEST, Math.min(1, slide.w / ROOM_WINDOW.w, slide.h / ROOM_WINDOW.h));
	const w = Math.round(ROOM_WINDOW.w * s);
	const h = Math.round(ROOM_WINDOW.h * s);
	const within = (at: number, size: number, from: number, span: number) =>
		Math.round(Math.max(from, Math.min(at, from + span - size)));
	return {
		x: within(view.x + slide.x + (slide.w - w) / 2, w, screen.x, screen.w),
		y: within(view.y + slide.y + (slide.h - h) / 2, h, screen.y, screen.h),
		w,
		h,
	};
}

/** What `window.open` is asked for: a popup the room's size, where `roomWindowAt` puts it when the window says where it is. */
function roomFeatures(): string {
	const size = `popup,width=${ROOM_WINDOW.w},height=${ROOM_WINDOW.h}`;
	const screen = window.screen as (Screen & { availLeft?: number; availTop?: number }) | undefined;
	const view = {
		x: window.screenX + (window.outerWidth - window.innerWidth) / 2,
		y: window.screenY + (window.outerHeight - window.innerHeight),
		w: window.innerWidth,
		h: window.innerHeight,
	};
	const usable = {
		x: screen?.availLeft ?? 0,
		y: screen?.availTop ?? 0,
		w: screen?.availWidth ?? Number.NaN,
		h: screen?.availHeight ?? Number.NaN,
	};
	if (![view.x, view.y, view.w, view.h, usable.w, usable.h].every(Number.isFinite)) return size;
	const at = roomWindowAt(view, usable);
	return `popup,width=${at.w},height=${at.h},left=${at.x},top=${at.y}`;
}

/** Opens the room's window of `talk`, or opens it again; null when the browser kept it to itself. */
export function openRoom(from: PresentFrom, talk: string): Window | null {
	return window.open(roomAddress(from, talk), `spool-room-${talk}`, roomFeatures());
}

/**
 * The hand is on its way to Present (the pointer over it, a slide held a moment or with ⌘ down on the deck page): the
 * slide it would play from is readied out of sight now, so the slide that flies is the slide itself.
 */
export function warmPresent(from: PresentFrom): void {
	if (!experimentOn("deck")) return;
	if (warm !== null && warm.project === from.project && warm.page === from.page && warm.slide === from.slide) return;
	warm = from;
	tell();
}

/** The slide last readied for Present, while one is. */
export function usePresentWarm(): PresentFrom | null {
	return useSyncExternalStore(subscribe, () => warm);
}

/** Nothing is readied for Present any more, and nothing presents. */
export function presentCold(): void {
	if (warm === null || asked !== null) return;
	warm = null;
	tell();
}

/**
 * What a press of Present does while the slides are on their way home from a talk (spool#298): `turn` sends them back
 * to fill the screen and says true, or says false when nothing is on its way; null once nothing can fly.
 */
export function onPresentAgain(turn: (() => boolean) | null): void {
	turnBack = turn;
}

/**
 * Present pressed while a talk's slides fly home: they turn round from where they are, and the talk goes on. True when
 * they did, whatever is held on the canvas meanwhile.
 */
export function presentAgain(): boolean {
	if (asked?.way !== "slides" || turnBack?.() !== true) return false;
	fillScreen(true);
	return true;
}

/** The talk is over: Present may be pressed again, and nothing is readied for it any more. */
export function presentDone(): void {
	if (asked === null && warm === null) return;
	asked = null;
	warm = null;
	tell();
}

/** The talk asked for, while one is. */
export function usePresentAsk(): PresentAsk | null {
	return useSyncExternalStore(subscribe, () => asked);
}

/**
 * The slide ⌘↵ (`first` false) or ⇧⌘↵ (`first` true) presents from on a page whose talk is `slides`, with `selected`
 * the frames held: ⇧⌘↵ the first slide; ⌘↵ the one slide held, or the first with nothing held. With anything else held
 * (a loose frame, several frames, an element) ⌘↵ is the canvas's own key, and nothing is presented.
 */
export function presentKeyFrom(
	slides: readonly string[],
	held: { readonly frames: readonly string[]; readonly elements: number },
	first: boolean,
): string | undefined {
	const [start] = slides;
	if (start === undefined) return undefined;
	if (first) return start;
	if (held.elements > 0) return undefined;
	if (held.frames.length === 0) return start;
	const [only] = held.frames;
	return held.frames.length === 1 && only !== undefined && slides.includes(only) ? only : undefined;
}

let asked: PresentAsk | null = null;
let warm: PresentFrom | null = null;
let turnBack: (() => boolean) | null = null;
const listeners = new Set<() => void>();

function tell(): void {
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
