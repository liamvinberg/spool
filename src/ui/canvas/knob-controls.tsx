import { useEffect, useRef } from "react";
import type { KnobChoice, KnobSpec, KnobValue } from "../../runtime/knob-protocol";
import { cn } from "../cn";
import { Button } from "../primitives/actions";
import { ColourField, NumberField, Textarea, TextField, type TuneProps } from "../primitives/inputs";
import { MenuItem } from "../primitives/overlays";
import { Segment, SegmentedControl, Switch } from "../primitives/selection";
import { PropertyValue } from "../primitives/structure";
import { knobWords, nudged, optionValue, unitOf } from "./knobs";

/**
 * Each knob type's control (#220), in one place: what its row says at rest,
 * the control that acts in its row, and the editor it opens into. Every
 * control reports through `TuneProps`: `live` while a hand is on it, `commit`
 * once when it lets go, `cancel` with the value from before.
 */

export interface KnobControlProps extends TuneProps<KnobValue> {
	spec: KnobSpec;
	/** the knob's own name, for a screen reader */
	label: string;
}

const choicesOf = (spec: KnobSpec): readonly KnobChoice[] => {
	if ("options" in spec && spec.options !== undefined) return spec.options.map((option) => option as KnobChoice);
	return [];
};

const choiceOf = (spec: KnobSpec, value: KnobValue | undefined) =>
	choicesOf(spec).find((choice) => optionValue(choice) === String(value));

/* ---------- at rest ---------- */

/** What a row says at rest: the value the way its literal reads, with a swatch or a picture where one says more. */
export function KnobPreview({ spec, value }: { spec: KnobSpec; value: KnobValue | undefined }) {
	const words = knobWords(value);
	switch (spec.type) {
		case "color":
		case "gradient":
			return (
				<span className="flex min-w-0 flex-1 items-center gap-2 px-1">
					<span
						className={cn(
							"block h-3.5 shrink-0 rounded-xs border border-line-strong",
							spec.type === "color" ? "w-3.5" : "w-7",
						)}
						style={{ background: words }}
					/>
					<span className="min-w-0 truncate text-primary type-value">{words}</span>
				</span>
			);
		case "font":
			return <PropertyValue value={<span style={{ fontFamily: words }}>{words}</span>} />;
		case "pictures":
		case "image":
		case "icon": {
			const choice = choiceOf(spec, value);
			const image = typeof choice === "object" ? choice.image : undefined;
			return (
				<span className="flex min-w-0 flex-1 items-center gap-2 px-1">
					{image === undefined ? null : (
						<img src={image} alt="" className="size-4 shrink-0 rounded-xs object-cover" />
					)}
					<span className="min-w-0 truncate text-primary type-value">
						{typeof choice === "object" ? (choice.label ?? choice.value) : words}
					</span>
				</span>
			);
		}
		default:
			return <PropertyValue value={words} unit={unitOf(spec)} />;
	}
}

/* ---------- in the row ---------- */

/** The control of a knob that acts where its row stands and never opens. */
export function KnobInRow({
	spec,
	value,
	onTune,
	disabled,
	label,
	onPress,
}: KnobControlProps & { onPress: () => void }) {
	switch (spec.type) {
		case "toggle":
			return (
				<span className="flex flex-1 justify-end">
					<Switch
						aria-label={label}
						checked={value === true}
						disabled={disabled}
						onCheckedChange={(on) => onTune(on, "commit")}
					/>
				</span>
			);
		case "stepper":
			return typeof value === "number" ? (
				<NumberField
					className="flex-1"
					value={value}
					unit={spec.unit}
					label={label}
					disabled={disabled}
					onValueChange={(typed) => onTune(clamp(spec, typed), "commit")}
					onStep={(units) => {
						const next = nudged(spec, value, units);
						if (next !== undefined) onTune(next, "commit");
					}}
				/>
			) : null;
		case "segmented":
			return (
				<SegmentedControl
					size="sm"
					label={label}
					value={String(value)}
					onValueChange={(next) => onTune(next, "commit")}
					className="flex-1"
				>
					{spec.options.map((choice) => (
						<Segment
							key={optionValue(choice)}
							value={optionValue(choice)}
							disabled={disabled}
							className="flex-1 justify-center"
						>
							{typeof choice === "object" ? (choice.label ?? choice.value) : choice}
						</Segment>
					))}
				</SegmentedControl>
			);
		case "text":
			return <Words value={String(value ?? "")} onTune={onTune} disabled={disabled} label={label} />;
		case "action":
			return (
				<Button variant="ghost" size="sm" className="flex-1 justify-start" disabled={disabled} onClick={onPress}>
					{spec.label ?? label}
				</Button>
			);
		default:
			return <KnobPreview spec={spec} value={value} />;
	}
}

/* ---------- opened ---------- */

/** The full editor a knob opens into, in place under its row, or in a popover beside it for a long list. */
export function KnobEditor({ spec, value, onTune, disabled, label }: KnobControlProps) {
	if (spec.type === "color") {
		return <Colour value={String(value ?? "")} onTune={onTune} disabled={disabled} label={label} />;
	}
	if (spec.type === "longtext") {
		return <Words value={String(value ?? "")} onTune={onTune} disabled={disabled} label={label} long />;
	}
	if (spec.type === "gradient" || spec.type === "shadow" || (spec.type === "font" && spec.options === undefined)) {
		return <Words value={String(value ?? "")} onTune={onTune} disabled={disabled} label={label} />;
	}
	if (choicesOf(spec).length > 0) {
		return <Choices spec={spec} value={value} onTune={onTune} disabled={disabled} label={label} />;
	}
	if (typeof value === "number") {
		return (
			<NumberField
				size="md"
				tone="boxed"
				value={value}
				unit={unitOf(spec)}
				label={label}
				disabled={disabled}
				onValueChange={(typed) => onTune(clamp(spec, typed), "commit")}
				onStep={(units) => {
					const next = nudged(spec, value, units);
					if (next !== undefined) onTune(next, "commit");
				}}
			/>
		);
	}
	if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
		return <Numbers spec={spec} value={value} onTune={onTune} disabled={disabled} label={label} />;
	}
	return <KnobPreview spec={spec} value={value} />;
}

function clamp(spec: KnobSpec, n: number): number {
	const min = "min" in spec && typeof spec.min === "number" ? spec.min : -Infinity;
	const max = "max" in spec && typeof spec.max === "number" ? spec.max : Infinity;
	return Math.min(max, Math.max(min, n));
}

/** What each number of a knob that holds several is called, by type and count. */
function partNames(spec: KnobSpec, count: number): readonly string[] | undefined {
	if (spec.type === "spacing") return count === 2 ? ["v", "h"] : ["t", "r", "b", "l"];
	if (spec.type === "corners") return ["tl", "tr", "br", "bl"];
	if (spec.type === "range") return ["from", "to"];
	if (spec.type === "easing") return ["x1", "y1", "x2", "y2"];
	return undefined;
}

/** A knob of several numbers, one field each: sides, corners, a range, a curve, a point, a spring. */
function Numbers({
	spec,
	value,
	onTune,
	disabled,
	label,
}: KnobControlProps & { value: readonly number[] | { readonly [key: string]: number | string } }) {
	const parts = Array.isArray(value)
		? value.map((n, index) => [partNames(spec, value.length)?.[index] ?? String(index), n] as const)
		: Object.entries(value);
	const put = (at: number, n: number) => {
		if (Array.isArray(value))
			onTune(
				value.map((was, index) => (index === at ? n : was)),
				"commit",
			);
		else onTune({ ...(value as Record<string, number | string>), [parts[at]?.[0] ?? ""]: n }, "commit");
	};
	return (
		<div className="grid grid-cols-2 gap-1.5">
			{parts.map(([name, n], at) =>
				typeof n === "number" ? (
					<NumberField
						key={name}
						size="md"
						tone="boxed"
						prefix={name}
						value={n}
						label={`${label} ${name}`}
						disabled={disabled}
						step={"step" in spec && typeof spec.step === "number" ? spec.step : 1}
						onValueChange={(typed) => put(at, typed)}
					/>
				) : null,
			)}
		</div>
	);
}

/**
 * Words typed into the frame as they are typed, written when the field is
 * left or Enter is pressed; Escape puts back what was there.
 */
function Words({
	value,
	onTune,
	disabled,
	label,
	long = false,
}: TuneProps<KnobValue> & { label: string; long?: boolean }) {
	const start = useRef<string | null>(null);
	const typing = (next: string) => {
		start.current ??= value as string;
		onTune(next, "live");
	};
	const finish = (commit: boolean, text: string) => {
		const from = start.current;
		start.current = null;
		if (from !== null) onTune(commit ? text : from, commit ? "commit" : "cancel");
	};
	const keys = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
		event.stopPropagation();
		if (event.key === "Escape") {
			event.preventDefault();
			finish(false, "");
			event.currentTarget.blur();
		} else if (event.key === "Enter" && (!long || event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			event.currentTarget.blur();
		}
	};
	if (long) {
		return (
			<Textarea
				value={String(value)}
				label={label}
				disabled={disabled}
				onValueChange={typing}
				textareaProps={{ onKeyDown: keys, onBlur: (event) => finish(true, event.currentTarget.value) }}
			/>
		);
	}
	return (
		<TextField
			size="xs"
			tone="quiet"
			className="flex-1"
			value={String(value)}
			label={label}
			disabled={disabled}
			onValueChange={typing}
			inputProps={{ onKeyDown: keys, onBlur: (event) => finish(true, event.currentTarget.value) }}
		/>
	);
}

/** A colour: the system picker moves the frame as it drags and writes once it is shut; a typed hex writes. */
function Colour({ value, onTune, disabled, label }: TuneProps<KnobValue> & { label: string }) {
	const box = useRef<HTMLSpanElement | null>(null);
	const picked = useRef<string | null>(null);
	const tune = useRef(onTune);
	tune.current = onTune;
	// the picker's own `change` is it shutting, which React's onChange (every input) never says
	useEffect(() => {
		const shut = () => {
			const held = picked.current;
			picked.current = null;
			if (held !== null) tune.current(held, "commit");
		};
		const element = box.current;
		element?.addEventListener("change", shut);
		return () => element?.removeEventListener("change", shut);
	}, []);
	return (
		<span ref={box} className="flex">
			<ColourField
				value={String(value)}
				label={label}
				disabled={disabled}
				onPick={(next) => {
					picked.current = next;
					onTune(next, "live");
				}}
				onType={(typed) => onTune(typed, "commit")}
			/>
		</span>
	);
}

/**
 * A choice among the options the knob offers: pointing at one tries it on
 * the frame, leaving puts back what was chosen, and only a press writes.
 */
export function Choices({ spec, value, onTune, disabled }: KnobControlProps) {
	const start = useRef<KnobValue | null>(null);
	const as = (option: string): KnobValue => (spec.type === "weight" ? Number(option) : option);
	const tryOn = (option: string) => {
		start.current ??= value ?? null;
		onTune(as(option), "live");
	};
	const putBack = () => {
		const from = start.current;
		start.current = null;
		if (from !== null) onTune(from, "cancel");
	};
	return (
		<div role="listbox" className="flex flex-col" onPointerLeave={putBack}>
			{choicesOf(spec).map((choice) => {
				const option = optionValue(choice);
				const image = typeof choice === "object" ? choice.image : undefined;
				return (
					<MenuItem
						key={option}
						role="option"
						aria-selected={String(value) === option}
						checked={image === undefined ? String(value) === option : undefined}
						icon={
							image === undefined ? undefined : (
								<img src={image} alt="" className="size-4 rounded-xs object-cover" />
							)
						}
						label={
							spec.type === "font" ? (
								<span style={{ fontFamily: option }}>{option}</span>
							) : typeof choice === "object" ? (
								(choice.label ?? option)
							) : (
								option
							)
						}
						disabled={disabled}
						onPointerEnter={() => tryOn(option)}
						onFocus={() => tryOn(option)}
						onClick={() => {
							start.current = null;
							onTune(as(option), "commit");
						}}
					/>
				);
			})}
		</div>
	);
}
