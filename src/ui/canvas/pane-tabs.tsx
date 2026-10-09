import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn";
import { attachHotkeyLayer } from "../hotkey-dispatch";
import { DotsIcon } from "../icons";
import { Spinner, WaitingMark } from "./agent-marks";
import { FADE_OUT_MS, useHeld, useLeaving } from "./agent-motion";
import { MenuItem } from "./context-menu";
import type { SideId } from "./pane-layout";

/**
 * The small parts of the panes' chrome (#359): what rides a tab or a rail icon,
 * the side's close glyph, and the button and menu a pane's own verbs are made of.
 * The window that places them is `pane-window.tsx`.
 */

/** a pane's verb in its tab row; the press feel is the house's */
export const PANE_VERB =
	"flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted/60 transition-[background-color,color,transform] duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-surface hover:text-text active:scale-90 motion-reduce:transition-none";

export type PaneMarkKind = "waiting" | "working" | "unread" | "elsewhere";

/** what a pane says on its tab or rail icon: kept through its fade out, as the agent's marks are */
export function PaneMark({ kind, placed }: { kind: PaneMarkKind | null; placed: "corner" | "inline" }) {
	const shown = useLeaving(kind !== null, FADE_OUT_MS);
	const last = useHeld(kind);
	const mark = shown === null ? null : (kind ?? last);
	if (mark === null) return null;
	const leaving = shown === "leaving";
	const state = leaving ? "leaving" : "open";
	const corner = placed === "corner";
	switch (mark) {
		case "waiting":
			return (
				<WaitingMark
					data-pane-mark="waiting"
					data-pane-mark-state={state}
					className={cn(
						"h-3 w-3 rounded-full text-text",
						corner && "-top-0.5 -right-0.5 absolute bg-bg",
						leaving ? "animate-agent-fade-out" : "animate-agent-arrive",
					)}
				/>
			);
		case "working":
			return (
				<span
					aria-hidden="true"
					data-pane-mark="working"
					data-pane-mark-state={state}
					className={cn(
						"text-text/60",
						corner ? "-top-0.5 -right-0.5 absolute h-3 w-3" : "h-2.5 w-2.5",
						leaving && "animate-agent-fade-out",
					)}
				>
					<Spinner strokeWidth={corner ? 1.6 : 1.8} className="h-full w-full" />
				</span>
			);
		case "unread":
		case "elsewhere":
			return (
				<span
					aria-hidden="true"
					data-pane-mark={mark}
					data-pane-mark-state={state}
					className={cn(
						"h-1.5 w-1.5 rounded-full",
						mark === "unread" ? "bg-thread" : "bg-text/85",
						corner && "absolute top-1 right-1",
						leaving
							? "animate-agent-fade-out"
							: mark === "unread"
								? "animate-unseen-in"
								: "animate-agent-fade-in",
					)}
				/>
			);
	}
}

/** the side drawn as a sidebar, its bar on the side's own hand */
export function SidebarIcon({ side, className }: { side: SideId; className?: string | undefined }) {
	const x = side === "left" ? 6.25 : 9.75;
	return (
		<svg viewBox="0 0 16 16" className={className} fill="none" aria-hidden="true">
			<rect x="2.25" y="3" width="11.5" height="10" rx="2" stroke="currentColor" strokeWidth="1.3" />
			<path d={`M${x} 3.4v9.2`} stroke="currentColor" strokeWidth="1.3" />
		</svg>
	);
}

export interface PaneMenuItem {
	readonly label: string;
	readonly keys?: string | undefined;
	readonly disabled?: boolean | undefined;
	readonly onSelect: () => void;
}

/** a pane's ⋯: the verbs too rare for its row, in a menu hung under it */
export function PaneMore({ label, items }: { label: string; items: readonly PaneMenuItem[] }) {
	const [open, setOpen] = useState(false);
	const [at, setAt] = useState<{ left: number; top: number } | null>(null);
	const button = useRef<HTMLButtonElement>(null);
	const menu = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		if (!open) return;
		const box = button.current?.getBoundingClientRect();
		if (box !== undefined) setAt({ left: Math.max(8, box.right - 200), top: box.bottom + 6 });
		menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
	}, [open]);
	useEffect(() => {
		if (!open) return;
		// the menu's keys are its own while it stands
		const detach = attachHotkeyLayer({ scope: "picker", handlers: {} });
		const away = (event: Event) => {
			if (!(event.target instanceof Node)) return;
			if (button.current?.contains(event.target) || menu.current?.contains(event.target)) return;
			setOpen(false);
		};
		const key = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			setOpen(false);
			button.current?.focus();
		};
		document.addEventListener("pointerdown", away, true);
		window.addEventListener("keydown", key, true);
		return () => {
			detach();
			document.removeEventListener("pointerdown", away, true);
			window.removeEventListener("keydown", key, true);
		};
	}, [open]);
	return (
		<>
			<button
				ref={button}
				type="button"
				aria-label={label}
				title={label}
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
				className={cn(PANE_VERB, open && "bg-surface text-text")}
			>
				<DotsIcon />
			</button>
			{open
				? createPortal(
						<div
							ref={menu}
							role="menu"
							aria-label={label}
							className="fixed z-50 flex w-[200px] animate-menu-in flex-col rounded-md border border-border-raised bg-raised p-unit [&>button:focus-visible]:bg-surface"
							style={at === null ? { visibility: "hidden" } : { left: at.left, top: at.top }}
						>
							{items.map((item) => (
								<MenuItem
									key={item.label}
									label={item.label}
									{...(item.keys === undefined ? {} : { keys: item.keys })}
									disabled={item.disabled === true}
									onClick={() => {
										setOpen(false);
										item.onSelect();
									}}
								/>
							))}
						</div>,
						document.body,
					)
				: null}
		</>
	);
}
