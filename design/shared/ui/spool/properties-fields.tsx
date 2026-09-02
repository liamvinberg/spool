import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { compiles } from "shared/lib/spool/properties-families";
import { cn } from "shared/lib/utils";

/**
 * The rail's primitives, one per kind of property, merged from the three takes
 * (spool-cloud#20): the grid's two-column row with the CSS name on the left and
 * the one control that fits on the right, a hairline under each; Figma's field
 * feel from the figma take, chrome-less until the pointer is on it, the label
 * scrubs, arrows step a unit and shift steps ten; the literal take's `+` at the
 * foot, now gated by the compiler rather than a catalogue.
 *
 * A refused control keeps its row and loses its box; the reason reads once in
 * the section head. Labels are CSS or Tailwind names verbatim.
 */

export const LABEL = "font-mono text-2xs leading-3";
export const VALUE = "font-mono text-sm leading-4";
export const FAINT = "font-mono text-2xs text-muted/50 leading-3";
export const BOX =
	"rounded-xs border border-transparent hover:border-border hover:bg-surface focus-within:border-border-raised focus-within:bg-surface";

/* ---------- the row and the section ---------- */

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
		<div className={cn("grid grid-cols-[92px_1fr] items-center gap-2 border-border/80 border-b px-2.5", tall ? "py-1.5" : long ? "min-h-7 py-1" : "h-7")}>
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

export function Section({ name, reason, aside, children }: { name: string; reason?: string | undefined; aside?: ReactNode; children: ReactNode }) {
	return (
		<div className="border-border-raised border-t">
			<div className="flex h-6 items-center gap-2 px-2.5">
				<span className={cn("shrink-0 text-muted/70", LABEL)}>{name}</span>
				{aside}
				{reason === undefined ? null : <span className={cn("ml-auto min-w-0 truncate", FAINT)}>{reason}</span>}
			</div>
			{children}
		</div>
	);
}

/* ---------- a number: the token, its readout faint beside it ---------- */

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
	/** the value is inherited from the base scope or a fallback: read it quietly */
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
				<span className={cn("min-w-0 flex-1 truncate text-muted/40", VALUE)}>{value === "" ? (placeholder ?? "") : value}</span>
				{readout === undefined || readout === null ? null : <span className={cn("shrink-0", FAINT)}>{readout}</span>}
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
				className={cn("min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted/40", VALUE, changed ? "text-thread" : faint ? "text-muted/55" : "text-text")}
			/>
			{readout === undefined || readout === null ? null : <span className={cn("shrink-0", FAINT)}>{readout}</span>}
		</label>
	);
}

/* ---------- a menu: words and tokens, picked by name ---------- */

export interface Option {
	/** null is the absent state: the row's fallback */
	token: string | null;
	name: string;
	/** what it computes to, faint at the right */
	value?: string;
	/** a colour to paint before the name */
	swatch?: string;
	/** a group divider above this option: `default` for Tailwind's theme */
	group?: string;
}

const MENU_H = 296;

export function Menu({
	current,
	options,
	ok,
	changed = false,
	faint = false,
	filter = false,
	arbitrary,
	onPick,
	className,
}: {
	current: Option;
	options: readonly Option[];
	ok: boolean;
	changed?: boolean;
	/** the value is inherited or a fallback: read it quietly */
	faint?: boolean;
	/** a long list gets a type-to-find line at the top */
	filter?: boolean;
	/** what typed text becomes when no option matches it: an arbitrary-value option, offered first */
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

	const matched = typed === "" ? options : options.filter((option) => option.name.includes(typed) || option.value?.includes(typed) === true);
	const extra = filter && typed !== "" && arbitrary !== undefined ? arbitrary(typed) : null;
	const shown = extra === null || matched.some((option) => option.token === extra.token) ? matched : [extra, ...matched];

	useEffect(() => {
		if (!open) return;
		(filter ? inputRef.current : listRef.current)?.focus();
	}, [open, filter]);

	useEffect(() => {
		if (!open) return;
		listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
	}, [open, cursor]);

	useEffect(() => {
		if (!open) return;
		const away = (event: Event) => {
			const target = event.target as Node | null;
			if (target !== null && (listRef.current?.contains(target) === true || buttonRef.current?.contains(target) === true)) return;
			setOpen(false);
		};
		document.addEventListener("pointerdown", away, true);
		return () => document.removeEventListener("pointerdown", away, true);
	}, [open]);

	if (!ok) {
		return (
			<span className={cn("flex min-w-0 flex-1 items-center gap-1.5 px-1", className)}>
				{current.swatch === undefined ? null : <SwatchChip color={current.swatch} />}
				<span className={cn("min-w-0 flex-1 truncate text-muted/40", VALUE)}>{current.name}</span>
				{current.value === undefined || current.value === "" ? null : <span className={cn("shrink-0", FAINT)}>{current.value}</span>}
			</span>
		);
	}

	const show = () => {
		const rect = buttonRef.current?.getBoundingClientRect();
		if (rect === undefined) return;
		const width = Math.max(rect.width, 236);
		const height = Math.min(options.length * 24 + (filter ? 34 : 8), MENU_H);
		const below = rect.bottom + 4;
		const flip = below + height > innerHeight - 8;
		setAt({
			left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)),
			top: flip ? Math.max(8, rect.top - 4 - height) : below,
			width,
		});
		setTyped("");
		setCursor(Math.max(0, options.findIndex((option) => option.token === current.token)));
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
				<span className={cn("min-w-0 truncate", VALUE, changed ? "text-thread" : faint ? "text-muted/55" : "text-text")}>{current.name}</span>
				{current.value === undefined || current.value === "" ? null : <span className={cn("ml-auto min-w-0 truncate pl-1", FAINT)}>{current.value}</span>}
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
								className={cn("min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-muted/40", VALUE)}
							/>
							<span className={FAINT}>{shown.length}</span>
						</div>
					) : null}
					<div className="min-h-0 flex-1 overflow-y-auto py-1">
						{shown.map((option, index) => {
							const worn = option.token === current.token;
							const divider = option.group !== undefined && (index === 0 || shown[index - 1]?.group !== option.group);
							return (
								<div key={`${option.name}-${index}`}>
									{divider ? (
										<div className={cn("flex h-5 items-center px-2 text-muted/45", index === 0 ? "" : "mt-1 border-border-raised border-t pt-1", LABEL)}>{option.group}</div>
									) : null}
									<button
										type="button"
										role="option"
										aria-selected={worn}
										tabIndex={-1}
										data-index={index}
										onPointerEnter={() => setCursor(index)}
										onClick={() => commit(index)}
										className={cn("flex h-6 w-full cursor-pointer items-center gap-1.5 px-2 text-left", index === cursor && "bg-surface")}
									>
										{option.swatch === undefined ? swatched ? <span className="w-3 shrink-0" /> : null : <SwatchChip color={option.swatch} />}
										<span className={cn("min-w-0 truncate", VALUE, worn ? "text-thread" : "text-text")}>{option.name}</span>
										{option.value === undefined || option.value === "" ? null : <span className={cn("ml-auto shrink-0 pl-2", FAINT)}>{option.value}</span>}
									</button>
								</div>
							);
						})}
						{shown.length === 0 ? <div className={cn("px-2 py-1 text-muted/45", VALUE)}>nothing named {typed}</div> : null}
					</div>
				</div>
			) : null}
		</>
	);
}

export function SwatchChip({ color, className }: { color: string; className?: string }) {
	const empty = color === "" || color === "transparent";
	return (
		<span
			className={cn("relative h-3 w-3 shrink-0 overflow-hidden rounded-[2px] border border-border-raised", className)}
			style={empty ? undefined : { background: color }}
		>
			{empty ? <span className="absolute top-[5px] left-[-2px] h-px w-[16px] rotate-45 bg-muted/60" /> : null}
		</span>
	);
}

/* ---------- pictures: direction, text-align ---------- */

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
		<span className={cn("flex items-center gap-px rounded-xs border p-px", ok ? "border-border bg-surface" : "border-transparent bg-transparent")}>
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

/* ---------- a yes or no, and several of them at once ---------- */

export function Chip({ on, label, ok, title, onChange }: { on: boolean; label: string; ok: boolean; title?: string; onChange: (on: boolean) => void }) {
	return (
		<button
			type="button"
			aria-pressed={on}
			title={title}
			disabled={!ok}
			onClick={() => onChange(!on)}
			className={cn(
				"h-5 shrink-0 rounded-xs border px-1.5 font-mono text-2xs leading-3 focus:outline-none focus-visible:bg-raised",
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

/** the fold caret: open shows the sides, the corners, the edges */
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
			<svg viewBox="0 0 12 12" className={cn("h-2.5 w-2.5 transition-transform duration-150", open && "rotate-90")} fill="none" aria-hidden="true">
				<path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.3" />
			</svg>
		</button>
	);
}

/* ---------- nine dots for items-* and justify-* at once ---------- */

export function PlaceField({
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

/* ---------- a line of text ---------- */

export function TextField({ value, ok, changed = false, onCommit }: { value: string; ok: boolean; changed?: boolean; onCommit: (text: string) => void }) {
	const [draft, setDraft] = useState<string | null>(null);
	if (!ok) return <span className={cn("min-w-0 flex-1 truncate px-1 text-muted/40", VALUE)}>{value}</span>;
	return (
		<label className={cn("flex min-w-0 flex-1 items-center px-1", BOX)}>
			<input
				value={draft ?? value}
				spellCheck={false}
				onChange={(event) => setDraft(event.target.value)}
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
				}}
				className={cn("min-w-0 flex-1 bg-transparent font-sans text-base leading-4 outline-none", changed ? "text-thread" : "text-text")}
			/>
		</label>
	);
}

/* ---------- the `+`: any class, gated by the compiler ---------- */

export interface Candidate {
	token: string;
	/** what the row is about, `layout`, `color`, shown faint */
	says: string;
	swatch?: string;
}

/**
 * Type a class. The compiler is the gate: what it accepts lands with its CSS
 * beside it, what it rejects stays grey with the reason. A short list of
 * candidates narrows as you type; a token not in it is still offered when it
 * compiles, which is how `[mask-type:luminance]`, `md:hidden` and `mt-3.5!`
 * get in.
 */
export function AddField({
	candidates,
	taken,
	ok,
	onAdd,
	className,
}: {
	candidates: readonly Candidate[];
	/** the literal's tokens, so a candidate it already wears is not offered twice */
	taken: ReadonlySet<string>;
	ok: boolean;
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

	const matches = candidates.filter((candidate) => !taken.has(candidate.token) && candidate.token.includes(typed)).slice(0, 40);
	const exact = matches.some((candidate) => candidate.token === typed);
	const compiled = typed === "" ? null : compiles(typed);
	const list: (Candidate & { compiled: ReturnType<typeof compiles> })[] = [
		...(typed !== "" && !exact && compiled !== null ? [{ token: typed, says: compiled.ok ? compiled.css : "", compiled }] : []),
		...matches.map((candidate) => ({ ...candidate, compiled: compiles(candidate.token) })),
	];
	const index = Math.min(cursor, Math.max(0, list.length - 1));

	useLayoutEffect(() => {
		if (!open) return;
		const rect = buttonRef.current?.getBoundingClientRect();
		if (rect === undefined) return;
		const width = 268;
		const height = 280;
		const below = rect.bottom + 4;
		const flip = below + height > innerHeight - 8;
		setAt({ left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)), top: flip ? Math.max(8, rect.top - 4 - height) : below, width });
		inputRef.current?.focus();
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const away = (event: Event) => {
			const target = event.target as Node | null;
			if (target !== null && (listRef.current?.contains(target) === true || buttonRef.current?.contains(target) === true)) return;
			setOpen(false);
		};
		document.addEventListener("pointerdown", away, true);
		return () => document.removeEventListener("pointerdown", away, true);
	}, [open]);

	const pick = (candidate: (typeof list)[number] | undefined) => {
		if (candidate === undefined || !candidate.compiled.ok) return;
		onAdd(candidate.token);
		setTyped("");
		setCursor(0);
	};

	return (
		<>
			<button
				ref={buttonRef}
				type="button"
				disabled={!ok}
				onClick={() => setOpen((held) => !held)}
				className={cn(
					"flex h-6 items-center gap-1.5 rounded-xs px-1.5 font-mono text-sm leading-4 focus:outline-none",
					ok ? "cursor-pointer text-muted hover:bg-surface hover:text-text focus-visible:bg-surface" : "cursor-default text-muted/35",
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
					style={{ left: at.left, top: at.top, width: at.width }}
					className="fixed z-50 flex max-h-[280px] flex-col overflow-hidden rounded-sm border border-border-raised bg-raised"
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
							className={cn("min-w-0 flex-1 bg-transparent text-text caret-thread outline-none placeholder:text-muted/40", VALUE)}
						/>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto py-1">
						{list.map((candidate, position) => {
							const refused = candidate.compiled.ok ? null : candidate.compiled.reason;
							return (
								<button
									key={`${candidate.token}-${position}`}
									type="button"
									disabled={refused !== null}
									onPointerEnter={() => setCursor(position)}
									onClick={() => pick(candidate)}
									className={cn(
										"flex h-6 w-full items-center gap-2 px-2 text-left",
										VALUE,
										refused === null ? "cursor-pointer text-text" : "cursor-default text-muted/45",
										position === index && refused === null && "bg-surface",
									)}
								>
									{candidate.swatch === undefined ? null : <SwatchChip color={candidate.swatch} />}
									<span className="shrink-0">{candidate.token}</span>
									<span className={cn("ml-auto min-w-0 truncate pl-2", FAINT)}>{refused ?? candidate.says}</span>
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
