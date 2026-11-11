import { useCallback, useEffect, useRef, useState } from "react";
import type { Size } from "../../deck/deck-file";
import { slotBox } from "../../deck/layout";
import { openSession, type StageSession, type TalkSlide } from "../../deck/stage-session";
import type { StageShown } from "../../deck/stage-wire";
import type { DeckRead } from "../../deck/wire";
import { mountStage, type StageHost } from "../../runtime/deck/stage-host";
import { accelPressed } from "../../runtime/platform-keys";
import type { Camera } from "../api";
import { type Box, shellRadiusOnScreen, toScreen } from "../canvas/camera";
import { type CameraStore, useCameraFollow, type ViewChanges } from "../canvas/camera-store";
import { type CanvasStore, useCanvasState } from "../canvas/canvas-store";
import { attachHotkeyLayer } from "../hotkey-dispatch";
import { SNAP } from "./deck-motion";
import { FLY_MS, insideBox, insideCamera, outCamera } from "./inside-camera";
import { usePresentAsk } from "./present";
import { talkSource } from "./talk-source";

/**
 * Going into a slide (spool#265, the team canvas's `app/spool-deck`): on a deck page a double-click or ↵ on a slide
 * flies the camera in until the slide fills the canvas, and the talk plays there in place, on the same stage the room
 * sees, with the same keys. Under the stage the camera keeps to the slide showing, so the selection, the Pages rail
 * and Properties follow the talk. Esc, or a press anywhere else on the canvas, flies back out: to the camera it came
 * from while the talk is still on the slide gone into, else at that zoom and height across the slide it ended on,
 * which is left selected.
 *
 * The talk's stage is built in the background as the deck page opens, unseen over the canvas, and rests on the slide
 * selected, so going in is instant. Going in never blinks: the canvas's own picture of the slide (its last beat)
 * stays until the camera has landed and the stage has drawn the same beat over it.
 *
 * `useDeckInside` is the whole of it for the canvas, `DeckStage` the stage it draws over the slide.
 */

export interface DeckInside {
	/** The slide the talk is on while a slide is gone into, by its path; null otherwise. */
	readonly slide: string | null;
	/** What that slide's label says, the design's cue: live, or that the slide holds the keyboard. */
	readonly chip: string | null;
	/** Go into `name` when it is a slide of the deck page in front. False when it is not the deck's: the canvas enters it. */
	enter(name: string): boolean;
	/** Come out by Esc's rules. False when no slide is gone into. */
	leave(): boolean;
	/** A slide is gone into, read when called: the talk has the keys, and a press on the canvas comes out. */
	on(): boolean;
	/** What `DeckStage` draws. */
	readonly view: InsideView;
}

interface InsideView {
	/** where the stage stands on the page: the slide's place while one is gone into, null while it waits unseen */
	readonly slot: Box | null;
	readonly shown: boolean;
	readonly talk: Size;
	/** the element the stage's documents are hosted in */
	hold(element: HTMLDivElement | null): void;
}

interface Inside {
	/** the slide gone into */
	readonly from: string;
	/** the slide the talk is on */
	readonly slide: string;
	/** flying in, unseen, the canvas's picture still showing; playing; or flying out, the stage still over the slide */
	readonly phase: "in" | "on" | "out";
	/** the live slide holds the keyboard */
	readonly keys: boolean;
}

const stillness = () =>
	typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A frame's own name, the last part of its path. */
const leafOf = (name: string) => name.slice(name.lastIndexOf("/") + 1);

/** The talk as the deck read says it, for a stage that has not said it yet. */
const talkOf = (read: DeckRead): TalkSlide[] =>
	read.slides.map((slide) => ({ frame: slide.name, beats: Math.max(1, slide.beats.length), live: slide.live }));

export function useDeckInside({
	project,
	page,
	read,
	store,
	camera,
	viewport,
	select,
	present,
}: {
	project: string;
	/** the page in front */
	page: string;
	/** its deck, while it is one */
	read: DeckRead | undefined;
	store: CanvasStore;
	camera: CameraStore;
	/** the canvas's view: what the camera looks through, and where the keys come back to */
	viewport: () => HTMLElement | null;
	/** hold `name` alone as the selection */
	select: (name: string) => void;
	/** present the talk, from the slide held or the first, as ⌘↵ and ⇧⌘↵ do on the page; false when it did not */
	present: (first: boolean) => boolean;
}): DeckInside {
	const [inside, setInside] = useState<Inside | null>(null);
	const [element, hold] = useState<HTMLDivElement | null>(null);
	/** how many times the stage has said its talk: a slide held before it had can be rested on once it has */
	const [said, setSaid] = useState(0);
	const host = useRef<StageHost | null>(null);
	/** the picture the stage last put on its screen */
	const shown = useRef<StageShown | null>(null);
	/** the camera before going in, and the slide gone into */
	const before = useRef<{ camera: Camera; from: string } | null>(null);
	/** the camera has landed on the slide gone into */
	const flown = useRef(false);
	const trip = useRef(0);
	const now = useRef(inside);
	now.current = inside;
	const hands = useRef({ read, select, viewport, present });
	hands.current = { read, select, viewport, present };
	const talk = read?.size ?? { w: 1280, h: 720 };
	const playable = read !== undefined && read.slides.length > 0;

	/** where a slide of the talk stands on the page */
	const slotOf = useCallback((name: string): Box | null => {
		const deck = hands.current.read;
		const index = deck?.slides.findIndex((slide) => slide.name === name) ?? -1;
		return deck === undefined || index < 0 ? null : slotBox(deck.size, index);
	}, []);
	const viewSize = useCallback(() => {
		const el = hands.current.viewport();
		return el === null ? null : { w: el.clientWidth, h: el.clientHeight };
	}, []);
	/** the keyboard back to the canvas, out of the stage's document if it was there */
	const giveBackKeys = useCallback(() => {
		const el = hands.current.viewport();
		if (el !== null && (document.activeElement === null || document.activeElement.tagName === "IFRAME")) {
			el.focus({ preventScroll: true });
		}
	}, []);

	/** shown once flown in and the stage has drawn the slide and beat the talk is on */
	const reveal = useCallback(() => {
		const going = now.current;
		const at = host.current?.session()?.at;
		const drew = shown.current;
		if (going?.phase !== "in" || !flown.current || at === undefined || drew === null) return;
		if (drew.held || drew.at.slide !== at.slide || drew.at.beat !== at.beat) return;
		setInside({ ...going, phase: "on" });
	}, []);

	const leave = useCallback(() => {
		const going = now.current;
		const was = before.current;
		if (going === null || going.phase === "out" || was === null) return false;
		const n = ++trip.current;
		const view = viewSize();
		const slot = slotOf(going.slide);
		const to = view === null || slot === null ? was.camera : outCamera(was, { slide: going.slide, slot }, view.w);
		before.current = null;
		hands.current.select(going.slide);
		giveBackKeys();
		if (stillness()) camera.set(to);
		else camera.fly(to, FLY_MS, SNAP);
		// the slide keeps the beat it was left on until the camera is out; unseen, there is nothing to keep
		if (going.phase === "in" || stillness()) {
			setInside(null);
			return true;
		}
		setInside({ ...going, phase: "out", keys: false });
		setTimeout(() => {
			if (trip.current === n) setInside(null);
		}, FLY_MS);
		return true;
	}, [camera, giveBackKeys, slotOf, viewSize]);

	/** the talk moved: under the stage the camera keeps to the slide now showing, and the selection with it */
	const heard = useCallback(
		(session: StageSession) => {
			const going = now.current;
			if (going === null || going.phase === "out") return;
			const frame = host.current?.talk()[session.at.slide]?.frame ?? going.slide;
			if (session.keys !== going.keys) {
				if (session.keys) host.current?.focus();
				else giveBackKeys();
			}
			if (frame !== going.slide) {
				const slot = slotOf(frame);
				const view = viewSize();
				if (slot !== null && view !== null) camera.set(insideCamera(slot, view.w, view.h));
				hands.current.select(frame);
			}
			if (frame !== going.slide || session.keys !== going.keys) {
				setInside({ ...going, slide: frame, keys: session.keys });
			}
			reveal();
		},
		[camera, giveBackKeys, reveal, slotOf, viewSize],
	);
	const ears = useRef({ heard, leave, reveal });
	ears.current = { heard, leave, reveal };

	// the talk's stage, built as the deck page opens and kept while it is in front
	useEffect(() => {
		if (element === null || !playable) return;
		const source = talkSource(project, page);
		const stage = mountStage(element, {
			address: source.address,
			mode: "own",
			room: false,
			on: {
				session: (session) => ears.current.heard(session),
				shown: (picture) => {
					shown.current = picture;
					ears.current.reveal();
				},
				talk: () => setSaid((count) => count + 1),
				command: (command) => {
					if (command.kind === "escape") ears.current.leave();
				},
			},
		});
		host.current = stage;
		const stopHearing = source.follow(() => [stage]);
		return () => {
			stopHearing();
			stage.destroy();
			host.current = null;
			shown.current = null;
			trip.current++;
			setInside(null);
		};
	}, [element, playable, project, page]);

	const enter = useCallback(
		(name: string) => {
			const deck = hands.current.read;
			const stage = host.current;
			const index = deck?.slides.findIndex((slide) => slide.name === name) ?? -1;
			const view = viewSize();
			const cam = camera.aim();
			if (deck === undefined || index < 0 || stage === null || view === null || cam === null) return false;
			const going = now.current;
			if (going !== null && going.phase !== "out") return true;
			const said = stage.talk();
			const talk = said.length > 0 ? said : talkOf(deck);
			const at = talk.findIndex((slide) => slide.frame === name);
			if (at < 0) return false;
			// coming back in on the way out: where it was flying back to is where it came from
			before.current = { camera: cam, from: name };
			const beats = talk[at]?.beats ?? 1;
			stage.apply(openSession(talk, { slide: at, beat: beats - 1 }, stage.session()?.state ?? {}), "own", true);
			hands.current.select(name);
			const n = ++trip.current;
			flown.current = false;
			setInside({ from: name, slide: name, phase: "in", keys: false });
			const slot = slotBox(deck.size, index);
			const to = insideCamera(slot, view.w, view.h);
			const landed = () => {
				if (trip.current !== n) return;
				flown.current = true;
				ears.current.reveal();
			};
			if (stillness()) {
				camera.set(to);
				queueMicrotask(landed);
			} else {
				camera.fly(to, FLY_MS, SNAP);
				setTimeout(landed, FLY_MS);
			}
			return true;
		},
		[camera, viewSize],
	);

	// resting on the slide held, so going into it is instant: its last beat drawn, unseen
	const held = useCanvasState(store, (state) => (state.selected.length === 1 ? (state.selected[0] ?? null) : null));
	useEffect(() => {
		const stage = host.current;
		if (said === 0 || inside !== null || held === null || stage === null || read === undefined) return;
		const talk = stage.talk();
		const at = talk.findIndex((slide) => slide.frame === held);
		const resting = stage.session()?.at;
		const beat = (talk[at]?.beats ?? 1) - 1;
		if (at < 0 || (resting?.slide === at && resting.beat === beat)) return;
		stage.apply(openSession(talk, { slide: at, beat }, stage.session()?.state ?? {}), "own", true);
	}, [held, inside, read, said]);

	// presenting takes the talk to the presenter view: the canvas lets go of it where it stands
	const presenting = usePresentAsk() !== null;
	useEffect(() => {
		if (!presenting || now.current === null) return;
		trip.current++;
		before.current = null;
		setInside(null);
	}, [presenting]);

	// the talk's keys, ahead of the canvas's: Space is the next beat here, never the Hand
	useEffect(
		() =>
			attachHotkeyLayer({
				scope: "stage",
				active: () => now.current !== null && now.current.phase !== "out",
				handlers: {},
				read: (event) => {
					// ⌘↵ presents from the slide the talk is on, as the label offers, and ⇧⌘↵ from the first
					const taken =
						host.current?.key(event) === true ||
						(event.key === "Enter" && accelPressed(event) && hands.current.present(event.shiftKey));
					if (taken) event.preventDefault();
					return taken;
				},
			}),
		[],
	);

	const on = useCallback(() => now.current !== null && now.current.phase !== "out", []);
	const slide = inside === null || inside.phase === "out" ? null : inside.slide;
	const chip =
		slide === null ? null : inside?.keys === true ? `${leafOf(slide)} has the keys · esc` : "live · esc exits";
	const view = {
		slot: inside === null ? null : slotOf(inside.slide),
		shown: inside !== null && inside.phase !== "in",
		talk,
		hold,
	};
	return { slide, chip, enter, leave, on, view };
}

/**
 * The talk's stage on the canvas: over the slide gone into, following the camera, its corners the frame's; unseen and
 * out of the way otherwise, laid out where a slide gone into would stand, where a browser still draws it.
 */
export function DeckStage({
	inside,
	camera,
	view: changes,
}: {
	inside: DeckInside;
	camera: CameraStore;
	view?: ViewChanges | undefined;
}) {
	const el = useRef<HTMLDivElement | null>(null);
	const { slot, shown, talk, hold } = inside.view;
	const ref = useCallback(
		(node: HTMLDivElement | null) => {
			el.current = node;
			hold(node);
		},
		[hold],
	);
	useCameraFollow(
		camera,
		(at) => {
			const div = el.current;
			const field = div?.parentElement;
			if (div === null || field === null || field === undefined) return;
			const box = slot === null ? insideBox(talk, field.clientWidth, field.clientHeight) : toScreen(slot, at);
			div.style.transform = `translate(${box.x}px, ${box.y}px)`;
			div.style.width = `${box.w}px`;
			div.style.height = `${box.h}px`;
			div.style.borderRadius = slot === null ? "" : `${shellRadiusOnScreen(at.k)}px`;
		},
		[slot?.x, slot?.y, slot?.w, slot?.h, talk.w, talk.h],
		changes,
	);
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: it only keeps the canvas from hearing presses on the stage
		<div
			ref={ref}
			data-deck-stage={inside.slide ?? ""}
			data-deck-stage-shown={shown ? "" : undefined}
			// unseen, nothing in it takes the pointer or the focus, its documents' own say included
			inert={!shown}
			className="absolute top-0 left-0 overflow-hidden"
			style={{ opacity: shown ? 1 : 0 }}
			onPointerDown={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
			onContextMenu={(event) => event.stopPropagation()}
		/>
	);
}
