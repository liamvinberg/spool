import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { SharedButton, SharedPopover, ShareSheetCard, type ShownShare } from "shared/ui/spool/shares";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * A team project's canvas with its pages shared outside the team (DEV-193), the shipped canvas held at one moment.
 *
 * `shared` is the Shared control open at the window's top right, Ana's people share opened in place: its people,
 * someone being added, who made it and how often it was opened, its link and the one way to end it. `share` is the
 * sheet a share starts from on checkout's right-click, warning that a link leaves for a page it doesn't show.
 */

export type SharesSpecimen = "shared" | "share";

const PAGES: readonly PageRow[] = [
	{ name: "checkout", frames: ["cart", "receipt"], active: true, open: true },
	{ name: "menu", frames: ["menu"] },
	{ name: "onboarding", frames: ["welcome"] },
];

const SHARES: readonly ShownShare[] = [
	{
		kind: "people",
		pages: ["checkout"],
		people: ["kim@harbourbank.se", "ola.n@harbourbank.se"],
		by: "ana@devosurf.com",
		when: "3 days ago",
		opens: 14,
	},
	{ kind: "link", pages: ["onboarding", "checkout"], people: [], by: "ben@devosurf.com", when: "last week", opens: 41 },
];

const FRAMES: readonly { screen: CoffeeScreenName; left: number }[] = [
	{ screen: "cart", left: 25 },
	{ screen: "receipt", left: 325 },
];

export function SpoolSharesScreen({ variant }: { variant: SharesSpecimen }) {
	return (
		<div className="relative h-full w-full">
		<SpoolShell
			activeTab="checkout"
			tabs={["checkout"]}
			headerAccessory={<SharedButton count={SHARES.length} open={variant === "shared"} />}
		>
			<CanvasChrome pages={PAGES} tool="select">
				{FRAMES.map(({ screen, left }) => (
					<div key={screen} className="absolute flex flex-col gap-1.5" style={{ left, top: 130 }}>
						<div className="flex h-4 w-[240px] items-center type-value">
							<span className="min-w-0 truncate text-muted">{screen}</span>
						</div>
						<div className="relative h-[520px] w-[240px]">
							<CoffeeScreen screen={screen} />
						</div>
					</div>
				))}
				{variant === "share" && (
					<div className="absolute inset-0 z-30 flex items-center justify-center bg-bg/55">
						<ShareSheetCard
							pages={PAGES.map((page) => page.name)}
							chosen={["checkout"]}
							people="kim@harbourbank.se, ola.n@harbourbank.se"
							leaving={[{ from: "receipt", to: "menu", page: "menu" }]}
						/>
					</div>
				)}
			</CanvasChrome>
		</SpoolShell>
			{/* the popover hangs on the page's top layer, over the canvas and its rails */}
			{variant === "shared" && (
				<div className="absolute top-[42px] right-4 z-50">
					<SharedPopover shares={SHARES} manage opened={0} adding="maja.l@harbourbank.se" />
				</div>
			)}
		</div>
	);
}
