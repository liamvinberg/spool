import { cellsForPx } from "../../term/cells";
import type { Camera, ProjectedFrame } from "../api";
import { WHOLE_SELECTION } from "./agent-chips";
import type { Box } from "./camera";
import type { ShownRefusal } from "./hand-edit";
import type { LiveHandles, Sign } from "./hand-resize";
import type { Spacing, SpacingPart } from "./measure-spacing";
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
 * The rung a hover draws (#254): the one a click takes. It draws nothing with
 * no rung open, because there a click takes the frame and the frame draws its
 * own ring. No pointer gesture descends a rung, so nothing beneath it is drawn
 * either — a second ring would promise a step nothing takes.
 */
export interface HoverRungs {
	click: ElementPreview | null;
	/**
	 * The distance from the held element to `click`, decomposed (#261).
	 *
	 * It rides the hover rather than sitting beside it because its life is the
	 * hover's exactly: the pointer moving, the selection changing, a gesture
	 * starting and ⌥ coming back up all end it, and every one of those already
	 * clears the rungs.
	 */
	spacing?: MeasuredSpacing;
}

/** A decomposed distance, and the frame whose pixels it is in. */
export interface MeasuredSpacing extends Spacing {
	frame: string;
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

/** The signs a handle drags each axis by: -1 the top or left, 1 the bottom or right. */
export function signsOf(handle: Handle): { sx: Sign; sy: Sign } {
	return {
		sx: handle.includes("w") ? -1 : handle.includes("e") ? 1 : 0,
		sy: handle.includes("n") ? -1 : handle.includes("s") ? 1 : 0,
	};
}

/**
 * The element ring's own handles (#259), which are the frame ring's set with
 * the rotate zones Figma puts diagonally outside each corner.
 *
 * `rect` is the box the ring draws in frame-local pixels — the dragged one
 * while a drag is live, so the ring follows the pointer while the file stays
 * as it is until the gesture ends. `says` is the readout that rides beside it.
 */
export interface ElementHandles {
	frame: string;
	selector: string;
	rect: { x: number; y: number; w: number; h: number };
	live: LiveHandles;
	says: string | null;
	/** the readout sits above the ring for a turn and below it for a size */
	turning: boolean;
}

/** Figma's own rotate cursor, drawn rather than fetched: nothing loads over CSP. */
const ROTATE_SVG =
	"<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18'><path d='M13.5 4.5a6 6 0 1 0 0 9' fill='none' stroke='black' stroke-width='4'/><path d='M13.5 4.5a6 6 0 1 0 0 9' fill='none' stroke='white' stroke-width='2'/><path d='M13.5 1.2 17 4.6l-3.5 3.3z' fill='white' stroke='black' stroke-width='1'/><path d='M13.5 16.8 17 13.4l-3.5-3.3z' fill='white' stroke='black' stroke-width='1'/></svg>";

export const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(ROTATE_SVG)}") 9 9, grab`;

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
	refused = null,
	handles = null,
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
	/**
	 * Why the gesture just tried on this element does not apply (#255).
	 *
	 * A refusal is quiet — the element stays what it was and nothing is sent
	 * anywhere — but it is never silent, so the reason sits under the outline
	 * in the same plain language every other canvas notice uses, and leaves
	 * when the selection does.
	 */
	refused?: ShownRefusal | null;
	/**
	 * The held element's own ring furniture (#259) — nothing where no handle
	 * is live, because a handle no write would take must not be there to grab.
	 */
	handles?: ElementHandles | null;
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

	return (
		<div className="pointer-events-none absolute inset-0">
			{/* snap marks: alignment and spacing are meaning, so they carry the thread */}
			{marks.v.map((x) => (
				<div key={`v${x}`} className="absolute inset-y-0 w-px bg-thread" style={{ left: x * k + camera.x }} />
			))}
			{marks.h.map((y) => (
				<div key={`h${y}`} className="absolute inset-x-0 h-px bg-thread" style={{ top: y * k + camera.y }} />
			))}
			{marks.spans.map((span) => (
				<SpanBar
					key={`${span.axis}${span.from}-${span.to}-${span.at}`}
					mark="data-snap-span"
					axis={span.axis}
					from={span.from * k + (span.axis === "x" ? camera.x : camera.y)}
					length={(span.to - span.from) * k}
					at={span.at * k + (span.axis === "x" ? camera.y : camera.x)}
				/>
			))}

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
				// the ring follows the pointer while a drag is live: the file is
				// written once, when it is let go
				const held =
					handles !== null && handles.frame === pick.frame && handles.selector === pick.selector
						? handles.rect
						: pick.rect;
				const box = elementBox(pick.frame, held);
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

			{handles !== null &&
				(() => {
					const box = elementBox(handles.frame, handles.rect);
					if (box === undefined) return null;
					// the ring the outline draws: 2px out, which is where a handle sits
					const ring = { x: box.x - 2, y: box.y - 2, w: box.w + 4, h: box.h + 4 };
					return <ElementHandleSet ring={ring} handles={handles} />;
				})()}

			{previewShown !== null &&
				(() => {
					const box = elementBox(previewShown.frame, previewShown.rect);
					if (box === undefined) return null;
					return <ElementOutline box={box} radius={previewShown.radius * k} faded />;
				})()}

			{preview?.spacing === undefined
				? null
				: (() => {
						const spacing = preview.spacing;
						const frame = frames.find((f) => f.name === spacing.frame);
						if (frame === undefined) return null;
						const flat = spacing.axis === "x";
						const along = (v: number) => v * k + (flat ? camera.x + frame.x * k : camera.y + frame.y * k);
						const across = (v: number) => v * k + (flat ? camera.y + frame.y * k : camera.x + frame.x * k);
						return (
							<MeasureOverlay
								spacing={spacing}
								from={along(spacing.from)}
								length={spacing.distance * k}
								at={across(spacing.at)}
							/>
						);
					})()}

			{/* floating chrome hides for the length of a drag and comes back
			    anchored to wherever the element ended up (#259) */}
			{refused !== null &&
				(handles === null || handles.says === null) &&
				(() => {
					const pick = picked.find((held) => held.frame === refused.frame && held.selector === refused.selector);
					const box = pick === undefined ? undefined : elementBox(pick.frame, pick.rect);
					if (box === undefined) return null;
					return (
						<div
							data-hand-refusal={refused.refusal.code}
							className="absolute max-w-[280px] truncate rounded-md border border-border-raised bg-raised px-2 py-1 font-mono text-2xs text-muted leading-3"
							style={{ left: box.x - 2, top: box.y + box.h + 8 }}
						>
							{refused.refusal.says}
							{refused.refusal.expression !== undefined && (
								<span className="text-thread"> {refused.refusal.expression}</span>
							)}
						</div>
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
 * Figma's handle set on the element ring (#259): a cube on each corner, bare
 * grab strips along the edges, and a rotate zone diagonally outside each
 * corner. The readout rides beside it while a drag is live.
 *
 * A handle is drawn only for an axis the file leaves live, so a corner on an
 * element whose height a breakpoint pins drags width alone and there is no
 * dead drag anywhere on the ring. The cube is the frame ring's own — one
 * canvas, one knob — and the two rings sit side by side often enough that a
 * second size would read as a second kind of object.
 */
function ElementHandleSet({ ring, handles }: { ring: Box; handles: ElementHandles }) {
	const { live } = handles;
	if (!live.w && !live.h && !live.rotate) return null;
	const at = (sx: Sign, sy: Sign) => ({
		x: sx === -1 ? ring.x : ring.x + ring.w,
		y: sy === -1 ? ring.y : ring.y + ring.h,
	});
	return (
		<>
			{live.rotate
				? CORNERS.map((name) => {
						const { sx, sy } = signsOf(name);
						const spot = at(sx, sy);
						return (
							<div
								key={`rotate-${name}`}
								data-element-rotate={name}
								className="pointer-events-auto absolute h-5 w-5"
								style={{
									left: spot.x + (sx === -1 ? -22 : 2),
									top: spot.y + (sy === -1 ? -22 : 2),
									cursor: ROTATE_CURSOR,
								}}
							/>
						);
					})
				: null}
			{live.w
				? ([-1, 1] as const).map((sx) => (
						<div
							key={`edge-x-${sx}`}
							data-element-handle={sx === -1 ? "w" : "e"}
							className="pointer-events-auto absolute w-[6px]"
							style={{
								left: at(sx, -1).x - 3,
								top: ring.y + 8,
								height: Math.max(ring.h - 16, 0),
								cursor: HANDLE_CURSORS.e,
							}}
						/>
					))
				: null}
			{live.h
				? ([-1, 1] as const).map((sy) => (
						<div
							key={`edge-y-${sy}`}
							data-element-handle={sy === -1 ? "n" : "s"}
							className="pointer-events-auto absolute h-[6px]"
							style={{
								top: at(-1, sy).y - 3,
								left: ring.x + 8,
								width: Math.max(ring.w - 16, 0),
								cursor: HANDLE_CURSORS.n,
							}}
						/>
					))
				: null}
			{live.w || live.h
				? CORNERS.map((name) => {
						const { sx, sy } = signsOf(name);
						const spot = at(sx, sy);
						return (
							<div
								key={`corner-${name}`}
								data-element-handle={name}
								className="pointer-events-auto absolute flex h-4 w-4 items-center justify-center"
								style={{ left: spot.x - 8, top: spot.y - 8, cursor: HANDLE_CURSORS[name] }}
							>
								<div className="h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread" />
							</div>
						);
					})
				: null}
			{handles.says === null ? null : (
				<div
					data-element-readout=""
					className="absolute whitespace-nowrap rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3"
					style={{
						left: ring.x + ring.w + 12,
						top: handles.turning ? ring.y - 20 : ring.y + ring.h + 10,
					}}
				>
					{handles.says}
				</div>
			)}
		</>
	);
}

/**
 * The measurement overlay (#261): the distance, and what it is made of.
 *
 * The bar is the canvas's own spacing mark — a span the exact length of the
 * distance, ticked at both ends — because a spacing measure between two frames
 * and one between two elements are the same thing at two depths, and a second
 * vocabulary for the second depth would read as a second kind of fact.
 *
 * The number rides the bar as the readout every other live measure wears, and
 * the parts sit under it: pixels, the class that produced them, the element it
 * is written on. A part with no class shows its pixels and says so rather than
 * naming something that did not cause it, and a collapsed margin shows with no
 * pixels at all — the class is in the file, and editing it would move nothing.
 */
function MeasureOverlay({
	spacing,
	from,
	length,
	at,
}: {
	spacing: Spacing;
	/** screen-space: the start of the bar along its axis, its length, and its line */
	from: number;
	length: number;
	at: number;
}) {
	const flat = spacing.axis === "x";
	// two boxes that touch measure zero, and subpixel layout can put the facing
	// edges a hair past each other: the bar is never shorter than nothing
	const bar = Math.max(length, 0);
	const mid = from + bar / 2;
	return (
		<>
			<SpanBar mark="data-measure-span" axis={spacing.axis} from={from} length={bar} at={at} />
			<div
				data-measure=""
				className="absolute flex flex-col items-start gap-1"
				style={
					flat
						? { left: mid, top: at + 10, transform: "translateX(-50%)" }
						: { left: at + 12, top: mid, transform: "translateY(-50%)" }
				}
			>
				<span className="rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3">
					{round(spacing.distance)}
				</span>
				<div className="flex flex-col gap-0.5 rounded-md border border-border-raised bg-raised px-2 py-1 font-mono text-2xs leading-4">
					{spacing.parts.map((part, index) => (
						<MeasurePart key={`${part.kind}-${part.token ?? index}`} part={part} />
					))}
				</div>
			</div>
		</>
	);
}

/**
 * The canvas's spacing mark: a bar the exact length of the distance, ticked at
 * both ends, no fill and no number of its own. A gap between two frames and a
 * gap between two elements are the same fact at two depths, so they are drawn
 * the same way and only the attribute says which surface asked for it.
 */
function SpanBar({
	mark,
	axis,
	from,
	length,
	at,
}: {
	mark: "data-snap-span" | "data-measure-span";
	axis: "x" | "y";
	/** screen-space: where the bar starts along its axis, how long, and its line */
	from: number;
	length: number;
	at: number;
}) {
	const flat = axis === "x";
	const girth = SPAN_TICK_PX * 2;
	const line = at - SPAN_TICK_PX;
	return (
		<div
			{...{ [mark]: axis }}
			className={`absolute border-thread ${flat ? "border-r border-l" : "border-t border-b"}`}
			style={
				flat
					? { left: from, top: line, width: length, height: girth }
					: { left: line, top: from, width: girth, height: length }
			}
		>
			<div
				className={`absolute bg-thread ${flat ? "inset-x-0 h-px" : "inset-y-0 w-px"}`}
				style={flat ? { top: SPAN_TICK_PX } : { left: SPAN_TICK_PX }}
			/>
		</div>
	);
}

function MeasurePart({ part }: { part: SpacingPart }) {
	const dimmed = part.collapsed === true;
	return (
		<div data-measure-part={part.kind} className="flex items-baseline gap-2 whitespace-nowrap">
			<span className={`w-9 shrink-0 text-right ${dimmed ? "text-muted/50" : "text-text"}`}>
				{dimmed ? "—" : round(part.px)}
			</span>
			<span className={dimmed ? "text-muted/50" : part.token === undefined ? "text-muted" : "text-thread"}>
				{part.token ?? (part.kind === "residual" ? "residual" : "no class")}
			</span>
			{part.owner === undefined ? null : (
				<span className="text-muted">
					on {part.owner.parent === true ? "parent " : ""}
					{part.owner.tag}
				</span>
			)}
			{dimmed ? <span className="text-muted/50">collapsed</span> : null}
		</div>
	);
}

/** Pixels the way every readout on this canvas says them: whole, unless they are not. */
function round(px: number): string {
	const whole = Math.round(px * 10) / 10;
	return `${Number.isInteger(whole) ? whole : whole.toFixed(1)}px`;
}

/**
 * The element outline: 1px thread at 2px offset, no handles — faded previews.
 *
 * `lit` is the cursor sitting on this element's chip in the composer, which fills the
 * box rather than thickening its edge: the stroke is the system page's law, and a
 * fill is the lightest thing that says *this one* among five identical outlines.
 *
 */
function ElementOutline({ box, radius, faded, lit }: { box: Box; radius: number; faded?: boolean; lit?: boolean }) {
	return (
		<div
			className={`absolute border border-thread ${faded === true ? "opacity-50" : ""} ${lit === true ? "bg-thread/10" : ""}`}
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
