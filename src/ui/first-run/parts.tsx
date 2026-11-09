import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import type { AgentEngineId } from "../../daemon/agent-engine";
import { cn } from "../cn";
import { CheckIcon } from "../icons";
import { Button } from "../primitives/actions";
import { Kbd } from "../primitives/display";

/**
 * The first run's small pieces (spool#250), from the design canvas's `onboarding-grow`:
 * a row, a tick, the agents' glyphs, the tiles and names in the light band, and the foot's
 * buttons with the key each answers.
 */

export const EASE = [0.22, 0.61, 0.36, 1] as const;
export const SPRING = { type: "spring", duration: 0.8, bounce: 0.12 } as const;

/** A selectable row: a click selects it, a double click does what return would. */
export function Row({
	selected,
	onSelect,
	onAct,
	children,
	end,
	...rest
}: {
	selected: boolean;
	onSelect: () => void;
	onAct: () => void;
	children: ReactNode;
	end: ReactNode;
	"data-first-run-row"?: string;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			onDoubleClick={onAct}
			aria-pressed={selected}
			className={cn(
				"relative flex h-[52px] w-full items-center gap-3 rounded-md px-2.5 text-left focus-ring-inset",
				"transition-[background-color] duration-fast ease-out",
				selected ? "bg-state-selected-strong" : "hover:bg-state-hover-raised",
			)}
			{...rest}
		>
			{children}
			<span className="flex shrink-0 items-center gap-2">{end}</span>
		</button>
	);
}

/** Done, with what it is done as. */
export function Ok({ children }: { children: ReactNode }) {
	return (
		<span className="flex items-center gap-1.5 text-secondary type-detail">
			{children}
			<motion.span
				initial={{ scale: 0.3 }}
				animate={{ scale: 1 }}
				transition={{ type: "spring", duration: 0.45, bounce: 0.45 }}
				className="grid size-4 place-items-center rounded-full bg-accent text-on-accent"
			>
				<CheckIcon className="size-2.5" />
			</motion.span>
		</span>
	);
}

/** Claude's ten rays */
const RAYS = [0, 36, 72, 108, 144, 180, 216, 252, 288, 324];

export function AgentGlyph({ who, className }: { who: AgentEngineId; className?: string }) {
	return (
		<span
			className={cn(
				"grid size-8 shrink-0 place-items-center rounded-md border border-line-default bg-surface-panel text-primary",
				className,
			)}
		>
			{who === "claude" ? (
				<svg viewBox="0 0 32 32" className="size-[18px]" aria-hidden="true">
					{RAYS.map((angle) => (
						<rect
							key={angle}
							x="15"
							y="3.5"
							width="2.2"
							height="11"
							rx="1.1"
							fill="currentColor"
							transform={`rotate(${angle} 16 16)`}
						/>
					))}
				</svg>
			) : who === "codex" ? (
				<svg viewBox="0 0 32 32" className="size-[18px]" fill="none" aria-hidden="true">
					<path
						d="M16 4.5 26 10.25v11.5L16 27.5 6 21.75v-11.5Z"
						stroke="currentColor"
						strokeWidth="2.2"
						strokeLinejoin="round"
					/>
					<path
						d="m12 13 3.5 3-3.5 3M17.5 19.5H21"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			) : (
				<span className="font-serif text-[17px] leading-none italic">π</span>
			)}
		</span>
	);
}

/** A plain glyph in the agents' box, for pi's ways in. */
export function Glyph({ children }: { children: ReactNode }) {
	return (
		<span className="grid size-8 shrink-0 place-items-center rounded-md border border-line-default bg-surface-panel text-primary">
			{children}
		</span>
	);
}

/** The three ways in, as tiles in the light: each lights when it is ready, and rings while it installs. */
export function AgentTiles({
	tiles,
}: {
	tiles: readonly { who: AgentEngineId; phase: "absent" | "busy" | "ready" }[];
}) {
	return (
		<div className="flex items-center gap-5">
			{tiles.map((tile, i) => (
				<motion.div
					key={tile.who}
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, ease: EASE, delay: 0.1 + i * 0.07 }}
					className="relative"
				>
					<motion.div
						animate={tile.phase === "busy" ? { scale: [1, 1.05, 1] } : { scale: 1 }}
						transition={
							tile.phase === "busy"
								? { duration: 1.6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }
								: { type: "spring", duration: 0.4, bounce: 0.4 }
						}
					>
						<AgentGlyph
							who={tile.who}
							className={cn(
								"size-12 rounded-lg bg-surface-window/70 backdrop-blur-sm transition-[border-color,color] duration-slow ease-out [&_svg]:size-[22px] [&>span]:text-[21px]",
								tile.phase === "ready" ? "border-accent text-primary" : "border-line-strong text-secondary",
							)}
						/>
					</motion.div>
					<AnimatePresence>
						{tile.phase === "ready" ? (
							<motion.span
								key="ok"
								initial={{ scale: 0.3, opacity: 0 }}
								animate={{ scale: 1, opacity: 1 }}
								exit={{ scale: 0.3, opacity: 0 }}
								transition={{ type: "spring", duration: 0.45, bounce: 0.45 }}
								className="absolute -right-1.5 -bottom-1.5 grid size-5 place-items-center rounded-full bg-accent text-on-accent"
							>
								<CheckIcon className="size-3" />
							</motion.span>
						) : null}
					</AnimatePresence>
				</motion.div>
			))}
		</div>
	);
}

const PEOPLE = [
	{ name: "Ada", x: -120, y: 6, tone: "bg-accent text-on-accent" },
	{ name: "Mira", x: 12, y: -26, tone: "bg-surface-inverse text-on-inverse" },
	{ name: "Jonas", x: 118, y: 14, tone: "bg-surface-raised text-primary" },
];

/** Teammates by name, drifting in the light: what a team on one canvas looks like. */
export function TeamTags({ gathered }: { gathered: boolean }) {
	return (
		<div className="relative h-20 w-[360px]" aria-hidden="true">
			{PEOPLE.map((p, i) => (
				<motion.div
					key={p.name}
					className="absolute top-1/2 left-1/2 flex items-start"
					initial={{ opacity: 0, x: p.x, y: p.y + 12 }}
					animate={{ opacity: 1, x: gathered ? p.x * 0.55 : p.x, y: [p.y, p.y - 5, p.y] }}
					transition={{
						opacity: { duration: 0.5, delay: 0.15 + i * 0.1 },
						x: { type: "spring", duration: 0.9, bounce: 0.2 },
						y: { duration: 3.4 + i * 0.5, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", delay: i * 0.3 },
					}}
				>
					<svg viewBox="0 0 16 16" className="size-4 text-primary" aria-hidden="true">
						<path
							d="M2 1.5 13 8l-4.6 1.1L6 13.5Z"
							fill="currentColor"
							stroke="var(--color-surface-window)"
							strokeWidth="1"
							strokeLinejoin="round"
						/>
					</svg>
					<span
						className={cn(
							"mt-3 -ml-1 rounded-full px-2 py-0.5 type-label transition-colors duration-slow",
							gathered || i === 0 ? p.tone : "bg-surface-raised text-secondary",
						)}
					>
						{p.name}
					</span>
				</motion.div>
			))}
		</div>
	);
}

export function SoundIcon({ muted }: { muted: boolean }) {
	return (
		<svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
			<path d="M3 6h2.2L8.5 3.2v9.6L5.2 10H3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
			{muted ? (
				<path d="m10.5 6 3.5 4m0-4-3.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
			) : (
				<path
					d="M10.6 6.1a2.6 2.6 0 0 1 0 3.8M12.4 4.4a5 5 0 0 1 0 7.2"
					stroke="currentColor"
					strokeWidth="1.4"
					strokeLinecap="round"
				/>
			)}
		</svg>
	);
}

/** A step's title and its line, swapping when what it says changes. */
export function Head({ title, children }: { title: string; children: ReactNode }) {
	return (
		<AnimatePresence mode="popLayout" initial={false}>
			<motion.div
				key={title}
				initial={{ opacity: 0, y: 6 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0, y: -6 }}
				transition={{ duration: 0.28, ease: EASE }}
			>
				<h1 className="text-primary type-heading">{title}</h1>
				<p className="mt-1.5 text-secondary type-body">{children}</p>
			</motion.div>
		</AnimatePresence>
	);
}

/** The foot's one act, with the key that does it too. */
export function Primary({
	children,
	onClick,
	disabled,
	loading,
}: {
	children: string;
	onClick: () => void;
	disabled?: boolean | undefined;
	loading?: boolean | undefined;
}) {
	return (
		<Button variant="primary" onClick={onClick} disabled={disabled} loading={loading} className="gap-2 pr-1.5">
			{children}
			<Kbd className="border-on-inverse/20 text-on-inverse/60">↵</Kbd>
		</Button>
	);
}

export function Secondary({ children, onClick, esc = true }: { children: string; onClick: () => void; esc?: boolean }) {
	return (
		<Button variant="ghost" onClick={onClick} className={cn("gap-2", esc && "pr-1.5")}>
			{children}
			{esc ? <Kbd>esc</Kbd> : null}
		</Button>
	);
}
