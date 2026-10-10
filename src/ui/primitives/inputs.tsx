// Input primitives: TextField, NumberField, SearchField, Textarea and the bare
// multi-line input, SelectTrigger, Field (label, hint, error) and ColourField.
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
	type ReactNode,
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

export interface NumberFieldProps
	extends Omit<FieldBoxProps, "children" | "onChange" | "defaultValue" | "prefix" | "size"> {
	size?: FieldSize | undefined;
	value: number;
	/** a typed number, committed on Enter or blur, and never the value it already has */
	onValueChange: (next: number) => void;
	/** whole steps from the arrows, signed: one a press, ten under shift. Without it the arrows step `value` by `step` */
	onStep?: ((units: number) => void) | undefined;
	/** what one arrow press moves `value` by, when no `onStep` takes the steps */
	step?: number | undefined;
	/** what it measures: `px` */
	unit?: string | undefined;
	/** the axis in the box: `x`, `w`, when no row names it */
	prefix?: string | undefined;
	label?: string | undefined;
	inputProps?: ComponentProps<"input"> | undefined;
}

/**
 * A number in mono with its unit faint beside it. Quiet in a panel, so the
 * panel reads as values and the box arrives under the pointer. Focus selects
 * the number to type over; the draft is the field's own until Enter or blur
 * commits it, Escape puts the number back, and the arrows step.
 */
export function NumberField({
	size = "xs",
	tone = "quiet",
	value,
	onValueChange,
	onStep,
	step = 1,
	unit,
	prefix,
	label,
	error = false,
	disabled = false,
	inputProps,
	className,
	...rest
}: NumberFieldProps) {
	const [draft, setDraft] = useState<string | null>(null);
	// the draft as the handlers read it, which is a render ahead of the state:
	// Escape's blur would otherwise commit the draft it just dropped
	const typed = useRef<string | null>(null);
	const finish = (commit: boolean) => {
		const held = typed.current;
		typed.current = null;
		setDraft(null);
		if (!commit || held === null) return;
		const parsed = Number.parseFloat(held);
		if (!Number.isNaN(parsed) && parsed !== value) onValueChange(parsed);
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
			{prefix === undefined ? null : <span className={cn(AFFIX, "type-detail")}>{prefix}</span>}
			<input
				inputMode="numeric"
				value={draft ?? String(value)}
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
					finish(true);
				}}
				onKeyDown={(event) => {
					inputProps?.onKeyDown?.(event);
					if (event.nativeEvent.isComposing) return;
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
					if (event.key === "ArrowUp" || event.key === "ArrowDown") {
						event.preventDefault();
						finish(false);
						const units = (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1);
						if (onStep === undefined) onValueChange(value + units * step);
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
