import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MenuItem } from "./canvas/context-menu";
import { cn } from "./cn";
import { attachHotkeyLayer } from "./hotkey-dispatch";
import { hotkeyKey } from "./hotkeys";
import { CogIcon } from "./icons";

const BUTTON =
	"flex h-7 w-7 shrink-0 items-center justify-center rounded-sm transition-[background-color,color,transform] duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-surface active:scale-90 motion-reduce:transition-none";

/**
 * What stands at the window bar's right end, on Home and on every canvas alike: help and
 * the settings cog, doors out of whatever is open rather than parts of it (#282, #359).
 */
export function BarEnd({
	onSettings,
	onShortcuts,
	onUseAgent,
}: {
	onSettings?: (() => void) | undefined;
	onShortcuts: () => void;
	/** on a canvas with a project folder: hand the project to an agent of one's own */
	onUseAgent?: (() => void) | undefined;
}) {
	return (
		<>
			<BarHelp onShortcuts={onShortcuts} onUseAgent={onUseAgent} />
			<button
				type="button"
				data-bar-end="settings"
				aria-label="Settings"
				title={`Settings ${hotkeyKey("app.settings")}`}
				onClick={onSettings}
				className={cn(BUTTON, "text-muted/70 hover:text-text")}
			>
				<CogIcon />
			</button>
		</>
	);
}

function BarHelp({ onShortcuts, onUseAgent }: { onShortcuts: () => void; onUseAgent?: (() => void) | undefined }) {
	const [open, setOpen] = useState(false);
	const [at, setAt] = useState<{ right: number; top: number } | null>(null);
	const id = useId();
	const button = useRef<HTMLButtonElement>(null);
	const menu = useRef<HTMLDivElement>(null);
	const focusItem = () => menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
	const close = () => {
		button.current?.focus();
		setOpen(false);
	};
	const show = () => {
		const box = button.current?.getBoundingClientRect();
		if (box !== undefined) setAt({ right: window.innerWidth - box.right, top: box.bottom + 6 });
		setOpen(true);
	};
	const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
		if (event.key === "ArrowDown" || event.key === "ArrowUp" || (open && ["Home", "End"].includes(event.key))) {
			event.preventDefault();
			event.stopPropagation();
			if (open) focusItem();
			else show();
		} else if (open && event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			close();
		} else if (open && event.key === "Tab") close();
	};

	useLayoutEffect(() => {
		if (open) menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
	}, [open]);
	useEffect(() => {
		if (!open) return;
		const detach = attachHotkeyLayer({ scope: "picker", handlers: {} });
		const away = (event: Event) => {
			if (!(event.target instanceof Node)) return;
			if (button.current?.contains(event.target) || menu.current?.contains(event.target)) return;
			setOpen(false);
		};
		document.addEventListener("pointerdown", away, true);
		document.addEventListener("focusin", away);
		return () => {
			detach();
			document.removeEventListener("pointerdown", away, true);
			document.removeEventListener("focusin", away);
		};
	}, [open]);

	return (
		<>
			<button
				ref={button}
				type="button"
				data-bar-end="help"
				aria-label="Help"
				title="Help"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? id : undefined}
				onClick={() => (open ? setOpen(false) : show())}
				onKeyDown={onKeyDown}
				className={cn(BUTTON, "text-[15px]", open ? "bg-surface text-text" : "text-muted/70 hover:text-text")}
			>
				<span aria-hidden="true">?</span>
			</button>
			{/* out of the bar's own layer, so the sides below it never cover it */}
			{open &&
				at !== null &&
				createPortal(
					<div
						ref={menu}
						id={id}
						role="menu"
						aria-label="Help"
						onKeyDown={onKeyDown}
						className="fixed z-50 flex w-[220px] animate-menu-in flex-col rounded-md border border-border-raised bg-raised p-unit [&>button:focus-visible]:bg-surface"
						style={{ right: at.right, top: at.top }}
					>
						{onUseAgent === undefined ? null : (
							<MenuItem
								label="Open in your agent"
								keys="↗"
								onClick={() => {
									close();
									onUseAgent();
								}}
							/>
						)}
						<MenuItem
							label="Keyboard shortcuts"
							keys={hotkeyKey("app.help")}
							onClick={() => {
								close();
								onShortcuts();
							}}
						/>
					</div>,
					document.body,
				)}
		</>
	);
}
