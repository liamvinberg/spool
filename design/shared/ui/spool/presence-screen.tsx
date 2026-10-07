import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { Cursor, DockedPill, DragOutline, Faces, FollowMark, type Mate, WhoList } from "shared/ui/spool/presence";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * A team project's canvas with teammates on it (DEV-196), the shipped canvas held at one moment.
 *
 * `here` is the canvas with people working on it: ben moving, his name said; cleo inside `cart` live, her name
 * docked on the frame's own and her pointer bare inside it; dag dragging `receipt`, a hand and the frame in his
 * colour; theo idle, a third of the ink. `follow` is following ben's view. `crowd` is a team past what fits,
 * the faces collapsed into a count and the list open.
 */

export type PresenceSpecimen = "here" | "follow" | "crowd";

const BEN: Mate = { name: "ben", color: "#7aa7ff" };
const CLEO: Mate = { name: "cleo", color: "#eaa94a" };
const DAG: Mate = { name: "dag", color: "#4cc495" };
const THEO: Mate = { name: "theo", color: "#b896ff", idle: true, note: "idle · 4m" };
const CROWD: readonly Mate[] = [
	BEN,
	CLEO,
	DAG,
	THEO,
	{ name: "sara", color: "#f28cbc", away: "site" },
	{ name: "omar", color: "#58c6dc", away: "directing" },
	{ name: "elin", color: "#d6cc6a" },
];

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt"], active: true, open: true },
	{ name: "site", frames: ["landing", "pricing"] },
	{ name: "directing", frames: [] },
];

/** Where each frame's box stands on the field, below its 22px name row. */
const FRAMES: readonly { screen: CoffeeScreenName; left: number; top: number }[] = [
	{ screen: "menu", left: 25, top: 130 },
	{ screen: "cart", left: 325, top: 170 },
	{ screen: "receipt", left: 625, top: 110 },
];
const W = 240;
const H = 520;
const NAME_ROW = 22;

export function SpoolPresenceScreen({ variant }: { variant: PresenceSpecimen }) {
	const mates = variant === "crowd" ? CROWD : [BEN, CLEO, DAG, THEO];
	return (
		<SpoolShell
			activeTab="checkout"
			tabs={["checkout"]}
			headerAccessory={<Faces mates={mates} following={variant === "follow" ? BEN.name : undefined} open={variant === "crowd"} />}
		>
			<CanvasChrome pages={PAGES} tool="select">
				{FRAMES.map(({ screen, left, top }) => (
					<div key={screen} className="absolute flex flex-col gap-1.5" style={{ left, top }}>
						<div className="flex h-4 w-[240px] items-center type-value">
							<span className="min-w-0 truncate text-muted">{screen}</span>
						</div>
						<div className="relative h-[520px] w-[240px]">
							<CoffeeScreen screen={screen} />
						</div>
					</div>
				))}
				<DockedPill mate={CLEO} right={325 + W} y={169} />
				<Cursor mate={CLEO} x={420} y={430} said={false} />
				<DragOutline mate={DAG} left={625} top={110 + NAME_ROW} width={W} height={H} />
				<Cursor mate={DAG} x={712} y={300} grabbing />
				<Cursor mate={BEN} x={variant === "follow" ? 470 : 286} y={variant === "follow" ? 740 : 716} />
				<Cursor mate={THEO} x={110} y={760} said={false} />
				{variant === "follow" ? <FollowMark mate={BEN} /> : null}
				{variant === "crowd" ? (
					<div className="absolute top-1.5 right-2 z-30">
						<WhoList mates={CROWD} page="app" />
					</div>
				) : null}
			</CanvasChrome>
		</SpoolShell>
	);
}
