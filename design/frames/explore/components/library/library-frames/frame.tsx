import { animate, type MotionStyle, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { TOKEN_COUNT, TVARSO_PARTS } from "shared/ui/demo/tvarso-library";
import { FrameBody, LAID, PAGES, Rail, Tint } from "shared/ui/explore/components/library-frames";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * The library is a page, and every component on it is a frame
 * ([spool-cloud#31](https://github.com/liamvinberg/spool-cloud/issues/31)).
 *
 * spool already projects `frames/` onto a canvas: a folder becomes a page, a
 * file becomes a frame with a label over it, a ring when you hold it, and a rail
 * that says what it is. This take projects `shared/ui/` the same way and adds
 * nothing. `library` is a page in the rail, wearing the face a projected page
 * wears instead of a folder. `Button` is a frame on it. Hold it and the same ring
 * and the same rail come up; the rail's one new line is the list of frames that
 * render it, which is the reach mark turned into an index. `tokens.css` is a
 * frame too, the first one, because everything under it reads it.
 *
 * **The arrangement is spool's, the way the rail's order is.** Frames stand in
 * file order and flow left to right, a file with several members kept together
 * on one tint. Nobody drags a component around, because a library's arrangement
 * carries no information a person would want to keep, and every position that
 * has to be kept is a store spool has to own. What is kept is the camera: pan,
 * zoom, fly back with `0`.
 *
 * **A specimen is the first real usage, cropped.** The frame draws `Button` as
 * `timetable` draws it, with `timetable`'s props, so there is no demo file to
 * write and nothing that can drift. `Stepper` is defined and rendered nowhere,
 * so its frame is empty and says so.
 *
 * Counts are per component and drawn at rest. This is the one page where the
 * number is the point rather than a warning: the library is where you come to
 * ask how far a thing reaches.
 */

/* ---------- the camera, which is spool's ---------- */

const MIN_K = 0.25;
const MAX_K = 3;
const START_K = 0.66;
const FLIGHT_MS = 220;
const EASE = [0.33, 1, 0.68, 1] as const;
const STEP = 1.25;

export default function LibraryFramesFrame() {
	const [held, setHeld] = useState<string | null>("Button");
	const [over, setOver] = useState<string | null>(null);
	const [k, setK] = useState(START_K);
	const still = useReducedMotion() === true;

	const viewport = useRef<HTMLDivElement>(null);
	const camX = useMotionValue(0);
	const camY = useMotionValue(0);
	const camK = useMotionValue(START_K);
	const camIK = useTransform(camK, (value: number) => 1 / value);

	useEffect(() => camK.on("change", (value: number) => setK(value)), [camK]);

	const zoomAt = useCallback(
		(px: number, py: number, next: number) => {
			const to = Math.min(MAX_K, Math.max(MIN_K, next));
			const wx = (px - camX.get()) / camK.get();
			const wy = (py - camY.get()) / camK.get();
			camK.set(to);
			camX.set(px - wx * to);
			camY.set(py - wy * to);
		},
		[camX, camY, camK],
	);

	useEffect(() => {
		const el = viewport.current;
		if (el === null) return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			const box = el.getBoundingClientRect();
			if (event.ctrlKey || event.metaKey) {
				zoomAt(event.clientX - box.left, event.clientY - box.top, camK.get() * Math.exp(-event.deltaY * 0.0025));
				return;
			}
			camX.set(camX.get() - event.deltaX);
			camY.set(camY.get() - event.deltaY);
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [camX, camY, camK, zoomAt]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const el = viewport.current;
			if (el === null) return;
			if (event.key === "Escape") {
				setHeld(null);
				return;
			}
			const cx = el.clientWidth / 2;
			const cy = el.clientHeight / 2;
			const options = { duration: still ? 0 : FLIGHT_MS / 1000, ease: EASE };
			const fly = (to: number) => {
				const at = camK.get();
				const wx = (cx - camX.get()) / at;
				const wy = (cy - camY.get()) / at;
				animate(camX, cx - wx * to, options);
				animate(camY, cy - wy * to, options);
				animate(camK, to, options);
			};
			if (event.key === "+" || event.key === "=") fly(Math.min(MAX_K, camK.get() * STEP));
			else if (event.key === "-" || event.key === "_") fly(Math.max(MIN_K, camK.get() / STEP));
			else if (event.key === "0") {
				animate(camX, 0, options);
				animate(camY, 0, options);
				animate(camK, START_K, options);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [camX, camY, camK, still]);

	/* the ground pans; a press that never moved is a click, and a click on the ground lets go */
	const pan = useRef<{ id: number; px: number; py: number; x: number; y: number; moved: boolean } | null>(null);
	const [panning, setPanning] = useState(false);

	const onGroundDown = (event: React.PointerEvent) => {
		event.currentTarget.setPointerCapture(event.pointerId);
		pan.current = { id: event.pointerId, px: event.clientX, py: event.clientY, x: camX.get(), y: camY.get(), moved: false };
		setPanning(true);
	};
	const onMove = (event: React.PointerEvent) => {
		const panned = pan.current;
		if (panned === null || panned.id !== event.pointerId) return;
		const dx = event.clientX - panned.px;
		const dy = event.clientY - panned.py;
		if (Math.hypot(dx, dy) > 3) panned.moved = true;
		camX.set(panned.x + dx);
		camY.set(panned.y + dy);
	};
	const onUp = (event: React.PointerEvent) => {
		const panned = pan.current;
		if (panned === null || panned.id !== event.pointerId) return;
		if (!panned.moved) setHeld(null);
		pan.current = null;
		setPanning(false);
	};

	const worldStyle = {
		x: camX,
		y: camY,
		scale: camK,
		transformOrigin: "0 0",
		"--ik": camIK,
	} as unknown as MotionStyle;

	const heldFrame = LAID.frames.find((frame) => frame.id === held) ?? null;

	return (
		<SpoolShell activeTab="tvarso" tabs={["tvarso"]} zoom={`${Math.round(k * 100)}%`}>
			<CanvasChrome pages={PAGES} selected={held ?? undefined} tool="select" rail={<Rail frame={heldFrame} />}>
				<div
					ref={viewport}
					className={cn("relative h-full w-full touch-none overflow-clip", panning ? "cursor-grabbing" : "cursor-default")}
					onPointerDown={onGroundDown}
					onPointerMove={onMove}
					onPointerUp={onUp}
					onPointerCancel={onUp}
				>
					<motion.div data-world="" className="absolute top-0 left-0 h-0 w-0" style={worldStyle}>
						{LAID.families.map((family) => (
							<Tint key={family.file} family={family} />
						))}
						{LAID.frames.map((frame) => (
							<FrameBody
								key={frame.id}
								frame={frame}
								k={k}
								held={held === frame.id}
								over={over === frame.id}
								onDown={(event) => {
									event.stopPropagation();
									setHeld(frame.id);
								}}
								onOver={() => setOver(frame.id)}
								onOut={() => setOver((current) => (current === frame.id ? null : current))}
							/>
						))}
					</motion.div>

					<span className="pointer-events-none absolute top-6 left-8 flex items-baseline gap-2 font-mono text-base text-text/70 leading-base">
						src/ui
						<span className="text-2xs text-muted/40 leading-3">
							{TVARSO_PARTS} components · {TOKEN_COUNT} tokens
						</span>
					</span>
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

