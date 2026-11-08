import { useMemo } from "react";
import { pageName } from "../../page-path";
import type { ProjectedFrame } from "../api";
import { cn } from "../cn";
import { FolderIcon } from "../icons";
import { Thumbnail } from "../primitives/display";
import { ageOf } from "./frame-find";
import { pageLabel, pageOf } from "./pages";

/**
 * The finder's right side (finder-wake, task 443): the picked frame large, from
 * the still the photo booth keeps of it, and under it the page it sits on as a
 * small map, every frame of the page in its place and the picked one ringed.
 * The ring eases from frame to frame while the pick stays on one page; a pick on
 * another page brings that page's map in whole.
 */

/** where a frame's still is read: the daemon's covers */
export type StillOf = (frame: ProjectedFrame) => string | undefined;

/** the preview's picture box, inside its side's padding */
const PICTURE_H = 268;
const MAP_H = 84;

export function FindPreview({
	frame,
	page,
	w,
	now,
	stillOf,
}: {
	frame: ProjectedFrame | undefined;
	/** every frame on the picked frame's page */
	page: readonly ProjectedFrame[];
	w: number;
	/** the moment the finder opened: ages hold still while it is up */
	now: number;
	stillOf: StillOf;
}) {
	if (frame === undefined) {
		return (
			<div
				className="flex shrink-0 items-center justify-center border-line-default border-l bg-surface-canvas text-secondary type-detail"
				style={{ width: w }}
			>
				no frame to show
			</div>
		);
	}
	const age = ageOf(frame.born, now);
	const scale = fitScale(frame, w - 48, PICTURE_H);
	return (
		<div className="flex shrink-0 flex-col border-line-default border-l bg-surface-canvas" style={{ width: w }}>
			<div className="flex h-[296px] shrink-0 items-center justify-center">
				<div key={frame.name} className="animate-place-in">
					<Picture src={stillOf(frame)} w={frame.w * scale} h={frame.h * scale} className="rounded-sm" />
				</div>
			</div>
			<div className="flex flex-col gap-1 px-5 pb-4">
				<span className="truncate text-primary type-value">{pageName(frame.name)}</span>
				<span className="text-secondary type-detail">
					{Math.round(frame.w)} × {Math.round(frame.h)}
					{age === undefined ? null : `, made ${age === "now" ? "just now" : `${age} ago`}`}
				</span>
			</div>
			<WhereItSits frame={frame} page={page} w={w - 40} stillOf={stillOf} />
		</div>
	);
}

function WhereItSits({
	frame,
	page,
	w,
	stillOf,
}: {
	frame: ProjectedFrame;
	page: readonly ProjectedFrame[];
	w: number;
	stillOf: StillOf;
}) {
	const place = useMemo(() => {
		const minX = Math.min(...page.map((one) => one.x));
		const minY = Math.min(...page.map((one) => one.y));
		const width = Math.max(...page.map((one) => one.x + one.w)) - minX;
		const height = Math.max(...page.map((one) => one.y + one.h)) - minY;
		const scale = Math.min(w / Math.max(1, width), MAP_H / Math.max(1, height));
		return {
			scale,
			x: (w - width * scale) / 2 - minX * scale,
			y: (MAP_H - height * scale) / 2 - minY * scale,
		};
	}, [page, w]);
	// the page's frames, drawn once per page: a move of the pick moves only the ring and the lit copy
	const tiles = useMemo(
		() => page.map((one) => <Tile key={one.name} frame={one} at={place} src={stillOf(one)} className="opacity-35" />),
		[page, place, stillOf],
	);
	const ease = "var(--transition-duration-base) var(--ease-snap)";
	return (
		<div className="mt-auto flex flex-col gap-2.5 border-line-default border-t px-5 pt-3 pb-4">
			<span className="flex items-center justify-between text-secondary type-detail">
				<span className="flex min-w-0 items-center gap-1.5">
					<FolderIcon className="h-3 w-3 shrink-0 text-secondary/60" />
					<span className="truncate text-primary">{pageLabel(pageOf(frame))}</span>
				</span>
				<span className="shrink-0">{page.length === 1 ? "1 frame" : `${page.length} frames`}</span>
			</span>
			<div key={pageOf(frame)} className="relative animate-find-in" style={{ width: w, height: MAP_H }}>
				{tiles}
				<Tile frame={frame} at={place} src={stillOf(frame)} />
				<div
					className="pointer-events-none absolute rounded-[3px] border-[1.5px] border-accent"
					style={{
						left: place.x + frame.x * place.scale - 3,
						top: place.y + frame.y * place.scale - 3,
						width: frame.w * place.scale + 6,
						height: frame.h * place.scale + 6,
						transition: `left ${ease}, top ${ease}, width ${ease}, height ${ease}`,
					}}
				/>
			</div>
		</div>
	);
}

function Tile({
	frame,
	at,
	src,
	className,
}: {
	frame: ProjectedFrame;
	at: { scale: number; x: number; y: number };
	src: string | undefined;
	className?: string;
}) {
	return (
		<div
			className={cn("absolute", className)}
			style={{ left: at.x + frame.x * at.scale, top: at.y + frame.y * at.scale }}
		>
			<Picture src={src} w={frame.w * at.scale} h={frame.h * at.scale} className="rounded-[1px]" />
		</div>
	);
}

/**
 * A frame's still at a size, the Pages list's picture (`Thumbnail`): the still
 * has the frame's own shape, so a box of that shape shows all of it. Off screen
 * in a long list, it waits to be scrolled to before it loads.
 */
export function Picture({
	src,
	w,
	h,
	lazy = false,
	className,
}: {
	src: string | undefined;
	w: number;
	h: number;
	lazy?: boolean;
	className?: string;
}) {
	return (
		<Thumbnail aria-hidden="true" className={cn("pointer-events-none", className)} style={{ width: w, height: h }}>
			{src === undefined ? undefined : (
				<img
					src={src}
					alt=""
					draggable={false}
					loading={lazy ? "lazy" : undefined}
					decoding="async"
					className="size-full object-cover object-top"
				/>
			)}
		</Thumbnail>
	);
}

/** the largest scale that fits a frame inside a box */
export function fitScale(frame: { w: number; h: number }, w: number, h: number): number {
	return Math.min(w / Math.max(1, frame.w), h / Math.max(1, frame.h));
}
