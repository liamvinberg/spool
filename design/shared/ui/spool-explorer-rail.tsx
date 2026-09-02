import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ExplorerModel } from "shared/lib/explorer-model";
import {
	type DropSlot,
	INDENT,
	ROOT_ID,
	type Row,
	TOP_ID,
	betweenSlots,
	canLandIn,
	contentX,
	frameCount,
	guideX,
	isPage,
	listHeight,
	nodeAt,
	pageCount,
	slotAllowed,
} from "shared/lib/explorer-tree";
import { cn } from "shared/lib/utils";
import { ChevronIcon, FolderIcon, PanelCaret, PlusIcon } from "shared/ui/spool-icons";

/**
 * The pages rail as a file explorer.
 *
 * Same rail as the one that shipped — same row heights, same icons, same
 * thread spine, same footer — with everything a folder tree can do wired
 * underneath: drag to reorder and to nest, rename in place, duplicate, copy and
 * paste, delete with an undo toast, and keyboard travel through the whole tree.
 *
 * Geometry is arithmetic rather than measurement: rows are absolutely placed at
 * a running offset the tree already knows, so the insertion line lands on an
 * exact pixel and every row springs to its new home when the tree changes.
 */

export const RAIL_W = 248;
/** the list's own py-2, carried in the row offsets */
const PAD = 8;
/** how far a press travels before it becomes a drag */
const SLOP = 5;
const SPRING_LOAD_MS = 450;
/** the band at each end of the list that pulls the scroll along */
const EDGE = 36;
/** how far sideways one nesting step is, while a drop is ambiguous */
const DEPTH_BAND = 20;

const ROW_SPRING = { type: "spring", duration: 0.34, bounce: 0.1 } as const;
const LINE_SPRING = { type: "spring", duration: 0.24, bounce: 0.14 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

type Landing =
	| { readonly kind: "into"; readonly parentId: string }
	| { readonly kind: "between"; readonly slot: DropSlot; readonly y: number };

interface DragLive {
	pointerId: number;
	ids: readonly string[];
	startX: number;
	startY: number;
	x: number;
	y: number;
	grabX: number;
	grabY: number;
	depth: number;
	active: boolean;
	springId: string | null;
	springAt: number;
}

interface DragKit {
	readonly ids: readonly string[];
	readonly label: string;
	readonly page: boolean;
	readonly count: number;
}

interface MenuState {
	readonly x: number;
	readonly y: number;
	readonly target: { readonly kind: "row"; readonly id: string } | { readonly kind: "empty" };
}

export function ExplorerRail({ model }: { model: ExplorerModel }) {
	const listRef = useRef<HTMLDivElement | null>(null);
	const overlayRef = useRef<HTMLDivElement | null>(null);
	const live = useRef<DragLive | null>(null);
	const frame = useRef<number | null>(null);
	const landingRef = useRef<Landing | null>(null);
	const modelRef = useRef(model);
	const typed = useRef({ buffer: "", at: 0 });

	const [kit, setKit] = useState<DragKit | null>(null);
	const [landing, setLanding] = useState<Landing | null>(null);
	const [springId, setSpringId] = useState<string | null>(null);
	const [menu, setMenu] = useState<MenuState | null>(null);

	useEffect(() => {
		modelRef.current = model;
	});

	const rows = model.rows;
	const dragging = kit === null ? null : new Set(kit.ids);

	/* ── where a pointer lands ─────────────────────────────────────── */

	const rowIndexAt = useCallback((contentY: number, all: readonly Row[]) => {
		for (let i = 0; i < all.length; i += 1) {
			const row = all[i];
			if (row !== undefined && contentY >= row.top && contentY < row.top + row.height) return i;
		}
		return -1;
	}, []);

	const resolve = useCallback(
		(clientX: number, clientY: number): Landing | null => {
			const list = listRef.current;
			const current = live.current;
			if (list === null || current === null) return null;
			const box = list.getBoundingClientRect();
			const state = modelRef.current;
			const all = state.rows;
			const contentY = clientY - box.top + list.scrollTop - PAD;
			const index = rowIndexAt(contentY, all);
			const row = index === -1 ? undefined : all[index];

			if (row !== undefined && isPage(row.node)) {
				const within = (contentY - row.top) / row.height;
				if (within > 0.26 && within < 0.74) {
					return canLandIn(state.tree, current.ids, row.node.id)
						? { kind: "into", parentId: row.node.id }
						: null;
				}
			}

			const gap =
				row === undefined
					? contentY < 0
						? 0
						: all.length
					: contentY - row.top < row.height / 2
						? index
						: index + 1;
			const slots = betweenSlots(all, state.expanded, gap).filter((slot) =>
				slotAllowed(state.tree, current.ids, slot),
			);
			if (slots.length === 0) return null;
			// the pointer's sideways travel picks the depth: no travel keeps the
			// depth the row already had, right nests, left steps back out
			const wanted = current.depth + Math.round((current.x - current.startX) / DEPTH_BAND);
			let pick = slots[0];
			if (pick === undefined) return null;
			for (const slot of slots) {
				if (Math.abs(slot.depth - wanted) <= Math.abs(pick.depth - wanted)) pick = slot;
			}
			const next = all[gap];
			return { kind: "between", slot: pick, y: next?.top ?? listHeight(all) };
		},
		[rowIndexAt],
	);

	/* ── the drag loop ─────────────────────────────────────────────── */

	const tick = useCallback(() => {
		const current = live.current;
		const list = listRef.current;
		if (current === null || list === null) return;

		if (current.active) {
			const overlay = overlayRef.current;
			if (overlay !== null) {
				// the lifted row hangs just left of the pointer rather than sitting on the
				// row's own left edge: the insertion line's notch has to stay readable
				overlay.style.transform = `translate3d(${current.x - 14}px, ${current.y - current.grabY}px, 0)`;
			}

			const box = list.getBoundingClientRect();
			const above = current.y - box.top;
			const below = box.bottom - current.y;
			if (above < EDGE) list.scrollTop -= Math.min(14, (EDGE - above) / 2.2);
			else if (below < EDGE) list.scrollTop += Math.min(14, (EDGE - below) / 2.2);

			const next = resolve(current.x, current.y);
			if (!sameLanding(next, landingRef.current)) {
				landingRef.current = next;
				setLanding(next);
			}

			// spring-loaded folders: rest on a shut page and it opens itself
			const state = modelRef.current;
			const contentY = current.y - box.top + list.scrollTop - PAD;
			const index = rowIndexAt(contentY, state.rows);
			const over = index === -1 ? undefined : state.rows[index];
			const candidate =
				over !== undefined &&
				isPage(over.node) &&
				!state.expanded.has(over.node.id) &&
				canLandIn(state.tree, current.ids, over.node.id)
					? over.node.id
					: null;
			if (candidate !== current.springId) {
				current.springId = candidate;
				current.springAt = performance.now();
				setSpringId(candidate);
			} else if (candidate !== null && performance.now() - current.springAt > SPRING_LOAD_MS) {
				state.setOpen(candidate, true);
				current.springId = null;
				setSpringId(null);
			}
		}

		frame.current = requestAnimationFrame(tick);
	}, [resolve, rowIndexAt]);

	const stopDrag = useCallback(
		(drop: boolean) => {
			const current = live.current;
			if (frame.current !== null) cancelAnimationFrame(frame.current);
			frame.current = null;
			live.current = null;
			const target = landingRef.current;
			landingRef.current = null;
			setKit(null);
			setLanding(null);
			setSpringId(null);
			if (!drop || current === null || !current.active || target === null) return;
			const state = modelRef.current;
			if (target.kind === "into") {
				const page = nodeAt(state.tree, target.parentId);
				const at = page !== null && isPage(page) ? page.children.length : 0;
				state.move(current.ids, target.parentId, at);
				return;
			}
			state.move(current.ids, target.slot.parentId, target.slot.index);
		},
		[],
	);

	useEffect(() => {
		const onMove = (event: PointerEvent) => {
			const current = live.current;
			if (current === null || event.pointerId !== current.pointerId) return;
			current.x = event.clientX;
			current.y = event.clientY;
			if (
				!current.active &&
				Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > SLOP
			) {
				current.active = true;
				setKit(kitFor(modelRef.current, current.ids));
			}
			if (current.active) event.preventDefault();
		};
		const onUp = (event: PointerEvent) => {
			const current = live.current;
			if (current === null || event.pointerId !== current.pointerId) return;
			stopDrag(true);
		};
		const onCancel = () => stopDrag(false);
		window.addEventListener("pointermove", onMove, { passive: false });
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onCancel);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onCancel);
			if (frame.current !== null) cancelAnimationFrame(frame.current);
		};
	}, [stopDrag]);

	/* ── pressing a row ────────────────────────────────────────────── */

	function pressRow(event: React.PointerEvent<HTMLElement>, row: Row) {
		// the list behind the rows clears the selection on a press; a row owns its own
		event.stopPropagation();
		if (event.button !== 0) return;
		setMenu(null);
		const id = row.node.id;
		const shift = event.shiftKey;
		const toggle = event.metaKey || event.ctrlKey;
		if (shift || toggle) {
			model.select(id, { shift, toggle });
			return;
		}
		const already = model.selection.includes(id);
		if (!already) model.select(id, { shift: false, toggle: false });
		if (id === ROOT_ID) return;

		const ids = isPage(row.node)
			? [id]
			: already && model.selection.length > 1
				? model.selection.filter((each) => {
						const node = nodeAt(model.tree, each);
						return node !== null && !isPage(node);
					})
				: [id];

		const box = event.currentTarget.getBoundingClientRect();
		live.current = {
			pointerId: event.pointerId,
			ids,
			startX: event.clientX,
			startY: event.clientY,
			x: event.clientX,
			y: event.clientY,
			grabX: event.clientX - box.left,
			grabY: event.clientY - box.top,
			depth: row.depth,
			active: false,
			springId: null,
			springAt: 0,
		};
		if (frame.current === null) frame.current = requestAnimationFrame(tick);
	}

	function releaseRow(row: Row) {
		const current = live.current;
		if (current !== null && current.active) return;
		if (isPage(row.node)) model.activate(row.node.id);
	}

	/* ── keys ──────────────────────────────────────────────────────── */

	const keys = useCallback(
		(event: KeyboardEvent) => {
			const state = modelRef.current;
			if (event.target instanceof HTMLInputElement) return;
			const accel = event.metaKey || event.ctrlKey;
			const order = state.rows.map((row) => row.node.id);
			const current = state.selection.at(-1) ?? null;
			const at = current === null ? -1 : order.indexOf(current);

			const land = (index: number) => {
				const id = order[Math.max(0, Math.min(order.length - 1, index))];
				if (id === undefined) return;
				state.select(id);
				scrollTo(id);
			};

			const scrollTo = (id: string) => {
				const list = listRef.current;
				const row = state.rows.find((each) => each.node.id === id);
				if (list === null || row === undefined) return;
				const top = row.top + PAD;
				if (top < list.scrollTop) list.scrollTop = top - 4;
				else if (top + row.height > list.scrollTop + list.clientHeight) {
					list.scrollTop = top + row.height - list.clientHeight + 4;
				}
			};

			if (event.key === "Escape") {
				if (menu !== null) setMenu(null);
				else state.clearSelection();
				return;
			}
			if (event.key === "ArrowDown") {
				event.preventDefault();
				land(at === -1 ? 0 : at + 1);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				land(at === -1 ? order.length - 1 : at - 1);
				return;
			}
			if (event.key === "ArrowRight") {
				event.preventDefault();
				if (current === null) return;
				const node = nodeAt(state.tree, current);
				if (node === null || !isPage(node)) return;
				if (!state.expanded.has(current)) state.setOpen(current, true, event.altKey);
				else if (node.children.length > 0) land(at + 1);
				return;
			}
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				if (current === null) return;
				const node = nodeAt(state.tree, current);
				if (node !== null && isPage(node) && state.expanded.has(current)) {
					state.setOpen(current, false, event.altKey);
					return;
				}
				const row = state.rows.find((each) => each.node.id === current);
				if (row !== undefined && row.parentId !== TOP_ID) {
					state.select(row.parentId);
					scrollTo(row.parentId);
				}
				return;
			}
			if (event.key === "Enter" || event.key === "F2") {
				event.preventDefault();
				if (current !== null && state.selection.length === 1) state.beginRename(current);
				return;
			}
			if (event.key === "Backspace" || event.key === "Delete") {
				event.preventDefault();
				state.remove(state.selection);
				return;
			}
			if (accel && (event.key === "d" || event.key === "D")) {
				event.preventDefault();
				state.duplicate(state.selection);
				return;
			}
			if (accel && (event.key === "c" || event.key === "C")) {
				event.preventDefault();
				state.copy();
				return;
			}
			if (accel && (event.key === "v" || event.key === "V")) {
				event.preventDefault();
				state.paste();
				return;
			}
			if (accel && (event.key === "z" || event.key === "Z")) {
				event.preventDefault();
				state.undo();
				return;
			}
			if (accel || event.altKey || event.key.length !== 1) return;

			// type-ahead: the letters you press walk you to the next matching name
			event.preventDefault();
			const now = Date.now();
			const fresh = now - typed.current.at > 700;
			typed.current.buffer = fresh ? event.key.toLowerCase() : typed.current.buffer + event.key.toLowerCase();
			typed.current.at = now;
			const query = typed.current.buffer;
			const from = query.length === 1 ? at + 1 : Math.max(at, 0);
			for (let step = 0; step < order.length; step += 1) {
				const index = (from + step + order.length) % order.length;
				const row = state.rows[index];
				if (row !== undefined && row.node.name.startsWith(query)) {
					land(index);
					return;
				}
			}
		},
		[menu],
	);

	const keysRef = useRef(keys);
	keysRef.current = keys;
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => keysRef.current(event);
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	useEffect(() => {
		if (menu === null) return;
		const close = () => setMenu(null);
		window.addEventListener("pointerdown", close);
		window.addEventListener("resize", close);
		return () => {
			window.removeEventListener("pointerdown", close);
			window.removeEventListener("resize", close);
		};
	}, [menu]);

	/* ── the menu ──────────────────────────────────────────────────── */

	function openMenu(event: React.MouseEvent, target: MenuState["target"]) {
		event.preventDefault();
		event.stopPropagation();
		if (target.kind === "row" && !model.selection.includes(target.id)) {
			model.select(target.id, { shift: false, toggle: false });
		}
		setMenu({ x: event.clientX, y: event.clientY, target });
	}

	const entries = menu === null ? [] : menuEntries(model, menu.target, () => setMenu(null));

	/* ── drawing ───────────────────────────────────────────────────── */

	const total = listHeight(rows);
	const lineDepth = landing?.kind === "between" ? landing.slot.depth : 0;
	const lineX = guideX(lineDepth);

	return (
		<aside
			aria-label="Pages"
			className="relative flex h-full shrink-0 flex-col border-border border-r bg-bg"
			style={{ width: RAIL_W }}
		>
			<style>{`.explorer-scroll::-webkit-scrollbar{width:8px}.explorer-scroll::-webkit-scrollbar-thumb{background:var(--color-border-raised);border-radius:9px;border:2px solid transparent;background-clip:content-box}.explorer-scroll::-webkit-scrollbar-track{background:transparent}`}</style>

			<div className="flex h-11 shrink-0 items-center justify-between border-border border-b pr-2 pl-3.5">
				<div className="flex items-baseline gap-2">
					<h1 className="font-semibold text-base leading-base">Pages</h1>
					<span className="font-mono text-muted text-xs leading-xs">{pageCount(model.tree)}</span>
				</div>
				<div className="flex items-center">
					<button
						type="button"
						aria-label="New page"
						onClick={() => model.newPage(TOP_ID)}
						className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60 transition-[color,transform] duration-[140ms] hover:bg-surface hover:text-text active:scale-90"
					>
						<PlusIcon className="h-2.5 w-2.5" />
					</button>
					<span className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60">
						<PanelCaret dir="left" className="h-3.5 w-2.5" />
					</span>
				</div>
			</div>

			<div
				ref={listRef}
				className="explorer-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain"
				onPointerDown={() => {
					setMenu(null);
					model.clearSelection();
				}}
				onContextMenu={(event) => openMenu(event, { kind: "empty" })}
				onScroll={() => setMenu(null)}
			>
				<div className="relative" style={{ height: total + PAD * 2, minHeight: "100%" }}>
					{rows.map((row) => (
						<TreeRow
							key={row.node.id}
							row={row}
							model={model}
							dimmed={dragging?.has(row.node.id) ?? false}
							into={landing?.kind === "into" && landing.parentId === row.node.id}
							holds={landing?.kind === "between" && landing.slot.parentId === row.node.id}
							springing={springId === row.node.id}
							onPress={pressRow}
							onRelease={releaseRow}
							onMenu={openMenu}
						/>
					))}

					<AnimatePresence>
						{landing?.kind === "between" ? (
							<motion.div
								key="line"
								className="pointer-events-none absolute z-20"
								style={{ left: 0, top: 0, height: 2 }}
								initial={{ opacity: 0, x: lineX, y: landing.y + PAD - 1, width: RAIL_W - lineX - 10 }}
								animate={{ opacity: 1, x: lineX, y: landing.y + PAD - 1, width: RAIL_W - lineX - 10 }}
								exit={{ opacity: 0, transition: { duration: 0.08 } }}
								transition={{
									x: LINE_SPRING,
									y: LINE_SPRING,
									width: LINE_SPRING,
									opacity: { duration: 0.1, ease: EASE_OUT },
								}}
							>
								<span className="block h-full w-full rounded-full bg-thread" />
								<span className="-left-px -top-[1.5px] absolute h-[5px] w-[5px] rounded-full bg-thread" />
							</motion.div>
						) : null}
					</AnimatePresence>
				</div>
			</div>

			<AnimatePresence>
				{model.toast === null ? null : (
					<motion.div
						key={model.toast.id}
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 6, transition: { duration: 0.12, ease: EASE_OUT } }}
						transition={{ type: "spring", duration: 0.32, bounce: 0.16 }}
						className="mx-2 mb-2 flex shrink-0 items-center gap-2 rounded-sm border border-border-raised bg-raised py-2 pr-2.5 pl-2.5"
					>
						<span className="min-w-0 flex-1 truncate font-mono text-2xs text-text leading-3">
							{model.toast.text}
						</span>
						<button
							type="button"
							onClick={() => model.undo()}
							className="shrink-0 cursor-pointer font-mono text-2xs text-thread leading-3 transition-opacity hover:opacity-70"
						>
							undo
						</button>
					</motion.div>
				)}
			</AnimatePresence>

			<div className="flex h-9 shrink-0 items-center justify-between border-border border-t px-3.5 font-mono text-2xs text-muted leading-3">
				<span>folder switches page</span>
				{model.clipboard.length > 0 ? (
					<span className="text-muted/50">
						{model.clipboard.length} copied
					</span>
				) : null}
			</div>

			{kit === null ? null : (
				<div ref={overlayRef} className="pointer-events-none fixed top-0 left-0 z-50 will-change-transform">
					<motion.div
						initial={{ scale: 1, opacity: 0.7 }}
						animate={{ scale: 1.02, opacity: 1 }}
						transition={{ duration: 0.14, ease: EASE_OUT }}
						className="flex h-8 w-fit max-w-[190px] items-center gap-2 rounded-sm border border-border-raised bg-raised pr-2.5 pl-2.5"
					>
						{kit.page ? (
							<FolderIcon className="h-3.5 w-3.5 shrink-0 text-thread" />
						) : (
							<FrameIcon className="h-3.5 w-3.5 shrink-0 text-thread" />
						)}
						<span className="min-w-0 truncate font-mono text-sm text-text leading-sm">{kit.label}</span>
						{kit.count > 1 ? (
							<span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-thread px-1 font-mono text-2xs text-on-thread leading-3">
								{kit.count}
							</span>
						) : null}
					</motion.div>
				</div>
			)}

			{menu === null ? null : <ContextMenu at={menu} entries={entries} />}
		</aside>
	);
}

/* ── one row ─────────────────────────────────────────────────────────── */

function TreeRow({
	row,
	model,
	dimmed,
	into,
	holds,
	springing,
	onPress,
	onRelease,
	onMenu,
}: {
	row: Row;
	model: ExplorerModel;
	dimmed: boolean;
	into: boolean;
	holds: boolean;
	springing: boolean;
	onPress: (event: React.PointerEvent<HTMLElement>, row: Row) => void;
	onRelease: (row: Row) => void;
	onMenu: (event: React.MouseEvent, target: { kind: "row"; id: string }) => void;
}) {
	const node = row.node;
	const selected = model.selection.includes(node.id);
	const active = isPage(node) && model.activePageId === node.id;
	const open = model.expanded.has(node.id);
	const renaming = model.renaming?.id === node.id;
	const last = row.index === row.siblings - 1;

	const shared = {
		onPointerDown: (event: React.PointerEvent<HTMLElement>) => onPress(event, row),
		onPointerUp: () => onRelease(row),
		onContextMenu: (event: React.MouseEvent) => onMenu(event, { kind: "row", id: node.id }),
	};

	return (
		<motion.div
			className="absolute inset-x-0"
			style={{ height: row.height }}
			initial={{ y: row.top + PAD, opacity: 0 }}
			animate={{ y: row.top + PAD, opacity: dimmed ? 0.3 : 1 }}
			transition={{ y: ROW_SPRING, opacity: { duration: 0.14, ease: EASE_OUT } }}
		>
			<div
				{...shared}
				className={cn(
					"group relative flex h-full select-none items-center pr-1.5",
					isPage(node) ? "" : "pr-0",
					(selected || active) && "bg-surface",
					!selected && !active && !into && "hover:bg-surface/60",
					into && "bg-raised outline-1 -outline-offset-1 outline-thread/70",
					holds && !into && "outline-1 -outline-offset-1 outline-thread/25",
				)}
				style={isPage(node) ? { paddingLeft: row.depth * INDENT } : undefined}
			>
				{active ? (
					<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
				) : null}

				{row.depth > 0 && isPage(node) ? (
					<>
						<span
							className="absolute w-px bg-border-raised"
							style={{ left: guideX(row.depth), top: 0, height: 10 }}
						/>
						<span
							className="absolute w-px bg-border-raised"
							style={{ left: guideX(row.depth), top: 22, height: last ? 4 : 10 }}
						/>
					</>
				) : null}

				{isPage(node) ? (
					<>
						<button
							type="button"
							aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}
							aria-expanded={open}
							onPointerDown={(event) => event.stopPropagation()}
							onClick={(event) => model.toggleOpen(node.id, event.altKey)}
							className="relative flex h-full w-6 shrink-0 items-center justify-center"
						>
							<ChevronIcon open={open} className="h-2.5 w-2.5 text-muted" />
							{springing ? <SpringArc /> : null}
						</button>
						<div className="flex h-full min-w-0 flex-1 items-center gap-2 text-left">
							<FolderIcon
								className={cn("h-3.5 w-3.5 shrink-0", active || into ? "text-thread" : "text-muted")}
							/>
							{renaming ? (
								<RenameField model={model} size="page" />
							) : (
								<span
									onDoubleClick={() => model.beginRename(node.id)}
									className={cn(
										"min-w-0 flex-1 truncate font-mono text-sm leading-sm",
										active || selected ? "text-text" : "text-muted",
									)}
								>
									{node.name}
								</span>
							)}
						</div>
						{/* the shipped column (`rail-rows.ts`): the count is what is one
						    chevron away, which is everything below, and an open page has
						    none — the rows under it are the count. A page of pages read 0
						    here for as long as it counted only its own, which is the one
						    number it is not. */}
						{open ? null : (
							<span className="shrink-0 font-mono text-2xs text-muted/60 leading-3">{frameCount(node)}</span>
						)}
					</>
				) : (
					<>
						<span
							className="absolute w-px bg-border-raised"
							style={{ left: guideX(row.depth), top: 0, height: last ? row.height - 6 : row.height }}
						/>
						<span
							className="absolute h-px bg-border-raised"
							style={{ left: guideX(row.depth), top: row.height / 2, width: 10 }}
						/>
						<div
							className="flex h-full w-full min-w-0 items-center gap-2 pr-3 text-left"
							style={{ paddingLeft: contentX(row.depth) }}
						>
							<FrameIcon className={cn("h-3.5 w-3.5 shrink-0", selected ? "text-thread" : "text-muted")} />
							{renaming ? (
								<RenameField model={model} size="frame" />
							) : (
								<>
									<span
										className={cn(
											"min-w-0 flex-1 truncate font-mono text-xs leading-xs",
											selected ? "text-text" : "text-muted",
										)}
									>
										{node.name}
									</span>
									<span className="shrink-0 pr-1 font-mono text-2xs text-muted/50 leading-3 opacity-0 transition-opacity group-hover:opacity-100">
										{node.entry}
									</span>
								</>
							)}
						</div>
					</>
				)}
			</div>
		</motion.div>
	);
}

/** the name, replaced in place by an input wearing the same mono metrics */
function RenameField({ model, size }: { model: ExplorerModel; size: "page" | "frame" }) {
	const cancelled = useRef(false);
	const primed = useRef(false);
	return (
		<input
			ref={(element) => {
				// once, on arrival: focus and pre-select. Re-running it on every render
				// would re-select the text under each keystroke
				if (element === null || primed.current) return;
				primed.current = true;
				element.focus();
				element.select();
			}}
			value={model.renaming?.draft ?? ""}
			spellCheck={false}
			autoComplete="off"
			onChange={(event) => model.setDraft(event.target.value)}
			onPointerDown={(event) => event.stopPropagation()}
			onKeyDown={(event) => {
				event.stopPropagation();
				if (event.key === "Enter") event.currentTarget.blur();
				if (event.key === "Escape") {
					cancelled.current = true;
					event.currentTarget.blur();
				}
			}}
			onBlur={() => {
				if (cancelled.current) {
					cancelled.current = false;
					model.cancelRename();
					return;
				}
				model.commitRename();
			}}
			className={cn(
				"-my-px min-w-0 flex-1 rounded-xs bg-bg px-1 font-mono text-text caret-thread outline-1 outline-thread/70",
				size === "page" ? "text-sm leading-sm" : "mr-2 text-xs leading-xs",
			)}
		/>
	);
}

/** the 450ms a shut page is held before it opens itself, drawn on its chevron */
function SpringArc() {
	return (
		<svg viewBox="0 0 20 20" className="pointer-events-none absolute h-5 w-5 text-thread" fill="none" aria-hidden="true">
			<motion.circle
				cx="10"
				cy="10"
				r="8"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinecap="round"
				initial={{ pathLength: 0 }}
				animate={{ pathLength: 1 }}
				transition={{ duration: SPRING_LOAD_MS / 1000, ease: "linear" }}
				style={{ rotate: -90, transformOrigin: "10px 10px" }}
			/>
		</svg>
	);
}

/* ── the menu ────────────────────────────────────────────────────────── */

type MenuEntry =
	| { readonly rule: true }
	| { readonly rule?: false; readonly label: string; readonly keys?: string; readonly off?: boolean; readonly run: () => void };

const MENU_W = 196;

function menuEntries(model: ExplorerModel, target: MenuState["target"], close: () => void): readonly MenuEntry[] {
	const after = (run: () => void) => () => {
		close();
		run();
	};
	const pasteable = model.clipboard.length > 0;

	if (target.kind === "empty") {
		return [
			{ label: "New page", run: after(() => model.newPage(TOP_ID)) },
			{ label: "Paste", keys: "⌘V", off: !pasteable, run: after(() => model.paste()) },
			{ rule: true },
			{ label: "Collapse all", run: after(() => model.collapseAll()) },
		];
	}

	const node = nodeAt(model.tree, target.id);
	if (node === null) return [];

	if (isPage(node)) {
		const permanent = node.id === ROOT_ID;
		return [
			{ label: "New page", run: after(() => model.newPage(TOP_ID)) },
			{ label: "New sub-page", run: after(() => model.newPage(node.id)) },
			{ rule: true },
			{ label: "Rename", keys: "↵", off: permanent, run: after(() => model.beginRename(node.id)) },
			{ label: "Duplicate", keys: "⌘D", off: permanent, run: after(() => model.duplicate([node.id])) },
			{ label: "Paste", keys: "⌘V", off: !pasteable, run: after(() => model.paste(node.id)) },
			{ rule: true },
			{ label: "Delete", keys: "⌫", off: permanent, run: after(() => model.remove([node.id])) },
		];
	}

	const many = model.selection.length > 1 && model.selection.includes(node.id);
	const chosen = many ? model.selection : [node.id];
	return [
		{ label: "Rename", keys: "↵", off: many, run: after(() => model.beginRename(node.id)) },
		{ label: "Duplicate", keys: "⌘D", run: after(() => model.duplicate(chosen)) },
		{ label: "Copy", keys: "⌘C", run: after(() => model.copy()) },
		{ rule: true },
		{ label: "Reveal on canvas", off: many, run: after(() => model.revealOnCanvas(node.id)) },
		{ rule: true },
		{ label: "Delete", keys: "⌫", run: after(() => model.remove(chosen)) },
	];
}

function ContextMenu({ at, entries }: { at: MenuState; entries: readonly MenuEntry[] }) {
	const height = entries.reduce((total, entry) => total + (entry.rule === true ? 9 : 30), 8);
	const flipY = at.y + height > window.innerHeight - 8;
	const flipX = at.x + MENU_W > window.innerWidth - 8;
	return (
		<motion.div
			role="menu"
			initial={{ opacity: 0, scale: 0.96 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ duration: 0.13, ease: EASE_OUT }}
			onPointerDown={(event: React.PointerEvent) => event.stopPropagation()}
			onContextMenu={(event: React.MouseEvent) => event.preventDefault()}
			className="fixed z-50 flex flex-col rounded-md border border-border-raised bg-raised p-unit"
			style={{
				width: MENU_W,
				left: flipX ? at.x - MENU_W : at.x,
				top: flipY ? at.y - height : at.y,
				transformOrigin: `${flipX ? "right" : "left"} ${flipY ? "bottom" : "top"}`,
			}}
		>
			{entries.map((entry, index) =>
				entry.rule === true ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: a rule has no identity of its own
					<div key={`rule-${index}`} className="mx-auto my-unit h-px bg-border-raised" style={{ width: MENU_W - 24 }} />
				) : (
					<button
						key={entry.label}
						type="button"
						role="menuitem"
						disabled={entry.off === true}
						onClick={entry.run}
						className={cn(
							"flex h-[30px] items-center rounded-sm px-3 text-left text-base leading-[14px]",
							entry.off === true ? "text-muted/40" : "text-text hover:bg-surface",
						)}
					>
						{entry.label}
						{entry.keys === undefined ? null : (
							<span
								className={cn(
									"ml-auto font-mono text-2xs leading-3",
									entry.off === true ? "text-muted/30" : "text-muted",
								)}
							>
								{entry.keys}
							</span>
						)}
					</button>
				),
			)}
		</motion.div>
	);
}

/* ── plumbing ────────────────────────────────────────────────────────── */

function kitFor(model: ExplorerModel, ids: readonly string[]): DragKit {
	const first = ids[0];
	const node = first === undefined ? null : nodeAt(model.tree, first);
	return {
		ids,
		label: node?.name ?? "",
		page: node !== null && isPage(node),
		count: ids.length,
	};
}

function sameLanding(a: Landing | null, b: Landing | null): boolean {
	if (a === null || b === null) return a === b;
	if (a.kind !== b.kind) return false;
	if (a.kind === "into" && b.kind === "into") return a.parentId === b.parentId;
	if (a.kind === "between" && b.kind === "between") {
		return a.slot.parentId === b.slot.parentId && a.slot.index === b.slot.index && a.y === b.y;
	}
	return false;
}

function FrameIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 14 14" className={className} fill="none" aria-hidden="true">
			<path d="M3 1.75h5l3 3v7.5H3z" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
			<path d="M8 1.75v3h3" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}
