import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Camera, CanvasMode, Geometry, ProjectedFrame } from "../api";
import {
	beaconTrash,
	fetchCanvasState,
	fetchProjection,
	openInEditor,
	postTrash,
	putCanvasState,
	putGeometry,
	putSelection,
	putThumb,
	subscribeSse,
} from "../api";
import { RibbonMark } from "../icons";
import { type Box, boundsOf, centerOn, clamp, fitCamera, intersects, toWorld, zoomAt } from "./camera";
import { ContextMenu, MENU_SIZE } from "./context-menu";
import { FrameShell } from "./frame-shell";
import { useFrameLifecycle } from "./lifecycle";
import {
	type Corner,
	editorTarget,
	type Guides,
	isCorner,
	NO_GUIDES,
	type PickedSelection,
	SelectionOverlay,
} from "./overlays";
import { type PickedHit, parseFrameMessage, pickMessage, type SessionRecord, sessionReply } from "./protocol";
import { snapMovedBox } from "./snap";
import { TrashToast } from "./trash-toast";

/**
 * The infinite canvas (#22) and its hands (#23): design/ projected as
 * sandboxed frames with Figma-feel pan/zoom — Space or middle-drag pans, the
 * pointer always selects, no tool switcher. Single click selects (frame in
 * live, element in design via compile-time stamps), double click enters where
 * time runs, the entered state follows data-go walks (#5), Esc exits. Hands
 * obey the one law: move, resize and nudge write geometry sidecars only;
 * delete rides the OS Trash behind a toast-undo; the canvas never writes
 * frame source.
 */

export interface CanvasChrome {
	mode: CanvasMode;
	zoomPct: number;
	setMode: (mode: CanvasMode) => void;
}

interface Point {
	x: number;
	y: number;
}

type Gesture =
	| { kind: "idle" }
	| { kind: "pan"; lastX: number; lastY: number }
	// pointer down on a frame, before the drag threshold: a clean release is a
	// click (design defers its select for the element pick), movement promotes
	| { kind: "pending"; frame: string; names: string[]; origins: Map<string, Point>; start: Point; defer: boolean }
	| { kind: "move"; names: string[]; origins: Map<string, Point>; start: Point }
	| { kind: "marquee"; start: Point; base: readonly string[] }
	| { kind: "resize"; frame: string; corner: Corner; anchor: Point; origin: Box };

const SETTLE_PERSIST_MS = 600;
const DRAG_THRESHOLD_PX = 3;
const SNAP_THRESHOLD_PX = 8;
const MIN_FRAME_SIZE = 40;
const NUDGE_FLUSH_MS = 400;
const SELECTION_PUT_MS = 150;
const PICK_REPLY_MS = 400;
const TRASH_UNDO_MS = 5000;

export function ProjectCanvas({
	project,
	onChrome,
}: {
	project: string;
	onChrome: (chrome: CanvasChrome | null) => void;
}) {
	const viewportRef = useRef<HTMLDivElement | null>(null);
	const [frames, setFrames] = useState<ProjectedFrame[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [camera, setCamera] = useState<Camera | null>(null);
	const [mode, setMode] = useState<CanvasMode>("live");
	const [selected, setSelected] = useState<string[]>([]);
	const [picked, setPicked] = useState<PickedSelection | null>(null);
	const [entered, setEntered] = useState<string | null>(null);
	const [spaceDown, setSpaceDown] = useState(false);
	const [panning, setPanning] = useState(false);
	const [resizeCursor, setResizeCursor] = useState<string | null>(null);
	const [guides, setGuides] = useState<Guides>(NO_GUIDES);
	const [marquee, setMarquee] = useState<Box | null>(null);
	const [menu, setMenu] = useState<{ x: number; y: number; frame: string } | null>(null);
	const [pendingTrash, setPendingTrash] = useState<string[] | null>(null);
	const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set<string>());
	const [docNonces, setDocNonces] = useState<Record<string, number>>({});
	const [thumbNonces, setThumbNonces] = useState<Record<string, number>>({});
	const [freshThumbs, setFreshThumbs] = useState<ReadonlySet<string>>(new Set<string>());

	// frames staged for the Trash vanish instantly; the disk move waits on the toast
	const visibleFrames = useMemo(() => frames.filter((f) => !hidden.has(f.name)), [frames, hidden]);

	const gesture = useRef<Gesture>({ kind: "idle" });
	const animation = useRef(0);
	const cameraRef = useRef<Camera | null>(null);
	cameraRef.current = camera;
	const framesRef = useRef(visibleFrames);
	framesRef.current = visibleFrames;
	const enteredRef = useRef(entered);
	enteredRef.current = entered;
	const modeRef = useRef(mode);
	modeRef.current = mode;
	const spaceRef = useRef(spaceDown);
	spaceRef.current = spaceDown;
	const selectedRef = useRef(selected);
	selectedRef.current = selected;
	const pickedRef = useRef(picked);
	pickedRef.current = picked;
	// the walk session mirror: what the last go/back carried, owed to the next boot
	const walkSession = useRef<SessionRecord | null>(null);
	const walkTarget = useRef<string | null>(null);
	const iframes = useRef(new Map<string, HTMLIFrameElement>());
	const pickWaiters = useRef(new Map<string, (hit: PickedHit | null) => void>());
	const nudgeDirty = useRef(new Set<string>());
	const nudgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const trashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const pendingTrashRef = useRef<string[] | null>(null);

	const hasThumb = useCallback(
		(name: string) => freshThumbs.has(name) || (framesRef.current.find((f) => f.name === name)?.hasThumb ?? false),
		[freshThumbs],
	);
	const hasThumbRef = useRef(hasThumb);
	hasThumbRef.current = hasThumb;

	const noteThumb = useCallback((frame: string) => {
		setFreshThumbs((current) => (current.has(frame) ? current : new Set(current).add(frame)));
		setThumbNonces((current) => ({ ...current, [frame]: (current[frame] ?? 0) + 1 }));
	}, []);

	// a settled self-capture persists into design/.spool and refreshes covers
	const onShot = useCallback(
		(frame: string, dataUrl: string) => {
			void (async () => {
				try {
					const png = await (await fetch(dataUrl)).blob();
					if (await putThumb(project, frame, png)) noteThumb(frame);
				} catch {
					// a lost capture is re-taken on the next settle
				}
			})();
		},
		[project, noteThumb],
	);

	const lifecycle = useFrameLifecycle({
		framesRef,
		cameraRef,
		viewportRef,
		mode,
		entered,
		// first click pre-boots (#8) — a hint that only means one thing at a time
		selected: selected.length === 1 ? (selected[0] ?? null) : null,
		hasThumb: (name) => hasThumbRef.current(name),
		onShot,
	});
	const lifecycleRef = useRef(lifecycle);
	lifecycleRef.current = lifecycle;

	const onIframe = useCallback((name: string, el: HTMLIFrameElement | null) => {
		if (el === null) iframes.current.delete(name);
		else iframes.current.set(name, el);
		lifecycleRef.current.onIframe(name, el);
	}, []);

	const refetchFrames = useCallback(async () => {
		const projection = await fetchProjection(project);
		if (projection === undefined) return;
		setFrames(projection.frames);
		setLoaded(true);
	}, [project]);

	// boot: stored state (mode + camera) and the projection
	useEffect(() => {
		let alive = true;
		void (async () => {
			const state = await fetchCanvasState(project);
			if (alive && state !== undefined) {
				setMode(state.mode);
				if (state.camera !== undefined) setCamera(state.camera);
			}
			if (alive) await refetchFrames();
		})();
		return () => {
			alive = false;
		};
	}, [project, refetchFrames]);

	// a staged Trash resolves when the projection stops listing the folder
	useEffect(() => {
		setHidden((current) => {
			const alive = [...current].filter((name) => frames.some((f) => f.name === name));
			return alive.length === current.size ? current : new Set(alive);
		});
	}, [frames]);

	// no stored camera: fit the field once both viewport and frames exist
	useLayoutEffect(() => {
		if (camera !== null || !loaded) return;
		const viewport = viewportRef.current;
		if (viewport === null) return;
		setCamera(
			framesRef.current.length === 0
				? { x: 0, y: 0, k: 1 }
				: fitCamera(boundsOf(framesRef.current), viewport.clientWidth, viewport.clientHeight),
		);
	}, [camera, loaded]);

	// --- camera ---------------------------------------------------------------

	const stopAnimation = useCallback(() => cancelAnimationFrame(animation.current), []);

	const animateCamera = useCallback(
		(to: Camera, ms = 220) => {
			const from = cameraRef.current;
			if (from === null) return;
			stopAnimation();
			const t0 = performance.now();
			const step = (t: number) => {
				const p = clamp((t - t0) / ms, 0, 1);
				const e = 1 - (1 - p) ** 3;
				setCamera({
					x: from.x + (to.x - from.x) * e,
					y: from.y + (to.y - from.y) * e,
					k: from.k + (to.k - from.k) * e,
				});
				if (p < 1) animation.current = requestAnimationFrame(step);
			};
			animation.current = requestAnimationFrame(step);
		},
		[stopAnimation],
	);

	const viewportCenter = useCallback((): Point => {
		const el = viewportRef.current;
		return el === null ? { x: 0, y: 0 } : { x: el.clientWidth / 2, y: el.clientHeight / 2 };
	}, []);

	const zoomAtPoint = useCallback(
		(cx: number, cy: number, factor: number, animate = false) => {
			const cam = cameraRef.current;
			if (cam === null) return;
			const next = zoomAt(cam, cx, cy, factor);
			if (animate) animateCamera(next, 140);
			else setCamera(next);
		},
		[animateCamera],
	);

	const zoomFit = useCallback(() => {
		const viewport = viewportRef.current;
		if (viewport === null || framesRef.current.length === 0) return;
		animateCamera(fitCamera(boundsOf(framesRef.current), viewport.clientWidth, viewport.clientHeight));
	}, [animateCamera]);

	/** An entered walk: fresh boot for the target (#5), session carried, camera pans. */
	const walkTo = useCallback(
		(target: string, session: SessionRecord | null) => {
			walkSession.current = session;
			walkTarget.current = target;
			// screen scripts run fresh on every arrival — reboot even a warm target
			setDocNonces((current) => ({ ...current, [target]: (current[target] ?? 0) + 1 }));
			setEntered(target);
			setSelected([]);
			setPicked(null);
			const frame = framesRef.current.find((f) => f.name === target);
			const viewport = viewportRef.current;
			const cam = cameraRef.current;
			if (frame !== undefined && viewport !== null && cam !== null) {
				animateCamera(centerOn(cam, frame, viewport.clientWidth, viewport.clientHeight));
			}
		},
		[animateCamera],
	);

	const exitEntered = useCallback(() => {
		setEntered(null);
		walkTarget.current = null;
		walkSession.current = null;
	}, []);

	/** The one mode door: design freezes time everywhere, so entering it exits play. */
	const switchMode = useCallback(
		(next: CanvasMode) => {
			if (next === "design") exitEntered();
			// the element surface is design's; its selection does not outlive it
			if (next === "live") setPicked(null);
			setMode(next);
		},
		[exitEntered],
	);

	// --- selection sync (#23): what Liam points at, served to agents ------------

	useEffect(() => {
		const timer = setTimeout(() => {
			if (picked !== null) {
				const { frame, selector, outerHtml, source, generated } = picked;
				putSelection(project, { element: { frame, selector, outerHtml, source, generated } });
			} else {
				putSelection(project, { frames: selected });
			}
		}, SELECTION_PUT_MS);
		return () => clearTimeout(timer);
	}, [project, picked, selected]);

	// --- geometry writes (#23): sidecars only, never source ---------------------

	const commitGeometry = useCallback(
		(names: readonly string[]) => {
			const patch: Record<string, Geometry> = {};
			for (const frame of framesRef.current) {
				if (!names.includes(frame.name)) continue;
				patch[frame.name] = {
					x: Math.round(frame.x),
					y: Math.round(frame.y),
					w: Math.round(frame.w),
					h: Math.round(frame.h),
				};
			}
			if (Object.keys(patch).length === 0) return;
			setFrames((current) => {
				return current.map((frame) => {
					const rounded = patch[frame.name];
					return rounded === undefined ? frame : { ...frame, ...rounded };
				});
			});
			void putGeometry(project, patch).then((ok) => {
				// a write that never landed must not leave the canvas lying — snap
				// back to the sidecars' truth
				if (!ok) void refetchFrames();
			});
		},
		[project, refetchFrames],
	);

	const flushNudge = useCallback(() => {
		clearTimeout(nudgeTimer.current);
		nudgeTimer.current = undefined;
		if (nudgeDirty.current.size === 0) return;
		const names = [...nudgeDirty.current];
		nudgeDirty.current.clear();
		commitGeometry(names);
	}, [commitGeometry]);

	const nudge = useCallback(
		(dx: number, dy: number) => {
			const names = selectedRef.current;
			if (names.length === 0) return;
			setFrames((current) =>
				current.map((frame) =>
					names.includes(frame.name) ? { ...frame, x: frame.x + dx, y: frame.y + dy } : frame,
				),
			);
			for (const name of names) nudgeDirty.current.add(name);
			clearTimeout(nudgeTimer.current);
			nudgeTimer.current = setTimeout(flushNudge, NUDGE_FLUSH_MS);
		},
		[flushNudge],
	);

	// --- trash (#23): instant canvas removal, disk move deferred on the toast ---

	const commitTrash = useCallback(() => {
		const names = pendingTrashRef.current;
		pendingTrashRef.current = null;
		clearTimeout(trashTimer.current);
		setPendingTrash(null);
		if (names === null || names.length === 0) return;
		void postTrash(project, names).then((ok) => {
			if (ok) return;
			// the move never happened: resurface the frames instead of losing them
			setHidden((current) => new Set([...current].filter((name) => !names.includes(name))));
			void refetchFrames();
		});
	}, [project, refetchFrames]);

	const stageTrash = useCallback(
		(names: string[]) => {
			if (names.length === 0) return;
			commitTrash(); // an earlier toast still open commits now — one undo slot (#7)
			setHidden((current) => new Set([...current, ...names]));
			setSelected((current) => current.filter((name) => !names.includes(name)));
			setPicked((current) => (current !== null && names.includes(current.frame) ? null : current));
			if (enteredRef.current !== null && names.includes(enteredRef.current)) exitEntered();
			pendingTrashRef.current = names;
			setPendingTrash(names);
			trashTimer.current = setTimeout(commitTrash, TRASH_UNDO_MS);
		},
		[commitTrash, exitEntered],
	);

	const undoTrash = useCallback(() => {
		const names = pendingTrashRef.current;
		if (names === null) return;
		pendingTrashRef.current = null;
		clearTimeout(trashTimer.current);
		setPendingTrash(null);
		setHidden((current) => new Set([...current].filter((name) => !names.includes(name))));
	}, []);

	// leaving the page (or the tab) mid-toast: the staged move still happens
	useEffect(() => {
		const flush = () => {
			const names = pendingTrashRef.current;
			if (names === null) return;
			pendingTrashRef.current = null;
			beaconTrash(project, names);
		};
		window.addEventListener("pagehide", flush);
		return () => {
			window.removeEventListener("pagehide", flush);
			flush();
		};
	}, [project]);

	// --- element pick (#23): the shim answers, the pointer never enters ---------

	const pickAt = useCallback((frame: string, local: Point) => {
		const finish = (hit: PickedHit | null) => {
			if (hit === null) {
				// frame background (or a silent frame): the frame is the selection
				setSelected([frame]);
				setPicked(null);
			} else {
				setSelected([]);
				setPicked({ frame, ...hit });
			}
		};
		const target = iframes.current.get(frame)?.contentWindow;
		if (target == null) {
			finish(null);
			return;
		}
		const waiter = (hit: PickedHit | null) => finish(hit);
		pickWaiters.current.set(frame, waiter);
		target.postMessage(pickMessage(local.x, local.y), "*");
		setTimeout(() => {
			if (pickWaiters.current.get(frame) === waiter) {
				pickWaiters.current.delete(frame);
				finish(null);
			}
		}, PICK_REPLY_MS);
	}, []);

	// SSE: the agent loop (#22) — source edits update the canvas without reload
	useEffect(() => {
		return subscribeSse(`/api/p/${encodeURIComponent(project)}/events`, {
			change: (data) => {
				const event = data as { kind: string; frame?: string };
				if (event.kind === "frame" && event.frame !== undefined) {
					const frame = event.frame;
					setDocNonces((current) => ({ ...current, [frame]: (current[frame] ?? 0) + 1 }));
					// the DOM this pick pointed into is gone
					setPicked((current) => (current?.frame === frame ? null : current));
					lifecycleRef.current.markStale(frame);
					void refetchFrames();
				} else if (event.kind === "shared") {
					// anything in shared/ can stale every document
					setDocNonces((current) => {
						const next: Record<string, number> = { ...current };
						for (const frame of framesRef.current) next[frame.name] = (next[frame.name] ?? 0) + 1;
						return next;
					});
					setPicked(null);
					void refetchFrames();
				} else if (event.kind === "geometry") {
					// another browser's hands (or our own echo); ours are the truth
					// while a gesture or an un-flushed nudge is in flight
					if (
						(gesture.current.kind === "idle" || gesture.current.kind === "pan") &&
						nudgeDirty.current.size === 0
					) {
						void refetchFrames();
					}
				} else if (event.kind === "thumb" && event.frame !== undefined) {
					noteThumb(event.frame);
				}
			},
		});
	}, [project, refetchFrames, noteThumb]);

	// the frame protocol: loaded/error/shot route into the lifecycle, session?
	// answers with the carried walk session, go/back move the entered state
	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const message = parseFrameMessage(event.data);
			if (message === undefined) return;
			switch (message.spool) {
				case "loaded":
					lifecycleRef.current.noteLoaded(message.frame);
					return;
				case "shot":
					lifecycleRef.current.noteShot(message.frame, message.url);
					return;
				case "error":
					console.warn(`spool: frame "${message.frame}" reported:`, message.error);
					return;
				case "session?": {
					const record = walkTarget.current === message.frame ? walkSession.current : null;
					(event.source as WindowProxy | null)?.postMessage(sessionReply(record), "*");
					return;
				}
				case "picked": {
					const waiter = pickWaiters.current.get(message.frame);
					pickWaiters.current.delete(message.frame);
					waiter?.(message.hit);
					return;
				}
				case "key":
					// an entered frame owns the keyboard; the shim forwards the exit key
					if (message.key === "Escape" && enteredRef.current === message.frame) exitEntered();
					return;
				case "go":
				case "back": {
					if (enteredRef.current !== message.frame) return;
					walkTo(message.target, message.session ?? null);
					return;
				}
			}
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [walkTo, exitEntered]);

	// wheel: pan; ctrl/cmd-wheel (and pinch): zoom at the cursor — bake-off feel
	useEffect(() => {
		const el = viewportRef.current;
		if (el === null) return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			stopAnimation();
			setMenu(null);
			const scale = event.deltaMode === 1 ? 16 : 1;
			const dx = event.deltaX * scale;
			const dy = event.deltaY * scale;
			if (event.ctrlKey || event.metaKey) {
				const rect = el.getBoundingClientRect();
				const factor = clamp(Math.exp(-dy * 0.0075), 0.5, 2);
				zoomAtPoint(event.clientX - rect.left, event.clientY - rect.top, factor);
			} else {
				setCamera((c) =>
					c === null ? c : event.shiftKey && dx === 0 ? { ...c, x: c.x - dy } : { ...c, x: c.x - dx, y: c.y - dy },
				);
			}
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [stopAnimation, zoomAtPoint]);

	// persist camera + mode on settle: last-settle wins the stored slot (#12)
	useEffect(() => {
		if (camera === null) return;
		const settle = setTimeout(() => {
			putCanvasState(project, { mode, camera: { x: camera.x, y: camera.y, k: camera.k } });
		}, SETTLE_PERSIST_MS);
		return () => clearTimeout(settle);
	}, [camera, mode, project]);

	// --- gestures ---------------------------------------------------------------

	const localPoint = (event: { clientX: number; clientY: number }): Point => {
		const rect = viewportRef.current?.getBoundingClientRect();
		return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
	};

	const frameAtWorld = (p: Point): string | null => {
		const list = framesRef.current;
		for (let i = list.length - 1; i >= 0; i--) {
			const f = list[i];
			if (f !== undefined && p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h) return f.name;
		}
		return null;
	};

	const datasetHit = (target: EventTarget | null, attribute: string): string | null => {
		if (!(target instanceof Element)) return null;
		return target.closest<HTMLElement>(`[data-${attribute}]`)?.dataset[camelize(attribute)] ?? null;
	};

	const cancelGesture = useCallback(() => {
		const active = gesture.current;
		gesture.current = { kind: "idle" };
		setGuides(NO_GUIDES);
		setMarquee(null);
		setResizeCursor(null);
		setPanning(false);
		if (active.kind === "move") {
			setFrames((current) =>
				current.map((frame) => {
					const origin = active.origins.get(frame.name);
					return origin === undefined ? frame : { ...frame, x: origin.x, y: origin.y };
				}),
			);
		} else if (active.kind === "resize") {
			setFrames((current) =>
				current.map((frame) => (frame.name === active.frame ? { ...frame, ...active.origin } : frame)),
			);
		}
	}, []);

	const originsOf = (names: readonly string[]): Map<string, Point> => {
		const origins = new Map<string, Point>();
		for (const frame of framesRef.current) {
			if (names.includes(frame.name)) origins.set(frame.name, { x: frame.x, y: frame.y });
		}
		return origins;
	};

	const onPointerDown = (event: React.PointerEvent) => {
		const cam = cameraRef.current;
		if (cam === null || event.button === 2) return;
		stopAnimation();
		setMenu(null);
		viewportRef.current?.setPointerCapture(event.pointerId);
		const p = localPoint(event);

		if (enteredRef.current !== null) {
			const hit = frameAtWorld(toWorld(p, cam));
			if (hit === enteredRef.current) return; // the pointer is the frame's now
			exitEntered();
		}

		if (event.button === 1 || spaceRef.current) {
			gesture.current = { kind: "pan", lastX: p.x, lastY: p.y };
			setPanning(true);
			return;
		}
		if (event.button !== 0) return;

		// corner handles first: they overhang the frame and own the pointer
		const cornerHit = datasetHit(event.target, "corner");
		const corner = cornerHit !== null && isCorner(cornerHit) ? cornerHit : null;
		const single = selectedRef.current.length === 1 ? (selectedRef.current[0] ?? null) : null;
		if (corner !== null && single !== null) {
			const frame = framesRef.current.find((f) => f.name === single);
			if (frame !== undefined) {
				const anchor = {
					x: corner.includes("w") ? frame.x + frame.w : frame.x,
					y: corner.includes("n") ? frame.y + frame.h : frame.y,
				};
				gesture.current = {
					kind: "resize",
					frame: single,
					corner,
					anchor,
					origin: { x: frame.x, y: frame.y, w: frame.w, h: frame.h },
				};
				setResizeCursor(corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize");
				return;
			}
		}

		const world = toWorld(p, cam);
		const hit = datasetHit(event.target, "frame-label") ?? frameAtWorld(world);

		if (hit === null) {
			// empty canvas: a clean click clears, a drag draws the marquee
			const base = event.shiftKey ? selectedRef.current : [];
			if (!event.shiftKey) {
				setSelected([]);
				setPicked(null);
			}
			gesture.current = { kind: "marquee", start: p, base };
			return;
		}

		if (event.shiftKey) {
			// shift-click: add/remove, never a drag
			setPicked(null);
			setSelected((current) => (current.includes(hit) ? current.filter((name) => name !== hit) : [...current, hit]));
			return;
		}

		const wasSelected = selectedRef.current.includes(hit);
		const names = wasSelected ? [...selectedRef.current] : [hit];
		// design body-clicks defer their select: a clean release picks the element
		// under the pointer instead (#7: element in design), a drag still arranges
		const defer = modeRef.current === "design" && datasetHit(event.target, "frame-label") === null;
		if (!defer && !wasSelected) {
			setSelected([hit]);
			setPicked(null);
		}
		gesture.current = { kind: "pending", frame: hit, names, origins: originsOf(names), start: p, defer };
	};

	const onPointerMove = (event: React.PointerEvent) => {
		const active = gesture.current;
		if (active.kind === "idle") return;
		const cam = cameraRef.current;
		if (cam === null) return;
		const p = localPoint(event);

		if (active.kind === "pan") {
			const dx = p.x - active.lastX;
			const dy = p.y - active.lastY;
			gesture.current = { ...active, lastX: p.x, lastY: p.y };
			setCamera((c) => (c === null ? c : { ...c, x: c.x + dx, y: c.y + dy }));
			return;
		}

		if (active.kind === "pending") {
			if (Math.hypot(p.x - active.start.x, p.y - active.start.y) < DRAG_THRESHOLD_PX) return;
			if (active.defer) {
				setSelected(active.names);
				setPicked(null);
			}
			gesture.current = { kind: "move", names: active.names, origins: active.origins, start: active.start };
			onPointerMove(event);
			return;
		}

		if (active.kind === "move") {
			const rawX = (p.x - active.start.x) / cam.k;
			const rawY = (p.y - active.start.y) / cam.k;
			const movingBoxes: Box[] = [];
			for (const frame of framesRef.current) {
				const origin = active.origins.get(frame.name);
				if (origin !== undefined)
					movingBoxes.push({ x: origin.x + rawX, y: origin.y + rawY, w: frame.w, h: frame.h });
			}
			if (movingBoxes.length === 0) return;
			const statics = framesRef.current.filter((f) => !active.origins.has(f.name));
			const snap = snapMovedBox(boundsOf(movingBoxes), statics, SNAP_THRESHOLD_PX / cam.k);
			const dx = rawX + snap.dx;
			const dy = rawY + snap.dy;
			setGuides({ v: snap.v, h: snap.h });
			setFrames((current) =>
				current.map((frame) => {
					const origin = active.origins.get(frame.name);
					return origin === undefined ? frame : { ...frame, x: origin.x + dx, y: origin.y + dy };
				}),
			);
			return;
		}

		if (active.kind === "marquee") {
			const rect = normalizedRect(active.start, p);
			setMarquee(rect);
			const world = {
				x: (rect.x - cam.x) / cam.k,
				y: (rect.y - cam.y) / cam.k,
				w: rect.w / cam.k,
				h: rect.h / cam.k,
			};
			const swept = framesRef.current.filter((f) => intersects(world, f)).map((f) => f.name);
			const next = [...new Set([...active.base, ...swept])];
			setSelected((current) => (sameNames(current, next) ? current : next));
			return;
		}

		if (active.kind === "resize") {
			const world = toWorld(p, cam);
			const west = active.corner.includes("w");
			const north = active.corner.includes("n");
			const x = west ? Math.min(world.x, active.anchor.x - MIN_FRAME_SIZE) : active.anchor.x;
			const y = north ? Math.min(world.y, active.anchor.y - MIN_FRAME_SIZE) : active.anchor.y;
			const w = west ? active.anchor.x - x : Math.max(world.x - active.anchor.x, MIN_FRAME_SIZE);
			const h = north ? active.anchor.y - y : Math.max(world.y - active.anchor.y, MIN_FRAME_SIZE);
			const box = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
			setFrames((current) => current.map((frame) => (frame.name === active.frame ? { ...frame, ...box } : frame)));
		}
	};

	const onPointerUp = () => {
		const active = gesture.current;
		gesture.current = { kind: "idle" };
		setPanning(false);
		setGuides(NO_GUIDES);
		setMarquee(null);
		setResizeCursor(null);
		if (active.kind === "pending" && active.defer) {
			const cam = cameraRef.current;
			const frame = framesRef.current.find((f) => f.name === active.frame);
			if (cam !== null && frame !== undefined) {
				const world = toWorld(active.start, cam);
				pickAt(active.frame, { x: world.x - frame.x, y: world.y - frame.y });
			}
			return;
		}
		if (active.kind === "move") commitGeometry(active.names);
		if (active.kind === "resize") commitGeometry([active.frame]);
	};

	const onDoubleClick = (event: React.MouseEvent) => {
		const cam = cameraRef.current;
		if (cam === null) return;
		// design mode: time is frozen everywhere, there is nothing to enter (#7)
		if (modeRef.current === "design") return;
		const hit = frameAtWorld(toWorld(localPoint(event), cam));
		if (hit !== null) {
			// entering is the play gesture — a hibernated frame boots fresh here
			walkTarget.current = null;
			walkSession.current = null;
			setEntered(hit);
			setSelected([]);
			setPicked(null);
			// and it is a focusing gesture: fly to the frame, Shift+2's fit —
			// walks stay same-zoom pans (#5), only the enter zooms
			const frame = framesRef.current.find((f) => f.name === hit);
			const viewport = viewportRef.current;
			if (frame !== undefined && viewport !== null) {
				animateCamera(fitCamera(frame, viewport.clientWidth, viewport.clientHeight));
			}
		}
	};

	const onContextMenu = (event: React.MouseEvent) => {
		event.preventDefault();
		const cam = cameraRef.current;
		if (cam === null) return;
		const p = localPoint(event);
		const world = toWorld(p, cam);
		const hit = datasetHit(event.target, "frame-label") ?? frameAtWorld(world);
		if (hit === null) {
			setMenu(null);
			return;
		}
		if (enteredRef.current !== null) exitEntered();
		if (!selectedRef.current.includes(hit)) {
			setSelected([hit]);
			setPicked(null);
		}
		// in design the right-click also points: the menu's Open in editor and the
		// context chip both ride the element under the cursor
		if (modeRef.current === "design") {
			const frame = framesRef.current.find((f) => f.name === hit);
			if (frame !== undefined) pickAt(hit, { x: world.x - frame.x, y: world.y - frame.y });
		}
		const viewport = viewportRef.current;
		const x = viewport === null ? p.x : Math.min(p.x, viewport.clientWidth - MENU_SIZE.w - 8);
		const y = viewport === null ? p.y : Math.min(p.y, viewport.clientHeight - MENU_SIZE.h - 8);
		setMenu({ x, y, frame: hit });
	};

	const openEditorFor = useCallback(
		(target: { path: string; line?: number }) => {
			openInEditor(project, target.path, target.line);
		},
		[project],
	);

	// --- keys -------------------------------------------------------------------

	const menuOpenRef = useRef(false);
	menuOpenRef.current = menu !== null;

	useEffect(() => {
		const pickTarget = () => (pickedRef.current === null ? [] : [pickedRef.current.frame]);
		const isTyping = (target: EventTarget | null) =>
			target instanceof HTMLElement &&
			(target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
		const onKeyDown = (event: KeyboardEvent) => {
			if (isTyping(event.target)) return;
			const mod = event.metaKey || event.ctrlKey;
			if (event.code === "Space" && !event.repeat) {
				setSpaceDown(true);
				event.preventDefault();
				return;
			}
			if (mod && !event.shiftKey && (event.key === "z" || event.key === "Z")) {
				// ⌘Z = the toast (#7): the one undo in v1 — ⌘⇧Z stays redo's, unbound
				if (pendingTrashRef.current !== null) {
					event.preventDefault();
					undoTrash();
				}
				return;
			}
			if (mod && (event.key === "=" || event.key === "+")) {
				event.preventDefault();
				const c = viewportCenter();
				zoomAtPoint(c.x, c.y, 1.25, true);
				return;
			}
			if (mod && event.key === "-") {
				event.preventDefault();
				const c = viewportCenter();
				zoomAtPoint(c.x, c.y, 0.8, true);
				return;
			}
			if (mod && event.key === "0") {
				event.preventDefault();
				const cam = cameraRef.current;
				if (cam === null) return;
				const c = viewportCenter();
				const w = toWorld(c, cam);
				animateCamera({ k: 1, x: c.x - w.x, y: c.y - w.y });
				return;
			}
			if (mod) return;
			if (event.shiftKey && event.code === "Digit1") {
				zoomFit();
				return;
			}
			if (event.shiftKey && event.code === "Digit2") {
				const names = selectedRef.current.length > 0 ? selectedRef.current : pickTarget();
				const boxes = framesRef.current.filter((f) => names.includes(f.name));
				const viewport = viewportRef.current;
				if (boxes.length > 0 && viewport !== null) {
					animateCamera(fitCamera(boundsOf(boxes), viewport.clientWidth, viewport.clientHeight));
				}
				return;
			}
			switch (event.key) {
				case "d":
				case "D":
					// modes control time (#7); persisted per project, never auto-switched
					switchMode(modeRef.current === "live" ? "design" : "live");
					break;
				case "+":
				case "=": {
					const c = viewportCenter();
					zoomAtPoint(c.x, c.y, 1.25, true);
					break;
				}
				case "-": {
					const c = viewportCenter();
					zoomAtPoint(c.x, c.y, 0.8, true);
					break;
				}
				case "ArrowLeft":
				case "ArrowRight":
				case "ArrowUp":
				case "ArrowDown": {
					if (enteredRef.current !== null || selectedRef.current.length === 0) break;
					event.preventDefault();
					const step = event.shiftKey ? 10 : 1;
					const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
					const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
					nudge(dx, dy);
					break;
				}
				case "Delete":
				case "Backspace":
					// frame delete only — element delete is deliberately out (#7)
					if (enteredRef.current === null && selectedRef.current.length > 0) {
						event.preventDefault();
						stageTrash([...selectedRef.current]);
					}
					break;
				case "Escape":
					if (gesture.current.kind !== "idle" && gesture.current.kind !== "pan") cancelGesture();
					else if (menuOpenRef.current) setMenu(null);
					else if (enteredRef.current !== null) exitEntered();
					else if (pickedRef.current !== null) setPicked(null);
					else setSelected([]);
					break;
			}
		};
		const onKeyUp = (event: KeyboardEvent) => {
			if (event.code === "Space") setSpaceDown(false);
		};
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
		};
	}, [
		viewportCenter,
		zoomAtPoint,
		zoomFit,
		animateCamera,
		exitEntered,
		switchMode,
		nudge,
		stageTrash,
		undoTrash,
		cancelGesture,
	]);

	// --- chrome (top bar) -------------------------------------------------------

	const zoomPct = camera === null ? 100 : Math.round(camera.k * 100);
	useEffect(() => {
		onChrome({ mode, zoomPct, setMode: switchMode });
		return () => onChrome(null);
	}, [mode, zoomPct, onChrome, switchMode]);

	// --- render -------------------------------------------------------------------

	const empty = loaded && frames.length === 0;
	const k = camera?.k ?? 1;
	const shellRadius = Math.min(12 / k, 24);
	const cursor = resizeCursor ?? (panning ? "grabbing" : spaceDown ? "grab" : "default");

	if (empty) {
		// agent-first, buttonless (#13): the canvas never pretends hands author frames
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-canvas pb-20">
				<RibbonMark className="h-7 w-[22px] opacity-40" />
				<p className="font-medium text-base text-text leading-base">No frames yet.</p>
				<p className="font-mono text-muted text-sm leading-sm">
					An agent births a frame by writing frames/&lt;name&gt;/frame.tsx
				</p>
				<p className="font-mono text-muted text-xs leading-xs">spool skill · spool url</p>
			</div>
		);
	}

	return (
		<div
			ref={viewportRef}
			role="application"
			aria-label={`${project} canvas`}
			className="relative h-full w-full touch-none select-none overflow-hidden bg-canvas"
			style={{ cursor }}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onDoubleClick={onDoubleClick}
			onContextMenu={onContextMenu}
		>
			{camera !== null && (
				<div
					className="absolute top-0 left-0"
					style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${k})`, transformOrigin: "0 0" }}
				>
					{visibleFrames.map((frame) => {
						const state = lifecycle.states[frame.name] ?? "hibernated";
						const isEntered = entered === frame.name;
						const isSelected = selected.includes(frame.name);
						const paused = mode === "live" && state !== "live";
						return (
							<div
								key={frame.name}
								className="absolute"
								style={{ transform: `translate(${frame.x}px, ${frame.y}px)`, width: frame.w, height: frame.h }}
							>
								{/* the label: mono, muted; thread when selected; ▸ = paused (system page) */}
								<div
									data-frame-label={frame.name}
									className="absolute bottom-full left-0 origin-bottom-left whitespace-nowrap"
									style={{ transform: `scale(${1 / k})` }}
								>
									<div className="flex items-center gap-1.5 pb-2.5">
										{paused && <span className="font-mono text-2xs text-muted leading-3">▸</span>}
										<span
											className={`font-mono text-sm leading-4 ${isSelected || isEntered ? "text-thread" : "text-muted"}`}
										>
											{frame.name}
										</span>
									</div>
								</div>
								<div className="relative h-full w-full overflow-hidden" style={{ borderRadius: shellRadius }}>
									<FrameShell
										project={project}
										name={frame.name}
										state={state}
										ready={lifecycle.ready.has(frame.name)}
										entered={isEntered}
										docNonce={docNonces[frame.name] ?? 0}
										thumbNonce={thumbNonces[frame.name] ?? 0}
										hasThumb={hasThumb(frame.name)}
										onIframe={onIframe}
									/>
								</div>
							</div>
						);
					})}
				</div>
			)}

			{camera !== null && (
				<SelectionOverlay
					camera={camera}
					frames={visibleFrames}
					selected={selected}
					entered={entered}
					picked={picked}
					guides={guides}
					marquee={marquee}
					shellRadius={shellRadius}
					onOpenEditor={(pick) => openEditorFor(editorTarget(pick))}
				/>
			)}

			{menu !== null && (
				<ContextMenu
					at={menu}
					onPlay={null}
					onOpenEditor={() => {
						const pick = pickedRef.current;
						openEditorFor(
							pick !== null && pick.frame === menu.frame
								? editorTarget(pick)
								: { path: `design/frames/${menu.frame}/frame.tsx` },
						);
						setMenu(null);
					}}
					onTrash={() => {
						const names = selectedRef.current.includes(menu.frame) ? [...selectedRef.current] : [menu.frame];
						setMenu(null);
						stageTrash(names);
					}}
				/>
			)}

			{pendingTrash !== null && <TrashToast frames={pendingTrash} onUndo={undoTrash} />}
		</div>
	);
}

function normalizedRect(a: Point, b: Point): Box {
	return {
		x: Math.min(a.x, b.x),
		y: Math.min(a.y, b.y),
		w: Math.abs(a.x - b.x),
		h: Math.abs(a.y - b.y),
	};
}

function sameNames(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((name, i) => name === b[i]);
}

/** "frame-label" → "frameLabel": dataset keys camel-case their attribute. */
function camelize(attribute: string): string {
	return attribute.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
}
