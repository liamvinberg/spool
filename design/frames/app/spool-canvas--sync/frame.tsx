import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";
import { SyncStateLine } from "shared/ui/spool/sync-state";

/**
 * A team project's canvas while sync can't do all it should, said where it lasts and again whenever the canvas
 * opens: sync is paused on the saves-a-minute limit, and two files stay on this Mac, a film over 25 MB and a symlink.
 */
const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt"], active: true, open: true, unseen: {} },
	{ name: "site", frames: ["landing", "pricing"], unseen: {} },
];

export default function SpoolCanvasSyncFrame() {
	return (
		<SpoolShell activeTab="checkout" tabs={["checkout"]} homeTarget="spool-home" zoom="72%">
			<CanvasChrome pages={PAGES} tool="select">
				{(["menu", "cart", "receipt"] as const).map((screen, index) => (
					<Frame key={screen} left={25 + index * 300} top={250} screen={screen} />
				))}
				<SyncStateLine
					open
					state={{
						ended: null,
						paused: "this project took 120 saves in the last minute",
						held: [
							{ path: "shared/assets/film.mov", why: "it's over 25 MB" },
							{ path: "shared/brand", why: "symlinks stay on this Mac" },
						],
					}}
				/>
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
