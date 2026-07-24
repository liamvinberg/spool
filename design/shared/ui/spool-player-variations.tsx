import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { CoffeeScreen, type CoffeeScreenName } from "./coffee-screens";
import { BackIcon, CloseIcon, MotionIcon, RestartIcon } from "./spool-icons";

/**
 * Shared substrate for the player rethink: a 1440×900 mock of the play
 * surface — near-black stage, the kaffe phone letterboxed at native size —
 * plus a tiny walk (menu → cart) every variant drives for real. Variants own
 * their chrome and its life; this file owns the room it performs in.
 */

export const STAGE_W = 1440;
export const STAGE_H = 900;
export const PHONE_W = 390;
export const PHONE_H = 780;
export const PHONE_LEFT = (STAGE_W - PHONE_W) / 2;

export function phoneTop(bottomInset = 0): number {
	return Math.round((STAGE_H - bottomInset - PHONE_H) / 2);
}

export interface Walk {
	screen: CoffeeScreenName;
	stack: CoffeeScreenName[];
	epoch: number;
	back: () => void;
	restart: () => void;
	jump: (next: CoffeeScreenName) => void;
	/** Rewind to a hop by its index in [...stack, screen] — the tape scrub. */
	rewind: (index: number) => void;
}

/** The session under the chrome: arrived at cart from menu, restartable. */
export function useWalk(): Walk {
	const [screen, setScreen] = useState<CoffeeScreenName>("cart");
	const [stack, setStack] = useState<CoffeeScreenName[]>(["menu"]);
	const [epoch, setEpoch] = useState(0);
	return {
		screen,
		stack,
		epoch,
		back: () => {
			const prev = stack[stack.length - 1];
			if (prev === undefined) return;
			setStack(stack.slice(0, -1));
			setScreen(prev);
		},
		restart: () => {
			setScreen("menu");
			setStack([]);
			setEpoch((e) => e + 1);
		},
		jump: (next) => {
			if (next === screen) return;
			setStack([...stack, screen]);
			setScreen(next);
		},
		rewind: (index) => {
			const rows = [...stack, screen];
			const target = rows[index];
			if (target === undefined || index === rows.length - 1) return;
			setStack(rows.slice(0, index));
			setScreen(target);
		},
	};
}

/** The click that traveled each edge — the recording's unit of "what you did". */
export function edgeLabel(from: CoffeeScreenName, to: CoffeeScreenName): string {
	const labels: Record<string, string> = {
		"menu>cart": "till kassan",
		"cart>receipt": "betala",
		"cart>menu": "tillbaka",
		"receipt>menu": "ny beställning",
	};
	return labels[`${from}>${to}`] ?? "→";
}

/**
 * The chrome's pulse: while armed, any stillness longer than idleMs puts the
 * chrome to sleep; movement wakes it. Unarmed, it is simply always awake.
 */
export function useWake(armed: boolean, idleMs = 1600): { awake: boolean; wake: () => void } {
	const [awake, setAwake] = useState(true);
	const timer = useRef(0);
	useEffect(() => {
		if (!armed) {
			setAwake(true);
			return;
		}
		timer.current = window.setTimeout(() => setAwake(false), idleMs);
		return () => window.clearTimeout(timer.current);
	}, [armed, idleMs]);
	const wake = () => {
		if (!armed) return;
		setAwake(true);
		window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => setAwake(false), idleMs);
	};
	return { awake, wake };
}

export function PlayerStage({
	walk,
	bottomInset = 0,
	phoneLeft = PHONE_LEFT,
	cursorHidden = false,
	onMouseMove,
	children,
}: {
	walk: Walk;
	/** Height the bottom chrome claims — the phone recenters in what remains. */
	bottomInset?: number;
	/** Where the phone sits — side chrome recenters it in what remains. */
	phoneLeft?: number;
	cursorHidden?: boolean;
	onMouseMove?: () => void;
	children?: ReactNode;
}) {
	return (
		<div
			onMouseMove={onMouseMove}
			className={cn(
				"relative h-full w-full select-none overflow-hidden bg-bg font-mono text-text antialiased [font-synthesis:none]",
				cursorHidden && "cursor-none",
			)}
		>
			<div
				className="absolute transition-[top,left] duration-300"
				style={{ left: phoneLeft, top: phoneTop(bottomInset), width: PHONE_W, height: PHONE_H }}
			>
				<CoffeeScreen key={walk.epoch} screen={walk.screen} scale="full" />
			</div>
			{children}
		</div>
	);
}

/** Drafting registration marks just outside the screen's corners. */
export function TickFrame({ left, top }: { left: number; top: number }) {
	const corner = "pointer-events-none absolute h-[10px] w-[10px] border-border-raised";
	return (
		<div
			className="pointer-events-none absolute transition-[left,top] duration-300"
			style={{ left, top, width: PHONE_W + 14, height: PHONE_H + 14 }}
		>
			<span className={cn(corner, "left-0 top-0 border-l border-t")} />
			<span className={cn(corner, "right-0 top-0 border-r border-t")} />
			<span className={cn(corner, "bottom-0 left-0 border-b border-l")} />
			<span className={cn(corner, "bottom-0 right-0 border-b border-r")} />
		</div>
	);
}

export function PillButton({
	label,
	disabled,
	onClick,
	className,
	children,
}: {
	label: string;
	disabled?: boolean;
	onClick?: () => void;
	className?: string;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm text-muted transition-colors hover:bg-surface disabled:pointer-events-none disabled:opacity-40",
				className,
			)}
		>
			{children}
		</button>
	);
}

export function MotionButton({ on, onToggle, bare = false }: { on: boolean; onToggle: () => void; bare?: boolean }) {
	return (
		<button
			type="button"
			aria-label="Motion"
			aria-pressed={on}
			onClick={onToggle}
			className={cn(
				"flex cursor-pointer items-center justify-center rounded-sm transition-colors",
				bare ? "h-7 w-7 hover:bg-surface" : "h-[22px] w-[30px]",
				on ? (bare ? "text-text" : "bg-surface text-text") : "text-muted",
				!bare && !on && "hover:bg-surface",
			)}
		>
			<MotionIcon className="h-3.5 w-3.5" />
		</button>
	);
}

/**
 * The reduced pill: back, the current frame's name — the walked trail is
 * session data, not live chrome — a hairline, then the session controls.
 */
export function PlayerPill({
	walk,
	motion,
	onMotion,
	trailing,
	className,
}: {
	walk: Walk;
	motion: boolean;
	onMotion: () => void;
	/** Extra controls between motion and close — the fullscreen seat. */
	trailing?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"absolute bottom-7 left-1/2 flex -translate-x-1/2 items-center gap-[3px] rounded-md border border-border-raised bg-raised px-2 py-1.5",
				className,
			)}
		>
			<PillButton label="Back" disabled={walk.stack.length === 0} onClick={walk.back}>
				<BackIcon className="h-4 w-4" />
			</PillButton>
			<span className="px-[3px] text-sm leading-sm">{walk.screen}</span>
			<span className="h-[18px] w-px bg-border-raised" />
			<PillButton label="Restart" onClick={walk.restart}>
				<RestartIcon className="h-4 w-4" />
			</PillButton>
			<MotionButton on={motion} onToggle={onMotion} />
			{trailing}
			<PillButton label="Close">
				<CloseIcon className="h-4 w-4" />
			</PillButton>
		</div>
	);
}
