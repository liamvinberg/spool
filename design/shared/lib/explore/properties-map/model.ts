import { useRef, useState } from "react";
import { inScope, withScope } from "shared/lib/spool/properties-families";
import { paddingOf, withPadding, gapOf, withGap } from "shared/lib/spool/properties-model";
import { cn } from "shared/lib/utils";

export type Target = "card" | "button" | "heading";
export interface Values {
	direction: "row" | "column";
	align: "start" | "center" | "end";
	justify: "start" | "center" | "end" | "between";
	gap: number;
	top: number;
	right: number;
	bottom: number;
	left: number;
	widthMode: "content" | "fill" | "fixed";
	heightMode: "content" | "fill" | "fixed";
	width: number;
	height: number;
	fill: string;
	radius: number;
	opacity: number;
	fontSize: number;
	fontWeight: number;
	text: string;
}
export type Field = keyof Values;
export interface ElementSource {
	className: string;
	text: string;
	deleted: boolean;
}
type Document = Record<Target, ElementSource>;
const INITIAL: Document = {
	card: {
		className: "flex flex-col items-start justify-start gap-4 p-6 w-100 h-auto rounded-[12px] bg-[#ffffff]",
		text: "Stay",
		deleted: false,
	},
	heading: { className: "w-fit h-auto text-[28px] font-semibold", text: "A little closer to nature.", deleted: false },
	button: {
		className:
			"inline-flex flex-row items-center justify-center gap-2 px-4 py-3 w-fit h-auto rounded-[6px] bg-[#24312b] text-[14px] font-medium",
		text: "Find your stay",
		deleted: false,
	},
};

function length(value: string | null | undefined, step: number, fallback = 0): number {
	if (value == null) return fallback;
	const absolute = /^\[([\d.]+)px\]$/.exec(value);
	if (absolute) return Number(absolute[1]);
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric * step : fallback;
}
function valueOf(source: string, prefix: string): string | undefined {
	return source
		.split(/\s+/)
		.find((token) => token.startsWith(`${prefix}-`))
		?.slice(prefix.length + 1);
}
function sizeMode(value: string | undefined): Values["widthMode"] {
	return value === "full" ? "fill" : value == null || value === "fit" || value === "auto" ? "content" : "fixed";
}

/** A bounded LTR, horizontal-writing fixture. Source strings own state; the browser owns geometry. */
export function readValues(node: ElementSource, step: number, scope: "base" | "hover" = "base"): Values {
	const base = inScope(node.className, []);
	const source = scope === "hover" ? cn(base, inScope(node.className, ["hover"])) : base;
	const padding = paddingOf(source);
	const direction = source.includes("flex-row") ? "row" : "column";
	const align = valueOf(source, "items");
	const justify = valueOf(source, "justify");
	const width = valueOf(source, "w");
	const height = valueOf(source, "h");
	const weight = valueOf(source, "font");
	const fill = valueOf(source, "bg");
	return {
		direction,
		align: align === "center" || align === "end" ? align : "start",
		justify: justify === "center" || justify === "end" || justify === "between" ? justify : "start",
		gap: length(direction === "row" ? gapOf(source).x : gapOf(source).y, step),
		top: length(padding.t, step),
		right: length(padding.r, step),
		bottom: length(padding.b, step),
		left: length(padding.l, step),
		widthMode: sizeMode(width),
		heightMode: sizeMode(height),
		width: length(width, step, 400),
		height: length(height, step, 300),
		fill: fill?.startsWith("[#") ? fill.slice(1, -1) : "#ffffff",
		radius: length(valueOf(source, "rounded"), step),
		opacity: Number(valueOf(source, "opacity") ?? 100),
		fontSize: length(valueOf(source, "text"), step, 14),
		fontWeight: weight === "bold" ? 700 : weight === "semibold" ? 600 : weight === "medium" ? 500 : 400,
		text: node.text,
	};
}

function spelling(px: number, step: number, exact: boolean): string {
	const value = Math.max(0, exact ? Math.round(px) : Math.round(px / step) * step);
	return value % step === 0 ? String(value / step) : `[${value}px]`;
}
function replace(source: string, token: string): string {
	return cn(source, token);
}

function write<K extends Field>(source: string, field: K, value: Values[K], step: number, exact: boolean): string {
	if (field === "text") return source;
	if (typeof value === "number") {
		if (field === "top" || field === "right" || field === "bottom" || field === "left") {
			const side = field === "top" ? "t" : field === "right" ? "r" : field === "bottom" ? "b" : "l";
			return withPadding(source, { ...paddingOf(source), [side]: spelling(value, step, exact) });
		}
		if (field === "gap") {
			const v = spelling(value, step, exact);
			return withGap(source, { x: v, y: v });
		}
		if (field === "width" || field === "height")
			return replace(source, `${field === "width" ? "w" : "h"}-${spelling(Math.max(8, value), step, exact)}`);
		if (field === "radius") return replace(source, `rounded-[${Math.max(0, value)}px]`);
		if (field === "fontSize") return replace(source, `text-[${Math.max(8, value)}px]`);
		if (field === "opacity") return replace(source, `opacity-${Math.max(0, Math.min(100, value))}`);
		if (field === "fontWeight")
			return replace(
				source,
				`font-${value >= 700 ? "bold" : value >= 600 ? "semibold" : value >= 500 ? "medium" : "normal"}`,
			);
	}
	if (field === "direction") return replace(source, `flex-${value === "row" ? "row" : "col"}`);
	if (field === "align") return replace(source, `items-${value}`);
	if (field === "justify") return replace(source, `justify-${value}`);
	if (field === "fill") return replace(source, `bg-[${value}]`);
	if (field === "widthMode" || field === "heightMode") {
		const axis = field === "widthMode" ? "w" : "h";
		return replace(
			source,
			`${axis}-${value === "content" ? (axis === "w" ? "fit" : "auto") : value === "fill" ? "full" : axis === "w" ? "100" : "75"}`,
		);
	}
	return source;
}

export function useProperties() {
	const [document, render] = useState<Document>(INITIAL);
	const live = useRef(document);
	const baseline = useRef<Document | null>(null);
	const history = useRef<Document[]>([]);
	const [target, select] = useState<Target>("card");
	const [scope, setScope] = useState<"base" | "hover">("base");
	const [step, setStep] = useState<4 | 6>(4);
	const [observed, setObserved] = useState<Record<Target, { width: number; height: number }>>({
		card: { width: 400, height: 300 },
		button: { width: 134, height: 44 },
		heading: { width: 320, height: 65 },
	});
	const [, refresh] = useState(0);
	const publish = (next: Document) => {
		live.current = next;
		render(next);
	};
	const begin = () => {
		baseline.current ??= live.current;
	};
	const commit = () => {
		if (baseline.current && JSON.stringify(baseline.current) !== JSON.stringify(live.current))
			history.current.push(baseline.current);
		baseline.current = null;
		refresh((n) => n + 1);
	};
	const cancel = () => {
		if (baseline.current) publish(baseline.current);
		baseline.current = null;
	};
	const preview = <K extends Field>(field: K, value: Values[K], exact = false) => {
		begin();
		const node = live.current[target];
		const next =
			field === "text" && typeof value === "string"
				? { ...node, text: value }
				: {
						...node,
						className: withScope(node.className, scope === "base" ? [] : ["hover"], (source) =>
							write(source, field, value, step, exact),
						),
					};
		publish({ ...live.current, [target]: next });
	};
	const set = <K extends Field>(field: K, value: Values[K], exact = false) => {
		begin();
		if (value === "fixed" && (field === "widthMode" || field === "heightMode")) {
			const axis = field === "widthMode" ? "width" : "height";
			preview(axis, observed[target][axis], true);
		} else preview(field, value, exact);
		commit();
	};
	const undo = () => {
		cancel();
		const previous = history.current.pop();
		if (previous) publish(previous);
		refresh((n) => n + 1);
	};
	const remove = () => {
		begin();
		publish({ ...live.current, [target]: { ...live.current[target], deleted: true } });
		commit();
	};
	const restore = () => {
		begin();
		publish({ ...live.current, [target]: { ...live.current[target], deleted: false } });
		commit();
	};
	const reset = () => {
		begin();
		publish(INITIAL);
		commit();
		select("card");
		setScope("base");
		setStep(4);
	};
	const measure = (width: number, height: number) =>
		setObserved((previous) =>
			previous[target].width === width && previous[target].height === height
				? previous
				: { ...previous, [target]: { width, height } },
		);
	const authored = readValues(document[target], step, scope);
	const values = {
		...authored,
		width: authored.widthMode === "fixed" ? authored.width : observed[target].width,
		height: authored.heightMode === "fixed" ? authored.height : observed[target].height,
	};
	return {
		document,
		values,
		target,
		select,
		scope,
		setScope,
		set,
		begin,
		preview,
		commit,
		cancel,
		undo,
		canUndo: history.current.length > 0,
		className: document[target].className,
		step,
		setStep,
		reset,
		deleted: document[target].deleted,
		remove,
		restore,
		measure,
	};
}
export type Editor = ReturnType<typeof useProperties>;
