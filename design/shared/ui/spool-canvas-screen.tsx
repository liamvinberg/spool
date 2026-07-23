import { useState } from "react";
import { cn } from "../lib/utils";
import { CoffeeScreen, type CoffeeScreenName, type CoffeeScreenScale } from "./coffee-screens";
import { SpoolShell } from "./spool-shell";

export type CanvasSpecimen = "live" | "design" | "zoomed-out" | "menu-toast";

interface SpoolCanvasScreenProps {
	designTarget?: string;
	homeTarget?: string;
	liveTarget?: string;
	playTarget?: string;
	variant: CanvasSpecimen;
}

export function SpoolCanvasScreen({
	designTarget,
	homeTarget,
	liveTarget,
	playTarget,
	variant,
}: SpoolCanvasScreenProps) {
	const design = variant === "design";
	return (
		<SpoolShell
			activeTab="kaffe"
			homeTarget={homeTarget}
			liveTarget={liveTarget}
			designTarget={designTarget}
			mode={design ? "design" : "live"}
			playTarget={playTarget}
			zoom={variant === "zoomed-out" ? "54%" : "72%"}
		>
			<CanvasStage playTarget={playTarget} variant={variant} />
		</SpoolShell>
	);
}

function CanvasStage({ playTarget, variant }: { playTarget?: string; variant: CanvasSpecimen }) {
	const [toastVisible, setToastVisible] = useState(true);
	if (variant === "menu-toast") {
		return (
			<div className="relative h-full overflow-hidden bg-canvas">
				<ThreadSvg variant={variant} />
				<CanvasFrame left={180} top={120} screen="menu" paused />
				<CanvasFrame left={640} top={100} screen="receipt" paused />
				<div className="absolute left-[896px] top-[320px] flex w-[200px] flex-col rounded-md border border-border-raised bg-raised p-unit">
					<button
						type="button"
						data-go={playTarget}
						className="flex h-[30px] items-center rounded-sm px-3 text-left text-base leading-[14px]"
					>
						Play from here
					</button>
					<button
						type="button"
						className="flex h-[30px] items-center rounded-sm bg-surface px-3 text-left text-base leading-[14px]"
					>
						Open in editor
					</button>
					<div className="mx-auto h-px w-[176px] bg-border-raised" />
					<button
						type="button"
						onClick={() => setToastVisible(true)}
						className="flex h-[30px] items-center rounded-sm px-3 text-left text-base leading-[14px]"
					>
						Move to Trash
					</button>
				</div>
				{toastVisible ? (
					<div className="absolute left-[610px] top-[786px] flex items-center gap-4 rounded-md border border-border-raised bg-raised px-3.5 py-2.5">
						<span className="text-base leading-base">Moved cart to Trash</span>
						<button
							type="button"
							onClick={() => setToastVisible(false)}
							className="font-medium text-base text-thread leading-base"
						>
							Undo
						</button>
						<span className="font-mono text-muted text-xs leading-xs">⌘Z</span>
					</div>
				) : null}
			</div>
		);
	}

	const scale: CoffeeScreenScale = variant === "design" ? "design" : "canvas";
	const gap = variant === "zoomed-out" ? 10 : 6;
	return (
		<div className="relative h-full overflow-hidden bg-canvas">
			<ThreadSvg variant={variant} />
			<CanvasFrame
				left={140}
				top={variant === "design" ? 128 : 150}
				gap={gap}
				screen="menu"
				scale={scale}
				paused={variant !== "design"}
			/>
			<CanvasFrame
				left={600}
				top={variant === "design" ? 168 : 190}
				gap={gap}
				screen="cart"
				scale={scale}
				selected={variant === "live"}
				elementSelected={variant === "design"}
				booting={variant === "zoomed-out"}
				paused={variant === "zoomed-out"}
			/>
			<CanvasFrame
				left={1060}
				top={variant === "design" ? 108 : 130}
				gap={gap}
				screen="receipt"
				scale={scale}
				paused={variant !== "design"}
			/>
		</div>
	);
}

function CanvasFrame({
	booting = false,
	elementSelected = false,
	gap = 6,
	left,
	paused = false,
	scale = "canvas",
	screen,
	selected = false,
	top,
}: {
	booting?: boolean;
	elementSelected?: boolean;
	gap?: number;
	left: number;
	paused?: boolean;
	scale?: CoffeeScreenScale;
	screen: CoffeeScreenName;
	selected?: boolean;
	top: number;
}) {
	return (
		<div className="absolute flex flex-col" style={{ left, top, gap }}>
			<div className="flex h-4 items-center gap-1.5 font-mono text-sm leading-xs">
				{paused ? <span className="text-2xs text-muted">▸</span> : null}
				<span className={cn(selected ? "text-thread" : "text-muted")}>{screen}</span>
			</div>
			<div className="relative h-[520px] w-[240px]">
				<CoffeeScreen screen={screen} scale={scale} />
				{selected ? <FrameSelection /> : null}
				{elementSelected ? (
					<>
						<div className="pointer-events-none absolute bottom-[13px] left-[13px] h-[42px] w-[214px] rounded-[10px] border border-thread" />
						<div className="absolute left-0 top-[532px] flex items-center gap-1.5 rounded-xs border border-border-raised bg-raised px-2 py-unit font-mono text-2xs leading-[14px] whitespace-nowrap">
							<span className="text-muted">frames/cart/frame.tsx:38</span>
							<span className="text-muted">·</span>
							<span>Open in editor</span>
						</div>
					</>
				) : null}
				{booting ? (
					<>
						<div className="absolute inset-0 rounded-lg bg-bg opacity-55" />
						<div className="absolute inset-0 flex items-center justify-center font-mono text-text text-xs leading-[14px]">
							booting
						</div>
					</>
				) : null}
			</div>
		</div>
	);
}

function FrameSelection() {
	return (
		<>
			<div className="pointer-events-none absolute -inset-[3px] rounded-[14px] border-[1.5px] border-thread" />
			{[
				"-left-[7px] -top-[7px]",
				"-right-[7px] -top-[7px]",
				"-bottom-[7px] -left-[7px]",
				"-bottom-[7px] -right-[7px]",
			].map((position) => (
				<span
					key={position}
					className={cn("absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread", position)}
				/>
			))}
			<div className="absolute left-[88px] top-[534px] rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3">
				390 × 844
			</div>
		</>
	);
}

function ThreadSvg({ variant }: { variant: CanvasSpecimen }) {
	if (variant === "menu-toast") {
		return (
			<svg
				className="pointer-events-none absolute inset-0 h-full w-full"
				viewBox="0 0 1440 856"
				fill="none"
				aria-hidden="true"
			>
				<path d="M422 400C498 412 562 372 634 384" stroke="var(--color-thread)" strokeWidth="1.5" />
				<path d="m640 384-10-5v10Z" fill="var(--color-thread)" />
			</svg>
		);
	}
	return (
		<svg
			className="pointer-events-none absolute inset-0 h-full w-full"
			viewBox="0 0 1440 856"
			fill="none"
			aria-hidden="true"
		>
			<path d="M384 434C470 432 505 472 588 470" stroke="var(--color-thread)" strokeWidth="1.5" />
			<path d="m598 470-10-5v10Z" fill="var(--color-thread)" />
			<path
				d="M844 470C930 468 965 414 1048 414"
				stroke="var(--color-thread)"
				strokeWidth="1.5"
				strokeDasharray="5 5"
			/>
			<path d="m1058 414-10-5v10Z" fill="var(--color-thread)" />
		</svg>
	);
}
