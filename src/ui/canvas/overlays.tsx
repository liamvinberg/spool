import { cellsForPx } from "../../term/cells";
import type { Camera, ProjectedFrame } from "../api";
import { WHOLE_SELECTION } from "./agent-chips";
import type { Box } from "./camera";
import { frameSourcePath } from "./pages";
import { type PickedHit, parseStampRef, pickKey } from "./protocol";
import type { SnapMarks } from "./snap";

/**
 * Screen-space selection furniture (#23), drawn over the transformed field so
 * strokes stay hairline at any zoom. The system page's laws verbatim: hover
 * 1px neutral at 3px offset; ring 1.5px thread at 3px offset radius +2;
 * handles 8px on-thread fill with thread border; readout thread fill,
 * on-thread mono 10; element outline 1px thread at 2px offset, no handles.
 * Knobs render on corners only — the sides carry invisible grab bands,
 * Figma's pattern for single-axis resize.
 */

export interface PickedSelection extends PickedHit {
	frame: string;
}

/** The would-be click target under the cursor (#37) — outlined, never selected. */
export interface ElementPreview {
	frame: string;
	selector: string;
	rect: { x: number; y: number; w: number; h: number };
	radius: number;
}

/**
 * The two rungs a hover draws (#254). The one a click takes is solid; the one
 * under it is dashed, and that second ring is what makes a descent a step you
 * can see rather than a guess. There is no second ring at the leaf, or where a
 * click already lands where a descent would — and no first one with no rung
 * open, because there a click takes the frame and the frame draws its own.
 */
export interface HoverRungs {
	click: ElementPreview | null;
	under: ElementPreview | null;
}

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
	marks,
	marquee,
	shellRadius,
}: {
	camera: Camera;
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
	preview: HoverRungs | null;
	marks: SnapMarks;
	/** Normalized screen-space rect while a marquee drag is live. */
	marquee: Box | null;
	shellRadius: number;
}) {
	const k = camera.k;
	const screenRect = (box: Box): Box => ({
		x: box.x * k + camera.x,
		y: box.y * k + camera.y,
		w: box.w * k,
		h: box.h * k,
	});
	/** A frame-local element rect on screen — undefined when the frame is gone. */
	const elementBox = (name: string, rect: { x: number; y: number; w: number; h: number }): Box | undefined => {
		const frame = frames.find((f) => f.name === name);
		if (frame === undefined) return undefined;
		return screenRect({ x: frame.x + rect.x, y: frame.y + rect.y, w: rect.w, h: rect.h });
	};
	const ringRadius = Math.min(12, shellRadius * k) + 2;

	const ringed = [...new Set(entered === null ? selected : [...selected, entered])];
	const hoveredFrame =
		hovered !== null && !ringed.includes(hovered.frame)
			? frames.find((frame) => frame.name === hovered.frame)
			: undefined;
	const single =
		editable && selected.length === 1 && entered === null ? frames.find((f) => f.name === selected[0]) : undefined;
	const unpicked = (rung: ElementPreview | null): ElementPreview | null =>
		rung !== null && !picked.some((pick) => pick.frame === rung.frame && pick.selector === rung.selector)
			? rung
			: null;
	const previewShown = preview === null ? null : unpicked(preview.click);
	const deeperShown = preview === null ? null : unpicked(preview.under);

	return (
		<div className="pointer-events-none absolute inset-0">
			{/* snap marks: alignment and spacing are meaning, so they carry the thread */}
			{marks.v.map((x) => (
				<div key={`v${x}`} className="absolute inset-y-0 w-px bg-thread" style={{ left: x * k + camera.x }} />
			))}
			{marks.h.map((y) => (
				<div key={`h${y}`} className="absolute inset-x-0 h-px bg-thread" style={{ top: y * k + camera.y }} />
			))}
			{marks.spans.map((span) => {
				// a bar the exact length of the gap, ticked at both ends, laid across
				// the middle of the two frames' shared overlap — no fill, no number
				const flat = span.axis === "x";
				const from = span.from * k + (flat ? camera.x : camera.y);
				const length = (span.to - span.from) * k;
				const at = span.at * k + (flat ? camera.y : camera.x) - SPAN_TICK_PX;
				const girth = SPAN_TICK_PX * 2;
				return (
					<div
						key={`${span.axis}${span.from}-${span.to}-${span.at}`}
						data-snap-span={span.axis}
						className={`absolute border-thread ${flat ? "border-r border-l" : "border-t border-b"}`}
						style={
							flat
								? { left: from, top: at, width: length, height: girth }
								: { left: at, top: from, width: girth, height: length }
						}
					>
						<div
							className={`absolute bg-thread ${flat ? "inset-x-0 h-px" : "inset-y-0 w-px"}`}
							style={flat ? { top: SPAN_TICK_PX } : { left: SPAN_TICK_PX }}
						/>
					</div>
				);
			})}

			{hoveredFrame !== undefined &&
				(() => {
					const rect = screenRect(hoveredFrame);
					return (
						<div
							data-frame-hover={hoveredFrame.name}
							className="absolute border border-border-raised"
							style={{
								left: rect.x - 3,
								top: rect.y - 3,
								width: rect.w + 6,
								height: rect.h + 6,
								borderRadius: ringRadius,
								opacity: hovered?.visible === true ? 1 : 0,
								transition: hovered?.visible === true ? "none" : "opacity 80ms ease-out",
							}}
						/>
					);
				})()}

			{ringed.map((name) => {
				const frame = frames.find((f) => f.name === name);
				if (frame === undefined) return null;
				const rect = screenRect(frame);
				return (
					<div
						key={`ring-${name}`}
						// the ring's own strength is the system page's law and does not move; the
						// cursor on this frame's chip fills the box instead, which is the same
						// thing a lit element outline does one level down (#116)
						className={`absolute border-[1.5px] border-thread ${lit === name || lit === WHOLE_SELECTION ? "bg-thread/10" : ""}`}
						style={{
							left: rect.x - 3,
							top: rect.y - 3,
							width: rect.w + 6,
							height: rect.h + 6,
							borderRadius: ringRadius,
						}}
					/>
				);
			})}

			{single !== undefined &&
				(() => {
					const rect = screenRect(single);
					return (
						<>
							{SIDES.map((side) => {
								// invisible 10px bands along the ring, inset past the corner zones
								const place =
									side === "n" || side === "s"
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
								return (
									<div
										key={side}
										data-handle={side}
										className="pointer-events-auto absolute"
										style={{ ...place, cursor: HANDLE_CURSORS[side] }}
									/>
								);
							})}
							{CORNERS.map((corner) => {
								const cx = corner.includes("w") ? rect.x - 3 : rect.x + rect.w + 3;
								const cy = corner.includes("n") ? rect.y - 3 : rect.y + rect.h + 3;
								return (
									<div
										key={corner}
										data-handle={corner}
										className="pointer-events-auto absolute flex h-4 w-4 items-center justify-center"
										style={{ left: cx - 8, top: cy - 8, cursor: HANDLE_CURSORS[corner] }}
									>
										<div className="h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread" />
									</div>
								);
							})}
							<div
								className="absolute flex items-center justify-center rounded-xs bg-thread px-2 py-[3px]"
								style={{ left: rect.x + rect.w / 2, top: rect.y + rect.h + 14, transform: "translateX(-50%)" }}
							>
								<span className="font-mono text-2xs text-on-thread leading-3">
									{single.kind === "term"
										? `${cellsForPx(single.w, single.h).cols} × ${cellsForPx(single.w, single.h).rows}`
										: `${Math.round(single.w)} × ${Math.round(single.h)}`}
								</span>
							</div>
						</>
					);
				})()}

			{picked.map((pick) => {
				const box = elementBox(pick.frame, pick.rect);
				if (box === undefined) return null;
				const key = pickKey(pick.frame, pick.selector);
				return (
					<ElementOutline
						key={key}
						box={box}
						radius={pick.radius * k}
						lit={lit === key || lit === WHOLE_SELECTION}
					/>
				);
			})}

			{previewShown !== null &&
				(() => {
					const box = elementBox(previewShown.frame, previewShown.rect);
					if (box === undefined) return null;
					return <ElementOutline box={box} radius={previewShown.radius * k} faded />;
				})()}

			{deeperShown !== null &&
				(() => {
					const box = elementBox(deeperShown.frame, deeperShown.rect);
					if (box === undefined) return null;
					return <ElementOutline box={box} radius={deeperShown.radius * k} faded dashed />;
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
 * The element outline: 1px thread at 2px offset, no handles — faded previews.
 *
 * `lit` is the cursor sitting on this element's chip in the composer, which fills the
 * box rather than thickening its edge: the stroke is the system page's law, and a
 * fill is the lightest thing that says *this one* among five identical outlines.
 *
 * `dashed` is the rung under the one a click takes (#254), drawn fainter still:
 * a solid second ring would read as a second target rather than as the step after.
 */
function ElementOutline({
	box,
	radius,
	faded,
	dashed,
	lit,
}: {
	box: Box;
	radius: number;
	faded?: boolean;
	dashed?: boolean;
	lit?: boolean;
}) {
	return (
		<div
			className={`absolute border border-thread ${dashed === true ? "border-dashed opacity-30" : faded === true ? "opacity-50" : ""} ${lit === true ? "bg-thread/10" : ""}`}
			style={{
				left: box.x - 2,
				top: box.y - 2,
				width: box.w + 4,
				height: box.h + 4,
				borderRadius: radius + 2,
			}}
		/>
	);
}

/** The editor target off the selection (#7: path:line from the payload). The
 * stampless fallback needs the frame's page — the folder moved with it (#39). */
export function editorTarget(picked: PickedSelection, page: string): { path: string; line?: number } {
	const stamp = parseStampRef(picked.source);
	if (stamp === undefined) return { path: frameSourcePath(picked.frame, page) };
	return { path: `design/${stamp.rel}`, line: stamp.line };
}
