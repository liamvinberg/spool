import { cn } from "shared/lib/utils";
import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { ChevronIcon, FolderIcon, FrameIcon } from "shared/ui/spool/icons";
import { Cursor, DockedPill, Faces, FollowMark, type Mate } from "shared/ui/spool/presence";
import { SharedButton } from "shared/ui/spool/shares";
import { TeamMark } from "shared/ui/spool/teams";

/**
 * A team project's read-only canvas in a browser at spool.page (DEV-191 to DEV-197), the shipped viewer held at one
 * moment, mirroring `src/ui/viewer/viewer.tsx`: the pages rail with nothing on it that changes anything, the field
 * with its frames live, the Shared control and the faces at the top right, and the zoom at the bottom right.
 *
 * Vic is a viewer here, and his teammates are on the canvas as they are on the Mac: ana moving, her name said; ben
 * playing `cart` in his browser, which docks his name on the frame's; theo idle. `follow` is Vic following ana's
 * view, her colour round the canvas.
 */

export type ViewerSpecimen = "here" | "follow";

const TEAM = { address: "devosurf", name: "Devosurf", logo: null };
const ANA: Mate = { name: "ana", color: "#7aa7ff" };
const BEN: Mate = { name: "ben", color: "#eaa94a" };
const THEO: Mate = { name: "theo", color: "#b896ff", idle: true };

const RAIL_W = 232;
const PAGES = [
	{ name: "checkout", count: 6 },
	{ name: "onboarding", count: 9 },
] as const;
const FRAMES: readonly { screen: CoffeeScreenName; left: number; top: number }[] = [
	{ screen: "menu", left: 120, top: 150 },
	{ screen: "cart", left: 440, top: 190 },
	{ screen: "receipt", left: 760, top: 130 },
];
const W = 260;
const H = 563;

export function SpoolViewerScreen({ variant }: { variant: ViewerSpecimen }) {
	return (
		<div className="flex h-full w-full overflow-hidden bg-bg text-text">
			<aside className="flex shrink-0 flex-col border-border border-r bg-bg" style={{ width: RAIL_W }}>
				<div className="flex h-11 shrink-0 items-center gap-2 border-border border-b pr-2 pl-3.5">
					<TeamMark team={TEAM} size={18} />
					<span className="truncate type-control">kaffe</span>
					<span className="ml-auto shrink-0 text-muted type-detail">view only</span>
				</div>
				<nav className="min-h-0 flex-1 py-2">
					{FRAMES.map(({ screen }) => (
						<div key={screen} className="flex h-7 items-center gap-2 pr-2 pl-[22px]">
							<FrameIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
							<span className="min-w-0 flex-1 truncate text-muted type-value">{screen}</span>
						</div>
					))}
					{PAGES.map((page) => (
						<div key={page.name} className="flex h-8 items-center pr-3 pl-1">
							<span className="flex h-8 w-4 shrink-0 items-center justify-center text-muted">
								<ChevronIcon className="h-2.5 w-2.5" />
							</span>
							<FolderIcon className="mr-2 ml-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
							<span className="min-w-0 flex-1 truncate text-muted type-value">{page.name}</span>
							<span className="text-muted type-detail">{page.count}</span>
						</div>
					))}
				</nav>
				<div className="truncate border-border border-t px-3.5 py-3 text-muted type-detail">vic@devosurf.com</div>
			</aside>
			<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas">
				{FRAMES.map(({ screen, left, top }) => (
					<div key={screen} className="absolute flex flex-col gap-1.5" style={{ left, top: top - 22 }}>
						<div className="flex h-4 items-center type-value" style={{ width: W }}>
							<span className="min-w-0 truncate text-muted">{screen}</span>
						</div>
						<div className="relative overflow-hidden" style={{ width: W, height: H }}>
							<CoffeeScreen screen={screen} />
						</div>
					</div>
				))}
				<DockedPill mate={BEN} right={440 + W} y={190 - 27} />
				<Cursor mate={ANA} x={variant === "follow" ? 690 : 330} y={variant === "follow" ? 640 : 760} />
				<Cursor mate={THEO} x={1080} y={720} said={false} />
				{variant === "follow" ? <FollowMark mate={ANA} /> : null}
				<div className="absolute top-3 right-3 flex items-center gap-3">
					<SharedButton count={2} />
					<Faces mates={[ANA, BEN, THEO]} following={variant === "follow" ? ANA.name : undefined} />
				</div>
				<div className="absolute right-3 bottom-3 flex h-8 items-center gap-1 rounded-sm border border-border bg-bg px-1">
					<span className="px-2 py-1 text-muted type-value">−</span>
					<span className={cn("w-11 text-center text-muted tabular-nums type-value")}>72%</span>
					<span className="px-2 py-1 text-muted type-value">+</span>
					<span className="h-3.5 w-px bg-border-raised" />
					<span className="px-2 py-1 text-muted type-value">fit</span>
				</div>
			</div>
		</div>
	);
}
