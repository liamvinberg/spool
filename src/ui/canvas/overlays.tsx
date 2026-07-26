import { cellsForPx } from "../../term/cells";
import type { Camera, ProjectedFrame } from "../api";
import type { Box } from "./camera";
import { frameSourcePath } from "./pages";
import { type PickedHit, parseStampRef } from "./protocol";

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

/** The (frame, selector) pair as one identity — picks match on nothing else. */
export const pickKey = (frame: string, selector: string): string => `${frame}\0${selector}`;

/** The would-be click target under the cursor (#37) — outlined, never selected. */
export interface ElementPreview {
	frame: string;
	selector: string;
	rect: { x: number; y: number; w: number; h: number };
	radius: number;
}

/** The frame under the pointer. Hidden hovers linger only to fade their ring. */
export interface FrameHover {
	frame: string;
	visible: boolean;
}

export interface Guides {
	v: number[];
	h: number[];
}

export const NO_GUIDES: Guides = { v: [], h: [] };

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
	preview,
	guides,
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
	preview: ElementPreview | null;
	guides: Guides;
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
	const previewShown =
		preview !== null && !picked.some((pick) => pick.frame === preview.frame && pick.selector === preview.selector)
			? preview
			: null;

	return (
		<div className="pointer-events-none absolute inset-0">
			{/* snap guides: alignment is meaning, so they carry the thread */}
			{guides.v.map((x) => (
				<div key={`v${x}`} className="absolute inset-y-0 w-px bg-thread" style={{ left: x * k + camera.x }} />
			))}
			{guides.h.map((y) => (
				<div key={`h${y}`} className="absolute inset-x-0 h-px bg-thread" style={{ top: y * k + camera.y }} />
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
						className="absolute border-[1.5px] border-thread"
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
				return <ElementOutline key={pickKey(pick.frame, pick.selector)} box={box} radius={pick.radius * k} />;
			})}

			{previewShown !== null &&
				(() => {
					const box = elementBox(previewShown.frame, previewShown.rect);
					if (box === undefined) return null;
					return <ElementOutline box={box} radius={previewShown.radius * k} faded />;
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

/** The element outline: 1px thread at 2px offset, no handles — faded previews. */
function ElementOutline({ box, radius, faded }: { box: Box; radius: number; faded?: boolean }) {
	return (
		<div
			className={`absolute border border-thread ${faded === true ? "opacity-50" : ""}`}
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
