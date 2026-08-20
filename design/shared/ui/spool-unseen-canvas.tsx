import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	ATTENTION_MS,
	boxOf,
	type Cam,
	centreOn,
	countOf,
	DOCS_FRAMES,
	DWELL_MS,
	FIELD,
	K_MAX,
	K_MIN,
	MARKS,
	type Mark,
	type Plate,
	readable,
	SITE_FRAMES,
	SITE_MARKS,
	START,
	unseenOrder,
	type View,
} from "../lib/unseen-model";
import { cn } from "../lib/utils";
import { CanvasChrome, type PageRow } from "./spool-canvas-chrome";
import { SpoolShell } from "./spool-shell";
import { UnseenMark, UnseenWord } from "./spool-unseen-mark";

/**
 * The canvas, live, with one thing added: it remembers what you have looked at.
 *
 * Twelve frames on the `app` page of a product, six of them the work of an agent
 * that ran while you were away. Drag to pan, scroll to zoom, click to select — the
 * field is real, because the argument here cannot be made in a still. Whether a
 * mark should clear by being looked at is a question about a gesture, and the only
 * honest way to ask it is to hand over the gesture.
 *
 * Three things vary between the takes and nothing else does:
 *
 * `mark` is what the field itself says. `dot` puts the unread disc in the frame's
 * own label, where the name already lives and where the label's counter-scale
 * (`src/ui/canvas/frame-label.tsx:34`) keeps it the same size at every zoom. `word`
 * spends the label's other end on a word instead, which is the only treatment that
 * tells new from edited without teaching a shape. `none` leaves the field alone
 * entirely and argues that a canvas is a picture of your product, not a mailbox.
 *
 * `clear` is what makes a mark go away. `view` clears a frame that has been
 * readable — 60% on screen, at least 150px wide — for 900ms of your attention.
 * `press` clears nothing until you click the frame.
 *
 * `stepper` is the pill over the tool bar that walks you to the next unseen frame.
 * It rides the `none` take because that take has nowhere else to put the count, but
 * it is severable from all of this: a canvas is bigger than its viewport, and a
 * mark you cannot see is not a notification.
 *
 * The dwell clock only runs while the canvas has your attention, which here means
 * a pointer event in the last eight seconds and in the real thing would also mean a
 * focused window. Frames in view of an empty chair are not being seen, and a rule
 * that forgot that would clear the whole field overnight.
 */

export type FieldMark = "dot" | "word" | "none";
export type ClearRule = "view" | "press";

export function UnseenCanvas({
	mark,
	clear,
	stepper = false,
}: {
	mark: FieldMark;
	clear: ClearRule;
	stepper?: boolean | undefined;
}) {
	const [marks, setMarks] = useState<Record<string, Mark>>({ ...MARKS });
	const [cam, setCam] = useState<Cam>(START);
	const [selected, setSelected] = useState<string | null>(null);
	const [view, setView] = useState<View>({ w: 892, h: 812 });
	const [step, setStep] = useState(0);

	const fieldRef = useRef<HTMLDivElement>(null);
	const camRef = useRef(cam);
	const viewRef = useRef(view);
	const marksRef = useRef(marks);
	const attention = useRef(0);
	const dwell = useRef(new Map<string, number>());
	const tween = useRef<number | null>(null);
	camRef.current = cam;
	viewRef.current = view;
	marksRef.current = marks;

	const touched = useCallback(() => {
		attention.current = performance.now();
	}, []);

	const seen = useCallback((name: string) => {
		setMarks((prior) => {
			if (prior[name] === undefined) return prior;
			const next = { ...prior };
			delete next[name];
			return next;
		});
	}, []);

	useEffect(() => {
		const node = fieldRef.current;
		if (node === null) return;
		const observer = new ResizeObserver(() => {
			setView({ w: node.clientWidth, h: node.clientHeight });
		});
		observer.observe(node);
		setView({ w: node.clientWidth, h: node.clientHeight });
		return () => observer.disconnect();
	}, []);

	// the dwell clock: one tick, every unseen plate, on screen and large enough
	useEffect(() => {
		if (clear !== "view") return;
		const TICK = 120;
		const timer = window.setInterval(() => {
			if (performance.now() - attention.current > ATTENTION_MS) {
				dwell.current.clear();
				return;
			}
			const done: string[] = [];
			for (const plate of FIELD) {
				if (marksRef.current[plate.name] === undefined) continue;
				if (!readable(plate, camRef.current, viewRef.current)) {
					dwell.current.delete(plate.name);
					continue;
				}
				const held = (dwell.current.get(plate.name) ?? 0) + TICK;
				dwell.current.set(plate.name, held);
				if (held >= DWELL_MS) done.push(plate.name);
			}
			for (const name of done) {
				dwell.current.delete(name);
				seen(name);
			}
		}, TICK);
		return () => window.clearInterval(timer);
	}, [clear, seen]);

	// wheel has to be non-passive to zoom without the page trying to scroll too
	useEffect(() => {
		const node = fieldRef.current;
		if (node === null) return;
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			touched();
			const rect = node.getBoundingClientRect();
			const at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
			const factor = Math.exp(-event.deltaY * 0.0016);
			setCam((prior) => {
				const k = Math.min(K_MAX, Math.max(K_MIN, prior.k * factor));
				const scale = k / prior.k;
				return { k, x: at.x - (at.x - prior.x) * scale, y: at.y - (at.y - prior.y) * scale };
			});
		};
		node.addEventListener("wheel", onWheel, { passive: false });
		return () => node.removeEventListener("wheel", onWheel);
	}, [touched]);

	const flyTo = useCallback((target: Cam) => {
		if (tween.current !== null) cancelAnimationFrame(tween.current);
		const from = camRef.current;
		const start = performance.now();
		const DURATION = 420;
		const frame = (now: number) => {
			const t = Math.min(1, (now - start) / DURATION);
			const e = 1 - (1 - t) ** 3;
			setCam({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, k: from.k + (target.k - from.k) * e });
			attention.current = now;
			if (t < 1) tween.current = requestAnimationFrame(frame);
			else tween.current = null;
		};
		tween.current = requestAnimationFrame(frame);
	}, []);

	const pan = (event: React.PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		touched();
		const node = event.currentTarget;
		node.setPointerCapture(event.pointerId);
		const from = { x: event.clientX, y: event.clientY };
		const base = camRef.current;
		let moved = false;
		const move = (at: PointerEvent) => {
			const dx = at.clientX - from.x;
			const dy = at.clientY - from.y;
			if (!moved && Math.hypot(dx, dy) < 3) return;
			moved = true;
			attention.current = performance.now();
			setCam({ ...base, x: base.x + dx, y: base.y + dy });
		};
		const up = () => {
			node.releasePointerCapture(event.pointerId);
			node.removeEventListener("pointermove", move);
			node.removeEventListener("pointerup", up);
			if (!moved) setSelected(null);
		};
		node.addEventListener("pointermove", move);
		node.addEventListener("pointerup", up);
	};

	const pick = (plate: Plate) => {
		touched();
		setSelected(plate.name);
		// pressing a frame is the one gesture both rules agree on: you went to it
		seen(plate.name);
	};

	const unseen = unseenOrder(marks);
	const tally = countOf(marks);
	const onSeen =
		clear === "press"
			? () => {
					setMarks({});
					touched();
				}
			: undefined;

	const pages: readonly PageRow[] = [
		{
			name: "app",
			frames: FIELD.map((plate) => plate.name).sort((a, b) => a.localeCompare(b)),
			active: true,
			open: true,
			unseen: marks,
			onSeen,
		},
		{ name: "site", frames: SITE_FRAMES, unseen: SITE_MARKS },
		{ name: "docs", frames: DOCS_FRAMES, unseen: {} },
	];

	return (
		<SpoolShell activeTab="atlas" tabs={["atlas", "spool"]} zoom={`${Math.round(cam.k * 100)}%`} arrowsOn={false}>
			<CanvasChrome pages={pages} selected={selected ?? undefined} tool="select">
				<div
					ref={fieldRef}
					onPointerDown={pan}
					onPointerMove={touched}
					className="absolute inset-0 cursor-default overflow-hidden"
				>
					{FIELD.map((plate) => (
						<FramePlate
							key={plate.name}
							plate={plate}
							cam={cam}
							mark={marks[plate.name] ?? null}
							treatment={mark}
							selected={selected === plate.name}
							onPick={() => pick(plate)}
						/>
					))}
					<span className="pointer-events-none absolute right-5 bottom-4 rounded-sm bg-bg/70 px-2 py-1 font-mono text-2xs text-muted/40 leading-3 backdrop-blur-[2px]">
						drag to pan · scroll to zoom
					</span>
					{stepper ? (
						<Stepper
							tally={tally}
							onNext={() => {
								if (unseen.length === 0) return;
								const next = unseen[step % unseen.length];
								if (next === undefined) return;
								setStep(step + 1);
								setSelected(null);
								flyTo(centreOn(next, camRef.current, viewRef.current));
							}}
						/>
					) : null}
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

/**
 * One frame on the field: the plate, and the label above it that spool draws in
 * screen units so a name is the same size at 12% as at 100%. The mark rides the
 * label rather than the plate for exactly that reason — anything painted on the
 * plate is a decoration on somebody's product, and it shrinks with the zoom until
 * the moment you most need it.
 */
function FramePlate({
	plate,
	cam,
	mark,
	treatment,
	selected,
	onPick,
}: {
	plate: Plate;
	cam: Cam;
	mark: Mark | null;
	treatment: FieldMark;
	selected: boolean;
	onPick: () => void;
}) {
	const box = boxOf(plate, cam);
	const lit = treatment !== "none" && mark !== null;
	return (
		<div className="absolute" style={{ left: box.left, top: box.top, width: box.w, height: box.h }}>
			<div className="absolute bottom-full left-0 flex w-full min-w-0 items-center gap-1.5 pb-1.5 font-mono text-sm leading-4">
				{treatment === "dot" ? <UnseenMark mark={mark} className="-ml-0.5" /> : null}
				<span
					className={cn(
						"min-w-0 truncate",
						selected ? "text-thread" : lit ? "text-text" : "text-muted",
					)}
				>
					{plate.name}
				</span>
				{treatment === "word" && mark !== null && !selected ? (
					<span className="ml-auto">
						<UnseenWord mark={mark} />
					</span>
				) : null}
				{selected ? (
					<span className="ml-auto flex shrink-0 items-center gap-1 font-mono text-2xs text-muted leading-3">
						<svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden="true">
							<path d="M2 1.2 8.4 5 2 8.8Z" />
						</svg>
						play
					</span>
				) : null}
			</div>
			<button
				type="button"
				onPointerDown={(event) => {
					event.stopPropagation();
					onPick();
				}}
				aria-label={plate.name}
				className="absolute inset-0 block cursor-default overflow-hidden rounded-[4px] border border-border bg-bg text-left"
			>
				<Wire seed={plate.seed} />
				{selected ? <Selection /> : null}
			</button>
		</div>
	);
}

function Selection() {
	return (
		<span className="pointer-events-none absolute inset-0 rounded-[4px] outline-[1.5px] -outline-offset-1 outline-thread" />
	);
}

/** a quiet product screen at plate size: enough structure to read as a frame */
function Wire({ seed }: { seed: number }) {
	const hero = 22 + (seed % 4) * 7;
	const cards = 2 + (seed % 2);
	const rows = 3 + (seed % 4);
	return (
		<div className="flex h-full w-full flex-col bg-canvas">
			<div className="flex shrink-0 items-center gap-[3%] border-border border-b px-[6%] py-[4%]">
				<span className="h-[10px] w-[10px] shrink-0 rounded-[2px] bg-raised" />
				<span className="h-[5px] w-[26%] rounded-full bg-raised" />
				<span className="ml-auto h-[5px] w-[14%] rounded-full bg-surface" />
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-[4%] px-[6%] pt-[5%]">
				<div className="relative w-full shrink-0 rounded-[3px] bg-surface" style={{ height: `${hero}%` }}>
					<span className="absolute bottom-[14%] left-[8%] h-[6px] w-[52%] rounded-full bg-raised" />
					<span className="absolute bottom-[6%] left-[8%] h-[5px] w-[34%] rounded-full bg-raised/70" />
				</div>
				<div className="grid shrink-0 gap-[4%]" style={{ gridTemplateColumns: `repeat(${cards}, minmax(0, 1fr))` }}>
					{Array.from({ length: cards }, (_, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a skeleton card has no identity
						<span key={index} className="h-[42px] rounded-[3px] border border-border bg-surface/70" />
					))}
				</div>
				<div className="flex flex-col gap-[3%]">
					{Array.from({ length: rows }, (_, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a skeleton line has no identity
						<span key={index} className="flex items-center gap-[4%]">
							<span className="h-[8px] w-[8px] shrink-0 rounded-full bg-surface" />
							<span className="h-[5px] rounded-full bg-raised" style={{ width: `${74 - index * 12}%` }} />
						</span>
					))}
				</div>
			</div>
			<div className="shrink-0 px-[6%] py-[5%]">
				<span className="block h-[22px] w-full rounded-[3px] bg-raised" />
			</div>
		</div>
	);
}

/**
 * The count, and a door to the next one. A mark is only useful if you can reach
 * what it marks, and on a field four screens wide most of what is unseen is
 * off screen — the rail says which page, this says where on it.
 */
function Stepper({
	tally,
	onNext,
}: {
	tally: { readonly fresh: number; readonly moved: number };
	onNext: () => void;
}) {
	const total = tally.fresh + tally.moved;
	return (
		<AnimatePresence>
			{total === 0 ? null : (
				<motion.div
					initial={{ opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: 6 }}
					transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
					className="absolute bottom-6 left-6 z-20 flex items-center gap-3 rounded-lg border border-border-raised bg-bg/90 py-1.5 pr-1.5 pl-3 backdrop-blur"
				>
					<span className="flex items-center gap-1.5 font-mono text-2xs text-muted leading-3">
						<UnseenMark mark="new" className="-ml-1" />
						<span className="text-text">{tally.fresh} new</span>
						{tally.moved === 0 ? null : <span>· {tally.moved} edited</span>}
					</span>
					<button
						type="button"
						onPointerDown={(event) => {
							event.stopPropagation();
							onNext();
						}}
						className="flex h-6 items-center gap-1.5 rounded-md bg-raised px-2 font-mono text-2xs text-text leading-3 transition-colors hover:bg-border-raised"
					>
						go
						<svg viewBox="0 0 10 8" className="h-2 w-2.5" fill="none" aria-hidden="true">
							<path d="M0.5 4h6" stroke="currentColor" strokeWidth="1.5" />
							<path d="m9.5 4-3-1.8v3.6Z" fill="currentColor" />
						</svg>
					</button>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
