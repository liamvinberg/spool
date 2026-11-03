// Dial primitives (#220): the editors a number or motion knob opens into, and
// the small previews its row shows at rest. Every editor is controlled and
// reports through `onTune` (TuneProps): live while a hand moves it, one commit
// when the gesture ends, a cancel with the value from before it on Escape. The
// numbers inside are NumberField's, so typing, scrubbing and the keys work the
// same everywhere. Each editor keeps one height whatever it shows, so a row
// opening into one moves the rows below it once.

import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import type { SpringValue } from "../../runtime/knob-protocol";
import { cn } from "../cn";
import { MinusIcon, PlusIcon } from "../icons";
import { IconButton } from "./actions";
import {
	type DragMove,
	drag,
	fitNumber,
	NumberField,
	type NumberRules,
	scrubNumber,
	scrubSpeed,
	stickTo,
	type TuneGesture,
	type TuneProps,
	tuneGesture,
	useKeyTune,
	useScrub,
} from "./inputs";
import { Segment, SegmentedControl } from "./selection";

type Span = { min: number; max: number };

/** a round number at or above `n`: 1, 2 or 5 of a power of ten */
function roundUp(n: number): number {
	const power = 10 ** Math.floor(Math.log10(Math.max(n, 1e-9)));
	return ([1, 2, 5, 10].find((m) => m * power >= n) ?? 10) * power;
}

/**
 * The ends a track is drawn between: the knob's own, or, where it names none,
 * room either side of the value it had. Only a track's ends: a typed number
 * still goes past them.
 */
export function spanOf(value: number, rules: NumberRules): Span {
	return { min: rules.min ?? Math.min(0, value), max: rules.max ?? roundUp(Math.max(1, Math.abs(value) * 2)) };
}

/** held for the editor's life, so a track's ends never move under the hand */
function useSpan(value: number, rules: NumberRules): Span {
	const [opened] = useState(value);
	return spanOf(opened, rules);
}

const pct = (n: number, span: Span) =>
	((Math.min(span.max, Math.max(span.min, n)) - span.min) / (span.max - span.min)) * 100;

const DISABLED = "pointer-events-none opacity-40";

/** how near a thumb, in pixels, a press takes it where it is rather than bringing it there */
const THUMB_PX = 8;

/**
 * A press on a track, followed. The value jumps under the pointer, unless the
 * press took the thumb, then follows it; once the pointer strays from the
 * track or a modifier speeds or slows it, the drag turns relative for the rest
 * of the gesture, so the thumb never leaps when the speed changes.
 */
function pressTrack(
	event: ReactPointerEvent<HTMLElement>,
	track: HTMLElement,
	from: number,
	rules: NumberRules & Span,
	live: (next: number) => void,
	gesture: Pick<TuneGesture<unknown>, "end" | "cancel">,
) {
	const rect = track.getBoundingClientRect();
	const perPx = (rules.max - rules.min) / Math.max(1, rect.width);
	const under = (x: number) => rules.min + (x - rect.left) * perPx;
	const grab = Math.abs(under(event.clientX) - from) <= THUMB_PX * perPx ? under(event.clientX) - from : 0;
	let raw = under(event.clientX) - grab;
	let relative = false;
	live(scrubNumber(raw, { mx: 0, dy: 0, shift: false, alt: false }, perPx, from, rules).value);
	const move = (step: DragMove) => {
		relative ||= scrubSpeed(step) !== 1;
		const next = scrubNumber(
			relative ? raw : under(step.x) - grab,
			relative ? step : { ...step, mx: 0 },
			perPx,
			from,
			rules,
		);
		raw = next.raw;
		live(next.value);
	};
	drag(event, { move, end: gesture.end, cancel: gesture.cancel });
}

function Rail({ from, to }: { from: number; to: number }) {
	return (
		<span className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-raised">
			<span
				className="absolute inset-y-0 rounded-full bg-secondary transition-colors duration-fast group-hover/track:bg-primary"
				style={{ left: `${from}%`, width: `${to - from}%` }}
			/>
		</span>
	);
}

function Thumb({ at }: { at: number }) {
	return (
		<span
			className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
			style={{ left: `${at}%` }}
		/>
	);
}

/** a name that scrubs the number beside it */
function ScrubLabel({
	label,
	value,
	onTune,
	...rules
}: Omit<TuneProps<number>, "disabled"> & NumberRules & { label: string }) {
	const scrub = useScrub(value, rules, onTune);
	return (
		<span
			onPointerDown={scrub}
			className="w-16 shrink-0 cursor-ew-resize touch-none select-none truncate text-secondary transition-colors duration-fast type-label hover:text-primary"
		>
			{label}
		</span>
	);
}

/* -------------------------------------------------------------- Slider -- */

export interface SliderProps extends TuneProps<number>, NumberRules {
	/** a name before the track that scrubs it, where the row above doesn't name it */
	label?: string | undefined;
}

/** One number on a track, its typed number beside it. 28 high. */
export function Slider({ value, onTune, disabled, label, ...rules }: SliderProps) {
	const span = useSpan(value, rules);
	const track = useRef<HTMLSpanElement>(null);
	const keys = useKeyTune(value, { ...rules, ...span }, onTune);
	const press = (event: ReactPointerEvent<HTMLElement>) => {
		const gesture = tuneGesture(value, onTune);
		if (track.current !== null) pressTrack(event, track.current, value, { ...rules, ...span }, gesture.live, gesture);
	};
	return (
		<div className={cn("flex h-control-md items-center gap-2", disabled && DISABLED)}>
			{label === undefined ? null : <ScrubLabel label={label} value={value} onTune={onTune} {...rules} />}
			<div
				role="slider"
				tabIndex={0}
				aria-label={label}
				aria-valuenow={value}
				aria-valuemin={span.min}
				aria-valuemax={span.max}
				onPointerDown={press}
				{...keys}
				className="group/track focus-ring flex h-full min-w-0 flex-1 cursor-pointer touch-none rounded-xs px-1.5"
			>
				<span ref={track} className="relative w-full">
					<Rail from={0} to={pct(value, span)} />
					<Thumb at={pct(value, span)} />
				</span>
			</div>
			<NumberField
				value={value}
				onTune={onTune}
				{...rules}
				label={label}
				className="w-16 shrink-0 [&_input]:text-right"
			/>
		</div>
	);
}

/* --------------------------------------------------------------- Range -- */

/**
 * Two thumbs on one track, low and high, that stop at each other and never
 * cross; a press takes the nearer one. The two numbers type below. 52 high.
 */
export function Range({ value, onTune, disabled, ...rules }: TuneProps<[number, number]> & NumberRules) {
	const [lo, hi] = value;
	const span = useSpan(hi, rules);
	const track = useRef<HTMLSpanElement>(null);
	const low = { ...rules, min: span.min, max: hi };
	const high = { ...rules, min: lo, max: span.max };
	const keysLo = useKeyTune(lo, low, (n, phase) => onTune([n, hi], phase));
	const keysHi = useKeyTune(hi, high, (n, phase) => onTune([lo, n], phase));
	const press = (event: ReactPointerEvent<HTMLElement>) => {
		if (track.current === null) return;
		const rect = track.current.getBoundingClientRect();
		const at = span.min + ((event.clientX - rect.left) / Math.max(1, rect.width)) * (span.max - span.min);
		const takesLow = lo === hi ? at < lo : Math.abs(at - lo) < Math.abs(at - hi);
		const gesture = tuneGesture(value, onTune);
		const live = takesLow ? (n: number) => gesture.live([n, hi]) : (n: number) => gesture.live([lo, n]);
		pressTrack(event, track.current, takesLow ? lo : hi, takesLow ? low : high, live, gesture);
	};
	return (
		<div className={cn("flex flex-col gap-1", disabled && DISABLED)}>
			<div onPointerDown={press} className="group/track flex h-control-md cursor-pointer touch-none px-1.5">
				<span ref={track} className="relative w-full">
					<Rail from={pct(lo, span)} to={pct(hi, span)} />
					{(
						[
							["low", lo, keysLo],
							["high", hi, keysHi],
						] as const
					).map(([name, n, keys]) => (
						<span
							key={name}
							role="slider"
							tabIndex={0}
							aria-label={name}
							aria-valuenow={n}
							{...keys}
							className="focus-ring absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
							style={{ left: `${pct(n, span)}%` }}
						/>
					))}
				</span>
			</div>
			<div className="flex items-center gap-2">
				<NumberField
					prefix="min"
					label="low"
					value={lo}
					onTune={(n, phase) => onTune([n, hi], phase)}
					{...low}
					min={rules.min}
					className="flex-1"
				/>
				<NumberField
					prefix="max"
					label="high"
					value={hi}
					onTune={(n, phase) => onTune([lo, n], phase)}
					{...high}
					max={rules.max}
					className="flex-1"
				/>
			</div>
		</div>
	);
}

/* ------------------------------------------------------------- Stepper -- */

/** Minus, the number, plus: a press steps, shift ten. It acts in its row and never opens. 24 high. */
export function Stepper({ value, onTune, disabled, ...rules }: TuneProps<number> & NumberRules) {
	const by = (sign: 1 | -1) => (event: { shiftKey: boolean }) => {
		const next = fitNumber(value + sign * (rules.step ?? 1) * (event.shiftKey ? 10 : 1), rules);
		if (next !== value) onTune(next, "commit");
	};
	return (
		<span className={cn("inline-flex items-center", disabled && DISABLED)}>
			<IconButton
				size="sm"
				icon={<MinusIcon />}
				label="Fewer"
				disabled={rules.min !== undefined && value <= rules.min}
				onClick={by(-1)}
			/>
			<NumberField value={value} onTune={onTune} {...rules} className="w-10 [&_input]:text-center" />
			<IconButton
				size="sm"
				icon={<PlusIcon />}
				label="More"
				disabled={rules.max !== undefined && value >= rules.max}
				onClick={by(1)}
			/>
		</span>
	);
}

/* --------------------------------------------------------------- Angle -- */

const DEGREES: NumberRules = {
	min: 0,
	max: 360,
	step: 1,
	unit: "°",
	units: { deg: 1, turn: 360, rad: 180 / Math.PI },
	wrap: true,
	detents: [0, 45, 90, 135, 180, 225, 270, 315, 360],
};

/**
 * An angle on a dial, 0 up and clockwise as CSS turns: press and the needle
 * points there, then follows the pointer round. Every 45° holds it a moment,
 * and so does where it began; shift holds it to 15s. 88 high.
 */
export function Angle({ value, onTune, disabled }: TuneProps<number>) {
	const dial = useRef<HTMLDivElement>(null);
	const keys = useKeyTune(value, DEGREES, onTune);
	const press = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (dial.current === null) return;
		const rect = dial.current.getBoundingClientRect();
		const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
		const from = value;
		const at = (x: number, y: number, shift: boolean) => {
			const raw = ((Math.atan2(x - centre.x, centre.y - y) * 180) / Math.PI + 360) % 360;
			const held = shift
				? Math.round(raw / 15) * 15
				: (stickTo(raw, [...(DEGREES.detents ?? []), from], 4) ?? Math.round(raw));
			return fitNumber(held, DEGREES);
		};
		const gesture = tuneGesture(value, onTune);
		gesture.live(at(event.clientX, event.clientY, event.shiftKey));
		drag(event, {
			move: (step) => gesture.live(at(step.x, step.y, step.shift)),
			end: gesture.end,
			cancel: gesture.cancel,
		});
	};
	return (
		<div className={cn("flex h-[88px] items-center gap-4", disabled && DISABLED)}>
			<div
				ref={dial}
				role="slider"
				tabIndex={0}
				aria-valuenow={value}
				aria-valuetext={`${value} degrees`}
				onPointerDown={press}
				{...keys}
				className="group/dial focus-ring relative size-[88px] shrink-0 cursor-grab touch-none rounded-full border border-line-default bg-surface-window active:cursor-grabbing"
			>
				{[0, 45, 90, 135, 180, 225, 270, 315].map((turn) => (
					<span
						key={turn}
						className="absolute inset-0 before:absolute before:top-1 before:left-1/2 before:h-1.5 before:w-px before:bg-line-strong"
						style={{ rotate: `${turn}deg` }}
					/>
				))}
				<span className="pointer-events-none absolute inset-0" style={{ rotate: `${value}deg` }}>
					<span className="absolute bottom-1/2 left-1/2 h-8 w-px -translate-x-1/2 bg-secondary transition-colors duration-fast group-hover/dial:bg-primary" />
					<span className="absolute top-[10px] left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
				</span>
				<span className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line-strong" />
			</div>
			<NumberField value={value} onTune={onTune} {...DEGREES} className="w-16 [&_input]:text-right" />
		</div>
	);
}

/* ------------------------------------------------------------------ XY -- */

/**
 * A point on a square pad, x across and y down: press and the dot is there,
 * then follows. Shift keeps it on the axis it set off along, the middle and
 * where it began hold it a moment. The two numbers type beside it. 120 high.
 */
export function XYPad({ value, onTune, disabled, ...rules }: TuneProps<{ x: number; y: number }> & NumberRules) {
	const span = useSpan(Math.max(value.x, value.y), rules);
	const pad = useRef<HTMLDivElement>(null);
	const press = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (pad.current === null) return;
		const rect = pad.current.getBoundingClientRect();
		const from = value;
		const axis = (px: number, size: number, began: number) => {
			const perPx = (span.max - span.min) / Math.max(1, size);
			const raw = span.min + px * perPx;
			const step = rules.step ?? 1;
			const held = stickTo(raw, [began, (span.min + span.max) / 2], 5 * perPx) ?? Math.round(raw / step) * step;
			return fitNumber(held, { ...rules, ...span });
		};
		const point = (x: number, y: number) => ({
			x: axis(x - rect.left, rect.width, from.x),
			y: axis(y - rect.top, rect.height, from.y),
		});
		const gesture = tuneGesture(value, onTune);
		const pressed = point(event.clientX, event.clientY);
		let lock: "x" | "y" | null = null;
		gesture.live(pressed);
		drag(event, {
			move: (step) => {
				if (!step.shift) lock = null;
				else if (lock === null && Math.abs(step.dx) + Math.abs(step.dy) > 4)
					lock = Math.abs(step.dx) >= Math.abs(step.dy) ? "x" : "y";
				const next = point(step.x, step.y);
				gesture.live({ x: lock === "y" ? pressed.x : next.x, y: lock === "x" ? pressed.y : next.y });
			},
			end: gesture.end,
			cancel: gesture.cancel,
		});
	};
	return (
		<div className={cn("flex h-[120px] gap-3", disabled && DISABLED)}>
			<div
				ref={pad}
				onPointerDown={press}
				className="group/pad relative size-[120px] shrink-0 cursor-crosshair touch-none rounded-sm border border-line-default bg-surface-window"
			>
				<span className="absolute inset-y-0 left-1/2 w-px bg-line-default" />
				<span className="absolute inset-x-0 top-1/2 h-px bg-line-default" />
				<span
					className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
					style={{ left: `${pct(value.x, span)}%`, top: `${pct(value.y, span)}%` }}
				/>
			</div>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<NumberField
					prefix="x"
					label="x"
					value={value.x}
					onTune={(x, phase) => onTune({ ...value, x }, phase)}
					{...rules}
				/>
				<NumberField
					prefix="y"
					label="y"
					value={value.y}
					onTune={(y, phase) => onTune({ ...value, y }, phase)}
					{...rules}
				/>
			</div>
		</div>
	);
}

/* ------------------------------------------------------------ Duration -- */

/**
 * A duration in seconds, tuned in milliseconds as motion is spoken of: `520`
 * on the track and in the field, and the field takes `0.3s` as readily as
 * `300ms`. 28 high.
 */
export function Duration({
	value,
	onTune,
	disabled,
	min,
	max,
}: TuneProps<number> & { min?: number | undefined; max?: number | undefined }) {
	const ms = (seconds: number | undefined) => (seconds === undefined ? undefined : Math.round(seconds * 1000));
	return (
		<Slider
			value={ms(value) ?? 0}
			onTune={(next, phase) => onTune(next / 1000, phase)}
			min={ms(min) ?? 0}
			max={ms(max)}
			step={10}
			unit="ms"
			units={{ s: 1000 }}
			disabled={disabled}
		/>
	);
}

/* -------------------------------------------------------------- Easing -- */

/** cubic-bezier x1, y1, x2, y2 */
export type Bezier = [number, number, number, number];

export const EASINGS: readonly { name: string; curve: Bezier }[] = [
	{ name: "out", curve: [0.22, 0.61, 0.36, 1] },
	{ name: "snap", curve: [0.32, 0.72, 0, 1] },
	{ name: "in-out", curve: [0.65, 0, 0.35, 1] },
	{ name: "back", curve: [0.34, 1.56, 0.64, 1] },
	{ name: "windup", curve: [0.36, 0, 0.66, -0.56] },
	{ name: "linear", curve: [0, 0, 1, 1] },
];

/** The curve's height at `x`, solved for its time by halving: what a dot riding it shows. */
export function bezierAt([x1, y1, x2, y2]: Bezier, x: number): number {
	const at = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 24; i++) {
		const mid = (lo + hi) / 2;
		if (at(mid, x1, x2) < x) lo = mid;
		else hi = mid;
	}
	return at((lo + hi) / 2, y1, y2);
}

const CURVE_X: NumberRules = { min: 0, max: 1, step: 0.01 };
/** a handle may overshoot the square, up or down, by half of it */
const CURVE_Y: NumberRules = { min: -0.5, max: 1.5, step: 0.01 };

/** the curve's drawing, in its viewBox: the square with room above and below */
const W = 264;
const H = 132;
const PAD = 10;
const cx = (x: number) => PAD + x * (W - 2 * PAD);
const cy = (y: number) => PAD + ((1.5 - y) / 2) * (H - 2 * PAD);

/**
 * A curve to drag by its two handles, which may overshoot the square, a dot
 * riding it on a loop, the four numbers, and the presets. A press takes the
 * nearer handle, shift holds it to 0.05. Pointing at a preset tries it on,
 * leaving puts back what was there, and only a press keeps it. 212 high.
 */
export function Easing({ value, onTune, disabled }: TuneProps<Bezier>) {
	const rider = useRef<SVGCircleElement>(null);
	const shown = useRef(value);
	shown.current = value;
	const trying = useRef<TuneGesture<Bezier> | null>(null);
	useEffect(() => {
		const start = performance.now();
		let frame = 0;
		const tick = (now: number) => {
			// 900ms on the curve, then a rest at its end
			const t = Math.min(1, ((now - start) % 1500) / 900);
			rider.current?.setAttribute("cx", String(cx(t)));
			rider.current?.setAttribute("cy", String(cy(Math.min(1.5, Math.max(-0.5, bezierAt(shown.current, t))))));
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, []);
	const press = (event: ReactPointerEvent<SVGSVGElement>) => {
		// the drawing's own units, wherever the box puts it
		const toDrawing = event.currentTarget.getScreenCTM()?.inverse();
		const local = (x: number, y: number) => new DOMPoint(x, y).matrixTransform(toDrawing);
		const at = local(event.clientX, event.clientY);
		const off = (i: 0 | 1) => Math.hypot(at.x - cx(value[i * 2]!), at.y - cy(value[i * 2 + 1]!));
		const which = off(0) <= off(1) ? 0 : 1;
		const grab =
			off(which) <= 10 ? { x: at.x - cx(value[which * 2]!), y: at.y - cy(value[which * 2 + 1]!) } : { x: 0, y: 0 };
		const gesture = tuneGesture(value, onTune);
		const put = (point: { x: number; y: number }, shift: boolean) => {
			const by = shift ? 0.05 : 0.01;
			const round = (n: number, rules: NumberRules) => fitNumber(Math.round(n / by) * by, rules);
			const next: Bezier = [...value];
			next[which * 2] = round((point.x - grab.x - PAD) / (W - 2 * PAD), CURVE_X);
			next[which * 2 + 1] = round(1.5 - ((point.y - grab.y - PAD) / (H - 2 * PAD)) * 2, CURVE_Y);
			gesture.live(next);
		};
		put(at, event.shiftKey);
		drag(event, { move: (step) => put(local(step.x, step.y), step.shift), end: gesture.end, cancel: gesture.cancel });
	};
	const name = EASINGS.find((easing) => easing.curve.every((n, i) => Math.abs(n - value[i]!) < 0.005))?.name;
	const path = (c: Bezier) => `M${cx(0)} ${cy(0)} C${cx(c[0])} ${cy(c[1])} ${cx(c[2])} ${cy(c[3])} ${cx(1)} ${cy(1)}`;
	return (
		<div className={cn("flex flex-col gap-2", disabled && DISABLED)}>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				role="img"
				aria-label="easing curve"
				onPointerDown={press}
				className="block h-[132px] w-full cursor-crosshair touch-none select-none rounded-sm bg-surface-window"
			>
				<rect
					x={cx(0)}
					y={cy(1)}
					width={cx(1) - cx(0)}
					height={cy(0) - cy(1)}
					fill="var(--color-state-hover-raised)"
				/>
				<path
					d={`M${cx(0)} ${cy(0)} L${cx(1)} ${cy(1)}`}
					stroke="var(--color-line-default)"
					strokeDasharray="3 4"
				/>
				<path d={`M${cx(0)} ${cy(0)} L${cx(value[0])} ${cy(value[1])}`} stroke="var(--color-tertiary)" />
				<path d={`M${cx(1)} ${cy(1)} L${cx(value[2])} ${cy(value[3])}`} stroke="var(--color-tertiary)" />
				<path d={path(value)} stroke="var(--color-primary)" strokeWidth="2" fill="none" strokeLinecap="round" />
				<circle ref={rider} r="3.5" fill="var(--color-accent)" />
				{([0, 1] as const).map((i) => (
					<circle
						key={i}
						cx={cx(value[i * 2]!)}
						cy={cy(value[i * 2 + 1]!)}
						r="5"
						fill="var(--color-surface-window)"
						stroke="var(--color-primary)"
						strokeWidth="1.75"
					/>
				))}
			</svg>
			<div className="grid grid-cols-4 gap-1">
				{(["x1", "y1", "x2", "y2"] as const).map((label, i) => (
					<NumberField
						key={label}
						prefix={label}
						label={label}
						value={value[i]!}
						onTune={(n, phase) => {
							const next: Bezier = [...value];
							next[i] = n;
							onTune(next, phase);
						}}
						{...(i % 2 === 0 ? CURVE_X : CURVE_Y)}
					/>
				))}
			</div>
			<div
				className="grid grid-cols-6 gap-1"
				onPointerLeave={() => {
					trying.current?.cancel();
					trying.current = null;
				}}
			>
				{EASINGS.map((easing) => (
					<button
						key={easing.name}
						type="button"
						aria-pressed={easing.name === name}
						onPointerEnter={() => {
							trying.current ??= tuneGesture(value, onTune);
							trying.current.live(easing.curve);
						}}
						onClick={() => {
							const gesture = trying.current ?? tuneGesture(value, onTune);
							gesture.live(easing.curve);
							gesture.end();
							trying.current = null;
						}}
						className={cn(
							"focus-ring flex flex-col items-center gap-1 rounded-xs pt-1.5 pb-1 type-detail",
							"transition-[background-color,color] duration-fast ease-out",
							"text-secondary hover:bg-state-hover-raised hover:text-primary aria-pressed:bg-state-selected-strong aria-pressed:text-primary",
						)}
					>
						<EasingPreview value={easing.curve} />
						{easing.name}
					</button>
				))}
			</div>
		</div>
	);
}

/* -------------------------------------------------------------- Spring -- */

type SpringTime = { duration: number; bounce: number };
type SpringPhysics = { stiffness: number; damping: number; mass: number };

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/**
 * A spring in perceived terms. Motion's own conversion, run backwards: one
 * undamped period is 1.2 visual durations, and the bounce is what the damping
 * ratio falls short of 1, so an overdamped spring reads as no bounce.
 */
export function springTime(spring: SpringValue): SpringTime {
	if ("duration" in spring) return spring;
	const mass = spring.mass ?? 1;
	const omega = Math.sqrt(spring.stiffness / mass);
	const ratio = spring.damping / (2 * Math.sqrt(spring.stiffness * mass));
	return { duration: round((2 * Math.PI) / (1.2 * omega), 2), bounce: round(Math.min(1, Math.max(0, 1 - ratio)), 2) };
}

/** A spring in physics terms, as Motion runs a visual duration and a bounce. */
export function springPhysics(spring: SpringValue): SpringPhysics {
	if (!("duration" in spring)) return { ...spring, mass: spring.mass ?? 1 };
	const root = (2 * Math.PI) / (spring.duration * 1.2);
	const stiffness = root * root;
	const damping = 2 * Math.min(1, Math.max(0.05, 1 - spring.bounce)) * Math.sqrt(stiffness);
	return { stiffness: round(stiffness, 0), damping: round(damping, 1), mass: 1 };
}

/** How far the spring is from home `t` seconds after leaving from 1 at rest. */
function springAt({ stiffness, damping, mass }: SpringPhysics, t: number): number {
	const omega = Math.sqrt(stiffness / mass);
	const ratio = damping / (2 * Math.sqrt(stiffness * mass));
	if (ratio < 1) {
		const damped = omega * Math.sqrt(1 - ratio * ratio);
		return Math.exp(-ratio * omega * t) * (Math.cos(damped * t) + ((ratio * omega) / damped) * Math.sin(damped * t));
	}
	if (ratio === 1) return Math.exp(-omega * t) * (1 + omega * t);
	const spread = omega * Math.sqrt(ratio * ratio - 1);
	const [fast, slow] = [-ratio * omega - spread, -ratio * omega + spread];
	return (fast * Math.exp(slow * t) - slow * Math.exp(fast * t)) / (fast - slow);
}

/** When it last leaves 1% of home, in seconds, looked for over ten. */
export function settleTime(spring: SpringValue): number {
	const physics = springPhysics(spring);
	for (let ms = 10_000; ms > 0; ms -= 5) if (Math.abs(springAt(physics, ms / 1000)) > 0.01) return round(ms / 1000, 2);
	return 0;
}

/** the progress it makes over `seconds`, `samples` of it, as an SVG path across `width` and down `height` */
function springPath(spring: SpringValue, width: number, height: number, seconds: number, samples: number): string {
	const physics = springPhysics(spring);
	return Array.from({ length: samples + 1 }, (_, i) => {
		const progress = 1 - springAt(physics, (i / samples) * seconds);
		return `${i === 0 ? "M" : "L"}${((i / samples) * width).toFixed(1)} ${(height * (0.85 - progress * 0.6)).toFixed(1)}`;
	}).join(" ");
}

const SPRING = { w: 264, h: 56, seconds: 1.5 };

/**
 * A spring as it is first thought of, how long and how much it bounces, with
 * its curve and when it settles; Physics a tab away for stiffness, damping and
 * mass. The tab is the form the value is written in, so switching rewrites it
 * in the other's terms, one write. 180 high.
 */
export function Spring({ value, onTune, disabled }: TuneProps<SpringValue>) {
	const time = springTime(value);
	const physics = "duration" in value ? springPhysics(value) : value;
	const mass = physics.mass ?? 1;
	return (
		<div className={cn("flex h-[180px] flex-col gap-1", disabled && DISABLED)}>
			<div className="flex items-center justify-between">
				<SegmentedControl
					size="sm"
					label="Spring in"
					value={"duration" in value ? "time" : "physics"}
					onValueChange={(form) => onTune(form === "time" ? springTime(value) : springPhysics(value), "commit")}
				>
					<Segment value="time">Time</Segment>
					<Segment value="physics">Physics</Segment>
				</SegmentedControl>
				<span className="text-tertiary tabular-nums type-detail">settles in {settleTime(value)}s</span>
			</div>
			<svg
				viewBox={`0 0 ${SPRING.w} ${SPRING.h}`}
				preserveAspectRatio="none"
				aria-hidden="true"
				className="block h-14 w-full rounded-sm bg-surface-window"
			>
				<path
					d={`M0 ${SPRING.h * 0.25} H${SPRING.w}`}
					stroke="var(--color-line-default)"
					strokeDasharray="3 4"
					vectorEffect="non-scaling-stroke"
				/>
				<path
					d={springPath(value, SPRING.w, SPRING.h, SPRING.seconds, 96)}
					stroke="var(--color-primary)"
					strokeWidth="1.75"
					fill="none"
					strokeLinejoin="round"
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
			{"duration" in value ? (
				<>
					<Slider
						label="duration"
						value={time.duration}
						min={0.05}
						max={1.5}
						step={0.05}
						unit="s"
						units={{ ms: 0.001 }}
						onTune={(duration, phase) => onTune({ ...time, duration }, phase)}
					/>
					<Slider
						label="bounce"
						value={time.bounce}
						min={0}
						max={1}
						step={0.05}
						onTune={(bounce, phase) => onTune({ ...time, bounce }, phase)}
					/>
					<span className="flex h-control-md items-center truncate text-tertiary tabular-nums type-detail">
						as physics: stiffness {physics.stiffness}, damping {physics.damping}
					</span>
				</>
			) : (
				<>
					<Slider
						label="stiffness"
						value={physics.stiffness}
						min={1}
						max={1000}
						onTune={(stiffness, phase) => onTune({ ...physics, stiffness }, phase)}
					/>
					<Slider
						label="damping"
						value={physics.damping}
						min={0}
						max={100}
						onTune={(damping, phase) => onTune({ ...physics, damping }, phase)}
					/>
					<Slider
						label="mass"
						value={mass}
						min={0.1}
						max={10}
						step={0.1}
						onTune={(next, phase) => onTune({ ...physics, mass: next }, phase)}
					/>
				</>
			)}
		</div>
	);
}

/* ------------------------------------------------------------ Previews -- */

/** A track's fill in small, for a slider, range or duration row at rest, between the ends `spanOf` gives. */
export function TrackPreview({ value, ...rules }: { value: number | readonly [number, number] } & NumberRules) {
	const span = spanOf(typeof value === "number" ? value : value[1], rules);
	const [from, to] = typeof value === "number" ? [span.min, value] : value;
	return (
		<span className="relative block h-[3px] w-7 shrink-0 rounded-full bg-surface-raised">
			<span
				className="absolute inset-y-0 rounded-full bg-secondary"
				style={{ left: `${pct(from, span)}%`, width: `${pct(to, span) - pct(from, span)}%` }}
			/>
		</span>
	);
}

/** An angle's tick on a ring, 0 up. */
export function AnglePreview({ value }: { value: number }) {
	return (
		<svg viewBox="0 0 14 14" className="size-3.5 shrink-0" fill="none" aria-hidden="true">
			<circle cx="7" cy="7" r="6" stroke="var(--color-line-strong)" />
			<path
				d="M7 7V2"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinecap="round"
				transform={`rotate(${value} 7 7)`}
			/>
		</svg>
	);
}

/** A point as a dot in its pad. */
export function XYPreview({ value, ...rules }: { value: { x: number; y: number } } & NumberRules) {
	const span = spanOf(Math.max(value.x, value.y), rules);
	return (
		<span className="relative block h-3 w-4 shrink-0 rounded-xs border border-line-strong">
			<span
				className="absolute size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-current"
				style={{ left: `${pct(value.x, span)}%`, top: `${pct(value.y, span)}%` }}
			/>
		</span>
	);
}

/** A cubic-bezier drawn small, with room to overshoot. */
export function EasingPreview({ value }: { value: Bezier }) {
	const p = (x: number, y: number) => `${1 + x * 14} ${11 - y * 6}`;
	return (
		<svg viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" aria-hidden="true">
			<path
				d={`M${p(0, 0)} C${p(value[0], value[1])} ${p(value[2], value[3])} ${p(1, 1)}`}
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinecap="round"
			/>
		</svg>
	);
}

/** A spring's settle drawn small, over a second. */
export function SpringPreview({ value }: { value: SpringValue }) {
	return (
		<svg viewBox="0 0 20 16" className="h-3.5 w-[18px] shrink-0" fill="none" aria-hidden="true">
			<path
				d={springPath(value, 20, 16, 1, 28)}
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
