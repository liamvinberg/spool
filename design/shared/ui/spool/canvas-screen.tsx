import { useState } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { ContextMenu } from "shared/ui/spool/context-menu";
import { SpoolShell } from "shared/ui/spool/shell";
import { TrashToast } from "shared/ui/spool/trash-toast";
import { type Mark, UnseenMark } from "shared/ui/spool/unseen-mark";

/**
 * The canvas: the app's main surface. Pages rail, the frames on their field
 * with the threads under them, the tool bar floating at the bottom, and the
 * dock on the right with the properties rail standing in it.
 *
 * Two specimens, because two are all the canvas really has: `rest` is the
 * working state, `menu` is the right-click menu and the undo toast it leaves
 * behind. There is no design mode — select is the only pointer tool, and ⌘ is
 * a modifier inside it rather than a mode you leave.
 */

export type CanvasSpecimen = "rest" | "menu";

/**
 * What nobody has looked at yet. `receipt` is a frame the agent wrote while the
 * canvas was somewhere else; `site` is shut over one of its own, so it says only
 * that something inside it is unseen. A mark clears when the frame has held half
 * the viewport for the best part of a second, or when it is pressed.
 */
const UNSEEN: Readonly<Record<string, Mark>> = { receipt: "new" };

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt"], active: true, open: true, unseen: UNSEEN },
	{ name: "site", frames: ["landing", "pricing"], unseen: { landing: "changed" } },
	{ name: "directing", frames: [], unseen: {} },
];

interface SpoolCanvasScreenProps {
	variant: CanvasSpecimen;
	homeTarget?: string | undefined;
	playTarget?: string | undefined;
}

export function SpoolCanvasScreen({ variant, homeTarget, playTarget }: SpoolCanvasScreenProps) {
	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} homeTarget={homeTarget} zoom="72%">
			<CanvasChrome
				pages={PAGES}
				selected="cart"
				tool="select"
			>
				<CanvasStage variant={variant} playTarget={playTarget} />
			</CanvasChrome>
		</SpoolShell>
	);
}

function CanvasStage({ variant, playTarget }: { variant: CanvasSpecimen; playTarget?: string | undefined }) {
	const [toastVisible, setToastVisible] = useState(true);
	if (variant === "menu") {
		return (
			<>
				<ThreadSvg variant={variant} />
				<CanvasFrame left={40} top={130} screen="menu" paused />
				<CanvasFrame left={340} top={100} screen="receipt" paused />
				<ContextMenu
					at={{ x: 630, y: 250 }}
					playTarget={playTarget}
					exportAction={{ selectionCount: 1 }}
					onTrash={() => setToastVisible(true)}
				/>
				{toastVisible ? <TrashToast frames={["cart"]} onUndo={() => setToastVisible(false)} /> : null}
			</>
		);
	}
	return (
		<>
			<ThreadSvg variant={variant} />
			<CanvasFrame left={25} top={130} screen="menu" paused />
			<CanvasFrame left={325} top={170} screen="cart" selected playTarget={playTarget} />
			<CanvasFrame left={625} top={110} screen="receipt" paused />
		</>
	);
}

function CanvasFrame({
	left,
	top,
	screen,
	paused = false,
	selected = false,
	playTarget,
}: {
	left: number;
	top: number;
	screen: CoffeeScreenName;
	paused?: boolean;
	selected?: boolean;
	playTarget?: string | undefined;
}) {
	const mark = UNSEEN[screen];
	return (
		<div className="absolute flex flex-col gap-1.5" style={{ left, top }}>
			<div className="flex w-[240px] min-w-0 items-center gap-1.5 font-mono text-sm leading-4">
				{paused ? <span className="shrink-0 text-2xs text-muted leading-3">▸</span> : null}
				{/* the mark rides the label because the label is the one thing on the field
				    that does not scale: a disc on the frame itself shrinks with the zoom, and
				    zoomed out is when you most need to know which of these is new */}
				{mark === undefined ? null : <UnseenMark mark={mark} className="-ml-0.5" />}
				<span
					className={cn(
						"min-w-0 truncate",
						selected ? "text-thread" : mark === undefined ? "text-muted" : "text-text",
					)}
				>
					{screen}
				</span>
				{/* the selection's own verb, at the far end of its own row (#13/#24):
				    play never lived in the bar, where it could only guess the frame */}
				{selected ? (
					<button
						type="button"
						data-go={playTarget}
						aria-label={`Play ${screen}`}
						className="ml-auto flex shrink-0 cursor-pointer items-center gap-1 rounded-xs px-1 font-mono text-2xs text-muted leading-3 transition-colors hover:text-thread"
					>
						<svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden="true">
							<path d="M2 1.2 8.4 5 2 8.8Z" />
						</svg>
						play
					</button>
				) : null}
			</div>
			<div className="relative h-[520px] w-[240px]">
				<CoffeeScreen screen={screen} />
				{selected ? <FrameSelection /> : null}
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
			<div className="absolute top-[534px] left-[88px] rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3">
				390 × 844
			</div>
		</>
	);
}

function ThreadSvg({ variant }: { variant: CanvasSpecimen }) {
	if (variant === "menu") {
		return (
			<svg
				className="pointer-events-none absolute inset-0 h-full w-full"
				viewBox="0 0 892 856"
				fill="none"
				aria-hidden="true"
			>
				<path d="M284 420C306 420 314 392 332 392" stroke="var(--color-thread)" strokeWidth="1.5" />
				<path d="m340 392-9-5v10Z" fill="var(--color-thread)" />
			</svg>
		);
	}
	return (
		<svg
			className="pointer-events-none absolute inset-0 h-full w-full"
			viewBox="0 0 892 856"
			fill="none"
			aria-hidden="true"
		>
			<path d="M269 412C291 412 299 452 317 452" stroke="var(--color-thread)" strokeWidth="1.5" />
			<path d="m325 452-9-5v10Z" fill="var(--color-thread)" />
			<path d="M569 452C591 452 599 392 617 392" stroke="var(--color-thread)" strokeWidth="1.5" strokeDasharray="5 5" />
			<path d="m625 392-9-5v10Z" fill="var(--color-thread)" />
		</svg>
	);
}
