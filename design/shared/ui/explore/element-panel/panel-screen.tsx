import "shared/ui/site/current/landing.css";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	type Answer,
	childrenOf,
	componentOf,
	type ElementRead,
	FRAME,
	fileName,
	isNode,
	isRow,
	nameOf,
	ownWords,
	parentOf,
	pathOf,
	readElement,
	siblingsOf,
} from "shared/lib/explore/element-panel/element-read";
import { cn } from "shared/lib/utils";
import { BloomLanding } from "shared/ui/site/current/ui/site/bloom/landing";
import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import { NumField, Row, Section } from "shared/ui/spool/properties-fields";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * The properties panel for a selected element, once the styling sections are gone
 * (spool-cloud#188). The field is the real `landing-current`, rendered here and read
 * the way the canvas shim reads it: click selects the deepest element, ⇧Enter or Esc
 * the parent, Tab the next sibling, Enter the first child. The Edit tool is inert, so
 * nothing on the page answers a click.
 */

export type Take = "path" | "outline" | "tree" | "source" | "lean" | "foot";
export type Pick = "words" | "group" | "row" | "component" | "frame";
/** where the tree stands: under the details in one panel, or somewhere of its own */
export type Layout = "panel" | "dock" | "left" | "float" | "summon" | "columns";

/** where each state's selection starts */
const PICKS: Record<Exclude<Pick, "frame">, string> = {
	words: ".ef-hero h1",
	group: ".ef-acquire",
	row: ".fold-finish-oxblood",
	component: '.es-section[data-section="try"] .es-heading',
};

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: [] },
	{ name: "site", frames: ["landing-current", "landing-current--mobile"], active: true, open: true },
];

const DOC_W = 1440;
const DOC_H = 1000;
const K_PANEL = 0.56;

/** what the hand holds: an element, the frame itself, or nothing */
type Held = Element | "frame" | null;

export function ElementPanelScreen({ take, pick, layout = "panel" }: { take: Take; pick: Pick; layout?: Layout }) {
	// the frame gives up room to a tree standing beside or under it
	const K = layout === "float" ? 0.4 : layout === "columns" ? 0.44 : K_PANEL;
	const lean = take === "lean" || take === "foot" || layout !== "panel";
	const [surface, setSurface] = useState<"properties" | "layers">("layers");
	const [summoned, setSummoned] = useState(true);
	const stage = useRef<HTMLDivElement>(null);
	const scroller = useRef<HTMLDivElement>(null);
	const glass = useRef<HTMLDivElement>(null);
	const doc = useRef<HTMLDivElement>(null);
	const [held, setHeld] = useState<Held>(null);
	const [hover, setHover] = useState<Element | null>(null);
	const [editing, setEditing] = useState<Element | null>(null);
	const [saved, setSaved] = useState<string | null>(null);
	const [, setTick] = useState(0);
	const redraw = useCallback(() => setTick((n) => n + 1), []);
	const selected = held instanceof Element ? held : null;

	const reveal = useCallback((el: Element) => {
		const box = scroller.current;
		if (box === null) return;
		const r = el.getBoundingClientRect();
		const s = box.getBoundingClientRect();
		const top = (r.top - s.top) / K + box.scrollTop;
		// only when none of it is on screen: a parent bigger than the view is already in it
		if (r.bottom < s.top + 20 || r.top > s.bottom - 20)
			box.scrollTop = Math.max(0, top - DOC_H / 2 + Math.min(r.height / K, DOC_H) / 2);
	}, [K]);

	const select = useCallback(
		(next: Held) => {
			setHeld(next);
			if (next instanceof Element) reveal(next);
		},
		[reveal],
	);

	// the state's starting selection, once the landing has drawn
	useEffect(() => {
		if (pick === "frame") {
			setHeld("frame");
			return;
		}
		let tries = 0;
		const find = () => {
			const el = doc.current?.querySelector(PICKS[pick]) ?? null;
			if (el !== null && isNode(el)) select(el);
			else if (tries++ < 40) timer = setTimeout(find, 100);
		};
		let timer = setTimeout(find, 200);
		return () => clearTimeout(timer);
	}, [pick, select]);

	/* ---------- words, edited where they are ---------- */

	const root = doc.current;
	const read = selected !== null && root !== null && root.contains(selected) ? readElement(selected, root) : null;
	const canType = read !== null && read.text !== null && read.text.ok;

	const begin = useCallback((el: Element, at?: { x: number; y: number }) => {
		if (!(el instanceof HTMLElement)) return;
		el.contentEditable = "true";
		el.style.outline = "none";
		el.focus();
		const range = caretAt(at, glass.current) ?? document.createRange();
		if (at === undefined || !el.contains(range.startContainer)) {
			range.selectNodeContents(el);
			range.collapse(false);
		}
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		setEditing(el);
	}, []);

	const finish = useCallback(() => {
		if (!(editing instanceof HTMLElement)) return;
		editing.contentEditable = "false";
		editing.removeAttribute("contenteditable");
		window.getSelection()?.removeAllRanges();
		const answer = readElement(editing, doc.current ?? editing).text;
		setSaved(answer?.ok === true && answer.where !== undefined ? `saved to ${answer.where}` : "saved");
		setEditing(null);
	}, [editing]);

	useEffect(() => {
		if (saved === null) return;
		const timer = setTimeout(() => setSaved(null), 2200);
		return () => clearTimeout(timer);
	}, [saved]);

	/* ---------- the keys the approved Edit tool binds ---------- */

	useEffect(() => {
		const down = (event: KeyboardEvent) => {
			if (editing !== null) {
				if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey)) {
					event.preventDefault();
					finish();
				}
				return;
			}
			const root = doc.current;
			if (layout === "summon" && (event.key === "l" || event.key === "L")) {
				setSummoned((on) => !on);
				return;
			}
			if (layout === "summon" && summoned && event.key === "Escape") {
				setSummoned(false);
				return;
			}
			if (root === null || held === null) return;
			if (held === "frame") {
				if (event.key === "Enter") {
					event.preventDefault();
					const first = childrenOf(root)[0];
					if (first !== undefined) select(first);
				}
				return;
			}
			if (event.key === "Escape" || (event.key === "Enter" && event.shiftKey)) {
				event.preventDefault();
				select(parentOf(held, root) ?? (lean ? "frame" : held));
			} else if (event.key === "Tab") {
				event.preventDefault();
				const row = siblingsOf(held, root);
				const at = row.indexOf(held);
				const next = row[(at + (event.shiftKey ? -1 : 1) + row.length) % row.length];
				if (next !== undefined) select(next);
			} else if (event.key === "Enter") {
				event.preventDefault();
				if (lean && canType) begin(held);
				else {
					const first = childrenOf(held)[0];
					if (first !== undefined) select(first);
				}
			}
		};
		window.addEventListener("keydown", down);
		return () => window.removeEventListener("keydown", down);
	}, [held, select, editing, finish, begin, canType, lean, layout, summoned]);

	const hitAt = (x: number, y: number): Element | null => {
		const root = doc.current;
		if (root === null) return null;
		for (const hit of document.elementsFromPoint(x, y)) {
			if (!root.contains(hit) || hit === root) continue;
			for (let at: Element | null = hit; at !== null && at !== root; at = at.parentElement) if (isNode(at)) return at;
		}
		return null;
	};

	const acts: Acts = {
		select: (el) => {
			select(el);
			if (layout === "summon") setSummoned(false);
		},
		hover: setHover,
	};
	const frameName = FRAME.split("/").at(-1) ?? FRAME;
	const frameHeld = held === "frame";
	const tree = root === null ? null : <Tree read={read} frame={frameHeld} root={root} acts={acts} />;
	const details = (
		<div className="flex h-full min-h-0 flex-col bg-bg">
			<Details read={read} frame={frameHeld} />
			{layout === "summon" ? (
				<p className="px-2.5 py-2 text-muted type-detail">
					<button type="button" onClick={() => setSummoned((on) => !on)} className="cursor-pointer hover:text-text">
						tree · L
					</button>
				</p>
			) : null}
		</div>
	);
	const pages: readonly PageRow[] =
		layout === "left" && tree !== null
			? PAGES.map((page) =>
					page.name === "site"
						? {
								...page,
								under: {
									"landing-current": (
										<div className="max-h-[600px] overflow-y-auto border-border border-y bg-bg py-1 pl-4">{tree}</div>
									),
								},
							}
						: page,
				)
			: PAGES;
	const box = (el: Element) => {
		const s = stage.current?.getBoundingClientRect();
		const r = el.getBoundingClientRect();
		return s === undefined ? null : { left: r.left - s.left, top: r.top - s.top, width: r.width, height: r.height };
	};
	const anchor = read === null ? null : box(read.el);
	const railFor = (): ReactNode => {
		if (root === null) return null;
		if (layout === "dock") return surface === "layers" ? <div className="h-full overflow-y-auto bg-bg py-1">{tree}</div> : details;
		if (layout !== "panel") return details;
		if (take === "path") return <PathPanel read={read} root={root} acts={acts} />;
		if (take === "outline") return <OutlinePanel read={read} root={root} acts={acts} />;
		if (take === "tree") return <TreePanel read={read} root={root} acts={acts} />;
		if (take === "source") return <SourcePanel read={read} root={root} acts={acts} />;
		return <LeanPanel read={read} frame={frameHeld} root={root} acts={acts} foot={take === "foot"} />;
	};

	return (
		<SpoolShell activeTab="spool" tabs={["spool"]} zoom="52%">
			<CanvasChrome
				pages={pages}
				selected="landing-current"
				tool="edit"
				railWidth={300}
				railLabel={layout === "dock" ? surface : "properties"}
				layers={layout === "dock"}
				onGlyph={(glyph) => {
					if (glyph === "properties" || glyph === "layers") setSurface(glyph);
				}}
				rail={railFor()}
			>
				<div ref={stage} className="absolute top-[56px] left-[20px]">
					<button
						type="button"
						onClick={() => {
							if (editing !== null) finish();
							select("frame");
						}}
						className={cn("mb-1.5 flex cursor-default items-center gap-2 type-value", held === "frame" ? "text-thread" : "text-muted")}
					>
						{frameName}
					</button>
					<div className="relative overflow-hidden rounded-[6px] border border-border" style={{ width: DOC_W * K, height: DOC_H * K }}>
						<div
							ref={scroller}
							onScroll={redraw}
							className="absolute top-0 left-0 overflow-y-auto overflow-x-hidden [scrollbar-width:none]"
							style={{ width: DOC_W, height: DOC_H, transform: `scale(${K})`, transformOrigin: "0 0" }}
						>
							<div ref={doc}>
								<BloomLanding />
							</div>
						</div>
						{/* the Edit tool's glass: the page hears nothing while it is on */}
						<div
							ref={glass}
							className={cn("absolute inset-0", editing === null ? "cursor-default" : "cursor-text")}
							onPointerMove={(event) => editing === null && setHover(hitAt(event.clientX, event.clientY))}
							onPointerLeave={() => setHover(null)}
							onPointerDown={(event) => {
								if (editing === null) return;
								const hit = hitAt(event.clientX, event.clientY);
								event.preventDefault();
								if (hit !== null && editing.contains(hit)) begin(editing, { x: event.clientX, y: event.clientY });
								else finish();
							}}
							onClick={(event) => {
								if (editing !== null) return;
								select(hitAt(event.clientX, event.clientY));
							}}
							onDoubleClick={(event) => {
								if (!lean || editing !== null) return;
								const hit = hitAt(event.clientX, event.clientY);
								if (hit === null || doc.current === null) return;
								const answer = readElement(hit, doc.current).text;
								if (answer?.ok === true) {
									select(hit);
									begin(hit, { x: event.clientX, y: event.clientY });
								}
							}}
							onWheel={(event) => {
								if (scroller.current !== null) scroller.current.scrollTop += event.deltaY / K;
							}}
						/>
						{held === "frame" ? <span className="pointer-events-none absolute inset-0 rounded-[6px] border-[1.5px] border-thread" /> : null}
					</div>
					<Marks stage={stage.current} hover={hover === selected ? null : hover} read={read} editing={editing !== null} />
					{layout === "float" && tree !== null ? (
						<div
							className="absolute overflow-y-auto rounded-[6px] border border-border bg-bg py-1"
							style={{ left: DOC_W * K + 16, top: 24, width: 250, height: DOC_H * K }}
						>
							{tree}
						</div>
					) : null}
					{layout === "columns" && root !== null ? (
						<div className="absolute" style={{ left: 0, top: 24 + DOC_H * K + 20, width: DOC_W * K, height: 200 }}>
							<Columns read={read} root={root} acts={acts} />
						</div>
					) : null}
					{layout === "summon" && summoned && tree !== null ? (
						<div
							className="absolute z-10 max-h-[320px] w-[300px] overflow-y-auto rounded-[6px] border border-border-raised bg-bg py-1"
							style={{
								left: Math.min(Math.max(0, anchor?.left ?? 0), DOC_W * K - 300),
								top: Math.min((anchor === null ? 0 : anchor.top + anchor.height) + 10, 24 + DOC_H * K - 120),
							}}
						>
							{tree}
						</div>
					) : null}
					{saved === null ? null : (
						<span className="absolute left-0 mt-2 text-muted type-detail" style={{ top: 22 + DOC_H * K }}>
							{saved}
						</span>
					)}
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

/** the caret under a point in the page, asked past the glass */
function caretAt(at: { x: number; y: number } | undefined, glass: HTMLDivElement | null): Range | null {
	if (at === undefined || glass === null) return null;
	glass.style.pointerEvents = "none";
	const range = document.caretRangeFromPoint(at.x, at.y);
	glass.style.pointerEvents = "";
	return range;
}

/* ---------- the outline and the name label ---------- */

function Marks({
	stage,
	hover,
	read,
	editing,
}: {
	stage: HTMLDivElement | null;
	hover: Element | null;
	read: ElementRead | null;
	editing: boolean;
}) {
	if (stage === null) return null;
	const s = stage.getBoundingClientRect();
	const box = (el: Element) => {
		const r = el.getBoundingClientRect();
		return { left: r.left - s.left, top: r.top - s.top, width: r.width, height: r.height };
	};
	return (
		<div className="pointer-events-none absolute inset-0">
			{hover === null ? null : <span className="absolute border border-thread/60" style={box(hover)} />}
			{read === null ? null : (
				<>
					<span className="absolute border-[1.5px] border-thread" style={box(read.el)} />
					{editing ? null : (
						<span
							className="absolute -translate-y-full rounded-t-[3px] bg-thread px-1.5 py-px text-on-thread type-detail"
							style={{ left: box(read.el).left - 0.75, top: box(read.el).top - 0.75 }}
						>
							{read.name}
						</span>
					)}
				</>
			)}
		</div>
	);
}

/* ---------- pieces every take shares ---------- */

/** rows step in 10px at a time, and stop stepping at 14 deep so a row keeps its name */
const indent = (depth: number) => 6 + Math.min(depth, 14) * 10;

interface Acts {
	select: (el: Element) => void;
	hover: (el: Element | null) => void;
}

function Empty() {
	return (
		<div className="flex h-full flex-col bg-bg">
			<div className="flex h-9 shrink-0 items-center border-border border-b px-2.5 text-muted type-value">
				no selection
			</div>
			<p className="px-2.5 py-3 text-muted type-detail">click an element on the frame</p>
		</div>
	);
}

function Where({ where }: { where: string | undefined }) {
	return where === undefined ? null : <span className="text-muted type-detail">{where}</span>;
}

/** one edit, as the lane answers it: how to do it, or why not and a way out */
function Edit({ name, answer }: { name: string; answer: Answer | null }) {
	return (
		<div className="flex gap-2 px-2.5 py-1.5">
			<span className="w-[46px] shrink-0 pt-px text-muted type-detail">{name}</span>
			{answer === null ? (
				<span className="text-muted type-detail">no words of its own</span>
			) : answer.ok ? (
				<span className="flex min-w-0 flex-col">
					<span className="text-text type-label">{answer.says}</span>
					<Where where={answer.where} />
				</span>
			) : (
				<span className="flex min-w-0 flex-col items-start gap-1">
					<span className="text-muted type-label">{answer.says}</span>
					<button type="button" className="cursor-pointer text-thread type-detail hover:underline">
						ask the agent
					</button>
				</span>
			)}
		</div>
	);
}

function Words({ read }: { read: ElementRead }) {
	if (read.words === null) return null;
	return (
		<p className="line-clamp-4 whitespace-pre-line px-2.5 pt-2.5 pb-1 text-text type-control">{read.words}</p>
	);
}

function Shared({ read }: { read: ElementRead }) {
	if (read.shared.length === 0) return null;
	return (
		<div className="flex items-baseline gap-2 px-2.5 py-1.5">
			<span className="size-1.5 shrink-0 translate-y-[-1px] rounded-full bg-thread" />
			<span className="min-w-0 text-muted type-detail">
				also in {read.shared.map((frame) => frame.split("/").at(-1)).join(", ")}
			</span>
		</div>
	);
}

function Title({ read, compact = false }: { read: ElementRead; compact?: boolean }) {
	const at = read.stamp === null ? "not written in a file" : `${fileName(read.stamp.file)}:${read.stamp.line}`;
	return (
		<div className={cn("flex shrink-0 flex-col justify-center border-border border-b px-2.5", compact ? "h-11" : "h-12")}>
			<span className="flex items-baseline gap-2">
				<span className="truncate text-text type-value">{read.name}</span>
				{read.row === null ? null : (
					<span className="text-muted type-detail">
						row {read.row.index + 1} of {read.row.count}
					</span>
				)}
			</span>
			<span className="truncate text-muted type-detail">
				{at}
				{read.within === null ? "" : ` · in ${read.within}`}
			</span>
		</div>
	);
}

/** a row of the tree: the name, its words when it has them, and a mark for what it is */
function Node({
	el,
	depth,
	current,
	acts,
	open,
	onToggle,
	children,
}: {
	el: Element;
	depth: number;
	current: boolean;
	acts: Acts;
	open?: boolean | undefined;
	onToggle?: (() => void) | undefined;
	children?: ReactNode;
}) {
	const name = nameOf(el);
	const words = ownWords(el);
	const kids = childrenOf(el).length;
	const ref = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		if (current) ref.current?.scrollIntoView({ block: "nearest" });
	}, [current]);
	return (
		<div
			ref={ref}
			className={cn(
				"group flex h-6 cursor-default items-center gap-1 pr-2.5",
				current ? "bg-thread/15 text-text" : "text-muted hover:bg-surface hover:text-text",
			)}
			style={{ paddingLeft: indent(depth) }}
			onPointerEnter={() => acts.hover(el)}
			onPointerLeave={() => acts.hover(null)}
			onClick={() => acts.select(el)}
		>
			<button
				type="button"
				aria-label={open ? "Collapse" : "Expand"}
				onClick={(event) => {
					event.stopPropagation();
					onToggle?.();
				}}
				className={cn("flex h-4 w-3 shrink-0 items-center justify-center", kids === 0 || onToggle === undefined ? "invisible" : "")}
			>
				<svg viewBox="0 0 8 8" className={cn("h-2 w-2 transition-transform", open ? "rotate-90" : "")} aria-hidden="true">
					<path d="M2.5 1.5 5.5 4l-3 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
				</svg>
			</button>
			<span className={cn("shrink-0 type-value", current ? "text-text" : "")}>{name}</span>
			{words === null ? null : <span className="min-w-0 truncate text-muted/80 type-detail">{words.replace(/\n/g, " ")}</span>}
			{children}
		</div>
	);
}

/* ---------- take 1: the path, and what is inside ---------- */

function PathPanel({ read, root, acts }: { read: ElementRead | null; root: Element; acts: Acts }) {
	if (read === null) return <Empty />;
	const path = pathOf(read.el, root);
	const inside = childrenOf(read.el);
	return (
		<div className="flex h-full min-h-0 flex-col bg-bg">
			<Title read={read} />
			<div className="min-h-0 flex-1 overflow-y-auto">
				<Words read={read} />
				<Edit name="text" answer={read.text} />
				<Edit name="delete" answer={read.remove} />
				<Edit name="move" answer={read.move} />
				<Shared read={read} />
				<div className="mt-1.5 border-border-raised border-t pt-1">
					<div className="flex h-6 items-center px-2.5 text-muted type-detail">
						<span>path</span>
						<span className="ml-auto">⇧⏎ parent · tab next</span>
					</div>
					{path.map((el, depth) => (
						<Node key={depth} el={el} depth={depth} current={el === read.el} acts={acts} />
					))}
					{inside.map((el) => (
						<Node key={el.getAttribute("data-spool-source") ?? ""} el={el} depth={path.length} current={false} acts={acts} />
					))}
					{inside.length === 0 ? (
						<div className="h-6 text-muted/70 type-detail" style={{ paddingLeft: 15 + indent(path.length) }}>
							nothing inside
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}

/* ---------- take 2: the element above, the whole outline below ---------- */

function useOpen(read: ElementRead | null, root: Element) {
	const [open, setOpen] = useState<Set<Element>>(new Set());
	const at = read?.el ?? null;
	useEffect(() => {
		if (at === null) return;
		setOpen((held) => {
			const next = new Set(held);
			for (const el of pathOf(at, root).slice(0, -1)) next.add(el);
			return next;
		});
	}, [at, root]);
	const toggle = (el: Element) =>
		setOpen((held) => {
			const next = new Set(held);
			if (next.has(el)) next.delete(el);
			else next.add(el);
			return next;
		});
	return { open, toggle, setOpen };
}

function Outline({
	root,
	read,
	acts,
	open,
	toggle,
	detail,
}: {
	root: Element;
	read: ElementRead | null;
	acts: Acts;
	open: Set<Element>;
	toggle: (el: Element) => void;
	detail?: ((read: ElementRead, depth: number) => ReactNode) | undefined;
}) {
	const rows: ReactNode[] = [];
	const visit = (el: Element, depth: number) => {
		const current = el === read?.el;
		rows.push(
			<Node
				key={`${depth}-${rows.length}`}
				el={el}
				depth={depth}
				current={current}
				acts={acts}
				open={open.has(el)}
				onToggle={() => toggle(el)}
			/>,
		);
		if (current && read !== null && detail !== undefined) rows.push(<div key="detail">{detail(read, depth)}</div>);
		if (open.has(el)) for (const child of childrenOf(el)) visit(child, depth + 1);
	};
	for (const el of childrenOf(root)) visit(el, 0);
	return <>{rows}</>;
}

function OutlinePanel({ read, root, acts }: { read: ElementRead | null; root: Element; acts: Acts }) {
	const { open, toggle } = useOpen(read, root);
	return (
		<div className="flex h-full min-h-0 flex-col bg-bg">
			{read === null ? (
				<div className="flex h-12 shrink-0 items-center border-border border-b px-2.5 text-muted type-value">no selection</div>
			) : (
				<>
					<Title read={read} />
					<div className="shrink-0 pb-1">
						<Words read={read} />
						<Edit name="text" answer={read.text} />
						<Edit name="delete" answer={read.remove} />
						<Edit name="move" answer={read.move} />
						<Shared read={read} />
					</div>
				</>
			)}
			<div className="flex h-7 shrink-0 items-center border-border-raised border-t px-2.5 text-muted type-detail">
				<span>{FRAME.split("/").at(-1)}</span>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto pb-3">
				<Outline root={root} read={read} acts={acts} open={open} toggle={toggle} />
			</div>
		</div>
	);
}

/* ---------- take 3: the tree is the panel, and the selected row opens ---------- */

function TreePanel({ read, root, acts }: { read: ElementRead | null; root: Element; acts: Acts }) {
	const { open, toggle } = useOpen(read, root);
	return (
		<div className="flex h-full min-h-0 flex-col bg-bg">
			<div className="flex h-9 shrink-0 items-center border-border border-b px-2.5 text-text type-value">
				{FRAME.split("/").at(-1)}
				<span className="ml-auto text-muted type-detail">{read === null ? "" : `${pathOf(read.el, root).length} deep`}</span>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto pb-3">
				<Outline
					root={root}
					read={read}
					acts={acts}
					open={open}
					toggle={toggle}
					detail={(held, depth) => (
						<div className="border-thread/40 border-l bg-surface/60 pb-1" style={{ marginLeft: 12 + indent(depth) }}>
							<div className="px-2.5 pt-1.5 text-muted type-detail">
								{held.stamp === null ? "not written in a file" : `${fileName(held.stamp.file)}:${held.stamp.line}`}
								{held.within === null ? "" : ` · in ${held.within}`}
								{held.row === null ? "" : ` · row ${held.row.index + 1} of ${held.row.count}`}
							</div>
							<Words read={held} />
							{held.text === null ? null : <Edit name="text" answer={held.text} />}
							<Edit name="delete" answer={held.remove} />
							<Edit name="move" answer={held.move} />
							<Shared read={held} />
						</div>
					)}
				/>
			</div>
		</div>
	);
}

/* ---------- take 4: the tree as the source writes it ---------- */

interface Unit {
	kind: "el" | "list";
	el: Element;
	members?: Element[];
}

/** a mapped list reads as one row: `.map` over what it maps, with its rows under it */
function unitsOf(parent: Element): Unit[] {
	const out: Unit[] = [];
	for (const child of childrenOf(parent)) {
		const last = out.at(-1);
		const stamp = child.getAttribute("data-spool-source");
		const read = isRow(child);
		if (read && last !== undefined && last.kind === "list" && last.el.getAttribute("data-spool-source") === stamp) {
			last.members?.push(child);
			continue;
		}
		out.push(read ? { kind: "list", el: child, members: [child] } : { kind: "el", el: child });
	}
	return out;
}

function SourceRows({
	read,
	root,
	acts,
	open,
	toggle,
}: {
	read: ElementRead | null;
	root: Element;
	acts: Acts;
	open: Set<Element>;
	toggle: (el: Element) => void;
}) {
	const rows: ReactNode[] = [];
	const fileOf = (el: Element) => (el.getAttribute("data-spool-source") ?? "").replace(/:\d+:\d+$/, "").split("/").at(-1) ?? "";
	const visit = (el: Element, depth: number, parentFile: string, label?: string) => {
		const current = el === read?.el;
		const file = fileOf(el);
		const kids = childrenOf(el).length;
		const isOpen = open.has(el);
		const words = ownWords(el);
		const tag = componentOf(el) ?? el.localName;
		rows.push(
			<div
				key={rows.length}
				ref={current ? (row) => row?.scrollIntoView({ block: "nearest" }) : undefined}
				className={cn(
					"flex h-6 cursor-default items-center gap-1 pr-2.5",
					current ? "bg-thread/15 text-text" : "text-muted hover:bg-surface hover:text-text",
				)}
				style={{ paddingLeft: indent(depth) }}
				onPointerEnter={() => acts.hover(el)}
				onPointerLeave={() => acts.hover(null)}
				onClick={() => acts.select(el)}
			>
				<button
					type="button"
					aria-label={isOpen ? "Collapse" : "Expand"}
					onClick={(event) => {
						event.stopPropagation();
						toggle(el);
					}}
					className={cn("flex h-4 w-3 shrink-0 items-center justify-center", kids === 0 ? "invisible" : "")}
				>
					<svg viewBox="0 0 8 8" className={cn("h-2 w-2 transition-transform", isOpen ? "rotate-90" : "")} aria-hidden="true">
						<path d="M2.5 1.5 5.5 4l-3 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
					</svg>
				</button>
				{label === undefined ? null : <span className="shrink-0 text-muted/70 type-detail">{label}</span>}
				<span className={cn("shrink-0 type-value", tag === el.localName ? "" : "text-text")}>
					{"<"}
					{tag}
					{">"}
				</span>
				{words === null ? null : <span className="min-w-0 truncate text-text/80 type-detail">{words.replace(/\n/g, " ")}</span>}
				{file !== parentFile ? <span className="ml-auto shrink-0 pl-2 text-muted/70 type-detail">{file}</span> : null}
			</div>,
		);
		if (!isOpen) return;
		for (const unit of unitsOf(el)) {
			if (unit.kind === "el") visit(unit.el, depth + 1, file);
			else {
				const members = unit.members ?? [];
				rows.push(
					<div key={rows.length} className="flex h-6 items-center gap-1 pr-2.5 text-muted type-detail" style={{ paddingLeft: 15 + indent(depth + 1) }}>
						<span className="text-text/80">.map</span>
						<span>×{members.length}</span>
					</div>,
				);
				members.forEach((member, index) => visit(member, depth + 2, file, String(index + 1)));
			}
		}
	};
	for (const el of childrenOf(root)) visit(el, 0, "");
	return <>{rows}</>;
}

function SourcePanel({ read, root, acts }: { read: ElementRead | null; root: Element; acts: Acts }) {
	const { open, toggle } = useOpen(read, root);
	return (
		<div className="flex h-full min-h-0 flex-col bg-bg">
			<div className="flex h-9 shrink-0 items-center border-border border-b px-2.5 text-text type-value">
				{FRAME.split("/").at(-1)}
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto pb-2">
				<SourceRows read={read} root={root} acts={acts} open={open} toggle={toggle} />
			</div>
			{read === null ? null : (
				<div className="shrink-0 border-border border-t bg-bg pb-1">
					<div className="flex h-8 items-center gap-2 px-2.5">
						<span className="text-text type-value">{read.name}</span>
						<span className="ml-auto truncate text-muted type-detail">
							{read.stamp === null ? "" : `${fileName(read.stamp.file)}:${read.stamp.line}`}
						</span>
					</div>
					{read.text === null ? null : <Edit name="text" answer={read.text} />}
					<Edit name="delete" answer={read.remove} />
					<Edit name="move" answer={read.move} />
					<Shared read={read} />
				</div>
			)}
		</div>
	);
}

/* ---------- take 5: the lean panel ---------- */

/**
 * What survived the takes (spool-cloud#188): the panel says what the selection is,
 * where it is written, and only what the hand cannot do and why. What it can do
 * lives on the canvas: words edit in place, ⌫ deletes, arrows move. The tree reads
 * like the code. A frame shows its own geometry. The `layout/` takes put these two
 * pieces, the details and the tree, in different places.
 */

/** what the selection is and what the hand cannot do to it */
function Details({ read, frame, foot = false }: { read: ElementRead | null; frame: boolean; foot?: boolean }) {
	const refused =
		read === null
			? []
			: ([["words", read.text], ["delete", read.remove], ["move", read.move]] as const).filter(
					(entry): entry is readonly [string, Extract<Answer, { ok: false }>] => entry[1] !== null && !entry[1].ok,
				);
	return (
		<div className={cn("shrink-0", foot ? "border-border border-t" : "")}>
			{frame ? (
				<div className="shrink-0">
					<div className="flex h-9 items-center gap-2 border-border border-b px-2.5">
						<span className="text-text type-value">{FRAME.split("/").at(-1)}</span>
						<span className="ml-auto text-muted type-detail">frame.json</span>
					</div>
					<Section name="position">
						<Row name="x">
							<NumField value="80" readout="px" ok onCommit={() => {}} />
						</Row>
						<Row name="y">
							<NumField value="80" readout="px" ok onCommit={() => {}} />
						</Row>
					</Section>
					<Section name="size">
						<Row name="w">
							<NumField value="1440" readout="px" ok onCommit={() => {}} />
						</Row>
						<Row name="h">
							<NumField value="1000" readout="px" ok onCommit={() => {}} />
						</Row>
					</Section>
				</div>
			) : read === null ? (
				<div className={cn("flex h-9 items-center px-2.5 text-muted type-value", foot ? "" : "border-border border-b")}>
					no selection
				</div>
			) : (
				<div className={cn("pb-1.5", foot ? "" : "border-border border-b")}>
					<div className="flex h-9 items-center gap-2 px-2.5">
						<span className="shrink-0 text-text type-value">{read.name}</span>
						{read.row === null ? null : (
							<span className="shrink-0 text-muted type-detail">
								{read.row.index + 1} of {read.row.count}
							</span>
						)}
						<span className="ml-auto truncate text-muted type-detail">
							{read.stamp === null ? "not in a file" : `${fileName(read.stamp.file)}:${read.stamp.line}`}
						</span>
					</div>
					{read.shared.length === 0 ? null : (
						<p className="px-2.5 pb-1 text-muted type-detail">
							also in {read.shared.map((f) => f.split("/").at(-1)).join(", ")}
						</p>
					)}
					{refused.map(([what, answer]) => (
						<p key={what} className="px-2.5 pt-1 text-muted type-label">
							<span className="text-text">Can’t {what === "words" ? "edit the words" : what}:</span>{" "}
							{answer.says.replace(/;? ?(edit it in code or )?ask the agent$/, "")}.{" "}
							<button type="button" className="cursor-pointer text-thread hover:underline">
								Ask the agent
							</button>
						</p>
					))}
				</div>
			)}
		</div>
	);
}

/** the tree in code labels, opened down to the selection, two levels open when a frame is held */
function Tree({ read, frame, root, acts }: { read: ElementRead | null; frame: boolean; root: Element; acts: Acts }) {
	const { open, toggle, setOpen } = useOpen(read, root);
	useEffect(() => {
		if (!frame) return;
		const top = childrenOf(root)[0];
		if (top === undefined) return;
		setOpen((held) => new Set([...held, top, ...childrenOf(top)]));
	}, [frame, root, setOpen]);
	return <SourceRows read={read} root={root} acts={acts} open={open} toggle={toggle} />;
}

function LeanPanel({
	read,
	frame,
	root,
	acts,
	foot = false,
}: {
	read: ElementRead | null;
	frame: boolean;
	root: Element;
	acts: Acts;
	/** the details under the tree, so the tree never moves when their height does */
	foot?: boolean;
}) {
	return (
		<div className="flex h-full min-h-0 flex-col bg-bg">
			{foot ? null : <Details read={read} frame={frame} />}
			<div className="min-h-0 flex-1 overflow-y-auto py-1">
				<Tree read={read} frame={frame} root={root} acts={acts} />
			</div>
			{foot ? <Details read={read} frame={frame} foot /> : null}
		</div>
	);
}

/* ---------- the layout takes: the tree somewhere other than under the details ---------- */

/** a row's label, the way the code writes it */
function CodeLabel({ el }: { el: Element }) {
	const tag = componentOf(el) ?? el.localName;
	const words = ownWords(el);
	return (
		<>
			<span className={cn("shrink-0 type-value", tag === el.localName ? "" : "text-text")}>{`<${tag}>`}</span>
			{words === null ? null : <span className="min-w-0 truncate text-text/80 type-detail">{words.replace(/\n/g, " ")}</span>}
		</>
	);
}

function ColumnRow({ el, current, onPath, acts }: { el: Element; current: boolean; onPath: boolean; acts: Acts }) {
	return (
		<div
			ref={current || onPath ? (row) => row?.scrollIntoView({ block: "nearest" }) : undefined}
			className={cn(
				"flex h-6 shrink-0 cursor-default items-center gap-1 px-2",
				current ? "bg-thread/15 text-text" : onPath ? "bg-surface text-text" : "text-muted hover:bg-surface hover:text-text",
			)}
			onPointerEnter={() => acts.hover(el)}
			onPointerLeave={() => acts.hover(null)}
			onClick={() => acts.select(el)}
		>
			<CodeLabel el={el} />
			{childrenOf(el).length === 0 ? null : (
				<svg viewBox="0 0 8 8" className="ml-auto h-2 w-2 shrink-0 text-muted" aria-hidden="true">
					<path d="M2.5 1.5 5.5 4l-3 2.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
				</svg>
			)}
		</div>
	);
}

/** Finder's column view: the parent's row, the selection's row, and what is inside it */
function Columns({ read, root, acts }: { read: ElementRead | null; root: Element; acts: Acts }) {
	const el = read?.el ?? null;
	const parent = el === null ? null : parentOf(el, root);
	const cols: { items: Element[]; mark: Element | null; current: boolean }[] =
		el === null
			? [{ items: childrenOf(root), mark: null, current: false }]
			: [
					...(parent === null ? [] : [{ items: siblingsOf(parent, root), mark: parent, current: false }]),
					{ items: siblingsOf(el, root), mark: el, current: true },
					{ items: childrenOf(el), mark: null, current: false },
				];
	return (
		<div className="grid h-full grid-cols-3 divide-x divide-border overflow-hidden rounded-[6px] border border-border bg-bg">
			{cols.map((col, index) => (
				<div key={index} className="flex min-h-0 min-w-0 flex-col overflow-y-auto py-1">
					{col.items.length === 0 ? (
						<span className="px-2 py-1 text-muted/70 type-detail">nothing inside</span>
					) : (
						col.items.map((item, at) => (
							<ColumnRow
								key={at}
								el={item}
								current={col.current && item === col.mark}
								onPath={!col.current && item === col.mark}
								acts={acts}
							/>
						))
					)}
				</div>
			))}
		</div>
	);
}
