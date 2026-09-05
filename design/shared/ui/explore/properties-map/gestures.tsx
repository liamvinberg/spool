import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type CSSProperties } from "react";
import { useProperties, type Editor } from "shared/lib/explore/properties-map/model";
import { PropertiesScene, SourceLine } from "shared/ui/explore/properties-map/scene";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";
import "shared/ui/explore/properties-map/gestures.css";

type GestureField = "width" | "top" | "right" | "bottom" | "left" | "gap";
type GestureAxis = "x" | "y";

interface GesturePort {
	read: (field: GestureField) => number;
	begin: () => void;
	preview: (field: GestureField, value: number, exact: boolean) => void;
	commit: () => void;
	cancel: () => void;
}

interface PointerSession {
	moved: boolean;
	id: number;
	x: number;
	y: number;
	initial: number;
	scaleX: number;
	scaleY: number;
	field: GestureField;
	axis: GestureAxis;
	sign: number;
	node: HTMLButtonElement;
}

/** A pointer belongs to one preview transaction, including cancellation. */
function useGesture(port: GesturePort) {
	const documentRef = useRef<HTMLDivElement>(null);
	const session = useRef<PointerSession | null>(null);
	const current = useRef(port);
	current.current = port;
	const [active, setActive] = useState<GestureField | null>(null);
	const [exact, setExact] = useState(false);
	useEffect(() => {
		const cancel = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || session.current === null) return;
			event.preventDefault();
			const held = session.current;
			session.current = null;
			if (held.node.hasPointerCapture(held.id)) held.node.releasePointerCapture(held.id);
			current.current.cancel();
			setActive(null);
		};
		window.addEventListener("keydown", cancel);
		return () => window.removeEventListener("keydown", cancel);
	}, []);
	const start =
		(field: GestureField, axis: GestureAxis, sign: number, panel = false) =>
		(event: ReactPointerEvent<HTMLButtonElement>) => {
			if (event.button !== 0 || session.current !== null) return;
			const element = documentRef.current;
			if (element === null) return;
			event.preventDefault();
			const measure = panel ? event.currentTarget : element;
			const rect = measure.getBoundingClientRect();
			current.current.begin();
			session.current = {
				moved: false,
				id: event.pointerId,
				x: event.clientX,
				y: event.clientY,
				initial: field === "width" ? element.offsetWidth : current.current.read(field),
				scaleX: rect.width / measure.offsetWidth,
				scaleY: rect.height / measure.offsetHeight,
				field,
				axis,
				sign,
				node: event.currentTarget,
			};
			event.currentTarget.setPointerCapture(event.pointerId);
			setActive(field);
			setExact(event.altKey);
		};
	const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
		const held = session.current;
		if (held === null || event.pointerId !== held.id) return;
		const delta = held.axis === "x" ? (event.clientX - held.x) / held.scaleX : (event.clientY - held.y) / held.scaleY;
		if (!held.moved && Math.abs(delta) < 2) return;
		held.moved = true;
		current.current.preview(held.field, held.initial + delta * held.sign, event.altKey);
		setExact(event.altKey);
	};
	const finish = (event: ReactPointerEvent<HTMLButtonElement>) => {
		if (session.current === null || event.pointerId !== session.current.id) return;
		move(event);
		session.current = null;
		current.current.commit();
		setActive(null);
	};
	const cancel = () => {
		if (session.current === null) return;
		session.current = null;
		current.current.cancel();
		setActive(null);
	};
	return {
		documentRef,
		active,
		exact,
		bind: (field: GestureField, axis: GestureAxis, sign: number, panel = false) => ({
			onPointerDown: start(field, axis, sign, panel),
			onPointerMove: move,
			onPointerUp: finish,
			onPointerCancel: cancel,
			onLostPointerCapture: cancel,
		}),
	};
}

type Gesture = ReturnType<typeof useGesture>;
const EDGE_FIELDS = ["top", "right", "bottom", "left"] as const;
const FIELD_LABEL: Record<GestureField, string> = {
	width: "Width",
	top: "Top padding",
	right: "Right padding",
	bottom: "Bottom padding",
	left: "Left padding",
	gap: "Gap",
};

function GestureOverlay({
	gesture,
	values,
	context,
	focus,
	onFocus,
	gapTop,
	token,
	hasGap,
	gapAxis,
}: {
	gesture: Gesture;
	values: Record<GestureField, number>;
	context: boolean;
	focus: GestureField;
	onFocus: (field: GestureField) => void;
	gapTop: number;
	token: (field: GestureField) => string;
	hasGap: boolean;
	gapAxis: GestureAxis;
}) {
	const lit = gesture.active ?? focus;
	const bandStyle: Record<(typeof EDGE_FIELDS)[number], CSSProperties> = {
		top: { top: 0, left: 0, right: 0, height: values.top },
		right: { top: values.top, bottom: values.bottom, right: 0, width: values.right },
		bottom: { bottom: 0, left: 0, right: 0, height: values.bottom },
		left: { top: values.top, bottom: values.bottom, left: 0, width: values.left },
	};
	const handleStyle: Record<(typeof EDGE_FIELDS)[number], CSSProperties> = {
		top: { top: values.top - Math.max(8, Math.min(22, values.top)), height: Math.max(8, Math.min(22, values.top)) },
		right: {
			right: values.right - Math.max(8, Math.min(22, values.right)),
			width: Math.max(8, Math.min(22, values.right)),
		},
		bottom: {
			bottom: values.bottom - Math.max(8, Math.min(22, values.bottom)),
			height: Math.max(8, Math.min(22, values.bottom)),
		},
		left: {
			left: values.left - Math.max(8, Math.min(22, values.left)),
			width: Math.max(8, Math.min(22, values.left)),
		},
	};
	return (
		<>
			<button
				type="button"
				aria-label="Drag width"
				title="Drag width"
				data-gesture="width"
				className="pm-gesture-handle pm-gesture-edge"
				onPointerEnter={() => onFocus("width")}
				{...gesture.bind("width", "x", 1)}
			/>
			{EDGE_FIELDS.map((edge) => {
				const vertical = edge === "top" || edge === "bottom";
				const visible = !context || edge === lit || gesture.active === edge;
				return (
					<span key={edge}>
						{visible ? (
							<span className="pm-gesture-band" data-active={lit === edge} style={bandStyle[edge]} />
						) : null}
						<button
							type="button"
							aria-label={`Drag ${FIELD_LABEL[edge].toLowerCase()}`}
							title={FIELD_LABEL[edge]}
							data-gesture={edge}
							data-axis={vertical ? "y" : "x"}
							className="pm-gesture-handle pm-gesture-inset"
							style={{ ...handleStyle[edge], opacity: visible ? 1 : 0.27 }}
							onPointerEnter={() => onFocus(edge)}
							{...gesture.bind(edge, vertical ? "y" : "x", edge === "bottom" || edge === "right" ? -1 : 1)}
						/>
					</span>
				);
			})}
			{hasGap && (!context || lit === "gap") ? (
				<span
					className="pm-gesture-band"
					data-active={lit === "gap"}
					style={
						gapAxis === "y"
							? { top: gapTop, height: values.gap, left: values.left, right: values.right }
							: { left: gapTop, width: values.gap, top: values.top, bottom: values.bottom }
					}
				/>
			) : null}
			{hasGap ? (
				<button
					type="button"
					aria-label="Drag gap"
					title="Drag gap between children"
					data-gesture="gap"
					data-axis={gapAxis}
					className="pm-gesture-handle pm-gesture-gap"
					style={gapAxis === "y" ? { top: gapTop + values.gap / 2 - 12 } : { left: gapTop + values.gap / 2 - 12 }}
					onPointerEnter={() => onFocus("gap")}
					{...gesture.bind("gap", gapAxis, 1)}
				/>
			) : null}
			{context && (lit === "top" || lit === "bottom") ? (
				<span
					className="pm-gesture-context-ruler"
					style={{
						left: "calc(50% + 41px)",
						height: values[lit],
						...(lit === "top" ? { top: 0 } : { bottom: 0 }),
					}}
				/>
			) : null}
			<span className="pm-gesture-tip">
				<span>{FIELD_LABEL[lit]}</span>
				<span>{values[lit]} px</span>
				<code>{token(lit)}</code>
				{gesture.active ? (
					<span className="text-muted">{gesture.exact ? "exact" : lit === "width" ? "free" : "project"}</span>
				) : null}
			</span>
			<span className="pm-gesture-measure" style={{ right: -1, bottom: -24 }}>
				{values.width} px
			</span>
		</>
	);
}

function fieldToken(editor: Editor, field: GestureField) {
	const prefixes: Record<GestureField, string> = {
		width: "w",
		top: "pt",
		right: "pr",
		bottom: "pb",
		left: "pl",
		gap: "gap",
	};
	const prefix = prefixes[field];
	const px = editor.values[field];
	return `${prefix}-${Number.isInteger(px / editor.step) ? px / editor.step : `[${px}px]`}`;
}

function GestureRail({
	editor,
	gesture,
	focus,
	onFocus,
	context,
}: {
	editor: Editor;
	gesture: Gesture;
	focus: GestureField;
	onFocus: (field: GestureField) => void;
	context: boolean;
}) {
	const lit = gesture.active ?? focus;
	const stops = [0, 1, 2, 3, 4, 6, 8].map((multiple) => multiple * editor.step);
	return (
		<div className="flex h-full flex-col text-text">
			<div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
				<span className="font-semibold text-sm">Properties</span>
				<span className="font-mono text-[10px] text-muted">{editor.target}</span>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="border-b border-border px-4 py-4">
					<div className="flex items-center justify-between">
						<span className="text-sm">Size</span>
						<span className="font-mono text-[10px] text-muted">
							{editor.values.widthMode} × {editor.values.heightMode}
						</span>
					</div>
					<label className="mt-3 flex h-8 items-center gap-3 rounded-sm border border-border px-2.5">
						<span className="font-mono text-[11px] text-muted">W</span>
						<input
							aria-label="Width pixels"
							type="number"
							min={8}
							max={640}
							className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none"
							value={editor.values.width}
							onFocus={() => onFocus("width")}
							onChange={(event) => {
								const value = Number(event.target.value);
								if (Number.isFinite(value)) editor.set("width", value, true);
							}}
						/>
						<span className="font-mono text-[10px] text-muted">px</span>
					</label>
				</div>
				<div className="border-b border-border px-4 py-4">
					<div className="flex items-center justify-between">
						<span className="text-sm">Padding</span>
						<span className="font-mono text-[10px] text-muted">{context ? "drag a value" : "each side"}</span>
					</div>
					<div className="pm-gesture-box">
						{EDGE_FIELDS.map((edge) => {
							const vertical = edge === "top" || edge === "bottom";
							return (
								<button
									type="button"
									key={edge}
									aria-label={`Scrub ${FIELD_LABEL[edge].toLowerCase()}`}
									title={`Drag to change ${FIELD_LABEL[edge].toLowerCase()}`}
									data-edge={edge}
									data-lit={lit === edge}
									onPointerEnter={() => onFocus(edge)}
									onFocus={() => onFocus(edge)}
									{...gesture.bind(edge, vertical ? "y" : "x", 1, true)}
									onKeyDown={(event) => {
										if (event.key === "ArrowUp" || event.key === "ArrowRight") {
											event.preventDefault();
											editor.set(edge, editor.values[edge] + editor.step);
										} else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
											event.preventDefault();
											editor.set(edge, editor.values[edge] - editor.step);
										}
									}}
								>
									{editor.values[edge]}
								</button>
							);
						})}
						<span className="pm-gesture-box-center">content</span>
					</div>
					<div className="mt-4 flex items-center justify-between text-xs">
						<span className="text-muted">Gap</span>
						<label className="flex h-7 w-[78px] items-center gap-2 rounded-sm border border-border px-2">
							<input
								aria-label="Gap pixels"
								disabled={editor.target !== "card"}
								type="number"
								min={0}
								max={96}
								className="min-w-0 w-full bg-transparent font-mono text-xs outline-none"
								value={editor.values.gap}
								onFocus={() => onFocus("gap")}
								onChange={(event) => {
									const value = Number(event.target.value);
									if (Number.isFinite(value)) editor.set("gap", value);
								}}
							/>
							<span className="font-mono text-[10px] text-muted">px</span>
						</label>
					</div>
				</div>
				<div className="border-b border-border px-4 py-4">
					<div className="flex items-center justify-between">
						<span className="text-sm">Spacing scale</span>
						<select
							aria-label="Project spacing unit"
							value={editor.step}
							className="bg-transparent font-mono text-[11px] text-muted outline-none"
							onChange={(event) => editor.setStep(event.target.value === "6" ? 6 : 4)}
						>
							<option value={4}>4 px</option>
							<option value={6}>6 px</option>
						</select>
					</div>
					<div className="pm-gesture-stops">
						{stops.map((stop) => (
							<button
								type="button"
								key={stop}
								aria-label={`Set ${FIELD_LABEL[lit].toLowerCase()} to ${stop} pixels`}
								data-active={editor.values[lit] === stop}
								disabled={lit === "width"}
								onClick={() => editor.set(lit, stop)}
							>
								{stop}
							</button>
						))}
					</div>
					<p className="text-[11px] leading-[17px] text-muted">
						Padding and gaps settle on the project scale. Hold <kbd className="font-mono text-text">alt</kbd> for
						exact pixels.
					</p>
				</div>
				<div className="px-4 py-4">
					<span className="text-sm">{FIELD_LABEL[lit]}</span>
					<div className="mt-2 flex items-center justify-between font-mono text-[11px]">
						<code className="text-thread">{fieldToken(editor, lit)}</code>
						<span className="text-muted">{editor.values[lit]} px</span>
					</div>
					<p className="mt-3 text-[11px] leading-[17px] text-muted">
						{context
							? "Point to a side here or on the canvas. Both show the same space."
							: "The bars inside adjust padding. The square on the outside adjusts width."}
					</p>
				</div>
			</div>
			<div className="border-t border-border px-4 py-3">
				<div className="flex justify-between gap-3">
					<button
						type="button"
						disabled={!editor.canUndo}
						onClick={editor.undo}
						className="font-mono text-[11px] text-muted enabled:hover:text-text disabled:opacity-30"
					>
						undo ⌘Z
					</button>
					<button
						type="button"
						onClick={editor.reset}
						className="font-mono text-[11px] text-muted hover:text-text"
					>
						reset
					</button>
				</div>
				<p className="mt-2 font-mono text-[10px] text-muted/60">one drag · one undo · esc cancels</p>
			</div>
		</div>
	);
}

function useEditorGesture(editor: Editor) {
	return useGesture({
		read: (field) => editor.values[field],
		begin: editor.begin,
		preview: (field, value, exact) =>
			editor.preview(
				field,
				Math.max(field === "width" ? 8 : 0, Math.min(field === "width" ? 640 : 96, value)),
				field === "width" || exact,
			),
		commit: editor.commit,
		cancel: editor.cancel,
	});
}

function GestureDocument({
	editor,
	gesture,
	context,
	focus,
	onFocus,
}: {
	editor: Editor;
	gesture: Gesture;
	context: boolean;
	focus: GestureField;
	onFocus: (field: GestureField) => void;
}) {
	return (
		<PropertiesScene
			editor={editor}
			overlay={(geometry) => {
				const horizontal = editor.values.direction === "row";
				const gapStart = horizontal ? geometry.gapX : geometry.gapY;
				return (
					<div
						ref={gesture.documentRef}
						className="absolute inset-0 pointer-events-none"
						data-gesture-overlay={context ? "context" : "inset"}
						data-active={gesture.active ?? ""}
					>
						<GestureOverlay
							gesture={gesture}
							values={{
								width: geometry.width,
								top: editor.values.top,
								right: editor.values.right,
								bottom: editor.values.bottom,
								left: editor.values.left,
								gap: editor.values.gap,
							}}
							context={context}
							focus={editor.target !== "card" && focus === "gap" ? "top" : focus}
							onFocus={onFocus}
							gapTop={gapStart}
							gapAxis={horizontal ? "x" : "y"}
							token={(field) => fieldToken(editor, field)}
							hasGap={editor.target === "card"}
						/>
					</div>
				);
			}}
		/>
	);
}

export function GestureScene({ editor, context }: { editor: Editor; context: boolean }) {
	const [focus, setFocus] = useState<GestureField>("top");
	const gesture = useEditorGesture(editor);
	return <GestureDocument editor={editor} gesture={gesture} context={context} focus={focus} onFocus={setFocus} />;
}

export function GestureTake({ take }: { take: "inset" | "context" }) {
	const editor = useProperties();
	const [focus, setFocus] = useState<GestureField>("top");
	const gesture = useEditorGesture(editor);
	const context = take === "context";
	return (
		<SpoolShell activeTab="weekend" tabs={["weekend"]} zoom="100%">
			<CanvasChrome
				pages={[{ name: "weekend", frames: ["stay"], active: true, open: true }]}
				selected="stay"
				tool="edit"
				rail={<GestureRail editor={editor} gesture={gesture} focus={focus} onFocus={setFocus} context={context} />}
				railWidth={300}
			>
				<GestureDocument editor={editor} gesture={gesture} context={context} focus={focus} onFocus={setFocus} />
				<div className="absolute bottom-[75px] left-5 right-5 border-t border-border pt-3">
					<p className="mb-2 text-xs text-muted">
						{context ? "The same padding, in two places." : "Shape from the outside. Space from within."}
					</p>
					<SourceLine editor={editor} />
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}
