import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { CartEmptyExpressive, CartEmptyReorder, CartEmptyRestrained } from "./coffee-empty-takes";
import { CoffeeScreen, type CoffeeScreenName } from "./coffee-screens";
import { type AgentContext, StateMark } from "./spool-agent-rail";
import { AgentTurnRail, type ComposerState, type TurnEvent } from "./spool-agent-turn";
import { CanvasChrome, type PageRow } from "./spool-canvas-chrome";
import { SpoolShell } from "./spool-shell";

/**
 * One agent turn, six beats, one camera.
 *
 * Every frame here is the same shot: same pan, same zoom, the same three frames
 * on the field with cart selected and wearing the outline its chip names. Only
 * the turn moves. Walking the six in order is watching a single submit go all
 * the way to settled, and because the field never cuts, the moment the
 * sub-agent's three takes land on it reads as arrival rather than as a new
 * picture.
 *
 * The turn is the one from the shipped agent frames, carried on: the checkout
 * bar was already made sticky, and this turn asks for three empty states.
 */

export type TurnBeat = "compose" | "requesting" | "thinking" | "streaming" | "tools" | "settled";

/** what the field is holding at this beat */
type FieldPhase = "quiet" | "authoring" | "landed";

/* ---------- the copy, verbatim ---------- */

const CONTEXT: AgentContext = { frame: "cart", element: "checkout-bar", lines: "34-41" };

const PROMPT = "now try three variants of the empty state";
const NARRATION = "Reading the cart frame and the shared bar, then branching three takes";
const CLOSING =
	"Three takes are under cart. A sends you back to the menu, B suggests two drinks, C offers your last order again.";

/** the turn before this one, already settled and already scrolling away */
const PRIOR: readonly TurnEvent[] = [
	{ kind: "user", text: "make the checkout bar stick to the bottom on mobile", context: CONTEXT },
	{ kind: "assistant", text: "Pinned it with sticky and a safe-area inset. It holds under 640px now." },
];

const THOUGHT: TurnEvent = { kind: "thought", tokens: "1,180", seconds: "4.5s" };

const READ: TurnEvent = {
	kind: "tool",
	tool: "read",
	label: "frames/app/cart/frame.tsx",
	state: "completed",
	detail: "214 lines",
};

const EDIT: TurnEvent = {
	kind: "tool",
	tool: "edit",
	label: "shared/ui/checkout-bar.tsx",
	state: "completed",
	diff: { added: 6, removed: 2 },
	repainted: "cart",
};

const REST: ComposerState = { value: "", placeholder: "say what to change", context: CONTEXT };

/* ---------- the six beats ---------- */

interface Beat {
	events: readonly TurnEvent[];
	usage: string;
	composer: ComposerState;
	working: boolean;
	phase: FieldPhase;
}

const BEATS: Record<TurnBeat, Beat> = {
	/* typed, not sent. The chip is already on the message. */
	compose: {
		events: PRIOR,
		usage: "24.1k in context",
		composer: { value: PROMPT, placeholder: "say what to change", context: CONTEXT },
		working: false,
		phase: "quiet",
	},

	/* sent, and nothing back. status: requesting is genuinely all there is. */
	requesting: {
		events: [...PRIOR, { kind: "user", text: PROMPT, context: CONTEXT, awaiting: true }],
		usage: "24.1k in context",
		composer: REST,
		working: true,
		phase: "quiet",
	},

	/* the thinking block is open and there is no prose in it, by design */
	thinking: {
		events: [...PRIOR, { kind: "user", text: PROMPT, context: CONTEXT }, { kind: "thinking" }],
		usage: "24.1k in context",
		composer: REST,
		working: true,
		phase: "quiet",
	},

	/* prose mid-sentence, and under it a tool that has its name but not yet its
	   arguments. Both are arriving on the same wire, so both are live. */
	streaming: {
		events: [
			...PRIOR,
			{ kind: "user", text: PROMPT, context: CONTEXT },
			THOUGHT,
			{ kind: "stream", tool: "read" },
		],
		usage: "25.2k in context",
		composer: REST,
		working: true,
		phase: "quiet",
	},

	/* the run, in flight: two landed, one searching, three being authored, and
	   one command that will not run until a person says so */
	tools: {
		events: [
			...PRIOR,
			{ kind: "user", text: PROMPT, context: CONTEXT },
			THOUGHT,
			{ kind: "assistant", text: NARRATION },
			READ,
			EDIT,
			{ kind: "tool", tool: "grep", label: "checkout-bar", state: "running", detail: "across design" },
			{
				kind: "task",
				label: "3 variants",
				state: "running",
				runs: [
					{ name: "cart--empty", state: "completed" },
					{ name: "cart--empty-b", state: "completed" },
					{ name: "cart--empty-c", state: "running" },
				],
			},
			{ kind: "approval", tool: "bash", command: "rm -rf design/frames/app/cart--old" },
		],
		usage: "26.8k in context",
		composer: REST,
		working: true,
		phase: "authoring",
	},

	/* the result event, rendered, and the window it came out of */
	settled: {
		events: [
			...PRIOR,
			{ kind: "user", text: PROMPT, context: CONTEXT },
			THOUGHT,
			{ kind: "assistant", text: NARRATION },
			READ,
			EDIT,
			{ kind: "tool", tool: "grep", label: "checkout-bar", state: "completed", detail: "12 matches" },
			{
				kind: "task",
				label: "3 variants",
				state: "completed",
				runs: [
					{ name: "cart--empty", state: "completed" },
					{ name: "cart--empty-b", state: "completed" },
					{ name: "cart--empty-c", state: "completed" },
				],
			},
			{
				kind: "tool",
				tool: "bash",
				label: "rm -rf design/frames/app/cart--old",
				state: "completed",
				detail: "allowed once",
			},
			{ kind: "assistant", text: CLOSING },
			{ kind: "result" },
		],
		usage: "27.4k in context",
		composer: REST,
		working: false,
		phase: "landed",
	},
};

/* ---------- the pages rail reads the same disk the canvas does ---------- */

const APP_FRAMES: Record<FieldPhase, readonly string[]> = {
	quiet: ["cart", "cart--old", "menu", "receipt"],
	authoring: ["cart", "cart--empty", "cart--empty-b", "cart--empty-c", "cart--old", "menu", "receipt"],
	/* cart--old is gone: the approval was answered and the command ran */
	landed: ["cart", "cart--empty", "cart--empty-b", "cart--empty-c", "menu", "receipt"],
};

function pages(phase: FieldPhase): readonly PageRow[] {
	return [
		{ name: "app", frames: APP_FRAMES[phase], active: true, open: true },
		{ name: "site", frames: [] },
		{ name: "directing", frames: [] },
	];
}

/* ---------- the field ----------
 * Frames are authored 240x520 and drawn at 152 wide, so the shot sits at 39%
 * and a four-wide grid fits under one camera. The top row is the app as it
 * stands, cart--old included, because the command waiting for approval is going
 * to delete it and you should be able to see the thing you are agreeing to
 * lose. The second row is empty for the first four beats: those frames do not
 * exist yet, and leaving their room is what makes their arrival land. */

const NAT_W = 240;
const NAT_H = 520;
const FW = 152;
const FH = 329;
const S = FW / NAT_W;

const COLS = [28, 216, 404, 592] as const;
const ROW_1 = 80;
const ROW_2 = 466;
const LABEL_LIFT = 22;

const BASE: readonly { name: string; screen: CoffeeScreenName; col: number }[] = [
	{ name: "menu", screen: "menu", col: 0 },
	{ name: "cart", screen: "cart", col: 1 },
	{ name: "receipt", screen: "receipt", col: 2 },
];

const TAKES = [CartEmptyRestrained, CartEmptyReorder, CartEmptyExpressive] as const;
const TAKE_NAMES = ["cart--empty", "cart--empty-b", "cart--empty-c"] as const;

function TurnField({ phase }: { phase: FieldPhase }) {
	const authoring = phase === "authoring";
	return (
		<div className="absolute inset-0">
			<Threads />
			{BASE.map((frame) => (
				<FrameSlot
					key={frame.name}
					left={COLS[frame.col] ?? 0}
					top={ROW_1}
					name={frame.name}
					selected={frame.name === "cart"}
					/* the edit landed on the shared bar, so cart repaints under it */
					repainting={authoring && frame.name === "cart"}
					overlay={frame.name === "cart" ? <ElementSelection /> : null}
				>
					<CoffeeScreen screen={frame.screen} />
				</FrameSlot>
			))}
			{/* the old cart, kept around and never opened, until this turn asks to
			    delete it. It is gone by the settled beat because allow was pressed. */}
			{phase === "landed" ? null : (
				<FrameSlot
					left={COLS[3] ?? 0}
					top={ROW_1}
					name="cart--old"
					dim
					doomed={authoring}
					meta={authoring ? "to delete" : undefined}
				>
					<CoffeeScreen screen="cart" />
				</FrameSlot>
			)}
			{phase === "quiet" ? null : <VariantRow phase={phase} />}
		</div>
	);
}

/**
 * The sub-agent, made spatial. Three frames it is writing, inside one dashed
 * enclosure while it runs and standing on their own once it is done, because a
 * grouping that has stopped meaning anything should stop being drawn. Its
 * output is the thing you look at, not the list of names in the rail.
 */
function VariantRow({ phase }: { phase: FieldPhase }) {
	const authoring = phase === "authoring";
	return (
		<>
			{authoring ? (
				<>
					<div
						className="absolute rounded-lg border border-border-raised border-dashed"
						style={{ left: 202, top: ROW_2 - 30, width: 556, height: FH + 44 }}
					/>
					<div className="absolute flex items-center gap-2" style={{ left: 204, top: ROW_2 - 50 }}>
						<StateMark state="running" className="h-2.5 w-2.5" />
						<span className="font-mono text-2xs text-muted leading-3">task</span>
						<span className="font-mono text-2xs text-muted/40 leading-3">·</span>
						<span className="font-mono text-2xs text-muted leading-3">3 variants</span>
					</div>
				</>
			) : null}
			{TAKE_NAMES.map((name, index) => {
				const Take = TAKES[index];
				const writing = authoring && index === 2;
				return (
					<FrameSlot
						key={name}
						left={COLS[index + 1] ?? 0}
						top={ROW_2}
						name={name}
						writing={writing}
						meta={writing ? "writing" : authoring ? "new" : undefined}
					>
						{writing || Take === undefined ? null : <Take />}
					</FrameSlot>
				);
			})}
		</>
	);
}

function FrameSlot({
	left,
	top,
	name,
	selected = false,
	repainting = false,
	writing = false,
	dim = false,
	doomed = false,
	meta,
	overlay,
	children,
}: {
	left: number;
	top: number;
	name: string;
	selected?: boolean;
	/** a write landed under this frame and the document is repainting */
	repainting?: boolean;
	/** the file is still being written, so there is no document to paint yet */
	writing?: boolean;
	/** an old frame nobody opens, held back so the live ones read first */
	dim?: boolean;
	/** a command waiting for approval would delete this */
	doomed?: boolean;
	meta?: string | undefined;
	overlay?: ReactNode;
	children?: ReactNode;
}) {
	const still = useReducedMotion() === true;
	const live = repainting || writing;
	return (
		<div className="absolute flex flex-col" style={{ left, top: top - LABEL_LIFT, width: FW }}>
			{/* the label carries the name and one word of state; the empty socket
			    below is what says a file is still being written, so no mark here */}
			<div className="flex h-[22px] min-w-0 items-center gap-1.5 font-mono text-xs leading-3">
				<span
					className={cn(
						"min-w-0 shrink truncate",
						selected ? "text-thread" : dim ? "text-muted" : "text-text",
					)}
				>
					{name}
				</span>
				{meta !== undefined ? (
					<span
						className={cn(
							"ml-auto shrink-0 font-mono text-2xs leading-3",
							doomed ? "text-thread" : "text-muted",
						)}
					>
						{meta}
					</span>
				) : repainting ? (
					<span className="ml-auto shrink-0 font-mono text-2xs text-muted leading-3">changed</span>
				) : selected ? (
					<span className="ml-auto flex shrink-0 items-center gap-1 font-mono text-2xs text-muted leading-3">
						<svg viewBox="0 0 10 10" className="h-2 w-2" fill="currentColor" aria-hidden="true">
							<path d="M2 1.2 8.4 5 2 8.8Z" />
						</svg>
						play
					</span>
				) : null}
			</div>
			<div className="relative" style={{ width: FW, height: FH }}>
				{/* motion is the whole running language out here: a document that is
				    repainting breathes, and a frame whose file is still being written
				    is an empty socket doing the same. No colour, because red on this
				    canvas means the selection or a decision, never activity. */}
				<motion.div
					className={cn("overflow-hidden rounded-lg", writing && "border border-border-raised bg-bg", dim && "opacity-40")}
					style={{ width: FW, height: FH }}
					animate={live && !still ? { opacity: [1, 0.72, 1] } : { opacity: dim ? 0.4 : 1 }}
					transition={
						live && !still
							? { duration: writing ? 2.6 : 3, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
							: undefined
					}
				>
					<div className="origin-top-left" style={{ width: NAT_W, height: NAT_H, transform: `scale(${S})` }}>
						{children}
					</div>
				</motion.div>
				{doomed ? (
					<span className="pointer-events-none absolute -inset-[3px] rounded-[13px] border border-thread/55 border-dashed" />
				) : null}
				{overlay}
			</div>
		</div>
	);
}

/**
 * The element the chip names, outlined where it lives. Selection chrome belongs
 * to spool, so it is drawn over the scaled frame at screen scale: the outline
 * stays a hairline however far out the canvas is zoomed.
 */
function ElementSelection() {
	const box = { left: 14 * S, top: 442 * S, width: 212 * S, height: 64 * S };
	return (
		<>
			<span className="pointer-events-none absolute rounded-[3px] border border-thread" style={box} />
			<span
				className="pointer-events-none absolute whitespace-nowrap rounded-xs bg-thread px-1.5 py-[2px] font-mono text-2xs text-on-thread leading-3"
				style={{ left: box.left, top: box.top - 17 }}
			>
				checkout-bar
			</span>
		</>
	);
}

/** menu to cart is unconditional; cart to receipt sits inside a branch, so it is faint */
function Threads() {
	const edges = [0, 1].map((index) => {
		const from = COLS[index] ?? 0;
		const to = COLS[index + 1] ?? 0;
		const x1 = from + FW + 3;
		const y1 = ROW_1 + 158;
		const x2 = to - 9;
		const y2 = ROW_1 + 186;
		return {
			d: `M${x1} ${y1}C${x1 + 16} ${y1} ${x2 - 12} ${y2} ${x2} ${y2}`,
			head: `m${x2 + 8} ${y2}-8-4.5v9Z`,
			faint: index > 0,
		};
	});
	return (
		<svg className="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
			{edges.map((edge) => (
				<g key={edge.d} opacity={edge.faint ? 0.45 : 1}>
					<path d={edge.d} stroke="var(--color-thread)" strokeWidth="1.5" />
					<path d={edge.head} fill="var(--color-thread)" />
				</g>
			))}
		</svg>
	);
}

/* ---------- the screen ---------- */

export function SpoolAgentTurnScreen({ beat }: { beat: TurnBeat }) {
	const spec = BEATS[beat];
	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="39%">
			<CanvasChrome
				pages={pages(spec.phase)}
				selected="cart"
				tool="select"
				railWidth={420}
				railLabel="Agent"
				rail={
					<AgentTurnRail
						events={spec.events}
						usage={spec.usage}
						composer={spec.composer}
						working={spec.working}
					/>
				}
			>
				<TurnField phase={spec.phase} />
			</CanvasChrome>
		</SpoolShell>
	);
}
