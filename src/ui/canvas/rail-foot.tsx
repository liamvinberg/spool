import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../cn";
import { attachHotkeyLayer } from "../hotkey-dispatch";
import { hotkeyKey } from "../hotkeys";
import { CogIcon } from "../icons";
import { MenuItem } from "./context-menu";

/** What stands at the foot of the right rail: doors out of the canvas rather than panes (#282). */
export function RailFoot({
	onSettings,
	onUseAgent,
}: {
	onSettings?: (() => void) | undefined;
	onUseAgent?: (() => void) | undefined;
}) {
	return (
		<>
			{onUseAgent && <RailHelp onUseAgent={onUseAgent} />}
			<button
				type="button"
				data-rail-foot="settings"
				aria-label="Settings"
				title={`Settings ${hotkeyKey("app.settings")}`}
				onClick={onSettings}
				className="relative flex h-8 w-8 items-center justify-center rounded-sm text-muted/70 transition-[background-color,color,transform] duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-text active:scale-90 motion-reduce:transition-none"
			>
				<CogIcon />
			</button>
		</>
	);
}

function RailHelp({ onUseAgent }: { onUseAgent: () => void }) {
	const [open, setOpen] = useState(false);
	const id = useId();
	const root = useRef<HTMLDivElement>(null);
	const button = useRef<HTMLButtonElement>(null);
	const menu = useRef<HTMLDivElement>(null);
	const focusItem = () => menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
	const close = () => {
		button.current?.focus();
		setOpen(false);
	};
	const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
		if (event.key === "ArrowDown" || event.key === "ArrowUp" || (open && ["Home", "End"].includes(event.key))) {
			event.preventDefault();
			event.stopPropagation();
			if (open) focusItem();
			else setOpen(true);
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
			if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
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
		<div ref={root} className="relative">
			<button
				ref={button}
				type="button"
				data-rail-foot="help"
				aria-label="Help"
				title="Help"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? id : undefined}
				onClick={() => setOpen(!open)}
				onKeyDown={onKeyDown}
				className={cn(
					"flex h-8 w-8 items-center justify-center rounded-sm text-[15px] transition-[background-color,color,transform] duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-90 motion-reduce:transition-none",
					open ? "bg-control text-text" : "text-muted/70 hover:text-text",
				)}
			>
				<span aria-hidden="true">?</span>
			</button>
			{open && (
				<div
					ref={menu}
					id={id}
					role="menu"
					aria-label="Help"
					onKeyDown={onKeyDown}
					className="absolute right-full bottom-0 z-30 mr-2 flex w-[220px] flex-col rounded-md border border-border-raised bg-raised p-unit [&>button:focus-visible]:bg-surface"
				>
					<MenuItem
						label="Open in your agent"
						keys="↗"
						onClick={() => {
							close();
							onUseAgent();
						}}
					/>
				</div>
			)}
		</div>
	);
}
