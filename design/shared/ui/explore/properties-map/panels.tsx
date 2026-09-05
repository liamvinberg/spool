import { useEffect, useState, type ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { useProperties, readValues, type Editor } from "shared/lib/explore/properties-map/model";
import { PropertiesScene } from "shared/ui/explore/properties-map/scene";
import { SpoolShell } from "shared/ui/spool/shell";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import "shared/ui/explore/properties-map/panels.css";

type Alignment = "start" | "center" | "end";
type Direction = "row" | "column";
type Sizing = "content" | "fill" | "fixed";
type Focus = "Size" | "Layout" | "Spacing" | "Appearance" | "Text";

function NumberField({
	label,
	value,
	onChange,
	min = 0,
	max = 1000,
	suffix,
}: {
	label: string;
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
	suffix?: string;
}) {
	return (
		<label className="visual-field">
			<span className="shrink-0 text-[10px] text-muted">
				{label === "Horizontal padding"
					? "↔"
					: label === "Vertical padding"
						? "↕"
						: label.endsWith(" padding")
							? label.slice(0, -8)
							: label}
			</span>
			<input
				aria-label={label}
				type="number"
				min={min}
				max={max}
				value={value}
				onChange={(event) => {
					const value = Number(event.target.value);
					if (Number.isFinite(value)) onChange(Math.min(max, Math.max(min, value)));
				}}
			/>
			{suffix ? <span className="text-[10px] text-muted/60">{suffix}</span> : null}
		</label>
	);
}

function Segments<T extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: T;
	options: readonly { value: T; label: ReactNode; title: string }[];
	onChange: (value: T) => void;
}) {
	return (
		<div className="visual-segment" aria-label={label}>
			{options.map((option) => (
				<button
					type="button"
					key={option.value}
					aria-label={option.title}
					title={option.title}
					aria-pressed={value === option.value}
					onClick={() => onChange(option.value)}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

function LayoutGlyph({ direction }: { direction: Direction }) {
	return (
		<span className={cn("inline-flex items-center justify-center gap-[3px]", direction === "column" && "flex-col")}>
			<i
				className={cn(
					"block rounded-[1px] border border-current",
					direction === "row" ? "h-3 w-[5px]" : "h-[4px] w-3",
				)}
			/>
			<i
				className={cn(
					"block rounded-[1px] border border-current",
					direction === "row" ? "h-3 w-[5px]" : "h-[4px] w-3",
				)}
			/>
		</span>
	);
}

function AlignGrid({
	direction,
	align,
	justify,
	onChange,
}: {
	direction: Direction;
	align: string;
	justify: string;
	onChange: (align: Alignment, justify: Alignment) => void;
}) {
	const positions = ["start", "center", "end"] as const;
	return (
		<div
			className="grid h-[82px] w-[82px] shrink-0 grid-cols-3 gap-[3px] rounded-md border border-border-raised p-[7px]"
			aria-label="Alignment"
		>
			{positions.flatMap((vertical) =>
				positions.map((horizontal) => {
					const selected =
						direction === "row"
							? align === vertical && justify === horizontal
							: align === horizontal && justify === vertical;
					return (
						<button
							type="button"
							key={`${vertical}-${horizontal}`}
							aria-label={`Align ${vertical} ${horizontal}`}
							title={`Align ${vertical} ${horizontal}`}
							aria-pressed={selected}
							onClick={() =>
								onChange(
									direction === "row" ? vertical : horizontal,
									direction === "row" ? horizontal : vertical,
								)
							}
							className={cn(
								"flex items-center justify-center rounded-sm hover:bg-raised",
								selected && "bg-thread/10",
							)}
						>
							<span
								className={cn(
									"rounded-[1px]",
									selected
										? "h-[11px] w-[11px] border border-thread bg-thread/15"
										: "h-[3px] w-[3px] bg-muted/45",
								)}
							/>
						</button>
					);
				}),
			)}
		</div>
	);
}

function SizeControl({
	axis,
	mode,
	value,
	onMode,
	onValue,
	fillDisabled = false,
}: {
	fillDisabled?: boolean;
	axis: "Width" | "Height";
	mode: Sizing;
	value: number;
	onMode: (mode: Sizing) => void;
	onValue: (value: number) => void;
}) {
	return (
		<div className="space-y-1.5">
			<span className="text-[10px] text-muted">{axis}</span>
			<div className="visual-field !gap-1 !px-2">
				<span className="w-3 shrink-0 font-mono text-[10px] text-muted/60">{axis[0]}</span>
				{mode === "fixed" ? (
					<input
						aria-label={`${axis} pixels`}
						className="!w-0 flex-1"
						type="number"
						min={1}
						value={value}
						onChange={(event) => onValue(Math.max(1, Number(event.target.value)))}
					/>
				) : null}
				<select
					aria-label={`${axis} sizing`}
					title={fillDisabled ? "Fill needs a parent with a fixed height." : undefined}
					className={cn(
						"min-w-0 flex-1 bg-transparent text-[11px]",
						mode === "fixed" && "!w-6 !flex-none text-muted",
					)}
					value={mode}
					onChange={(event) => {
						const next = event.target.value;
						if (next === "content" || next === "fixed" || (next === "fill" && !fillDisabled)) onMode(next);
					}}
				>
					<option value="content">Content</option>
					<option value="fill" disabled={fillDisabled}>
						Fill
					</option>
					<option value="fixed">{mode === "fixed" ? "px" : "Fixed"}</option>
				</select>
				<span className="text-[9px] text-muted/60">⌄</span>
			</div>
		</div>
	);
}

function PaddingEditor({
	values,
	write,
	diagram = false,
}: {
	values: VisualValues;
	write: VisualWrite;
	diagram?: boolean;
}) {
	const [opened, setOpened] = useState(false);
	const mixed = values.left !== values.right || values.top !== values.bottom;
	const individual = mixed || opened;
	const sides = [
		{ key: "top", label: "Top padding", position: "left-1/2 top-[5px] -translate-x-1/2" },
		{ key: "right", label: "Right padding", position: "right-[5px] top-1/2 -translate-y-1/2" },
		{ key: "bottom", label: "Bottom padding", position: "bottom-[5px] left-1/2 -translate-x-1/2" },
		{ key: "left", label: "Left padding", position: "left-[5px] top-1/2 -translate-y-1/2" },
	] as const;
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<span className="text-[10px] text-muted">Padding</span>
				<button
					type="button"
					aria-label="Edit individual padding"
					aria-expanded={individual}
					disabled={mixed}
					title={
						mixed
							? "Sides have different values."
							: individual
								? "Show paired padding controls"
								: "Edit each side separately"
					}
					onClick={() => setOpened(!opened)}
					className={cn(
						"rounded px-1.5 py-1 text-[10px] hover:bg-surface",
						individual ? "text-text" : "text-muted",
					)}
				>
					<span className="mr-1.5">⊞</span>
					{individual ? "Individual sides" : "Sides"}
				</button>
			</div>
			{diagram ? (
				<div className="relative flex h-[110px] items-center justify-center rounded-md border border-border-raised bg-surface/30">
					<span className="pointer-events-none absolute inset-x-[43px] inset-y-[28px] rounded-[3px] border border-dashed border-muted/30" />
					<span className="text-[10px] text-muted/45">content</span>
					{sides.map(({ key, label, position }) =>
						individual || key === "top" || key === "left" ? (
							<label key={key} className={cn("absolute", position)}>
								<input
									aria-label={individual ? label : key === "top" ? "Vertical padding" : "Horizontal padding"}
									className="w-9 bg-transparent text-center font-mono text-[11px]"
									value={values[key]}
									type="number"
									min={0}
									onChange={(event) =>
										write(
											individual ? key : key === "top" ? "paddingY" : "paddingX",
											Math.max(0, Number(event.target.value)),
										)
									}
								/>
							</label>
						) : (
							<span
								key={key}
								className={cn("absolute w-9 text-center font-mono text-[11px] text-muted/50", position)}
							>
								{values[key]}
							</span>
						),
					)}
				</div>
			) : individual ? (
				<div className="grid grid-cols-2 gap-2">
					{sides.map(({ key, label }) => (
						<NumberField
							key={key}
							label={label}
							value={values[key]}
							onChange={(value) => write(key, value)}
							suffix="px"
						/>
					))}
				</div>
			) : (
				<div>
					<div className="grid grid-cols-2 gap-2">
						<NumberField
							label="Horizontal padding"
							value={values.paddingX}
							onChange={(value) => write("paddingX", value)}
							suffix="px"
						/>
						<NumberField
							label="Vertical padding"
							value={values.paddingY}
							onChange={(value) => write("paddingY", value)}
							suffix="px"
						/>
					</div>
					<div className="mt-1.5 flex justify-between text-[10px] text-muted/60">
						<span>Horizontal</span>
						<span>Vertical</span>
					</div>
				</div>
			)}
		</div>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="visual-section">
			<h3>{title}</h3>
			{children}
		</section>
	);
}

interface VisualValues {
	direction: Direction;
	align: Alignment;
	justify: Alignment | "between";
	gap: number;
	paddingX: number;
	paddingY: number;
	top: number;
	right: number;
	bottom: number;
	left: number;
	widthMode: Sizing;
	heightMode: Sizing;
	width: number;
	height: number;
	fill: string;
	radius: number;
	opacity: number;
	fontSize: number;
	fontWeight: number;
	text: string;
}

type VisualWrite = <K extends keyof VisualValues>(key: K, value: VisualValues[K]) => void;

function SizeEditor({
	values,
	write,
	canFillHeight,
}: {
	values: VisualValues;
	write: VisualWrite;
	canFillHeight: boolean;
}) {
	return (
		<div className="grid grid-cols-2 gap-2">
			<SizeControl
				axis="Width"
				mode={values.widthMode}
				value={values.width}
				onMode={(value) => write("widthMode", value)}
				onValue={(value) => write("width", value)}
			/>
			<SizeControl
				axis="Height"
				fillDisabled={!canFillHeight}
				mode={values.heightMode}
				value={values.height}
				onMode={(value) => write("heightMode", value)}
				onValue={(value) => write("height", value)}
			/>
		</div>
	);
}

function LayoutEditor({
	values,
	write,
	alignBoth,
}: {
	values: VisualValues;
	write: VisualWrite;
	alignBoth: (align: Alignment, justify: Alignment) => void;
}) {
	return (
		<div className="space-y-3">
			<Segments
				label="Direction"
				value={values.direction}
				options={[
					{
						value: "row",
						label: (
							<span className="inline-flex items-center gap-2">
								<LayoutGlyph direction="row" />
								Row
							</span>
						),
						title: "Arrange in a row",
					},
					{
						value: "column",
						label: (
							<span className="inline-flex items-center gap-2">
								<LayoutGlyph direction="column" />
								Column
							</span>
						),
						title: "Arrange in a column",
					},
				]}
				onChange={(value) => write("direction", value)}
			/>
			<div className="flex gap-3">
				<AlignGrid
					direction={values.direction}
					align={values.align}
					justify={values.justify}
					onChange={alignBoth}
				/>
				<div className="min-w-0 flex-1 space-y-2">
					<NumberField label="Gap" value={values.gap} onChange={(value) => write("gap", value)} suffix="px" />
					<button
						type="button"
						aria-pressed={values.justify === "between"}
						onClick={() => write("justify", values.justify === "between" ? "center" : "between")}
						className={cn(
							"flex h-8 w-full items-center justify-between rounded px-2 text-[11px] hover:bg-surface",
							values.justify === "between" ? "bg-surface text-text" : "text-muted",
						)}
					>
						<span>Space between</span>
						<span className="text-base">{values.justify === "between" ? "✓" : "↔"}</span>
					</button>
				</div>
			</div>
		</div>
	);
}

const FILLS = ["#f5391a", "#bd301b", "#356653", "#405b8b", "#ffffff", "#24312b"];
function FillChoices({ value, onChange }: { value: string; onChange: (value: string) => void }) {
	return (
		<div className="flex items-center gap-2">
			{FILLS.map((fill) => (
				<button
					type="button"
					aria-label={`Use fill ${fill}`}
					title={fill}
					key={fill}
					onClick={() => onChange(fill)}
					aria-pressed={value.toLowerCase() === fill}
					className={cn(
						"h-5 w-5 rounded-full border border-white/15",
						value.toLowerCase() === fill && "outline outline-1 outline-offset-[3px] outline-muted",
					)}
					style={{ background: fill }}
				/>
			))}
			<label className="ml-auto flex h-6 w-6 items-center justify-center text-base text-muted" title="Custom fill">
				<span className="absolute pointer-events-none">+</span>
				<input
					aria-label="Custom fill"
					type="color"
					value={value}
					onChange={(event) => onChange(event.target.value)}
					className="h-6 w-6 opacity-0"
				/>
			</label>
		</div>
	);
}

function AppearanceEditor({ values, write }: { values: VisualValues; write: VisualWrite }) {
	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2">
				<label className="visual-field flex-1">
					<input
						aria-label="Fill color"
						className="h-4 !w-4 shrink-0"
						type="color"
						value={values.fill}
						onChange={(event) => write("fill", event.target.value)}
					/>
					<span className="font-mono text-[11px]">{values.fill.slice(1).toUpperCase()}</span>
				</label>
				<div className="w-[112px]">
					<NumberField
						label="Opacity"
						value={values.opacity}
						onChange={(value) => write("opacity", value)}
						max={100}
						suffix="%"
					/>
				</div>
			</div>
			<FillChoices value={values.fill} onChange={(value) => write("fill", value)} />
			<div className="grid grid-cols-2 gap-2">
				<NumberField
					label="Radius"
					value={values.radius}
					onChange={(value) => write("radius", value)}
					suffix="px"
				/>
				<button
					type="button"
					aria-pressed={values.radius === 999}
					onClick={() => write("radius", values.radius === 999 ? 8 : 999)}
					className={cn(
						"flex items-center justify-center gap-2 rounded text-[11px] hover:bg-surface",
						values.radius === 999 ? "bg-surface text-text" : "text-muted",
					)}
				>
					<span className="h-[10px] w-[20px] rounded-full border border-current" />
					Pill
				</button>
			</div>
		</div>
	);
}

function TextEditor({ values, write }: { values: VisualValues; write: VisualWrite }) {
	return (
		<div className="space-y-2">
			<div className="grid grid-cols-2 gap-2">
				<NumberField
					label="Size"
					value={values.fontSize}
					onChange={(value) => write("fontSize", value)}
					min={8}
					max={72}
				/>
				<label className="visual-field">
					<select
						aria-label="Font weight"
						className="w-full bg-transparent text-[11px]"
						value={values.fontWeight}
						onChange={(event) => write("fontWeight", Number(event.target.value))}
					>
						<option value={400}>Regular</option>
						<option value={500}>Medium</option>
						<option value={600}>Semibold</option>
						<option value={700}>Bold</option>
					</select>
					<span className="text-muted/60">⌄</span>
				</label>
			</div>
			<label className="visual-field">
				<input
					aria-label="Element text"
					value={values.text}
					onChange={(event) => write("text", event.target.value)}
				/>
			</label>
		</div>
	);
}

export function VisualRail({ editor, take }: { editor: Editor; take: "inspector" | "context" }) {
	const [focus, setFocus] = useState<Focus | null>(null);
	const [showSource, setShowSource] = useState(false);
	useEffect(() => {
		setFocus(null);
	}, [editor.target]);
	const values: VisualValues = { ...editor.values, paddingX: editor.values.left, paddingY: editor.values.top };
	const write: VisualWrite = (key, value) => {
		if (key === "paddingX" || key === "paddingY") {
			if (typeof value !== "number") return;
			editor.begin();
			editor.preview(key === "paddingX" ? "left" : "top", value, true);
			editor.preview(key === "paddingX" ? "right" : "bottom", value, true);
			editor.commit();
		} else {
			editor.set(key, value, true);
		}
	};
	const alignBoth = (align: Alignment, justify: Alignment) => {
		editor.begin();
		editor.preview("align", align);
		editor.preview("justify", justify);
		editor.commit();
	};
	const title = editor.target === "button" ? "Button" : editor.target === "card" ? "Card" : "Heading";
	const heading = editor.target === "heading";
	const mixedPadding = values.left !== values.right || values.top !== values.bottom;
	const canFillHeight =
		editor.target === "card" || readValues(editor.document.card, editor.step).heightMode !== "content";
	const editPart = (part: Focus) => {
		switch (part) {
			case "Size":
				return <SizeEditor values={values} write={write} canFillHeight={canFillHeight} />;
			case "Layout":
				return <LayoutEditor values={values} write={write} alignBoth={alignBoth} />;
			case "Spacing":
				return <PaddingEditor key={editor.target} values={values} write={write} diagram />;
			case "Appearance":
				return <AppearanceEditor values={values} write={write} />;
			case "Text":
				return <TextEditor values={values} write={write} />;
		}
	};
	const summaries: { label: Focus; value: ReactNode }[] = heading
		? [
				{ label: "Text", value: `${values.fontSize} / ${values.fontWeight}` },
				{ label: "Size", value: `${values.widthMode} × ${values.heightMode}` },
				{ label: "Spacing", value: mixedPadding ? "Mixed" : `${values.paddingX} / ${values.paddingY}` },
			]
		: [
				{ label: "Size", value: `${values.widthMode} × ${values.heightMode}` },
				{
					label: "Layout",
					value: (
						<span className="flex items-center gap-2">
							<LayoutGlyph direction={values.direction} />
							<span>
								{values.justify === "between"
									? "Space between"
									: values.justify === "center"
										? "Centered"
										: values.justify === "start"
											? "Start"
											: "End"}{" "}
								· {values.gap}
							</span>
						</span>
					),
				},
				{ label: "Spacing", value: mixedPadding ? "Mixed" : `${values.paddingX} / ${values.paddingY}` },
				{
					label: "Appearance",
					value: (
						<span className="flex items-center gap-2">
							<span className="h-3 w-3 rounded-sm border border-white/15" style={{ background: values.fill }} />
							{values.radius === 999 ? "Pill" : `${values.radius} px`}
						</span>
					),
				},
				...(editor.target === "button"
					? [{ label: "Text" as const, value: `${values.fontSize} / ${values.fontWeight}` }]
					: []),
			];
	const scopeControl = (
		<div className="visual-segment !bg-transparent">
			<button
				type="button"
				onClick={() => editor.setScope("base")}
				aria-pressed={editor.scope === "base"}
				className="!px-3 text-[11px]"
			>
				Default
			</button>
			<button
				type="button"
				onClick={() => editor.setScope("hover")}
				aria-pressed={editor.scope === "hover"}
				className="!px-3 text-[11px]"
			>
				Hover
			</button>
		</div>
	);
	const identity = (
		<div className="px-4 py-3">
			<div className="mb-3 flex items-center gap-2">
				<span className="text-muted">{heading ? "T" : "▱"}</span>
				<h2 className="text-sm font-medium">{title}</h2>
			</div>
			{scopeControl}
		</div>
	);
	const panel = (
		<div className="visual-properties flex h-full min-h-0 flex-col bg-bg">
			<div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
				<span className="text-xs font-medium">Properties</span>
				<button
					type="button"
					aria-label="Undo property change"
					disabled={!editor.canUndo}
					onClick={editor.undo}
					className="text-base text-muted hover:text-text disabled:opacity-30"
				>
					↶
				</button>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{identity}
				{take === "inspector" ? (
					<>
						{heading ? <Section title="Text">{editPart("Text")}</Section> : null}
						<Section title="Size">{editPart("Size")}</Section>
						{heading && mixedPadding ? (
							<Section title="Spacing">
								<PaddingEditor key={editor.target} values={values} write={write} />
							</Section>
						) : null}
						{!heading ? (
							<Section title="Layout">
								{editPart("Layout")}
								<div className="mt-3">
									<PaddingEditor key={editor.target} values={values} write={write} />
								</div>
							</Section>
						) : null}
						{!heading ? <Section title="Appearance">{editPart("Appearance")}</Section> : null}
						{editor.target === "button" ? <Section title="Text">{editPart("Text")}</Section> : null}
					</>
				) : focus ? (
					<section className="visual-section">
						<button
							type="button"
							onClick={() => setFocus(null)}
							className="mb-5 flex items-center gap-2 text-muted hover:text-text"
						>
							<span>←</span>
							<span>{title}</span>
						</button>
						<h3>{focus}</h3>
						{editPart(focus)}
						<p className="mt-4 text-[11px] leading-5 text-muted/60">
							{focus === "Size"
								? "Content fits the element. Fill uses the available space."
								: focus === "Spacing"
									? "Padding around the content."
									: focus === "Layout"
										? "Arrange the contents of this element."
										: focus === "Appearance"
											? "Applied to the selected element."
											: "Edit the text style."}
						</p>
					</section>
				) : (
					<div className="border-t border-border px-4 pb-5">
						{editor.target === "button" || heading ? (
							<label className="mt-4 mb-3 block">
								<span className="mb-2 block text-[11px] text-muted">Text</span>
								<input
									aria-label="Selection text"
									value={values.text}
									onChange={(event) => write("text", event.target.value)}
									className="w-full border-b border-border-raised bg-transparent pb-2 text-[15px] outline-none focus:border-thread"
								/>
							</label>
						) : null}
						{summaries.map(({ label, value }) => (
							<button type="button" key={label} onClick={() => setFocus(label)} className="visual-context-row">
								<span className="text-[11px]">{label}</span>
								<span className="ml-auto text-[11px] text-muted">{value}</span>
								<span className="visual-row-arrow text-muted">→</span>
							</button>
						))}
						{!heading ? (
							<div className="mt-4 border-t border-border pt-4">
								<FillChoices value={values.fill} onChange={(value) => write("fill", value)} />
							</div>
						) : null}
					</div>
				)}
			</div>
			{showSource ? (
				<div className="max-h-[160px] shrink-0 overflow-auto border-t border-border px-4 py-3">
					<code data-class-output className="block break-words font-mono text-[10px] leading-5 text-muted">
						{editor.className}
					</code>
				</div>
			) : null}
			<div className="flex shrink-0 items-center justify-between border-t border-border px-4 py-3 font-mono text-[10px] text-muted/60">
				<button type="button" onClick={() => setShowSource(!showSource)} className="hover:text-text">
					{showSource ? "hide source" : "source ↗"}
				</button>
				<button
					type="button"
					onClick={() => {
						editor.reset();
						setFocus(null);
					}}
					className="hover:text-text"
				>
					reset
				</button>
			</div>
		</div>
	);
	return panel;
}

export function VisualProperties({ take }: { take: "inspector" | "context" }) {
	const editor = useProperties();
	return (
		<div className="h-full bg-bg text-text">
			<SpoolShell activeTab="weekend" tabs={["weekend"]} zoom="100%">
				<CanvasChrome
					pages={[{ name: "weekend", frames: ["stay"], open: true, active: true }]}
					selected="stay"
					tool="edit"
					rail={<VisualRail editor={editor} take={take} />}
					railWidth={take === "inspector" ? 286 : 270}
				>
					<PropertiesScene editor={editor} />
				</CanvasChrome>
			</SpoolShell>
		</div>
	);
}
