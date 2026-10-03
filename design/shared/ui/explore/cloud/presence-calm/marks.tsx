import type { ReactNode } from "react";
import { cn } from "shared/lib/utils";
import {
	type AgentNow,
	agentAt,
	BLOCKS,
	blockRect,
	clamp01,
	ease,
	easeOut,
	lerp,
	plate,
	type Pt,
	type Rect,
	type Run,
} from "./model";

/**
 * The marks the three takes share: the agent's hand as it ships (thread, node,
 * plate), the lane a run leaves, your own pointer, and a peer's dot. Each take
 * decides when to draw them and at what ink; none of them decides that here.
 */

/** an agent at t, or the one that let go in the last 400ms, with how present it is */
export function agentPresence(runs: readonly Run[] | undefined, t: number): { now: AgentNow; ink: number } | undefined {
	const live = agentAt(runs, t);
	if (live !== undefined) return { now: live, ink: easeOut((t - live.run.from) / 0.24) };
	const ended = runs?.find((r) => t >= r.to && t < r.to + 0.4);
	if (ended === undefined) return undefined;
	const held = agentAt([ended], ended.to - 0.001);
	if (held === undefined) return undefined;
	return { now: held, ink: 1 - ease((t - ended.to) / 0.4) };
}

function blockCenter(rect: Rect, block: number, k: number): number {
	const b = BLOCKS[block] ?? BLOCKS[0] ?? { y: 0, h: 0 };
	return rect.y + (b.y + b.h / 2) * k;
}

/**
 * The shipped hand, located: a node welded to the wall, a thread that runs the
 * frame's height while it reads and a short segment beside the block it writes,
 * travelling between blocks in 240ms. `label` rides the node when a take wants
 * the hand named.
 */
export function Hand({
	rect,
	now,
	t,
	k,
	ink = 1,
	side = "left",
	label,
	plates = true,
}: {
	rect: Rect;
	now: AgentNow;
	t: number;
	k: number;
	ink?: number;
	side?: "left" | "right";
	label?: ReactNode;
	plates?: boolean;
}) {
	const x = side === "left" ? rect.x - 11 : rect.x + rect.w + 11;
	let top = rect.y;
	let bottom = rect.y + rect.h;
	if (now.run.kind === "write") {
		const len = Math.max(18, Math.min(76, rect.h * 0.24));
		const to = now.last === undefined ? rect.y + len / 2 : blockCenter(rect, now.last.block, k);
		const from = now.before === undefined ? to : blockCenter(rect, now.before.block, k);
		const c = lerp(from, to, ease(now.since / 0.24));
		top = c - len / 2;
		bottom = c + len / 2;
	} else {
		// the full-height thread winds down off the node
		bottom = lerp(rect.y, rect.y + rect.h, easeOut((t - now.run.from) / 0.5));
	}
	return (
		<>
			{plates && now.run.kind === "write" ? <Plates rect={rect} now={now} t={t} k={k} ink={ink} /> : null}
			<span
				className="pointer-events-none absolute w-[1.5px] rounded-full bg-text"
				style={{ left: x - 0.75, top, height: Math.max(0, bottom - top), opacity: ink }}
			/>
			<span
				className="pointer-events-none absolute h-[7px] w-[7px] rounded-[2px] border border-muted bg-canvas"
				style={{ left: x - 3.5, top: top - 11, opacity: ink }}
			/>
			{label === undefined ? null : (
				<span
					className={cn(
						"pointer-events-none absolute whitespace-nowrap text-text type-detail",
						side === "left" ? "-translate-x-full pr-3" : "pl-3",
					)}
					style={{ left: x, top: top - 15, opacity: ink }}
				>
					{label}
				</span>
			)}
		</>
	);
}

/** every write in the run still inside its 860ms envelope, as a tint on the block it changed */
export function Plates({ rect, now, t, k, ink = 1 }: { rect: Rect; now: AgentNow; t: number; k: number; ink?: number }) {
	return (
		<>
			{now.run.writes
				.filter((w) => t - w.t >= 0 && t - w.t < 0.86)
				.map((w) => {
					const box = blockRect(rect, w.block, k);
					const env = plate(t - w.t);
					return (
						<span
							key={w.t}
							className="pointer-events-none absolute rounded-[3px] bg-[#fff] mix-blend-difference"
							style={{
								left: box.x,
								top: box.y,
								width: box.w,
								height: box.h,
								opacity: env.opacity * 1.2 * ink,
								transform: `scaleY(${env.scale})`,
							}}
						/>
					);
				})}
		</>
	);
}

/**
 * The ledger a run leaves on the wall: one tick per landed write at the height it
 * changed, held 0.7s and then thinning away over six. Nothing about it repeats or
 * pulses; a run that stops leaves a fading shape and then nothing.
 */
export function Lane({ rect, run, t, k, ink = 1 }: { rect: Rect; run: Run; t: number; k: number; ink?: number }) {
	return (
		<>
			{run.writes
				.filter((w) => t >= w.t && t - w.t < 6)
				.map((w) => {
					const age = t - w.t;
					const v = age < 0.7 ? 0 : (age - 0.7) / 5.3;
					const b = BLOCKS[w.block] ?? BLOCKS[0] ?? { y: 0, h: 0 };
					return (
						<span
							key={w.t}
							className="pointer-events-none absolute rounded-[1px] bg-text"
							style={{
								left: rect.x - 6 + v * 2,
								top: rect.y + (b.y + 6) * k,
								width: lerp(3, 1, v),
								height: Math.max(3, (b.h - 12) * k),
								opacity: 0.85 * (1 - v) * ink,
							}}
						/>
					);
				})}
		</>
	);
}

/** your own pointer, drawn the way the OS draws it, for scenes where you act */
export function YouPointer({ at, pressed = false }: { at: Pt; pressed?: boolean }) {
	return (
		<svg
			viewBox="0 0 16 20"
			className="pointer-events-none absolute h-5 w-4 transition-transform duration-100"
			style={{ left: at.x - 1, top: at.y - 1, transform: pressed ? "scale(0.88)" : undefined, transformOrigin: "1px 1px" }}
			aria-hidden="true"
		>
			<path d="M1.2 1.2v14.6l3.7-3.5 2.4 5.6 2.5-1.1-2.4-5.5h5.2Z" fill="#fff" stroke="#000" strokeWidth="1.1" strokeLinejoin="round" />
		</svg>
	);
}

/** a quiet, still mark that a person is somewhere: a dot, optionally named */
export function PeerDot({
	at,
	name,
	ink = 0.55,
	size = 6,
	trail,
}: {
	at: Pt;
	name?: ReactNode;
	ink?: number;
	size?: number;
	trail?: ReactNode;
}) {
	return (
		<span className="pointer-events-none absolute" style={{ left: at.x, top: at.y }}>
			<span
				className="-translate-x-1/2 -translate-y-1/2 absolute rounded-full border-[1.5px] border-bg bg-text transition-[width,height,opacity] duration-300"
				style={{ width: size, height: size, opacity: ink }}
			/>
			{name === undefined ? null : (
				<span
					className="absolute top-[-10px] left-[9px] flex items-center gap-1.5 whitespace-nowrap rounded-xs bg-bg/90 px-1.5 py-px type-detail transition-opacity duration-300"
					style={{ opacity: clamp01(ink + 0.25) }}
				>
					<span className="text-text">{name}</span>
					{trail}
				</span>
			)}
		</span>
	);
}

/** the chip that says you are tied to someone else's camera, and the one key that lets go */
export function FollowChip({ children }: { children: ReactNode }) {
	return (
		<div className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 animate-menu-in rounded-xs border border-border-raised bg-surface px-2 py-[2px] text-text type-detail">
			{children}
		</div>
	);
}
