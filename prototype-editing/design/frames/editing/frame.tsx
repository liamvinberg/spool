import { memo, type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SleeveModern } from "shared/landing/ui/site/sleeve-guide/modern";
import { cn } from "shared/lib/utils";
import { BOX, Row, Section, VALUE } from "shared/ui/spool/properties-fields";
import "./playground.css";

// A throwaway DOM editing journey over the current SleeveModern landing.
// The copied page is frozen under this editor. Only in-memory DOM styles and
// literal text change; shared reach is the two authored download uses.
const Landing = memo(SleeveModern);
type Snapshot = { node: HTMLElement; style: string; html: string | null }[];
type Transaction = { before: Snapshot; label: string };
const GROUPS = ".sr-app, .sg-product, .sg-source-pair";
const NUMBERS = ["padding-top", "padding-right", "padding-bottom", "padding-left"];
const OPTIONAL = [
	"gap",
	"letter-spacing",
	"border-width",
	"min-height",
	"margin-top",
	"margin-right",
	"margin-bottom",
	"margin-left",
];
function literal(node: HTMLElement): HTMLElement | null {
	if (node.dataset.literal !== undefined) return node;
	return node.querySelector<HTMLElement>(":scope > [data-literal]");
}
function name(node: HTMLElement) {
	if (node.classList.contains("sg-page")) return "Page";
	if (node.classList.contains("sg-hero")) return "Hero";
	if (node.dataset.shared) return "Download button";
	if (node.matches(GROUPS)) return "Demo preview";
	if (node.id) return node.id === "follow-heading" ? "h2" : node.id;
	return node.tagName.toLowerCase();
}
function snapshot(root: HTMLElement): Snapshot {
	return [...root.querySelectorAll<HTMLElement>("[data-edit-node]")].map((node) => ({
		node,
		style: node.style.cssText,
		html: literal(node) === node ? node.innerHTML : null,
	}));
}
function restore(s: Snapshot) {
	for (const entry of s) {
		entry.node.style.cssText = entry.style;
		if (entry.html !== null && entry.node.innerHTML !== entry.html) entry.node.innerHTML = entry.html;
	}
}
function same(a: Snapshot, b: Snapshot) {
	return a.every((v, i) => v.style === b[i]?.style && v.html === b[i]?.html);
}

export default function EditingPlayground() {
	const root = useRef<HTMLDivElement>(null);
	const stage = useRef<HTMLDivElement>(null);
	const [selected, setSelected] = useState<HTMLElement | null>(null);
	const [revision, setRevision] = useState(0);
	const [reach, setReach] = useState(false);
	const [uses, setUses] = useState(false);
	const [hint, setHint] = useState("Select anything. Double-click text to edit.");
	const [rect, setRect] = useState({ left: 0, top: 0, width: 0, height: 0 });
	const base = useRef<Snapshot>([]);
	const past = useRef<Transaction[]>([]);
	const future = useRef<Transaction[]>([]);
	const pending = useRef<Transaction | null>(null);
	const cancelled = useRef(false);
	const inline = useRef<HTMLElement | null>(null);
	const active = useRef<HTMLElement | null>(null);
	const refresh = () => setRevision((v) => v + 1);
	const begin = (label: string) => {
		if (!pending.current && root.current) pending.current = { before: snapshot(root.current), label };
	};
	const finish = () => {
		const transaction = pending.current;
		pending.current = null;
		if (transaction && root.current && !same(transaction.before, snapshot(root.current))) {
			past.current.push(transaction);
			future.current = [];
		}
		refresh();
	};
	const cancel = () => {
		cancelled.current = true;
		if (pending.current) restore(pending.current.before);
		pending.current = null;
		const editing = inline.current;
		inline.current = null;
		if (editing) {
			editing.contentEditable = "false";
			editing.blur();
		}
		refresh();
	};
	const stopInline = () => {
		const editing = inline.current;
		inline.current = null;
		if (editing) editing.contentEditable = "false";
		finish();
	};
	const choose = (node: HTMLElement, reveal = false) => {
		stopInline();
		active.current = node;
		setSelected(node);
		setUses(false);
		setReach(false);
		if (reveal) node.scrollIntoView({ block: "center", behavior: "instant" });
	};
	const history = (redo: boolean) => {
		stopInline();
		const from = redo ? future : past;
		const into = redo ? past : future;
		const item = from.current.pop();
		if (item && root.current) {
			into.current.push({ before: snapshot(root.current), label: item.label });
			restore(item.before);
			refresh();
		}
	};
	const shared = selected?.dataset.shared === "download";
	const targets = () =>
		shared
			? [...(root.current?.querySelectorAll<HTMLElement>("[data-shared=download]") ?? [])]
			: selected
				? [selected]
				: [];
	const css = (property: string, value: string) => {
		if (cancelled.current) return;
		begin(property);
		for (const node of targets()) node.style.setProperty(property, value, "important");
		refresh();
	};
	const apply = (property: string, value: string) => {
		cancelled.current = false;
		css(property, value);
		finish();
	};
	const value = (property: string) => (selected ? getComputedStyle(selected).getPropertyValue(property) : "");
	const original = (property: string) => selected?.style.getPropertyValue(property) !== "";
	const numeric = (property: string) => Number.parseFloat(value(property)) || 0;
	const live = useRef({ cancel, history, finish, stopInline });
	live.current = { cancel, history, finish, stopInline };

	useLayoutEffect(() => {
		const page = root.current;
		if (!page) return;
		for (const group of page.querySelectorAll<HTMLElement>(GROUPS)) {
			group.dataset.preview = "";
			// Keep the original rendered plate while stopping its internal editor.
			for (const child of group.children) if (child instanceof HTMLElement) child.inert = true;
		}
		const nodes = [
			...page.querySelectorAll<HTMLElement>(
				".sg-page, header, main, section, footer, nav, div, h1, h2, h3, p, a, button, small, span, summary, code, figure, figcaption",
			),
		];
		let id = 0;
		for (const node of nodes) {
			const group = node.closest(GROUPS);
			if (group && group !== node) continue;
			if (node.closest("dialog") || node.parentElement?.closest("[data-literal]")) continue;
			node.dataset.editNode = String(id++);
			if (node.matches("a[href$='Spool.dmg']")) node.dataset.shared = "download";
			if (node.matches("h1,h2,h3,p,small,figcaption,code,span") && !node.querySelector("svg,button,a,code"))
				node.dataset.literal = "";
			if (node.matches("a,button,summary") && !node.querySelector("[data-edit-node],code")) {
				const text = [...node.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
				for (const part of text) {
					const span = document.createElement("span");
					span.dataset.literal = "";
					span.dataset.editNode = String(id++);
					part.replaceWith(span);
					span.appendChild(part);
				}
			}
		}
		base.current = snapshot(page);
		const first = page.querySelector<HTMLElement>("h1");
		if (first) {
			active.current = first;
			setSelected(first);
		}
		const key = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				if (!pending.current && !inline.current) return;
				event.preventDefault();
				event.stopImmediatePropagation();
				live.current.cancel();
				if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
				return;
			}
			const target = event.target;
			if (target instanceof HTMLElement && (target.closest("input,textarea,select") || target.isContentEditable))
				return;
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
				event.preventDefault();
				event.stopImmediatePropagation();
				live.current.history(event.shiftKey);
			}
			if (event.key === "Enter" && target instanceof HTMLElement && page.contains(target)) event.preventDefault();
		};
		window.addEventListener("keydown", key, true);
		return () => window.removeEventListener("keydown", key, true);
	}, []);

	useLayoutEffect(() => {
		if (!selected || !stage.current) return;
		const update = () => {
			const a = selected.getBoundingClientRect();
			const b = stage.current?.getBoundingClientRect();
			if (b) setRect({ left: a.left - b.left, top: a.top - b.top, width: a.width, height: a.height });
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(selected);
		observer.observe(stage.current);
		stage.current.addEventListener("scroll", update, { passive: true });
		window.addEventListener("resize", update);
		const viewport = stage.current;
		return () => {
			observer.disconnect();
			viewport.removeEventListener("scroll", update);
			window.removeEventListener("resize", update);
		};
	}, [selected, revision]);

	useEffect(() => {
		for (const node of root.current?.querySelectorAll<HTMLElement>("[data-shared=download]") ?? []) {
			node.toggleAttribute("data-reach", reach && shared && node !== selected);
		}
	}, [reach, shared, selected]);

	const textNode = selected ? literal(selected) : null;
	const parents: HTMLElement[] = [];
	let ancestor = selected?.parentElement;
	while (ancestor && ancestor !== root.current) {
		if (ancestor.dataset.editNode !== undefined) parents.unshift(ancestor);
		ancestor = ancestor.parentElement;
	}
	const startInline = (node: HTMLElement) => {
		const text = literal(node);
		if (!text || node.matches(GROUPS)) return;
		choose(node);
		cancelled.current = false;
		begin("text");
		inline.current = text;
		text.contentEditable = "plaintext-only";
		text.focus();
		const range = document.createRange();
		range.selectNodeContents(text);
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		setHint("Type here. Click away to keep it. Escape cancels.");
	};
	const resolve = (target: EventTarget) => {
		if (!(target instanceof HTMLElement || target instanceof SVGElement)) return null;
		const element = target.closest<HTMLElement>("[data-edit-node]");
		if (element?.dataset.literal !== undefined && element.parentElement?.matches("a,button,summary"))
			return element.parentElement;
		return element;
	};
	const visibleOptional = OPTIONAL.filter(
		(property) =>
			selected?.style.getPropertyValue(property) ||
			(["gap", "letter-spacing"].includes(property) && numeric(property) !== 0),
	);
	const numberRow = (
		property: string,
		unit = "px",
		min = 0,
		max = Number.POSITIVE_INFINITY,
		after?: React.ReactNode,
	) => (
		<NumberControl
			key={property}
			after={after}
			name={property}
			value={numeric(property)}
			unit={unit}
			min={min}
			max={max}
			changed={original(property)}
			onBegin={() => {
				cancelled.current = false;
				begin(property);
			}}
			onChange={(v) => css(property, `${v}${unit}`)}
			onFinish={finish}
			cancelled={cancelled}
			onHint={setHint}
		/>
	);
	const menu = (property: string, options: string[]) => (
		<Row name={property} changed={original(property)}>
			<select
				aria-label={property}
				className="ep-select"
				value={value(property)}
				onChange={(e) => apply(property, e.target.value)}
			>
				{!options.includes(value(property)) && <option value={value(property)}>{value(property)}</option>}
				{options.map((option) => (
					<option key={option}>{option}</option>
				))}
			</select>
		</Row>
	);
	return (
		<div className="ep-app">
			<header className="ep-toolbar">
				<span className="ep-title">
					spool <span>Editing playground</span>
				</span>
				<span className="ep-boundary">Edits stay here · reload resets</span>
				<div>
					<button type="button" aria-label="Undo" disabled={!past.current.length} onClick={() => history(false)}>
						Undo
					</button>
					<button type="button" aria-label="Redo" disabled={!future.current.length} onClick={() => history(true)}>
						Redo
					</button>
					<button
						type="button"
						onClick={() => {
							stopInline();
							restore(base.current);
							past.current = [];
							future.current = [];
							refresh();
							setHint("Page reset.");
						}}
					>
						Reset
					</button>
				</div>
			</header>
			<div className="ep-workspace">
				<div className="ep-stage-wrap">
					<div className="ep-stage" ref={stage}>
						<div
							ref={root}
							className="ep-document"
							onAuxClickCapture={(e) => {
								e.preventDefault();
								e.stopPropagation();
							}}
							onInputCapture={() => {
								if (inline.current) refresh();
							}}
							onPointerDownCapture={(e) => {
								if (!inline.current?.contains(e.target instanceof Node ? e.target : null)) e.stopPropagation();
							}}
							onClickCapture={(e) => {
								if (inline.current?.contains(e.target instanceof Node ? e.target : null)) {
									e.stopPropagation();
									return;
								}
								e.preventDefault();
								e.stopPropagation();
								const node = resolve(e.target);
								if (node) choose(node);
							}}
							onDoubleClickCapture={(e) => {
								e.preventDefault();
								e.stopPropagation();
								const node = resolve(e.target);
								if (node) startInline(node);
							}}
							onKeyDownCapture={(e) => {
								if (inline.current) {
									e.stopPropagation();
									if (e.key === "Enter" && !e.shiftKey) {
										e.preventDefault();
										stopInline();
									}
									return;
								}
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									e.stopPropagation();
									const node = resolve(e.target);
									if (node) choose(node);
								}
							}}
							onBlurCapture={(e) => {
								if (e.target === inline.current) stopInline();
							}}
							onSubmitCapture={(e) => {
								e.preventDefault();
								e.stopPropagation();
							}}
						>
							<Landing />
						</div>
					</div>
					{selected && (
						<div className="ep-overlays" aria-hidden={undefined}>
							<div className="ep-outline" style={rect}>
								<span className="ep-selection-name">{name(selected)}</span>
								{NUMBERS.map((property, i) => (
									<PaddingHandle
										key={property}
										edge={i}
										property={property}
										value={numeric(property)}
										onBegin={() => {
											cancelled.current = false;
											begin(property);
										}}
										onChange={(v) => css(property, `${v}px`)}
										onFinish={finish}
										cancelled={cancelled}
										onHint={setHint}
									/>
								))}
							</div>
						</div>
					)}
				</div>
				<aside className="ep-rail" aria-label="Properties">
					<nav className="ep-crumbs" aria-label="Selection breadcrumb">
						{parents.map((node) => (
							<button key={node.dataset.editNode} type="button" onClick={() => choose(node)}>
								{name(node)}
								<span>›</span>
							</button>
						))}
					</nav>
					{selected && (
						<div className="ep-selection">
							<strong>{name(selected)}</strong>
							{shared && (
								<button
									type="button"
									aria-expanded={uses}
									onClick={() => setUses((v) => !v)}
									onPointerEnter={() => setReach(true)}
									onPointerLeave={() => setReach(false)}
								>
									2 uses
								</button>
							)}
						</div>
					)}
					{shared && (
						<div className="ep-origin">
							Download button <span>· shared style</span>
						</div>
					)}
					{uses && (
						<div className="ep-uses">
							{targets().map((node, i) => (
								<button
									key={node.dataset.editNode}
									type="button"
									onClick={() => choose(node, true)}
									onPointerEnter={() => node.setAttribute("data-reach", "")}
									onPointerLeave={() => node.removeAttribute("data-reach")}
								>
									{i === 0 ? "Hero" : "Get started"}
									<span>{node === selected ? "selected" : "reveal"}</span>
								</button>
							))}
						</div>
					)}
					<div className="ep-fields" key={selected?.dataset.editNode}>
						{textNode && (
							<Section name="Content" reason={shared ? "this use" : undefined}>
								<TextControl
									name="text"
									value={textNode.innerText}
									multiline
									onBegin={() => {
										cancelled.current = false;
										begin("text");
									}}
									onChange={(text) => {
										if (!cancelled.current) {
											textNode.innerText = text;
											refresh();
										}
									}}
									onFinish={finish}
								/>
							</Section>
						)}
						{selected?.matches(GROUPS) && (
							<p className="ep-note">Demo preview. Edit its box; the inner demo stays still.</p>
						)}
						<div onPointerEnter={() => setReach(true)} onPointerLeave={() => setReach(false)}>
							<Section name="Layout">
								{menu("display", ["block", "flex", "grid", "inline-flex", "none"])}
								{["flex", "inline-flex", "grid"].includes(value("display")) && (
									<>
										{menu("flex-direction", ["row", "column"])}
										{menu("justify-content", ["normal", "flex-start", "center", "flex-end", "space-between"])}
										{menu("align-items", ["normal", "stretch", "flex-start", "center", "flex-end"])}
									</>
								)}
								{numberRow(
									"width",
									"px",
									0,
									Number.POSITIVE_INFINITY,
									<select
										aria-label="width mode"
										className="ep-select ep-width-mode"
										value={
											selected?.style.width === "100%"
												? "fill"
												: selected?.style.width && selected.style.width !== "auto"
													? "fixed"
													: "auto"
										}
										onChange={(e) =>
											apply(
												"width",
												e.target.value === "fill"
													? "100%"
													: e.target.value === "auto"
														? "auto"
														: `${Math.round(selected?.getBoundingClientRect().width ?? 0)}px`,
											)
										}
									>
										<option value="auto">auto</option>
										<option value="fill">fill</option>
										<option value="fixed">fixed</option>
									</select>,
								)}
								{numberRow("height")}
								{NUMBERS.map((property) => numberRow(property))}
								{visibleOptional
									.filter((property) => property !== "letter-spacing")
									.map((property) =>
										numberRow(property, "px", property.startsWith("margin-") ? Number.NEGATIVE_INFINITY : 0),
									)}
							</Section>
							<Section name="Typography">
								{numberRow("font-size")}
								{numberRow("line-height")}
								{visibleOptional.includes("letter-spacing") && numberRow("letter-spacing", "px", -100)}
								{menu("font-weight", ["400", "500", "600", "700"])}
								{menu("text-align", ["start", "left", "center", "right"])}
							</Section>
							<Section name="Appearance">
								{numberRow("border-radius")}
								{numberRow("opacity", "", 0, 1)}
								{["color", "background-color"].map((property) => (
									<TextControl
										key={property}
										name={property}
										value={value(property)}
										swatch
										onBegin={() => {
											cancelled.current = false;
											begin(property);
										}}
										onChange={(v) => {
											if (CSS.supports(property, v)) css(property, v);
										}}
										onFinish={finish}
									/>
								))}
							</Section>
							<div className="ep-add">
								<select
									aria-label="Add property"
									value=""
									onChange={(e) => {
										const property = e.target.value;
										cancelled.current = false;
										css(
											property,
											`${property === "border-width" ? Math.max(1, numeric(property)) : numeric(property)}px`,
										);
										if (property === "border-width") css("border-style", "solid");
										finish();
									}}
								>
									<option value="" disabled>
										+ Add property
									</option>
									{OPTIONAL.filter((property) => !visibleOptional.includes(property)).map((property) => (
										<option key={property}>{property}</option>
									))}
								</select>
							</div>
						</div>
						<p className="ep-note">
							Images, tokens, responsive rules and source expressions are unavailable in this playground.
						</p>
					</div>
					<div className="ep-hint" role="status">
						{hint}
					</div>
				</aside>
			</div>
		</div>
	);
}

function NumberControl({
	after,
	name,
	value,
	unit,
	min,
	max,
	changed,
	onBegin,
	onChange,
	onFinish,
	cancelled,
	onHint,
}: {
	after?: React.ReactNode;
	name: string;
	value: number;
	unit: string;
	min: number;
	max: number;
	changed: boolean;
	onBegin: () => void;
	onChange: (value: number) => void;
	onFinish: () => void;
	cancelled: React.RefObject<boolean>;
	onHint: (value: string) => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const hold = useRef(false);
	const shift = useRef(false);
	const current = useRef(value);
	current.current = value;
	const bounded = (v: number) => Math.min(max, Math.max(min, v));
	const step = unit === "" ? 0.01 : 1;
	return (
		<div
			onPointerDownCapture={(e) => {
				if (!(e.target instanceof HTMLInputElement)) {
					if (
						document.activeElement instanceof HTMLInputElement ||
						document.activeElement instanceof HTMLTextAreaElement
					)
						document.activeElement.blur();
					setDraft(null);
				}
			}}
			onPointerMoveCapture={(e) => {
				shift.current = e.shiftKey;
			}}
			onPointerEnter={() => onHint(`${name} · drag label · ↑↓ ${step} · Shift ${step * 10}`)}
		>
			<Row
				name={name}
				changed={changed}
				onScrub={(units) => {
					if (!hold.current) {
						onBegin();
						hold.current = true;
					}
					if (!cancelled.current) onChange(bounded(current.current + units * step * (shift.current ? 10 : 1)));
				}}
				onScrubEnd={() => {
					hold.current = false;
					onFinish();
				}}
			>
				<label className={cn("ep-input", BOX, VALUE, changed && "text-thread")}>
					<input
						aria-label={name}
						role="spinbutton"
						aria-valuenow={value}
						aria-valuemin={Number.isFinite(min) ? min : undefined}
						aria-valuemax={Number.isFinite(max) ? max : undefined}
						inputMode="decimal"
						value={draft ?? String(value)}
						onFocus={(e) => {
							onBegin();
							e.target.select();
						}}
						onChange={(e) => {
							setDraft(e.target.value);
							const n = Number(e.target.value);
							if (e.target.value.trim() && Number.isFinite(n)) onChange(bounded(n));
						}}
						onBlur={() => {
							setDraft(null);
							onFinish();
						}}
						onKeyDown={(e) => {
							e.stopPropagation();
							if (e.key === "Enter") {
								e.preventDefault();
								e.currentTarget.blur();
							}
							if (e.key === "ArrowUp" || e.key === "ArrowDown") {
								e.preventDefault();
								setDraft(null);
								onChange(bounded(value + (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1)));
							}
						}}
					/>
					<span>{unit}</span>
				</label>
				{after}
			</Row>
		</div>
	);
}
function TextControl({
	name,
	value,
	multiline = false,
	swatch = false,
	onBegin,
	onChange,
	onFinish,
}: {
	name: string;
	value: string;
	multiline?: boolean;
	swatch?: boolean;
	onBegin: () => void;
	onChange: (value: string) => void;
	onFinish: () => void;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const common = {
		"aria-label": name,
		id: `ep-field-${name}`,
		value: draft ?? value,
		onFocus: onBegin,
		onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			setDraft(e.target.value);
			onChange(e.target.value);
		},
		onBlur: () => {
			setDraft(null);
			onFinish();
		},
		onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			e.stopPropagation();
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				e.currentTarget.blur();
			}
		},
	};
	return (
		<Row name={name} tall={multiline}>
			<label htmlFor={`ep-field-${name}`} className={cn("ep-input", BOX, VALUE)}>
				{swatch && <span className="ep-swatch" style={{ background: value }} />}
				{multiline ? <textarea {...common} rows={3} /> : <input {...common} />}
			</label>
		</Row>
	);
}
function PaddingHandle({
	edge,
	property,
	value,
	onBegin,
	onChange,
	onFinish,
	cancelled,
	onHint,
}: {
	edge: number;
	property: string;
	value: number;
	onBegin: () => void;
	onChange: (n: number) => void;
	onFinish: () => void;
	cancelled: React.RefObject<boolean>;
	onHint: (s: string) => void;
}) {
	const held = useRef<{ x: number; y: number; value: number; moved: boolean } | null>(null);
	const down = (e: ReactPointerEvent<HTMLButtonElement>) => {
		e.preventDefault();
		e.stopPropagation();
		if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)
			document.activeElement.blur();
		onBegin();
		held.current = { x: e.clientX, y: e.clientY, value, moved: false };
		e.currentTarget.setPointerCapture(e.pointerId);
	};
	return (
		<button
			type="button"
			className="ep-handle"
			data-edge={edge}
			aria-label={`Drag ${property}`}
			onPointerEnter={() => onHint(`${property} · pull outward to increase · Escape cancels`)}
			onPointerDown={down}
			onPointerMove={(e) => {
				const h = held.current;
				if (!h || cancelled.current) return;
				const delta =
					edge === 0
						? h.y - e.clientY
						: edge === 1
							? e.clientX - h.x
							: edge === 2
								? e.clientY - h.y
								: h.x - e.clientX;
				if (Math.abs(delta) > 2) h.moved = true;
				if (h.moved) onChange(Math.max(0, Math.round(h.value + delta * (e.shiftKey ? 10 : 1))));
			}}
			onPointerUp={(e) => {
				const h = held.current;
				held.current = null;
				e.currentTarget.releasePointerCapture(e.pointerId);
				onFinish();
				if (h && !h.moved && !cancelled.current)
					document.querySelector<HTMLInputElement>(`input[aria-label="${property}"]`)?.focus();
			}}
			onPointerCancel={() => {
				held.current = null;
				onFinish();
			}}
			onKeyDown={(e) => {
				if (e.key === "ArrowUp" || e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "ArrowLeft") {
					e.preventDefault();
					onBegin();
					onChange(
						Math.max(0, value + (e.key === "ArrowUp" || e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 10 : 1)),
					);
					onFinish();
				}
			}}
		>
			<span>{value}px</span>
		</button>
	);
}
