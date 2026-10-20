import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../cn";
import { FolderIcon } from "../icons";
import { SearchField } from "../primitives/inputs";
import { Popover } from "../primitives/overlays";
import { pagePathLabel } from "./pages";

/**
 * Where to move something, found by typing.
 *
 * A drag is fine to the row below and useless to a page three levels down or off
 * the top of the list, so the same move has a door you can type at. It is not the
 * frame finder: that palette ranks dozens of names sharing one prefix and flies
 * the camera to what it finds, and this answers one question with one page. So it
 * borrows the row menu's panel rather than the finder's, sits where the menu sat,
 * and does the one thing a nested submenu could never do, which is filter.
 *
 * Every key it needs is typed into its own field, so dispatch never sees them:
 * a key born in an input belongs to the text, which is the register's own rule.
 */

const WIDTH = 232;
const ROW = 28;
const FIELD = 32;
const PAD = 8;
/** how many rows are drawn before the list starts scrolling */
const VISIBLE = 7;
/** how close to the window's own edge the panel may sit before it flips */
const SCREEN_MARGIN = 8;

export function PagePicker({
	at,
	pages,
	onPick,
	onClose,
}: {
	at: { readonly x: number; readonly y: number };
	/** the pages this move may land in, in rail order */
	pages: readonly string[];
	onPick: (page: string) => void;
	onClose: () => void;
}) {
	const [query, setQuery] = useState("");
	const [wanted, setWanted] = useState(0);
	const field = useRef<HTMLInputElement | null>(null);
	const panel = useRef<HTMLDivElement | null>(null);
	const list = useRef<HTMLDivElement | null>(null);

	const hits = useMemo(() => {
		const typed = query.trim().toLowerCase();
		// a path, so typing a parent's name finds everything inside it
		return typed === "" ? pages : pages.filter((page) => pagePathLabel(page).toLowerCase().includes(typed));
	}, [query, pages]);
	const cursor = Math.min(wanted, Math.max(hits.length - 1, 0));
	const pick = hits[cursor];

	useEffect(() => {
		field.current?.focus();
	}, []);

	// the pick has to stay on screen: a deep project is more pages than rows
	useEffect(() => {
		list.current?.querySelector<HTMLElement>(`[data-at="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
	}, [cursor]);

	useEffect(() => {
		const away = (event: PointerEvent) => {
			const inside = event.target instanceof Node && panel.current?.contains(event.target) === true;
			if (!inside) onClose();
		};
		window.addEventListener("pointerdown", away);
		window.addEventListener("resize", onClose);
		return () => {
			window.removeEventListener("pointerdown", away);
			window.removeEventListener("resize", onClose);
		};
	}, [onClose]);

	const rows = Math.min(Math.max(hits.length, 1), VISIBLE);
	const height = FIELD + rows * ROW + PAD;
	const flipX = at.x + WIDTH > window.innerWidth - SCREEN_MARGIN;
	const flipY = at.y + height > window.innerHeight - SCREEN_MARGIN;

	return (
		<Popover
			ref={panel}
			aria-label="Move to page"
			pad="none"
			className="fixed z-50 overflow-hidden"
			style={{
				left: flipX ? at.x - WIDTH : at.x,
				top: flipY ? at.y - height : at.y,
				width: WIDTH,
				transformOrigin: `${flipX ? "right" : "left"} ${flipY ? "bottom" : "top"}`,
			}}
			onContextMenu={(event) => event.preventDefault()}
		>
			<div className="shrink-0 px-unit pt-unit">
				<SearchField
					size="md"
					hotkey=""
					mono
					label="Move to page"
					placeholder="type part of a page"
					value={query}
					onValueChange={(next) => {
						setQuery(next);
						setWanted(0);
					}}
					inputProps={{
						ref: field,
						onKeyDown: (event) => {
							if (event.key === "ArrowDown") {
								event.preventDefault();
								setWanted(Math.min(cursor + 1, Math.max(hits.length - 1, 0)));
							} else if (event.key === "ArrowUp") {
								event.preventDefault();
								setWanted(Math.max(cursor - 1, 0));
							} else if (event.key === "Enter") {
								event.preventDefault();
								if (pick !== undefined) onPick(pick);
							} else if (event.key === "Escape") {
								event.preventDefault();
								onClose();
							}
						},
					}}
				/>
			</div>
			<div
				ref={list}
				className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-unit"
				style={{ height: rows * ROW + PAD }}
			>
				{hits.length === 0 ? (
					<div className="flex items-center px-1.5 text-secondary type-value" style={{ height: ROW }}>
						no page answers to that
					</div>
				) : (
					hits.map((page, index) => (
						<button
							key={page}
							type="button"
							data-at={index}
							aria-label={`Move to ${pagePathLabel(page)}`}
							// move rather than enter: a list that scrolls under a still pointer must not re-pick
							onMouseMove={() => setWanted(index)}
							onClick={() => onPick(page)}
							className={cn(
								"flex w-full items-center gap-2 rounded-xs px-1.5 text-left",
								index === cursor ? "bg-surface-panel text-primary" : "text-primary/80",
							)}
							style={{ height: ROW }}
						>
							<FolderIcon className="h-3.5 w-3.5 shrink-0 text-secondary" />
							<span className="min-w-0 flex-1 truncate type-value">{pagePathLabel(page)}</span>
						</button>
					))
				)}
			</div>
		</Popover>
	);
}
