import { useRef } from "react";
import { coverUrl } from "../api";
import { FolderIcon } from "../icons";
import { type CameraStore, useCameraFollow } from "./camera-store";
import type { PageObject } from "./page-objects";

/**
 * A page standing on the field that holds it (#265).
 *
 * It is drawn as its own canvas: the frames under it, at their own geometry,
 * scaled into one box. That is the whole claim — a page holds frames, so it
 * belongs on the field with them, and a page of pages and a page nobody has
 * written into stop wearing the same picture.
 *
 * Nothing about it is fetched. Every cover is the one the projection already
 * addressed, so a frame edited two levels down redraws this for free, and a
 * frame with no cover yet draws as a filled rect at its real size — the same
 * fact `frame-shell.tsx`'s placeholder states about a frame.
 *
 * No handles, ever. A frame's size is authored and a page's is derived from
 * what is inside it, so a corner grab would scale a picture and mean nothing
 * about the project. The selection is a ring and no more.
 */
export function PageObjectView({
	project,
	object,
	camera,
	selected,
	hovered,
}: {
	project: string;
	object: PageObject;
	/** The ring is drawn at one weight through the zoom, so it follows the camera (#81). */
	camera: CameraStore;
	selected: boolean;
	hovered: boolean;
}) {
	const { fit } = object;
	const ring = useRef<HTMLSpanElement | null>(null);
	// the ring comes and goes with the selection, so what was drawn is kept per element
	const drawn = useRef<{ ring: HTMLSpanElement; k: number } | null>(null);
	useCameraFollow(
		camera,
		({ k }) => {
			const el = ring.current;
			if (el === null || (drawn.current?.ring === el && drawn.current.k === k)) return;
			drawn.current = { ring: el, k };
			el.style.inset = `${-3 / k}px`;
			el.style.borderWidth = `${1.5 / k}px`;
		},
		[selected],
	);
	return (
		<div
			data-page-object={object.page}
			className="absolute"
			style={{ transform: `translate(${object.x}px, ${object.y}px)`, width: object.w, height: object.h }}
		>
			<div
				className={`absolute inset-0 overflow-hidden rounded-[2px] border bg-canvas ${
					selected ? "border-thread" : hovered ? "border-border-raised" : "border-border"
				}`}
			>
				{object.composition.frames.map((frame) => (
					<div
						key={frame.name}
						className="absolute bg-surface"
						style={{
							left: fit.dx + frame.x * fit.scale,
							top: fit.dy + frame.y * fit.scale,
							width: frame.w * fit.scale,
							height: frame.h * fit.scale,
						}}
					>
						{frame.hash !== undefined && (
							<img
								src={coverUrl(project, frame.name, frame.hash)}
								alt=""
								draggable={false}
								className="h-full w-full object-contain object-left-top"
							/>
						)}
					</div>
				))}
			</div>

			{selected && <span ref={ring} className="pointer-events-none absolute rounded-[3px] border-thread" />}
		</div>
	);
}

/**
 * The page's name over its box, at the size a frame's label rides at.
 *
 * Its own layer above every object, for the reason the frame labels have one: a
 * transformed box is its own stacking context, so a label kept inside it would
 * be painted over by the next object along.
 *
 * The name truncates to the page's own width, the way a frame's label does. A
 * label wider than what it names runs into the next page along and the row of
 * them stops being readable at all, which costs more than the tail of one name.
 */
export function PageObjectLabel({
	object,
	camera,
	selected,
	hovered,
}: {
	object: PageObject;
	/** The name holds one size on screen through the zoom, the way a frame's does (#81). */
	camera: CameraStore;
	selected: boolean;
	hovered: boolean;
}) {
	const box = useRef<HTMLDivElement | null>(null);
	const label = useRef<HTMLDivElement | null>(null);
	const drawn = useRef<{ k: number; width: number } | null>(null);
	useCameraFollow(
		camera,
		({ k }) => {
			if (box.current === null || label.current === null) return;
			if (drawn.current?.k === k && drawn.current.width === object.w) return;
			drawn.current = { k, width: object.w };
			box.current.style.width = `${object.w * k}px`;
			label.current.style.transform = `scale(${1 / k})`;
		},
		[object.w],
	);
	return (
		<div
			ref={box}
			className="pointer-events-none absolute h-0"
			style={{ transform: `translate(${object.x}px, ${object.y}px)` }}
		>
			<div
				ref={label}
				className="absolute bottom-full left-0 flex w-full min-w-0 origin-bottom-left items-center gap-1.5 whitespace-nowrap pb-2.5"
			>
				<FolderIcon className={`h-3 w-3 shrink-0 ${selected ? "text-thread-strong" : "text-muted"}`} />
				<span
					className={`min-w-0 truncate type-value ${
						selected ? "text-thread-strong" : hovered ? "text-text" : "text-muted"
					}`}
				>
					{object.name}
				</span>
				<span className="shrink-0 pl-1 text-muted type-detail">{object.count}</span>
			</div>
		</div>
	);
}
