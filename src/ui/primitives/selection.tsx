// Selection primitives: the controls that hold a choice. Every one is a real
// native input (checkbox or radio) hidden under its drawing, so keyboard,
// forms and screen readers work as they do on the web; the drawing reads the
// input through `:has()`.
//
// States: hover, active and focus are the real pseudo-classes, paired with
// `data-state="hover|active|focus"` on the root so a sheet can force one.
// `disabled` goes to the input.

import { type ComponentProps, createContext, type ReactNode, useContext, useId } from "react";
import { cn } from "../cn";

/** label and description beside a mark, the mark centred on the label's first line */
function Words({ label, description }: { label?: ReactNode; description?: ReactNode }) {
	if (label === undefined && description === undefined) return null;
	return (
		<span className="flex min-w-0 flex-col">
			{label === undefined ? null : <span className="text-primary type-control">{label}</span>}
			{description === undefined ? null : <span className="text-secondary type-label">{description}</span>}
		</span>
	);
}

/* ------------------------------------------------------------ Checkbox -- */

/**
 * A yes or no that sits in a list of others. A 16px box at radius-xs: a
 * tertiary hairline empty (a line colour is too faint on a raised surface for
 * something you must find), the thread filled with an on-accent check when
 * checked. It centres on the first line of a control label (20), so longer
 * words wrap under the words and never under the box.
 */
export function Checkbox({
	checked,
	onCheckedChange,
	disabled,
	name,
	value,
	label,
	className,
	...rest
}: Omit<ComponentProps<"label">, "onChange"> & {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	disabled?: boolean | undefined;
	name?: string | undefined;
	value?: string | undefined;
	label?: ReactNode;
}) {
	return (
		<label
			className={cn(
				"group/check inline-flex cursor-pointer items-start gap-2",
				"has-disabled:cursor-default has-disabled:opacity-40",
				className,
			)}
			{...rest}
		>
			<span className="flex h-5 shrink-0 items-center">
				<input
					type="checkbox"
					className="peer sr-only"
					checked={checked}
					onChange={(event) => onCheckedChange(event.currentTarget.checked)}
					disabled={disabled}
					name={name}
					value={value}
				/>
				<span
					className={cn(
						"flex size-4 items-center justify-center rounded-xs border border-tertiary text-on-accent",
						"transition-[background-color,border-color] duration-quick ease-out",
						"group-hover/check:border-secondary group-data-[state=hover]/check:border-secondary",
						"group-active/check:bg-state-pressed group-data-[state=active]/check:bg-state-pressed",
						"group-has-checked/check:border-accent group-has-checked/check:bg-accent",
						"group-has-checked/check:group-hover/check:bg-accent-hover group-has-checked/check:group-data-[state=hover]/check:bg-accent-hover",
						"group-has-checked/check:group-active/check:bg-accent-pressed group-has-checked/check:group-data-[state=active]/check:bg-accent-pressed",
						"peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-line-focus peer-focus-visible:outline-solid",
						"group-data-[state=focus]/check:outline-2 group-data-[state=focus]/check:outline-offset-2 group-data-[state=focus]/check:outline-line-focus group-data-[state=focus]/check:outline-solid",
					)}
				>
					<svg
						viewBox="0 0 16 16"
						fill="none"
						aria-hidden="true"
						className="size-3 opacity-0 group-has-checked/check:opacity-100"
					>
						<path
							d="m3.5 8.25 3 3 6-6.5"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</span>
			</span>
			<Words label={label} />
		</label>
	);
}

/* ----------------------------------------------------------- RadioCard -- */

interface RadioInputProps {
	name: string;
	value: string;
	checked: boolean;
	onSelect: (value: string) => void;
	disabled?: boolean | undefined;
}

/**
 * A choice big enough to explain itself: the export dialog's PNG or PDF. The
 * whole card is the target. At rest it has no edge; hover lays the raised
 * wash; checked it takes a thread hairline on state-selected and an 8px thread
 * dot pops into its ring. Focus rings the card, inset, rather than the dot.
 * Lives on a raised surface.
 */
export function RadioCard({
	name,
	value,
	checked,
	onSelect,
	disabled,
	label,
	description,
	className,
	...rest
}: Omit<ComponentProps<"label">, "onSelect"> & RadioInputProps & { label: ReactNode; description?: ReactNode }) {
	return (
		<label
			className={cn(
				"group/radio flex cursor-pointer items-center gap-3 rounded-md border border-transparent px-3 py-2",
				"transition-[background-color,border-color] duration-fast ease-out",
				"hover:bg-state-hover-raised data-[state=hover]:bg-state-hover-raised",
				// pressed on a raised surface has no step of its own: it holds the hover wash
				"active:bg-state-hover-raised data-[state=active]:bg-state-hover-raised",
				"has-checked:border-accent has-checked:bg-state-selected",
				"has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-line-focus has-focus-visible:outline-solid",
				"data-[state=focus]:outline-2 data-[state=focus]:-outline-offset-2 data-[state=focus]:outline-line-focus data-[state=focus]:outline-solid",
				"has-disabled:cursor-default has-disabled:bg-transparent has-disabled:opacity-40",
				className,
			)}
			{...rest}
		>
			<input
				type="radio"
				className="peer sr-only"
				name={name}
				value={value}
				checked={checked}
				disabled={disabled}
				onChange={() => onSelect(value)}
			/>
			<span
				className={cn(
					"flex size-4 shrink-0 items-center justify-center rounded-full border border-tertiary",
					"transition-[border-color] duration-quick ease-out",
					"group-hover/radio:border-secondary group-data-[state=hover]/radio:border-secondary",
					"group-active/radio:bg-state-pressed group-data-[state=active]/radio:bg-state-pressed",
					"group-has-checked/radio:border-accent",
				)}
			>
				<span
					className={cn(
						"size-2 scale-40 rounded-full bg-accent opacity-0",
						"transition-[opacity,scale] duration-fast ease-snap",
						"group-has-checked/radio:scale-100 group-has-checked/radio:opacity-100",
					)}
				/>
			</span>
			<Words label={label} description={description} />
		</label>
	);
}

/** Names a set of radio cards as one choice. Stacks them 4px apart. */
export function RadioGroup({ label, className, children, ...rest }: ComponentProps<"div"> & { label: string }) {
	return (
		<div role="radiogroup" aria-label={label} className={cn("flex flex-col gap-1", className)} {...rest}>
			{children}
		</div>
	);
}

/* --------------------------------------------------------------- Switch -- */

/**
 * On or off, taking effect as it is flipped: a setting. 16 by 28, a 10px knob
 * 2px in from the edge. Off: the raised fill in a strong hairline, knob in
 * secondary ink. On: the thread, knob on-accent, slid fast on ease-out. It
 * names itself with `aria-label`; the words beside it are the row's.
 */
export function Switch({
	checked,
	onCheckedChange,
	disabled,
	className,
	"aria-label": ariaLabel,
	...rest
}: Omit<ComponentProps<"label">, "onChange"> & {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	disabled?: boolean | undefined;
}) {
	return (
		<label
			className={cn(
				"group/switch inline-flex cursor-pointer items-center",
				"has-disabled:cursor-default has-disabled:opacity-40",
				className,
			)}
			{...rest}
		>
			<input
				type="checkbox"
				role="switch"
				aria-checked={checked}
				aria-label={ariaLabel}
				className="peer sr-only"
				checked={checked}
				disabled={disabled}
				onChange={(event) => onCheckedChange(event.currentTarget.checked)}
			/>
			<span
				className={cn(
					"flex h-4 w-control-md shrink-0 items-center rounded-full border border-line-strong bg-surface-raised",
					"transition-[background-color,border-color] duration-fast ease-out",
					"group-hover/switch:border-tertiary group-data-[state=hover]/switch:border-tertiary",
					"group-active/switch:bg-state-pressed group-data-[state=active]/switch:bg-state-pressed",
					"group-has-checked/switch:border-accent group-has-checked/switch:bg-accent",
					"group-has-checked/switch:group-hover/switch:border-accent-hover group-has-checked/switch:group-hover/switch:bg-accent-hover group-has-checked/switch:group-data-[state=hover]/switch:border-accent-hover group-has-checked/switch:group-data-[state=hover]/switch:bg-accent-hover",
					"group-has-checked/switch:group-active/switch:bg-accent-pressed group-has-checked/switch:group-data-[state=active]/switch:bg-accent-pressed",
					"peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-line-focus peer-focus-visible:outline-solid",
					"group-data-[state=focus]/switch:outline-2 group-data-[state=focus]/switch:outline-offset-2 group-data-[state=focus]/switch:outline-line-focus group-data-[state=focus]/switch:outline-solid",
				)}
			>
				<span
					className={cn(
						// 16 less two hairlines and two 2px insets
						"size-2.5 translate-x-0.5 rounded-full bg-secondary",
						"transition-[translate,background-color] duration-fast ease-out",
						"group-has-checked/switch:translate-x-3.5 group-has-checked/switch:bg-on-accent",
					)}
				/>
			</span>
		</label>
	);
}

/* ----------------------------------------------------- SegmentedControl -- */

export type SegmentedSize = "sm" | "md";

interface SegmentedContext {
	name: string;
	size: SegmentedSize;
	value: string;
	onValueChange: (value: string) => void;
}

const Segmented = createContext<SegmentedContext | null>(null);

const SEGMENTED_SIZE: Record<SegmentedSize, { root: string; segment: string }> = {
	sm: { root: "h-control-sm", segment: "px-2" },
	md: { root: "h-control-md", segment: "px-3" },
};

/**
 * One of a few short values, side by side: Ask or Only this Mac, system,
 * light or dark. A default hairline at radius-sm with 1px inside it; each
 * segment is mono value text at radius-xs, one tier in. The chosen one takes
 * state-selected-strong and primary ink; the others are secondary until
 * hovered. sm 24, md 28. Segments are `Segment` children.
 */
export function SegmentedControl({
	label,
	size = "md",
	value,
	onValueChange,
	className,
	children,
	...rest
}: ComponentProps<"div"> & {
	/** what the choice is, for a screen reader */
	label: string;
	size?: SegmentedSize | undefined;
	value: string;
	onValueChange: (value: string) => void;
}) {
	const name = useId();
	return (
		<Segmented.Provider value={{ name, size, value, onValueChange }}>
			<div
				role="radiogroup"
				aria-label={label}
				className={cn(
					"inline-flex shrink-0 items-stretch rounded-sm border border-line-default p-px",
					SEGMENTED_SIZE[size].root,
					className,
				)}
				{...rest}
			>
				{children}
			</div>
		</Segmented.Provider>
	);
}

export function Segment({
	value,
	disabled,
	className,
	children,
	...rest
}: Omit<ComponentProps<"label">, "onSelect"> & { value: string; disabled?: boolean | undefined }) {
	const group = useContext(Segmented);
	if (group === null) throw new Error("Segment sits inside a SegmentedControl");
	return (
		<label
			className={cn(
				"flex cursor-pointer items-center whitespace-nowrap rounded-xs text-secondary type-value",
				"transition-[background-color,color] duration-fast ease-out",
				"hover:text-primary data-[state=hover]:text-primary",
				"active:bg-state-pressed data-[state=active]:bg-state-pressed",
				"has-checked:bg-state-selected-strong has-checked:text-primary",
				"has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-line-focus has-focus-visible:outline-solid",
				"data-[state=focus]:outline-2 data-[state=focus]:-outline-offset-2 data-[state=focus]:outline-line-focus data-[state=focus]:outline-solid",
				"has-disabled:cursor-default has-disabled:opacity-40 has-disabled:hover:text-secondary",
				SEGMENTED_SIZE[group.size].segment,
				className,
			)}
			{...rest}
		>
			<input
				type="radio"
				className="peer sr-only"
				name={group.name}
				value={value}
				checked={group.value === value}
				disabled={disabled}
				onChange={() => group.onValueChange(value)}
			/>
			{children}
		</label>
	);
}
