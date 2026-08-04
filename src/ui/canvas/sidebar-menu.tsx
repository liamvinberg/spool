/**
 * The rail's right-click menu (#229), in the vocabulary `context-menu.tsx`
 * already speaks: same row height, same key faces, same word for the same
 * verb. What changes per kind is the list, because a page and a frame are not
 * the same object — and neither list offers New frame, anywhere. Agents author
 * frames and hands arrange them.
 *
 * It positions itself at the pointer and flips near an edge, unlike the canvas
 * menu, which is placed by a canvas that already computed where it fits.
 */

import { useEffect } from "react";
import { hotkeyKey } from "../hotkeys";
import { MenuItem, MenuRule } from "./context-menu";
import { pageLabel } from "./pages";

const MENU_WIDTH = 200;
const ITEM_HEIGHT = 30;
const RULE_HEIGHT = 9;
const MENU_PAD = 8;
/** how close to the window's own edge the menu may sit before it flips */
const SCREEN_MARGIN = 8;

/** What a right-click landed on: one row, or the list's own empty space. */
export type MenuTarget =
	| { readonly kind: "page"; readonly page: string }
	| { readonly kind: "frame"; readonly name: string }
	| { readonly kind: "empty" };

export interface RailMenuState {
	readonly x: number;
	readonly y: number;
	readonly target: MenuTarget;
}

export interface RailMenuActions {
	readonly newPage: () => void;
	readonly newPageWith: () => void;
	readonly rename: () => void;
	readonly duplicate: () => void;
	readonly moveTo: () => void;
	readonly copy: () => void;
	readonly paste: () => void;
	readonly reveal: () => void;
	readonly openEditor: () => void;
	readonly trash: () => void;
	readonly collapseAll: () => void;
}

type Entry =
	| { readonly rule: true }
	| {
			readonly rule?: false;
			readonly run: keyof RailMenuActions;
			readonly label: string;
			readonly keys?: string;
			readonly off?: boolean;
	  };

/**
 * The list one target earns.
 *
 * Every page row is a folder somebody made, so every page verb is live on it:
 * the root page had the one list with dead items in it, and it lost its row
 * with #232. What is left off a list is off it for the kind rather than for
 * the row — a menu whose shape changes under the pointer is a menu you cannot
 * learn.
 */
export function menuEntries(
	target: MenuTarget,
	at: {
		pasteable: boolean;
		selection: number;
		/** whether there is any page this row could move to that it is not in already */
		movable: boolean;
	},
): readonly Entry[] {
	if (target.kind === "empty") {
		return [
			{ run: "newPage", label: "New page" },
			{ run: "paste", label: "Paste", keys: hotkeyKey("sidebar.paste"), off: !at.pasteable },
			{ rule: true },
			{ run: "collapseAll", label: "Collapse all" },
		];
	}
	if (target.kind === "page") {
		return [
			{ run: "newPage", label: "New page" },
			{ rule: true },
			{ run: "rename", label: "Rename", keys: hotkeyKey("sidebar.rename") },
			{ run: "duplicate", label: "Duplicate", keys: hotkeyKey("sidebar.duplicate") },
			// moving a page into a page is the same verb a drag runs, so it is the same
			// item on both lists
			{ run: "moveTo", label: "Move to page…", off: !at.movable },
			{ run: "paste", label: "Paste", keys: hotkeyKey("sidebar.paste"), off: !at.pasteable },
			{ rule: true },
			{ run: "trash", label: "Move to Trash", keys: hotkeyKey("sidebar.trash") },
		];
	}
	const many = at.selection > 1;
	return [
		{ run: "rename", label: "Rename", keys: hotkeyKey("sidebar.rename"), off: many },
		{ run: "duplicate", label: "Duplicate", keys: hotkeyKey("sidebar.duplicate") },
		{ run: "copy", label: "Copy", keys: hotkeyKey("sidebar.copy") },
		{ run: "moveTo", label: "Move to page…", off: !at.movable },
		// the page is named before it exists and the frames follow it in, which is
		// why this is a new page rather than a move into one
		{ run: "newPageWith", label: "New page with selection", off: at.selection === 0 },
		{ rule: true },
		{ run: "reveal", label: "Reveal on canvas", off: many },
		{ run: "openEditor", label: "Open in editor", off: many },
		{ rule: true },
		{ run: "trash", label: "Move to Trash", keys: hotkeyKey("sidebar.trash") },
	];
}

function heightOf(entries: readonly Entry[]): number {
	return entries.reduce((total, entry) => total + (entry.rule === true ? RULE_HEIGHT : ITEM_HEIGHT), MENU_PAD);
}

export function RailMenu({
	menu,
	pasteable,
	selection,
	movable,
	actions,
	onClose,
}: {
	menu: RailMenuState;
	pasteable: boolean;
	selection: number;
	movable: boolean;
	actions: RailMenuActions;
	onClose: () => void;
}) {
	// a resize moves the row this was opened on out from under it. Scrolling does
	// too, and the list closes the menu itself on its own scroll — a window
	// listener here would never see a scroll inside that box anyway
	useEffect(() => {
		window.addEventListener("resize", onClose);
		return () => window.removeEventListener("resize", onClose);
	}, [onClose]);

	const entries = menuEntries(menu.target, { pasteable, selection, movable });
	const height = heightOf(entries);
	const flipX = menu.x + MENU_WIDTH > window.innerWidth - SCREEN_MARGIN;
	const flipY = menu.y + height > window.innerHeight - SCREEN_MARGIN;
	const named =
		menu.target.kind === "page"
			? pageLabel(menu.target.page)
			: menu.target.kind === "frame"
				? menu.target.name
				: "the pages";

	return (
		<div
			role="menu"
			aria-label={`${named} menu`}
			className="fixed z-50 flex w-[200px] animate-menu-in flex-col rounded-md border border-border-raised bg-raised p-unit"
			style={{
				left: flipX ? menu.x - MENU_WIDTH : menu.x,
				top: flipY ? menu.y - height : menu.y,
				transformOrigin: `${flipX ? "right" : "left"} ${flipY ? "bottom" : "top"}`,
			}}
			onPointerDown={(event) => event.stopPropagation()}
			onContextMenu={(event) => event.preventDefault()}
		>
			{entries.map((entry, index) =>
				entry.rule === true ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: a rule has no identity of its own
					<MenuRule key={`rule-${index}`} />
				) : (
					<MenuItem
						key={entry.label}
						label={entry.label}
						{...(entry.keys === undefined ? {} : { keys: entry.keys })}
						disabled={entry.off === true}
						onClick={() => {
							onClose();
							actions[entry.run]();
						}}
					/>
				),
			)}
		</div>
	);
}
