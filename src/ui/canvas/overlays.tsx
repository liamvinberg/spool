import type { Camera, ProjectedFrame } from "../api";
import type { Box } from "./camera";
import { frameSourcePath, frameSourceRel, pageOf, ROOT_PAGE } from "./pages";
import type { PickedHit } from "./protocol";

/**
 * Screen-space selection furniture (#23), drawn over the transformed field so
 * strokes stay hairline at any zoom. The system page's laws verbatim: ring
 * 1.5px thread at 3px offset radius +2; handles 8px on-thread fill with
 * thread border; readout thread fill, on-thread mono 10; element outline 1px
 * thread at 2px offset, no handles; context chip raised, mono 2xs,
 * path:line · Open in editor. Knobs render on corners only — the sides carry
 * invisible grab bands, Figma's pattern for single-axis resize.
 */

export interface PickedSelection extends PickedHit {
	frame: string;
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
	picked,
	guides,
	marquee,
	shellRadius,
	onOpenEditor,
}: {
	camera: Camera;
	frames: ProjectedFrame[];
	selected: readonly string[];
	entered: string | null;
	picked: PickedSelection | null;
	guides: Guides;
	/** Normalized screen-space rect while a marquee drag is live. */
	marquee: Box | null;
	shellRadius: number;
	onOpenEditor: (picked: PickedSelection) => void;
}) {
	const k = camera.k;
	const screenRect = (box: Box): Box => ({
		x: box.x * k + camera.x,
		y: box.y * k + camera.y,
		w: box.w * k,
		h: box.h * k,
	});
	const ringRadius = Math.min(12, shellRadius * k) + 2;

	const ringed = [...new Set(entered === null ? selected : [...selected, entered])];
	const single = selected.length === 1 && entered === null ? frames.find((f) => f.name === selected[0]) : undefined;
	const pickedFrame = picked === null ? undefined : frames.find((f) => f.name === picked.frame);
	const pickedPage = pickedFrame === undefined ? ROOT_PAGE : pageOf(pickedFrame);

	return (
		<div className="pointer-events-none absolute inset-0">
			{/* snap guides: alignment is meaning, so they carry the thread */}
			{guides.v.map((x) => (
				<div key={`v${x}`} className="absolute inset-y-0 w-px bg-thread" style={{ left: x * k + camera.x }} />
			))}
			{guides.h.map((y) => (
				<div key={`h${y}`} className="absolute inset-x-0 h-px bg-thread" style={{ top: y * k + camera.y }} />
			))}

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
									{Math.round(single.w)} × {Math.round(single.h)}
								</span>
							</div>
						</>
					);
				})()}

			{picked !== null && pickedFrame !== undefined && (
				<>
					{(() => {
						const rect = screenRect({
							x: pickedFrame.x + picked.rect.x,
							y: pickedFrame.y + picked.rect.y,
							w: picked.rect.w,
							h: picked.rect.h,
						});
						return (
							<div
								className="absolute border border-thread"
								style={{
									left: rect.x - 2,
									top: rect.y - 2,
									width: rect.w + 4,
									height: rect.h + 4,
									borderRadius: picked.radius * k + 2,
								}}
							/>
						);
					})()}
					{(() => {
						const rect = screenRect(pickedFrame);
						return (
							<div
								className="pointer-events-auto absolute flex items-center gap-1.5 rounded-xs border border-border-raised bg-raised px-2 py-unit"
								style={{ left: rect.x, top: rect.y + rect.h + 12 }}
								onPointerDown={(event) => event.stopPropagation()}
							>
								<span className="font-mono text-2xs text-muted leading-3">{chipLabel(picked, pickedPage)}</span>
								<span className="font-mono text-2xs text-muted leading-3">·</span>
								<button
									type="button"
									className="font-mono text-2xs text-text leading-3 hover:text-thread"
									onClick={() => onOpenEditor(picked)}
								>
									Open in editor
								</button>
							</div>
						);
					})()}
				</>
			)}

			{marquee !== null && (
				<div
					className="absolute border border-thread bg-thread/10"
					style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
				/>
			)}
		</div>
	);
}

/** "frames/cart/frame.tsx:38" — the stamp minus its column, or the frame file. */
function chipLabel(picked: PickedSelection, page: string): string {
	const stamp = parseStamp(picked);
	if (stamp === undefined) return frameSourceRel(picked.frame, page);
	return `${stamp.rel}:${stamp.line}`;
}

/** The editor target off the selection (#7: path:line from the payload). The
 * stampless fallback needs the frame's page — the folder moved with it (#39). */
export function editorTarget(picked: PickedSelection, page: string): { path: string; line?: number } {
	const stamp = parseStamp(picked);
	if (stamp === undefined) return { path: frameSourcePath(picked.frame, page) };
	return { path: `design/${stamp.rel}`, line: stamp.line };
}

function parseStamp(picked: PickedSelection): { rel: string; line: number } | undefined {
	const [, rel, line] = picked.source?.match(/^(.+):(\d+):(\d+)$/) ?? [];
	if (rel === undefined || line === undefined) return undefined;
	return { rel, line: Number.parseInt(line, 10) };
}
