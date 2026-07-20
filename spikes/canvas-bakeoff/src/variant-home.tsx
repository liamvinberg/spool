// Home-built DOM canvas. Everything hand-rolled: camera, wheel semantics, selection,
// marquee, drag with snap guides, corner resize, bound arrows, counter-scaled labels.
// This file IS the cost estimate for "no library" — judge its feel against variant-tldraw.
//
// Coordinate model: screen = world * k + (cam.x, cam.y).
// World layer carries one CSS transform; selection UI lives in an unscaled screen overlay
// (the Figma pattern — constant-size handles/outlines regardless of zoom).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CanvasChrome, type ToolId } from "./canvas-chrome";
import { FrameContent } from "./frame-content";
import { type SceneArrow, type SceneFrame, sceneArrows, sceneFrames } from "./scene";

type Camera = { x: number; y: number; k: number };
type Point = { x: number; y: number };
type Bounds = { x: number; y: number; w: number; h: number };
type Corner = "nw" | "ne" | "sw" | "se";

type SnapGuide = { axis: "x" | "y"; at: number; from: number; to: number };

type Gesture =
	| { kind: "pan"; last: Point }
	| { kind: "maybe-drag"; frameId: string; start: Point; additive: boolean; wasSelected: boolean }
	| { kind: "drag"; start: Point; origins: Map<string, Point> }
	| { kind: "marquee"; startWorld: Point; additive: boolean; base: Set<string> }
	| { kind: "resize"; frameId: string; corner: Corner; origin: Bounds }
	| { kind: "arrow"; fromId: string };

const MIN_W = 80;
const MIN_H = 60;
const K_MIN = 0.02;
const K_MAX = 32;
const DRAG_THRESHOLD = 3;
const SNAP_SCREEN_PX = 8;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const toWorld = (p: Point, cam: Camera): Point => ({ x: (p.x - cam.x) / cam.k, y: (p.y - cam.y) / cam.k });

const boundsOf = (frames: SceneFrame[]): Bounds => {
	const x1 = Math.min(...frames.map((f) => f.x));
	const y1 = Math.min(...frames.map((f) => f.y));
	const x2 = Math.max(...frames.map((f) => f.x + f.w));
	const y2 = Math.max(...frames.map((f) => f.y + f.h));
	return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
};

const intersects = (a: Bounds, b: Bounds) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function fitCamera(frames: SceneFrame[], vw: number, vh: number): Camera {
	const b = boundsOf(frames);
	const k = clamp(Math.min((vw - 128) / b.w, (vh - 128) / b.h), K_MIN, 1);
	return { k, x: (vw - b.w * k) / 2 - b.x * k, y: (vh - b.h * k) / 2 - b.y * k };
}

// --- arrows ---------------------------------------------------------------

// Nearest-sides routing: exit/enter through the facing edge midpoints, like Figma noodles.
function arrowGeometry(a: Bounds, b: Bounds) {
	const acx = a.x + a.w / 2;
	const acy = a.y + a.h / 2;
	const bcx = b.x + b.w / 2;
	const bcy = b.y + b.h / 2;
	const dx = bcx - acx;
	const dy = bcy - acy;
	const horizontal = Math.abs(dx) >= Math.abs(dy);
	const from: Point = horizontal
		? { x: dx > 0 ? a.x + a.w : a.x, y: acy }
		: { x: acx, y: dy > 0 ? a.y + a.h : a.y };
	const to: Point = horizontal
		? { x: dx > 0 ? b.x : b.x + b.w, y: bcy }
		: { x: bcx, y: dy > 0 ? b.y : b.y + b.h };
	const dist = Math.hypot(to.x - from.x, to.y - from.y);
	const o = clamp(dist * 0.45, 40, 260);
	const c1: Point = horizontal ? { x: from.x + Math.sign(dx) * o, y: from.y } : { x: from.x, y: from.y + Math.sign(dy) * o };
	const c2: Point = horizontal ? { x: to.x - Math.sign(dx) * o, y: to.y } : { x: to.x, y: to.y - Math.sign(dy) * o };
	const dir: Point = horizontal ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) || 1 };
	return { from, to, c1, c2, dir };
}

function arrowHead(to: Point, dir: Point, k: number): string {
	const len = 11 / k;
	const half = 4.5 / k;
	const bx = to.x - dir.x * len;
	const by = to.y - dir.y * len;
	const px = -dir.y;
	const py = dir.x;
	return `M ${to.x} ${to.y} L ${bx + px * half} ${by + py * half} L ${bx - px * half} ${by - py * half} Z`;
}

// --- snapping ---------------------------------------------------------------

// Independent x/y snapping of the moving bbox edges+centers against every static
// frame's edges+centers, threshold in screen px. Returns the adjusted delta and guides.
function snapDelta(
	proposed: Point,
	moving: Bounds,
	statics: Bounds[],
	k: number,
): { delta: Point; guides: SnapGuide[] } {
	const thr = SNAP_SCREEN_PX / k;
	const mx = { x: moving.x + proposed.x, y: moving.y + proposed.y, w: moving.w, h: moving.h };
	const xsOf = (b: Bounds) => [b.x, b.x + b.w / 2, b.x + b.w];
	const ysOf = (b: Bounds) => [b.y, b.y + b.h / 2, b.y + b.h];

	let bestX: { diff: number } | null = null;
	let bestY: { diff: number } | null = null;
	for (const s of statics) {
		for (const sv of xsOf(s)) {
			for (const mv of xsOf(mx)) {
				const diff = sv - mv;
				if (Math.abs(diff) <= thr && (!bestX || Math.abs(diff) < Math.abs(bestX.diff))) bestX = { diff };
			}
		}
		for (const sv of ysOf(s)) {
			for (const mv of ysOf(mx)) {
				const diff = sv - mv;
				if (Math.abs(diff) <= thr && (!bestY || Math.abs(diff) < Math.abs(bestY.diff))) bestY = { diff };
			}
		}
	}

	const delta = { x: proposed.x + (bestX?.diff ?? 0), y: proposed.y + (bestY?.diff ?? 0) };

	// Collect every alignment that holds at the final position, so all matching guides show.
	const fin = { x: moving.x + delta.x, y: moving.y + delta.y, w: moving.w, h: moving.h };
	const guides: SnapGuide[] = [];
	for (const s of statics) {
		for (const sv of xsOf(s)) {
			if (xsOf(fin).some((mv) => Math.abs(mv - sv) < 0.5)) {
				guides.push({
					axis: "x",
					at: sv,
					from: Math.min(fin.y, s.y),
					to: Math.max(fin.y + fin.h, s.y + s.h),
				});
			}
		}
		for (const sv of ysOf(s)) {
			if (ysOf(fin).some((mv) => Math.abs(mv - sv) < 0.5)) {
				guides.push({
					axis: "y",
					at: sv,
					from: Math.min(fin.x, s.x),
					to: Math.max(fin.x + fin.w, s.x + s.w),
				});
			}
		}
	}
	return { delta, guides };
}

// --- component ---------------------------------------------------------------

export function VariantHome() {
	const viewportRef = useRef<HTMLDivElement>(null);
	const [camera, setCamera] = useState<Camera | null>(null);
	const [frames, setFrames] = useState<SceneFrame[]>(() => sceneFrames.map((f) => ({ ...f })));
	const [arrows, setArrows] = useState<SceneArrow[]>(() => sceneArrows.map((a) => ({ ...a })));
	const [selection, setSelection] = useState<Set<string>>(new Set());
	const [hoverId, setHoverId] = useState<string | null>(null);
	const [tool, setTool] = useState<ToolId>("select");
	const [spaceDown, setSpaceDown] = useState(false);
	const [panning, setPanning] = useState(false);
	const [marquee, setMarquee] = useState<Bounds | null>(null);
	const [guides, setGuides] = useState<SnapGuide[]>([]);
	const [arrowDraft, setArrowDraft] = useState<{ fromId: string; toWorld: Point; overId: string | null } | null>(null);

	const gesture = useRef<Gesture | null>(null);
	const cameraRef = useRef<Camera | null>(null);
	cameraRef.current = camera;
	const framesRef = useRef(frames);
	framesRef.current = frames;
	const selectionRef = useRef(selection);
	selectionRef.current = selection;
	const animRef = useRef(0);

	const frameById = (id: string) => framesRef.current.find((f) => f.id === id);

	// Geometric hit-test (topmost first). Pointer capture retargets events to the viewport,
	// so e.target is useless mid-gesture — position is the only reliable signal.
	const frameAtWorld = (p: Point) => {
		const fs = framesRef.current;
		for (let i = fs.length - 1; i >= 0; i--) {
			const f = fs[i];
			if (f && p.x >= f.x && p.x <= f.x + f.w && p.y >= f.y && p.y <= f.y + f.h) return f.id;
		}
		return null;
	};

	// Initial fit before first paint.
	useLayoutEffect(() => {
		const el = viewportRef.current;
		if (el && !cameraRef.current) setCamera(fitCamera(sceneFrames, el.clientWidth, el.clientHeight));
	}, []);

	const stopAnim = () => cancelAnimationFrame(animRef.current);

	const animateCamera = (to: Camera, ms = 220) => {
		const from = cameraRef.current;
		if (!from) return;
		stopAnim();
		const t0 = performance.now();
		const step = (t: number) => {
			const p = clamp((t - t0) / ms, 0, 1);
			const e = 1 - (1 - p) ** 3;
			setCamera({
				x: from.x + (to.x - from.x) * e,
				y: from.y + (to.y - from.y) * e,
				k: from.k + (to.k - from.k) * e,
			});
			if (p < 1) animRef.current = requestAnimationFrame(step);
		};
		animRef.current = requestAnimationFrame(step);
	};

	const zoomAt = (cx: number, cy: number, factor: number, animate = false) => {
		const cam = cameraRef.current;
		if (!cam) return;
		const k = clamp(cam.k * factor, K_MIN, K_MAX);
		const r = k / cam.k;
		const next = { k, x: cx - (cx - cam.x) * r, y: cy - (cy - cam.y) * r };
		if (animate) animateCamera(next, 140);
		else setCamera(next);
	};

	const viewportCenter = (): Point => {
		const el = viewportRef.current;
		return el ? { x: el.clientWidth / 2, y: el.clientHeight / 2 } : { x: 0, y: 0 };
	};

	const zoomToBounds = (b: Bounds) => {
		const el = viewportRef.current;
		if (!el) return;
		const k = clamp(Math.min((el.clientWidth - 128) / b.w, (el.clientHeight - 128) / b.h), K_MIN, 1);
		animateCamera({ k, x: (el.clientWidth - b.w * k) / 2 - b.x * k, y: (el.clientHeight - b.h * k) / 2 - b.y * k });
	};

	const zoomFit = () => zoomToBounds(boundsOf(framesRef.current));

	const zoomSelection = () => {
		const sel = framesRef.current.filter((f) => selectionRef.current.has(f.id));
		zoomToBounds(boundsOf(sel.length ? sel : framesRef.current));
	};

	// Wheel: pinch / ⌘-scroll zooms to cursor, two-finger scroll pans. Non-passive to beat page zoom.
	useEffect(() => {
		const el = viewportRef.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			stopAnim();
			const scale = e.deltaMode === 1 ? 16 : 1;
			const dx = e.deltaX * scale;
			const dy = e.deltaY * scale;
			if (e.ctrlKey || e.metaKey) {
				const rect = el.getBoundingClientRect();
				const factor = clamp(Math.exp(-dy * 0.0075), 0.5, 2);
				zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
			} else {
				setCamera((c) =>
					c ? (e.shiftKey && dx === 0 ? { ...c, x: c.x - dy } : { ...c, x: c.x - dx, y: c.y - dy }) : c,
				);
			}
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, []);

	// Keyboard: tools, zoom, nudge, delete, escape.
	useEffect(() => {
		const isTyping = (t: EventTarget | null) =>
			t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
		const onKeyDown = (e: KeyboardEvent) => {
			if (isTyping(e.target)) return;
			const mod = e.metaKey || e.ctrlKey;
			if (e.code === "Space" && !e.repeat) {
				setSpaceDown(true);
				e.preventDefault();
				return;
			}
			if (mod && (e.key === "=" || e.key === "+")) {
				e.preventDefault();
				const c = viewportCenter();
				zoomAt(c.x, c.y, 1.25, true);
				return;
			}
			if (mod && e.key === "-") {
				e.preventDefault();
				const c = viewportCenter();
				zoomAt(c.x, c.y, 0.8, true);
				return;
			}
			if (mod && e.key === "0") {
				e.preventDefault();
				const cam = cameraRef.current;
				if (!cam) return;
				const c = viewportCenter();
				const w = toWorld(c, cam);
				animateCamera({ k: 1, x: c.x - w.x, y: c.y - w.y });
				return;
			}
			if (mod) return;
			// Physical-key matching for shifted digits — on a Swedish layout shift+2 types ",
			// so e.key comparison against "@" never fires.
			if (e.shiftKey && e.code === "Digit1") {
				zoomFit();
				return;
			}
			if (e.shiftKey && e.code === "Digit2") {
				zoomSelection();
				return;
			}
			switch (e.key) {
				case "v":
					setTool("select");
					break;
				case "h":
					setTool("hand");
					break;
				case "a":
					setTool("arrow");
					break;
				case "+":
				case "=": {
					const c = viewportCenter();
					zoomAt(c.x, c.y, 1.25, true);
					break;
				}
				case "-": {
					const c = viewportCenter();
					zoomAt(c.x, c.y, 0.8, true);
					break;
				}
				case "Backspace":
				case "Delete": {
					const sel = selectionRef.current;
					if (!sel.size) break;
					setFrames((fs) => fs.filter((f) => !sel.has(f.id)));
					setArrows((as) => as.filter((a) => !sel.has(a.id) && !sel.has(a.from) && !sel.has(a.to)));
					setSelection(new Set());
					break;
				}
				case "ArrowLeft":
				case "ArrowRight":
				case "ArrowUp":
				case "ArrowDown": {
					const sel = selectionRef.current;
					if (!sel.size) break;
					e.preventDefault();
					const d = e.shiftKey ? 10 : 1;
					const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
					const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
					setFrames((fs) => fs.map((f) => (sel.has(f.id) ? { ...f, x: f.x + dx, y: f.y + dy } : f)));
					break;
				}
				case "Escape":
					if (gesture.current?.kind === "drag") {
						const g = gesture.current;
						setFrames((fs) => fs.map((f) => (g.origins.has(f.id) ? { ...f, ...g.origins.get(f.id) } : f)));
						gesture.current = null;
						setGuides([]);
					} else if (arrowDraft) {
						setArrowDraft(null);
						gesture.current = null;
					} else if (selectionRef.current.size) {
						setSelection(new Set());
					} else {
						setTool("select");
					}
					break;
			}
		};
		const onKeyUp = (e: KeyboardEvent) => {
			if (e.code === "Space") setSpaceDown(false);
		};
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
		};
	}, [arrowDraft]);

	// --- pointer gestures (single delegated handler; DOM does the hit-testing) ---

	const localPoint = (e: React.PointerEvent): Point => {
		const rect = viewportRef.current?.getBoundingClientRect();
		return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
	};

	const onPointerDown = (e: React.PointerEvent) => {
		const cam = cameraRef.current;
		if (!cam || e.button === 2) return;
		stopAnim();
		viewportRef.current?.setPointerCapture(e.pointerId);
		const p = localPoint(e);
		const target = e.target as Element;

		if (e.button === 1 || tool === "hand" || spaceDown) {
			gesture.current = { kind: "pan", last: p };
			setPanning(true);
			return;
		}

		const handle = target.closest("[data-handle]")?.getAttribute("data-handle") as Corner | null;
		const frameEl = target.closest("[data-frame-id]");
		const frameId = frameEl?.getAttribute("data-frame-id") ?? null;
		const arrowId = target.closest("[data-arrow-id]")?.getAttribute("data-arrow-id") ?? null;

		if (handle) {
			const only = [...selectionRef.current].find((id) => frameById(id));
			const f = only ? frameById(only) : undefined;
			if (f) gesture.current = { kind: "resize", frameId: f.id, corner: handle, origin: { x: f.x, y: f.y, w: f.w, h: f.h } };
			return;
		}

		if (tool === "arrow") {
			if (frameId) {
				gesture.current = { kind: "arrow", fromId: frameId };
				setArrowDraft({ fromId: frameId, toWorld: toWorld(p, cam), overId: null });
			}
			return;
		}

		if (frameId) {
			const additive = e.shiftKey;
			const wasSelected = selectionRef.current.has(frameId);
			if (!wasSelected) {
				setSelection((s) => (additive ? new Set([...s, frameId]) : new Set([frameId])));
			}
			gesture.current = { kind: "maybe-drag", frameId, start: p, additive, wasSelected };
			return;
		}

		if (arrowId) {
			setSelection(e.shiftKey ? new Set([...selectionRef.current, arrowId]) : new Set([arrowId]));
			return;
		}

		// Empty canvas → marquee.
		gesture.current = { kind: "marquee", startWorld: toWorld(p, cam), additive: e.shiftKey, base: new Set(selectionRef.current) };
		if (!e.shiftKey) setSelection(new Set());
	};

	const onPointerMove = (e: React.PointerEvent) => {
		const cam = cameraRef.current;
		if (!cam) return;
		const p = localPoint(e);
		const g = gesture.current;

		if (!g) {
			if (tool === "select") {
				const id = (e.target as Element).closest("[data-frame-id]")?.getAttribute("data-frame-id") ?? null;
				setHoverId(id);
			} else if (hoverId) {
				setHoverId(null);
			}
			return;
		}

		switch (g.kind) {
			case "pan": {
				// Delta must be computed NOW: the functional updater runs after this handler,
				// by which time g.last has been mutated and the delta would always be zero.
				const dx = p.x - g.last.x;
				const dy = p.y - g.last.y;
				g.last = p;
				setCamera((c) => (c ? { ...c, x: c.x + dx, y: c.y + dy } : c));
				break;
			}
			case "maybe-drag": {
				if (Math.hypot(p.x - g.start.x, p.y - g.start.y) < DRAG_THRESHOLD) break;
				const ids = new Set(selectionRef.current);
				ids.add(g.frameId);
				const origins = new Map<string, Point>();
				for (const f of framesRef.current) if (ids.has(f.id)) origins.set(f.id, { x: f.x, y: f.y });
				gesture.current = { kind: "drag", start: g.start, origins };
				setHoverId(null);
				break;
			}
			case "drag": {
				const proposed = { x: (p.x - g.start.x) / cam.k, y: (p.y - g.start.y) / cam.k };
				const movingFrames = framesRef.current.filter((f) => g.origins.has(f.id));
				const origined = movingFrames.map((f) => {
					const o = g.origins.get(f.id);
					return o ? { ...f, x: o.x, y: o.y } : f;
				});
				const statics = framesRef.current.filter((f) => !g.origins.has(f.id));
				const { delta, guides: gl } = snapDelta(proposed, boundsOf(origined), statics, cam.k);
				setFrames((fs) =>
					fs.map((f) => {
						const o = g.origins.get(f.id);
						return o ? { ...f, x: o.x + delta.x, y: o.y + delta.y } : f;
					}),
				);
				setGuides(gl);
				break;
			}
			case "marquee": {
				const w = toWorld(p, cam);
				const rect: Bounds = {
					x: Math.min(g.startWorld.x, w.x),
					y: Math.min(g.startWorld.y, w.y),
					w: Math.abs(w.x - g.startWorld.x),
					h: Math.abs(w.y - g.startWorld.y),
				};
				setMarquee(rect);
				const hits = framesRef.current.filter((f) => intersects(rect, f)).map((f) => f.id);
				setSelection(g.additive ? new Set([...g.base, ...hits]) : new Set(hits));
				break;
			}
			case "resize": {
				const w = toWorld(p, cam);
				const o = g.origin;
				setFrames((fs) =>
					fs.map((f) => {
						if (f.id !== g.frameId) return f;
						let { x, y, w: fw, h: fh } = o;
						if (g.corner.includes("e")) fw = Math.max(MIN_W, w.x - o.x);
						if (g.corner.includes("s")) fh = Math.max(MIN_H, w.y - o.y);
						if (g.corner.includes("w")) {
							fw = Math.max(MIN_W, o.x + o.w - w.x);
							x = o.x + o.w - fw;
						}
						if (g.corner.includes("n")) {
							fh = Math.max(MIN_H, o.y + o.h - w.y);
							y = o.y + o.h - fh;
						}
						return { ...f, x, y, w: fw, h: fh };
					}),
				);
				break;
			}
			case "arrow": {
				const w = toWorld(p, cam);
				const overId = frameAtWorld(w);
				setArrowDraft({ fromId: g.fromId, toWorld: w, overId: overId === g.fromId ? null : overId });
				break;
			}
		}
	};

	const onPointerUp = (e: React.PointerEvent) => {
		const g = gesture.current;
		gesture.current = null;
		setPanning(false);
		setGuides([]);
		setMarquee(null);
		if (!g) return;

		if (g.kind === "maybe-drag") {
			// Click without drag: narrow or shift-toggle.
			if (g.wasSelected) {
				setSelection((s) => {
					if (g.additive) {
						const next = new Set(s);
						next.delete(g.frameId);
						return next;
					}
					return new Set([g.frameId]);
				});
			}
		}

		if (g.kind === "arrow") {
			const cam = cameraRef.current;
			const overId = cam ? frameAtWorld(toWorld(localPoint(e), cam)) : null;
			if (overId && overId !== g.fromId) {
				setArrows((as) => [...as, { id: `a-${g.fromId}-${overId}-${as.length}`, from: g.fromId, to: overId }]);
			}
			setArrowDraft(null);
			setTool("select");
		}
	};

	// --- render ---------------------------------------------------------------

	if (!camera) return <div ref={viewportRef} className="h-full w-full bg-[#f5f5f5]" />;

	const k = camera.k;
	const selectedFrames = frames.filter((f) => selection.has(f.id));
	const cursor = panning ? "grabbing" : spaceDown || tool === "hand" ? "grab" : tool === "arrow" ? "crosshair" : "default";

	const screenRect = (b: Bounds): Bounds => ({
		x: b.x * k + camera.x,
		y: b.y * k + camera.y,
		w: b.w * k,
		h: b.h * k,
	});

	return (
		<div
			ref={viewportRef}
			className="relative h-full w-full touch-none overflow-hidden bg-[#f5f5f5] select-none"
			style={{ cursor }}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
		>
			{/* world layer — one transform, everything inside is world-space */}
			<div
				data-world
				className="absolute top-0 left-0"
				style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${k})`, transformOrigin: "0 0" }}
			>
				<svg className="absolute top-0 left-0 overflow-visible" width="1" height="1" role="presentation">
					{arrows.map((a) => {
						const from = frames.find((f) => f.id === a.from);
						const to = frames.find((f) => f.id === a.to);
						if (!from || !to) return null;
						const geo = arrowGeometry(from, to);
						const d = `M ${geo.from.x} ${geo.from.y} C ${geo.c1.x} ${geo.c1.y}, ${geo.c2.x} ${geo.c2.y}, ${geo.to.x} ${geo.to.y}`;
						const selected = selection.has(a.id);
						return (
							<g key={a.id}>
								<path d={d} data-arrow-id={a.id} stroke="transparent" strokeWidth={14 / k} fill="none" style={{ pointerEvents: "stroke", cursor: "pointer" }} />
								<path d={d} stroke="#0d99ff" strokeWidth={(selected ? 3 : 2) / k} fill="none" opacity={selected ? 1 : 0.85} style={{ pointerEvents: "none" }} />
								<path d={arrowHead(geo.to, geo.dir, k)} fill="#0d99ff" opacity={selected ? 1 : 0.85} style={{ pointerEvents: "none" }} />
							</g>
						);
					})}
					{arrowDraft &&
						(() => {
							const from = frames.find((f) => f.id === arrowDraft.fromId);
							if (!from) return null;
							const target = arrowDraft.overId ? frames.find((f) => f.id === arrowDraft.overId) : undefined;
							const phantom: Bounds = target ?? { x: arrowDraft.toWorld.x, y: arrowDraft.toWorld.y, w: 0, h: 0 };
							const geo = arrowGeometry(from, phantom);
							const d = `M ${geo.from.x} ${geo.from.y} C ${geo.c1.x} ${geo.c1.y}, ${geo.c2.x} ${geo.c2.y}, ${geo.to.x} ${geo.to.y}`;
							return (
								<g style={{ pointerEvents: "none" }}>
									<path d={d} stroke="#0d99ff" strokeWidth={2 / k} strokeDasharray={`${6 / k} ${4 / k}`} fill="none" />
									<path d={arrowHead(geo.to, geo.dir, k)} fill="#0d99ff" />
								</g>
							);
						})()}
				</svg>

				{frames.map((f) => (
					<div
						key={f.id}
						data-frame-id={f.id}
						className="absolute"
						style={{ transform: `translate(${f.x}px, ${f.y}px)`, width: f.w, height: f.h }}
					>
						<div
							className="absolute bottom-full left-0 origin-bottom-left whitespace-nowrap"
							style={{ transform: `scale(${1 / k})` }}
						>
							<div
								className="cursor-default pb-1.5 text-[12px] font-medium"
								style={{ color: selection.has(f.id) ? "#0d99ff" : "#6f6e77" }}
							>
								{f.name}
							</div>
						</div>
						<div className="h-full w-full overflow-hidden bg-white" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.12)", borderRadius: 2 / k }}>
							<FrameContent screen={f.screen} />
						</div>
						{/* hit shield over the inert iframe */}
						<div className="absolute inset-0" />
					</div>
				))}
			</div>

			{/* screen overlay — constant-size selection UI, the Figma pattern */}
			<div className="pointer-events-none absolute inset-0">
				{hoverId && !selection.has(hoverId) && !marquee && (
					(() => {
						const f = frames.find((fr) => fr.id === hoverId);
						if (!f) return null;
						const r = screenRect(f);
						return <div className="absolute border-2 border-[#0d99ff]" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />;
					})()
				)}

				{selectedFrames.map((f) => {
					const r = screenRect(f);
					return <div key={f.id} className="absolute border-[1.5px] border-[#0d99ff]" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />;
				})}

				{selectedFrames.length === 1 &&
					selectedFrames[0] &&
					(() => {
						const f = selectedFrames[0];
						const r = screenRect(f);
						const corners: { c: Corner; x: number; y: number; cursor: string }[] = [
							{ c: "nw", x: r.x, y: r.y, cursor: "nwse-resize" },
							{ c: "ne", x: r.x + r.w, y: r.y, cursor: "nesw-resize" },
							{ c: "sw", x: r.x, y: r.y + r.h, cursor: "nesw-resize" },
							{ c: "se", x: r.x + r.w, y: r.y + r.h, cursor: "nwse-resize" },
						];
						return (
							<>
								{corners.map((h) => (
									<div
										key={h.c}
										data-handle={h.c}
										className="pointer-events-auto absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-[#0d99ff] bg-white"
										style={{ left: h.x, top: h.y, cursor: h.cursor }}
									/>
								))}
								<div
									className="absolute -translate-x-1/2 rounded-sm bg-[#0d99ff] px-1.5 py-0.5 text-[10.5px] font-medium text-white tabular-nums"
									style={{ left: r.x + r.w / 2, top: r.y + r.h + 8 }}
								>
									{Math.round(f.w)} × {Math.round(f.h)}
								</div>
							</>
						);
					})()}

				{marquee &&
					(() => {
						const r = screenRect(marquee);
						return <div className="absolute border border-[#0d99ff] bg-[#0d99ff]/10" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />;
					})()}

				{guides.map((g, i) => {
					const key = `${g.axis}${g.at}-${i}`;
					return g.axis === "x" ? (
						<div
							key={key}
							className="absolute w-px bg-[#f24822]"
							style={{ left: g.at * k + camera.x, top: g.from * k + camera.y, height: (g.to - g.from) * k }}
						/>
					) : (
						<div
							key={key}
							className="absolute h-px bg-[#f24822]"
							style={{ top: g.at * k + camera.y, left: g.from * k + camera.x, width: (g.to - g.from) * k }}
						/>
					);
				})}

				{arrowDraft?.overId &&
					(() => {
						const f = frames.find((fr) => fr.id === arrowDraft.overId);
						if (!f) return null;
						const r = screenRect(f);
						return <div className="absolute border-2 border-[#0d99ff]" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />;
					})()}
			</div>

			<CanvasChrome
				tool={tool}
				onTool={setTool}
				zoomPct={Math.round(k * 100)}
				onZoomIn={() => {
					const c = viewportCenter();
					zoomAt(c.x, c.y, 1.25, true);
				}}
				onZoomOut={() => {
					const c = viewportCenter();
					zoomAt(c.x, c.y, 0.8, true);
				}}
				onZoomFit={zoomFit}
			/>
		</div>
	);
}
