import { memo, type ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { KaffeHome } from "shared/ui/demo/kaffe-home";
import { type Mark, UnseenMark } from "shared/ui/spool/unseen-mark";
import { type Cam, FRAMES, type FrameDef, onScreen, PHONE_W, type Rect, rectOf, type Screen } from "./model";

/**
 * The canvas as spool draws it, at any camera: every frame at its place and size,
 * its label riding above it at a size that never scales, the selection in thread.
 * A take hands in what each tile wears and draws everything else over the top.
 */

export interface TileDeco {
	/** a frame the take is holding back, drawn under its usual ink */
	readonly opacity?: number;
	/** which revision of the design the tile shows; a take that holds frames picks it */
	readonly version?: number;
	readonly mark?: Mark | undefined;
	/** what sits at the far end of the label row */
	readonly labelEnd?: ReactNode;
	/** the label's own words lit, for a frame that concerns you */
	readonly lit?: boolean;
}

/** one tile's design at a revision: the coffee screens, with what each write added */
const FrameContent = memo(function FrameContent({ screen, version }: { screen: Screen; version: number }) {
	const label = version === 0 ? undefined : version % 2 === 1 ? "Continue to pay" : "Pay with card";
	return (
		<div className="relative h-[520px] w-[240px]">
			{screen === "home" ? <KaffeHome /> : <CoffeeScreen screen={screen} actionLabel={label} />}
			{version > 0 && (screen === "receipt" || screen === "home") ? (
				<div className="absolute top-[62px] right-4 left-4 flex h-[22px] items-center justify-between rounded-[5px] bg-[#F1F1F2] px-2 font-[Instrument_Sans] text-[#17171A] text-[9px]">
					<span>{version % 2 === 1 ? "Ready at 08:40" : "Pickup at the bar"}</span>
					<span className="text-[#86868B]">Torsgatan</span>
				</div>
			) : null}
		</div>
	);
});

export function Field({
	cam,
	selected,
	entered,
	deco,
	children,
}: {
	cam: Cam;
	selected?: string | undefined;
	/** the frame you are inside, whose label becomes the live chip */
	entered?: string | undefined;
	deco?: ((frame: FrameDef) => TileDeco) | undefined;
	children?: ReactNode;
}) {
	return (
		<div className="absolute inset-0 overflow-hidden">
			{FRAMES.map((frame) => {
				const rect = rectOf(cam, frame.name);
				if (!onScreen(rect, 40)) return null;
				return (
					<Tile
						key={frame.name}
						frame={frame}
						rect={rect}
						k={cam.k}
						selected={frame.name === selected}
						entered={frame.name === entered}
						deco={deco?.(frame) ?? {}}
					/>
				);
			})}
			{children}
		</div>
	);
}

function Tile({
	frame,
	rect,
	k,
	selected,
	entered,
	deco,
}: {
	frame: FrameDef;
	rect: Rect;
	k: number;
	selected: boolean;
	entered: boolean;
	deco: TileDeco;
}) {
	const scale = (PHONE_W * k) / 240;
	const labelled = rect.w >= 56;
	return (
		<>
			{labelled ? (
				<div
					className="absolute flex items-center gap-1.5 whitespace-nowrap"
					style={{ left: rect.x, top: rect.y - 24, width: rect.w, height: 18 }}
				>
					{entered ? (
						<span className="rounded-xs bg-thread px-2 py-[1px] text-on-thread type-detail">live · esc exits</span>
					) : (
						<>
							{deco.mark === undefined ? null : <UnseenMark mark={deco.mark} className="-ml-0.5" />}
							<span
								className={cn(
									"min-w-0 truncate type-value",
									selected ? "text-thread" : deco.lit === true || deco.mark !== undefined ? "text-text" : "text-muted",
								)}
							>
								{frame.name}
							</span>
						</>
					)}
					{deco.labelEnd === undefined ? null : (
						<span className="ml-auto flex min-w-0 shrink-[4] items-center overflow-hidden whitespace-nowrap">{deco.labelEnd}</span>
					)}
				</div>
			) : null}
			<div
				className="absolute overflow-hidden transition-opacity duration-500 ease-out"
				style={{
					left: rect.x,
					top: rect.y,
					width: rect.w,
					height: rect.h,
					opacity: deco.opacity ?? 1,
					borderRadius: Math.max(2, 8 * scale),
				}}
			>
				<div className="origin-top-left" style={{ transform: `scale(${scale})` }}>
					<FrameContent screen={frame.screen} version={deco.version ?? 0} />
				</div>
			</div>
			{selected || entered ? (
				<div
					className="pointer-events-none absolute border-[1.5px] border-thread"
					style={{
						left: rect.x - 3,
						top: rect.y - 3,
						width: rect.w + 6,
						height: rect.h + 6,
						borderRadius: Math.max(3, 8 * scale + 3),
					}}
				/>
			) : null}
		</>
	);
}
