import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "shared/lib/utils";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { BOX, FAINT, Menu, Row, Section, VALUE, type Option } from "shared/ui/spool/properties-fields";
import { SpoolShell } from "shared/ui/spool/shell";
import "shared/ui/explore/properties-map/shared-edits.css";

/**
 * Five separate, disposable comparisons of shared editing inside Spool.
 * Existing Row, Section, Menu and field styles are the visual baseline.
 * Every take uses the same in-memory fixture and real browser layout. The four
 * rendered buttons share one style object; labels belong to their call sites.
 * No source attribution, source writes, conflict handling or token edits are
 * proved here. This is an asset for the still-open editing-rules discussion.
 */
export type SharedEditTake = "origin" | "sections" | "fold" | "focus" | "nearby";
type FrameName = "menu" | "cart" | "receipt" | "orders";
type Target = "button" | "heading" | "frame";
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
const INITIAL: Document = {
	shared: { px: 16, py: 12, radius: 6, fontSize: 14, width: null, opacity: 100, fill: "#f5391a" },
	frames: {
		menu: { label: "Till kassan", title: "Vad får det lov att vara?", padding: 20, fontSize: 24 },
		cart: { label: "Betala", title: "Din beställning", padding: 20, fontSize: 24 },
		receipt: { label: "Beställ igen", title: "Tack för idag.", padding: 20, fontSize: 24 },
		orders: { label: "Se menyn", title: "Dina beställningar", padding: 20, fontSize: 24 },
	},
};
const COLORS: readonly Option[] = [
	{ token: "#f5391a", name: "brand", swatch: "#f5391a", value: "#f5391a" },
	{ token: "#35715b", name: "forest", swatch: "#35715b", value: "#35715b" },
	{ token: "#465f97", name: "blue", swatch: "#465f97", value: "#465f97" },
	{ token: "#5c5550", name: "stone", swatch: "#5c5550", value: "#5c5550" },
];

function useDocument() {
	const [doc, setDoc] = useState(INITIAL);
	const current = useRef(doc);
	const start = useRef<Document | null>(null);
	const past = useRef<Document[]>([]);
	const future = useRef<Document[]>([]);
	const cancelledPointer = useRef(false);
	const [version, setVersion] = useState(0);
	const publish = (next: Document) => {
		current.current = next;
		setDoc(next);
		setVersion((value) => value + 1);
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
		setVersion((value) => value + 1);
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
	};
	const redo = () => {
		cancel();
		const after = future.current.pop();
		if (after !== undefined) {
			past.current.push(current.current);
			publish(after);
		}
	};
	return {
		doc,
		version,
		begin,
		preview,
		finish,
		cancel,
		apply,
		undo,
		redo,
		canUndo: past.current.length > 0,
		canRedo: future.current.length > 0,
		cancelledPointer,
	};
}
type Editor = ReturnType<typeof useDocument>;

/** Prototype-only input lifecycle, wearing the existing field primitives. */
function NumberRow({
	name,
	value,
	step = 1,
	max = 800,
	unit = "px",
	editor,
	change,
	onHover,
	after,
}: {
	name: string;
	value: number;
	step?: number;
	max?: number;
	unit?: string;
	editor: Editor;
	change: (value: number) => Change;
	onHover?: ((on: boolean) => void) | undefined;
	after?: ReactNode;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const draftRef = useRef<string | null>(null);
	const drag = useRef<{ x: number; value: number; moved: boolean; pointer: number; node: HTMLDivElement } | null>(
		null,
	);
	const live = useRef({ editor, change });
	live.current = { editor, change };
	const clamp = (next: number) => Math.min(max, Math.max(0, Math.round(next * 10) / 10));
	useEffect(() => {
		const cancel = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || drag.current === null) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			live.current.editor.cancelledPointer.current = true;
			const held = drag.current;
			drag.current = null;
			if (held.node.hasPointerCapture(held.pointer)) held.node.releasePointerCapture(held.pointer);
			live.current.editor.cancel();
		};
		window.addEventListener("keydown", cancel, true);
		return () => {
			window.removeEventListener("keydown", cancel, true);
		};
	}, []);
	const finishDraft = () => {
		const typed = draftRef.current;
		draftRef.current = null;
		setDraft(null);
		if (typed === null || typed.trim() === "") return;
		const number = Number(typed);
		if (Number.isFinite(number)) editor.apply(change(clamp(number)));
	};
	const end = (event: ReactPointerEvent<HTMLDivElement>, cancel: boolean) => {
		const held = drag.current;
		if (held === null) return;
		drag.current = null;
		if (event.currentTarget.hasPointerCapture(held.pointer)) event.currentTarget.releasePointerCapture(held.pointer);
		if (cancel) editor.cancel();
		else editor.finish();
		onHover?.(false);
	};
	return (
		<div
			className="se-number"
			data-number={name}
			tabIndex={-1}
			onPointerEnter={() => onHover?.(true)}
			onPointerLeave={() => {
				if (drag.current === null) onHover?.(false);
			}}
			onPointerDown={(event) => {
				if (event.button !== 0 || !(event.target instanceof HTMLElement) || event.target.closest("input,button"))
					return;
				event.preventDefault();
				event.currentTarget.focus({ preventScroll: true });
				event.currentTarget.setPointerCapture(event.pointerId);
				drag.current = {
					x: event.clientX,
					value,
					moved: false,
					pointer: event.pointerId,
					node: event.currentTarget,
				};
				editor.begin();
			}}
			onPointerMove={(event) => {
				const held = drag.current;
				if (held === null || held.pointer !== event.pointerId) return;
				const delta = event.clientX - held.x;
				if (!held.moved && Math.abs(delta) < 3) return;
				held.moved = true;
				editor.preview(
					change(
						clamp(held.value + Math.round(delta / 3) * (event.altKey ? 1 : step) * (event.shiftKey ? 10 : 1)),
					),
				);
			}}
			onPointerUp={(event) => end(event, false)}
			onPointerCancel={(event) => end(event, true)}
			onLostPointerCapture={(event) => {
				if (drag.current !== null) end(event, true);
			}}
		>
			<Row name={name}>
				<label className={cn(BOX, "flex min-w-0 flex-1 items-center gap-1 px-1")}>
					<input
						aria-label={name}
						inputMode="decimal"
						className={cn(VALUE, "min-w-0 flex-1 bg-transparent outline-none")}
						value={draft ?? String(value)}
						onFocus={(event) => event.currentTarget.select()}
						onChange={(event) => {
							draftRef.current = event.target.value;
							setDraft(event.target.value);
						}}
						onBlur={finishDraft}
						onKeyDown={(event) => {
							event.stopPropagation();
							if (event.key === "Escape") {
								draftRef.current = null;
								setDraft(null);
								event.currentTarget.blur();
							}
							if (event.key === "Enter") {
								finishDraft();
								event.currentTarget.blur();
							}
							if (event.key === "ArrowUp" || event.key === "ArrowDown") {
								event.preventDefault();
								const typed = draftRef.current === null ? value : Number(draftRef.current);
								const base = Number.isFinite(typed) ? typed : value;
								draftRef.current = null;
								setDraft(null);
								editor.apply(
									change(clamp(base + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1))),
								);
							}
						}}
					/>
					<span className={FAINT}>{unit}</span>
				</label>
				{after}
			</Row>
		</div>
	);
}

function Words({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
	const [draft, setDraft] = useState(value);
	const current = useRef(value);
	useEffect(() => {
		setDraft(value);
		current.current = value;
	}, [value]);
	return (
		<input
			aria-label="label"
			className={cn(BOX, VALUE, "h-6 w-full min-w-0 px-1 bg-transparent outline-none")}
			value={draft}
			onChange={(event) => {
				current.current = event.target.value;
				setDraft(event.target.value);
			}}
			onBlur={() => {
				if (current.current !== value) onCommit(current.current);
			}}
			onKeyDown={(event) => {
				event.stopPropagation();
				if (event.key === "Enter") event.currentTarget.blur();
				if (event.key === "Escape") {
					current.current = value;
					setDraft(value);
					event.currentTarget.blur();
				}
			}}
		/>
	);
}

export function SharedEdits({
	take,
	initial = "rest",
}: {
	take: SharedEditTake;
	initial?: "rest" | "uses" | "editing" | "open";
}) {
	const editor = useDocument();
	const [selection, setSelection] = useState<Selection>({ frame: "cart", target: "button" });
	const [uses, setUses] = useState(initial === "uses");
	const [expanded, setExpanded] = useState(initial === "open");
	const [editing, setEditing] = useState(initial === "editing");
	const [nearExpanded, setNearExpanded] = useState(false);
	const [hover, setHover] = useState<"px" | "py" | null>(null);
	const [showRail, setShowRail] = useState(false);
	const [measurement, setMeasurement] = useState({ width: 204, height: 44 });
	const selectedElement = useRef<HTMLDivElement | null>(null);
	const scroll = useRef<HTMLDivElement | null>(null);
	const shared = selection.target === "button";
	const writable = shared && (take !== "focus" || editing) && (take !== "fold" || expanded);
	const local = editor.doc.frames[selection.frame];
	const current = useRef({ editor, selection });
	current.current = { editor, selection };
	const select = (frame: FrameName, target: Target) => {
		editor.cancel();
		setSelection({ frame, target });
		setHover(null);
		setUses(false);
		if (take === "focus") setEditing(false);
	};
	useEffect(() => {
		const key = (event: KeyboardEvent) => {
			if (event.target instanceof HTMLElement && event.target.closest("input,textarea,[contenteditable]")) return;
			if (event.key === "Escape") {
				current.current.editor.cancel();
				setUses(false);
				setHover(null);
			}
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
				event.preventDefault();
				if (event.shiftKey) current.current.editor.redo();
				else current.current.editor.undo();
			}
		};
		window.addEventListener("keydown", key);
		return () => window.removeEventListener("keydown", key);
	}, []);
	useLayoutEffect(() => {
		const element = selectedElement.current;
		if (element === null) return;
		const read = () => setMeasurement({ width: element.offsetWidth, height: element.offsetHeight });
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
		const element = scroll.current?.querySelector<HTMLElement>(`[data-demo-frame="${frame}"]`);
		element?.scrollIntoView({ block: "nearest", inline: "center", behavior: "instant" });
	};
	const usesList = (
		<div className="se-uses" aria-label="Button uses">
			{NAMES.map((frame) => (
				<button key={frame} type="button" onClick={() => reveal(frame)}>
					<span className={cn("se-use-dot", frame === selection.frame && "se-on")} />
					<span>{frame}</span>
					<span className="se-use-label">{editor.doc.frames[frame].label}</span>
					<span>↗</span>
				</button>
			))}
		</div>
	);
	const reach = (
		<button
			type="button"
			className="se-reach"
			aria-label="Show Button uses"
			aria-expanded={uses}
			onClick={() => setUses((value) => !value)}
		>
			4 frames <span>{uses ? "⌃" : "⌄"}</span>
		</button>
	);
	const origin = (
		<div className="se-origin">
			<span>Button</span>
			{reach}
		</div>
	);
	const localWords = (
		<Row name="label">
			<Words
				key={selection.frame + selection.target}
				value={shared ? local.label : local.title}
				onCommit={(value) => editor.apply(updateLocal(shared ? "label" : "title", value))}
			/>
		</Row>
	);
	const sharedRows = (
		<>
			<Section name="size">
				<NumberRow
					name="width"
					value={editor.doc.shared.width ?? measurement.width}
					editor={editor}
					change={(value) => updateShared("width", value)}
					after={
						<Menu
							label="Width behavior"
							className="w-14 flex-none"
							ok
							current={{
								token: editor.doc.shared.width === null ? "fill" : "fixed",
								name: editor.doc.shared.width === null ? "fill" : "fixed",
							}}
							options={[
								{ token: "fill", name: "fill" },
								{ token: "fixed", name: "fixed" },
							]}
							onPick={(value) =>
								editor.apply((doc) => ({
									...doc,
									shared: { ...doc.shared, width: value === "fill" ? null : measurement.width },
								}))
							}
						/>
					}
				/>
				<Row name="height">
					<span className={cn(VALUE, "flex-1 px-1 text-muted")}>content</span>
					<span className={FAINT}>{measurement.height}px</span>
				</Row>
			</Section>
			<Section name="spacing">
				<NumberRow
					name="padding x"
					value={editor.doc.shared.px}
					step={4}
					max={64}
					editor={editor}
					change={(value) => updateShared("px", value)}
					onHover={(on) => setHover(on ? "px" : null)}
				/>
				<NumberRow
					name="padding y"
					value={editor.doc.shared.py}
					step={4}
					max={48}
					editor={editor}
					change={(value) => updateShared("py", value)}
					onHover={(on) => setHover(on ? "py" : null)}
				/>
			</Section>
			<Section name="appearance">
				<Row name="fill">
					<Menu
						label="Button fill"
						ok
						current={
							COLORS.find((color) => color.token === editor.doc.shared.fill) ?? {
								token: "#f5391a",
								name: "brand",
								swatch: "#f5391a",
							}
						}
						options={COLORS}
						onPick={(fill) => {
							if (fill !== null) editor.apply((doc) => ({ ...doc, shared: { ...doc.shared, fill } }));
						}}
					/>
				</Row>
				<NumberRow
					name="radius"
					value={editor.doc.shared.radius}
					max={48}
					editor={editor}
					change={(value) => updateShared("radius", value)}
				/>
				<NumberRow
					name="opacity"
					value={editor.doc.shared.opacity}
					max={100}
					unit="%"
					editor={editor}
					change={(value) => updateShared("opacity", value)}
				/>
			</Section>
			<Section name="type">
				<NumberRow
					name="font size"
					value={editor.doc.shared.fontSize}
					max={40}
					editor={editor}
					change={(value) => updateShared("fontSize", value)}
				/>
			</Section>
		</>
	);
	const localRows = (
		<>
			<Section name="content">{localWords}</Section>
			<Section name={selection.target === "frame" ? "spacing" : "type"}>
				{selection.target === "frame" ? (
					<NumberRow
						name="padding"
						value={local.padding}
						max={48}
						step={4}
						editor={editor}
						change={(value) => updateLocal("padding", value)}
					/>
				) : (
					<NumberRow
						name="font size"
						value={local.fontSize}
						max={48}
						editor={editor}
						change={(value) => updateLocal("fontSize", value)}
					/>
				)}
			</Section>
		</>
	);
	const crumbs = (
		<div className="se-crumbs">
			<button type="button" onClick={() => select(selection.frame, "frame")}>
				{selection.frame}
			</button>
			<span>/</span>
			<span className="text-text">{shared ? "Button" : selection.target === "heading" ? "h1" : "main"}</span>
		</div>
	);
	const footer = (
		<div className="se-foot">
			<span aria-live="polite">{editor.canUndo ? "edited" : ""}</span>
			<button
				type="button"
				aria-label="Undo edit"
				title="Undo · ⌘Z"
				disabled={!editor.canUndo}
				onClick={editor.undo}
			>
				↶
			</button>
			<button
				type="button"
				aria-label="Redo edit"
				title="Redo · ⇧⌘Z"
				disabled={!editor.canRedo}
				onClick={editor.redo}
			>
				↷
			</button>
		</div>
	);
	const rail = (
		<div className="se-rail">
			{take === "focus" && editing && shared ? (
				<div className="se-focus-head">
					<button type="button" onClick={() => setEditing(false)}>
						← {selection.frame}
					</button>
					<span>Button</span>
				</div>
			) : (
				crumbs
			)}
			<div className="se-rail-scroll">
				{!shared ? (
					localRows
				) : (
					<>
						{take === "origin" || take === "nearby" ? (
							<>
								{origin}
								{uses ? usesList : null}
								<Section name="this use">{localWords}</Section>
								{sharedRows}
							</>
						) : null}
						{take === "sections" ? (
							<>
								<Section name={selection.frame} aside={<span className={cn(FAINT, "ml-auto")}>this use</span>}>
									{localWords}
								</Section>
								<div className="se-owner-section">
									{origin}
									{uses ? usesList : null}
									<div className="se-owned-rows">{sharedRows}</div>
								</div>
							</>
						) : null}
						{take === "fold" ? (
							<>
								<Section name="this use">{localWords}</Section>
								<button
									type="button"
									className="se-fold"
									aria-expanded={expanded}
									onClick={() => setExpanded((value) => !value)}
								>
									<span>{expanded ? "⌄" : "›"}</span>
									<span>Button</span>
									<span className="se-fold-count">4 frames</span>
								</button>
								{expanded ? (
									<>
										{sharedRows}
										<div className="se-fold-uses">{reach}</div>
										{uses ? usesList : null}
									</>
								) : (
									<div className="se-summary">
										{editor.doc.shared.px} × {editor.doc.shared.py} padding · {editor.doc.shared.radius}px
										radius
									</div>
								)}
							</>
						) : null}
						{take === "focus" ? (
							editing ? (
								<>
									<div className="se-focus-context">
										<span>Editing the shared component.</span>
										{reach}
									</div>
									{uses ? usesList : null}
									{sharedRows}
								</>
							) : (
								<>
									<Section name="this use">{localWords}</Section>
									<button type="button" className="se-enter" onClick={() => setEditing(true)}>
										<span>Edit Button</span>
										<span>→</span>
									</button>
									<div className="se-entry-context">Layout and appearance in 4 frames.</div>
								</>
							)
						) : null}
					</>
				)}
			</div>
			{footer}
		</div>
	);

	return (
		<div className="se-prototype" data-take={take}>
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
							return;
						}
						if (take !== "nearby" || !(event.target instanceof Element)) return;
						if (event.target.closest('[data-dock-glyph="properties"]')) setShowRail((value) => !value);
					}}
				>
					<CanvasChrome
						pages={[{ name: "app", frames: NAMES, open: true, active: true }]}
						selected={selection.frame}
						holding={shared && (uses || editing) ? NAMES : []}
						tool="edit"
						rail={take === "nearby" && !showRail && shared ? null : rail}
					>
						<div className="se-canvas-top">
							<span>app</span>
							<span>4 frames</span>
						</div>
						<div className="se-canvas-scroll" ref={scroll}>
							<div className="se-frames">
								{NAMES.map((frame, index) => {
									const details = editor.doc.frames[frame];
									const selected = frame === selection.frame;
									const highlighted = shared && (uses || editing || hover !== null);
									const style: CSSProperties = {
										padding: `${editor.doc.shared.py}px ${editor.doc.shared.px}px`,
										borderRadius: editor.doc.shared.radius,
										fontSize: editor.doc.shared.fontSize,
										background: editor.doc.shared.fill,
										opacity: editor.doc.shared.opacity / 100,
										width: editor.doc.shared.width === null ? "100%" : editor.doc.shared.width,
									};
									return (
										<div key={frame} className="se-frame-wrap" data-demo-frame={frame}>
											<div className="se-frame-name">
												<button
													type="button"
													className={selected ? "text-thread" : ""}
													onClick={() => select(frame, "frame")}
												>
													{frame}
												</button>
												<span>244 × 480</span>
											</div>
											<div
												className={cn(
													"se-demo",
													selected && selection.target === "frame" && "se-selected-frame",
												)}
												style={{ padding: details.padding }}
												onClick={() => select(frame, "frame")}
												onKeyDown={(event) => {
													if (event.key === "Enter" && event.target === event.currentTarget)
														select(frame, "frame");
												}}
												role="group"
												tabIndex={0}
												aria-label={`${frame} frame`}
											>
												<div className="se-brand">
													kaffe<span>{frame === "menu" ? "Stockholm" : "←"}</span>
												</div>
												<button
													type="button"
													className={cn(
														"se-title",
														selected && selection.target === "heading" && "se-selected-title",
													)}
													style={{ fontSize: details.fontSize }}
													onClick={(event) => {
														event.stopPropagation();
														select(frame, "heading");
													}}
												>
													{details.title}
												</button>
												{index === 0 ? (
													<div className="se-menu-grid">
														{["Bryggkaffe", "Havrelatte", "Kanelbulle", "Kardemumma"].map(
															(name, item) => (
																<div key={name}>
																	<div className="se-product-shape" data-item={item} />
																	<span>{name}</span>
																	<small>{item === 1 ? "49" : "35"} kr</small>
																</div>
															),
														)}
													</div>
												) : index === 2 ? (
													<>
														<div className="se-receipt-mark">✓</div>
														<p className="se-copy">
															Vi tar hand om din beställning.
															<br />
															Snart är kaffet klart.
														</p>
														<div className="se-order-number">#042</div>
													</>
												) : (
													<div className="se-order-lines">
														{["Bryggkaffe", "Kanelbulle", "Havrelatte"].map((name, item) => (
															<div key={name}>
																<span>{name}</span>
																<span>{[35, 42, 49][item]} kr</span>
															</div>
														))}
													</div>
												)}
												<div className="se-demo-bottom">
													{index === 1 ? (
														<div className="se-total">
															<span>Totalt</span>
															<span>126 kr</span>
														</div>
													) : null}
													<div
														className={cn(
															"se-button-wrap",
															selected && shared && "se-held",
															highlighted && "se-affected",
														)}
														ref={selected && shared ? selectedElement : undefined}
														style={{
															width: editor.doc.shared.width === null ? "100%" : editor.doc.shared.width,
														}}
													>
														<button
															type="button"
															className="se-demo-button"
															data-demo-button={frame}
															style={style}
															onClick={(event) => {
																event.stopPropagation();
																select(frame, "button");
															}}
														>
															{details.label}
														</button>
														{selected && shared && writable ? (
															<PaddingHandles editor={editor} hover={hover} onHover={setHover} />
														) : null}
														{highlighted && !selected ? (
															<span className="se-affected-name">Button</span>
														) : null}
													</div>
												</div>
											</div>
											{selected && shared && take === "nearby" && !showRail ? (
												<div className="se-nearby">
													{origin}
													{uses ? usesList : null}
													<Section name="this use">{localWords}</Section>
													<NumberRow
														name="padding x"
														value={editor.doc.shared.px}
														step={4}
														max={64}
														editor={editor}
														change={(value) => updateShared("px", value)}
														onHover={(on) => setHover(on ? "px" : null)}
													/>
													<NumberRow
														name="padding y"
														value={editor.doc.shared.py}
														step={4}
														max={48}
														editor={editor}
														change={(value) => updateShared("py", value)}
														onHover={(on) => setHover(on ? "py" : null)}
													/>
													<NumberRow
														name="radius"
														value={editor.doc.shared.radius}
														max={48}
														editor={editor}
														change={(value) => updateShared("radius", value)}
													/>
													<button
														type="button"
														className="se-more"
														onClick={() => setNearExpanded((value) => !value)}
													>
														{nearExpanded ? "Fewer properties" : "More properties"}
														<span>{nearExpanded ? "⌃" : "+"}</span>
													</button>
													{nearExpanded ? (
														<>
															<Row name="fill">
																<Menu
																	label="Button fill"
																	ok
																	current={
																		COLORS.find(
																			(color) => color.token === editor.doc.shared.fill,
																		) ?? { token: "#f5391a", name: "brand", swatch: "#f5391a" }
																	}
																	options={COLORS}
																	onPick={(fill) => {
																		if (fill !== null)
																			editor.apply((doc) => ({
																				...doc,
																				shared: { ...doc.shared, fill },
																			}));
																	}}
																/>
															</Row>
															<NumberRow
																name="font size"
																value={editor.doc.shared.fontSize}
																max={40}
																editor={editor}
																change={(value) => updateShared("fontSize", value)}
															/>
														</>
													) : null}
													{footer}
												</div>
											) : null}
										</div>
									);
								})}
							</div>
						</div>
						<div className="se-instruction">
							{!shared
								? "This element belongs to one frame."
								: !writable
									? take === "focus"
										? "Open Edit Button to adjust its shared layout and appearance."
										: "Open Button to adjust the shared properties."
									: "Drag a field label or a padding handle. Click a number to type."}
							<span>Changes reset on reload.</span>
						</div>
					</CanvasChrome>
				</div>
			</SpoolShell>
		</div>
	);
}

function PaddingHandles({
	editor,
	hover,
	onHover,
}: {
	editor: Editor;
	hover: "px" | "py" | null;
	onHover: (value: "px" | "py" | null) => void;
}) {
	const held = useRef<{
		x: number;
		y: number;
		value: number;
		axis: "px" | "py";
		scale: number;
		moved: boolean;
		pointer: number;
		node: HTMLButtonElement;
	} | null>(null);
	const current = useRef(editor);
	current.current = editor;
	useEffect(() => {
		const escape = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || held.current === null) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			current.current.cancelledPointer.current = true;
			const drag = held.current;
			held.current = null;
			if (drag.node.hasPointerCapture(drag.pointer)) drag.node.releasePointerCapture(drag.pointer);
			current.current.cancel();
			onHover(null);
		};
		window.addEventListener("keydown", escape, true);
		return () => window.removeEventListener("keydown", escape, true);
	}, [onHover]);
	return (
		<>
			{hover === "px" ? (
				<>
					<span className="se-pad-band se-pad-left" style={{ width: editor.doc.shared.px }} />
					<span className="se-pad-band se-pad-right" style={{ width: editor.doc.shared.px }} />
				</>
			) : null}
			{hover === "py" ? (
				<>
					<span className="se-pad-band se-pad-top" style={{ height: editor.doc.shared.py }} />
					<span className="se-pad-band se-pad-bottom" style={{ height: editor.doc.shared.py }} />
				</>
			) : null}
			{(["px", "py"] as const).map((axis) => (
				<button
					key={axis}
					type="button"
					className={cn("se-pad-handle", axis === "px" ? "se-pad-x" : "se-pad-y")}
					aria-label={`Drag ${axis === "px" ? "horizontal" : "vertical"} padding`}
					title={`${axis === "px" ? "Horizontal" : "Vertical"} padding · both sides`}
					onPointerEnter={() => onHover(axis)}
					onPointerLeave={() => {
						if (held.current === null) onHover(null);
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
							value: editor.doc.shared[axis],
							axis,
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
						const delta = (axis === "px" ? event.clientX - drag.x : event.clientY - drag.y) / drag.scale;
						if (!drag.moved && Math.abs(delta) < 3) return;
						drag.moved = true;
						const step = event.altKey ? 1 : 4;
						const value = Math.max(
							0,
							Math.min(axis === "px" ? 64 : 48, Math.round((drag.value + delta) / step) * step),
						);
						editor.preview((doc) => ({ ...doc, shared: { ...doc.shared, [axis]: value } }));
					}}
					onPointerUp={(event) => {
						const drag = held.current;
						if (drag === null) return;
						if (drag.moved) editor.cancelledPointer.current = true;
						held.current = null;
						if (event.currentTarget.hasPointerCapture(drag.pointer))
							event.currentTarget.releasePointerCapture(drag.pointer);
						editor.finish();
						if (!drag.moved) {
							const input = document.querySelector<HTMLInputElement>(
								`[data-number="padding ${axis === "px" ? "x" : "y"}"] input`,
							);
							input?.focus();
							input?.select();
						}
					}}
					onPointerCancel={() => {
						held.current = null;
						editor.cancel();
						onHover(null);
					}}
					onLostPointerCapture={() => {
						if (held.current !== null) {
							held.current = null;
							editor.cancel();
							onHover(null);
						}
					}}
				/>
			))}
		</>
	);
}
