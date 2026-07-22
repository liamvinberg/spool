import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Camera, CanvasMode, ProjectedFrame } from "../api";
import { fetchCanvasState, fetchProjection, putCanvasState, putThumb, subscribeSse } from "../api";
import { RibbonMark } from "../icons";
import { type Box, boundsOf, centerOn, clamp, fitCamera, toWorld, zoomAt } from "./camera";
import { FrameShell } from "./frame-shell";
import { useFrameLifecycle } from "./lifecycle";
import { parseFrameMessage, type SessionRecord, sessionReply } from "./protocol";

/**
 * The infinite canvas (#22): design/ projected as sandboxed frames with
 * Figma-feel pan/zoom — Space or middle-drag pans, the pointer always
 * selects, no tool switcher. Single click selects (pre-boots), double click
 * enters where time runs, the entered state follows data-go walks (camera
 * pan — frames are places, #5), Esc exits. D toggles live/design.
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

const SETTLE_PERSIST_MS = 600;

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
	const [selected, setSelected] = useState<string | null>(null);
	const [entered, setEntered] = useState<string | null>(null);
	const [spaceDown, setSpaceDown] = useState(false);
	const [panning, setPanning] = useState(false);
	const [docNonces, setDocNonces] = useState<Record<string, number>>({});
	const [thumbNonces, setThumbNonces] = useState<Record<string, number>>({});
	const [freshThumbs, setFreshThumbs] = useState<ReadonlySet<string>>(new Set<string>());

	const gesture = useRef<{ panning: boolean; lastX: number; lastY: number }>({ panning: false, lastX: 0, lastY: 0 });
	const animation = useRef(0);
	const cameraRef = useRef<Camera | null>(null);
	cameraRef.current = camera;
	const framesRef = useRef(frames);
	framesRef.current = frames;
	const enteredRef = useRef(entered);
	enteredRef.current = entered;
	const modeRef = useRef(mode);
	modeRef.current = mode;
	const spaceRef = useRef(spaceDown);
	spaceRef.current = spaceDown;
	const selectedRef = useRef(selected);
	selectedRef.current = selected;
	// the walk session mirror: what the last go/back carried, owed to the next boot
	const walkSession = useRef<SessionRecord | null>(null);
	const walkTarget = useRef<string | null>(null);

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
		selected,
		hasThumb: (name) => hasThumbRef.current(name),
		onShot,
	});
	const lifecycleRef = useRef(lifecycle);
	lifecycleRef.current = lifecycle;

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
			setSelected(null);
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
			setMode(next);
		},
		[exitEntered],
	);

	// SSE: the agent loop (#22) — source edits update the canvas without reload
	useEffect(() => {
		return subscribeSse(`/api/p/${encodeURIComponent(project)}/events`, {
			change: (data) => {
				const event = data as { kind: string; frame?: string };
				if (event.kind === "frame" && event.frame !== undefined) {
					const frame = event.frame;
					setDocNonces((current) => ({ ...current, [frame]: (current[frame] ?? 0) + 1 }));
					lifecycleRef.current.markStale(frame);
					void refetchFrames();
				} else if (event.kind === "shared") {
					// anything in shared/ can stale every document
					setDocNonces((current) => {
						const next: Record<string, number> = { ...current };
						for (const frame of framesRef.current) next[frame.name] = (next[frame.name] ?? 0) + 1;
						return next;
					});
					void refetchFrames();
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

	// --- keys -------------------------------------------------------------------

	useEffect(() => {
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
				const frame = framesRef.current.find((f) => f.name === selectedRef.current);
				const viewport = viewportRef.current;
				if (frame !== undefined && viewport !== null) {
					animateCamera(fitCamera(frame, viewport.clientWidth, viewport.clientHeight));
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
				case "Escape":
					if (enteredRef.current !== null) exitEntered();
					else setSelected(null);
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
	}, [viewportCenter, zoomAtPoint, zoomFit, animateCamera, exitEntered, switchMode]);

	// --- pointer gestures -------------------------------------------------------

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

	const onPointerDown = (event: React.PointerEvent) => {
		const cam = cameraRef.current;
		if (cam === null || event.button === 2) return;
		stopAnimation();
		viewportRef.current?.setPointerCapture(event.pointerId);
		const p = localPoint(event);

		if (enteredRef.current !== null) {
			const hit = frameAtWorld(toWorld(p, cam));
			if (hit === enteredRef.current) return; // the pointer is the frame's now
			exitEntered();
		}

		if (event.button === 1 || spaceRef.current) {
			gesture.current = { panning: true, lastX: p.x, lastY: p.y };
			setPanning(true);
			return;
		}

		// pointer always selects (#7): frame in live; element select is #23's
		setSelected(frameAtWorld(toWorld(p, cam)));
	};

	const onPointerMove = (event: React.PointerEvent) => {
		if (!gesture.current.panning) return;
		const p = localPoint(event);
		const dx = p.x - gesture.current.lastX;
		const dy = p.y - gesture.current.lastY;
		gesture.current.lastX = p.x;
		gesture.current.lastY = p.y;
		setCamera((c) => (c === null ? c : { ...c, x: c.x + dx, y: c.y + dy }));
	};

	const onPointerUp = () => {
		gesture.current.panning = false;
		setPanning(false);
	};

	const onDoubleClick = (event: React.MouseEvent) => {
		const cam = cameraRef.current;
		if (cam === null) return;
		// design mode: double-click is reserved for the element surface (#23)
		if (modeRef.current === "design") return;
		const hit = frameAtWorld(toWorld(localPoint(event), cam));
		if (hit !== null) {
			// entering is the play gesture — a hibernated frame boots fresh here
			walkTarget.current = null;
			walkSession.current = null;
			setEntered(hit);
			setSelected(null);
		}
	};

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
	const cursor = panning ? "grabbing" : spaceDown ? "grab" : "default";
	const screenRect = (box: Box): Box | null =>
		camera === null ? null : { x: box.x * k + camera.x, y: box.y * k + camera.y, w: box.w * k, h: box.h * k };

	const selectedFrame = useMemo(() => frames.find((f) => f.name === selected), [frames, selected]);
	const enteredFrame = useMemo(() => frames.find((f) => f.name === entered), [frames, entered]);

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
		>
			{camera !== null && (
				<div
					className="absolute top-0 left-0"
					style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${k})`, transformOrigin: "0 0" }}
				>
					{frames.map((frame) => {
						const state = lifecycle.states[frame.name] ?? "hibernated";
						const isEntered = entered === frame.name;
						const isSelected = selected === frame.name;
						const paused = mode === "live" && state !== "live";
						return (
							<div
								key={frame.name}
								className="absolute"
								style={{ transform: `translate(${frame.x}px, ${frame.y}px)`, width: frame.w, height: frame.h }}
							>
								{/* the label: mono, muted; thread when selected; ▸ = paused (system page) */}
								<div
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
										onIframe={lifecycle.onIframe}
									/>
								</div>
							</div>
						);
					})}
				</div>
			)}

			{/* screen-space overlays: the selection ring — 1.5px thread, 3px offset, radius +2 */}
			<div className="pointer-events-none absolute inset-0">
				{[selectedFrame, enteredFrame].map((frame) => {
					if (frame === undefined) return null;
					const rect = screenRect(frame);
					if (rect === null) return null;
					return (
						<div
							key={`ring-${frame.name}`}
							className="absolute border-[1.5px] border-thread"
							style={{
								left: rect.x - 3,
								top: rect.y - 3,
								width: rect.w + 6,
								height: rect.h + 6,
								borderRadius: Math.min(12, shellRadius * k) + 2,
							}}
						/>
					);
				})}
			</div>
		</div>
	);
}
