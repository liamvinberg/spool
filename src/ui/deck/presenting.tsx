import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Size } from "../../deck/deck-file";
import { coverUrl } from "../api";
import type { CameraStore } from "../canvas/camera-store";
import type { CanvasStore } from "../canvas/canvas-store";
import { type DeckReads, useDeckRead } from "./deck-api";
import { presentDone, usePresentAsk } from "./present";
import { Presenter, useWindowSize } from "./presenter";
import { presenterLayout } from "./presenter-layout";

/**
 * Presenting on the canvas (spool#265, the team canvas's `app/spool-deck` and `--presenter`): what happens to spool's
 * own window between Present and End. The chrome falls away around the slide presented from (the window's bar lifts,
 * each side slides out past its edge, the tools sink, the canvas darkens to the presenter's ground) while the slide
 * travels from its place on the canvas to where the presenter view holds it; the rest of the view arrives around it.
 * The slide's picture stays over the presenter's stage until the stage has drawn its own. End plays it back: the slide
 * the talk ended on travels to its place on the canvas, selected there, while the chrome comes back.
 */

const SNAP = [0.32, 0.72, 0, 1] as const;
const EASE_OUT = [0.22, 0.61, 0.36, 1] as const;
/** the slide leaving the canvas: it waits a beat for the chrome to start going, then travels */
const LEAVE = { duration: 0.66, delay: 0.12 };
/** the slide coming back, and how long the chrome waits before it follows */
const RETURN = { duration: 0.56 };
const CHROME_BACK_MS = 200;
/** with no slide on screen to travel from, how long the chrome takes to fall away before the view is drawn */
const FALL_MS = 400;
/** the slide's picture giving way to the stage's own */
const HANDOVER_S = 0.18;

/** A box on the window, in its pixels. */
interface Rect {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

type Moment =
	/** Present was pressed: the chrome falls away and the slide travels, from `from` when it was on screen */
	| { readonly kind: "leave"; readonly talk: string; readonly frame: string; readonly from: Rect | null }
	/** the presenter view is drawn; the picture that travelled stays until the stage has drawn its own */
	| { readonly kind: "on"; readonly talk: string; readonly frame: string; readonly handed: boolean }
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

export function Presenting({ project, store, camera, reads, viewport, onEnded, say }: PresentingProps) {
	const still = useReducedMotion() === true;
	const ask = usePresentAsk();
	const mine = ask !== null && ask.project === project ? ask : null;
	const deck = useDeckRead(reads, mine?.page ?? "");
	const window_ = useWindowSize();
	const [moment, setMoment] = useState<Moment | null>(null);
	const [pictured, setPictured] = useState(false);
	const hands = useRef({ onEnded, say });
	hands.current = { onEnded, say };
	const talk: Size = deck?.size ?? { w: 1280, h: 720 };
	/** where a frame stands on the window, while it stands in view */
	const cardOf = (frame: string): Rect | null => {
		const box = store.get().frames.find((one) => one.name === frame);
		const at = camera.get();
		const field = viewport()?.getBoundingClientRect();
		if (box === undefined || at === null || field === undefined) return null;
		const card = {
			x: field.left + at.x + box.x * at.k,
			y: field.top + at.y + box.y * at.k,
			w: box.w * at.k,
			h: box.h * at.k,
		};
		const seen =
			card.x + card.w > field.left && card.y + card.h > field.top && card.x < field.right && card.y < field.bottom;
		return seen ? card : null;
	};
	const where = useRef(cardOf);
	where.current = cardOf;
	const big = toRect(presenterLayout(window_, talk).slide);

	/** the slide arrived where the presenter view holds it: the view is drawn around it */
	const land = useCallback(
		(from: Moment) =>
			setMoment((now) => (now === from ? { kind: "on", talk: from.talk, frame: from.frame, handed: false } : now)),
		[],
	);
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

	// Present pressed: the slide leaves the canvas from where it stands, if it stands on screen
	useLayoutEffect(() => {
		if (mine === null) return;
		setMoment((now) => {
			if (now !== null && now.talk === mine.talk) return now;
			const card = where.current(mine.slide);
			return { kind: "leave", talk: mine.talk, frame: mine.slide, from: still || card === null ? null : card };
		});
		setPictured(false);
	}, [mine, still]);

	// with nothing to travel, the view is drawn once the chrome has gone
	useEffect(() => {
		if (moment?.kind !== "leave" || moment.from !== null) return;
		const timer = setTimeout(() => land(moment), still ? 0 : FALL_MS);
		return () => clearTimeout(timer);
	}, [moment, still, land]);

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
		const timer = setTimeout(() => setChrome(true), still ? 0 : CHROME_BACK_MS);
		return () => clearTimeout(timer);
	}, [moment, still]);
	// nothing travels home: the moment is over once the chrome is back
	useEffect(() => {
		if (moment?.kind !== "back" || moment.to !== null) return;
		const timer = setTimeout(() => done(moment), still ? 0 : FALL_MS);
		return () => clearTimeout(timer);
	}, [moment, still, done]);
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
	const picture = (frame: string) => {
		const cover = store.get().frames.find((one) => one.name === frame)?.cover;
		return cover === undefined ? undefined : coverUrl(project, frame, cover.hash);
	};
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
					picture={picture(moment.frame)}
					from={moment.from}
					to={big}
					leaving
					onDone={() => land(moment)}
				/>
			) : null}
			{moment.kind === "on" && !moment.handed ? (
				<motion.div
					key={`on-${moment.talk}`}
					aria-hidden="true"
					className="pointer-events-none fixed top-0 left-0 z-50 overflow-hidden rounded-md bg-[black]"
					style={{ x: big.x, y: big.y, width: big.w, height: big.h }}
					initial={{ opacity: 1 }}
					animate={{ opacity: pictured ? 0 : 1 }}
					transition={{ duration: still ? 0 : HANDOVER_S, ease: EASE_OUT }}
					onAnimationComplete={() => {
						if (pictured) setMoment((now) => (now === moment ? { ...moment, handed: true } : now));
					}}
				>
					<Picture src={picture(moment.frame)} />
				</motion.div>
			) : null}
			{moment.kind === "back" && moment.to !== null ? (
				moment.to === undefined ? (
					<Travel key={`stay-${moment.talk}`} picture={picture(moment.frame)} from={big} to={big} />
				) : (
					<Travel
						key={`back-${moment.talk}`}
						picture={picture(moment.frame)}
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

/** The slide on its way: its picture as the canvas has it, fitted on black, from one box to another. */
function Travel({
	picture,
	from,
	to,
	leaving = false,
	onDone,
}: {
	picture: string | undefined;
	from: Rect;
	to: Rect;
	leaving?: boolean;
	onDone?: () => void;
}) {
	const t = { ...(leaving ? LEAVE : RETURN), ease: SNAP };
	return (
		<motion.div
			aria-hidden="true"
			data-deck-travel={leaving ? "leave" : "back"}
			className="pointer-events-none fixed top-0 left-0 z-50 overflow-hidden bg-[black]"
			initial={{ x: from.x, y: from.y, width: from.w, height: from.h, borderRadius: leaving ? 3 : 6 }}
			animate={{ x: to.x, y: to.y, width: to.w, height: to.h, borderRadius: leaving ? 6 : 3 }}
			transition={t}
			onAnimationComplete={() => onDone?.()}
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
