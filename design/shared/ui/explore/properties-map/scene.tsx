import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { readValues, type Editor, type Target, type Values } from "shared/lib/explore/properties-map/model";

export interface Geometry {
	width: number;
	height: number;
	scale: number;
	contentTop: number;
	contentBottom: number;
	gapY: number;
	gapX: number;
}

function styleOf(values: Values, target: Target): CSSProperties {
	return {
		position: "relative",
		boxSizing: "border-box",
		flexShrink: 0,
		display: target === "heading" ? "block" : "flex",
		flexDirection: values.direction,
		alignItems: values.align === "start" ? "flex-start" : values.align === "end" ? "flex-end" : "center",
		justifyContent:
			values.justify === "between"
				? "space-between"
				: values.justify === "start"
					? "flex-start"
					: values.justify === "end"
						? "flex-end"
						: "center",
		gap: values.gap,
		padding: `${values.top}px ${values.right}px ${values.bottom}px ${values.left}px`,
		width: values.widthMode === "fixed" ? values.width : values.widthMode === "fill" ? "100%" : "fit-content",
		height: values.heightMode === "fixed" ? values.height : values.heightMode === "fill" ? "100%" : "auto",
		background: target === "heading" && values.fill === "#ffffff" ? "transparent" : values.fill,
		borderRadius: values.radius,
		opacity: values.opacity / 100,
		fontSize: values.fontSize,
		fontWeight: values.fontWeight,
		lineHeight: target === "heading" ? 1.15 : 1.45,
		color: target === "button" && values.fill !== "#ffffff" ? "#ffffff" : "#24312b",
		textAlign: "left",
		margin: 0,
		border: 0,
	};
}

export function PropertiesScene({
	editor,
	overlay,
}: {
	editor: Editor;
	overlay?: ((geometry: Geometry) => ReactNode) | undefined;
}) {
	const selected = useRef<HTMLElement | null>(null);
	const artboard = useRef<HTMLDivElement | null>(null);
	const [geometry, setGeometry] = useState<Geometry & { x: number; y: number }>({
		width: 400,
		height: 280,
		scale: 1,
		contentTop: 24,
		contentBottom: 256,
		gapY: 86,
		gapX: 344,
		x: 40,
		y: 145,
	});
	const [editing, setEditing] = useState<{ target: Target; initial: string } | null>(null);
	const editable = useRef<HTMLSpanElement | null>(null);
	useLayoutEffect(() => {
		const element = selected.current;
		if (!element) return;
		const measure = () => {
			const rect = element.getBoundingClientRect();
			const computed = getComputedStyle(element);
			const origin = artboard.current?.getBoundingClientRect();
			const scale = rect.width / element.offsetWidth || 1;
			const first = element.querySelector<HTMLElement>(":scope > [data-product-child]");
			editor.measure(element.offsetWidth, element.offsetHeight);
			setGeometry({
				width: element.offsetWidth,
				height: element.offsetHeight,
				scale,
				contentTop: Number.parseFloat(computed.paddingTop),
				contentBottom: element.offsetHeight - Number.parseFloat(computed.paddingBottom),
				gapY: first ? first.offsetTop + first.offsetHeight : element.offsetHeight / 2,
				gapX: first ? first.offsetLeft + first.offsetWidth : element.offsetWidth / 2,
				x: (rect.left - (origin?.left ?? 0)) / scale,
				y: (rect.top - (origin?.top ?? 0)) / scale,
			});
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, [editor.document, editor.target, editor.scope, editor.step]);
	useEffect(() => {
		if (!editing || !editable.current) return;
		editable.current.focus();
		const selection = window.getSelection();
		const range = document.createRange();
		range.selectNodeContents(editable.current);
		selection?.removeAllRanges();
		selection?.addRange(range);
	}, [editing]);
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const target = event.target;
			if (target instanceof HTMLElement && (target.closest("input,textarea,select") || target.isContentEditable))
				return;
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
				event.preventDefault();
				editor.undo();
			}
			if (event.key === "Delete" || event.key === "Backspace") {
				event.preventDefault();
				editor.remove();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [editor]);
	const ring =
		!editor.deleted && !editing ? (
			<div
				data-selection-ring
				className="pointer-events-none absolute z-20 outline outline-1 outline-thread"
				style={{
					left: geometry.x,
					top: geometry.y,
					width: geometry.width,
					height: geometry.height,
					borderRadius: editor.values.radius,
				}}
			>
				{overlay?.(geometry)}
			</div>
		) : null;
	const attributes = (id: Target) => ({
		"data-product-child": true,
		"data-node": id,
		"data-source-classes": editor.document[id].className,
		ref: (element: HTMLElement | null) => {
			if (editor.target === id) selected.current = element;
		},
		style: styleOf(readValues(editor.document[id], editor.step, editor.target === id ? editor.scope : "base"), id),
		onClick: (event: React.MouseEvent) => {
			event.stopPropagation();
			if (!editing) editor.select(id);
		},
		onDoubleClick: (event: React.MouseEvent) => {
			event.stopPropagation();
			if (id === "card") return;
			editor.select(id);
			editor.begin();
			setEditing({ target: id, initial: editor.document[id].text });
		},
	});
	const text = (id: Target) =>
		editing?.target === id ? (
			<span
				ref={editable}
				contentEditable
				suppressContentEditableWarning
				className="outline-none"
				onBlur={(event) => {
					editor.preview("text", event.currentTarget.textContent ?? "");
					editor.commit();
					setEditing(null);
				}}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						event.currentTarget.textContent = editing.initial;
						editor.cancel();
						setEditing(null);
					}
					if (event.key === "Enter" && !event.shiftKey) {
						event.preventDefault();
						event.currentTarget.blur();
					}
				}}
			>
				{editing.initial}
			</span>
		) : (
			<span>{editor.document[id].text}</span>
		);
	return (
		<div className="absolute inset-0 flex flex-col overflow-auto">
			<div className="flex h-14 shrink-0 items-center justify-between px-8 font-mono text-muted text-[11px]">
				<span>weekend / stay</span>
				<span>{editor.scope === "hover" ? "hover preview" : "default"}</span>
			</div>
			<div className="flex min-h-[590px] flex-1 items-center justify-center px-8 pb-8">
				<div
					ref={artboard}
					className="relative h-[570px] w-[560px] shrink-0 overflow-visible bg-[#efede7] text-[#24312b]"
				>
					<div className="flex items-center justify-between px-10 pt-8">
						<span className="font-semibold text-[19px] tracking-tight">Weekend</span>
						<span className="text-[12px]">Places for a slower pace</span>
					</div>
					<div className="absolute inset-x-10 top-[145px] h-[370px]">
						{editor.document.card.deleted ? (
							<button
								type="button"
								onClick={editor.undo}
								className="border border-[#24312b]/20 px-4 py-3 text-[13px]"
							>
								Card deleted. Undo
							</button>
						) : (
							<article {...attributes("card")}>
								{editor.document.heading.deleted ? null : <h2 {...attributes("heading")}>{text("heading")}</h2>}
								<p
									data-product-child
									style={{
										margin: 0,
										maxWidth: 310,
										fontSize: 14,
										lineHeight: 1.65,
										color: "#6c736b",
										flexShrink: 0,
									}}
								>
									Cabins, quiet mornings and a place to call yours. Find somewhere worth slowing down.
								</p>
								{editor.document.button.deleted ? null : (
									<button type="button" {...attributes("button")}>
										{text("button")}
									</button>
								)}
							</article>
						)}
					</div>
					{ring}
					<span className="absolute bottom-6 left-10 text-[#8c9187] text-[11px]">
						Stockholm archipelago · Open all year
					</span>
				</div>
			</div>
			<div className="flex h-28 shrink-0 items-start justify-center px-5 pt-2 text-muted text-[11px]">
				Select the card, heading or button. Double-click text to edit. Delete removes the selection.
			</div>
		</div>
	);
}

export function SourceLine({ editor }: { editor: Editor }) {
	return (
		<details className="border-t border-border px-4 py-3 text-[10px] text-muted">
			<summary className="cursor-pointer select-none font-mono">
				className <span className="float-right">{editor.scope}</span>
			</summary>
			<code data-class-output className="mt-3 block break-words text-[10px] leading-[1.8] text-text/70">
				{editor.className}
			</code>
			<p className="mt-3 leading-relaxed">Prototype edits live in this view. Reload restores the source.</p>
		</details>
	);
}
