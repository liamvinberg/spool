/**
 * The panel's primitives, one per kind of property: a number, a word, a picture
 * pair, the nine dots, a named token, a line of text. Figma's shapes, spool's
 * chrome: a field is invisible until the pointer is on it, then it is a hairline
 * box on the surface. A refused control keeps its place and loses its box.
 */
import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import type { Choice } from "./tokens";

export const MUTE = "font-mono text-2xs text-muted/60 leading-3";
const BOX =
	"h-7 rounded-sm border border-transparent bg-transparent hover:border-border hover:bg-surface focus-within:border-border-raised focus-within:bg-surface";
const DEAD = "h-7 rounded-sm border border-transparent";

/* ---------- a number: the label sits inside the box, and scrubs ---------- */

export function NumField({
	label,
	value,
	px,
	suffix,
	ok,
	onCommit,
	onStep,
	className,
}: {
	label: string;
	value: string;
	px?: string | null;
	suffix?: string;
	ok: boolean;
	onCommit: (typed: string) => void;
	/** whole scale units, signed: arrows send 1, shift sends 10, a scrub sends what it crossed */
	onStep: (units: number) => void;
	className?: string;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const scrub = useRef<{ from: number; sent: number } | null>(null);

	const down = (event: ReactPointerEvent<HTMLSpanElement>) => {
		if (!ok) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		scrub.current = { from: event.clientX, sent: 0 };
	};
	const move = (event: ReactPointerEvent<HTMLSpanElement>) => {
		const held = scrub.current;
		if (held === null) return;
		const units = Math.round((event.clientX - held.from) / 4);
		if (units === held.sent) return;
		onStep(units - held.sent);
		held.sent = units;
	};
	const up = (event: ReactPointerEvent<HTMLSpanElement>) => {
		if (scrub.current === null) return;
		event.currentTarget.releasePointerCapture(event.pointerId);
		scrub.current = null;
	};

	return (
		<label
			className={cn(
				"flex min-w-0 items-center gap-1.5 px-2",
				ok ? BOX : DEAD,
				className ?? "w-full",
			)}
		>
			{label === "" ? null : (
				<span
					onPointerDown={down}
					onPointerMove={move}
					onPointerUp={up}
					onPointerCancel={up}
					className={cn("shrink-0 select-none", MUTE, ok && "cursor-ew-resize hover:text-muted")}
				>
					{label}
				</span>
			)}
			{ok ? (
				<input
					value={draft ?? value}
					onChange={(event) => setDraft(event.target.value)}
					onFocus={(event) => event.target.select()}
					onBlur={() => {
						if (draft !== null && draft !== value) onCommit(draft);
						setDraft(null);
					}}
					onKeyDown={(event) => {
						event.stopPropagation();
						if (event.key === "Enter") event.currentTarget.blur();
						if (event.key === "Escape") {
							setDraft(null);
							event.currentTarget.blur();
						}
						if (event.key === "ArrowUp" || event.key === "ArrowDown") {
							event.preventDefault();
							setDraft(null);
							onStep((event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1));
						}
					}}
					className="min-w-0 flex-1 bg-transparent font-mono text-sm text-text leading-sm outline-none"
				/>
			) : (
				<span className="min-w-0 flex-1 truncate font-mono text-muted/50 text-sm leading-sm">{value}</span>
			)}
			{suffix === undefined ? null : <span className={cn("shrink-0", MUTE)}>{suffix}</span>}
			{px === undefined || px === null ? null : <span className={cn("shrink-0 text-muted/40", MUTE)}>{px}</span>}
		</label>
	);
}

/* ---------- a word: a list of them is a menu ---------- */

export function WordField({
	value,
	options,
	ok,
	placeholder,
	onChange,
	className,
}: {
	value: string | null;
	options: readonly { token: string; says: string }[];
	ok: boolean;
	placeholder: string;
	onChange: (token: string | null) => void;
	className?: string;
}) {
	if (!ok) {
		const says = options.find((option) => option.token === value)?.says ?? placeholder;
		return (
			<span className={cn("flex items-center px-2 font-mono text-muted/50 text-sm leading-sm", DEAD, className ?? "w-full")}>
				{says}
			</span>
		);
	}
	return (
		<span className={cn("relative flex items-center", BOX, className ?? "w-full")}>
			<select
				value={value ?? ""}
				onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
				onKeyDown={(event) => event.stopPropagation()}
				className={cn(
					"h-full w-full cursor-pointer appearance-none bg-transparent pr-6 pl-2 font-mono text-sm leading-sm outline-none",
					value === null ? "text-muted/55" : "text-text",
				)}
			>
				<option value="">{placeholder}</option>
				{options.map((option) => (
					<option key={option.token} value={option.token}>
						{option.says}
					</option>
				))}
			</select>
			<Caret className="pointer-events-none absolute right-2" />
		</span>
	);
}

/* ---------- pictures: direction, text-align ---------- */

export function IconField({
	value,
	options,
	ok,
	onChange,
}: {
	value: string | null;
	options: readonly { token: string; says: string; icon: ReactNode }[];
	ok: boolean;
	onChange: (token: string) => void;
}) {
	return (
		<span className={cn("flex h-7 shrink-0 items-center gap-px rounded-sm border p-px", ok ? "border-border" : "border-transparent")}>
			{options.map((option) => {
				const on = option.token === value;
				return (
					<button
						key={option.token}
						type="button"
						disabled={!ok}
						aria-label={option.token}
						aria-pressed={on}
						onClick={() => onChange(option.token)}
						className={cn(
							"flex h-6 w-7 items-center justify-center rounded-[3px]",
							ok ? "cursor-pointer" : "cursor-default",
							on ? "bg-raised text-text" : ok ? "text-muted/70 hover:bg-surface hover:text-text" : "text-muted/35",
						)}
					>
						{option.icon}
					</button>
				);
			})}
		</span>
	);
}

/* ---------- the nine dots: items-* down, justify-* across ---------- */

const THREE = ["start", "center", "end"] as const;

export function AlignGrid({
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
	const alignSays = align === null ? "stretch" : align.slice("items-".length);
	const justifySays = justify === null ? "start" : justify.slice("justify-".length);
	const spread = !THREE.includes(justifySays as (typeof THREE)[number]);
	return (
		<span
			className={cn(
				"grid h-[60px] w-[60px] shrink-0 grid-cols-3 grid-rows-3 gap-px rounded-sm border p-[3px]",
				ok ? "border-border hover:border-border-raised" : "border-transparent",
			)}
		>
			{[0, 1, 2].flatMap((row) =>
				[0, 1, 2].map((col) => {
					const main = THREE[column ? row : col] ?? "start";
					const cross = THREE[column ? col : row] ?? "start";
					const on = (spread || main === justifySays) && cross === alignSays;
					const stretched = alignSays === "stretch" && main === justifySays;
					return (
						<button
							key={`${row}-${col}`}
							type="button"
							disabled={!ok}
							aria-label={`items-${cross} justify-${main}`}
							onClick={() => onPick(`items-${cross}`, `justify-${main}`)}
							className={cn(
								"flex items-center justify-center rounded-[2px]",
								ok ? "cursor-pointer hover:bg-surface" : "cursor-default",
							)}
						>
							<span
								className={cn(
									"rounded-full",
									on ? "h-[5px] w-[5px] bg-thread" : stretched ? "h-[5px] w-[5px] bg-muted/45" : "h-[3px] w-[3px] bg-muted/30",
									on && spread && "h-[3px] w-[9px] rounded-[1px]",
								)}
							/>
						</button>
					);
				}),
			)}
		</span>
	);
}

/* ---------- a named token: the project's set, in a menu ---------- */

export function TokenField({
	value,
	inherited,
	choices,
	ok,
	clearable = true,
	onPick,
	className,
}: {
	/** the token on this element, or null when it wears none */
	value: string | null;
	/** what it renders as anyway, shown muted */
	inherited?: string | null;
	choices: readonly Choice[];
	ok: boolean;
	clearable?: boolean;
	onPick: (token: string | null) => void;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const [at, setAt] = useState<{ left: number; top: number; width: number } | null>(null);
	const button = useRef<HTMLButtonElement | null>(null);
	const menu = useRef<HTMLDivElement | null>(null);
	const held = choices.find((choice) => choice.token === value) ?? null;
	const shown = held ?? choices.find((choice) => choice.token === inherited) ?? null;
	const swatches = choices.some((choice) => choice.swatch !== undefined);

	useEffect(() => {
		if (!open) return;
		const away = (event: Event) => {
			const target = event.target as Node | null;
			if (target !== null && (menu.current?.contains(target) === true || button.current?.contains(target) === true)) return;
			setOpen(false);
		};
		const key = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", away, true);
		document.addEventListener("keydown", key);
		return () => {
			document.removeEventListener("pointerdown", away, true);
			document.removeEventListener("keydown", key);
		};
	}, [open]);

	// the menu leaves the panel's scroll box, so it is placed against the frame's own viewport
	useLayoutEffect(() => {
		if (!open) {
			setAt(null);
			return;
		}
		const rect = button.current?.getBoundingClientRect();
		if (rect === undefined) return;
		const rows = choices.length + (clearable ? 1 : 0);
		const height = Math.min(rows * 26 + 8, 232);
		const below = rect.bottom + 4;
		const top = below + height > innerHeight - 8 ? Math.max(8, rect.top - 4 - height) : below;
		const width = Math.max(rect.width, 176);
		setAt({ left: Math.min(rect.left, innerWidth - width - 8), top, width });
	}, [open, choices.length, clearable]);

	const toggle = () => setOpen(!open);

	if (!ok) {
		return (
			<span className={cn("flex min-w-0 items-center gap-2 px-2", DEAD, className ?? "w-full")}>
				{swatches ? <Dot color={shown?.swatch} /> : null}
				<span className="min-w-0 flex-1 truncate font-mono text-muted/50 text-sm leading-sm">{shown?.token ?? "none"}</span>
			</span>
		);
	}

	return (
		<>
			<button
				ref={button}
				type="button"
				onClick={toggle}
				className={cn(
					"flex min-w-0 cursor-pointer items-center gap-2 px-2 text-left",
					BOX,
					open && "border-border-raised bg-surface",
					className ?? "w-full",
				)}
			>
				{swatches ? <Dot color={shown?.swatch} /> : null}
				<span
					className={cn(
						"min-w-0 flex-1 truncate font-mono text-sm leading-sm",
						held === null ? "text-muted/55" : "text-text",
					)}
				>
					{shown?.token ?? "none"}
				</span>
				{shown === null ? null : <span className={cn("shrink-0 text-muted/40", MUTE)}>{shown.value}</span>}
				<Caret />
			</button>
			{open && at !== null ? (
				<div
					ref={menu}
					style={{ left: at.left, top: at.top, width: at.width }}
					className="fixed z-50 max-h-[232px] overflow-y-auto rounded-md border border-border-raised bg-surface p-1"
				>
					{clearable ? (
						<Option
							label="none"
							value=""
							swatch={swatches ? undefined : null}
							on={value === null}
							onPick={() => {
								onPick(null);
								setOpen(false);
							}}
						/>
					) : null}
					{choices.map((choice) => (
						<Option
							key={choice.token}
							label={choice.token}
							value={choice.value}
							swatch={choice.swatch}
							on={choice.token === value}
							onPick={() => {
								onPick(choice.token);
								setOpen(false);
							}}
						/>
					))}
				</div>
			) : null}
		</>
	);
}

function Option({
	label,
	value,
	swatch,
	on,
	onPick,
}: {
	label: string;
	value: string;
	swatch?: string | null | undefined;
	on: boolean;
	onPick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onPick}
			className={cn(
				"flex h-[26px] w-full cursor-pointer items-center gap-2 rounded-[4px] px-1.5 text-left hover:bg-raised",
				on && "bg-raised",
			)}
		>
			{swatch === undefined ? null : <Dot color={swatch ?? undefined} />}
			<span className={cn("min-w-0 flex-1 truncate font-mono text-sm leading-sm", on ? "text-thread" : "text-text")}>{label}</span>
			{value === "" ? null : <span className={cn("shrink-0 text-muted/50", MUTE)}>{value}</span>}
		</button>
	);
}

function Dot({ color }: { color?: string | undefined }) {
	return (
		<span
			className="relative h-[13px] w-[13px] shrink-0 overflow-hidden rounded-[3px] border border-border-raised"
			style={color === undefined || color === "" ? undefined : { background: color }}
		>
			{color === undefined || color === "" ? (
				<span className="absolute top-[5.5px] left-[-2px] h-px w-[18px] rotate-45 bg-muted/60" />
			) : null}
		</span>
	);
}

function Caret({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 8 8" className={cn("h-2 w-2 shrink-0 text-muted/60", className)} fill="none" aria-hidden="true">
			<path d="M1.5 3 4 5.5 6.5 3" stroke="currentColor" strokeWidth="1.2" />
		</svg>
	);
}

/* ---------- a line of text ---------- */

export function TextField({ value, ok, onCommit }: { value: string; ok: boolean; onCommit: (text: string) => void }) {
	const [draft, setDraft] = useState<string | null>(null);
	if (!ok) {
		return (
			<span className={cn("flex items-center px-2", DEAD)}>
				<span className="min-w-0 truncate font-mono text-muted/50 text-sm leading-sm">{value}</span>
			</span>
		);
	}
	return (
		<label className={cn("flex w-full items-center px-2", BOX)}>
			<input
				value={draft ?? value}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={() => {
					if (draft !== null && draft !== value) onCommit(draft);
					setDraft(null);
				}}
				onKeyDown={(event) => {
					event.stopPropagation();
					if (event.key === "Enter") event.currentTarget.blur();
					if (event.key === "Escape") {
						setDraft(null);
						event.currentTarget.blur();
					}
				}}
				className="w-full bg-transparent font-sans text-base text-text leading-sm outline-none"
			/>
		</label>
	);
}

/* ---------- the shell of a section, and a labelled row ---------- */

export function Section({
	name,
	reason,
	open,
	onToggle,
	children,
}: {
	name: string;
	reason?: string | null;
	open: boolean;
	onToggle: () => void;
	children: ReactNode;
}) {
	return (
		<div className="border-border border-b px-3 py-2">
			<button
				type="button"
				onClick={onToggle}
				className="group flex h-5 w-full cursor-pointer items-center gap-2 text-left"
			>
				<span className="font-mono text-2xs text-muted leading-3">{name}</span>
				{reason === undefined || reason === null ? null : (
					<span className={cn("min-w-0 flex-1 truncate text-right", MUTE)}>{reason}</span>
				)}
				<span className={cn("shrink-0 text-muted/0 transition-colors group-hover:text-muted/60", reason === undefined || reason === null ? "ml-auto" : "")}>
					<svg viewBox="0 0 8 8" className={cn("h-2 w-2", !open && "-rotate-90")} fill="none" aria-hidden="true">
						<path d="M1.5 3 4 5.5 6.5 3" stroke="currentColor" strokeWidth="1.2" />
					</svg>
				</span>
			</button>
			{open ? <div className="flex flex-col gap-1.5 pt-1.5">{children}</div> : null}
		</div>
	);
}

export function Row({ label, children }: { label?: string; children: ReactNode }) {
	return (
		<div className="flex min-w-0 items-center gap-2">
			{label === undefined ? null : <span className={cn("w-[52px] shrink-0", MUTE)}>{label}</span>}
			<div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
		</div>
	);
}

/* ---------- the two icon sets the pairs use ---------- */

export function AxisIcon({ down = false }: { down?: boolean }) {
	return (
		<svg viewBox="0 0 12 12" className={cn("h-3 w-3", down && "rotate-90")} fill="none" aria-hidden="true">
			<path d="M2 6h7M6.5 3.5 9 6l-2.5 2.5" stroke="currentColor" strokeWidth="1.3" />
		</svg>
	);
}

export function TextAlignIcon({ at }: { at: "left" | "center" | "right" }) {
	const x = (w: number) => (at === "left" ? 2 : at === "center" ? 6 - w / 2 : 10 - w);
	return (
		<svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
			<path d={`M2 3h8M${x(6)} 6h6M${x(8)} 9h8`} stroke="currentColor" strokeWidth="1.2" />
		</svg>
	);
}

export function SidesIcon({ on }: { on: boolean }) {
	return (
		<svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
			<rect x="1.5" y="1.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
			{on ? <rect x="4.5" y="4.5" width="3" height="3" fill="currentColor" /> : null}
		</svg>
	);
}
