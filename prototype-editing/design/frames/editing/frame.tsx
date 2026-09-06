import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SleeveModern } from "shared/landing/ui/site/sleeve-guide/modern";
import { cn } from "shared/lib/utils";
import { BOX, Row, Section, VALUE } from "shared/ui/spool/properties-fields";
import { ColorField } from "./color-field";
import { Selection } from "./selection";
import { useViewport } from "./viewport";
import "./playground.css";

// A throwaway DOM editing journey over the current SleeveModern landing.
// The copied page is frozen under this editor. Only in-memory DOM styles and
// literal text change; shared reach is the two authored download uses.
const Landing = memo(SleeveModern);
type Snapshot = {
	node: HTMLElement;
	style: string;
	html: string | null;
	parent: Node | null;
	next: ChildNode | null;
}[];
type Transaction = { before: Snapshot; label: string };
const GROUPS = ".sr-app, .sg-product, .sg-source-pair";
const NUMBERS = ["padding-top", "padding-right", "padding-bottom", "padding-left"];
const OPTIONAL = [
	"gap",
	"letter-spacing",
	"border-width",
	"min-height",
	"max-width",
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
		parent: node.parentNode,
		next: node.nextSibling,
		html: literal(node) === node ? node.innerHTML : null,
	}));
}
function restore(s: Snapshot) {
	for (const entry of [...s].reverse()) {
		if (entry.parent && (entry.node.parentNode !== entry.parent || entry.node.nextSibling !== entry.next))
			entry.parent.insertBefore(entry.node, entry.next?.parentNode === entry.parent ? entry.next : null);
	}
	for (const entry of s) {
		entry.node.style.cssText = entry.style;
		if (entry.html !== null && entry.node.innerHTML !== entry.html) entry.node.innerHTML = entry.html;
	}
}
function same(a: Snapshot, b: Snapshot) {
	return a.every(
		(v, i) => v.style === b[i]?.style && v.html === b[i]?.html && v.parent === b[i]?.parent && v.next === b[i]?.next,
	);
}

export default function EditingPlayground() {
	const root = useRef<HTMLDivElement>(null);
	const stage = useRef<HTMLDivElement>(null);
	const viewport = useViewport(stage, root);
	const keyboard = useRef<(event: KeyboardEvent) => void>(() => {});
	const keyGesture = useRef(false);
	const [selected, setSelected] = useState<HTMLElement | null>(null);
	const [revision, setRevision] = useState(0);
	const [reach, setReach] = useState(false);
	const [uses, setUses] = useState(false);
	const [hint, setHint] = useState(
		"Select anything. Double-click text to edit. Option + hover measures spacing. Shift 2 zooms to selection. Space pans.",
	);
	const [hovered, setHovered] = useState<HTMLElement | null>(null);
	const [measuring, setMeasuring] = useState(false);
	const [padding, setPadding] = useState<string | null>(null);
	const paint = useRef<number | null>(null);
	const pointer = useRef<{ x: number; y: number } | null>(null);
	const base = useRef<Snapshot>([]);
	const past = useRef<Transaction[]>([]);
	const future = useRef<Transaction[]>([]);
	const pending = useRef<Transaction | null>(null);
	const cancelled = useRef(false);
	const inline = useRef<HTMLElement | null>(null);
	const active = useRef<HTMLElement | null>(null);
	const refresh = () => {
		if (paint.current !== null) return;
		paint.current = requestAnimationFrame(() => {
			paint.current = null;
			setRevision((v) => v + 1);
		});
	};
	useLayoutEffect(() => {
		void viewport.width;
		void viewport.zoom;
		// Read the rail after React applies the page's new viewport geometry.
		setRevision((v) => v + 1);
	}, [viewport.width, viewport.zoom]);
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
		keyGesture.current = false;
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
		keyGesture.current = false;
		const editing = inline.current;
		inline.current = null;
		if (editing) editing.contentEditable = "false";
		finish();
	};
	const choose = (node: HTMLElement, reveal = false) => {
		stopInline();
		active.current = node;
		setSelected(node);
		const box = node.getBoundingClientRect();
		setHint(
			Math.min(box.width, box.height) < 24
				? "Small selection · Shift 2 zooms in to reveal resize handles"
				: "Arrows follow layout · Cmd/Ctrl + arrows resize · Shift 2 zooms to selection",
		);
		setHovered(null);
		setPadding(null);
		setUses(false);
		setReach(false);
		stage.current?.focus({ preventScroll: true });
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
	const restoreProperty = (property: string) => {
		if (cancelled.current) return;
		for (const node of targets()) {
			const saved = pending.current?.before.find((entry) => entry.node === node);
			if (!saved) continue;
			const style = document.createElement("div").style;
			style.cssText = saved.style;
			node.style.setProperty(property, style.getPropertyValue(property), style.getPropertyPriority(property));
		}
		refresh();
	};
	const localCss = (property: string, value: string) => {
		if (cancelled.current || !selected) return;
		begin(property);
		selected.style.setProperty(property, value, "important");
		refresh();
	};
	const apply = (property: string, value: string) => {
		cancelled.current = false;
		css(property, value);
		finish();
	};
	const computed = selected ? getComputedStyle(selected) : null;
	const value = (property: string) => computed?.getPropertyValue(property) ?? "";
	const original = (property: string) => selected?.style.getPropertyValue(property) !== "";
	const numeric = (property: string) => Number.parseFloat(value(property)) || 0;
	const live = useRef({ cancel, history, finish, stopInline, viewport });
	live.current = { cancel, history, finish, stopInline, viewport };

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
			if (
				event.key === "Alt" &&
				!inline.current &&
				!(event.target instanceof HTMLElement && event.target.closest("input,textarea,select"))
			)
				setMeasuring(true);
			if (event.key === "Escape") {
				if (live.current.viewport.keyDown(event)) return;
				if (!pending.current && !inline.current) return;
				event.preventDefault();
				event.stopImmediatePropagation();
				live.current.cancel();
				stage.current?.focus({ preventScroll: true });
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
			keyboard.current(event);
		};
		const keyUp = (event: KeyboardEvent) => {
			live.current.viewport.keyUp(event);
			if (event.key.startsWith("Arrow") && keyGesture.current) {
				keyGesture.current = false;
				live.current.finish();
			}
			if (event.key === "Alt") setMeasuring(false);
		};
		const blur = () => {
			if (keyGesture.current) live.current.cancel();
			setMeasuring(false);
			setHovered(null);
		};
		window.addEventListener("keydown", key, true);
		window.addEventListener("keyup", keyUp);
		window.addEventListener("blur", blur);
		return () => {
			window.removeEventListener("keydown", key, true);
			window.removeEventListener("keyup", keyUp);
			window.removeEventListener("blur", blur);
			if (paint.current !== null) cancelAnimationFrame(paint.current);
		};
	}, []);

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
		setHovered(null);
		setMeasuring(false);
		setHint("Type here. Double-click a word to select it. Escape cancels.");
	};
	keyboard.current = (event) => {
		const target = event.target;
		if (!(target instanceof HTMLElement) || !(target === stage.current || root.current?.contains(target))) return;
		if (event.isComposing) return;
		if (event.shiftKey && event.code === "Digit2") {
			event.preventDefault();
			viewport.fitSelection(selected);
			return;
		}
		if (viewport.keyDown(event)) return;
		if (!selected || inline.current || viewport.panning) return;
		if (event.key === "Enter") {
			event.preventDefault();
			if (event.shiftKey) {
				const parent = selected.parentElement?.closest<HTMLElement>("[data-edit-node]");
				if (parent) choose(parent);
			} else if (literal(selected)) startInline(selected);
			return;
		}
		if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) || event.altKey) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		if (event.repeat && cancelled.current) return;
		const resize = event.metaKey || event.ctrlKey;
		const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
		const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
		const step = (forward ? 1 : -1) * (event.shiftKey ? 10 : 1);
		const style = getComputedStyle(selected);
		if (resize && ["inline", "contents", "none"].includes(style.display)) {
			setHint("This element takes its size from its content. Resize its container.");
			return;
		}
		if (!keyGesture.current) {
			cancelled.current = false;
			begin(resize ? "keyboard resize" : "keyboard move");
			keyGesture.current = true;
		}
		if (resize) {
			const property = horizontal ? "width" : "height";
			css(property, `${Math.max(1, Number.parseFloat(style.getPropertyValue(property)) + step)}px`);
			setHint("Resize · 1px · Shift 10px · Escape cancels this key press");
			return;
		}
		if (style.position === "absolute" || style.position === "fixed") {
			const start = horizontal ? "left" : "top";
			const end = horizontal ? "right" : "bottom";
			const from = Number.parseFloat(style.getPropertyValue(start));
			const to = Number.parseFloat(style.getPropertyValue(end));
			if (Number.isFinite(from)) localCss(start, `${from + step}px`);
			if (Number.isFinite(to)) localCss(end, `${to - step}px`);
			if (!Number.isFinite(from) && !Number.isFinite(to))
				localCss(start, `${(horizontal ? selected.offsetLeft : selected.offsetTop) + step}px`);
			setHint("Move · 1px · Shift 10px · Escape cancels this key press");
			return;
		}
		const parent = selected.parentElement;
		if (!parent) return;
		const layout = getComputedStyle(parent);
		const flex = layout.display === "flex" || layout.display === "inline-flex";
		const row = flex && layout.flexDirection.startsWith("row");
		const siblings = [...parent.children].filter(
			(n): n is HTMLElement =>
				n instanceof HTMLElement &&
				n.dataset.editNode !== undefined &&
				!["absolute", "fixed"].includes(getComputedStyle(n).position),
		);
		if (
			layout.display.includes("grid") ||
			horizontal !== row ||
			siblings.some((n) => getComputedStyle(n).order !== "0")
		) {
			setHint("Parent layout controls this position. Use layout alignment or spacing.");
			return;
		}
		const reversed = flex && layout.flexDirection.endsWith("reverse") !== (row && layout.direction === "rtl");
		const delta = forward !== reversed ? 1 : -1;
		const neighbor = siblings[siblings.indexOf(selected) + delta];
		if (neighbor) {
			parent.insertBefore(selected, delta > 0 ? neighbor.nextSibling : neighbor);
			selected.scrollIntoView({ block: "nearest", inline: "nearest" });
			refresh();
		}
		setHint("Reorder in parent layout · move free elements by 1px · Escape cancels this key press");
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
			(["gap", "letter-spacing"].includes(property) && numeric(property) !== 0) ||
			(property === "max-width" && value(property) !== "none"),
	);
	const numberRow = (
		property: string,
		unit = "px",
		min = 0,
		max = Number.POSITIVE_INFINITY,
		after?: React.ReactNode,
	) =>
		property === "max-width" && !value(property).endsWith("px") ? (
			<Row key={property} name={property}>
				<span className="ep-select" title="Constraint from the page">
					{value(property)}
				</span>
			</Row>
		) : (
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
				onInspect={(on) => setPadding(on && NUMBERS.includes(property) ? property : null)}
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
				<div className="ep-zoom" role="toolbar" aria-label="Canvas zoom">
					<button type="button" aria-label="Zoom out" onClick={() => viewport.zoomBy(1 / 1.25)}>
						−
					</button>
					<button
						type="button"
						aria-label="Actual size"
						title="Actual size · Shift 0"
						onClick={viewport.actualSize}
					>
						{Math.round(viewport.zoom * 100)}%
					</button>
					<button type="button" aria-label="Zoom in" onClick={() => viewport.zoomBy(1.25)}>
						+
					</button>
					<button
						type="button"
						aria-label="Zoom to selection"
						title="Zoom to selection · Shift 2"
						onClick={() => viewport.fitSelection(selected)}
					>
						Fit selection
					</button>
				</div>
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
					<div
						className="ep-stage"
						ref={stage}
						// biome-ignore lint/a11y/noNoninteractiveTabindex: This canvas receives selection-scoped editing shortcuts.
						tabIndex={0}
						role="application"
						aria-label="Editing canvas"
						data-panning={viewport.panning || undefined}
						onPointerMove={(e) => {
							pointer.current = { x: e.clientX, y: e.clientY };
							if (!e.buttons && !inline.current && !viewport.panning) setHovered(resolve(e.target));
						}}
						onPointerLeave={() => {
							pointer.current = null;
							setHovered(null);
						}}
						onScroll={() => {
							if (pointer.current && !inline.current) {
								const target = document.elementFromPoint(pointer.current.x, pointer.current.y);
								setHovered(target ? resolve(target) : null);
							}
						}}
					>
						<div
							ref={root}
							className="ep-document"
							style={{ width: viewport.width || undefined, zoom: viewport.zoom }}
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
								if (node && !e.altKey) choose(node);
							}}
							onDoubleClickCapture={(e) => {
								if (inline.current?.contains(e.target instanceof Node ? e.target : null)) {
									e.stopPropagation();
									return;
								}
								e.preventDefault();
								e.stopPropagation();
								const node = resolve(e.target);
								if (node && !e.altKey) startInline(node);
							}}
							onKeyDownCapture={(e) => {
								if (inline.current) {
									e.stopPropagation();
									if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
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
					<Selection
						selected={selected}
						zoom={viewport.zoom}
						onPosition={localCss}
						onRestore={restoreProperty}
						hovered={hovered}
						measuring={measuring}
						editing={inline.current !== null}
						stage={stage}
						revision={revision}
						padding={padding}
						onBegin={() => {
							stopInline();
							cancelled.current = false;
							setHovered(null);
							begin("resize");
						}}
						onChange={css}
						onFinish={finish}
						onCancel={cancel}
						cancelled={cancelled}
						onHint={setHint}
					/>
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
								{["width", "height"].map((axis) =>
									numberRow(
										axis,
										"px",
										0,
										Number.POSITIVE_INFINITY,
										<select
											aria-label={`${axis} mode`}
											className="ep-select ep-width-mode"
											value={
												selected?.style.getPropertyValue(axis) === "100%"
													? "fill"
													: selected?.style.getPropertyValue(axis) &&
															selected.style.getPropertyValue(axis) !== "auto"
														? "fixed"
														: "auto"
											}
											onChange={(e) =>
												apply(
													axis,
													e.target.value === "fill"
														? "100%"
														: e.target.value === "auto"
															? "auto"
															: `${numeric(axis)}px`,
												)
											}
										>
											<option value="auto">auto</option>
											{axis === "width" && <option value="fill">fill</option>}
											<option value="fixed">fixed</option>
										</select>,
									),
								)}
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
								{selected &&
									["color", "background-color"].map((property) => (
										<ColorField
											key={property}
											node={selected}
											name={property}
											value={value(property)}
											onBegin={() => {
												cancelled.current = false;
												begin(property);
											}}
											onChange={(v) => css(property, v)}
											onApply={(v) => apply(property, v)}
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
							Color tokens can be applied here. Source writes, other token bindings and responsive rules are
							still outside this playground.
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
	onInspect,
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
	onInspect: (on: boolean) => void;
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
			onPointerEnter={() => {
				onHint(`${name} · drag label · ↑↓ ${step} · Shift ${step * 10}`);
				onInspect(true);
			}}
			onPointerLeave={() => onInspect(false)}
		>
			<Row
				name={name}
				changed={changed}
				onScrub={(units) => {
					if (!hold.current) {
						onBegin();
						hold.current = true;
					}
					if (!cancelled.current) {
						current.current = bounded(current.current + units * step * (shift.current ? 10 : 1));
						onChange(current.current);
					}
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
			if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
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
