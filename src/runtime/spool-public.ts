import type { ComponentType } from "react";

export interface SpoolUi {
	readonly state: Record<string, unknown>;
	use(): Record<string, unknown>;
	go(target: string, patch?: Record<string, unknown>): void;
	back(): void;
	copy(text: string): Promise<void>;
}

/** A choice in a segmented, select, pictures, icon or image knob. */
export interface KnobOption {
	value: string;
	label?: string;
	/** an imported image's URL (pictures, icon, image) */
	image?: string;
}

export type KnobChoice = string | KnobOption;

/** A spring in perceived terms (seconds, -1…1), or in physics terms. */
export type SpringValue = { duration: number; bounce: number } | { stiffness: number; damping: number; mass?: number };

interface NumberLimits {
	min?: number;
	max?: number;
	step?: number;
	unit?: string;
}

/** One knob as written in the call: its type, its literal `value`, and what its control needs. */
export type KnobSpec =
	| ({ type: "slider"; value: number } & NumberLimits)
	| ({ type: "range"; value: [number, number] } & NumberLimits)
	| ({ type: "stepper"; value: number } & NumberLimits)
	| { type: "angle"; value: number }
	| ({ type: "xy"; value: { x: number; y: number } } & NumberLimits)
	/** seconds */
	| { type: "duration"; value: number; min?: number; max?: number }
	/** cubic-bezier x1, y1, x2, y2 */
	| { type: "easing"; value: [number, number, number, number] }
	| { type: "spring"; value: SpringValue }
	/** any CSS colour; `swatches` are the colours offered to try on */
	| { type: "color"; value: string; alpha?: boolean; swatches?: string[] }
	/** a CSS linear-gradient() */
	| { type: "gradient"; value: string }
	| { type: "toggle"; value: boolean }
	| { type: "segmented" | "select" | "pictures" | "icon"; value: string; options: KnobChoice[] }
	/** `value` names an option; the knob reads as that option's image */
	| { type: "image"; value: string; options: KnobOption[] }
	| { type: "text" | "longtext"; value: string }
	| { type: "font"; value: string; options?: string[] }
	| { type: "weight"; value: number; options?: number[] }
	/** px: all sides, [vertical, horizontal], or [top, right, bottom, left] */
	| {
			type: "spacing";
			value: number | [number, number] | [number, number, number, number];
			min?: number;
			max?: number;
	  }
	/** px: all corners, or [top-left, top-right, bottom-right, bottom-left] */
	| { type: "corners"; value: number | [number, number, number, number]; min?: number; max?: number }
	/** a CSS box-shadow */
	| { type: "shadow"; value: string }
	/** no value and nothing written; reads as how many times it was pressed */
	| { type: "action"; label?: string };

/** A nested object is a group, folding in the rail, in code order. */
export interface KnobSchema {
	[key: string]: KnobSpec | KnobSchema;
}

/** What each knob type reads as: an image reads as its option's image, an action as its press count. */
interface KnobReadings {
	slider: number;
	range: [number, number];
	stepper: number;
	angle: number;
	xy: { x: number; y: number };
	duration: number;
	easing: [number, number, number, number];
	spring: SpringValue;
	color: string;
	gradient: string;
	toggle: boolean;
	segmented: string;
	select: string;
	pictures: string;
	icon: string;
	image: string;
	text: string;
	longtext: string;
	font: string;
	weight: number;
	spacing: number | [number, number] | [number, number, number, number];
	corners: number | [number, number, number, number];
	shadow: string;
	action: number;
}

export type KnobRead<S extends KnobSchema> = {
	readonly [K in keyof S]: S[K] extends { type: infer T extends keyof KnobReadings }
		? KnobReadings[T]
		: S[K] extends KnobSchema
			? KnobRead<S[K]>
			: never;
};

export declare const ui: SpoolUi;
export declare function bootPlayer(frames: Record<string, ComponentType>): void;
