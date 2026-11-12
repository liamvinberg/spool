import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Size } from "../../deck/deck-file";
import { coverUrl } from "../api";
import { shellRadiusOnScreen } from "../canvas/camera";
import type { CameraStore } from "../canvas/camera-store";
import type { CanvasStore } from "../canvas/canvas-store";
import { type DeckReads, useDeckRead } from "./deck-api";
import { type DeckMotion, useDeckMotion } from "./deck-motion";
import { decodedPicture, openingOf, readyPicture } from "./opening";
import { presentDone, usePresentAsk, usePresentWarm } from "./present";
import { type Card, PresentSlides } from "./present-slides";
import { Presenter, useWindowSize } from "./presenter";
import { presenterLayout } from "./presenter-layout";

/**
 * Presenting on the canvas (spool#265, the team canvas's `app/spool-deck` and `--presenter`): what happens to spool's
 * own window between Present and End. The chrome falls away around the slide presented from (the window's bar lifts,
 * each side slides out past its edge, the tools sink, the canvas darkens to the presenter's ground) while the slide
 * travels from its place on the canvas to where the presenter view holds it; the rest of the view arrives around it.
 * The slide travels as its opening still, the photo booth's picture of it at the size a talk draws it on the beat the
 * talk opens on, when that is decoded by the time Present is pressed (spool#319): a picture flies at the same cost
 * whatever is on the slide, where a live slide flown by a transform is drawn again at every size it passes through and
 * stands soft behind it. Else it travels as the canvas's cover, small, which stretched to the slide's size is soft.
 * Either stays over the presenter's stage until the stage has drawn its own, and goes in one frame, the frame the slide
 * lands or the stage draws, whichever is later, so it never stands over a slide that is ready (spool#316). End plays it
 * back: the slide the talk ended on travels to its place on the canvas, selected there, while the chrome comes back.
 */

/** A box on the window, in its pixels. */
interface Rect {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

type Moment =
	/**
	 * Present was pressed: the chrome falls away and the slide travels as `picture`, from `from` when it was on screen
	 */
	| {
			readonly kind: "leave";
			readonly talk: string;
			readonly frame: string;
			readonly from: Rect | null;
			readonly picture: string | undefined;
	  }
	/** the presenter view is drawn; the picture that travelled stays until the stage has drawn its own, then goes at once */
	| {
			readonly kind: "on";
			readonly talk: string;
			readonly frame: string;
			readonly picture: string | undefined;
			readonly handed: boolean;
	  }
	/** End: the slide the talk ended on goes back to its place, `to` once the canvas has it there */
	| { readonly kind: "back"; readonly talk: string; readonly frame: string; readonly to: Rect | null | undefined };

export interface PresentingProps {
	readonly project: string;
	readonly store: CanvasStore;
	readonly camera: CameraStore;
	readonly reads: DeckReads | null;
	/** the canvas's field, which darkens into the presenter's ground */
	readonly viewport: () => HTMLElement | null;
	/** the talk ended on `frame`: the canvas selects it, and brings it into view at the zoom it has */
	onEnded(frame: string): void;
	/** a talk that could not be played, and why */
	say(message: string): void;
}

/** Presenting either way (spool#298): the presenter view here, or the slides filling the screen. */
export function Presenting(props: PresentingProps) {
	return (
		<>
			<PresenterMoments {...props} />
			<SlidesMoments {...props} />
		</>
	);
}

/** The canvas's cover of a frame: the slide at its last beat, small. */
function coverOf(store: CanvasStore, project: string, frame: string): string | undefined {
	const cover = store.get().frames.find((one) => one.name === frame)?.cover;
	return cover === undefined ? undefined : coverUrl(project, frame, cover.hash);
}

/** Where a frame's card stands on the window, and its corner there, while it stands in view of the canvas. */
function cardOn(store: CanvasStore, camera: CameraStore, field: DOMRect | undefined, frame: string): Card | null {
	const box = store.get().frames.find((one) => one.name === frame);
	const at = camera.get();
	if (box === undefined || at === null || field === undefined) return null;
	const rect = {
		x: field.left + at.x + box.x * at.k,
		y: field.top + at.y + box.y * at.k,
		w: box.w * at.k,
		h: box.h * at.k,
	};
	const seen =
		rect.x + rect.w > field.left && rect.y + rect.h > field.top && rect.x < field.right && rect.y < field.bottom;
	return seen ? { rect, r: shellRadiusOnScreen(at.k) } : null;
}

/** The slides filling the screen, readied while the hand is on its way to Present and played once it is pressed. */
function SlidesMoments({ project, store, camera, reads, viewport, onEnded, say }: PresentingProps) {
	const ask = usePresentAsk();
	const warm = usePresentWarm();
	const mine = ask !== null && ask.project === project && ask.way === "slides" ? ask : null;
	// the room's window is kept out of the props: React reading it to compare would be refused by its other origin
	const shown = useMemo(() => {
		if (mine === null) return null;
		const { room: _room, ...rest } = mine;
		return rest;
	}, [mine]);
	const readied = ask === null && warm !== null && warm.project === project ? warm : null;
	const deck = useDeckRead(reads, (mine ?? readied)?.page ?? "");
	const talk: Size = deck?.size ?? { w: 1280, h: 720 };
	return (
		<PresentSlides
			ask={shown}
			warm={readied}
			deck={deck}
			talk={talk}
			cardOf={(frame) => cardOn(store, camera, viewport()?.getBoundingClientRect(), frame)}
			pictureOf={(frame) => {
				// the canvas draws a slide at its last beat: its cover is the talk's start only for a slide of one
				const beats = deck?.slides.find((one) => one.name === frame)?.beats.length ?? 1;
				return {
					opening: openingOf(store, project, frame),
					cover: beats > 1 ? undefined : coverOf(store, project, frame),
				};
			}}
			onEnded={onEnded}
			say={say}
			closeRoom={() => mine?.room?.close()}
		/>
	);
}

function PresenterMoments({ project, store, camera, reads, viewport, onEnded, say }: PresentingProps) {
	const still = useReducedMotion() === true;
	const timing = useDeckMotion();
	/** with no slide on screen to travel from, the chrome falls away as its transitions take it before the view is drawn */
	const fall = timing.slower;
	const ask = usePresentAsk();
	const mine = ask !== null && ask.project === project && ask.way === "presenter" ? ask : null;
	const deck = useDeckRead(reads, mine?.page ?? "");
	const window_ = useWindowSize();
	const [moment, setMoment] = useState<Moment | null>(null);
	const [pictured, setPictured] = useState(false);
	const hands = useRef({ onEnded, say });
	hands.current = { onEnded, say };
	const talk: Size = deck?.size ?? { w: 1280, h: 720 };
	/** where a frame stands on the window, while it stands in view */
	const cardOf = (frame: string): Rect | null =>
		cardOn(store, camera, viewport()?.getBoundingClientRect(), frame)?.rect ?? null;
	const where = useRef(cardOf);
	where.current = cardOf;
	const big = toRect(presenterLayout(window_, talk).slide);

	/** the slide arrived where the presenter view holds it: the view is drawn around it */
	const land = useCallback(
		(from: Moment) =>
			setMoment((now) =>
				now === from && now.kind === "leave"
					? { kind: "on", talk: from.talk, frame: from.frame, picture: now.picture, handed: false }
					: now,
			),
		[],
	);
	// the stage has drawn the slide, and the slide is there: its picture goes before the frame is painted
	useLayoutEffect(() => {
		if (moment?.kind !== "on" || moment.handed || !pictured) return;
		setMoment((now) => (now === moment ? { ...moment, handed: true } : now));
	}, [moment, pictured]);
	/** the slide is home: the talk is over, and Present can be pressed again */
	const done = useCallback((from: Moment) => {
		setMoment((now) => (now === from ? null : now));
		presentDone();
	}, []);
	// a canvas that goes while a talk is on takes the talk with it
	const asked = useRef(mine);
	asked.current = mine;
	useEffect(
		() => () => {
			if (asked.current !== null) presentDone();
		},
		[],
	);

	// Present pressed: the slide leaves the canvas from where it stands, if it stands on screen, as its opening still
	// when that is decoded, else as its cover
	useLayoutEffect(() => {
		if (mine === null) return;
		setMoment((now) => {
			if (now !== null && now.talk === mine.talk) return now;
			const card = where.current(mine.slide);
			const opening = openingOf(store, project, mine.slide);
			if (opening !== undefined) void readyPicture(opening);
			const picture = decodedPicture(opening) === undefined ? coverOf(store, project, mine.slide) : opening;
			return {
				kind: "leave",
				talk: mine.talk,
				frame: mine.slide,
				from: still || card === null ? null : card,
				picture,
			};
		});
		setPictured(false);
	}, [mine, still, store, project]);

	// with nothing to travel, the view is drawn once the chrome has gone
	useEffect(() => {
		if (moment?.kind !== "leave" || moment.from !== null) return;
		const timer = setTimeout(() => land(moment), still ? 0 : fall);
		return () => clearTimeout(timer);
	}, [moment, still, land, fall]);

	const end = useCallback((frame: string) => {
		setMoment((now) => (now === null ? now : { kind: "back", talk: now.talk, frame, to: undefined }));
		hands.current.onEnded(frame);
	}, []);

	// back on the canvas: find where the slide is now, once the canvas has drawn it there, and let it travel home
	useEffect(() => {
		if (moment?.kind !== "back" || moment.to !== undefined) return;
		let frame = requestAnimationFrame(() => {
			frame = requestAnimationFrame(() => {
				const to = where.current(moment.frame);
				setMoment((now) => (now === moment ? { ...moment, to: still ? null : to } : now));
			});
		});
		return () => cancelAnimationFrame(frame);
	}, [moment, still]);
	const [chrome, setChrome] = useState(true);
	useEffect(() => {
		if (moment === null) return setChrome(true);
		if (moment.kind !== "back") {
			// a frame after the ground is drawn clear, so it darkens rather than appears
			const frame = requestAnimationFrame(() => setChrome(false));
			return () => cancelAnimationFrame(frame);
		}
		if (moment.to === undefined) return;
		// the chrome waits a beat after the slide sets off home, then follows it
		const timer = setTimeout(() => setChrome(true), still ? 0 : timing.chromeWait);
		return () => clearTimeout(timer);
	}, [moment, still, timing]);
	// nothing travels home: the moment is over once the chrome is back
	useEffect(() => {
		if (moment?.kind !== "back" || moment.to !== null) return;
		const timer = setTimeout(() => done(moment), still ? 0 : fall);
		return () => clearTimeout(timer);
	}, [moment, still, done, fall]);
	// the window's chrome, told by marks on the document: away while it is gone, moving while a moment plays
	const moving = moment !== null && !(moment.kind === "on" && moment.handed);
	/** the slide's place on the canvas, empty while its picture travels from it or to it */
	const place = moment?.kind === "leave" ? moment.from : moment?.kind === "back" ? (moment.to ?? null) : null;
	useLayoutEffect(() => {
		const root = document.documentElement;
		mark(root, "deckAway", !chrome);
		mark(root, "deckMoving", moving);
		mark(root, "deckPresenting", moment?.kind === "on");
	}, [chrome, moving, moment]);
	useEffect(
		() => () => {
			const root = document.documentElement;
			mark(root, "deckAway", false);
			mark(root, "deckMoving", false);
			mark(root, "deckPresenting", false);
		},
		[],
	);

	if (moment === null) return null;
	const field = viewport()?.getBoundingClientRect();
	const presenting = mine !== null && mine.talk === moment.talk && moment.kind !== "back";

	return createPortal(
		<>
			<style>{FALL}</style>
			{place === null ? null : (
				<div
					aria-hidden="true"
					className="pointer-events-none fixed z-50 bg-surface-panel"
					style={{ left: place.x - 3, top: place.y - 3, width: place.w + 6, height: place.h + 6 }}
				/>
			)}
			{/* the presenter's ground, which the canvas darkens into as the chrome falls away */}
			{field === undefined ? null : (
				<div
					aria-hidden="true"
					data-deck-ground=""
					className="pointer-events-none fixed z-50 bg-surface-window transition-opacity duration-slower ease-out"
					style={{
						left: field.left,
						top: field.top,
						width: field.width,
						height: field.height,
						opacity: chrome ? 0 : 1,
					}}
				/>
			)}
			{presenting ? (
				<Presenter
					ask={mine}
					deck={deck}
					talk={talk}
					shown={moment.kind === "on"}
					onPicture={() => setPictured(true)}
					onEnd={end}
					onRefused={(why) => {
						hands.current.say(`The talk could not be played: ${why}`);
						end(mine.slide);
					}}
				/>
			) : null}
			{moment.kind === "leave" && moment.from !== null ? (
				<Travel
					key={`leave-${moment.talk}`}
					timing={timing}
					picture={moment.picture}
					from={moment.from}
					to={big}
					leaving
					onDone={() => land(moment)}
				/>
			) : null}
			{moment.kind === "on" && !moment.handed ? (
				<div
					key={`on-${moment.talk}`}
					aria-hidden="true"
					data-deck-travel="on"
					className="pointer-events-none fixed top-0 left-0 z-50 overflow-hidden rounded-md bg-[black]"
					style={{ left: big.x, top: big.y, width: big.w, height: big.h }}
				>
					<Picture src={moment.picture} />
				</div>
			) : null}
			{moment.kind === "back" && moment.to !== null ? (
				moment.to === undefined ? (
					<Travel
						key={`stay-${moment.talk}`}
						timing={timing}
						picture={coverOf(store, project, moment.frame)}
						from={big}
						to={big}
					/>
				) : (
					<Travel
						key={`back-${moment.talk}`}
						timing={timing}
						picture={coverOf(store, project, moment.frame)}
						from={big}
						to={moment.to}
						onDone={() => done(moment)}
					/>
				)
			) : null}
		</>,
		document.body,
	);
}

/**
 * The slide on its way: its picture as the canvas has it, fitted on black, from one box to another. Leaving the
 * canvas, it waits a beat for the chrome to start going, then travels, and is done the frame it stands within a
 * quarter of a pixel of its box: the ease's tail moves it no further one can see, and the picture, stretched there,
 * would stand soft through it while the live slide waits (spool#316).
 */
function Travel({
	timing,
	picture,
	from,
	to,
	leaving = false,
	onDone,
}: {
	timing: DeckMotion;
	picture: string | undefined;
	from: Rect;
	to: Rect;
	leaving?: boolean;
	onDone?: () => void;
}) {
	const t = leaving
		? { duration: timing.leave / 1000, delay: timing.leaveWait / 1000, ease: timing.snap }
		: { duration: timing.return / 1000, ease: timing.snap };
	const finished = useRef(false);
	const finish = () => {
		if (finished.current) return;
		finished.current = true;
		onDone?.();
	};
	return (
		<motion.div
			aria-hidden="true"
			data-deck-travel={leaving ? "leave" : "back"}
			className="pointer-events-none fixed top-0 left-0 z-50 overflow-hidden bg-[black]"
			initial={{ x: from.x, y: from.y, width: from.w, height: from.h, borderRadius: leaving ? 3 : 6 }}
			animate={{ x: to.x, y: to.y, width: to.w, height: to.h, borderRadius: leaving ? 6 : 3 }}
			transition={t}
			onUpdate={(at) => {
				if (!leaving) return;
				const off = (value: unknown, aim: number) => typeof value !== "number" || Math.abs(value - aim) > 0.25;
				if (off(at.x, to.x) || off(at.y, to.y) || off(at.width, to.w) || off(at.height, to.h)) return;
				finish();
			}}
			onAnimationComplete={finish}
		>
			<Picture src={picture} />
		</motion.div>
	);
}

function Picture({ src }: { src: string | undefined }) {
	return src === undefined ? null : (
		<img alt="" src={src} draggable={false} className="absolute inset-0 h-full w-full object-contain" />
	);
}

const toRect = (box: { x: number; y: number; w: number; h: number }): Rect => ({
	x: box.x,
	y: box.y,
	w: box.w,
	h: box.h,
});

function mark(root: HTMLElement, name: "deckAway" | "deckMoving" | "deckPresenting", on: boolean): void {
	if (on) root.dataset[name] = "";
	else delete root.dataset[name];
}

/**
 * The chrome falling away and coming back, by the marks on the document: the window's bar lifts, each side slides out
 * past its edge, the tools sink; only while a moment plays do these transitions run, so nothing else moves by them.
 * While the talk is on the canvas rests unseen.
 */
const CHROME = [".app-header", "aside[data-side]", "[aria-label='canvas tools']"];
const FALL = `
${CHROME.map((one) => `:root[data-deck-moving] ${one}`).join(", ")} {
	transition: translate var(--transition-duration-slower) var(--ease-snap), opacity var(--transition-duration-slow) var(--ease-out) !important;
}
:root[data-deck-away] .app-header { translate: 0 -10px; opacity: 0; }
:root[data-deck-away] aside[data-side="left"] { translate: -32px 0; opacity: 0; }
:root[data-deck-away] aside[data-side="right"] { translate: 32px 0; opacity: 0; }
:root[data-deck-away] [aria-label='canvas tools'] { translate: 0 18px; opacity: 0; }
:root[data-deck-presenting] [data-page-field] { visibility: hidden; }
`;
