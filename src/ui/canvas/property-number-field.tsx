import { type ReactNode, useRef, useState } from "react";
import type { ThemeToken } from "../../daemon/theme";
import { stepLength } from "../../properties/families";
import type { SourcePropertyReading, SourcePropertyValue } from "../../source-property";
import { Menu, NumField, Row } from "./properties-fields";

const prefixes = {
	"font-size": "text",
	"line-height": "leading",
	"letter-spacing": "tracking",
	"border-radius": "rounded",
	"border-top-left-radius": "rounded-tl",
	"border-top-right-radius": "rounded-tr",
	"border-bottom-right-radius": "rounded-br",
	"border-bottom-left-radius": "rounded-bl",
};
/** The properties this control can name a token for, which is what it draws. */
export type NumericTokenProperty = keyof typeof prefixes;

function numberUnit(value: string): { number: string; unit: string } | undefined {
	const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)$/i.exec(value.trim());
	return match ? { number: match[1]!, unit: match[2]! } : undefined;
}

/** Numeric token fields preserve authored units and complete one original gesture. */
export function PropertyNumberField({
	property,
	reading,
	reason,
	options,
	scope = "",
	begin,
	preview,
	apply,
	finish,
	name,
	accessory,
}: {
	property: NumericTokenProperty;
	reading: SourcePropertyReading | undefined;
	reason?: string | undefined;
	options: readonly ThemeToken[];
	scope?: string;
	begin(): void;
	preview(value: SourcePropertyValue): void;
	apply(value: SourcePropertyValue): void;
	finish(commit: boolean): void;
	name?: string;
	accessory?: ReactNode;
}) {
	const radius = property.startsWith("border-");
	const binding = reading?.binding.kind === "reference" ? reading.binding : undefined;
	const boundToken = binding
		? options
				.map((option) => `${scope}${prefixes[property]}-${option.name}`)
				.find((token) => reading?.tokens.includes(token))
		: undefined;
	// A known value this field cannot number, `normal` or a calc(), is read out as
	// it stands rather than shown blank beside a unit it never had.
	const presented = (reading?.authored ?? reading?.native ?? "").trim();
	const initial = numberUnit(presented);
	const keyword = initial || !presented ? undefined : presented;
	const unit = initial?.unit ?? "px";
	const [scrubbed, setScrubbed] = useState<string>();
	const customDraft = useRef(false);
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
		// A displayed native value does not prove a compatible reference scale.
		if (binding && !customDraft.current) return;
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
			name={name ?? property}
			reason={reason ?? (binding ? "Choose a token or type a custom value to change this reference." : undefined)}
			ok={reading !== undefined}
			onScrubStart={() => {
				customDraft.current = false;
				scrub.current = { value: initial?.number ?? "", moved: false };
				begin();
			}}
			onScrub={
				binding
					? undefined
					: (units) => {
							const held = scrub.current;
							if (!held) return;
							const next = step(held.value, units);
							const value = next === undefined ? undefined : requested(next);
							if (next === undefined || value === undefined) return;
							held.value = next;
							held.moved = true;
							setScrubbed(next);
							preview(value);
						}
			}
			onScrubEnd={() => finishScrub(true)}
			onScrubCancel={() => finishScrub(false)}
		>
			<NumField
				label={property}
				value={scrubbed ?? initial?.number ?? ""}
				readout={keyword ? null : unit}
				placeholder={keyword}
				ok={reading !== undefined}
				onBegin={() => {
					customDraft.current = false;
					begin();
				}}
				onPreview={(typed) => {
					customDraft.current = true;
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
					token: boundToken ?? null,
					name: binding ? "↗" : "…",
					value: binding?.name ?? "Custom value",
				}}
				options={[
					{ token: null, name: radius ? `${prefixes[property]}-none` : "unset" },
					...options.map((option) => ({
						token: `${scope}${prefixes[property]}-${option.name}`,
						name: radius ? `${prefixes[property]}-${option.name}` : option.name,
						value: option.value,
						...(option.from === "default" ? { group: "default" } : {}),
					})),
				]}
				ok={reading !== undefined}
				filter
				onPick={(token) =>
					apply(
						token === null
							? radius && scope
								? { kind: "binding", tokens: [`${scope}${prefixes[property]}-none`] }
								: { kind: "remove" }
							: { kind: "binding", tokens: [token] },
					)
				}
			/>
			{accessory}
		</Row>
	);
}
