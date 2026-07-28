import { motion, useReducedMotion } from "motion/react";
import { cn } from "../../../shared/lib/utils";
import { ThreadIcon } from "../../../shared/ui/spool-icons";
import { ThreadMark } from "../../../shared/ui/spool-thread-mark";

/**
 * Candidate marks for the rail's two panes (#144, second pass).
 *
 * The first pass drew a speech bubble for the agent, borrowed the canvas's flow
 * arrow for connections, and hung #136's mark underneath the glyph. All three were
 * rejected: the bubble is somebody else's product, the arrow is already the header's
 * threads toggle, and a satellite mark under an icon is two objects pretending to be
 * one.
 *
 * So this sheet separates the three decisions that were tangled in that drawing.
 * What the agent's glyph *is*. Where its state *lives*. What connections' glyph is.
 * Everything is drawn at the size it ships at — 14px in a 44px cell — with a 3×
 * blow-up beside it, because a glyph judged only at 3× is a glyph judged in a size
 * it will never appear in.
 *
 * One measurement governs the whole sheet: #136's mark is a 14px box with a 9px
 * ring in it, and that is roughly the floor at which turning still reads as turning.
 * Anything below about 8px across cannot carry motion, which is why no candidate
 * here hides the state inside a 3px dot.
 */

const SPIN = { duration: 1.15, repeat: Number.POSITIVE_INFINITY, ease: "linear" as const };

/** the four things a cell has to be able to look like */
export type Cell = "rest" | "working" | "unread" | "open";

export type AgentGlyph = "log" | "prompt" | "said" | "ring";
export type Treatment = "under" | "orbit" | "write" | "self";
export type LinkGlyph = "arrow" | "fanout" | "edge" | "count";

/* ---------- the agent's glyph ---------- */

/**
 * log — the rail's own self-portrait: a mark and a line, twice. What the pane is.
 *
 * `held` is the unread state kept inside the drawing rather than beside it: the
 * glyph's own first bullet swells to the size #136's dot is and takes text strength,
 * so the thing that says something is waiting is a part of the icon. A corner badge
 * was drawn first and is the satellite this pass exists to delete.
 */
function LogGlyph({
	className,
	writing = false,
	held = false,
}: {
	className?: string;
	writing?: boolean;
	held?: boolean;
}) {
	const still = useReducedMotion() === true;
	const lines = ["M6.4 5.4h7.2", "M6.4 10.6h4.6"];
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<circle cx="3.2" cy="5.4" r={held ? 2.3 : 1.15} fill="currentColor" />
			<circle cx="3.2" cy="10.6" r="1.15" fill="currentColor" />
			{lines.map((line, index) => (
				<motion.path
					key={line}
					d={line}
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					initial={false}
					animate={writing && !still ? { pathLength: [0, 1, 1] } : { pathLength: 1 }}
					transition={
						writing && !still
							? {
									duration: 1.8,
									times: [0, 0.45, 1],
									delay: index * 0.3,
									repeat: Number.POSITIVE_INFINITY,
									ease: "easeOut",
								}
							: { duration: 0 }
					}
				/>
			))}
		</svg>
	);
}

/** prompt — the caret you type after. Says say something; risks saying terminal. */
function PromptGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<path
				d="M4.2 4.8 7.4 8l-3.2 3.2"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path d="M9.6 11.2h3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}

/** said — two turns of a conversation, without borrowing anybody's bubble. */
function SaidGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<path d="M2.6 5.6h7.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
			<path d="M5.8 10.4h7.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}

/**
 * ring — the rail's ring, promoted from state to identity.
 *
 * Every row in this rail is a ring and a few words, so the ring is the most spool
 * thing there is. Paired with `self` it is the only candidate where identity and
 * state are one drawing rather than two: it rests thin, turns while work happens,
 * and fills when something is waiting to be read.
 */
function RingGlyph({ className, state }: { className?: string; state: Cell }) {
	const still = useReducedMotion() === true;
	const turning = state === "working";
	if (state === "unread") {
		return (
			<svg viewBox="0 0 16 16" className={className} aria-hidden="true">
				<circle cx="8" cy="8" r="4.6" fill="currentColor" />
			</svg>
		);
	}
	return (
		<motion.svg
			viewBox="0 0 16 16"
			className={className}
			fill="none"
			aria-hidden="true"
			animate={still || !turning ? undefined : { rotate: 360 }}
			transition={still || !turning ? undefined : SPIN}
		>
			<circle cx="8" cy="8" r="4.6" stroke="currentColor" strokeWidth="1.5" strokeOpacity={turning ? 0.26 : 1} />
			{turning ? (
				<path d="M8 3.4A4.6 4.6 0 0 1 12.6 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
			) : null}
		</motion.svg>
	);
}

/* ---------- connections' glyph ---------- */

/** fanout — one frame and what it points at. The pane lists outbound links only. */
function FanoutGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<circle cx="3.4" cy="8" r="1.7" stroke="currentColor" strokeWidth="1.5" />
			<path d="M5.6 7.2 10.2 4.6M5.6 8.8l4.6 2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
			<circle cx="12.4" cy="3.8" r="1.15" fill="currentColor" />
			<circle cx="12.4" cy="12.2" r="1.15" fill="currentColor" />
		</svg>
	);
}

/** edge — two frames and the walk between them, which is what a connection is. */
function EdgeGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<circle cx="4.2" cy="4.6" r="1.9" stroke="currentColor" strokeWidth="1.5" />
			<circle cx="11.8" cy="11.4" r="1.9" stroke="currentColor" strokeWidth="1.5" />
			<path d="M5.7 6.1 10.3 9.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}

/* ---------- the cells ---------- */

const TONE: Record<Cell, string> = {
	rest: "text-muted/60",
	working: "text-muted/60",
	unread: "text-text/85",
	open: "text-text",
};

/**
 * The agent's cell, in one of four treatments.
 *
 * `under` is the rejected control, kept so the sheet compares against something
 * real. `orbit` keeps a glyph and gives the state the ring around it, which is the
 * one place a 9px moving thing fits without a satellite. `write` puts the motion
 * inside the glyph — the log draws its own lines, which is what the pane is doing.
 * `self` deletes the distinction: the ring is the glyph and the glyph is the state.
 */
export function AgentCell({
	glyph,
	treatment,
	state,
	scale = 1,
}: {
	glyph: AgentGlyph;
	treatment: Treatment;
	state: Cell;
	scale?: number;
}) {
	const still = useReducedMotion() === true;
	const size = 14 * scale;
	const tone = TONE[state];
	const body =
		glyph === "log" ? (
			<LogGlyph className="h-full w-full" writing={treatment === "write" && state === "working"} />
		) : glyph === "prompt" ? (
			<PromptGlyph className="h-full w-full" />
		) : glyph === "said" ? (
			<SaidGlyph className="h-full w-full" />
		) : (
			<RingGlyph className="h-full w-full" state={treatment === "self" ? state : "rest"} />
		);

	if (treatment === "self" || treatment === "write") {
		return (
			<span className={cn("relative flex items-center justify-center", tone)} style={{ width: size, height: size }}>
				{glyph === "log" ? (
					<LogGlyph
						className="h-full w-full"
						writing={treatment === "write" && state === "working"}
						held={state === "unread"}
					/>
				) : (
					body
				)}
			</span>
		);
	}

	if (treatment === "orbit") {
		const orbit = 22 * scale;
		const turning = state === "working";
		const held = state === "unread";
		return (
			<span
				className={cn("relative flex items-center justify-center", tone)}
				style={{ width: orbit, height: orbit }}
			>
				<span className="flex items-center justify-center" style={{ width: 12 * scale, height: 12 * scale }}>
					{body}
				</span>
				{turning || held ? (
					<motion.svg
						viewBox="0 0 22 22"
						className="absolute inset-0 h-full w-full"
						fill="none"
						aria-hidden="true"
						animate={still || !turning ? undefined : { rotate: 360 }}
						transition={still || !turning ? undefined : SPIN}
					>
						<circle
							cx="11"
							cy="11"
							r="9.6"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeOpacity={turning ? 0.24 : 0.85}
						/>
						{turning ? (
							<path d="M11 1.4A9.6 9.6 0 0 1 20.6 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
						) : null}
					</motion.svg>
				) : null}
			</span>
		);
	}

	return (
		<span className={cn("flex flex-col items-center gap-[3px]", tone)}>
			<span style={{ width: size, height: size }}>{body}</span>
			<span className="flex items-center justify-center" style={{ width: size, height: size }}>
				<span className="flex items-center justify-center" style={{ width: 14, height: 14, transform: `scale(${scale})` }}>
					<ThreadMark life={state === "working" ? "running" : state === "unread" ? "unread" : "read"} />
				</span>
			</span>
		</span>
	);
}

/** connections' cell: a glyph and the count, or the count doing the whole job. */
export function LinkCell({
	glyph,
	links,
	active,
	scale = 1,
}: {
	glyph: LinkGlyph;
	links: number | null;
	active: boolean;
	scale?: number;
}) {
	const size = 14 * scale;
	const tone = active ? "text-text" : "text-muted/60";
	const count = active || links === null ? null : (
		<span className="font-mono tabular-nums leading-none" style={{ fontSize: 10 * scale }}>
			{links}
		</span>
	);
	if (glyph === "count") {
		return (
			<span className={cn("flex items-center justify-center font-mono tabular-nums", tone)}>
				<span style={{ fontSize: 12 * scale, lineHeight: 1 }}>{links === null ? "—" : links}</span>
			</span>
		);
	}
	const body =
		glyph === "arrow" ? (
			<ThreadIcon className="h-full w-full" />
		) : glyph === "fanout" ? (
			<FanoutGlyph className="h-full w-full" />
		) : (
			<EdgeGlyph className="h-full w-full" />
		);
	return (
		<span className={cn("flex flex-col items-center gap-[3px]", tone)}>
			<span style={{ width: size, height: size }}>{body}</span>
			<span className="flex items-center" style={{ height: 12 * scale }}>
				{count}
			</span>
		</span>
	);
}

/** a real 44px cell of the real strip, so nothing is judged on white space */
export function CellBox({ state, children }: { state: Cell; children: React.ReactNode }) {
	return (
		<span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
			{state === "open" ? <span className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-thread" /> : null}
			{children}
		</span>
	);
}
