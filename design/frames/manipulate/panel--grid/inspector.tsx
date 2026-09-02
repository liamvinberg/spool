import { type ReactNode, useEffect, useRef, useState } from "react";
import {
	chainOf,
	FILE,
	gapOf,
	literalVerdict,
	nudge,
	paddingOf,
	parse,
	type Side,
	sizeVerdict,
	type SourceElement,
	spacingVerdict,
	staticTokens,
	textVerdict,
	tokenOf,
	valueOf,
	valuePx,
	type Verdict,
	withGap,
	withPadding,
	withToken,
	withWord,
	WORDS,
	wordOf,
	wordVerdict,
} from "shared/lib/properties-model";
import { cn } from "shared/lib/utils";
import {
	type Choice,
	chosen,
	colorChoices,
	FONT_FAMILY,
	FONT_SIZE,
	FONT_WEIGHT,
	leadingFallback,
	LETTER_SPACING,
	LINE_HEIGHT,
	RADIUS,
	withChoice,
} from "./token-set";

/* ---------- what the panel is handed ---------- */

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Geometry {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Pick {
	id: string;
	key: string;
}

export interface Reading {
	element: SourceElement;
	pick: Pick;
	className: string;
	text: string | null;
	box: Rect;
	frame: Geometry;
	/** the literal the file was written with, so a spliced token can read as changed */
	origin: string;
	/** the same, split, for the token-by-token compare */
	original: ReadonlySet<string>;
}

export interface Acts {
	setClass: (id: string, next: (className: string | null) => string) => void;
	setText: (id: string, text: string) => void;
	setFrame: (patch: Partial<Geometry>) => void;
	select: (pick: Pick) => void;
	undo: () => void;
	canUndo: boolean;
}

/* ---------- the row: one property, two columns, a hairline under it ---------- */

const LABEL = "font-mono text-2xs leading-3";
const VALUE = "font-mono text-sm leading-4";
const FAINT = "font-mono text-2xs text-muted/50 leading-3";

function Row({ name, ok = true, tall = false, children }: { name: string; ok?: boolean; tall?: boolean; children: ReactNode }) {
	return (
		<div
			className={cn(
				"grid grid-cols-[92px_1fr] items-center gap-2 border-border/80 border-b px-2.5",
				tall ? "py-2" : "h-7",
			)}
		>
			<span className={cn(tall ? "leading-3.5" : "truncate", LABEL, ok ? "text-muted" : "text-muted/40")}>{name}</span>
			<div className="flex min-w-0 items-center gap-1.5">{children}</div>
		</div>
	);
}

function Section({ name, reason, children }: { name: string; reason?: string | undefined; children: ReactNode }) {
	return (
		<div className="border-border-raised border-t">
			<div className="flex h-6 items-center gap-2 px-2.5">
				<span className={cn("shrink-0 text-muted/70", LABEL)}>{name}</span>
				{reason === undefined ? null : <span className={cn("ml-auto min-w-0 truncate", FAINT)}>{reason}</span>}
			</div>
			{children}
		</div>
	);
}

/* ---------- the number: a token, its pixels faint beside it ---------- */

function NumField({
	value,
	px,
	ok,
	changed = false,
	onCommit,
	onStep,
}: {
	value: string;
	px?: string | null;
	ok: boolean;
	changed?: boolean;
	onCommit: (typed: string) => void;
	onStep?: ((direction: 1 | -1, big: boolean) => void) | undefined;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	if (!ok) {
		return (
			<>
				<span className={cn("min-w-0 flex-1 truncate px-1 text-muted/40", VALUE)}>{value}</span>
				{px === undefined || px === null ? null : <span className={cn("ml-auto shrink-0", FAINT)}>{px}</span>}
			</>
		);
	}
	return (
		<>
			<input
				value={draft ?? value}
				spellCheck={false}
				onChange={(event) => setDraft(event.target.value)}
				onFocus={(event) => event.target.select()}
				onBlur={() => {
					if (draft !== null && draft !== value) onCommit(draft);
					setDraft(null);
				}}
				onKeyDown={(event) => {
					event.stopPropagation();
					if (event.key === "Enter") {
						if (draft !== null && draft !== value) onCommit(draft);
						setDraft(null);
						event.currentTarget.blur();
					}
					if (event.key === "Escape") {
						setDraft(null);
						event.currentTarget.blur();
					}
					if ((event.key === "ArrowUp" || event.key === "ArrowDown") && onStep !== undefined) {
						event.preventDefault();
						setDraft(null);
						onStep(event.key === "ArrowUp" ? 1 : -1, event.shiftKey);
					}
				}}
				className={cn(
					"min-w-0 flex-1 rounded-xs border border-transparent bg-transparent px-1 outline-none hover:bg-surface focus:border-thread/70 focus:bg-surface",
					VALUE,
					changed ? "text-thread" : "text-text",
				)}
			/>
			{px === undefined || px === null ? null : <span className={cn("ml-auto shrink-0", FAINT)}>{px}</span>}
		</>
	);
}

/* ---------- the menu: words and tokens, picked by name ---------- */

const MENU_H = 280;

function MenuField({
	current,
	options,
	ok,
	changed = false,
	onPick,
}: {
	current: Choice;
	options: readonly Choice[];
	ok: boolean;
	changed?: boolean;
	onPick: (token: string | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const [at, setAt] = useState({ left: 0, top: 0, width: 0 });
	const [cursor, setCursor] = useState(0);
	const buttonRef = useRef<HTMLButtonElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!open) return;
		listRef.current?.focus();
	}, [open]);

	useEffect(() => {
		if (!open) return;
		listRef.current?.children[cursor]?.scrollIntoView({ block: "nearest" });
	}, [open, cursor]);

	if (!ok) {
		return (
			<>
				{current.swatch === undefined ? null : <SwatchChip color={current.swatch} />}
				<span className={cn("min-w-0 flex-1 truncate px-1 text-muted/40", VALUE)}>{current.name}</span>
				{current.value === "" ? null : <span className={cn("ml-auto shrink-0", FAINT)}>{current.value}</span>}
			</>
		);
	}

	const show = () => {
		const rect = buttonRef.current?.getBoundingClientRect();
		if (rect === undefined) return;
		const width = Math.max(rect.width, 232);
		const height = Math.min(options.length * 24 + 8, MENU_H);
		const below = rect.bottom + 4;
		const flip = below + height > innerHeight - 8;
		setAt({
			left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)),
			top: flip ? Math.max(8, rect.top - 4 - height) : below,
			width,
		});
		setCursor(Math.max(0, options.findIndex((option) => option.token === current.token)));
		setOpen(true);
	};

	const swatched = options.some((option) => option.swatch !== undefined);

	const commit = (index: number) => {
		const option = options[index];
		if (option !== undefined) onPick(option.token);
		setOpen(false);
		buttonRef.current?.focus();
	};

	return (
		<>
			<button
				ref={buttonRef}
				type="button"
				onClick={() => (open ? setOpen(false) : show())}
				onKeyDown={(event) => {
					event.stopPropagation();
					if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						show();
					}
				}}
				className={cn(
					"flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-xs border border-transparent px-1 py-0.5 text-left hover:bg-surface focus:border-thread/70 focus:bg-surface focus:outline-none",
					open && "border-thread/70 bg-surface",
				)}
			>
				{current.swatch === undefined ? null : <SwatchChip color={current.swatch} />}
				<span className={cn("shrink-0", VALUE, changed ? "text-thread" : "text-text")}>{current.name}</span>
				{current.value === "" ? null : (
					<span className={cn("ml-auto min-w-0 truncate pl-1", FAINT)}>{current.value}</span>
				)}
			</button>
			{open ? (
				<>
					<span className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />
					<div
						ref={listRef}
						tabIndex={-1}
						role="listbox"
						onBlur={() => setOpen(false)}
						onKeyDown={(event) => {
							event.stopPropagation();
							if (event.key === "Escape" || event.key === "Tab") {
								setOpen(false);
								buttonRef.current?.focus();
							}
							if (event.key === "ArrowDown") {
								event.preventDefault();
								setCursor((index) => (index + 1) % options.length);
							}
							if (event.key === "ArrowUp") {
								event.preventDefault();
								setCursor((index) => (index - 1 + options.length) % options.length);
							}
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								commit(cursor);
							}
						}}
						style={{ left: at.left, top: at.top, width: at.width }}
						className="fixed z-50 max-h-[280px] overflow-y-auto rounded-sm border border-border-raised bg-raised py-1 outline-none"
					>
						{options.map((option, index) => {
							const worn = option.token === current.token;
							return (
								<button
									key={option.name}
									type="button"
									role="option"
									aria-selected={worn}
									tabIndex={-1}
									onPointerEnter={() => setCursor(index)}
									onClick={() => commit(index)}
									className={cn(
										"flex h-6 w-full cursor-pointer items-center gap-1.5 px-2 text-left",
										index === cursor && "bg-surface",
									)}
								>
									{option.swatch === undefined ? (
										swatched ? <span className="w-3 shrink-0" /> : null
									) : (
										<SwatchChip color={option.swatch} />
									)}
									<span className={cn("min-w-0 truncate", VALUE, worn ? "text-thread" : "text-text")}>{option.name}</span>
									{option.value === "" ? null : <span className={cn("ml-auto shrink-0 pl-2", FAINT)}>{option.value}</span>}
								</button>
							);
						})}
					</div>
				</>
			) : null}
		</>
	);
}

function SwatchChip({ color }: { color: string }) {
	return (
		<span
			className="h-3 w-3 shrink-0 rounded-[2px] border border-border-raised"
			style={{ background: color === "" ? "transparent" : color }}
		/>
	);
}

/* ---------- the icon set: the words that are pictures ---------- */

function IconField({
	value,
	options,
	ok,
	onPick,
}: {
	value: string;
	options: readonly { token: string; icon: ReactNode }[];
	ok: boolean;
	onPick: (token: string) => void;
}) {
	return (
		<span className={cn("flex items-center gap-px rounded-xs border border-border bg-surface p-px", !ok && "border-transparent bg-transparent")}>
			{options.map((option) => {
				const on = option.token === value;
				return (
					<button
						key={option.token}
						type="button"
						title={option.token}
						aria-label={option.token}
						aria-pressed={on}
						disabled={!ok}
						onClick={() => onPick(option.token)}
						className={cn(
							"flex h-5 w-6 items-center justify-center rounded-[3px] focus:outline-none focus-visible:bg-raised",
							ok ? "cursor-pointer" : "cursor-default",
							on && ok && "bg-raised text-text",
							on && !ok && "bg-surface text-muted/40",
							!on && (ok ? "text-muted/70 hover:text-text" : "text-muted/25"),
						)}
					>
						{option.icon}
					</button>
				);
			})}
		</span>
	);
}

/**
 * Nine dots for `items-*` and `justify-*` at once. Columns are the main axis
 * and rows the cross axis, so the grid turns when `flex-direction` does. The
 * two menus beside it hold the values no dot can say, `baseline`, `stretch`,
 * `between`, `around`, `evenly`.
 */
function PlaceField({
	align,
	justify,
	column,
	ok,
	onPick,
}: {
	align: string | null;
	justify: string | null;
	column: boolean;
	ok: boolean;
	onPick: (align: string, justify: string) => void;
}) {
	const THREE = ["start", "center", "end"] as const;
	const alignSays = align === null ? "stretch" : align.slice("items-".length);
	const justifySays = justify === null ? "start" : justify.slice("justify-".length);
	const spread = !THREE.includes(justifySays as (typeof THREE)[number]);
	return (
		<span
			className={cn(
				"grid h-11 w-11 shrink-0 grid-cols-3 grid-rows-3 gap-px rounded-xs border border-border bg-surface p-0.5",
				!ok && "border-transparent bg-transparent",
			)}
		>
			{[0, 1, 2].flatMap((row) =>
				[0, 1, 2].map((col) => {
					const main = THREE[column ? row : col] ?? "start";
					const cross = THREE[column ? col : row] ?? "start";
					const stretched = alignSays === "stretch";
					const on = !spread && main === justifySays && (cross === alignSays || stretched);
					return (
						<button
							key={`${row}-${col}`}
							type="button"
							disabled={!ok}
							tabIndex={-1}
							title={`items-${cross} justify-${main}`}
							onClick={() => onPick(`items-${cross}`, `justify-${main}`)}
							className={cn("flex items-center justify-center rounded-[2px]", ok ? "cursor-pointer hover:bg-raised" : "cursor-default")}
						>
							<span
								className={cn(
									on && stretched
										? cn("rounded-[1px] bg-thread", column ? "h-[3px] w-full" : "h-full w-[3px]")
										: on
											? "h-[5px] w-[5px] rounded-full bg-thread"
											: "h-[3px] w-[3px] rounded-full bg-muted/30",
								)}
							/>
						</button>
					);
				}),
			)}
		</span>
	);
}

/* ---------- icons ---------- */

function ArrowIcon({ down = false }: { down?: boolean }) {
	return (
		<svg viewBox="0 0 12 12" className={cn("h-3 w-3", down && "rotate-90")} fill="none" aria-hidden="true">
			<path d="M2 6h7M6.5 3.5 9 6l-2.5 2.5" stroke="currentColor" strokeWidth="1.3" />
		</svg>
	);
}

function LinesIcon({ at }: { at: "left" | "center" | "right" }) {
	const x = (w: number) => (at === "left" ? 2 : at === "center" ? 6 - w / 2 : 10 - w);
	return (
		<svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
			<path d={`M2 3h8M${x(6)} 6h6M${x(8)} 9h8`} stroke="currentColor" strokeWidth="1.2" />
		</svg>
	);
}

function SidesToggle({ open, ok, onToggle }: { open: boolean; ok: boolean; onToggle: () => void }) {
	if (!ok) return null;
	return (
		<button
			type="button"
			aria-label={open ? "fold" : "unfold"}
			aria-expanded={open}
			onClick={onToggle}
			className={cn(
				"ml-auto flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-[3px] focus:outline-none focus-visible:bg-raised",
				open ? "bg-raised text-text" : "text-muted/60 hover:text-text",
			)}
		>
			<svg viewBox="0 0 12 12" className={cn("h-2.5 w-2.5 transition-transform duration-150", open && "rotate-90")} fill="none" aria-hidden="true">
				<path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.3" />
			</svg>
		</button>
	);
}

/* ---------- reading the verdicts ---------- */

function reasonFor(element: SourceElement, verdict: Verdict): string | undefined {
	if (verdict.ok) return undefined;
	if (element.shared !== undefined) return `shared, ${element.shared.frames} frames`;
	return verdict.reason;
}

/**
 * A refusal that covers the whole element is said once, beside the crumbs. A
 * section only carries a reason of its own, and only when the literal is
 * otherwise writable.
 */
function sectionReason(element: SourceElement, verdict: Verdict): string | undefined {
	return literalVerdict(element).ok ? reasonFor(element, verdict) : undefined;
}

function px(value: string | null): string | null {
	if (value === null) return null;
	const measured = valuePx(value);
	return measured === null ? null : `${measured}px`;
}

/* ---------- the panel ---------- */

export function Inspector({ reading, acts }: { reading: Reading | null; acts: Acts }) {
	return (
		<div className="flex h-full min-h-0 w-[300px] shrink-0 flex-col border-border border-l bg-bg">
			<Head reading={reading} acts={acts} />
			{reading === null ? null : (
				<div className="min-h-0 flex-1 overflow-y-auto">
					{reading.element.parent === null ? <FrameSection reading={reading} acts={acts} /> : null}
					<LayoutSection key={`layout-${reading.element.id}`} reading={reading} acts={acts} />
					<BoxSection key={`box-${reading.element.id}`} reading={reading} acts={acts} />
					<PositionSection reading={reading} acts={acts} />
					<BorderSection reading={reading} acts={acts} />
					<ColorSection reading={reading} acts={acts} />
					{reading.element.text === undefined && reading.element.display !== "inline" ? null : (
						<TypeSection reading={reading} acts={acts} />
					)}
					<SourceSection reading={reading} acts={acts} />
				</div>
			)}
		</div>
	);
}

function Head({ reading, acts }: { reading: Reading | null; acts: Acts }) {
	if (reading === null) {
		return (
			<div className="flex h-9 shrink-0 items-center border-border border-b px-2.5">
				<span className={cn("text-muted/50", VALUE)}>no selection</span>
			</div>
		);
	}
	const chain = chainOf(reading.element.id);
	const verdict = literalVerdict(reading.element);
	return (
		<div className="shrink-0 border-border border-b">
			<div className="flex h-9 items-center gap-2 px-2.5">
			<span className={cn("flex min-w-0 items-center gap-1 truncate", VALUE)}>
				{chain.map((element, index) => {
					const last = index === chain.length - 1;
					return (
						<span key={element.id} className="flex shrink-0 items-center gap-1">
							<button
								type="button"
								onClick={() => acts.select({ id: element.id, key: element.mapped === undefined ? element.id : reading.pick.key })}
								className={cn(
									"cursor-pointer rounded-xs px-0.5 focus:outline-none focus-visible:bg-surface",
									last ? "text-thread" : "text-muted hover:text-text",
								)}
							>
								{element.name}
							</button>
							{last ? null : <span className="text-muted/30">/</span>}
						</span>
					);
				})}
			</span>
			</div>
			{verdict.ok ? null : (
				<div className="flex h-5 items-center px-2.5 pb-1">
					<span className={cn("min-w-0 truncate", FAINT)}>{reasonFor(reading.element, verdict)}</span>
				</div>
			)}
		</div>
	);
}

/** the frame root's own box is four keys in frame.json, and they keep their names */
function FrameSection({ reading, acts }: { reading: Reading; acts: Acts }) {
	const keys = ["x", "y", "w", "h"] as const;
	return (
		<Section name="frame.json">
			{keys.map((key) => (
				<Row key={key} name={key}>
					<NumField
						value={String(reading.frame[key])}
						px="px"
						ok
						onCommit={(typed) => {
							const next = Number.parseInt(typed, 10);
							if (!Number.isNaN(next)) acts.setFrame({ [key]: key === "w" || key === "h" ? Math.max(80, next) : next });
						}}
						onStep={(direction, big) => {
							const next = reading.frame[key] + direction * (big ? 40 : 4);
							acts.setFrame({ [key]: key === "w" || key === "h" ? Math.max(80, next) : next });
						}}
					/>
				</Row>
			))}
		</Section>
	);
}

const DISPLAY: readonly Choice[] = [
	{ token: "flex", name: "flex", value: "" },
	{ token: "grid", name: "grid", value: "" },
	{ token: "block", name: "block", value: "" },
	{ token: "inline-flex", name: "inline-flex", value: "" },
	{ token: "inline-block", name: "inline-block", value: "" },
	{ token: "hidden", name: "hidden", value: "none" },
];

const WRAP: readonly Choice[] = [
	{ token: "flex-nowrap", name: "flex-nowrap", value: "" },
	{ token: "flex-wrap", name: "flex-wrap", value: "" },
];

const ITEMS: readonly Choice[] = WORDS.align.options.map((option) => ({ token: option.token, name: option.token, value: "" }));
const JUSTIFY: readonly Choice[] = WORDS.justify.options.map((option) => ({ token: option.token, name: option.token, value: "" }));
const POSITION: readonly Choice[] = WORDS.position.options.map((option) => ({ token: option.token, name: option.token, value: "" }));
const OVERFLOW: readonly Choice[] = WORDS.overflow.options.map((option) => ({ token: option.token, name: option.token, value: "" }));

/** what the property reads as when the class says nothing */
function fallback(name: string): Choice {
	return { token: null, name, value: "" };
}

function LayoutSection({ reading, acts }: { reading: Reading; acts: Acts }) {
	const words = wordVerdict(reading.element);
	const spacing = spacingVerdict(reading.element);
	const [split, setSplit] = useState(false);
	const set = (next: (className: string | null) => string) => acts.setClass(reading.element.id, next);
	const list = staticTokens(reading.element, reading.className);
	const display = wordOf(reading.className, "display");
	const flex = display === "flex" || display === "inline-flex";
	const grid = display === "grid";
	const column = wordOf(reading.className, "direction") === "flex-col";
	const gap = gapOf(reading.className);
	const was = gapOf(reading.origin);
	const twoGaps = split || gap.x !== gap.y;
	const isNew = (token: string | null) => token !== null && !reading.original.has(token);

	return (
		<Section name="layout" reason={sectionReason(reading.element, words)}>
			<Row name="display" ok={words.ok}>
				<MenuField
					current={display === null ? fallback(reading.element.display) : (DISPLAY.find((o) => o.token === display) ?? fallback(reading.element.display))}
					options={DISPLAY}
					ok={words.ok}
					changed={isNew(display)}
					onPick={(token) => set((className) => withWord(className, "display", token))}
				/>
			</Row>
			{flex ? (
				<>
					<Row name="flex-direction" ok={words.ok}>
						<IconField
							value={wordOf(reading.className, "direction") ?? "flex-row"}
							ok={words.ok}
							options={[
								{ token: "flex-row", icon: <ArrowIcon /> },
								{ token: "flex-col", icon: <ArrowIcon down /> },
							]}
							onPick={(token) => set((className) => withWord(className, "direction", token === "flex-row" ? null : token))}
						/>
						<span className={cn("ml-auto shrink-0", FAINT)}>{column ? "column" : "row"}</span>
					</Row>
					<Row name="flex-wrap" ok={words.ok}>
						<MenuField
							current={chosen(list, WRAP)}
							options={WRAP}
							ok={words.ok}
							changed={isNew(wordOf(reading.className, "wrap"))}
							onPick={(token) => set((className) => withWord(className, "wrap", token === "flex-nowrap" ? null : token))}
						/>
					</Row>
					<Row name="items / justify" ok={words.ok} tall>
						<PlaceField
							align={wordOf(reading.className, "align")}
							justify={wordOf(reading.className, "justify")}
							column={column}
							ok={words.ok}
							onPick={(align, justify) => set((className) => withWord(withWord(className, "align", align), "justify", justify))}
						/>
						<span className="flex min-w-0 flex-1 flex-col gap-1">
							<span className="flex min-w-0 items-center">
								<MenuField
									current={ITEMS.find((o) => o.token === wordOf(reading.className, "align")) ?? fallback("items-stretch")}
									options={ITEMS}
									ok={words.ok}
									changed={isNew(wordOf(reading.className, "align"))}
									onPick={(token) => set((className) => withWord(className, "align", token))}
								/>
							</span>
							<span className="flex min-w-0 items-center">
								<MenuField
									current={JUSTIFY.find((o) => o.token === wordOf(reading.className, "justify")) ?? fallback("justify-start")}
									options={JUSTIFY}
									ok={words.ok}
									changed={isNew(wordOf(reading.className, "justify"))}
									onPick={(token) => set((className) => withWord(className, "justify", token))}
								/>
							</span>
						</span>
					</Row>
				</>
			) : null}
			{flex || grid ? (
				twoGaps ? (
					<>
						<GapRow
							name="column-gap"
							value={gap.x}
							ok={spacing.ok}
							changed={gap.x !== was.x}
							onValue={(value) => set((className) => withGap(className, { ...gapOf(className), x: value }))}
						/>
						<GapRow
							name="row-gap"
							value={gap.y}
							ok={spacing.ok}
							changed={gap.y !== was.y}
							onValue={(value) => set((className) => withGap(className, { ...gapOf(className), y: value }))}
							toggle={<SidesToggle open ok={spacing.ok && gap.x === gap.y} onToggle={() => setSplit(false)} />}
						/>
					</>
				) : (
					<GapRow
						name="gap"
						value={gap.x}
						ok={spacing.ok}
						changed={gap.x !== was.x}
						onValue={(value) => set((className) => withGap(className, { x: value, y: value }))}
						toggle={<SidesToggle open={false} ok={spacing.ok} onToggle={() => setSplit(true)} />}
					/>
				)
			) : null}
		</Section>
	);
}

function GapRow({
	name,
	value,
	ok,
	changed,
	onValue,
	toggle,
}: {
	name: string;
	value: string | null;
	ok: boolean;
	changed: boolean;
	onValue: (value: string | null) => void;
	toggle?: ReactNode;
}) {
	return (
		<Row name={name} ok={ok}>
			<NumField
				value={value ?? "0"}
				px={value === null ? "0px" : px(value)}
				ok={ok}
				changed={changed}
				onCommit={(typed) => {
					const text = typed.trim();
					if (text === "" || text === "0") {
						onValue(null);
						return;
					}
					const next = parse(text);
					if (next !== null) onValue(next);
				}}
				onStep={(direction, big) => {
					const now = value === null ? 0 : (valuePx(value) ?? 0);
					onValue(pxToken(now + direction * (big ? 40 : 4)));
				}}
			/>
			{toggle}
		</Row>
	);
}

const SIDES: readonly { name: string; side: Side }[] = [
	{ name: "padding-top", side: "t" },
	{ name: "padding-right", side: "r" },
	{ name: "padding-bottom", side: "b" },
	{ name: "padding-left", side: "l" },
];

function BoxSection({ reading, acts }: { reading: Reading; acts: Acts }) {
	const spacing = spacingVerdict(reading.element);
	const words = wordVerdict(reading.element);
	const padding = paddingOf(reading.className);
	const wasPadding = paddingOf(reading.origin);
	const even = padding.t === padding.r && padding.r === padding.b && padding.b === padding.l;
	const [sides, setSides] = useState(false);
	const unfolded = sides || !even;
	const set = (next: (className: string | null) => string) => acts.setClass(reading.element.id, next);
	const wide = sizeVerdict(reading.element, "w");
	const tall = sizeVerdict(reading.element, "h");
	const worst = !spacing.ok ? spacing : !wide.ok ? wide : tall;
	const isNew = (token: string | null) => token !== null && !reading.original.has(token);

	return (
		<Section name="box" reason={sectionReason(reading.element, worst)}>
			{(["w", "h"] as const).map((axis) => {
				const verdict = axis === "w" ? wide : tall;
				const token = tokenOf(reading.className, axis);
				const measured = Math.round(axis === "w" ? reading.box.w : reading.box.h);
				return (
					<Row key={axis} name={axis === "w" ? "width" : "height"} ok={verdict.ok}>
						<NumField
							value={token === null ? "auto" : valueOf(token)}
							px={`${measured}px`}
							ok={verdict.ok}
							changed={isNew(token)}
							onCommit={(typed) => {
								const text = typed.trim();
								if (text === "" || text === "auto") {
									set((className) => withToken(className, axis, null));
									return;
								}
								const next = parse(text);
								if (next !== null) set((className) => withToken(className, axis, next));
							}}
							onStep={(direction, big) => {
								const step = big ? 10 : 1;
								set((className) => {
									let out = className;
									for (let index = 0; index < step; index += 1) {
										const now = tokenOf(out, axis);
										out = withToken(out, axis, nudge(now, measured, direction));
									}
									return out ?? "";
								});
							}}
						/>
					</Row>
				);
			})}
			{unfolded ? (
				SIDES.map((entry, index) => (
					<Row key={entry.name} name={entry.name} ok={spacing.ok}>
						<NumField
							value={padding[entry.side] ?? "0"}
							px={px(padding[entry.side] ?? "0") ?? "0px"}
							ok={spacing.ok}
							changed={padding[entry.side] !== wasPadding[entry.side]}
							onCommit={(typed) => {
								const next = parse(typed.trim() === "" ? "0" : typed);
								if (next !== null) set((className) => withPadding(className, { ...paddingOf(className), [entry.side]: next }));
							}}
							onStep={(direction, big) =>
								set((className) => {
									const now = paddingOf(className);
									const value = now[entry.side];
									const at = value === null ? 0 : (valuePx(value) ?? 0);
									return withPadding(className, { ...now, [entry.side]: pxToken(at + direction * (big ? 40 : 4)) });
								})
							}
						/>
						{index === 0 ? <SidesToggle open ok={spacing.ok && even} onToggle={() => setSides(false)} /> : null}
					</Row>
				))
			) : (
				<Row name="padding" ok={spacing.ok}>
					<NumField
						value={padding.t ?? "0"}
						px={px(padding.t ?? "0") ?? "0px"}
						ok={spacing.ok}
						changed={padding.t !== wasPadding.t}
						onCommit={(typed) => {
							const next = parse(typed.trim() === "" ? "0" : typed);
							if (next !== null) set((className) => withPadding(className, { t: next, r: next, b: next, l: next }));
						}}
						onStep={(direction, big) =>
							set((className) => {
								const now = paddingOf(className).t;
								const at = now === null ? 0 : (valuePx(now) ?? 0);
								const next = pxToken(at + direction * (big ? 40 : 4));
								return withPadding(className, { t: next, r: next, b: next, l: next });
							})
						}
					/>
					<SidesToggle open={false} ok={spacing.ok} onToggle={() => setSides(true)} />
				</Row>
			)}
			<Row name="overflow" ok={words.ok}>
				<MenuField
					current={OVERFLOW.find((o) => o.token === wordOf(reading.className, "overflow")) ?? fallback("overflow-visible")}
					options={OVERFLOW}
					ok={words.ok}
					changed={isNew(wordOf(reading.className, "overflow"))}
					onPick={(token) => set((className) => withWord(className, "overflow", token))}
				/>
			</Row>
		</Section>
	);
}

/** the scale policy, said in one place: a whole step is a bare number, anything else is pixels */
function pxToken(value: number): string {
	const rounded = Math.max(0, Math.round(value));
	return rounded % 4 === 0 ? String(rounded / 4) : `[${rounded}px]`;
}

const INSETS: readonly { name: string; family: "top" | "right" | "bottom" | "left" }[] = [
	{ name: "top", family: "top" },
	{ name: "right", family: "right" },
	{ name: "bottom", family: "bottom" },
	{ name: "left", family: "left" },
];

function PositionSection({ reading, acts }: { reading: Reading; acts: Acts }) {
	const words = wordVerdict(reading.element);
	const set = (next: (className: string | null) => string) => acts.setClass(reading.element.id, next);
	const position = wordOf(reading.className, "position");
	const placed = position === "absolute" || position === "fixed" || position === "sticky";
	const isNew = (token: string | null) => token !== null && !reading.original.has(token);
	return (
		<Section name="position" reason={sectionReason(reading.element, words)}>
			<Row name="position" ok={words.ok}>
				<MenuField
					current={POSITION.find((o) => o.token === position) ?? fallback("static")}
					options={POSITION}
					ok={words.ok}
					changed={isNew(position)}
					onPick={(token) => set((className) => withWord(className, "position", token === "static" ? null : token))}
				/>
			</Row>
			{placed
				? INSETS.map((entry) => {
						const token = tokenOf(reading.className, entry.family);
						return (
							<Row key={entry.name} name={entry.name} ok={words.ok}>
								<NumField
									value={token === null ? "auto" : valueOf(token)}
									px={token === null ? null : px(valueOf(token))}
									ok={words.ok}
									changed={isNew(token)}
									onCommit={(typed) => {
										const text = typed.trim();
										if (text === "" || text === "auto") {
											set((className) => withToken(className, entry.family, null));
											return;
										}
										const next = parse(text);
										if (next !== null) set((className) => withToken(className, entry.family, next));
									}}
									onStep={(direction, big) =>
										set((className) => {
											const now = tokenOf(className, entry.family);
											const at = now === null ? 0 : (valuePx(valueOf(now)) ?? 0);
											return withToken(className, entry.family, pxToken(at + direction * (big ? 40 : 4)));
										})
									}
								/>
							</Row>
						);
					})
				: null}
		</Section>
	);
}

function BorderSection({ reading, acts }: { reading: Reading; acts: Acts }) {
	const verdict = literalVerdict(reading.element);
	const list = staticTokens(reading.element, reading.className);
	const set = (next: (className: string | null) => string) => acts.setClass(reading.element.id, next);
	const width = tokenOf(reading.className, "border");
	const bare = list.includes("border");
	const value = width === null ? (bare ? "1" : "0") : valueOf(width);
	const colors = colorChoices("border", "none", "");
	const radius = chosen(list, RADIUS);
	const isNew = (token: string | null) => token !== null && !reading.original.has(token);
	return (
		<Section name="border" reason={sectionReason(reading.element, verdict)}>
			<Row name="border-width" ok={verdict.ok}>
				<NumField
					value={value}
					px={`${value === "0" ? 0 : Number(value) || 1}px`}
					ok={verdict.ok}
					changed={isNew(width) || (bare && !reading.original.has("border"))}
					onCommit={(typed) => {
						const next = Number.parseInt(typed, 10);
						if (Number.isNaN(next)) return;
						set((className) => writeBorder(className, next));
					}}
					onStep={(direction) => {
						const now = value === "0" ? 0 : Number(value) || 1;
						set((className) => writeBorder(className, Math.max(0, now + direction)));
					}}
				/>
			</Row>
			<Row name="border-color" ok={verdict.ok}>
				<MenuField
					current={chosen(list, colors)}
					options={colors}
					ok={verdict.ok}
					changed={isNew(chosen(list, colors).token)}
					onPick={(token) => set((className) => withChoice(className, colors, token))}
				/>
			</Row>
			<Row name="border-radius" ok={verdict.ok}>
				<MenuField
					current={radius}
					options={RADIUS}
					ok={verdict.ok}
					changed={isNew(radius.token)}
					onPick={(token) => set((className) => withChoice(className, RADIUS, token))}
				/>
			</Row>
		</Section>
	);
}

/** `border` alone is 1px and `border-N` is N, so zero drops both */
function writeBorder(className: string | null, width: number): string {
	const without = (className ?? "")
		.split(/\s+/)
		.filter((token) => token !== "border" && token !== "")
		.join(" ");
	const base = withToken(without, "border", null);
	if (width <= 0) return base;
	return width === 1 ? `${base} border`.trim() : withToken(base, "border", String(width));
}

function ColorSection({ reading, acts }: { reading: Reading; acts: Acts }) {
	const verdict = literalVerdict(reading.element);
	const list = staticTokens(reading.element, reading.className);
	const set = (next: (className: string | null) => string) => acts.setClass(reading.element.id, next);
	const backgrounds = colorChoices("bg", "transparent", "");
	const colors = colorChoices("text", "inherit", "");
	const opacity = tokenOf(reading.className, "opacity");
	const isNew = (token: string | null) => token !== null && !reading.original.has(token);
	return (
		<Section name="color" reason={sectionReason(reading.element, verdict)}>
			<Row name="background" ok={verdict.ok}>
				<MenuField
					current={chosen(list, backgrounds)}
					options={backgrounds}
					ok={verdict.ok}
					changed={isNew(chosen(list, backgrounds).token)}
					onPick={(token) => set((className) => withChoice(className, backgrounds, token))}
				/>
			</Row>
			<Row name="color" ok={verdict.ok}>
				<MenuField
					current={chosen(list, colors)}
					options={colors}
					ok={verdict.ok}
					changed={isNew(chosen(list, colors).token)}
					onPick={(token) => set((className) => withChoice(className, colors, token))}
				/>
			</Row>
			<Row name="opacity" ok={verdict.ok}>
				<NumField
					value={opacity === null ? "100" : valueOf(opacity)}
					px={opacity === null ? "1" : String(Number(valueOf(opacity)) / 100)}
					ok={verdict.ok}
					changed={isNew(opacity)}
					onCommit={(typed) => {
						const next = Number.parseInt(typed, 10);
						if (Number.isNaN(next)) return;
						set((className) => withToken(className, "opacity", next >= 100 ? null : String(Math.max(0, next))));
					}}
					onStep={(direction, big) => {
						const now = opacity === null ? 100 : Number(valueOf(opacity));
						const next = Math.min(100, Math.max(0, now + direction * (big ? 50 : 5)));
						set((className) => withToken(className, "opacity", next >= 100 ? null : String(next)));
					}}
				/>
			</Row>
		</Section>
	);
}

function TypeSection({ reading, acts }: { reading: Reading; acts: Acts }) {
	const verdict = literalVerdict(reading.element);
	const content = textVerdict(reading.element);
	const words = wordVerdict(reading.element);
	const list = staticTokens(reading.element, reading.className);
	const set = (next: (className: string | null) => string) => acts.setClass(reading.element.id, next);
	const [draft, setDraft] = useState<string | null>(null);
	const size = chosen(list, FONT_SIZE);
	const leading = chosen(list, LINE_HEIGHT);
	const isNew = (token: string | null) => token !== null && !reading.original.has(token);
	const shown =
		reading.element.text === undefined ? null : (reading.text ?? ("expr" in reading.element.text ? reading.element.text.expr : ""));
	const reason = shown === null ? undefined : sectionReason(reading.element, content);

	return (
		<Section name="typography" reason={reason}>
			<Row name="font-family" ok={verdict.ok}>
				<MenuField
					current={chosen(list, FONT_FAMILY)}
					options={FONT_FAMILY}
					ok={verdict.ok}
					changed={isNew(chosen(list, FONT_FAMILY).token)}
					onPick={(token) => set((className) => withChoice(className, FONT_FAMILY, token))}
				/>
			</Row>
			<Row name="font-size" ok={verdict.ok}>
				<MenuField
					current={size}
					options={FONT_SIZE}
					ok={verdict.ok}
					changed={isNew(size.token)}
					onPick={(token) => set((className) => withChoice(className, FONT_SIZE, token))}
				/>
			</Row>
			<Row name="font-weight" ok={verdict.ok}>
				<MenuField
					current={chosen(list, FONT_WEIGHT)}
					options={FONT_WEIGHT}
					ok={verdict.ok}
					changed={isNew(chosen(list, FONT_WEIGHT).token)}
					onPick={(token) => set((className) => withChoice(className, FONT_WEIGHT, token))}
				/>
			</Row>
			<Row name="line-height" ok={verdict.ok}>
				<MenuField
					current={leading.token === null ? { token: null, name: "inherit", value: leadingFallback(list) } : leading}
					options={LINE_HEIGHT}
					ok={verdict.ok}
					changed={isNew(leading.token)}
					onPick={(token) => set((className) => withChoice(className, LINE_HEIGHT, token))}
				/>
			</Row>
			<Row name="letter-spacing" ok={verdict.ok}>
				<MenuField
					current={chosen(list, LETTER_SPACING)}
					options={LETTER_SPACING}
					ok={verdict.ok}
					changed={isNew(chosen(list, LETTER_SPACING).token)}
					onPick={(token) => set((className) => withChoice(className, LETTER_SPACING, token))}
				/>
			</Row>
			<Row name="text-align" ok={words.ok}>
				<IconField
					value={wordOf(reading.className, "textAlign") ?? "text-left"}
					ok={words.ok}
					options={[
						{ token: "text-left", icon: <LinesIcon at="left" /> },
						{ token: "text-center", icon: <LinesIcon at="center" /> },
						{ token: "text-right", icon: <LinesIcon at="right" /> },
					]}
					onPick={(token) => set((className) => withWord(className, "textAlign", token === "text-left" ? null : token))}
				/>
			</Row>
			{shown === null ? null : (
				<Row name="textContent" ok={content.ok}>
					{content.ok ? (
						<input
							value={draft ?? shown}
							spellCheck={false}
							onChange={(event) => setDraft(event.target.value)}
							onBlur={() => {
								if (draft !== null && draft !== shown) acts.setText(reading.element.id, draft);
								setDraft(null);
							}}
							onKeyDown={(event) => {
								event.stopPropagation();
								if (event.key === "Enter") {
									if (draft !== null && draft !== shown) acts.setText(reading.element.id, draft);
									setDraft(null);
									event.currentTarget.blur();
								}
								if (event.key === "Escape") {
									setDraft(null);
									event.currentTarget.blur();
								}
							}}
							className={cn(
								"min-w-0 flex-1 rounded-xs border border-transparent bg-transparent px-1 font-sans text-base text-text leading-4 outline-none hover:bg-surface focus:border-thread/70 focus:bg-surface",
							)}
						/>
					) : (
						<span className={cn("min-w-0 flex-1 truncate px-1 text-muted/40", VALUE)}>{shown}</span>
					)}
				</Row>
			)}
		</Section>
	);
}

/** the literal as it now stands, spliced tokens lit, over the line the write lands on */
function SourceSection({ reading, acts }: { reading: Reading; acts: Acts }) {
	const list = reading.className.split(/\s+/).filter(Boolean);
	const where =
		reading.element.shared === undefined
			? `${FILE}:${reading.element.line}`
			: `${reading.element.shared.file}:${reading.element.shared.line}`;
	const verdict = literalVerdict(reading.element);
	return (
		<Section name="className">
			<div className="flex flex-col gap-1.5 px-2.5 py-2">
				<p className={cn("break-all", VALUE)}>
					{reading.element.computed !== undefined ? (
						<span className="text-muted">{reading.element.computed}</span>
					) : list.length === 0 ? (
						<span className="text-muted/50">null</span>
					) : (
						list.map((token, index) => (
							<span key={`${token}-${index}`} className={cn(reading.original.has(token) ? "text-muted" : "text-thread")}>
								{token}
								{index < list.length - 1 ? " " : ""}
							</span>
						))
					)}
				</p>
				<div className="flex items-center gap-2">
					<span className={cn("min-w-0 truncate", FAINT)}>
						{where}
						{verdict.ok && verdict.scope !== undefined ? ` · ${verdict.scope}` : ""}
					</span>
					{acts.canUndo ? (
						<button
							type="button"
							onClick={acts.undo}
							className={cn("ml-auto shrink-0 cursor-pointer rounded-xs px-1 text-muted hover:text-text focus:outline-none focus-visible:bg-surface", FAINT)}
						>
							undo ⌘Z
						</button>
					) : null}
				</div>
			</div>
		</Section>
	);
}
