import { type ReactNode, useRef } from "react";
import type { KnobSpec, KnobValue, SpringValue } from "../../runtime/knob-protocol";
import { Button } from "../primitives/actions";
import {
	BoxPreview,
	type Corners,
	CornersEditor,
	ShadowEditor,
	ShadowPreview,
	type Sides,
	SpacingEditor,
} from "../primitives/boxes";
import {
	Angle,
	AnglePreview,
	type Bezier,
	Duration,
	EASINGS,
	Easing,
	EasingPreview,
	Range,
	Slider,
	Spring,
	SpringPreview,
	Stepper,
	TrackPreview,
	XYPad,
	XYPreview,
} from "../primitives/dials";
import { type NumberRules, Textarea, TextField, type TuneProps } from "../primitives/inputs";
import {
	ColourPicker,
	ColourPreview,
	FontList,
	FontPreview,
	GradientEditor,
	GradientPreview,
	IconGrid,
	OptionList,
	PictureGrid,
	PicturePreview,
	WeightPicker,
} from "../primitives/pickers";
import { Segment, SegmentedControl, Switch } from "../primitives/selection";
import { fontsOf, knobNumber, knobWords, optionValue, weightsOf } from "./knobs";

/**
 * Each knob type's control (#220), in one place: what its row says at rest,
 * the control that acts in its row, the editor it opens into, and the list a
 * popover beside the row holds. The editors are the primitives'; this maps a
 * knob's spec and value onto them. Every one reports through `TuneProps`.
 */

export interface KnobControlProps extends TuneProps<KnobValue> {
	spec: KnobSpec;
	/** the knob's own name, for a screen reader */
	label: string;
}

/** A knob's value handed to an editor of a narrower type, its reports handed back as a knob's. */
function as<T>(control: KnobControlProps): TuneProps<T> {
	return {
		value: control.value as T,
		onTune: (next, phase) => control.onTune(next as KnobValue, phase),
		disabled: control.disabled,
	};
}

/** A number knob's limits as its dial takes them, without its own literal. */
const rulesOf = (spec: { min?: number; max?: number; step?: number; unit?: string }): NumberRules => ({
	min: spec.min,
	max: spec.max,
	step: spec.step,
	unit: spec.unit,
});

/* ---------- at rest ---------- */

const INK = "truncate tabular-nums text-primary type-value";
const ASIDE = "shrink-0 text-tertiary type-detail";

/** a row's value: a glyph, the value as written, a faint unit or word after it */
function Line({ lead, words, aside }: { lead?: ReactNode; words: ReactNode; aside?: ReactNode }) {
	return (
		<span className="flex min-w-0 items-center gap-2">
			{lead}
			<span className={INK}>{words}</span>
			{aside === undefined || aside === "" ? null : <span className={ASIDE}>{aside}</span>}
		</span>
	);
}

/** What a row says at rest: the value the way its literal reads, behind the glyph that says more. */
export function KnobPreview({ spec, value }: { spec: KnobSpec; value: KnobValue | undefined }) {
	const words = knobWords(value);
	switch (spec.type) {
		case "slider":
			return (
				<Line lead={<TrackPreview value={value as number} {...rulesOf(spec)} />} words={words} aside={spec.unit} />
			);
		case "range":
			return (
				<Line
					lead={<TrackPreview value={value as [number, number]} {...rulesOf(spec)} />}
					words={words}
					aside={spec.unit}
				/>
			);
		case "duration": {
			const number = knobNumber(spec, value);
			return <Line lead={<TrackPreview value={number?.n ?? 0} {...number?.rules} />} words={number?.n} aside="ms" />;
		}
		case "angle":
			return <Line lead={<AnglePreview value={value as number} />} words={words} aside="°" />;
		case "xy": {
			const point = value as { x: number; y: number };
			return (
				<Line
					lead={<XYPreview value={point} {...rulesOf(spec)} />}
					words={`${point.x} ${point.y}`}
					aside={spec.unit}
				/>
			);
		}
		case "easing": {
			const curve = value as Bezier;
			const named = EASINGS.find((one) => one.curve.join() === curve.join())?.name;
			return (
				<Line
					lead={<EasingPreview value={curve} />}
					words={named ?? "custom"}
					aside={named === undefined ? words : undefined}
				/>
			);
		}
		case "spring": {
			const spring = value as SpringValue;
			return (
				<Line
					lead={<SpringPreview value={spring} />}
					words={
						"duration" in spring
							? `${spring.duration}s · ${spring.bounce}`
							: `${spring.stiffness} / ${spring.damping}`
					}
					aside={"duration" in spring ? "bounce" : "stiff / damp"}
				/>
			);
		}
		case "color":
			return <ColourPreview value={words} />;
		case "gradient":
			return <GradientPreview value={words} />;
		case "font":
			return <FontPreview value={words} />;
		case "pictures":
		case "image":
		case "icon":
			return <PicturePreview value={words} options={spec.options} />;
		case "select":
		case "segmented": {
			const choice = spec.options.find((one) => optionValue(one) === words);
			return <Line words={typeof choice === "object" ? (choice.label ?? choice.value) : words} />;
		}
		case "spacing":
		case "corners":
			// the previews fill what holds them, which would push their unit to the row's end
			return (
				<span className="flex min-w-0">
					<BoxPreview value={value as Sides} corners={spec.type === "corners"} />
				</span>
			);
		case "shadow":
			return (
				<span className="flex min-w-0">
					<ShadowPreview value={words} />
				</span>
			);
		case "text":
		case "longtext":
			return <span className="truncate text-secondary type-label">{words}</span>;
		case "action":
			return <Line words={spec.label ?? "run"} />;
		default:
			return <Line words={words} />;
	}
}

/* ---------- in the row ---------- */

/** The control of a knob that acts where its row stands and never opens. */
export function KnobInRow(control: KnobControlProps & { onPress: () => void }) {
	const { spec, value, onTune, disabled, label, onPress } = control;
	switch (spec.type) {
		case "toggle":
			return (
				<span className="flex items-center gap-2">
					<Switch
						aria-label={label}
						checked={value === true}
						disabled={disabled}
						onCheckedChange={(on) => onTune(on, "commit")}
					/>
					<span className={ASIDE}>{String(value === true)}</span>
				</span>
			);
		case "stepper":
			return <Stepper {...as<number>(control)} {...rulesOf(spec)} />;
		case "segmented":
			return (
				<SegmentedControl
					size="sm"
					label={label}
					value={String(value)}
					onValueChange={(next) => onTune(next, "commit")}
					className="w-full"
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
			return <Words {...as<string>(control)} label={label} />;
		case "action":
			return (
				<Button variant="ghost" size="sm" className="-ml-2" disabled={disabled} onClick={onPress}>
					{spec.label ?? label}
				</Button>
			);
		default:
			return <KnobPreview spec={spec} value={value} />;
	}
}

/* ---------- opened ---------- */

/** The editor a knob opens into, in place under its row. */
export function KnobEditor(control: KnobControlProps) {
	const { spec, label } = control;
	switch (spec.type) {
		case "slider":
			return <Slider {...as<number>(control)} {...rulesOf(spec)} />;
		case "range":
			return <Range {...as<[number, number]>(control)} {...rulesOf(spec)} />;
		case "angle":
			return <Angle {...as<number>(control)} />;
		case "xy":
			return <XYPad {...as<{ x: number; y: number }>(control)} {...rulesOf(spec)} />;
		case "duration":
			return <Duration {...as<number>(control)} min={spec.min} max={spec.max} />;
		case "easing":
			return <Easing {...as<Bezier>(control)} />;
		case "spring":
			return <Spring {...as<SpringValue>(control)} />;
		case "color":
			return <ColourPicker {...as<string>(control)} alpha={spec.alpha} swatches={spec.swatches} />;
		case "gradient":
			return <GradientEditor {...as<string>(control)} />;
		case "longtext":
			return <Words {...as<string>(control)} label={label} long />;
		case "weight":
			return <WeightPicker {...as<number>(control)} weights={weightsOf(spec)} />;
		case "pictures":
		case "image":
			return <PictureGrid {...as<string>(control)} options={spec.options} />;
		case "spacing":
			return <SpacingEditor {...as<Sides>(control)} min={spec.min} max={spec.max} />;
		case "corners":
			return <CornersEditor {...as<Corners>(control)} min={spec.min} max={spec.max} />;
		case "shadow":
			return <ShadowEditor {...as<string>(control)} />;
		default:
			return null;
	}
}

/** The list a font, icon or select knob opens beside its row. */
export function KnobList(control: KnobControlProps) {
	const { spec } = control;
	switch (spec.type) {
		case "font":
			return <FontList {...as<string>(control)} options={fontsOf(spec, String(control.value))} />;
		case "icon":
			return <IconGrid {...as<string>(control)} options={spec.options} />;
		case "select":
			return <OptionList {...as<string>(control)} options={spec.options} />;
		default:
			return null;
	}
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
}: TuneProps<string> & { label: string; long?: boolean }) {
	const start = useRef<string | null>(null);
	const typing = (next: string) => {
		start.current ??= value;
		onTune(next, "live");
	};
	const finish = (commit: boolean, text: string) => {
		const from = start.current;
		start.current = null;
		if (from === null) return;
		onTune(commit && text !== from ? text : from, commit && text !== from ? "commit" : "cancel");
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
				value={value}
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
			className="-ml-1 flex-1"
			value={value}
			label={label}
			disabled={disabled}
			onValueChange={typing}
			inputProps={{ onKeyDown: keys, onBlur: (event) => finish(true, event.currentTarget.value) }}
		/>
	);
}
