import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LIVE_MIN_CSS_PX, SETTLE_BUDGET_MS } from "../../cover";
import { type Camera, captureOrigin, type ProjectedFrame } from "../api";
import { intersects } from "./camera";
import { CAPTURE_WORKER_TIMEOUT_MS, captureRequestId, type ExportRaster, rasterCaptureSource } from "./capture-broker";
import { arriveMessage, type CaptureSourceReply, captureMessage, freezeMessage } from "./protocol";

/**
 * The engine lifecycle (#8, #13, #40, #54, #112): which frames hold a document,
 * and why. Mounting is caused, never scheduled:
 *
 *   1. you went inside a frame,
 *   2. it is large enough to read and intersects the viewport's ring.
 *
 * The second cause is bounded by viewport area rather than page size.
 *
 * A frame is never mounted for its picture. Every cover is made by the
 * daemon's photo booth, in a browser of its own (#107's one codepath), so a
 * frame with no picture shows its placeholder until the booth's lands, and a
 * frame whose source changed keeps its old picture until then. The canvas
 * only shows them.
 *
 * Selection makes its frames live at every zoom, so moving, resizing and
 * editing work on the visible document. A frame being exported is held
 * separately, behind its still.
 *
 * A picture stands in below the readable threshold. Above it, a nearby frame
 * is live; a held frame remains behind its still.
 *
 * Live HTML frames hold their animations while the camera moves (#171), once
 * nothing has attended them for a long minute (#172), and for as long as the
 * Edit tool is on (#319, #339) — the mount is unchanged in every case, only
 * the frames it is running.
 */

export type FrameState = "picture" | "held" | "live";

const SWEEP_MS = 300;
const EXPORT_MOUNT_TIMEOUT_MS = 20_000;

function isExportMountReady(
	state: FrameState | undefined,
	ready: boolean,
	sourceWindow: WindowProxy | null | undefined,
): boolean {
	return state !== undefined && state !== "picture" && ready && sourceWindow != null;
}

/**
 * How long a whole export capture may take: the shim's serialization, the hops
 * between three realms and the worker's raster budget. It has to outlast
 * the worker's, or this timer retires a capture that was still working.
 */
export const CAPTURE_REPLY_TIMEOUT_MS = CAPTURE_WORKER_TIMEOUT_MS + 3000;
/**
 * How long a promoted frame's cover waits for the document's arrival report
 * before it fades anyway (#177).
 *
 * The report is the shim's own settle, already bounded by SETTLE_BUDGET_MS — a
 * frame that animates forever or never goes quiet reports at that deadline
 * rather than never. This is the outer bound: the two message hops around that
 * settle, a main thread busy enough to overrun its own budget, and every
 * document that will never answer at all — a boot that broke after it
 * reported loaded, a document served before this shim existed. A cover held
 * forever is a frame you can never see, which is worse than the seam this is
 * fixing.
 */
export const ARRIVE_DEADLINE_MS = SETTLE_BUDGET_MS + 600;
/**
 * The measurement hook (#108, #112), and the only temporary code the canvas
 * carries. `globalThis.__spoolBench` is `{ freeze }`: whether live frames ever
 * hold their animations. It is `bench/dither-attribution.ts`'s control arm:
 * the freeze is what that bench measures, and measuring it against a
 * differently-patched project instead of against itself would confound the one
 * difference it exists to price. Read once at module load, because
 * playwright's init script runs before this bundle evaluates and nothing else
 * ever writes it.
 */
const benchHooks = (globalThis as unknown as { __spoolBench?: { freeze?: boolean } }).__spoolBench;
export const FREEZE_ENABLED = benchHooks?.freeze !== false;
/**
 * How long a live frame goes unattended before it holds its animations (#172).
 *
 * A minute is deliberately long. Comparing two frames' motion side by side is a
 * real workflow and the pointer is not on either of them while you do it, so
 * the canvas has to stay alive for the whole of a look, not the whole of a
 * gesture. What this catches is the other thing: a canvas left open in a tab
 * somebody walked away from, where eight animated frames were measured holding
 * 45% of a core and 16% of the GPU process for as long as it stayed open.
 */
export const IDLE_FREEZE_MS = 60_000;

/**
 * How far past the viewport a frame is still admitted, as a fraction of it. The
 * ring is what hides the boot: a
 * frame that only mounts once it is on screen is a frame you watch arrive.
 */
export const LIVE_MARGIN = 0.25;

export interface SweepInput {
	frames: readonly ProjectedFrame[];
	entered: string | null;
	/** Every frame Select currently owns: mounted for the element selection. */
	selectionTargets: ReadonlySet<string>;
	/** A frame being read rather than looked at — an export in flight holds one mounted. */
	held: string | null;
	states: Readonly<Record<string, FrameState>>;
	/** Where the camera rests, read when this sweep runs. */
	camera: Camera | null;
	/** The viewport's CSS size, read when this sweep runs. */
	viewport: { width: number; height: number } | null;
}

/**
 * Whether a readable frame gets a document:
 * drawn big enough to read, and inside the viewport's own ring.
 *
 * Both conditions are load-bearing and neither is sufficient. Size alone would
 * mount a whole zoomed-in page including the part of it a mile off screen; the
 * ring alone would mount fifty frames at overview zoom, which `bench/canvas.ts`
 * prices at the first dropped frame.
 *
 * Size is the frame's larger drawn edge, not its width (#223). Width is what a
 * cover is scaled by, because a still is read across; how much of a frame is
 * on screen is how much of it there is, and a phone is 390 across and 844 down.
 * Keying on width alone left every portrait frame a photograph until 103% zoom,
 * where the same area of landscape frame had been live for a while.
 */
function isFrameLive(
	frame: ProjectedFrame,
	camera: Camera | null,
	viewport: { width: number; height: number } | null,
): boolean {
	if (camera == null || viewport == null) return false;
	if (Math.max(frame.w, frame.h) * camera.k < LIVE_MIN_CSS_PX) return false;
	const w = viewport.width / camera.k;
	const h = viewport.height / camera.k;
	return intersects(frame, {
		x: -camera.x / camera.k - w * LIVE_MARGIN,
		y: -camera.y / camera.k - h * LIVE_MARGIN,
		w: w * (1 + LIVE_MARGIN * 2),
		h: h * (1 + LIVE_MARGIN * 2),
	});
}

/**
 * Whether a frame holds its animations right now (#171, #172, #319). Three
 * causes. Two of them are "nobody is reading this frame": the camera is moving,
 * so nothing out there is being read at all and the frames' own rAF loops are
 * what the gesture competes with for the renderer; or the frame has gone
 * `IDLE_FREEZE_MS` without anything attending it — see `isFrameAttended` for
 * what counts, and note that a camera at rest is not attention, only its motion.
 *
 * The third is the opposite: somebody is reading one frame very closely. While
 * the Edit tool is on (#339), every live frame holds still — the one being
 * edited most of all, because a heading you are about to retype should not be
 * sliding under the caret, and a shader beside it should not be spending the
 * renderer the edit needs. Putting the tool down lets them all go. Layout is
 * untouched either way: the shim gates rAF and pauses declarative animations,
 * so a frame still reflows under the hold. Timers and React state run on,
 * which is the known limit of a hold the frame is never asked about.
 *
 * Two frames never freeze. The one you went inside is the one being used —
 * its own hands are inside it, and a pick elsewhere on the canvas does not
 * reach in. And a frame being copied for an export settles on its own rAF and
 * animations, so a frozen one would be copied held.
 */
export function isFrameFrozen(input: {
	cameraMoving: boolean;
	/** How long since anything last attended this frame. */
	idleMs: number;
	state: FrameState | undefined;
	entered: boolean;
	capturing: boolean;
	/** Whether the Edit tool is on, anywhere on the canvas (#319, #339). */
	editing: boolean;
}): boolean {
	const { cameraMoving, idleMs, state, entered, capturing, editing } = input;
	if (state !== "live" || entered || capturing) return false;
	return editing || cameraMoving || idleMs >= IDLE_FREEZE_MS;
}

/**
 * Whether anything is attending this frame right now (#172) — the idle clock
 * runs from the last moment this was true.
 *
 * Genuine idleness, never viewport position: a frame you are looking at is a
 * frame you are not touching, and freezing what is merely off to one side would
 * kill side-by-side comparison outright. So it takes a pointer, a selection, an
 * entry, or a camera in motion — every one of them something a person did.
 */
export function isFrameAttended(input: {
	cameraMoving: boolean;
	entered: boolean;
	selected: boolean;
	hovered: boolean;
}): boolean {
	const { cameraMoving, entered, selected, hovered } = input;
	return cameraMoving || entered || selected || hovered;
}

export interface SweepResult {
	states: Record<string, FrameState>;
	changed: boolean;
}

export function sweepLifecycle(input: SweepInput): SweepResult {
	const { frames, entered, selectionTargets, held, states, camera, viewport } = input;
	const next: Record<string, FrameState> = {};
	let changed = false;
	for (const frame of frames) {
		const name = frame.name;
		// Select wins over entering: it takes the pointer back to reach an
		// element. A readable HTML frame remains the live thing it is showing.
		const target: FrameState =
			selectionTargets.has(name) || entered === name || isFrameLive(frame, camera, viewport)
				? "live"
				: held === name
					? "held"
					: "picture";
		next[name] = target;
		if (target !== (states[name] ?? "picture")) changed = true;
	}
	return { states: next, changed: changed || Object.keys(states).length !== frames.length };
}

export interface LifecycleDeps {
	framesRef: RefObject<ProjectedFrame[]>;
	entered: string | null;
	selectionTargets: ReadonlySet<string>;
	/**
	 * The whole frame selection keeps its frames awake even while another
	 * tool is up. `selectionTargets` determines which documents are shown.
	 */
	selected: readonly string[];
	/**
	 * The frame under the pointer, which keeps it awake (#172) and nothing else.
	 * Hover is not a mount cause: a frame is already live before you can point at
	 * it, and pointing at a picture has never been worth a document.
	 */
	hovered: string | null;
	/**
	 * Whether the Edit tool is on (#319, #339) — one flag for the whole canvas
	 * rather than a set of frames, because the field is what freezes, not the
	 * frame an element is in.
	 */
	editing: boolean;
	/**
	 * Where the camera rests, read by the sweep.
	 *
	 * A ref rather than a value, and deliberately not urgent: a camera moves every
	 * frame of a gesture, and mounting on each one would mount and discard
	 * documents all the way through a pan. Canvas invokes the sweep after the
	 * camera settles, so what mounts is where it came to rest.
	 */
	cameraRef: RefObject<Camera | null>;
	/** The viewport element, for its CSS size. */
	viewportRef: RefObject<HTMLElement | null>;
}

export function useFrameLifecycle(deps: LifecycleDeps) {
	const { framesRef, entered, selectionTargets, selected, hovered, editing, cameraRef, viewportRef } = deps;

	const [states, setStates] = useState<Record<string, FrameState>>({});
	// when each frame reported loaded, not merely that it did: the export and
	// the cover fade both wait on a document that has really booted
	const [ready, setReady] = useState<ReadonlyMap<string, number>>(new Map<string, number>());
	/**
	 * Frames whose document has finished arriving (#177) — its own settle done,
	 * or ARRIVE_DEADLINE_MS spent waiting to hear so. What the cover of a frame
	 * nobody went inside waits for, because loaded is mid-arrival.
	 */
	const [settled, setSettled] = useState<ReadonlySet<string>>(new Set<string>());

	const statesRef = useRef(states);
	statesRef.current = states;
	const readyRef = useRef(ready);
	readyRef.current = ready;
	const enteredRef = useRef(entered);
	enteredRef.current = entered;
	const selectionTargetsRef = useRef(selectionTargets);
	selectionTargetsRef.current = selectionTargets;
	const selectedRef = useRef(selected);
	selectedRef.current = selected;
	const hoveredRef = useRef(hovered);
	hoveredRef.current = hovered;
	const editingRef = useRef(editing);
	editingRef.current = editing;

	const iframes = useRef(new Map<string, HTMLIFrameElement>());
	const exportFrame = useRef<string | null>(null);
	const exportMountWaiter = useRef<{
		frame: string;
		resolve: (ready: boolean) => void;
		timeout: ReturnType<typeof setTimeout>;
	} | null>(null);
	interface PendingCapture {
		id: string;
		sourceWindow: WindowProxy;
		resolve: (image: ExportRaster | undefined) => void;
		timeout: ReturnType<typeof setTimeout>;
		rasterStarted: boolean;
		abort: AbortController;
	}
	const captureWaiters = useRef(new Map<string, PendingCapture>());
	/** Frames whose arrival report is outstanding, holding their ARRIVE_DEADLINE_MS. */
	const arrivalTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
	/** The frames currently told to hold their animations. */
	const frozen = useRef(new Set<string>());
	const cameraMoving = useRef(false);
	/**
	 * When each live frame was last attended, for the idle freeze (#172). A frame
	 * that is not live keeps no clock: it is either showing a picture or running
	 * behind one for a reason of its own, and coming back to live starts the
	 * minute over — a document that just arrived has never been idle.
	 */
	const attendedAt = useRef(new Map<string, number>());

	/**
	 * Freeze is a message to one document, never a render: the shells are memo'd
	 * hard against exactly this (frame-shell.tsx), and a gesture that re-rendered
	 * them would reload every iframe it touched.
	 */
	const postFreeze = useCallback((frame: string, on: boolean) => {
		const sourceWindow = iframes.current.get(frame)?.contentWindow;
		// a document that left took its freeze with it
		if (sourceWindow == null) {
			frozen.current.delete(frame);
			return;
		}
		if (frozen.current.has(frame) === on) return;
		sourceWindow.postMessage(freezeMessage(on), "*");
		if (on) frozen.current.add(frame);
		else frozen.current.delete(frame);
	}, []);

	/**
	 * Roll the idle clocks forward and tell each frame where that leaves it. Runs
	 * on every sweep, because idleness is the one cause that arrives by itself:
	 * the camera stopping and the pointer leaving are both events, but the minute
	 * after them passes without anybody sending anything.
	 */
	const applyFreeze = useCallback(
		(states: Readonly<Record<string, FrameState>> = statesRef.current, now = performance.now()) => {
			const entered = enteredRef.current;
			const alive = new Set<string>();
			for (const frame of framesRef.current) {
				const name = frame.name;
				alive.add(name);
				const state = states[name];
				if (state !== "live") attendedAt.current.delete(name);
				else if (
					!attendedAt.current.has(name) ||
					isFrameAttended({
						cameraMoving: cameraMoving.current,
						entered: entered === name,
						// picked-in or picked-through: the frames you chose, and the one
						// Select is holding open for an element inside it
						selected: selectedRef.current.includes(name) || selectionTargetsRef.current.has(name),
						hovered: hoveredRef.current === name,
					})
				) {
					attendedAt.current.set(name, now);
				}
				postFreeze(
					name,
					FREEZE_ENABLED &&
						isFrameFrozen({
							cameraMoving: cameraMoving.current,
							idleMs: now - (attendedAt.current.get(name) ?? now),
							state,
							entered: entered === name,
							capturing: captureWaiters.current.has(name),
							editing: editingRef.current,
						}),
				);
			}
			// frames that left the projection take their clock with them
			for (const name of [...attendedAt.current.keys()]) if (!alive.has(name)) attendedAt.current.delete(name);
		},
		[framesRef, postFreeze],
	);

	/** The camera started or stopped moving — the canvas already detects both. */
	const noteCameraMoving = useCallback(
		(moving: boolean) => {
			if (cameraMoving.current === moving) return;
			cameraMoving.current = moving;
			// Coming to rest is the last thing anybody did, so every frame's minute
			// runs from the settle. The motion itself is attention too, but only
			// this says so at the instant it ends: the sweep that would otherwise
			// notice is up to 300ms late, and it is the settle a person is timed
			// from, not the last tick of the gesture before it.
			if (!moving) attendedAt.current.clear();
			applyFreeze();
		},
		[applyFreeze],
	);

	const finishExportMount = useCallback((frame: string, ready: boolean) => {
		const waiter = exportMountWaiter.current;
		if (waiter?.frame !== frame) return;
		clearTimeout(waiter.timeout);
		exportMountWaiter.current = null;
		waiter.resolve(ready);
	}, []);

	/**
	 * Resolve exactly the request that produced this export; stale work cannot
	 * satisfy its successor. A retirement (a document swap, an unmount) hands the
	 * same `undefined` image back as a failure does.
	 */
	const noteShot = useCallback((frame: string, id: string, image: ExportRaster | undefined) => {
		const pending = captureWaiters.current.get(frame);
		if (pending?.id !== id) return;
		clearTimeout(pending.timeout);
		captureWaiters.current.delete(frame);
		pending.abort.abort();
		pending.resolve(image);
	}, []);

	/** The frame's arrival is over: it said so, or its deadline said so for it. */
	const endArrival = useCallback((frame: string) => {
		const timer = arrivalTimers.current.get(frame);
		if (timer !== undefined) {
			clearTimeout(timer);
			arrivalTimers.current.delete(frame);
		}
		setSettled((current) => (current.has(frame) ? current : new Set(current).add(frame)));
	}, []);

	/** The document said it has arrived — routed in by the canvas's message listener. */
	const noteArrived = useCallback((frame: string) => endArrival(frame), [endArrival]);

	/** The document that was arriving left. Its successor arrives on its own. */
	const forgetArrival = useCallback((frame: string) => {
		const timer = arrivalTimers.current.get(frame);
		if (timer !== undefined) {
			clearTimeout(timer);
			arrivalTimers.current.delete(frame);
		}
		setSettled((current) => {
			if (!current.has(frame)) return current;
			const next = new Set(current);
			next.delete(frame);
			return next;
		});
	}, []);

	/**
	 * The boot reported loaded, which is where arrival starts rather than ends
	 * (#177): ask the document to say when it has settled, and keep a deadline
	 * against the answer never coming.
	 */
	const askArrival = useCallback(
		(frame: string) => {
			const sourceWindow = iframes.current.get(frame)?.contentWindow;
			if (sourceWindow == null) {
				endArrival(frame);
				return;
			}
			sourceWindow.postMessage(arriveMessage(SETTLE_BUDGET_MS), "*");
			arrivalTimers.current.set(
				frame,
				setTimeout(() => endArrival(frame), ARRIVE_DEADLINE_MS),
			);
		},
		[endArrival],
	);

	useEffect(
		() => () => {
			for (const timer of arrivalTimers.current.values()) clearTimeout(timer);
			arrivalTimers.current.clear();
		},
		[],
	);

	const onIframe = useCallback(
		(frame: string, el: HTMLIFrameElement | null) => {
			const current = iframes.current.get(frame);
			// A fresh document is never frozen — the message went to the old one —
			// and its minute starts here. A source edit lands as a fresh document,
			// and a frame that boots straight into a freeze is one that shows you
			// half of its own arrival for as long as you leave it (#172).
			if (current !== el) {
				frozen.current.delete(frame);
				attendedAt.current.delete(frame);
			}
			if (current !== undefined && current !== el) {
				const pending = captureWaiters.current.get(frame);
				if (pending !== undefined) noteShot(frame, pending.id, undefined);
			}
			if (el !== null) {
				iframes.current.set(frame, el);
				return;
			}
			iframes.current.delete(frame);
			// unmount (or reload) drops the boot: the cover returns until the next loaded report
			setReady((current) => {
				if (!current.has(frame)) return current;
				const next = new Map(current);
				next.delete(frame);
				return next;
			});
			forgetArrival(frame);
		},
		[forgetArrival, noteShot],
	);

	/** The frame's loaded report (commit-time effect, #17) — routed in by the canvas's message listener. */
	const noteLoaded = useCallback(
		(frame: string) => {
			if (readyRef.current.has(frame)) return;
			const next = new Map(readyRef.current).set(frame, performance.now());
			readyRef.current = next;
			setReady(next);
			askArrival(frame);
		},
		[askArrival],
	);

	/**
	 * Accept a source only from the current window that received this exact
	 * request, then launch one raster. Canvas performs the same WindowProxy
	 * ownership check before routing here; retaining it here binds completion
	 * to the document that was current when capture began.
	 */
	const noteCaptureSource = useCallback(
		(message: CaptureSourceReply, source: MessageEventSource | null) => {
			const pending = captureWaiters.current.get(message.frame);
			if (
				pending === undefined ||
				pending.id !== message.id ||
				pending.sourceWindow !== source ||
				iframes.current.get(message.frame)?.contentWindow !== source
			) {
				return;
			}
			if ("error" in message) {
				noteShot(message.frame, message.id, undefined);
				return;
			}
			if (pending.rasterStarted) return;
			pending.rasterStarted = true;
			void rasterCaptureSource(message, captureOrigin, pending.abort.signal).then(
				(image) => noteShot(message.frame, message.id, image),
				() => noteShot(message.frame, message.id, undefined),
			);
		},
		[noteShot],
	);

	/** Ask the frame's shim for one lossless, full-resolution export of itself. */
	const requestCapture = useCallback(
		(frame: string): Promise<ExportRaster | undefined> => {
			const el = iframes.current.get(frame);
			const sourceWindow = el?.contentWindow;
			if (sourceWindow == null || !readyRef.current.has(frame)) return Promise.resolve(undefined);
			if (captureWaiters.current.has(frame)) return Promise.resolve(undefined);
			return new Promise((resolve) => {
				const id = captureRequestId();
				const timeout = setTimeout(
					() => noteShot(frame, id, undefined),
					CAPTURE_REPLY_TIMEOUT_MS + SETTLE_BUDGET_MS,
				);
				captureWaiters.current.set(frame, {
					id,
					sourceWindow,
					resolve,
					timeout,
					rasterStarted: false,
					abort: new AbortController(),
				});
				// The capture settles on this frame's own rAF and animations, so a
				// frozen one would be copied held. Both messages ride the same channel
				// to the same document, so the thaw cannot arrive second.
				postFreeze(frame, false);
				sourceWindow.postMessage(captureMessage(id, SETTLE_BUDGET_MS), "*");
			});
		},
		[noteShot, postFreeze],
	);

	useEffect(
		() => () => {
			for (const [frame, pending] of [...captureWaiters.current]) noteShot(frame, pending.id, undefined);
		},
		[noteShot],
	);

	// The decision function: runs on a sweep interval and on urgent intent changes.
	const compute = useCallback(() => {
		const now = performance.now();
		const result = sweepLifecycle({
			frames: framesRef.current,
			entered: enteredRef.current,
			selectionTargets: selectionTargetsRef.current,
			held: exportFrame.current,
			states: statesRef.current,
			camera: cameraRef.current,
			viewport:
				viewportRef.current === null
					? null
					: { width: viewportRef.current.clientWidth, height: viewportRef.current.clientHeight },
		});
		if (result.changed) setStates(result.states);
		// against the states this sweep just decided, not last render's: a frame
		// handed back from an export becomes freezable as soon as it is live again
		applyFreeze(result.states, now);
	}, [framesRef, cameraRef, viewportRef, applyFreeze]);

	/**
	 * Hold one HTML frame through the export intent, wait for its document,
	 * capture a full-resolution PNG, then hand the document back.
	 */
	const captureExport = useCallback(
		async (frame: string): Promise<ExportRaster | undefined> => {
			if (exportFrame.current !== null || !framesRef.current.some((candidate) => candidate.name === frame)) {
				return undefined;
			}

			exportFrame.current = frame;
			let mountPromise: Promise<boolean> | undefined;
			if (
				!isExportMountReady(
					statesRef.current[frame],
					readyRef.current.has(frame),
					iframes.current.get(frame)?.contentWindow,
				)
			) {
				mountPromise = new Promise((resolve) => {
					const timeout = setTimeout(() => finishExportMount(frame, false), EXPORT_MOUNT_TIMEOUT_MS);
					exportMountWaiter.current = { frame, resolve, timeout };
				});
			}
			compute();

			try {
				if (mountPromise !== undefined && !(await mountPromise)) return undefined;
				return await requestCapture(frame);
			} finally {
				finishExportMount(frame, false);
				if (exportFrame.current === frame) exportFrame.current = null;
				compute();
			}
		},
		[compute, finishExportMount, framesRef, requestCapture],
	);

	useEffect(() => {
		const waiter = exportMountWaiter.current;
		if (
			waiter !== null &&
			isExportMountReady(
				states[waiter.frame],
				ready.has(waiter.frame),
				iframes.current.get(waiter.frame)?.contentWindow,
			)
		) {
			finishExportMount(waiter.frame, true);
		}
	}, [finishExportMount, ready, states]);

	useEffect(
		() => () => {
			const waiter = exportMountWaiter.current;
			if (waiter !== null) finishExportMount(waiter.frame, false);
		},
		[finishExportMount],
	);

	// Selection and entering must feel instant, not one sweep late.
	useEffect(() => {
		enteredRef.current = entered;
		selectionTargetsRef.current = selectionTargets;
		compute();
	}, [entered, selectionTargets, compute]);

	// So must the wake, and so must the hold: a frozen frame you point at
	// animates now and a live one holds the instant the Edit tool comes up
	// (#319, #339), and lets go the instant it goes down, not up to a sweep later. This is the freeze alone, never a sweep — neither
	// the pointer nor a selection the current tool ignores mounts anything.
	useEffect(() => {
		hoveredRef.current = hovered;
		selectedRef.current = selected;
		editingRef.current = editing;
		applyFreeze();
	}, [hovered, selected, editing, applyFreeze]);

	useEffect(() => {
		const sweep = setInterval(compute, SWEEP_MS);
		return () => clearInterval(sweep);
	}, [compute]);

	/**
	 * The tab is being looked at again. Nothing had attended anything for however
	 * long the tab was away, so every live frame is frozen — coming back is itself
	 * the attention, the way settling a camera is, so the minute starts here
	 * rather than on the first thing you touch.
	 */
	const wake = useCallback(() => {
		attendedAt.current.clear();
		compute();
	}, [compute]);

	return {
		states,
		ready,
		settled,
		onIframe,
		noteLoaded,
		noteArrived,
		noteCaptureSource,
		noteCameraMoving,
		wake,
		captureExport,
		sweep: compute,
	};
}
