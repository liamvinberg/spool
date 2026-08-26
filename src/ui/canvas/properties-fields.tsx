import {
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { cn } from "../cn";

/**
 * The rail's controls, one per kind of property (#258).
 *
 * Seven of them did not exist before this: the scope bar (P1, which the shell
 * draws), the alpha every colour takes (P2), the gradient's stop rows (P3), the
 * chip sets (P4), the compiler-gated `+` (P5), the sign, fraction and unit in
 * every number box (P6), and the fold caret that opens one row into four (P7).
 * What each of them means for a literal is the property model (#257); this file
 * is only how they look and how they are worked.
 *
 * Two rules run through all of them. A field is chrome-less until the pointer
 * is on it, so a rail of forty rows reads as a list of values rather than as a
 * wall of boxes. And a refused control keeps its row and loses its box, never
 * its place: a missing control reads as a bug, and a greyed one teaches you the
 * shape of your own code.
 */

/** the rail's own type scale: a label, a value, an aside */
export const LABEL = "font-mono text-2xs leading-3";
export const VALUE = "font-mono text-sm leading-4";
export const FAINT = "font-mono text-2xs text-muted/50 leading-3";
export const BOX =
	"rounded-xs border border-transparent hover:border-border hover:bg-surface focus-within:border-border-raised focus-within:bg-surface";

/* ---------- the section and the row ---------- */

export function Section({
	name,
	reason,
	children,
}: {
	name: string;
	/** why this section's rows refuse, said once rather than on every row */
	reason?: string | undefined;
	children: ReactNode;
}) {
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

/** the CSS name on the left, one control on the right, a hairline under each */
export function Row({
	name,
	ok = true,
	tall = false,
	changed = false,
	onScrub,
	children,
}: {
	name: string;
	ok?: boolean;
	/** a control taller than one line: the label sits at the top of it */
	tall?: boolean;
	/** the label reads in thread colour when the value under it is not the file's */
	changed?: boolean;
	/** a numeric row: dragging the label steps the value by the units crossed */
	onScrub?: ((units: number) => void) | undefined;
	children: ReactNode;
}) {
	const scrub = useRef<{ from: number; sent: number } | null>(null);
	const down = (event: ReactPointerEvent<HTMLSpanElement>) => {
		if (onScrub === undefined || !ok) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		scrub.current = { from: event.clientX, sent: 0 };
	};
	const move = (event: ReactPointerEvent<HTMLSpanElement>) => {
		const held = scrub.current;
		if (held === null || onScrub === undefined) return;
		const units = Math.round((event.clientX - held.from) / 4);
		if (units === held.sent) return;
		onScrub(units - held.sent);
		held.sent = units;
	};
	const up = (event: ReactPointerEvent<HTMLSpanElement>) => {
		if (scrub.current === null) return;
		event.currentTarget.releasePointerCapture(event.pointerId);
		scrub.current = null;
	};
	const long = name.length > 14;
	return (
		<div
			data-properties-row={name}
			className={cn(
				"grid grid-cols-[92px_1fr] items-center gap-2 border-border/80 border-b px-2.5",
				tall ? "py-1.5" : long ? "min-h-7 py-1" : "h-7",
			)}
		>
			<span
				onPointerDown={down}
				onPointerMove={move}
				onPointerUp={up}
				onPointerCancel={up}
				className={cn(
					tall ? "self-start pt-1.5 leading-3.5" : long ? "break-words leading-3.5" : "truncate",
					LABEL,
					"select-none",
					changed ? "text-thread" : ok ? "text-muted" : "text-muted/40",
					onScrub !== undefined && ok && "cursor-ew-resize hover:text-text",
				)}
			>
				{name}
			</span>
			<div className="flex min-w-0 items-center gap-1">{children}</div>
		</div>
	);
}

/* ---------- P6: a number that takes a sign, a fraction and a unit ---------- */

/**
 * The token in the box, what it measures faint beside it.
 *
 * `-4`, `1/2`, `50%`, `347px`, `12deg` and `150ms` are all typed straight in;
 * what each becomes on the class is the model's `parseTyped`. Arrows step one
 * scale unit and shift steps ten, which is the same gesture the label's scrub
 * makes with the pointer. The draft is the field's own until it is committed,
 * so a half-typed number is never written.
 */
export function NumField({
	value,
	readout,
	ok,
	changed = false,
	faint = false,
	placeholder,
	onCommit,
	onStep,
	className,
}: {
	value: string;
	/** what the token measures: `16px`, `50%`, `12deg` */
	readout?: string | null | undefined;
	ok: boolean;
	changed?: boolean;
	/** the value comes from the base scope or a fallback: read it quietly */
	faint?: boolean;
	placeholder?: string | undefined;
	onCommit: (typed: string) => void;
	/** whole units, signed: arrows send 1, shift sends 10 */
	onStep?: ((units: number) => void) | undefined;
	className?: string;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	if (!ok) {
		return (
			<span className={cn("flex min-w-0 flex-1 items-center gap-1 px-1", className)}>
				<span className={cn("min-w-0 flex-1 truncate text-muted/40", VALUE)}>
					{value === "" ? (placeholder ?? "") : value}
				</span>
				{readout === undefined || readout === null ? null : (
					<span className={cn("shrink-0", FAINT)}>{readout}</span>
				)}
			</span>
		);
	}
	return (
		<label className={cn("flex min-w-0 flex-1 items-center gap-1 px-1", BOX, className)}>
			<input
				value={draft ?? value}
				placeholder={placeholder}
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
						onStep((event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1));
					}
				}}
				className={cn(
					"min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted/40",
					VALUE,
					changed ? "text-thread" : faint ? "text-muted/55" : "text-text",
				)}
			/>
			{readout === undefined || readout === null ? null : <span className={cn("shrink-0", FAINT)}>{readout}</span>}
		</label>
	);
}

/* ---------- where a popup lands, and when it goes away ---------- */

/**
 * A panel that hangs off a control, placed in the viewport rather than in its
 * row.
 *
 * Fixed because the rail scrolls and its rows sit inside `overflow-y-auto`: a
 * menu positioned in the row would be clipped by it. It opens upwards when it
 * would run off the bottom, because the row it belongs to has to stay in view
 * beside it.
 */
function popoverAt(rect: DOMRect, width: number, height: number): { left: number; top: number; width: number } {
	const below = rect.bottom + 4;
	const flip = below + height > innerHeight - 8;
	return {
		left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)),
		top: flip ? Math.max(8, rect.top - 4 - height) : below,
		width,
	};
}

/** A press anywhere outside the panel or the control that opened it closes it. */
function useCloseOnPressAway(
	open: boolean,
	close: () => void,
	...inside: readonly React.RefObject<HTMLElement | null>[]
): void {
	// the refs are the same list every render at one call site, so the effect
	// turns on `open` alone rather than on an array rebuilt each time
	const held = useRef(inside);
	held.current = inside;
	useEffect(() => {
		if (!open) return;
		const away = (event: Event) => {
			const target = event.target as Node | null;
			if (target !== null && held.current.some((ref) => ref.current?.contains(target) === true)) return;
			close();
		};
		document.addEventListener("pointerdown", away, true);
		return () => document.removeEventListener("pointerdown", away, true);
	}, [open, close]);
}

/* ---------- the menu: words and named tokens, picked by name ---------- */

export interface Option {
	/** null is the absent state: `unset`, and the row's fallback reads again */
	token: string | null;
	name: string;
	/** what it computes to, faint at the right */
	value?: string;
	/** a colour to paint before the name */
	swatch?: string;
	/** a divider above this option: `default` for what Tailwind named, not the project */
	group?: string;
}

const MENU_H = 296;

/** the `+` field's own panel, a fixed size because its list is a filter */
const ADD_W = 268;
const ADD_H = 280;

/**
 * P2's other half, and every named token's control.
 *
 * The list is the compiled theme's, so what it offers is what this project
 * actually has; the `default` divider is where Tailwind's own names begin. A
 * long list gets a type-to-find line, and text nothing matches becomes an
 * arbitrary value offered first — which is how `#ff0044` and `13px` get onto a
 * literal without leaving the row they belong to.
 */
export function Menu({
	current,
	options,
	ok,
	changed = false,
	faint = false,
	filter = false,
	label,
	arbitrary,
	onPick,
	className,
}: {
	current: Option;
	options: readonly Option[];
	ok: boolean;
	changed?: boolean;
	/** the value is inherited from the base or is a fallback: read it quietly */
	faint?: boolean;
	/** a long list gets a type-to-find line at the top */
	filter?: boolean;
	label?: string;
	/** what typed text becomes when no option matches it, offered first */
	arbitrary?: ((typed: string) => Option | null) | undefined;
	onPick: (token: string | null) => void;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const [at, setAt] = useState({ left: 0, top: 0, width: 0 });
	const [cursor, setCursor] = useState(0);
	const [typed, setTyped] = useState("");
	const buttonRef = useRef<HTMLButtonElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const shut = useCallback(() => setOpen(false), []);

	const matched =
		typed === ""
			? options
			: options.filter((option) => option.name.includes(typed) || option.value?.includes(typed) === true);
	const extra = filter && typed !== "" && arbitrary !== undefined ? arbitrary(typed) : null;
	const shown =
		extra === null || matched.some((option) => option.token === extra.token) ? matched : [extra, ...matched];

	useEffect(() => {
		if (!open) return;
		(filter ? inputRef.current : listRef.current)?.focus();
	}, [open, filter]);

	useEffect(() => {
		if (!open) return;
		listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
	}, [open, cursor]);

	useCloseOnPressAway(open, shut, listRef, buttonRef);

	if (!ok) {
		return (
			<span className={cn("flex min-w-0 flex-1 items-center gap-1.5 px-1", className)}>
				{current.swatch === undefined ? null : <SwatchChip color={current.swatch} />}
				<span data-menu-value="" className={cn("min-w-0 flex-1 truncate text-muted/40", VALUE)}>
					{current.name}
				</span>
				{current.value === undefined || current.value === "" ? null : (
					<span className={cn("shrink-0", FAINT)}>{current.value}</span>
				)}
			</span>
		);
	}

	const show = () => {
		const rect = buttonRef.current?.getBoundingClientRect();
		if (rect === undefined) return;
		setAt(popoverAt(rect, Math.max(rect.width, 236), Math.min(options.length * 24 + (filter ? 34 : 8), MENU_H)));
		setTyped("");
		setCursor(
			Math.max(
				0,
				options.findIndex((option) => option.token === current.token),
			),
		);
		setOpen(true);
	};

	const swatched = options.some((option) => option.swatch !== undefined);

	const commit = (index: number) => {
		const option = shown[index];
		if (option !== undefined) onPick(option.token);
		setOpen(false);
		buttonRef.current?.focus();
	};

	const keys = (event: React.KeyboardEvent) => {
		event.stopPropagation();
		if (event.key === "Escape" || event.key === "Tab") {
			setOpen(false);
			buttonRef.current?.focus();
		}
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setCursor((index) => (shown.length === 0 ? 0 : (index + 1) % shown.length));
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			setCursor((index) => (shown.length === 0 ? 0 : (index - 1 + shown.length) % shown.length));
		}
		if (event.key === "Enter") {
			event.preventDefault();
			commit(cursor);
		}
	};

	return (
		<>
			<button
				ref={buttonRef}
				type="button"
				{...(label === undefined ? {} : { "aria-label": label })}
				aria-expanded={open}
				onClick={() => (open ? setOpen(false) : show())}
				onKeyDown={(event) => {
					event.stopPropagation();
					if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						show();
					}
				}}
				className={cn(
					"flex h-6 min-w-0 flex-1 cursor-pointer items-center gap-1.5 px-1 text-left focus:outline-none",
					BOX,
					open && "border-border-raised bg-surface",
					className,
				)}
			>
				{current.swatch === undefined ? null : <SwatchChip color={current.swatch} />}
				<span
					data-menu-value=""
					className={cn(
						"min-w-0 truncate",
						VALUE,
						changed ? "text-thread" : faint ? "text-muted/55" : "text-text",
					)}
				>
					{current.name}
				</span>
				{current.value === undefined || current.value === "" ? null : (
					<span className={cn("ml-auto min-w-0 truncate pl-1", FAINT)}>{current.value}</span>
				)}
			</button>
			{open ? (
				<div
					ref={listRef}
					tabIndex={-1}
					role="listbox"
					onKeyDown={keys}
					style={{ left: at.left, top: at.top, width: at.width, maxHeight: MENU_H }}
					className="fixed z-50 flex flex-col overflow-hidden rounded-sm border border-border-raised bg-raised outline-none"
				>
					{filter ? (
						<div className="flex h-[30px] shrink-0 items-center gap-1.5 border-border-raised border-b px-2">
							<input
								ref={inputRef}
								value={typed}
								placeholder="find"
								spellCheck={false}
								onChange={(event) => {
									setTyped(event.target.value.trim());
									setCursor(0);
								}}
								className={cn(
									"min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-muted/40",
									VALUE,
								)}
							/>
							<span className={FAINT}>{shown.length}</span>
						</div>
					) : null}
					<div className="min-h-0 flex-1 overflow-y-auto py-1">
						{shown.map((option, index) => {
							const worn = option.token === current.token;
							const divider =
								option.group !== undefined && (index === 0 || shown[index - 1]?.group !== option.group);
							return (
								<div key={`${option.name}-${option.token ?? ""}`}>
									{divider ? (
										<div
											data-menu-divider=""
											className={cn(
												"flex h-5 items-center px-2 text-muted/45",
												index === 0 ? "" : "mt-1 border-border-raised border-t pt-1",
												LABEL,
											)}
										>
											{option.group}
										</div>
									) : null}
									<button
										type="button"
										role="option"
										aria-selected={worn}
										tabIndex={-1}
										data-index={index}
										data-menu-option={option.name}
										onPointerEnter={() => setCursor(index)}
										onClick={() => commit(index)}
										className={cn(
											"flex h-6 w-full cursor-pointer items-center gap-1.5 px-2 text-left",
											index === cursor && "bg-surface",
										)}
									>
										{option.swatch === undefined ? (
											swatched ? (
												<span className="w-3 shrink-0" />
											) : null
										) : (
											<SwatchChip color={option.swatch} />
										)}
										<span className={cn("min-w-0 truncate", VALUE, worn ? "text-thread" : "text-text")}>
											{option.name}
										</span>
										{option.value === undefined || option.value === "" ? null : (
											<span className={cn("ml-auto shrink-0 pl-2", FAINT)}>{option.value}</span>
										)}
									</button>
								</div>
							);
						})}
						{shown.length === 0 ? (
							<div className={cn("px-2 py-1 text-muted/45", VALUE)}>nothing named {typed}</div>
						) : null}
					</div>
				</div>
			) : null}
		</>
	);
}

/** the colour before the name; a slash through it is the absence of one */
export function SwatchChip({ color, className }: { color: string; className?: string }) {
	const empty = color === "" || color === "transparent";
	return (
		<span
			data-swatch={color}
			className={cn(
				"relative h-3 w-3 shrink-0 overflow-hidden rounded-[2px] border border-border-raised",
				className,
			)}
			style={empty ? undefined : { background: color }}
		>
			{empty ? <span className="absolute top-[5px] left-[-2px] h-px w-[16px] rotate-45 bg-muted/60" /> : null}
		</span>
	);
}

/* ---------- pictures: two or three words that are better drawn ---------- */

export function IconField({
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
		<span
			className={cn(
				"flex items-center gap-px rounded-xs border p-px",
				ok ? "border-border bg-surface" : "border-transparent bg-transparent",
			)}
		>
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
							on && !ok && "text-muted/40",
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

/* ---------- P4: a yes or no, and a set of them at once ---------- */

export function Chip({
	on,
	label,
	ok,
	title,
	onChange,
}: {
	on: boolean;
	label: string;
	ok: boolean;
	title?: string | undefined;
	onChange: (on: boolean) => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={on}
			{...(title === undefined ? {} : { title })}
			disabled={!ok}
			onClick={() => onChange(!on)}
			className={cn(
				"h-5 shrink-0 rounded-xs border px-1.5 focus:outline-none focus-visible:bg-raised",
				LABEL,
				ok ? "cursor-pointer" : "cursor-default",
				on ? "border-border-raised bg-raised text-text" : "border-transparent text-muted/60",
				ok && !on && "hover:border-border hover:text-text",
				!ok && "text-muted/35",
				!ok && on && "bg-surface",
			)}
		>
			{label}
		</button>
	);
}

/* ---------- P7: the caret that opens one row into two or four ---------- */

export function Fold({ open, ok, onToggle }: { open: boolean; ok: boolean; onToggle: () => void }) {
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
			<svg
				viewBox="0 0 12 12"
				className={cn("h-2.5 w-2.5 transition-transform duration-150", open && "rotate-90")}
				fill="none"
				aria-hidden="true"
			>
				<path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.3" />
			</svg>
		</button>
	);
}

/* ---------- nine dots for items-* and justify-* at once ---------- */

const THREE = ["start", "center", "end"] as const;

export function PlaceField({
	align,
	justify,
	column,
	ok,
	onPick,
}: {
	align: string | null;
	justify: string | null;
	/** the grid turns with the direction, so a dot means where the child lands */
	column: boolean;
	ok: boolean;
	onPick: (align: string, justify: string) => void;
}) {
	const alignSays = align === null ? "stretch" : align.slice("items-".length);
	const justifySays = justify === null ? "start" : justify.slice("justify-".length);
	const spread = !THREE.includes(justifySays as (typeof THREE)[number]);
	return (
		<span
			className={cn(
				"grid h-11 w-11 shrink-0 grid-cols-3 grid-rows-3 gap-px rounded-xs border p-0.5",
				ok ? "border-border bg-surface" : "border-transparent bg-transparent",
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
							className={cn(
								"flex items-center justify-center rounded-[2px]",
								ok ? "cursor-pointer hover:bg-raised" : "cursor-default",
							)}
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

/* ---------- P5: the `+`, gated by the compiler ---------- */

/** What the compiler said about one candidate; nothing until it has answered. */
export type ClassVerdict = { ok: true; css: string } | { ok: false; reason: string };

export interface Candidate {
	token: string;
}

/**
 * Type a class. The compiler is the gate, not a catalogue.
 *
 * What compiles lands with its CSS beside it; what does not stays grey with the
 * reason the compiler gave — `no utility foo-bar`, `no variant x:`, `an image
 * is an import, not a class`. That is why `[mask-type:luminance]`, `md:hidden`
 * and `mt-3.5!` all get in: nothing here has an opinion about which classes
 * exist, so nothing here can be out of date with the project's own theme.
 *
 * A candidate the compiler has not answered for yet reads as pending and cannot
 * be pressed. Nothing downstream would catch it: the write lane splices text and
 * never asks the compiler, so letting a press through before the verdict lands
 * is how `foo-bar` gets into a file.
 */
export function AddField({
	candidates,
	taken,
	ok,
	verdictOf,
	onAsk,
	onAdd,
	className,
}: {
	candidates: readonly Candidate[];
	/** the literal's tokens, so one it already wears is not offered twice */
	taken: ReadonlySet<string>;
	ok: boolean;
	verdictOf: (token: string) => ClassVerdict | undefined;
	/** put these to the compiler; the answers arrive through `verdictOf` */
	onAsk: (tokens: readonly string[]) => void;
	onAdd: (token: string) => void;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const [typed, setTyped] = useState("");
	const [cursor, setCursor] = useState(0);
	const [at, setAt] = useState({ left: 0, top: 0, width: 0 });
	const buttonRef = useRef<HTMLButtonElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const shut = useCallback(() => setOpen(false), []);

	const matches = candidates
		.filter((candidate) => !taken.has(candidate.token) && candidate.token.includes(typed))
		.slice(0, 40);
	const exact = matches.some((candidate) => candidate.token === typed);
	const list: Candidate[] = [...(typed !== "" && !exact ? [{ token: typed }] : []), ...matches];
	const index = Math.min(cursor, Math.max(0, list.length - 1));

	// what is on screen is what the compiler is asked about, which keeps the ask
	// to a screenful rather than to every seed the rail could ever offer
	const asking = list.map((candidate) => candidate.token).join("\n");
	useEffect(() => {
		if (!open) return;
		const tokens = asking.split("\n").filter((token) => token !== "");
		if (tokens.length > 0) onAsk(tokens);
	}, [open, asking, onAsk]);

	useLayoutEffect(() => {
		if (!open) return;
		const rect = buttonRef.current?.getBoundingClientRect();
		if (rect === undefined) return;
		setAt(popoverAt(rect, ADD_W, ADD_H));
		inputRef.current?.focus();
	}, [open]);

	useCloseOnPressAway(open, shut, listRef, buttonRef);

	const pick = (candidate: Candidate | undefined) => {
		if (candidate === undefined || verdictOf(candidate.token)?.ok !== true) return;
		onAdd(candidate.token);
		setTyped("");
		setCursor(0);
	};

	return (
		<>
			<button
				ref={buttonRef}
				type="button"
				aria-label="Add a class"
				aria-expanded={open}
				disabled={!ok}
				onClick={() => setOpen((held) => !held)}
				className={cn(
					"flex h-6 items-center gap-1.5 rounded-xs px-1.5 focus:outline-none",
					VALUE,
					ok
						? "cursor-pointer text-muted hover:bg-surface hover:text-text focus-visible:bg-surface"
						: "cursor-default text-muted/35",
					open && "bg-surface text-text",
					className,
				)}
			>
				<span className="text-base leading-none">+</span>
				<span className={LABEL}>class</span>
			</button>
			{open ? (
				<div
					ref={listRef}
					style={{ left: at.left, top: at.top, width: at.width, maxHeight: ADD_H }}
					className="fixed z-50 flex flex-col overflow-hidden rounded-sm border border-border-raised bg-raised"
				>
					<div className="flex h-[30px] shrink-0 items-center gap-1.5 border-border-raised border-b px-2">
						<span className="text-muted/50 text-sm leading-none">+</span>
						<input
							ref={inputRef}
							value={typed}
							spellCheck={false}
							placeholder="any class"
							onChange={(event) => {
								setTyped(event.target.value.trim());
								setCursor(0);
							}}
							onKeyDown={(event) => {
								event.stopPropagation();
								if (event.key === "Escape") setOpen(false);
								if (event.key === "ArrowDown") {
									event.preventDefault();
									setCursor(Math.min(index + 1, list.length - 1));
								}
								if (event.key === "ArrowUp") {
									event.preventDefault();
									setCursor(Math.max(index - 1, 0));
								}
								if (event.key === "Enter") pick(list[index]);
							}}
							className={cn(
								"min-w-0 flex-1 bg-transparent text-text caret-thread outline-none placeholder:text-muted/40",
								VALUE,
							)}
						/>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto py-1">
						{list.map((candidate, position) => {
							const verdict = verdictOf(candidate.token);
							const lands = verdict?.ok === true;
							return (
								<button
									key={candidate.token}
									type="button"
									data-class-candidate={candidate.token}
									disabled={!lands}
									onPointerEnter={() => setCursor(position)}
									onClick={() => pick(candidate)}
									className={cn(
										"flex h-6 w-full items-center gap-2 px-2 text-left",
										VALUE,
										lands ? "cursor-pointer text-text" : "cursor-default text-muted/45",
										position === index && lands && "bg-surface",
									)}
								>
									<span className="shrink-0">{candidate.token}</span>
									<span className={cn("ml-auto min-w-0 truncate pl-2", FAINT)}>
										{verdict === undefined ? "…" : verdict.ok ? verdict.css : verdict.reason}
									</span>
								</button>
							);
						})}
						{list.length === 0 ? <div className={cn("px-2 py-1 text-muted/45", VALUE)}>type a class</div> : null}
					</div>
				</div>
			) : null}
		</>
	);
}

/* ---------- icons ---------- */

export function ArrowIcon({ down = false }: { down?: boolean }) {
	return (
		<svg viewBox="0 0 12 12" className={cn("h-3 w-3", down && "rotate-90")} fill="none" aria-hidden="true">
			<path d="M2 6h7M6.5 3.5 9 6l-2.5 2.5" stroke="currentColor" strokeWidth="1.3" />
		</svg>
	);
}

export function LinesIcon({ at }: { at: "left" | "center" | "right" | "justify" }) {
	const x = (w: number) => (at === "left" || at === "justify" ? 2 : at === "center" ? 6 - w / 2 : 10 - w);
	return (
		<svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
			<path d={`M2 3h8M${x(6)} 6h${at === "justify" ? 8 : 6}M${x(8)} 9h8`} stroke="currentColor" strokeWidth="1.2" />
		</svg>
	);
}
