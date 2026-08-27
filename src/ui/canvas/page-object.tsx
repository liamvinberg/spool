import { coverUrl } from "../api";
import { FolderIcon } from "../icons";
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
	k,
	selected,
	hovered,
}: {
	project: string;
	object: PageObject;
	/** The camera's zoom, which the label counter-scales against. */
	k: number;
	selected: boolean;
	hovered: boolean;
}) {
	const { fit } = object;
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

			{selected && (
				<span
					className="pointer-events-none absolute rounded-[3px] border-thread"
					style={{ inset: -3 / k, borderWidth: 1.5 / k }}
				/>
			)}
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
 * The name spills past a narrow page rather than truncating. A frame's label
 * can be cut because the picture under it still says which frame it is, and a
 * page's picture says no such thing.
 */
export function PageObjectLabel({
	object,
	k,
	selected,
	hovered,
}: {
	object: PageObject;
	k: number;
	selected: boolean;
	hovered: boolean;
}) {
	return (
		<div
			className="pointer-events-none absolute h-0"
			style={{ transform: `translate(${object.x}px, ${object.y}px)`, width: object.w * k }}
		>
			<div
				className="absolute bottom-full left-0 flex origin-bottom-left items-center gap-1.5 whitespace-nowrap pb-2.5"
				style={{ transform: `scale(${1 / k})` }}
			>
				<FolderIcon className={`h-3 w-3 shrink-0 ${selected ? "text-thread" : "text-muted"}`} />
				<span
					className={`shrink-0 font-mono text-sm leading-4 ${
						selected ? "text-thread" : hovered ? "text-text" : "text-muted"
					}`}
				>
					{object.name}
				</span>
				<span className="shrink-0 pl-1 font-mono text-2xs text-muted leading-3">{object.count}</span>
			</div>
		</div>
	);
}
