import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
	type CompareMoment,
	type CompareRead,
	fetchCompare,
	frameDocumentUrl,
	type HistoryScope,
	type HistoryStretch,
	type HistoryStretchFile,
} from "../api";
import { cn } from "../cn";
import { Button } from "../primitives/actions";
import { TextAction } from "../primitives/feedback";
import { shellRadius } from "./camera";
import type { CameraStore } from "./camera-store";
import { useCameraFollow } from "./camera-store";
import { type Box, compareLayout, framesTouched, setAsideFrame } from "./history-compare-model";
import { momentSays } from "./history-restore-model";

/**
 * Compare with now on the canvas (spool#189), as #105's prototype moves it. Under an open stretch, Compare with now
 * stands each frame it touched as it was at the stretch's end beside today's: today's slides aside (slow, snap) and
 * the old one fades up where it stood, labelled with its moment, today's with "now", and the other frames step out
 * under the canvas's own ground. A frame deleted since comes back dashed in its old place; one that didn't exist
 * then says so. A set-aside save compares from under it, at its own version with its own file. Done, Esc or
 * Stop comparing puts the canvas back. Hovering a stretch outlines the frames it touched in its person's colour.
 * Every movement is on the house durations, which reduced motion sets to nothing.
 */

/** What is being compared: a moment, when it was, and the frames it stands. */
export interface Comparing {
	key: string;
	moment: CompareMoment;
	end: number;
	frames: string[];
}

/** A frame on the canvas now, as the canvas has it. */
export interface CanvasFrame extends Box {
	name: string;
}

const keyOf = (moment: CompareMoment, frames: readonly string[]) =>
	`${moment.at}\n${moment.saved?.path ?? ""}\n${frames.join("\n")}`;

/** How long the canvas takes to go back, so the old frames leave before they unmount: the slow duration. */
const LEAVE_MS = 260;

export function useComparing(scope: HistoryScope) {
	const [comparing, setComparing] = useState<Comparing | null>(null);
	const [hovered, setHovered] = useState<{ frames: string[]; color: string } | null>(null);
	const toggle = useCallback((next: Omit<Comparing, "key">) => {
		const key = keyOf(next.moment, next.frames);
		setComparing((was) => (was?.key === key ? null : { ...next, key }));
	}, []);
	const close = useCallback(() => setComparing(null), []);

	const action = (stretch: HistoryStretch, inScope: HistoryScope): ReactNode => {
		if (stretch.restore !== null && stretch.restore !== undefined) return null;
		const frames = framesTouched(stretch, inScope);
		if (frames.length === 0) return null;
		const moment = { at: stretch.to };
		const on = comparing?.key === keyOf(moment, frames);
		return (
			<Button
				size="sm"
				aria-pressed={on}
				data-history-compare=""
				onClick={() => toggle({ moment, end: stretch.end, frames })}
			>
				{on ? "Stop comparing" : "Compare with now"}
			</Button>
		);
	};

	/** Under a set-aside save: compare at its own version, with its own file in place. */
	const setAside = (
		file: HistoryStretchFile,
		save: HistoryStretchFile["setAside"][number],
		_stretch: HistoryStretch,
	): ReactNode => {
		const frame = setAsideFrame(file.path, scope);
		if (frame === null) return null;
		return (
			<TextAction
				data-history-set-aside-compare=""
				onClick={() =>
					toggle({
						moment: { at: save.version, saved: { path: file.path, hash: save.hash } },
						end: save.at,
						frames: [frame],
					})
				}
			>
				Compare
			</TextAction>
		);
	};

	const hover = useCallback((stretch: HistoryStretch | null, inScope: HistoryScope) => {
		setHovered(stretch === null ? null : { frames: framesTouched(stretch, inScope), color: stretch.by.color });
	}, []);

	return { comparing, close, action, setAside, hover, hovered };
}

/** The camera's world, followed: what the compare and the outlines stand in. */
function World({ camera, children }: { camera: CameraStore; children: ReactNode }) {
	const field = useRef<HTMLDivElement | null>(null);
	useCameraFollow(
		camera,
		({ x, y, k }) => {
			if (field.current === null) return;
			field.current.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
			field.current.style.setProperty("--compare-k", String(k));
			// a frame's corner, as its shell rounds it at this zoom
			field.current.style.setProperty("--compare-radius", `${shellRadius(k)}px`);
		},
		[],
	);
	return (
		<div ref={field} className="pointer-events-none absolute top-0 left-0" style={{ transformOrigin: "0 0" }}>
			{children}
		</div>
	);
}

/** The frames a stretch under the pointer touched, outlined in its person's colour. */
export function TouchedLayer({
	hovered,
	frames,
	camera,
}: {
	hovered: { frames: string[]; color: string } | null;
	frames: readonly CanvasFrame[];
	camera: CameraStore;
}) {
	return (
		<World camera={camera}>
			{frames.map((frame) => {
				const lit = hovered?.frames.includes(frame.name);
				return (
					<span
						key={frame.name}
						aria-hidden="true"
						{...(lit ? { "data-history-touched-frame": frame.name } : {})}
						className={cn(
							"absolute transition-opacity duration-fast ease-out motion-reduce:transition-none",
							lit ? "opacity-100" : "opacity-0",
						)}
						style={{
							left: frame.x,
							top: frame.y,
							width: frame.w,
							height: frame.h,
							borderRadius: "var(--compare-radius)",
							boxShadow: `0 0 0 calc(2px / var(--compare-k, 1)) ${lit ? hovered.color : "transparent"}`,
						}}
					/>
				);
			})}
		</World>
	);
}

/**
 * The compare on the canvas: the ground over the other frames, each old frame where it stood, today's slid aside,
 * and the bar that says what is compared and puts the canvas back. It stays a moment after closing to slide back.
 */
export function CompareLayer({
	project,
	comparing,
	frames,
	page,
	camera,
	onClose,
}: {
	project: string;
	comparing: Comparing | null;
	frames: readonly CanvasFrame[];
	/** the page shown: a frame deleted since comes back only on its own page */
	page: string;
	camera: CameraStore;
	onClose: () => void;
}) {
	const [held, setHeld] = useState<Comparing | null>(comparing);
	const [reads, setReads] = useState<Map<string, CompareRead>>(new Map());
	const [shown, setShown] = useState(false);
	useEffect(() => {
		if (comparing !== null) {
			setHeld(comparing);
			return;
		}
		setShown(false);
		const gone = setTimeout(() => setHeld(null), LEAVE_MS);
		return () => clearTimeout(gone);
	}, [comparing]);
	// each frame as it stood, read once per compare
	useEffect(() => {
		if (comparing === null) return;
		let live = true;
		setReads(new Map());
		setShown(false);
		for (const frame of comparing.frames)
			void fetchCompare(project, frame, comparing.moment).then((read) => {
				if (live) setReads((was) => new Map(was).set(frame, read));
			});
		return () => {
			live = false;
		};
	}, [project, comparing]);
	// once every read is in, the canvas moves: a frame later, so the move starts from where things stand
	const ready = held?.frames.every((frame) => reads.has(frame));
	useEffect(() => {
		if (!ready || comparing === null) return;
		let second = 0;
		const first = requestAnimationFrame(() => {
			second = requestAnimationFrame(() => setShown(true));
		});
		return () => {
			cancelAnimationFrame(first);
			cancelAnimationFrame(second);
		};
	}, [ready, comparing]);
	useEffect(() => {
		if (comparing === null) return;
		const key = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			onClose();
		};
		window.addEventListener("keydown", key, true);
		return () => window.removeEventListener("keydown", key, true);
	}, [comparing, onClose]);
	if (held === null) return null;

	const standing = held.frames.flatMap((name) => {
		const now = frames.find((frame) => frame.name === name) ?? null;
		const read = reads.get(name);
		const place = read?.state === "ready" ? read.place : null;
		// a frame deleted since comes back on its own page only
		if (now === null && pageOf(name) !== page) return [];
		return [{ name, now, was: place }];
	});
	const layout = compareLayout(standing);
	const moment = momentSays(held.end);
	return (
		<div className="pointer-events-none absolute inset-0 overflow-hidden" data-compare="" data-compare-shown={shown}>
			{/* the other frames step out under the canvas's own ground */}
			<div
				className={cn(
					"absolute inset-0 bg-surface-canvas transition-opacity duration-base ease-out motion-reduce:transition-none",
					shown ? "opacity-100" : "opacity-0",
				)}
			/>
			<World camera={camera}>
				{layout.old.map(({ name, box, deleted }) => {
					const read = reads.get(name);
					return (
						<div
							key={`then:${name}`}
							data-compare-then={name}
							className={cn(
								"absolute transition-[opacity,transform] duration-base ease-out motion-reduce:transition-none",
								shown ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0",
							)}
							style={{
								left: box.x,
								top: box.y,
								width: box.w,
								height: box.h,
								transitionDelay: shown ? "calc(var(--transition-duration-base) / 2)" : undefined,
							}}
						>
							<Label name={name}>
								<Chip tone="accent">{moment}</Chip>
								{deleted ? <Chip>deleted since</Chip> : null}
							</Label>
							<div
								className={cn(
									"relative h-full w-full overflow-hidden bg-surface-panel",
									deleted && "opacity-50 outline-1 outline-line-strong outline-dashed outline-offset-2",
								)}
								style={{ borderRadius: "var(--compare-radius)" }}
								{...(deleted ? { "data-compare-deleted": "" } : {})}
							>
								{read === undefined ? null : read.state === "ready" ? (
									<iframe
										title={`${name} at ${moment}`}
										aria-hidden="true"
										tabIndex={-1}
										sandbox="allow-scripts"
										src={read.url}
										className="block h-full w-full border-0 bg-white"
										style={{ pointerEvents: "none" }}
									/>
								) : (
									<div
										className="flex h-full w-full items-center justify-center p-6 text-center text-secondary type-label"
										{...(read.state === "absent" ? { "data-compare-absent": "" } : {})}
									>
										{read.state === "absent" ? `${name} didn't exist at ${moment}.` : read.message}
									</div>
								)}
							</div>
						</div>
					);
				})}
				{layout.now.map(({ name, from, to }) => (
					<div
						key={`now:${name}`}
						data-compare-now={name}
						className="absolute transition-transform duration-slow ease-snap motion-reduce:transition-none"
						style={{
							left: from.x,
							top: from.y,
							width: from.w,
							height: from.h,
							transform: shown ? `translate(${to.x - from.x}px, ${to.y - from.y}px)` : "none",
						}}
					>
						<Label name={name}>
							<Chip>now</Chip>
						</Label>
						<div
							className="h-full w-full overflow-hidden bg-surface-panel"
							style={{ borderRadius: "var(--compare-radius)" }}
						>
							<iframe
								title={`${name} now`}
								aria-hidden="true"
								tabIndex={-1}
								sandbox="allow-scripts"
								src={frameDocumentUrl(project, name, 0)}
								className="block h-full w-full border-0 bg-white"
								style={{ pointerEvents: "none" }}
							/>
						</div>
					</div>
				))}
			</World>
			<div
				className={cn(
					"pointer-events-auto absolute top-4 left-4 flex h-9 items-center gap-3 rounded-md border border-line-strong bg-surface-raised pr-1.5 pl-3 shadow-float transition-[opacity,transform] duration-base ease-out motion-reduce:transition-none",
					comparing !== null ? "translate-y-0 opacity-100" : "-translate-y-1.5 opacity-0",
				)}
				data-compare-bar=""
				// the bar is chrome: a press on it is never the canvas's to pan or select with
				onPointerDown={(event) => event.stopPropagation()}
				onPointerUp={(event) => event.stopPropagation()}
			>
				<span className="text-primary type-control">Comparing with now</span>
				<span className="text-secondary type-detail">
					{ready
						? `${moment} · ${held.frames.length === 1 ? held.frames[0] : `${held.frames.length} frames`}`
						: "Reading the team's history…"}
				</span>
				<TextAction onClick={onClose}>Done</TextAction>
			</div>
		</div>
	);
}

/** The page a frame stands on: its name's parent, "" for the root page. */
const pageOf = (frame: string) => (frame.includes("/") ? frame.slice(0, frame.lastIndexOf("/")) : "");

/** A compared frame's name row, above it: its name and what moment it is. */
function Label({ name, children }: { name: string; children: ReactNode }) {
	return (
		<div
			className="absolute bottom-full left-0 flex origin-bottom-left items-center gap-1.5 pb-1.5 type-value"
			style={{ transform: "scale(calc(1 / var(--compare-k, 1)))" }}
			data-compare-label=""
		>
			<span className="min-w-0 truncate text-secondary">{name.slice(name.lastIndexOf("/") + 1)}</span>
			{children}
		</div>
	);
}

/** A machine-printed mark on a compared frame's name row: its moment in the accent, "now" and "deleted since" plain. */
function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "accent" }) {
	return (
		<span
			className={cn(
				"shrink-0 whitespace-nowrap rounded-xs border px-1.5 type-detail",
				tone === "accent"
					? "border-accent text-accent-strong"
					: "border-line-strong bg-surface-raised text-primary",
			)}
			data-compare-chip=""
		>
			{children}
		</span>
	);
}
