import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { FAINT, Menu, NumField, type Option, Row, Section, TextField, VALUE } from "shared/ui/spool/properties-fields";
import { SpoolShell } from "shared/ui/spool/shell";
import "shared/ui/explore/properties-map/origin-edits.css";

/**
 * Three refinements of the `edit-origin` take (spool-cloud#61), each a
 * separate frame, over the shipped Row, Section, NumField, TextField and Menu.
 * The rows wear the rail's CSS names and the rail's finish: no box until the
 * pointer is on a field, the label scrubs, arrows step and shift steps ten,
 * a value that differs from the file reads in thread colour.
 *
 * The takes differ in where the reach lives and in the stepping rule:
 *   head   the use count folds into the head; a spacing step is 4px, the shipped rule
 *   dots   the origin line carries four rail dots, one per use; every step is 1px, Figma's rule
 *   hint   the origin line stays; the foot reads the gesture under the pointer; the shipped rule
 *
 * The canvas handles sit on the button's four edges and pull outward: the top
 * handle dragged up grows the padding, the left handle dragged left grows it.
 * The top and left edges follow the hand because the box grows from its
 * bottom right corner; the other two keep the rule and grow the box away from
 * the pointer. Alt drags 1px.
 *
 * Edits and undo live in memory and reset on reload. Nothing here writes a
 * file, attributes an edit to source, or proves a token binding.
 */
export type OriginTake = "head" | "dots" | "hint";
type FrameName = "menu" | "cart" | "receipt" | "orders";
type Target = "button" | "heading" | "frame";
type Axis = "px" | "py";
type Edge = "t" | "r" | "b" | "l";
type Numeric = "px" | "py" | "radius" | "fontSize" | "width" | "opacity";
interface ButtonStyle {
	px: number;
	py: number;
	radius: number;
	fontSize: number;
	width: number | null;
	opacity: number;
	fill: string;
}
interface LocalFrame {
	label: string;
	title: string;
	padding: number;
	fontSize: number;
}
interface Document {
	shared: ButtonStyle;
	frames: Record<FrameName, LocalFrame>;
}
interface Selection {
	frame: FrameName;
	target: Target;
}
type Change = (current: Document) => Document;
const NAMES: readonly FrameName[] = ["menu", "cart", "receipt", "orders"];
/** what the file says: the values a changed mark is measured against */
const FILE: Document = {
	shared: { px: 16, py: 12, radius: 6, fontSize: 14, width: null, opacity: 100, fill: "#f5391a" },
	frames: {
		menu: { label: "Till kassan", title: "Vad får det lov att vara?", padding: 20, fontSize: 24 },
		cart: { label: "Betala", title: "Din beställning", padding: 20, fontSize: 24 },
		receipt: { label: "Beställ igen", title: "Tack för idag.", padding: 20, fontSize: 24 },
		orders: { label: "Se menyn", title: "Dina beställningar", padding: 20, fontSize: 24 },
	},
};
/** the `--changed` state: three edits already made, the first two shared */
const AFTER_PADDING: Document = { ...FILE, shared: { ...FILE.shared, py: 16 } };
const AFTER_WIDTH: Document = { ...AFTER_PADDING, shared: { ...AFTER_PADDING.shared, width: 180 } };
const CHANGED: Document = {
	...AFTER_WIDTH,
	frames: { ...FILE.frames, cart: { ...FILE.frames.cart, label: "Betala nu" } },
};
const BRAND: Option = { token: "#f5391a", name: "brand", swatch: "#f5391a", value: "#f5391a" };
const COLORS: readonly Option[] = [
	BRAND,
	{ token: "#35715b", name: "forest", swatch: "#35715b", value: "#35715b" },
	{ token: "#465f97", name: "blue", swatch: "#465f97", value: "#465f97" },
	{ token: "#5c5550", name: "stone", swatch: "#5c5550", value: "#5c5550" },
];
const LIMITS: Record<Numeric, number> = { px: 64, py: 48, radius: 48, fontSize: 40, width: 400, opacity: 100 };

/* ---------- the document: one transaction at a time, undo by whole transactions ---------- */

function useDocument(edited: boolean) {
	const [doc, setDoc] = useState(edited ? CHANGED : FILE);
	const current = useRef(doc);
	const start = useRef<Document | null>(null);
	const past = useRef<Document[]>(edited ? [FILE, AFTER_PADDING, AFTER_WIDTH] : []);
	const future = useRef<Document[]>([]);
	const cancelledPointer = useRef(false);
	const [, bump] = useState(0);
	const publish = (next: Document) => {
		current.current = next;
		setDoc(next);
	};
	const begin = () => {
		start.current ??= current.current;
	};
	const preview = (change: Change) => {
		begin();
		publish(change(current.current));
	};
	const finish = () => {
		const before = start.current;
		start.current = null;
		if (before !== null && JSON.stringify(before) !== JSON.stringify(current.current)) {
			past.current.push(before);
			future.current = [];
		}
		bump((value) => value + 1);
	};
	const cancel = () => {
		const before = start.current;
		start.current = null;
		if (before !== null) publish(before);
	};
	const apply = (change: Change) => {
		preview(change);
		finish();
	};
	const undo = () => {
		cancel();
		const before = past.current.pop();
		if (before !== undefined) {
			future.current.push(current.current);
			publish(before);
		}
		bump((value) => value + 1);
	};
	const redo = () => {
		cancel();
		const after = future.current.pop();
		if (after !== undefined) {
			past.current.push(current.current);
			publish(after);
		}
		bump((value) => value + 1);
	};
	return {
		doc,
		begin,
		preview,
		finish,
		cancel,
		apply,
		undo,
		redo,
		edits: past.current.length,
		canRedo: future.current.length > 0,
		cancelledPointer,
	};
}
type Editor = ReturnType<typeof useDocument>;

/** what the foot of the `hint` take reads: the gesture under the pointer */
interface Hint {
	name: string;
	unit: number;
	kind: "label" | "field" | "scrub" | "handle";
}
type Reach = "shared" | "local";

interface RowContext {
	editor: Editor;
	/** the rows' hover reaches onto the canvas: every use, or the one selected */
	onReach: (reach: Reach | null) => void;
	onHint: (hint: Hint | null) => void;
	onAxis: (axis: Axis | null) => void;
}

/**
 * A number on the rail: the shipped Row with its label scrub, the shipped
 * NumField with its arrows. Scrubbing previews inside one transaction and the
 * pointer letting go closes it; Escape mid-scrub restores the value and eats
 * the rest of the drag. `unit` is what one step is worth.
 */
function NumberRow({
	name,
	value,
	unit,
	limit,
	readout = "px",
	changed,
	reach,
	faint = false,
	axis,
	change,
	context,
	after,
}: {
	name: string;
	value: number;
	unit: number;
	limit: number;
	readout?: string;
	changed: boolean;
	reach: Reach;
	faint?: boolean;
	axis?: Axis;
	change: (value: number) => Change;
	context: RowContext;
	after?: ReactNode;
}) {
	const { editor, onReach, onHint, onAxis } = context;
	const held = useRef<{ from: number; total: number; dead: boolean } | null>(null);
	const over = useRef(false);
	// the shipped field blurs on Escape and its blur still commits the draft; the wrapper hears Escape first and drops that commit
	const discard = useRef(false);
	const live = useRef({ editor, change, value, onHint });
	live.current = { editor, change, value, onHint };
	const clamp = (next: number) => Math.min(limit, Math.max(0, Math.round(next)));
	const hint = (kind: Hint["kind"]) => onHint({ name, unit, kind });
	useEffect(() => {
		const escape = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || held.current === null) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			held.current.dead = true;
			live.current.editor.cancelledPointer.current = true;
			live.current.editor.cancel();
			live.current.onHint({ name, unit, kind: "label" });
		};
		window.addEventListener("keydown", escape, true);
		return () => window.removeEventListener("keydown", escape, true);
	}, [name, unit]);
	return (
		<div
			className={cn("oe-number", changed && "oe-changed")}
			data-number={name}
			onPointerEnter={() => {
				over.current = true;
				onReach(reach);
				if (axis !== undefined) onAxis(axis);
				hint("label");
			}}
			onPointerLeave={() => {
				over.current = false;
				if (held.current !== null) return;
				onReach(null);
				onAxis(null);
				onHint(null);
			}}
			onFocusCapture={() => hint("field")}
			onBlurCapture={() => {
				if (over.current) hint("label");
				else onHint(null);
			}}
			onKeyDownCapture={(event) => {
				if (event.key === "Escape" && event.target instanceof HTMLInputElement) discard.current = true;
			}}
		>
			<Row
				name={name}
				changed={changed}
				onScrub={(units) => {
					if (held.current === null) {
						held.current = { from: live.current.value, total: 0, dead: false };
						editor.begin();
						hint("scrub");
					}
					if (held.current.dead) return;
					held.current.total += units;
					editor.preview(change(clamp(held.current.from + held.current.total * unit)));
				}}
				onScrubEnd={() => {
					const scrub = held.current;
					held.current = null;
					if (scrub === null || scrub.dead) return;
					editor.finish();
					if (scrub.total !== 0) editor.cancelledPointer.current = true;
					hint("label");
				}}
			>
				<NumField
					value={String(value)}
					readout={readout}
					ok
					faint={faint}
					changed={changed}
					onCommit={(typed) => {
						if (discard.current) {
							discard.current = false;
							return;
						}
						const number = Number(typed.trim().replace(/(px|%)$/, ""));
						if (Number.isFinite(number)) editor.apply(change(clamp(number)));
					}}
					onStep={(units) => editor.apply(change(clamp(value + units * unit)))}
				/>
				{after}
			</Row>
		</div>
	);
}

/* ---------- the prototype ---------- */

export function OriginEdits({ take, initial = "rest" }: { take: OriginTake; initial?: "rest" | "uses" | "changed" }) {
	const editor = useDocument(initial === "changed");
	const [selection, setSelection] = useState<Selection>({ frame: "cart", target: "button" });
	const [uses, setUses] = useState(initial === "uses");
	const [reach, setReach] = useState<Reach | null>(null);
	const [axis, setAxis] = useState<Axis | null>(null);
	const [hint, setHint] = useState<Hint | null>(null);
	const [named, setNamed] = useState<FrameName | null>(null);
	const [measured, setMeasured] = useState({ width: 204, height: 44 });
	const selectedElement = useRef<HTMLDivElement | null>(null);
	const scroll = useRef<HTMLDivElement | null>(null);
	const shared = selection.target === "button";
	const local = editor.doc.frames[selection.frame];
	const fileLocal = FILE.frames[selection.frame];
	const current = useRef(editor);
	current.current = editor;
	const context: RowContext = { editor, onReach: setReach, onHint: setHint, onAxis: setAxis };
	const select = (frame: FrameName, target: Target) => {
		editor.cancel();
		setSelection({ frame, target });
		setAxis(null);
		setReach(null);
		setUses(false);
	};
	useEffect(() => {
		const key = (event: KeyboardEvent) => {
			if (event.target instanceof HTMLElement && event.target.closest("input,textarea,[contenteditable]")) return;
			if (event.key === "Escape") {
				current.current.cancel();
				setUses(false);
				setAxis(null);
			}
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
				event.preventDefault();
				if (event.shiftKey) current.current.redo();
				else current.current.undo();
			}
		};
		window.addEventListener("keydown", key);
		return () => window.removeEventListener("keydown", key);
	}, []);
	useLayoutEffect(() => {
		const element = selectedElement.current;
		if (element === null) return;
		const read = () => setMeasured({ width: element.offsetWidth, height: element.offsetHeight });
		read();
		const observer = new ResizeObserver(read);
		observer.observe(element);
		return () => observer.disconnect();
	}, [selection, editor.doc]);
	const updateShared =
		(key: Numeric, value: number): Change =>
		(doc) => ({ ...doc, shared: { ...doc.shared, [key]: value } });
	const updateLocal =
		(key: keyof LocalFrame, value: string | number): Change =>
		(doc) => ({
			...doc,
			frames: { ...doc.frames, [selection.frame]: { ...doc.frames[selection.frame], [key]: value } },
		});
	const reveal = (frame: FrameName) => {
		scroll.current
			?.querySelector<HTMLElement>(`[data-demo-frame="${frame}"]`)
			?.scrollIntoView({ block: "nearest", inline: "center", behavior: "instant" });
	};
	/** the shipped rule steps spacing by 4px; the `dots` take steps everything by 1px */
	const spacingUnit = take === "dots" ? 1 : 4;
	const words = shared ? local.label : local.title;
	const fileWords = shared ? fileLocal.label : fileLocal.title;

	const usesList = (
		<div className="oe-uses" aria-label="Button uses">
			{NAMES.map((frame) => (
				<button key={frame} type="button" onClick={() => reveal(frame)}>
					<span className={cn("oe-dot", frame === selection.frame && "oe-on")} />
					<span>{frame}</span>
					<span className="oe-use-label">{editor.doc.frames[frame].label}</span>
				</button>
			))}
		</div>
	);
	const reachCount = (
		<button
			type="button"
			className={cn("oe-reach", FAINT)}
			aria-label="Show Button uses"
			aria-expanded={uses}
			onClick={() => setUses((value) => !value)}
		>
			4 uses <span className="oe-caret">{uses ? "⌃" : "⌄"}</span>
		</button>
	);
	const tag = shared ? "button" : selection.target === "heading" ? "h1" : "main";
	const head = (
		<div className="oe-head">
			<span className={cn("flex min-w-0 items-center gap-1 truncate", VALUE)}>
				<button type="button" className="text-muted hover:text-text" onClick={() => select(selection.frame, "frame")}>
					{selection.frame}
				</button>
				<span className="text-muted/30">/</span>
				<span className="text-thread">{shared ? "Button" : tag}</span>
			</span>
			{take === "head" && shared ? reachCount : <span className={cn("ml-auto shrink-0", FAINT)}>{tag}</span>}
		</div>
	);
	const originLine =
		take === "dots" ? (
			<div className="oe-origin" onPointerLeave={() => setNamed(null)}>
				<span className={VALUE}>Button</span>
				<span className={cn("oe-named", FAINT)}>{named ?? ""}</span>
				<span className="oe-dots" aria-label="Button uses">
					{NAMES.map((frame) => (
						<button
							key={frame}
							type="button"
							aria-label={frame}
							className={cn("oe-dot", frame === selection.frame && "oe-on")}
							onPointerEnter={() => setNamed(frame)}
							onFocus={() => setNamed(frame)}
							onClick={() => reveal(frame)}
						/>
					))}
				</span>
			</div>
		) : take === "hint" ? (
			<div className="oe-origin">
				<span className={VALUE}>Button</span>
				{reachCount}
			</div>
		) : null;
	const discardWords = useRef(false);
	const labelRow = (
		<div
			className={cn("oe-text", words !== fileWords && "oe-changed")}
			onKeyDownCapture={(event) => {
				if (event.key === "Escape" && event.target instanceof HTMLInputElement) discardWords.current = true;
			}}
			onPointerEnter={() => {
				setReach("local");
				setHint({ name: shared ? "label" : "text", unit: 0, kind: "label" });
			}}
			onPointerLeave={() => {
				setReach(null);
				setHint(null);
			}}
			onFocusCapture={() => setHint({ name: shared ? "label" : "text", unit: 0, kind: "field" })}
			onBlurCapture={() => setHint(null)}
		>
			<Row name={shared ? "label" : "text"} changed={words !== fileWords}>
				<TextField
					key={selection.frame + selection.target}
					value={words}
					ok
					changed={words !== fileWords}
					onCommit={(value) => {
						if (discardWords.current) {
							discardWords.current = false;
							return;
						}
						editor.apply(updateLocal(shared ? "label" : "title", value));
					}}
				/>
			</Row>
		</div>
	);
	const widthMode = editor.doc.shared.width === null ? "fill" : "fixed";
	const sharedRows = (
		<>
			<Section name="size">
				<NumberRow
					name="width"
					value={editor.doc.shared.width ?? measured.width}
					unit={1}
					limit={LIMITS.width}
					changed={editor.doc.shared.width !== null}
					reach="shared"
					faint={editor.doc.shared.width === null}
					change={(value) => updateShared("width", value)}
					context={context}
					after={
						<Menu
							label="Width behavior"
							className="w-13 flex-none"
							ok
							changed={widthMode !== "fill"}
							current={{ token: widthMode, name: widthMode }}
							options={[
								{ token: "fill", name: "fill" },
								{ token: "fixed", name: "fixed" },
							]}
							onPick={(value) =>
								editor.apply((doc) => ({
									...doc,
									shared: { ...doc.shared, width: value === "fill" ? null : measured.width },
								}))
							}
						/>
					}
				/>
				<Row name="height" ok={false}>
					<NumField value="content" readout={`${measured.height}px`} ok={false} onCommit={() => undefined} />
				</Row>
			</Section>
			<Section name="spacing">
				<NumberRow
					name="padding-inline"
					value={editor.doc.shared.px}
					unit={spacingUnit}
					limit={LIMITS.px}
					changed={editor.doc.shared.px !== FILE.shared.px}
					reach="shared"
					axis="px"
					change={(value) => updateShared("px", value)}
					context={context}
				/>
				<NumberRow
					name="padding-block"
					value={editor.doc.shared.py}
					unit={spacingUnit}
					limit={LIMITS.py}
					changed={editor.doc.shared.py !== FILE.shared.py}
					reach="shared"
					axis="py"
					change={(value) => updateShared("py", value)}
					context={context}
				/>
			</Section>
			<Section name="appearance">
				<div className="oe-menu-row" onPointerEnter={() => setReach("shared")} onPointerLeave={() => setReach(null)}>
					<Row name="background" changed={editor.doc.shared.fill !== FILE.shared.fill}>
						<Menu
							label="Button fill"
							ok
							changed={editor.doc.shared.fill !== FILE.shared.fill}
							current={COLORS.find((color) => color.token === editor.doc.shared.fill) ?? BRAND}
							options={COLORS}
							onPick={(fill) => {
								if (fill !== null) editor.apply((doc) => ({ ...doc, shared: { ...doc.shared, fill } }));
							}}
						/>
					</Row>
				</div>
				<NumberRow
					name="border-radius"
					value={editor.doc.shared.radius}
					unit={1}
					limit={LIMITS.radius}
					changed={editor.doc.shared.radius !== FILE.shared.radius}
					reach="shared"
					change={(value) => updateShared("radius", value)}
					context={context}
				/>
				<NumberRow
					name="opacity"
					value={editor.doc.shared.opacity}
					unit={1}
					limit={LIMITS.opacity}
					readout="%"
					changed={editor.doc.shared.opacity !== FILE.shared.opacity}
					reach="shared"
					change={(value) => updateShared("opacity", value)}
					context={context}
				/>
			</Section>
			<Section name="text">
				<NumberRow
					name="font-size"
					value={editor.doc.shared.fontSize}
					unit={1}
					limit={LIMITS.fontSize}
					changed={editor.doc.shared.fontSize !== FILE.shared.fontSize}
					reach="shared"
					change={(value) => updateShared("fontSize", value)}
					context={context}
				/>
			</Section>
		</>
	);
	const localRows = (
		<>
			<Section name="text">{labelRow}</Section>
			<Section name={selection.target === "frame" ? "spacing" : "text"}>
				{selection.target === "frame" ? (
					<NumberRow
						name="padding"
						value={local.padding}
						unit={spacingUnit}
						limit={48}
						changed={local.padding !== fileLocal.padding}
						reach="local"
						change={(value) => updateLocal("padding", value)}
						context={context}
					/>
				) : (
					<NumberRow
						name="font-size"
						value={local.fontSize}
						unit={1}
						limit={48}
						changed={local.fontSize !== fileLocal.fontSize}
						reach="local"
						change={(value) => updateLocal("fontSize", value)}
						context={context}
					/>
				)}
			</Section>
		</>
	);
	const edits = editor.edits === 0 ? "" : `${editor.edits} ${editor.edits === 1 ? "edit" : "edits"}`;
	const foot = (
		<div className="oe-foot">
			<span className={cn("oe-status", FAINT)} aria-live="polite">
				{take === "hint" ? hintText(hint, edits) : edits}
			</span>
			<button type="button" aria-label="Undo edit" title="Undo · ⌘Z" disabled={editor.edits === 0} onClick={editor.undo}>
				↶
			</button>
			<button type="button" aria-label="Redo edit" title="Redo · ⇧⌘Z" disabled={!editor.canRedo} onClick={editor.redo}>
				↷
			</button>
		</div>
	);
	const rail = (
		<div className="oe-rail">
			{head}
			{shared && take === "head" && uses ? usesList : null}
			<div className="oe-rail-scroll">
				{shared ? (
					<>
						{originLine}
						{take === "hint" && uses ? usesList : null}
						<Section name={selection.frame} aside={<span className={cn("ml-auto", FAINT)}>this use</span>}>
							{labelRow}
						</Section>
						{sharedRows}
					</>
				) : (
					localRows
				)}
			</div>
			{foot}
		</div>
	);

	return (
		<div className="oe-prototype" data-take={take}>
			<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="100%">
				<div
					className="h-full"
					onPointerDownCapture={() => {
						editor.cancelledPointer.current = false;
					}}
					onClickCapture={(event) => {
						if (editor.cancelledPointer.current) {
							editor.cancelledPointer.current = false;
							event.preventDefault();
							event.stopPropagation();
						}
					}}
				>
					<CanvasChrome
						pages={[{ name: "app", frames: NAMES, open: true, active: true }]}
						selected={selection.frame}
						holding={shared ? NAMES : []}
						tool="edit"
						rail={rail}
					>
						<div className="oe-canvas-top">
							<span>app</span>
							<span>4 frames</span>
							<span className="oe-canvas-note">edits stay in memory and reset on reload</span>
						</div>
						<div className="oe-canvas-scroll" ref={scroll}>
							<div className="oe-frames">
								{NAMES.map((frame, index) => {
									const details = editor.doc.frames[frame];
									const selected = frame === selection.frame;
									const style: CSSProperties = {
										padding: `${editor.doc.shared.py}px ${editor.doc.shared.px}px`,
										borderRadius: editor.doc.shared.radius,
										fontSize: editor.doc.shared.fontSize,
										background: editor.doc.shared.fill,
										opacity: editor.doc.shared.opacity / 100,
										width: editor.doc.shared.width === null ? "100%" : editor.doc.shared.width,
									};
									const affected = shared && !selected && (reach === "shared" || uses || axis !== null);
									return (
										<div key={frame} className="oe-frame-wrap" data-demo-frame={frame}>
											<div className="oe-frame-name">
												<button type="button" className={selected ? "text-thread" : ""} onClick={() => select(frame, "frame")}>
													{frame}
												</button>
												<span>244 × 480</span>
											</div>
											<div
												className={cn("oe-demo", selected && selection.target === "frame" && "oe-selected-frame")}
												style={{ padding: details.padding }}
												onClick={() => select(frame, "frame")}
												onKeyDown={(event) => {
													if (event.key === "Enter" && event.target === event.currentTarget) select(frame, "frame");
												}}
												role="group"
												tabIndex={0}
												aria-label={`${frame} frame`}
											>
												<div className="oe-brand">
													kaffe<span>{frame === "menu" ? "Stockholm" : "←"}</span>
												</div>
												<button
													type="button"
													className={cn("oe-title", selected && selection.target === "heading" && "oe-selected-title")}
													style={{ fontSize: details.fontSize }}
													onClick={(event) => {
														event.stopPropagation();
														select(frame, "heading");
													}}
												>
													{details.title}
												</button>
												{index === 0 ? (
													<div className="oe-menu-grid">
														{["Bryggkaffe", "Havrelatte", "Kanelbulle", "Kardemumma"].map((name, item) => (
															<div key={name}>
																<div className="oe-product-shape" data-item={item} />
																<span>{name}</span>
																<small>{item === 1 ? "49" : "35"} kr</small>
															</div>
														))}
													</div>
												) : index === 2 ? (
													<>
														<div className="oe-receipt-mark">✓</div>
														<p className="oe-copy">
															Vi tar hand om din beställning.
															<br />
															Snart är kaffet klart.
														</p>
														<div className="oe-order-number">#042</div>
													</>
												) : (
													<div className="oe-order-lines">
														{["Bryggkaffe", "Kanelbulle", "Havrelatte"].map((name, item) => (
															<div key={name}>
																<span>{name}</span>
																<span>{[35, 42, 49][item]} kr</span>
															</div>
														))}
													</div>
												)}
												<div className="oe-demo-bottom">
													{index === 1 ? (
														<div className="oe-total">
															<span>Totalt</span>
															<span>126 kr</span>
														</div>
													) : null}
													<div
														className={cn("oe-button-wrap", selected && shared && "oe-held", affected && "oe-affected")}
														ref={selected && shared ? selectedElement : undefined}
														style={{ width: editor.doc.shared.width === null ? "100%" : editor.doc.shared.width }}
													>
														<button
															type="button"
															className="oe-demo-button"
															data-demo-button={frame}
															style={style}
															onClick={(event) => {
																event.stopPropagation();
																select(frame, "button");
															}}
														>
															{details.label}
														</button>
														{selected && shared ? (
															<EdgeHandles
																editor={editor}
																axis={axis}
																onAxis={setAxis}
																onHint={(edge) =>
																	setHint(
																		edge === null
																			? null
																			: {
																					name: edge === "t" || edge === "b" ? "padding-block" : "padding-inline",
																					unit: 4,
																					kind: "handle",
																				},
																	)
																}
															/>
														) : null}
														{affected ? <span className="oe-affected-name">Button</span> : null}
													</div>
												</div>
											</div>
										</div>
									);
								})}
							</div>
						</div>
					</CanvasChrome>
				</div>
			</SpoolShell>
		</div>
	);
}

function hintText(hint: Hint | null, edits: string): string {
	if (hint === null) return edits === "" ? "" : `${edits} · ⌘z`;
	const keys = hint.unit === 0 ? "" : ` · ↑↓ ${hint.unit} · ⇧ ${hint.unit * 10}`;
	switch (hint.kind) {
		case "label":
			return hint.unit === 0 ? `${hint.name} · click to type` : `${hint.name} · drag${keys}`;
		case "field":
			return `enter commits · esc restores${keys}`;
		case "scrub":
			return `${hint.name} · esc cancels`;
		case "handle":
			return `${hint.name} · pull out · alt 1 · esc`;
	}
}

/** Four handles on the button's edges, each pulling outward to grow the padding on its axis. */
function EdgeHandles({
	editor,
	axis,
	onAxis,
	onHint,
}: {
	editor: Editor;
	axis: Axis | null;
	onAxis: (axis: Axis | null) => void;
	onHint: (edge: Edge | null) => void;
}) {
	const held = useRef<{
		x: number;
		y: number;
		value: number;
		edge: Edge;
		scale: number;
		moved: boolean;
		pointer: number;
		node: HTMLButtonElement;
	} | null>(null);
	const current = useRef({ editor, onAxis, onHint });
	current.current = { editor, onAxis, onHint };
	useEffect(() => {
		const escape = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || held.current === null) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			current.current.editor.cancelledPointer.current = true;
			const drag = held.current;
			held.current = null;
			if (drag.node.hasPointerCapture(drag.pointer)) drag.node.releasePointerCapture(drag.pointer);
			current.current.editor.cancel();
			current.current.onAxis(null);
			current.current.onHint(null);
		};
		window.addEventListener("keydown", escape, true);
		return () => window.removeEventListener("keydown", escape, true);
	}, []);
	const axisOf = (edge: Edge): Axis => (edge === "t" || edge === "b" ? "py" : "px");
	const { px, py } = editor.doc.shared;
	return (
		<>
			{axis === "px" ? (
				<>
					<span className="oe-band oe-band-l" style={{ width: px }} />
					<span className="oe-band oe-band-r" style={{ width: px }} />
				</>
			) : null}
			{axis === "py" ? (
				<>
					<span className="oe-band oe-band-t" style={{ height: py }} />
					<span className="oe-band oe-band-b" style={{ height: py }} />
				</>
			) : null}
			{(["t", "r", "b", "l"] as const).map((edge) => (
				<button
					key={edge}
					type="button"
					className={cn("oe-handle", `oe-handle-${edge}`, axis === axisOf(edge) && "oe-lit")}
					aria-label={`Drag ${axisOf(edge) === "px" ? "horizontal" : "vertical"} padding`}
					onPointerEnter={() => {
						onAxis(axisOf(edge));
						onHint(edge);
					}}
					onPointerLeave={() => {
						if (held.current !== null) return;
						onAxis(null);
						onHint(null);
					}}
					onClick={(event) => event.stopPropagation()}
					onPointerDown={(event) => {
						if (event.button !== 0) return;
						event.preventDefault();
						event.stopPropagation();
						event.currentTarget.focus({ preventScroll: true });
						const parent = event.currentTarget.parentElement;
						const scale = parent === null ? 1 : parent.getBoundingClientRect().width / parent.offsetWidth;
						event.currentTarget.setPointerCapture(event.pointerId);
						held.current = {
							x: event.clientX,
							y: event.clientY,
							value: editor.doc.shared[axisOf(edge)],
							edge,
							scale,
							moved: false,
							pointer: event.pointerId,
							node: event.currentTarget,
						};
						editor.begin();
					}}
					onPointerMove={(event) => {
						const drag = held.current;
						if (drag === null) return;
						// outward is positive on every edge
						const raw =
							drag.edge === "t"
								? drag.y - event.clientY
								: drag.edge === "b"
									? event.clientY - drag.y
									: drag.edge === "l"
										? drag.x - event.clientX
										: event.clientX - drag.x;
						const delta = raw / drag.scale;
						if (!drag.moved && Math.abs(delta) < 3) return;
						drag.moved = true;
						const step = event.altKey ? 1 : 4;
						const key = axisOf(drag.edge);
						const value = Math.max(0, Math.min(LIMITS[key], Math.round((drag.value + delta) / step) * step));
						editor.preview((doc) => ({ ...doc, shared: { ...doc.shared, [key]: value } }));
					}}
					onPointerUp={(event) => {
						const drag = held.current;
						if (drag === null) return;
						if (drag.moved) editor.cancelledPointer.current = true;
						held.current = null;
						if (event.currentTarget.hasPointerCapture(drag.pointer)) event.currentTarget.releasePointerCapture(drag.pointer);
						editor.finish();
						if (!drag.moved) {
							const input = document.querySelector<HTMLInputElement>(
								`[data-number="${axisOf(drag.edge) === "px" ? "padding-inline" : "padding-block"}"] input`,
							);
							input?.focus();
							input?.select();
						}
					}}
					onPointerCancel={() => {
						held.current = null;
						editor.cancel();
						onAxis(null);
					}}
					onLostPointerCapture={() => {
						if (held.current !== null) {
							held.current = null;
							editor.cancel();
							onAxis(null);
						}
					}}
				/>
			))}
		</>
	);
}
