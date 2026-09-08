import { useRef, useState } from "react";
import type { ThemeToken } from "../../daemon/theme";
import { stepLength } from "../../properties/families";
import type { SourcePropertyReading, SourcePropertyValue } from "../../source-property";
import { Menu, NumField, Row } from "./properties-fields";

const prefixes = { "font-size": "text", "line-height": "leading", "letter-spacing": "tracking" };
type Property = keyof typeof prefixes;

function numberUnit(value: string): { number: string; unit: string } | undefined {
	const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([a-z%]*)$/i.exec(value.trim());
	return match ? { number: match[1]!, unit: match[2]! } : undefined;
}

/** Numeric typography preserves authored units and completes one original gesture. */
export function PropertyNumberField({
	property,
	reading,
	options,
	scope = "",
	begin,
	preview,
	apply,
	finish,
}: {
	property: Property;
	reading: SourcePropertyReading | undefined;
	options: readonly ThemeToken[];
	scope?: string;
	begin(): void;
	preview(value: SourcePropertyValue): void;
	apply(value: SourcePropertyValue): void;
	finish(commit: boolean): void;
}) {
	const binding = reading?.binding.kind === "reference" ? reading.binding : undefined;
	const initial = numberUnit(reading?.authored ?? reading?.native ?? "");
	const unit = initial?.unit ?? "px";
	const [scrubbed, setScrubbed] = useState<string>();
	const scrub = useRef<{ value: string; moved: boolean } | undefined>(undefined);
	const finishScrub = (commit: boolean) => {
		const held = scrub.current;
		if (!held) return;
		scrub.current = undefined;
		setScrubbed(undefined);
		finish(commit && held.moved);
	};
	const requested = (typed: string): SourcePropertyValue | undefined => {
		if (!typed.trim()) return { kind: "remove" };
		const parsed = numberUnit(typed);
		if (!parsed) return;
		const value = `${parsed.number}${parsed.unit || unit}`;
		return CSS.supports(property, value) ? { kind: "custom", value } : undefined;
	};
	const step = (typed: string, units: number): string | undefined => {
		const parsed = numberUnit(typed);
		if (!parsed) return;
		const next = stepLength(
			"px",
			{
				family: prefixes[property],
				kind: "px",
				value: `[${parsed.number}${parsed.unit || unit}]`,
				negative: false,
				important: false,
				token: "",
			},
			0,
			units,
		);
		if (!next) return;
		const value = `${next.negative ? "-" : ""}${next.value.slice(1, -1)}`;
		if (!CSS.supports(property, value)) return;
		const result = numberUnit(value);
		return result ? `${result.number}${parsed.unit ? result.unit : ""}` : undefined;
	};
	return (
		<Row
			name={property}
			ok={reading !== undefined}
			onScrubStart={() => {
				scrub.current = { value: initial?.number ?? "", moved: false };
				begin();
			}}
			onScrub={(units) => {
				const held = scrub.current;
				if (!held) return;
				const next = step(held.value, units);
				const value = next === undefined ? undefined : requested(next);
				if (next === undefined || value === undefined) return;
				held.value = next;
				held.moved = true;
				setScrubbed(next);
				preview(value);
			}}
			onScrubEnd={() => finishScrub(true)}
			onScrubCancel={() => finishScrub(false)}
		>
			<NumField
				label={property}
				value={scrubbed ?? initial?.number ?? ""}
				readout={unit}
				ok={reading !== undefined}
				onBegin={begin}
				onPreview={(typed) => {
					const value = requested(typed);
					if (value) preview(value);
				}}
				onCommit={(typed) => {
					const value = requested(typed);
					if (value) {
						preview(value);
						finish(true);
					} else finish(false);
				}}
				onCancel={() => finish(false)}
				stepDraft={step}
			/>
			<Menu
				label={`${property} token`}
				current={{
					token: binding?.name ?? null,
					name: binding ? "↗" : "…",
					value: binding?.name ?? "Custom value",
				}}
				options={[
					{ token: null, name: "unset" },
					...options.map((option) => ({
						token: `${scope}${prefixes[property]}-${option.name}`,
						name: option.name,
						value: option.value,
						...(option.from === "default" ? { group: "default" } : {}),
					})),
				]}
				ok={reading !== undefined}
				filter
				onPick={(token) => apply(token === null ? { kind: "remove" } : { kind: "binding", tokens: [token] })}
			/>
		</Row>
	);
}
