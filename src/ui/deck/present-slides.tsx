import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Size } from "../../deck/deck-file";
import { parseTalkMessage, roomPasses, type TalkMessage, talkChannel } from "../../deck/present-wire";
import { fitIn, STAGE_GROUND } from "../../deck/stage-fit";
import type { KeyCommand } from "../../deck/stage-keys";
import { roomPicture, type StageSession, type TalkSlide } from "../../deck/stage-session";
import type { StagePointer } from "../../deck/stage-wire";
import type { DeckRead } from "../../deck/wire";
import { mountStage, type StageHost } from "../../runtime/deck/stage-host";
import { cn } from "../cn";
import { attachHotkeyLayer } from "../hotkey-dispatch";
import { useDeckMotion } from "./deck-motion";
import { KeyList } from "./key-list";
import { letGo, readyPicture } from "./opening";
import {
	fillScreen,
	onPresentAgain,
	type PresentAsk,
	type PresentFrom,
	pointerForRoom,
	pointerShown,
	presentCold,
	presentDone,
	showPointer,
} from "./present";
import { notesHead, PresentBar } from "./present-controls";
import { createFlight, type Pose, tune } from "./present-flight";
import { createHand } from "./present-hand";
import { talkSource } from "./talk-source";

/**
 * The slides filling the screen (spool#298, the team canvas's `app/spool-deck` and `--slides`): Present on one display.
 * The slide grows from its card on the canvas until it fills the screen while spool's window is made full screen, and
 * the talk plays there on the deck's own stage, which owns the session: spool's window stays the one authority. A hand
 * that moves wakes a small bar at the foot (back, where the talk is, next, Notes, End), which goes once it rests; the
 * pointer goes with it. End, Esc, or a browser leaving full screen flies the slide home to its card.
 *
 * What flies is one layer moved by a transform on one spring, aimed again from wherever it is, so Esc during the way in
 * or Present during the way home turns it round. It flies as the slide's opening still, the photo booth's picture of
 * it at the size a talk draws it on the beat the talk opens on, whenever the booth has one (spool#319): a picture flies
 * at the same cost whatever is on the slide, where a live slide flown by a transform is drawn again at every size it
 * passes through and stands soft behind it. The live slide takes over in one frame once it has landed and the stage has
 * drawn it, the two the same slide. A slide with no opening still flies as before: as the live slide when the stage has
 * already drawn it (the stage is readied while the hand is on its way to Present), else as the canvas's cover, when
 * that is the slide as the talk starts it, with the live slide taking over once drawn: fading in over it on the way, in
 * one frame once it has landed, as a picture stretched to the screen is never what stands there (spool#316); else it
 * waits, the screen filling, until one of the two is there, rather than fly blank. The stage puts its first slide on at
 * rest, as its picture shows it. Once the live slide is on, it stays on: the way home flies it as drawn, and on its
 * card the card is shown under it before it lets go.
 *
 * With two displays, the caret's Full screen plays this way here and the room on the other display, which follows the
 * talk over its channel as it follows the presenter view.
 */

/** A box on the window, in its pixels. */
export interface Rect {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/** Where a card stands on the window, and its corner's radius there. */
export interface Card {
	readonly rect: Rect;
	readonly r: number;
}

type Phase =
	/** readied out of sight, for a Present on its way */
	| "warm"
	/** Present pressed: the screen fills while the slide waits for a picture to fly as */
	| "waiting"
	/** flying to fill the screen */
	| "in"
	/** the talk is on */
	| "on"
	/** flying home to its card */
	| "home"
	/** on its card, letting go of it */
	| "letting";

/** How long a readied stage waits for Present before it is let go. */
const WARM_MS = 30_000;

/**
 * Frames an opening still stands over the live slide once it is on under it, at rest: about what a cross-process frame
 * takes to be drawn again at a new size, which the still hides (spool#319).
 */
const SETTLE_FRAMES = 4;

/** Once `count` frames have been drawn. */
function frames(count: number): Promise<void> {
	return new Promise((done) => {
		const next = (left: number) => (left <= 0 ? done() : requestAnimationFrame(() => next(left - 1)));
		next(count);
	});
}

export interface PresentSlidesProps {
	/**
	 * the talk asked for this way, while one is: without the room's window, a window of another origin, which refuses
	 * being read by whatever compares what a component is given
	 */
	readonly ask: Omit<PresentAsk, "room"> | null;
	/** the slide readied for Present, while one is and no talk is on */
	readonly warm: PresentFrom | null;
	/** the deck as last read: each slide's beats by name, and its notes */
	readonly deck: DeckRead | undefined;
	/** the talk's shape */
	readonly talk: Size;
	/** where a frame's card stands on the window, while it stands in view */
	cardOf(frame: string): Card | null;
	/**
	 * pictures of a frame that are the slide as a talk starts on it: its opening still, when the booth has taken one, and
	 * the canvas's cover, of a slide of one beat
	 */
	pictureOf(frame: string): { readonly opening: string | undefined; readonly cover: string | undefined };
	/** the talk ended on `frame`: the canvas selects it, and brings it into view */
	onEnded(frame: string): void;
	/** a talk that could not be played, and why */
	say(message: string): void;
	/** the talk's room's window closed, when the press opened one */
	closeRoom(): void;
}

export function PresentSlides({
	ask,
	warm,
	deck,
	talk,
	cardOf,
	pictureOf,
	onEnded,
	say,
	closeRoom,
}: PresentSlidesProps) {
	const still = useReducedMotion() === true;
	const timing = useDeckMotion();
	const holding = ask ?? warm;
	const [phase, setPhaseState] = useState<Phase | null>(null);
	const phaseRef = useRef<Phase | null>(null);
	const setPhase = useCallback((next: Phase | null) => {
		phaseRef.current = next;
		setPhaseState(next);
	}, []);
	const [session, setSession] = useState<StageSession | undefined>(undefined);
	const [slides, setSlides] = useState<readonly TalkSlide[]>([]);
	const [awake, setAwake] = useState(false);
	const [pinned, setPinned] = useState(false);
	const [help, setHelp] = useState(false);
	/** the slides fill the page, and wait for a click to fill the screen: the press opened the room's window instead */
	const [unfilled, setUnfilled] = useState(false);

	const flyer = useRef<HTMLDivElement | null>(null);
	/** what stands over a card while its slide is away: moved by hand, so it goes the very frame the slide is back */
	const placeBox = useRef<HTMLDivElement | null>(null);
	const setPlace = useCallback((at: Rect | null) => {
		const el = placeBox.current;
		if (el === null) return;
		el.style.display = at === null ? "none" : "block";
		if (at === null) return;
		Object.assign(el.style, {
			left: `${at.x - 3}px`,
			top: `${at.y - 3}px`,
			width: `${at.w + 6}px`,
			height: `${at.h + 6}px`,
		});
	}, []);
	const pictureBox = useRef<HTMLDivElement | null>(null);
	const liveBox = useRef<HTMLDivElement | null>(null);
	const ground = useRef<HTMLDivElement | null>(null);
	const host = useRef<StageHost | null>(null);
	const room = useRef<{ say: (message: TalkMessage) => void; close: () => void } | null>(null);
	/** each start of a flight, so one aimed again never lands for an older one */
	const trip = useRef(0);
	/** the talk under way, by its name */
	const started = useRef<string | null>(null);
	/** the frame the talk starts on, and the frame the stage shows at its first beat, if it does */
	const wanted = useRef<string | null>(null);
	const drawn = useRef<string | null>(null);
	/**
	 * the window is on its way to cover the screen: the slide waits on its card until it has, as a window changing size
	 * draws nothing, and a slide that set off under it would show up half way there
	 */
	const filling = useRef(false);
	/** the live slide is on in the flying layer, for the rest of the talk */
	const liveOn = useRef(false);
	/** the picture the slide flies as, decoded */
	const pictured = useRef(false);
	/** the slide flies as its opening still the whole way, and the live slide takes over once it has landed */
	const stillFlies = useRef(false);
	/** where the window's page stands on the screen, so the slide stays put on it while the window moves */
	const origin = useRef(viewportOrigin());
	const hands = useRef({ cardOf, pictureOf, onEnded, say, closeRoom, talk, still, timing, pinned, help });
	hands.current = { cardOf, pictureOf, onEnded, say, closeRoom, talk, still, timing, pinned, help };

	// one spring for everything that flies, the theme's; under reduced motion nothing flies, and its duration is zero
	const flight = useRef(
		createFlight({ x: 0, y: 0, w: talk.w, r: 0 }, tune(timing.present.duration, timing.present.bounce)),
	);
	const loop = useRef(0);
	const draw = useCallback(() => {
		const el = flyer.current;
		if (el === null) return;
		const pose = flight.current.pose();
		const s = pose.w / hands.current.talk.w;
		el.style.transform = `translate(${pose.x}px, ${pose.y}px) scale(${s})`;
		el.style.borderRadius = `${pose.r / Math.max(0.001, s)}px`;
	}, []);
	const run = useCallback(() => {
		if (loop.current !== 0) return;
		let last = performance.now();
		const tick = (now: number) => {
			const moved = flight.current.step((now - last) / 1000);
			last = now;
			draw();
			loop.current = moved ? requestAnimationFrame(tick) : 0;
		};
		loop.current = requestAnimationFrame(tick);
	}, [draw]);
	/** fly there from wherever the slide is; at once, without motion */
	const aim = useCallback(
		(to: Pose, landed?: () => void) => {
			if (hands.current.still) {
				flight.current.set(to);
				draw();
				landed?.();
				return;
			}
			flight.current.aim(to, landed);
			run();
		},
		[draw, run],
	);
	useEffect(() => () => cancelAnimationFrame(loop.current), []);

	const landing = useCallback((): Pose => {
		const { talk: size } = hands.current;
		const f = fitIn(size, { w: window.innerWidth, h: window.innerHeight });
		return { x: f.x, y: f.y, w: size.w * f.s, r: 0 };
	}, []);
	/** the slide laid over its card: the talk's screen whose fitted slide is the card */
	const onCard = useCallback((card: Card): Pose => {
		const { talk: size } = hands.current;
		const s = Math.max(card.rect.w / size.w, card.rect.h / size.h);
		return {
			x: card.rect.x + (card.rect.w - size.w * s) / 2,
			y: card.rect.y + (card.rect.h - size.h * s) / 2,
			w: size.w * s,
			r: card.r,
		};
	}, []);

	const fade = useCallback((el: HTMLElement | null, to: number, ms: number) => {
		if (el === null) return Promise.resolve();
		const from = Number(getComputedStyle(el).opacity);
		for (const running of el.getAnimations()) running.cancel();
		el.style.opacity = String(to);
		if (hands.current.still || ms <= 0 || from === to) return Promise.resolve();
		const easing = `cubic-bezier(${hands.current.timing.out.join(", ")})`;
		return el.animate([{ opacity: from }, { opacity: to }], { duration: ms, easing }).finished.then(
			() => {},
			() => {},
		);
	}, []);

	/**
	 * the live slide on in the flying layer, fading in over its picture while it flies, or at once when `now` (the talk
	 * moved on from what the picture shows) or once it has landed; never off again this talk. Under an opening still
	 * that has landed, it comes on a few frames before the still goes: a live slide is drawn at the size it stands only
	 * in the frames after it is shown there, and one first drawn small on the way stands soft until then (spool#319).
	 */
	const handOver = useCallback(
		(ms: number, under = false) =>
			void fade(liveBox.current, 1, ms)
				.then(() => (under ? frames(SETTLE_FRAMES) : undefined))
				.then(() => {
					if (liveOn.current) pictureBox.current?.replaceChildren();
				}),
		[fade],
	);
	const showLive = useCallback(
		(at: "now" | "fade" | "landed") => {
			if (liveOn.current) return;
			liveOn.current = true;
			if (at === "landed") handOver(0, stillFlies.current);
			else handOver(at === "fade" && phaseRef.current === "in" ? hands.current.timing.handOver : 0);
		},
		[handOver],
	);

	const landed = useCallback(
		(n: number) => () => {
			if (trip.current !== n || phaseRef.current !== "in") return;
			setPhase("on");
			// a hand-over still fading as the slide lands is done in this frame: a stretched picture never stands there
			if (liveOn.current) handOver(0);
			else if (stillFlies.current && drawn.current !== null && drawn.current === wanted.current) showLive("landed");
		},
		[handOver, setPhase, showLive],
	);

	/** the slide sets off, as its opening still, else as the live slide when the stage has drawn it, else as its cover */
	const launch = useCallback(() => {
		if (phaseRef.current !== "waiting" || filling.current) return;
		const start = wanted.current;
		if (!stillFlies.current && start !== null && drawn.current === start) showLive("now");
		else if (!pictured.current) return;
		const n = trip.current;
		const card = start === null ? null : hands.current.cardOf(start);
		setPlace(card?.rect ?? null);
		setPhase("in");
		// the black comes as the slide sets off, not before: a card left on the canvas while its picture is not there
		// yet stays in sight, rather than sink into the black and come back out of it
		void fade(ground.current, 1, hands.current.timing.groundIn);
		// a slide with no card in view to grow from comes up where it lands
		if (card === null) void fade(flyer.current, 1, hands.current.timing.groundIn);
		aim(landing(), landed(n));
	}, [aim, fade, landing, landed, setPhase, showLive, setPlace]);

	// the window lets go of the screen once the slide is home, as it covered the screen before the slide set off: a
	// window changing size draws nothing, so nothing flies while it does
	const done = useCallback(() => {
		fillScreen(false);
		cancelAnimationFrame(loop.current);
		loop.current = 0;
		started.current = null;
		setPlace(null);
		setPhase(null);
		presentDone();
	}, [setPhase, setPlace]);

	const currentFrame = useCallback((): string | null => {
		const now = host.current?.session();
		const frame = now === undefined ? undefined : host.current?.talk()[now.at.slide]?.frame;
		return frame ?? wanted.current;
	}, []);

	const goHome = useCallback(
		(frame: string, n: number, select: boolean) => {
			const card = hands.current.cardOf(frame);
			if (trip.current !== n) return;
			const letGo = () => {
				if (trip.current !== n) return;
				setPhase("letting");
				// the card is under the slide first, drawn there a frame, then the slide lets go of it; and it is selected
				// once the slide has gone, as the canvas redrawing its chrome would hold up anything moving
				setPlace(null);
				requestAnimationFrame(() => {
					if (trip.current !== n) return;
					void fade(flyer.current, 0, hands.current.timing.handOver).then(() => {
						if (trip.current !== n) return;
						done();
						if (select) hands.current.onEnded(frame);
					});
				});
			};
			if (card === null) {
				letGo();
				return;
			}
			setPlace(card.rect);
			aim(onCard(card), letGo);
		},
		[aim, done, fade, onCard, setPhase, setPlace],
	);

	/** End, Esc, or full screen left: the slide flies home to its card, from wherever it is */
	const end = useCallback(() => {
		const was = phaseRef.current;
		if (was !== "waiting" && was !== "in" && was !== "on") return;
		const n = ++trip.current;
		const frame = currentFrame();
		setPhase("home");
		setPinned(false);
		setHelp(false);
		setAwake(false);
		void fade(ground.current, 0, hands.current.timing.groundOut);
		if (was === "waiting" || frame === null) {
			// nothing flew: the screen empties, and the canvas is where it was
			fillScreen(false);
			if (frame !== null) hands.current.onEnded(frame);
			setPlace(null);
			void fade(flyer.current, 0, hands.current.timing.groundOut).then(() => {
				if (trip.current === n) done();
			});
			return;
		}
		if (hands.current.cardOf(frame) !== null) {
			goHome(frame, n, true);
			return;
		}
		// a card out of sight is brought into view first, and the slide sets off once the canvas has drawn it there
		hands.current.onEnded(frame);
		requestAnimationFrame(() => requestAnimationFrame(() => goHome(frame, n, false)));
	}, [currentFrame, done, fade, goHome, setPhase, setPlace]);
	const ending = useRef(end);
	ending.current = end;
	const launching = useRef(launch);
	launching.current = launch;
	const showing = useRef(showLive);
	showing.current = showLive;

	// Present pressed while the slide flies home: it turns round from where it is, and the talk goes on
	useEffect(() => {
		onPresentAgain(() => {
			const now = phaseRef.current;
			if (now !== "home" && now !== "letting") return false;
			const n = ++trip.current;
			setPhase("in");
			void fade(ground.current, 1, hands.current.timing.groundIn);
			void fade(flyer.current, 1, 0);
			const frame = currentFrame();
			const card = frame === null ? null : hands.current.cardOf(frame);
			setPlace(card?.rect ?? null);
			aim(landing(), landed(n));
			return true;
		});
		return () => onPresentAgain(null);
	}, [aim, currentFrame, fade, landed, landing, setPhase, setPlace]);

	// the stage, for as long as a slide is readied or presented on this deck page
	const deckKey = holding === null ? null : `${holding.project}\n${holding.page}`;
	const opening = useRef(holding);
	opening.current = holding;
	useEffect(() => {
		const from = opening.current;
		const box = liveBox.current;
		if (deckKey === null || from === null || box === null) return;
		const source = talkSource(from.project, from.page);
		drawn.current = null;
		const mounted = mountStage(box, {
			address: source.address,
			mode: "own",
			room: true,
			filling: true,
			rest: true,
			frame: from.slide,
			on: {
				talk: (talk) => {
					setSlides(talk);
					// a stage readied on another slide, opened before it could be moved: the talk starts where it was asked
					if (wanted.current !== null) cut(mounted, wanted.current);
				},
				session: (now) => {
					setSession(now);
					// the talk moved on from the slide its picture shows: the live slide takes over at once
					const on = mounted.talk()[now.at.slide]?.frame;
					const up = phaseRef.current === "in" || phaseRef.current === "on";
					if (up && !liveOn.current && (on !== wanted.current || now.at.beat !== 0)) showing.current("now");
					const said = room.current;
					const frame = mounted.talk()[roomPicture(now).at.slide]?.frame;
					if (said !== null && frame !== undefined) said.say({ kind: "session", session: now, frame });
				},
				shown: (shown) => {
					drawn.current = shown.at.beat === 0 ? shown.frame : null;
					if (shown.frame !== wanted.current) return;
					if (phaseRef.current === "waiting") launching.current();
					// an opening still flies the whole way, and the live slide takes over as it lands
					else if (stillFlies.current) {
						if (phaseRef.current === "on") showing.current("landed");
					} else if (phaseRef.current === "in" || phaseRef.current === "on") showing.current("fade");
				},
				command: (command) => carry.current(command),
				pointer: (at) => pointed.current(at),
				refused: (why) => {
					if (phaseRef.current === null || phaseRef.current === "warm") return;
					hands.current.say(`The talk could not be played: ${why}`);
					ending.current();
				},
			},
		});
		host.current = mounted;
		const stopFollowing = source.follow(() => [mounted]);
		return () => {
			stopFollowing();
			mounted.destroy();
			if (host.current === mounted) host.current = null;
			drawn.current = null;
			liveOn.current = false;
			setSession(undefined);
			setSlides([]);
		};
	}, [deckKey]);

	// readied: the stage stands on the slide Present would play from, out of sight, and is let go after a while
	useEffect(() => {
		if (ask !== null || warm === null) return;
		if (phaseRef.current === null) setPhase("warm");
		cut(host.current, warm.slide);
		const timer = setTimeout(presentCold, WARM_MS);
		return () => clearTimeout(timer);
	}, [ask, warm, setPhase]);
	useEffect(() => {
		if (holding === null && phaseRef.current === "warm") setPhase(null);
	}, [holding, setPhase]);

	// Present pressed: the slide sets off from its card, if it stands on screen, as soon as there is a picture of it
	useLayoutEffect(() => {
		if (ask === null || started.current === ask.talk) return;
		started.current = ask.talk;
		const n = ++trip.current;
		wanted.current = ask.slide;
		liveOn.current = false;
		pictured.current = false;
		pictureBox.current?.replaceChildren();
		if (liveBox.current !== null) liveBox.current.style.opacity = "0";
		cut(host.current, ask.slide);
		origin.current = viewportOrigin();
		const card = hands.current.cardOf(ask.slide);
		if (flyer.current !== null) flyer.current.style.opacity = card === null ? "0" : "1";
		flight.current.set(card === null ? landing() : onCard(card));
		draw();
		setSession(undefined);
		setAwake(false);
		setPinned(false);
		setHelp(false);
		setUnfilled(!ask.fillAsked);
		setPhase("waiting");
		filling.current = ask.fillAsked;
		void ask.filling.then(() => {
			if (trip.current !== n || !filling.current) return;
			filling.current = false;
			launching.current();
		});
		const slide = ask.slide;
		const { opening, cover } = hands.current.pictureOf(slide);
		// the flight holds the picture it flies from here, not the canvas, and drops it once the live slide has taken over
		const flyAs = (url: string, image: HTMLImageElement) => {
			letGo(url);
			image.className = "absolute inset-0 h-full w-full object-contain";
			pictureBox.current?.replaceChildren(image);
			// an opening still stands over the live slide until it goes; a cover is what the live slide fades in over
			if (pictureBox.current !== null) pictureBox.current.style.zIndex = stillFlies.current ? "1" : "";
			pictured.current = true;
			launch();
		};
		// with no opening still, or one that would not load: a stage readied on the slide has drawn it already, and it
		// sets off as that, else as its cover
		const asBefore = () => {
			stillFlies.current = false;
			if (drawn.current === slide) {
				launch();
				return;
			}
			if (cover === undefined) return;
			void readyPicture(cover).then((image) => {
				if (trip.current === n && !liveOn.current && image !== null) flyAs(cover, image);
			});
		};
		stillFlies.current = opening !== undefined;
		if (opening === undefined) return asBefore();
		void readyPicture(opening).then((image) => {
			if (trip.current !== n || liveOn.current) return letGo(opening);
			if (image === null) asBefore();
			else flyAs(opening, image);
		});
	}, [ask, draw, landing, launch, onCard, setPhase]);

	// a canvas that goes while a talk is on takes the talk with it
	useEffect(
		() => () => {
			if (started.current !== null) {
				fillScreen(false);
				presentDone();
			}
		},
		[],
	);

	// the window moved or changed size under the slide (full screen, coming and going): it stays put on the screen,
	// then flies on to where it now lands
	useEffect(() => {
		const moved = () => {
			const now = viewportOrigin();
			flight.current.shift(origin.current.x - now.x, origin.current.y - now.y);
			origin.current = now;
			const at = phaseRef.current;
			const n = trip.current;
			if (at === "waiting") {
				const card = wanted.current === null ? null : hands.current.cardOf(wanted.current);
				flight.current.set(card === null ? landing() : onCard(card));
				draw();
			} else if (at === "in") aim(landing(), landed(n));
			else if (at === "on") aim(landing());
			else if (at === "home") {
				const frame = currentFrame();
				if (frame !== null) goHome(frame, n, true);
			} else draw();
		};
		window.addEventListener("resize", moved);
		return () => window.removeEventListener("resize", moved);
	}, [aim, currentFrame, draw, goHome, landed, landing, onCard]);

	// a browser leaving full screen by itself (Esc, where the page cannot hold it) ends the talk
	useEffect(() => {
		let full = false;
		const changed = () => {
			if (document.fullscreenElement !== null) {
				full = true;
				setUnfilled(false);
			} else if (full) {
				full = false;
				ending.current();
			}
		};
		document.addEventListener("fullscreenchange", changed);
		return () => document.removeEventListener("fullscreenchange", changed);
	}, []);

	const talking = phase === "waiting" || phase === "in" || phase === "on";

	// what the talk's keys and the room ask of this window
	const carry = useRef<(command: KeyCommand) => void>(() => {});
	carry.current = (command) => {
		if (hands.current.help) {
			if (command.kind === "escape" || command.kind === "help") setHelp(false);
			return;
		}
		if (command.kind === "escape") {
			// up one step: a pinned Notes, then the talk
			if (hands.current.pinned) setPinned(false);
			else end();
		} else if (command.kind === "help") setHelp(true);
		else if (command.kind === "show-pointer") {
			// a room on the other display is shown the pointer; with none, there is nobody to show it
			const said = room.current;
			if (said === null) return;
			const on = !pointerShown();
			showPointer(on);
			said.say({ kind: "pointer", at: pointerForRoom(pointedAt.current, on) });
		} else if (command.kind !== "swap" && command.kind !== "blur" && phaseRef.current === "on")
			host.current?.command(command);
	};

	// the keyboard is the talk's while it is on: nothing behind it hears a key, and spool's own keys rest
	useEffect(() => {
		if (!talking) return;
		ground.current?.focus({ preventScroll: true });
		const down = (event: KeyboardEvent) => {
			event.stopPropagation();
			if (hands.current.help) {
				if (event.key === "Escape" || event.key === "?" || event.key === "Tab") event.preventDefault();
				if (event.key === "Escape" || event.key === "?") setHelp(false);
				return;
			}
			// on its way in, the slide is the talk's start: Esc turns it round, and nothing else moves it yet
			if (phaseRef.current !== "on") {
				event.preventDefault();
				if (event.key === "Escape") end();
				return;
			}
			if (host.current?.key(event) === true) event.preventDefault();
		};
		window.addEventListener("keydown", down, true);
		const rest = attachHotkeyLayer({ scope: "dialog", handlers: {} });
		return () => {
			window.removeEventListener("keydown", down, true);
			rest();
		};
	}, [talking, end]);

	// a live slide given the keys hears them in its own document, and gives them back
	const keys = session?.keys === true;
	useEffect(() => {
		if (phase !== "on") return;
		if (keys) host.current?.focus();
		else ground.current?.focus({ preventScroll: true });
	}, [keys, phase]);

	// the hand: a move wakes the bar, a rest lets it go, and the pointer goes with it
	const slideBox = useRef(landing());
	const pointed = useRef<(at: StagePointer | null) => void>(() => {});
	const pointedAt = useRef<StagePointer | null>(null);
	const hand = useRef<ReturnType<typeof createHand> | null>(null);
	pointed.current = (at) => {
		// the room's soft dot follows the hand over a live slide, as it follows the presenter view's, while it is shown
		pointedAt.current = at;
		room.current?.say({ kind: "pointer", at: pointerForRoom(at, pointerShown()) });
		if (at === null) return;
		const box = slideBox.current;
		hand.current?.move({ x: box.x + at.x * box.w, y: box.y + (at.y * box.w * talk.h) / talk.w });
	};
	useEffect(() => {
		if (phase !== "on") return;
		slideBox.current = landing();
		const made = createHand(setAwake);
		hand.current = made;
		const move = (event: PointerEvent) => made.move({ x: event.clientX, y: event.clientY });
		const resized = () => {
			slideBox.current = landing();
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("resize", resized);
		return () => {
			made.stop();
			hand.current = null;
			window.removeEventListener("pointermove", move);
			window.removeEventListener("resize", resized);
			setAwake(false);
		};
	}, [phase, landing]);
	const asleep = phase === "on" && !awake && !pinned && !help;
	useEffect(() => {
		host.current?.cursor(asleep);
	}, [asleep]);

	// with two displays, the room on the other one follows the talk over its channel
	useEffect(() => {
		if (ask === null || !ask.roomAsked) return;
		const closeRoom = hands.current.closeRoom;
		const channel = new BroadcastChannel(talkChannel(ask.talk));
		const said = (message: TalkMessage) => channel.postMessage(message);
		const publish = () => {
			const now = host.current?.session();
			const frame = now === undefined ? undefined : host.current?.talk()[roomPicture(now).at.slide]?.frame;
			if (now !== undefined && frame !== undefined) said({ kind: "session", session: now, frame });
		};
		channel.addEventListener("message", (event) => {
			const message = parseTalkMessage(event.data);
			if (message?.kind === "ask") publish();
			else if (message?.kind === "command" && roomPasses(message.command)) carry.current(message.command);
		});
		room.current = { say: said, close: () => channel.close() };
		const leave = () => said({ kind: "end" });
		addEventListener("pagehide", leave);
		return () => {
			removeEventListener("pagehide", leave);
			said({ kind: "end" });
			channel.close();
			room.current = null;
			closeRoom();
		};
	}, [ask]);

	if (phase === null && holding === null) return null;
	const at = session?.at ?? {
		slide: Math.max(
			0,
			slides.findIndex((one) => one.frame === ask?.slide),
		),
		beat: 0,
	};
	const frame = slides[at.slide]?.frame ?? ask?.slide ?? "";
	const read = deck?.slides.find((one) => one.name === frame);
	const live = slides[at.slide]?.live === true;
	const black = session?.black === true;
	const shown = phase !== null && phase !== "warm";

	return createPortal(
		<div
			data-present-slides={phase ?? "warm"}
			className={cn("pointer-events-none fixed inset-0 z-50", asleep && "cursor-none [&_*]:cursor-none")}
		>
			<div
				ref={placeBox}
				aria-hidden="true"
				data-present-place=""
				className="pointer-events-none absolute bg-surface-panel"
				style={{ display: "none" }}
			/>
			{/* the black the slides stand on, over the whole window */}
			<div
				ref={ground}
				tabIndex={-1}
				role="dialog"
				aria-modal={talking}
				aria-label="Presenting"
				aria-hidden={talking ? undefined : true}
				className={cn("absolute inset-0 outline-none", talking && "pointer-events-auto")}
				style={{ background: STAGE_GROUND, opacity: 0 }}
			/>
			{/* the slide: its picture while the live slide is not drawn yet, and the live slide; out of the hand's way, its
			    live document included, until it has landed */}
			<div
				ref={flyer}
				data-present-flyer=""
				aria-hidden={shown ? undefined : "true"}
				inert={phase !== "on"}
				className={cn(
					"absolute top-0 left-0 origin-top-left overflow-hidden",
					phase === "on" && "pointer-events-auto",
				)}
				style={{ width: talk.w, height: talk.h, opacity: 0 }}
			>
				<div ref={pictureBox} className="pointer-events-none absolute inset-0" />
				<div ref={liveBox} data-present-live="" className="absolute inset-0" style={{ opacity: 0 }} />
			</div>
			{/* over a slide that is not live, a click is the next beat, and the pointer is spool's to hide */}
			{phase === "on" && !live && !keys ? (
				<div
					aria-hidden="true"
					data-present-clear=""
					className="pointer-events-auto absolute inset-0"
					onClick={() => host.current?.command(black ? { kind: "black", on: false } : { kind: "next" })}
				/>
			) : null}
			{/* with the room's window opened in the press, the first click on the slides makes this window full screen, and
			    does nothing else */}
			{phase === "on" && unfilled ? (
				<div
					aria-hidden="true"
					data-present-fill=""
					className="pointer-events-auto absolute inset-0"
					onClick={() => {
						setUnfilled(false);
						fillScreen(true);
					}}
				/>
			) : null}
			{phase === "on" ? (
				<PresentBar
					awake={awake}
					slide={at.slide}
					slides={slides.length}
					head={notesHead(frame, read?.beats ?? [], at.beat)}
					note={read?.notes[at.beat] ?? ""}
					pinned={pinned}
					onPinned={setPinned}
					onBack={() => host.current?.command({ kind: "back" })}
					onNext={() => host.current?.command({ kind: "next" })}
					onEnd={end}
					onHeld={(on) => hand.current?.hold(on)}
				/>
			) : null}
			{help ? (
				<div className="pointer-events-auto absolute inset-0">
					<KeyList place={{ at: "filling", room: ask?.roomAsked === true }} onClose={() => setHelp(false)} />
				</div>
			) : null}
		</div>,
		document.body,
	);
}

/** The stage put on a slide's first beat in one frame, with nothing dissolving, while nobody watches it. */
function cut(stage: StageHost | null, frame: string): void {
	const now = stage?.session();
	const index = stage?.talk().findIndex((one) => one.frame === frame) ?? -1;
	if (stage === null || now === undefined || index < 0) return;
	if (now.at.slide === index && now.at.beat === 0) return;
	stage.apply(
		{ ...now, revision: now.revision + 1, at: { slide: index, beat: 0 }, keys: false, black: false, frozen: null },
		"own",
		true,
	);
}

/** Where the window's page stands on the screen: the window's place, and below whatever bar the browser draws. */
function viewportOrigin(): { x: number; y: number } {
	if (typeof window === "undefined") return { x: 0, y: 0 };
	return { x: window.screenX, y: window.screenY + Math.max(0, window.outerHeight - window.innerHeight) };
}
