import type { MouseEvent as ReactMouseEvent, ReactNode, PointerEvent as ReactPointerEvent, Ref } from "react";
import { createContext } from "react";
import { cn } from "../cn";
import { hotkeyKey } from "../hotkeys";
import { Spinner, WaitingMark } from "./agent-marks";
import { FADE_OUT_MS, useHeld, useLeaving } from "./agent-motion";
import type { SideId } from "./pane-layout";
import type { PaneDef } from "./pane-window";

/**
 * The panes' end of the window bar: each side's toggles at that side's end of
 * it, the left side's before Home and the right side's after everything else.
 * The bar is the shell's (`app.tsx`); it hands the pane window two places to
 * draw into, and a window with no bar around it draws its own.
 */

export interface BarSlots {
	readonly left: HTMLElement | null;
	readonly right: HTMLElement | null;
}

export const PaneBarSlots = createContext<BarSlots | null>(null);

const TOGGLE = 28;
const TOGGLE_GAP = 2;
/** the hairline between a side's toggles and its neighbours, with room either hand of it */
const RULE_W = 25;

const groupWidth = (count: number) => (count === 0 ? 0 : count * TOGGLE + (count - 1) * TOGGLE_GAP);

/** one side's toggles; its width eases, so what stands beside it makes room rather than jumping */
export function ToggleGroup({
	side,
	count,
	motion,
	groupRef,
	children,
}: {
	side: SideId;
	count: number;
	/** the width's transition, "none" under reduced motion */
	motion: string;
	groupRef: Ref<HTMLDivElement>;
	children: ReactNode;
}) {
	return (
		<div
			ref={groupRef}
			data-pane-toggles={side}
			// the right group hangs from the bar's end, so a toggle arriving there lands where it stays
			className={cn("flex h-full shrink-0 items-center gap-0.5", side === "right" && "justify-end")}
			style={{ width: groupWidth(count), transition: motion === "none" ? "none" : `width ${motion}` }}
		>
			{children}
		</div>
	);
}

export function BarRule({ shown, motion }: { shown: boolean; motion: string }) {
	return (
		<span
			aria-hidden="true"
			data-pane-bar-rule={shown ? "" : undefined}
			className="flex h-full shrink-0 items-center justify-center overflow-hidden"
			style={{
				width: shown ? RULE_W : 0,
				opacity: shown ? 1 : 0,
				transition: motion === "none" ? "none" : `width ${motion}, opacity ${motion}`,
			}}
		>
			<span className="h-[18px] w-px shrink-0 bg-border-raised" />
		</span>
	);
}

/**
 * One pane's toggle. The press feel is the house's: colour in 140ms on the
 * house curve, and the icon gives under the finger. A pane with something to say
 * says it here: the waiting mark while it waits on a person, out of sight or not; a
 * turning ring while a turn runs out of sight, one dot once it lands unread, and a
 * small dot for news in another of its chats (#364, #366). A mark that goes fades
 * out rather than vanishing, and nothing pulses.
 */
export function PaneToggle({
	def,
	lit,
	held,
	working,
	waiting,
	unread,
	onPress,
	onClick,
	onMenu,
}: {
	def: PaneDef;
	lit: boolean;
	held: boolean;
	working: boolean;
	waiting: boolean;
	unread: boolean;
	onPress: (event: ReactPointerEvent<HTMLElement>) => void;
	onClick: (event: ReactMouseEvent<HTMLElement>) => void;
	onMenu: (event: ReactMouseEvent<HTMLElement>) => void;
}) {
	const now: ToggleMarkKind | null = waiting
		? "waiting"
		: working
			? "working"
			: unread
				? "unread"
				: def.elsewhere === true
					? "elsewhere"
					: null;
	// what the mark was is kept for its exit
	const shown = useLeaving(now !== null, FADE_OUT_MS);
	const lastMark = useHeld(now);
	const mark = shown === null ? null : (now ?? lastMark);
	return (
		<button
			type="button"
			data-pane-toggle={def.id}
			aria-label={
				waiting
					? `${def.title}, waiting on you`
					: def.elsewhere === true && !working && !unread
						? `${def.title}, another chat has news`
						: def.title
			}
			aria-pressed={lit}
			title={`${def.title} ${hotkeyKey(def.hotkey)}`}
			onPointerDown={onPress}
			onClick={onClick}
			onContextMenu={onMenu}
			className={cn(
				"relative flex h-7 w-7 shrink-0 touch-none items-center justify-center rounded-sm transition-[background-color,color,transform,opacity] duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-surface active:scale-90 motion-reduce:transition-none",
				lit ? "text-text" : "text-muted/55 hover:text-text",
				held && "opacity-35",
			)}
		>
			{def.icon}
			{mark === null ? null : <ToggleMark kind={mark} leaving={shown === "leaving"} />}
		</button>
	);
}

type ToggleMarkKind = "waiting" | "working" | "unread" | "elsewhere";

/** what a pane has to say, on its toggle: arriving as it always did, and fading out on its way */
function ToggleMark({ kind, leaving }: { kind: ToggleMarkKind; leaving: boolean }) {
	const state = leaving ? "leaving" : "open";
	switch (kind) {
		case "waiting":
			return (
				<WaitingMark
					data-toggle-mark="waiting"
					data-toggle-mark-state={state}
					className={cn(
						"-top-0.5 -right-0.5 absolute h-3 w-3 rounded-full bg-bg text-text",
						leaving ? "animate-agent-fade-out" : "animate-agent-arrive",
					)}
				/>
			);
		case "working":
			return (
				<span
					aria-hidden="true"
					data-toggle-mark="working"
					data-toggle-mark-state={state}
					className={cn("-top-0.5 -right-0.5 absolute h-3 w-3 text-text/60", leaving && "animate-agent-fade-out")}
				>
					<Spinner strokeWidth={1.6} className="h-full w-full" />
				</span>
			);
		case "unread":
			return (
				<span
					aria-hidden="true"
					data-toggle-mark="unread"
					data-toggle-mark-state={state}
					className={cn(
						"absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-thread",
						leaving ? "animate-agent-fade-out" : "animate-unseen-in",
					)}
				/>
			);
		case "elsewhere":
			return (
				<span
					aria-hidden="true"
					data-toggle-mark="elsewhere"
					data-toggle-mark-state={state}
					className={cn(
						"absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-text/85",
						leaving ? "animate-agent-fade-out" : "animate-agent-fade-in",
					)}
				/>
			);
	}
}
