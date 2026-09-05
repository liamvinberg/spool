import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { MenuItem, MenuRule } from "shared/ui/spool/context-menu";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * The canvas the share question stands on: kaffe's app page, cart selected,
 * and whatever the take puts over it — the right-click menu, or the dialog it
 * opens.
 *
 * It is the shipped canvas with one row added to the menu, because that is the
 * whole proposal: sharing is a decided action on a frame, so it belongs to the
 * second door beside Play, Export and Trash rather than to a new button in the
 * bar. A frame that is out there says so on its label and nowhere else, at the
 * one size the canvas keeps legible at any zoom.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt"], active: true, open: true },
	{ name: "site", frames: ["landing", "pricing"] },
	{ name: "directing", frames: [] },
];

export function ShareCanvas({
	shared = false,
	overlay,
	menu,
}: {
	/** cart is already out there: its label carries the mark, its menu carries the other verbs */
	shared?: boolean;
	overlay?: ReactNode;
	menu?: ReactNode;
}) {
	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="72%">
			<CanvasChrome pages={PAGES} selected="cart" tool="select">
				<CanvasFrame left={25} top={130} screen="menu" />
				<CanvasFrame left={325} top={170} screen="cart" selected shared={shared} />
				<CanvasFrame left={625} top={110} screen="receipt" />
				{menu}
				{overlay}
			</CanvasChrome>
		</SpoolShell>
	);
}

/**
 * The menu the proposal adds a row to. `Share link…` sits with Export, because
 * both hand the frame to somebody who is not in this project, and the rule
 * under them is what separates that from the verbs that stay inside it.
 *
 * Once the frame is shared the row splits in two: the link exists now, so
 * copying it again is one press, and ending it is a verb of its own rather
 * than a thing hidden inside the dialog that made it.
 */
export function ShareMenu({
	at,
	shared = false,
	onShare,
	onCopy,
}: {
	at: { x: number; y: number };
	shared?: boolean;
	onShare?: (() => void) | undefined;
	onCopy?: (() => void) | undefined;
}) {
	return (
		<div
			role="menu"
			className="absolute z-30 flex w-[200px] flex-col rounded-md border border-border-raised bg-raised p-unit"
			style={{ left: at.x, top: at.y }}
		>
			<MenuItem label="Play from here" keys="P" />
			<MenuItem label="Copy path" />
			<MenuItem label="Reload frame" keys="R" />
			<MenuRule />
			<MenuItem label="Tidy page" keys="⇧A" />
			<MenuItem label="Export as PNG" />
			{shared ? (
				<>
					<MenuItem label="Copy link" keys="S" onClick={onCopy} />
					<MenuItem label="Stop sharing" />
				</>
			) : (
				<MenuItem label="Share link…" keys="S" onClick={onShare} />
			)}
			<MenuRule />
			<MenuItem label="Move to Trash" keys="⌫" />
		</div>
	);
}

function CanvasFrame({
	left,
	top,
	screen,
	selected = false,
	shared = false,
}: {
	left: number;
	top: number;
	screen: CoffeeScreenName;
	selected?: boolean;
	shared?: boolean;
}) {
	return (
		<div className="absolute flex flex-col gap-1.5" style={{ left, top }}>
			<div className="flex w-[240px] min-w-0 items-center gap-1.5 font-mono text-sm leading-4">
				<span className={cn("min-w-0 truncate", selected ? "text-thread" : "text-muted")}>{screen}</span>
				{shared ? <SharedMark /> : null}
			</div>
			<div className="relative h-[520px] w-[240px]">
				<CoffeeScreen screen={screen} />
				{selected ? <FrameSelection /> : null}
			</div>
		</div>
	);
}

/**
 * A frame that is out there, said on the label rather than on the frame: the
 * label is the one thing on the field that does not scale, and whether a
 * stranger can see this is exactly the fact you want at any zoom. A live link
 * is a filled dot, a frozen one is a ring — the same shape, one of them still
 * being fed.
 */
function SharedMark({ frozen = false }: { frozen?: boolean }) {
	return (
		<span className="flex shrink-0 items-center gap-1 text-2xs text-muted leading-3">
			<span
				className={cn("h-1.5 w-1.5 rounded-full", frozen ? "border border-muted" : "bg-thread")}
				aria-hidden="true"
			/>
			{frozen ? "frozen" : "shared"}
		</span>
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
