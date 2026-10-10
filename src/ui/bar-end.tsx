import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { attachHotkeyLayer } from "./hotkey-dispatch";
import { hotkeyKey } from "./hotkeys";
import { CogIcon } from "./icons";
import { IconButton } from "./primitives/actions";
import { Menu, MenuItem } from "./primitives/overlays";

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
			<IconButton
				data-bar-end="settings"
				icon={<CogIcon />}
				label="Settings"
				title={`Settings ${hotkeyKey("app.settings")}`}
				onClick={onSettings}
			/>
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
			<IconButton
				ref={button}
				data-bar-end="help"
				icon={
					<span aria-hidden="true" className="type-control">
						?
					</span>
				}
				label="Help"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? id : undefined}
				onClick={() => (open ? setOpen(false) : show())}
				onKeyDown={onKeyDown}
			/>
			{/* out of the bar's own layer, so the sides below it never cover it */}
			{open &&
				at !== null &&
				createPortal(
					<Menu
						ref={menu}
						id={id}
						aria-label="Help"
						onKeyDown={onKeyDown}
						className="fixed z-50"
						style={{ right: at.right, top: at.top }}
					>
						{onUseAgent === undefined ? null : (
							<MenuItem
								// the arrow says it leaves spool; a key face would read as a shortcut
								label="Open in your agent ↗"
								onClick={() => {
									close();
									onUseAgent();
								}}
							/>
						)}
						<MenuItem
							label="Keyboard shortcuts"
							shortcut={hotkeyKey("app.help")}
							onClick={() => {
								close();
								onShortcuts();
							}}
						/>
					</Menu>,
					document.body,
				)}
		</>
	);
}
