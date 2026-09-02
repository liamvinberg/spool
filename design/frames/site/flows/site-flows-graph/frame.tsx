import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { backArrowClass, backChipClass, SiteSection, STAGE_H, STAGE_W } from "shared/ui/site/site-section";

/**
 * site-flows--graph: the "flows" section of spool.page (site page). One 1440x900
 * board. The claim: nobody draws this map. every literal go inside a frame's
 * folder is an edge, and spool reads them straight out of the source.
 *
 * The stage is split and the two halves are one sentence. Below: the three files
 * in a small coffee project that contain a go, printed verbatim. Above: the
 * canvas those files produced, four frames and the arrows between them. A thread
 * leg runs from each file up into the element that causes the walk, and the
 * arrow leaves that same element on the other side, so cause and effect sit on
 * screen together the way site-states puts the seed under the panel it seeded.
 *
 * The trio the section exists to teach, all three legible in one still:
 *   data-go="cart"                   one literal, no branch -> one solid arrow
 *   ui.go(ok ? "receipt" : "topup")  a ternary              -> two faint arrows
 *   ui.go(routeFor(order))           a computed target      -> nothing at all
 * Each edge wears spool's own word for its certainty (will go / might go), and
 * the third source gets no arrow, only "unreadable" sitting where one would
 * have started. The absence is the point, so it is left as absence.
 *
 * The link runs both ways: hovering a target literal lights the one arrow it
 * drew, hovering an arrow lights the literal that drew it, and clicking either
 * takes the loop over for ~9s. A slow loop otherwise walks file to file, running
 * a comet up the leg and out along whatever it produced; the third beat's comet
 * stops at the button, because there is nowhere for it to go. Beat 0 is the boot
 * pose and never animates, so a fresh shot lands at rest; reduced motion parks
 * everything on the first file.
 *
 * The product screens are nodes, not the subject: the canvas's own kaffe sample
 * at canvas scale, wearing Instrument Sans, with topup added in the same face.
 * Geometry is fixed px inside the shell's STAGE_W x STAGE_H, never measured, and
 * the shell owns the one viewTransitionName in the document.
 */

/* ---------- the map: four frames, laid out on three column centres ---------- */

type NodeKey = "menu" | "cart" | "receipt" | "topup";

const COL_C = [240, 664, 1088] as const; // shared by the map and the source strip
const NODE_W = 176;
const ACTION_H = 30; // kaffe's action row at canvas scale: px-4 pb-4, h-[30px]

const NODE: Record<NodeKey, { x: number; y: number; w: number; h: number }> = {
	menu: { x: 152, y: 52, w: NODE_W, h: 300 },
	cart: { x: 576, y: 52, w: NODE_W, h: 300 },
	receipt: { x: 1000, y: 52, w: NODE_W, h: 126 },
	topup: { x: 1000, y: 234, w: NODE_W, h: 118 },
};

/** menu, cart and topup each own a file; receipt is a leaf and owns none. */
const NODE_SOURCE: Partial<Record<NodeKey, number>> = { menu: 0, cart: 1, topup: 2 };

/** The causing element sits in the action row; its centre line is where edges leave. */
const actionY = (key: NodeKey): number => NODE[key].y + NODE[key].h - 16 - ACTION_H / 2;
const actionRect = (key: NodeKey) => ({
	left: NODE[key].x + 16,
	top: NODE[key].y + NODE[key].h - 16 - ACTION_H,
	width: NODE[key].w - 32,
	height: ACTION_H,
});

/* ---------- the edges spool derived, and the one it could not ---------- */

type Edge = { id: string; from: NodeKey; to: NodeKey; firm: boolean };

const EDGES: readonly Edge[] = [
	{ id: "menu:cart", from: "menu", to: "cart", firm: true },
	{ id: "cart:receipt", from: "cart", to: "receipt", firm: false },
	{ id: "cart:topup", from: "cart", to: "topup", firm: false },
];

/** An element-to-frame curve: out of the action row, into the target's left edge. */
function edgeEnds(edge: Edge) {
	const a = NODE[edge.from];
	const b = NODE[edge.to];
	return {
		x1: a.x + a.w + 8,
		y1: actionY(edge.from),
		x2: b.x - 9,
		y2: b.y + b.h / 2,
	};
}

function edgePath(edge: Edge): string {
	const { x1, y1, x2, y2 } = edgeEnds(edge);
	const dx = (x2 - x1) * 0.45;
	return `M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

// The certainty word rides the flat run just before the head, where the curve's
// tangent is horizontal, so the clearance under it never changes.
const wordAnchor = (edge: Edge) => {
	const { x2, y2 } = edgeEnds(edge);
	return { left: x2 - 20, top: y2 - 17 };
};

/* ---------- the source strip: the literal lines that caused all of it ---------- */

type CodeLine = { text: string; targets?: readonly string[] };

type Source = {
	id: string;
	file: string;
	origin: NodeKey;
	edges: readonly string[];
	code: readonly CodeLine[];
	note: string;
};

const UNREADABLE = "topup:unreadable";

const SOURCES: readonly Source[] = [
	{
		id: "menu",
		file: "menu/frame.tsx",
		origin: "menu",
		edges: ["menu:cart"],
		code: [
			{ text: '<button data-go="cart">', targets: ['"cart"'] },
			{ text: "  Checkout" },
			{ text: "</button>" },
		],
		note: "One target, no branch, so the arrow is solid.",
	},
	{
		id: "cart",
		file: "cart/frame.tsx",
		origin: "cart",
		edges: ["cart:receipt", "cart:topup"],
		code: [
			{ text: "<button" },
			{
				text: '  onClick={() => ui.go(ok ? "receipt" : "topup")}',
				targets: ['"receipt"', '"topup"'],
			},
			{ text: ">" },
			{ text: "  Pay" },
			{ text: "</button>" },
		],
		note: "Two targets in a ternary, so both arrows are faint.",
	},
	{
		id: "topup",
		file: "topup/frame.tsx",
		origin: "topup",
		edges: [UNREADABLE],
		code: [
			{ text: "<button onClick={() => ui.go(routeFor(order))}>", targets: ["routeFor(order)"] },
			{ text: "  Add $10" },
			{ text: "</button>" },
		],
		note: "A computed target. spool marks the edge unreadable.",
	},
];

/** every target literal on screen, and the edge it drew (null when unreadable). */
const TARGET_EDGE: Record<string, string> = {
	'"cart"': "menu:cart",
	'"receipt"': "cart:receipt",
	'"topup"': "cart:topup",
	"routeFor(order)": UNREADABLE,
};

const ownerOf = (edgeId: string): number => {
	const i = SOURCES.findIndex((s) => s.edges.includes(edgeId));
	return i < 0 ? 0 : i;
};
const sourceAt = (index: number): Source => SOURCES[index] ?? SOURCES[0];
const centreAt = (index: number): number => COL_C[index] ?? COL_C[0];

/* ---------- two shades of code: ink for words and strings, muted for symbols ---------- */

const WORD = /([\p{L}_$][\p{L}\p{N}_$]*|"[^"]*")/u;

function shade(text: string): ReactNode[] {
	// split keeps the captures, so odd indexes are the words and strings.
	return text.split(WORD).map((part, i) =>
		part === "" ? null : (
			<span key={i} className={i % 2 === 1 ? "text-text" : "text-muted/70"}>
				{part}
			</span>
		),
	);
}

/** Slice a line around its target literals so each one can be lit on its own. */
function segment(line: CodeLine): readonly { id: string; text: string; target?: string }[] {
	const out: { id: string; text: string; target?: string }[] = [];
	let rest = line.text;
	for (const target of line.targets ?? []) {
		const at = rest.indexOf(target);
		if (at < 0) continue;
		out.push({ id: `${line.text}|${out.length}`, text: rest.slice(0, at) });
		out.push({ id: `${line.text}|${out.length}`, text: target, target });
		rest = rest.slice(at + target.length);
	}
	out.push({ id: `${line.text}|${out.length}`, text: rest });
	return out;
}

/* ---------- the sample product's fourth screen, in kaffe's own face ---------- */

function TopupScreen() {
	return (
		<div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-[#E4E4E7] bg-[#FEFEFE] px-4 pt-[18px] pb-4 font-[Instrument_Sans] text-[#17171A]">
			<h1 className="text-[16px] leading-5 font-semibold tracking-tight">Balance</h1>
			<div className="flex min-h-2 flex-1 items-center">
				<span className="text-[20px] leading-6 font-semibold tracking-tight">$4.00</span>
			</div>
			<div className="flex h-[30px] shrink-0 items-center justify-center rounded-md bg-[#17171A] text-2xs leading-3 font-medium text-[#FEFEFE]">
				Add $10
			</div>
		</div>
	);
}

function NodeScreen({ nodeKey }: { nodeKey: NodeKey }) {
	if (nodeKey === "topup") return <TopupScreen />;
	if (nodeKey === "menu") return <CoffeeScreen screen="menu" scale="canvas" />;
	if (nodeKey === "cart") return <CoffeeScreen screen="cart" scale="canvas" />;
	return <CoffeeScreen screen="receipt" scale="canvas" />;
}

/* ---------- one frame on the map ---------- */

function MapNode({
	nodeKey,
	lit,
	ringed,
	onSelect,
	onHover,
}: {
	nodeKey: NodeKey;
	lit: boolean;
	ringed: boolean;
	onSelect: (() => void) | null;
	onHover: (over: boolean) => void;
}) {
	const box = NODE[nodeKey];
	const body = (
		<>
			<span
				className={cn(
					"absolute left-0 font-mono text-xs leading-none transition-colors duration-200",
					ringed ? "text-thread" : lit ? "text-text" : "text-muted",
				)}
				style={{ top: -22 }}
			>
				{nodeKey}
			</span>
			<span className="block h-full w-full">
				<NodeScreen nodeKey={nodeKey} />
			</span>
		</>
	);

	if (onSelect === null) {
		return (
			<div className="absolute" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
				{body}
			</div>
		);
	}
	return (
		<button
			type="button"
			onClick={onSelect}
			onMouseEnter={() => onHover(true)}
			onMouseLeave={() => onHover(false)}
			aria-label={`Show the code that walks out of ${nodeKey}`}
			className="group absolute cursor-pointer text-left focus-visible:outline-none"
			style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
		>
			{body}
			<span className="pointer-events-none absolute -inset-[5px] rounded-[15px] border-[1.5px] border-thread opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
		</button>
	);
}

/* ---------- one file in the strip ---------- */

const CARD_X = [40, 464, 888] as const;
const CARD_W = 400;
const CARD_TOP = 412;

function SourceCard({
	source,
	index,
	focused,
	litEdges,
	onSelect,
	onHover,
	onHoverEdge,
}: {
	source: Source;
	index: number;
	focused: boolean;
	litEdges: readonly string[];
	onSelect: (index: number) => void;
	onHover: (over: boolean) => void;
	onHoverEdge: (edgeId: string | null) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onSelect(index)}
			onMouseEnter={() => onHover(true)}
			onMouseLeave={() => onHover(false)}
			aria-label={`Read ${source.file}`}
			className="group absolute cursor-pointer text-left focus-visible:outline-none"
			style={{ left: CARD_X[index] ?? CARD_X[0], top: CARD_TOP, width: CARD_W }}
		>
			<span className="flex items-center gap-1.5 font-mono text-xs leading-none">
				<span className="text-[8px] opacity-70">{focused ? "▶" : "▸"}</span>
				<span>
					<span className="text-muted/55">design/frames/</span>
					<span
						className={cn(
							"transition-colors duration-200",
							focused ? "text-thread" : "text-muted group-hover:text-text",
						)}
					>
						{source.file}
					</span>
				</span>
			</span>

			<div className="relative mt-2.5">
				<div
					className={cn(
						"flex h-[110px] flex-col justify-center rounded-md border-l-2 bg-bg/70 px-3 py-2.5 font-mono text-[11px] leading-[17px] transition-colors duration-200",
						focused ? "border-thread/60" : "border-border-raised",
					)}
					style={{ fontVariantLigatures: "none" }}
				>
					{source.code.map((line) => (
						<div key={line.text} className="whitespace-pre">
							{segment(line).map((seg) => {
								if (seg.target === undefined) return <span key={seg.id}>{shade(seg.text)}</span>;
								const edgeId = TARGET_EDGE[seg.target] ?? "";
								return (
									<span
										key={seg.id}
										onMouseEnter={() => onHoverEdge(edgeId)}
										onMouseLeave={() => onHoverEdge(null)}
										className={cn(
											"transition-colors duration-200",
											// the one spool could not resolve keeps a dotted rule under it
											edgeId === UNREADABLE && "underline decoration-dotted underline-offset-[3px]",
											litEdges.includes(edgeId)
												? "text-thread decoration-thread/70"
												: "text-text decoration-muted/50",
										)}
									>
										{seg.text}
									</span>
								);
							})}
						</div>
					))}
				</div>
				<span
					className={cn(
						"pointer-events-none absolute -inset-[4px] rounded-[10px] border border-thread/35 transition-opacity duration-300 group-hover:opacity-0",
						focused ? "opacity-100" : "opacity-0",
					)}
				/>
				<span className="pointer-events-none absolute -inset-[6px] rounded-[12px] border-[1.5px] border-thread opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
			</div>

			<p className="mt-2.5 font-mono text-2xs leading-none text-muted/80">{source.note}</p>
		</button>
	);
}

/* ---------- the drawn layer: legs up from the files, arrows out of the elements ---------- */

const LEG_FOOT = CARD_TOP - 12;
const LEG_HEAD = 352; // the bottom edge of menu, cart and topup

function Wiring({ litEdges, pulse, beat }: { litEdges: readonly string[]; pulse: number; beat: number }) {
	const legX = centreAt(beat);
	const legPath = `M${legX} ${LEG_FOOT} V${LEG_HEAD}`;
	const running = sourceAt(beat).edges.filter((id) => id !== UNREADABLE);

	return (
		<svg
			className="pointer-events-none absolute inset-0 h-full w-full"
			viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
			fill="none"
			aria-hidden="true"
		>
			{/* three legs: each file straight up into the element it belongs to */}
			{COL_C.map((cx, i) => (
				<path
					key={cx}
					d={`M${cx} ${LEG_FOOT} V${LEG_HEAD}`}
					stroke="var(--color-thread)"
					strokeOpacity={sourceAt(i).edges.some((id) => litEdges.includes(id)) ? 0.6 : 0.27}
					strokeWidth="1.4"
					strokeLinecap="round"
					className="transition-[stroke-opacity] duration-300"
				/>
			))}

			{/* the derived edges: solid when the walk will happen, faint when it might */}
			{EDGES.map((edge) => {
				const on = litEdges.includes(edge.id);
				const { x2, y2 } = edgeEnds(edge);
				// Certainty is carried by weight as well as light, so the distinction
				// survives whichever edge happens to be lit.
				const opacity = edge.firm ? (on ? 1 : 0.66) : on ? 0.6 : 0.4;
				return (
					<g key={edge.id}>
						<path
							d={edgePath(edge)}
							stroke="var(--color-thread)"
							strokeOpacity={opacity}
							strokeWidth={edge.firm ? 1.8 : 1.3}
							strokeLinecap="round"
							className="transition-[stroke-opacity] duration-300"
						/>
						<path
							d={`M${x2 - 7.5} ${y2 - 4.4} L${x2 + 0.5} ${y2} L${x2 - 7.5} ${y2 + 4.4} Z`}
							fill="var(--color-thread)"
							fillOpacity={opacity}
							className="transition-[fill-opacity] duration-300"
						/>
					</g>
				);
			})}

			{/* the comet: up the leg, then out along whatever that file produced */}
			{pulse > 0 ? (
				<motion.path
					key={`leg:${beat}:${pulse}`}
					d={legPath}
					pathLength={1}
					stroke="var(--color-thread)"
					strokeWidth="2.2"
					strokeLinecap="round"
					strokeDasharray="0.3 1"
					initial={{ strokeDashoffset: 0.3 }}
					animate={{ strokeDashoffset: -1 }}
					transition={{ duration: 0.45, ease: "easeInOut" }}
				/>
			) : null}
			{pulse > 0
				? running.map((id) => {
						const edge = EDGES.find((e) => e.id === id);
						if (edge === undefined) return null;
						return (
							<motion.path
								key={`${id}:${pulse}`}
								d={edgePath(edge)}
								pathLength={1}
								stroke="var(--color-thread)"
								strokeWidth="2.2"
								strokeLinecap="round"
								strokeDasharray="0.14 1"
								initial={{ strokeDashoffset: 0.14 }}
								animate={{ strokeDashoffset: -1 }}
								transition={{ duration: 0.72, ease: "easeInOut", delay: 0.42 }}
							/>
						);
					})
				: null}
		</svg>
	);
}

/** Invisible fat strokes so an arrow can be hovered and clicked like anything else. */
function EdgeHandles({
	onSelect,
	onHoverEdge,
}: {
	onSelect: (index: number) => void;
	onHoverEdge: (edgeId: string | null) => void;
}) {
	return (
		<svg
			className="pointer-events-none absolute inset-0 h-full w-full"
			viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
			fill="none"
			aria-hidden="true"
		>
			{EDGES.map((edge) => (
				<path
					key={edge.id}
					d={edgePath(edge)}
					stroke="transparent"
					strokeWidth="20"
					style={{ pointerEvents: "stroke", cursor: "pointer" }}
					onMouseEnter={() => onHoverEdge(edge.id)}
					onMouseLeave={() => onHoverEdge(null)}
					onClick={() => onSelect(ownerOf(edge.id))}
				/>
			))}
		</svg>
	);
}

/* ---------- the stage ---------- */

const BEAT_MS = 3800;
const PAUSE_MS = 9000;

function Flows() {
	const reduce = useReducedMotion();
	const anim = !reduce;

	const [beat, setBeat] = useState(0);
	const [pulse, setPulse] = useState(0);
	const [hoverCard, setHoverCard] = useState<number | null>(null);
	const [hoverEdge, setHoverEdge] = useState<string | null>(null);
	const [pausedUntil, setPausedUntil] = useState(0);

	// One move, whether the loop made it or a visitor did: the file becomes the
	// play head and the comet counter ticks, which is what runs the thread.
	const goTo = useCallback((index: number) => {
		setBeat(index);
		setPulse((n) => n + 1);
	}, []);

	useEffect(() => {
		if (!anim) return;
		const wait = Math.max(BEAT_MS, pausedUntil - Date.now());
		const id = window.setTimeout(() => goTo((beat + 1) % SOURCES.length), wait);
		return () => window.clearTimeout(id);
	}, [beat, pausedUntil, anim, goTo]);

	function select(index: number) {
		goTo(index);
		setPausedUntil(Date.now() + PAUSE_MS);
	}

	// Hovering an arrow narrows the light to that one edge; hovering a file or a
	// frame widens it back out to everything that file drew.
	const focus = hoverEdge !== null ? ownerOf(hoverEdge) : (hoverCard ?? beat);
	const litEdges = hoverEdge !== null ? [hoverEdge] : sourceAt(focus).edges;
	const ringedNode = sourceAt(focus).origin;
	const destinations = EDGES.filter((e) => litEdges.includes(e.id)).map((e) => e.to);
	// Every action row is the same box on the same baseline, so the ring is one
	// element that slides between them rather than three that blink.
	const home = actionRect("menu");
	const ring = actionRect(ringedNode);

	return (
		<>
			{/* the play head: a soft thread column that slides to whichever file is live */}
			<motion.div
				className="pointer-events-none absolute h-[840px] w-[620px] rounded-full"
				style={{
					left: COL_C[0] - 310,
					top: -120,
					background:
						"radial-gradient(circle, color-mix(in srgb, var(--color-thread) 11%, transparent) 0%, transparent 62%)",
				}}
				initial={false}
				animate={{ x: centreAt(beat) - COL_C[0] }}
				transition={{ type: "spring", stiffness: 110, damping: 22, mass: 1 }}
			/>

			<Wiring litEdges={litEdges} pulse={pulse} beat={beat} />

			{(["menu", "cart", "receipt", "topup"] as const).map((key) => {
				const owner = NODE_SOURCE[key];
				return (
					<MapNode
						key={key}
						nodeKey={key}
						lit={destinations.includes(key)}
						ringed={ringedNode === key}
						onSelect={owner === undefined ? null : () => select(owner)}
						onHover={(over) => setHoverCard(over && owner !== undefined ? owner : null)}
					/>
				);
			})}

			{/* the element the walk leaves from, ringed while its file is read */}
			<motion.span
				className="pointer-events-none absolute rounded-[7px] border border-thread"
				style={{
					left: home.left - 2,
					top: home.top - 2,
					width: home.width + 4,
					height: home.height + 4,
				}}
				initial={false}
				animate={{ x: ring.left - home.left, y: ring.top - home.top }}
				transition={{ type: "spring", stiffness: 130, damping: 22, mass: 1 }}
			/>

			{/* spool's own word for each edge's certainty, and for the one it lost */}
			{EDGES.map((edge) => (
				<span
					key={edge.id}
					className={cn(
						"pointer-events-none absolute -translate-x-full -translate-y-1/2 font-mono text-2xs leading-none transition-colors duration-300",
						litEdges.includes(edge.id) ? "text-thread" : "text-muted/60",
					)}
					style={wordAnchor(edge)}
				>
					{edge.firm ? "will go" : "might go"}
				</span>
			))}
			<span
				className="pointer-events-none absolute h-[3px] w-[3px] rounded-full transition-colors duration-300"
				style={{
					left: NODE.topup.x + NODE.topup.w + 8,
					top: actionY("topup") - 1.5,
					backgroundColor: litEdges.includes(UNREADABLE)
						? "var(--color-thread)"
						: "color-mix(in srgb, var(--color-muted) 60%, transparent)",
				}}
			/>
			<span
				className={cn(
					"pointer-events-none absolute -translate-y-1/2 font-mono text-2xs leading-none transition-colors duration-300",
					litEdges.includes(UNREADABLE) ? "text-thread" : "text-muted/60",
				)}
				style={{ left: NODE.topup.x + NODE.topup.w + 18, top: actionY("topup") }}
			>
				unreadable
			</span>

			{SOURCES.map((source, i) => (
				<SourceCard
					key={source.id}
					source={source}
					index={i}
					focused={focus === i}
					litEdges={litEdges}
					onSelect={select}
					onHover={(over) => setHoverCard(over ? i : null)}
					onHoverEdge={setHoverEdge}
				/>
			))}

			<EdgeHandles onSelect={select} onHoverEdge={setHoverEdge} />
		</>
	);
}

export default function SiteFlowsGraph() {
	return (
		<SiteSection
			title="Flows"
			lead="spool reads the navigation out of your frames and draws this map from it. Every arrow below comes from a line of code you can see."
			foot={[
				"A solid arrow is a target spool resolved. A faint one is a branch it could take.",
				"Move a frame on the canvas and the arrows follow it.",
			]}
			morph="site-flows-card"
			back={
				<button type="button" data-go="site-hub" aria-label="Back to canvas" className={backChipClass}>
					<span className={backArrowClass}>←</span>
					Canvas
				</button>
			}
		>
			<Flows />
		</SiteSection>
	);
}
