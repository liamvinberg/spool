import { motion, useReducedMotion } from "motion/react";
import { Fragment, type ReactNode, useCallback, useEffect, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { CoffeeScreen, type CoffeeScreenName } from "../../../shared/ui/coffee-screens";
import { backArrowClass, backChipClass, SiteSection, STAGE_H, STAGE_W } from "../../../shared/ui/site-section";

/**
 * site-flows--kaffe: the "flows" section of spool.page (site page). One 1440x900
 * board. The claim: a walk is not wiring. It is one attribute on a real element,
 * and the arrow spool draws leaves that element, not the frame's edge.
 *
 * The body is the demo, and it is the canvas's own sample product: kaffe, three
 * frames on a page — menu, cart, receipt. The two buttons that carry the walk
 * wear a thread ring; each arrow starts at its ring; and under every arrow sits
 * the source that put it there, printed verbatim, one <button data-go="..."> per
 * edge. Cause and effect on screen at the same time, the way site-states prints
 * the scenario file under each column. Both arrows are solid because both
 * attributes are unconditional: nothing here is a branch, so nothing is faint.
 *
 * The buttons are live. Clicking "Checkout" walks the demo to cart exactly as
 * the loop does and takes the loop over ~9s; the name tabs jump the play head
 * anywhere. A slow loop otherwise runs it: the comet sweeps the edge that fires,
 * the arriving frame re-composes (a screen mounts fresh on every arrival), and
 * the wrap from receipt back to menu runs no comet, because no attribute links
 * them — that beat is a restart, not a walk.
 *
 * The kaffe screens are the sample product, so they wear Instrument Sans and
 * their own light identity; spool's chrome stays Familjen Grotesk and Fragment
 * Mono, and thread is the only accent. Chrome is SiteSection, so the back chip,
 * heading, stage and foot lines match every peer section, and the document's one
 * viewTransitionName (site-flows-card) rides the stage.
 *
 * Geometry is fixed px inside the 1328x620 stage and never measured. The ring
 * needs no getBoundingClientRect: CoffeeScreen at scale="canvas" pins its action
 * 16px in from the left, right and bottom at 30px tall, so the box is arithmetic.
 * Boot pose composes instantly: beat 0 never animates and the comet starts null,
 * so a fresh shot lands at rest with the whole claim already visible.
 */

/* ---------- the walk: three frames, and the attribute between each pair ---------- */

type Step = {
	/** the frame's folder name, and the string a data-go points at */
	name: CoffeeScreenName;
	/** the frame this one's button reaches, or null at the end of the walk */
	to: CoffeeScreenName | null;
	/** the element that carries the walk, printed the way it sits in source */
	code: readonly string[];
	/** the quiet line under it */
	note: string;
};

const STEPS: readonly Step[] = [
	{
		name: "menu",
		to: "cart",
		code: ['<button data-go="cart">', "  Checkout", "</button>"],
		note: "one attribute. the click walks to cart.",
	},
	{
		name: "cart",
		to: "receipt",
		code: ['<button data-go="receipt">', "  Pay", "</button>"],
		note: "nearest data-go wins. the rows stay put.",
	},
	{
		name: "receipt",
		to: null,
		code: [],
		note: "no data-go. the walk stops here.",
	},
];

const EASE = [0.22, 1, 0.36, 1] as const;
const BEAT_MS = 3800;
const PAUSE_MS = 9000;

/* ---------- stage geometry: fixed px, never measured ---------- */

const SCREEN_W = 190;
const SCREEN_H = 344;
const SCREEN_TOP = 112;
const SCREEN_X = [79, 569, 1059] as const;
const SCREEN_MID = SCREEN_TOP + SCREEN_H / 2; // 284, where an arrow lands
const CENTER = [174, 664, 1154] as const;

// CoffeeScreen at scale="canvas" pins its action inside a 16px inset, 30px tall.
const PAD = 16;
const ACTION_H = 30;
const ACTION_TOP = SCREEN_H - PAD - ACTION_H; // screen-local
const RING = 3;
const ACTION_MID = SCREEN_TOP + ACTION_TOP + ACTION_H / 2; // 425, where an arrow starts

const BLOCK_W = 268;
// the two edge columns sit centred on the gaps their arrows cross; the last
// column has no edge, so it keeps its frame's left edge and stays short.
const COL_X = [285, 775, 1059] as const;
const PATH_Y = 476;
const BLOCK_H = 88;

const leftOf = (index: number): number => SCREEN_X[index] ?? SCREEN_X[0];
const centerOf = (index: number): number => CENTER[index] ?? CENTER[1];

/**
 * One leg, drawn from the ring around the button to the left edge of the frame
 * it reaches. Horizontal tangents at both ends, so it leaves the element flat
 * and arrives at the frame flat.
 */
function legPath(index: number): string {
	const x0 = leftOf(index) + SCREEN_W - PAD + RING;
	const x1 = leftOf(index + 1) - 9;
	const d = x1 - x0;
	return `M${x0} ${ACTION_MID} C${x0 + d * 0.46} ${ACTION_MID} ${x1 - d * 0.42} ${SCREEN_MID} ${x1} ${SCREEN_MID}`;
}

const LEGS: readonly string[] = [legPath(0), legPath(1)];

/* ---------- the two-shade code stance, jsx flavoured ---------- */

// Words and quoted strings in ink, every bracket, slash and equals in muted.
// The same stance as the shell's colorJson; no rainbow anywhere on this canvas.
function colorJsx(line: string): ReactNode[] {
	const parts = line.split(/("[^"]*"|[A-Za-z][A-Za-z0-9-]*)/g).filter((part) => part !== "");
	return parts.map((part, i) => (
		<span key={i} className={/^["A-Za-z]/.test(part) ? "text-text" : "text-muted/70"}>
			{part}
		</span>
	));
}

/* ---------- the arrows: read from the source printed underneath ---------- */

function Arrows({ comet }: { comet: { leg: number; n: number } | null }) {
	return (
		<svg
			className="pointer-events-none absolute inset-0 h-full w-full"
			viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
			fill="none"
			aria-hidden="true"
		>
			<defs>
				<marker
					id="kaffe-go"
					viewBox="0 0 8 8"
					refX="6.5"
					refY="4"
					markerWidth="7"
					markerHeight="7"
					markerUnits="userSpaceOnUse"
					orient="auto"
				>
					<path d="M1 1 8 4 1 7Z" fill="var(--color-thread)" fillOpacity="0.85" />
				</marker>
			</defs>
			{/* both legs at one weight: both attributes are unconditional */}
			{LEGS.map((d) => (
				<path
					key={d}
					d={d}
					stroke="var(--color-thread)"
					strokeOpacity="0.66"
					strokeWidth="1.6"
					strokeLinecap="round"
					markerEnd="url(#kaffe-go)"
				/>
			))}
			{/* the walk itself: a dash sweep in path-relative units, nothing measured */}
			{comet ? (
				<motion.path
					key={`${comet.leg}:${comet.n}`}
					d={LEGS[comet.leg] ?? ""}
					pathLength={1}
					stroke="var(--color-thread)"
					strokeWidth="2.4"
					strokeLinecap="round"
					strokeDasharray="0.14 1"
					initial={{ strokeDashoffset: 0.14 }}
					animate={{ strokeDashoffset: -1 }}
					transition={{ duration: 0.66, ease: "easeInOut" }}
				/>
			) : null}
		</svg>
	);
}

/* ---------- the page these three frames live on ---------- */

function PageChip({ active, anim }: { active: number; anim: boolean }) {
	return (
		<div className="absolute inset-x-0 flex justify-center" style={{ top: 26 }}>
			<div className="inline-flex h-[34px] items-center gap-3 rounded-md border border-border bg-surface px-3.5">
				<motion.span
					className="h-1.5 w-1.5 shrink-0 rounded-full bg-thread"
					animate={anim ? { opacity: [0.42, 1, 0.42] } : { opacity: 0.8 }}
					transition={
						anim ? { duration: 2.6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" } : { duration: 0.3 }
					}
				/>
				<span className="font-mono text-sm leading-none">
					<span className="text-muted/55">design/frames/</span>
					<span className="text-text">kaffe/</span>
				</span>
				<span className="h-4 w-px bg-border-raised" />
				<span className="flex items-center gap-1.5 font-mono text-sm leading-none">
					{STEPS.map((step, i) => (
						<Fragment key={step.name}>
							{i > 0 ? <span className="text-muted/45">→</span> : null}
							<span className={cn("transition-colors duration-300", active === i ? "text-thread" : "text-muted")}>
								{step.name}
							</span>
						</Fragment>
					))}
				</span>
			</div>
		</div>
	);
}

/* ---------- one frame on the stage, with the real button that leaves it ---------- */

function FrameCard({
	step,
	index,
	active,
	beat,
	onSelect,
	onWalk,
}: {
	step: Step;
	index: number;
	active: boolean;
	beat: number;
	/** move the play head here without crossing an edge */
	onSelect: () => void;
	/** cross this frame's own edge, the way the loop does */
	onWalk: () => void;
}) {
	return (
		<div
			className="absolute"
			style={{ left: leftOf(index), top: SCREEN_TOP, width: SCREEN_W, height: SCREEN_H }}
		>
			{/* the frame's name, which is exactly the string a data-go points at */}
			<button
				type="button"
				onClick={onSelect}
				aria-label={`show the ${step.name} frame`}
				className={cn(
					"absolute -top-[22px] left-0 flex cursor-pointer items-center gap-1.5 font-mono text-xs leading-none transition-colors duration-200 focus-visible:outline-none",
					active ? "text-thread" : "text-muted hover:text-text",
				)}
			>
				<span className="text-[8px] opacity-70">{active ? "▶" : "▸"}</span>
				{step.name}
			</button>

			{/* the frames never dim: white on a near-black canvas greys visibly at any
			    opacity under one, and a greyed product just looks broken. the play
			    head is carried by the name tab, the ring, the halo and the source. */}
			<div className="relative h-full w-full">
				{/* a screen mounts fresh on arrival: beat is this frame's arrival count */}
				<motion.div
					key={beat}
					className="h-full w-full"
					initial={beat > 0 ? { opacity: 0, y: 7 } : false}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.42, ease: EASE, delay: 0.24 }}
				>
					{/* never pass viewTransitionName: the stage owns this document's only one */}
					<CoffeeScreen screen={step.name} scale="canvas" />
				</motion.div>

				{/* the element that carries the edge, ringed, and really clickable */}
				{step.to === null ? null : (
					<button
						type="button"
						onClick={onWalk}
						aria-label={`walk to ${step.to}`}
						className="group absolute cursor-pointer focus-visible:outline-none"
						style={{ left: PAD, top: ACTION_TOP, width: SCREEN_W - PAD * 2, height: ACTION_H }}
					>
						<span className="absolute inset-0 rounded-md transition-colors duration-200 group-hover:bg-white/12" />
						<span
							className={cn(
								"pointer-events-none absolute rounded-[11px] border transition-colors duration-300",
								active ? "border-thread/80" : "border-thread/30 group-hover:border-thread/60",
							)}
							style={{ left: -RING, top: -RING, right: -RING, bottom: -RING }}
						/>
					</button>
				)}
			</div>
		</div>
	);
}

/* ---------- the source under each arrow: the attribute, verbatim ---------- */

function SourceColumn({ step, index, active }: { step: Step; index: number; active: boolean }) {
	return (
		<div className="absolute" style={{ left: COL_X[index], top: PATH_Y, width: BLOCK_W }}>
			<div className="font-mono text-2xs leading-none">
				<span className="text-muted/55">design/frames/kaffe/{step.name}/</span>
				<span className={cn("transition-colors duration-200", active ? "text-thread" : "text-muted")}>frame.tsx</span>
			</div>
			{step.to === null ? null : (
				<div
					className={cn(
						"mt-2.5 flex flex-col justify-center rounded-md border-l-2 bg-bg/70 px-3 py-2.5 font-mono text-[11px] leading-[17px] transition-colors duration-200",
						active ? "border-thread/60" : "border-border-raised",
					)}
					style={{ height: BLOCK_H, fontVariantLigatures: "none" }}
				>
					{step.code.map((line) => (
						<div key={line} className="whitespace-pre">
							{colorJsx(line)}
						</div>
					))}
				</div>
			)}
			<p className={cn("font-mono text-2xs leading-none text-muted/80", step.to === null ? "mt-3" : "mt-2.5")}>
				{step.note}
			</p>
		</div>
	);
}

/* ---------- the stage: the loop, and the take-over ---------- */

function Flow() {
	const reduce = useReducedMotion();
	const anim = !reduce;

	const [active, setActive] = useState(0);
	const [beats, setBeats] = useState<readonly number[]>([0, 0, 0]);
	const [comet, setComet] = useState<{ leg: number; n: number } | null>(null);
	const [pausedUntil, setPausedUntil] = useState(0);

	// One move, whether the loop made it or a visitor did. `leg` is the edge that
	// was actually crossed, so the comet only runs where an attribute carried it:
	// a jump between name tabs and the wrap home from receipt both pass null.
	const walk = useCallback((index: number, leg: number | null) => {
		setComet((prev) => (leg === null ? null : { leg, n: (prev?.n ?? 0) + 1 }));
		setActive(index);
		setBeats((prev) => prev.map((n, i) => (i === index ? n + 1 : n)));
	}, []);

	// Auto-advance on a slow loop; a take-over holds the head ~9s, then it resumes.
	useEffect(() => {
		if (!anim) return;
		const wait = Math.max(BEAT_MS, pausedUntil - Date.now());
		const id = window.setTimeout(() => {
			const next = (active + 1) % STEPS.length;
			walk(next, next === 0 ? null : active);
		}, wait);
		return () => window.clearTimeout(id);
	}, [active, pausedUntil, anim, walk]);

	const take = useCallback(
		(index: number, leg: number | null) => {
			walk(index, leg);
			setPausedUntil(Date.now() + PAUSE_MS);
		},
		[walk],
	);

	return (
		<>
			{/* the play head: a thread halo that slides to whichever frame is live */}
			<motion.div
				className="pointer-events-none absolute h-[460px] w-[460px] rounded-full"
				style={{
					left: centerOf(1) - 230,
					top: SCREEN_TOP + SCREEN_H / 2 - 230,
					background: "radial-gradient(circle, color-mix(in srgb, var(--color-thread) 13%, transparent) 0%, transparent 62%)",
				}}
				initial={false}
				animate={{ x: centerOf(active) - centerOf(1) }}
				transition={{ type: "spring", stiffness: 110, damping: 22, mass: 1 }}
			/>

			<PageChip active={active} anim={anim} />

			{STEPS.map((step, i) => (
				<FrameCard
					key={step.name}
					step={step}
					index={i}
					active={active === i}
					beat={beats[i] ?? 0}
					onSelect={() => take(i, null)}
					onWalk={() => take(i + 1, i)}
				/>
			))}

			<Arrows comet={comet} />

			{STEPS.map((step, i) => (
				<SourceColumn key={step.name} step={step} index={i} active={active === i} />
			))}
		</>
	);
}

export default function SiteFlowsKaffe() {
	return (
		<SiteSection
			title="flows"
			lead="three frames, two attributes. that is the whole walk."
			foot={[
				"no wiring panel, no hotspots. the link rides the button.",
				"spool reads these arrows from source. walking one verifies it.",
			]}
			morph="site-flows-card"
			back={
				<button type="button" data-go="site-hub" aria-label="back to canvas" className={backChipClass}>
					<span className={backArrowClass}>←</span>
					canvas
				</button>
			}
		>
			<Flow />
		</SiteSection>
	);
}
