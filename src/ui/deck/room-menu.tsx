import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "../cn";
import { CheckIcon } from "../icons";
import { Button } from "../primitives/actions";
import { Kbd } from "../primitives/display";
import { FLOATING, MenuSeparator } from "../primitives/overlays";
import { Switch } from "../primitives/selection";

/**
 * The room's name in the presenter view's head, and the one small menu it opens (spool#315, the team canvas's
 * `app/spool-deck--room-window-menu` and `--presenter-menu`): the talk's one setting, Show pointer, with its key, then
 * the screen the room is on. With two displays both are listed in a fixed order, the room's checked and X on the
 * other, which a press swaps to; else one checked row, `window`. A press on the checked row brings the room's window to
 * the front. A switch flipped or a screen picked leaves it open, so the change is seen; the name again, a press anywhere
 * else, or esc (which the presenter view hears first) puts it away. With the room's window closed, the name opens it
 * again and there is no menu.
 */
export interface RoomMenuProps {
	/** what the name reads after `room · `: the screen, or "open it again" */
	readonly children: ReactNode;
	/** the room's screen as the name says it: a display, or `window` */
	readonly room: string;
	/** both displays in a fixed order, the room's among them; null when the room is a window */
	readonly screens: readonly string[] | null;
	/** the room's window was closed: the name opens it again */
	readonly closed: boolean;
	readonly onReopen: () => void;
	/** the room to the other display, as X does */
	readonly onSwap: () => void;
	/** the room's window to the front */
	readonly onShow: () => void;
	readonly pointer: boolean;
	readonly onPointer: (on: boolean) => void;
	readonly open: boolean;
	readonly onOpen: (open: boolean) => void;
}

export function RoomMenu({
	children,
	room,
	screens,
	closed,
	onReopen,
	onSwap,
	onShow,
	pointer,
	onPointer,
	open,
	onOpen,
}: RoomMenuProps) {
	const box = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!open) return;
		// a press anywhere else puts it away and still goes where it was pressed
		const away = (event: PointerEvent) => {
			if (box.current?.contains(event.target as Node) === true) return;
			onOpen(false);
		};
		// a press on a slide is in the slide's own document: the focus going into it says so
		const into = () => {
			if (document.activeElement instanceof HTMLIFrameElement) onOpen(false);
		};
		window.addEventListener("pointerdown", away, true);
		window.addEventListener("blur", into);
		return () => {
			window.removeEventListener("pointerdown", away, true);
			window.removeEventListener("blur", into);
		};
	}, [open, onOpen]);
	useEffect(() => {
		if (closed) onOpen(false);
	}, [closed, onOpen]);

	const row = (name: string, here: boolean) => (
		<button
			key={name}
			type="button"
			role="menuitemradio"
			aria-checked={here}
			tabIndex={open ? 0 : -1}
			onClick={here ? onShow : onSwap}
			className={cn(
				"flex h-row w-full cursor-pointer items-center gap-2 rounded-sm pr-2 pl-2 text-left type-value transition-colors duration-fast ease-out hover:bg-state-hover-raised active:bg-state-pressed",
				// the one `window` row reads quieter than a display picked out of two
				here && screens !== null ? "text-primary" : "text-secondary hover:text-primary",
			)}
		>
			<span className="flex size-4 shrink-0 items-center justify-center text-primary">
				<CheckIcon
					className={cn(
						"size-3 transition-[opacity,scale] duration-fast ease-out",
						here ? "scale-100 opacity-100" : "scale-75 opacity-0",
					)}
				/>
			</span>
			<span className="min-w-0 flex-1 truncate">{name}</span>
			{screens === null ? null : (
				<Kbd className={cn("transition-opacity duration-fast ease-out", here ? "opacity-0" : "opacity-100")}>X</Kbd>
			)}
		</button>
	);

	return (
		<div ref={box} className="relative">
			<Button
				variant="ghost"
				aria-haspopup="dialog"
				aria-expanded={closed ? undefined : open}
				className="gap-0 text-tertiary type-value aria-expanded:bg-state-selected-strong aria-expanded:text-secondary"
				onClick={closed ? onReopen : () => onOpen(!open)}
				title={closed ? "Open the room's window again" : "The room"}
			>
				room ·&nbsp;
				{children}
			</Button>
			<div
				role="dialog"
				aria-label="The room"
				aria-hidden={!open}
				data-open={open ? "" : undefined}
				className={cn(
					"absolute top-full right-0 z-30 mt-1.5 flex w-[288px] origin-top-right flex-col rounded-md p-1",
					FLOATING,
					"pointer-events-none scale-[0.97] opacity-0 transition-[opacity,scale] duration-quick ease-out",
					"data-open:pointer-events-auto data-open:scale-100 data-open:opacity-100 data-open:duration-fast",
				)}
			>
				{/* the whole row flips it; the switch only shows it */}
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: L flips it from the keyboard */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: the switch inside is the control */}
				<div
					data-room-pointer=""
					className="flex cursor-pointer items-center gap-3 rounded-sm py-2 pr-2 pl-2.5 transition-colors duration-fast ease-out hover:bg-state-hover-raised"
					onClick={() => onPointer(!pointer)}
				>
					<span className="flex min-w-0 flex-1 flex-col">
						<span className="text-primary type-control">Show pointer</span>
						<span className="text-secondary type-caption">The room sees a dot where you point.</span>
					</span>
					<Kbd>L</Kbd>
					<Switch
						checked={pointer}
						onCheckedChange={onPointer}
						aria-label="Show pointer"
						className="pointer-events-none"
					/>
				</div>
				<MenuSeparator />
				{screens === null ? row("window", true) : screens.map((name) => row(name, name === room))}
			</div>
		</div>
	);
}
