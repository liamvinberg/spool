import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";
import { FRAME_H, FRAME_W, type FramePlace, frames } from "shared/ui/explore/cloud/cursors-wild/script";

/**
 * The one team canvas every take draws on: the app page of a coffee shop's
 * prototype, three frames, the dock shut so the field has the room. A take
 * hands in what it draws over the frames, beside their labels and over the
 * whole field, and the world layer carries the camera so that following
 * somebody moves everything in it together.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt"], active: true, open: true },
	{ name: "site", frames: ["landing", "pricing"] },
	{ name: "directing", frames: ["annotate"] },
];

export function Scene({
	t,
	header,
	camera = { x: 0, y: 0, k: 1 },
	labelEnd,
	labelLit,
	onFrame,
	world,
	overlay,
	panel,
}: {
	t: number;
	header: ReactNode;
	camera?: { x: number; y: number; k: number } | undefined;
	/** drawn at the far end of a frame's label row */
	labelEnd?: ((place: FramePlace) => ReactNode) | undefined;
	/** the label reads as hovered */
	labelLit?: ((place: FramePlace) => boolean) | undefined;
	/** drawn over a frame, frame-relative */
	onFrame?: ((place: FramePlace) => ReactNode) | undefined;
	/** drawn in world coordinates, above the frames */
	world?: ReactNode;
	/** drawn against the viewport, outside the camera */
	overlay?: ReactNode;
	/** a panel hanging from the top right of the field, under the faces */
	panel?: ReactNode;
}) {
	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe"]} zoom={`${Math.round(camera.k * 72)}%`} headerAccessory={header}>
			<CanvasChrome pages={PAGES} rail={null}>
				<div
					className="absolute inset-0 origin-top-left"
					style={{ transform: `scale(${camera.k}) translate(${-camera.x}px, ${-camera.y}px)` }}
				>
					{frames(t).map((place) => (
						<div key={place.name} className="absolute" style={{ left: place.x, top: place.y, width: FRAME_W }}>
							<div className="absolute bottom-full left-0 flex w-full items-center gap-1.5 pb-1.5">
								<span
									className={cn(
										"min-w-0 truncate type-value transition-colors duration-150",
										labelLit?.(place) === true ? "text-text" : "text-muted",
									)}
								>
									{place.name}
								</span>
								<span className="ml-auto flex shrink-0 items-center">{labelEnd?.(place)}</span>
							</div>
							<div className="relative" style={{ height: FRAME_H }}>
								<CoffeeScreen screen={place.name} />
								{onFrame?.(place)}
							</div>
						</div>
					))}
					{world}
				</div>
				{overlay}
				{panel === undefined || panel === null ? null : <div className="absolute top-2 right-2 z-30">{panel}</div>}
			</CanvasChrome>
		</SpoolShell>
	);
}

/** somebody else's selection: their colour, their weight, none of your handles */
export function TheirSelection({ color }: { color: string }) {
	return (
		<div
			className="pointer-events-none absolute -inset-[3px] rounded-[14px] border-[1.5px]"
			style={{ borderColor: color }}
		/>
	);
}
