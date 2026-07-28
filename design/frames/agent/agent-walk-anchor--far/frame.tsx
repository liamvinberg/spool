import type { PlayEntry } from "../../../shared/lib/turn-play";
import { cn } from "../../../shared/lib/utils";
import { CanvasChrome, type PageRow, type Target } from "../../../shared/ui/spool-canvas-chrome";
import { PlayRail } from "../../../shared/ui/spool-play-rail";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * agent-walk-anchor--far — what the anchors become when the elements go away.
 *
 * At 14% a frame is 55 pixels wide and its buttons are eleven pixels tall. Six
 * rings inside that are six rings on top of each other, so the per-element mark
 * has to give something up. The question is what, and the answer this direction
 * can give is narrow on purpose, because an anchor is only allowed to degrade
 * into itself.
 *
 * **It gives up y, and only y.** Every walk leaves an element on that element's
 * right edge, and prototype buttons are full width, so a frame's anchors already
 * share an x: the frame's own right edge. What separates them is how far down
 * they sit. So the collapse is one axis wide. The rings stop being told apart
 * vertically and the rule they sat on becomes the frame's own hairline, which is
 * the only rule left that is still true at this size.
 *
 * **Quiet stays quiet, loud stays loud.** Six frames on this page walk off it
 * and each says so with a dashed hairline and nothing else. No count, no ring,
 * no glyph. An off-page walk is not a problem and it should not cost anything to
 * look past. `cart--empty` is the one frame with a walk that goes nowhere: solid
 * hairline at full strength, one struck ring on the right edge at the middle of
 * its two dead anchors, and the names already open. Rare is what makes always-on
 * affordable, and one shouting frame among sixteen is findable in a glance.
 *
 * **The threshold is 90px of drawn frame.** Above it the rings are separable and
 * you get `agent-walk-anchor`. Below it you get this. There is no third drawing
 * and no intermediate: the two states are the same object, and the fact you can
 * reach is the same fact in both, in the same chip, with the same struck ring on
 * it.
 *
 * **The cost, drawn rather than argued.** `cart` here is selected and also walks
 * off the page, so it wears a thread selection ring outside its edge and a
 * dashed walk hairline inside it. That is the collision this direction has to
 * survive and it is a millimetre of clearance. Below about 8% it stops being one.
 */

/* ---------- the canvas at 14% ---------- */

const NAT_W = 240;
const NAT_H = 520;
const FW = 55;
const S = FW / NAT_W;
const FH = Math.round(NAT_H * S);
/** the label counter-scales, so it is the same 12px it is at 200% and truncates to the frame */
const LABEL_LIFT = 22;

type Walk = "none" | "off" | "broken";

interface SceneFrame {
	readonly name: string;
	readonly x: number;
	readonly y: number;
	readonly screen: Screen;
	readonly walk?: Walk | undefined;
	readonly selected?: boolean | undefined;
	/**
	 * Where this frame's dead anchors average out down the right edge, as a
	 * fraction of frame height. Only the broken frame needs it: nothing else draws
	 * a ring at this zoom.
	 */
	readonly at?: number | undefined;
}

type Screen = "list" | "panel" | "done" | "empty" | "form";

const SCENE: readonly SceneFrame[] = [
	{ name: "splash", x: 110, y: 215, screen: "done" },
	{ name: "login", x: 110, y: 370, screen: "form" },
	{ name: "login--error", x: 110, y: 525, screen: "form" },
	{ name: "menu", x: 200, y: 170, screen: "list", walk: "off" },
	{ name: "menu--sold-out", x: 200, y: 325, screen: "list" },
	{ name: "orders", x: 200, y: 480, screen: "list", walk: "off" },
	{ name: "cart", x: 290, y: 215, screen: "panel", walk: "off", selected: true },
	{ name: "cart--empty", x: 290, y: 395, screen: "empty", walk: "broken", at: 0.46 },
	{ name: "order", x: 290, y: 560, screen: "panel" },
	{ name: "receipt", x: 380, y: 180, screen: "done" },
	{ name: "account", x: 380, y: 530, screen: "form", walk: "off" },
	{ name: "item", x: 470, y: 215, screen: "panel", walk: "off" },
	{ name: "item--added", x: 470, y: 370, screen: "panel" },
	{ name: "pay", x: 470, y: 525, screen: "form" },
	{ name: "hours", x: 560, y: 280, screen: "list", walk: "off" },
	{ name: "map", x: 560, y: 435, screen: "done" },
];

/** what `cart--empty` declares and never reaches, unchanged from the near view */
const BROKEN: readonly { name: string; struck: boolean }[] = [
	{ name: "chekout", struck: true },
	{ name: "nav.tsx:12", struck: false },
];

const PAGES: readonly PageRow[] = [
	{
		name: "app",
		frames: SCENE.map((frame) => frame.name)
			.slice()
			.sort(),
		active: true,
		open: true,
	},
	{ name: "shop", frames: ["checkout", "payment"] },
	{ name: "site", frames: ["home"] },
];

const TARGETS: readonly Target[] = [
	{ frame: "receipt", certainty: "might" },
	{ frame: "checkout", certainty: "will" },
	{ frame: "home", certainty: "might" },
];

/* ---------- the screens, which are a smudge at this size and should be ---------- */

const SCREEN_BASE =
	"flex h-full w-full flex-col overflow-hidden rounded-lg border border-[#E4E4E7] bg-[#FEFEFE] px-4 pt-5 pb-4 font-[Instrument_Sans]";

function TinyScreen({ screen }: { screen: Screen }) {
	if (screen === "done") {
		return (
			<div className={cn(SCREEN_BASE, "items-center justify-center gap-4")}>
				<span className="h-11 w-11 rounded-full bg-[#17171A]" />
				<span className="h-4 w-24 rounded-sm bg-[#D9D9DE]" />
				<span className="h-3 w-36 rounded-sm bg-[#EFEFF1]" />
			</div>
		);
	}
	if (screen === "empty") {
		return (
			<div className={cn(SCREEN_BASE, "gap-4")}>
				<span className="h-5 w-28 rounded-sm bg-[#D9D9DE]" />
				<div className="flex flex-1 flex-col items-center justify-center gap-3">
					<span className="h-9 w-9 rounded-full border-[3px] border-[#E4E4E7]" />
					<span className="h-3 w-32 rounded-sm bg-[#EFEFF1]" />
				</div>
				<span className="h-10 w-full rounded-md bg-[#17171A]" />
			</div>
		);
	}
	if (screen === "form") {
		return (
			<div className={cn(SCREEN_BASE, "gap-4")}>
				<span className="h-5 w-28 rounded-sm bg-[#D9D9DE]" />
				<span className="h-10 w-full rounded-md bg-[#EFEFF1]" />
				<span className="h-10 w-full rounded-md bg-[#EFEFF1]" />
				<div className="flex-1" />
				<span className="h-10 w-full rounded-md bg-[#17171A]" />
			</div>
		);
	}
	const rows = screen === "list" ? 4 : 2;
	return (
		<div className={cn(SCREEN_BASE, "gap-3")}>
			<span className="h-5 w-24 rounded-sm bg-[#D9D9DE]" />
			{Array.from({ length: rows }, (_, index) => (
				<span key={index} className="h-11 w-full rounded-md bg-[#EFEFF1]" />
			))}
			<div className="flex-1" />
			<span className="h-10 w-full rounded-md bg-[#17171A]" />
		</div>
	);
}

/* ---------- the collapsed mark ---------- */

const INK = "#0E0E0E";
const CASING = "#FFFFFF";

/**
 * The frame's own hairline, carrying what the element rules carried.
 *
 * It sits one pixel inside the frame edge, which is where the element rules were
 * heading anyway: a full-width button's rule is already the frame's width minus
 * its padding, and the padding is under a pixel at this zoom. The selection ring
 * stays three pixels outside, so the two never share a line.
 */
function FrameWalkMark({ frame }: { frame: SceneFrame }) {
	if (frame.walk === undefined || frame.walk === "none") return null;
	const broken = frame.walk === "broken";
	const box = { x: frame.x + 1, y: frame.y + 1, width: FW - 2, height: FH - 2, rx: 10 };
	const ring = { x: frame.x + FW - 1, y: frame.y + FH * (frame.at ?? 0.5) };
	return (
		<g>
			<rect {...box} stroke={CASING} strokeWidth="3" strokeOpacity="0.35" strokeDasharray={broken ? undefined : "5 3"} />
			<rect
				{...box}
				stroke={INK}
				strokeWidth={broken ? 1.5 : 1.3}
				strokeOpacity={broken ? 1 : 0.72}
				strokeDasharray={broken ? undefined : "5 3"}
			/>
			{broken ? (
				<>
					<circle cx={ring.x} cy={ring.y} r="6" fill={CASING} fillOpacity="0.62" />
					<circle cx={ring.x} cy={ring.y} r="4.4" stroke={INK} strokeWidth="1.5" />
					<path
						d={`M${ring.x - 6.2} ${ring.y + 6.2}L${ring.x + 6.2} ${ring.y - 6.2}`}
						stroke={INK}
						strokeWidth="1.5"
						strokeLinecap="round"
					/>
				</>
			) : null}
		</g>
	);
}

/** the shipped selection: hairline ring, four handles, the size under it */
function FrameSelection() {
	return (
		<>
			<div className="pointer-events-none absolute -inset-[3px] rounded-[11px] border-[1.5px] border-thread" />
			{["-left-[6px] -top-[6px]", "-right-[6px] -top-[6px]", "-bottom-[6px] -left-[6px]", "-bottom-[6px] -right-[6px]"].map(
				(position) => (
					<span
						key={position}
						className={cn("absolute h-1.5 w-1.5 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread", position)}
					/>
				),
			)}
			<span
				className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3"
				style={{ top: FH + 10 }}
			>
				390 × 844
			</span>
		</>
	);
}

/* ---------- the rail, unchanged and unrelated ---------- */

const SAID =
	"The header sits on 12px now and the total has a rule of its own under it. Nothing else on the page moved.";

const TURN: readonly PlayEntry[] = [
	{ key: "ask", kind: "user", text: "tighten the receipt header, the total is sitting on the rule" },
	{ key: "read", kind: "line", state: "done", verb: "read", subject: "receipt" },
	{ key: "edit", kind: "line", state: "done", verb: "edit", subject: "receipt ×2", count: 2 },
	{ key: "shot", kind: "line", state: "done", verb: "shot", subject: "receipt" },
	{ key: "said", kind: "prose", full: SAID, shown: SAID },
];

/* ---------- the window ---------- */

export default function AgentWalkAnchorFarFrame() {
	const dead = SCENE.find((frame) => frame.walk === "broken") as SceneFrame;

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="14%">
			<CanvasChrome
				pages={PAGES}
				selected="cart"
				tool="select"
				targets={TARGETS}
				railWidth={420}
				railLabel="Agent"
				rail={<PlayRail entries={TURN} phase="settled" run={0} onSend={() => {}} onReplay={() => {}} />}
			>
				{/* the two arrows this page can still draw, rooted where they were rooted */}
				<svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
					<path d="M251.3 270.5C266 270.5 272 255 286 255" stroke="var(--color-thread)" strokeWidth="1.2" />
					<path d="m290 255-5-3v6Z" fill="var(--color-thread)" />
					<g opacity="0.75">
						<path
							d="M341.3 325.5C358 325.5 362 245 376 245"
							stroke="var(--color-thread)"
							strokeWidth="1.2"
							strokeDasharray="4 4"
						/>
						<path d="m380 245-5-3v6Z" fill="var(--color-thread)" />
					</g>
				</svg>

				{SCENE.map((frame) => (
					<div
						key={frame.name}
						className="absolute flex flex-col"
						style={{ left: frame.x, top: frame.y - LABEL_LIFT, width: FW }}
					>
						<div className="flex h-4 w-full min-w-0 items-center gap-1 pb-1.5 font-mono text-sm leading-4">
							{frame.selected === true ? null : <span className="shrink-0 text-2xs text-muted leading-3">▸</span>}
							<span className={cn("min-w-0 truncate", frame.selected === true ? "text-thread" : "text-muted")}>
								{frame.name}
							</span>
						</div>
						<div className="relative" style={{ width: FW, height: FH }}>
							<div className="overflow-hidden rounded-lg" style={{ width: FW, height: FH }}>
								<div className="origin-top-left" style={{ width: NAT_W, height: NAT_H, transform: `scale(${S})` }}>
									<TinyScreen screen={frame.screen} />
								</div>
							</div>
							{frame.selected === true ? <FrameSelection /> : null}
						</div>
					</div>
				))}

				<svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
					{SCENE.map((frame) => (
						<FrameWalkMark key={frame.name} frame={frame} />
					))}
				</svg>

				{/* the same fact, in the same chip, still reachable when the buttons are gone */}
				<div
					className="absolute z-30 flex flex-col rounded-sm border border-muted/60 bg-raised px-1.5 py-1"
					style={{ left: dead.x + FW + 14, top: dead.y + FH * (dead.at ?? 0.5) - 22 }}
				>
					{BROKEN.map((row) => (
						<div key={row.name} className="flex h-[18px] items-center gap-1.5 font-mono text-2xs leading-3">
							<svg viewBox="0 0 12 12" className="h-2.5 w-2.5 shrink-0 text-text" fill="none" aria-hidden="true">
								<circle cx="6" cy="6" r="3.6" stroke="currentColor" strokeWidth="1.3" />
								<path d="M1.6 10.4 10.4 1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
							</svg>
							<span className={cn("text-text", row.struck && "line-through")}>{row.name}</span>
						</div>
					))}
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}
