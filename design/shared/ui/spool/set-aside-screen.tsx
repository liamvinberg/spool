import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { SetAsideChip, SetAsideNoteCard, SetAsideSummary, type ShownSetAside } from "shared/ui/spool/set-aside";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * A team project's canvas after one of this machine's saves lost a collision. `mark`: Ben's change to the shared
 * button was set aside because Ana's arrived first, so both frames that mount it wear the mark, and the one on menu
 * is open. `summary`: Ben came back from a train with four saves set aside at once, which is one card instead.
 */

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt"], active: true, open: true, unseen: {} },
	{ name: "site", frames: ["landing", "pricing"], unseen: {} },
];

const BUTTON: ShownSetAside = {
	path: "shared/ui/order-button.tsx",
	kind: "set-aside",
	deleted: false,
	by: "ana@devosurf.com",
};

const OFFLINE: readonly ShownSetAside[] = ["menu", "cart", "receipt", "landing"].map((frame) => ({
	path: `frames/${frame}/frame.tsx`,
	kind: "set-aside",
	deleted: false,
	by: "ana@devosurf.com",
}));

export function SetAsideScreen({ specimen, homeTarget }: { specimen: "mark" | "summary"; homeTarget?: string }) {
	const marked = specimen === "mark";
	return (
		<SpoolShell activeTab="checkout" tabs={["checkout"]} homeTarget={homeTarget}>
			<CanvasChrome pages={PAGES} tool="select">
				<Frame left={25} top={130} screen="menu" marked={marked} open={marked} />
				<Frame left={325} top={130} screen="cart" marked={marked} />
				<Frame left={625} top={130} screen="receipt" />
				{!marked && <SetAsideSummary marks={OFFLINE} />}
			</CanvasChrome>
		</SpoolShell>
	);
}

function Frame({
	left,
	top,
	screen,
	marked = false,
	open = false,
}: {
	left: number;
	top: number;
	screen: CoffeeScreenName;
	marked?: boolean;
	open?: boolean;
}) {
	return (
		<div className="absolute flex flex-col gap-1.5" style={{ left, top, zIndex: open ? 10 : undefined }}>
			<div className="relative z-10 flex w-[240px] min-w-0 items-center gap-1.5 type-value">
				<span className="min-w-0 truncate text-muted">{screen}</span>
				{marked && <SetAsideChip open={open} />}
				{open && (
					<div className="absolute top-full left-0 mt-1">
						<SetAsideNoteCard marks={[BUTTON]} />
					</div>
				)}
			</div>
			<div className="relative h-[520px] w-[240px]">
				<CoffeeScreen screen={screen} />
			</div>
		</div>
	);
}
