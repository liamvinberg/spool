import { type CSSProperties, type HTMLAttributes, useRef } from "react";
import type { Camera, ProjectedFrame } from "../api";
import { WHOLE_SELECTION } from "./agent-chips";
import type { Box } from "./camera";
import { type CameraStore, useCameraFollow } from "./camera-store";
import { shellRadius } from "./frame-shell";
import type { ShownRefusal } from "./hand-edit";
import { frameSourcePath } from "./pages";
import { type PickedHit, parseStampRef, pickKey } from "./protocol";
import { lineBoxes } from "./ring";
import type { SnapMarks } from "./snap";

/**
 * Screen-space selection furniture (#23), drawn over the transformed field so
 * strokes stay hairline at any zoom. The system page's laws verbatim: hover
 * 1px neutral at 3px offset; ring 1.5px thread at 3px offset radius +2;
 * handles 8px on-thread fill with thread border; readout thread fill,
 * on-thread mono 10; element outline 1px thread at 2px offset, no handles.
 * The frame's knobs render on corners only — the sides carry invisible grab
 * bands, Figma's pattern for single-axis resize.
 *
 * Screen space means placed for a camera, and the camera moves without a
 * render (#81). So each piece of furniture is rendered for what it is and
 * placed by `Follow`, which writes its box straight to the element in the same
 * frame the field moves in: a ring never trails the frame it is round.
 */

export interface PickedSelection extends PickedHit {
	frame: string;
}

/** The would-be click target under the cursor (#37) — outlined, never selected. */
export interface ElementPreview {
	frame: string;
	selector: string;
	rect: { x: number; y: number; w: number; h: number };
	/** the line boxes an inline element is drawn as, when it is drawn as several (#321) */
	rects?: readonly { x: number; y: number; w: number; h: number }[];
	radius: number;
}

/**
 * How far past its element the ring's outline reaches, in screen pixels
 * (#324).
 *
 * The overlay is clipped to the frame, which is what keeps a ring on an
 * element laid out below the frame's height from landing out on the canvas.
 * Sized exactly to the frame it also cut the ring itself off an element flush
 * with the frame's edge, because the outline sits 2px out. The clip box is
 * padded by the reach instead and its contents offset back by it, so the
 * outline has room and content far outside the frame is still clipped.
 * `ClippedEdges` goes on measuring against the frame box, so its bar still
 * means the element runs past the frame rather than that the ring touched the
 * padding.
 */
const RING_REACH = 24;

/** The frame under the pointer. Hidden hovers linger only to fade their ring. */
export interface FrameHover {
	frame: string;
	visible: boolean;
}

export const NO_MARKS: SnapMarks = { v: [], h: [], spans: [] };

/** Half the tick length at a span's ends, in screen pixels. */
const SPAN_TICK_PX = 3;

export type Handle = "nw" | "ne" | "sw" | "se" | "n" | "e" | "s" | "w";

export function isHandle(value: string): value is Handle {
	return value in HANDLE_CURSORS;
}

export const HANDLE_CURSORS: Record<Handle, string> = {
	nw: "nwse-resize",
	se: "nwse-resize",
	ne: "nesw-resize",
	sw: "nesw-resize",
	n: "ns-resize",
	s: "ns-resize",
	e: "ew-resize",
	w: "ew-resize",
};

const CORNERS = ["nw", "ne", "sw", "se"] as const;

const SIDES = ["n", "e", "s", "w"] as const;

/** A box of furniture's place for one camera, in CSS pixels. */
type Place = Partial<Record<"left" | "top" | "width" | "height" | "borderRadius", number>>;

const PLACED = ["left", "top", "width", "height", "borderRadius"] as const;

/**
 * One piece of screen-space furniture, following the camera on its own (#81).
 *
 * React renders what it is, and `place` says where it stands for a camera. The
 * place is written to the element directly: now, after any render that moved
 * it, and at every drawn frame of the camera, which is the same frame the
 * field moves in. React never writes those five properties, so a render can
 * never put back a place the camera has already left.
 */
function Follow({
	camera,
	place,
	...rest
}: {
	camera: CameraStore;
	place: (camera: Camera) => Place;
} & Omit<HTMLAttributes<HTMLDivElement>, "style"> & { style?: CSSProperties }) {
	const box = useRef<HTMLDivElement | null>(null);
	useCameraFollow(
		camera,
		(at) => {
			const el = box.current;
			if (el === null) return;
			const placed = place(at);
			for (const key of PLACED) {
				const value = placed[key];
				if (value !== undefined) el.style[key] = `${value}px`;
			}
		},
		[place],
	);
	return <div ref={box} {...rest} />;
}

/** A world box on screen, for one camera. */
function onScreen(camera: Camera, box: Box): Box {
	return { x: box.x * camera.k + camera.x, y: box.y * camera.k + camera.y, w: box.w * camera.k, h: box.h * camera.k };
}

/**
 * A frame-local element rect inside its frame's own clipped box (#323).
 *
 * A frame is a window on a document that is usually taller than it, and an
 * element laid out past the frame's height reports a rect the frame never
 * draws. Drawn against the viewport that ring landed out on the canvas, over
 * whatever sat beside the frame; drawn in here it is clipped exactly as the
 * frame clips its own content, and `ClippedEdges` says which edge it ran past.
 */
function inFrame(camera: Camera, rect: Box): Box {
	return { x: rect.x * camera.k, y: rect.y * camera.k, w: rect.w * camera.k, h: rect.h * camera.k };
}

/** The ring's radius: the shell's own corner on screen, two pixels out. */
function ringRadius(k: number): number {
	return Math.min(12, shellRadius(k) * k) + 2;
}

/** A frame's ring, 3px outside it. */
function ringPlace(camera: Camera, frame: Box): Place {
	const rect = onScreen(camera, frame);
	return {
		left: rect.x - 3,
		top: rect.y - 3,
		width: rect.w + 6,
		height: rect.h + 6,
		borderRadius: ringRadius(camera.k),
	};
}

/** The clip a frame's element rings are drawn inside, padded by their reach. */
function clipPlace(camera: Camera, frame: Box): Place {
	const rect = onScreen(camera, frame);
	return {
		left: rect.x - RING_REACH,
		top: rect.y - RING_REACH,
		width: rect.w + RING_REACH * 2,
		height: rect.h + RING_REACH * 2,
	};
}

/** The frame's own box inside that clip. */
function framePlace(camera: Camera, frame: Box): Place {
	return { width: frame.w * camera.k, height: frame.h * camera.k };
}

export function SelectionOverlay({
	camera,
	frames,
	selected,
	entered,
	hovered,
	editable,
	picked,
	lit = null,
	preview,
	refused = null,
	editing = null,
	onOpenFile,
	onAsk,
	marks,
	marquee,
	dropLine = null,
}: {
	/** The furniture follows the camera rather than rendering with it (#81). */
	camera: CameraStore;
	frames: ProjectedFrame[];
	selected: readonly string[];
	entered: string | null;
	hovered: FrameHover | null;
	/** Select is the only surface that exposes arrange handles. */
	editable: boolean;
	picked: readonly PickedSelection[];
	/**
	 * The chip the cursor is on, in the composer (#116).
	 *
	 * A chip and the box it names are one object, so one of them under the cursor
	 * marks the other. It is a pick's own key, because two picks of one list row are
	 * one string in the rail and only their boxes tell them apart.
	 */
	lit?: string | null;
	/** the element a click would take, outlined faintly under the pointer (#339) */
	preview: ElementPreview | null;
	/**
	 * The element whose words are open, which wears its outline and nothing
	 * else (#339): no name label while the caret is in.
	 */
	editing?: { frame: string; selector: string } | null;
	/**
	 * The refusal note (#255, #339): why the gesture just tried on this
	 * element does not apply.
	 *
	 * A refusal is quiet — the element stays what it was and nothing is sent
	 * anywhere — but it is never silent, so the planner's reason sits under the
	 * outline in its own words, and leaves after a moment or when the
	 * selection does.
	 */
	refused?: ShownRefusal | null;
	/** The door to the agent every refusal offers (#314, #339): the composer, holding the attempt. */
	onAsk?: () => void;
	/** The file a refusal points at (#317), handed out by path. */
	onOpenFile?: (path: string, line: number) => void;
	marks: SnapMarks;
	/** Normalized screen-space rect while a marquee drag is live. */
	marquee: Box | null;
	/** Where an element being dragged would land (#340): the line between two siblings, frame-local. */
	dropLine?: { frame: string; box: Box } | null;
}) {
	/** A frame-local element rect on screen. */
	const elementBox = (at: Camera, frame: ProjectedFrame, rect: Box): Box =>
		onScreen(at, { x: frame.x + rect.x, y: frame.y + rect.y, w: rect.w, h: rect.h });

	const ringed = [...new Set(entered === null ? selected : [...selected, entered])];
	const hoveredFrame =
		hovered !== null && !ringed.includes(hovered.frame)
			? frames.find((frame) => frame.name === hovered.frame)
			: undefined;
	const single =
		editable && selected.length === 1 && entered === null ? frames.find((f) => f.name === selected[0]) : undefined;
	const unpicked = (preview: ElementPreview | null): ElementPreview | null =>
		preview !== null && !picked.some((pick) => pick.frame === preview.frame && pick.selector === preview.selector)
			? preview
			: null;
	const previewShown = unpicked(preview);
	/** the one element held, which is the one that wears a name label (#339) */
	const named = picked.length === 1 ? picked[0] : undefined;
	/** the frames the picks and the ring furniture are drawn inside, one clipped box each (#323) */
	const pickedFrames = [...new Set(picked.map((pick) => pick.frame))];

	return (
		<div className="pointer-events-none absolute inset-0">
			{/* snap marks: alignment and spacing are meaning, so they carry the thread */}
			{marks.v.map((x) => (
				<Follow
					key={`v${x}`}
					camera={camera}
					place={(at) => ({ left: x * at.k + at.x })}
					className="absolute inset-y-0 w-px bg-thread"
				/>
			))}
			{marks.h.map((y) => (
				<Follow
					key={`h${y}`}
					camera={camera}
					place={(at) => ({ top: y * at.k + at.y })}
					className="absolute inset-x-0 h-px bg-thread"
				/>
			))}
			{marks.spans.map((span) => (
				<SpanBar key={`${span.axis}${span.from}-${span.to}-${span.at}`} camera={camera} span={span} />
			))}

			{hoveredFrame !== undefined && (
				<Follow
					camera={camera}
					place={(at) => ringPlace(at, hoveredFrame)}
					data-frame-hover={hoveredFrame.name}
					className="absolute border border-border-raised"
					style={{
						opacity: hovered?.visible === true ? 1 : 0,
						transition: hovered?.visible === true ? "none" : "opacity 80ms ease-out",
					}}
				/>
			)}

			{ringed.map((name) => {
				const frame = frames.find((f) => f.name === name);
				if (frame === undefined) return null;
				return (
					<Follow
						key={`ring-${name}`}
						camera={camera}
						place={(at) => ringPlace(at, frame)}
						// the ring's own strength is the system page's law and does not move; the
						// cursor on this frame's chip fills the box instead, which is the same
						// thing a lit element outline does one level down (#116)
						className={`absolute border-[1.5px] border-thread ${lit === name || lit === WHOLE_SELECTION ? "bg-thread/10" : ""}`}
					/>
				);
			})}

			{single !== undefined && (
				<>
					{SIDES.map((side) => (
						<Follow
							key={side}
							camera={camera}
							// invisible 10px bands along the ring, inset past the corner zones
							place={(at) => {
								const rect = onScreen(at, single);
								return side === "n" || side === "s"
									? {
											left: rect.x + 5,
											width: Math.max(rect.w - 10, 0),
											top: side === "n" ? rect.y - 8 : rect.y + rect.h - 2,
											height: 10,
										}
									: {
											top: rect.y + 5,
											height: Math.max(rect.h - 10, 0),
											left: side === "w" ? rect.x - 8 : rect.x + rect.w - 2,
											width: 10,
										};
							}}
							data-handle={side}
							className="pointer-events-auto absolute"
							style={{ cursor: HANDLE_CURSORS[side] }}
						/>
					))}
					{CORNERS.map((corner) => (
						<Follow
							key={corner}
							camera={camera}
							place={(at) => {
								const rect = onScreen(at, single);
								const cx = corner.includes("w") ? rect.x - 3 : rect.x + rect.w + 3;
								const cy = corner.includes("n") ? rect.y - 3 : rect.y + rect.h + 3;
								return { left: cx - 8, top: cy - 8 };
							}}
							data-handle={corner}
							className="pointer-events-auto absolute flex h-4 w-4 items-center justify-center"
							style={{ cursor: HANDLE_CURSORS[corner] }}
						>
							<div className="h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread" />
						</Follow>
					))}
					<Follow
						camera={camera}
						place={(at) => {
							const rect = onScreen(at, single);
							return { left: rect.x + rect.w / 2, top: rect.y + rect.h + 14 };
						}}
						className="absolute flex items-center justify-center rounded-xs bg-thread-strong px-2 py-[3px]"
						style={{ transform: "translateX(-50%)" }}
					>
						<span className="text-on-thread type-detail">{`${Math.round(single.w)} × ${Math.round(single.h)}`}</span>
					</Follow>
				</>
			)}

			{pickedFrames.map((name) => {
				const frame = frames.find((f) => f.name === name);
				if (frame === undefined) return null;
				const group = picked.filter((pick) => pick.frame === name);
				// the ring is the element's own lines (#321)
				const drawn = group.map((pick) => ({ pick, rects: lineBoxes(pick) }));
				return (
					<Follow
						key={`picked-${name}`}
						camera={camera}
						place={(at) => clipPlace(at, frame)}
						data-frame-clip={name}
						className="absolute overflow-hidden"
					>
						<Follow
							camera={camera}
							place={(at) => framePlace(at, frame)}
							className="absolute"
							style={{ left: RING_REACH, top: RING_REACH }}
						>
							{drawn.flatMap(({ pick, rects }) => {
								const key = pickKey(pick.frame, pick.selector);
								return rects.map((box) => (
									<ElementOutline
										key={`${key}\u0000${box.y}\u0000${box.x}`}
										mark
										camera={camera}
										rect={box}
										radius={pick.radius}
										lit={lit === key || lit === WHOLE_SELECTION}
									/>
								));
							})}
							{group.flatMap((pick) =>
								(pick.spills ?? []).map((side) => (
									<SpillMark
										key={`${pickKey(pick.frame, pick.selector)}\u0000${side}`}
										camera={camera}
										rect={pick.rect}
										side={side}
									/>
								)),
							)}
							{group.length < 2 ? null : (
								// what several held elements are, as one box (#323): the ring
								// says the extent of the selection
								<Follow
									camera={camera}
									place={(at) => {
										const box = inFrame(at, unionOf(drawn.flatMap((one) => one.rects)));
										return { left: box.x - 4, top: box.y - 4, width: box.w + 8, height: box.h + 8 };
									}}
									data-element-union=""
									className="absolute border border-thread border-dashed opacity-60"
								/>
							)}
							<ClippedEdges frame={frame} rects={drawn.flatMap((one) => one.rects)} />
							{named !== undefined &&
							named.frame === name &&
							named.name !== undefined &&
							!(editing?.frame === named.frame && editing.selector === named.selector) ? (
								<NameLabel camera={camera} name={named.name} rect={unionOf(lineBoxes(named))} />
							) : null}
						</Follow>
					</Follow>
				);
			})}

			{previewShown !== null &&
				(() => {
					const frame = frames.find((f) => f.name === previewShown.frame);
					if (frame === undefined) return null;
					return (
						<Follow camera={camera} place={(at) => clipPlace(at, frame)} className="absolute overflow-hidden">
							<Follow
								camera={camera}
								place={(at) => framePlace(at, frame)}
								className="absolute"
								style={{ left: RING_REACH, top: RING_REACH }}
							>
								{lineBoxes(previewShown).map((box) => (
									<ElementOutline
										key={`${box.y}-${box.x}`}
										camera={camera}
										rect={box}
										radius={previewShown.radius}
										faded
									/>
								))}
							</Follow>
						</Follow>
					);
				})()}

			{refused !== null &&
				(() => {
					const pick = picked.find((held) => held.frame === refused.frame && held.selector === refused.selector);
					const frame = pick === undefined ? undefined : frames.find((f) => f.name === pick.frame);
					if (pick === undefined || frame === undefined) return null;
					return (
						<Follow
							camera={camera}
							place={(at) => {
								const box = elementBox(at, frame, pick.rect);
								return { left: box.x - 2, top: box.y + box.h + 8 };
							}}
							data-hand-refusal={refused.refusal.code}
							// the chip stands outside the element it is about, which is over
							// whatever is drawn under that: it says its piece and takes no
							// press of its own, only the two it offers as doors (#321)
							className="pointer-events-none absolute flex max-w-[360px] items-baseline gap-2 rounded-md border border-border-raised bg-raised px-2 py-1 text-muted type-detail"
						>
							<span className="truncate">
								{refused.refusal.says}
								{refused.refusal.expression !== undefined && refused.attempted === undefined && (
									<span className="text-thread-strong"> {refused.refusal.expression}</span>
								)}
							</span>
							{refused.file !== undefined && onOpenFile !== undefined && (
								<FileLink path={refused.file.path} line={refused.file.line} onOpen={onOpenFile} />
							)}
							{refused.instead !== undefined && (
								<button
									type="button"
									data-hand-instead=""
									className="pointer-events-auto shrink-0 text-thread-strong hover:underline"
									onPointerDown={(event) => event.stopPropagation()}
									onClick={refused.instead.act}
								>
									{refused.instead.says}
								</button>
							)}
							{onAsk !== undefined && (
								<button
									type="button"
									data-hand-ask
									className="pointer-events-auto shrink-0 text-thread-strong hover:underline"
									onPointerDown={(event) => event.stopPropagation()}
									onClick={onAsk}
								>
									Ask the agent
								</button>
							)}
						</Follow>
					);
				})()}

			{dropLine !== null &&
				(() => {
					const frame = frames.find((f) => f.name === dropLine.frame);
					if (frame === undefined) return null;
					return (
						<Follow
							camera={camera}
							place={(at) => {
								const box = elementBox(at, frame, dropLine.box);
								return { left: box.x, top: box.y, width: Math.max(box.w, 2), height: Math.max(box.h, 2) };
							}}
							data-drop-line=""
							className="absolute rounded-full bg-thread"
						/>
					);
				})()}

			{marquee !== null && (
				<div
					className="absolute border border-thread bg-thread/10"
					style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
				/>
			)}
		</div>
	);
}

/**
 * The canvas's spacing mark: a bar the exact length of the distance between
 * two frames, ticked at both ends, no fill and no number of its own.
 */
function SpanBar({ camera, span }: { camera: CameraStore; span: SnapMarks["spans"][number] }) {
	const flat = span.axis === "x";
	const girth = SPAN_TICK_PX * 2;
	return (
		<Follow
			camera={camera}
			place={(at) => {
				// screen space: where the bar starts along its axis, how long, and its line
				const from = span.from * at.k + (flat ? at.x : at.y);
				const length = (span.to - span.from) * at.k;
				const line = span.at * at.k + (flat ? at.y : at.x) - SPAN_TICK_PX;
				return flat
					? { left: from, top: line, width: length, height: girth }
					: { left: line, top: from, width: girth, height: length };
			}}
			data-snap-span={span.axis}
			className={`absolute border-thread ${flat ? "border-r border-l" : "border-t border-b"}`}
		>
			<div
				className={`absolute bg-thread ${flat ? "inset-x-0 h-px" : "inset-y-0 w-px"}`}
				style={flat ? { top: SPAN_TICK_PX } : { left: SPAN_TICK_PX }}
			/>
		</Follow>
	);
}

/**
 * The name label (#339): the held element's name, sat on the outline's top
 * edge at its left corner, and nothing else. The name is the component whose
 * whole output the element is, otherwise a word for its tag, as the frame
 * reads it (`daemon/element-name.ts`). Not a chip, which is the composer's
 * word for a selection entry.
 */
function NameLabel({ camera, name, rect }: { camera: CameraStore; name: string; rect: Box }) {
	return (
		<Follow
			camera={camera}
			place={(at) => {
				const box = inFrame(at, rect);
				return { left: box.x - 2, top: box.y - 2 };
			}}
			data-name-label={name}
			className="absolute -translate-y-full whitespace-nowrap rounded-t-[3px] bg-thread px-1.5 py-px text-on-thread type-detail"
		>
			{name}
		</Follow>
	);
}

/** The one box several held elements come to, which is the ring a multi-pick wears (#323). */
function unionOf(rects: readonly { x: number; y: number; w: number; h: number }[]): {
	x: number;
	y: number;
	w: number;
	h: number;
} {
	let left = Number.POSITIVE_INFINITY;
	let top = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;
	for (const rect of rects) {
		left = Math.min(left, rect.x);
		top = Math.min(top, rect.y);
		right = Math.max(right, rect.x + rect.w);
		bottom = Math.max(bottom, rect.y + rect.h);
	}
	if (!Number.isFinite(left)) return { x: 0, y: 0, w: 0, h: 0 };
	return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * The bar on an edge a picked element runs past (#323).
 *
 * The ring is clipped to the frame, which is honest but silent: an element
 * laid out below a frame's height would otherwise show as a ring with one side
 * missing and no reason. Two pixels of thread along the edge it ran past is
 * that reason. It is a whole edge rather than the length of the overrun,
 * because what it says is about the frame rather than about the box.
 */
function ClippedEdges({
	frame,
	rects,
}: {
	frame: { w: number; h: number };
	rects: readonly { x: number; y: number; w: number; h: number }[];
}) {
	const past = {
		left: rects.some((rect) => rect.x < -0.5),
		top: rects.some((rect) => rect.y < -0.5),
		right: rects.some((rect) => rect.x + rect.w > frame.w + 0.5),
		bottom: rects.some((rect) => rect.y + rect.h > frame.h + 0.5),
	};
	const place = {
		left: { left: 0, top: 0, width: 2, height: "100%" },
		right: { right: 0, top: 0, width: 2, height: "100%" },
		top: { left: 0, top: 0, height: 2, width: "100%" },
		bottom: { left: 0, bottom: 0, height: 2, width: "100%" },
	} as const;
	return (
		<>
			{(["left", "right", "top", "bottom"] as const).map((edge) =>
				past[edge] ? (
					<div key={edge} data-ring-clipped={edge} className="absolute bg-thread" style={place[edge]} />
				) : null,
			)}
		</>
	);
}

/**
 * The mark on the side an element's content runs past its box (#324).
 *
 * The ring stays the border box, which is what the file says. A width
 * written under the content's own min-content width leaves the words standing
 * outside it, and a ring shorter than the text it is round reads as a broken
 * ring rather than as the truth about a box that is smaller than what is in
 * it. The same two pixels of thread the frame clip already uses, on the side
 * it spills.
 */
function SpillMark({ camera, rect, side }: { camera: CameraStore; rect: Box; side: "right" | "bottom" }) {
	return (
		<Follow
			camera={camera}
			place={(at) => {
				const box = inFrame(at, rect);
				return side === "right"
					? { left: box.x + box.w, top: box.y - 2, width: 2, height: box.h + 4 }
					: { left: box.x - 2, top: box.y + box.h, width: box.w + 4, height: 2 };
			}}
			data-ring-spill={side}
			className="absolute bg-thread"
		/>
	);
}

/**
 * The element outline: 1px thread at 2px offset, no handles — faded previews.
 *
 * `lit` is the cursor sitting on this element's chip in the composer, which fills the
 * box rather than thickening its edge: the stroke is the system page's law, and a
 * fill is the lightest thing that says *this one* among five identical outlines.
 */
function ElementOutline({
	camera,
	rect,
	radius,
	faded,
	lit,
	mark,
}: {
	camera: CameraStore;
	/** the element's line box, frame-local */
	rect: Box;
	/** the element's own corner radius, in its document's pixels */
	radius: number;
	faded?: boolean;
	lit?: boolean;
	/** the ring round the selection itself, which a test can find and measure */
	mark?: boolean;
}) {
	return (
		<Follow
			camera={camera}
			place={(at) => {
				const box = inFrame(at, rect);
				return {
					left: box.x - 2,
					top: box.y - 2,
					width: box.w + 4,
					height: box.h + 4,
					borderRadius: radius * at.k + 2,
				};
			}}
			{...(mark === true ? { "data-element-ring": "" } : {})}
			className={`absolute border border-thread ${faded === true ? "opacity-50" : ""} ${lit === true ? "bg-thread/10" : ""}`}
		/>
	);
}

/**
 * The file a refusal points at (#317): `frame.tsx:12`, and a press hands the
 * path out the way the frame's own source path is handed out — copied, never
 * opened in an editor spool would have to choose.
 */
function FileLink({
	path,
	line,
	onOpen,
}: {
	path: string;
	line: number;
	onOpen: (path: string, line: number) => void;
}) {
	return (
		<button
			type="button"
			data-hand-file={`${path}:${line}`}
			title={`Copy ${path}:${line}`}
			className="pointer-events-auto shrink-0 text-thread-strong hover:underline text-muted type-detail"
			onPointerDown={(event) => event.stopPropagation()}
			onClick={() => onOpen(path, line)}
		>
			{path.slice(path.lastIndexOf("/") + 1)}:{line}
		</button>
	);
}

/**
 * The source file behind the selection (#7: the path out of the stamp payload).
 * A picked element is often not the frame's own file — it is the shared
 * component the frame renders — which is the whole reason the stamp is read
 * rather than assumed. The stampless fallback is the frame's own file, which
 * its name locates (#336).
 */
export function sourcePathOf(picked: PickedSelection): string {
	const stamp = parseStampRef(picked.source);
	return stamp === undefined ? frameSourcePath(picked.frame) : `design/${stamp.rel}`;
}
