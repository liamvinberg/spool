// Input primitives: TextField, NumberField, SearchField, Textarea and the bare
// multi-line input, SelectTrigger, Field (label, hint, error) and ColourField.
// NumberField carries the one number engine every knob tunes with (#220):
// typing with maths and units, the scrub, the keys, and the gesture they share.
//
// The box is one thing, `FieldBox`: a well behind a hairline that firms on
// hover, takes the one focus ring inside its edge, and turns danger on
// `error`. Interaction states pair the real pseudo-class with
// `data-state="hover|focus"` so a sheet can force one. Every root spreads
// `...rest`; what belongs to the native input rides `inputProps`.
//
// Heights are the control scale (sm 24, md 28, lg 32, and xs 20 for the
// properties panel's numbers). The radius follows the height as buttons do.

import {
	type ChangeEvent,
	type ComponentProps,
	type HTMLAttributes,
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useId,
	useRef,
	useState,
} from "react";
import { cn } from "../cn";
import { ChevronIcon, CloseIcon, SearchIcon } from "../icons";
import { Kbd } from "./display";

export type FieldForced = "hover" | "focus";
export type FieldSize = "xs" | "sm" | "md" | "lg";
export type FieldTone = "boxed" | "quiet";

/* ------------------------------------------------------------ FieldBox -- */

const BOX_SIZE: Record<FieldSize, string> = {
	xs: "h-control-xs gap-1 rounded-xs px-1",
	sm: "h-control-sm gap-1.5 rounded-xs px-1.5",
	md: "h-control-md gap-1.5 rounded-sm px-2",
	lg: "h-control-lg gap-2 rounded-sm px-3",
};

/** the text role per height: 12 at the small end, 13 above; mono for values */
const BOX_TYPE: Record<FieldSize, { sans: string; mono: string }> = {
	xs: { sans: "type-label", mono: "type-value" },
	sm: { sans: "type-label", mono: "type-value" },
	md: { sans: "type-control", mono: "type-value" },
	lg: { sans: "type-control", mono: "type-value" },
};

/** the system's one ring, drawn inside the box's edge so it never collides with a neighbour */
const FOCUS_RING = cn(
	"focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-line-focus focus-within:outline-solid",
	"data-[state=focus]:outline-2 data-[state=focus]:-outline-offset-2 data-[state=focus]:outline-line-focus data-[state=focus]:outline-solid",
);

/*
 * boxed: a well, hairline at rest, firmer on hover.
 * quiet: nothing at rest, so a panel reads as values; the box arrives on hover.
 */
const TONE: Record<FieldTone, string> = {
	boxed: "border-line-default bg-surface-window hover:border-line-strong data-[state=hover]:border-line-strong",
	quiet: "border-transparent bg-transparent hover:border-line-default hover:bg-state-hover-raised data-[state=hover]:border-line-default data-[state=hover]:bg-state-hover-raised focus-within:bg-state-hover-raised data-[state=focus]:bg-state-hover-raised",
};

/** the classes join without merging, so an error replaces the tone's edge rather than racing it */
const ERROR_TONE: Record<FieldTone, string> = {
	boxed: "border-danger bg-surface-window",
	quiet: "border-danger bg-transparent",
};

export interface FieldBoxProps extends HTMLAttributes<HTMLElement> {
	/** `auto` lets content set the height and leaves the radius to the caller */
	size?: FieldSize | "auto" | undefined;
	tone?: FieldTone | undefined;
	/** drawn in danger: what was typed was refused */
	error?: boolean | undefined;
	disabled?: boolean | undefined;
	/** the element the box is: a label for one input, a div for a composite */
	as?: "label" | "div" | undefined;
	"data-state"?: FieldForced | undefined;
}

/**
 * The box every field is drawn in. A composite (chip strip and a bare
 * textarea, as the agent composer is) is a FieldBox `as="div"` with its parts
 * inside, so the box carries the edge and the ring for all of them.
 */
export function FieldBox({
	size = "md",
	tone = "boxed",
	error = false,
	disabled = false,
	as: As = "label",
	className,
	children,
	...rest
}: FieldBoxProps) {
	return (
		<As
			data-error={error || undefined}
			aria-disabled={disabled || undefined}
			className={cn(
				"relative flex min-w-0 cursor-text items-center border text-primary",
				"transition-[border-color,background-color] duration-fast ease-out motion-reduce:transition-none",
				error ? ERROR_TONE[tone] : TONE[tone],
				size === "auto" ? null : BOX_SIZE[size],
				FOCUS_RING,
				disabled && "pointer-events-none opacity-40",
				className,
			)}
			{...rest}
		>
			{children}
		</As>
	);
}

/** the native input inside a box: no chrome of its own */
const INPUT =
	"min-w-0 flex-1 self-stretch bg-transparent text-primary outline-none placeholder:text-secondary disabled:cursor-not-allowed";

/** a word or glyph at the edge of a box */
const AFFIX = "flex shrink-0 items-center text-secondary";

function useMaybeControlled(
	value: string | undefined,
	fallback: string | undefined,
	onChange?: (next: string) => void,
) {
	const [own, setOwn] = useState(fallback ?? "");
	const current = value ?? own;
	const set = (next: string) => {
		if (value === undefined) setOwn(next);
		onChange?.(next);
	};
	return [current, set] as const;
}

/* ----------------------------------------------------------- TextField -- */

export interface TextFieldProps
	extends Omit<FieldBoxProps, "children" | "onChange" | "defaultValue" | "prefix" | "size"> {
	size?: FieldSize | undefined;
	value?: string | undefined;
	defaultValue?: string | undefined;
	placeholder?: string | undefined;
	onValueChange?: ((next: string) => void) | undefined;
	/** a glyph before the text, at 12 */
	icon?: ReactNode;
	/** words before the text: `spool.page/` */
	prefix?: ReactNode;
	/** anything after the text: a key hint, a status */
	suffix?: ReactNode;
	/** a clear button once there is a value */
	clearable?: boolean | undefined;
	/** the value is a name the machine reads: mono */
	mono?: boolean | undefined;
	/** the input's own label when no Field names it */
	label?: string | undefined;
	inputProps?: ComponentProps<"input"> | undefined;
}

/** A line of text. Sentence-case placeholder that says what goes in, never an example as a label. */
export function TextField({
	size = "md",
	tone = "boxed",
	value,
	defaultValue,
	placeholder,
	onValueChange,
	icon,
	prefix,
	suffix,
	clearable = false,
	mono = false,
	label,
	error = false,
	disabled = false,
	inputProps,
	className,
	...rest
}: TextFieldProps) {
	const [text, setText] = useMaybeControlled(value, defaultValue, onValueChange);
	const type = BOX_TYPE[size];
	return (
		<FieldBox
			size={size}
			tone={tone}
			error={error}
			disabled={disabled}
			className={cn(mono ? type.mono : type.sans, className)}
			{...rest}
		>
			{icon === undefined ? null : <span className={AFFIX}>{icon}</span>}
			{prefix === undefined ? null : <span className={cn(AFFIX, "type-value")}>{prefix}</span>}
			<input
				value={text}
				placeholder={placeholder}
				disabled={disabled}
				aria-label={label}
				aria-invalid={error || undefined}
				spellCheck={false}
				onChange={(event: ChangeEvent<HTMLInputElement>) => setText(event.target.value)}
				{...inputProps}
				className={cn(INPUT, inputProps?.className)}
			/>
			{clearable && text !== "" ? <ClearButton onClear={() => setText("")} /> : null}
			{suffix === undefined ? null : <span className={AFFIX}>{suffix}</span>}
		</FieldBox>
	);
}

/** the 16px clear in a field's tail; Escape in a search field does the same */
function ClearButton({ onClear }: { onClear: () => void }) {
	return (
		<button
			type="button"
			aria-label="Clear"
			title="Clear"
			onClick={onClear}
			className={cn(
				"focus-ring -mr-0.5 flex size-4 shrink-0 items-center justify-center rounded-xs",
				"text-secondary transition-colors duration-fast hover:bg-state-hover-raised hover:text-primary",
			)}
		>
			<CloseIcon />
		</button>
	);
}

/* --------------------------------------------------------- NumberField -- */

/**
 * Where a tuning gesture is (#220): `live` while a hand drags or types, `commit`
 * once on release (the one write), `cancel` on Escape with the value from before
 * the gesture, which nothing writes.
 */
export type TunePhase = "live" | "commit" | "cancel";

/** What every knob editor takes: its value and the one way it reports a change. */
export interface TuneProps<T> {
	value: T;
	onTune: (next: T, phase: TunePhase) => void;
	disabled?: boolean | undefined;
}

/** What a number may be: what holds it, what a step is, and the units it may be typed in. */
export interface NumberRules {
	/** held to on commit */
	min?: number | undefined;
	max?: number | undefined;
	/** what an arrow or a scrub moves it by: shift ten of them, alt a tenth */
	step?: number | undefined;
	/** what it measures: `px` */
	unit?: string | undefined;
	/** the other units it may be typed in, each as how many `unit` one is: `{ s: 1000 }` beside `ms` */
	units?: Readonly<Record<string, number>> | undefined;
	/** where a scrub sticks for a moment; the value it set out from always does */
	detents?: readonly number[] | undefined;
	/** past `max` it comes round to `min` again, as an angle does */
	wrap?: boolean | undefined;
}

/** A number held to its rules, wrapped or clamped, and rid of float dust. */
export function fitNumber(n: number, rules: NumberRules): number {
	const { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = rules;
	const span = max - min;
	const held =
		rules.wrap === true && Number.isFinite(span)
			? ((((n - min) % span) + span) % span) + min
			: Math.min(max, Math.max(min, n));
	return Math.round(held * 1e6) / 1e6;
}

/**
 * What a typed value says in the number's own unit, or null when it says
 * nothing a number could be. `+ - * / ( )` work and units convert (`0.3s`
 * beside `ms`); a line that opens with `+`, `*` or `/` works on `current`, as
 * Figma's fields do (`+4`, `*2`). A comma is a decimal point.
 */
export function readNumber(text: string, current: number, rules: NumberRules): number | null {
	const source = text.trim().replace(/,/g, ".").replace(/−/g, "-").replace(/×/g, "*");
	const tokens: string[] = source.match(/(?:\d+\.?\d*|\.\d+)\s*[a-zµ°%]*|\S/gi) ?? [];
	if (tokens.length === 0) return null;
	if (/^[+*/]$/.test(tokens[0] ?? "")) tokens.unshift("x");
	let at = 0;
	const atom = (): number => {
		const token = tokens[at++];
		if (token === "x") return current;
		if (token === "-") return -atom();
		if (token === "(") {
			const n = sum();
			if (tokens[at++] !== ")") throw new Error("unclosed");
			return n;
		}
		const number = /^(\d+\.?\d*|\.\d+)\s*(.*)$/.exec(token ?? "");
		const unit = number?.[2] ?? "";
		const factor = unit === "" || unit === rules.unit ? 1 : rules.units?.[unit];
		if (number === null || factor === undefined) throw new Error("not a number");
		return Number.parseFloat(number[1] ?? "") * factor;
	};
	const product = (): number => {
		let n = atom();
		while (tokens[at] === "*" || tokens[at] === "/") n = tokens[at++] === "*" ? n * atom() : n / atom();
		return n;
	};
	const sum = (): number => {
		let n = product();
		while (tokens[at] === "+" || tokens[at] === "-") n = tokens[at++] === "+" ? n + product() : n - product();
		return n;
	};
	try {
		const n = sum();
		return at === tokens.length && Number.isFinite(n) ? n : null;
	} catch {
		return null;
	}
}

/** The nearest detent `raw` is within `zone` of, or null. */
export function stickTo(raw: number, detents: readonly number[], zone: number): number | null {
	let best: number | null = null;
	for (const d of detents)
		if (Math.abs(raw - d) < zone && (best === null || Math.abs(raw - d) < Math.abs(raw - best))) best = d;
	return best;
}

/** A pointer's travel in one drag, and the modifiers held as it went. */
export interface DragMove {
	x: number;
	y: number;
	/** since the press */
	dx: number;
	dy: number;
	/** since the last move */
	mx: number;
	my: number;
	shift: boolean;
	alt: boolean;
}

/**
 * How fast a drag runs: slower the further the pointer strays from where it
 * pressed, a half and then a quarter, so a trackpad gets fine control with no
 * key held; shift ten times, alt a tenth.
 */
export function scrubSpeed(move: Pick<DragMove, "dy" | "shift" | "alt">): number {
	const away = Math.abs(move.dy);
	return (away < 36 ? 1 : away < 110 ? 0.5 : 0.25) * (move.shift ? 10 : move.alt ? 0.1 : 1);
}

/** pixels of a label scrub one step takes at speed one */
const PX_PER_STEP = 2;
/** pixels of travel a detent holds a drag for */
const DETENT_PX = 5;

/**
 * One move of a drag on a number, `perPx` a pixel's worth at speed one: the
 * raw value it carries on with, and the value to show, a whole step (a tenth
 * of one under alt) unless a detent or the value it set out from holds it.
 */
export function scrubNumber(
	raw: number,
	move: Pick<DragMove, "mx" | "dy" | "shift" | "alt">,
	perPx: number,
	from: number,
	rules: NumberRules,
): { raw: number; value: number } {
	const speed = scrubSpeed(move);
	const next = fitNumber(raw + move.mx * perPx * speed, rules);
	const near = stickTo(next, [...(rules.detents ?? []), from], DETENT_PX * perPx * Math.min(1, speed));
	const quantum = (rules.step ?? 1) * (move.alt ? 0.1 : 1);
	return { raw: next, value: near ?? fitNumber(Math.round(next / quantum) * quantum, rules) };
}

/**
 * Runs one press to its end, captured so it survives leaving its element.
 * `move` hears the pointer once it has come `threshold` pixels; Escape is
 * caught before anything else hears it and ends the drag in `cancel`, as
 * losing the pointer or the window does.
 */
export function drag(
	event: ReactPointerEvent<Element>,
	on: { move: (move: DragMove) => void; end: () => void; cancel: () => void },
	threshold = 0,
): void {
	if (event.button !== 0) return;
	event.preventDefault();
	event.stopPropagation();
	const target = event.currentTarget as HTMLElement;
	// the press's default is gone, and with it the focus a slider's keys need
	if (target.tabIndex >= 0) target.focus({ preventScroll: true });
	const doc = target.ownerDocument;
	const pointer = event.pointerId;
	const start = { x: event.clientX, y: event.clientY };
	let last = start;
	let started = threshold === 0;
	const move = (next: PointerEvent) => {
		if (next.pointerId !== pointer) return;
		const at = { x: next.clientX, y: next.clientY };
		if (!started && Math.abs(at.x - start.x) + Math.abs(at.y - start.y) < threshold) return;
		started = true;
		const { x, y } = at;
		on.move({
			x,
			y,
			dx: x - start.x,
			dy: y - start.y,
			mx: x - last.x,
			my: y - last.y,
			shift: next.shiftKey,
			alt: next.altKey,
		});
		last = at;
	};
	const finish = (cancelled: boolean) => {
		doc.removeEventListener("pointermove", move, true);
		doc.removeEventListener("pointerup", up, true);
		doc.removeEventListener("pointercancel", lost, true);
		doc.defaultView?.removeEventListener("keydown", key, true);
		doc.defaultView?.removeEventListener("blur", away);
		try {
			target.releasePointerCapture(pointer);
		} catch {
			/* never captured */
		}
		if (cancelled) on.cancel();
		else on.end();
	};
	const up = (next: PointerEvent) => next.pointerId === pointer && finish(false);
	const lost = (next: PointerEvent) => next.pointerId === pointer && finish(true);
	const away = () => finish(true);
	const key = (next: KeyboardEvent) => {
		if (next.key !== "Escape") return;
		next.preventDefault();
		next.stopImmediatePropagation();
		finish(true);
	};
	doc.addEventListener("pointermove", move, true);
	doc.addEventListener("pointerup", up, true);
	doc.addEventListener("pointercancel", lost, true);
	doc.defaultView?.addEventListener("keydown", key, true);
	doc.defaultView?.addEventListener("blur", away);
	try {
		target.setPointerCapture(pointer);
	} catch {
		/* the document's listeners carry it */
	}
}

/** One gesture's reports, so a gesture is one write however long it runs. */
export interface TuneGesture<T> {
	/** where it is now */
	readonly value: T;
	/** moves it, when `next` is somewhere new */
	live: (next: T) => void;
	/** the one commit; a gesture that came back where it set out from cancels instead, so nothing writes */
	end: () => void;
	/** puts back the value it set out from */
	cancel: () => void;
}

export function tuneGesture<T>(from: T, onTune: TuneProps<T>["onTune"]): TuneGesture<T> {
	const same = (a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
	let last = from;
	let moved = false;
	const stop = (phase: TunePhase) => {
		if (moved) onTune(phase === "commit" ? last : from, phase);
		moved = false;
	};
	return {
		get value() {
			return last;
		},
		live(next) {
			if (same(next, last)) return;
			last = next;
			moved = true;
			onTune(next, "live");
		},
		end: () => stop(same(last, from) ? "cancel" : "commit"),
		cancel: () => stop("cancel"),
	};
}

/**
 * A label that scrubs a number: spread the handler on it. A drag sideways
 * moves the number a step every two pixels at speed one (`scrubSpeed`), and
 * the value it set out from holds it a moment on the way back.
 */
export function useScrub(
	value: number,
	rules: NumberRules,
	onTune: TuneProps<number>["onTune"],
): (event: ReactPointerEvent<Element>) => void {
	const held = useRef({ value, rules, onTune });
	held.current = { value, rules, onTune };
	return (event) => {
		const { value: from, rules: now } = held.current;
		const tune = tuneGesture(from, (next, phase) => held.current.onTune(next, phase));
		const perPx = (now.step ?? 1) / PX_PER_STEP;
		let raw = from;
		const move = (step: DragMove) => {
			const next = scrubNumber(raw, step, perPx, from, now);
			raw = next.raw;
			tune.live(next.value);
		};
		drag(event, { move, end: tune.end, cancel: tune.cancel }, 3);
	};
}

const STEP_KEYS: Readonly<Record<string, 1 | -1>> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 };

/**
 * Arrow keys on a number: up and right step on, down and left back, shift ten
 * steps, alt a tenth. Each press moves it at once; the commit waits for the
 * key to come up, so a held arrow is one write however far it runs, and
 * Escape before then puts back where it began.
 */
export function useKeyTune(value: number, rules: NumberRules, onTune: TuneProps<number>["onTune"]) {
	const gesture = useRef<TuneGesture<number> | null>(null);
	const held = useRef(onTune);
	held.current = onTune;
	const end = () => {
		gesture.current?.end();
		gesture.current = null;
	};
	return {
		onKeyDown: (event: ReactKeyboardEvent<Element>) => {
			if (event.key === "Escape" && gesture.current !== null) {
				event.preventDefault();
				event.stopPropagation();
				gesture.current.cancel();
				gesture.current = null;
				return;
			}
			const sign = STEP_KEYS[event.key];
			if (sign === undefined) return;
			event.preventDefault();
			event.stopPropagation();
			gesture.current ??= tuneGesture(value, (next, phase) => held.current(next, phase));
			const by = (rules.step ?? 1) * (event.shiftKey ? 10 : event.altKey ? 0.1 : 1);
			gesture.current.live(fitNumber(gesture.current.value + sign * by, rules));
		},
		onKeyUp: (event: ReactKeyboardEvent<Element>) => {
			if (STEP_KEYS[event.key] !== undefined) end();
		},
		onBlur: end,
	};
}

export interface NumberFieldProps
	extends Omit<FieldBoxProps, "children" | "onChange" | "defaultValue" | "prefix" | "size">,
		NumberRules {
	size?: FieldSize | undefined;
	value: number;
	/**
	 * Every change as a knob reports it: the prefix scrubs and a held arrow
	 * runs `live` until one `commit`, a typed number commits on Enter or blur.
	 * Without it the field is the panel's older kind, and reports below.
	 */
	onTune?: TuneProps<number>["onTune"] | undefined;
	/** a typed number, committed on Enter or blur, and never the value it already has */
	onValueChange?: ((next: number) => void) | undefined;
	/** whole steps from the arrows, signed: one a press, ten under shift. Without it the arrows step `value` by `step` */
	onStep?: ((units: number) => void) | undefined;
	/** the axis in the box: `x`, `w`, when no row names it; with `onTune` it scrubs */
	prefix?: string | undefined;
	label?: string | undefined;
	inputProps?: ComponentProps<"input"> | undefined;
}

/**
 * A number in mono with its unit faint beside it. Quiet in a panel, so the
 * panel reads as values and the box arrives under the pointer. Focus selects
 * the number to type over, with maths and units (`readNumber`); the draft is
 * the field's own until Enter or blur commits it, held to `min` and `max`,
 * Escape puts the number back, and the arrows step.
 */
export function NumberField({
	size = "xs",
	tone = "quiet",
	value,
	onTune,
	onValueChange,
	onStep,
	min,
	max,
	step = 1,
	unit,
	units,
	detents,
	wrap,
	prefix,
	label,
	error = false,
	disabled = false,
	inputProps,
	className,
	...rest
}: NumberFieldProps) {
	const rules: NumberRules = { min, max, step, unit, units, detents, wrap };
	const [draft, setDraft] = useState<string | null>(null);
	// the draft as the handlers read it, which is a render ahead of the state:
	// Escape's blur would otherwise commit the draft it just dropped
	const typed = useRef<string | null>(null);
	const tune = onTune ?? (() => {});
	const keys = useKeyTune(value, rules, tune);
	const scrub = useScrub(value, rules, tune);
	const finish = (commit: boolean) => {
		const held = typed.current;
		typed.current = null;
		setDraft(null);
		if (!commit || held === null) return;
		const read = readNumber(held, value, rules);
		if (read === null) return;
		const next = fitNumber(read, rules);
		if (next === value) return;
		if (onTune === undefined) onValueChange?.(next);
		else onTune(next, "commit");
	};
	return (
		<FieldBox
			size={size}
			tone={tone}
			error={error}
			disabled={disabled}
			className={cn("type-value", className)}
			{...rest}
		>
			{prefix === undefined ? null : (
				<span
					onPointerDown={onTune === undefined ? undefined : scrub}
					className={cn(
						AFFIX,
						"type-detail",
						onTune !== undefined &&
							"cursor-ew-resize touch-none select-none transition-colors duration-fast hover:text-primary",
					)}
				>
					{prefix}
				</span>
			)}
			<input
				inputMode="decimal"
				value={draft ?? String(fitNumber(value, {}))}
				disabled={disabled}
				aria-label={label}
				aria-invalid={error || undefined}
				spellCheck={false}
				{...inputProps}
				onFocus={(event) => {
					inputProps?.onFocus?.(event);
					event.target.select();
				}}
				onChange={(event) => {
					typed.current = event.target.value;
					setDraft(event.target.value);
				}}
				onBlur={(event) => {
					inputProps?.onBlur?.(event);
					keys.onBlur();
					finish(true);
				}}
				onKeyUp={(event) => {
					inputProps?.onKeyUp?.(event);
					keys.onKeyUp(event);
				}}
				onKeyDown={(event) => {
					inputProps?.onKeyDown?.(event);
					if (event.nativeEvent.isComposing) return;
					const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
					if (onTune !== undefined && (vertical || event.key === "Escape")) {
						if (vertical) finish(false);
						keys.onKeyDown(event);
						if (event.defaultPrevented) return;
					}
					if (event.key === "Enter") {
						event.preventDefault();
						finish(true);
						event.currentTarget.blur();
					}
					if (event.key === "Escape") {
						event.preventDefault();
						finish(false);
						event.currentTarget.blur();
					}
					if (vertical) {
						event.preventDefault();
						finish(false);
						const units = (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1);
						if (onStep === undefined) onValueChange?.(value + units * step);
						else onStep(units);
					}
				}}
				className={cn(INPUT, "tabular-nums", inputProps?.className)}
			/>
			{unit === undefined ? null : <span className={cn(AFFIX, "type-detail")}>{unit}</span>}
		</FieldBox>
	);
}

/* --------------------------------------------------------- SearchField -- */

export interface SearchFieldProps extends Omit<TextFieldProps, "icon" | "clearable" | "suffix"> {
	/** the key that jumps here, shown while the field is empty; empty for none */
	hotkey?: string | undefined;
}

/**
 * A filter over what is on screen: the glass, the words, and in the tail the
 * key that jumps here while empty, the clear once there is something to clear.
 */
export function SearchField({ size = "lg", hotkey = "/", label, placeholder, ...rest }: SearchFieldProps) {
	const [text, setText] = useMaybeControlled(rest.value, rest.defaultValue, rest.onValueChange);
	return (
		<TextField
			size={size}
			icon={<SearchIcon />}
			placeholder={placeholder}
			label={label ?? placeholder}
			{...rest}
			value={text}
			onValueChange={setText}
			clearable
			inputProps={{
				type: "search",
				autoComplete: "off",
				...rest.inputProps,
				className: cn("[&::-webkit-search-cancel-button]:hidden", rest.inputProps?.className),
			}}
			suffix={text === "" && hotkey !== "" ? <Kbd>{hotkey}</Kbd> : undefined}
		/>
	);
}

/* ------------------------------------------------------------ Textarea -- */

export interface TextareaProps extends Omit<FieldBoxProps, "children" | "onChange" | "defaultValue"> {
	value?: string | undefined;
	defaultValue?: string | undefined;
	placeholder?: string | undefined;
	onValueChange?: ((next: string) => void) | undefined;
	/** at least this many lines before it grows */
	rows?: number | undefined;
	/** a paste of something the machine reads: JSON, a path */
	mono?: boolean | undefined;
	label?: string | undefined;
	textareaProps?: Omit<TextareaBareProps, "value" | "defaultValue" | "onValueChange"> | undefined;
}

/** Several lines in the field box. It grows with what is typed from `rows` up. */
export function Textarea({
	value,
	defaultValue,
	placeholder,
	onValueChange,
	rows = 3,
	mono = false,
	label,
	error = false,
	disabled = false,
	textareaProps,
	className,
	...rest
}: TextareaProps) {
	return (
		<FieldBox
			size="auto"
			error={error}
			disabled={disabled}
			className={cn("items-stretch rounded-sm px-2 py-1.5", className)}
			{...rest}
		>
			<TextareaBare
				value={value}
				defaultValue={defaultValue}
				placeholder={placeholder}
				onValueChange={onValueChange}
				rows={rows}
				aria-label={label}
				aria-invalid={error || undefined}
				disabled={disabled}
				text={mono ? "value" : "control"}
				{...textareaProps}
			/>
		</FieldBox>
	);
}

export interface TextareaBareProps extends Omit<ComponentProps<"textarea">, "onChange" | "value" | "defaultValue"> {
	/** the type role: body in a composer, control in a form, value for a paste */
	text?: "body" | "control" | "value" | undefined;
	value?: string | undefined;
	defaultValue?: string | undefined;
	onValueChange?: ((next: string) => void) | undefined;
}

const TEXT_ROLE = { body: "type-body", control: "type-control", value: "type-value" } as const;

/**
 * The bare multi-line input, no chrome at all: body type, secondary
 * placeholder, grows to its content from `rows`.
 */
export function TextareaBare({
	text: role = "body",
	value,
	defaultValue,
	onValueChange,
	rows = 3,
	className,
	style,
	...rest
}: TextareaBareProps) {
	const [text, setText] = useMaybeControlled(value, defaultValue, onValueChange);
	return (
		<textarea
			value={text}
			rows={rows}
			spellCheck={false}
			onChange={(event) => setText(event.target.value)}
			// content sets the height, `rows` lines of the role's own leading are the floor
			style={{ minHeight: `${rows}lh`, ...style }}
			className={cn(
				"block w-full min-w-0 resize-none bg-transparent text-primary outline-none [field-sizing:content] placeholder:text-secondary disabled:cursor-not-allowed",
				TEXT_ROLE[role],
				className,
			)}
			{...rest}
		/>
	);
}

/* ------------------------------------------------------- SelectTrigger -- */

export interface SelectTriggerProps extends Omit<ComponentProps<"button">, "value"> {
	/** what is chosen */
	value: ReactNode;
	/** its menu is showing */
	open?: boolean | undefined;
	mono?: boolean | undefined;
	"data-state"?: "hover" | "active" | "focus" | undefined;
}

/**
 * What opens a choice, quiet: words and a chevron in a toolbar or a foot,
 * secondary until the pointer or open brings it to full ink. The menu itself
 * is the menus family's; the chevron turns on `aria-expanded`.
 */
export function SelectTrigger({
	value,
	open = false,
	mono = false,
	type = "button",
	className,
	...rest
}: SelectTriggerProps) {
	return (
		<button
			type={type}
			aria-haspopup="listbox"
			aria-expanded={open}
			className={cn(
				"group/select relative inline-flex h-control-sm min-w-0 shrink-0 select-none items-center gap-1 rounded-xs border border-transparent px-1 text-left",
				"transition-[border-color,background-color,color] duration-fast ease-out motion-reduce:transition-none",
				"disabled:cursor-not-allowed disabled:opacity-40",
				mono ? "type-value" : "type-label",
				"focus-ring text-secondary enabled:hover:text-primary data-[state=hover]:text-primary aria-expanded:text-primary",
				"enabled:active:bg-state-hover-raised data-[state=active]:bg-state-hover-raised",
				className,
			)}
			{...rest}
		>
			<span className="flex min-w-0 items-center gap-1.5 truncate">{value}</span>
			{/* the house chevron points right; a choice opens downward */}
			<span className="flex size-3 shrink-0 rotate-90 transition-transform duration-fast ease-out group-aria-expanded/select:-rotate-90 [&>svg]:size-full">
				<ChevronIcon />
			</span>
		</button>
	);
}

/* --------------------------------------------------------------- Field -- */

export interface FieldProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
	label: ReactNode;
	/** one sentence on what it changes */
	hint?: ReactNode;
	/** why what was typed was refused; replaces the hint and wears danger */
	error?: ReactNode;
	/** given the control's id so the label points at it */
	children: (id: string) => ReactNode;
}

/**
 * A control with its words, the label over it. The hint says what it does in
 * one sentence, and an error, when there is one, takes the hint's place in
 * danger so the stack never grows a line.
 */
export function Field({ label, hint, error, className, children, ...rest }: FieldProps) {
	const id = useId();
	const refused = error !== undefined && error !== null && error !== false;
	return (
		<div data-error={refused || undefined} className={cn("flex min-w-0 flex-col gap-1.5", className)} {...rest}>
			<label htmlFor={id} className="text-primary type-label">
				{label}
			</label>
			{children(id)}
			{refused ? (
				<span role="alert" className="text-danger-strong type-label">
					{error}
				</span>
			) : hint === undefined ? null : (
				<span className="text-secondary type-label">{hint}</span>
			)}
		</div>
	);
}

/* --------------------------------------------------------- ColourField -- */

export interface ColourFieldProps extends Omit<FieldBoxProps, "children" | "onChange" | "defaultValue"> {
	/** a hex: data, so the swatch paints it as given */
	value: string;
	/** the system picker, as it drags */
	onPick: (next: string) => void;
	/** a typed hex, on Enter or blur, when it differs from `value`; refusing one is the caller's */
	onType: (typed: string) => void;
	/** the one in play, the way a moved token is drawn */
	lit?: boolean | undefined;
	label: string;
	/** called as the hex field takes focus, so a refusal can be taken back */
	onTypeStart?: (() => void) | undefined;
}

/**
 * A colour as a swatch and its hex. The swatch opens the system's own picker;
 * the hex is typed and committed on Enter or blur. Escape puts the value back.
 */
export function ColourField({
	value,
	onPick,
	onType,
	onTypeStart,
	lit = false,
	label,
	error = false,
	disabled = false,
	className,
	...rest
}: ColourFieldProps) {
	const [draft, setDraft] = useState<string | null>(null);
	// read by blur, which Escape's own blur reaches before the cleared draft renders
	const typed = useRef<string | null>(null);
	return (
		<span
			data-error={error || undefined}
			className={cn("inline-flex shrink-0 items-center gap-2", disabled && "opacity-40", className)}
		>
			<span
				className={cn(
					"relative block size-control-xs shrink-0 overflow-hidden rounded-xs border",
					"transition-[border-color] duration-fast ease-out",
					lit ? "border-secondary" : "border-line-strong",
				)}
				style={{ background: value }}
			>
				<input
					type="color"
					aria-label={`${label} picker`}
					value={value}
					disabled={disabled}
					onChange={(event) => onPick(event.target.value.toLowerCase())}
					className="absolute inset-0 size-full cursor-pointer opacity-0"
				/>
			</span>
			<FieldBox size="md" error={error} disabled={disabled} className="type-value" {...rest}>
				<input
					value={draft ?? value}
					aria-label={label}
					aria-invalid={error || undefined}
					disabled={disabled}
					spellCheck={false}
					onFocus={onTypeStart}
					onChange={(event) => {
						typed.current = event.target.value;
						setDraft(event.target.value);
					}}
					onBlur={() => {
						const held = typed.current;
						typed.current = null;
						setDraft(null);
						if (held !== null) onType(held);
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							event.currentTarget.blur();
						} else if (event.key === "Escape") {
							// the field's own: the sheet around it must not close on it
							event.preventDefault();
							event.stopPropagation();
							typed.current = null;
							setDraft(null);
							event.currentTarget.blur();
						}
					}}
					className={cn(INPUT, "flex-none [field-sizing:content]")}
				/>
			</FieldBox>
		</span>
	);
}
