import { type ReactNode, useRef } from "react";
import type { Unseen } from "../../daemon/seen";
import { pageName } from "../../page-path";
import { type ShareChip, ShareChipButton } from "../../runtime/share-panel";
import type { Box, NearScreen } from "./camera";
import { type CameraStore, useCameraFollow, useChanged } from "./camera-store";
import { UnseenMark } from "./unseen-mark";

export function FrameLabel({
	name,
	frame,
	camera,
	near,
	entered,
	selected,
	hovered,
	unseen,
	onPlay,
	sharing,
}: {
	name: string;
	/** the frame's link, said at the one size the canvas keeps legible at any zoom */
	sharing?: { chip: ShareChip; open: () => void; expanded: boolean } | undefined;
	/** the frame the label names, in world units */
	frame: Box;
	/** The label holds one size on screen through the zoom, so it follows the camera (#81). */
	camera: CameraStore;
	/** whether the label is worth laying out while the camera moves */
	near: NearScreen;
	entered: boolean;
	selected: boolean;
	hovered: boolean;
	/**
	 * Nobody has looked at this frame, or nobody has since it moved. The mark rides
	 * the label because the label is the one thing on the field that does not scale:
	 * a disc painted on the frame itself shrinks with the zoom, and being zoomed out
	 * is when you most need to know which of these is new.
	 */
	unseen?: Unseen | undefined;
	/** Play this frame. Offered on the selection, where the attention already is. */
	onPlay?: () => void;
}) {
	const place = useRef<HTMLDivElement | null>(null);
	const label = useRef<HTMLDivElement | null>(null);
	const changed = useChanged();
	// The label stands in screen pixels, in a field the camera only translates
	// (`LabelField`): where its frame's top left falls at this zoom, as wide as
	// the frame draws. Written here rather than rendered, and only when the
	// zoom or the frame moved: a pan writes nothing, since the field carries
	// every label at once, and a zoom step places again the labels on screen
	// and nothing else, the rest once the camera rests.
	useCameraFollow(
		camera,
		(at, moving) => {
			const at_ = place.current;
			const el = label.current;
			if (at_ === null || el === null || (moving && !near(at, frame)) || !changed(at.k, frame.x, frame.y, frame.w)) {
				return;
			}
			at_.style.transform = `translate(${frame.x * at.k}px, ${frame.y * at.k}px)`;
			el.style.width = `${frame.w * at.k}px`;
		},
		[frame.x, frame.y, frame.w, frame.h, near],
	);
	// the label sits on its own page, which already says where it is (#336)
	const leaf = pageName(name);

	return (
		<div ref={place} className="pointer-events-none absolute top-0 left-0 h-0">
			<div
				ref={label}
				data-frame-label={name}
				className="pointer-events-auto absolute bottom-full left-0 whitespace-nowrap"
			>
				{entered ? (
					<div className="flex items-center pb-2.5">
						<span className="rounded-xs bg-thread-strong px-2 py-[3px] text-on-thread type-detail">
							live · esc exits
						</span>
					</div>
				) : (
					<div className="flex w-full min-w-0 items-center gap-1.5 pb-2.5">
						{unseen !== undefined && <UnseenMark mark={unseen} className="-ml-0.5" />}
						<span
							className={`min-w-0 truncate type-value ${
								selected ? "text-thread-strong" : hovered || unseen !== undefined ? "text-text" : "text-muted"
							}`}
						>
							{leaf}
						</span>
						{/* the selection's own verb, at the far end of its own row: no
					    travelling to a corner of the chrome to act on what is right
					    here. Ghost until wanted — the label is not a toolbar. */}
						{sharing && <ShareChipButton chip={sharing.chip} expanded={sharing.expanded} onOpen={sharing.open} />}
						{selected && onPlay !== undefined && (
							<button
								type="button"
								aria-label={`Play ${leaf}`}
								className="ml-auto flex shrink-0 items-center gap-1 rounded-xs px-1 text-muted transition-colors hover:text-thread-strong type-detail"
								onPointerDown={(event) => {
									event.stopPropagation();
									onPlay();
								}}
								onDoubleClick={(event) => event.stopPropagation()}
							>
								<svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden="true">
									<path d="M2 1.2 8.4 5 2 8.8Z" />
								</svg>
								play
							</button>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

/**
 * The field every frame label stands in (#81): screen pixels, carried by the
 * camera's translation alone. A pan moves it whole, as one composited layer,
 * and writes nothing to any label; a zoom places each label again
 * (`FrameLabel`).
 *
 * Labels used to stand in the frames' own field, each counter-scaled by 1/k
 * to hold its size. Under the picture layer's canvas that made every label
 * a composited layer of its own (each overlaps the canvas, and no two scaled
 * labels can share a layer), five hundred of them on a thousand-frame
 * overview and tens of milliseconds a zoom step deciding them. Translated
 * rather than scaled, they all paint into this one.
 */
export function LabelField({ camera, children }: { camera: CameraStore; children?: ReactNode }) {
	const field = useRef<HTMLDivElement | null>(null);
	useCameraFollow(
		camera,
		({ x, y }) => {
			if (field.current !== null) field.current.style.transform = `translate(${x}px, ${y}px)`;
		},
		[],
	);
	return (
		<div ref={field} data-canvas-labels="" className="pointer-events-none absolute top-0 left-0">
			{children}
		</div>
	);
}
