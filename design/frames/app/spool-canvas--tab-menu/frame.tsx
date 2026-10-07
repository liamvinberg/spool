import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * A tab's right-click menu, open on a team project's local copy. It opens on the project, its icon as the tab draws
 * it with the team's mark in the corner, and says where it lives; "Change icon…" leads and "Remove icon" is there
 * because checkout's icon is the file in design/shared. The tab strip leads every tab with its icon: spool and kaffe
 * their files, checkout its file and its team's badge, and the letter for a project with no icon.
 */
const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt"], active: true, open: true, unseen: {} },
	{ name: "site", frames: ["landing", "pricing"], unseen: {} },
];

export default function SpoolCanvasTabMenuFrame() {
	return (
		<SpoolShell activeTab="checkout" tabs={["spool", "checkout", "kaffe", "aria"]} homeTarget="spool-home" menuAt="checkout">
			<CanvasChrome pages={PAGES} tool="select">
				{(["menu", "cart", "receipt"] as const).map((screen, index) => (
					<Frame key={screen} left={25 + index * 300} top={250} screen={screen} />
				))}
			</CanvasChrome>
		</SpoolShell>
	);
}

function Frame({ left, top, screen }: { left: number; top: number; screen: CoffeeScreenName }) {
	return (
		<div className="absolute flex flex-col gap-1.5" style={{ left, top }}>
			<span className="w-[240px] truncate text-muted type-value">{screen}</span>
			<div className="relative h-[520px] w-[240px]">
				<CoffeeScreen screen={screen} />
			</div>
		</div>
	);
}
